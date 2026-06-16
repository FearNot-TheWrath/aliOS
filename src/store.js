// src/store.js
function currentPhase(db) {
  return db.prepare('SELECT current_phase FROM game_state WHERE id = 1').get().current_phase;
}

function insertDelivery(db, d) {
  const info = db.prepare(
    `INSERT INTO deliveries
     (character_id, sender_id, app, body, image_path, phase_at_send, sent_at, read_at)
     VALUES (@character_id, @sender_id, @app, @body, @image_path, @phase_at_send, @sent_at, @read_at)`
  ).run(d);
  return info.lastInsertRowid;
}

function listDeliveriesForCharacter(db, characterId) {
  return db.prepare(
    `SELECT d.*, s.name AS sender_name, s.avatar AS sender_avatar, s.is_allie
     FROM deliveries d JOIN senders s ON s.id = d.sender_id
     WHERE d.character_id = ? ORDER BY d.sent_at ASC`
  ).all(characterId);
}

function markRead(db, deliveryId, characterId, now) {
  const info = db.prepare(
    'UPDATE deliveries SET read_at = ? WHERE id = ? AND character_id = ? AND read_at IS NULL'
  ).run(now, deliveryId, characterId);
  return info.changes === 1;
}

module.exports = { currentPhase, insertDelivery, listDeliveriesForCharacter, markRead };
