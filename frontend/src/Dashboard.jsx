import { useEffect, useState } from 'react';
import { peticion } from './api';

// Porcentaje entero; null si no hay base para calcularlo
function pct(parte, total) {
  return total ? Math.round((parte * 100) / total) : null;
}

function textoPct(valor) {
  return valor === null ? '—' : `${valor} %`;
}

function textoHoras(horas) {
  if (horas === null || horas === undefined) return '—';
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  return `${horas.toLocaleString('es-CO')} h`;
}

function Tile({ titulo, valor, detalle }) {
  return (
    <div className="tile">
      <div className="tile-titulo">{titulo}</div>
      <div className="tile-valor">{valor}</div>
      {detalle && <div className="tile-detalle">{detalle}</div>}
    </div>
  );
}

// Barras horizontales: una fila por categoria, con su cantidad al final
function Barras({ titulo, datos, claseDe }) {
  const total = datos.reduce((s, d) => s + d.cantidad, 0);
  const max = Math.max(1, ...datos.map((d) => d.cantidad));
  return (
    <div className="tarjeta">
      <h3>{titulo}</h3>
      {total === 0 && <div className="vacio">Sin datos.</div>}
      {datos.map((d) => (
        <div
          className="barra-fila"
          key={d.etiqueta}
          title={`${d.etiqueta}: ${d.cantidad} ticket(s), ${textoPct(pct(d.cantidad, total))} del total`}
        >
          <span className="barra-etiqueta">{d.etiqueta}</span>
          <span className="barra-pista">
            <span
              className={'barra-relleno ' + (claseDe ? claseDe(d) : '')}
              style={{ width: `${(d.cantidad / max) * 100}%` }}
            />
          </span>
          <span className="barra-valor">{d.cantidad}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ onExpirar }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    try {
      setDatos(await peticion('/dashboard'));
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

  if (!datos) {
    return (
      <div className="tarjeta">
        {cargando ? <div className="vacio">Cargando indicadores...</div> : <div className="error">{error}</div>}
      </div>
    );
  }

  const r = datos.resumen;
  const slaResueltos = r.sla_cumplidos + r.sla_incumplidos;
  const respondidas = r.util_si + r.util_no;

  const estadoSla = [
    { etiqueta: 'En tiempo', cantidad: r.sla_en_tiempo, clase: 'sla-en_tiempo' },
    { etiqueta: 'Por vencer', cantidad: r.sla_por_vencer, clase: 'sla-por_vencer' },
    { etiqueta: 'Vencidos', cantidad: r.sla_vencidos, clase: 'sla-vencido' },
  ];

  return (
    <>
      <div className="tarjeta dash-encabezado">
        <h2>Inicio</h2>
        <button className="secundario" onClick={cargar} disabled={cargando}>
          {cargando ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="tiles">
        <Tile titulo="Total de tickets" valor={r.total} />
        <Tile titulo="Activos" valor={r.activos} detalle="Abiertos o en progreso" />
        <Tile titulo="Resueltos" valor={r.resueltos} detalle="Resueltos o cerrados" />
        <Tile titulo="Vencidos (SLA)" valor={r.sla_vencidos} detalle="Activos fuera de su fecha límite" />
      </div>

      <div className="tarjeta">
        <h3>Inteligencia artificial</h3>
        <div className="tiles">
          <Tile titulo="Clasificados por la IA" valor={r.clasificados_ia} detalle={`de ${r.total} tickets`} />
          <Tile
            titulo="Concordancia de tipo"
            valor={textoPct(pct(r.coincide_tipo, r.comparables_tipo))}
            detalle={`${r.coincide_tipo} de ${r.comparables_tipo} tickets`}
          />
          <Tile
            titulo="Concordancia de prioridad"
            valor={textoPct(pct(r.coincide_prioridad, r.comparables_prioridad))}
            detalle={`${r.coincide_prioridad} de ${r.comparables_prioridad} tickets`}
          />
          <Tile
            titulo="Resueltos por la IA"
            valor={r.resueltos_ia}
            detalle={`${textoPct(pct(r.resueltos_ia, r.total))} del total, sin analista`}
          />
          <Tile
            titulo="Autoservicio útil"
            valor={textoPct(pct(r.util_si, respondidas))}
            detalle={`${r.util_si} le sirvieron · ${r.util_no} no`}
          />
          <Tile
            titulo="Tiempo de solución"
            valor={textoHoras(r.horas_ia)}
            detalle={`IA · analista: ${textoHoras(r.horas_analista)}`}
          />
        </div>
        <div className="meta">
          La concordancia indica en qué porcentaje la clasificación final coincide con la de la IA.
          La precisión se mide aparte, con un set de tickets de prueba.
        </div>
      </div>

      <div className="dash-grid">
        <div className="tarjeta">
          <h3>Cumplimiento del SLA</h3>
          <div className="tile-valor">{textoPct(pct(r.sla_cumplidos, slaResueltos))}</div>
          <div className="meta">
            {r.sla_cumplidos} cumplidos · {r.sla_incumplidos} incumplidos (tickets resueltos con fecha límite)
          </div>
        </div>
        <Barras titulo="Estado del SLA (tickets activos)" datos={estadoSla} claseDe={(d) => d.clase} />
        <Barras titulo="Tickets por tipo" datos={datos.porTipo} />
        <Barras titulo="Tickets por prioridad" datos={datos.porPrioridad} />
        <Barras titulo="Tickets por nivel de soporte" datos={datos.porNivel} />
      </div>
    </>
  );
}