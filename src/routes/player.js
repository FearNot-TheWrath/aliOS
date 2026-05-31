// src/routes/player.js
const express = require('express');
const { requireRole } = require('../middleware');
const { listDeliveriesForCharacter, markRead, currentPhase } = require('../store');
const { emitRead } = require('../sockets');

module.exports = (app) => {
  const router = express.Router();
  const db = app.locals.db;
  const guard = requireRole('player', 'alios_session');

  router.get('/state', guard, (req, res) => {
    const id = req.claims.characterId;
    const character = db.prepare('SELECT id, name, avatar FROM characters WHERE id = ?').get(id);
    res.json({
      character,
      phase: currentPhase(db),
      deliveries: listDeliveriesForCharacter(db, id),
    });
  });

  router.post('/read/:deliveryId', guard, (req, res) => {
    const id = req.claims.characterId;
    const ok = markRead(db, Number(req.params.deliveryId), id, Date.now());
    if (ok && app.locals.io) emitRead(app.locals.io, id, Number(req.params.deliveryId));
    res.json({ ok });
  });

  router.get('/archive', guard, (req, res) => {
    const q = `%${String(req.query.q || '').trim().toLowerCase()}%`;
    const phase = currentPhase(db);
    const rows = db.prepare(
      `SELECT * FROM archive_entries
       WHERE lower(keyword) LIKE ? AND (phase_gate IS NULL OR phase_gate <= ?)
       ORDER BY keyword`).all(q, phase);
    const results = rows.map((r) => ({
      keyword: r.keyword,
      redacted: !!r.redacted,
      response: r.redacted ? 'ACCESS DENIED. Clearance insufficient.' : r.response,
    }));
    res.json({ results });
  });

  return router;
};
