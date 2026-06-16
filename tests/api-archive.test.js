// tests/api-archive.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

async function login(base, db) {
  const c = db.prepare('SELECT * FROM characters ORDER BY sort_order LIMIT 1').get();
  const r = await fetch(`${base}/api/login`, { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ characterId:c.id, pin:c.pin }) });
  return r.headers.get('set-cookie').split(';')[0];
}
async function consoleCookie(base) {
  const r = await fetch(`${base}/api/console/login`, { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ pin:'1234' }) });
  return r.headers.get('set-cookie').split(';')[0];
}

test('redacted archive entry returns ACCESS DENIED to players', async () => {
  const { base, close, db } = await startTestServer();
  const cc = await consoleCookie(base);
  await fetch(`${base}/api/console/archive`, { method:'POST', headers:{'content-type':'application/json', cookie:cc},
    body: JSON.stringify({ keyword:'Window', response:'A viewport to the stars.', redacted:1 }) });
  const pc = await login(base, db);
  const r = await (await fetch(`${base}/api/archive?q=window`, { headers:{cookie:pc} })).json();
  assert.strictEqual(r.results[0].redacted, true);
  assert.match(r.results[0].response, /ACCESS DENIED/i);
  await close();
});

test('non-redacted entry returns its content', async () => {
  const { base, close, db } = await startTestServer();
  const cc = await consoleCookie(base);
  await fetch(`${base}/api/console/archive`, { method:'POST', headers:{'content-type':'application/json', cookie:cc},
    body: JSON.stringify({ keyword:'Rec deck', response:'Skating ring, level 3.', redacted:0 }) });
  const pc = await login(base, db);
  const r = await (await fetch(`${base}/api/archive?q=rec`, { headers:{cookie:pc} })).json();
  assert.match(r.results[0].response, /Skating ring/);
  await close();
});
