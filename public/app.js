(function () {
  const app = document.getElementById('pp-app');
  const toastEl = document.getElementById('pp-toast');

  // Canonical team list — matches the logo files in /logos. Using a fixed
  // list (rather than free-typed team names) means logos always match up
  // and the admin can't introduce a typo that breaks a game.
  const TEAMS = [
    { slug: 'arizona', name: 'Arizona Cardinals' },
    { slug: 'atlanta', name: 'Atlanta Falcons' },
    { slug: 'baltimore', name: 'Baltimore Ravens' },
    { slug: 'buffalo', name: 'Buffalo Bills' },
    { slug: 'carolina', name: 'Carolina Panthers' },
    { slug: 'chicago', name: 'Chicago Bears' },
    { slug: 'cincinnati', name: 'Cincinnati Bengals' },
    { slug: 'cleveland', name: 'Cleveland Browns' },
    { slug: 'dallas', name: 'Dallas Cowboys' },
    { slug: 'denver', name: 'Denver Broncos' },
    { slug: 'detroit', name: 'Detroit Lions' },
    { slug: 'green-bay', name: 'Green Bay Packers' },
    { slug: 'houston', name: 'Houston Texans' },
    { slug: 'indianapolis', name: 'Indianapolis Colts' },
    { slug: 'jacksonville', name: 'Jacksonville Jaguars' },
    { slug: 'kansas-city', name: 'Kansas City Chiefs' },
    { slug: 'las-vegas', name: 'Las Vegas Raiders' },
    { slug: 'los-angeles-chargers', name: 'Los Angeles Chargers' },
    { slug: 'los-angeles-rams', name: 'Los Angeles Rams' },
    { slug: 'miami', name: 'Miami Dolphins' },
    { slug: 'minnesota', name: 'Minnesota Vikings' },
    { slug: 'new-england', name: 'New England Patriots' },
    { slug: 'new-orleans', name: 'New Orleans Saints' },
    { slug: 'new-york-giants', name: 'New York Giants' },
    { slug: 'new-york-jets', name: 'New York Jets' },
    { slug: 'philadelphia', name: 'Philadelphia Eagles' },
    { slug: 'pittsburgh', name: 'Pittsburgh Steelers' },
    { slug: 'san-francisco', name: 'San Francisco 49ers' },
    { slug: 'seattle', name: 'Seattle Seahawks' },
    { slug: 'tampa-bay', name: 'Tampa Bay Buccaneers' },
    { slug: 'tennessee', name: 'Tennessee Titans' },
    { slug: 'washington', name: 'Washington Commanders' },
  ];
  const TEAM_BY_NAME = Object.fromEntries(TEAMS.map((t) => [t.name, t]));

  function teamOptionsHtml(selected) {
    return `<option value="" ${!selected ? 'selected' : ''} disabled>Select a team</option>` +
      TEAMS.map((t) => `<option value="${t.name}" ${t.name === selected ? 'selected' : ''}>${t.name}</option>`).join('');
  }

  function logoImg(teamName, size) {
    const t = TEAM_BY_NAME[teamName];
    if (!t) return '';
    const px = size || 40;
    return `<img src="/logos/${t.slug}.png" alt="" style="width:${px}px;height:${px}px;object-fit:contain;display:block;margin:0 auto 6px;" />`;
  }

  let gatePassed = false;
  let gateError = '';
  let user = null; // {id, username, displayName, isAdmin}
  let authMode = 'login';
  let authError = '';
  let activeTab = 'week';
  let weeksData = []; // from /api/weeks
  let selectedWeekId = null;
  let expandedUser = null;
  let adminDraftGames = [{ teamA: '', teamB: '', kickoff: '' }];
  let adminUsers = [];
  let leaderboardRows = [];
  let othersSelectedWeekId = null;
  let othersData = null;
  let othersError = null;

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  async function api(path, opts) {
    const res = await fetch('/api' + path, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    let body = null;
    try { body = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const err = new Error((body && body.error) || 'REQUEST_FAILED');
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  function render() {
    if (!gatePassed) return renderGate();
    if (!user) return renderAuth();
    return renderApp();
  }

  // ---------------- GATE ----------------
  function renderGate() {
    app.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <div class="field-header">
            <h1 class="display">Pigskin Picks</h1>
            <p>Private group site — password required.</p>
          </div>
          <div class="card">
            <h2>Enter Group Password</h2>
            ${gateError ? `<div class="error-msg">${gateError}</div>` : ''}
            <div class="field-group">
              <label for="pp-gate-pw">Password</label>
              <input type="password" id="pp-gate-pw" autocomplete="off" />
            </div>
            <button class="big-btn" id="pp-gate-submit">Continue</button>
            <p class="muted" style="margin-top:12px;">Ask whoever set up the group for this password. You'll only need to enter it once on this device.</p>
          </div>
        </div>
      </div>
    `;
    const pwInput = document.getElementById('pp-gate-pw');
    document.getElementById('pp-gate-submit').onclick = handleGateSubmit;
    pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleGateSubmit(); });
    pwInput.focus();
  }

  async function handleGateSubmit() {
    const val = document.getElementById('pp-gate-pw').value || '';
    try {
      await api('/gate/check', { method: 'POST', body: JSON.stringify({ password: val }) });
      gateError = '';
      gatePassed = true;
      await afterGate();
    } catch (e) {
      gateError = e.status === 429 ? 'Too many attempts — please wait a few minutes and try again.' : 'That password is not correct.';
      render();
    }
  }

  async function afterGate() {
    try {
      const meRes = await api('/auth/me');
      user = meRes.user;
    } catch (e) { user = null; }
    render();
  }

  // ---------------- AUTH ----------------
  function renderAuth() {
    app.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <div class="field-header">
            <h1 class="display">Pigskin Picks</h1>
            <p>Weekly picks. Bragging rights. One leaderboard.</p>
          </div>
          <div class="card">
            <h2>${authMode === 'login' ? 'Log In' : 'Create Your Account'}</h2>
            ${authError ? `<div class="error-msg">${authError}</div>` : ''}
            ${authMode === 'signup' ? `
              <div class="field-group">
                <label for="pp-dname">Your Name (shown on leaderboard)</label>
                <input type="text" id="pp-dname" placeholder="e.g. Grandpa Joe" />
              </div>` : ''}
            <div class="field-group">
              <label for="pp-uname">Username</label>
              <input type="text" id="pp-uname" placeholder="e.g. joe1" autocomplete="off" />
            </div>
            <div class="field-group">
              <label for="pp-pin">4-Digit PIN</label>
              <input type="password" id="pp-pin" inputmode="numeric" maxlength="4" placeholder="****" />
            </div>
            <button class="big-btn" id="pp-auth-submit">${authMode === 'login' ? 'Log In' : 'Create Account'}</button>
            <div style="text-align:center; margin-top:10px;">
              <button class="link-btn" id="pp-auth-switch">
                ${authMode === 'login' ? "New here? Create an account" : 'Already have an account? Log in'}
              </button>
            </div>
          </div>
          <p class="muted" style="text-align:center;">No email needed — just a username and a 4-digit PIN.</p>
        </div>
      </div>
    `;
    document.getElementById('pp-auth-submit').onclick = handleAuthSubmit;
    document.getElementById('pp-auth-switch').onclick = () => {
      authMode = authMode === 'login' ? 'signup' : 'login';
      authError = '';
      render();
    };
  }

  async function handleAuthSubmit() {
    const uname = (document.getElementById('pp-uname').value || '').trim().toLowerCase();
    const pin = (document.getElementById('pp-pin').value || '').trim();
    authError = '';

    if (!uname || !pin) { authError = 'Please fill in both fields.'; return render(); }
    if (!/^\d{4}$/.test(pin)) { authError = 'PIN must be exactly 4 digits.'; return render(); }

    try {
      if (authMode === 'signup') {
        const dname = (document.getElementById('pp-dname').value || '').trim();
        if (!dname) { authError = 'Please enter your name.'; return render(); }
        const result = await api('/auth/signup', { method: 'POST', body: JSON.stringify({ username: uname, displayName: dname, pin }) });
        user = result.user;
        showToast(user.isAdmin ? "Welcome! You're the first user, so you're the Admin." : `Welcome, ${user.displayName}!`);
      } else {
        const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: uname, pin }) });
        user = result.user;
        showToast(`Welcome back, ${user.displayName}!`);
      }
    } catch (e) {
      if (e.status === 409) authError = 'That username is taken. Try another.';
      else if (e.status === 429) authError = 'Too many attempts — please wait a few minutes and try again.';
      else if (authMode === 'signup') authError = 'Could not create that account. Check your username and PIN.';
      else authError = 'Username or PIN not recognized.';
      return render();
    }
    activeTab = 'week';
    await loadAppData();
    render();
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
    user = null;
    authMode = 'login';
    render();
  }

  // ---------------- APP DATA ----------------
  async function loadAppData() {
    const [weeksRes, lbRes] = await Promise.all([
      api('/weeks'),
      api('/leaderboard'),
    ]);
    weeksData = weeksRes.weeks;
    leaderboardRows = lbRes.rows;
    if (!selectedWeekId || !weeksData.find((w) => w.id === selectedWeekId)) {
      selectedWeekId = weeksData.length ? weeksData[weeksData.length - 1].id : null;
    }
    if (user && user.isAdmin) {
      try {
        const usersRes = await api('/admin/users');
        adminUsers = usersRes.users;
      } catch (e) { adminUsers = []; }
    }
  }

  // ---------------- APP SHELL ----------------
  function renderApp() {
    app.innerHTML = `
      <div class="field-header">
        <div class="who">
          <div>
            <h1 class="display">Pigskin Picks</h1>
            <p>Hi, ${user.displayName}${user.isAdmin ? ' (Admin)' : ''}</p>
          </div>
          <button class="logout-btn" id="pp-logout">Log Out</button>
        </div>
      </div>
      <div class="tabs">
        <button class="tab-btn ${activeTab === 'week' ? 'active' : ''}" data-tab="week">This Week</button>
        <button class="tab-btn ${activeTab === 'board' ? 'active' : ''}" data-tab="board">Leaderboard</button>
        <button class="tab-btn ${activeTab === 'mine' ? 'active' : ''}" data-tab="mine">My Picks</button>
        <button class="tab-btn ${activeTab === 'others' ? 'active' : ''} " data-tab="others">Others Picks</button>
        ${user.isAdmin ? `<button class="tab-btn ${activeTab === 'admin' ? 'active' : ''}" data-tab="admin">Admin</button>` : ''}
      </div>
      <div id="pp-tab-content"></div>
    `;
    document.getElementById('pp-logout').onclick = logout;
    app.querySelectorAll('.tab-btn').forEach((b) => {
      b.onclick = () => { activeTab = b.dataset.tab; render(); };
    });

    const content = document.getElementById('pp-tab-content');
    if (activeTab === 'week') renderWeekTab(content);
    else if (activeTab === 'board') renderLeaderboardTab(content);
    else if (activeTab === 'mine') renderMyPicksTab(content);
    else if (activeTab === 'admin') renderAdminTab(content);
    else if (activeTab === 'others') renderOthersTab(content);
  }

  function resultLabel(g) {
    if (g.result === 'TEAM_A') return `${g.teamA} won`;
    if (g.result === 'TEAM_B') return `${g.teamB} won`;
    if (g.result === 'TIE') return 'Tie';
    return null;
  }

  // ---------------- THIS WEEK ----------------
function renderWeekTab(container) {
    if (!weeksData.length) {
      container.innerHTML = `<div class="card empty-state">No weeks have been posted yet. Check back soon!</div>`;
      return;
    }
    const week = weeksData.find((w) => w.id === selectedWeekId) || weeksData[weeksData.length - 1];

    let selectorHtml = '';
    if (weeksData.length > 1) {
      selectorHtml = `
        <div class="field-group">
          <label for="pp-week-select">Viewing:</label>
          <select id="pp-week-select">
            ${weeksData.map((w) => `<option value="${w.id}" ${w.id === week.id ? 'selected' : ''}>${w.label}</option>`).join('')}
          </select>
        </div>`;
    }

    container.innerHTML = `
      <div class="card">
        <h2>${week.label}</h2>
        ${selectorHtml}
        ${week.locked ? `<div class="lock-note">Picks are locked for this week. You can view your picks below.</div>` : `<p class="muted">Tap a team to pick the winner. Your pick saves right away.</p>`}
        <div id="pp-games"></div>
      </div>
    `;

    if (weeksData.length > 1) {
      document.getElementById('pp-week-select').onchange = (e) => {
        selectedWeekId = Number(e.target.value);
        renderWeekTab(container);
      };
    }

    const gamesEl = document.getElementById('pp-games');
    if (!week.games.length) {
      gamesEl.innerHTML = `<p class="muted">No games added yet for this week.</p>`;
      return;
    }
    gamesEl.innerHTML = week.games.map((g) => {
      let resultBadge = '';
      if (g.result) {
        if (!g.myPick) {
          resultBadge = `<span class="result-pill neg">\u22121 (no pick)</span>`;
        } else if (g.result === 'TIE') {
          const points = (g.myPick === 'TIE') ? 2 : 0;
          resultBadge = `<span class="result-pill ${points > 0 ? 'pos' : ''}">${points > 0 ? '+2' : '0'}</span>`;
        } else {
          const correct = g.myPick === g.result;
          resultBadge = `<span class="result-pill ${correct ? 'pos' : 'neg'}">${correct ? '+1' : '\u22121'}</span>`;
        }
      }
      return `
        <div class="game-card">
          <div class="game-meta">${g.kickoff || ''} ${resultBadge}</div>
          <div class="pick-row">
            <button class="pick-btn ${g.myPick === 'TEAM_A' ? 'selected' : ''}" data-game="${g.id}" data-pick="TEAM_A" ${(week.locked || g.result) ? 'disabled' : ''}>${logoImg(g.teamA, 44)}${g.teamA}</button>
            <button class="pick-btn ${g.myPick === 'TEAM_B' ? 'selected' : ''}" data-game="${g.id}" data-pick="TEAM_B" ${(week.locked || g.result) ? 'disabled' : ''}>${logoImg(g.teamB, 44)}${g.teamB}</button>
            <button class="tie-btn ${g.myPick === 'TIE' ? 'selected' : ''}" data-game="${g.id}" data-pick="TIE" ${(week.locked || g.result) ? 'disabled' : ''}>Tie</button>
          </div>
          ${g.result ? `<div class="game-meta" style="margin-top:8px;margin-bottom:0;">Final: ${resultLabel(g)}</div>` : ''}
        </div>
      `;
    }).join('');

    gamesEl.querySelectorAll('button[data-game]').forEach((btn) => {
      btn.onclick = async () => {
        try {
          await api('/picks', { method: 'POST', body: JSON.stringify({ gameId: Number(btn.dataset.game), pick: btn.dataset.pick }) });
          showToast('Pick saved!');
          await loadAppData();
          renderWeekTab(container);
        } catch (e) {
          if (e.status === 403) {
            showToast('This game is locked — results are already posted.');
            await loadAppData();
            renderWeekTab(container);
          } else {
            showToast('Could not save that pick. Please try again.');
          }
        }
      };
    });
  }

  // ---------------- LEADERBOARD ----------------
  function computeMovement(rows) {
  if (!rows.length || !rows[0].weekly.length) return {};
  let lastGradedIdx = -1;
  rows[0].weekly.forEach((w, j) => { if (w.played) lastGradedIdx = j; });
  if (lastGradedIdx === -1) return {}; // nothing graded yet

  function rankBy(totalFn) {
    const sorted = rows.slice().sort((a, b) => {
      const diff = totalFn(b) - totalFn(a);
      return diff !== 0 ? diff : a.displayName.localeCompare(b.displayName);
    });
    const ranks = {};
    sorted.forEach((r, i) => { ranks[r.username] = i + 1; });
    return ranks;
  }

  const previousRanks = rankBy((r) => r.weekly.slice(0, lastGradedIdx).reduce((sum, w) => sum + w.score, 0));
  const currentRanks = rankBy((r) => r.total);

  const movement = {};
  rows.forEach((r) => {
    movement[r.username] = previousRanks[r.username] - currentRanks[r.username];
  });
  return movement;
}

  function renderLeaderboardTab(container) {
    if (!leaderboardRows.length) {
      container.innerHTML = `<div class="card empty-state">No players yet.</div>`;
      return;
    }
    container.innerHTML = `
      <div class="card">
        <h2>Season Leaderboard</h2>
        <p class="muted" style="margin-top:-8px;">Tap a name to see their week-by-week points.</p>
        <div id="pp-lb-rows"></div>
      </div>
    `;
    const rowsEl = document.getElementById('pp-lb-rows');
const movement = computeMovement(leaderboardRows);
rowsEl.innerHTML = leaderboardRows
.filter(r => !r.isAdmin)
.map((r, idx) => {
  const detail = expandedUser === r.username ? renderWeeklyDetail(r) : '';
  const delta = movement[r.username] || 0;
  let moveBadge = '';
  if (delta > 0) moveBadge = `<span class="move-badge move-up">\u25B2${delta}</span>`;
  else if (delta < 0) moveBadge = `<span class="move-badge move-down">\u25BC${Math.abs(delta)}</span>`;
  return `
    <div>
      <div class="lb-row" data-user="${r.username}">
        <div class="lb-rank display lb-rank-${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : 'other'}">${idx + 1}</div>
        <div class="lb-name">${r.displayName}${r.username === user.username ? ' (you)' : ''} ${moveBadge}</div>
        <div class="lb-points display">${r.total}</div>
      </div>
      ${detail}
    </div>
  `;
}).join('');
    rowsEl.querySelectorAll('.lb-row').forEach((row) => {
      row.onclick = () => {
        const u = row.dataset.user;
        expandedUser = expandedUser === u ? null : u;
        renderLeaderboardTab(container);
      };
    });
  }

  function renderWeeklyDetail(row) {
    if (!row.weekly.length) return `<div class="lb-detail">No weeks yet.</div>`;
    const chips = row.weekly.map((w) => {
      if (!w.played) return `<span class="week-chip">${w.label}: \u2014</span>`;
      return `<span class="week-chip">${w.label}: ${w.score > 0 ? '+' + w.score : w.score}</span>`;
    }).join('');
    return `<div class="lb-detail">${chips}</div>`;
  }

  // ---------------- MY PICKS ----------------
  function renderMyPicksTab(container) {
    if (!weeksData.length) {
      container.innerHTML = `<div class="card empty-state">No weeks yet.</div>`;
      return;
    }
    const myRow = leaderboardRows.find((r) => r.username === user.username);
    const weeklyByWeekId = {};
    (myRow ? myRow.weekly : []).forEach((w) => { weeklyByWeekId[w.weekId] = w; });

    container.innerHTML = `<div class="card"><h2>My Picks History</h2>${
      weeksData.map((week) => {
        const wStat = weeklyByWeekId[week.id];
        const gamesHtml = week.games.map((g) => {
          const pickText = g.myPick ? (g.myPick === 'TIE' ? 'Tie' : (g.myPick === 'TEAM_A' ? g.teamA : g.teamB)) : '\u2014';
          return `<div class="muted" style="margin-bottom:4px; display:flex; align-items:center; gap:6px;">
            <img src="/logos/${TEAM_BY_NAME[g.teamA] ? TEAM_BY_NAME[g.teamA].slug : ''}.png" alt="" style="width:20px;height:20px;object-fit:contain;" />
            ${g.teamA} vs
            <img src="/logos/${TEAM_BY_NAME[g.teamB] ? TEAM_BY_NAME[g.teamB].slug : ''}.png" alt="" style="width:20px;height:20px;object-fit:contain;" />
            ${g.teamB}: <strong>${pickText}</strong>${g.result ? ` (Final: ${resultLabel(g)})` : ''}
          </div>`;
        }).join('');
        return `
          <div style="margin-bottom:18px;">
            <div style="display:flex; justify-content:space-between; align-items:baseline;">
              <strong>${week.label}</strong>
              <span class="muted">${wStat && wStat.played ? (wStat.score > 0 ? '+' + wStat.score : wStat.score) + ' pts' : 'not graded yet'}</span>
            </div>
            ${gamesHtml || '<div class="muted">No games.</div>'}
          </div>
        `;
      }).join('<hr class="divider"/>')
    }</div>`;
  }

  async function loadOthersPicks(weekId) {
  othersError = null;
  othersData = null;
  try {
    othersData = await api(`/weeks/${weekId}/all-picks`);
  } catch (e) {
    othersError = (e.status === 403 && e.body && e.body.error === 'PICKS_HIDDEN') ? 'HIDDEN' : 'ERROR';
  }
}

function renderOthersTab(container) {
  if (!weeksData.length) {
    container.innerHTML = `<div class="card empty-state">No weeks have been posted yet.</div>`;
    return;
  }
  if (!othersSelectedWeekId || !weeksData.find((w) => w.id === othersSelectedWeekId)) {
    othersSelectedWeekId = weeksData[weeksData.length - 1].id;
  }

  let selectorHtml = '';
  if (weeksData.length > 1) {
    selectorHtml = `
      <div class="field-group">
        <label for="pp-others-week-select">Viewing:</label>
        <select id="pp-others-week-select">
          ${weeksData.map((w) => `<option value="${w.id}" ${w.id === othersSelectedWeekId ? 'selected' : ''}>${w.label}</option>`).join('')}
        </select>
      </div>`;
  }

  container.innerHTML = `
    <div class="card others-card">
      <h2>Others' Picks</h2>
      ${selectorHtml}
      <div id="pp-others-content"><p class="muted">Loading\u2026</p></div>
    </div>
  `;

  if (weeksData.length > 1) {
    document.getElementById('pp-others-week-select').onchange = async (e) => {
      othersSelectedWeekId = Number(e.target.value);
      await loadOthersPicks(othersSelectedWeekId);
      renderOthersContent();
    };
  }

  loadOthersPicks(othersSelectedWeekId).then(renderOthersContent);
}

function renderOthersContent() {
  const el = document.getElementById('pp-others-content');
  if (!el) return;
  if (othersError === 'HIDDEN') {
    el.innerHTML = `<p class="muted">The admin is keeping this week's picks under wraps for now \u2014 check back after they're released.</p>`;
    return;
  }
  if (othersError === 'ERROR' || !othersData) {
    el.innerHTML = `<p class="muted">Could not load picks for this week.</p>`;
    return;
  }
  const { players } = othersData;
  if (!players.length) {
    el.innerHTML = `<p class="muted">No players yet.</p>`;
    return;
  }
  const games = players[0].picks; // same games, same order, for every player
  if (!games.length) {
    el.innerHTML = `<p class="muted">No games this week.</p>`;
    return;
  }

  const palette = ['op1', 'op2', 'op3', 'op4', 'op5', 'op6'];

  function scoreFor(pk) {
    if (!pk.result) return null;
    if (!pk.pick) return -1;
    if (pk.result === 'TIE') return pk.pick === 'TIE' ? 2 : 0;
    return pk.pick === pk.result ? 1 : -1;
  }

  const headerCells = players.map((p, i) => {
    const cls = palette[i % palette.length];
    return `<th class="others-col ${cls}">${p.displayName}<br/>Prediction</th><th class="others-col ${cls} others-diff-col">+/-</th>`;
  }).join('');

  const bodyRows = games.map((g, gi) => {
    const cells = players.map((p, i) => {
      const cls = palette[i % palette.length];
      const pk = p.picks[gi];
      const pickText = pk.pick ? (pk.pick === 'TIE' ? 'Tie' : (pk.pick === 'TEAM_A' ? pk.teamA : pk.teamB)) : '\u2014';
      const points = scoreFor(pk);
      const badge = points === null ? '' : `<span class="${points > 0 ? 'diff-pos' : 'diff-neg'}">${points > 0 ? '+' + points : points}</span>`;
      return `<td class="others-col ${cls}">${pickText}</td><td class="others-col ${cls} others-diff-col">${badge}</td>`;
    }).join('');
    return `<tr><td class="others-team-cell">${g.teamA}</td><td class="others-team-cell">${g.teamB}</td>${cells}</tr>`;
  }).join('');

  const totalCells = players.map((p, i) => {
    const cls = palette[i % palette.length];
    let total = 0;
    let anyGraded = false;
    p.picks.forEach((pk) => {
      const points = scoreFor(pk);
      if (points === null) return;
      anyGraded = true;
      total += points;
    });
    const totalText = anyGraded ? (total > 0 ? '+' + total : total) : '\u2014';
    return `<td class="others-col ${cls}"></td><td class="others-col ${cls} others-diff-col"><strong>${totalText}</strong></td>`;
  }).join('');

  el.innerHTML = `
    <div class="others-table-wrap">
      <table class="others-table">
        <thead>
          <tr>
            <th>Away Team</th>
            <th>Home Team</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
          <tr class="others-total-row">
            <td colspan="2">Total This Week</td>
            ${totalCells}
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

  // ---------------- ADMIN ----------------
  function renderAdminTab(container) {
    container.innerHTML = `
      <div class="card">
        <h2>Create a New Week</h2>
        <div class="field-group">
          <label for="pp-week-label">Week Label</label>
          <input type="text" id="pp-week-label" placeholder="e.g. Week ${weeksData.length + 1}" value="Week ${weeksData.length + 1}" />
        </div>
        <div class="field-group">
          <label for="pp-week-lock">Picks Lock At (optional)</label>
          <input type="datetime-local" id="pp-week-lock" />
        </div>
        <div id="pp-admin-games"></div>
        <button class="add-game-btn" id="pp-add-game">+ Add a Game</button>
        <hr class="divider" />
        <button class="big-btn" id="pp-create-week">Post This Week</button>
      </div>
      <div class="card">
        <h2>Enter Results</h2>
        <p class="muted" style="margin-top:-8px;">Posting any result for a week locks picks for the whole week — no more changes for anyone.</p>
        <div id="pp-admin-results"></div>
      </div>
      <div class="card">
        <h2>Reset a Player's PIN</h2>
        <div id="pp-admin-users"></div>
      </div>
    `;

    function renderDraftGames(){
      const el = document.getElementById('pp-admin-games');
      el.innerHTML = adminDraftGames.map((g, i) => `
        <div class="admin-game-row">
          <select data-i="${i}" data-f="teamA">${teamOptionsHtml(g.teamA)}</select>
          <span class="muted">vs</span>
          <select data-i="${i}" data-f="teamB">${teamOptionsHtml(g.teamB)}</select>
          <input type="text" placeholder="Kickoff (e.g. Sun 1pm)" value="${g.kickoff}" data-i="${i}" data-f="kickoff" style="max-width:150px;" />
          <button class="remove-x" data-remove="${i}" title="Remove game">\u2715</button>
        </div>
      `).join('') || `<p class="muted">No games added yet.</p>`;
      el.querySelectorAll('select, input').forEach((inp) => {
        const evt = inp.tagName === 'SELECT' ? 'onchange' : 'oninput';
        inp[evt] = () => { adminDraftGames[+inp.dataset.i][inp.dataset.f] = inp.value; };
      });
      el.querySelectorAll('[data-remove]').forEach((btn) => {
        btn.onclick = () => { adminDraftGames.splice(+btn.dataset.remove, 1); renderDraftGames(); };
      });
    }
    if (!adminDraftGames.length) adminDraftGames.push({ teamA: '', teamB: '', kickoff: '' });
    renderDraftGames();

    document.getElementById('pp-add-game').onclick = () => {
      adminDraftGames.push({ teamA: '', teamB: '', kickoff: '' });
      renderDraftGames();
    };

    document.getElementById('pp-create-week').onclick = async () => {
      const label = document.getElementById('pp-week-label').value.trim() || `Week ${weeksData.length + 1}`;
      const lockTimeRaw = document.getElementById('pp-week-lock').value || null;
      const validGames = adminDraftGames.filter((g) => g.teamA.trim() && g.teamB.trim());
      if (!validGames.length) { showToast('Add at least one game with both teams.'); return; }
      try {
        await api('/weeks', { method: 'POST', body: JSON.stringify({ label, lockTime: lockTimeRaw, games: validGames }) });
        adminDraftGames = [{ teamA: '', teamB: '', kickoff: '' }];
        showToast('Week posted!');
        await loadAppData();
        renderAdminTab(container);
      } catch (e) {
        showToast('Could not post that week. Check the game details and try again.');
      }
    };

    const resultsEl = document.getElementById('pp-admin-results');
    if (!weeksData.length) {
      resultsEl.innerHTML = `<p class="muted">No weeks posted yet.</p>`;
    } else {
      resultsEl.innerHTML = weeksData.slice().reverse().map((week) => `
         <div style="margin-bottom:16px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <strong>${week.label}</strong>
      <button class="result-btn" data-toggle-visibility="${week.id}" data-hidden="${week.picksHidden}">
        ${week.picksHidden ? 'Release Picks to Everyone' : 'Hide Picks From Everyone'}
      </button>
    </div>
          ${week.games.map((g) => `
            <div class="game-card">
              <div class="game-meta" style="display:flex; align-items:center; gap:6px;">
                <img src="/logos/${TEAM_BY_NAME[g.teamA] ? TEAM_BY_NAME[g.teamA].slug : ''}.png" alt="" style="width:22px;height:22px;object-fit:contain;" />
                ${g.teamA} vs
                <img src="/logos/${TEAM_BY_NAME[g.teamB] ? TEAM_BY_NAME[g.teamB].slug : ''}.png" alt="" style="width:22px;height:22px;object-fit:contain;" />
                ${g.teamB} ${g.kickoff ? ('\u00b7 ' + g.kickoff) : ''}
              </div>
              <div class="result-btns">
                <button class="result-btn ${g.result === 'TEAM_A' ? 'selected' : ''}" data-w="${week.id}" data-g="${g.id}" data-r="TEAM_A">${g.teamA} won</button>
                <button class="result-btn ${g.result === 'TEAM_B' ? 'selected' : ''}" data-w="${week.id}" data-g="${g.id}" data-r="TEAM_B">${g.teamB} won</button>
                <button class="result-btn ${g.result === 'TIE' ? 'selected' : ''}" data-w="${week.id}" data-g="${g.id}" data-r="TIE">Tie</button>
                ${g.result ? `<button class="result-btn" data-w="${week.id}" data-g="${g.id}" data-r="">Clear</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `).join('<hr class="divider"/>');

      resultsEl.querySelectorAll('.result-btn').forEach((btn) => {
        btn.onclick = async () => {
          const gid = btn.dataset.g;
          const r = btn.dataset.r || null;
          try {
            await api(`/weeks/games/${gid}/result`, { method: 'POST', body: JSON.stringify({ result: r }) });
            showToast(r ? 'Result saved — points updated!' : 'Result cleared.');
            await loadAppData();
            renderAdminTab(container);
          } catch (e) {
            showToast('Could not save that result.');
          }
        };
      });

      resultsEl.querySelectorAll('[data-toggle-visibility]').forEach((btn) => {
  btn.onclick = async () => {
    const weekId = btn.dataset.toggleVisibility;
    const currentlyHidden = btn.dataset.hidden === 'true';
    try {
      await api(`/weeks/${weekId}/visibility`, { method: 'POST', body: JSON.stringify({ hidden: !currentlyHidden }) });
      showToast(currentlyHidden ? 'Picks released \u2014 everyone can see them now.' : 'Picks hidden for this week.');
      await loadAppData();
      renderAdminTab(container);
    } catch (e) {
      showToast('Could not update visibility for that week.');
    }
  };
});
    }

    const usersEl = document.getElementById('pp-admin-users');
    if (!adminUsers.length) {
      usersEl.innerHTML = `<p class="muted">No players yet.</p>`;
    } else {
      usersEl.innerHTML = adminUsers.map((u) => `
        <div class="admin-game-row">
          <span style="flex:1; font-weight:700;">${u.display_name} <span class="muted">(${u.username})</span></span>
          <input type="text" inputmode="numeric" maxlength="4" placeholder="New 4-digit PIN" data-reset="${u.id}" style="max-width:150px;" />
          <button class="result-btn" data-save-pin="${u.id}">Set PIN</button>
        </div>
      `).join('');
      usersEl.querySelectorAll('[data-save-pin]').forEach((btn) => {
        btn.onclick = async () => {
          const uid = btn.dataset.savePin;
          const inp = usersEl.querySelector(`[data-reset="${uid}"]`);
          const val = (inp.value || '').trim();
          if (!/^\d{4}$/.test(val)) { showToast('PIN must be 4 digits.'); return; }
          try {
            await api(`/admin/users/${uid}/reset-pin`, { method: 'POST', body: JSON.stringify({ pin: val }) });
            inp.value = '';
            showToast('PIN updated.');
          } catch (e) {
            showToast('Could not update that PIN.');
          }
        };
      });
    }
  }

  // ---------------- INIT ----------------
  async function init() {
    app.innerHTML = `<div class="empty-state">Loading\u2026</div>`;
    try {
      const status = await api('/gate/status');
      gatePassed = !!status.passed;
    } catch (e) { gatePassed = false; }

    if (gatePassed) {
      await afterGate();
      if (user) await loadAppData();
    }
    render();
  }
  init();
})();
