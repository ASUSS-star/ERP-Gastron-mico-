const { Router } = require('express');
const ctrl = require('../controllers/reportes.controller');
const v = require('../validators/reportes.validator');
const { validar } = require('../middlewares/validate.middleware');
const { autenticar } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');
const { ROLES } = require('../constants');

const router = Router();
router.get('/resumen', autenticar, permitirRoles(ROLES.ADMIN, ROLES.CAJERO), validar({ query: v.rango }), ctrl.resumen);

module.exports = router;
