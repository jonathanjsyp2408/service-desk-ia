import { useEffect, useState } from 'react';
import { peticion } from './api';

const ESTADOS = ['abierto', 'en_progreso', 'resuelto', 'cerrado'];
const PRIORIDADES = ['baja', 'media', 'alta', 'critica'];

function formatear(fecha) {
  return new Date(fecha).toLocaleString('es-CO');
}

function nombreEstado(estado) {
  return estado.replace('_', ' ');
}

function textoHistorial(h) {
  if (!h.estado_anterior) return `Ticket creado como ${nombreEstado(h.estado_nuevo)}`;
  return `${nombreEstado(h.estado_anterior)} → ${nombreEstado(h.estado_nuevo)}`;
}

export default function TicketDetalle({ id, usuario, onVolver, onExpirar }) {
  const [ticket, setTicket] = useState(null);
  const [comentarios, setComentarios] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [estado, setEstado] = useState('');
  const [prioridad, setPrioridad] = useState('');
  const [analistaId, setAnalistaId] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const esPersonal = usuario.rol === 'analista' || usuario.rol === 'administrador';

  function manejarError(err) {
    if (err.status === 401) return onExpirar();
    setError(err.message);
  }

  async function cargar() {
    try {
      const t = await peticion(`/tickets/${id}`);
      setTicket(t);
      setEstado(t.estado);
      setPrioridad(t.prioridad || '');
      setAnalistaId(t.analista_id || '');
      setComentarios(await peticion(`/tickets/${id}/comentarios`));
      if (esPersonal) setPersonal(await peticion('/usuarios/personal'));
      setError('');
    } catch (err) {
      manejarError(err);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
  }, [id]);

  async function guardar() {
    setError('');
    setMensaje('');
    setGuardando(true);
    try {
      const cuerpo = { estado };
      if (prioridad) cuerpo.prioridad = prioridad;
      if (analistaId) cuerpo.analista_id = analistaId;
      await peticion(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(cuerpo) });
      await cargar();
      setMensaje('Cambios guardados.');
    } catch (err) {
      manejarError(err);
    } finally {
      setGuardando(false);
    }
  }

  async function comentar(e) {
    e.preventDefault();
    setError('');
    setMensaje('');
    setEnviando(true);
    try {
      await peticion(`/tickets/${id}/comentarios`, {
        method: 'POST',
        body: JSON.stringify({ mensaje: texto }),
      });
      setTexto('');
      setComentarios(await peticion(`/tickets/${id}/comentarios`));
    } catch (err) {
      manejarError(err);
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) return <div className="tarjeta vacio">Cargando...</div>;

  if (!ticket) {
    return (
      <div className="tarjeta">
        <button className="secundario" onClick={onVolver}>← Volver a la lista</button>
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  return (
    <>
      <div className="barra">
        <button className="secundario" onClick={onVolver}>← Volver a la lista</button>
      </div>

      <div className="tarjeta">
        <h2>{ticket.titulo}</h2>
        <div>
          <span className={`etiqueta estado-${ticket.estado}`}>{nombreEstado(ticket.estado)}</span>
          {ticket.prioridad && <span className="etiqueta">prioridad {ticket.prioridad}</span>}
          {ticket.categoria && <span className="etiqueta">{ticket.categoria}</span>}
        </div>
        <p>{ticket.descripcion}</p>
        <div className="meta">
          {esPersonal && <>Solicitante: {ticket.solicitante} · </>}
          Creado: {formatear(ticket.creado_en)}
          {ticket.analista && <> · Analista: {ticket.analista}</>}
          {ticket.cerrado_en && <> · Cerrado: {formatear(ticket.cerrado_en)}</>}
        </div>
        {error && <div className="error">{error}</div>}
        {mensaje && <div className="exito">{mensaje}</div>}
      </div>

      {esPersonal && (
        <div className="tarjeta">
          <h3>Gestionar ticket</h3>
          <div className="fila">
            <div>
              <label>Estado</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value)}>
                {ESTADOS.map((s) => (
                  <option key={s} value={s}>{nombreEstado(s)}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Prioridad</label>
              <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
                <option value="">Sin prioridad</option>
                {PRIORIDADES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Analista</label>
              <select value={analistaId} onChange={(e) => setAnalistaId(e.target.value)}>
                <option value="">Sin asignar</option>
                {personal.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} ({p.rol})</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <button onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}

      <div className="tarjeta">
        <h3>Historial de estados</h3>
        {ticket.historial.map((h, i) => (
          <div className="meta" key={i}>
            {formatear(h.cambiado_en)} · {textoHistorial(h)}
          </div>
        ))}
      </div>

      <div className="tarjeta">
        <h3>Comentarios</h3>
        {comentarios.length === 0 && <div className="vacio">Aún no hay comentarios.</div>}
        {comentarios.map((c) => (
          <div className="comentario" key={c.id}>
            <div className="meta">
              <strong>{c.autor}</strong> <span className="etiqueta">{c.rol}</span> · {formatear(c.creado_en)}
            </div>
            <p>{c.mensaje}</p>
          </div>
        ))}

        <form onSubmit={comentar}>
          <label>Escribir un comentario</label>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} required />
          <div style={{ marginTop: 12 }}>
            <button type="submit" disabled={enviando}>
              {enviando ? 'Enviando...' : 'Comentar'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}