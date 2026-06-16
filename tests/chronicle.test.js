const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { mdToHtml } = require('../src/markdown');
const { loadEntries, publicIndex, unlock } = require('../src/chroniclestore');

test('mdToHtml renders headings, bold, lists, blockquote, escapes html', () => {
  const html = mdToHtml('## Title\n\n**bold** and *em*\n\n- one\n- two\n\n> quote\n\n<script>x</script>');
  assert.match(html, /<h2>Title<\/h2>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<li>one<\/li>/);
  assert.match(html, /<blockquote>quote<\/blockquote>/);
  assert.ok(!html.includes('<script>'), 'raw html is escaped');
});

const SAMPLE = [
  { id: 'a', title: 'Open One', order: 1, visibility: 'player', code: null, teaser: null, body: 'Hello **world**' },
  { id: 'b', title: 'Secret Chapter', order: 2, visibility: 'redacted', code: 'FIRSTGREEN', teaser: 'a hint', body: 'THE SECRET TRUTH' },
];

test('publicIndex exposes player html but never a redacted body, title, or code', () => {
  const idx = publicIndex(SAMPLE);
  const open = idx.find((e) => e.id === 'a');
  assert.match(open.html, /<strong>world<\/strong>/);
  const red = idx.find((e) => e.id === 'b');
  assert.strictEqual(red.visibility, 'redacted');
  assert.strictEqual(red.teaser, 'a hint');
  const json = JSON.stringify(idx);
  assert.ok(!json.includes('THE SECRET TRUTH'), 'redacted body never in the public index');
  assert.ok(!json.includes('FIRSTGREEN'), 'unlock code never in the public index');
  assert.ok(!json.includes('Secret Chapter'), 'redacted title never in the public index');
});

test('unlock requires the right code (case-insensitive) and only then returns html', () => {
  assert.strictEqual(unlock(SAMPLE, 'b', 'wrong').ok, false);
  assert.strictEqual(unlock(SAMPLE, 'a', 'whatever').ok, false, 'player entries are not unlockable');
  const ok = unlock(SAMPLE, 'b', 'firstgreen');
  assert.strictEqual(ok.ok, true);
  assert.match(ok.html, /THE SECRET TRUTH/);
  assert.strictEqual(ok.title, 'Secret Chapter');
});

test('the seeded content loads: an open Voyage entry and a redacted Origins entry', () => {
  const entries = loadEntries(path.join(__dirname, '..', 'content', 'chronicle'));
  assert.ok(entries.length >= 2);
  const voyage = entries.find((e) => /Voyage/i.test(e.title));
  assert.ok(voyage && voyage.visibility === 'player');
  const origins = entries.find((e) => e.id === '02-origins');
  assert.ok(origins && origins.visibility === 'redacted' && origins.code);
});
