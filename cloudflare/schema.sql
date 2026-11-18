-- Scripture Study sync database (Cloudflare D1)
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'member',      -- 'owner' | 'member'
  created INTEGER NOT NULL
);
-- one row per synced item (note, journal entry, highlight, label, bookmark, settings)
CREATE TABLE IF NOT EXISTS items (
  email TEXT NOT NULL,
  coll TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,                                -- JSON; NULL when deleted
  updated INTEGER NOT NULL,                 -- client edit time (last write wins)
  deleted INTEGER NOT NULL DEFAULT 0,
  stamp INTEGER NOT NULL,                   -- server time of the write (sync cursor)
  PRIMARY KEY (email, coll, id)
);
CREATE INDEX IF NOT EXISTS items_stamp ON items (email, stamp);
-- small key/value store: invite code, counters
CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT NOT NULL);
-- rate limiting buckets
CREATE TABLE IF NOT EXISTS hits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, exp INTEGER NOT NULL);
