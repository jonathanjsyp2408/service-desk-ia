// Indicadores para el dashboard (solo analista y administrador)
const express = require('express');
const pool = require('../db');
const { verificarToken, requerirRol } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);
router.use(requerirRol('analista', 'administrador'));

const ACTIVO = `t.estado IN ('abierto', 'en_progreso')`;

// GET /api/dashboard  -> todos los indicadores en una sola respuesta
router.get('/', async (req, res) => {
  try {
    const resumen = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${ACTIVO})::int AS activos,
        COUNT(*) FILTER (WHERE t.estado IN ('resuelto', 'cerrado'))::int AS resueltos,

        -- Inteligencia artificial
        COUNT(*) FILTER (WHERE t.categoria_ia IS NOT NULL)::int AS clasificados_ia,
        COUNT(*) FILTER (WHERE t.categoria_ia IS NOT NULL AND c.nombre IS NOT NULL)::int AS comparables_tipo,
        COUNT(*) FILTER (WHERE t.categoria_ia = c.nombre)::int AS coincide_tipo,
        COUNT(*) FILTER (WHERE t.prioridad_ia IS NOT NULL AND t.prioridad IS NOT NULL)::int AS comparables_prioridad,
        COUNT(*) FILTER (WHERE t.prioridad_ia = t.prioridad)::int AS coincide_prioridad,
        COUNT(*) FILTER (WHERE t.respuesta_ia IS NOT NULL)::int AS con_respuesta,
        COUNT(*) FILTER (WHERE t.tipo_respuesta_ia = 'autoservicio')::int AS autoservicio,
        COUNT(*) FILTER (WHERE t.respuesta_util IS TRUE)::int AS util_si,
        COUNT(*) FILTER (WHERE t.respuesta_util IS FALSE)::int AS util_no,
        COUNT(*) FILTER (WHERE t.resuelto_por_ia)::int AS resueltos_ia,

        -- SLA de los tickets ya resueltos
        COUNT(*) FILTER (WHERE t.resuelto_en IS NOT NULL AND t.fecha_limite IS NOT NULL
                           AND t.resuelto_en <= t.fecha_limite)::int AS sla_cumplidos,
        COUNT(*) FILTER (WHERE t.resuelto_en IS NOT NULL AND t.fecha_limite IS NOT NULL
                           AND t.resuelto_en > t.fecha_limite)::int AS sla_incumplidos,

        -- SLA de los tickets activos
        COUNT(*) FILTER (WHERE ${ACTIVO} AND t.fecha_limite IS NOT NULL
                           AND LOCALTIMESTAMP < t.creado_en + (t.fecha_limite - t.creado_en) * 0.75)::int AS sla_en_tiempo,
        COUNT(*) FILTER (WHERE ${ACTIVO} AND t.fecha_limite IS NOT NULL
                           AND LOCALTIMESTAMP >= t.creado_en + (t.fecha_limite - t.creado_en) * 0.75
                           AND LOCALTIMESTAMP <= t.fecha_limite)::int AS sla_por_vencer,
        COUNT(*) FILTER (WHERE ${ACTIVO} AND t.fecha_limite IS NOT NULL
                           AND LOCALTIMESTAMP > t.fecha_limite)::int AS sla_vencidos,

        -- Tiempo promedio de solucion, en horas
        ROUND((AVG(EXTRACT(EPOCH FROM t.resuelto_en - t.creado_en) / 3600)
          FILTER (WHERE t.resuelto_en IS NOT NULL AND t.resuelto_por_ia))::numeric, 2)::float AS horas_ia,
        ROUND((AVG(EXTRACT(EPOCH FROM t.resuelto_en - t.creado_en) / 3600)
          FILTER (WHERE t.resuelto_en IS NOT NULL AND NOT t.resuelto_por_ia))::numeric, 2)::float AS horas_analista
      FROM tickets t
      LEFT JOIN categorias c ON c.id = t.categoria_id
    `);

    const porTipo = await pool.query(`
      SELECT COALESCE(c.nombre, 'sin clasificar') AS etiqueta, COUNT(*)::int AS cantidad
      FROM tickets t LEFT JOIN categorias c ON c.id = t.categoria_id
      GROUP BY 1 ORDER BY 2 DESC
    `);

    const porPrioridad = await pool.query(`
      SELECT COALESCE(t.prioridad, 'sin prioridad') AS etiqueta, COUNT(*)::int AS cantidad
      FROM tickets t
      GROUP BY 1
      ORDER BY array_position(ARRAY['critica', 'alta', 'media', 'baja', 'sin prioridad'], COALESCE(t.prioridad, 'sin prioridad'))
    `);

    const porNivel = await pool.query(`
      SELECT 'Nivel ' || t.nivel AS etiqueta, COUNT(*)::int AS cantidad
      FROM tickets t
      GROUP BY t.nivel ORDER BY t.nivel
    `);

    res.json({
      resumen: resumen.rows[0],
      porTipo: porTipo.rows,
      porPrioridad: porPrioridad.rows,
      porNivel: porNivel.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
