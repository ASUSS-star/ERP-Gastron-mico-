import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Menú lateral según el rol
const MENU = [
  { to: '/', texto: 'Inicio', roles: ['ADMIN', 'MESERO', 'COCINERO', 'CAJERO'] },
  { to: '/cocina', texto: 'Cocina', roles: ['ADMIN', 'COCINERO'] },
  { to: '/caja', texto: 'Caja', roles: ['ADMIN', 'CAJERO'] },
];

export default function Layout() {
  const { usuario, logout } = useAuth();
  return (
    <div className="layout">
      <aside>
        <h2>🍽️ ERP</h2>
        <small>{usuario.restaurante?.nombre}</small>
        <nav>
          {MENU.filter((m) => m.roles.includes(usuario.rol)).map((m) => (
            <NavLink key={m.to} to={m.to} end>
              {m.texto}
            </NavLink>
          ))}
        </nav>
        <div className="usuario">
          {usuario.nombre} · <b>{usuario.rol}</b>
          <button onClick={logout}>Salir</button>
        </div>
      </aside>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
