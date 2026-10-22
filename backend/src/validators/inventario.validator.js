const { Joi, id, texto, dinero, cantidadDecimal, paginacion } = require('./comunes');
const { TIPOS_MOVIMIENTO } = require('../constants');

// --- Proveedores ---
const crearProveedor = Joi.object({
  nombre: texto(120).min(2).required(),
  contacto: texto(100).allow('', null),
  telefono: Joi.string().trim().pattern(/^[0-9+\-\s()]{7,20}$/).allow('', null)
    .messages({ 'string.pattern.base': 'Teléfono inválido' }),
  email: Joi.string().trim().lowercase().email().max(150).allow('', null),
});
const actualizarProveedor = crearProveedor.fork(['nombre'], (s) => s.optional())
  .keys({ activo: Joi.boolean() })
  .min(1);

// --- Insumos ---
const crearInsumo = Joi.object({
  nombre: texto(120).min(2).required(),
  unidad: texto(20).min(1).required(),
  stockActual: Joi.number().precision(3).min(0).max(9999999).default(0),
  stockMinimo: Joi.number().precision(3).min(0).max(9999999).default(0),
  costoUnitario: dinero.default(0),
  proveedorId: id.allow(null),
});
// stockActual NO se edita directo: se modifica sólo vía movimientos (trazabilidad)
const actualizarInsumo = Joi.object({
  nombre: texto(120).min(2),
  unidad: texto(20).min(1),
  stockMinimo: Joi.number().precision(3).min(0).max(9999999),
  costoUnitario: dinero,
  proveedorId: id.allow(null),
}).min(1);

const listarInsumos = Joi.object({
  ...paginacion,
  proveedorId: id,
  stockBajo: Joi.boolean(),
  q: texto(100),
});

const movimiento = Joi.object({
  tipo: Joi.string().uppercase().valid(...TIPOS_MOVIMIENTO).required(),
  // ENTRADA/SALIDA: cantidad a sumar/restar. AJUSTE: nuevo stock contado físicamente (puede ser 0).
  cantidad: Joi.when('tipo', {
    is: 'AJUSTE',
    then: Joi.number().precision(3).min(0).max(9999999).required(),
    otherwise: cantidadDecimal.required(),
  }),
  motivo: texto(255).allow('', null),
});

module.exports = {
  crearProveedor,
  actualizarProveedor,
  crearInsumo,
  actualizarInsumo,
  listarInsumos,
  movimiento,
};
