// tests/helpers.js
const http = require('node:http');

// buildApp is defined in server.js and accepts an options object so tests
// can inject an in-memory database path.
async function startTestServer(opts = {}) {
  const { buildApp } = require('../server');
  const { app } = buildApp({ dbPath: ':memory:', ...opts });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return {
    base: `http://127.0.0.1:${port}`,
    server,
    close: () => new Promise((r) => server.close(r)),
  };
}

module.exports = { startTestServer };
