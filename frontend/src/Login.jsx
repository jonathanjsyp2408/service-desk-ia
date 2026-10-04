import { useState } from 'react';
import { peticion } from './api';

export default function Login({ onLogin }) {
  const [modoRegistro, setModoRegistro] = useState(false);
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      if (modoRegistro) {
        await peticion('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ nombre, correo, contrasena }),
        });
      }
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
        <h1>Service Desk</h1>
        <h3>{modoRegistro ? 'Crear cuenta' : 'Iniciar sesión'}</h3>

        <form onSubmit={enviar}>
          {modoRegistro && (
            <>
              <label>Nombre</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </>
          )}

          <label>Correo</label>
          <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />

          <label>Contraseña</label>
          <input
            type="password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            minLength={modoRegistro ? 8 : undefined}
            required
          />
          {modoRegistro && <div className="meta">Mínimo 8 caracteres.</div>}

          {error && <div className="error">{error}</div>}

          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={cargando}>
              {cargando ? 'Enviando...' : modoRegistro ? 'Registrarme' : 'Entrar'}
            </button>
          </div>
        </form>

        <p className="meta" style={{ marginTop: 16 }}>
          {modoRegistro ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
          <button
            type="button"
            className="enlace"
            onClick={() => { setModoRegistro(!modoRegistro); setError(''); }}
          >
            {modoRegistro ? 'Inicia sesión' : 'Regístrate'}
          </button>
        </p>
      </div>
    </div>
  );
}