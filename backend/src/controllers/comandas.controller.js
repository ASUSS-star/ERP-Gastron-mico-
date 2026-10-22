const service = require('../services/comandas.service');
const { ok, creado } = require('../utils/respuesta');

const listarCon = (fn) => async (req, res) => {
  const { data, meta } = await fn(req);
  ok(res, data, undefined, meta);
};

module.exports = {
  crear: async (req, res) => creado(res, await service.crear(req.user, req.body), 'Comanda creada'),
  listar: listarCon((req) => service.listar(req.user, req.query)),
  listarPorMesa: listarCon((req) => service.listarPorMesa(req.user, req.params.mesaId, req.query)),
  listarPorMesero: listarCon((req) => service.listarPorMesero(req.user, req.params.meseroId, req.query)),
  obtener: async (req, res) => ok(res, await service.obtener(req.user, req.params.id)),
  actualizar: async (req, res) => ok(res, await service.actualizar(req.user, req.params.id, req.body), 'Comanda actualizada'),
  cambiarEstado: async (req, res) =>
    ok(res, await service.cambiarEstado(req.user, req.params.id, req.body), `Comanda cambiada a ${req.body.estado}`),
  eliminar: async (req, res) => {
    await service.eliminar(req.user, req.params.id);
    ok(res, null, 'Comanda eliminada');
  },
};
