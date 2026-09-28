/**
 * Buying straight from the Trade Planner: the two pieces that would be wrong in silence.
 *
 * The planner's Buy button is a second way into the same write path the chat assistant and
 * the Buy form use, so what is pinned here is the part the planner cannot verify by eye:
 *
 *   • `plannedPrice` — the arithmetic that turns the USD close sitting in the Entry box into
 *     account money. It has to REFUSE when it has no rate rather than convert at 1, because
 *     a €232.50 cost basis for a $232.50 fill looks entirely plausible on every screen
 *     afterwards. It was lifted out of `toolExec.planPrice` precisely so the planner and the
 *     assistant cannot drift apart on this; these tests are on the shared function.
 *
 *   • `applyWrite` returning the new lot's id. The planner freezes the plan against the lot
 *     it just bought, and the id is the only handle on it — two buys of the same ticker on
 *     the same day at the same price are two legitimate lots. A dropped id means a lot whose
 *     "⎙ Kế hoạch" button has nothing behind it.
 */
import { describe, it, expect, vi } from 'vitest';
import { createAccount, type AccountState, type Bar, type Storage } from '@screener/core';

// `storage.ts` and `syncClient.ts` both reach for localStorage at import time.
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  key: () => null,
  length: 0,
};

class Mem implements Storage {
  map = new Map<string, unknown>();
  async get<T>(k: string): Promise<T | null> {
    return (this.map.get(k) as T) ?? null;
  }
  async set<T>(k: string, v: T): Promise<void> {
    this.map.set(k, JSON.parse(JSON.stringify(v)));
  }
  async list(prefix = ''): Promise<string[]> {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }
  async delete(k: string): Promise<void> {
    this.map.delete(k);
  }
}

const id = (() => {
  let n = 0;
  return () => `id${++n}`;
})();

/** EURUSD daily closes, as the Portfolio tab caches them. */
const FX_BARS: Bar[] = [
  { date: '2026-09-17', open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 0 },
  { date: '2026-09-18', open: 1.25, high: 1.25, low: 1.25, close: 1.25, volume: 0 },
];

function seedAccounts(): AccountState[] {
  return [
    createAccount(
      { name: 'TA Trade Republic', initialCapital: 50000, currency: 'EUR', createdAt: '2026-01-02' },
      id,
    ),
  ];
}

/**
 * Fresh copies of the modules, because `fx.ts` and `store.ts` keep the rate table and the
 * account list at module scope. `withFx: false` is the state of a session in which the
 * Portfolio tab was never opened.
 */
async function load({ withFx = true } = {}) {
  vi.resetModules();
  const mem = new Mem();
  mem.map.set('accounts', JSON.parse(JSON.stringify(seedAccounts())));
  if (withFx) mem.map.set('pf_eurusd_bars', FX_BARS);
  const ctx = { storage: mem } as unknown as import('../src/context.js').AppContext;

  const storage = await import('../src/adapters/storage.js');
  storage.openSyncGate();
  const writes = await import('../src/portfolio/writes.js');
  const store = await import('../src/portfolio/store.js');
  const fx = await import('../src/portfolio/fx.js');
  if (withFx) await fx.ensureEurUsd(ctx);
  return { ctx, writes, store };
}

describe('plannedPrice — a USD level becoming account money', () => {
  it('divides by the rate of the TRADE DATE for a dollar level in a euro account', async () => {
    const { writes } = await load();
    // 1.25 is the 18th's close; 1.1 is the latest known. A backdated buy must use the
    // 18th, which is the whole reason the date picker reaches this far.
    expect(writes.plannedPrice('EUR', 232.5, 'USD', '2026-09-18')).toEqual({
      given: 232.5,
      currency: 'USD',
      stored: 232.5 / 1.25,
      fx: 1.25,
    });
  });

  it('multiplies the other way round for a euro level in a dollar account', async () => {
    const { writes } = await load();
    expect(writes.plannedPrice('USD', 100, 'EUR', '2026-09-18')).toEqual({
      given: 100,
      currency: 'EUR',
      stored: 125,
      fx: 1.25,
    });
  });

  it('passes a level already in the account currency straight through', async () => {
    const { writes } = await load();
    const p = writes.plannedPrice('EUR', 200, 'EUR', '2026-09-18');
    expect(p).toMatchObject({ given: 200, stored: 200 });
  });

  it('passes it through with no rate loaded at all, and prints no rate', async () => {
    const { writes } = await load({ withFx: false });
    // Nothing was converted, so the confirm dialog must not claim a rate was used.
    expect(writes.plannedPrice('EUR', 200, 'EUR', '2026-09-18')).toEqual({
      given: 200,
      currency: 'EUR',
      stored: 200,
    });
  });

  it('REFUSES a dollar level with no rate loaded, rather than converting at 1', async () => {
    const { writes } = await load({ withFx: false });
    // A rate of 1 would show "€232.50" under the Buy button, look right, and be 10%
    // wrong for the life of the lot with no screen downstream able to tell.
    expect(writes.plannedPrice('EUR', 232.5, 'USD', '2026-09-18')).toEqual({ error: 'no-rate' });
  });

  it('REFUSES a currency pair it has no rate table for', async () => {
    const { writes } = await load();
    expect(writes.plannedPrice('GBP', 232.5, 'USD', '2026-09-18')).toEqual({ error: 'not-eur-usd' });
  });
});

describe('applyWrite — the handle on what it created', () => {
  it('returns the id of the lot a buy created, and it is a lot that exists', async () => {
    const { ctx, writes, store } = await load();
    await store.ensureAccountsLoaded(ctx);
    const live = store.accounts.find((a) => a.account.name === 'TA Trade Republic')!;
    const price = writes.plannedPrice('EUR', 232.5, 'USD', '2026-09-18');
    if ('error' in price) throw new Error('fixture has no rate');

    const res = await writes.applyWrite(ctx, {
      kind: 'record_buy',
      account: { id: live.account.id, name: live.account.name, currency: 'EUR' },
      ticker: 'NVDA',
      shares: 10,
      price,
      date: '2026-09-18',
      cost: 10 * price.stored,
    });

    expect(res.lotId).toBeTruthy();
    const acct = store.accounts.find((a) => a.account.id === live.account.id)!;
    const lot = acct.lots.find((l) => l.id === res.lotId);
    expect(lot?.ticker).toBe('NVDA');
    // Parity with the Buy form, checked here because the planner's Buy is a third door
    // onto the same record: converted price, the currency quoted, the rate used.
    expect(lot?.buyPrice).toBeCloseTo(232.5 / 1.25, 10);
    expect(lot?.priceCurrency).toBe('USD');
    expect(lot?.fxRateAtBuy).toBe(1.25);
  });

  it('reports no lot id for a write that creates none', async () => {
    const { ctx, writes, store } = await load();
    await store.ensureAccountsLoaded(ctx);
    const live = store.accounts.find((a) => a.account.name === 'TA Trade Republic')!;
    const res = await writes.applyWrite(ctx, {
      kind: 'record_cash_flow',
      account: { id: live.account.id, name: live.account.name, currency: 'EUR' },
      amount: 1000,
      date: '2026-09-18',
    });
    expect(res.lotId).toBeUndefined();
  });
});
