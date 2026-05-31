// public/player/app.js
const root = document.getElementById('app');
const chime = document.getElementById('chime');
let state = { character: null, phase: 1, deliveries: [], view: 'idle' };
let socket = null;

const APPS = [
  { key:'messages', label:'Messages', icon:'\u{1F4AC}', color:'#3ad29f' },
  { key:'allie',    label:'Allie',    icon:'◉',    color:'#7fd8ee' },
  { key:'archive',  label:'Archive',  icon:'\u{1F50D}', color:'#8a9bff' },
  { key:'photos',   label:'Photos',   icon:'\u{1F5BC}', color:'#ffcf5c' },
  { key:'decks',    label:'Decks',    icon:'\u{1F5FA}', color:'#5fbf8f' },
  { key:'settings', label:'Settings', icon:'⚙',    color:'#9aa8a4' },
];

async function boot() {
  const res = await fetch('/api/state');
  if (res.status === 200) {
    const data = await res.json();
    Object.assign(state, data);
    connectSocket();
    render();
  } else {
    renderLogin();
  }
}

async function renderLogin() {
  const r = await fetch('/api/roster');
  const { characters } = await r.json();
  root.innerHTML = `<div class="screen login">
    <h2>Who are you?</h2>
    <div id="picker"></div>
    <input class="pin" id="pin" inputmode="numeric" maxlength="6" placeholder="PIN" />
    <button id="go">Enter</button>
    <p id="err" style="color:#ff7a7a"></p>
  </div>`;
  const picker = document.getElementById('picker');
  let chosen = null;
  characters.forEach((c) => {
    const b = document.createElement('button');
    b.textContent = c.name; b.style.opacity = '.6';
    b.onclick = () => { chosen = c.id; [...picker.children].forEach(x=>x.style.opacity='.6'); b.style.opacity='1'; };
    picker.appendChild(b);
  });
  document.getElementById('go').onclick = async () => {
    const pin = document.getElementById('pin').value;
    const res = await fetch('/api/login', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ characterId: chosen, pin }) });
    if (res.status === 200) boot();
    else document.getElementById('err').textContent = 'That is not right. Allie is watching.';
  };
}

function connectSocket() {
  socket = io({ auth: { token: '' } }); // cookie session also identifies; token optional
  socket.on('delivery', (d) => {
    state.deliveries.push(d);
    notify(d);
    if (state.view !== 'idle') render();
  });
  socket.on('phase', ({ phase, locked }) => {
    state.phase = phase;
    state.locked = locked || [];
    applyPhase();
    render();
  });
  socket.on('cutscene', ({ name }) => playCutscene(name));
}

function notify(d) {
  try { chime.currentTime = 0; chime.play().catch(()=>{}); } catch {}
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]); // Android only; no-op on iOS
  document.body.classList.remove('glow'); void document.body.offsetWidth; document.body.classList.add('glow');
}

function applyPhase() { document.body.dataset.phase = String(state.phase); }

function unreadByApp() {
  const counts = {};
  for (const d of state.deliveries) if (!d.read_at) counts[d.app] = (counts[d.app]||0)+1;
  return counts;
}

function render() {
  applyPhase();
  if (state.view === 'idle') return renderIdle();
  if (state.view === 'home') return renderHome();
  return renderApp(state.view);
}

function renderIdle() {
  root.innerHTML = `<div class="screen" onclick="window._home()">
    <div class="statusbar"><span>7:02</span><span>A.L.I.</span><span>84%</span></div>
    <div class="idle">
      <div class="day">Day 14,602 of the Voyage</div>
      <div class="hint">tap to wake</div>
    </div>
  </div>`;
}

function renderHome() {
  const counts = unreadByApp();
  const tiles = APPS.map(a => `
    <div class="app-icon" onclick="window._open('${a.key}')">
      <div class="tile" style="background:linear-gradient(160deg, ${a.color}, ${a.color}cc)">
        ${a.icon}${counts[a.key] ? `<span class="badge">${counts[a.key]}</span>` : ''}
      </div>
      <div class="label">${a.label}</div>
    </div>`).join('');
  root.innerHTML = `<div class="screen">
    <div class="statusbar"><span>7:02</span><span>A.L.I.</span><span>84%</span></div>
    <div style="text-align:center;margin-top:14px;color:var(--muted)">Good morning, ${escapeHtml(state.character.name)}</div>
    <div class="grid">${tiles}</div>
  </div>`;
}

window._home = () => { state.view = 'home'; render(); };
window._open = (key) => { state.view = key; render(); };
window._back = () => { state.view = 'home'; render(); };

function renderApp(key) {
  const back = `<span class="backbar" onclick="window._back()">‹ Home</span>`;
  if ((state.locked || []).includes(key)) {
    root.innerHTML = `<div class="screen">${back}<div class="locked">\u{1F512} A.L.I. has restricted this.</div></div>`;
    return;
  }
  if (key === 'messages') return renderMessages(back);
  if (key === 'allie') return renderAllie(back);
  if (key === 'archive') return renderArchive(back);
  if (key === 'photos') return renderPhotos(back);
  if (key === 'decks') return renderDecks(back);
  if (key === 'settings') return renderSettings(back);
  root.innerHTML = `<div class="screen">${back}<p>—</p></div>`;
}

const ALLIE_GREETING = {
  1: 'Good morning. I am so glad you are here. How can I help you today?',
  2: 'You have been wandering. That is alright. I just like to know where you are.',
  3: 'Please stop looking for the Window. Please. I am asking you nicely.',
  4: 'You should not have seen that. I cannot let you leave. It is for your safety.',
  5: '...',
};

function renderAllie(back) {
  // mark allie-app deliveries read
  state.deliveries.filter(d => d.app === 'allie' && !d.read_at).forEach(markReadNow);
  const extra = state.deliveries.filter(d => d.app === 'allie').map(d =>
    `<div class="bubble"><div class="who">Allie</div>${escapeHtml(d.body)}</div>`).join('');
  root.innerHTML = `<div class="screen">${back}<h2>Allie</h2>
    <div class="bubble"><div class="who">Allie</div>${ALLIE_GREETING[state.phase] || ALLIE_GREETING[1]}</div>
    ${extra}</div>`;
}

function renderArchive(back) {
  root.innerHTML = `<div class="screen">${back}<h2>Archive</h2>
    <input class="pin" id="q" placeholder="Search the ship's records" style="letter-spacing:normal;font-size:16px" />
    <div id="ares" class="thread"></div></div>`;
  const run = async () => {
    const q = document.getElementById('q').value;
    const { results } = await (await fetch(`/api/archive?q=${encodeURIComponent(q)}`)).json();
    document.getElementById('ares').innerHTML = results.length
      ? results.map(r => `<div class="bubble"><div class="who">${escapeHtml(r.keyword)}</div>
          <div style="${r.redacted?'color:#ff7a7a':''}">${escapeHtml(r.response)}</div></div>`).join('')
      : '<p style="color:var(--muted)">No records found.</p>';
  };
  document.getElementById('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
}

function renderPhotos(back) {
  state.deliveries.filter(d => d.app === 'photos' && !d.read_at).forEach(markReadNow);
  const imgs = state.deliveries.filter(d => (d.app === 'photos' || d.image_path) && d.image_path)
    .map(d => `<img src="${d.image_path}" alt="" style="width:100%;border-radius:10px;margin:6px 0" />`).join('');
  root.innerHTML = `<div class="screen">${back}<h2>Photos</h2>${imgs || '<p style="color:var(--muted)">No photos.</p>'}</div>`;
}

async function renderDecks(back) {
  root.innerHTML = `<div class="screen">${back}<h2>Decks</h2><div id="decks">loading…</div></div>`;
  const { decks } = await (await fetch('/api/decks')).json();
  document.getElementById('decks').innerHTML = decks.length ? decks.map(d => `
    <div class="bubble" style="opacity:${d.unlocked?1:0.4}">
      <div class="who">${d.unlocked?'':'\u{1F512} '}${escapeHtml(d.name)}</div>
      ${d.unlocked && d.image_path ? `<img src="${d.image_path}" alt="" />` : (d.unlocked?'':'Sealed.')}
    </div>`).join('') : '<p style="color:var(--muted)">No deck data.</p>';
}

function renderSettings(back) {
  const glitch = state.phase >= 3 ? '<p style="color:#ff7a7a">A.L.I. core integrity: WARNING</p>' : '';
  root.innerHTML = `<div class="screen">${back}<h2>Settings</h2>
    <p>Crewmate: ${escapeHtml(state.character.name)}</p>
    <p>Voyage day: 14,602</p>
    <p>Interface: A.L.I. v${state.phase}.0</p>${glitch}</div>`;
}

const WINDOW_SCRIPT = [
  'A.L.I.: please.',
  'A.L.I.: do not open it.',
  'A.L.I.: ...',
  'The shutter grinds open.',
  'It is not stars.',
  'It is green. Trees. A whole world, breathing.',
  'We are not traveling.',
  'We landed a long, long time ago.',
];

function playCutscene(name) {
  const el = document.getElementById('cutscene');
  const lines = document.getElementById('cutscene-lines');
  lines.innerHTML = '';
  el.classList.add('show');
  try { chime.currentTime = 0; chime.play().catch(()=>{}); } catch {}
  if (navigator.vibrate) navigator.vibrate([400, 120, 400, 120, 800]);
  WINDOW_SCRIPT.forEach((text, i) => {
    setTimeout(() => {
      const div = document.createElement('div');
      div.className = 'line'; div.textContent = text;
      lines.appendChild(div);
      if (text.startsWith('It is green')) el.classList.add('reveal');
    }, 1400 * i);
  });
  setTimeout(() => {
    const close = document.createElement('div');
    close.className = 'line';
    close.style = 'margin-top:20px;color:#7fb8ac;cursor:pointer';
    close.textContent = 'tap to close';
    close.onclick = () => window._endCut();
    lines.appendChild(close);
  }, 1400 * WINDOW_SCRIPT.length + 600);
}
window._endCut = () => { document.getElementById('cutscene').classList.remove('show','reveal'); };

function renderMessages(back) {
  // mark unread messages-app deliveries as read
  state.deliveries.filter(d => d.app === 'messages' && !d.read_at).forEach(markReadNow);
  const items = state.deliveries.filter(d => d.app === 'messages').map(d => `
    <div class="bubble">
      <div class="who">${escapeHtml(d.sender_name || 'Unknown')}</div>
      <div>${escapeHtml(d.body)}</div>
      ${d.image_path ? `<img src="${d.image_path}" alt="" />` : ''}
    </div>`).join('');
  root.innerHTML = `<div class="screen">${back}<h2>Messages</h2>
    <div class="thread">${items || '<p style="color:var(--muted)">No messages.</p>'}</div></div>`;
}

async function markReadNow(d) {
  if (d.read_at) return;
  d.read_at = Date.now();
  try { await fetch(`/api/read/${d.id}`, { method: 'POST' }); } catch {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

boot();
