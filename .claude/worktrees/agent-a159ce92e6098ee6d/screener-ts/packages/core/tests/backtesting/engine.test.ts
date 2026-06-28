import { describe, it, expect } from 'vitest';
import { runBacktest } from '../../src/backtesting/engine.js';
import { DEFAULT_BACKTEST_CONFIG } from '../../src/backtesting/config.js';
import type { Strategy, StrategyContext } from '../../src/backtesting/types.js';
import type { OHLCV } from '../../src/types/market.js';
import { series, bar, isoDate } from '../qm/helpers.js';

describe('runBacktest — no lookahead', () => {
  it('never shows a strategy any bar beyond the current index', () => {
    const bars = series(120, (i) => 50 + i);
    const full: OHLCV[] = [{ symbol: 'X', bars }];
    let violations = 0;
    let calls = 0;

    const spy: Strategy = {
      name: 'spy',
      shouldEnter(ctx: StrategyContext) {
        calls += 1;
        // The last bar in the window must equal the bar at ctx.index, and the
        // window length must be index+1 — i.e. no future bars are visible.
        const last = ctx.bars[ctx.bars.length - 1]!;
        if (ctx.bars.length !== ctx.index + 1) violations += 1;
        if (last.date !== bars[ctx.index]!.date) violations += 1;
        return null;
      },
      shouldExit() {
        return null;
      },
    };

    runBacktest(full, spy, DEFAULT_BACKTEST_CONFIG);
    expect(calls).toBeGreaterThan(0);
    expect(violations).toBe(0);
  });
});

describe('runBacktest — a clean winning breakout', () => {
  it('enters on the breakout and books a profitable trade', () => {
    // Flat base around 100, then a decisive breakout and run-up. A strategy that
    // arms a buy-stop just above the base should fill and profit.
    const bars = [
      ...Array.from({ length: 30 }, (_, i) => bar(i, 100, { high: 101, low: 99, volume: 1_000_000 })),
      ...Array.from({ length: 20 }, (_, i) => bar(30 + i, 105 + i * 2, { volume: 2_000_000 })),
    ];
    const data: OHLCV[] = [{ symbol: 'BRK', bars }];

    // Minimal strategy: arm a breakout above 101 once, exit on a close below 110.
    let armed = false;
    const strat: Strategy = {
      name: 'test-breakout',
      shouldEnter(ctx) {
        if (armed || ctx.index < 29) return null;
        armed = true;
        return { triggerPrice: 101, stop: 98, target: null, reason: 'breakout' };
      },
      shouldExit() {
        return null; // hold; let it run to the end of the series
      },
    };

    const res = runBacktest(data, strat, { ...DEFAULT_BACKTEST_CONFIG, exitEmaPeriod: 0, timeStopBars: 0 });
    // Position opened (equity deployed) and final equity beats the start.
    expect(res.finalEquity).toBeGreaterThan(DEFAULT_BACKTEST_CONFIG.initialCapital);
    expect(res.startDate).toBe(isoDate(0));
  });

  it('respects the hard stop (a gap-down through the stop closes the trade)', () => {
    const bars = [
      ...Array.from({ length: 30 }, (_, i) => bar(i, 100, { high: 101, low: 99, volume: 1_000_000 })),
      bar(30, 102, { high: 103, low: 101, volume: 2_000_000 }), // breakout fills here
      bar(31, 90, { high: 95, low: 88, volume: 2_000_000 }),    // gaps through the stop
      ...Array.from({ length: 10 }, (_, i) => bar(32 + i, 90, { volume: 1_000_000 })),
    ];
    const data: OHLCV[] = [{ symbol: 'STOP', bars }];
    let armed = false;
    const strat: Strategy = {
      name: 'stop-test',
      shouldEnter(ctx) {
        if (armed || ctx.index < 29) return null;
        armed = true;
        return { triggerPrice: 101, stop: 98, target: null, reason: 'breakout' };
      },
      shouldExit() {
        return null;
      },
    };
    const res = runBacktest(data, strat, { ...DEFAULT_BACKTEST_CONFIG, exitEmaPeriod: 0, timeStopBars: 0 });
    expect(res.trades.length).toBe(1);
    expect(res.trades[0]!.exitReason).toBe('stop');
    expect(res.trades[0]!.netPnL).toBeLessThan(0);
  });
});
