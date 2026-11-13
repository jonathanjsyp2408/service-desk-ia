// Funciones de formato compartidas por las pantallas de tickets

export function formatear(fecha) {
  return fecha ? new Date(fecha).toLocaleString('es-CO') : '';
}

// Codigo por tipo (INC-0007, REQ-0001...). Si no esta clasificado, numero interno SD.
export function codigoTicket(t) {
  return t.codigo || 'SD-' + String(t.numero).padStart(4, '0');
}

export function nombreEstado(estado) {
  return estado.replace('_', ' ');
}

export const TEXTO_SLA = {
  en_tiempo: 'En tiempo',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  cumplido: 'Cumplido',
  incumplido: 'Incumplido',
};

export const NIVELES = [
  { valor: '1', texto: 'Nivel 1 · Service Desk' },
  { valor: '2', texto: 'Nivel 2 · Soporte en sitio o especializado' },
  { valor: '3', texto: 'Nivel 3 · Proveedor externo' },
];

export const NOMBRE_CAMPO = {
  categoria: 'Tipo',
  codigo: 'Código',
  prioridad: 'Prioridad',
  nivel: 'Nivel',
  proveedor: 'Proveedor',
  analista: 'Analista',
};