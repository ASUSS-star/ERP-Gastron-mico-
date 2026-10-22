import { useEffect, useState } from 'react';
import { comandasApi } from '../api/services';

/** Caja: cobra comandas ENTREGADAS. */
export default function Caja() {
  const [comandas, setComandas] = useState([]);
  const cargar = () => comandasApi.listar({ estado: 'ENTREGADO' }).then((res) => setComandas(res.data));
  useEffect(() => { cargar(); }, []);

  const cobrar = async (id, metodo) => {
    await comandasApi.cambiarEstado(id, 'PAGADO', metodo);
    cargar();
  };

  return (
    <>
      <h1>Caja</h1>
      <table>
        <thead><tr><th>Folio</th><th>Mesa</th><th>Total</th><th>Cobrar</th></tr></thead>
        <tbody>
          {comandas.map((c) => (
            <tr key={c.id}>
              <td>#{c.folio}</td>
              <td>{c.mesa.numero}</td>
              <td>${Number(c.total).toFixed(2)}</td>
              <td>
                {['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'].map((m) => (
                  <button key={m} onClick={() => cobrar(c.id, m)}>{m}</button>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
