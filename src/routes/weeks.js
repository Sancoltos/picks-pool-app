const express = require('express');
const pool = require('../db');
const { requireGate, requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireGate, requireAuth);

// A week is locked the moment its lock time passes OR the moment ANY of its
// games has a posted result — whichever comes first. This is enforced here,
// server-side, so a stray click on an old week can never change a pick after
// results are in, no matter what the UI does.
function isWeekLocked(week, games) {
  const timeLocked = week.lock_time && new Date() > new Date(week.lock_time);
  const resultLocked = games.some((g) => g.result !== null);
  return !!(timeLocked || resultLocked);
}

router.get('/', async (req, res) => {
  const [weeks] = await pool.query('SELECT * FROM weeks ORDER BY sort_order ASC');
  const [games] = await pool.query('SELECT * FROM games');
  const [myPicks] = await pool.query(
    'SELECT game_id, pick FROM picks WHERE user_id = ?',
    [req.session.userId]
  );
  const pickByGame = Object.fromEntries(myPicks.map((p) => [p.game_id, p.pick]));

  const weekList = weeks.map((w) => {
    const weekGames = games.filter((g) => g.week_id === w.id);
    return {
      id: w.id,
      label: w.label,
      lockTime: w.lock_time,
      locked: isWeekLocked(w, weekGames),
      games: weekGames.map((g) => ({
        id: g.id,
        teamA: g.team_a,
        teamB: g.team_b,
        kickoff: g.kickoff,
        result: g.result,
        myPick: pickByGame[g.id] || null,
      })),
    };
  });

  res.json({ weeks: weekList });
});

router.post('/', requireAdmin, async (req, res) => {
  const label = String(req.body?.label || '').trim();
  const lockTime = req.body?.lockTime || null;
  const games = Array.isArray(req.body?.games) ? req.body.games : [];

  if (!label) return res.status(400).json({ error: 'MISSING_LABEL' });
  const validGames = games
    .map((g) => ({
      teamA: String(g.teamA || '').trim(),
      teamB: String(g.teamB || '').trim(),
      kickoff: String(g.kickoff || '').trim() || null,
    }))
    .filter((g) => g.teamA && g.teamB);
  if (!validGames.length) return res.status(400).json({ error: 'NO_VALID_GAMES' });

  const [maxOrderRows] = await pool.query('SELECT COALESCE(MAX(sort_order), 0) AS m FROM weeks');
  const nextOrder = maxOrderRows[0].m + 1;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [weekResult] = await conn.query(
      'INSERT INTO weeks (label, lock_time, sort_order) VALUES (?, ?, ?)',
      [label, lockTime, nextOrder]
    );
    const weekId = weekResult.insertId;
    for (const g of validGames) {
      await conn.query(
        'INSERT INTO games (week_id, team_a, team_b, kickoff) VALUES (?, ?, ?, ?)',
        [weekId, g.teamA, g.teamB, g.kickoff]
      );
    }
    await conn.commit();
    res.json({ weekId });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// Admin posts (or clears) a result for one game.
router.post('/games/:gameId/result', requireAdmin, async (req, res) => {
  const gameId = Number(req.params.gameId);
  const result = req.body?.result; // 'TEAM_A' | 'TEAM_B' | 'TIE' | null
  if (result !== null && !['TEAM_A', 'TEAM_B', 'TIE'].includes(result)) {
    return res.status(400).json({ error: 'INVALID_RESULT' });
  }
  const [rows] = await pool.query('SELECT id FROM games WHERE id = ?', [gameId]);
  if (!rows.length) return res.status(404).json({ error: 'GAME_NOT_FOUND' });

  await pool.query('UPDATE games SET result = ? WHERE id = ?', [result, gameId]);
  res.json({ ok: true });
});

module.exports = router;
