import { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/services';
import { TOKEN_KEY } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Al recargar la página, si hay token, recuperamos el perfil
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return setCargando(false);
    authApi
      .perfil()
      .then((res) => setUsuario(res.data))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setCargando(false));
  }, []);

  const login = async (email, password) => {
    const res = await authApi.login(email, password);
    localStorage.setItem(TOKEN_KEY, res.data.token);
    setUsuario({ ...res.data.usuario, restaurante: res.data.restaurante });
    return res.data.usuario;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUsuario(null);
  };

  return <AuthContext.Provider value={{ usuario, cargando, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
