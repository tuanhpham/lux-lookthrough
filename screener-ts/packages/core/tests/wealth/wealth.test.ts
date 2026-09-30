import { describe, it, expect } from 'vitest';
import {
  accountStatus,
  balanceOn,
  balancesOf,
  editBalance,
  emptyBook,
  makeFxTable,
  normalizeBook,
  parseAmount,
  pointOn,
  removeWealthAccount,
  setBalance,
  wealthSeries,
  type WealthBook,
} from '../../src/wealth/index.js';
import type { Bar } from '../../src/types/index.js';

const bar = (date: string, close: number): Bar => ({ date, open: close, high: close, low: close, close, volume: 0 });
let n = 0;
const id = (): string => `b${++n}`;

function book(): WealthBook {
  const b: WealthBook = {
    accounts: [
      { id: 'vcb', name: 'Vietcombank', kind: 'bank', currency: 'VND', createdAt: '2026-01-01' },
      { id: 'n26', name: 'N26', kind: 'bank', currency: 'EUR', createdAt: '2026-01-01' },
      { id: 'cash', name: 'Dollars at home', kind: 'cash', currency: 'USD', createdAt: '2026-01-01' },
    ],
    balances: [],
  };
  return b;
}

describe('parseAmount', () => {
  it('reads the three conventions a VND/EUR user types', () => {
    expect(parseAmount('250,000,000')).toBe(250_000_000);
    expect(parseAmount('250.000.000')).toBe(250_000_000);
    expect(parseAmount('12.500,50')).toBe(12500.5);
    expect(parseAmount('12,500.50')).toBe(12500.5);
    expect(parseAmount('1234.56')).toBe(1234.56);
    expect(parseAmount('1234,56')).toBe(1234.56);
  });

  it('treats one separator before exactly three digits as grouping, otherwise as a decimal', () => {
    expect(parseAmount('12.500')).toBe(12500);
    expect(parseAmount('1,234')).toBe(1234);
    expect(parseAmount('1.5')).toBe(1.5);
    expect(parseAmount('0.125')).toBe(0.125);
    expect(parseAmount('1234.567')).toBe(1234.567);
  });

  it('ignores signs, spaces and codes, and keeps a debt negative', () => {
    expect(parseAmount('€ 4 200')).toBe(4200);
    expect(parseAmount('250.000.000 ₫')).toBe(250_000_000);
    expect(parseAmount('-1,500.00')).toBe(-1500);
    expect(parseAmount('(2,000)')).toBe(-2000);
    expect(parseAmount("1'000'000")).toBe(1_000_000);
  });

  it('ignores yuan signs and codes', () => {
    expect(parseAmount('¥12,500.50')).toBe(12500.5);
    expect(parseAmount('8000 CNY')).toBe(8000);
    expect(parseAmount('RMB 3.000')).toBe(3000);
    expect(parseAmount('500元')).toBe(500);
  });

  it('refuses what is not a number instead of saving a zero', () => {
    for (const s of ['', 'abc', '1,23,4', '1.2.3,4,5', '-', '.']) expect(parseAmount(s)).toBeNull();
  });
});

describe('the book', () => {
  it('replaces a second reading on the same date rather than keeping two', () => {
    let b = setBalance(book(), { accountId: 'n26', date: '2026-03-31', amount: 100 }, id);
    b = setBalance(b, { accountId: 'n26', date: '2026-03-31', amount: 120 }, id);
    expect(balancesOf(b, 'n26').map((x) => x.amount)).toEqual([120]);
  });

  it('refuses a reading for an account that does not exist, or a bad date', () => {
    expect(() => setBalance(book(), { accountId: 'nope', date: '2026-03-31', amount: 1 }, id)).toThrow();
    expect(() => setBalance(book(), { accountId: 'n26', date: '31/03/2026', amount: 1 }, id)).toThrow();
  });

  it('corrects a reading in place: new date, amount and note, same id', () => {
    const b = setBalance(book(), { accountId: 'n26', date: '2026-03-31', amount: 100, note: 'typo' }, id);
    const rid = b.balances[0]!.id;
    const e = editBalance(b, rid, { date: '2026-03-30', amount: 110 });
    expect(balancesOf(e, 'n26')).toEqual([{ id: rid, accountId: 'n26', date: '2026-03-30', amount: 110 }]);
  });

  it('moving a reading onto a date that has one replaces that one, and only in the same account', () => {
    let b = setBalance(book(), { accountId: 'n26', date: '2026-03-31', amount: 100 }, id);
    b = setBalance(b, { accountId: 'n26', date: '2026-04-30', amount: 200 }, id);
    b = setBalance(b, { accountId: 'vcb', date: '2026-04-30', amount: 9 }, id);
    const march = balancesOf(b, 'n26')[0]!.id;
    const e = editBalance(b, march, { date: '2026-04-30', amount: 150 });
    expect(balancesOf(e, 'n26').map((x) => [x.id, x.amount])).toEqual([[march, 150]]);
    expect(balancesOf(e, 'vcb').map((x) => x.amount)).toEqual([9]);
  });

  it('refuses to edit a reading that is not there, or onto a bad date', () => {
    const b = setBalance(book(), { accountId: 'n26', date: '2026-03-31', amount: 1 }, id);
    expect(() => editBalance(b, 'nope', { date: '2026-03-31', amount: 1 })).toThrow();
    expect(() => editBalance(b, b.balances[0]!.id, { date: '31/03/2026', amount: 1 })).toThrow();
    expect(() => editBalance(b, b.balances[0]!.id, { date: '2026-03-31', amount: NaN })).toThrow();
  });

  it('keeps a CNY account a CNY account when the book is read back', () => {
    const b = normalizeBook({ accounts: [{ id: 'icbc', name: 'ICBC', kind: 'bank', currency: 'CNY', createdAt: '2026-01-01' }], balances: [] });
    expect(b.accounts[0]!.currency).toBe('CNY');
  });

  it('drops an account together with its readings', () => {
    const b = removeWealthAccount(setBalance(book(), { accountId: 'n26', date: '2026-03-31', amount: 1 }, id), 'n26');
    expect(b.accounts.map((a) => a.id)).toEqual(['vcb', 'cash']);
    expect(b.balances).toEqual([]);
  });

  it('survives a stored value it was not promised, row by row', () => {
    expect(normalizeBook(null)).toEqual(emptyBook());
    const b = normalizeBook({
      accounts: [{ id: 'a', name: 'A', kind: 'weird', currency: 'GBP' }, { name: 'no id' }],
      balances: [
        { id: 'x', accountId: 'a', date: '2026-01-31', amount: 5 },
        { id: 'y', accountId: 'a', date: 'bad', amount: 5 },
        { id: 'z', accountId: 'ghost', date: '2026-01-31', amount: 5 },
        { id: 'w', accountId: 'a', date: '2026-02-28', amount: 'NaN' },
      ],
    });
    expect(b.accounts).toEqual([{ id: 'a', name: 'A', kind: 'other', currency: 'EUR', createdAt: '1970-01-01' }]);
    expect(b.balances.map((x) => x.id)).toEqual(['x']);
  });

  it('finds the reading in force on a date, and none before the first', () => {
    let b = setBalance(book(), { accountId: 'n26', date: '2026-01-31', amount: 1 }, id);
    b = setBalance(b, { accountId: 'n26', date: '2026-04-30', amount: 2 }, id);
    const s = balancesOf(b, 'n26');
    expect(balanceOn(s, '2026-01-30')).toBeNull();
    expect(balanceOn(s, '2026-01-31')!.amount).toBe(1);
    expect(balanceOn(s, '2026-04-29')!.amount).toBe(1);
    expect(balanceOn(s, '2026-09-30')!.amount).toBe(2);
  });

  it('reports the latest reading, the change and its age', () => {
    let b = setBalance(book(), { accountId: 'n26', date: '2026-06-30', amount: 1000 }, id);
    b = setBalance(b, { accountId: 'n26', date: '2026-09-01', amount: 1250 }, id);
    const st = accountStatus(b, 'n26', '2026-09-30');
    expect(st.latest!.amount).toBe(1250);
    expect(st.change).toBe(250);
    expect(st.ageDays).toBe(29);
    expect(accountStatus(b, 'vcb', '2026-09-30')).toEqual({ latest: null, previous: null, change: null, ageDays: null });
  });
});

describe('exchange rates', () => {
  const fx = makeFxTable({
    USD: [bar('2026-09-01', 1.1), bar('2026-09-04', 1.2)],
    VND: [bar('2026-09-01', 30_000)],
  });

  it('uses the last close on or before the date, never the latest one', () => {
    expect(fx.perEur('USD', '2026-09-03')).toBe(1.1); // Thursday before Friday's bar
    expect(fx.perEur('USD', '2026-09-06')).toBe(1.2); // a Sunday uses Friday
    expect(fx.perEur('USD', '2026-01-01')).toBe(1.1); // before history: the first close
    expect(fx.perEur('EUR', '2026-01-01')).toBe(1);
  });

  it('has no rate, rather than 1, for a currency with no history', () => {
    expect(makeFxTable({}).perEur('VND', '2026-09-01')).toBeNull();
  });
});

describe('wealthSeries', () => {
  const fx = makeFxTable({
    USD: [bar('2026-01-01', 1.25), bar('2026-03-01', 1.0)],
    VND: [bar('2026-01-01', 25_000)],
  });
  const portfolio = [
    { currency: 'EUR' as const, points: [{ date: '2026-02-02', equity: 10_000 }, { date: '2026-02-03', equity: 10_500 }] },
  ];

  it("starts on the portfolio's first day and carries a reading dated before it", () => {
    let b = setBalance(book(), { accountId: 'vcb', date: '2026-01-15', amount: 250_000_000 }, id);
    b = setBalance(b, { accountId: 'n26', date: '2026-02-03', amount: 2_000 }, id);
    const s = wealthSeries({ book: b, portfolio, fx, today: '2026-02-04' });
    expect(s.start).toBe('2026-02-02');
    expect(s.points.map((p) => p.date)).toEqual(['2026-02-02', '2026-02-03', '2026-02-04']);
    // VND 250M at 25,000 per EUR = €10,000, present from the first day.
    expect(s.points[0]!.byAccount.vcb).toBe(10_000);
    // N26 counts nothing before its first reading, then steps up.
    expect(s.points[0]!.byAccount.n26).toBe(0);
    expect(s.points[1]!.byAccount.n26).toBe(2_000);
    // The portfolio is carried to today, which has no snapshot yet.
    expect(s.points[2]!.portfolio).toBe(10_500);
    expect(s.points[2]!.total).toBe(10_500 + 10_000 + 2_000);
    expect(s.missingFx).toEqual([]);
  });

  it('converts a carried balance again on each date, so FX moves the EUR line', () => {
    const b = setBalance(book(), { accountId: 'cash', date: '2026-01-01', amount: 1_000 }, id);
    const s = wealthSeries({ book: b, portfolio: [], fx, today: '2026-03-02' });
    expect(pointOn(s.points, '2026-02-15')!.others).toBe(800); // 1,000 / 1.25
    expect(pointOn(s.points, '2026-03-02')!.others).toBe(1_000); // 1,000 / 1.0
  });

  it('starts at the first reading when there is no portfolio history', () => {
    const b = setBalance(book(), { accountId: 'n26', date: '2026-05-31', amount: 1 }, id);
    expect(wealthSeries({ book: b, portfolio: [], fx, today: '2026-06-01' }).start).toBe('2026-05-31');
    expect(wealthSeries({ book: book(), portfolio: [], fx, today: '2026-06-01' })).toEqual({ start: null, points: [], missingFx: [] });
  });

  it('leaves an account out and says so when its currency has no rate', () => {
    const b = setBalance(book(), { accountId: 'vcb', date: '2026-02-02', amount: 250_000_000 }, id);
    const s = wealthSeries({ book: b, portfolio, fx: makeFxTable({}), today: '2026-02-03' });
    expect(s.missingFx).toEqual(['VND']);
    expect(s.points[1]!.total).toBe(10_500); // never 250,000,000 "euros"
  });

  it('adds a USD portfolio account in euros', () => {
    const s = wealthSeries({
      book: book(),
      portfolio: [...portfolio, { currency: 'USD', points: [{ date: '2026-02-02', equity: 1_250 }] }],
      fx,
      today: '2026-02-02',
    });
    expect(s.points[0]!.portfolio).toBe(11_000);
  });

  it('lets a debt pull the total down', () => {
    const b0 = book();
    b0.accounts.push({ id: 'loan', name: 'Car loan', kind: 'loan', currency: 'EUR', createdAt: '2026-01-01' });
    const b = setBalance(b0, { accountId: 'loan', date: '2026-02-02', amount: -3_000 }, id);
    const s = wealthSeries({ book: b, portfolio, fx, today: '2026-02-02' });
    expect(s.points[0]!.total).toBe(7_000);
  });
});
