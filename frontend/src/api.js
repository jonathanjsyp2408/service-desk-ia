const API = 'http://localhost:3000/api';

export function getToken() {
  return localStorage.getItem('token');
}

// Función única para hablar con el backend: agrega el token si hay sesión
export async function peticion(ruta, opciones = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API}${ruta}`, { ...opciones, headers });
  } catch {
    throw new Error('No se pudo conectar con el servidor');
  }

  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(datos.error || 'Error en la petición');
    error.status = res.status;
    throw error;
  }
  return datos;
}