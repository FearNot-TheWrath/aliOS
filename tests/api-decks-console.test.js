const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

async function consoleCookie(base) {
  const r = await fetch(`${base}/api/console/login`, { method:'POST',
    headers:{'content-type':'application/json'}, body: JSON.stringify({ pin:'1234' }) });
  return r.headers.get('set-cookie').split(';')[0];
}

test('console can create, list, flip, and delete pins, and set party', async () => {
  const { base, close, db } = await startTestServer();
  const cookie = await consoleCookie(base);
  const deck = db.prepare('SELECT id FROM decks ORDER BY sort_order LIMIT 1').get();

  const c = await fetch(`${base}/api/console/pins`, { method:'POST',
    headers:{'content-type':'application/json', cookie},
    body: JSON.stringify({ deckId: deck.id, x: 0.5, y: 0.4, truthLabel: 'Core route', lieLabel: 'Life support', poiType: 'core', phaseGate: 3 }) });
  assert.strictEqual(c.status, 200);
  const { id } = await c.json();

  const list = await (await fetch(`${base}/api/console/pins?deckId=${deck.id}`, { headers:{cookie} })).json();
  assert.strictEqual(list.pins.length, 1);
  assert.strictEqual(list.pins[0].truth_label, 'Core route');

  const f = await (await fetch(`${base}/api/console/pins/${id}/flip`, { method:'POST', headers:{cookie} })).json();
  assert.strictEqual(f.state, 'lie');

  const p = await fetch(`${base}/api/console/party`, { method:'POST',
    headers:{'content-type':'application/json', cookie}, body: JSON.stringify({ deckId: deck.id, x: 0.2, y: 0.3 }) });
  assert.strictEqual(p.status, 200);
  assert.strictEqual(db.prepare('SELECT party_deck_id FROM game_state WHERE id=1').get().party_deck_id, deck.id);

  await fetch(`${base}/api/console/pins/${id}`, { method:'DELETE', headers:{cookie} });
  const after = await (await fetch(`${base}/api/console/pins?deckId=${deck.id}`, { headers:{cookie} })).json();
  assert.strictEqual(after.pins.length, 0);
  await close();
});

test('console pin routes require parent auth', async () => {
  const { base, close } = await startTestServer();
  const r = await fetch(`${base}/api/console/pins?deckId=1`);
  assert.strictEqual(r.status, 401);
  await close();
});
