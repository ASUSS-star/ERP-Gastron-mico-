const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');

const listar = (restauranteId) =>
  prisma.categoria.findMany({
    where: { restauranteId },
    orderBy: { nombre: 'asc' },
    include: { _count: { select: { platillos: true } } },
  });

const obtener = async (restauranteId, id) => {
  const categoria = await prisma.categoria.findFirst({ where: { id, restauranteId } });
  if (!categoria) throw AppError.notFound('Categoría no encontrada');
  return categoria;
};

const crear = (restauranteId, datos) => prisma.categoria.create({ data: { ...datos, restauranteId } });

const actualizar = async (restauranteId, id, datos) => {
  await obtener(restauranteId, id);
  return prisma.categoria.update({ where: { id }, data: datos });
};

// Los platillos de la categoría quedan "sin categoría" (onDelete: SetNull)
const eliminar = async (restauranteId, id) => {
  await obtener(restauranteId, id);
  await prisma.categoria.delete({ where: { id } });
};

module.exports = { listar, obtener, crear, actualizar, eliminar };
