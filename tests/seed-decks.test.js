const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');

test('seed creates the six decks with map_json, Crown unlocked', () => {
  const db = openDb(':memory:');
  seed(db);
  const decks = db.prepare('SELECT name, unlocked, sort_order, map_json FROM decks ORDER BY sort_order').all();
  assert.strictEqual(decks.length, 6);
  assert.strictEqual(decks[0].name, 'Crown');
  assert.strictEqual(decks[0].sort_order, 1);
  assert.strictEqual(decks[0].unlocked, 1, 'Crown starts unlocked');
  assert.strictEqual(decks[5].unlocked, 0, 'Deck Zero starts sealed');
  assert.ok(JSON.parse(decks[0].map_json).shapes.length > 0);
});

test('seed decks is idempotent', () => {
  const db = openDb(':memory:');
  seed(db); seed(db);
  assert.strictEqual(db.prepare('SELECT count(*) c FROM decks').get().c, 6);
});
