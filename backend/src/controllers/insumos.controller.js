const service = require('../services/insumos.service');
const { ok, creado } = require('../utils/respuesta');

const rid = (req) => req.user.restauranteId;

module.exports = {
  listar: async (req, res) => {
    const { data, meta } = await service.listar(rid(req), req.query);
    ok(res, data, undefined, meta);
  },
  alertas: async (req, res) => ok(res, await service.alertasStockBajo(rid(req))),
  obtener: async (req, res) => ok(res, await service.obtener(rid(req), req.params.id)),
  crear: async (req, res) => creado(res, await service.crear(rid(req), req.body, req.user.id), 'Insumo creado'),
  actualizar: async (req, res) => ok(res, await service.actualizar(rid(req), req.params.id, req.body), 'Insumo actualizado'),
  eliminar: async (req, res) => {
    await service.eliminar(rid(req), req.params.id);
    ok(res, null, 'Insumo eliminado');
  },
  registrarMovimiento: async (req, res) =>
    creado(res, await service.registrarMovimiento(rid(req), req.params.id, req.body, req.user.id), 'Movimiento registrado'),
  listarMovimientos: async (req, res) => {
    const { data, meta } = await service.listarMovimientos(rid(req), req.params.id, req.query);
    ok(res, data, undefined, meta);
  },
};
