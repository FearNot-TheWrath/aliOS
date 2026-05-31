// tests/api-console.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

async function consoleLogin(base) {
  const res = await fetch(`${base}/api/console/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin: '1234' }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

test('console can send a free-type delivery to a character', async () => {
  const { base, close, db } = await startTestServer();
  const cookie = await consoleLogin(base);
  const allie = db.prepare('SELECT id FROM senders WHERE is_allie = 1').get();
  const res = await fetch(`${base}/api/console/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ characterId: 1, senderId: allie.id, app: 'messages', body: 'Hello crew' }),
  });
  assert.strictEqual(res.status, 200);
  const out = await res.json();
  assert.ok(out.delivery.id);
  assert.strictEqual(out.delivery.body, 'Hello crew');
  await close();
});

test('console send requires auth', async () => {
  const { base, close } = await startTestServer();
  const res = await fetch(`${base}/api/console/send`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ characterId: 1, senderId: 1, body: 'x' }),
  });
  assert.strictEqual(res.status, 401);
  await close();
});
