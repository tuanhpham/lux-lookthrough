import { describe, it, expect } from 'vitest';
import { createAccount, counterIds, buy, sell, capitalExposure } from '../../src/portfolio/index.js';
import { dayRisks } from '../../src/catalysts/window.js';
import type { AccountState, CatalystEvent } from '../../src/types/index.js';

/** An account with `initial` capital, fully or partly invested in `holdings`. */
function acct(
  name: string,
  initial: number,
  holdings: Array<[ticker: string, price: number, shares: number]>,
  currency = 'EUR',
): AccountState {
  const ids = counterIds(name);
  const st = createAccount({ name, initialCapital: initial, currency, createdAt: '2026-01-02' }, ids);
  for (const [ticker, buyPrice, shares] of holdings) {
    buy(st, { ticker, buyDate: '2026-01-05', buyPrice, shares }, ids);
  }
  return st;
}

describe('capitalExposure — the 278%-of-capital bug', () => {
  it('never exceeds 100% for four fully-invested accounts', () => {
    // THE REGRESSION. The old code divided by each account's OWN equity and then
    // summed across accounts, so four fully-invested accounts totalled ~400% and
    // a day with several reporters showed figures like 278%.
    const book = [
      acct('A', 25000, [['NVDA', 100, 250]]),
      acct('B', 25000, [['MSFT', 100, 250]]),
      acct('C', 25000, [['AAPL', 100, 250]]),
      acct('D', 25000, [['AMD', 100, 250]]),
    ];
    const { weights, totalCapital } = capitalExposure(book);
    expect(totalCapital).toBe(100000);
    const total = [...weights.values()].reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1, 10);
    // Each is a quarter of the BOOK, not 100% of its own account.
    expect(weights.get('NVDA')).toBeCloseTo(0.25, 10);
  });

  it('reproduces the specific shape that produced 278%', () => {
    // Three of four accounts reporting on one day. Under the old maths that is
    // ~300%; the correct answer is 75% of the book.
    const book = [
      acct('A', 25000, [['NVDA', 100, 250]]),
      acct('B', 25000, [['MSFT', 100, 250]]),
      acct('C', 25000, [['AAPL', 100, 250]]),
      acct('D', 25000, [['AMD', 100, 250]]),
    ];
    const { weights } = capitalExposure(book);
    const ev = (symbol: string): CatalystEvent => ({
      id: `earnings:${symbol}:2026-02-10`, kind: 'earnings', date: '2026-02-10',
      timing: 'amc', confidence: 'confirmed', symbol, title: symbol, impact: 80, source: 'nasdaq',
    });
    const [day] = dayRisks([ev('NVDA'), ev('MSFT'), ev('AAPL')], weights);
    expect(day!.exposure).toBeCloseTo(0.75, 10);
    expect(day!.exposure).toBeLessThanOrEqual(1);
  });

  it('sums one ticker held in several accounts', () => {
    const book = [
      acct('A', 50000, [['NVDA', 100, 250]]),  // 25,000
      acct('B', 50000, [['NVDA', 100, 250]]),  // 25,000
    ];
    const { weights, amounts, totalCapital } = capitalExposure(book);
    expect(totalCapital).toBe(100000);
    expect(amounts.get('NVDA')).toBe(50000);
    expect(weights.get('NVDA')).toBeCloseTo(0.5, 10);
  });

  it('counts uninvested cash in the denominator', () => {
    // 10% invested, 90% cash → 10% exposed. Ignoring the cash would report 100%.
    const { weights } = capitalExposure([acct('A', 100000, [['NVDA', 100, 100]])]);
    expect(weights.get('NVDA')).toBeCloseTo(0.1, 10);
  });

  it('uses cost basis, so the weight does not move with the quote', () => {
    // Nothing in the input carries a live price — that is the point. The weight
    // answers "how much capital did I commit", not "what is it worth now".
    const st = acct('A', 100000, [['NVDA', 200, 100]]);
    expect(capitalExposure([st]).weights.get('NVDA')).toBeCloseTo(0.2, 10);
  });

  it('excludes a position that has been sold out', () => {
    // Sold via sell(), so cash reflects the proceeds — a closed trade contributes
    // to capital but is no longer exposed to anything.
    const ids = counterIds('A');
    const st = createAccount({ name: 'A', initialCapital: 100000, currency: 'EUR', createdAt: '2026-01-02' }, ids);
    buy(st, { ticker: 'NVDA', buyDate: '2026-01-05', buyPrice: 100, shares: 100 }, ids);
    sell(st, { ticker: 'NVDA', sellDate: '2026-02-01', sellPrice: 120, shares: 100 }, ids);
    const { amounts, weights, totalCapital } = capitalExposure([st]);
    expect(amounts.has('NVDA')).toBe(false);
    expect(weights.size).toBe(0);
    expect(totalCapital).toBe(102000); // 100,000 + 2,000 realized
  });

  it('reports over-100% honestly when the book is over-invested', () => {
    // Negative cash shrinks the denominator. The old code clamped it with
    // Math.max(0, cash), hiding the one state a risk table exists to reveal.
    const st = acct('A', 10000, [['NVDA', 100, 200]]); // 20,000 basis, cash −10,000
    const { weights, totalCapital } = capitalExposure([st]);
    expect(totalCapital).toBe(10000);
    expect(weights.get('NVDA')).toBeCloseTo(2, 10); // 200% — and it says so
  });

  it('returns no weights rather than nonsense when capital is zero', () => {
    const ids = counterIds('A');
    const st = createAccount({ name: 'A', initialCapital: 0, currency: 'EUR', createdAt: '2026-01-02' }, ids);
    const { weights, totalCapital } = capitalExposure([st]);
    expect(totalCapital).toBe(0);
    expect(weights.size).toBe(0); // not Infinity, not NaN
  });

  it('is empty for an empty book', () => {
    const e = capitalExposure([]);
    expect(e.totalCapital).toBe(0);
    expect(e.weights.size).toBe(0);
    expect(e.mixedCurrency).toBe(false);
  });

  it('flags a mixed-currency book instead of silently adding EUR to USD', () => {
    const book = [
      acct('A', 50000, [['NVDA', 100, 100]], 'EUR'),
      acct('B', 50000, [['MSFT', 100, 100]], 'USD'),
    ];
    expect(capitalExposure(book).mixedCurrency).toBe(true);
    expect(capitalExposure([book[0]!]).mixedCurrency).toBe(false);
  });

  it('upper-cases tickers so dayRisks can match them', () => {
    // dayRisks looks up `symbol.toUpperCase()`; a lower-case key here would make
    // the position silently invisible in the risk table. buy() already upper-cases,
    // so mutate the lot directly — the point is that capitalExposure must not
    // DEPEND on its input already being clean (synced/legacy blobs may not be).
    const st = acct('A', 100000, [['NVDA', 100, 100]]);
    st.lots[0]!.ticker = 'nvda';
    const { weights, amounts } = capitalExposure([st]);
    expect(weights.has('NVDA')).toBe(true);
    expect(amounts.has('NVDA')).toBe(true);
  });

  it('counts cash flows through computeCash', () => {
    const st = acct('A', 50000, [['NVDA', 100, 100]]);
    st.cashFlows = [{ id: 'f1', accountId: st.account.id, date: '2026-02-01', amount: 50000 }];
    // 10,000 basis over 100,000 total capital.
    expect(capitalExposure([st]).weights.get('NVDA')).toBeCloseTo(0.1, 10);
  });
});
