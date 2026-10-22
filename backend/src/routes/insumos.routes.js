const { Router } = require('express');
const ctrl = require('../controllers/insumos.controller');
const v = require('../validators/inventario.validator');
const { idParam, paginacion, Joi } = require('../validators/comunes');
const { validar } = require('../middlewares/validate.middleware');
const { autenticar } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');
const { ROLES } = require('../constants');

const router = Router();
// Inventario: ADMIN y COCINERO
router.use(autenticar, permitirRoles(ROLES.ADMIN, ROLES.COCINERO));

router.get('/', validar({ query: v.listarInsumos }), ctrl.listar);
router.get('/alertas/stock-bajo', ctrl.alertas); // antes de "/:id" para que no choque
router.get('/:id', validar({ params: idParam }), ctrl.obtener);
router.get('/:id/movimientos', validar({ params: idParam, query: Joi.object(paginacion) }), ctrl.listarMovimientos);

// El COCINERO puede registrar entradas, mermas y ajustes; el catálogo sólo lo edita el ADMIN
router.post('/:id/movimientos', validar({ params: idParam, body: v.movimiento }), ctrl.registrarMovimiento);
router.post('/', permitirRoles(ROLES.ADMIN), validar({ body: v.crearInsumo }), ctrl.crear);
router.put('/:id', permitirRoles(ROLES.ADMIN), validar({ params: idParam, body: v.actualizarInsumo }), ctrl.actualizar);
router.delete('/:id', permitirRoles(ROLES.ADMIN), validar({ params: idParam }), ctrl.eliminar);

module.exports = router;
