require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const gateRoutes = require('./src/routes/gate');
const authRoutes = require('./src/routes/auth');
const weekRoutes = require('./src/routes/weeks');
const pickRoutes = require('./src/routes/picks');
const leaderboardRoutes = require('./src/routes/leaderboard');
const adminRoutes = require('./src/routes/admin');

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'SESSION_SECRET', 'GATE_PASSWORD'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}. Check your .env file.`);
    process.exit(1);
  }
}

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// If you're behind a reverse proxy (nginx, Caddy, Koyeb, Render, etc.) this
// lets Express correctly see that the original request was HTTPS, which is
// required for secure cookies to work.
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json({ limit: '100kb' }));

const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  createDatabaseTable: true,
});

app.use(
  session({
    key: 'pigskin_sid',
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd, // requires HTTPS in production — see README
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 180, // 180 days, so people aren't re-prompted often
    },
  })
);

app.use('/api/gate', gateRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/weeks', weekRoutes);
app.use('/api/picks', pickRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Basic error handler so unexpected DB/etc errors don't leak stack traces.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'SERVER_ERROR' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Pigskin Picks running on port ${PORT} (${isProd ? 'production' : 'development'})`);
});
