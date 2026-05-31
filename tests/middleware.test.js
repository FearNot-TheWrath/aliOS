// tests/middleware.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { requireRole } = require('../src/middleware');
const { issueToken } = require('../src/auth');

function fakeReqRes(token) {
  const req = { cookies: { alios_session: token }, app: { locals: { secret: 's' } } };
  let code = 200; let sent = null;
  const res = { status(c) { code = c; return this; }, json(b) { sent = b; return this; } };
  return { req, res, get code() { return code; }, get sent() { return sent; } };
}

test('requireRole allows matching role and sets req.claims', () => {
  const token = issueToken({ role: 'player', characterId: 4 }, 's');
  const ctx = fakeReqRes(token);
  let nexted = false;
  requireRole('player', 'alios_session')(ctx.req, ctx.res, () => { nexted = true; });
  assert.ok(nexted);
  assert.strictEqual(ctx.req.claims.characterId, 4);
});

test('requireRole rejects missing/garbage token with 401', () => {
  const ctx = fakeReqRes('garbage');
  requireRole('player', 'alios_session')(ctx.req, ctx.res, () => {});
  assert.strictEqual(ctx.code, 401);
});
