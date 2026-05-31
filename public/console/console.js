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
      <div>${c.name} ${c.unread?`<span style="color:#ff9f43">(${c.unread})</span>`:''}
        ${c.lastRead===null?'':`<span class="dot ${c.lastRead?'read':'unread'}"></span>`}</div>
      <div class="meta">${c.lastBody?escapeHtml(c.lastBody).slice(0,40):'no messages yet'}</div>
    </div>`).join('');
}

function renderMain() {
  const main = document.getElementById('main'); if (!main) return;
  const senderOpts = s.senders.map(x => `<option value="${x.id}">${x.name}${x.is_allie?' (Allie)':''}</option>`).join('');
  main.innerHTML = `
    <div class="phasebar" id="phasebar"></div>
    <h3>Send to ${nameOf(s.selected)}</h3>
    <div class="row">
      <select id="sender">${senderOpts}</select>
      <select id="app">
        <option value="messages">Messages</option><option value="allie">Allie</option>
        <option value="archive">Archive</option><option value="photos">Photos</option>
      </select>
    </div>
    <div class="row"><textarea id="body" rows="3" style="flex:1" placeholder="Type a line..."></textarea></div>
    <div class="row"><button class="primary" onclick="window._send()">Send</button></div>
    <h3>Library</h3><div id="lib"></div>`;
  renderPhasebar(); renderLibrary();
}

window._sel = (id) => { s.selected = id; renderSide(); renderMain(); };
window._send = async () => {
  const body = document.getElementById('body').value.trim(); if (!body) return;
  await fetch('/api/console/send', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ characterId: s.selected, senderId: Number(document.getElementById('sender').value),
      app: document.getElementById('app').value, body }) });
  document.getElementById('body').value = '';
};

function nameOf(id){ const c=s.characters.find(x=>x.id===id); return c?c.name:'—'; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// phasebar + library are filled in later tasks; define stubs so render works
function renderPhasebar(){ const el=document.getElementById('phasebar'); if(el) el.innerHTML=''; }
function renderLibrary(){ const el=document.getElementById('lib'); if(el) el.innerHTML='<p style="color:#8fb3aa">Library coming up.</p>'; }

boot();
