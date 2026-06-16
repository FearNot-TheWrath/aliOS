// tests/api-auth.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

test('roster lists characters without exposing pins', async () => {
  const { base, close } = await startTestServer();
  const res = await fetch(`${base}/api/roster`);
  const body = await res.json();
  assert.ok(Array.isArray(body.characters));
  assert.ok(body.characters.length >= 1);
  assert.strictEqual(body.characters[0].pin, undefined);
  await close();
});

test('player login sets a cookie with correct pin', async () => {
  const { base, close, server } = await startTestServer();
  const db = server._aliosDb;
  const c = db.prepare('SELECT * FROM characters ORDER BY sort_order LIMIT 1').get();
  const res = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ characterId: c.id, pin: c.pin }),
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('set-cookie') || '', /alios_session=/);
  await close();
});

test('player login rejects wrong pin', async () => {
  const { base, close, server } = await startTestServer();
  const db = server._aliosDb;
  const c = db.prepare('SELECT * FROM characters ORDER BY sort_order LIMIT 1').get();
  const res = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ characterId: c.id, pin: '0000' }),
  });
  assert.strictEqual(res.status, 401);
  await close();
});
