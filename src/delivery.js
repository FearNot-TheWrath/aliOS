// src/delivery.js
const VALID_APPS = ['messages', 'allie', 'archive', 'photos', 'decks', 'settings'];

function buildDelivery({ message, freeType, characterId, phase, now }) {
  const src = message
    ? { sender_id: message.sender_id, app: message.app, body: message.body, image_path: message.image_path ?? null }
    : { sender_id: freeType.senderId, app: freeType.app, body: freeType.body, image_path: freeType.imagePath ?? null };

  const body = String(src.body ?? '').trim();
  if (!body) throw new Error('delivery body is required');
  const app = VALID_APPS.includes(src.app) ? src.app : 'messages';

  return {
    character_id: characterId,
    sender_id: src.sender_id,
    app,
    body,
    image_path: src.image_path ?? null,
    phase_at_send: phase,
    sent_at: now,
    read_at: null,
  };
}

module.exports = { buildDelivery, VALID_APPS };
