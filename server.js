// server.js
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('node:path');
const { openDb } = require('./src/db');
const { seed } = require('./src/seed');

function buildApp(opts = {}) {
  const db = opts.db || openDb(opts.dbPath || ':memory:');
  if (opts.seed !== false) seed(db);
  const secret = opts.secret || process.env.SESSION_SECRET || 'dev-secret-change-me';

  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // shared context available to routes
  app.locals.db = db;
  app.locals.secret = secret;

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // routes mounted in later tasks:
  app.use('/api', require('./src/routes/auth')(app));
  app.use('/api', require('./src/routes/player')(app));
  app.use('/api/console', require('./src/routes/console')(app));
  app.use('/api/uploads', require('./src/routes/uploads')(app));

  // static front ends
  app.use('/console', express.static(path.join(__dirname, 'public/console')));
  app.use('/', express.static(path.join(__dirname, 'public/player')));

  return { app, db, secret };
}

if (require.main === module) {
  const http = require('node:http');
  const { Server } = require('socket.io');
  const db = openDb(process.env.DB_PATH || './data/alios.db');
  const { app, secret } = buildApp({ db });
  const server = http.createServer(app);
  const io = new Server(server);
  require('./src/sockets').attach(io, { db, secret });
  app.locals.io = io;
  const port = process.env.PORT || 3007;
  server.listen(port, () => console.log(`aliOS on :${port}`));
}

module.exports = { buildApp };
