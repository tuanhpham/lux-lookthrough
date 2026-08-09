import { describe, it, expect } from 'vitest';
import { createAccount, counterIds, buy, toPersistable, hasTransientFields } from '../../src/portfolio/index.js';
import type { AccountState, Bar } from '../../src/types/index.js';

function acct(name = 'Strategy A'): AccountState {
  const ids = counterIds(name);
  const st = createAccount({ name, initialCapital: 50000, currency: 'EUR', createdAt: '2026-01-02' }, ids);
  buy(st, { ticker: 'NVDA', buyDate: '2026-01-05', buyPrice: 100, shares: 50 }, ids);
  return st;
}

/** What the Portfolio tab hangs off the state object for its charts. */
function withCandleCache(st: AccountState, tickers = 10, days = 250): AccountState {
  const bars: Bar[] = Array.from({ length: days }, (_, i) => ({
    date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
    open: 123.456789, high: 125.6789, low: 122.3456, close: 124.9876, volume: 12345678,
  }));
  return Object.assign({}, st, {
    _candleCache: {
      positions: Array.from({ length: tickers }, (_, i) => ({ ticker: `SYM${i}`, bars })),
      portfolio: bars,
      portfolioNoCash: bars,
    },
  });
}

describe('toPersistable — the 912 KB incident', () => {
  it('drops the chart cache that made `accounts` 912 KB', () => {
    const fat = withCandleCache(acct());
    const [slim] = toPersistable([fat]);
    expect('_candleCache' in (slim as object)).toBe(false);
    // The size ratio is the whole point of the fix, so assert on it. ONE account
    // of 10 positions × 250 days already serializes to ~310 KB; four of them is
    // the ~900 KB that was actually observed in D1.
    const fatBytes = JSON.stringify([fat]).length;
    const slimBytes = JSON.stringify([slim]).length;
    expect(fatBytes).toBeGreaterThan(300_000);
    expect(slimBytes).toBeLessThan(fatBytes / 100);
  });

  it('keeps every field the user actually entered', () => {
    const [slim] = toPersistable([withCandleCache(acct())]);
    expect(slim!.account.name).toBe('Strategy A');
    expect(slim!.account.initialCapital).toBe(50000);
    expect(slim!.lots).toHaveLength(1);
    expect(slim!.lots[0]!.ticker).toBe('NVDA');
    expect(slim!.lots[0]!.buyPrice).toBe(100);
    expect(slim!.sells).toEqual([]);
    expect(slim!.orders).toEqual([]);
  });

  it('keeps snapshots — a fresh device cannot rebuild them', () => {
    // Unlike the candle cache, snapshots derive from `pf_bars:*`, which is
    // device-local and never synced. Dropping them would blank the equity curve
    // on a newly signed-in phone until its first Update.
    const st = acct();
    st.snapshots.push({ date: '2026-01-05', equity: 50000, cash: 45000, positionsValue: 5000 });
    const [slim] = toPersistable([st]);
    expect(slim!.snapshots).toHaveLength(1);
    expect(slim!.snapshots[0]!.date).toBe('2026-01-05');
  });

  it('rounds snapshot money to cents', () => {
    const st = acct();
    st.snapshots.push({
      date: '2026-01-05', equity: 123456.78901234567, cash: 45000.555, positionsValue: 78456.234,
    });
    const [slim] = toPersistable([st]);
    expect(slim!.snapshots[0]!.equity).toBe(123456.79);
    expect(slim!.snapshots[0]!.cash).toBe(45000.56);
    expect(slim!.snapshots[0]!.positionsValue).toBe(78456.23);
  });

  it('does not mutate the live state — the charts still need the cache', () => {
    // Returning the same objects with the cache deleted would blank every chart
    // on save, since save() runs while the tab is on screen.
    const fat = withCandleCache(acct());
    toPersistable([fat]);
    expect('_candleCache' in (fat as object)).toBe(true);
  });

  it('strips any future underscore-prefixed field, not just _candleCache', () => {
    const st = Object.assign({}, acct(), { _somethingNew: { big: 'payload' } });
    expect('_somethingNew' in (toPersistable([st])[0] as object)).toBe(false);
  });

  it('handles four accounts, which is the reported setup', () => {
    const fat = ['A', 'B', 'C', 'D'].map((n) => withCandleCache(acct(n)));
    const slim = toPersistable(fat);
    expect(slim).toHaveLength(4);
    expect(JSON.stringify(slim).length).toBeLessThan(20_000);
  });

  it('survives an account with no snapshots field at all', () => {
    // Legacy synced blobs predate some fields; a crash here would break load().
    const legacy = { account: acct().account, lots: [], sells: [], orders: [] } as unknown as AccountState;
    expect(toPersistable([legacy])[0]!.snapshots).toEqual([]);
  });
});

describe('hasTransientFields — when a stored blob needs rewriting', () => {
  it('spots a blob written by the old build', () => {
    expect(hasTransientFields([withCandleCache(acct())])).toBe(true);
  });

  it('says nothing to do for an already-slim blob', () => {
    // Must be false, or load() would rewrite `accounts` on every single boot —
    // each one a fresh "now" stamp and another push to D1.
    expect(hasTransientFields(toPersistable([withCandleCache(acct())]))).toBe(false);
    expect(hasTransientFields([acct()])).toBe(false);
    expect(hasTransientFields([])).toBe(false);
  });

  it('is idempotent — slimming twice changes nothing', () => {
    const once = toPersistable([withCandleCache(acct())]);
    expect(JSON.stringify(toPersistable(once))).toBe(JSON.stringify(once));
  });
});
