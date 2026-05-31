// tests/api-library.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

async function consoleCookie(base) {
  const r = await fetch(`${base}/api/console/login`, { method:'POST',
    headers:{'content-type':'application/json'}, body: JSON.stringify({ pin:'1234' }) });
  return r.headers.get('set-cookie').split(';')[0];
}

test('library create then list', async () => {
  const { base, close, db } = await startTestServer();
  const cookie = await consoleCookie(base);
  const allie = db.prepare('SELECT id FROM senders WHERE is_allie=1').get();
  const c = await fetch(`${base}/api/console/messages`, { method:'POST',
    headers:{'content-type':'application/json', cookie},
    body: JSON.stringify({ senderId: allie.id, app:'messages', body:'Stay on the lit decks.', label:'warning' }) });
  assert.strictEqual(c.status, 200);
  const list = await (await fetch(`${base}/api/console/messages`, { headers:{cookie} })).json();
  assert.strictEqual(list.messages.length, 1);
  assert.strictEqual(list.messages[0].body, 'Stay on the lit decks.');
  await close();
});
