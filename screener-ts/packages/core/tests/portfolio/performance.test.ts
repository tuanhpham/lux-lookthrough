import { describe, it, expect } from 'vitest';
import { combineAccounts, periodPerformance } from '../../src/portfolio/performance.js';
import type { AccountState } from '../../src/types/index.js';

const acct = (id: string, cap: number, snaps: [string, number][], flows: [string, number][] = []): AccountState => ({
  account: { id, name: id, initialCapital: cap, currency: 'EUR', createdAt: snaps[0]?.[0] ?? '2026-01-01' },
  lots: [], sells: [], orders: [],
  snapshots: snaps.map(([date, equity]) => ({ date, equity, cash: 0, positionsValue: 0 })),
  cashFlows: flows.map(([date, amount], i) => ({ id: `f${i}`, accountId: id, date, amount })),
} as unknown as AccountState);

const get = (s: ReturnType<typeof periodPerformance>, k: string) => s.periods.find((p) => p.key === k)!;

describe('periodPerformance', () => {
  it('measures each period from the last snapshot on or before its start', () => {
    const s = periodPerformance(acct('a', 1000, [['2025-12-31', 1000], ['2026-03-31', 1100], ['2026-09-30', 1210], ['2026-10-01', 1222.1]]));
    expect(get(s, '1D').pct).toBeCloseTo(1, 6);                 // 1210 → 1222.1
    expect(get(s, '6M').pct).toBeCloseTo(11.1, 6);              // from 2026-03-31: 1100 → 1222.1
    expect(get(s, 'YTD').pct).toBeCloseTo(22.21, 6);            // from 2025-12-31
    expect(get(s, 'SI').pct).toBeCloseTo(22.21, 6);
    expect(get(s, 'SI').pnl).toBeCloseTo(222.1, 6);
  });
  it('a deposit is not a gain: TWR and the money both leave it out', () => {
    const s = periodPerformance(acct('a', 1000, [['2026-01-02', 1000], ['2026-02-02', 1100], ['2026-03-02', 2200]], [['2026-03-02', 1000]]));
    expect(get(s, 'SI').pct).toBeCloseTo(20, 6);               // +10% then (2200−1000)/1100 = +9.09% → 1.2
    expect(get(s, 'SI').pnl).toBeCloseTo(200, 6);              // 2200 − 1000 − 1000 deposited
  });
  it('says "not available" for a period longer than the account, and annualizes a year or more', () => {
    const young = periodPerformance(acct('a', 1000, [['2026-08-01', 1000], ['2026-10-01', 1050]]));
    expect(get(young, '1Y').pct).toBeNull();
    expect(get(young, '6M').pct).toBeNull();
    expect(get(young, 'YTD').pct).toBeCloseTo(5, 6);           // opened this year: YTD = since inception
    const old = periodPerformance(acct('a', 1000, [['2023-10-01', 1000], ['2025-10-01', 1210], ['2026-10-01', 1331]]));
    expect(get(old, '3Y').annualizedPct).toBeCloseTo(10, 1);
    expect(get(old, '1Y').pct).toBeCloseTo(10, 6);
  });
  it('combines accounts with a later account counted as a deposit, not a gain', () => {
    const all = combineAccounts([
      acct('a', 1000, [['2026-01-02', 1000], ['2026-02-02', 1100]]),
      acct('b', 5000, [['2026-02-02', 5000]]),
    ])!;
    const s = periodPerformance(all);
    expect(get(s, 'SI').pct).toBeCloseTo(10, 6);
    expect(get(s, 'SI').pnl).toBeCloseTo(100, 6);
  });
});
