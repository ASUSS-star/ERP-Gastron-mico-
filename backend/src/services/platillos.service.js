const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const { paginacion, metaPaginacion } = require('../utils/respuesta');

const INCLUDE_DETALLE = {
  categoria: { select: { id: true, nombre: true } },
  receta: { include: { insumo: { select: { id: true, nombre: true, unidad: true, stockActual: true } } } },
};

/** Verifica que la categoría pertenezca al MISMO restaurante (evita mezclar datos entre tenants). */
const validarCategoria = async (restauranteId, categoriaId) => {
  if (categoriaId === null || categoriaId === undefined) return;
  const cat = await prisma.categoria.findFirst({ where: { id: categoriaId, restauranteId }, select: { id: true } });
  if (!cat) throw AppError.notFound(`La categoría ${categoriaId} no existe`);
};

const listar = async (restauranteId, { categoriaId, disponible, q, ...pag }) => {
  const where = {
    restauranteId,
    ...(categoriaId && { categoriaId }),
    ...(disponible !== undefined && { disponible }),
    ...(q && { nombre: { contains: q, mode: 'insensitive' } }),
  };
  const [total, data] = await prisma.$transaction([
    prisma.platillo.count({ where }),
    prisma.platillo.findMany({
      where,
      include: { categoria: { select: { id: true, nombre: true } } },
      orderBy: [{ categoriaId: 'asc' }, { nombre: 'asc' }],
      ...paginacion(pag),
    }),
  ]);
  return { data, meta: metaPaginacion(total, pag) };
};

const obtener = async (restauranteId, id) => {
  const platillo = await prisma.platillo.findFirst({ where: { id, restauranteId }, include: INCLUDE_DETALLE });
  if (!platillo) throw AppError.notFound('Platillo no encontrado');
  return platillo;
};

const crear = async (restauranteId, datos) => {
  await validarCategoria(restauranteId, datos.categoriaId);
  return prisma.platillo.create({ data: { ...datos, restauranteId }, include: INCLUDE_DETALLE });
};

const actualizar = async (restauranteId, id, datos) => {
  await obtener(restauranteId, id);
  await validarCategoria(restauranteId, datos.categoriaId);
  return prisma.platillo.update({ where: { id }, data: datos, include: INCLUDE_DETALLE });
};

const eliminar = async (restauranteId, id) => {
  await obtener(restauranteId, id);
  const usos = await prisma.detalleComanda.count({ where: { platilloId: id } });
  if (usos > 0) {
    throw AppError.conflict('El platillo aparece en comandas; márcalo como no disponible (disponible=false) en lugar de eliminarlo');
  }
  await prisma.platillo.delete({ where: { id } });
};

/**
 * Define (reemplaza) la receta del platillo: qué insumos y cuánto consume 1 unidad.
 * Se usa al crear comandas para descontar inventario automáticamente.
 */
const definirReceta = async (restauranteId, id, { insumos }) => {
  await obtener(restauranteId, id);
  const ids = insumos.map((i) => i.insumoId);
  if (ids.length) {
    const encontrados = await prisma.insumo.findMany({ where: { id: { in: ids }, restauranteId }, select: { id: true } });
    const faltan = ids.filter((x) => !encontrados.some((e) => e.id === x));
    if (faltan.length) throw AppError.notFound(`Insumos no encontrados: ${faltan.join(', ')}`);
  }

  await prisma.$transaction([
    prisma.recetaInsumo.deleteMany({ where: { platilloId: id } }),
    prisma.recetaInsumo.createMany({
      data: insumos.map((i) => ({ platilloId: id, insumoId: i.insumoId, cantidad: i.cantidad })),
    }),
  ]);
  return obtener(restauranteId, id);
};

module.exports = { listar, obtener, crear, actualizar, eliminar, definirReceta };
