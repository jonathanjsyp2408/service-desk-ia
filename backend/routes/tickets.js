const express = require('express');
const pool = require('../db');
const { verificarToken, requerirRol } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken); // todas las rutas de tickets exigen sesión

const ESTADOS = ['abierto', 'en_progreso', 'resuelto', 'cerrado'];
const PRIORIDADES = ['baja', 'media', 'alta', 'critica'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esPersonal = (rol) => rol === 'analista' || rol === 'administrador';

const SELECT_TICKET = `
  SELECT t.id, t.titulo, t.descripcion, t.estado, t.prioridad,
         t.creado_en, t.cerrado_en, t.usuario_id, t.analista_id,
         c.nombre AS categoria,
         u.nombre AS solicitante,
         a.nombre AS analista
  FROM tickets t
  JOIN usuarios u ON u.id = t.usuario_id
  LEFT JOIN usuarios a ON a.id = t.analista_id
  LEFT JOIN categorias c ON c.id = t.categoria_id`;

// POST /api/tickets  -> crear ticket (cualquier usuario con sesión)
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { titulo, descripcion, categoria } = req.body;
    if (!titulo || !descripcion) {
      return res.status(400).json({ error: 'titulo y descripcion son obligatorios' });
    }

    let categoriaId = null;
    if (categoria) {
      const c = await client.query('SELECT id FROM categorias WHERE nombre = $1', [String(categoria).toLowerCase()]);
      if (!c.rows[0]) return res.status(400).json({ error: 'Categoría inválida' });
      categoriaId = c.rows[0].id;
    }

    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO tickets (usuario_id, categoria_id, titulo, descripcion)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [req.usuario.id, categoriaId, titulo.trim(), descripcion.trim()]
    );
    await client.query(
      `INSERT INTO historial_estados (ticket_id, estado_anterior, estado_nuevo)
       VALUES ($1, NULL, 'abierto')`,
      [rows[0].id]
    );
    await client.query('COMMIT');

    const t = await pool.query(SELECT_TICKET + ' WHERE t.id = $1', [rows[0].id]);
    res.status(201).json(t.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
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

// GET /api/tickets/:id  -> detalle con historial de estados
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
    res.json({ ...ticket, historial: h.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/tickets/:id  -> analista/admin: estado, prioridad, categoria, analista_id
router.patch('/:id', requerirRol('analista', 'administrador'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Ticket no encontrado' });

    const { estado, prioridad, categoria, analista_id } = req.body;
    const actual = await client.query('SELECT estado FROM tickets WHERE id = $1', [req.params.id]);
    if (!actual.rows[0]) return res.status(404).json({ error: 'Ticket no encontrado' });

    const sets = [];
    const vals = [];
    const add = (col, val) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };

    let cambioEstado = false;
    if (estado !== undefined) {
      if (!ESTADOS.includes(estado)) {
        return res.status(400).json({ error: `Estado inválido. Usa: ${ESTADOS.join(', ')}` });
      }
      if (estado !== actual.rows[0].estado) {
        cambioEstado = true;
        add('estado', estado);
        sets.push(estado === 'cerrado' ? 'cerrado_en = NOW()' : 'cerrado_en = NULL');
      }
    }
    if (prioridad !== undefined) {
      if (!PRIORIDADES.includes(prioridad)) {
        return res.status(400).json({ error: `Prioridad inválida. Usa: ${PRIORIDADES.join(', ')}` });
      }
      add('prioridad', prioridad);
    }
    if (categoria !== undefined) {
      const c = await client.query('SELECT id FROM categorias WHERE nombre = $1', [String(categoria).toLowerCase()]);
      if (!c.rows[0]) return res.status(400).json({ error: 'Categoría inválida' });
      add('categoria_id', c.rows[0].id);
    }
    if (analista_id !== undefined) {
      if (!UUID_RE.test(String(analista_id))) return res.status(400).json({ error: 'analista_id inválido' });
      const a = await client.query(
        `SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id
         WHERE u.id = $1 AND r.nombre IN ('analista', 'administrador')`,
        [analista_id]
      );
      if (!a.rows[0]) return res.status(400).json({ error: 'El analista no existe o no tiene rol de analista' });
      add('analista_id', analista_id);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'No hay cambios para aplicar' });
    }

    await client.query('BEGIN');
    vals.push(req.params.id);
    await client.query(`UPDATE tickets SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    if (cambioEstado) {
      await client.query(
        `INSERT INTO historial_estados (ticket_id, estado_anterior, estado_nuevo)
         VALUES ($1, $2, $3)`,
        [req.params.id, actual.rows[0].estado, estado]
      );
    }
    await client.query('COMMIT');

    const t = await pool.query(SELECT_TICKET + ' WHERE t.id = $1', [req.params.id]);
    res.json(t.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

module.exports = router;