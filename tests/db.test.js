// tests/db.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');

test('openDb applies migrations and records them', () => {
  const db = openDb(':memory:');
  const applied = db.prepare('SELECT name FROM _migrations ORDER BY name').all();
  assert.ok(applied.length >= 1, 'at least one migration recorded');
  const state = db.prepare('SELECT current_phase FROM game_state WHERE id = 1').get();
  assert.strictEqual(state.current_phase, 1);
});

test('openDb is idempotent', () => {
  const db = openDb(':memory:');
  // Re-running the migration pass must not throw or duplicate.
  const { applyMigrations } = require('../src/db');
  applyMigrations(db);
  const rows = db.prepare('SELECT count(*) c FROM game_state').get();
  assert.strictEqual(rows.c, 1);
});
