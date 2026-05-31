// public/console/console.js
const root = document.getElementById('app');
let s = { characters: [], senders: [], selected: null, socket: null };

async function boot() {
  const r = await fetch('/api/console/roster');
  if (r.status !== 200) return renderLogin();
  s.characters = (await r.json()).characters;
  s.senders = (await (await fetch('/api/console/senders')).json()).senders;
  s.selected = s.characters[0] ? s.characters[0].id : null;
  connect();
  render();
}

function renderLogin() {
  root.innerHTML = `<div class="login"><h2>aliOS console</h2>
    <input id="pin" class="pin" placeholder="Parent PIN" />
    <button class="primary" id="go">Unlock</button><p id="e" style="color:#ff7a7a"></p></div>`;
  document.getElementById('go').onclick = async () => {
    const res = await fetch('/api/console/login', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ pin: document.getElementById('pin').value }) });
    if (res.status === 200) boot(); else document.getElementById('e').textContent = 'No.';
  };
}

function connect() {
  s.socket = io();
  s.socket.on('delivery:read', refreshRoster);
  s.socket.on('delivery:sent', refreshRoster);
}
async function refreshRoster() {
  s.characters = (await (await fetch('/api/console/roster')).json()).characters;
  renderSide();
}

function render() {
  root.innerHTML = `<div class="wrap"><div class="side" id="side"></div><div class="main" id="main"></div></div>`;
  renderSide(); renderMain();
}

function renderSide() {
  const side = document.getElementById('side'); if (!side) return;
  side.innerHTML = `<h3>Crew</h3>` + s.characters.map(c => `
    <div class="crew ${c.id===s.selected?'active':''}" onclick="window._sel(${c.id})">
      <div>${escapeHtml(c.name)} ${c.unread?`<span style="color:#ff9f43">(${c.unread})</span>`:''}
        ${c.lastRead===null?'':`<span class="dot ${c.lastRead?'read':'unread'}"></span>`}</div>
      <div class="meta">${c.lastBody?escapeHtml(c.lastBody).slice(0,40):'no messages yet'}</div>
    </div>`).join('');
}

function renderMain() {
  const main = document.getElementById('main'); if (!main) return;
  const senderOpts = s.senders.map(x => `<option value="${x.id}">${escapeHtml(x.name)}${x.is_allie?' (Allie)':''}</option>`).join('');
  main.innerHTML = `
    <div class="row">
      <button onclick="window._view('send')">Send</button>
      <button onclick="window._view('archive')">Archive</button>
      <button onclick="window._view('decks')">Decks</button>
    </div>
    <div class="phasebar" id="phasebar"></div>
    <h3>Send to ${escapeHtml(nameOf(s.selected))}</h3>
    <div class="row">
      <select id="sender">${senderOpts}</select>
      <select id="app">
        <option value="messages">Messages</option><option value="allie">Allie</option>
        <option value="archive">Archive</option><option value="photos">Photos</option>
      </select>
    </div>
    <div class="row"><textarea id="body" rows="3" style="flex:1" placeholder="Type a line..."></textarea></div>
    <div class="row"><input type="file" id="img" accept="image/*" /></div>
    <div class="row"><button class="primary" onclick="window._send()">Send</button></div>
    <h3>Library</h3><div id="lib"></div>`;
  renderPhasebar(); renderLibrary();
}

window._sel = (id) => { s.selected = id; renderSide(); renderMain(); };
window._send = async () => {
  const body = document.getElementById('body').value.trim();
  const fileEl = document.getElementById('img');
  let imagePath = null;
  if (fileEl && fileEl.files[0]) {
    const fd = new FormData(); fd.append('image', fileEl.files[0]);
    imagePath = (await (await fetch('/api/uploads', { method:'POST', body: fd })).json()).path;
  }
  if (!body && !imagePath) return;
  await fetch('/api/console/send', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ characterId: s.selected, senderId: Number(document.getElementById('sender').value),
      app: document.getElementById('app').value, body: body || ' ', imagePath }) });
  document.getElementById('body').value = ''; if (fileEl) fileEl.value = '';
};

function nameOf(id){ const c=s.characters.find(x=>x.id===id); return c?c.name:'—'; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// phasebar + library are filled in later tasks; define stubs so render works
async function renderPhasebar() {
  const el = document.getElementById('phasebar'); if (!el) return;
  const { phase } = await (await fetch('/api/console/phase')).json();
  el.innerHTML = '<span style="margin-right:8px;color:#8fb3aa">Phase</span>' +
    [1,2,3,4,5].map(p => `<button class="${p===phase?'cur':''}" onclick="window._setPhase(${p})">${p}</button>`).join('');
  el.innerHTML += ` <button style="background:#c9b25a;color:#04201b;margin-left:12px" onclick="window._cutscene('window')">▶ Window takeover</button>`;
}
window._cutscene = async (name) => {
  await fetch('/api/console/cutscene', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ name }) });
};
window._setPhase = async (p) => {
  await fetch('/api/console/phase', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ phase: p }) });
  renderPhasebar();
};
async function renderLibrary() {
  const el = document.getElementById('lib'); if (!el) return;
  const { messages } = await (await fetch('/api/console/messages')).json();
  el.innerHTML = `<div class="row">
      <button onclick="window._newLib()">+ New line</button>
    </div>` + messages.map(m => `
    <div class="lib-item" onclick="window._fire(${m.id})">
      <strong>${escapeHtml(m.sender_name)}</strong> <span style="color:#8fb3aa">[${m.app}${m.phase_gate?` · P${m.phase_gate}+`:''}]</span><br>
      ${escapeHtml(m.body)}
      <span style="float:right;color:#ff7a7a" onclick="event.stopPropagation();window._delLib(${m.id})">delete</span>
    </div>`).join('');
}

window._fire = async (messageId) => {
  await fetch('/api/console/send', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ characterId: s.selected, messageId }) });
};
window._delLib = async (id) => { await fetch(`/api/console/messages/${id}`, { method:'DELETE' }); renderLibrary(); };
window._newLib = async () => {
  const body = prompt('Line text:'); if (!body) return;
  const senderId = Number(document.getElementById('sender').value);
  const app = document.getElementById('app').value;
  await fetch('/api/console/messages', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ senderId, app, body }) });
  renderLibrary();
};

boot();

s.view = 'send';
window._view = (v) => { s.view = v; renderMain(); };

const _origRenderMain = renderMain;
renderMain = function () {
  if (s.view === 'archive') return renderArchiveEditor();
  if (s.view === 'decks') return renderDecksEditor();
  return _origRenderMain();
};

async function renderArchiveEditor() {
  const main = document.getElementById('main'); if (!main) return;
  const { entries } = await (await fetch('/api/console/archive')).json();
  main.innerHTML = `<div class="row">
      <button onclick="window._view('send')">Send</button>
      <button onclick="window._view('archive')">Archive</button>
      <button onclick="window._view('decks')">Decks</button></div>
    <h3>Archive entries</h3>
    <div class="row"><input id="ak" placeholder="keyword"/><input id="ar" placeholder="response" style="flex:1"/>
      <label><input type="checkbox" id="ax"/> redacted</label><button class="primary" onclick="window._addArchive()">Add</button></div>
    ${entries.map(e => `<div class="lib-item">
      <strong>${escapeHtml(e.keyword)}</strong> ${e.redacted?'<span style="color:#ff7a7a">[REDACTED]</span>':''}<br>
      ${escapeHtml(e.response)}
      <button onclick="window._toggleRedact(${e.id}, ${e.redacted?0:1})">${e.redacted?'unredact':'redact'}</button>
    </div>`).join('')}`;
}
window._addArchive = async () => {
  await fetch('/api/console/archive', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ keyword:document.getElementById('ak').value, response:document.getElementById('ar').value,
      redacted: document.getElementById('ax').checked ? 1 : 0 }) });
  renderArchiveEditor();
};
window._toggleRedact = async (id, redacted) => {
  await fetch(`/api/console/archive/${id}/redact`, { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ redacted }) });
  renderArchiveEditor();
};

async function renderDecksEditor() {
  const main = document.getElementById('main'); if (!main) return;
  const { decks } = await (await fetch('/api/console/decks')).json();
  main.innerHTML = `<div class="row">
      <button onclick="window._view('send')">Send</button>
      <button onclick="window._view('archive')">Archive</button>
      <button onclick="window._view('decks')">Decks</button></div>
    <h3>Decks</h3>
    <div class="row"><input id="dn" placeholder="deck name"/><button class="primary" onclick="window._addDeck()">Add</button></div>
    ${decks.map(d => `<div class="lib-item">${escapeHtml(d.name)}: ${d.unlocked?'unlocked':'sealed'}
      <button onclick="window._unlock(${d.id}, ${d.unlocked?0:1})">${d.unlocked?'seal':'unlock'}</button></div>`).join('')}`;
}
window._addDeck = async () => {
  await fetch('/api/console/decks', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ name: document.getElementById('dn').value }) });
  renderDecksEditor();
};
window._unlock = async (id, unlocked) => {
  await fetch(`/api/console/decks/${id}/unlock`, { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ unlocked }) });
  renderDecksEditor();
};
