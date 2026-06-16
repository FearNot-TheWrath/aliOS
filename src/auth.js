// src/auth.js
const crypto = require('node:crypto');
const { getConfig } = require('./config');

function verifyCharacterPin(db, characterId, pin) {
  const row = db.prepare('SELECT pin FROM characters WHERE id = ?').get(characterId);
  if (!row) return false;
  return timingSafeEqual(String(pin), String(row.pin));
}

function verifyParentPin(db, pin) {
  return timingSafeEqual(String(pin), String(getConfig(db, 'parent_pin', '')));
}

function timingSafeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Stateless signed token: base64(payload).hmac
function issueToken(claims, secret) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function readToken(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

module.exports = { verifyCharacterPin, verifyParentPin, issueToken, readToken };
