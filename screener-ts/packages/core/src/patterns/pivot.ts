import type { Bar } from '../types/market.js';
import type { PivotResult } from '../types/signals.js';
import { argrelextrema } from '../util/extrema.js';
import { pyRound } from '../util/round.js';

/**
 * Pivot-high detection — faithful port of `detect_pivot` (order = 10).
 *
 *   needs len >= order*2 + 1
 *   peak_indices = argrelextrema(highs, np.greater_equal, order=order)
 *   pivot_prices = [round(highs[i], 2) for i in peak_indices]
 *   overhead = [p for p in pivot_prices if p > current_price * 0.98]
 *   pivot_high = min(overhead) or None
 *   dist = (pivot_high - current_price) / current_price * 100   (0 if no pivot)
 *   recent_pivots = pivot_prices[-5:]
 */
export function detectPivot(bars: readonly Bar[], order = 10): PivotResult {
  if (bars.length < order * 2 + 1) {
    return { pivotHigh: null, distanceToPivotPct: 0, recentPivots: [] };
  }

  const highs = bars.map((b) => b.high);
  const currentPrice = bars[bars.length - 1]!.close;

  const peakIndices = argrelextrema(highs, 'greater_equal', order);
  if (peakIndices.length === 0) {
    return { pivotHigh: null, distanceToPivotPct: 0, recentPivots: [] };
  }

  const pivotPrices = peakIndices.map((i) => pyRound(highs[i]!, 2));
  const overhead = pivotPrices.filter((p) => p > currentPrice * 0.98);
  const pivotHigh = overhead.length > 0 ? Math.min(...overhead) : null;

  const distanceToPivotPct =
    pivotHigh !== null
      ? pyRound(((pivotHigh - currentPrice) / currentPrice) * 100, 2)
      : 0;

  return {
    pivotHigh,
    distanceToPivotPct,
    recentPivots: pivotPrices.slice(-5),
  };
}
