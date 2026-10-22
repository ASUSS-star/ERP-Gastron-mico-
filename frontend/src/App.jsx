import { Routes, Route, Navigate } from 'react-router-dom';
import RutaProtegida from './components/RutaProtegida';
import Layout from './components/Layout';
import Login from './pages/Login';
import Inicio from './pages/Inicio';
import Cocina from './pages/Cocina';
import Caja from './pages/Caja';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RutaProtegida><Layout /></RutaProtegida>}>
        <Route index element={<Inicio />} />
        <Route path="cocina" element={<RutaProtegida roles={['ADMIN', 'COCINERO']}><Cocina /></RutaProtegida>} />
        <Route path="caja" element={<RutaProtegida roles={['ADMIN', 'CAJERO']}><Caja /></RutaProtegida>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
