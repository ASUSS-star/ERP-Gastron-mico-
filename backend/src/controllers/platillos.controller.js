const service = require('../services/platillos.service');
const { crudController } = require('./crud.factory');
const { ok } = require('../utils/respuesta');

const base = crudController(service, 'Platillo');

module.exports = {
  ...base,
  listar: async (req, res) => {
    const { data, meta } = await service.listar(req.user.restauranteId, req.query);
    ok(res, data, undefined, meta);
  },
  definirReceta: async (req, res) =>
    ok(res, await service.definirReceta(req.user.restauranteId, req.params.id, req.body), 'Receta actualizada'),
};
