/**
 * The merge PLUMBING, as opposed to the merge RULES (those are in
 * `packages/core/tests/storage/` and are tested as pure functions).
 *
 * Every case here is a way the first sign-in on a phone was reported as "it just
 * says Pulling your data… forever and the dot stays grey": a request that never
 * answers, a local write that failed, and a merge slow enough to be
 * indistinguishable from a hang. None of them put a reason on screen, because none
 * of this layer had a test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Storage } from '@screener/core';

// `syncClient` reads the code from localStorage the first time it is asked, and a
// node run has no localStorage at all. Nothing here needs a real one.
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  key: () => null,
  length: 0,
};

/**
 * Both modules hold session state at module scope — the hydration gate, the retry
 * timer, `pullError`. That is correct for the app (one device, one session) and
 * means a test must get a FRESH pair, not a reset hook wired into shipping code.
 */
async function load() {
  vi.resetModules();
  const storage = await import('../src/adapters/storage.js');
  const { setSyncCode } = await import('../src/adapters/syncClient.js');
  return { ...storage, setSyncCode };
}

/**
 * A full store, reported the way Safari reports it. The `name` is what matters —
 * `isQuotaError` keys off it, and a plain `new Error('QuotaExceededError')` would
 * quietly exercise the generic failure path instead of this one.
 */
function quotaError(): Error {
  const e = new Error('The quota has been exceeded.');
  e.name = 'QuotaExceededError';
  return e;
}

/** In-memory Storage with the two ways a real store runs out: a hard cap on how
 *  much it holds, and specific keys that will not fit. */
class Mem implements Storage {
  map = new Map<string, unknown>();
  writes = 0;
  /** Reject a NEW key once this many are stored. Deleting frees room again. */
  cap = Infinity;
  failAfter = Infinity;
  failIf: (key: string) => boolean = () => false;
  async get<T>(k: string): Promise<T | null> {
    return (this.map.get(k) as T) ?? null;
  }
  async set<T>(k: string, v: T): Promise<void> {
    this.writes++;
    if (this.writes > this.failAfter || this.failIf(k)) throw quotaError();
    if (!this.map.has(k) && this.map.size >= this.cap) throw quotaError();
    this.map.set(k, JSON.parse(JSON.stringify(v)));
  }
  async list(prefix = ''): Promise<string[]> {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }
  async delete(k: string): Promise<void> {
    this.map.delete(k);
  }
}

const remoteEntries = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}`, value: { v: i }, updatedAt: 1000 + i }));

/** A server that answers the bulk pull and accepts every upload. */
function serverWith(entries: unknown): typeof fetch {
  return (async (url: string) =>
    new Response(JSON.stringify(String(url).endsWith('/pull') ? { entries } : { ok: true }), {
      status: 200,
    })) as unknown as typeof fetch;
}

describe('pullAndMerge plumbing', () => {
  // Fake timers throughout, so the retry a stalled merge schedules cannot outlive
  // the test that caused it.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('writes the timestamp map once per batch, not once per applied key', async () => {
    const { SyncedStorage, pullAndMerge, setSyncCode, isHydrated, syncActivity } = await load();
    setSyncCode('testcode');
    const mem = new Mem();
    globalThis.fetch = serverWith(remoteEntries(50));

    const s = new SyncedStorage(mem);
    const applied = await pullAndMerge(s, { freshCode: true });

    expect(applied).toBe(50);
    // 50 values + one timestamp map. The per-key path re-read and re-serialised
    // that whole map twice per entry — quadratic main-thread work on the device
    // least able to afford it, which is what "never finishes" looked like.
    expect(mem.writes).toBeLessThanOrEqual(51);
    expect(await s.tsOf('k7')).toBe(1007);
    expect(isHydrated()).toBe(true);
    expect(syncActivity().pullError).toBe(null);
  });

  it('reports a local write failure instead of hanging on it', async () => {
    // This used to escape as an unhandled rejection: the dialog kept its "Pulling
    // your data…" text, the pill kept pulsing grey, and the reason was on no screen
    // anywhere.
    const { SyncedStorage, pullAndMerge, setSyncCode, isHydrated, syncActivity } = await load();
    setSyncCode('testcode');
    const mem = new Mem();
    mem.failAfter = 4;
    globalThis.fetch = serverWith(remoteEntries(10));

    await expect(pullAndMerge(new SyncedStorage(mem), { freshCode: true })).rejects.toThrow(
      /quota has been exceeded/,
    );

    // Not Safari's wording: by this point the caches have already been cleared and
    // retried, so "out of space" is the actual state and "The quota has been
    // exceeded." would name a symptom the user cannot act on.
    expect(syncActivity().pullError).toMatch(/out of storage space/);
    // The gate stays SHUT: the store is half-merged, so uploading from it now would
    // push a mixture of this device's defaults and the account's real data.
    expect(isHydrated()).toBe(false);
  });

  it('frees its rebuildable caches and retries, rather than giving up', async () => {
    const { SyncedStorage, pullAndMerge, setSyncCode, isHydrated, syncActivity } = await load();
    setSyncCode('testcode');
    const mem = new Mem();
    // Four keys of price-bar cache, and only room for eight things in total.
    for (const sym of ['AAPL', 'MSFT', 'NVDA', 'AMD']) mem.map.set(`pf_bars:${sym}`, [1, 2, 3]);
    mem.cap = 8;
    globalThis.fetch = serverWith(remoteEntries(5));

    const applied = await pullAndMerge(new SyncedStorage(mem), { freshCode: true });

    expect(applied).toBe(5);
    expect(isHydrated()).toBe(true);
    expect(syncActivity().pullError).toBe(null);
    // `pf_bars:` is re-fetchable from the network, so it is what gets sacrificed.
    expect([...mem.map.keys()].filter((k) => k.startsWith('pf_bars:'))).toEqual([]);
  });

  it('never downloads keys this app has since made local-only', async () => {
    // The server still holds every row pushed before a prefix became local-only.
    // Price history for every position, downloaded into a ~5 MB budget, over data
    // the app had already decided no device should receive.
    const { SyncedStorage, pullAndMerge, setSyncCode } = await load();
    setSyncCode('testcode');
    const mem = new Mem();
    globalThis.fetch = serverWith([
      { key: 'watchlists:index', value: ['A'], updatedAt: 2000 },
      { key: 'pf_bars:AAPL', value: new Array(500).fill(0), updatedAt: 2000 },
      { key: 'sectorlabels', value: { AAPL: 'Tech' }, updatedAt: 2000 },
    ]);

    const applied = await pullAndMerge(new SyncedStorage(mem), { freshCode: true });

    expect(applied).toBe(1);
    expect(mem.map.has('watchlists:index')).toBe(true);
    expect(mem.map.has('pf_bars:AAPL')).toBe(false);
    expect(mem.map.has('sectorlabels')).toBe(false);
  });

  it('gives up day-stamped cache before it gives up syncing', async () => {
    // The trade this exists to make: a phone that holds fewer past calendar days
    // but syncs its real data, instead of a phone that syncs nothing because a
    // cache did not fit. The calendar windows stay on the SERVER either way, so a
    // laptop with room keeps the full point-in-time history.
    const { SyncedStorage, pullAndMerge, setSyncCode, isHydrated, syncActivity } = await load();
    setSyncCode('testcode');
    const mem = new Mem();
    mem.failIf = (k) => k.startsWith('calendar:');
    globalThis.fetch = serverWith([
      { key: 'watchlists:index', value: ['A'], updatedAt: 2000 },
      { key: 'accounts', value: { cash: 1 }, updatedAt: 2000 },
      { key: 'calendar:2026-09-24', value: { events: [] }, updatedAt: 2000 },
      { key: 'calendar:2026-09-25', value: { events: [] }, updatedAt: 2000 },
    ]);

    await pullAndMerge(new SyncedStorage(mem), { freshCode: true });

    expect(isHydrated()).toBe(true);
    expect(syncActivity().pullError).toBe(null);
    expect(mem.map.get('accounts')).toEqual({ cash: 1 });
    expect([...mem.map.keys()].filter((k) => k.startsWith('calendar:'))).toEqual([]);
  });

  it('times out a request that never answers', async () => {
    // `fetch` has no deadline of its own, and a phone changing radio state leaves
    // the promise unsettled rather than rejecting — a hang with no error to show
    // and no failure to retry from.
    const { SyncedStorage, pullAndMerge, setSyncCode, syncActivity } = await load();
    setSyncCode('testcode');
    globalThis.fetch = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      })) as unknown as typeof fetch;

    const merge = pullAndMerge(new SyncedStorage(new Mem()), { freshCode: true });
    const settled = expect(merge).rejects.toThrow(/no answer after/);
    await vi.advanceTimersByTimeAsync(26_000);
    await settled;

    expect(syncActivity().pullError).toMatch(/no answer after/);
  });

  it('reports progress, so slow is distinguishable from stuck', async () => {
    const { SyncedStorage, pullAndMerge, setSyncCode } = await load();
    setSyncCode('testcode');
    globalThis.fetch = serverWith(remoteEntries(5));
    const seen: string[] = [];

    await pullAndMerge(new SyncedStorage(new Mem()), {
      freshCode: true,
      onProgress: (p) => seen.push(`${p.phase} ${p.done}/${p.total}`),
    });

    expect(seen).toContain('down 1/5');
    expect(seen).toContain('down 5/5');
  });

  it('opens the gate when sync is off, so a code-less device never queues writes', async () => {
    const { SyncedStorage, pullAndMerge, setSyncCode, isHydrated } = await load();
    setSyncCode(null);

    await pullAndMerge(new SyncedStorage(new Mem()));

    expect(isHydrated()).toBe(true);
  });
});
