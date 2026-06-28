-- D1 schema for cross-device sync (watchlists, posts, paper-trading accounts,
-- and once-a-day scan results). Apply with:
--   wrangler d1 execute screener-sync --file=./schema.sql --remote
--
-- Identity model: "you + a few invited people". Each person gets one row in
-- `users` with a secret access code. There is NO public sign-up; you issue
-- codes manually (see README / deploy notes). The `kv` table is a per-user
-- key/value store that the RemoteStorage adapter reads & writes — it mirrors
-- the exact keys the app already uses locally (watchlists:index, post:*,
-- accounts, scan:*, …), so nothing in the app's storage shape changes.

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,           -- stable user id (uuid)
  code       TEXT NOT NULL UNIQUE,       -- secret access code (what the user types)
  name       TEXT,                       -- human label, e.g. "Tu Anh"
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kv (
  user_id    TEXT NOT NULL,
  key        TEXT NOT NULL,              -- e.g. "watchlists:index", "post:2026-06-24-foo"
  value      TEXT NOT NULL,              -- JSON blob (the value the app stored)
  updated_at INTEGER NOT NULL,           -- epoch millis; used for last-write-wins
  PRIMARY KEY (user_id, key),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- List/prefix scans (RemoteStorage.list) hit this; keep it indexed.
CREATE INDEX IF NOT EXISTS idx_kv_user ON kv (user_id, key);
