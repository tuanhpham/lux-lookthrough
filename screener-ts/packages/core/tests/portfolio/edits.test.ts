import { describe, it, expect } from 'vitest';
import { addCashFlow, buy, editCashFlow, editLot, editSell, sell } from '../../src/portfolio/lots.js';
import type { AccountState } from '../../src/types/index.js';

let n = 0;
const id = (): string => `i${++n}`;
const state = (): AccountState => ({
  account: { id: 'a', name: 'A', initialCapital: 10000, currency: 'EUR', createdAt: '2026-01-01' },
  lots: [], sells: [], orders: [], snapshots: [],
} as unknown as AccountState);

describe('correcting trades in place', () => {
  it('re-prices the sales when a buy price is corrected, and keeps sold shares sold', () => {
    const s = state();
    const lot = buy(s, { ticker: 'NVDA', buyDate: '2026-08-01', buyPrice: 100, shares: 10 }, id);
    sell(s, { ticker: 'NVDA', sellDate: '2026-09-01', sellPrice: 120, shares: 4 }, id);
    editLot(s, lot.id, { buyPrice: 110, shares: 12 });
    expect(s.sells[0]!.realizedPnL).toBe(40);
    expect(lot.remainingShares).toBe(8);
    expect(() => editLot(s, lot.id, { shares: 3 })).toThrow(/already sold/);
    expect(() => editLot(s, lot.id, { buyDate: '2026-09-02' })).toThrow(/already sold on/);
  });
  it('moves shares between the sale and the lot when a sale is corrected', () => {
    const s = state();
    const lot = buy(s, { ticker: 'NVDA', buyDate: '2026-08-01', buyPrice: 100, shares: 10 }, id);
    const [rec] = sell(s, { ticker: 'NVDA', sellDate: '2026-09-01', sellPrice: 120, shares: 4 }, id);
    editSell(s, rec!.id, { shares: 6, sellPrice: 125 });
    expect(lot.remainingShares).toBe(4);
    expect(rec!.realizedPnL).toBe(150);
    expect(() => editSell(s, rec!.id, { shares: 11 })).toThrow(/only has 10/);
    expect(() => editSell(s, rec!.id, { sellDate: '2026-07-01' })).toThrow(/bought on/);
  });
  it('corrects a cash flow', () => {
    const s = state();
    const f = addCashFlow(s, { date: '2026-03-01', amount: 500 }, id);
    editCashFlow(s, f.id, { date: '2026-03-02', amount: -200, note: 'fix' });
    expect(s.cashFlows![0]).toMatchObject({ date: '2026-03-02', amount: -200, note: 'fix' });
    expect(() => editCashFlow(s, f.id, { date: '2026-03-02', amount: 0 })).toThrow();
  });
});
