/**
 * Cliente HTTP único para toda la app.
 * - Agrega automáticamente el header Authorization: Bearer <token>
 * - Si la API responde 401 (token expirado/ inválido) cierra sesión y manda al login
 */
import axios from 'axios';

export const TOKEN_KEY = 'erp_token';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res.data, // devolvemos directamente { ok, data, meta, mensaje }
  (error) => {
    const status = error.response?.status;
    if (status === 401 && !error.config.url.includes('/auth/login')) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
    }
    // Normalizamos el error para mostrarlo en la UI
    const data = error.response?.data || {};
    return Promise.reject({ status, mensaje: data.mensaje || 'Error de conexión', errores: data.errores || [] });
  },
);

export default api;
