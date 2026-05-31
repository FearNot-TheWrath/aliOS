// tests/helpers.js
const http = require('node:http');

async function startTestServer(opts = {}) {
  const { buildApp } = require('../server');
  const { app, db } = buildApp({ dbPath: ':memory:', ...opts });
  const server = http.createServer(app);
  server._aliosDb = db;
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return {
    base: `http://127.0.0.1:${port}`,
    server, db,
    close: () => new Promise((r) => server.close(r)),
  };
}

module.exports = { startTestServer };
