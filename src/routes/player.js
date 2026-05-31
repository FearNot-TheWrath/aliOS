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

  return router;
};
