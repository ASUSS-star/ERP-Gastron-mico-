import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';


export default function RutaProtegida({ roles, children }) {
  const { usuario, cargando } = useAuth();
  if (cargando) return <p className="centro">Cargando...</p>;
  if (!usuario) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(usuario.rol)) return <Navigate to="/" replace />;
  return children;
}
