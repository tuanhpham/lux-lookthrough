/**
 * Minimal async rate limiter: ensures at least `minIntervalMs` between calls
 * and caps concurrent in-flight calls. Used to wrap a free-tier API adapter
 * (e.g. Finnhub 60 req/min). Sleep is injected so core has no timer/platform
 * dependency.
 */
export type Sleep = (ms: number) => Promise<void>;
export type Clock = () => number;

export class RateLimiter {
  private last = 0;
  private active = 0;
  private waiters: Array<() => void> = [];

  constructor(
    private minIntervalMs: number,
    private maxConcurrent: number,
    private now: Clock,
    private sleep: Sleep,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      const wait = this.minIntervalMs - (this.now() - this.last);
      if (wait > 0) await this.sleep(wait);
      this.last = this.now();
      return await fn();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }
}
