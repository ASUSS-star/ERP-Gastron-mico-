const { crudController } = require('./crud.factory');
module.exports = crudController(require('../services/mesas.service'), 'Mesa');
