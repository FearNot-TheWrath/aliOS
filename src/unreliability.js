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
