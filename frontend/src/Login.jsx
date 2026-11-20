import { useState } from 'react';
import { peticion } from './api';

export default function Login({ onLogin }) {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const datos = await peticion('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ correo, contrasena }),
      });
      localStorage.setItem('token', datos.token);
      localStorage.setItem('usuario', JSON.stringify(datos.usuario));
      onLogin(datos.usuario);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="contenedor" style={{ maxWidth: 420 }}>
      <div className="tarjeta">
        <div className="login-marca">
          <img src="/logo.svg" alt="" className="login-logo" />
          <div className="login-nombre">
            Jolux<span className="marca-ia">IA</span>
          </div>
          <div className="meta">Service desk inteligente</div>
        </div>

        <h3>Iniciar sesión</h3>

        <form onSubmit={enviar}>
          <label>Correo corporativo</label>
          <input
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="nombre.apellido@joluxia.com"
            required
          />

          <label>Contraseña</label>
          <input
            type="password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            required
          />

          {error && <div className="error">{error}</div>}

          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={cargando}>
              {cargando ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        </form>

        <p className="meta" style={{ marginTop: 16 }}>
          ¿No tienes cuenta? Solicítala al administrador de la plataforma.
        </p>
      </div>
    </div>
  );
}