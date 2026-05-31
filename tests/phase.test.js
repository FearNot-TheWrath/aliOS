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
  assert.ok(!lockedApps(4).includes('decks'), 'Decks stays open at high phase (the map lies, it does not lock)');
  assert.ok(!lockedApps(5).includes('decks'), 'Decks open at phase 5 too');
  assert.ok(lockedApps(4).includes('archive'), 'Archive still locks at high phase');
});

test('Allie tone defined per phase', () => {
  assert.ok(ALLIE_TONE[1] && ALLIE_TONE[5]);
});
