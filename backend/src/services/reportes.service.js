/**
 * Reportes para el dashboard (ADMIN / CAJERO).
 * Se ejecutan en paralelo con Promise.all para reducir el tiempo de respuesta.
 */
const prisma = require('../config/prisma');

const inicioDelDia = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const resumen = async (restauranteId, { desde, hasta } = {}) => {
  const rango = { gte: desde || inicioDelDia(), ...(hasta && { lte: hasta }) };
  const wherePagadas = { restauranteId, estado: 'PAGADO', pagadoAt: rango };

  const [ventas, porEstado, porMetodo, topAgrupado, stockBajo, mesasOcupadas] = await Promise.all([
    prisma.comanda.aggregate({ where: wherePagadas, _sum: { total: true }, _count: true, _avg: { total: true } }),
    prisma.comanda.groupBy({ by: ['estado'], where: { restauranteId, createdAt: rango }, _count: true }),
    prisma.comanda.groupBy({ by: ['metodoPago'], where: wherePagadas, _sum: { total: true }, _count: true }),
    prisma.detalleComanda.groupBy({
      by: ['platilloId'],
      where: { comanda: wherePagadas },
      _sum: { cantidad: true, subtotal: true },
      orderBy: { _sum: { cantidad: 'desc' } },
      take: 5,
    }),
    prisma.insumo.count({ where: { restauranteId, stockActual: { lte: prisma.insumo.fields.stockMinimo } } }),
    prisma.mesa.count({ where: { restauranteId, estado: 'OCUPADA' } }),
  ]);

  const nombres = await prisma.platillo.findMany({
    where: { id: { in: topAgrupado.map((t) => t.platilloId) } },
    select: { id: true, nombre: true },
  });

  return {
    rango: { desde: rango.gte, hasta: hasta || new Date() },
    ventas: {
      total: ventas._sum.total || 0,
      comandasPagadas: ventas._count,
      ticketPromedio: ventas._avg.total || 0,
    },
    comandasPorEstado: Object.fromEntries(porEstado.map((e) => [e.estado, e._count])),
    ventasPorMetodo: porMetodo.map((m) => ({ metodo: m.metodoPago, total: m._sum.total, comandas: m._count })),
    topPlatillos: topAgrupado.map((t) => ({
      platilloId: t.platilloId,
      nombre: nombres.find((n) => n.id === t.platilloId)?.nombre,
      cantidad: t._sum.cantidad,
      importe: t._sum.subtotal,
    })),
    insumosStockBajo: stockBajo,
    mesasOcupadas,
  };
};

module.exports = { resumen };
