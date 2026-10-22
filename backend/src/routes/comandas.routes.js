const { Router } = require('express');
const ctrl = require('../controllers/comandas.controller');
const v = require('../validators/comandas.validator');
const { idParam } = require('../validators/comunes');
const { validar } = require('../middlewares/validate.middleware');
const { autenticar } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');
const { ROLES } = require('../constants');

const { ADMIN, MESERO } = ROLES;
const router = Router();
router.use(autenticar);

// Consultas (todos los roles; el servicio restringe al MESERO a sus comandas)
router.get('/', validar({ query: v.listar }), ctrl.listar);
router.get('/mesa/:mesaId', validar({ params: v.mesaParam, query: v.listar }), ctrl.listarPorMesa);
router.get('/mesero/:meseroId', validar({ params: v.meseroParam, query: v.listar }), ctrl.listarPorMesero);
router.get('/:id', validar({ params: idParam }), ctrl.obtener);

// Toma de pedido
router.post('/', permitirRoles(MESERO, ADMIN), validar({ body: v.crear }), ctrl.crear);
router.put('/:id', permitirRoles(MESERO, ADMIN), validar({ params: idParam, body: v.actualizar }), ctrl.actualizar);

// Flujo de estados (qué rol puede qué transición lo decide la máquina de estados)
router.patch('/:id/estado', validar({ params: idParam, body: v.cambiarEstado }), ctrl.cambiarEstado);

router.delete('/:id', permitirRoles(ADMIN), validar({ params: idParam }), ctrl.eliminar);

module.exports = router;
