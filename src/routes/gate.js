const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// Slow down brute-force attempts against the shared gate password.
const gateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_ATTEMPTS' },
});

router.get('/status', (req, res) => {
  res.json({ passed: !!req.session.gatePassed });
});

router.post('/check', gateLimiter, (req, res) => {
  const { password } = req.body || {};
  // Compared server-side only against an env var that is never sent to the browser.
  if (typeof password === 'string' && password === process.env.GATE_PASSWORD) {
    req.session.gatePassed = true;
    return res.json({ passed: true });
  }
  return res.status(401).json({ error: 'WRONG_PASSWORD' });
});

module.exports = router;
