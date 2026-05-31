// tests/auth.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');
const { verifyCharacterPin, verifyParentPin, issueToken, readToken } = require('../src/auth');

test('verifyCharacterPin accepts correct pin, rejects wrong', () => {
  const db = openDb(':memory:'); seed(db);
  const c = db.prepare('SELECT * FROM characters ORDER BY sort_order LIMIT 1').get();
  assert.ok(verifyCharacterPin(db, c.id, c.pin));
  assert.strictEqual(verifyCharacterPin(db, c.id, '0000'), false);
});

test('verifyParentPin checks config', () => {
  const db = openDb(':memory:'); seed(db);
  assert.ok(verifyParentPin(db, '1234'));
  assert.strictEqual(verifyParentPin(db, 'nope'), false);
});

test('token round trips character id and role', () => {
  const t = issueToken({ role: 'player', characterId: 7 }, 'secret');
  const claims = readToken(t, 'secret');
  assert.strictEqual(claims.role, 'player');
  assert.strictEqual(claims.characterId, 7);
  assert.strictEqual(readToken('garbage', 'secret'), null);
  assert.strictEqual(readToken(t, 'wrong-secret'), null);
});
