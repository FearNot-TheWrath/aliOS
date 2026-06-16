// public/chronicle/chronicle.js
const root = document.getElementById('entries');
const STORE = 'arkArchiveCodes'; // { entryId: code } the device has unlocked

function savedCodes() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; }
}
function rememberCode(id, code) {
  const c = savedCodes(); c[id] = code; localStorage.setItem(STORE, JSON.stringify(c));
}

async function boot() {
  const data = await (await fetch('/api/chronicle')).json();
  root.innerHTML = '';
  for (const e of data.entries) {
    if (e.visibility === 'player') {
      root.appendChild(openEntry(e.title, e.html));
    } else {
      root.appendChild(await redactedEntry(e));
    }
  }
  if (!data.entries.length) root.innerHTML = '<p class="sub">The Archive is empty.</p>';
}

function openEntry(title, html, wasUnlocked) {
  const div = document.createElement('div');
  div.className = 'entry';
  div.innerHTML = (wasUnlocked ? '<div class="unlocked-tag">clearance accepted</div>' : '')
    + (title ? `<h2>${escapeHtml(title)}</h2>` : '') + html;
  return div;
}

async function redactedEntry(e) {
  // if this device already has a working code, reveal it
  const code = savedCodes()[e.id];
  if (code) {
    const res = await fetch(`/api/chronicle/${encodeURIComponent(e.id)}/unlock`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }),
    });
    if (res.status === 200) {
      const r = await res.json();
      return openEntry(r.title, r.html, true);
    }
  }
  const div = document.createElement('div');
  div.className = 'entry redacted';
  div.innerHTML = `
    <div class="redbar">[ ENTRY <span class="blocks">REDACTED</span> ]</div>
    ${e.teaser ? `<div class="teaser">${escapeHtml(e.teaser)}</div>` : ''}
    <div class="codebox">
      <input maxlength="32" placeholder="clearance code" />
      <button>Decrypt</button>
    </div>
    <div class="err"></div>`;
  const input = div.querySelector('input');
  const btn = div.querySelector('button');
  const err = div.querySelector('.err');
  const submit = async () => {
    const tryCode = input.value.trim();
    if (!tryCode) return;
    const res = await fetch(`/api/chronicle/${encodeURIComponent(e.id)}/unlock`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: tryCode }),
    });
    if (res.status === 200) {
      const r = await res.json();
      rememberCode(e.id, tryCode);
      div.replaceWith(openEntry(r.title, r.html, true));
    } else {
      err.textContent = 'A.L.I.: I am sorry. That clearance is not recognized.';
    }
  };
  btn.onclick = submit;
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') submit(); });
  return div;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

boot();
