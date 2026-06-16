// tests/api-uploads.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

async function consoleCookie(base) {
  const r = await fetch(`${base}/api/console/login`, { method:'POST',
    headers:{'content-type':'application/json'}, body: JSON.stringify({ pin:'1234' }) });
  return r.headers.get('set-cookie').split(';')[0];
}

// a tiny valid 1x1 PNG (decodable by libspng / sharp)
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000970485973000003e8000003e801b57b526b0000000d49444154789c63f8cfc0f01f00050001ff89993d1d0000000049454e44ae426082','hex');

test('upload returns a served path requiring console auth to post', async () => {
  const { base, close } = await startTestServer();
  const cookie = await consoleCookie(base);
  const form = new FormData();
  form.append('image', new Blob([PNG], { type:'image/png' }), 'x.png');
  const res = await fetch(`${base}/api/uploads`, { method:'POST', headers:{cookie}, body: form });
  assert.strictEqual(res.status, 200);
  const { path: p } = await res.json();
  assert.match(p, /^\/api\/uploads\//);
  await close();
});

test('upload rejects without console auth', async () => {
  const { base, close } = await startTestServer();
  const form = new FormData();
  form.append('image', new Blob([PNG], { type:'image/png' }), 'x.png');
  const res = await fetch(`${base}/api/uploads`, { method:'POST', body: form });
  assert.strictEqual(res.status, 401);
  await close();
});
