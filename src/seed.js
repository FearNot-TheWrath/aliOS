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
