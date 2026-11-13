import { useEffect, useState } from 'react';
import { peticion } from './api';
import { formatear, codigoTicket, nombreEstado, TEXTO_SLA, NIVELES, NOMBRE_CAMPO } from './formato';

const ESTADOS = ['abierto', 'en_progreso', 'resuelto', 'cerrado'];
const PRIORIDADES = ['baja', 'media', 'alta', 'critica'];
const CATEGORIAS = ['incidente', 'requerimiento', 'permiso', 'asesoria'];

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
  const [categoria, setCategoria] = useState('');
  const [analistaId, setAnalistaId] = useState('');
  const [nivel, setNivel] = useState('1');
  const [proveedor, setProveedor] = useState('');
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
      setCategoria(t.categoria || '');
      setAnalistaId(t.analista_id || '');
      setNivel(String(t.nivel || 1));
      setProveedor(t.proveedor || '');
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

  // Copia la clasificacion de la IA al formulario; el analista decide si guarda
  function aplicarSugerencia() {
    if (ticket.categoria_ia) setCategoria(ticket.categoria_ia);
    if (ticket.prioridad_ia) setPrioridad(ticket.prioridad_ia);
    setError('');
    setMensaje('Clasificación de la IA aplicada al formulario. Revisa y presiona "Guardar cambios".');
  }

  async function guardar() {
    setError('');
    setMensaje('');
    setGuardando(true);
    try {
      const cuerpo = { estado, nivel: Number(nivel) };
      if (prioridad) cuerpo.prioridad = prioridad;
      if (categoria) cuerpo.categoria = categoria;
      if (analistaId) cuerpo.analista_id = analistaId;
      if (nivel === '3') cuerpo.proveedor = proveedor;
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

  const hayIA = ticket.categoria_ia || ticket.prioridad_ia;
  const iaCoincide = ticket.categoria_ia === ticket.categoria && ticket.prioridad_ia === ticket.prioridad;
  const cambios = ticket.cambios || [];

  return (
    <>
      <div className="barra">
        <button className="secundario" onClick={onVolver}>← Volver a la lista</button>
      </div>

      <div className="tarjeta">
        <h2>{codigoTicket(ticket)} · {ticket.titulo}</h2>
        <div>
          <span className={`etiqueta estado-${ticket.estado}`}>{nombreEstado(ticket.estado)}</span>
          {ticket.prioridad && <span className="etiqueta">prioridad {ticket.prioridad}</span>}
          {ticket.categoria
            ? <span className="etiqueta">{ticket.categoria}</span>
            : esPersonal && <span className="etiqueta sin-clasificar">sin clasificar</span>}
          {esPersonal && <span className="etiqueta nivel">Nivel {ticket.nivel}</span>}
          {esPersonal && ticket.sla_estado && (
            <span className={`etiqueta sla-${ticket.sla_estado}`}>SLA: {TEXTO_SLA[ticket.sla_estado]}</span>
          )}
        </div>
        <p>{ticket.descripcion}</p>
        <div className="meta">
          {esPersonal && <>Solicitante: {ticket.solicitante} · </>}
          Creado: {formatear(ticket.creado_en)}
          {ticket.analista && <> · Analista: {ticket.analista}</>}
          {ticket.cerrado_en && <> · Cerrado: {formatear(ticket.cerrado_en)}</>}
        </div>
        {esPersonal && (
          <div className="meta">
            {ticket.fecha_limite
              ? <>Fecha límite (SLA): {formatear(ticket.fecha_limite)}</>
              : <>Sin fecha límite: falta asignar tipo y prioridad</>}
            {ticket.resuelto_en && <> · Resuelto: {formatear(ticket.resuelto_en)}</>}
            {ticket.nivel === 3 && ticket.proveedor && <> · Proveedor: {ticket.proveedor}</>}
          </div>
        )}
        {error && <div className="error">{error}</div>}
        {mensaje && <div className="exito">{mensaje}</div>}
      </div>

      {esPersonal && (
        <div className="tarjeta">
          <h3>Gestionar ticket</h3>

          {hayIA ? (
            <div className="sugerencia-ia">
              <div>
                <strong>Clasificación de la IA:</strong>{' '}
                {ticket.categoria_ia && <>tipo <span className="etiqueta">{ticket.categoria_ia}</span></>}{' '}
                {ticket.prioridad_ia && <>prioridad <span className="etiqueta">{ticket.prioridad_ia}</span></>}
                <div className="meta">
                  {iaCoincide
                    ? 'La clasificación actual coincide con la de la IA.'
                    : 'La clasificación actual fue modificada por un analista.'}
                </div>
              </div>
              {!iaCoincide && (
                <button type="button" className="secundario" onClick={aplicarSugerencia}>
                  Volver a la clasificación de la IA
                </button>
              )}
            </div>
          ) : (
            <div className="sugerencia-ia sin-sugerencia">
              Este ticket no fue clasificado por la IA. Clasifícalo manualmente.
            </div>
          )}

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
              <label>Tipo</label>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Sin clasificar</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>{c}</option>
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

          <div className="fila">
            <div>
              <label>Nivel de soporte</label>
              <select value={nivel} onChange={(e) => setNivel(e.target.value)}>
                {NIVELES.map((n) => (
                  <option key={n.valor} value={n.valor}>{n.texto}</option>
                ))}
              </select>
            </div>
            {nivel === '3' && (
              <div>
                <label>Proveedor externo</label>
                <input
                  value={proveedor}
                  onChange={(e) => setProveedor(e.target.value)}
                  maxLength={150}
                  placeholder="Nombre del proveedor"
                />
              </div>
            )}
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

        {esPersonal && (
          <>
            <h3 style={{ marginTop: 20 }}>Historial de cambios</h3>
            {cambios.length === 0 && <div className="vacio">Sin cambios de clasificación, nivel o asignación.</div>}
            {cambios.map((c, i) => (
              <div className="meta cambio" key={i}>
                {formatear(c.cambiado_en)} · {c.usuario}: {NOMBRE_CAMPO[c.campo] || c.campo}{' '}
                {c.valor_anterior || '—'} → {c.valor_nuevo || '—'}
              </div>
            ))}
          </>
        )}
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