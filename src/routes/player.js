// src/routes/player.js
const express = require('express');
const { requireRole } = require('../middleware');
const { listDeliveriesForCharacter, markRead, currentPhase } = require('../store');
const { emitRead } = require('../sockets');
const { unreliability, driftOffset, fogPatches, clamp01 } = require('../unreliability');
const { effectiveState, displayPin } = require('../pins');
const deckstore = require('../deckstore');

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
      locked: require('../phase').lockedApps(currentPhase(db)),
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

  router.get('/decks', guard, (req, res) => {
    const phase = currentPhase(db);
    const party = deckstore.getParty(db);
    const decks = deckstore.listDecksRaw(db).map((d) => {
      const depth = d.sort_order;
      const out = { id: d.id, name: d.name, depth, unlocked: !!d.unlocked };
      if (!d.unlocked) return out; // sealed decks expose nothing
      const U = unreliability(phase, depth);
      out.U = U;
      out.map = d.map_json ? JSON.parse(d.map_json) : null;
      out.fog = fogPatches(d.id, U);
      out.pins = deckstore.listPinsRaw(db, d.id).map((p) => displayPin(p, effectiveState(p, phase)));
      if (party.party_deck_id === d.id && party.party_x != null) {
        const off = driftOffset(d.id * 100 + phase, U);
        out.party = { x: clamp01(party.party_x + off.dx), y: clamp01(party.party_y + off.dy) };
      } else {
        out.party = null;
      }
      return out;
    });
    res.json({ phase, decks });
  });

  return router;
};
