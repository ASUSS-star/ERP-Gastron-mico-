const { Joi } = require('./comunes');
const { ESTADOS_MESA } = require('../constants');

const crear = Joi.object({
  numero: Joi.number().integer().min(1).max(9999).required(),
  capacidad: Joi.number().integer().min(1).max(50).default(4),
});

const actualizar = Joi.object({
  numero: Joi.number().integer().min(1).max(9999),
  capacidad: Joi.number().integer().min(1).max(50),
  estado: Joi.string().uppercase().valid(...ESTADOS_MESA),
}).min(1);

const listar = Joi.object({ estado: Joi.string().uppercase().valid(...ESTADOS_MESA) });

module.exports = { crear, actualizar, listar };
