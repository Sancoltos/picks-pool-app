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

// Admin sets a pick on someone else's behalf — same lock rule as a normal
// pick: refused if the game's own result is posted or its lock time passed.
router.post('/picks', async (req, res) => {
  const userId = Number(req.body?.userId);
  const gameId = Number(req.body?.gameId);
  const pick = req.body?.pick;
  if (!userId || !gameId || !['TEAM_A', 'TEAM_B', 'TIE'].includes(pick)) {
    return res.status(400).json({ error: 'INVALID_PICK' });
  }

  const [rows] = await pool.query(
    `SELECT g.id, g.result, w.lock_time
     FROM games g JOIN weeks w ON w.id = g.week_id
     WHERE g.id = ?`,
    [gameId]
  );
  if (!rows.length) return res.status(404).json({ error: 'GAME_NOT_FOUND' });
  const game = rows[0];

  const timeLocked = game.lock_time && new Date() > new Date(game.lock_time);
  const resultLocked = game.result !== null;
  if (timeLocked || resultLocked) {
    return res.status(403).json({ error: 'GAME_LOCKED' });
  }

  const [userRows] = await pool.query('SELECT id FROM users WHERE id = ?', [userId]);
  if (!userRows.length) return res.status(404).json({ error: 'USER_NOT_FOUND' });

  await pool.query(
    `INSERT INTO picks (user_id, game_id, pick) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE pick = VALUES(pick)`,
    [userId, gameId, pick]
  );
  res.json({ ok: true });
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
