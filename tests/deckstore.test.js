const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');
const {
  listDecksRaw, listPinsRaw, insertPin, updatePin, flipPin, deletePin, getParty, setParty,
} = require('../src/deckstore');

function freshDb() { const db = openDb(':memory:'); seed(db); return db; }

test('insert, list, update, flip, delete pins', () => {
  const db = freshDb();
  const deck = listDecksRaw(db)[0];
  const id = insertPin(db, { deck_id: deck.id, x: 0.5, y: 0.5, truth_label: 'Stairs', poi_type: 'stairs' });
  let pins = listPinsRaw(db, deck.id);
  assert.strictEqual(pins.length, 1);
  assert.strictEqual(pins[0].truth_label, 'Stairs');
  assert.strictEqual(pins[0].state, 'truth');
  assert.strictEqual(pins[0].manual, 0);

  updatePin(db, id, { lieLabel: 'Closed', phaseGate: 3 });
  pins = listPinsRaw(db, deck.id);
  assert.strictEqual(pins[0].lie_label, 'Closed');
  assert.strictEqual(pins[0].phase_gate, 3);

  assert.strictEqual(flipPin(db, id), 'lie');
  assert.strictEqual(flipPin(db, id), 'hidden');
  assert.strictEqual(flipPin(db, id), 'truth');
  assert.strictEqual(listPinsRaw(db, deck.id)[0].manual, 1, 'flip marks manual');

  deletePin(db, id);
  assert.strictEqual(listPinsRaw(db, deck.id).length, 0);
});

test('party get/set round trips', () => {
  const db = freshDb();
  const deck = listDecksRaw(db)[1];
  assert.strictEqual(getParty(db).party_deck_id, null);
  setParty(db, deck.id, 0.3, 0.7);
  const party = getParty(db);
  assert.strictEqual(party.party_deck_id, deck.id);
  assert.strictEqual(party.party_x, 0.3);
  assert.strictEqual(party.party_y, 0.7);
});
