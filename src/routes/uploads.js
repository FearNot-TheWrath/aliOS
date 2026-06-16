// src/routes/uploads.js
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { requireRole } = require('../middleware');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');

module.exports = (app) => {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  // POST is console only; GET serving is open (images are non-secret game handouts)
  router.post('/', requireRole('parent', 'alios_console'), upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'no image' });
    const name = crypto.randomBytes(8).toString('hex') + '.webp';
    await sharp(req.file.buffer).rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 }).toFile(path.join(UPLOAD_DIR, name));
    res.json({ ok: true, path: `/api/uploads/${name}` });
  });

  router.get('/:file', (req, res) => {
    if (!/^[a-f0-9]{16}\.webp$/.test(req.params.file)) return res.status(404).end();
    res.sendFile(path.join(UPLOAD_DIR, req.params.file));
  });

  return router;
};
