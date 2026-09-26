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

/** In-memory Storage that can be told to start failing — i.e. the iOS quota. */
class Mem implements Storage {
  map = new Map<string, unknown>();
  writes = 0;
  failAfter = Infinity;
  async get<T>(k: string): Promise<T | null> {
    return (this.map.get(k) as T) ?? null;
  }
  async set<T>(k: string, v: T): Promise<void> {
    if (++this.writes > this.failAfter) throw new Error('QuotaExceededError');
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
    // iOS gives a page a few MB of localStorage, and the pre-merge snapshot doubles
    // what a payload needs. This used to escape as an unhandled rejection: the
    // dialog kept its "Pulling your data…" text, the pill kept pulsing grey, and
    // the reason was on no screen anywhere.
    const { SyncedStorage, pullAndMerge, setSyncCode, isHydrated, syncActivity } = await load();
    setSyncCode('testcode');
    const mem = new Mem();
    mem.failAfter = 4;
    globalThis.fetch = serverWith(remoteEntries(10));

    await expect(pullAndMerge(new SyncedStorage(mem), { freshCode: true })).rejects.toThrow(/Quota/);

    expect(syncActivity().pullError).toMatch(/Quota/);
    // The gate stays SHUT: the store is half-merged, so uploading from it now would
    // push a mixture of this device's defaults and the account's real data.
    expect(isHydrated()).toBe(false);
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
