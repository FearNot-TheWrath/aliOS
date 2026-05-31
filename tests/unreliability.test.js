const { test } = require('node:test');
const assert = require('node:assert');
const { unreliability, driftOffset, fogPatches } = require('../src/unreliability');

test('unreliability is 0 at Crown/Phase1 and 1 at DeckZero/Phase5', () => {
  assert.strictEqual(unreliability(1, 1), 0);
  assert.ok(Math.abs(unreliability(5, 6) - 1) < 1e-9);
  for (const [p, d] of [[1,1],[3,3],[5,6],[5,1],[1,6]]) {
    const u = unreliability(p, d);
    assert.ok(u >= 0 && u <= 1, `U(${p},${d})=${u} in range`);
  }
  assert.ok(unreliability(2, 5) > unreliability(2, 1));
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
