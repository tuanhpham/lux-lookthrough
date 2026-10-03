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

describe('broker fees on pending orders', () => {
  it('a BUY_STOP and a STOP_LOSS that fill by themselves pay the account fee', async () => {
    const { processOrders, createOrder } = await import('../../src/portfolio/index.js');
    const ids = counterIds('h');
    const st = createAccount({ name: 'Degiro', initialCapital: 1000, createdAt: '2026-01-01' }, ids);
    st.account.fee = 2;
    createOrder(st, { ticker: 'ABC', type: 'BUY_STOP', threshold: 10, shares: 10, createdDate: '2026-01-01' }, ids);
    createOrder(st, { ticker: 'ABC', type: 'STOP_LOSS', threshold: 9, shares: 10, createdDate: '2026-01-01' }, ids);
    const bars = new Map([['ABC', [
      { date: '2026-01-02', open: 9.5, high: 10.5, low: 9.6, close: 10.2, volume: 1 },
      { date: '2026-01-03', open: 9.5, high: 9.8, low: 8.5, close: 8.8, volume: 1 },
    ]]]);
    processOrders(st, bars, ids);
    expect(st.lots[0]!.fee).toBe(2);
    expect(st.sells[0]!.fee).toBe(2);
    expect(computeCash(st)).toBe(1000 - 100 - 2 + 90 - 2);
  });
});

describe('pending orders across currencies', () => {
  it('trigger on the quote-space threshold and book the fill in account money', async () => {
    const { processOrders, createOrder } = await import('../../src/portfolio/index.js');
    const ids = counterIds('k');
    const st = createAccount({ name: 'EUR', initialCapital: 1000, currency: 'EUR', createdAt: '2026-01-01' }, ids);
    createOrder(st, { ticker: 'ABC', type: 'BUY_STOP', threshold: 11, shares: 10, createdDate: '2026-01-01' }, ids);
    const bars = new Map([['ABC', [{ date: '2026-01-02', open: 10.5, high: 11.2, low: 10.4, close: 11.1, volume: 1 }]]]);
    processOrders(st, bars, ids, (_t, _d, p) => p / 1.1);
    expect(st.lots[0]!.buyPrice).toBeCloseTo(10);
    expect(computeCash(st)).toBeCloseTo(900);
  });
});
