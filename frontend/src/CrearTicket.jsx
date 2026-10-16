import { useState } from 'react';
import { peticion } from './api';

const CATEGORIAS = ['incidente', 'requerimiento', 'permiso', 'asesoria'];

export default function CrearTicket({ onExpirar, onCreado }) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [categoria, setCategoria] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  async function crear(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const cuerpo = { titulo, descripcion };
      if (categoria) cuerpo.categoria = categoria;
      const ticket = await peticion('/tickets', { method: 'POST', body: JSON.stringify(cuerpo) });
      onCreado(ticket);
    } catch (err) {
      if (err.status === 401) return onExpirar();
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tarjeta">
      <h2>Nuevo ticket</h2>
      <p>Describe tu solicitud con el mayor detalle posible. Un analista la revisará.</p>
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

        <div style={{ marginTop: 16 }}>
          <button type="submit" disabled={enviando}>
            {enviando ? 'Enviando...' : 'Crear ticket'}
          </button>
        </div>
      </form>
    </div>
  );
}