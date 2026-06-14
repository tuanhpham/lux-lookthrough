/**
 * Generic TTL cache (pure logic; no platform deps). The clock is injected so
 * core never calls Date.now() directly — the app passes `() => Date.now()`.
 */
export type Clock = () => number;

export class TTLCache<T> {
  private store = new Map<string, { ts: number; value: T }>();

  constructor(
    private ttlMs: number,
    private now: Clock,
  ) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.ts > this.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { ts: this.now(), value });
  }

  clear(): number {
    const n = this.store.size;
    this.store.clear();
    return n;
  }

  get size(): number {
    return this.store.size;
  }
}
