import type { Storage } from '@screener/core';
import { isTauri } from './http.js';

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

export function makeStorage(): Storage {
  return isTauri() ? new TauriFileStorage() : new LocalStorageAdapter();
}
