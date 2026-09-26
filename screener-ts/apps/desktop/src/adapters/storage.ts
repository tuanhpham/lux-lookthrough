import { type Storage, decidePull, decidePush, UNSTAMPED_PUSH_TS } from '@screener/core';
import { isTauri } from './http.js';
import {
  isSyncEnabled,
  remoteDelete,
  remotePull,
  remotePut,
  type SyncEntry,
} from './syncClient.js';

/**
 * localStorage-backed Storage for the web build and a simple, synchronous
 * desktop fallback. Keys are namespaced under `screener:`.
 */
export class LocalStorageAdapter implements Storage {
  constructor(private ns = 'screener:') {}
  private k(key: string): string {
    return this.ns + key;
  }
  async get<T>(key: string): Promise<T | null> {
    const raw = localStorage.getItem(this.k(key));
    return raw == null ? null : (JSON.parse(raw) as T);
  }
  async set<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(this.k(key), JSON.stringify(value));
  }
  async list(prefix = ''): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const full = localStorage.key(i);
      if (full && full.startsWith(this.ns)) {
        const bare = full.slice(this.ns.length);
        if (bare.startsWith(prefix)) out.push(bare);
      }
    }
    return out;
  }
  async delete(key: string): Promise<void> {
    localStorage.removeItem(this.k(key));
  }
}

/**
 * Tauri fs-backed Storage: one JSON file per key under the app data dir. Lazily
 * imports the Tauri fs plugin so the web build never references it.
 */
export class TauriFileStorage implements Storage {
  constructor(private dir = 'data') {}

  private async fs() {
    return import('@tauri-apps/plugin-fs');
  }
  private file(key: string): string {
    return `${this.dir}/${key.replace(/[^a-zA-Z0-9._:-]/g, '_')}.json`;
  }

  async get<T>(key: string): Promise<T | null> {
    const fs = await this.fs();
    try {
      const text = await fs.readTextFile(this.file(key), { baseDir: fs.BaseDirectory.AppData });
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }
  async set<T>(key: string, value: T): Promise<void> {
    const fs = await this.fs();
    await fs.mkdir(this.dir, { baseDir: fs.BaseDirectory.AppData, recursive: true });
    await fs.writeTextFile(this.file(key), JSON.stringify(value, null, 2), {
      baseDir: fs.BaseDirectory.AppData,
    });
  }
  async list(prefix = ''): Promise<string[]> {
    const fs = await this.fs();
    try {
      const entries = await fs.readDir(this.dir, { baseDir: fs.BaseDirectory.AppData });
      return entries
        .filter((e) => e.name?.endsWith('.json'))
        .map((e) => e.name!.replace(/\.json$/, ''))
        .filter((n) => n.startsWith(prefix));
    } catch {
      return [];
    }
  }
  async delete(key: string): Promise<void> {
    const fs = await this.fs();
    try {
      await fs.remove(this.file(key), { baseDir: fs.BaseDirectory.AppData });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Local-first storage that mirrors writes to the D1 sync backend when an access
 * code is set. Reads always hit the fast local layer; writes go local first
 * (so the UI is instant and offline-tolerant) and are then pushed to the server
 * best-effort. A per-key timestamp map (also stored locally) drives
 * last-write-wins both on push and on the startup merge (`pullAndMerge`).
 *
 * Keys we never sync (transient/device-specific) are matched by `syncable()`.
 *
 * ── THE HAZARD THIS LAYER MUST DEFEND AGAINST ────────────────────────────────
 * Last-write-wins keyed on the CLIENT's `Date.now()` means a brand-new device is
 * inherently dangerous: every default value it seeds on first boot is stamped
 * "now" and therefore beats the real data stored days earlier. The server's
 * upsert accepts any write with `updated_at >= kv.updated_at`, so one such push
 * permanently replaces the real row.
 *
 * Two guards, both required:
 *   1. HYDRATION GATE — while a code is set but the first pull has not landed,
 *      writes stay local and their pushes are QUEUED. Those keys are recorded in
 *      `preHydrationWrites`, and the merge lets the SERVER win them outright
 *      regardless of timestamps: a value written before we ever heard from the
 *      server is a device default, not a considered edit.
 *   2. NEVER PUSH AN UNSTAMPED KEY OVER AN EXISTING ROW — `ts === 0` means "this
 *      device never explicitly wrote this", so it must not overwrite a real
 *      server value (see `pullAndMerge` step 2).
 */
const TS_KEY = '__sync_ts__'; // local map: key → epoch-ms of last local write
/** Rolling one-slot local backup taken immediately before a destructive merge. */
const SNAPSHOT_KEY = '__pre_merge_backup__';

/**
 * Prefixes of pure derived caches: re-fetchable price bars and FX history. They
 * are large, they rewrite themselves on every Portfolio open, and syncing them
 * bought nothing — but each rewrite was another "now"-stamped push racing the
 * merge. Keeping them local shrinks the blast radius and the payload.
 */
const LOCAL_ONLY_PREFIXES = ['pf_bars:', 'pf_eurusd_bars', 'sectorlabels'];

/** Keys that must stay device-local (caches, the sync code itself). */
function syncable(key: string): boolean {
  if (key === TS_KEY || key === SNAPSHOT_KEY) return false;
  if (key.startsWith('sync:')) return false;
  if (LOCAL_ONLY_PREFIXES.some((p) => key.startsWith(p))) return false;
  return true;
}

/** False until the first pull of this session completes (or sync is off). */
let hydrated = false;
/** Keys written this session before hydration → the server wins them. */
const preHydrationWrites = new Set<string>();
/** Pushes deferred until hydration. `null` value = a pending delete. */
const pendingPushes = new Map<string, { value: unknown; ts: number } | null>();

// ── Push observability ───────────────────────────────────────────────────────
/**
 * Pushes are fire-and-forget by design (a dead server must not break a local
 * write), which for a long time meant a device could stop saving and say nothing.
 * These few lines are the whole fix: record the outcome and let anyone who cares
 * subscribe.
 *
 * The listener registry lives HERE rather than the status UI importing itself into
 * this file, because `adapters/` must not depend on `ui/` — the same layering that
 * keeps `core` free of platform code. This module reports facts; the UI decides
 * what they look like (`deriveSyncStatus` in core).
 */
export interface SyncActivity {
  /** When a push last succeeded this session, or null. */
  lastPushAt: number | null;
  /** Message from the most recent failed push; cleared by the next success. */
  lastError: string | null;
  /**
   * Message from the most recent failed PULL; cleared by the next success. While
   * this is set the hydration gate is still shut, so nothing is being uploaded at
   * all — see `deriveSyncStatus`, which ranks it above a failed push.
   */
  pullError: string | null;
  /** Writes waiting on the hydration gate, or in flight right now. */
  queued: number;
}

let lastPushAt: number | null = null;
let lastError: string | null = null;
let pullError: string | null = null;
/** Pushes handed to fetch but not yet resolved — 'pending', not yet 'ok'. */
let inFlight = 0;
const activityListeners: Array<(a: SyncActivity) => void> = [];

/** A snapshot of push health. Cheap; safe to call on every render. */
export function syncActivity(): SyncActivity {
  return { lastPushAt, lastError, pullError, queued: pendingPushes.size + inFlight };
}

/** Subscribe to push-health changes. Multi-subscriber, unlike `onSynced`. */
export function onSyncActivity(cb: (a: SyncActivity) => void): void {
  activityListeners.push(cb);
}

function emitActivity(): void {
  const snap = syncActivity();
  for (const cb of activityListeners) {
    try {
      cb(snap);
    } catch {
      /* a broken indicator must never break storage */
    }
  }
}

/** Seed the last-success time from the previous session (see `ui/syncStatus`). */
export function primeLastPushAt(at: number | null): void {
  if (lastPushAt === null && at !== null) lastPushAt = at;
  emitActivity();
}

/**
 * Wrap a push so its outcome is recorded. Still never throws: the caller's local
 * write has already succeeded and must not be undone by a transport problem.
 */
function tracked(push: Promise<void>): Promise<void> {
  inFlight++;
  emitActivity();
  return push.then(
    () => {
      inFlight--;
      lastPushAt = Date.now();
      lastError = null;
      emitActivity();
    },
    (e: unknown) => {
      inFlight--;
      lastError = String((e as Error)?.message ?? e);
      emitActivity();
    },
  );
}

/** True once the server has been heard from — writes push through immediately. */
export function isHydrated(): boolean {
  return hydrated;
}

/** One-shot callbacks to run when the gate opens. */
const hydrationWaiters: Array<() => void> = [];

/**
 * Run `cb` once the first pull has landed (immediately if it already has).
 *
 * For work that must not be mistaken for a first-boot default. The motivating
 * case is the migration that strips the chart cache out of `accounts`: it shrinks
 * the row by >90%, so the server's collapse guard refuses it unless the write is
 * flagged `deliberate` — and only post-hydration writes are. Queuing it through
 * the pending-push path instead would flush it unflagged and get a silent 409,
 * leaving the bloated row on the server for the next device to download.
 */
export function onHydrated(cb: () => void): void {
  if (hydrated) {
    cb();
    return;
  }
  hydrationWaiters.push(cb);
}

/** One-slot local backup of the values a merge was about to overwrite. */
export interface PreMergeSnapshot {
  at: number;
  timestamps: Record<string, number>;
  data: Record<string, unknown>;
}

/**
 * Open the gate and flush whatever was queued while it was shut. Keys the merge
 * awarded to the server are dropped from the queue by `pullAndMerge` first, so
 * this never re-uploads a value that was just overwritten locally.
 */
export function openSyncGate(): void {
  if (hydrated) return;
  hydrated = true;
  // Drain into a local list first: `tracked` counts each push as in-flight, and
  // clearing the queue afterwards must not make the indicator read 'ok' while
  // these requests are still open.
  const queued = [...pendingPushes];
  pendingPushes.clear();
  preHydrationWrites.clear();
  for (const [key, push] of queued) {
    if (push === null) void tracked(remoteDelete(key));
    else void tracked(remotePut(key, push.value, push.ts));
  }
  // Waiters run LAST, after the queue is drained: a waiter's own writes must not
  // be re-queued, and must land on top of whatever the queue just pushed.
  const waiters = hydrationWaiters.splice(0);
  for (const cb of waiters) {
    try {
      cb();
    } catch {
      /* a waiter must never break the gate */
    }
  }
  emitActivity(); // the gate is open now — 'pending' may have become 'ok'
}

/** Re-shut the gate around a merge (entering a code mid-session). */
function shutSyncGate(): void {
  hydrated = false;
  pendingPushes.clear();
  preHydrationWrites.clear();
}

export class SyncedStorage implements Storage {
  constructor(private local: Storage) {}

  private async timestamps(): Promise<Record<string, number>> {
    return (await this.local.get<Record<string, number>>(TS_KEY)) ?? {};
  }
  private async stamp(key: string, ts: number): Promise<void> {
    const map = await this.timestamps();
    map[key] = ts;
    await this.local.set(TS_KEY, map);
  }
  /** Exposed for the startup merge so it can compare/advance timestamps. */
  async tsOf(key: string): Promise<number> {
    return (await this.timestamps())[key] ?? 0;
  }

  /** Every local timestamp in one read — see `applyRemote` for why that matters. */
  async allTimestamps(): Promise<Record<string, number>> {
    return this.timestamps();
  }

  async get<T>(key: string): Promise<T | null> {
    return this.local.get<T>(key);
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.local.set(key, value);
    if (!syncable(key)) return;
    const ts = Date.now();
    await this.stamp(key, ts);
    if (!isSyncEnabled()) return;
    if (!hydrated) {
      // Sync is on but we have not heard from the server yet. Anything written
      // in this gap is overwhelmingly a first-boot default (starter portfolio,
      // default watchlist, seeded prompts) whose "now" timestamp would beat the
      // real remote row. Queue the push and remember the key so the merge lets
      // the server win it.
      preHydrationWrites.add(key);
      pendingPushes.set(key, { value, ts });
      emitActivity();
      return;
    }
    // Past hydration this device has seen the account's data, so a write that
    // shrinks a key is a real change (closing positions, clearing a watchlist),
    // not a first-boot default. Mark it deliberate so the server's collapse guard
    // does not silently reject it and then push the old value back down. The
    // previous value is still archived to kv_history, so it stays recoverable.
    // Best-effort: a failed push must not break the local write. `tracked` swallows
    // the rejection exactly as the bare `.catch` used to, but records it first so
    // the status indicator can say the server is behind instead of failing silently.
    void tracked(remotePut(key, value, ts, { deliberate: true }));
  }

  /** Bookkeeping keys are hidden from every consumer — including the backup
   * export, which would otherwise embed a full copy of the snapshot. */
  async list(prefix = ''): Promise<string[]> {
    return (await this.local.list(prefix)).filter((k) => k !== TS_KEY && k !== SNAPSHOT_KEY);
  }

  async delete(key: string): Promise<void> {
    await this.local.delete(key);
    if (!syncable(key)) return;
    await this.stamp(key, Date.now());
    if (!isSyncEnabled()) return;
    if (!hydrated) {
      // A pre-hydration delete is almost always cache pruning against keys this
      // device invented seconds ago (scan:*/calendar:* housekeeping). Sending it
      // would erase the server's copy for good — DELETE has no timestamp guard.
      preHydrationWrites.add(key);
      pendingPushes.set(key, null);
      emitActivity();
      return;
    }
    void tracked(remoteDelete(key));
  }

  /** Write a value into the LOCAL layer only (used by the merge to apply remote
   * winners without re-pushing them to the server). */
  async setLocalFromRemote<T>(key: string, value: T, ts: number): Promise<void> {
    await this.local.set(key, value);
    await this.stamp(key, ts);
  }

  /**
   * Apply every remote winner, then write the timestamp map ONCE.
   *
   * `setLocalFromRemote` per key was quadratic: `stamp()` re-reads, re-parses and
   * re-serialises the whole timestamp map on every single key, and that map grows
   * with the number of keys. Two hundred keys meant two hundred full rewrites of a
   * map of two hundred entries, all on the main thread — on a laptop it is a
   * shrug, on a phone it is the "Pulling your data…" that never ends. Reading once
   * and writing once makes the merge linear.
   *
   * `onEach` exists so the caller can show progress: a slow merge that is visibly
   * moving is a different bug report from one that has hung.
   */
  async applyRemote(
    entries: ReadonlyArray<{ key: string; value: unknown; ts: number }>,
    onEach?: (done: number) => void,
  ): Promise<void> {
    const map = await this.timestamps();
    let done = 0;
    try {
      for (const e of entries) {
        await this.local.set(e.key, e.value);
        map[e.key] = e.ts;
        onEach?.(++done);
      }
    } finally {
      // Even on a partial apply (a storage quota error halfway through) the stamps
      // of what DID land must be recorded, or those keys look unwritten and the
      // next merge re-applies them. Wrapped because this write can fail too, and
      // the original error is the one worth reporting.
      try {
        await this.local.set(TS_KEY, map);
      } catch {
        /* keep the original failure */
      }
    }
  }

  /**
   * Copy the CURRENT local value of every key a merge is about to touch into one
   * snapshot slot, before anything is overwritten. Cheap insurance: without it a
   * bad merge is terminal, because the server keeps no history and its DELETE is
   * unconditional. Only the newest snapshot is kept, and it never syncs.
   */
  async snapshotBeforeMerge(keys: readonly string[]): Promise<void> {
    try {
      const data: Record<string, unknown> = {};
      for (const key of keys) {
        const value = await this.local.get<unknown>(key);
        if (value !== null) data[key] = value;
      }
      if (!Object.keys(data).length) return; // nothing here to lose
      await this.local.set(SNAPSHOT_KEY, {
        at: Date.now(),
        timestamps: await this.timestamps(),
        data,
      });
    } catch {
      /* a snapshot failure must never block the merge */
    }
  }

  /** The pre-merge snapshot, if one exists. */
  async preMergeSnapshot(): Promise<PreMergeSnapshot | null> {
    return this.local.get<PreMergeSnapshot>(SNAPSHOT_KEY);
  }

  /** All syncable local keys with their value + last-write timestamp. Used by
   * the two-way merge to push locally-newer keys up to the server. */
  async localEntries(): Promise<Array<{ key: string; value: unknown; ts: number }>> {
    const keys = (await this.local.list('')).filter((k) => k !== TS_KEY && syncable(k));
    const ts = await this.timestamps();
    const out: Array<{ key: string; value: unknown; ts: number }> = [];
    for (const key of keys) {
      const value = await this.local.get<unknown>(key);
      if (value !== null) out.push({ key, value, ts: ts[key] ?? 0 });
    }
    return out;
  }
}

/** How far a merge has got. `down` = applying server data, `up` = uploading. */
export interface PullProgress {
  phase: 'down' | 'up';
  done: number;
  total: number;
}

export interface PullOpts {
  /** The user has just entered a code on this device — download, never overwrite. */
  freshCode?: boolean;
  /** Internal: this call is an automatic retry of a pull that failed. */
  retry?: boolean;
  /**
   * Called as keys are applied and uploaded, so a caller showing a spinner can
   * show a count instead. The point is not decoration: "34/120" and "0/120" are
   * different bug reports, and a merge with no feedback is indistinguishable from
   * a hang — which is how this was reported in the first place.
   */
  onProgress?: (p: PullProgress) => void;
}

/** Parallel uploads in the push-up half. Enough to hide mobile latency, small
 * enough not to look like a flood to the Pages function. */
const PUSH_CONCURRENCY = 4;

/** Serialises merges; see the comment in `pullAndMerge`. */
let chain: Promise<void> = Promise.resolve();

/**
 * Retry backoff for a failed pull, in ms, then every 3 minutes.
 *
 * Front-loaded because the common cause is mundane: a phone cold-starting the
 * installed PWA before the radio is up, so the app boots from the service-worker
 * cache and the first request loses a race it will win three seconds later. The
 * tail is slow because the other causes (offline, a revoked code) are not fixed by
 * hammering, and this runs on a battery.
 */
const PULL_RETRY_MS = [3_000, 8_000, 20_000, 60_000, 180_000];

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryStep = 0;
let retryArgs: { storage: SyncedStorage; opts: PullOpts } | null = null;
let reconnectWired = false;

function cancelPullRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryStep = 0;
  // `retryArgs` is the record of an OUTSTANDING stall, so it is dropped here too:
  // `retryPull` below uses its presence to decide whether a manual retry is
  // repeating a stalled attempt or starting a fresh one.
  retryArgs = null;
}

/**
 * Queue another attempt, and start listening for the events that mean "try now":
 * regaining the network, and the app coming back to the foreground. On a phone the
 * foreground event is the important one — a backgrounded PWA's timers are frozen,
 * so waking up is the only moment a stalled device can recover.
 */
function schedulePullRetry(storage: SyncedStorage, opts: PullOpts): void {
  retryArgs = { storage, opts };
  wireReconnect();
  if (retryTimer) return;
  const wait = PULL_RETRY_MS[Math.min(retryStep, PULL_RETRY_MS.length - 1)]!;
  retryStep++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    // The rejection is already recorded in `pullError`; swallow it here so an
    // automatic attempt never surfaces as an unhandled rejection.
    void retryPullNow().catch(() => 0);
  }, wait);
}

function retryPullNow(): Promise<number> {
  if (!retryArgs) return Promise.resolve(0);
  const { storage, opts } = retryArgs;
  // `onProgress` is dropped: it points at the dialog that started this attempt,
  // which is long closed by the time a background retry fires.
  return pullAndMerge(storage, { ...opts, retry: true, onProgress: undefined });
}

/**
 * Try again now, at the user's request (the status pill). Replays the attempt that
 * stalled, WITH its original options: a sign-in whose pull failed must be retried
 * as a sign-in, because `freshCode` is what stops this device's pre-account values
 * being uploaded over the account's real data. A plain `pullAndMerge()` here would
 * turn one failed request into the wipe that RECOVERY.md documents.
 */
export function retryPull(storage: SyncedStorage): Promise<number> {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryStep = 0;
  return retryArgs ? retryPullNow() : pullAndMerge(storage);
}

function wireReconnect(): void {
  if (reconnectWired || typeof window === 'undefined') return;
  reconnectWired = true;
  const kick = (): void => {
    // Only when still stalled, and not on top of an attempt already queued for the
    // next moment anyway.
    if (!pullError || retryTimer) return;
    retryStep = 0; // a real signal; start the backoff over
    void retryPullNow().catch(() => 0);
  };
  window.addEventListener('online', kick);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') kick();
    });
  }
}

/**
 * Two-way merge between local and the D1 backend, last-write-wins by timestamp.
 * Called at startup and after entering a fresh code:
 *   • Remote entries newer than local → applied locally.
 *   • Local entries newer than remote (or absent remotely) → pushed up.
 * This makes first-connect non-destructive: a device that already has local
 * watchlists/posts uploads them instead of having them wiped, and an empty new
 * device downloads everything. Returns the count of locally-applied changes.
 *
 * Every rule below exists because its absence caused real, permanent data loss
 * when signing in on a fresh phone. Do not "simplify" them away:
 *
 *   • The SERVER wins any key this device wrote before the pull landed, whatever
 *     the timestamps say. Those writes are first-boot defaults; letting a
 *     "now"-stamped empty portfolio beat a two-month-old real one is exactly the
 *     bug. See `preHydrationWrites`.
 *   • A key with `ts === 0` (never explicitly written here) is NEVER pushed over
 *     an existing server row. It only uploads when the server has nothing, and
 *     then at `UNSTAMPED_PUSH_TS` so any real write outranks it.
 *   • A local snapshot is taken BEFORE the first destructive apply, so a bad
 *     merge is recoverable instead of terminal.
 */
export function pullAndMerge(storage: SyncedStorage, opts: PullOpts = {}): Promise<number> {
  // Serialise every merge. Sign-in, the boot pull, the pill's retry button and the
  // retry timer can all fire within the same second, and two merges running side by
  // side interleave their per-key decisions and overwrite each other's pre-merge
  // snapshot. `chain` is assigned synchronously so a second caller in the same tick
  // still queues behind the first.
  const next = chain.then(() => mergeOnce(storage, opts));
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function mergeOnce(storage: SyncedStorage, opts: PullOpts): Promise<number> {
  if (!isSyncEnabled()) {
    openSyncGate(); // sync off → nothing to wait for
    return 0;
  }
  // A code entered mid-session is the highest-risk moment: the app has been
  // running code-free, so every tab already seeded and stamped its defaults with
  // a "now" that outranks the real remote data. Shut the gate so this merge lets
  // the server win, and discard pushes queued under the old (code-less) identity.
  //
  // NOT on a retry: the gate is already shut there, and re-shutting it would throw
  // away both the queue and `preHydrationWrites` — the record of which keys were
  // written during the stall and must therefore lose to the server. Those writes
  // would then be neither pushed nor beaten, i.e. silently stranded on the device.
  if (opts.freshCode && !opts.retry) shutSyncGate();
  let entries: SyncEntry[];
  try {
    entries = await remotePull(0);
  } catch (e) {
    // Offline / unreachable / a code the server no longer accepts → keep local as
    // is. Deliberately do NOT hydrate: pushing local defaults up on a flaky first
    // boot is the whole hazard.
    //
    // But the gate stays shut until a pull succeeds, so "the next pull" cannot be
    // left to chance — before this, a single failed boot pull meant a device that
    // queued writes for the rest of the session and showed a calm grey 'Syncing…'
    // the whole time. Record the failure (the pill turns red and says so) and keep
    // trying.
    throw stall(e, storage, opts);
  }
  // The gate will open below; from here on the device is genuinely syncing. Emit
  // here rather than leaving it to `openSyncGate`, which no-ops when the gate is
  // already open — that would leave the pill red after a recovered pull.
  if (pullError !== null) {
    pullError = null;
    emitActivity();
  }
  cancelPullRetry();

  const remoteByKey = new Map(entries.map((e) => [e.key, e]));
  // Snapshot the keys the server is about to overwrite, so this merge is undoable.
  await storage.snapshotBeforeMerge(entries.map((e) => e.key));

  // The per-key rules themselves live in core (`decidePull`/`decidePush`) where
  // they are unit-tested against the exact timestamps from the incident. This
  // function only supplies the inputs and performs the I/O.
  const ctxFor = (key: string) => ({
    freshCode: !!opts.freshCode,
    writtenBeforeFirstPull: preHydrationWrites.has(key),
  });

  // 1) Remote → local. Every decision is taken against ONE read of the timestamp
  // map, and the winners are applied in one batch (see `applyRemote`): the old
  // per-key `tsOf` + `setLocalFromRemote` pair re-read and re-wrote that whole map
  // twice per entry.
  let applied = 0;
  try {
    const localTs = await storage.allTimestamps();
    const winners = entries.filter(
      (e) => decidePull(e.updatedAt, localTs[e.key] ?? 0, ctxFor(e.key)) === 'apply-remote',
    );
    await storage.applyRemote(
      winners.map((e) => ({ key: e.key, value: e.value, ts: e.updatedAt })),
      (done) => opts.onProgress?.({ phase: 'down', done, total: winners.length }),
    );
    for (const e of winners) {
      // Cancel any queued push for this key: it lost, and flushing it on gate
      // open would undo the value we just restored.
      pendingPushes.delete(e.key);
    }
    applied = winners.length;
  } catch (e) {
    // The download half failed while writing locally — on a phone this is almost
    // always the storage quota (a few MB, and the pre-merge snapshot doubles what
    // the payload needs). It used to escape as an unhandled rejection: the gate
    // stayed shut, the pill pulsed grey, and the sign-in dialog sat on "Pulling
    // your data…" for the rest of the session with the reason nowhere on screen.
    // Same treatment as a failed pull: say so, and keep retrying.
    throw stall(e, storage, opts);
  }

  // 2) Local → remote.
  // NOTE: these pushes deliberately do NOT set `deliberate` — none of them came
  // from a user action, so if one would collapse a server row the server's 409 is
  // the right answer. The value stays safe remotely and arrives on the next pull.
  try {
    const ups: Array<() => Promise<void>> = [];
    for (const { key, value, ts } of await storage.localEntries()) {
      const remote = remoteByKey.get(key);
      switch (decidePush(ts, remote ? remote.updatedAt : null, ctxFor(key))) {
        case 'push':
          ups.push(() => remotePut(key, value, ts));
          break;
        case 'push-as-unstamped':
          ups.push(() => remotePut(key, value, UNSTAMPED_PUSH_TS));
          break;
        case 'skip':
          break;
      }
    }
    // A few at a time rather than one after another. These were strictly
    // sequential: on a first sign-in that uploads everything this device already
    // had, n keys meant n round trips end to end — minutes on a phone, with the
    // dialog frozen on its "Pulling…" message throughout. The keys are
    // independent, so the only reason to serialise them was that it was simpler.
    let next = 0;
    let done = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const i = next++;
        if (i >= ups.length) return;
        await ups[i]!().catch(() => {});
        opts.onProgress?.({ phase: 'up', done: ++done, total: ups.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(PUSH_CONCURRENCY, ups.length) }, worker));
  } catch {
    /* push-up is best-effort; the pull half already succeeded */
  }

  openSyncGate();
  return applied;
}

/**
 * Record a stall and return the error to throw.
 *
 * Every way a merge can fail ends here, so there is exactly one place that decides
 * what a stalled device looks like: `pullError` set (the pill goes red and names
 * the reason), a retry queued, and the caller given a real rejection to report
 * instead of a promise that never settles.
 */
function stall(e: unknown, storage: SyncedStorage, opts: PullOpts): Error {
  pullError = String((e as Error)?.message ?? e);
  emitActivity();
  schedulePullRetry(storage, opts);
  return e instanceof Error ? e : new Error(pullError);
}

export function makeStorage(): Storage {
  const local = isTauri() ? new TauriFileStorage() : new LocalStorageAdapter();
  return new SyncedStorage(local);
}
