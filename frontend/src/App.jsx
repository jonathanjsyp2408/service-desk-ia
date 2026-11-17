import { useState } from 'react';
import Login from './Login';
import Tickets from './Tickets';
import TicketDetalle from './TicketDetalle';
import CrearTicket from './CrearTicket';
import Dashboard from './Dashboard';
import './App.css';

// Opciones del menu lateral segun el rol
const MENU = {
  usuario: [
    { id: 'tickets', texto: 'Mis tickets' },
    { id: 'crear', texto: 'Crear ticket' },
  ],
  analista: [
    { id: 'inicio', texto: 'Inicio' },
    { id: 'tickets', texto: 'Tickets' },
  ],
  administrador: [
    { id: 'inicio', texto: 'Inicio' },
    { id: 'tickets', texto: 'Tickets' },
  ],
};

function leerUsuario() {
  try {
    return JSON.parse(localStorage.getItem('usuario'));
  } catch {
    return null;
  }
}

// El personal entra al dashboard; el usuario, a sus tickets
function vistaInicial(u) {
  return u && u.rol !== 'usuario' ? 'inicio' : 'tickets';
}

export default function App() {
  const [usuario, setUsuario] = useState(leerUsuario);
  const [vista, setVista] = useState(() => vistaInicial(leerUsuario()));
  const [ticketId, setTicketId] = useState(null);
  const [aviso, setAviso] = useState('');

  function cerrarSesion() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setTicketId(null);
    setVista('tickets');
    setAviso('');
    setUsuario(null);
  }

  function iniciarSesion(u) {
    setUsuario(u);
    setVista(vistaInicial(u));
  }

  function ir(destino) {
    setVista(destino);
    setTicketId(null);
    setAviso('');
  }

  if (!usuario) return <Login onLogin={iniciarSesion} />;

  const opciones = MENU[usuario.rol] || [];
  const esPersonal = usuario.rol === 'analista' || usuario.rol === 'administrador';

  let contenido;
  if (ticketId) {
    contenido = (
      <TicketDetalle
        key={ticketId}
        id={ticketId}
        usuario={usuario}
        onVolver={() => setTicketId(null)}
        onExpirar={cerrarSesion}
      />
    );
  } else if (vista === 'inicio' && esPersonal) {
    contenido = <Dashboard onExpirar={cerrarSesion} />;
  } else if (vista === 'crear' && usuario.rol === 'usuario') {
    contenido = (
      <CrearTicket
        onExpirar={cerrarSesion}
        onCreado={(t) => {
          // Al crear, se abre el detalle para que el usuario vea la respuesta de la IA
          setAviso(`Ticket ${t.codigo || 'SD-' + String(t.numero).padStart(4, '0')} creado correctamente.`);
          setVista('tickets');
          setTicketId(t.id);
        }}
      />
    );
  } else {
    contenido = (
      <Tickets
        usuario={usuario}
        onExpirar={cerrarSesion}
        onAbrir={(id) => { setAviso(''); setTicketId(id); }}
        aviso={aviso}
      />
    );
  }

  return (
    <div className="app">
      <aside className="menu">
        <div className="marca">Service Desk</div>
        {opciones.map((op) => (
          <button
            key={op.id}
            className={'menu-item' + (vista === op.id ? ' activo' : '')}
            onClick={() => ir(op.id)}
          >
            {op.texto}
          </button>
        ))}
      </aside>

      <main className="principal">
        <div className="contenedor">
          <div className="barra">
            <div />
            <div>
              {usuario.nombre} <span className="etiqueta">{usuario.rol}</span>{' '}
              <button className="secundario" onClick={cerrarSesion}>Cerrar sesión</button>
            </div>
          </div>

          {contenido}
        </div>
      </main>
    </div>
  );
}