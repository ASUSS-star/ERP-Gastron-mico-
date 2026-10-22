const { Joi, id, texto, dinero, cantidadDecimal, paginacion } = require('./comunes');

// --- Categorías ---
const categoria = Joi.object({ nombre: texto(80).min(2).required() });

// --- Platillos ---
const crearPlatillo = Joi.object({
  nombre: texto(120).min(2).required(),
  descripcion: texto(500).allow('', null),
  precio: dinero.positive().required(),
  categoriaId: id.allow(null),
  imagenUrl: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(500).allow('', null),
  disponible: Joi.boolean().default(true),
});

const actualizarPlatillo = Joi.object({
  nombre: texto(120).min(2),
  descripcion: texto(500).allow('', null),
  precio: dinero.positive(),
  categoriaId: id.allow(null),
  imagenUrl: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(500).allow('', null),
  disponible: Joi.boolean(),
}).min(1);

const listarPlatillos = Joi.object({
  ...paginacion,
  categoriaId: id,
  disponible: Joi.boolean(),
  q: texto(100),
});

const receta = Joi.object({
  insumos: Joi.array()
    .items(Joi.object({ insumoId: id.required(), cantidad: cantidadDecimal.required() }))
    .unique('insumoId')
    .max(50)
    .required(),
});

module.exports = { categoria, crearPlatillo, actualizarPlatillo, listarPlatillos, receta };
