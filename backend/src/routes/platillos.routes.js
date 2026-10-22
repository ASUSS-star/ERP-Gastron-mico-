const { Router } = require('express');
const ctrl = require('../controllers/platillos.controller');
const v = require('../validators/menu.validator');
const { idParam } = require('../validators/comunes');
const { validar } = require('../middlewares/validate.middleware');
const { autenticar } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');
const { ROLES } = require('../constants');

const router = Router();
router.use(autenticar);

// Todos los roles pueden consultar el menú
router.get('/', validar({ query: v.listarPlatillos }), ctrl.listar);
router.get('/:id', validar({ params: idParam }), ctrl.obtener);

// Sólo ADMIN modifica el menú
router.post('/', permitirRoles(ROLES.ADMIN), validar({ body: v.crearPlatillo }), ctrl.crear);
router.put('/:id', permitirRoles(ROLES.ADMIN), validar({ params: idParam, body: v.actualizarPlatillo }), ctrl.actualizar);
router.put('/:id/receta', permitirRoles(ROLES.ADMIN), validar({ params: idParam, body: v.receta }), ctrl.definirReceta);
router.delete('/:id', permitirRoles(ROLES.ADMIN), validar({ params: idParam }), ctrl.eliminar);

module.exports = router;
