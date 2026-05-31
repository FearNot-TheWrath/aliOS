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
  socket.on('phase', ({ phase }) => { state.phase = phase; applyPhase(); render(); });
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
    <div style="text-align:center;margin-top:14px;color:var(--muted)">Good morning, ${state.character.name}</div>
    <div class="grid">${tiles}</div>
  </div>`;
}

window._home = () => { state.view = 'home'; render(); };
window._open = (key) => { state.view = key; render(); };
window._back = () => { state.view = 'home'; render(); };

function renderApp(key) {
  root.innerHTML = `<div class="screen">
    <span class="backbar" onclick="window._back()">‹ Home</span>
    <h2>${key}</h2><p style="color:var(--muted)">Coming up next task.</p>
  </div>`;
}

boot();
