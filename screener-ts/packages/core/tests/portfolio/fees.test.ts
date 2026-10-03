import { describe, it, expect } from 'vitest';
import { createAccount, computeCash, totalFees, buy, sell, counterIds } from '../../src/portfolio/index.js';

describe('broker fees', () => {
  it('leave cash on each buy and once per sell order, however many lots it matches', () => {
    const ids = counterIds('f');
    const st = createAccount({ name: 'TR', initialCapital: 1000, createdAt: '2026-01-01' }, ids);
    buy(st, { ticker: 'abc', buyDate: '2026-01-02', buyPrice: 10, shares: 10, fee: 1 }, ids);
    buy(st, { ticker: 'abc', buyDate: '2026-01-03', buyPrice: 12, shares: 10, fee: 1 }, ids);
    expect(computeCash(st)).toBe(1000 - 100 - 120 - 2);

    const recs = sell(st, { ticker: 'abc', sellDate: '2026-01-04', sellPrice: 15, shares: 15, fee: 1 }, ids);
    expect(recs).toHaveLength(2);
    expect(recs.map((r) => r.fee)).toEqual([1, undefined]);
    expect(totalFees(st)).toBe(3);
    expect(computeCash(st)).toBe(1000 - 220 - 2 + 225 - 1);
  });

  it('is zero on accounts that never set one', () => {
    const ids = counterIds('g');
    const st = createAccount({ name: 'X', initialCapital: 500, createdAt: '2026-01-01' }, ids);
    buy(st, { ticker: 'abc', buyDate: '2026-01-02', buyPrice: 10, shares: 5 }, ids);
    expect(totalFees(st)).toBe(0);
    expect(computeCash(st)).toBe(450);
  });
});
