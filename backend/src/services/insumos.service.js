const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { paginacion, metaPaginacion } = require('../utils/respuesta');

const INCLUDE = { proveedor: { select: { id: true, nombre: true } } };

const validarProveedor = async (restauranteId, proveedorId) => {
  if (proveedorId === null || proveedorId === undefined) return;
  const p = await prisma.proveedor.findFirst({ where: { id: proveedorId, restauranteId }, select: { id: true } });
  if (!p) throw AppError.notFound(`El proveedor ${proveedorId} no existe`);
};

const listar = async (restauranteId, { proveedorId, stockBajo, q, ...pag }) => {
  const where = {
    restauranteId,
    ...(proveedorId && { proveedorId }),
    ...(q && { nombre: { contains: q, mode: 'insensitive' } }),
    // Comparación columna-vs-columna con "field reference" de Prisma
    ...(stockBajo === true && { stockActual: { lte: prisma.insumo.fields.stockMinimo } }),
  };
  const [total, data] = await prisma.$transaction([
    prisma.insumo.count({ where }),
    prisma.insumo.findMany({ where, include: INCLUDE, orderBy: { nombre: 'asc' }, ...paginacion(pag) }),
  ]);
  return { data, meta: metaPaginacion(total, pag) };
};

const alertasStockBajo = (restauranteId) =>
  prisma.insumo.findMany({
    where: { restauranteId, stockActual: { lte: prisma.insumo.fields.stockMinimo } },
    include: INCLUDE,
    orderBy: { nombre: 'asc' },
  });

const obtener = async (restauranteId, id) => {
  const insumo = await prisma.insumo.findFirst({ where: { id, restauranteId }, include: INCLUDE });
  if (!insumo) throw AppError.notFound('Insumo no encontrado');
  return insumo;
};

const crear = async (restauranteId, datos, usuarioId) => {
  await validarProveedor(restauranteId, datos.proveedorId);
  return prisma.$transaction(async (tx) => {
    const insumo = await tx.insumo.create({ data: { ...datos, restauranteId }, include: INCLUDE });
    // El stock inicial queda registrado como ENTRADA para tener trazabilidad desde el día 1
    if (Number(datos.stockActual) > 0) {
      await tx.movimientoInventario.create({
        data: {
          insumoId: insumo.id,
          usuarioId,
          tipo: 'ENTRADA',
          cantidad: datos.stockActual,
          stockFinal: datos.stockActual,
          motivo: 'Stock inicial',
        },
      });
    }
    return insumo;
  });
};

const actualizar = async (restauranteId, id, datos) => {
  await obtener(restauranteId, id);
  await validarProveedor(restauranteId, datos.proveedorId);
  return prisma.insumo.update({ where: { id }, data: datos, include: INCLUDE });
};

const eliminar = async (restauranteId, id) => {
  await obtener(restauranteId, id);
  const enRecetas = await prisma.recetaInsumo.count({ where: { insumoId: id } });
  if (enRecetas > 0) throw AppError.conflict('El insumo se usa en recetas de platillos; quítalo de las recetas primero');
  await prisma.insumo.delete({ where: { id } });
};

/**
 * Registra ENTRADA / SALIDA / AJUSTE de inventario.
 * La SALIDA usa un UPDATE condicional (stockActual >= cantidad) que es ATÓMICO:
 * si dos personas descuentan al mismo tiempo, nunca queda stock negativo.
 */
const registrarMovimiento = async (restauranteId, id, { tipo, cantidad, motivo }, usuarioId) =>
  prisma.$transaction(async (tx) => {
    const insumo = await tx.insumo.findFirst({ where: { id, restauranteId } });
    if (!insumo) throw AppError.notFound('Insumo no encontrado');

    let actualizado;
    let cantidadMov = new Prisma.Decimal(cantidad);
    let motivoFinal = motivo || null;

    if (tipo === 'ENTRADA') {
      actualizado = await tx.insumo.update({ where: { id }, data: { stockActual: { increment: cantidad } } });
    } else if (tipo === 'SALIDA') {
      const { count } = await tx.insumo.updateMany({
        where: { id, stockActual: { gte: cantidad } },
        data: { stockActual: { decrement: cantidad } },
      });
      if (count === 0) {
        throw AppError.conflict(`Stock insuficiente de ${insumo.nombre}: hay ${insumo.stockActual} ${insumo.unidad}`);
      }
      actualizado = await tx.insumo.findUnique({ where: { id } });
    } else {
      // AJUSTE: "cantidad" es el nuevo stock contado físicamente
      const diferencia = new Prisma.Decimal(cantidad).minus(insumo.stockActual);
      cantidadMov = diferencia.abs();
      motivoFinal = `${motivo ? `${motivo} | ` : ''}Ajuste ${insumo.stockActual} → ${cantidad} (${diferencia.gte(0) ? '+' : ''}${diferencia})`;
      actualizado = await tx.insumo.update({ where: { id }, data: { stockActual: cantidad } });
    }

    const movimiento = await tx.movimientoInventario.create({
      data: {
        insumoId: id,
        usuarioId,
        tipo,
        cantidad: cantidadMov,
        stockFinal: actualizado.stockActual,
        motivo: motivoFinal,
      },
    });
    return { insumo: actualizado, movimiento };
  }, { timeout: 15000, maxWait: 10000 });

const listarMovimientos = async (restauranteId, id, pag) => {
  await obtener(restauranteId, id);
  const where = { insumoId: id };
  const [total, data] = await prisma.$transaction([
    prisma.movimientoInventario.count({ where }),
    prisma.movimientoInventario.findMany({
      where,
      include: { usuario: { select: { id: true, nombre: true } }, comanda: { select: { id: true, folio: true } } },
      orderBy: { createdAt: 'desc' },
      ...paginacion(pag),
    }),
  ]);
  return { data, meta: metaPaginacion(total, pag) };
};

module.exports = {
  listar,
  alertasStockBajo,
  obtener,
  crear,
  actualizar,
  eliminar,
  registrarMovimiento,
  listarMovimientos,
};
