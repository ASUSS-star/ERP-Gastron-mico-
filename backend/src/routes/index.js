/** Enrutador principal: monta cada módulo bajo /api/<recurso> */
const { Router } = require('express');

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, servicio: 'ERP Gastronómico API', fecha: new Date() }));

// Descomenta cada línea cuando agregues su módulo:
// --- Módulo de Usuarios y Autenticación ---
router.use('/auth', require('./auth.routes'));
router.use('/usuarios', require('./usuarios.routes'));
// --- Módulo de Gestión de Pedidos/Comandas ---
router.use('/mesas', require('./mesas.routes'));
router.use('/comandas', require('./comandas.routes'));
router.use('/reportes', require('./reportes.routes'));
// --- Módulo de Inventario y Menú ---
router.use('/categorias', require('./categorias.routes'));
router.use('/platillos', require('./platillos.routes'));
router.use('/proveedores', require('./proveedores.routes'));
router.use('/insumos', require('./insumos.routes'));

module.exports = router;
