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
