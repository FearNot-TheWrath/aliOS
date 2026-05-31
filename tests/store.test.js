// tests/store.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');
const { insertDelivery, listDeliveriesForCharacter, markRead, currentPhase } = require('../src/store');

test('insertDelivery persists and list returns it', () => {
  const db = openDb(':memory:'); seed(db);
  const id = insertDelivery(db, {
    character_id: 1, sender_id: 1, app: 'messages', body: 'Hi',
    image_path: null, phase_at_send: 1, sent_at: 10, read_at: null,
  });
  const rows = listDeliveriesForCharacter(db, 1);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].id, id);
  assert.strictEqual(rows[0].body, 'Hi');
});

test('markRead stamps read_at once', () => {
  const db = openDb(':memory:'); seed(db);
  const id = insertDelivery(db, {
    character_id: 1, sender_id: 1, app: 'messages', body: 'Hi',
    image_path: null, phase_at_send: 1, sent_at: 10, read_at: null,
  });
  assert.strictEqual(markRead(db, id, 1, 50), true);
  const row = listDeliveriesForCharacter(db, 1)[0];
  assert.strictEqual(row.read_at, 50);
  // wrong character cannot mark
  assert.strictEqual(markRead(db, id, 2, 60), false);
});

test('currentPhase reads game_state', () => {
  const db = openDb(':memory:'); seed(db);
  assert.strictEqual(currentPhase(db), 1);
});
