// Every request must pass the shared "gate" password before touching anything else.
function requireGate(req, res, next) {
  if (req.session.gatePassed) return next();
  return res.status(401).json({ error: 'GATE_REQUIRED' });
}

// Must be logged in as a specific user account.
function requireAuth(req, res, next) {
  if (req.session.userId) return next();
  return res.status(401).json({ error: 'LOGIN_REQUIRED' });
}

// Must be logged in AND flagged as an admin.
function requireAdmin(req, res, next) {
  if (req.session.userId && req.session.isAdmin) return next();
  return res.status(403).json({ error: 'ADMIN_REQUIRED' });
}

module.exports = { requireGate, requireAuth, requireAdmin };
