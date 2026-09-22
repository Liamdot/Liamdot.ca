CREATE TABLE IF NOT EXISTS messages (
  path TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  name TEXT,
  at INTEGER NOT NULL,
  edit_key TEXT NOT NULL,
  ip_hash TEXT,
  reports INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS messages_by_time ON messages (at);
CREATE INDEX IF NOT EXISTS messages_by_writer ON messages (ip_hash, at);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('writing', 'on');

CREATE TABLE IF NOT EXISTS wasters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL,
  edit_key TEXT NOT NULL,
  ip_hash TEXT,
  hidden INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS wasters_by_seconds ON wasters (seconds DESC);
