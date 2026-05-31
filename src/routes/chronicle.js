// src/routes/chronicle.js
// Public reader API for the Ark Archive. Player entries render openly; redacted
// entries reveal their body only after a correct code is supplied.
const express = require('express');
const path = require('node:path');
const { loadEntries, publicIndex, unlock } = require('../chroniclestore');

const CONTENT_DIR = path.join(__dirname, '..', '..', 'content', 'chronicle');

module.exports = () => {
  const router = express.Router();

  router.get('/chronicle', (req, res) => {
    res.json({ entries: publicIndex(loadEntries(CONTENT_DIR)) });
  });

  router.post('/chronicle/:id/unlock', (req, res) => {
    const result = unlock(loadEntries(CONTENT_DIR), req.params.id, (req.body && req.body.code) || '');
    if (!result.ok) return res.status(403).json({ ok: false, error: 'Clearance not recognized.' });
    res.json(result);
  });

  return router;
};
