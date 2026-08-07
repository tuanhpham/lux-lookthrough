# Sync data-loss: cause, fix, and recovery

## What happened

Signing in on a new device with the access code wiped the account's data.

Sync resolves conflicts by **last-write-wins on a timestamp the client supplies**
(`Date.now()`). That is fine between two devices holding real data, and unsound
the moment a fresh install joins:

1. `enterApp()` opens the Portfolio tab on every app entry, so `portfolioTab.load()`
   runs immediately — before the startup `pullAndMerge()` has answered.
2. On an empty device several code paths seed defaults and **persist** them:
   `watchlists.loadIndex()` wrote a default index on any read; `playbook` seeded
   prompts; Portfolio wrote `pf_bars:*` / `pf_eurusd_bars` caches and re-saved
   `accounts` when it scrubbed NaN stops.
3. Every one of those writes was stamped `Date.now()` — **later than the real data
   written weeks earlier** — and pushed to the server.
4. The server accepted it: `... WHERE excluded.updated_at >= kv.updated_at`.
5. `DELETE` had no timestamp guard at all, and there was no history table, so the
   overwrite was permanent.

The old `pullAndMerge()` also pushed never-stamped keys up at `ts || Date.now()`,
which stamped device defaults "now" and overwrote real server rows.

Note `portfolioTab.load()` already carried a comment describing this exact hazard
and deliberately avoided persisting its starter account — the guard was correct
but local to one function, while the same pattern existed in several others.

## The fix

**Client** (`src/adapters/storage.ts`):

- **Hydration gate** — while a code is set but the first pull has not landed,
  writes stay local and their pushes are queued. Those keys go in
  `preHydrationWrites`, and the merge lets the server win them outright.
- **`freshCode`** — entering a code calls `pullAndMerge(synced, { freshCode: true })`.
  Signing in means download: the server wins every key it holds. Keys it does not
  have still upload, so a device with genuine local-only work contributes it.
- **Unstamped keys never overwrite** — `ts === 0` uploads only when the server has
  nothing, and then at `UNSTAMPED_PUSH_TS = 1` so any real edit outranks it.
- **Pre-merge snapshot** — the local values a merge is about to overwrite are
  copied to `__pre_merge_backup__` first.
- **Caches no longer sync** — `pf_bars:*`, `pf_eurusd_bars`, `sectorlabels` are
  device-local (re-fetchable, and each rewrite was another racing push).

The per-key rules are pure functions in core — `decidePull` / `decidePush` in
`packages/core/src/storage/syncMerge.ts` — unit-tested against the incident's
timestamps (`tests/storage/syncMerge.test.ts`), including the invariant that the
pull and push halves never both act on one key.

**Server** (`functions/api/sync/[[path]].ts`, `schema.sql`):

- Overwrites archive the previous value to `kv_history`; deletes archive to
  `kv_trash`. LWW on a client clock cannot be made safe on the server alone, so
  the server stops discarding old values.
- `GET /api/sync/history[?key=]` and `POST /api/sync/restore` expose them, wired
  into the Sync dialog as "Recover an older version".

**UI** (`src/ui/watchlists.ts`) — `loadIndex()` returns the default list without
persisting it unless there is legacy data to migrate.

## Recovery — run in this order

The order matters: steps 1–2 are read-only and preserve evidence. Do not open the
app on a device that still has data until step 2 is done.

### 0. Preserve what still exists

On any device that still shows the real data, open **☰ → Sync → ⬇ Export data**
*before* touching the code field. Keep that file.

### 1. Authenticate wrangler (read-only steps follow)

```bash
cd screener-ts/apps/desktop
npx wrangler login
```

### 2. See what the server holds now, and what it held before

```bash
# Current live rows
npx wrangler d1 execute screener-sync --remote \
  --command "SELECT key, updated_at, length(value) AS bytes FROM kv ORDER BY updated_at DESC LIMIT 40"

# D1 keeps 30 days of point-in-time history — this is the real recovery path,
# and it covers the loss regardless of the app-level history added above.
npx wrangler d1 time-travel info screener-sync --timestamp 2026-08-01T00:00:00Z
```

`time-travel info` returns a **bookmark** for that instant. Pick a timestamp from
*before* you signed in on the new device.

### 3. Recover without overwriting anything (preferred)

Restore into a copy first, read the rows out, and only then decide:

```bash
# Full dump of the CURRENT database, as a safety net before any restore
npx wrangler d1 export screener-sync --remote --output ./kv-before-restore.sql
```

Then either:

**(a) Point-in-time restore** — puts the whole DB back as it was:

```bash
npx wrangler d1 time-travel restore screener-sync --timestamp 2026-08-01T00:00:00Z
```

This is the cleanest fix if nothing worth keeping was written since. It is
undoable via another bookmark, and `kv-before-restore.sql` is the belt-and-braces
copy.

**(b) Surgical** — read the old value out of the dump and PUT just that key back
through the app (Sync dialog → history), leaving newer rows alone.

### 4. Deploy the fix BEFORE signing in again

Restoring while the old build is still live invites a repeat: any device running
the old code can push its defaults over the restored rows again.

```bash
cd screener-ts/apps/desktop
npx wrangler d1 execute screener-sync --remote --file=./schema.sql   # adds kv_history/kv_trash
npm run build
npx wrangler pages deploy dist --project-name the-professional        # MUST run from apps/desktop
```

`schema.sql` is `CREATE TABLE IF NOT EXISTS` throughout, so re-applying it is safe
and touches no existing data.

### 5. Verify

Sign in on a spare device/profile and confirm the real data appears rather than an
empty starter account. Then check **Sync → 🕘 Browse versions** lists entries.
