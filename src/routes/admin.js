const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { requireGate, requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireGate, requireAuth, requireAdmin);
const PIN_REGEX = /^\d{4}$/;
const BCRYPT_ROUNDS = 12;

router.get('/users', async (req, res) => {
  const [users] = await pool.query('SELECT id, username, display_name, is_admin FROM users ORDER BY display_name');
  res.json({ users });
});

router.post('/users/:userId/reset-pin', async (req, res) => {
  const userId = Number(req.params.userId);
  const pin = String(req.body?.pin || '').trim();
  if (!PIN_REGEX.test(pin)) return res.status(400).json({ error: 'INVALID_PIN' });

  const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
  const [result] = await pool.query('UPDATE users SET pin_hash = ? WHERE id = ?', [pinHash, userId]);
  if (!result.affectedRows) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  res.json({ ok: true });
});

module.exports = router;
