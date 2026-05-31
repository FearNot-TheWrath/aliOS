const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');

test('migration 002 adds map_json, party fields, and pins table', () => {
  const db = openDb(':memory:');
  const deckCols = db.prepare("PRAGMA table_info(decks)").all().map((c) => c.name);
  assert.ok(deckCols.includes('map_json'), 'decks.map_json exists');
  const gsCols = db.prepare("PRAGMA table_info(game_state)").all().map((c) => c.name);
  assert.ok(gsCols.includes('party_deck_id') && gsCols.includes('party_x') && gsCols.includes('party_y'));
  const pinCols = db.prepare("PRAGMA table_info(pins)").all().map((c) => c.name);
  for (const c of ['deck_id','x','y','truth_label','lie_label','state','phase_gate','poi_type','manual','sort_order']) {
    assert.ok(pinCols.includes(c), `pins.${c} exists`);
  }
});
