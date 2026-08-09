const express = require('express');
const pool = require('../db');
const { requireGate, requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireGate, requireAuth);

router.post('/', async (req, res) => {
  const gameId = Number(req.body?.gameId);
  const pick = req.body?.pick; // 'TEAM_A' | 'TEAM_B' | 'TIE'
  if (!gameId || !['TEAM_A', 'TEAM_B', 'TIE'].includes(pick)) {
    return res.status(400).json({ error: 'INVALID_PICK' });
  }

  const [rows] = await pool.query(
    `SELECT g.id, g.result, w.lock_time,
            (SELECT COUNT(*) FROM games g2 WHERE g2.week_id = w.id AND g2.result IS NOT NULL) AS graded_count
     FROM games g JOIN weeks w ON w.id = g.week_id
     WHERE g.id = ?`,
    [gameId]
  );
  if (!rows.length) return res.status(404).json({ error: 'GAME_NOT_FOUND' });
  const game = rows[0];

  const timeLocked = game.lock_time && new Date() > new Date(game.lock_time);
  const resultLocked = game.graded_count > 0; // ANY result posted for the week locks the whole week
  if (timeLocked || resultLocked) {
    return res.status(403).json({ error: 'WEEK_LOCKED' });
  }

  await pool.query(
    `INSERT INTO picks (user_id, game_id, pick) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE pick = VALUES(pick)`,
    [req.session.userId, gameId, pick]
  );
  res.json({ ok: true });
});

module.exports = router;
