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

- **Collapse guard** — `PUT` refuses (409) a write that discards ≥50% of a stored
  value of ≥200 bytes. This is the one guard that does not trust timestamps, and
  that matters because *the untrustworthy input is the timestamp*: a fresh install
  honestly reports a newer clock than months-old data, so no clock-based rule can
  tell the two apart. This one looks at the payload, which a client cannot
  misreport. Shared spec: `collapseVerdict` in core (unit-tested), mirrored into
  the Pages Function because Functions cannot import workspace packages.
  - An "is it empty?" check would have **missed this incident** — the starter
    account is `[{account:…, lots:[]}]`, a one-element array, not `[]`.
  - Deliberate mass deletes still work: a user write on a hydrated store retries
    with `?allowShrink=1` (`remotePut(..., { deliberate: true })`). First-boot
    defaults and the merge's push-up half never set it, so for them a 409 is the
    correct outcome — the server keeps its value and the next pull brings it down.
  - **This is what makes a Time Travel restore survive** a device still running the
    old build, which is what defeated the first recovery attempt.
- Overwrites archive the previous value to `kv_history`; deletes archive to
  `kv_trash`. LWW on a client clock cannot be made safe on the server alone, so
  the server stops discarding old values.
- `GET /api/sync/history[?key=]` and `POST /api/sync/restore` expose them, wired
  into the Sync dialog as "Recover an older version".

**UI** (`src/ui/watchlists.ts`) — `loadIndex()` returns the default list without
persisting it unless there is legacy data to migrate.

## Recovery — run in this order

### 0. STOP THE BLEEDING FIRST — before any restore

**A restored database is overwritten again within seconds if any device is still
running the old build with a stored access code.** Signing in is not required:
`enterApp()` opens Portfolio on every app entry, which seeds defaults, stamps them
`Date.now()`, and pushes. The restore succeeds, then vanishes — looking exactly
like "Time Travel didn't work".

This bit the first recovery attempt. Do this before anything else:

- On **every** device with the app open: **☰ → Sync → Sign out**. That clears only
  the access code (`sync:code`); local data is kept, and with no code every push
  is a no-op. Or just close every tab running the app.
- **Better: deploy the fixed build (step 4) before restoring.** The server-side
  collapse guard then rejects the wiping write outright, so even a device on the
  old build cannot flatten a restored row. Deploying first turns recovery from
  "race the clients" into a safe operation, so prefer it whenever possible.

Ordering rule: **quiesce → measure → deploy → restore → sign back in.** (Deploy
before restore: only the deployed guard makes the restored data stick. If for some
reason you must restore first, keep every client closed until the deploy lands.)

### 0b. Preserve what still exists

On any device that still shows the real data, open **☰ → Sync → ⬇ Export data**
*before* touching the code field. Keep that file.

### 0c. Measure the overwrite time — do not guess it

`scripts/diagnose-loss.sh` prints `kv.updated_at` for every live row. That column
IS the moment the overwrite happened. Aim Time Travel ~10 minutes before it.

Restoring to a guessed instant that is *after* the overwrite silently returns an
already-empty snapshot. And note Time Travel keeps **every** point in the last 30
days: restoring does not consume bookmarks, so a wrong probe costs nothing and is
undoable. The only hard boundary is the 30-day limit.

### 1. Authenticate wrangler (read-only steps follow)

```bash
cd screener-ts/apps/desktop
npx wrangler login
```

### 2. See what the server holds now, and what it held before

```bash
bash scripts/diagnose-loss.sh     # read-only: live rows + the overwrite window
```

Then resolve a bookmark for ~10 minutes before the `earliest_utc` it reports. The
timestamp below is a PLACEHOLDER — substitute the measured one:

```bash
npx wrangler d1 time-travel info screener-sync --timestamp <measured-minus-10min>
```

D1 keeps 30 days of point-in-time history. This is the real recovery path and it
covers the loss regardless of the app-level history tables, which only record from
deploy onward.

To search when the exact instant is unclear, `scripts/probe-timestamp.sh <ts>`
restores to one instant, reports the size of `accounts` at that point (a few
hundred bytes = still the empty starter account; tens of KB = the real portfolio),
dumps it to `recovery-tickets/`, and saves a return bookmark on first run.

### 3. Deploy the fix — BEFORE the restore, not after

This ordering is the whole lesson of the failed first attempt. Restoring while the
old build is live invites an immediate repeat: any device running the old code
pushes its defaults over the restored rows on mere app open. Once the fixed build
is deployed, the server's collapse guard rejects that write, so the restored data
holds even if a stale client is still running.

```bash
cd screener-ts/apps/desktop
npx wrangler d1 execute screener-sync --remote --file=./schema.sql   # adds kv_history/kv_trash
npm run build
npx wrangler pages deploy dist --project-name the-professional        # MUST run from apps/desktop
```

`schema.sql` is `CREATE TABLE IF NOT EXISTS` throughout, so re-applying it is safe
and touches no existing data.

### 4. Restore, keeping a way back

```bash
# Full dump of the CURRENT database, as a safety net before any restore
npx wrangler d1 export screener-sync --remote --output ./kv-before-restore.sql
```

Then either:

**(a) Point-in-time restore** — puts the whole DB back as it was. Substitute the
timestamp measured in step 0c; the one below is only a shape example:

```bash
npx wrangler d1 time-travel restore screener-sync --timestamp <measured-minus-10min>
```

This is the cleanest fix if nothing worth keeping was written since. It is
undoable via another bookmark, and `kv-before-restore.sql` is the belt-and-braces
copy.

**(b) Surgical** — read the old value out of the dump and PUT just that key back
through the app (Sync dialog → history), leaving newer rows alone.

### 5. Verify

Sign in on a spare device/profile and confirm the real data appears rather than an
empty starter account. Then check **Sync → 🕘 Browse versions** lists entries.

Confirm the guard is live too — a wiping write should now be refused:

```bash
# Should print the row's real size, and keep printing it after any device opens.
npx wrangler d1 execute screener-sync --remote \
  --command "SELECT key, length(value) AS bytes FROM kv WHERE key = 'accounts'"
```
