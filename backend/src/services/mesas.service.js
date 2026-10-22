const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');

const ESTADOS_ABIERTOS = ['PENDIENTE', 'EN_PREPARACION', 'ENTREGADO'];

const listar = (restauranteId, { estado }) =>
  prisma.mesa.findMany({
    where: { restauranteId, ...(estado && { estado }) },
    orderBy: { numero: 'asc' },
    include: { _count: { select: { comandas: { where: { estado: { in: ESTADOS_ABIERTOS } } } } } },
  });

const obtener = async (restauranteId, id) => {
  const mesa = await prisma.mesa.findFirst({ where: { id, restauranteId } });
  if (!mesa) throw AppError.notFound('Mesa no encontrada');
  return mesa;
};

const crear = (restauranteId, datos) => prisma.mesa.create({ data: { ...datos, restauranteId } });

const actualizar = async (restauranteId, id, datos) => {
  await obtener(restauranteId, id);
  if (datos.estado && datos.estado !== 'OCUPADA') {
    const abiertas = await prisma.comanda.count({ where: { mesaId: id, estado: { in: ESTADOS_ABIERTOS } } });
    if (abiertas > 0) throw AppError.conflict('La mesa tiene comandas abiertas; ciérralas antes de cambiar su estado');
  }
  return prisma.mesa.update({ where: { id }, data: datos });
};

const eliminar = async (restauranteId, id) => {
  await obtener(restauranteId, id);
  const comandas = await prisma.comanda.count({ where: { mesaId: id } });
  if (comandas > 0) {
    throw AppError.conflict('La mesa tiene historial de comandas; márcala como INACTIVA en lugar de eliminarla');
  }
  await prisma.mesa.delete({ where: { id } });
};

module.exports = { listar, obtener, crear, actualizar, eliminar, ESTADOS_ABIERTOS };
