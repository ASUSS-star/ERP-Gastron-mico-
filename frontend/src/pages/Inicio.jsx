import { useEffect, useState } from 'react';
import { mesasApi } from '../api/services';

/** Vista de mesas (estado del salón). Punto de partida para la toma de pedidos del mesero. */
export default function Inicio() {
  const [mesas, setMesas] = useState([]);
  useEffect(() => {
    mesasApi.listar().then((res) => setMesas(res.data));
  }, []);

  return (
    <>
      <h1>Salón</h1>
      <div className="grid">
        {mesas.map((m) => (
          <div key={m.id} className={`card mesa ${m.estado.toLowerCase()}`}>
            <h3>Mesa {m.numero}</h3>
            <p>{m.estado} · {m.capacidad} personas</p>
            <small>{m._count?.comandas || 0} comandas abiertas</small>
          </div>
        ))}
      </div>
    </>
  );
}
