// src/routes/console.js
const express = require('express');
const { requireRole } = require('../middleware');
const { buildDelivery } = require('../delivery');
const { insertDelivery, currentPhase } = require('../store');
const { emitDelivery } = require('../sockets');
const { themeForPhase, lockedApps } = require('../phase');

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

  router.get('/roster', (req, res) => {
    const chars = db.prepare('SELECT id, name FROM characters ORDER BY sort_order').all();
    const withCounts = chars.map((c) => {
      const last = db.prepare(
        'SELECT body, sent_at, read_at FROM deliveries WHERE character_id = ? ORDER BY sent_at DESC LIMIT 1'
      ).get(c.id);
      const unread = db.prepare(
        'SELECT count(*) n FROM deliveries WHERE character_id = ? AND read_at IS NULL'
      ).get(c.id).n;
      return { ...c, lastBody: last ? last.body : null, lastRead: last ? !!last.read_at : null, unread };
    });
    res.json({ characters: withCounts });
  });

  router.get('/senders', (req, res) => {
    res.json({ senders: db.prepare('SELECT id, name, is_allie FROM senders ORDER BY is_allie DESC, name').all() });
  });

  router.get('/messages', (req, res) => {
    res.json({ messages: db.prepare(
      `SELECT m.*, s.name AS sender_name FROM messages m JOIN senders s ON s.id = m.sender_id
       ORDER BY m.sort_order, m.id`).all() });
  });

  router.post('/messages', (req, res) => {
    const { senderId, app: a = 'messages', body, imagePath = null, phaseGate = null, label = null } = req.body || {};
    if (!body || !String(body).trim()) return res.status(400).json({ error: 'body required' });
    const info = db.prepare(
      `INSERT INTO messages (sender_id, app, body, image_path, phase_gate, label)
       VALUES (?,?,?,?,?,?)`).run(senderId, a, body, imagePath, phaseGate, label);
    res.json({ ok: true, id: info.lastInsertRowid });
  });

  router.delete('/messages/:id', (req, res) => {
    db.prepare('DELETE FROM messages WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });

  router.get('/archive', (req, res) => {
    res.json({ entries: db.prepare('SELECT * FROM archive_entries ORDER BY keyword').all() });
  });
  router.post('/archive', (req, res) => {
    const { id, keyword, response, redacted = 0, phaseGate = null } = req.body || {};
    if (id) {
      db.prepare('UPDATE archive_entries SET keyword=?, response=?, redacted=?, phase_gate=? WHERE id=?')
        .run(keyword, response, redacted ? 1 : 0, phaseGate, id);
      return res.json({ ok: true, id });
    }
    const info = db.prepare('INSERT INTO archive_entries (keyword, response, redacted, phase_gate) VALUES (?,?,?,?)')
      .run(keyword, response, redacted ? 1 : 0, phaseGate);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.post('/archive/:id/redact', (req, res) => {
    db.prepare('UPDATE archive_entries SET redacted = ? WHERE id = ?')
      .run(req.body && req.body.redacted ? 1 : 0, Number(req.params.id));
    res.json({ ok: true });
  });

  router.get('/decks', (req, res) => {
    res.json({ decks: db.prepare('SELECT * FROM decks ORDER BY sort_order').all() });
  });
  router.post('/decks', (req, res) => {
    const { id, name, imagePath = null, unlocked = 0, sortOrder = 0 } = req.body || {};
    if (id) { db.prepare('UPDATE decks SET name=?, image_path=?, unlocked=?, sort_order=? WHERE id=?')
      .run(name, imagePath, unlocked?1:0, sortOrder, id); return res.json({ ok:true, id }); }
    const info = db.prepare('INSERT INTO decks (name, image_path, unlocked, sort_order) VALUES (?,?,?,?)')
      .run(name, imagePath, unlocked?1:0, sortOrder);
    res.json({ ok:true, id: info.lastInsertRowid });
  });
  router.post('/decks/:id/unlock', (req, res) => {
    db.prepare('UPDATE decks SET unlocked = ? WHERE id = ?').run(req.body && req.body.unlocked ? 1 : 0, Number(req.params.id));
    if (app.locals.io) app.locals.io.emit('decks:changed', {});
    res.json({ ok: true });
  });

  router.get('/phase', (req, res) => {
    const phase = db.prepare('SELECT current_phase FROM game_state WHERE id=1').get().current_phase;
    res.json({ phase });
  });
  router.post('/phase', (req, res) => {
    const phase = Math.max(1, Math.min(5, Number(req.body && req.body.phase) || 1));
    db.prepare('UPDATE game_state SET current_phase = ? WHERE id = 1').run(phase);
    if (app.locals.io) app.locals.io.emit('phase', { phase, theme: themeForPhase(phase), locked: lockedApps(phase) });
    res.json({ ok: true, phase });
  });

  router.post('/cutscene', (req, res) => {
    const name = String(req.body && req.body.name || 'window');
    if (app.locals.io) app.locals.io.emit('cutscene', { name });
    res.json({ ok: true });
  });

  return router;
};
