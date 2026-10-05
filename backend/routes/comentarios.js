const express = require('express');
const pool = require('../db');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esPersonal = (rol) => rol === 'analista' || rol === 'administrador';

// Comprueba que el ticket exista y que el usuario pueda verlo
async function ticketAccesible(req, res) {
  const noEncontrado = () => {
    res.status(404).json({ error: 'Ticket no encontrado' });
    return false;
  };
  if (!UUID_RE.test(req.params.id)) return noEncontrado();

  const { rows } = await pool.query('SELECT usuario_id FROM tickets WHERE id = $1', [req.params.id]);
  const ticket = rows[0];
  if (!ticket) return noEncontrado();
  if (!esPersonal(req.usuario.rol) && ticket.usuario_id !== req.usuario.id) return noEncontrado();
  return true;
}

const SELECT_COMENTARIOS = `
  SELECT c.id, c.mensaje, c.creado_en, u.nombre AS autor, r.nombre AS rol
  FROM comentarios c
  JOIN usuarios u ON u.id = c.autor_id
  JOIN roles r ON r.id = u.rol_id`;

// GET /api/tickets/:id/comentarios
router.get('/:id/comentarios', async (req, res) => {
  try {
    if (!(await ticketAccesible(req, res))) return;
    const { rows } = await pool.query(
      SELECT_COMENTARIOS + ' WHERE c.ticket_id = $1 ORDER BY c.creado_en',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/tickets/:id/comentarios
router.post('/:id/comentarios', async (req, res) => {
  try {
    if (!(await ticketAccesible(req, res))) return;

    const mensaje = String(req.body.mensaje || '').trim();
    if (!mensaje) return res.status(400).json({ error: 'El mensaje es obligatorio' });
    if (mensaje.length > 2000) return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 2000 caracteres)' });

    const ins = await pool.query(
      `INSERT INTO comentarios (ticket_id, autor_id, mensaje)
       VALUES ($1, $2, $3) RETURNING id`,
      [req.params.id, req.usuario.id, mensaje]
    );
    const { rows } = await pool.query(SELECT_COMENTARIOS + ' WHERE c.id = $1', [ins.rows[0].id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;