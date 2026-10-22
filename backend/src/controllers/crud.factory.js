/**
 * Fábrica de controladores CRUD para recursos simples que sólo necesitan
 * restauranteId + id. Evita repetir el mismo código en mesas, categorías y proveedores.
 */
const { ok, creado } = require('../utils/respuesta');

const crudController = (service, nombre) => ({
  listar: async (req, res) => ok(res, await service.listar(req.user.restauranteId, req.query)),
  obtener: async (req, res) => ok(res, await service.obtener(req.user.restauranteId, req.params.id)),
  crear: async (req, res) => creado(res, await service.crear(req.user.restauranteId, req.body), `${nombre} creado(a)`),
  actualizar: async (req, res) =>
    ok(res, await service.actualizar(req.user.restauranteId, req.params.id, req.body), `${nombre} actualizado(a)`),
  eliminar: async (req, res) => {
    await service.eliminar(req.user.restauranteId, req.params.id);
    ok(res, null, `${nombre} eliminado(a)`);
  },
});

module.exports = { crudController };
