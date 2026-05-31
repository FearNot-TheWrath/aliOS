const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

async function playerLogin(base, db) {
  const c = db.prepare('SELECT * FROM characters ORDER BY sort_order LIMIT 1').get();
  const r = await fetch(`${base}/api/login`, { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ characterId: c.id, pin: c.pin }) });
  return r.headers.get('set-cookie').split(';')[0];
}
async function consoleCookie(base) {
  const r = await fetch(`${base}/api/console/login`, { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ pin:'1234' }) });
  return r.headers.get('set-cookie').split(';')[0];
}

test('player decks payload resolves pins and never leaks a hidden truth', async () => {
  const { base, close, db } = await startTestServer();
  const cc = await consoleCookie(base);
  const crown = db.prepare("SELECT id FROM decks WHERE name='Crown'").get();

  await fetch(`${base}/api/console/pins`, { method:'POST', headers:{'content-type':'application/json', cookie:cc},
    body: JSON.stringify({ deckId: crown.id, x:0.5, y:0.5, truthLabel:'Core route', lieLabel:'Life support', poiType:'core', phaseGate:3 }) });
  await fetch(`${base}/api/console/party`, { method:'POST', headers:{'content-type':'application/json', cookie:cc},
    body: JSON.stringify({ deckId: crown.id, x:0.4, y:0.4 }) });

  const pc = await playerLogin(base, db);
  let body = await (await fetch(`${base}/api/decks`, { headers:{cookie:pc} })).json();
  let crownOut = body.decks.find((d) => d.name === 'Crown');
  assert.strictEqual(crownOut.unlocked, true);
  assert.ok(crownOut.map && crownOut.map.shapes.length > 0);
  assert.strictEqual(crownOut.pins[0].label, 'Core route');
  assert.ok(crownOut.party, 'party present on its deck');

  await fetch(`${base}/api/console/phase`, { method:'POST', headers:{'content-type':'application/json', cookie:cc},
    body: JSON.stringify({ phase: 4 }) });
  body = await (await fetch(`${base}/api/decks`, { headers:{cookie:pc} })).json();
  crownOut = body.decks.find((d) => d.name === 'Crown');
  assert.strictEqual(crownOut.pins[0].label, 'Life support');
  assert.ok(!JSON.stringify(body).includes('Core route'), 'hidden truth never crosses the wire');

  const sealed = body.decks.find((d) => d.unlocked === false);
  assert.ok(sealed);
  assert.strictEqual(sealed.map, undefined);
  await close();
});
