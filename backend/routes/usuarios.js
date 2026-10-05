const express = require('express');
const pool = require('../db');
const { verificarToken, requerirRol } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

// GET /api/usuarios/personal  -> analistas y administradores (para asignar tickets)
router.get('/personal', requerirRol('analista', 'administrador'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
       WHERE r.nombre IN ('analista', 'administrador')
       ORDER BY u.nombre`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;