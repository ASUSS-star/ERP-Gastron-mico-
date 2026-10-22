/**
 * Servicio de COMANDAS (pedidos) — el corazón del ERP.
 *
 * Reglas de negocio:
 *  - El folio es consecutivo POR restaurante (contador atómico en Restaurante.ultimoFolio).
 *  - El precio de cada platillo se "congela" en el detalle (si mañana sube, la comanda no cambia).
 *  - Al crear la comanda se descuenta el inventario según la receta de cada platillo.
 *    Si no alcanza el stock de algún insumo, se aborta TODO (transacción) → 409.
 *  - Al CANCELAR (o editar items) se devuelve al inventario exactamente lo que se descontó.
 *  - Los cambios de estado siguen la máquina de estados de constants/index.js.
 *  - Un MESERO sólo ve y modifica sus propias comandas.
 */
const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { paginacion, metaPaginacion } = require('../utils/respuesta');
const { ROLES, TRANSICIONES_COMANDA } = require('../constants');
const { ESTADOS_ABIERTOS } = require('./mesas.service');

const TX_OPCIONES = { timeout: 15000, maxWait: 10000 };

const INCLUDE_COMANDA = {
  mesa: { select: { id: true, numero: true } },
  mesero: { select: { id: true, nombre: true } },
  detalles: {
    include: { platillo: { select: { id: true, nombre: true } } },
    orderBy: { id: 'asc' },
  },
};

// ---------------------------------------------------------------------------
// Helpers internos (reciben `tx` para ejecutarse dentro de una transacción)
// ---------------------------------------------------------------------------

/** Obtiene platillos del restaurante, valida que existan/estén disponibles y arma los detalles. */
const construirDetalles = async (tx, restauranteId, items) => {
  const ids = [...new Set(items.map((i) => i.platilloId))];
  const platillos = await tx.platillo.findMany({
    where: { id: { in: ids }, restauranteId },
    include: { receta: true },
  });

  const porId = new Map(platillos.map((p) => [p.id, p]));
  const faltan = ids.filter((id) => !porId.has(id));
  if (faltan.length) throw AppError.notFound(`Platillos no encontrados: ${faltan.join(', ')}`);

  const noDisponibles = platillos.filter((p) => !p.disponible).map((p) => p.nombre);
  if (noDisponibles.length) throw AppError.conflict(`Platillos no disponibles: ${noDisponibles.join(', ')}`);

  let total = new Prisma.Decimal(0);
  const consumo = new Map(); // insumoId → cantidad total a descontar

  const detalles = items.map((item) => {
    const p = porId.get(item.platilloId);
    const subtotal = p.precio.mul(item.cantidad);
    total = total.add(subtotal);

    for (const r of p.receta) {
      const actual = consumo.get(r.insumoId) || new Prisma.Decimal(0);
      consumo.set(r.insumoId, actual.add(r.cantidad.mul(item.cantidad)));
    }

    return {
      platilloId: p.id,
      cantidad: item.cantidad,
      precioUnitario: p.precio,
      subtotal,
      notas: item.notas || null,
    };
  });

  return { detalles, total, consumo };
};

/**
 * Descuenta inventario con UPDATE condicional atómico (stock >= requerido).
 * Si algún insumo no alcanza, lanza 409 y la transacción completa hace rollback.
 */
const descontarStock = async (tx, consumo, comandaId, usuarioId) => {
  // Orden fijo por id → evita deadlocks si dos comandas tocan los mismos insumos
  const ids = [...consumo.keys()].sort((a, b) => a - b);
  for (const insumoId of ids) {
    const cantidad = consumo.get(insumoId);
    // eslint-disable-next-line no-await-in-loop
    const { count } = await tx.insumo.updateMany({
      where: { id: insumoId, stockActual: { gte: cantidad } },
      data: { stockActual: { decrement: cantidad } },
    });
    if (count === 0) {
      // eslint-disable-next-line no-await-in-loop
      const insumo = await tx.insumo.findUnique({ where: { id: insumoId } });
      throw AppError.conflict(
        `Stock insuficiente de "${insumo.nombre}": se requieren ${cantidad} ${insumo.unidad} y hay ${insumo.stockActual}`,
      );
    }
    // eslint-disable-next-line no-await-in-loop
    const actualizado = await tx.insumo.findUnique({ where: { id: insumoId }, select: { stockActual: true } });
    // eslint-disable-next-line no-await-in-loop
    await tx.movimientoInventario.create({
      data: {
        insumoId,
        usuarioId,
        comandaId,
        tipo: 'SALIDA',
        cantidad,
        stockFinal: actualizado.stockActual,
        motivo: 'Consumo por comanda',
      },
    });
  }
};

/**
 * Devuelve al inventario lo que la comanda consumió.
 * Se calcula con los movimientos reales (SALIDAS − ENTRADAS de esa comanda),
 * no con la receta actual (que pudo cambiar desde que se pidió).
 */
const devolverStock = async (tx, comandaId, usuarioId, motivo) => {
  const movs = await tx.movimientoInventario.findMany({ where: { comandaId } });
  const neto = new Map();
  for (const m of movs) {
    const signo = m.tipo === 'SALIDA' ? 1 : m.tipo === 'ENTRADA' ? -1 : 0;
    neto.set(m.insumoId, (neto.get(m.insumoId) || new Prisma.Decimal(0)).add(m.cantidad.mul(signo)));
  }

  for (const [insumoId, cantidad] of neto) {
    if (cantidad.lte(0)) continue;
    // eslint-disable-next-line no-await-in-loop
    const actualizado = await tx.insumo.update({
      where: { id: insumoId },
      data: { stockActual: { increment: cantidad } },
    });
    // eslint-disable-next-line no-await-in-loop
    await tx.movimientoInventario.create({
      data: { insumoId, usuarioId, comandaId, tipo: 'ENTRADA', cantidad, stockFinal: actualizado.stockActual, motivo },
    });
  }
};

/** Libera la mesa si ya no le quedan comandas abiertas. */
const liberarMesaSiCorresponde = async (tx, mesaId) => {
  const abiertas = await tx.comanda.count({ where: { mesaId, estado: { in: ESTADOS_ABIERTOS } } });
  if (abiertas === 0) {
    await tx.mesa.updateMany({ where: { id: mesaId, estado: 'OCUPADA' }, data: { estado: 'LIBRE' } });
  }
};

/** Un MESERO sólo puede operar sobre sus comandas. */
const verificarPropiedad = (user, comanda) => {
  if (user.rol === ROLES.MESERO && comanda.meseroId !== user.id) {
    throw AppError.forbidden('Sólo puedes acceder a tus propias comandas');
  }
};

const buscarComanda = async (db, restauranteId, id) => {
  const comanda = await db.comanda.findFirst({ where: { id, restauranteId } });
  if (!comanda) throw AppError.notFound('Comanda no encontrada');
  return comanda;
};

// ---------------------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------------------

const crear = async (user, { mesaId, notas, items }) =>
  prisma.$transaction(async (tx) => {
    const { restauranteId } = user;

    const mesa = await tx.mesa.findFirst({ where: { id: mesaId, restauranteId } });
    if (!mesa) throw AppError.notFound('Mesa no encontrada');
    if (mesa.estado === 'INACTIVA') throw AppError.conflict(`La mesa ${mesa.numero} está inactiva`);

    const { detalles, total, consumo } = await construirDetalles(tx, restauranteId, items);

    // Folio consecutivo atómico (UPDATE ... SET ultimoFolio = ultimoFolio + 1 RETURNING)
    const { ultimoFolio: folio } = await tx.restaurante.update({
      where: { id: restauranteId },
      data: { ultimoFolio: { increment: 1 } },
      select: { ultimoFolio: true },
    });

    const comanda = await tx.comanda.create({
      data: {
        restauranteId,
        folio,
        mesaId,
        meseroId: user.id,
        notas: notas || null,
        total,
        detalles: { create: detalles },
      },
    });

    await descontarStock(tx, consumo, comanda.id, user.id);
    await tx.mesa.update({ where: { id: mesaId }, data: { estado: 'OCUPADA' } });

    return tx.comanda.findUnique({ where: { id: comanda.id }, include: INCLUDE_COMANDA });
  }, TX_OPCIONES);

const listar = async (user, { estado, mesaId, meseroId, desde, hasta, ...pag }) => {
  // El MESERO sólo ve las suyas aunque intente filtrar por otro meseroId
  const meseroFiltro = user.rol === ROLES.MESERO ? user.id : meseroId;
  const estados = estado ? estado.split(',') : undefined;

  const where = {
    restauranteId: user.restauranteId,
    ...(estados && { estado: { in: estados } }),
    ...(mesaId && { mesaId }),
    ...(meseroFiltro && { meseroId: meseroFiltro }),
    ...((desde || hasta) && { createdAt: { ...(desde && { gte: desde }), ...(hasta && { lte: hasta }) } }),
  };

  const [total, data] = await prisma.$transaction([
    prisma.comanda.count({ where }),
    prisma.comanda.findMany({ where, include: INCLUDE_COMANDA, orderBy: { createdAt: 'desc' }, ...paginacion(pag) }),
  ]);
  return { data, meta: metaPaginacion(total, pag) };
};

const listarPorMesa = async (user, mesaId, filtros) => {
  const mesa = await prisma.mesa.findFirst({ where: { id: mesaId, restauranteId: user.restauranteId } });
  if (!mesa) throw AppError.notFound('Mesa no encontrada');
  return listar(user, { ...filtros, mesaId });
};

const listarPorMesero = async (user, meseroId, filtros) => {
  if (user.rol === ROLES.MESERO && meseroId !== user.id) {
    throw AppError.forbidden('Sólo puedes consultar tus propias comandas');
  }
  const mesero = await prisma.usuario.findFirst({ where: { id: meseroId, restauranteId: user.restauranteId } });
  if (!mesero) throw AppError.notFound('Mesero no encontrado');
  return listar(user, { ...filtros, meseroId });
};

const obtener = async (user, id) => {
  const comanda = await prisma.comanda.findFirst({
    where: { id, restauranteId: user.restauranteId },
    include: INCLUDE_COMANDA,
  });
  if (!comanda) throw AppError.notFound('Comanda no encontrada');
  verificarPropiedad(user, comanda);
  return comanda;
};

/** Editar notas y/o reemplazar items. Sólo en estado PENDIENTE (la cocina aún no empieza). */
const actualizar = async (user, id, { notas, items }) =>
  prisma.$transaction(async (tx) => {
    const comanda = await buscarComanda(tx, user.restauranteId, id);
    verificarPropiedad(user, comanda);
    if (comanda.estado !== 'PENDIENTE') {
      throw AppError.conflict(`Sólo se pueden editar comandas PENDIENTES (estado actual: ${comanda.estado})`);
    }

    const data = {};
    if (notas !== undefined) data.notas = notas || null;

    if (items) {
      await devolverStock(tx, id, user.id, 'Edición de comanda (devolución)');
      const { detalles, total, consumo } = await construirDetalles(tx, user.restauranteId, items);
      await tx.detalleComanda.deleteMany({ where: { comandaId: id } });
      data.total = total;
      data.detalles = { create: detalles };
      await descontarStock(tx, consumo, id, user.id);
    }

    await tx.comanda.update({ where: { id }, data });
    return tx.comanda.findUnique({ where: { id }, include: INCLUDE_COMANDA });
  }, TX_OPCIONES);

/**
 * Cambia el estado siguiendo la máquina de estados.
 * Usa "optimistic locking": el UPDATE incluye el estado anterior en el WHERE;
 * si otra persona cambió la comanda en ese instante, count=0 → 409.
 */
const cambiarEstado = async (user, id, { estado: nuevo, metodoPago }) =>
  prisma.$transaction(async (tx) => {
    const comanda = await buscarComanda(tx, user.restauranteId, id);
    const actual = comanda.estado;

    const permitidas = TRANSICIONES_COMANDA[actual] || {};
    if (!permitidas[nuevo]) {
      const opciones = Object.keys(permitidas);
      throw AppError.badRequest(
        `Transición inválida: ${actual} → ${nuevo}. ${opciones.length ? `Permitidas: ${opciones.join(', ')}` : 'La comanda ya está cerrada'}`,
      );
    }
    if (!permitidas[nuevo].includes(user.rol)) {
      throw AppError.forbidden(`Tu rol (${user.rol}) no puede pasar una comanda de ${actual} a ${nuevo}`);
    }
    if (nuevo === 'CANCELADO') verificarPropiedad(user, comanda);

    const data = { estado: nuevo };
    if (nuevo === 'PAGADO') {
      data.metodoPago = metodoPago;
      data.pagadoAt = new Date();
    }

    const { count } = await tx.comanda.updateMany({ where: { id, estado: actual }, data });
    if (count === 0) throw AppError.conflict('La comanda fue modificada por otro usuario. Recarga e intenta de nuevo');

    if (nuevo === 'CANCELADO') await devolverStock(tx, id, user.id, `Cancelación de comanda #${comanda.folio}`);
    if (nuevo === 'PAGADO' || nuevo === 'CANCELADO') await liberarMesaSiCorresponde(tx, comanda.mesaId);

    return tx.comanda.findUnique({ where: { id }, include: INCLUDE_COMANDA });
  }, TX_OPCIONES);

/**
 * Eliminación física (sólo ADMIN). Únicamente comandas PENDIENTES o CANCELADAS;
 * las pagadas son registro contable y no se borran.
 */
const eliminar = async (user, id) =>
  prisma.$transaction(async (tx) => {
    const comanda = await buscarComanda(tx, user.restauranteId, id);
    if (!['PENDIENTE', 'CANCELADO'].includes(comanda.estado)) {
      throw AppError.conflict(`No se puede eliminar una comanda en estado ${comanda.estado}`);
    }
    if (comanda.estado === 'PENDIENTE') {
      await devolverStock(tx, id, user.id, `Eliminación de comanda #${comanda.folio}`);
    }
    await tx.comanda.delete({ where: { id } });
    await liberarMesaSiCorresponde(tx, comanda.mesaId);
  }, TX_OPCIONES);

module.exports = { crear, listar, listarPorMesa, listarPorMesero, obtener, actualizar, cambiarEstado, eliminar };
