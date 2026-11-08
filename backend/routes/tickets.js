const express = require('express');
const pool = require('../db');
const { verificarToken, requerirRol } = require('../middleware/auth');
const { clasificarTicket } = require('../ia');

const router = express.Router();
router.use(verificarToken); // todas las rutas de tickets exigen sesión

const ESTADOS = ['abierto', 'en_progreso', 'resuelto', 'cerrado'];
const PRIORIDADES = ['baja', 'media', 'alta', 'critica'];
const NIVELES = [1, 2, 3];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esPersonal = (rol) => rol === 'analista' || rol === 'administrador';

// Error con codigo HTTP: se lanza dentro de una transaccion y el catch responde
class ErrorHttp extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

// Estado del SLA calculado en la consulta:
// cumplido / incumplido (ya resuelto), vencido, por_vencer (75 % del tiempo), en_tiempo
const SLA_ESTADO = `
  CASE
    WHEN t.fecha_limite IS NULL THEN NULL
    WHEN t.resuelto_en IS NOT NULL THEN
      CASE WHEN t.resuelto_en <= t.fecha_limite THEN 'cumplido' ELSE 'incumplido' END
    WHEN LOCALTIMESTAMP > t.fecha_limite THEN 'vencido'
    WHEN LOCALTIMESTAMP >= t.creado_en + (t.fecha_limite - t.creado_en) * 0.75 THEN 'por_vencer'
    ELSE 'en_tiempo'
  END`;

const SELECT_TICKET = `
  SELECT t.id, t.numero, t.codigo, t.titulo, t.descripcion, t.estado, t.prioridad,
         t.categoria_ia, t.prioridad_ia, t.nivel, t.proveedor,
         t.creado_en, t.cerrado_en, t.resuelto_en, t.fecha_limite,
         ${SLA_ESTADO} AS sla_estado,
         t.usuario_id, t.analista_id,
         c.nombre AS categoria,
         u.nombre AS solicitante,
         a.nombre AS analista
  FROM tickets t
  JOIN usuarios u ON u.id = t.usuario_id
  LEFT JOIN usuarios a ON a.id = t.analista_id
  LEFT JOIN categorias c ON c.id = t.categoria_id`;

// Siguiente codigo del tipo (INC-0007, REQ-0001...). El UPDATE bloquea la fila,
// asi dos tickets creados al mismo tiempo nunca reciben el mismo numero.
async function siguienteCodigo(client, categoriaId) {
  const { rows } = await client.query(
    `UPDATE categorias SET ultimo_numero = ultimo_numero + 1
     WHERE id = $1 RETURNING prefijo, ultimo_numero`,
    [categoriaId]
  );
  return `${rows[0].prefijo}-${String(rows[0].ultimo_numero).padStart(4, '0')}`;
}

// Fecha limite = fecha de creacion + horas del SLA segun tipo y prioridad
async function recalcularFechaLimite(client, ticketId) {
  await client.query(
    `UPDATE tickets t SET fecha_limite = (
       SELECT t.creado_en + make_interval(hours => s.horas)
       FROM sla s
       WHERE s.categoria_id = t.categoria_id AND s.prioridad = t.prioridad
     )
     WHERE t.id = $1`,
    [ticketId]
  );
}

async function idCategoria(db, nombre) {
  const c = await db.query('SELECT id FROM categorias WHERE nombre = $1', [String(nombre).toLowerCase()]);
  return c.rows[0] ? c.rows[0].id : null;
}

// POST /api/tickets  -> crear ticket (solo rol usuario). La IA lo clasifica al crearlo.
router.post('/', requerirRol('usuario'), async (req, res) => {
  const { titulo, descripcion, categoria } = req.body;
  if (!titulo || !descripcion) {
    return res.status(400).json({ error: 'titulo y descripcion son obligatorios' });
  }

  let client;
  try {
    // Categoria elegida por el usuario (opcional)
    let categoriaId = null;
    if (categoria) {
      categoriaId = await idCategoria(pool, categoria);
      if (!categoriaId) return res.status(400).json({ error: 'Categoría inválida' });
    }

    // Clasificacion de la IA. Si falla devuelve null y el ticket se crea igual.
    const ia = await clasificarTicket(titulo.trim(), descripcion.trim());
    if (!categoriaId && ia) categoriaId = await idCategoria(pool, ia.categoria);
    const prioridad = ia ? ia.prioridad : null;

    client = await pool.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO tickets (usuario_id, categoria_id, titulo, descripcion, prioridad, categoria_ia, prioridad_ia)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.usuario.id, categoriaId, titulo.trim(), descripcion.trim(), prioridad,
       ia ? ia.categoria : null, ia ? ia.prioridad : null]
    );
    const ticketId = rows[0].id;

    if (categoriaId) {
      const codigo = await siguienteCodigo(client, categoriaId);
      await client.query('UPDATE tickets SET codigo = $1 WHERE id = $2', [codigo, ticketId]);
    }
    await recalcularFechaLimite(client, ticketId);

    await client.query(
      `INSERT INTO historial_estados (ticket_id, estado_anterior, estado_nuevo)
       VALUES ($1, NULL, 'abierto')`,
      [ticketId]
    );
    await client.query('COMMIT');

    const t = await pool.query(SELECT_TICKET + ' WHERE t.id = $1', [ticketId]);
    res.status(201).json(t.rows[0]);
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    if (client) client.release();
  }
});

// GET /api/tickets  -> el usuario ve los suyos; analista/admin ven todos
router.get('/', async (req, res) => {
  try {
    const cond = [];
    const params = [];

    if (!esPersonal(req.usuario.rol)) {
      params.push(req.usuario.id);
      cond.push(`t.usuario_id = $${params.length}`);
    }
    if (req.query.estado) {
      if (!ESTADOS.includes(req.query.estado)) {
        return res.status(400).json({ error: `Estado inválido. Usa: ${ESTADOS.join(', ')}` });
      }
      params.push(req.query.estado);
      cond.push(`t.estado = $${params.length}`);
    }

    const where = cond.length ? ' WHERE ' + cond.join(' AND ') : '';
    const { rows } = await pool.query(SELECT_TICKET + where + ' ORDER BY t.creado_en DESC', params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/tickets/:id  -> detalle con historial de estados y de cambios
router.get('/:id', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Ticket no encontrado' });

    const { rows } = await pool.query(SELECT_TICKET + ' WHERE t.id = $1', [req.params.id]);
    const ticket = rows[0];

    // Un usuario normal solo puede ver sus propios tickets
    if (!ticket || (!esPersonal(req.usuario.rol) && ticket.usuario_id !== req.usuario.id)) {
      return res.status(404).json({ error: 'Ticket no encontrado' });
    }

    const h = await pool.query(
      `SELECT estado_anterior, estado_nuevo, cambiado_en
       FROM historial_estados WHERE ticket_id = $1 ORDER BY cambiado_en`,
      [req.params.id]
    );
    const cambios = await pool.query(
      `SELECT hc.campo, hc.valor_anterior, hc.valor_nuevo, hc.cambiado_en, u.nombre AS usuario
       FROM historial_cambios hc
       LEFT JOIN usuarios u ON u.id = hc.usuario_id
       WHERE hc.ticket_id = $1 ORDER BY hc.cambiado_en`,
      [req.params.id]
    );
    res.json({ ...ticket, historial: h.rows, cambios: cambios.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/tickets/:id  -> analista/admin: estado, prioridad, categoria, analista_id, nivel, proveedor
router.patch('/:id', requerirRol('analista', 'administrador'), async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Ticket no encontrado' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { estado, prioridad, categoria, analista_id, nivel, proveedor } = req.body;

    // Datos actuales del ticket (FOR UPDATE: nadie mas lo modifica mientras tanto)
    const act = await client.query(
      `SELECT t.estado, t.prioridad, t.categoria_id, t.codigo, t.nivel, t.proveedor,
              t.resuelto_en, t.analista_id, c.nombre AS categoria, a.nombre AS analista
       FROM tickets t
       LEFT JOIN categorias c ON c.id = t.categoria_id
       LEFT JOIN usuarios a ON a.id = t.analista_id
       WHERE t.id = $1
       FOR UPDATE OF t`,
      [req.params.id]
    );
    const actual = act.rows[0];
    if (!actual) throw new ErrorHttp(404, 'Ticket no encontrado');

    const sets = [];
    const vals = [];
    const add = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
    const cambios = []; // [campo, valor_anterior, valor_nuevo]
    let recalcularSla = false;
    let cambioEstado = false;

    // Estado
    if (estado !== undefined && estado !== actual.estado) {
      if (!ESTADOS.includes(estado)) {
        throw new ErrorHttp(400, `Estado inválido. Usa: ${ESTADOS.join(', ')}`);
      }
      cambioEstado = true;
      add('estado', estado);
      sets.push(estado === 'cerrado' ? 'cerrado_en = NOW()' : 'cerrado_en = NULL');
      if (estado === 'resuelto' || estado === 'cerrado') {
        if (!actual.resuelto_en) sets.push('resuelto_en = LOCALTIMESTAMP');
      } else {
        sets.push('resuelto_en = NULL'); // se reabrio
      }
    }

    // Prioridad
    if (prioridad !== undefined && prioridad !== actual.prioridad) {
      if (!PRIORIDADES.includes(prioridad)) {
        throw new ErrorHttp(400, `Prioridad inválida. Usa: ${PRIORIDADES.join(', ')}`);
      }
      add('prioridad', prioridad);
      cambios.push(['prioridad', actual.prioridad, prioridad]);
      recalcularSla = true;
    }

    // Tipo (categoria): si cambia, el ticket recibe un codigo nuevo
    if (categoria !== undefined && String(categoria).toLowerCase() !== actual.categoria) {
      const nuevaId = await idCategoria(client, categoria);
      if (!nuevaId) throw new ErrorHttp(400, 'Categoría inválida');
      const nuevoCodigo = await siguienteCodigo(client, nuevaId);
      add('categoria_id', nuevaId);
      add('codigo', nuevoCodigo);
      cambios.push(['categoria', actual.categoria, String(categoria).toLowerCase()]);
      cambios.push(['codigo', actual.codigo, nuevoCodigo]);
      recalcularSla = true;
    }

    // Analista asignado
    if (analista_id !== undefined && analista_id !== actual.analista_id) {
      if (!UUID_RE.test(String(analista_id))) throw new ErrorHttp(400, 'analista_id inválido');
      const a = await client.query(
        `SELECT u.id, u.nombre FROM usuarios u JOIN roles r ON r.id = u.rol_id
         WHERE u.id = $1 AND r.nombre IN ('analista', 'administrador')`,
        [analista_id]
      );
      if (!a.rows[0]) throw new ErrorHttp(400, 'El analista no existe o no tiene rol de analista');
      add('analista_id', analista_id);
      cambios.push(['analista', actual.analista, a.rows[0].nombre]);
    }

    // Nivel de soporte (1 Service Desk, 2 en sitio/especializado, 3 proveedor externo)
    let nivelNuevo = actual.nivel;
    if (nivel !== undefined) {
      nivelNuevo = Number(nivel);
      if (!NIVELES.includes(nivelNuevo)) throw new ErrorHttp(400, 'Nivel inválido. Usa: 1, 2 o 3');
      if (nivelNuevo !== actual.nivel) {
        add('nivel', nivelNuevo);
        cambios.push(['nivel', String(actual.nivel), String(nivelNuevo)]);
      }
    }

    // Proveedor: obligatorio en nivel 3; en niveles 1 y 2 se borra
    if (nivelNuevo === 3) {
      const prov = proveedor !== undefined ? String(proveedor).trim() : (actual.proveedor || '');
      if (!prov) throw new ErrorHttp(400, 'Indica el proveedor externo para el nivel 3');
      if (prov.length > 150) throw new ErrorHttp(400, 'El nombre del proveedor es demasiado largo');
      if (prov !== actual.proveedor) {
        add('proveedor', prov);
        cambios.push(['proveedor', actual.proveedor, prov]);
      }
    } else if (actual.proveedor) {
      add('proveedor', null);
    }

    if (sets.length === 0) throw new ErrorHttp(400, 'No hay cambios para aplicar');

    vals.push(req.params.id);
    await client.query(`UPDATE tickets SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);

    if (cambioEstado) {
      await client.query(
        `INSERT INTO historial_estados (ticket_id, estado_anterior, estado_nuevo)
         VALUES ($1, $2, $3)`,
        [req.params.id, actual.estado, estado]
      );
    }
    for (const [campo, anterior, nuevo] of cambios) {
      await client.query(
        `INSERT INTO historial_cambios (ticket_id, usuario_id, campo, valor_anterior, valor_nuevo)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, req.usuario.id, campo, anterior, nuevo]
      );
    }
    if (recalcularSla) await recalcularFechaLimite(client, req.params.id);

    await client.query('COMMIT');

    const t = await pool.query(SELECT_TICKET + ' WHERE t.id = $1', [req.params.id]);
    res.json(t.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof ErrorHttp) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

module.exports = router;