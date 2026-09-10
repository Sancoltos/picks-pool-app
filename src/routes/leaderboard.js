const express = require('express');
const pool = require('../db');
const { requireGate, requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireGate, requireAuth);

router.get('/', async (req, res) => {
  const [users] = await pool.query('SELECT id, username, display_name, is_admin FROM users');
  const [weeks] = await pool.query('SELECT id, label, sort_order FROM weeks ORDER BY sort_order ASC');
  const [games] = await pool.query('SELECT id, week_id, result FROM games');
  const [picks] = await pool.query('SELECT user_id, game_id, pick FROM picks');

  const pickIndex = {}; // pickIndex[userId][gameId] = pick
  for (const p of picks) {
    pickIndex[p.user_id] = pickIndex[p.user_id] || {};
    pickIndex[p.user_id][p.game_id] = p.pick;
  }

  function scoreForUserWeek(userId, weekId) {
    const weekGames = games.filter((g) => g.week_id === weekId);
    let score = 0;
    let played = 0;
    for (const g of weekGames) {
      if (!g.result) continue;
      played++;
      const pick = pickIndex[userId] && pickIndex[userId][g.id];
      if (!pick) { score -= 1; continue; }
      if (g.result === 'TIE') score += pick === 'TIE' ? 2 : 0;
      else score += pick === g.result ? 1 : -1;
    }
    return { score, played };
  }

  const rows = users.map((u) => {
    const weekly = weeks.map((w) => {
      const { score, played } = scoreForUserWeek(u.id, w.id);
      return { weekId: w.id, label: w.label, score, played };
    });
    const total = weekly.reduce((sum, w) => sum + w.score, 0);
    return {
      username: u.username,
      displayName: u.display_name,
      isAdmin: !!u.is_admin,
      total,
      weekly,
    };
  });

  rows.sort((a, b) => b.total - a.total);
  res.json({ rows });
});

module.exports = router;
