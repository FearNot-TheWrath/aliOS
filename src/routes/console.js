// src/routes/console.js
const express = require('express');
const { requireRole } = require('../middleware');
const { buildDelivery } = require('../delivery');
const { insertDelivery, currentPhase } = require('../store');
const { emitDelivery } = require('../sockets');

module.exports = (app) => {
  const router = express.Router();
  const db = app.locals.db;
  router.use(requireRole('parent', 'alios_console'));

  router.post('/send', (req, res) => {
    const { characterId, senderId, app: targetApp, body, messageId, imagePath } = req.body || {};
    const phase = currentPhase(db);
    let payload;
    if (messageId) {
      const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
      if (!msg) return res.status(404).json({ error: 'message not found' });
      payload = buildDelivery({ message: msg, characterId, phase, now: Date.now() });
    } else {
      payload = buildDelivery({
        freeType: { senderId, app: targetApp || 'messages', body, imagePath },
        characterId, phase, now: Date.now(),
      });
    }
    const sender = db.prepare('SELECT name, avatar, is_allie FROM senders WHERE id = ?').get(payload.sender_id);
    if (!sender) return res.status(400).json({ error: 'unknown sender' });
    const id = insertDelivery(db, payload);
    const delivery = { id, ...payload, sender_name: sender.name, sender_avatar: sender.avatar, is_allie: sender.is_allie };
    const io = app.locals.io;
    if (io) emitDelivery(io, characterId, delivery);
    res.json({ ok: true, delivery });
  });

  return router;
};
