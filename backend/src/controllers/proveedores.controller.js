const { crudController } = require('./crud.factory');
module.exports = crudController(require('../services/proveedores.service'), 'Proveedor');
