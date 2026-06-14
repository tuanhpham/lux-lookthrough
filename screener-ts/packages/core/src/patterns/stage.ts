import type { Bar } from '../types/market.js';
import type { StageResult } from '../types/signals.js';
import { mean } from '../indicators/rolling.js';
import { pyRound } from '../util/round.js';

/**
 * Weinstein Stage analysis — faithful port of `analyze_stage`.
 *
 * IMPORTANT: stage MAs are SIMPLE moving averages of CLOSE (mean of the last
 * N closes), NOT the EMA overlays used on the chart. Requires >= 200 bars.
 *
 *   ma50  = mean(close[-50:])
 *   ma150 = mean(close[-150:])
 *   ma200 = mean(close[-200:])
 *   ma200_month_ago = mean(close[-220:-20]) if len>=220 else ma200
 *
 * Classification:
 *   above all + ma200 up        → 2 ADVANCING
 *   above all + ma200 not up     → 3 TOPPING
 *   below all + ma200 not up     → 4 DECLINING
 *   otherwise                    → 1 BASING
 *
 * Note: comparisons use the rounded MA values, because the Python rounds
 * ma50/150/200 to 2dp *before* the price>MA comparisons read those fields...
 * actually the Python compares against the UNROUNDED values (above_50 = price
 * > ma50 computed before rounding). We replicate that: compare on raw means,
 * expose rounded values.
 */
export function analyzeStage(bars: readonly Bar[]): StageResult {
  if (bars.length < 200) {
    return {
      stage: 0,
      label: 'INSUFFICIENT_DATA',
      ma50: 0,
      ma150: 0,
      ma200: 0,
      price: 0,
      aboveMa50: false,
      aboveMa150: false,
      aboveMa200: false,
      ma200TrendingUp: false,
    };
  }

  const closes = bars.map((b) => b.close);
  const n = closes.length;
  const price = closes[n - 1]!;

  const ma50 = mean(closes.slice(n - 50));
  const ma150 = mean(closes.slice(n - 150));
  const ma200 = mean(closes.slice(n - 200));
  const ma200MonthAgo =
    n >= 220 ? mean(closes.slice(n - 220, n - 20)) : ma200;

  const above50 = price > ma50;
  const above150 = price > ma150;
  const above200 = price > ma200;
  const ma200Up = ma200 > ma200MonthAgo;

  let stage: number;
  let label: StageResult['label'];
  if (above50 && above150 && above200 && ma200Up) {
    stage = 2;
    label = 'ADVANCING';
  } else if (above50 && above150 && above200 && !ma200Up) {
    stage = 3;
    label = 'TOPPING';
  } else if (!above50 && !above150 && !above200 && !ma200Up) {
    stage = 4;
    label = 'DECLINING';
  } else {
    stage = 1;
    label = 'BASING';
  }

  return {
    stage,
    label,
    ma50: pyRound(ma50, 2),
    ma150: pyRound(ma150, 2),
    ma200: pyRound(ma200, 2),
    price: pyRound(price, 2),
    aboveMa50: above50,
    aboveMa150: above150,
    aboveMa200: above200,
    ma200TrendingUp: ma200Up,
  };
}
