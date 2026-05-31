// src/deckstore.js
function listDecksRaw(db) {
  return db.prepare('SELECT id, name, unlocked, sort_order, map_json FROM decks ORDER BY sort_order').all();
}

function listPinsRaw(db, deckId) {
  return db.prepare('SELECT * FROM pins WHERE deck_id = ? ORDER BY sort_order, id').all(deckId);
}

function insertPin(db, p) {
  const row = {
    deck_id: p.deck_id, x: p.x, y: p.y,
    truth_label: p.truth_label ?? null, lie_label: p.lie_label ?? null,
    state: p.state ?? 'truth', phase_gate: p.phase_gate ?? null,
    poi_type: p.poi_type ?? 'generic', manual: p.manual ?? 0, sort_order: p.sort_order ?? 0,
  };
  const info = db.prepare(
    `INSERT INTO pins (deck_id,x,y,truth_label,lie_label,state,phase_gate,poi_type,manual,sort_order)
     VALUES (@deck_id,@x,@y,@truth_label,@lie_label,@state,@phase_gate,@poi_type,@manual,@sort_order)`
  ).run(row);
  return info.lastInsertRowid;
}

// Whitelisted field update. Camel-case input keys map to columns.
const UPDATE_COLS = {
  x: 'x', y: 'y', truthLabel: 'truth_label', lieLabel: 'lie_label',
  phaseGate: 'phase_gate', poiType: 'poi_type', state: 'state', sortOrder: 'sort_order',
};
function updatePin(db, id, fields) {
  const sets = [], vals = [];
  for (const [k, v] of Object.entries(fields)) {
    const col = UPDATE_COLS[k];
    if (col) { sets.push(`${col} = ?`); vals.push(v); }
  }
  if (fields.state !== undefined) sets.push('manual = 1');
  if (!sets.length) return;
  vals.push(id);
  db.prepare(`UPDATE pins SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

function flipPin(db, id) {
  const row = db.prepare('SELECT state FROM pins WHERE id = ?').get(id);
  if (!row) return null;
  const next = row.state === 'truth' ? 'lie' : row.state === 'lie' ? 'hidden' : 'truth';
  db.prepare('UPDATE pins SET state = ?, manual = 1 WHERE id = ?').run(next, id);
  return next;
}

function deletePin(db, id) {
  db.prepare('DELETE FROM pins WHERE id = ?').run(id);
}

function getParty(db) {
  return db.prepare('SELECT party_deck_id, party_x, party_y FROM game_state WHERE id = 1').get();
}

function setParty(db, deckId, x, y) {
  db.prepare('UPDATE game_state SET party_deck_id = ?, party_x = ?, party_y = ? WHERE id = 1').run(deckId, x, y);
}

function deckById(db, id) {
  return db.prepare('SELECT id, name, unlocked, sort_order, map_json FROM decks WHERE id = ?').get(id);
}

module.exports = {
  listDecksRaw, listPinsRaw, insertPin, updatePin, flipPin, deletePin,
  getParty, setParty, deckById,
};
