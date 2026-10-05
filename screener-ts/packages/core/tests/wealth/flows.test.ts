import { describe, it, expect } from 'vitest';
import {
  accountStatus, addFlow, balancesOf, flowsOf, makeFxTable, normalizeBook, removeFlow, removeWealthAccount,
  setBalance, valueOn, wealthSeries, type WealthBook,
} from '../../src/wealth/index.js';

let n = 0;
const id = (): string => `x${++n}`;
const book = (): WealthBook => ({
  accounts: [{ id: 'n26', name: 'N26', kind: 'bank', currency: 'EUR', createdAt: '2026-01-01' }],
  balances: [],
  flows: [],
});
const val = (b: WealthBook, date: string): number | null => valueOn(balancesOf(b, 'n26'), flowsOf(b, 'n26'), date);

describe('wealth flows (deposits / withdrawals)', () => {
  it('adds flows on top of the last reading, and only from the day after it', () => {
    let b = setBalance(book(), { accountId: 'n26', date: '2026-03-31', amount: 1000 }, id);
    b = addFlow(b, { accountId: 'n26', date: '2026-03-31', amount: 50 }, id);   // same day: already in the statement
    b = addFlow(b, { accountId: 'n26', date: '2026-04-05', amount: 500 }, id);
    b = addFlow(b, { accountId: 'n26', date: '2026-04-10', amount: -200 }, id);
    expect(val(b, '2026-04-01')).toBe(1000);
    expect(val(b, '2026-04-05')).toBe(1500);
    expect(val(b, '2026-04-30')).toBe(1300);
  });
  it('lets a newer reading supersede the flows before it — nothing is counted twice', () => {
    let b = setBalance(book(), { accountId: 'n26', date: '2026-03-31', amount: 1000 }, id);
    b = setBalance(b, { accountId: 'n26', date: '2026-04-30', amount: 1600 }, id);
    b = addFlow(b, { accountId: 'n26', date: '2026-04-05', amount: 500 }, id);  // entered late, inside the statement
    expect(val(b, '2026-04-10')).toBe(1500);
    expect(val(b, '2026-05-02')).toBe(1600);
  });
  it('works with flows alone, before any reading, and is null before anything is known', () => {
    let b = addFlow(book(), { accountId: 'n26', date: '2026-02-01', amount: 300 }, id);
    b = addFlow(b, { accountId: 'n26', date: '2026-02-03', amount: -100 }, id);
    expect(val(b, '2026-01-31')).toBeNull();
    expect(val(b, '2026-02-10')).toBe(200);
  });
  it('reports status after the last event, and ages from the last reading only', () => {
    let b = setBalance(book(), { accountId: 'n26', date: '2026-03-01', amount: 1000 }, id);
    b = addFlow(b, { accountId: 'n26', date: '2026-03-20', amount: 250 }, id);
    const st = accountStatus(b, 'n26', '2026-03-31');
    expect(st.latest).toEqual({ date: '2026-03-20', amount: 1250 });
    expect(st.previous).toEqual({ date: '2026-03-01', amount: 1000 });
    expect(st.change).toBe(250);
    expect(st.ageDays).toBe(30);
  });
  it('draws a step on the flow date in the series', () => {
    let b = setBalance(book(), { accountId: 'n26', date: '2026-03-01', amount: 1000 }, id);
    b = addFlow(b, { accountId: 'n26', date: '2026-03-10', amount: 500 }, id);
    const s = wealthSeries({ book: b, portfolio: [], fx: makeFxTable({}), today: '2026-03-15' });
    expect(s.points.map((p) => [p.date, p.total])).toEqual([['2026-03-01', 1000], ['2026-03-10', 1500], ['2026-03-15', 1500]]);
  });
  it('validates, removes, survives a reload and goes with its account', () => {
    expect(() => addFlow(book(), { accountId: 'n26', date: '2026-03-01', amount: 0 }, id)).toThrow();
    expect(() => addFlow(book(), { accountId: 'zz', date: '2026-03-01', amount: 5 }, id)).toThrow();
    let b = addFlow(book(), { accountId: 'n26', date: '2026-03-01', amount: 5, note: 'salary' }, id);
    const again = normalizeBook(JSON.parse(JSON.stringify(b)));
    expect(again.flows).toEqual(b.flows);
    expect(normalizeBook({ accounts: b.accounts, balances: [] }).flows).toEqual([]);   // an old book
    expect(removeFlow(b, b.flows[0]!.id).flows).toEqual([]);
    b = removeWealthAccount(b, 'n26');
    expect(b.flows).toEqual([]);
  });
});
