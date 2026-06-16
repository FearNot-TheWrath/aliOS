// src/chroniclestore.js
// Loads chronicle entries from markdown files. Each file may start with a
// frontmatter block delimited by lines of '---':
//   ---
//   title: The Voyage
//   order: 1
//   visibility: player | redacted
//   code: SOMECODE        (only for redacted entries)
//   teaser: a hint shown on the locked entry
//   ---
//   ...markdown body...
//
// Redacted entries never expose their body or code through the public index;
// the body is only rendered after a correct code is supplied to unlock().
const fs = require('node:fs');
const path = require('node:path');
const { mdToHtml } = require('./markdown');

function parseEntry(raw) {
  let meta = {};
  let body = raw;
  const m = String(raw).match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (m) {
    body = m[2];
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i > -1) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return { meta, body };
}

function loadEntries(dir) {
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { return []; }
  return files.map((f) => {
    const { meta, body } = parseEntry(fs.readFileSync(path.join(dir, f), 'utf8'));
    return {
      id: f.replace(/\.md$/, ''),
      title: meta.title || f.replace(/\.md$/, ''),
      order: Number(meta.order || 0),
      visibility: meta.visibility === 'redacted' ? 'redacted' : 'player',
      code: meta.code || null,
      teaser: meta.teaser || null,
      body,
    };
  }).sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));
}

// The public index never includes a redacted entry's title, body, or code.
function publicIndex(entries) {
  return entries.map((e) => {
    if (e.visibility === 'player') {
      return { id: e.id, title: e.title, visibility: 'player', html: mdToHtml(e.body) };
    }
    return { id: e.id, visibility: 'redacted', teaser: e.teaser };
  });
}

function unlock(entries, id, code) {
  const e = entries.find((x) => x.id === id && x.visibility === 'redacted');
  if (!e || !e.code) return { ok: false };
  const given = String(code || '').trim().toUpperCase();
  if (given !== String(e.code).trim().toUpperCase()) return { ok: false };
  return { ok: true, title: e.title, html: mdToHtml(e.body) };
}

module.exports = { parseEntry, loadEntries, publicIndex, unlock };
