import { useState } from 'react';
import Login from './Login';
import Tickets from './Tickets';
import TicketDetalle from './TicketDetalle';
import './App.css';

function leerUsuario() {
  try {
    return JSON.parse(localStorage.getItem('usuario'));
  } catch {
    return null;
  }
}

export default function App() {
  const [usuario, setUsuario] = useState(leerUsuario);
  const [ticketId, setTicketId] = useState(null);

  function cerrarSesion() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setTicketId(null);
    setUsuario(null);
  }

  if (!usuario) return <Login onLogin={setUsuario} />;

  return (
    <div className="contenedor">
      <div className="barra">
        <h1>Service Desk</h1>
        <div>
          {usuario.nombre} <span className="etiqueta">{usuario.rol}</span>{' '}
          <button className="secundario" onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </div>

      {ticketId ? (
        <TicketDetalle
          key={ticketId}
          id={ticketId}
          usuario={usuario}
          onVolver={() => setTicketId(null)}
          onExpirar={cerrarSesion}
        />
      ) : (
        <Tickets usuario={usuario} onExpirar={cerrarSesion} onAbrir={setTicketId} />
      )}
    </div>
  );
}