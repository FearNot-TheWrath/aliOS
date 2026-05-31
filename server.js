// server.js
const express = require('express');

function buildApp(opts = {}) {
  const app = express();
  app.use(express.json());
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  return { app, opts };
}

if (require.main === module) {
  const { app } = buildApp({ dbPath: process.env.DB_PATH || './data/alios.db' });
  const port = process.env.PORT || 3007;
  app.listen(port, () => console.log(`aliOS on :${port}`));
}

module.exports = { buildApp };
