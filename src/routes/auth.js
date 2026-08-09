const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { requireGate, requireAuth } = require('../middleware/auth');

const router = express.Router();
const PIN_REGEX = /^\d{4}$/;
const BCRYPT_ROUNDS = 12;

// Slow down brute-force PIN guessing against real accounts.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_ATTEMPTS' },
});

router.use(requireGate);

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  res.json({
    user: {
      id: req.session.userId,
      username: req.session.username,
      displayName: req.session.displayName,
      isAdmin: !!req.session.isAdmin,
    },
  });
});

router.post('/signup', loginLimiter, async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const displayName = String(req.body?.displayName || '').trim();
  const pin = String(req.body?.pin || '').trim();

  if (!username || !displayName) return res.status(400).json({ error: 'MISSING_FIELDS' });
  if (!PIN_REGEX.test(pin)) return res.status(400).json({ error: 'INVALID_PIN' });
  if (!/^[a-z0-9_.-]{3,50}$/.test(username)) return res.status(400).json({ error: 'INVALID_USERNAME' });

  const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
  if (existing.length) return res.status(409).json({ error: 'USERNAME_TAKEN' });

  const [countRows] = await pool.query('SELECT COUNT(*) AS c FROM users');
  const isFirstUser = countRows[0].c === 0;

  const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
  const [result] = await pool.query(
    'INSERT INTO users (username, display_name, pin_hash, is_admin) VALUES (?, ?, ?, ?)',
    [username, displayName, pinHash, isFirstUser]
  );

  req.session.userId = result.insertId;
  req.session.username = username;
  req.session.displayName = displayName;
  req.session.isAdmin = isFirstUser;

  res.json({
    user: { id: result.insertId, username, displayName, isAdmin: isFirstUser },
  });
});

router.post('/login', loginLimiter, async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const pin = String(req.body?.pin || '').trim();
  if (!username || !PIN_REGEX.test(pin)) return res.status(400).json({ error: 'INVALID_CREDENTIALS' });

  const [rows] = await pool.query(
    'SELECT id, display_name, pin_hash, is_admin FROM users WHERE username = ?',
    [username]
  );
  if (!rows.length) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

  const user = rows[0];
  const ok = await bcrypt.compare(pin, user.pin_hash);
  if (!ok) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

  req.session.userId = user.id;
  req.session.username = username;
  req.session.displayName = user.display_name;
  req.session.isAdmin = !!user.is_admin;

  res.json({
    user: { id: user.id, username, displayName: user.display_name, isAdmin: !!user.is_admin },
  });
});

router.post('/logout', requireAuth, (req, res) => {
  delete req.session.userId;
  delete req.session.username;
  delete req.session.displayName;
  delete req.session.isAdmin;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'SERVER_ERROR' });
    res.json({ ok: true });
  });
});

module.exports = router;
