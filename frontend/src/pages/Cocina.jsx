import { useEffect, useState } from 'react';
import { comandasApi } from '../api/services';

/** Pantalla de cocina (KDS): comandas pendientes y en preparación, se refresca cada 10 s. */
export default function Cocina() {
  const [comandas, setComandas] = useState([]);
  const [error, setError] = useState('');

  const cargar = () =>
    comandasApi.listar({ estado: 'PENDIENTE,EN_PREPARACION', limit: 50 }).then((res) => setComandas(res.data));

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, 10000);
    return () => clearInterval(id);
  }, []);

  const avanzar = async (c) => {
    const siguiente = c.estado === 'PENDIENTE' ? 'EN_PREPARACION' : 'ENTREGADO';
    try {
      await comandasApi.cambiarEstado(c.id, siguiente);
      cargar();
    } catch (err) {
      setError(err.mensaje);
    }
  };

  return (
    <>
      <h1>Cocina</h1>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {comandas.map((c) => (
          <div key={c.id} className="card">
            <h3>#{c.folio} · Mesa {c.mesa.numero}</h3>
            <small>{c.estado} · {c.mesero.nombre}</small>
            <ul>
              {c.detalles.map((d) => (
                <li key={d.id}>{d.cantidad}× {d.platillo.nombre} {d.notas && <em>({d.notas})</em>}</li>
              ))}
            </ul>
            <button onClick={() => avanzar(c)}>{c.estado === 'PENDIENTE' ? 'Empezar' : 'Marcar entregado'}</button>
          </div>
        ))}
      </div>
    </>
  );
}
