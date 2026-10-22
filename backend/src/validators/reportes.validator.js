const { Joi } = require('./comunes');

const rango = Joi.object({
  desde: Joi.date().iso(),
  // Si viene "desde", "hasta" no puede ser anterior
  hasta: Joi.when('desde', {
    is: Joi.exist(),
    then: Joi.date().iso().min(Joi.ref('desde')),
    otherwise: Joi.date().iso(),
  }),
});

module.exports = { rango };
