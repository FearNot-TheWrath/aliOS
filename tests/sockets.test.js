// tests/sockets.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: Client } = require('socket.io-client');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');
const { issueToken } = require('../src/auth');
const { attach, emitDelivery } = require('../src/sockets');

test('player joins their room and receives a delivery event', async () => {
  const db = openDb(':memory:'); seed(db);
  const server = http.createServer();
  const ioServer = new Server(server);
  attach(ioServer, { db, secret: 'secret' });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  const token = issueToken({ role: 'player', characterId: 1 }, 'secret');
  const client = Client(`http://127.0.0.1:${port}`, { auth: { token } });

  const got = new Promise((resolve) => client.on('delivery', resolve));
  await new Promise((resolve) => client.on('connect', resolve));

  emitDelivery(ioServer, 1, { id: 99, app: 'messages', body: 'Hi' });
  const payload = await got;
  assert.strictEqual(payload.body, 'Hi');

  client.close(); ioServer.close(); await new Promise((r) => server.close(r));
});
