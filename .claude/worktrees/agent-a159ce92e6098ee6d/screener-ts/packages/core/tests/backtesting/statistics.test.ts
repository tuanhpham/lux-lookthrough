import { describe, it, expect } from 'vitest';
import { computeStats } from '../../src/backtesting/statistics.js';
import type { Trade, EquityPoint } from '../../src/backtesting/types.js';

function trade(netPnL: number, rMultiple: number, barsHeld = 10): Trade {
  return {
    symbol: 'X', entryDate: '2020-01-01', exitDate: '2020-02-01',
    entryPrice: 100, exitPrice: 100 + netPnL, shares: 1,
    grossPnL: netPnL, netPnL, rMultiple, barsHeld, exitReason: 'test',
  };
}

describe('computeStats', () => {
  it('computes win rate, profit factor and expectancy from a known set', () => {
    // 3 wins (+300,+200,+100) and 2 losses (−100,−100): PF = 600/200 = 3.
    const trades = [trade(300, 3), trade(200, 2), trade(100, 1), trade(-100, -1), trade(-100, -1)];
    const s = computeStats(trades, []);
    expect(s.trades).toBe(5);
    expect(s.wins).toBe(3);
    expect(s.losses).toBe(2);
    expect(s.winRatePct).toBe(60);
    expect(s.avgWin).toBeCloseTo(200, 2);
    expect(s.avgLoss).toBeCloseTo(-100, 2);
    expect(s.profitFactor).toBeCloseTo(3, 2);
    expect(s.expectancy).toBeCloseTo(80, 2);      // (300+200+100−100−100)/5
    expect(s.expectancyR).toBeCloseTo(0.8, 2);    // (3+2+1−1−1)/5
  });

  it('reports an infinite profit factor when there are no losses', () => {
    const s = computeStats([trade(100, 1), trade(50, 0.5)], []);
    expect(s.profitFactor).toBe(Infinity);
  });

  it('computes total return and max drawdown from the equity curve', () => {
    const curve: EquityPoint[] = [
      { date: '2020-01-01', equity: 100_000 },
      { date: '2020-01-02', equity: 110_000 }, // peak
      { date: '2020-01-03', equity: 88_000 },  // trough → 20% DD from 110k
      { date: '2020-01-04', equity: 120_000 },
    ];
    const s = computeStats([], curve);
    expect(s.totalReturnPct).toBeCloseTo(20, 2);    // 100k → 120k
    expect(s.maxDrawdownPct).toBeCloseTo(20, 2);    // (110k−88k)/110k
  });

  it('buckets the R-distribution', () => {
    const trades = [trade(300, 3), trade(150, 1.5), trade(-100, -1)];
    const s = computeStats(trades, []);
    const total = s.rDistribution.reduce((a, b) => a + b.count, 0);
    expect(total).toBe(3);
    expect(s.rDistribution.find((b) => b.bucket === '≥ 3R')!.count).toBe(1);
  });

  it('handles the empty case without throwing', () => {
    const s = computeStats([], []);
    expect(s.trades).toBe(0);
    expect(s.winRatePct).toBe(0);
    expect(s.profitFactor).toBe(0);
  });
});
