import { describe, it, expect } from 'vitest';
import {
  createAccount,
  counterIds,
  addCashFlow,
  editCashFlow,
  computeAccountMetrics,
  computeCash,
  computeTwr,
  isCapitalFlow,
  netCashFlow,
  netIncomeFlow,
  periodPerformance,
} from '../../src/portfolio/index.js';
import type { AccountState, EquitySnapshot } from '../../src/types/index.js';

function acct(initial = 10000): AccountState {
  return createAccount({ name: 'TR', initialCapital: initial, currency: 'EUR', createdAt: '2026-01-01' }, counterIds('a'));
}
function snaps(st: AccountState, rows: Array<[string, number]>): void {
  st.snapshots.push(...rows.map(([date, equity]): EquitySnapshot => ({ date, equity, cash: 0, positionsValue: 0 })));
}

// CHAT-106: a dividend or a tax payment moves cash but is not capital — it is what the money did.
describe('cash flow reasons', () => {
  it('only a deposit / withdrawal (or a legacy flow with no reason) is capital', () => {
    expect(isCapitalFlow({})).toBe(true);
    expect(isCapitalFlow({ kind: 'deposit' })).toBe(true);
    expect(isCapitalFlow({ kind: 'withdraw' })).toBe(true);
    for (const kind of ['dividend', 'interest', 'tax', 'tax_fix'] as const) expect(isCapitalFlow({ kind })).toBe(false);
  });

  it('a dividend reaches cash and PnL, not the capital put in', () => {
    const ids = counterIds('x');
    const s = acct();
    addCashFlow(s, { date: '2026-02-01', amount: 1000, kind: 'deposit' }, ids);
    addCashFlow(s, { date: '2026-03-01', amount: 50, kind: 'dividend' }, ids);
    addCashFlow(s, { date: '2026-03-01', amount: -12.5, kind: 'tax' }, ids);
    expect(computeCash(s)).toBe(11037.5);
    expect(netCashFlow(s)).toBe(1000);
    expect(netIncomeFlow(s)).toBe(37.5);
    const m = computeAccountMetrics(s, {});
    expect(m.contributedCapital).toBe(11000);
    expect(m.totalPnL).toBe(37.5);
  });

  it('TWR counts a dividend as return, a deposit as a flow', () => {
    const ids = counterIds('x');
    const s = acct(10000);
    snaps(s, [['2026-01-02', 10000], ['2026-01-03', 10100], ['2026-01-04', 11100]]);
    addCashFlow(s, { date: '2026-01-03', amount: 100, kind: 'dividend' }, ids);
    addCashFlow(s, { date: '2026-01-04', amount: 1000 }, ids);
    const twr = computeTwr(s);
    expect(twr.totalPct).toBeCloseTo(1, 6);
    const si = periodPerformance(s).periods.find((p) => p.key === 'SI')!;
    expect(si.pnl).toBe(100);
  });

  it('editing keeps or clears the reason', () => {
    const ids = counterIds('x');
    const s = acct();
    const f = addCashFlow(s, { date: '2026-02-01', amount: 20, kind: 'interest' }, ids);
    editCashFlow(s, f.id, { date: '2026-02-02', amount: 25, kind: 'dividend' });
    expect(s.cashFlows![0]!.kind).toBe('dividend');
    editCashFlow(s, f.id, { date: '2026-02-02', amount: 25 });
    expect(s.cashFlows![0]!.kind).toBeUndefined();
  });
});
