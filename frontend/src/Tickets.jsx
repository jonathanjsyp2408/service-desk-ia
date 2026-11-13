import { useEffect, useState } from 'react';
import { peticion } from './api';
import { formatear, codigoTicket, nombreEstado, TEXTO_SLA } from './formato';

export default function Tickets({ usuario, onExpirar, onAbrir, aviso }) {
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const esPersonal = usuario.rol === 'analista' || usuario.rol === 'administrador';

  async function cargar() {
    try {
      setTickets(await peticion('/tickets'));
      setError('');
    } catch (err) {
      if (err.status === 401) return onExpirar();
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  return (
    <div className="tarjeta">
      <h2>{esPersonal ? 'Todos los tickets' : 'Mis tickets'}</h2>

      {aviso && <div className="exito">{aviso}</div>}
      {error && <div className="error">{error}</div>}
      {cargando && <div className="vacio">Cargando...</div>}
      {!cargando && tickets.length === 0 && <div className="vacio">Todavía no hay tickets.</div>}

      {tickets.map((t) => (
        <div className="ticket" key={t.id}>
          <h3>{codigoTicket(t)} · {t.titulo}</h3>
          <div>
            <span className={`etiqueta estado-${t.estado}`}>{nombreEstado(t.estado)}</span>
            {t.prioridad && <span className="etiqueta">prioridad {t.prioridad}</span>}
            {t.categoria
              ? <span className="etiqueta">{t.categoria}</span>
              : esPersonal && <span className="etiqueta sin-clasificar">sin clasificar</span>}
            {esPersonal && <span className="etiqueta nivel">Nivel {t.nivel}</span>}
            {esPersonal && t.sla_estado && (
              <span className={`etiqueta sla-${t.sla_estado}`}>SLA: {TEXTO_SLA[t.sla_estado]}</span>
            )}
          </div>
          <p>{t.descripcion}</p>
          <div className="meta">
            {esPersonal && <>Solicitante: {t.solicitante} · </>}
            Creado: {formatear(t.creado_en)}
            {t.analista && <> · Analista: {t.analista}</>}
            {esPersonal && t.fecha_limite && !t.resuelto_en && <> · Vence: {formatear(t.fecha_limite)}</>}
          </div>
          <button className="secundario ver" onClick={() => onAbrir(t.id)}>Ver detalle</button>
        </div>
      ))}
    </div>
  );
}