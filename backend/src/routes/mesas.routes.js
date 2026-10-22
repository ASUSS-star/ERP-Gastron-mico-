const { Router } = require('express');
const ctrl = require('../controllers/mesas.controller');
const v = require('../validators/mesas.validator');
const { idParam } = require('../validators/comunes');
const { validar } = require('../middlewares/validate.middleware');
const { autenticar } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');
const { ROLES } = require('../constants');

const router = Router();
router.use(autenticar);

router.get('/', validar({ query: v.listar }), ctrl.listar);
router.get('/:id', validar({ params: idParam }), ctrl.obtener);
router.post('/', permitirRoles(ROLES.ADMIN), validar({ body: v.crear }), ctrl.crear);
router.put('/:id', permitirRoles(ROLES.ADMIN), validar({ params: idParam, body: v.actualizar }), ctrl.actualizar);
router.delete('/:id', permitirRoles(ROLES.ADMIN), validar({ params: idParam }), ctrl.eliminar);

module.exports = router;
