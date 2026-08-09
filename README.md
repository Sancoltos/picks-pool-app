# Pigskin Picks

A weekly football picks pool: shared group password, individual username+PIN
accounts, admin-entered results, automatic scoring, and a leaderboard.
Built as a real Node.js + Express + MySQL app so it can run on the internet
behind proper server-side auth.

## What changed from the demo version

- **Real server-side auth.** PINs and the group password are checked on the
  server and never trusted from the browser. PINs are hashed with bcrypt
  before they're stored — nobody, including you, can read them back out of
  the database.
- **Sessions stored in MySQL** (via `express-mysql-session`), so logins
  survive server restarts and are shared across everyone visiting the site.
- **Server-enforced week locking.** The bug where an old week's picks could
  be changed by mistake is now fixed at the API level, not just hidden in the
  UI: `POST /api/picks` checks the database directly and refuses the request
  (`403 WEEK_LOCKED`) if the week's lock time has passed **or** if any game
  in that week already has a posted result — even if someone finds a way to
  call the API directly, they can't bypass it.
- **Rate limiting** on the gate password and login/signup endpoints, to slow
  down bots and brute-force attempts.

## 1. Local setup

```bash
npm install
cp .env.example .env
# edit .env with a real DB password, a random SESSION_SECRET, and your GATE_PASSWORD
```

Create the database and tables:

```bash
mysql -u root -p -e "CREATE DATABASE picks_pool; CREATE USER 'picks_app'@'%' IDENTIFIED BY 'change_me'; GRANT ALL ON picks_pool.* TO 'picks_app'@'%';"
mysql -u picks_app -p picks_pool < db/schema.sql
```

Generate a real session secret instead of leaving the placeholder:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run it:

```bash
npm start
# visit http://localhost:3000
```

## 2. Putting it on the internet

You need three things: somewhere to run the Node process, a MySQL database
it can reach, and HTTPS in front of it (required for secure cookies to work
in production). This app serves both the API and the frontend from one
Express process, so it deploys as a single service — no separate frontend
host needed.

### Recommended: Koyeb

Render's free tier spins containers down after 15 minutes of inactivity
(30-60 second cold start on the next visit), which is a poor fit for a picks
pool people check throughout the week. Koyeb's free tier runs containers
continuously with no forced sleep, which is why it's the recommended option
here.

1. Push this folder to a GitHub repo.
2. Create a free MySQL database — Koyeb doesn't include one, so pair it with
   a free-tier MySQL host such as [PlanetScale](https://planetscale.com) or
   [Aiven](https://aiven.io), or run your own if you already have a server.
   Run `db/schema.sql` against it once, same as the local setup above.
3. In Koyeb, create a new Web Service from your GitHub repo. It will
   auto-detect Node.js — no Dockerfile needed. Set the run command to
   `npm start`.
4. Add the environment variables from `.env.example` in Koyeb's dashboard
   (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, a real random
   `SESSION_SECRET`, your `GATE_PASSWORD`, and `NODE_ENV=production`).
5. Deploy. Koyeb gives you a free HTTPS URL immediately — that single URL
   serves both the site and the API.

### Also fine: Render's paid Starter tier ($7/mo)

Same deployment steps as Koyeb above, but on Render. The paid Starter tier
removes the free tier's sleep behavior entirely, so if you're already
comfortable with Render's dashboard, paying the $7/mo is a valid choice —
just skip the free Web Service tier when creating it.

### Also fine: a small VPS

A VPS (DigitalOcean, Linode, etc.) running Node + MySQL directly, with
`nginx` or `Caddy` in front as a reverse proxy handling HTTPS via Let's
Encrypt, and `pm2` to keep the app running and auto-restart it.

Whichever you choose, set `NODE_ENV=production` — this makes session
cookies `secure`, meaning browsers will only ever send them over HTTPS.

## 3. First-run

Whoever signs up first automatically becomes the admin. Have that person
sign up first, then share the site + group password with everyone else.

## 4. Things worth knowing

- Team logos live in `public/logos/` as `<team-slug>.png` (e.g.
  `kansas-city.png`), matched against a fixed 32-team list in
  `public/app.js`. When posting a week, the admin picks teams from a
  dropdown instead of typing names — this keeps every game correctly
  matched to a logo and avoids typos breaking things.

- Changing `GATE_PASSWORD` in `.env` and restarting the server changes the
  shared group password. Anyone already "remembered" stays logged in past
  the gate until their session cookie expires (180 days) or you change the
  `SESSION_SECRET`, which invalidates all sessions immediately.
- To reset someone's PIN, log in as the admin and use the "Reset a Player's
  PIN" section — no email flow needed.
- The `sessions` table is created automatically by `express-mysql-session`
  the first time the app runs — you don't need to add it to `schema.sql`
  yourself.
