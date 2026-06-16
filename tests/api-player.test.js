// tests/api-player.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

async function playerLogin(base, db) {
  const c = db.prepare('SELECT * FROM characters ORDER BY sort_order LIMIT 1').get();
  const res = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ characterId: c.id, pin: c.pin }),
  });
  return { cookie: res.headers.get('set-cookie').split(';')[0], characterId: c.id };
}

test('player state returns deliveries and phase', async () => {
  const { base, close, db } = await startTestServer();
  const { cookie, characterId } = await playerLogin(base, db);
  const allie = db.prepare('SELECT id FROM senders WHERE is_allie = 1').get();
  db.prepare(`INSERT INTO deliveries (character_id, sender_id, app, body, phase_at_send, sent_at)
              VALUES (?, ?, 'messages', 'hi', 1, 10)`).run(characterId, allie.id);

  const res = await fetch(`${base}/api/state`, { headers: { cookie } });
  const body = await res.json();
  assert.strictEqual(body.phase, 1);
  assert.strictEqual(body.deliveries.length, 1);
  assert.strictEqual(body.character.id, characterId);
  await close();
});

test('player can mark a delivery read', async () => {
  const { base, close, db } = await startTestServer();
  const { cookie, characterId } = await playerLogin(base, db);
  const allie = db.prepare('SELECT id FROM senders WHERE is_allie = 1').get();
  const info = db.prepare(`INSERT INTO deliveries (character_id, sender_id, app, body, phase_at_send, sent_at)
              VALUES (?, ?, 'messages', 'hi', 1, 10)`).run(characterId, allie.id);
  const res = await fetch(`${base}/api/read/${info.lastInsertRowid}`, { method: 'POST', headers: { cookie } });
  assert.strictEqual(res.status, 200);
  const row = db.prepare('SELECT read_at FROM deliveries WHERE id = ?').get(info.lastInsertRowid);
  assert.ok(row.read_at);
  await close();
});
