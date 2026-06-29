import { describe, it, expect } from 'vitest';
import {
  createAccount,
  computeCash,
  buy,
  sell,
  setStop,
  deleteSell,
  deleteLot,
  buildPositions,
  computeAccountMetrics,
  computeEquity,
  createOrder,
  processOrders,
  runUpdate,
  compareAccounts,
  counterIds,
  type PriceMap,
} from '../src/portfolio/index.js';
import type { AccountState, Bar } from '../src/types/index.js';

function freshAccount(initial = 50000): AccountState {
  const ids = counterIds('a');
  return createAccount(
    { name: 'Strat A', initialCapital: initial, currency: 'EUR', createdAt: '2024-01-01' },
    ids,
  );
}

describe('delete transactions', () => {
  it('deleteSell returns shares to the lot and reverses realized PnL/cash', () => {
    const ids = counterIds('x');
    const s = freshAccount(100000);
    const lot = buy(s, { ticker: 'AAPL', buyDate: '2024-01-02', buyPrice: 100, shares: 100 }, ids);
    const [rec] = sell(s, { ticker: 'AAPL', sellDate: '2024-02-01', sellPrice: 120, shares: 40 }, ids);
    expect(lot.remainingShares).toBe(60);
    expect(computeCash(s)).toBe(100000 - 100 * 100 + 120 * 40);

    deleteSell(s, rec!.id);
    expect(lot.remainingShares).toBe(100); // shares restored
    expect(s.sells.length).toBe(0);
    expect(computeCash(s)).toBe(100000 - 100 * 100); // proceeds reversed
    expect(computeAccountMetrics(s, {}).realizedPnL).toBe(0);
  });

  it('deleteLot removes the lot and its sells, resetting figures', () => {
    const ids = counterIds('x');
    const s = freshAccount(100000);
    const lot = buy(s, { ticker: 'MSFT', buyDate: '2024-01-02', buyPrice: 50, shares: 100 }, ids);
    sell(s, { ticker: 'MSFT', sellDate: '2024-02-01', sellPrice: 60, shares: 30 }, ids);
    deleteLot(s, lot.id);
    expect(s.lots.length).toBe(0);
    expect(s.sells.length).toBe(0);
    expect(computeCash(s)).toBe(100000); // back to initial
  });
});

describe('cash accounting', () => {
  it('cash = initial - bought + sold', () => {
    const ids = counterIds('x');
    const s = freshAccount(50000);
    buy(s, { ticker: 'AAPL', buyDate: '2024-01-02', buyPrice: 100, shares: 100 }, ids);
    expect(computeCash(s)).toBe(50000 - 100 * 100); // 40000
    sell(s, { ticker: 'AAPL', sellDate: '2024-01-10', sellPrice: 120, shares: 40 }, ids);
    expect(computeCash(s)).toBe(40000 + 120 * 40); // 44800
  });
});

describe('FIFO partial sells + realized PnL', () => {
  it('matches oldest lots first and realizes per-lot PnL', () => {
    const ids = counterIds('x');
    const s = freshAccount();
    const lot1 = buy(s, { ticker: 'MSFT', buyDate: '2024-01-02', buyPrice: 100, shares: 50 }, ids);
    const lot2 = buy(s, { ticker: 'MSFT', buyDate: '2024-02-02', buyPrice: 110, shares: 50 }, ids);

    // Sell 70 @ 130 → 50 from lot1 (PnL (130-100)*50=1500), 20 from lot2 ((130-110)*20=400)
    const recs = sell(s, { ticker: 'MSFT', sellDate: '2024-03-01', sellPrice: 130, shares: 70 }, ids);
    expect(recs.length).toBe(2);
    expect(recs[0]!.lotId).toBe(lot1.id);
    expect(recs[0]!.shares).toBe(50);
    expect(recs[0]!.realizedPnL).toBe(1500);
    expect(recs[1]!.lotId).toBe(lot2.id);
    expect(recs[1]!.shares).toBe(20);
    expect(recs[1]!.realizedPnL).toBe(400);

    expect(lot1.remainingShares).toBe(0);
    expect(lot2.remainingShares).toBe(30);
  });

  it('throws when selling more than held', () => {
    const ids = counterIds('x');
    const s = freshAccount();
    buy(s, { ticker: 'NVDA', buyDate: '2024-01-02', buyPrice: 50, shares: 10 }, ids);
    expect(() =>
      sell(s, { ticker: 'NVDA', sellDate: '2024-01-03', sellPrice: 60, shares: 20 }, ids),
    ).toThrow(/not enough shares/);
  });
});

describe('position metrics: risk, R-multiple, distance, concentration', () => {
  it('computes unrealized PnL, risk, and R-multiple with a stop', () => {
    const ids = counterIds('x');
    const s = freshAccount(100000);
    // Buy 100 @ 100, stop 90 → per-share risk 10, riskEur = 1000
    buy(s, { ticker: 'AAPL', buyDate: '2024-01-02', buyPrice: 100, shares: 100, stop: 90, target: 130 }, ids);
    const prices: PriceMap = { AAPL: 110 };
    const [pos] = buildPositions(s, prices, '2024-01-12');
    expect(pos!.shares).toBe(100);
    expect(pos!.marketValue).toBe(11000);
    expect(pos!.unrealizedPnL).toBe(1000); // (110-100)*100
    expect(pos!.riskEur).toBe(1000); // (100-90)*100
    expect(pos!.rMultiple).toBe(1); // +1000 unrealized / 1000 risk
    expect(pos!.distanceToStopPct).toBeCloseTo(((110 - 90) / 110) * 100, 6);
    expect(pos!.distanceToTargetPct).toBeCloseTo(((130 - 110) / 110) * 100, 6);
    expect(pos!.daysHeld).toBe(10);
  });

  it('excludes risk when no stop is set and flags the position', () => {
    const ids = counterIds('x');
    const s = freshAccount(100000);
    buy(s, { ticker: 'TSLA', buyDate: '2024-01-02', buyPrice: 200, shares: 10 }, ids); // no stop
    const m = computeAccountMetrics(s, { TSLA: 210 });
    expect(m.totalOpenRiskEur).toBe(0);
    expect(m.openPositionsWithoutStop).toBe(1);
    const [pos] = buildPositions(s, { TSLA: 210 }, '2024-01-03');
    expect(pos!.riskEur).toBeUndefined();
    expect(pos!.rMultiple).toBeUndefined();
  });

  it('recomputes risk after editing the stop (trailing up)', () => {
    const ids = counterIds('x');
    const s = freshAccount(100000);
    const lot = buy(s, { ticker: 'AMD', buyDate: '2024-01-02', buyPrice: 100, shares: 100, stop: 90 }, ids);
    let [pos] = buildPositions(s, { AMD: 120 }, '2024-01-12');
    expect(pos!.riskEur).toBe(1000);
    setStop(s, lot.id, 105); // trail above entry → trade is now risk-free
    [pos] = buildPositions(s, { AMD: 120 }, '2024-01-12');
    // (100-105)*100 = -500 → stop at/above entry → riskEur 0, risk-free,
    // locked-in profit = (105-100)*100 = 500. R-multiple undefined (no risk).
    expect(pos!.riskEur).toBe(0);
    expect(pos!.riskFree).toBe(true);
    expect(pos!.lockedInProfit).toBe(500);
    expect(pos!.rMultiple).toBeUndefined();
  });

  it('risk-free position adds 0 to total open risk and is not "without stop"', () => {
    const ids = counterIds('x');
    const s = freshAccount(100000);
    const lot = buy(s, { ticker: 'AMD', buyDate: '2024-01-02', buyPrice: 100, shares: 100, stop: 90 }, ids);
    setStop(s, lot.id, 110); // lock in profit
    const m = computeAccountMetrics(s, { AMD: 120 });
    expect(m.totalOpenRiskEur).toBe(0);
    expect(m.openPositionsWithoutStop).toBe(0);
  });

  it('concentration = market value / equity', () => {
    const ids = counterIds('x');
    const s = freshAccount(100000);
    buy(s, { ticker: 'AAPL', buyDate: '2024-01-02', buyPrice: 100, shares: 100 }, ids); // cost 10000
    const prices = { AAPL: 100 };
    const eq = computeEquity(s, prices); // 90000 cash + 10000 = 100000
    const [pos] = buildPositions(s, prices, '2024-01-03');
    expect(pos!.concentrationPct).toBeCloseTo((10000 / eq) * 100, 6);
  });
});

describe('account metrics: win rate, expectancy, drawdown', () => {
  it('computes win rate and expectancy over closed lots', () => {
    const ids = counterIds('x');
    const s = freshAccount(100000);
    // Winner: buy 10 @100 stop 90, sell all @120 → +200 realized, R=+2
    const w = buy(s, { ticker: 'AAA', buyDate: '2024-01-02', buyPrice: 100, shares: 10, stop: 90 }, ids);
    sell(s, { ticker: 'AAA', sellDate: '2024-02-01', sellPrice: 120, shares: 10 }, ids);
    // Loser: buy 10 @100 stop 90, sell all @95 → -50 realized, R=-0.5
    const l = buy(s, { ticker: 'BBB', buyDate: '2024-01-02', buyPrice: 100, shares: 10, stop: 90 }, ids);
    sell(s, { ticker: 'BBB', sellDate: '2024-02-01', sellPrice: 95, shares: 10 }, ids);
    void w; void l;

    const m = computeAccountMetrics(s, {});
    expect(m.closedTradeCount).toBe(2);
    expect(m.winRate).toBe(0.5);
    expect(m.realizedPnL).toBe(150); // +200 -50
    expect(m.expectancy).toBe(75); // 150/2
    // avg R = (+2 + -0.5)/2 = 0.75
    expect(m.avgRMultiple).toBeCloseTo(0.75, 6);
  });

  it('max drawdown from equity snapshots', () => {
    const s = freshAccount(100000);
    s.snapshots.push(
      { date: '2024-01-01', equity: 100000, cash: 100000, positionsValue: 0 },
      { date: '2024-02-01', equity: 120000, cash: 0, positionsValue: 120000 }, // peak
      { date: '2024-03-01', equity: 90000, cash: 0, positionsValue: 90000 }, // -25% from peak
      { date: '2024-04-01', equity: 110000, cash: 0, positionsValue: 110000 },
    );
    const m = computeAccountMetrics(s, {});
    expect(m.maxDrawdownPct).toBeCloseTo(25, 6);
  });
});

describe('pending orders: intraday fills across missed days', () => {
  it('BUY_STOP fills when a missed day high crosses threshold, at threshold', () => {
    const ids = counterIds('x');
    const s = freshAccount(100000);
    createOrder(s, { ticker: 'AAPL', type: 'BUY_STOP', threshold: 105, shares: 100, createdDate: '2024-01-01' }, ids);
    const bars: Bar[] = [
      { date: '2024-01-02', open: 100, high: 102, low: 99, close: 101, volume: 1 }, // no fill
      { date: '2024-01-03', open: 103, high: 107, low: 102, close: 106, volume: 1 }, // fill @105
      { date: '2024-01-04', open: 106, high: 110, low: 105, close: 109, volume: 1 },
    ];
    const fills = processOrders(s, new Map([['AAPL', bars]]), ids);
    expect(fills.length).toBe(1);
    expect(fills[0]!.filled).toBe(true);
    expect(fills[0]!.date).toBe('2024-01-03');
    expect(fills[0]!.price).toBe(105);
    expect(s.lots.length).toBe(1);
    expect(s.lots[0]!.buyPrice).toBe(105);
    expect(computeCash(s)).toBe(100000 - 105 * 100);
  });

  it('BUY_STOP with insufficient cash does NOT fill and reports needed vs available', () => {
    const ids = counterIds('x');
    const s = freshAccount(1000); // only 1000 cash
    createOrder(s, { ticker: 'NVDA', type: 'BUY_STOP', threshold: 100, shares: 100, createdDate: '2024-01-01' }, ids); // need 10000
    const bars: Bar[] = [
      { date: '2024-01-02', open: 99, high: 101, low: 98, close: 100, volume: 1 },
    ];
    const fills = processOrders(s, new Map([['NVDA', bars]]), ids);
    expect(fills.length).toBe(1);
    expect(fills[0]!.filled).toBe(false);
    expect(fills[0]!.reason).toMatch(/Insufficient cash/);
    expect(fills[0]!.reason).toMatch(/10000/); // needed
    expect(fills[0]!.reason).toMatch(/1000/); // available
    expect(s.lots.length).toBe(0); // no partial fill
    expect(s.orders[0]!.status).toBe('cancelled');
  });

  it('STOP_LOSS fills when a day low breaches threshold, selling held shares at threshold', () => {
    const ids = counterIds('x');
    const s = freshAccount(100000);
    buy(s, { ticker: 'AAPL', buyDate: '2024-01-02', buyPrice: 100, shares: 100, stop: 90 }, ids);
    const lot = s.lots[0]!;
    createOrder(s, { ticker: 'AAPL', type: 'STOP_LOSS', threshold: 90, shares: 100, createdDate: '2024-01-02', lotId: lot.id }, ids);
    const bars: Bar[] = [
      { date: '2024-01-03', open: 99, high: 100, low: 95, close: 96, volume: 1 }, // no breach
      { date: '2024-01-04', open: 94, high: 95, low: 88, close: 89, volume: 1 }, // breach @90
    ];
    const fills = processOrders(s, new Map([['AAPL', bars]]), ids);
    expect(fills.length).toBe(1);
    expect(fills[0]!.filled).toBe(true);
    expect(fills[0]!.date).toBe('2024-01-04');
    expect(fills[0]!.price).toBe(90);
    expect(lot.remainingShares).toBe(0);
    // realized = (90-100)*100 = -1000
    expect(s.sells[0]!.realizedPnL).toBe(-1000);
  });
});

describe('runUpdate: snapshot + fills', () => {
  it('processes fills then appends an equity snapshot', () => {
    const ids = counterIds('x');
    const s = freshAccount(100000);
    buy(s, { ticker: 'AAPL', buyDate: '2024-01-02', buyPrice: 100, shares: 100 }, ids);
    const bars: Bar[] = [
      { date: '2024-01-03', open: 101, high: 112, low: 100, close: 110, volume: 1 },
    ];
    const res = runUpdate(s, { barsByTicker: new Map([['AAPL', bars]]), asOfDate: '2024-01-03' }, ids);
    expect(s.snapshots.length).toBe(1);
    expect(res.snapshot.cash).toBe(90000);
    expect(res.snapshot.positionsValue).toBe(11000); // 100 * 110
    expect(res.snapshot.equity).toBe(101000);
  });
});

describe('cross-account comparison', () => {
  it('produces one row per account with return %', () => {
    const idsA = counterIds('A');
    const a = createAccount({ name: 'A', initialCapital: 100000, createdAt: '2024-01-01' }, idsA);
    buy(a, { ticker: 'AAPL', buyDate: '2024-01-02', buyPrice: 100, shares: 100 }, idsA);
    const idsB = counterIds('B');
    const b = createAccount({ name: 'B', initialCapital: 100000, createdAt: '2024-01-01' }, idsB);
    buy(b, { ticker: 'MSFT', buyDate: '2024-01-02', buyPrice: 100, shares: 100 }, idsB);

    const prices = new Map<string, PriceMap>([
      [a.account.id, { AAPL: 120 }], // +2000 → +2%
      [b.account.id, { MSFT: 90 }], // -1000 → -1%
    ]);
    const rows = compareAccounts([a, b], prices);
    expect(rows.length).toBe(2);
    expect(rows[0]!.totalReturnPct).toBeCloseTo(2, 6);
    expect(rows[1]!.totalReturnPct).toBeCloseTo(-1, 6);
  });
});
