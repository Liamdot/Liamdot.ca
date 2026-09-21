-- The database behind Nine. Paste this into the D1 console once, when you
-- first create the database.

CREATE TABLE IF NOT EXISTS messages (
  path      TEXT PRIMARY KEY,   -- "4.7.1.5": the squares picked at each level
  text      TEXT NOT NULL,
  name      TEXT,               -- optional, whatever they typed
  at        INTEGER NOT NULL,   -- when it was written
  edit_key  TEXT NOT NULL,      -- secret only the writer's browser knows
  ip_hash   TEXT,               -- scrambled, so one person can't flood it
  reports   INTEGER DEFAULT 0,
  hidden    INTEGER DEFAULT 0   -- 1 once it's been reported enough, or by you
);

CREATE INDEX IF NOT EXISTS messages_by_time ON messages (at);
CREATE INDEX IF NOT EXISTS messages_by_writer ON messages (ip_hash, at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- "off" stops all new writing, leaving what's there readable.
INSERT OR IGNORE INTO settings (key, value) VALUES ('writing', 'on');
