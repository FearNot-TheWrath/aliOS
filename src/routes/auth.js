// src/routes/auth.js
const express = require('express');
const { verifyCharacterPin, verifyParentPin, issueToken } = require('../auth');

module.exports = (app) => {
  const router = express.Router();
  const db = app.locals.db;
  const secret = app.locals.secret;

  router.get('/roster', (req, res) => {
    const characters = db
      .prepare('SELECT id, name, avatar FROM characters ORDER BY sort_order')
      .all();
    res.json({ characters });
  });

  router.post('/login', (req, res) => {
    const { characterId, pin } = req.body || {};
    if (!verifyCharacterPin(db, characterId, pin)) {
      return res.status(401).json({ error: 'bad pin' });
    }
    const token = issueToken({ role: 'player', characterId }, secret);
    res.cookie('alios_session', token, { httpOnly: true, sameSite: 'lax' });
    res.json({ ok: true, token, characterId });
  });

  router.post('/console/login', (req, res) => {
    const { pin } = req.body || {};
    if (!verifyParentPin(db, pin)) return res.status(401).json({ error: 'bad pin' });
    const token = issueToken({ role: 'parent' }, secret);
    res.cookie('alios_console', token, { httpOnly: true, sameSite: 'lax' });
    res.json({ ok: true, token });
  });

  return router;
};
