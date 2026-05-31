// src/middleware.js
const { readToken } = require('./auth');

function requireRole(role, cookieName) {
  return (req, res, next) => {
    const token = req.cookies && req.cookies[cookieName];
    const claims = readToken(token, req.app.locals.secret);
    if (!claims || claims.role !== role) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    req.claims = claims;
    next();
  };
}

module.exports = { requireRole };
