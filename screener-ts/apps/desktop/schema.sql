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

-- ── Undo history ────────────────────────────────────────────────────────────
-- Sync resolves conflicts by last-write-wins on a CLIENT clock, so a device
-- installed today always outranks real data written months ago. The client has
-- guards against pushing first-boot defaults, but the server genuinely cannot
-- tell a real new edit from a default — so it never discards the old value.
-- Every overwrite lands here, every delete lands in kv_trash, and
-- GET /api/sync/history + POST /api/sync/restore expose both.
-- Append-only, so `key` repeats: the PK is (user_id, key, archived_at).
CREATE TABLE IF NOT EXISTS kv_history (
  user_id     TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,              -- the value as it was BEFORE the write
  updated_at  INTEGER NOT NULL,           -- its own last-write stamp
  archived_at INTEGER NOT NULL,           -- when it was superseded (epoch ms)
  PRIMARY KEY (user_id, key, archived_at)
);
CREATE INDEX IF NOT EXISTS idx_kv_history_user ON kv_history (user_id, archived_at DESC);

CREATE TABLE IF NOT EXISTS kv_trash (
  user_id    TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key, deleted_at)
);
CREATE INDEX IF NOT EXISTS idx_kv_trash_user ON kv_trash (user_id, deleted_at DESC);
