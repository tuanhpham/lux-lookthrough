import { describe, it, expect } from 'vitest';
import {
  createAccount,
  counterIds,
  buy,
  addCashFlow,
  computeAccountMetrics,
  computeTwr,
} from '../../src/portfolio/index.js';
import type { AccountState, EquitySnapshot } from '../../src/types/index.js';

function acct(initial = 50000): AccountState {
  const ids = counterIds('a');
  return createAccount(
    { name: 'Strat A', initialCapital: initial, currency: 'EUR', createdAt: '2024-01-01' },
    ids,
  );
}

/** Snapshots only need `equity` here; cash/positionsValue are not read. */
function snaps(st: AccountState, rows: Array<[date: string, equity: number]>): void {
  st.snapshots.push(
    ...rows.map(([date, equity]): EquitySnapshot => ({ date, equity, cash: 0, positionsValue: 0 })),
  );
}

// THE REGRESSION. `totalPnL` was equity − initialCapital, but `equity` already
// includes net cash flows via computeCash(). So money moving in or out was booked
// straight to PnL: a 10k top-up on a 50k account read as +10 000 (+20%) with no
// trade placed, and a withdrawal read as a loss of the same size.
describe('cash flows do not move PnL', () => {
  it('a deposit is PnL-neutral', () => {
    const ids = counterIds('x');
    const s = acct(50000);
    addCashFlow(s, { date: '2024-02-01', amount: 10000 }, ids);

    const m = computeAccountMetrics(s, {});
    expect(m.equity).toBe(60000);
    expect(m.contributedCapital).toBe(60000);
    expect(m.netCashFlow).toBe(10000);
    expect(m.totalPnL).toBe(0);
    expect(m.totalPnLPct).toBe(0);
  });

  it('a withdrawal is PnL-neutral', () => {
    const ids = counterIds('x');
    const s = acct(50000);
    addCashFlow(s, { date: '2024-02-01', amount: -4000 }, ids);

    const m = computeAccountMetrics(s, {});
    expect(m.equity).toBe(46000);
    expect(m.contributedCapital).toBe(46000);
    expect(m.totalPnL).toBe(0);
    expect(m.totalPnLPct).toBe(0);
  });

  it('still reports trade PnL with a deposit in the mix', () => {
    const ids = counterIds('x');
    const s = acct(50000);
    buy(s, { ticker: 'AAA', buyDate: '2024-01-02', buyPrice: 10, shares: 100 }, ids);
    addCashFlow(s, { date: '2024-02-01', amount: 5000 }, ids);

    // cash 50000 + 5000 − 1000 = 54000, positions 100 × 15 = 1500 → equity 55500
    const m = computeAccountMetrics(s, { AAA: 15 });
    expect(m.equity).toBe(55500);
    expect(m.contributedCapital).toBe(55000);
    expect(m.totalPnL).toBe(500);
    expect(m.totalPnLPct).toBeCloseTo((500 / 55000) * 100, 6);
  });
});

describe('computeTwr', () => {
  it('is blind to the size and timing of a deposit', () => {
    const ids = counterIds('x');
    const s = acct(100000);
    // +10%, then a 100k top-up (no market move that day), then +10% again.
    addCashFlow(s, { date: '2024-01-03', amount: 100000 }, ids);
    snaps(s, [
      ['2024-01-01', 100000],
      ['2024-01-02', 110000],
      ['2024-01-03', 210000],
      ['2024-01-04', 231000],
    ]);

    // 1.10 × 1.00 × 1.10 − 1 = 21%, untouched by the 100k that doubled the account.
    expect(computeTwr(s).totalPct).toBeCloseTo(21, 6);
  });

  it('drops the deposit day to a flat period, not a jump', () => {
    const ids = counterIds('x');
    const s = acct(100000);
    addCashFlow(s, { date: '2024-01-02', amount: 50000 }, ids);
    snaps(s, [
      ['2024-01-01', 100000],
      ['2024-01-02', 150000], // all of it is the deposit
    ]);
    const pts = computeTwr(s).points;
    expect(pts[1]!.periodReturn).toBe(0);
    expect(pts[1]!.index).toBe(1);
  });

  it('equals plain equity growth when there are no cash flows', () => {
    const s = acct(100000);
    snaps(s, [
      ['2024-01-01', 100000],
      ['2024-02-01', 120000],
      ['2024-03-01', 110000],
    ]);
    expect(computeTwr(s).totalPct).toBeCloseTo(10, 6);
  });

  it('counts a flow dated before the window as opening capital, not as a return', () => {
    const ids = counterIds('x');
    const s = acct(100000);
    // Already inside the first snapshot's cash — must not read as +20%.
    addCashFlow(s, { date: '2023-12-20', amount: 20000 }, ids);
    snaps(s, [
      ['2024-01-01', 120000],
      ['2024-01-02', 132000],
    ]);
    expect(computeTwr(s).totalPct).toBeCloseTo(10, 6);
  });

  it('annualizes over calendar days', () => {
    const s = acct(100000);
    snaps(s, [
      ['2024-01-01', 100000],
      ['2024-07-01', 120000], // 182 days, +20%
    ]);
    const r = computeTwr(s);
    expect(r.totalPct).toBeCloseTo(20, 6);
    expect(r.annualizedPct).toBeCloseTo((1.2 ** (365 / 182) - 1) * 100, 4);
  });

  it('returns zeros for an account with no snapshots', () => {
    const r = computeTwr(acct(100000));
    expect(r.points).toEqual([]);
    expect(r.totalPct).toBe(0);
    expect(r.maxDrawdownPct).toBe(0);
  });
});

describe('max drawdown is cash-flow neutral', () => {
  it('a withdrawal is not a drawdown', () => {
    const ids = counterIds('x');
    const s = acct(100000);
    addCashFlow(s, { date: '2024-01-03', amount: -60000 }, ids);
    snaps(s, [
      ['2024-01-01', 100000],
      ['2024-01-02', 120000], // peak
      ['2024-01-03', 60000], // 60k taken out, market flat
      ['2024-01-04', 60000],
    ]);
    // Raw equity would show (120000 − 60000) / 120000 = 50%. Nothing was lost.
    expect(computeAccountMetrics(s, {}).maxDrawdownPct).toBe(0);
  });

  it('still catches a real loss that follows a withdrawal', () => {
    const ids = counterIds('x');
    const s = acct(100000);
    addCashFlow(s, { date: '2024-01-03', amount: -60000 }, ids);
    snaps(s, [
      ['2024-01-01', 100000],
      ['2024-01-02', 120000], // peak index 1.20
      ['2024-01-03', 60000],
      ['2024-01-04', 54000], // −10% on what is left → index 1.08
    ]);
    expect(computeAccountMetrics(s, {}).maxDrawdownPct).toBeCloseTo(10, 6);
  });
});
