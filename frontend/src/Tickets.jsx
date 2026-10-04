import { useEffect, useState } from 'react';
import { peticion } from './api';

const CATEGORIAS = ['incidente', 'requerimiento', 'permiso', 'asesoria'];

function formatear(fecha) {
  return new Date(fecha).toLocaleString('es-CO');
}

export default function Tickets({ usuario, onExpirar }) {
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [categoria, setCategoria] = useState('');
  const [enviando, setEnviando] = useState(false);

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

  async function crear(e) {
    e.preventDefault();
    setError('');
    setMensaje('');
    setEnviando(true);
    try {
      const cuerpo = { titulo, descripcion };
      if (categoria) cuerpo.categoria = categoria;
      await peticion('/tickets', { method: 'POST', body: JSON.stringify(cuerpo) });
      setTitulo('');
      setDescripcion('');
      setCategoria('');
      setMensaje('Ticket creado correctamente.');
      await cargar();
    } catch (err) {
      if (err.status === 401) return onExpirar();
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="tarjeta">
        <h2>Nuevo ticket</h2>
        <form onSubmit={crear}>
          <label>Título</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} required />

          <label>Descripción</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required />

          <label>Categoría (opcional)</label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Sin categoría</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {error && <div className="error">{error}</div>}
          {mensaje && <div className="exito">{mensaje}</div>}

          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={enviando}>
              {enviando ? 'Enviando...' : 'Crear ticket'}
            </button>
          </div>
        </form>
      </div>

      <div className="tarjeta">
        <h2>{esPersonal ? 'Todos los tickets' : 'Mis tickets'}</h2>

        {cargando && <div className="vacio">Cargando...</div>}
        {!cargando && tickets.length === 0 && <div className="vacio">Todavía no hay tickets.</div>}

        {tickets.map((t) => (
          <div className="ticket" key={t.id}>
            <h3>{t.titulo}</h3>
            <div>
              <span className={`etiqueta estado-${t.estado}`}>{t.estado.replace('_', ' ')}</span>
              {t.prioridad && <span className="etiqueta">prioridad {t.prioridad}</span>}
              {t.categoria && <span className="etiqueta">{t.categoria}</span>}
            </div>
            <p>{t.descripcion}</p>
            <div className="meta">
              {esPersonal && <>Solicitante: {t.solicitante} · </>}
              Creado: {formatear(t.creado_en)}
              {t.analista && <> · Analista: {t.analista}</>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}