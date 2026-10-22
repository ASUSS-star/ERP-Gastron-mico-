const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');

const listar = (restauranteId) =>
  prisma.proveedor.findMany({
    where: { restauranteId },
    orderBy: { nombre: 'asc' },
    include: { _count: { select: { insumos: true } } },
  });

const obtener = async (restauranteId, id) => {
  const proveedor = await prisma.proveedor.findFirst({
    where: { id, restauranteId },
    include: { insumos: { select: { id: true, nombre: true, unidad: true, stockActual: true } } },
  });
  if (!proveedor) throw AppError.notFound('Proveedor no encontrado');
  return proveedor;
};

const crear = (restauranteId, datos) => prisma.proveedor.create({ data: { ...datos, restauranteId } });

const actualizar = async (restauranteId, id, datos) => {
  await obtener(restauranteId, id);
  return prisma.proveedor.update({ where: { id }, data: datos });
};

// Los insumos del proveedor quedan sin proveedor asignado (onDelete: SetNull)
const eliminar = async (restauranteId, id) => {
  await obtener(restauranteId, id);
  await prisma.proveedor.delete({ where: { id } });
};

module.exports = { listar, obtener, crear, actualizar, eliminar };
