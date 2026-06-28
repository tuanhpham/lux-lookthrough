import type { Bar } from '../types/market.js';
import type { TrendFilterResult } from './types.js';
import { DEFAULT_QM_CONFIG, type QmConfig } from './config.js';
import { emaOfCloses } from '../indicators/ema.js';
import { mean } from '../indicators/rolling.js';
import { pyRound } from '../util/round.js';

/**
 * F3 — Qullamaggie trend & liquidity filter.
 *
 * A stock passes only when ALL hold:
 *   price > EMA50, EMA50 > EMA150, EMA150 > EMA200, EMA200 rising,
 *   price within `maxPctBelow52wHigh` of its 52-week high,
 *   recent dollar volume ≥ `minDollarVolume`, recent avg volume ≥ `minAvgVolume`.
 *
 * Uses the REAL EMA (`emaOfCloses`) — the same EMA the app draws on charts — not
 * the simple-mean MAs in `stage.ts` (those exist only for Python parity, which
 * this non-parity-locked scanner is deliberately free of).
 */
export function trendFilter(
  bars: readonly Bar[],
  cfg: QmConfig = DEFAULT_QM_CONFIG,
): TrendFilterResult {
  const t = cfg.trend;

  const fail = (reason: string): TrendFilterResult => ({
    passed: false,
    reason,
    price: bars.length ? bars[bars.length - 1]!.close : 0,
    ema50: 0,
    ema150: 0,
    ema200: 0,
    aboveEma50: false,
    ema50AboveEma150: false,
    ema150AboveEma200: false,
    ema200Rising: false,
    pctBelow52wHigh: 100,
    dollarVolume: 0,
    avgVolume: 0,
  });

  // Need enough history for the slow EMA plus its rising-lookback comparison.
  if (bars.length < t.emaSlow + t.emaSlowRisingLookback) {
    return fail('insufficient history');
  }

  const last = (arr: number[]): number => arr[arr.length - 1]!;
  const ema50Arr = emaOfCloses(bars, t.emaFast);
  const ema150Arr = emaOfCloses(bars, t.emaMid);
  const ema200Arr = emaOfCloses(bars, t.emaSlow);

  const price = bars[bars.length - 1]!.close;
  const ema50 = last(ema50Arr);
  const ema150 = last(ema150Arr);
  const ema200 = last(ema200Arr);
  const ema200Prev = ema200Arr[ema200Arr.length - 1 - t.emaSlowRisingLookback]!;

  const aboveEma50 = price > ema50;
  const ema50AboveEma150 = ema50 > ema150;
  const ema150AboveEma200 = ema150 > ema200;
  const ema200Rising = ema200 > ema200Prev;

  // Distance below the 52-week high.
  const window = bars.slice(Math.max(0, bars.length - t.week52Lookback));
  const high52 = Math.max(...window.map((b) => b.high));
  const pctBelow52wHigh = high52 > 0 ? pyRound(((high52 - price) / high52) * 100, 2) : 100;
  const withinHigh = pctBelow52wHigh <= t.maxPctBelow52wHigh;

  // Liquidity over the recent window.
  const liqWindow = bars.slice(Math.max(0, bars.length - t.avgVolumeLookback));
  const avgVolume = mean(liqWindow.map((b) => b.volume));
  const dollarVolume = avgVolume * price;
  const liquidOk = dollarVolume >= t.minDollarVolume && avgVolume >= t.minAvgVolume;

  const result: TrendFilterResult = {
    passed: false,
    reason: '',
    price: pyRound(price, 2),
    ema50: pyRound(ema50, 2),
    ema150: pyRound(ema150, 2),
    ema200: pyRound(ema200, 2),
    aboveEma50,
    ema50AboveEma150,
    ema150AboveEma200,
    ema200Rising,
    pctBelow52wHigh,
    dollarVolume: pyRound(dollarVolume, 0),
    avgVolume: pyRound(avgVolume, 0),
  };

  if (!aboveEma50) result.reason = 'price below EMA50';
  else if (!ema50AboveEma150) result.reason = 'EMA50 below EMA150';
  else if (!ema150AboveEma200) result.reason = 'EMA150 below EMA200';
  else if (!ema200Rising) result.reason = 'EMA200 not rising';
  else if (!withinHigh) result.reason = 'too far below 52-week high';
  else if (!liquidOk) result.reason = 'insufficient liquidity';

  result.passed = result.reason === '';
  return result;
}
