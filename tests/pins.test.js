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
  assert.ok(!JSON.stringify(displayPin(base, 'lie')).includes('Core route'));
  assert.ok(!JSON.stringify(displayPin(base, 'hidden')).includes('Core route'));
});
