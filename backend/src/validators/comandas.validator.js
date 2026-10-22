const { Joi, id, texto, paginacion } = require('./comunes');
const { ESTADOS_COMANDA, METODOS_PAGO } = require('../constants');

const item = Joi.object({
  platilloId: id.required(),
  cantidad: Joi.number().integer().min(1).max(100).required(),
  notas: texto(255).allow('', null),
});

const crear = Joi.object({
  mesaId: id.required(),
  notas: texto(500).allow('', null),
  items: Joi.array().items(item).min(1).max(50).required(),
});

// Editar platillos sólo mientras la comanda está PENDIENTE (reemplaza los items)
const actualizar = Joi.object({
  notas: texto(500).allow('', null),
  items: Joi.array().items(item).min(1).max(50),
}).min(1);

const cambiarEstado = Joi.object({
  estado: Joi.string().uppercase().valid(...Object.values(ESTADOS_COMANDA)).required(),
  metodoPago: Joi.when('estado', {
    is: 'PAGADO',
    then: Joi.string().uppercase().valid(...METODOS_PAGO).required(),
    otherwise: Joi.forbidden(),
  }),
});

const listar = Joi.object({
  ...paginacion,
  estado: Joi.alternatives().try(
    Joi.string().uppercase().valid(...Object.values(ESTADOS_COMANDA)),
    // ?estado=PENDIENTE,EN_PREPARACION  (útil para la pantalla de cocina)
    Joi.string().uppercase().pattern(/^[A-Z_]+(,[A-Z_]+)+$/),
  ),
  mesaId: id,
  meseroId: id,
  desde: Joi.date().iso(),
  // Si viene "desde", "hasta" no puede ser anterior
  hasta: Joi.when('desde', {
    is: Joi.exist(),
    then: Joi.date().iso().min(Joi.ref('desde')),
    otherwise: Joi.date().iso(),
  }),
});

const mesaParam = Joi.object({ mesaId: id.required() });
const meseroParam = Joi.object({ meseroId: id.required() });

module.exports = { crear, actualizar, cambiarEstado, listar, mesaParam, meseroParam };
