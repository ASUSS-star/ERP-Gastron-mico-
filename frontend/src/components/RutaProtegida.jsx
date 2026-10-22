import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Protege rutas en el frontend. OJO: esto es sólo UX;
 * la seguridad real la aplica el backend con JWT + roles.
 */
export default function RutaProtegida({ roles, children }) {
  const { usuario, cargando } = useAuth();
  if (cargando) return <p className="centro">Cargando...</p>;
  if (!usuario) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(usuario.rol)) return <Navigate to="/" replace />;
  return children;
}
