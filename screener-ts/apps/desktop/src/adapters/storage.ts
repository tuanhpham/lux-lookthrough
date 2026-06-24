import type { Storage } from '@screener/core';
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
 * Keys we never sync (transient/device-specific) are matched by NO_SYNC.
 */
const TS_KEY = '__sync_ts__'; // local map: key → epoch-ms of last local write

/** Keys that must stay device-local (caches, the sync code itself). */
function syncable(key: string): boolean {
  if (key === TS_KEY) return false;
  if (key.startsWith('sync:')) return false;
  return true;
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

  async get<T>(key: string): Promise<T | null> {
    return this.local.get<T>(key);
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.local.set(key, value);
    if (!syncable(key)) return;
    const ts = Date.now();
    await this.stamp(key, ts);
    if (isSyncEnabled()) {
      // Best-effort: a failed push must not break the local write.
      void remotePut(key, value, ts).catch(() => {
        /* offline / transient — local copy is the source of truth until next sync */
      });
    }
  }

  async list(prefix = ''): Promise<string[]> {
    return (await this.local.list(prefix)).filter((k) => k !== TS_KEY);
  }

  async delete(key: string): Promise<void> {
    await this.local.delete(key);
    if (!syncable(key)) return;
    await this.stamp(key, Date.now());
    if (isSyncEnabled()) void remoteDelete(key).catch(() => {});
  }

  /** Write a value into the LOCAL layer only (used by the merge to apply remote
   * winners without re-pushing them to the server). */
  async setLocalFromRemote<T>(key: string, value: T, ts: number): Promise<void> {
    await this.local.set(key, value);
    await this.stamp(key, ts);
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

/**
 * Two-way merge between local and the D1 backend, last-write-wins by timestamp.
 * Called at startup and after entering a fresh code:
 *   • Remote entries newer than local → applied locally.
 *   • Local entries newer than remote (or absent remotely) → pushed up.
 * This makes first-connect non-destructive: a device that already has local
 * watchlists/posts uploads them instead of having them wiped, and an empty new
 * device downloads everything. Returns the count of locally-applied changes.
 */
export async function pullAndMerge(storage: SyncedStorage): Promise<number> {
  if (!isSyncEnabled()) return 0;
  let entries: SyncEntry[];
  try {
    entries = await remotePull(0);
  } catch {
    return 0; // offline / not reachable → keep local as-is
  }

  const remoteByKey = new Map(entries.map((e) => [e.key, e]));

  // 1) Remote → local for keys where remote is newer.
  let applied = 0;
  for (const e of entries) {
    const localTs = await storage.tsOf(e.key);
    if (e.updatedAt > localTs) {
      await storage.setLocalFromRemote(e.key, e.value, e.updatedAt);
      applied++;
    }
  }

  // 2) Local → remote for keys missing remotely or where local is newer.
  try {
    for (const { key, value, ts } of await storage.localEntries()) {
      const remote = remoteByKey.get(key);
      if (!remote || ts > remote.updatedAt) {
        // Use the local timestamp (or "now" if this key was never stamped, e.g.
        // pre-sync data) so the server keeps a real ordering.
        await remotePut(key, value, ts || Date.now()).catch(() => {});
      }
    }
  } catch {
    /* push-up is best-effort; the pull half already succeeded */
  }

  return applied;
}

export function makeStorage(): Storage {
  const local = isTauri() ? new TauriFileStorage() : new LocalStorageAdapter();
  return new SyncedStorage(local);
}
