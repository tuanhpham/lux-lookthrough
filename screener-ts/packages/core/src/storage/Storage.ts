/**
 * Async key/value persistence. Concrete impl lives in the app (Tauri file/DB,
 * localStorage on web, AsyncStorage on RN). Core never imports fs/SQLite.
 */
export interface Storage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

/** In-memory Storage — useful for tests and as a reference implementation. */
export class MemoryStorage implements Storage {
  private map = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.map.get(key) as T) ?? null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.map.set(key, value);
  }
  async list(prefix = ''): Promise<string[]> {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}
