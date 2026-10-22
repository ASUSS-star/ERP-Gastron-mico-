const { crudController } = require('./crud.factory');
module.exports = crudController(require('../services/categorias.service'), 'Categoría');
