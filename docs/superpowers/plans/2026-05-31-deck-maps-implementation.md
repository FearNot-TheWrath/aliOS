# Deck Maps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the aliOS Decks app into navigable per-deck schematic maps with a DM-moved party pin and points of interest, where the map degrades (drift, fog, mislabel, hide, decoy) as the crew descends and Allie turns.

**Architecture:** Extends the existing `decks` table and adds a `pins` table plus party position in `game_state`. All unreliability logic (the level U, drift, fog) and all lie-resolution (truth/lie/hidden, phase-gate auto-flip) live in tested server modules. The player's `/api/decks` returns fully-resolved render data with truth labels stripped when a pin is lying, so the client is a pure renderer and no hidden truth crosses the wire. A shared `schematic.js` renders `map_json` shapes to SVG on both the player phone and the DM console.

**Tech Stack:** Node, Express 5, better-sqlite3, Socket.io, vanilla JS PWA, node:test. Builds on the shipped aliOS v1 and its phase engine.

---

## File Structure

```
src/
  migrations/002-deck-maps.sql   adds map_json, party position, pins table
  unreliability.js               PURE: unreliability(phase,depth), driftOffset(seed,U), fogPatches(seed,U)
  pins.js                        PURE: effectiveState(pin,phase), displayPin(pin,state)
  deckstore.js                   DB: pins CRUD, party get/set, raw deck/pin reads
  deckmaps.js                    DATA: the six co-authored deck schematics (map_json)
  seed.js                        MODIFY: seed the six decks with maps if none exist
  routes/console.js              MODIFY: pin CRUD, party, map-set routes; emit deck:pin/deck:party
  routes/player.js               MODIFY: GET /api/decks returns resolved render payload
server.js                        MODIFY: serve /shared static dir
public/
  shared/schematic.js            schematicSvg(map) + helpers, loaded by both front ends
  player/index.html              MODIFY: load /shared/schematic.js
  player/app.js                  MODIFY: rewrite renderDecks as a schematic renderer + live refetch
  console/index.html             MODIFY: load /shared/schematic.js
  console/console.js             MODIFY: rewrite renderDecksEditor (map, place party, drop/flip POIs, U readout)
tests/
  unreliability.test.js  pins.test.js  deckstore.test.js
  api-decks-console.test.js  api-decks-player.test.js
```

Milestones are review checkpoints. Backend logic is TDD'd; client tasks ship complete code and are browser-verified at the end.

---

## Milestone 1: Data layer

### Task 1.1: Migration 002 (map_json, party position, pins table)

**Files:**
- Create: `src/migrations/002-deck-maps.sql`
- Test: `tests/migration-002.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/migration-002.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');

test('migration 002 adds map_json, party fields, and pins table', () => {
  const db = openDb(':memory:');
  const deckCols = db.prepare("PRAGMA table_info(decks)").all().map((c) => c.name);
  assert.ok(deckCols.includes('map_json'), 'decks.map_json exists');
  const gsCols = db.prepare("PRAGMA table_info(game_state)").all().map((c) => c.name);
  assert.ok(gsCols.includes('party_deck_id') && gsCols.includes('party_x') && gsCols.includes('party_y'));
  const pinCols = db.prepare("PRAGMA table_info(pins)").all().map((c) => c.name);
  for (const c of ['deck_id','x','y','truth_label','lie_label','state','phase_gate','poi_type','manual','sort_order']) {
    assert.ok(pinCols.includes(c), `pins.${c} exists`);
  }
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- tests/migration-002.test.js`
Expected: FAIL (no such column / table pins).

- [ ] **Step 3: Write `src/migrations/002-deck-maps.sql`**

```sql
-- src/migrations/002-deck-maps.sql
ALTER TABLE decks ADD COLUMN map_json TEXT;

ALTER TABLE game_state ADD COLUMN party_deck_id INTEGER;
ALTER TABLE game_state ADD COLUMN party_x REAL;
ALTER TABLE game_state ADD COLUMN party_y REAL;

CREATE TABLE pins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id INTEGER NOT NULL REFERENCES decks(id),
  x REAL NOT NULL,
  y REAL NOT NULL,
  truth_label TEXT,
  lie_label TEXT,
  state TEXT NOT NULL DEFAULT 'truth',
  phase_gate INTEGER,
  poi_type TEXT NOT NULL DEFAULT 'generic',
  manual INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- tests/migration-002.test.js`

- [ ] **Step 5: Run full suite (existing 34 must still pass)**

Run: `npm test`
Expected: all green (37 now: 34 + migration + any others run).

- [ ] **Step 6: Commit**

```bash
git add src/migrations/002-deck-maps.sql tests/migration-002.test.js
git commit -m "feat: migration 002 adds deck map_json, party position, pins table"
```

### Task 1.2: The six deck schematics (data)

**Files:**
- Create: `src/deckmaps.js`
- Test: `tests/deckmaps.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/deckmaps.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { DECKS } = require('../src/deckmaps');

test('there are six decks in descent order with maps', () => {
  assert.strictEqual(DECKS.length, 6);
  DECKS.forEach((d, i) => {
    assert.strictEqual(d.depth, i + 1, `deck ${i} depth`);
    assert.ok(d.name, 'has a name');
    assert.ok(Array.isArray(d.map.shapes) && d.map.shapes.length > 0, `${d.name} has shapes`);
    // every shape coordinate is normalized 0..1
    for (const s of d.map.shapes) {
      for (const k of ['x','y','w','h','cx','cy','rx','ry']) {
        if (s[k] !== undefined) assert.ok(s[k] >= 0 && s[k] <= 1, `${d.name} ${s.t}.${k} normalized`);
      }
    }
  });
});

test('deck six is Deck Zero (the bottom)', () => {
  assert.match(DECKS[5].name, /Zero/i);
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- tests/deckmaps.test.js`

- [ ] **Step 3: Write `src/deckmaps.js`**

These are the working schematics. Coordinates are normalized 0 to 1. The DM can refine any of them later from the console. Shape vocabulary: `hull` (outer wall), `corridor`, `room`, `ellipse` (a feature ring like the Rec-Ring, optional `label`), `label` (free text).

```js
// src/deckmaps.js
// The six decks of the descent, top (Crown) to bottom (Deck Zero).
// map.shapes use normalized 0..1 coordinates. Authored as the starting
// schematics; editable later from the console.
const hull = { t: 'hull', x: 0.05, y: 0.04, w: 0.9, h: 0.92, rx: 0.07 };
const spine = { t: 'corridor', x: 0.46, y: 0.08, w: 0.08, h: 0.84 };

const DECKS = [
  {
    name: 'Crown', depth: 1,
    map: { shapes: [
      hull, spine,
      { t: 'ellipse', cx: 0.5, cy: 0.32, rx: 0.3, ry: 0.18, label: 'Gardens' },
      { t: 'room', x: 0.12, y: 0.62, w: 0.3, h: 0.24 },
      { t: 'room', x: 0.58, y: 0.62, w: 0.3, h: 0.24 },
      { t: 'label', x: 0.5, y: 0.92, text: 'Observation' },
    ] },
  },
  {
    name: 'Commons', depth: 2,
    map: { shapes: [
      hull, spine,
      { t: 'room', x: 0.12, y: 0.12, w: 0.26, h: 0.2 },
      { t: 'room', x: 0.62, y: 0.12, w: 0.26, h: 0.2 },
      { t: 'room', x: 0.12, y: 0.36, w: 0.26, h: 0.22 },
      { t: 'room', x: 0.62, y: 0.36, w: 0.26, h: 0.22 },
      { t: 'ellipse', cx: 0.5, cy: 0.74, rx: 0.28, ry: 0.16, label: 'Rec-Ring' },
      { t: 'label', x: 0.25, y: 0.1, text: 'School' },
      { t: 'label', x: 0.5, y: 0.95, text: 'stairs down' },
    ] },
  },
  {
    name: 'Works', depth: 3,
    map: { shapes: [
      hull, spine,
      { t: 'corridor', x: 0.12, y: 0.46, w: 0.76, h: 0.06 },
      { t: 'room', x: 0.12, y: 0.12, w: 0.3, h: 0.28 },
      { t: 'room', x: 0.58, y: 0.12, w: 0.3, h: 0.28 },
      { t: 'room', x: 0.12, y: 0.58, w: 0.3, h: 0.3 },
      { t: 'room', x: 0.58, y: 0.58, w: 0.3, h: 0.3 },
      { t: 'label', x: 0.5, y: 0.5, text: 'Workfloor' },
    ] },
  },
  {
    name: 'Undercroft', depth: 4,
    map: { shapes: [
      hull, spine,
      { t: 'room', x: 0.14, y: 0.16, w: 0.24, h: 0.22 },
      { t: 'room', x: 0.6, y: 0.2, w: 0.26, h: 0.3 },
      { t: 'corridor', x: 0.2, y: 0.6, w: 0.6, h: 0.06 },
      { t: 'room', x: 0.3, y: 0.7, w: 0.4, h: 0.18 },
      { t: 'label', x: 0.5, y: 0.12, text: 'sealed access' },
    ] },
  },
  {
    name: 'Deep Works', depth: 5,
    map: { shapes: [
      hull, spine,
      { t: 'corridor', x: 0.12, y: 0.3, w: 0.76, h: 0.06 },
      { t: 'corridor', x: 0.12, y: 0.66, w: 0.76, h: 0.06 },
      { t: 'room', x: 0.14, y: 0.4, w: 0.28, h: 0.2 },
      { t: 'room', x: 0.58, y: 0.4, w: 0.28, h: 0.2 },
      { t: 'label', x: 0.5, y: 0.9, text: 'drone bays' },
    ] },
  },
  {
    name: 'Deck Zero', depth: 6,
    map: { shapes: [
      hull,
      { t: 'ellipse', cx: 0.5, cy: 0.4, rx: 0.22, ry: 0.16, label: 'Window' },
      { t: 'room', x: 0.38, y: 0.66, w: 0.24, h: 0.22 },
      { t: 'label', x: 0.5, y: 0.94, text: 'CORE' },
    ] },
  },
];

module.exports = { DECKS };
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- tests/deckmaps.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/deckmaps.js tests/deckmaps.test.js
git commit -m "feat: six deck schematics as map data"
```

### Task 1.3: Seed the six decks with maps

**Files:**
- Modify: `src/seed.js`
- Test: `tests/seed-decks.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/seed-decks.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');

test('seed creates the six decks with map_json, Crown unlocked', () => {
  const db = openDb(':memory:');
  seed(db);
  const decks = db.prepare('SELECT name, unlocked, sort_order, map_json FROM decks ORDER BY sort_order').all();
  assert.strictEqual(decks.length, 6);
  assert.strictEqual(decks[0].name, 'Crown');
  assert.strictEqual(decks[0].sort_order, 1);
  assert.strictEqual(decks[0].unlocked, 1, 'Crown starts unlocked');
  assert.strictEqual(decks[5].unlocked, 0, 'Deck Zero starts sealed');
  assert.ok(JSON.parse(decks[0].map_json).shapes.length > 0);
});

test('seed decks is idempotent', () => {
  const db = openDb(':memory:');
  seed(db); seed(db);
  assert.strictEqual(db.prepare('SELECT count(*) c FROM decks').get().c, 6);
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- tests/seed-decks.test.js`

- [ ] **Step 3: Modify `src/seed.js`**

Add a `require` for the deck data at the top, and a deck-seeding block. The existing `seed(db)` function seeds characters and senders; append the deck block before its closing brace. Full updated file:

```js
// src/seed.js
// Seeds a starter roster and the six decks. Names/PINs are placeholders the
// DM edits later from the console; the point is to make the app usable immediately.
const { DECKS } = require('./deckmaps');

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

  const deckCount = db.prepare('SELECT count(*) c FROM decks').get().c;
  if (deckCount === 0) {
    const insert = db.prepare(
      'INSERT INTO decks (name, unlocked, sort_order, map_json) VALUES (?, ?, ?, ?)'
    );
    DECKS.forEach((d) => insert.run(d.name, d.depth === 1 ? 1 : 0, d.depth, JSON.stringify(d.map)));
  }
}

module.exports = { seed };
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- tests/seed-decks.test.js`

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/seed.js tests/seed-decks.test.js
git commit -m "feat: seed the six decks with schematics, Crown unlocked"
```

**Milestone 1 checkpoint:** the database knows about six decks with maps, party position, and pins. Review before logic.

---

## Milestone 2: Pure logic (unreliability + lie resolution)

### Task 2.1: Unreliability module

**Files:**
- Create: `src/unreliability.js`
- Test: `tests/unreliability.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unreliability.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { unreliability, driftOffset, fogPatches } = require('../src/unreliability');

test('unreliability is 0 at Crown/Phase1 and 1 at DeckZero/Phase5', () => {
  assert.strictEqual(unreliability(1, 1), 0);
  assert.ok(Math.abs(unreliability(5, 6) - 1) < 1e-9);
  // clamps and stays in range
  for (const [p, d] of [[1,1],[3,3],[5,6],[5,1],[1,6]]) {
    const u = unreliability(p, d);
    assert.ok(u >= 0 && u <= 1, `U(${p},${d})=${u} in range`);
  }
  // deeper is worse at same phase
  assert.ok(unreliability(2, 5) > unreliability(2, 1));
  // later phase is worse at same depth
  assert.ok(unreliability(4, 3) > unreliability(1, 3));
});

test('driftOffset is deterministic and scales with U', () => {
  const a = driftOffset(42, 0.5);
  const b = driftOffset(42, 0.5);
  assert.deepStrictEqual(a, b, 'same seed and U give same offset');
  const big = driftOffset(42, 1.0);
  const small = driftOffset(42, 0.2);
  assert.ok(Math.hypot(big.dx, big.dy) > Math.hypot(small.dx, small.dy), 'larger U drifts more');
  assert.strictEqual(driftOffset(42, 0).dx, 0);
  assert.strictEqual(driftOffset(42, 0).dy, 0);
});

test('fogPatches count grows with U and is deterministic', () => {
  assert.strictEqual(fogPatches(7, 0).length, 0);
  const f = fogPatches(7, 1);
  assert.ok(f.length >= 1);
  assert.deepStrictEqual(fogPatches(7, 1), fogPatches(7, 1), 'deterministic');
  f.forEach((p) => {
    assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
    assert.ok(p.radius > 0 && p.opacity > 0);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- tests/unreliability.test.js`

- [ ] **Step 3: Write `src/unreliability.js`**

```js
// src/unreliability.js
// All deterministic. No Math.random (would break reproducibility and tests).

function clamp01(n) { return Math.max(0, Math.min(1, n)); }

// U blends how far Allie has turned (phase) with how deep the deck is.
function unreliability(phase, depth) {
  const p = Math.max(1, Math.min(5, phase));
  const d = Math.max(1, depth);
  const phaseTerm = (p - 1) / 4;   // 0 at Phase 1, 1 at Phase 5
  const depthTerm = (d - 1) / 5;   // 0 at Crown, 1 at Deck Zero
  return clamp01(0.6 * phaseTerm + 0.4 * depthTerm);
}

// mulberry32: tiny deterministic PRNG seeded by an integer
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A stable offset for the party pin, magnitude up to 12 percent of the map.
function driftOffset(seed, U) {
  if (U <= 0) return { dx: 0, dy: 0 };
  const r = rng(seed);
  const angle = r() * Math.PI * 2;
  const mag = U * 0.12;
  return { dx: Math.cos(angle) * mag, dy: Math.sin(angle) * mag };
}

// 0..5 translucent "no data" patches, more and denser as U climbs.
function fogPatches(seed, U) {
  if (U <= 0) return [];
  const r = rng(seed * 7 + 1);
  const count = Math.round(U * 5);
  const patches = [];
  for (let i = 0; i < count; i++) {
    patches.push({
      x: r(), y: r(),
      radius: 0.08 + r() * 0.12,
      opacity: clamp01(0.2 + U * 0.5),
    });
  }
  return patches;
}

module.exports = { unreliability, driftOffset, fogPatches, clamp01, rng };
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- tests/unreliability.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/unreliability.js tests/unreliability.test.js
git commit -m "feat: pure unreliability engine (level, drift, fog)"
```

### Task 2.2: Pin lie-resolution module

**Files:**
- Create: `src/pins.js`
- Test: `tests/pins.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/pins.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { effectiveState, displayPin } = require('../src/pins');

const base = { id: 1, x: 0.5, y: 0.5, truth_label: 'Core route', lie_label: 'Life support',
  state: 'truth', phase_gate: null, poi_type: 'core', manual: 0 };

test('phase_gate auto-flips truth to lie when not manually set', () => {
  const p = { ...base, phase_gate: 3 };
  assert.strictEqual(effectiveState(p, 2), 'truth');
  assert.strictEqual(effectiveState(p, 3), 'lie');
});

test('a manual state wins over the phase gate', () => {
  const p = { ...base, phase_gate: 3, state: 'hidden', manual: 1 };
  assert.strictEqual(effectiveState(p, 5), 'hidden');
});

test('displayPin strips the truth when lying or hidden', () => {
  assert.deepStrictEqual(displayPin(base, 'truth'),
    { id: 1, x: 0.5, y: 0.5, poi_type: 'core', label: 'Core route', obscured: false });
  assert.deepStrictEqual(displayPin(base, 'lie'),
    { id: 1, x: 0.5, y: 0.5, poi_type: 'core', label: 'Life support', obscured: false });
  const hidden = displayPin(base, 'hidden');
  assert.strictEqual(hidden.label, null);
  assert.strictEqual(hidden.obscured, true);
  // truth_label never appears in any non-truth display
  assert.ok(!JSON.stringify(displayPin(base, 'lie')).includes('Core route'));
  assert.ok(!JSON.stringify(displayPin(base, 'hidden')).includes('Core route'));
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- tests/pins.test.js`

- [ ] **Step 3: Write `src/pins.js`**

```js
// src/pins.js
// Resolve what a point of interest should show, given the current phase.
// A manual DM set wins until cleared; otherwise a phase_gate auto-flips
// truth to lie. The display form NEVER includes the hidden truth label.

function effectiveState(pin, phase) {
  if (pin.manual) return pin.state;
  if (pin.phase_gate != null && phase >= pin.phase_gate) return 'lie';
  return pin.state; // default 'truth'
}

function displayPin(pin, state) {
  if (state === 'hidden') {
    return { id: pin.id, x: pin.x, y: pin.y, poi_type: pin.poi_type, label: null, obscured: true };
  }
  const label = state === 'lie' ? (pin.lie_label || '') : (pin.truth_label || '');
  return { id: pin.id, x: pin.x, y: pin.y, poi_type: pin.poi_type, label, obscured: false };
}

module.exports = { effectiveState, displayPin };
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- tests/pins.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/pins.js tests/pins.test.js
git commit -m "feat: pure pin lie-resolution (effectiveState, displayPin)"
```

**Milestone 2 checkpoint:** the rules of the lie are tested in isolation. The truth-stripping guarantee is the key one.

---

## Milestone 3: Deck store (DB helpers)

### Task 3.1: Pin and party persistence

**Files:**
- Create: `src/deckstore.js`
- Test: `tests/deckstore.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/deckstore.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');
const {
  listDecksRaw, listPinsRaw, insertPin, updatePin, flipPin, deletePin, getParty, setParty,
} = require('../src/deckstore');

function freshDb() { const db = openDb(':memory:'); seed(db); return db; }

test('insert, list, update, flip, delete pins', () => {
  const db = freshDb();
  const deck = listDecksRaw(db)[0];
  const id = insertPin(db, { deck_id: deck.id, x: 0.5, y: 0.5, truth_label: 'Stairs', poi_type: 'stairs' });
  let pins = listPinsRaw(db, deck.id);
  assert.strictEqual(pins.length, 1);
  assert.strictEqual(pins[0].truth_label, 'Stairs');
  assert.strictEqual(pins[0].state, 'truth');
  assert.strictEqual(pins[0].manual, 0);

  updatePin(db, id, { lieLabel: 'Closed', phaseGate: 3 });
  pins = listPinsRaw(db, deck.id);
  assert.strictEqual(pins[0].lie_label, 'Closed');
  assert.strictEqual(pins[0].phase_gate, 3);

  assert.strictEqual(flipPin(db, id), 'lie');   // truth -> lie
  assert.strictEqual(flipPin(db, id), 'hidden'); // lie -> hidden
  assert.strictEqual(flipPin(db, id), 'truth');  // hidden -> truth
  assert.strictEqual(listPinsRaw(db, deck.id)[0].manual, 1, 'flip marks manual');

  deletePin(db, id);
  assert.strictEqual(listPinsRaw(db, deck.id).length, 0);
});

test('party get/set round trips', () => {
  const db = freshDb();
  const deck = listDecksRaw(db)[1];
  assert.strictEqual(getParty(db).party_deck_id, null);
  setParty(db, deck.id, 0.3, 0.7);
  const party = getParty(db);
  assert.strictEqual(party.party_deck_id, deck.id);
  assert.strictEqual(party.party_x, 0.3);
  assert.strictEqual(party.party_y, 0.7);
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- tests/deckstore.test.js`

- [ ] **Step 3: Write `src/deckstore.js`**

```js
// src/deckstore.js
function listDecksRaw(db) {
  return db.prepare('SELECT id, name, unlocked, sort_order, map_json FROM decks ORDER BY sort_order').all();
}

function listPinsRaw(db, deckId) {
  return db.prepare('SELECT * FROM pins WHERE deck_id = ? ORDER BY sort_order, id').all(deckId);
}

function insertPin(db, p) {
  const row = {
    deck_id: p.deck_id, x: p.x, y: p.y,
    truth_label: p.truth_label ?? null, lie_label: p.lie_label ?? null,
    state: p.state ?? 'truth', phase_gate: p.phase_gate ?? null,
    poi_type: p.poi_type ?? 'generic', manual: p.manual ?? 0, sort_order: p.sort_order ?? 0,
  };
  const info = db.prepare(
    `INSERT INTO pins (deck_id,x,y,truth_label,lie_label,state,phase_gate,poi_type,manual,sort_order)
     VALUES (@deck_id,@x,@y,@truth_label,@lie_label,@state,@phase_gate,@poi_type,@manual,@sort_order)`
  ).run(row);
  return info.lastInsertRowid;
}

// Whitelisted field update. Camel-case input keys map to columns.
const UPDATE_COLS = {
  x: 'x', y: 'y', truthLabel: 'truth_label', lieLabel: 'lie_label',
  phaseGate: 'phase_gate', poiType: 'poi_type', state: 'state', sortOrder: 'sort_order',
};
function updatePin(db, id, fields) {
  const sets = [], vals = [];
  for (const [k, v] of Object.entries(fields)) {
    const col = UPDATE_COLS[k];
    if (col) { sets.push(`${col} = ?`); vals.push(v); }
  }
  if (fields.state !== undefined) sets.push('manual = 1');
  if (!sets.length) return;
  vals.push(id);
  db.prepare(`UPDATE pins SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

function flipPin(db, id) {
  const row = db.prepare('SELECT state FROM pins WHERE id = ?').get(id);
  if (!row) return null;
  const next = row.state === 'truth' ? 'lie' : row.state === 'lie' ? 'hidden' : 'truth';
  db.prepare('UPDATE pins SET state = ?, manual = 1 WHERE id = ?').run(next, id);
  return next;
}

function deletePin(db, id) {
  db.prepare('DELETE FROM pins WHERE id = ?').run(id);
}

function getParty(db) {
  return db.prepare('SELECT party_deck_id, party_x, party_y FROM game_state WHERE id = 1').get();
}

function setParty(db, deckId, x, y) {
  db.prepare('UPDATE game_state SET party_deck_id = ?, party_x = ?, party_y = ? WHERE id = 1').run(deckId, x, y);
}

function deckById(db, id) {
  return db.prepare('SELECT id, name, unlocked, sort_order, map_json FROM decks WHERE id = ?').get(id);
}

module.exports = {
  listDecksRaw, listPinsRaw, insertPin, updatePin, flipPin, deletePin,
  getParty, setParty, deckById,
};
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- tests/deckstore.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/deckstore.js tests/deckstore.test.js
git commit -m "feat: deck store (pins CRUD, party position)"
```

---

## Milestone 4: Console routes

### Task 4.1: Pin CRUD, party, and map-set routes

**Files:**
- Modify: `src/routes/console.js`
- Test: `tests/api-decks-console.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/api-decks-console.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

async function consoleCookie(base) {
  const r = await fetch(`${base}/api/console/login`, { method:'POST',
    headers:{'content-type':'application/json'}, body: JSON.stringify({ pin:'1234' }) });
  return r.headers.get('set-cookie').split(';')[0];
}

test('console can create, list, flip, and delete pins, and set party', async () => {
  const { base, close, db } = await startTestServer();
  const cookie = await consoleCookie(base);
  const deck = db.prepare('SELECT id FROM decks ORDER BY sort_order LIMIT 1').get();

  // create
  const c = await fetch(`${base}/api/console/pins`, { method:'POST',
    headers:{'content-type':'application/json', cookie},
    body: JSON.stringify({ deckId: deck.id, x: 0.5, y: 0.4, truthLabel: 'Core route', lieLabel: 'Life support', poiType: 'core', phaseGate: 3 }) });
  assert.strictEqual(c.status, 200);
  const { id } = await c.json();

  // list (raw, truth visible to the DM)
  const list = await (await fetch(`${base}/api/console/pins?deckId=${deck.id}`, { headers:{cookie} })).json();
  assert.strictEqual(list.pins.length, 1);
  assert.strictEqual(list.pins[0].truth_label, 'Core route');

  // flip
  const f = await (await fetch(`${base}/api/console/pins/${id}/flip`, { method:'POST', headers:{cookie} })).json();
  assert.strictEqual(f.state, 'lie');

  // party
  const p = await fetch(`${base}/api/console/party`, { method:'POST',
    headers:{'content-type':'application/json', cookie}, body: JSON.stringify({ deckId: deck.id, x: 0.2, y: 0.3 }) });
  assert.strictEqual(p.status, 200);
  assert.strictEqual(db.prepare('SELECT party_deck_id FROM game_state WHERE id=1').get().party_deck_id, deck.id);

  // delete
  await fetch(`${base}/api/console/pins/${id}`, { method:'DELETE', headers:{cookie} });
  const after = await (await fetch(`${base}/api/console/pins?deckId=${deck.id}`, { headers:{cookie} })).json();
  assert.strictEqual(after.pins.length, 0);
  await close();
});

test('console pin routes require parent auth', async () => {
  const { base, close } = await startTestServer();
  const r = await fetch(`${base}/api/console/pins?deckId=1`);
  assert.strictEqual(r.status, 401);
  await close();
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- tests/api-decks-console.test.js`

- [ ] **Step 3: Add routes to `src/routes/console.js`**

Near the top requires of the file, add:

```js
const deckstore = require('../deckstore');
```

Then BEFORE the final `return router;`, add:

```js
  function emitDeckPin(deckId) {
    if (app.locals.io) app.locals.io.emit('deck:pin', { deckId });
  }

  router.get('/pins', (req, res) => {
    res.json({ pins: deckstore.listPinsRaw(db, Number(req.query.deckId)) });
  });

  router.post('/pins', (req, res) => {
    const { deckId, x, y, truthLabel = null, lieLabel = null, phaseGate = null, poiType = 'generic' } = req.body || {};
    if (deckId == null || x == null || y == null) return res.status(400).json({ error: 'deckId, x, y required' });
    const id = deckstore.insertPin(db, {
      deck_id: deckId, x, y, truth_label: truthLabel, lie_label: lieLabel, phase_gate: phaseGate, poi_type: poiType,
    });
    emitDeckPin(deckId);
    res.json({ ok: true, id });
  });

  router.post('/pins/:id', (req, res) => {
    deckstore.updatePin(db, Number(req.params.id), req.body || {});
    const row = db.prepare('SELECT deck_id FROM pins WHERE id = ?').get(Number(req.params.id));
    if (row) emitDeckPin(row.deck_id);
    res.json({ ok: true });
  });

  router.post('/pins/:id/flip', (req, res) => {
    const next = deckstore.flipPin(db, Number(req.params.id));
    if (next === null) return res.status(404).json({ error: 'no such pin' });
    const row = db.prepare('SELECT deck_id FROM pins WHERE id = ?').get(Number(req.params.id));
    if (row) emitDeckPin(row.deck_id);
    res.json({ ok: true, state: next });
  });

  router.delete('/pins/:id', (req, res) => {
    const row = db.prepare('SELECT deck_id FROM pins WHERE id = ?').get(Number(req.params.id));
    deckstore.deletePin(db, Number(req.params.id));
    if (row) emitDeckPin(row.deck_id);
    res.json({ ok: true });
  });

  router.post('/party', (req, res) => {
    const { deckId, x, y } = req.body || {};
    if (deckId == null || x == null || y == null) return res.status(400).json({ error: 'deckId, x, y required' });
    deckstore.setParty(db, deckId, x, y);
    if (app.locals.io) app.locals.io.emit('deck:party', { deckId, x, y });
    res.json({ ok: true });
  });

  router.post('/decks/:id/map', (req, res) => {
    const map = req.body && req.body.map ? JSON.stringify(req.body.map) : null;
    db.prepare('UPDATE decks SET map_json = ? WHERE id = ?').run(map, Number(req.params.id));
    if (app.locals.io) app.locals.io.emit('decks:changed', {});
    res.json({ ok: true });
  });
```

(The existing `GET /api/console/decks` uses `SELECT *`, so `map_json` is already included. The existing `/decks` unlock route is unchanged.)

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- tests/api-decks-console.test.js`

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/routes/console.js tests/api-decks-console.test.js
git commit -m "feat: console pin CRUD, party, and map-set routes"
```

---

## Milestone 5: Player route (resolved render payload)

### Task 5.1: GET /api/decks returns resolved, truth-stripped render data

**Files:**
- Modify: `src/routes/player.js`
- Test: `tests/api-decks-player.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/api-decks-player.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { startTestServer } = require('./helpers');

async function playerLogin(base, db) {
  const c = db.prepare('SELECT * FROM characters ORDER BY sort_order LIMIT 1').get();
  const r = await fetch(`${base}/api/login`, { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ characterId: c.id, pin: c.pin }) });
  return r.headers.get('set-cookie').split(';')[0];
}
async function consoleCookie(base) {
  const r = await fetch(`${base}/api/console/login`, { method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ pin:'1234' }) });
  return r.headers.get('set-cookie').split(';')[0];
}

test('player decks payload resolves pins and never leaks a hidden truth', async () => {
  const { base, close, db } = await startTestServer();
  const cc = await consoleCookie(base);
  const crown = db.prepare("SELECT id FROM decks WHERE name='Crown'").get();

  // a core-route pin that lies from phase 3 on
  await fetch(`${base}/api/console/pins`, { method:'POST', headers:{'content-type':'application/json', cookie:cc},
    body: JSON.stringify({ deckId: crown.id, x:0.5, y:0.5, truthLabel:'Core route', lieLabel:'Life support', poiType:'core', phaseGate:3 }) });
  // put the party on Crown
  await fetch(`${base}/api/console/party`, { method:'POST', headers:{'content-type':'application/json', cookie:cc},
    body: JSON.stringify({ deckId: crown.id, x:0.4, y:0.4 }) });

  const pc = await playerLogin(base, db);
  let body = await (await fetch(`${base}/api/decks`, { headers:{cookie:pc} })).json();
  let crownOut = body.decks.find((d) => d.name === 'Crown');
  // phase 1: truth shows, but Crown at phase 1 has U=0 so party is undrifted
  assert.strictEqual(crownOut.unlocked, true);
  assert.ok(crownOut.map && crownOut.map.shapes.length > 0);
  assert.strictEqual(crownOut.pins[0].label, 'Core route');
  assert.ok(crownOut.party, 'party present on its deck');

  // advance to phase 4: the pin must now lie, and the truth must not appear anywhere
  await fetch(`${base}/api/console/phase`, { method:'POST', headers:{'content-type':'application/json', cookie:cc},
    body: JSON.stringify({ phase: 4 }) });
  body = await (await fetch(`${base}/api/decks`, { headers:{cookie:pc} })).json();
  crownOut = body.decks.find((d) => d.name === 'Crown');
  assert.strictEqual(crownOut.pins[0].label, 'Life support');
  assert.ok(!JSON.stringify(body).includes('Core route'), 'hidden truth never crosses the wire');

  // a sealed deck exposes no map or pins
  const sealed = body.decks.find((d) => d.unlocked === false);
  assert.ok(sealed);
  assert.strictEqual(sealed.map, undefined);
  await close();
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npm test -- tests/api-decks-player.test.js`

- [ ] **Step 3: Replace the `/decks` route in `src/routes/player.js`**

Add these requires near the top of the file (alongside the existing ones):

```js
const { unreliability, driftOffset, fogPatches, clamp01 } = require('../unreliability');
const { effectiveState, displayPin } = require('../pins');
const deckstore = require('../deckstore');
```

Replace the existing `router.get('/decks', ...)` handler with:

```js
  router.get('/decks', guard, (req, res) => {
    const phase = currentPhase(db);
    const party = deckstore.getParty(db);
    const decks = deckstore.listDecksRaw(db).map((d) => {
      const depth = d.sort_order;
      const out = { id: d.id, name: d.name, depth, unlocked: !!d.unlocked };
      if (!d.unlocked) return out; // sealed decks expose nothing
      const U = unreliability(phase, depth);
      out.U = U;
      out.map = d.map_json ? JSON.parse(d.map_json) : null;
      out.fog = fogPatches(d.id, U);
      out.pins = deckstore.listPinsRaw(db, d.id).map((p) => displayPin(p, effectiveState(p, phase)));
      if (party.party_deck_id === d.id && party.party_x != null) {
        const off = driftOffset(d.id * 100 + phase, U);
        out.party = { x: clamp01(party.party_x + off.dx), y: clamp01(party.party_y + off.dy) };
      } else {
        out.party = null;
      }
      return out;
    });
    res.json({ phase, decks });
  });
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npm test -- tests/api-decks-player.test.js`

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/routes/player.js tests/api-decks-player.test.js
git commit -m "feat: player decks payload (resolved pins, drift, fog, truth-stripped)"
```

**Milestone 5 checkpoint:** the full server side is done and the no-leak guarantee is proven by test. Review here.

---

## Milestone 6: Shared schematic renderer

### Task 6.1: public/shared/schematic.js and serve /shared

**Files:**
- Create: `public/shared/schematic.js`
- Modify: `server.js`

- [ ] **Step 1: Create `public/shared/schematic.js`**

```js
// public/shared/schematic.js
// Renders a deck map_json (normalized 0..1 shapes) to SVG inner markup,
// in a 0..1000 viewBox. Loaded by both the player app and the DM console.
(function (global) {
  const S = 1000;
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function schematicSvg(map) {
    if (!map || !Array.isArray(map.shapes)) return '';
    return map.shapes.map((sh) => {
      if (sh.t === 'hull') {
        return `<rect x="${sh.x*S}" y="${sh.y*S}" width="${sh.w*S}" height="${sh.h*S}" rx="${(sh.rx||0.05)*S}" fill="#0a1814" stroke="#2f5a51" stroke-width="3"/>`;
      }
      if (sh.t === 'corridor' || sh.t === 'room') {
        const fill = sh.t === 'room' ? '#102923' : '#13332c';
        return `<rect x="${sh.x*S}" y="${sh.y*S}" width="${sh.w*S}" height="${sh.h*S}" fill="${fill}" stroke="#27463f"/>`;
      }
      if (sh.t === 'ellipse') {
        const ring = `<ellipse cx="${sh.cx*S}" cy="${sh.cy*S}" rx="${sh.rx*S}" ry="${sh.ry*S}" fill="none" stroke="#3ad29f" stroke-width="3" stroke-dasharray="6 5" opacity=".7"/>`;
        const label = sh.label ? `<text x="${sh.cx*S}" y="${sh.cy*S}" fill="#6fd8bf" font-size="22" text-anchor="middle">${esc(sh.label)}</text>` : '';
        return ring + label;
      }
      if (sh.t === 'label') {
        return `<text x="${sh.x*S}" y="${sh.y*S}" fill="#7fb8ac" font-size="22" text-anchor="middle">${esc(sh.text)}</text>`;
      }
      return '';
    }).join('');
  }
  global.Schematic = { schematicSvg, esc, S };
})(window);
```

- [ ] **Step 2: Serve /shared in `server.js`**

In `buildApp`, add a static mount for the shared dir. Add this line just BEFORE the existing `app.use('/console', express.static(...))` line:

```js
  app.use('/shared', express.static(path.join(__dirname, 'public/shared')));
```

- [ ] **Step 3: Verify it serves**

Run:
```bash
PORT=3099 DB_PATH=:memory: node server.js &
SVPID=$!
sleep 1
curl -s -o /dev/null -w "schematic.js %{http_code}\n" http://localhost:3099/shared/schematic.js
node --check public/shared/schematic.js && echo "syntax ok"
kill $SVPID
```
Expected: `schematic.js 200` and `syntax ok`.

- [ ] **Step 4: Run full suite (server change must not break tests)**

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add public/shared/schematic.js server.js
git commit -m "feat: shared schematic SVG renderer, served at /shared"
```

---

## Milestone 7: Player Decks view

### Task 7.1: Rewrite renderDecks as a live schematic map

**Files:**
- Modify: `public/player/index.html`
- Modify: `public/player/app.js`

- [ ] **Step 1: Load the shared renderer in `public/player/index.html`**

Add this line just BEFORE the existing `<script src="/app.js"></script>`:

```html
  <script src="/shared/schematic.js"></script>
```

- [ ] **Step 2: Replace `renderDecks` in `public/player/app.js`**

Replace the entire existing `async function renderDecks(back) { ... }` with:

```js
async function renderDecks(back) {
  root.innerHTML = `<div class="screen">${back}<h2>Decks</h2><div id="decks">loading…</div></div>`;
  const data = await (await fetch('/api/decks')).json();
  const list = data.decks.map((d) => {
    if (!d.unlocked) {
      return `<div class="bubble" style="opacity:.4"><div class="who">\u{1F512} ${escapeHtml(d.name)}</div>Sealed.</div>`;
    }
    return `<div class="bubble"><div class="who">${escapeHtml(d.name)}${d.U >= 0.5 ? ' <span style="color:#b85a6a">signal weak</span>' : ''}</div>
      ${deckMapSvg(d)}</div>`;
  }).join('');
  document.getElementById('decks').innerHTML = list || '<p style="color:var(--muted)">No deck data.</p>';
}

function deckMapSvg(d) {
  const inner = window.Schematic ? window.Schematic.schematicSvg(d.map) : '';
  const fog = (d.fog || []).map((f) =>
    `<circle cx="${f.x*1000}" cy="${f.y*1000}" r="${f.radius*1000}" fill="#160b12" opacity="${f.opacity}"/>`).join('');
  const pins = (d.pins || []).map((p) => {
    if (p.obscured) {
      return `<g><circle cx="${p.x*1000}" cy="${p.y*1000}" r="14" fill="none" stroke="#6e4a57" stroke-dasharray="4 4"/>
        <text x="${p.x*1000}" y="${p.y*1000+34}" fill="#6e4a57" font-size="22" text-anchor="middle">?</text></g>`;
    }
    const color = p.poi_type === 'core' ? '#c9b25a' : p.poi_type === 'hazard' ? '#b85a6a' : '#7a8cff';
    return `<g><circle cx="${p.x*1000}" cy="${p.y*1000}" r="12" fill="${color}"/>
      <text x="${p.x*1000}" y="${p.y*1000+34}" fill="#9fb0ff" font-size="22" text-anchor="middle">${window.Schematic.esc(p.label || '')}</text></g>`;
  }).join('');
  const party = d.party
    ? `<g><circle cx="${d.party.x*1000}" cy="${d.party.y*1000}" r="26" fill="#3ad29f" opacity=".25"/>
       <circle cx="${d.party.x*1000}" cy="${d.party.y*1000}" r="12" fill="#3ad29f"/>
       <text x="${d.party.x*1000}" y="${d.party.y*1000-22}" fill="#bfffe9" font-size="22" text-anchor="middle">you</text></g>`
    : '';
  return `<svg viewBox="0 0 1000 1000" style="width:100%;background:#0c1f1c;border:1px solid #214039;border-radius:10px">
    ${inner}${fog}${pins}${party}</svg>`;
}
```

- [ ] **Step 3: Make the Decks view live. In `connectSocket()`, add handlers**

Alongside the existing `socket.on('decks:changed', ...)`, `socket.on('phase', ...)`, etc., add:

```js
  socket.on('deck:pin', () => { if (state.view === 'decks') render(); });
  socket.on('deck:party', () => { if (state.view === 'decks') render(); });
```

And update the existing `decks:changed` handler (added in v1) so it re-renders the decks view if open (it currently does). Confirm it reads:

```js
  socket.on('decks:changed', () => { if (state.view === 'decks') render(); });
```

Also, a phase change must refresh the decks map (U changed). The existing `phase` handler already calls `render()`, which re-runs `renderDecks` (a fresh fetch) when the decks view is active. No change needed beyond confirming `render()` routes to `renderDecks` for `state.view === 'decks'`.

- [ ] **Step 4: Syntax check + smoke**

```bash
node --check public/player/app.js
PORT=3099 DB_PATH=:memory: node server.js &
SVPID=$!
sleep 1
# drop a pin + party on Crown, then read the player payload
curl -s -c /tmp/c.jar -X POST localhost:3099/api/console/login -H 'content-type: application/json' -d '{"pin":"1234"}' >/dev/null
CROWN=$(curl -s -b /tmp/c.jar localhost:3099/api/console/decks | node -e "const d=JSON.parse(require('fs').readFileSync(0)).decks;process.stdout.write(String(d.find(x=>x.name==='Crown').id))")
curl -s -b /tmp/c.jar -X POST localhost:3099/api/console/pins -H 'content-type: application/json' -d "{\"deckId\":$CROWN,\"x\":0.5,\"y\":0.5,\"truthLabel\":\"Stairs\",\"poiType\":\"stairs\"}" >/dev/null
curl -s -b /tmp/c.jar -X POST localhost:3099/api/console/party -H 'content-type: application/json' -d "{\"deckId\":$CROWN,\"x\":0.3,\"y\":0.3}" >/dev/null
curl -s -c /tmp/p.jar -X POST localhost:3099/api/login -H 'content-type: application/json' -d '{"characterId":1,"pin":"1000"}' >/dev/null
echo "--- player decks (Crown should have map, a Stairs pin, and party) ---"
curl -s -b /tmp/p.jar localhost:3099/api/decks | node -e "const d=JSON.parse(require('fs').readFileSync(0)).decks.find(x=>x.name==='Crown');console.log('map?',!!d.map,'pins',d.pins.length,'party?',!!d.party)"
kill $SVPID
```
Expected: `map? true pins 1 party? true`.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add public/player/index.html public/player/app.js
git commit -m "feat: player Decks view renders live schematic with pins, fog, drifted party"
```

---

## Milestone 8: Console Decks editor

### Task 8.1: Map view with place-party, drop-POI, flip, and U readout

**Files:**
- Modify: `public/console/index.html`
- Modify: `public/console/console.js`

- [ ] **Step 1: Load the shared renderer in `public/console/index.html`**

Add just BEFORE the existing `<script src="/console/console.js"></script>`:

```html
  <script src="/shared/schematic.js"></script>
```

- [ ] **Step 2: Replace `renderDecksEditor` in `public/console/console.js`**

Replace the entire existing `async function renderDecksEditor() { ... }` (and keep its `window._addDeck` / `window._unlock` helpers, they still apply) with the version below, and add the new handlers after it. This version: lists decks, opens one into a clickable map, supports a mode toggle (place party vs drop POI), lists existing pins as tappable to flip, and shows the U readout.

```js
let _deckEdit = { deckId: null, mode: 'party', phase: 1 };

async function renderDecksEditor() {
  const main = document.getElementById('main'); if (!main) return;
  const nav = `<div class="row">
      <button onclick="window._view('send')">Send</button>
      <button onclick="window._view('archive')">Archive</button>
      <button onclick="window._view('decks')">Decks</button></div>`;
  const { decks } = await (await fetch('/api/console/decks')).json();
  const phaseResp = await (await fetch('/api/console/phase')).json();
  _deckEdit.phase = phaseResp.phase;
  if (_deckEdit.deckId == null && decks[0]) _deckEdit.deckId = decks[0].id;
  const deck = decks.find((d) => d.id === _deckEdit.deckId) || decks[0];

  const deckTabs = decks.map((d) =>
    `<button class="${d.id===_deckEdit.deckId?'cur':''}" onclick="window._deckPick(${d.id})">${escapeHtml(d.name)}${d.unlocked?'':' \u{1F512}'}</button>`).join(' ');

  const U = deck ? unreliabilityClient(_deckEdit.phase, deck.sort_order) : 0;
  const map = deck && deck.map_json ? JSON.parse(deck.map_json) : null;
  const inner = (map && window.Schematic) ? window.Schematic.schematicSvg(map) : '';

  main.innerHTML = `${nav}
    <h3>Decks</h3>
    <div class="row"><input id="dn" placeholder="new deck name"/><button class="primary" onclick="window._addDeck()">Add</button></div>
    <div class="phasebar">${deckTabs}</div>
    <div class="row" style="margin-top:8px">
      <strong>${deck?escapeHtml(deck.name):'—'}</strong>
      <button onclick="window._unlock(${deck?deck.id:0}, ${deck&&deck.unlocked?0:1})">${deck&&deck.unlocked?'seal':'unlock'}</button>
      <span style="color:#8fb3aa">players see unreliability ${Math.round(U*100)}%</span>
    </div>
    <div class="row">
      <button class="${_deckEdit.mode==='party'?'cur':''}" onclick="window._deckMode('party')">Place party</button>
      <button class="${_deckEdit.mode==='poi'?'cur':''}" onclick="window._deckMode('poi')">Drop POI</button>
    </div>
    <svg id="deckmap" viewBox="0 0 1000 1000" style="width:100%;max-width:420px;background:#0c1f1c;border:1px solid #214039;border-radius:10px;cursor:crosshair" onclick="window._deckMapClick(event)">
      ${inner}<g id="dm-overlay"></g>
    </svg>
    <h4>Points of interest (truth shown to you)</h4>
    <div id="deckpins"></div>`;
  renderDeckOverlay();
}

// the console computes U with the same formula as the server (small mirror)
function unreliabilityClient(phase, depth) {
  const p = Math.max(1, Math.min(5, phase)), d = Math.max(1, depth);
  const u = 0.6 * ((p - 1) / 4) + 0.4 * ((d - 1) / 5);
  return Math.max(0, Math.min(1, u));
}

async function renderDeckOverlay() {
  if (_deckEdit.deckId == null) return;
  const { pins } = await (await fetch(`/api/console/pins?deckId=${_deckEdit.deckId}`)).json();
  const overlay = document.getElementById('dm-overlay');
  if (overlay) {
    overlay.innerHTML = pins.map((p) => {
      const color = p.state === 'hidden' ? '#6e4a57' : p.state === 'lie' ? '#b85a6a' : '#7a8cff';
      const label = p.truth_label || p.lie_label || '';
      return `<g style="cursor:pointer" onclick="event.stopPropagation();window._flipPin(${p.id})">
        <circle cx="${p.x*1000}" cy="${p.y*1000}" r="13" fill="${color}"/>
        <text x="${p.x*1000}" y="${p.y*1000+34}" fill="#cfe8e2" font-size="22" text-anchor="middle">${escapeHtml(label)} [${p.state}]</text></g>`;
    }).join('');
  }
  const listEl = document.getElementById('deckpins');
  if (listEl) {
    listEl.innerHTML = pins.map((p) => `<div class="lib-item">
      <strong>${escapeHtml(p.truth_label || '(decoy)')}</strong> -> lie: ${escapeHtml(p.lie_label || '—')}
      ${p.phase_gate?`(auto-lies at P${p.phase_gate})`:''} [${p.state}]
      <button onclick="window._flipPin(${p.id})">flip</button>
      <button onclick="window._delPin(${p.id})">delete</button>
    </div>`).join('') || '<p style="color:#8fb3aa">No points yet.</p>';
  }
}

window._deckPick = (id) => { _deckEdit.deckId = id; renderDecksEditor(); };
window._deckMode = (m) => { _deckEdit.mode = m; renderDecksEditor(); };

window._deckMapClick = async (ev) => {
  const svg = document.getElementById('deckmap');
  const rect = svg.getBoundingClientRect();
  const x = (ev.clientX - rect.left) / rect.width;
  const y = (ev.clientY - rect.top) / rect.height;
  if (_deckEdit.mode === 'party') {
    await fetch('/api/console/party', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ deckId: _deckEdit.deckId, x, y }) });
  } else {
    const truth = prompt('True label for this point (blank = decoy):') || '';
    const lie = prompt('What does Allie show instead (the lie)? (blank = none):') || '';
    const gateRaw = prompt('Auto-lie starting at which phase? (1-5, blank = manual only):') || '';
    const phaseGate = gateRaw ? Math.max(1, Math.min(5, Number(gateRaw))) : null;
    await fetch('/api/console/pins', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ deckId: _deckEdit.deckId, x, y, truthLabel: truth || null, lieLabel: lie || null, phaseGate, poiType: 'generic' }) });
  }
  renderDeckOverlay();
};

window._flipPin = async (id) => {
  await fetch(`/api/console/pins/${id}/flip`, { method:'POST' });
  renderDeckOverlay();
};
window._delPin = async (id) => {
  await fetch(`/api/console/pins/${id}`, { method:'DELETE' });
  renderDeckOverlay();
};
```

Note: `renderDeckOverlay` fetches pins (which carry truth for the DM, since the DM is never deceived by their own tool). The party marker is not drawn on the DM map in v1: the DM sets the party by clicking, and the players see it on their phones. The editor stays focused on pins and party placement.

- [ ] **Step 3: Syntax check + smoke**

```bash
node --check public/console/console.js
PORT=3099 DB_PATH=:memory: node server.js &
SVPID=$!
sleep 1
curl -s -o /dev/null -w "console %{http_code}\n" http://localhost:3099/console/
curl -s -o /dev/null -w "shared %{http_code}\n" http://localhost:3099/shared/schematic.js
kill $SVPID
```
Expected: both 200, syntax clean.

- [ ] **Step 4: Run full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add public/console/index.html public/console/console.js
git commit -m "feat: console deck editor (map, place party, drop/flip POIs, U readout)"
```

**Milestone 8 checkpoint:** the DM can author and corrupt deck maps; players see the live, lying result.

---

## Milestone 9: Final review and browser verification

### Task 9.1: Whole-feature review + headless browser smoke

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all green (roughly 44 tests).

- [ ] **Step 2: Headless browser flow (cached Chrome via puppeteer-core, do not commit the devDep)**

Drive a real browser to confirm the visual feature runs without JS errors:
1. Player logs in, opens Decks, sees Crown's schematic.
2. Console logs in, opens Decks editor, clicks the map to place the party and drop a POI with a truth and a lie and a phase gate of 3.
3. Player Decks view updates live (party pin and POI appear) over the socket.
4. Console sets phase to 4. Player Decks view re-renders: the POI now shows the lie label, and `document` text does NOT contain the truth label.
5. Assert zero uncaught pageerrors.

Install puppeteer-core only (`npm install --save-dev puppeteer-core`), locate the cached Chrome under `~/.cache/puppeteer/chrome/*/chrome-linux64/chrome`, run with `--no-sandbox`, then discard the devDep change (`git checkout package.json package-lock.json`). Report per-assertion PASS/FAIL.

- [ ] **Step 3: Commit nothing if clean; otherwise fix forward**

If the browser run surfaces a bug, write a failing test that reproduces it, fix it, and commit the fix. Then re-run.

---

## Self-Review Notes (author checklist, completed)

- **Spec coverage:** six decks + nested Deck Zero (Task 1.2 data; finale gating is content the DM authors via pins/unlock). Pin model C (party + POIs): Tasks 3.1, 4.1, 5.1, 7.1, 8.1. Effects Drift + Fog ambient (Task 2.1, applied in 5.1/7.1), Mislabel/Hide/Decoy as per-POI lies (Task 2.2, 3.1, 8.1). Hybrid control: phase-gate auto-flip + manual flip (Task 2.2 `effectiveState`, 3.1 `flipPin`, 8.1 UI). Schematic maps both surfaces (Task 6.1 shared renderer). Unreliability formula 0.6/0.4 (Task 2.1). Truth never leaks (Task 5.1 test asserts it). Live updates (deck:pin, deck:party, decks:changed, phase) in 4.1/7.1. Console authoring + U readout (8.1).
- **No-leak guarantee:** the player route resolves pins server-side and sends only display labels; the test in Task 5.1 asserts the truth string is absent from the whole payload at a lying phase.
- **Type/name consistency:** `unreliability(phase, depth)`, `driftOffset(seed, U)`, `fogPatches(seed, U)`, `effectiveState(pin, phase)`, `displayPin(pin, state)`, `listDecksRaw/listPinsRaw/insertPin/updatePin/flipPin/deletePin/getParty/setParty` are used identically across tasks. Socket events `deck:pin` and `deck:party` are emitted (4.1) and listened for (7.1). The console mirrors the U formula inline (8.1) with the same 0.6/0.4 constants as `src/unreliability.js` (2.1); this duplication is intentional in the bundler-free PWA and is called out here.
- **Cut-lines:** Fog auto-generates (no per-deck authoring). Decoys reuse the pins table (no new schema). The DM map does not draw the party marker in v1 (noted).
