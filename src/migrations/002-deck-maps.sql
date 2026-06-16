-- src/migrations/002-deck-maps.sql
ALTER TABLE decks ADD COLUMN map_json TEXT;

ALTER TABLE game_state ADD COLUMN party_deck_id INTEGER;
ALTER TABLE game_state ADD COLUMN party_x REAL;
ALTER TABLE game_state ADD COLUMN party_y REAL;

CREATE TABLE pins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id INTEGER NOT NULL REFERENCES decks(id),
  x REAL NOT NULL,
  y REAL NOT NULL,
  truth_label TEXT,
  lie_label TEXT,
  state TEXT NOT NULL DEFAULT 'truth',
  phase_gate INTEGER,
  poi_type TEXT NOT NULL DEFAULT 'generic',
  manual INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
