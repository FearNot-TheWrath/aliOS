// tests/api-health.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

test('GET /api/health returns ok', async () => {
  const { base, close } = await startTestServer();
  const res = await fetch(`${base}/api/health`);
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.ok, true);
  await close();
});
