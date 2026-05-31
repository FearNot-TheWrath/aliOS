-- src/migrations/001-initial.sql
CREATE TABLE game_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_phase INTEGER NOT NULL DEFAULT 1,
  current_session INTEGER NOT NULL DEFAULT 1
);
INSERT INTO game_state (id, current_phase, current_session) VALUES (1, 1, 1);

CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO config (key, value) VALUES ('parent_pin', '1234');

CREATE TABLE characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  avatar TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE senders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  avatar TEXT,
  is_allie INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES senders(id),
  app TEXT NOT NULL DEFAULT 'messages',
  body TEXT NOT NULL,
  image_path TEXT,
  phase_gate INTEGER,
  label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id),
  sender_id INTEGER NOT NULL REFERENCES senders(id),
  app TEXT NOT NULL DEFAULT 'messages',
  body TEXT NOT NULL,
  image_path TEXT,
  phase_at_send INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  read_at INTEGER
);

CREATE TABLE archive_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  response TEXT NOT NULL,
  redacted INTEGER NOT NULL DEFAULT 0,
  phase_gate INTEGER
);

CREATE TABLE decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  image_path TEXT,
  unlocked INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
