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

let _deckEdit = { deckId: null, mode: 'party', phase: 1 };

async function renderDecksEditor() {
  const main = document.getElementById('main'); if (!main) return;
  const nav = `<div class="row">
      <button onclick="window._view('send')">Send</button>
      <button onclick="window._view('archive')">Archive</button>
      <button onclick="window._view('decks')">Decks</button></div>`;
  const { decks } = await (await fetch('/api/console/decks')).json();
  const phaseResp = await (await fetch('/api/console/phase')).json();
  _deckEdit.phase = phaseResp.phase;
  if (_deckEdit.deckId == null && decks[0]) _deckEdit.deckId = decks[0].id;
  const deck = decks.find((d) => d.id === _deckEdit.deckId) || decks[0];

  const deckTabs = decks.map((d) =>
    `<button class="${d.id===_deckEdit.deckId?'cur':''}" onclick="window._deckPick(${d.id})">${escapeHtml(d.name)}${d.unlocked?'':' \u{1F512}'}</button>`).join(' ');

  const U = deck ? unreliabilityClient(_deckEdit.phase, deck.sort_order) : 0;
  const map = deck && deck.map_json ? JSON.parse(deck.map_json) : null;
  const inner = (map && window.Schematic) ? window.Schematic.schematicSvg(map) : '';

  main.innerHTML = `${nav}
    <h3>Decks</h3>
    <div class="row"><input id="dn" placeholder="new deck name"/><button class="primary" onclick="window._addDeck()">Add</button></div>
    <div class="phasebar">${deckTabs}</div>
    <div class="row" style="margin-top:8px">
      <strong>${deck?escapeHtml(deck.name):'—'}</strong>
      <button onclick="window._unlock(${deck?deck.id:0}, ${deck&&deck.unlocked?0:1})">${deck&&deck.unlocked?'seal':'unlock'}</button>
      <span style="color:#8fb3aa">players see unreliability ${Math.round(U*100)}%</span>
    </div>
    <div class="row">
      <button class="${_deckEdit.mode==='party'?'cur':''}" onclick="window._deckMode('party')">Place party</button>
      <button class="${_deckEdit.mode==='poi'?'cur':''}" onclick="window._deckMode('poi')">Drop POI</button>
    </div>
    <svg id="deckmap" viewBox="0 0 1000 1000" style="width:100%;max-width:420px;background:#0c1f1c;border:1px solid #214039;border-radius:10px;cursor:crosshair" onclick="window._deckMapClick(event)">
      ${inner}<g id="dm-overlay"></g>
    </svg>
    <h4>Points of interest (truth shown to you)</h4>
    <div id="deckpins"></div>`;
  renderDeckOverlay();
}

// the console computes U with the same formula as the server (small mirror)
function unreliabilityClient(phase, depth) {
  const p = Math.max(1, Math.min(5, phase)), d = Math.max(1, depth);
  const u = 0.6 * ((p - 1) / 4) + 0.4 * ((d - 1) / 5);
  return Math.max(0, Math.min(1, u));
}

async function renderDeckOverlay() {
  if (_deckEdit.deckId == null) return;
  const { pins } = await (await fetch(`/api/console/pins?deckId=${_deckEdit.deckId}`)).json();
  const overlay = document.getElementById('dm-overlay');
  if (overlay) {
    overlay.innerHTML = pins.map((p) => {
      const color = p.state === 'hidden' ? '#6e4a57' : p.state === 'lie' ? '#b85a6a' : '#7a8cff';
      const label = p.truth_label || p.lie_label || '';
      return `<g style="cursor:pointer" onclick="event.stopPropagation();window._flipPin(${p.id})">
        <circle cx="${p.x*1000}" cy="${p.y*1000}" r="13" fill="${color}"/>
        <text x="${p.x*1000}" y="${p.y*1000+34}" fill="#cfe8e2" font-size="22" text-anchor="middle">${escapeHtml(label)} [${p.state}]</text></g>`;
    }).join('');
  }
  const listEl = document.getElementById('deckpins');
  if (listEl) {
    listEl.innerHTML = pins.map((p) => `<div class="lib-item">
      <strong>${escapeHtml(p.truth_label || '(decoy)')}</strong> -> lie: ${escapeHtml(p.lie_label || '—')}
      ${p.phase_gate?`(auto-lies at P${p.phase_gate})`:''} [${p.state}]
      <button onclick="window._flipPin(${p.id})">flip</button>
      <button onclick="window._delPin(${p.id})">delete</button>
    </div>`).join('') || '<p style="color:#8fb3aa">No points yet.</p>';
  }
}

window._deckPick = (id) => { _deckEdit.deckId = id; renderDecksEditor(); };
window._deckMode = (m) => { _deckEdit.mode = m; renderDecksEditor(); };

window._deckMapClick = async (ev) => {
  const svg = document.getElementById('deckmap');
  const rect = svg.getBoundingClientRect();
  const x = (ev.clientX - rect.left) / rect.width;
  const y = (ev.clientY - rect.top) / rect.height;
  if (_deckEdit.mode === 'party') {
    await fetch('/api/console/party', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ deckId: _deckEdit.deckId, x, y }) });
  } else {
    const truth = prompt('True label for this point (blank = decoy):') || '';
    const lie = prompt('What does Allie show instead (the lie)? (blank = none):') || '';
    const gateRaw = prompt('Auto-lie starting at which phase? (1-5, blank = manual only):') || '';
    const phaseGate = gateRaw ? Math.max(1, Math.min(5, Number(gateRaw))) : null;
    await fetch('/api/console/pins', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ deckId: _deckEdit.deckId, x, y, truthLabel: truth || null, lieLabel: lie || null, phaseGate, poiType: 'generic' }) });
  }
  renderDeckOverlay();
};

window._flipPin = async (id) => {
  await fetch(`/api/console/pins/${id}/flip`, { method:'POST' });
  renderDeckOverlay();
};
window._delPin = async (id) => {
  await fetch(`/api/console/pins/${id}`, { method:'DELETE' });
  renderDeckOverlay();
};
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
