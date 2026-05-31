const { test } = require('node:test');
const assert = require('node:assert');
const { DECKS } = require('../src/deckmaps');

test('there are six decks in descent order with maps', () => {
  assert.strictEqual(DECKS.length, 6);
  DECKS.forEach((d, i) => {
    assert.strictEqual(d.depth, i + 1, `deck ${i} depth`);
    assert.ok(d.name, 'has a name');
    assert.ok(Array.isArray(d.map.shapes) && d.map.shapes.length > 0, `${d.name} has shapes`);
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
