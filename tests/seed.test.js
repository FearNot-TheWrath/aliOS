// tests/seed.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');

test('seed creates characters, senders, and an Allie sender', () => {
  const db = openDb(':memory:');
  seed(db);
  const chars = db.prepare('SELECT count(*) c FROM characters').get();
  assert.ok(chars.c >= 1);
  const allie = db.prepare('SELECT * FROM senders WHERE is_allie = 1').get();
  assert.ok(allie, 'an Allie sender exists');
});

test('seed is idempotent', () => {
  const db = openDb(':memory:');
  seed(db);
  seed(db);
  const allie = db.prepare('SELECT count(*) c FROM senders WHERE is_allie = 1').get();
  assert.strictEqual(allie.c, 1);
});
