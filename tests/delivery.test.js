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
