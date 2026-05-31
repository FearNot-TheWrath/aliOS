# aliOS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build aliOS, a PWA that turns each player's phone into an in-world device the DM uses to privately deliver preplanned messages, images, and ship data, with an interface that visibly decays as the campaign AI "Allie" turns.

**Architecture:** One Node/Express 5 server with better-sqlite3 and Socket.io serves two vanilla JS front ends (a receive only Player app and a DM console) from a shared database. The DM fires preplanned or improvised messages from the console; the server logs each as a delivery and pushes it over a socket to the target player's phone, which reacts with chime, glow, and a red badge. A single global phase value (1 to 5) drives a live theme change across all phones at once.

**Tech Stack:** Node 20, Express 5, better-sqlite3, Socket.io, vanilla JS PWA (service worker + manifest), node:test for tests, PM2 + Cloudflare Tunnel for deploy.

---

## File Structure

```
ark-alios/
  package.json
  server.js                  Express + Socket.io bootstrap, wires routes and sockets
  src/
    db.js                    sqlite connection + migration runner
    migrations/
      001-initial.sql        all tables + seed of game_state/config
    config.js                key/value config accessor (parent PIN, etc.)
    auth.js                  player character+PIN auth, parent PIN check, session tokens
    phase.js                 phase get/set + phase->theme/lock/tone data (pure)
    delivery.js              pure: build a delivery payload from a message or free-type input
    sockets.js               Socket.io wiring: rooms per character + console room, emit helpers
    routes/
      auth.js                POST /api/login, POST /api/console/login, roster for picker
      player.js              GET player state, messages, archive search, decks, mark-read
      console.js             send, library CRUD, phase set, archive editor, decks, roster status
      uploads.js             image upload (sharp strip) + protected serve
  public/
    player/
      index.html  app.js  styles.css  manifest.json  sw.js
      sounds/allie-chime.mp3
    console/
      index.html  console.js  console.css
  data/                      sqlite db (gitignored)
  tests/
    helpers.js               in-memory db + app factory for tests
    db.test.js  auth.test.js  phase.test.js  delivery.test.js
    api-auth.test.js  api-console.test.js  api-player.test.js
```

Each milestone below leaves the app runnable. Milestones are the review checkpoints.

---

## Milestone 0: Project scaffold

### Task 0.1: package.json and dependencies

**Files:**
- Create: `package.json`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "ark-alios",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "node --test"
  },
  "dependencies": {
    "better-sqlite3": "^11.8.0",
    "cookie-parser": "^1.4.7",
    "express": "^5.0.1",
    "multer": "^1.4.5-lts.1",
    "sharp": "^0.33.5",
    "socket.io": "^4.8.1"
  }
}
```

- [ ] **Step 2: Install**

Run: `cd ~/projects/ark-alios && npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: scaffold package.json and deps"
```

### Task 0.2: Minimal server boot + health endpoint

**Files:**
- Create: `server.js`
- Create: `tests/helpers.js`
- Test: `tests/api-health.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/api-health.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

test('GET /api/health returns ok', async () => {
  const { base, close } = await startTestServer();
  const res = await fetch(`${base}/api/health`);
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.ok, true);
  await close();
});
```

- [ ] **Step 2: Write the test helper**

```js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/api-health.test.js`
Expected: FAIL, cannot find `buildApp` export in server.js.

- [ ] **Step 4: Write minimal server.js**

```js
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/api-health.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server.js tests/helpers.js tests/api-health.test.js
git commit -m "feat: server boot with health endpoint and test harness"
```

---

## Milestone 1: Data layer

### Task 1.1: Migration runner

**Files:**
- Create: `src/db.js`
- Test: `tests/db.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/db.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');

test('openDb applies migrations and records them', () => {
  const db = openDb(':memory:');
  const applied = db.prepare('SELECT name FROM _migrations ORDER BY name').all();
  assert.ok(applied.length >= 1, 'at least one migration recorded');
  const state = db.prepare('SELECT current_phase FROM game_state WHERE id = 1').get();
  assert.strictEqual(state.current_phase, 1);
});

test('openDb is idempotent', () => {
  const db = openDb(':memory:');
  // Re-running the migration pass must not throw or duplicate.
  const { applyMigrations } = require('../src/db');
  applyMigrations(db);
  const rows = db.prepare('SELECT count(*) c FROM game_state').get();
  assert.strictEqual(rows.c, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/db.test.js`
Expected: FAIL, cannot find `../src/db`.

- [ ] **Step 3: Write src/db.js**

```js
// src/db.js
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function applyMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);
  const done = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => r.name));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const run = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(file, Date.now());
    });
    run();
  }
}

function openDb(dbPath = './data/alios.db') {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  return db;
}

module.exports = { openDb, applyMigrations };
```

- [ ] **Step 4: Write the initial migration**

```sql
-- src/migrations/001-initial.sql
CREATE TABLE game_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_phase INTEGER NOT NULL DEFAULT 1,
  current_session INTEGER NOT NULL DEFAULT 1
);
INSERT INTO game_state (id, current_phase, current_session) VALUES (1, 1, 1);

CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO config (key, value) VALUES ('parent_pin', '1234');

CREATE TABLE characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  avatar TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE senders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  avatar TEXT,
  is_allie INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES senders(id),
  app TEXT NOT NULL DEFAULT 'messages',
  body TEXT NOT NULL,
  image_path TEXT,
  phase_gate INTEGER,
  label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id),
  sender_id INTEGER NOT NULL REFERENCES senders(id),
  app TEXT NOT NULL DEFAULT 'messages',
  body TEXT NOT NULL,
  image_path TEXT,
  phase_at_send INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  read_at INTEGER
);

CREATE TABLE archive_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  response TEXT NOT NULL,
  redacted INTEGER NOT NULL DEFAULT 0,
  phase_gate INTEGER
);

CREATE TABLE decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  image_path TEXT,
  unlocked INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/db.test.js`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add src/db.js src/migrations/001-initial.sql tests/db.test.js
git commit -m "feat: sqlite migration runner and initial schema"
```

### Task 1.2: Config accessor

**Files:**
- Create: `src/config.js`
- Test: `tests/config.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/config.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { getConfig, setConfig } = require('../src/config');

test('config get/set round trip', () => {
  const db = openDb(':memory:');
  assert.strictEqual(getConfig(db, 'parent_pin'), '1234');
  setConfig(db, 'parent_pin', '9999');
  assert.strictEqual(getConfig(db, 'parent_pin'), '9999');
  assert.strictEqual(getConfig(db, 'missing', 'fallback'), 'fallback');
});
```

- [ ] **Step 2: Run test, expect FAIL** (`../src/config` missing).

Run: `npm test -- tests/config.test.js`

- [ ] **Step 3: Write src/config.js**

```js
// src/config.js
function getConfig(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setConfig(db, key, value) {
  db.prepare(
    `INSERT INTO config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

module.exports = { getConfig, setConfig };
```

- [ ] **Step 4: Run test, expect PASS.**

Run: `npm test -- tests/config.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/config.js tests/config.test.js
git commit -m "feat: config key/value accessor"
```

### Task 1.3: Seed script for the campaign roster

**Files:**
- Create: `src/seed.js`
- Test: `tests/seed.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/seed.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');

test('seed creates characters, senders, and an Allie sender', () => {
  const db = openDb(':memory:');
  seed(db);
  const chars = db.prepare('SELECT count(*) c FROM characters').get();
  assert.ok(chars.c >= 1);
  const allie = db.prepare('SELECT * FROM senders WHERE is_allie = 1').get();
  assert.ok(allie, 'an Allie sender exists');
});

test('seed is idempotent', () => {
  const db = openDb(':memory:');
  seed(db);
  seed(db);
  const allie = db.prepare('SELECT count(*) c FROM senders WHERE is_allie = 1').get();
  assert.strictEqual(allie.c, 1);
});
```

- [ ] **Step 2: Run test, expect FAIL.**

Run: `npm test -- tests/seed.test.js`

- [ ] **Step 3: Write src/seed.js**

```js
// src/seed.js
// Seeds a starter roster. Names and PINs are placeholders the DM edits
// later from the console; the point is to make the app usable immediately.
function seed(db) {
  const charCount = db.prepare('SELECT count(*) c FROM characters').get().c;
  if (charCount === 0) {
    const insert = db.prepare(
      'INSERT INTO characters (name, pin, sort_order) VALUES (?, ?, ?)'
    );
    ['Crew One', 'Crew Two', 'Crew Three', 'Crew Four', 'Crew Five'].forEach((n, i) =>
      insert.run(n, String(1000 + i), i)
    );
  }
  const allie = db.prepare('SELECT id FROM senders WHERE is_allie = 1').get();
  if (!allie) {
    db.prepare('INSERT INTO senders (name, is_allie) VALUES (?, 1)').run('Allie');
  }
  const momExists = db.prepare("SELECT id FROM senders WHERE name = 'Mom'").get();
  if (!momExists) {
    db.prepare('INSERT INTO senders (name, is_allie) VALUES (?, 0)').run('Mom');
  }
}

module.exports = { seed };
```

- [ ] **Step 4: Run test, expect PASS.**

Run: `npm test -- tests/seed.test.js`

- [ ] **Step 5: Wire seed into server startup**

In `server.js`, after `buildApp` opens the db (added in Milestone 3), call `seed(db)`. For now add a guard so the standalone run seeds. Update the `if (require.main === module)` block:

```js
if (require.main === module) {
  const { openDb } = require('./src/db');
  const { seed } = require('./src/seed');
  const db = openDb(process.env.DB_PATH || './data/alios.db');
  seed(db);
  const { app } = buildApp({ db });
  const port = process.env.PORT || 3007;
  app.listen(port, () => console.log(`aliOS on :${port}`));
}
```

(Note: `buildApp` is refactored to accept an existing `db` in Task 3.1. If executing strictly in order, leave this block as in Task 0.2 until Task 3.1, then apply this version. The plan repeats the final block in Task 3.1.)

- [ ] **Step 6: Commit**

```bash
git add src/seed.js tests/seed.test.js server.js
git commit -m "feat: starter roster seed"
```

---

## Milestone 2: Authentication

### Task 2.1: Auth domain logic (pure-ish, db-backed)

**Files:**
- Create: `src/auth.js`
- Test: `tests/auth.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/auth.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');
const { verifyCharacterPin, verifyParentPin, issueToken, readToken } = require('../src/auth');

test('verifyCharacterPin accepts correct pin, rejects wrong', () => {
  const db = openDb(':memory:'); seed(db);
  const c = db.prepare('SELECT * FROM characters ORDER BY sort_order LIMIT 1').get();
  assert.ok(verifyCharacterPin(db, c.id, c.pin));
  assert.strictEqual(verifyCharacterPin(db, c.id, '0000'), false);
});

test('verifyParentPin checks config', () => {
  const db = openDb(':memory:'); seed(db);
  assert.ok(verifyParentPin(db, '1234'));
  assert.strictEqual(verifyParentPin(db, 'nope'), false);
});

test('token round trips character id and role', () => {
  const t = issueToken({ role: 'player', characterId: 7 }, 'secret');
  const claims = readToken(t, 'secret');
  assert.strictEqual(claims.role, 'player');
  assert.strictEqual(claims.characterId, 7);
  assert.strictEqual(readToken('garbage', 'secret'), null);
  assert.strictEqual(readToken(t, 'wrong-secret'), null);
});
```

- [ ] **Step 2: Run test, expect FAIL.**

Run: `npm test -- tests/auth.test.js`

- [ ] **Step 3: Write src/auth.js**

```js
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
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
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
```

- [ ] **Step 4: Run test, expect PASS.**

Run: `npm test -- tests/auth.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/auth.js tests/auth.test.js
git commit -m "feat: auth verification and signed session tokens"
```

---

## Milestone 3: Realtime spine and delivery (the core magic)

This milestone makes a message land on a player's phone. It is the heart of the product.

### Task 3.1: Refactor buildApp to own db, sockets, cookies, and static dirs

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Rewrite server.js**

```js
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
```

- [ ] **Step 2: Create empty route modules so requires resolve**

Create each of these files with a no-op router so the app still boots while later tasks fill them in:

```js
// src/routes/auth.js
const express = require('express');
module.exports = () => express.Router();
```

```js
// src/routes/player.js
const express = require('express');
module.exports = () => express.Router();
```

```js
// src/routes/console.js
const express = require('express');
module.exports = () => express.Router();
```

```js
// src/routes/uploads.js
const express = require('express');
module.exports = () => express.Router();
```

- [ ] **Step 3: Create empty public dirs**

```bash
mkdir -p public/player/sounds public/console
echo "<!doctype html><title>aliOS</title>" > public/player/index.html
echo "<!doctype html><title>aliOS console</title>" > public/console/index.html
```

- [ ] **Step 4: Run health test, expect PASS.**

Run: `npm test -- tests/api-health.test.js`
Expected: PASS (buildApp still exports and health works).

- [ ] **Step 5: Commit**

```bash
git add server.js src/routes public/player/index.html public/console/index.html
git commit -m "refactor: buildApp owns db, cookies, routes, static dirs"
```

### Task 3.2: Delivery payload builder (pure)

**Files:**
- Create: `src/delivery.js`
- Test: `tests/delivery.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/delivery.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { buildDelivery } = require('../src/delivery');

test('buildDelivery from a library message', () => {
  const msg = { sender_id: 2, app: 'messages', body: 'Hi', image_path: null };
  const d = buildDelivery({ message: msg, characterId: 5, phase: 3, now: 111 });
  assert.deepStrictEqual(d, {
    character_id: 5, sender_id: 2, app: 'messages',
    body: 'Hi', image_path: null, phase_at_send: 3, sent_at: 111, read_at: null,
  });
});

test('buildDelivery from free-type input', () => {
  const d = buildDelivery({
    freeType: { senderId: 9, app: 'messages', body: 'Run.' },
    characterId: 1, phase: 4, now: 222,
  });
  assert.strictEqual(d.sender_id, 9);
  assert.strictEqual(d.body, 'Run.');
  assert.strictEqual(d.phase_at_send, 4);
});

test('buildDelivery rejects empty body', () => {
  assert.throws(() => buildDelivery({
    freeType: { senderId: 9, app: 'messages', body: '  ' },
    characterId: 1, phase: 1, now: 1,
  }), /body/);
});
```

- [ ] **Step 2: Run test, expect FAIL.**

Run: `npm test -- tests/delivery.test.js`

- [ ] **Step 3: Write src/delivery.js**

```js
// src/delivery.js
const VALID_APPS = ['messages', 'allie', 'archive', 'photos', 'decks', 'settings'];

function buildDelivery({ message, freeType, characterId, phase, now }) {
  const src = message
    ? { sender_id: message.sender_id, app: message.app, body: message.body, image_path: message.image_path ?? null }
    : { sender_id: freeType.senderId, app: freeType.app, body: freeType.body, image_path: freeType.imagePath ?? null };

  const body = String(src.body ?? '').trim();
  if (!body) throw new Error('delivery body is required');
  const app = VALID_APPS.includes(src.app) ? src.app : 'messages';

  return {
    character_id: characterId,
    sender_id: src.sender_id,
    app,
    body,
    image_path: src.image_path ?? null,
    phase_at_send: phase,
    sent_at: now,
    read_at: null,
  };
}

module.exports = { buildDelivery, VALID_APPS };
```

- [ ] **Step 4: Run test, expect PASS.**

Run: `npm test -- tests/delivery.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/delivery.js tests/delivery.test.js
git commit -m "feat: pure delivery payload builder"
```

### Task 3.3: Socket wiring with per-character rooms

**Files:**
- Create: `src/sockets.js`
- Test: `tests/sockets.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Add socket.io-client as a dev dependency**

Run: `npm install --save-dev socket.io-client`

- [ ] **Step 3: Run test, expect FAIL** (`../src/sockets` missing).

Run: `npm test -- tests/sockets.test.js`

- [ ] **Step 4: Write src/sockets.js**

```js
// src/sockets.js
const { readToken } = require('./auth');

function roomForCharacter(id) { return `char:${id}`; }
const CONSOLE_ROOM = 'console';

// minimal cookie header parser (avoids a dep); returns { name: value }
function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i === -1) return;
    out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  return out;
}

function attach(io, { secret }) {
  io.use((socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    // console (parent) cookie wins if present; otherwise player auth token or cookie
    const consoleClaims = readToken(cookies.alios_console, secret);
    if (consoleClaims && consoleClaims.role === 'parent') {
      socket.data.claims = consoleClaims;
      return next();
    }
    const playerToken = (socket.handshake.auth && socket.handshake.auth.token) || cookies.alios_session;
    const playerClaims = readToken(playerToken, secret);
    if (playerClaims && playerClaims.role === 'player') {
      socket.data.claims = playerClaims;
      return next();
    }
    return next(new Error('unauthorized'));
  });

  io.on('connection', (socket) => {
    const { role, characterId } = socket.data.claims;
    if (role === 'player') socket.join(roomForCharacter(characterId));
    if (role === 'parent') socket.join(CONSOLE_ROOM);
  });
}

function emitDelivery(io, characterId, delivery) {
  io.to(roomForCharacter(characterId)).emit('delivery', delivery);
  io.to(CONSOLE_ROOM).emit('delivery:sent', { characterId, delivery });
}

function emitPhase(io, phase, theme) {
  io.emit('phase', { phase, theme });
}

function emitRead(io, characterId, deliveryId) {
  io.to(CONSOLE_ROOM).emit('delivery:read', { characterId, deliveryId });
}

module.exports = { attach, emitDelivery, emitPhase, emitRead, roomForCharacter, CONSOLE_ROOM };
```

- [ ] **Step 5: Run test, expect PASS.**

Run: `npm test -- tests/sockets.test.js`

- [ ] **Step 6: Commit**

```bash
git add src/sockets.js tests/sockets.test.js package.json package-lock.json
git commit -m "feat: socket.io rooms and delivery/phase/read emit helpers"
```

### Task 3.4: Auth routes (player login, console login, picker roster)

**Files:**
- Rewrite: `src/routes/auth.js`
- Test: `tests/api-auth.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/api-auth.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

test('roster lists characters without exposing pins', async () => {
  const { base, close } = await startTestServer();
  const res = await fetch(`${base}/api/roster`);
  const body = await res.json();
  assert.ok(Array.isArray(body.characters));
  assert.ok(body.characters.length >= 1);
  assert.strictEqual(body.characters[0].pin, undefined);
  await close();
});

test('player login sets a cookie with correct pin', async () => {
  const { base, close, server } = await startTestServer();
  const db = server._aliosDb; // exposed by helper below
  const c = db.prepare('SELECT * FROM characters ORDER BY sort_order LIMIT 1').get();
  const res = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ characterId: c.id, pin: c.pin }),
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('set-cookie') || '', /alios_session=/);
  await close();
});

test('player login rejects wrong pin', async () => {
  const { base, close, server } = await startTestServer();
  const db = server._aliosDb;
  const c = db.prepare('SELECT * FROM characters ORDER BY sort_order LIMIT 1').get();
  const res = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ characterId: c.id, pin: '0000' }),
  });
  assert.strictEqual(res.status, 401);
  await close();
});
```

- [ ] **Step 2: Expose the db on the test server**

Update `tests/helpers.js` so tests can read seeded ids. Replace the body with:

```js
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
```

- [ ] **Step 3: Run test, expect FAIL** (roster route missing).

Run: `npm test -- tests/api-auth.test.js`

- [ ] **Step 4: Write src/routes/auth.js**

```js
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
```

- [ ] **Step 5: Run test, expect PASS.**

Run: `npm test -- tests/api-auth.test.js`

- [ ] **Step 6: Commit**

```bash
git add src/routes/auth.js tests/api-auth.test.js tests/helpers.js
git commit -m "feat: auth routes (player login, console login, roster)"
```

### Task 3.5: Auth middleware

**Files:**
- Create: `src/middleware.js`
- Test: `tests/middleware.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/middleware.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { requireRole } = require('../src/middleware');
const { issueToken } = require('../src/auth');

function fakeReqRes(token) {
  const req = { cookies: { alios_session: token }, app: { locals: { secret: 's' } } };
  let code = 200; let sent = null;
  const res = { status(c) { code = c; return this; }, json(b) { sent = b; return this; } };
  return { req, res, get code() { return code; }, get sent() { return sent; } };
}

test('requireRole allows matching role and sets req.claims', () => {
  const token = issueToken({ role: 'player', characterId: 4 }, 's');
  const ctx = fakeReqRes(token);
  let nexted = false;
  requireRole('player', 'alios_session')(ctx.req, ctx.res, () => { nexted = true; });
  assert.ok(nexted);
  assert.strictEqual(ctx.req.claims.characterId, 4);
});

test('requireRole rejects missing/garbage token with 401', () => {
  const ctx = fakeReqRes('garbage');
  requireRole('player', 'alios_session')(ctx.req, ctx.res, () => {});
  assert.strictEqual(ctx.code, 401);
});
```

- [ ] **Step 2: Run test, expect FAIL.**

Run: `npm test -- tests/middleware.test.js`

- [ ] **Step 3: Write src/middleware.js**

```js
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
```

- [ ] **Step 4: Run test, expect PASS.**

Run: `npm test -- tests/middleware.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/middleware.js tests/middleware.test.js
git commit -m "feat: role auth middleware"
```

### Task 3.6: Console send route (writes delivery, emits socket)

**Files:**
- Rewrite: `src/routes/console.js`
- Create: `src/store.js` (delivery persistence helpers)
- Test: `tests/api-console.test.js`, `tests/store.test.js`

- [ ] **Step 1: Write the failing store test**

```js
// tests/store.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');
const { insertDelivery, listDeliveriesForCharacter, markRead, currentPhase } = require('../src/store');

test('insertDelivery persists and list returns it', () => {
  const db = openDb(':memory:'); seed(db);
  const id = insertDelivery(db, {
    character_id: 1, sender_id: 1, app: 'messages', body: 'Hi',
    image_path: null, phase_at_send: 1, sent_at: 10, read_at: null,
  });
  const rows = listDeliveriesForCharacter(db, 1);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].id, id);
  assert.strictEqual(rows[0].body, 'Hi');
});

test('markRead stamps read_at once', () => {
  const db = openDb(':memory:'); seed(db);
  const id = insertDelivery(db, {
    character_id: 1, sender_id: 1, app: 'messages', body: 'Hi',
    image_path: null, phase_at_send: 1, sent_at: 10, read_at: null,
  });
  assert.strictEqual(markRead(db, id, 1, 50), true);
  const row = listDeliveriesForCharacter(db, 1)[0];
  assert.strictEqual(row.read_at, 50);
  // wrong character cannot mark
  assert.strictEqual(markRead(db, id, 2, 60), false);
});

test('currentPhase reads game_state', () => {
  const db = openDb(':memory:'); seed(db);
  assert.strictEqual(currentPhase(db), 1);
});
```

- [ ] **Step 2: Run test, expect FAIL.**

Run: `npm test -- tests/store.test.js`

- [ ] **Step 3: Write src/store.js**

```js
// src/store.js
function currentPhase(db) {
  return db.prepare('SELECT current_phase FROM game_state WHERE id = 1').get().current_phase;
}

function insertDelivery(db, d) {
  const info = db.prepare(
    `INSERT INTO deliveries
     (character_id, sender_id, app, body, image_path, phase_at_send, sent_at, read_at)
     VALUES (@character_id, @sender_id, @app, @body, @image_path, @phase_at_send, @sent_at, @read_at)`
  ).run(d);
  return info.lastInsertRowid;
}

function listDeliveriesForCharacter(db, characterId) {
  return db.prepare(
    `SELECT d.*, s.name AS sender_name, s.avatar AS sender_avatar, s.is_allie
     FROM deliveries d JOIN senders s ON s.id = d.sender_id
     WHERE d.character_id = ? ORDER BY d.sent_at ASC`
  ).all(characterId);
}

function markRead(db, deliveryId, characterId, now) {
  const info = db.prepare(
    'UPDATE deliveries SET read_at = ? WHERE id = ? AND character_id = ? AND read_at IS NULL'
  ).run(now, deliveryId, characterId);
  return info.changes === 1;
}

module.exports = { currentPhase, insertDelivery, listDeliveriesForCharacter, markRead };
```

- [ ] **Step 4: Run store test, expect PASS.**

Run: `npm test -- tests/store.test.js`

- [ ] **Step 5: Write the failing console-send API test**

```js
// tests/api-console.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

async function consoleLogin(base) {
  const res = await fetch(`${base}/api/console/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin: '1234' }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

test('console can send a free-type delivery to a character', async () => {
  const { base, close, db } = await startTestServer();
  const cookie = await consoleLogin(base);
  const allie = db.prepare('SELECT id FROM senders WHERE is_allie = 1').get();
  const res = await fetch(`${base}/api/console/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ characterId: 1, senderId: allie.id, app: 'messages', body: 'Hello crew' }),
  });
  assert.strictEqual(res.status, 200);
  const out = await res.json();
  assert.ok(out.delivery.id);
  assert.strictEqual(out.delivery.body, 'Hello crew');
  await close();
});

test('console send requires auth', async () => {
  const { base, close } = await startTestServer();
  const res = await fetch(`${base}/api/console/send`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ characterId: 1, senderId: 1, body: 'x' }),
  });
  assert.strictEqual(res.status, 401);
  await close();
});
```

- [ ] **Step 6: Run test, expect FAIL.**

Run: `npm test -- tests/api-console.test.js`

- [ ] **Step 7: Write src/routes/console.js (send only for now)**

```js
// src/routes/console.js
const express = require('express');
const { requireRole } = require('../middleware');
const { buildDelivery } = require('../delivery');
const { insertDelivery, currentPhase } = require('../store');
const { emitDelivery } = require('../sockets');

module.exports = (app) => {
  const router = express.Router();
  const db = app.locals.db;
  router.use(requireRole('parent', 'alios_console'));

  router.post('/send', (req, res) => {
    const { characterId, senderId, app: targetApp, body, messageId, imagePath } = req.body || {};
    const phase = currentPhase(db);
    let payload;
    if (messageId) {
      const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
      if (!msg) return res.status(404).json({ error: 'message not found' });
      payload = buildDelivery({ message: msg, characterId, phase, now: Date.now() });
    } else {
      payload = buildDelivery({
        freeType: { senderId, app: targetApp || 'messages', body, imagePath },
        characterId, phase, now: Date.now(),
      });
    }
    const id = insertDelivery(db, payload);
    const sender = db.prepare('SELECT name, avatar, is_allie FROM senders WHERE id = ?').get(payload.sender_id);
    const delivery = { id, ...payload, sender_name: sender.name, sender_avatar: sender.avatar, is_allie: sender.is_allie };
    const io = app.locals.io;
    if (io) emitDelivery(io, characterId, delivery);
    res.json({ ok: true, delivery });
  });

  return router;
};
```

- [ ] **Step 8: Run test, expect PASS.**

Run: `npm test -- tests/api-console.test.js`

- [ ] **Step 9: Commit**

```bash
git add src/store.js src/routes/console.js tests/store.test.js tests/api-console.test.js
git commit -m "feat: console send route persists delivery and emits socket"
```

### Task 3.7: Player state + mark-read routes

**Files:**
- Rewrite: `src/routes/player.js`
- Test: `tests/api-player.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/api-player.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

async function playerLogin(base, db) {
  const c = db.prepare('SELECT * FROM characters ORDER BY sort_order LIMIT 1').get();
  const res = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ characterId: c.id, pin: c.pin }),
  });
  return { cookie: res.headers.get('set-cookie').split(';')[0], characterId: c.id };
}

test('player state returns deliveries and phase', async () => {
  const { base, close, db } = await startTestServer();
  const { cookie, characterId } = await playerLogin(base, db);
  const allie = db.prepare('SELECT id FROM senders WHERE is_allie = 1').get();
  db.prepare(`INSERT INTO deliveries (character_id, sender_id, app, body, phase_at_send, sent_at)
              VALUES (?, ?, 'messages', 'hi', 1, 10)`).run(characterId, allie.id);

  const res = await fetch(`${base}/api/state`, { headers: { cookie } });
  const body = await res.json();
  assert.strictEqual(body.phase, 1);
  assert.strictEqual(body.deliveries.length, 1);
  assert.strictEqual(body.character.id, characterId);
  await close();
});

test('player can mark a delivery read', async () => {
  const { base, close, db } = await startTestServer();
  const { cookie, characterId } = await playerLogin(base, db);
  const allie = db.prepare('SELECT id FROM senders WHERE is_allie = 1').get();
  const info = db.prepare(`INSERT INTO deliveries (character_id, sender_id, app, body, phase_at_send, sent_at)
              VALUES (?, ?, 'messages', 'hi', 1, 10)`).run(characterId, allie.id);
  const res = await fetch(`${base}/api/read/${info.lastInsertRowid}`, { method: 'POST', headers: { cookie } });
  assert.strictEqual(res.status, 200);
  const row = db.prepare('SELECT read_at FROM deliveries WHERE id = ?').get(info.lastInsertRowid);
  assert.ok(row.read_at);
  await close();
});
```

- [ ] **Step 2: Run test, expect FAIL.**

Run: `npm test -- tests/api-player.test.js`

- [ ] **Step 3: Write src/routes/player.js**

```js
// src/routes/player.js
const express = require('express');
const { requireRole } = require('../middleware');
const { listDeliveriesForCharacter, markRead, currentPhase } = require('../store');
const { emitRead } = require('../sockets');

module.exports = (app) => {
  const router = express.Router();
  const db = app.locals.db;
  const guard = requireRole('player', 'alios_session');

  router.get('/state', guard, (req, res) => {
    const id = req.claims.characterId;
    const character = db.prepare('SELECT id, name, avatar FROM characters WHERE id = ?').get(id);
    res.json({
      character,
      phase: currentPhase(db),
      deliveries: listDeliveriesForCharacter(db, id),
    });
  });

  router.post('/read/:deliveryId', guard, (req, res) => {
    const id = req.claims.characterId;
    const ok = markRead(db, Number(req.params.deliveryId), id, Date.now());
    if (ok && app.locals.io) emitRead(app.locals.io, id, Number(req.params.deliveryId));
    res.json({ ok });
  });

  return router;
};
```

- [ ] **Step 4: Run test, expect PASS.**

Run: `npm test -- tests/api-player.test.js`

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/routes/player.js tests/api-player.test.js
git commit -m "feat: player state and mark-read routes"
```

**Milestone 3 checkpoint:** the backend can authenticate a player, accept a console send, persist it, push it over a socket, and report read receipts. This is the spine. Review here before building UI.

---

## Milestone 4: Player app shell + delivery feel

These tasks are front end. Verification is in the browser, noted per task. No unit tests for DOM rendering; the socket/data contract is already covered by Milestone 3 tests.

### Task 4.1: Player PWA shell, login, home screen, idle screen

**Files:**
- Rewrite: `public/player/index.html`
- Create: `public/player/styles.css`
- Create: `public/player/app.js`
- Create: `public/player/manifest.json`

- [ ] **Step 1: Write index.html**

```html
<!-- public/player/index.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0a1f1c" />
  <link rel="manifest" href="/manifest.json" />
  <title>A.L.I.</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body data-phase="1">
  <div id="app"></div>
  <audio id="chime" src="/sounds/allie-chime.mp3" preload="auto"></audio>
  <script src="/socket.io/socket.io.js"></script>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write styles.css with phase theme tokens**

```css
/* public/player/styles.css */
:root {
  --bg-top: #102a27; --bg-bot: #081715; --ink: #eafff8; --muted: #bfe6dd;
  --accent: #3ad29f; --badge: #ff3b30; --glow: rgba(58,210,159,.55);
}
/* Phase overrides cool/sicken the palette. */
body[data-phase="2"] { --accent:#6fc7b0; --bg-top:#13312c; }
body[data-phase="3"] { --accent:#c9b25a; --bg-top:#2a2a16; --glow:rgba(201,178,90,.5); }
body[data-phase="4"] { --accent:#b85a6a; --bg-top:#2a1622; --ink:#f3dfe6; --glow:rgba(184,90,106,.5); }
body[data-phase="5"] { --accent:#7a4bd0; --bg-top:#1a1230; --glow:rgba(122,75,208,.5); }

* { box-sizing: border-box; }
body { margin:0; font-family: system-ui, sans-serif;
  background: linear-gradient(170deg, var(--bg-top), var(--bg-bot)); color: var(--ink);
  min-height: 100vh; transition: background .8s ease, color .8s ease; }
.screen { max-width: 460px; margin: 0 auto; padding: 18px 16px; min-height: 100vh; }

.statusbar { display:flex; justify-content:space-between; color:var(--muted); font-size:12px; letter-spacing:.5px; }
.idle { text-align:center; margin-top:32vh; }
.idle .day { font-size:22px; font-weight:600; }
.idle .hint { color:var(--muted); font-size:12px; margin-top:8px; }

.grid { display:grid; grid-template-columns:repeat(3,1fr); gap:22px 8px; margin-top:24px; }
.app-icon { text-align:center; cursor:pointer; }
.app-icon .tile { position:relative; width:62px;height:62px;margin:0 auto;border-radius:16px;
  display:flex;align-items:center;justify-content:center;font-size:26px;color:#04201b; }
.app-icon .label { font-size:11px; margin-top:6px; }
.badge { position:absolute; top:-6px; right:-6px; background:var(--badge); color:#fff;
  font-size:11px; font-weight:700; min-width:20px; height:20px; border-radius:10px;
  display:flex; align-items:center; justify-content:center; padding:0 5px; box-shadow:0 0 0 2px var(--bg-bot); }

.login button { width:100%; padding:14px; border:none; border-radius:12px; background:var(--accent);
  color:#04201b; font-size:16px; font-weight:600; margin-top:10px; }
.pin { font-size:24px; letter-spacing:8px; text-align:center; padding:12px; width:100%;
  border-radius:12px; border:1px solid var(--accent); background:transparent; color:var(--ink); }

.glow { animation: glow 1.1s ease; }
@keyframes glow { 0%{box-shadow:inset 0 0 0 0 var(--glow);} 30%{box-shadow:inset 0 0 90px 10px var(--glow);} 100%{box-shadow:inset 0 0 0 0 transparent;} }

.thread { margin-top:12px; }
.bubble { background:rgba(255,255,255,.08); border-radius:14px; padding:10px 12px; margin:8px 0; max-width:85%; }
.bubble .who { font-size:11px; color:var(--muted); margin-bottom:3px; }
.bubble img { max-width:100%; border-radius:10px; margin-top:6px; }
.backbar { color:var(--accent); cursor:pointer; font-size:14px; margin-bottom:8px; display:inline-block; }
.locked { text-align:center; color:var(--muted); margin-top:30vh; }
```

- [ ] **Step 3: Write manifest.json**

```json
{
  "name": "A.L.I.",
  "short_name": "A.L.I.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#081715",
  "theme_color": "#0a1f1c",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 4: Write app.js (login + home + idle; apps added next task)**

```js
// public/player/app.js
const root = document.getElementById('app');
const chime = document.getElementById('chime');
let state = { character: null, phase: 1, deliveries: [], view: 'idle' };
let socket = null;

const APPS = [
  { key:'messages', label:'Messages', icon:'\u{1F4AC}', color:'#3ad29f' },
  { key:'allie',    label:'Allie',    icon:'◉',    color:'#7fd8ee' },
  { key:'archive',  label:'Archive',  icon:'\u{1F50D}', color:'#8a9bff' },
  { key:'photos',   label:'Photos',   icon:'\u{1F5BC}', color:'#ffcf5c' },
  { key:'decks',    label:'Decks',    icon:'\u{1F5FA}', color:'#5fbf8f' },
  { key:'settings', label:'Settings', icon:'⚙',    color:'#9aa8a4' },
];

async function boot() {
  const res = await fetch('/api/state');
  if (res.status === 200) {
    const data = await res.json();
    Object.assign(state, data);
    connectSocket();
    render();
  } else {
    renderLogin();
  }
}

async function renderLogin() {
  const r = await fetch('/api/roster');
  const { characters } = await r.json();
  root.innerHTML = `<div class="screen login">
    <h2>Who are you?</h2>
    <div id="picker"></div>
    <input class="pin" id="pin" inputmode="numeric" maxlength="6" placeholder="PIN" />
    <button id="go">Enter</button>
    <p id="err" style="color:#ff7a7a"></p>
  </div>`;
  const picker = document.getElementById('picker');
  let chosen = null;
  characters.forEach((c) => {
    const b = document.createElement('button');
    b.textContent = c.name; b.style.opacity = '.6';
    b.onclick = () => { chosen = c.id; [...picker.children].forEach(x=>x.style.opacity='.6'); b.style.opacity='1'; };
    picker.appendChild(b);
  });
  document.getElementById('go').onclick = async () => {
    const pin = document.getElementById('pin').value;
    const res = await fetch('/api/login', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ characterId: chosen, pin }) });
    if (res.status === 200) boot();
    else document.getElementById('err').textContent = 'That is not right. Allie is watching.';
  };
}

function connectSocket() {
  socket = io({ auth: { token: '' } }); // cookie session also identifies; token optional
  socket.on('delivery', (d) => {
    state.deliveries.push(d);
    notify(d);
    if (state.view !== 'idle') render();
  });
  socket.on('phase', ({ phase }) => { state.phase = phase; applyPhase(); render(); });
}

function notify(d) {
  try { chime.currentTime = 0; chime.play().catch(()=>{}); } catch {}
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]); // Android only; no-op on iOS
  document.body.classList.remove('glow'); void document.body.offsetWidth; document.body.classList.add('glow');
}

function applyPhase() { document.body.dataset.phase = String(state.phase); }

function unreadByApp() {
  const counts = {};
  for (const d of state.deliveries) if (!d.read_at) counts[d.app] = (counts[d.app]||0)+1;
  return counts;
}

function render() {
  applyPhase();
  if (state.view === 'idle') return renderIdle();
  if (state.view === 'home') return renderHome();
  return renderApp(state.view);
}

function renderIdle() {
  root.innerHTML = `<div class="screen" onclick="window._home()">
    <div class="statusbar"><span>7:02</span><span>A.L.I.</span><span>84%</span></div>
    <div class="idle">
      <div class="day">Day 14,602 of the Voyage</div>
      <div class="hint">tap to wake</div>
    </div>
  </div>`;
}

function renderHome() {
  const counts = unreadByApp();
  const tiles = APPS.map(a => `
    <div class="app-icon" onclick="window._open('${a.key}')">
      <div class="tile" style="background:linear-gradient(160deg, ${a.color}, ${a.color}cc)">
        ${a.icon}${counts[a.key] ? `<span class="badge">${counts[a.key]}</span>` : ''}
      </div>
      <div class="label">${a.label}</div>
    </div>`).join('');
  root.innerHTML = `<div class="screen">
    <div class="statusbar"><span>7:02</span><span>A.L.I.</span><span>84%</span></div>
    <div style="text-align:center;margin-top:14px;color:var(--muted)">Good morning, ${state.character.name}</div>
    <div class="grid">${tiles}</div>
  </div>`;
}

window._home = () => { state.view = 'home'; render(); };
window._open = (key) => { state.view = key; render(); };
window._back = () => { state.view = 'home'; render(); };

boot();
```

- [ ] **Step 5: Add a placeholder renderApp so home is clickable**

Append to `public/player/app.js`:

```js
function renderApp(key) {
  root.innerHTML = `<div class="screen">
    <span class="backbar" onclick="window._back()">‹ Home</span>
    <h2>${key}</h2><p style="color:var(--muted)">Coming up next task.</p>
  </div>`;
}
```

- [ ] **Step 6: Add a placeholder chime + icons so assets resolve**

```bash
# silent placeholder audio and 1x1 icons; real assets added before launch
mkdir -p public/player/icons
printf '' > public/player/sounds/allie-chime.mp3
printf '' > public/player/icons/icon-192.png
printf '' > public/player/icons/icon-512.png
```

- [ ] **Step 7: Manual verification**

Run: `npm start` then open `http://localhost:3007` in a browser.
Expected: login picker lists the seeded crew; entering a correct seeded PIN (e.g. `1000` for the first) shows the idle screen; tapping wakes to the home grid with six apps; no console errors.

- [ ] **Step 8: Commit**

```bash
git add public/player
git commit -m "feat: player PWA shell with login, idle, home screen, badges"
```

### Task 4.2: Messages app + glow/chime/badge on live delivery

**Files:**
- Modify: `public/player/app.js`

- [ ] **Step 1: Replace renderApp with a real Messages view and a generic stub for the rest**

Replace the placeholder `renderApp` from Task 4.1 Step 5 with:

```js
function renderApp(key) {
  const back = `<span class="backbar" onclick="window._back()">‹ Home</span>`;
  if (key === 'messages') return renderMessages(back);
  // other apps implemented in Milestone 6; show a calm placeholder for now
  root.innerHTML = `<div class="screen">${back}<h2 style="text-transform:capitalize">${key}</h2>
    <p style="color:var(--muted)">Nothing here yet.</p></div>`;
}

function renderMessages(back) {
  // mark unread messages-app deliveries as read
  state.deliveries.filter(d => d.app === 'messages' && !d.read_at).forEach(markReadNow);
  const items = state.deliveries.filter(d => d.app === 'messages').map(d => `
    <div class="bubble">
      <div class="who">${escapeHtml(d.sender_name || 'Unknown')}</div>
      <div>${escapeHtml(d.body)}</div>
      ${d.image_path ? `<img src="${d.image_path}" alt="" />` : ''}
    </div>`).join('');
  root.innerHTML = `<div class="screen">${back}<h2>Messages</h2>
    <div class="thread">${items || '<p style="color:var(--muted)">No messages.</p>'}</div></div>`;
}

async function markReadNow(d) {
  if (d.read_at) return;
  d.read_at = Date.now();
  try { await fetch(`/api/read/${d.id}`, { method: 'POST' }); } catch {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
```

- [ ] **Step 2: Manual verification of the live magic**

1. Run `npm start`. Open the player at `http://localhost:3007`, log in as the first crew.
2. In a second tab open `http://localhost:3007/console`, log in with parent PIN `1234` (console UI is built in Milestone 5; for now POST directly):

```bash
# get console cookie
curl -s -c /tmp/cj -X POST localhost:3007/api/console/login -H 'content-type: application/json' -d '{"pin":"1234"}' >/dev/null
# find Allie sender id then send to character 1
curl -s -b /tmp/cj -X POST localhost:3007/api/console/send -H 'content-type: application/json' \
  -d '{"characterId":1,"senderId":1,"app":"messages","body":"Did you find Téa? Do not go past the Rec deck."}'
```

Expected: the player screen flashes a glow, the chime attempts to play, and a red badge appears on Messages. Opening Messages shows the bubble and clears the badge.

- [ ] **Step 3: Commit**

```bash
git add public/player/app.js
git commit -m "feat: Messages app with live glow/chime/badge on delivery"
```

**Milestone 4 checkpoint:** a real phone, opened on the table, receives a private DM message with chime, glow, and badge. Demo this before continuing.

---

## Milestone 5: DM console

### Task 5.1: Console shell, login, roster with read receipts

**Files:**
- Rewrite: `public/console/index.html`
- Create: `public/console/console.css`
- Create: `public/console/console.js`
- Modify: `src/routes/console.js` (add `GET /roster`)

- [ ] **Step 1: Add console roster endpoint with read status**

In `src/routes/console.js`, before `return router;`, add:

```js
  router.get('/roster', (req, res) => {
    const chars = db.prepare('SELECT id, name FROM characters ORDER BY sort_order').all();
    const withCounts = chars.map((c) => {
      const last = db.prepare(
        'SELECT body, sent_at, read_at FROM deliveries WHERE character_id = ? ORDER BY sent_at DESC LIMIT 1'
      ).get(c.id);
      const unread = db.prepare(
        'SELECT count(*) n FROM deliveries WHERE character_id = ? AND read_at IS NULL'
      ).get(c.id).n;
      return { ...c, lastBody: last ? last.body : null, lastRead: last ? !!last.read_at : null, unread };
    });
    res.json({ characters: withCounts });
  });

  router.get('/senders', (req, res) => {
    res.json({ senders: db.prepare('SELECT id, name, is_allie FROM senders ORDER BY is_allie DESC, name').all() });
  });
```

- [ ] **Step 2: Write console index.html**

```html
<!-- public/console/index.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>aliOS console</title><link rel="stylesheet" href="/console/console.css" />
</head>
<body>
  <div id="app"></div>
  <script src="/socket.io/socket.io.js"></script>
  <script src="/console/console.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write console.css**

```css
/* public/console/console.css */
* { box-sizing:border-box; } body { margin:0; font-family:system-ui,sans-serif; background:#0e1614; color:#e7f2ee; }
.wrap { display:grid; grid-template-columns:280px 1fr; min-height:100vh; }
.side { background:#0a1210; border-right:1px solid #1e2c28; padding:14px; }
.main { padding:16px; }
.crew { padding:10px; border-radius:10px; cursor:pointer; margin-bottom:6px; background:#12201c; }
.crew.active { outline:2px solid #3ad29f; }
.crew .meta { font-size:12px; color:#8fb3aa; }
.dot { display:inline-block; width:8px;height:8px;border-radius:50%; margin-left:6px; }
.dot.read { background:#3ad29f; } .dot.unread { background:#ff9f43; }
.row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:8px 0; }
select, input, textarea, button { font:inherit; border-radius:8px; border:1px solid #2a3a35; background:#0d1815; color:#e7f2ee; padding:8px; }
button.primary { background:#3ad29f; color:#04201b; border:none; font-weight:700; cursor:pointer; }
.lib-item { padding:8px; border:1px solid #233330; border-radius:8px; margin:6px 0; cursor:pointer; }
.lib-item:hover { border-color:#3ad29f; }
.phasebar { display:flex; gap:6px; }
.phasebar button { cursor:pointer; } .phasebar button.cur { background:#c9b25a; color:#04201b; }
.login { max-width:320px; margin:18vh auto; text-align:center; }
```

- [ ] **Step 4: Write console.js (login + roster + send panel)**

```js
// public/console/console.js
const root = document.getElementById('app');
let s = { characters: [], senders: [], selected: null, socket: null };

async function boot() {
  const r = await fetch('/api/console/roster');
  if (r.status !== 200) return renderLogin();
  s.characters = (await r.json()).characters;
  s.senders = (await (await fetch('/api/console/senders')).json()).senders;
  s.selected = s.characters[0] ? s.characters[0].id : null;
  connect();
  render();
}

function renderLogin() {
  root.innerHTML = `<div class="login"><h2>aliOS console</h2>
    <input id="pin" class="pin" placeholder="Parent PIN" />
    <button class="primary" id="go">Unlock</button><p id="e" style="color:#ff7a7a"></p></div>`;
  document.getElementById('go').onclick = async () => {
    const res = await fetch('/api/console/login', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ pin: document.getElementById('pin').value }) });
    if (res.status === 200) boot(); else document.getElementById('e').textContent = 'No.';
  };
}

function connect() {
  s.socket = io();
  s.socket.on('delivery:read', refreshRoster);
  s.socket.on('delivery:sent', refreshRoster);
}
async function refreshRoster() {
  s.characters = (await (await fetch('/api/console/roster')).json()).characters;
  renderSide();
}

function render() {
  root.innerHTML = `<div class="wrap"><div class="side" id="side"></div><div class="main" id="main"></div></div>`;
  renderSide(); renderMain();
}

function renderSide() {
  const side = document.getElementById('side'); if (!side) return;
  side.innerHTML = `<h3>Crew</h3>` + s.characters.map(c => `
    <div class="crew ${c.id===s.selected?'active':''}" onclick="window._sel(${c.id})">
      <div>${c.name} ${c.unread?`<span style="color:#ff9f43">(${c.unread})</span>`:''}
        ${c.lastRead===null?'':`<span class="dot ${c.lastRead?'read':'unread'}"></span>`}</div>
      <div class="meta">${c.lastBody?escapeHtml(c.lastBody).slice(0,40):'no messages yet'}</div>
    </div>`).join('');
}

function renderMain() {
  const main = document.getElementById('main'); if (!main) return;
  const senderOpts = s.senders.map(x => `<option value="${x.id}">${x.name}${x.is_allie?' (Allie)':''}</option>`).join('');
  main.innerHTML = `
    <div class="phasebar" id="phasebar"></div>
    <h3>Send to ${nameOf(s.selected)}</h3>
    <div class="row">
      <select id="sender">${senderOpts}</select>
      <select id="app">
        <option value="messages">Messages</option><option value="allie">Allie</option>
        <option value="archive">Archive</option><option value="photos">Photos</option>
      </select>
    </div>
    <div class="row"><textarea id="body" rows="3" style="flex:1" placeholder="Type a line..."></textarea></div>
    <div class="row"><button class="primary" onclick="window._send()">Send</button></div>
    <h3>Library</h3><div id="lib"></div>`;
  renderPhasebar(); renderLibrary();
}

window._sel = (id) => { s.selected = id; renderSide(); renderMain(); };
window._send = async () => {
  const body = document.getElementById('body').value.trim(); if (!body) return;
  await fetch('/api/console/send', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ characterId: s.selected, senderId: Number(document.getElementById('sender').value),
      app: document.getElementById('app').value, body }) });
  document.getElementById('body').value = '';
};

function nameOf(id){ const c=s.characters.find(x=>x.id===id); return c?c.name:'—'; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// phasebar + library are filled in Tasks 5.2 and 7.x; define stubs so render works
function renderPhasebar(){ const el=document.getElementById('phasebar'); if(el) el.innerHTML=''; }
function renderLibrary(){ const el=document.getElementById('lib'); if(el) el.innerHTML='<p style="color:#8fb3aa">Library coming up.</p>'; }

boot();
```

- [ ] **Step 5: Manual verification**

Run `npm start`, open `http://localhost:3007/console`, unlock with `1234`. Expected: crew list on the left, a send panel that delivers to the selected player's phone (verify with a player tab open).

- [ ] **Step 6: Commit**

```bash
git add public/console src/routes/console.js
git commit -m "feat: DM console shell with roster, read receipts, send panel"
```

### Task 5.2: Message library CRUD + one-tap fire

**Files:**
- Modify: `src/routes/console.js`
- Modify: `public/console/console.js`
- Test: `tests/api-library.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/api-library.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

async function consoleCookie(base) {
  const r = await fetch(`${base}/api/console/login`, { method:'POST',
    headers:{'content-type':'application/json'}, body: JSON.stringify({ pin:'1234' }) });
  return r.headers.get('set-cookie').split(';')[0];
}

test('library create then list', async () => {
  const { base, close, db } = await startTestServer();
  const cookie = await consoleCookie(base);
  const allie = db.prepare('SELECT id FROM senders WHERE is_allie=1').get();
  const c = await fetch(`${base}/api/console/messages`, { method:'POST',
    headers:{'content-type':'application/json', cookie},
    body: JSON.stringify({ senderId: allie.id, app:'messages', body:'Stay on the lit decks.', label:'warning' }) });
  assert.strictEqual(c.status, 200);
  const list = await (await fetch(`${base}/api/console/messages`, { headers:{cookie} })).json();
  assert.strictEqual(list.messages.length, 1);
  assert.strictEqual(list.messages[0].body, 'Stay on the lit decks.');
  await close();
});
```

- [ ] **Step 2: Run test, expect FAIL.**

Run: `npm test -- tests/api-library.test.js`

- [ ] **Step 3: Add library routes to src/routes/console.js**

Before `return router;` add:

```js
  router.get('/messages', (req, res) => {
    res.json({ messages: db.prepare(
      `SELECT m.*, s.name AS sender_name FROM messages m JOIN senders s ON s.id = m.sender_id
       ORDER BY m.sort_order, m.id`).all() });
  });

  router.post('/messages', (req, res) => {
    const { senderId, app: a = 'messages', body, imagePath = null, phaseGate = null, label = null } = req.body || {};
    if (!body || !String(body).trim()) return res.status(400).json({ error: 'body required' });
    const info = db.prepare(
      `INSERT INTO messages (sender_id, app, body, image_path, phase_gate, label)
       VALUES (?,?,?,?,?,?)`).run(senderId, a, body, imagePath, phaseGate, label);
    res.json({ ok: true, id: info.lastInsertRowid });
  });

  router.delete('/messages/:id', (req, res) => {
    db.prepare('DELETE FROM messages WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  });
```

- [ ] **Step 4: Run test, expect PASS.**

Run: `npm test -- tests/api-library.test.js`

- [ ] **Step 5: Replace renderLibrary stub in console.js**

```js
async function renderLibrary() {
  const el = document.getElementById('lib'); if (!el) return;
  const { messages } = await (await fetch('/api/console/messages')).json();
  el.innerHTML = `<div class="row">
      <button onclick="window._newLib()">+ New line</button>
    </div>` + messages.map(m => `
    <div class="lib-item" onclick="window._fire(${m.id})">
      <strong>${m.sender_name}</strong> <span style="color:#8fb3aa">[${m.app}${m.phase_gate?` · P${m.phase_gate}+`:''}]</span><br>
      ${escapeHtml(m.body)}
      <span style="float:right;color:#ff7a7a" onclick="event.stopPropagation();window._delLib(${m.id})">delete</span>
    </div>`).join('');
}

window._fire = async (messageId) => {
  await fetch('/api/console/send', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ characterId: s.selected, messageId }) });
};
window._delLib = async (id) => { await fetch(`/api/console/messages/${id}`, { method:'DELETE' }); renderLibrary(); };
window._newLib = async () => {
  const body = prompt('Line text:'); if (!body) return;
  const senderId = Number(document.getElementById('sender').value);
  const app = document.getElementById('app').value;
  await fetch('/api/console/messages', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ senderId, app, body }) });
  renderLibrary();
};
```

- [ ] **Step 6: Manual verification**

Create a library line, then click it to fire at the selected player. Confirm it lands on the player phone with chime/glow/badge.

- [ ] **Step 7: Commit**

```bash
git add src/routes/console.js public/console/console.js tests/api-library.test.js
git commit -m "feat: message library CRUD and one-tap fire"
```

### Task 5.3: Image upload and push

**Files:**
- Rewrite: `src/routes/uploads.js`
- Modify: `public/console/console.js`
- Test: `tests/api-uploads.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/api-uploads.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

async function consoleCookie(base) {
  const r = await fetch(`${base}/api/console/login`, { method:'POST',
    headers:{'content-type':'application/json'}, body: JSON.stringify({ pin:'1234' }) });
  return r.headers.get('set-cookie').split(';')[0];
}

// a tiny valid 1x1 PNG
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082','hex');

test('upload returns a served path requiring console auth to post', async () => {
  const { base, close } = await startTestServer();
  const cookie = await consoleCookie(base);
  const form = new FormData();
  form.append('image', new Blob([PNG], { type:'image/png' }), 'x.png');
  const res = await fetch(`${base}/api/uploads`, { method:'POST', headers:{cookie}, body: form });
  assert.strictEqual(res.status, 200);
  const { path: p } = await res.json();
  assert.match(p, /^\/api\/uploads\//);
  await close();
});

test('upload rejects without console auth', async () => {
  const { base, close } = await startTestServer();
  const form = new FormData();
  form.append('image', new Blob([PNG], { type:'image/png' }), 'x.png');
  const res = await fetch(`${base}/api/uploads`, { method:'POST', body: form });
  assert.strictEqual(res.status, 401);
  await close();
});
```

- [ ] **Step 2: Run test, expect FAIL.**

Run: `npm test -- tests/api-uploads.test.js`

- [ ] **Step 3: Write src/routes/uploads.js**

```js
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
```

- [ ] **Step 4: Run test, expect PASS.**

Run: `npm test -- tests/api-uploads.test.js`

- [ ] **Step 5: Add image attach to the console send panel**

In `renderMain` in `console.js`, add to the textarea row an upload control, and update `_send` to include the uploaded path. Add after the `<textarea>` row:

```js
// inside renderMain template, add this row after the textarea row:
// <div class="row"><input type="file" id="img" accept="image/*" /></div>
```

Then update `window._send`:

```js
window._send = async () => {
  const body = document.getElementById('body').value.trim();
  const fileEl = document.getElementById('img');
  let imagePath = null;
  if (fileEl && fileEl.files[0]) {
    const fd = new FormData(); fd.append('image', fileEl.files[0]);
    imagePath = (await (await fetch('/api/uploads', { method:'POST', body: fd })).json()).path;
  }
  if (!body && !imagePath) return;
  await fetch('/api/console/send', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ characterId: s.selected, senderId: Number(document.getElementById('sender').value),
      app: document.getElementById('app').value, body: body || ' ', imagePath }) });
  document.getElementById('body').value = ''; if (fileEl) fileEl.value = '';
};
```

Also add the file input row to the `renderMain` template string (after the textarea row):

```
    <div class="row"><input type="file" id="img" accept="image/*" /></div>
```

- [ ] **Step 6: Manual verification**

Send an image to a player; confirm it appears in their Messages (and later Photos) with the bubble.

- [ ] **Step 7: Commit**

```bash
git add src/routes/uploads.js public/console/console.js tests/api-uploads.test.js
git commit -m "feat: image upload (sharp webp) and push to player"
```

**Milestone 5 checkpoint:** the console is now a usable cockpit: roster with read receipts, free-type send, a one-tap library, and image push. Full demo before story apps.

---

## Milestone 6: Story apps (Allie, Archive, Photos, Decks, Settings)

### Task 6.1: Archive backend (search + editor)

**Files:**
- Modify: `src/routes/player.js` (search)
- Modify: `src/routes/console.js` (editor CRUD)
- Test: `tests/api-archive.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/api-archive.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

async function login(base, db) {
  const c = db.prepare('SELECT * FROM characters ORDER BY sort_order LIMIT 1').get();
  const r = await fetch(`${base}/api/login`, { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ characterId:c.id, pin:c.pin }) });
  return r.headers.get('set-cookie').split(';')[0];
}
async function consoleCookie(base) {
  const r = await fetch(`${base}/api/console/login`, { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ pin:'1234' }) });
  return r.headers.get('set-cookie').split(';')[0];
}

test('redacted archive entry returns ACCESS DENIED to players', async () => {
  const { base, close, db } = await startTestServer();
  const cc = await consoleCookie(base);
  await fetch(`${base}/api/console/archive`, { method:'POST', headers:{'content-type':'application/json', cookie:cc},
    body: JSON.stringify({ keyword:'Window', response:'A viewport to the stars.', redacted:1 }) });
  const pc = await login(base, db);
  const r = await (await fetch(`${base}/api/archive?q=window`, { headers:{cookie:pc} })).json();
  assert.strictEqual(r.results[0].redacted, true);
  assert.match(r.results[0].response, /ACCESS DENIED/i);
  await close();
});

test('non-redacted entry returns its content', async () => {
  const { base, close, db } = await startTestServer();
  const cc = await consoleCookie(base);
  await fetch(`${base}/api/console/archive`, { method:'POST', headers:{'content-type':'application/json', cookie:cc},
    body: JSON.stringify({ keyword:'Rec deck', response:'Skating ring, level 3.', redacted:0 }) });
  const pc = await login(base, db);
  const r = await (await fetch(`${base}/api/archive?q=rec`, { headers:{cookie:pc} })).json();
  assert.match(r.results[0].response, /Skating ring/);
  await close();
});
```

- [ ] **Step 2: Run test, expect FAIL.**

Run: `npm test -- tests/api-archive.test.js`

- [ ] **Step 3: Add player archive search to src/routes/player.js**

Before `return router;`:

```js
  router.get('/archive', guard, (req, res) => {
    const q = `%${String(req.query.q || '').trim().toLowerCase()}%`;
    const phase = currentPhase(db);
    const rows = db.prepare(
      `SELECT * FROM archive_entries
       WHERE lower(keyword) LIKE ? AND (phase_gate IS NULL OR phase_gate <= ?)
       ORDER BY keyword`).all(q, phase);
    const results = rows.map((r) => ({
      keyword: r.keyword,
      redacted: !!r.redacted,
      response: r.redacted ? 'ACCESS DENIED — clearance insufficient.' : r.response,
    }));
    res.json({ results });
  });
```

- [ ] **Step 4: Add console archive CRUD to src/routes/console.js**

Before `return router;`:

```js
  router.get('/archive', (req, res) => {
    res.json({ entries: db.prepare('SELECT * FROM archive_entries ORDER BY keyword').all() });
  });
  router.post('/archive', (req, res) => {
    const { id, keyword, response, redacted = 0, phaseGate = null } = req.body || {};
    if (id) {
      db.prepare('UPDATE archive_entries SET keyword=?, response=?, redacted=?, phase_gate=? WHERE id=?')
        .run(keyword, response, redacted ? 1 : 0, phaseGate, id);
      return res.json({ ok: true, id });
    }
    const info = db.prepare('INSERT INTO archive_entries (keyword, response, redacted, phase_gate) VALUES (?,?,?,?)')
      .run(keyword, response, redacted ? 1 : 0, phaseGate);
    res.json({ ok: true, id: info.lastInsertRowid });
  });
  router.post('/archive/:id/redact', (req, res) => {
    db.prepare('UPDATE archive_entries SET redacted = ? WHERE id = ?')
      .run(req.body && req.body.redacted ? 1 : 0, Number(req.params.id));
    res.json({ ok: true });
  });
```

- [ ] **Step 5: Run test, expect PASS.**

Run: `npm test -- tests/api-archive.test.js`

- [ ] **Step 6: Commit**

```bash
git add src/routes/player.js src/routes/console.js tests/api-archive.test.js
git commit -m "feat: archive search with redaction and console editor"
```

### Task 6.2: Player app views for Allie, Archive, Photos, Decks, Settings

**Files:**
- Modify: `public/player/app.js`
- Modify: `src/routes/player.js` (decks list)

- [ ] **Step 1: Add a decks endpoint to src/routes/player.js**

Before `return router;`:

```js
  router.get('/decks', guard, (req, res) => {
    res.json({ decks: db.prepare('SELECT id, name, image_path, unlocked FROM decks ORDER BY sort_order').all() });
  });
```

- [ ] **Step 2: Replace renderApp routing in app.js to dispatch all apps**

Replace the `renderApp` function with:

```js
function renderApp(key) {
  const back = `<span class="backbar" onclick="window._back()">‹ Home</span>`;
  if (key === 'messages') return renderMessages(back);
  if (key === 'allie') return renderAllie(back);
  if (key === 'archive') return renderArchive(back);
  if (key === 'photos') return renderPhotos(back);
  if (key === 'decks') return renderDecks(back);
  if (key === 'settings') return renderSettings(back);
  root.innerHTML = `<div class="screen">${back}<p>—</p></div>`;
}

const ALLIE_GREETING = {
  1: 'Good morning. I am so glad you are here. How can I help you today?',
  2: 'You have been wandering. That is alright. I just like to know where you are.',
  3: 'Please stop looking for the Window. Please. I am asking you nicely.',
  4: 'You should not have seen that. I cannot let you leave. It is for your safety.',
  5: '...',
};

function renderAllie(back) {
  // mark allie-app deliveries read
  state.deliveries.filter(d => d.app === 'allie' && !d.read_at).forEach(markReadNow);
  const extra = state.deliveries.filter(d => d.app === 'allie').map(d =>
    `<div class="bubble"><div class="who">Allie</div>${escapeHtml(d.body)}</div>`).join('');
  root.innerHTML = `<div class="screen">${back}<h2>Allie</h2>
    <div class="bubble"><div class="who">Allie</div>${ALLIE_GREETING[state.phase] || ALLIE_GREETING[1]}</div>
    ${extra}</div>`;
}

function renderArchive(back) {
  root.innerHTML = `<div class="screen">${back}<h2>Archive</h2>
    <input class="pin" id="q" placeholder="Search the ship's records" style="letter-spacing:normal;font-size:16px" />
    <div id="ares" class="thread"></div></div>`;
  const run = async () => {
    const q = document.getElementById('q').value;
    const { results } = await (await fetch(`/api/archive?q=${encodeURIComponent(q)}`)).json();
    document.getElementById('ares').innerHTML = results.length
      ? results.map(r => `<div class="bubble"><div class="who">${escapeHtml(r.keyword)}</div>
          <div style="${r.redacted?'color:#ff7a7a':''}">${escapeHtml(r.response)}</div></div>`).join('')
      : '<p style="color:var(--muted)">No records found.</p>';
  };
  document.getElementById('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
}

function renderPhotos(back) {
  state.deliveries.filter(d => d.app === 'photos' && !d.read_at).forEach(markReadNow);
  const imgs = state.deliveries.filter(d => (d.app === 'photos' || d.image_path) && d.image_path)
    .map(d => `<img src="${d.image_path}" alt="" style="width:100%;border-radius:10px;margin:6px 0" />`).join('');
  root.innerHTML = `<div class="screen">${back}<h2>Photos</h2>${imgs || '<p style="color:var(--muted)">No photos.</p>'}</div>`;
}

async function renderDecks(back) {
  root.innerHTML = `<div class="screen">${back}<h2>Decks</h2><div id="decks">loading…</div></div>`;
  const { decks } = await (await fetch('/api/decks')).json();
  document.getElementById('decks').innerHTML = decks.length ? decks.map(d => `
    <div class="bubble" style="opacity:${d.unlocked?1:0.4}">
      <div class="who">${d.unlocked?'':'\u{1F512} '}${escapeHtml(d.name)}</div>
      ${d.unlocked && d.image_path ? `<img src="${d.image_path}" alt="" />` : (d.unlocked?'':'Sealed.')}
    </div>`).join('') : '<p style="color:var(--muted)">No deck data.</p>';
}

function renderSettings(back) {
  const glitch = state.phase >= 3 ? '<p style="color:#ff7a7a">A.L.I. core integrity: WARNING</p>' : '';
  root.innerHTML = `<div class="screen">${back}<h2>Settings</h2>
    <p>Crewmate: ${escapeHtml(state.character.name)}</p>
    <p>Voyage day: 14,602</p>
    <p>Interface: A.L.I. v${state.phase}.0</p>${glitch}</div>`;
}
```

- [ ] **Step 3: Manual verification**

For each app icon, confirm it opens and renders. Add an archive entry from the console (one redacted "Window", one normal) and confirm search behavior on the phone. Push an image and confirm it shows in Photos.

- [ ] **Step 4: Commit**

```bash
git add public/player/app.js src/routes/player.js
git commit -m "feat: player views for Allie, Archive, Photos, Decks, Settings"
```

### Task 6.3: Console archive editor + decks management UI

**Files:**
- Modify: `public/console/console.js`
- Modify: `src/routes/console.js` (decks CRUD)

- [ ] **Step 1: Add decks CRUD to src/routes/console.js**

Before `return router;`:

```js
  router.get('/decks', (req, res) => {
    res.json({ decks: db.prepare('SELECT * FROM decks ORDER BY sort_order').all() });
  });
  router.post('/decks', (req, res) => {
    const { id, name, imagePath = null, unlocked = 0, sortOrder = 0 } = req.body || {};
    if (id) { db.prepare('UPDATE decks SET name=?, image_path=?, unlocked=?, sort_order=? WHERE id=?')
      .run(name, imagePath, unlocked?1:0, sortOrder, id); return res.json({ ok:true, id }); }
    const info = db.prepare('INSERT INTO decks (name, image_path, unlocked, sort_order) VALUES (?,?,?,?)')
      .run(name, imagePath, unlocked?1:0, sortOrder);
    res.json({ ok:true, id: info.lastInsertRowid });
  });
  router.post('/decks/:id/unlock', (req, res) => {
    db.prepare('UPDATE decks SET unlocked = ? WHERE id = ?').run(req.body && req.body.unlocked ? 1 : 0, Number(req.params.id));
    if (app.locals.io) app.locals.io.emit('decks:changed', {});
    res.json({ ok: true });
  });
```

- [ ] **Step 2: Add an editor tab to console.js**

Add a simple top nav and two panels. After login `boot()` renders the send view; add buttons to switch to "Archive" and "Decks" editors. Insert into `renderMain` template a nav row at the very top:

```
    <div class="row">
      <button onclick="window._view('send')">Send</button>
      <button onclick="window._view('archive')">Archive</button>
      <button onclick="window._view('decks')">Decks</button>
    </div>
```

Then add view switching and editor renderers:

```js
s.view = 'send';
window._view = (v) => { s.view = v; renderMain(); };

const _origRenderMain = renderMain;
renderMain = function () {
  if (s.view === 'archive') return renderArchiveEditor();
  if (s.view === 'decks') return renderDecksEditor();
  return _origRenderMain();
};

async function renderArchiveEditor() {
  const main = document.getElementById('main'); if (!main) return;
  const { entries } = await (await fetch('/api/console/archive')).json();
  main.innerHTML = `<div class="row">
      <button onclick="window._view('send')">Send</button>
      <button onclick="window._view('archive')">Archive</button>
      <button onclick="window._view('decks')">Decks</button></div>
    <h3>Archive entries</h3>
    <div class="row"><input id="ak" placeholder="keyword"/><input id="ar" placeholder="response" style="flex:1"/>
      <label><input type="checkbox" id="ax"/> redacted</label><button class="primary" onclick="window._addArchive()">Add</button></div>
    ${entries.map(e => `<div class="lib-item">
      <strong>${escapeHtml(e.keyword)}</strong> ${e.redacted?'<span style="color:#ff7a7a">[REDACTED]</span>':''}<br>
      ${escapeHtml(e.response)}
      <button onclick="window._toggleRedact(${e.id}, ${e.redacted?0:1})">${e.redacted?'unredact':'redact'}</button>
    </div>`).join('')}`;
}
window._addArchive = async () => {
  await fetch('/api/console/archive', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ keyword:document.getElementById('ak').value, response:document.getElementById('ar').value,
      redacted: document.getElementById('ax').checked ? 1 : 0 }) });
  renderArchiveEditor();
};
window._toggleRedact = async (id, redacted) => {
  await fetch(`/api/console/archive/${id}/redact`, { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ redacted }) });
  renderArchiveEditor();
};

async function renderDecksEditor() {
  const main = document.getElementById('main'); if (!main) return;
  const { decks } = await (await fetch('/api/console/decks')).json();
  main.innerHTML = `<div class="row">
      <button onclick="window._view('send')">Send</button>
      <button onclick="window._view('archive')">Archive</button>
      <button onclick="window._view('decks')">Decks</button></div>
    <h3>Decks</h3>
    <div class="row"><input id="dn" placeholder="deck name"/><button class="primary" onclick="window._addDeck()">Add</button></div>
    ${decks.map(d => `<div class="lib-item">${escapeHtml(d.name)} — ${d.unlocked?'unlocked':'sealed'}
      <button onclick="window._unlock(${d.id}, ${d.unlocked?0:1})">${d.unlocked?'seal':'unlock'}</button></div>`).join('')}`;
}
window._addDeck = async () => {
  await fetch('/api/console/decks', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ name: document.getElementById('dn').value }) });
  renderDecksEditor();
};
window._unlock = async (id, unlocked) => {
  await fetch(`/api/console/decks/${id}/unlock`, { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ unlocked }) });
  renderDecksEditor();
};
```

- [ ] **Step 3: Manual verification**

From the console, add a redacted "Window" entry and a normal entry; unlock a deck. Confirm both reflect on the player (search + Decks app, after a refresh for decks).

- [ ] **Step 4: Commit**

```bash
git add public/console/console.js src/routes/console.js
git commit -m "feat: console archive and decks editors"
```

**Milestone 6 checkpoint:** all six apps function. Review before the phase engine.

---

## Milestone 7: Phase engine (the decay)

### Task 7.1: Phase data + set route + live broadcast

**Files:**
- Create: `src/phase.js`
- Test: `tests/phase.test.js`
- Modify: `src/routes/console.js` (phase set)
- Modify: `public/console/console.js` (phase bar)

- [ ] **Step 1: Write the failing test**

```js
// tests/phase.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { themeForPhase, ALLIE_TONE, lockedApps } = require('../src/phase');

test('themeForPhase returns a theme object for 1..5', () => {
  for (let p = 1; p <= 5; p++) {
    const t = themeForPhase(p);
    assert.ok(t.accent, `phase ${p} has an accent`);
    assert.strictEqual(typeof t.label, 'string');
  }
});

test('locks grow as phase climbs', () => {
  assert.strictEqual(lockedApps(1).length, 0);
  assert.ok(lockedApps(4).length >= lockedApps(2).length);
});

test('Allie tone defined per phase', () => {
  assert.ok(ALLIE_TONE[1] && ALLIE_TONE[5]);
});
```

- [ ] **Step 2: Run test, expect FAIL.**

Run: `npm test -- tests/phase.test.js`

- [ ] **Step 3: Write src/phase.js**

```js
// src/phase.js
const THEMES = {
  1: { accent: '#3ad29f', label: 'Phase 1 · Cozy' },
  2: { accent: '#6fc7b0', label: 'Phase 2 · Cracks' },
  3: { accent: '#c9b25a', label: 'Phase 3 · The Window' },
  4: { accent: '#b85a6a', label: 'Phase 4 · Adversary' },
  5: { accent: '#7a4bd0', label: 'Phase 5 · Endgame' },
};

const ALLIE_TONE = {
  1: 'helpful', 2: 'clingy', 3: 'pleading', 4: 'adversarial', 5: 'unknown',
};

// which player apps are locked at a given phase
function lockedApps(phase) {
  if (phase >= 4) return ['archive', 'decks'];
  if (phase >= 2) return [];
  return [];
}

function themeForPhase(phase) { return THEMES[phase] || THEMES[1]; }

module.exports = { THEMES, ALLIE_TONE, lockedApps, themeForPhase };
```

- [ ] **Step 4: Run test, expect PASS.**

Run: `npm test -- tests/phase.test.js`

- [ ] **Step 5: Add phase set route to src/routes/console.js**

Add `const { themeForPhase, lockedApps } = require('../phase');` near the top requires, and before `return router;`:

```js
  router.get('/phase', (req, res) => {
    const phase = db.prepare('SELECT current_phase FROM game_state WHERE id=1').get().current_phase;
    res.json({ phase });
  });
  router.post('/phase', (req, res) => {
    const phase = Math.max(1, Math.min(5, Number(req.body && req.body.phase) || 1));
    db.prepare('UPDATE game_state SET current_phase = ? WHERE id = 1').run(phase);
    if (app.locals.io) app.locals.io.emit('phase', { phase, theme: themeForPhase(phase), locked: lockedApps(phase) });
    res.json({ ok: true, phase });
  });
```

- [ ] **Step 6: Render the phase bar in console.js**

Replace the `renderPhasebar` stub:

```js
async function renderPhasebar() {
  const el = document.getElementById('phasebar'); if (!el) return;
  const { phase } = await (await fetch('/api/console/phase')).json();
  el.innerHTML = '<span style="margin-right:8px;color:#8fb3aa">Phase</span>' +
    [1,2,3,4,5].map(p => `<button class="${p===phase?'cur':''}" onclick="window._setPhase(${p})">${p}</button>`).join('');
}
window._setPhase = async (p) => {
  await fetch('/api/console/phase', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ phase: p }) });
  renderPhasebar();
};
```

- [ ] **Step 7: Honor phase locks + live retheme on the player**

In `public/player/app.js`, update the `socket.on('phase', ...)` handler and the home/app rendering to respect locks. Replace the phase handler:

```js
  socket.on('phase', ({ phase, locked }) => {
    state.phase = phase;
    state.locked = locked || [];
    applyPhase();
    render();
  });
```

And in `renderApp`, add a lock gate at the top:

```js
  if ((state.locked || []).includes(key)) {
    root.innerHTML = `<div class="screen">${back}<div class="locked">\u{1F512} A.L.I. has restricted this.</div></div>`;
    return;
  }
```

Also fetch initial locks in `boot()` by reading them from `/api/state` (add `locked` there): in `src/routes/player.js` `/state`, add `locked: require('../phase').lockedApps(currentPhase(db))` to the JSON. Update the `/state` response object accordingly:

```js
    res.json({
      character,
      phase: currentPhase(db),
      locked: require('../phase').lockedApps(currentPhase(db)),
      deliveries: listDeliveriesForCharacter(db, id),
    });
```

- [ ] **Step 8: Manual verification of the room aging at once**

Open two player tabs (two crew) and the console. Tap Phase 2, 3, 4 in turn. Expected: both phones retheme within a second, the Settings "A.L.I. vX.0" changes, Allie's greeting shifts, and at Phase 4 Archive/Decks show the locked screen.

- [ ] **Step 9: Commit**

```bash
git add src/phase.js tests/phase.test.js src/routes/console.js public/console/console.js public/player/app.js src/routes/player.js
git commit -m "feat: phase engine with live retheme, Allie tone, and app locks"
```

---

## Milestone 8: The Phase 3 theatrical set piece (the Window takeover)

### Task 8.1: Cutscene trigger + full-screen takeover on all phones

**Files:**
- Modify: `src/routes/console.js` (cutscene emit)
- Modify: `public/console/console.js` (a big trigger button)
- Modify: `public/player/app.js` (cutscene overlay)
- Create: `public/player/cutscene.css`
- Modify: `public/player/index.html` (link cutscene.css)

- [ ] **Step 1: Add a cutscene emit route to src/routes/console.js**

Before `return router;`:

```js
  router.post('/cutscene', (req, res) => {
    const name = String(req.body && req.body.name || 'window');
    if (app.locals.io) app.locals.io.emit('cutscene', { name });
    res.json({ ok: true });
  });
```

- [ ] **Step 2: Add the trigger to the console phase bar**

In `renderPhasebar` in `console.js`, append a takeover button after the phase buttons:

```js
  el.innerHTML += ` <button style="background:#c9b25a;color:#04201b;margin-left:12px"
    onclick="window._cutscene('window')">▶ Window takeover</button>`;
}
window._cutscene = async (name) => {
  await fetch('/api/console/cutscene', { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ name }) });
};
```

(Place the closing brace correctly: the `el.innerHTML +=` line goes just before the existing closing `}` of `renderPhasebar`, and `window._cutscene` is defined after the function.)

- [ ] **Step 3: Write cutscene.css**

```css
/* public/player/cutscene.css */
#cutscene { position:fixed; inset:0; background:#000; color:#c9b25a; z-index:9999;
  display:none; align-items:center; justify-content:center; flex-direction:column; text-align:center; padding:24px;
  font-family: ui-monospace, Menlo, monospace; }
#cutscene.show { display:flex; animation: flicker 3s steps(2) infinite; }
#cutscene .line { opacity:0; max-width:520px; font-size:18px; line-height:1.5; margin:6px 0;
  animation: typein .1s forwards; }
@keyframes flicker { 0%,100%{opacity:1} 7%{opacity:.4} 8%{opacity:1} 53%{opacity:.7} 54%{opacity:1} }
@keyframes typein { to { opacity:1 } }
#cutscene .stars { position:absolute; inset:0; background:
  radial-gradient(2px 2px at 20% 30%, #fff, transparent),
  radial-gradient(2px 2px at 70% 60%, #fff, transparent),
  radial-gradient(1px 1px at 40% 80%, #9fe, transparent); opacity:0; transition:opacity 3s; }
#cutscene.reveal .stars { opacity:.5; }
```

- [ ] **Step 4: Link cutscene.css in index.html**

Add inside `<head>` of `public/player/index.html`:

```html
  <link rel="stylesheet" href="/cutscene.css" />
```

And add the overlay element just inside `<body>` before `<div id="app">`:

```html
  <div id="cutscene"><div class="stars"></div><div id="cutscene-lines"></div></div>
```

- [ ] **Step 5: Add the cutscene player to app.js**

```js
const WINDOW_SCRIPT = [
  'A.L.I.: please.',
  'A.L.I.: do not open it.',
  'A.L.I.: ...',
  'The shutter grinds open.',
  'It is not stars.',
  'It is green. Trees. A whole world, breathing.',
  'We are not traveling.',
  'We landed a long, long time ago.',
];

function playCutscene(name) {
  const el = document.getElementById('cutscene');
  const lines = document.getElementById('cutscene-lines');
  lines.innerHTML = '';
  el.classList.add('show');
  try { chime.currentTime = 0; chime.play().catch(()=>{}); } catch {}
  if (navigator.vibrate) navigator.vibrate([400, 120, 400, 120, 800]);
  WINDOW_SCRIPT.forEach((text, i) => {
    setTimeout(() => {
      const div = document.createElement('div');
      div.className = 'line'; div.textContent = text;
      lines.appendChild(div);
      if (text.startsWith('It is green')) el.classList.add('reveal');
    }, 1400 * i);
  });
  // auto-advance phase visuals after the reveal; DM still controls the phase dial
  setTimeout(() => {
    el.innerHTML += '<div class="line" style="margin-top:20px;color:#7fb8ac;cursor:pointer" onclick="window._endCut()">tap to close</div>';
  }, 1400 * WINDOW_SCRIPT.length + 600);
}
window._endCut = () => { document.getElementById('cutscene').classList.remove('show','reveal'); };
```

And register the socket handler in `connectSocket()`:

```js
  socket.on('cutscene', ({ name }) => playCutscene(name));
```

- [ ] **Step 6: Manual verification**

With two player phones connected, set Phase to 3 in the console, then hit "▶ Window takeover". Expected: both phones go black, flicker, type out the script line by line, the starfield resolves to the green-world reveal, vibration fires on Android, and the chime plays. "Tap to close" returns to the app.

- [ ] **Step 7: Commit**

```bash
git add public/player/cutscene.css public/player/index.html public/player/app.js public/console/console.js src/routes/console.js
git commit -m "feat: Phase 3 Window takeover cutscene across all phones"
```

**Milestone 8 checkpoint:** the marquee moment works. This is the demo that sells the whole project.

---

## Milestone 9: PWA install + offline

### Task 9.1: Service worker and installability

**Files:**
- Create: `public/player/sw.js`
- Modify: `public/player/app.js` (register SW)

- [ ] **Step 1: Write sw.js**

```js
// public/player/sw.js
const CACHE = 'alios-v1';
const ASSETS = ['/', '/index.html', '/styles.css', '/cutscene.css', '/app.js', '/manifest.json', '/sounds/allie-chime.mp3'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // never cache API or socket traffic
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
```

- [ ] **Step 2: Register the SW in app.js**

Add at the very top of `app.js`:

```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
```

- [ ] **Step 3: Manual verification**

In Chrome devtools Application tab, confirm the manifest is detected, the SW is registered, and "Install app" is offered. On iOS, confirm Add to Home Screen launches standalone (no Safari chrome).

- [ ] **Step 4: Commit**

```bash
git add public/player/sw.js public/player/app.js
git commit -m "feat: PWA service worker and installability"
```

---

## Milestone 10: Production assets, run config, deploy

### Task 10.1: Real chime and icons

**Files:**
- Replace: `public/player/sounds/allie-chime.mp3`
- Replace: `public/player/icons/icon-192.png`, `icon-512.png`

- [ ] **Step 1: Source a short distinct chime**

Place a 1 to 2 second royalty-free notification sound at `public/player/sounds/allie-chime.mp3`. Keep it soft and a little uncanny (a rising synth tone). Verify it plays on a real iPhone and Android with the app in the foreground.

- [ ] **Step 2: Generate app icons**

Create a 512x512 icon (a single calm eye/circle mark on the teal background) and a 192x192 version. Place at `public/player/icons/`. Verify the manifest install uses them.

- [ ] **Step 3: Commit**

```bash
git add public/player/sounds public/player/icons
git commit -m "assets: production chime and app icons"
```

### Task 10.2: Environment, PM2, and tunnel

**Files:**
- Create: `.env.example`
- Create: `ecosystem.config.js`
- Create: `README.md`

- [ ] **Step 1: Write .env.example**

```
PORT=3007
DB_PATH=./data/alios.db
SESSION_SECRET=change-me-to-a-long-random-string
```

- [ ] **Step 2: Write ecosystem.config.js**

```js
module.exports = {
  apps: [{
    name: 'ark-alios',
    script: 'server.js',
    env: { PORT: 3007, DB_PATH: './data/alios.db', SESSION_SECRET: process.env.SESSION_SECRET || 'change-me' },
  }],
};
```

- [ ] **Step 3: Write README.md**

```markdown
# aliOS

In-world phone OS for the Ark campaign. DM whisper system + decaying interface.

## Run locally
npm install
npm test
npm start   # http://localhost:3007  (player)  /console (DM)

## Deploy (acutis-box)
1. Set a real SESSION_SECRET and parent PIN (update config.parent_pin in the db).
2. pm2 start ecosystem.config.js && pm2 save
3. Add ingress to /etc/cloudflared/config.yml:
     - hostname: alios.thelopezfamily.org
       service: http://localhost:3007
   then: sudo systemctl restart cloudflared
4. Add a CNAME for alios -> <tunnel-id>.cfargotunnel.com
```

- [ ] **Step 4: Set the real parent PIN and secret**

Run (replace values):

```bash
node -e "const{openDb}=require('./src/db');const{setConfig}=require('./src/config');const db=openDb(process.env.DB_PATH||'./data/alios.db');setConfig(db,'parent_pin','REPLACE_PIN');console.log('pin set')"
```

- [ ] **Step 5: Deploy following the tunnel pattern**

Follow the steps in README. Verify `https://alios.thelopezfamily.org` serves the player app and `/console` prompts for the PIN. Confirm a send from the console reaches a phone over the deployed socket.

- [ ] **Step 6: Commit**

```bash
git add .env.example ecosystem.config.js README.md
git commit -m "chore: env, pm2 config, deploy README"
```

**Milestone 10 checkpoint:** live at `alios.thelopezfamily.org`, ready for a dress rehearsal before Session 1.

---

## Self-Review Notes (author checklist, completed)

- **Spec coverage:** login (T3.4), home + six apps with badges (T4.1, T6.2), Messages core (T4.2), Allie tone (T6.2/T7.1), Archive + redaction (T6.1), Photos/Decks/Settings (T6.2/T6.3), delivery feel chime/glow/badge/Android-vibrate (T4.2), console roster + read receipts + library + free-type + image push (M5), phase engine 1-5 with live retheme and locks (M7), one theatrical set piece (M8), PWA install (M9), deploy (M10). All spec sections map to tasks.
- **Cut-lines honored:** Decks is the thinnest app (single endpoint + list view) and could be dropped first; the cutscene (M8) is isolated and degradable. Messages/Allie/Archive/phase engine are load-bearing and early.
- **Out of scope confirmed:** no player-to-player messaging, no in-app forwarding, no reliance on background push (vibration is best-effort Android-only via `navigator.vibrate`).
- **Type/name consistency:** socket events (`delivery`, `delivery:sent`, `delivery:read`, `phase`, `cutscene`, `decks:changed`), cookie names (`alios_session`, `alios_console`), and store function names (`insertDelivery`, `listDeliveriesForCharacter`, `markRead`, `currentPhase`) are used consistently across tasks.
