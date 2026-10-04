const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { verificarToken, requerirRol } = require('../middleware/auth');

const router = express.Router();
const ROLES_VALIDOS = ['usuario', 'analista', 'administrador'];

// POST /api/auth/register  (público: siempre crea rol "usuario")
router.post('/register', async (req, res) => {
  try {
    const { nombre, correo, contrasena } = req.body;

    if (!nombre || !correo || !contrasena) {
      return res.status(400).json({ error: 'nombre, correo y contrasena son obligatorios' });
    }
    if (contrasena.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const hash = await bcrypt.hash(contrasena, 10);

    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre, correo, contrasena_hash, rol_id)
       VALUES ($1, $2, $3, (SELECT id FROM roles WHERE nombre = 'usuario'))
       RETURNING id, nombre, correo`,
      [nombre.trim(), correo.trim().toLowerCase(), hash]
    );

    res.status(201).json({ ...rows[0], rol: 'usuario' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ese correo ya está registrado' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { correo, contrasena } = req.body;

    if (!correo || !contrasena) {
      return res.status(400).json({ error: 'correo y contrasena son obligatorios' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.correo, u.contrasena_hash, r.nombre AS rol
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE u.correo = $1`,
      [correo.trim().toLowerCase()]
    );

    const usuario = rows[0];
    const coincide = usuario && await bcrypt.compare(contrasena, usuario.contrasena_hash);

    if (!coincide) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.correo, rol: usuario.rol },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/auth/me  (requiere token)
router.get('/me', verificarToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.correo, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
       WHERE u.id = $1`,
      [req.usuario.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/auth/usuarios/:id/rol  (solo administrador)
router.patch('/usuarios/:id/rol', verificarToken, requerirRol('administrador'), async (req, res) => {
  try {
    const { rol } = req.body;
    if (!ROLES_VALIDOS.includes(rol)) {
      return res.status(400).json({ error: `Rol inválido. Usa: ${ROLES_VALIDOS.join(', ')}` });
    }

    const { rows } = await pool.query(
      `UPDATE usuarios SET rol_id = (SELECT id FROM roles WHERE nombre = $1)
       WHERE id = $2
       RETURNING id, nombre, correo`,
      [rol, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ ...rows[0], rol });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;