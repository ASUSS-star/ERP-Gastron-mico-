/** Funciones por módulo: los componentes nunca escriben URLs a mano. */
import api from './client';

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  registro: (payload) => api.post('/auth/registro', payload),
  perfil: () => api.get('/auth/perfil'),
};

export const mesasApi = {
  listar: () => api.get('/mesas'),
};

export const platillosApi = {
  listar: (params) => api.get('/platillos', { params }),
};

export const comandasApi = {
  listar: (params) => api.get('/comandas', { params }),
  crear: (payload) => api.post('/comandas', payload),
  cambiarEstado: (id, estado, metodoPago) => api.patch(`/comandas/${id}/estado`, { estado, metodoPago }),
};

export const insumosApi = {
  listar: (params) => api.get('/insumos', { params }),
  alertas: () => api.get('/insumos/alertas/stock-bajo'),
};

export const reportesApi = {
  resumen: (params) => api.get('/reportes/resumen', { params }),
};
