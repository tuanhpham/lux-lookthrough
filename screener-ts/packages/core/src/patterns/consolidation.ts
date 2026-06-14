import type { Bar } from '../types/market.js';
import type { ConsolidationResult } from '../types/signals.js';
import { atr } from '../indicators/atr.js';
import { mean, rollingMax, rollingMin } from '../indicators/rolling.js';
import { volumeDryUpPct } from '../indicators/volumeDryUp.js';
import { argrelextrema } from '../util/extrema.js';
import { pyRound } from '../util/round.js';

/**
 * VCP-style consolidation detection — faithful port of `detect_consolidation`.
 *
 * base_window = 60, min_days = 15. Requires len >= base_window + 20.
 *
 *   base = df[-60:]
 *   atr_series = ATR(df, 14)[-60:]                  # full ATR then slice
 *   price_range_pct = (base.high.max - base.low.min) / base.low.min * 100
 *   atr_start = mean(atr_series[:10]); atr_end = mean(atr_series[-10:])
 *   atr_contraction_pct = (1 - atr_end/atr_start)*100   (0 if atr_start<=0)
 *   volume_dry_up_pct  = volumeDryUp(base.volume)
 *   vcp: drop NaN from atr_series, find peaks/troughs (order=5), count
 *        peak→next-trough contractions > 10%
 *   tightest_range_pct: min of rolling(10) (max-min)/min*100 over base
 *   is_consolidating = range<30 AND atr_contraction>5 AND base_window>=min_days
 */
export function detectConsolidation(
  bars: readonly Bar[],
  baseWindow = 60,
  minDays = 15,
): ConsolidationResult {
  if (bars.length < baseWindow + 20) {
    return {
      isConsolidating: false,
      daysInBase: 0,
      priceRangePct: 100,
      atrContractionPct: 100,
      volumeDryUpPct: 100,
      vcpContractions: 0,
      tightestRangePct: 100,
    };
  }

  const n = bars.length;
  const base = bars.slice(n - baseWindow);
  const atrFull = atr(bars, 14);
  const atrSeries = atrFull.slice(n - baseWindow); // may contain NaN at the front in theory; not here (n large)

  const baseHigh = Math.max(...base.map((b) => b.high));
  const baseLow = Math.min(...base.map((b) => b.low));
  const priceRangePct = pyRound(((baseHigh - baseLow) / baseLow) * 100, 2);

  const atrStart = mean(atrSeries.slice(0, 10));
  const atrEnd = mean(atrSeries.slice(-10));
  const atrContractionPct = atrStart > 0 ? pyRound((1 - atrEnd / atrStart) * 100, 2) : 0;

  const volDryUp = volumeDryUpPct(base.map((b) => b.volume));

  // VCP contraction count.
  const atrVals = atrSeries.filter((v) => !Number.isNaN(v));
  let vcpCount = 0;
  if (atrVals.length > 10) {
    const peaks = argrelextrema(atrVals, 'greater', 5);
    const troughs = argrelextrema(atrVals, 'less', 5);
    for (const peakIdx of peaks) {
      const subsequent = troughs.filter((t) => t > peakIdx);
      if (subsequent.length > 0) {
        const troughIdx = subsequent[0]!;
        const peakVal = atrVals[peakIdx]!;
        if (peakVal > 0) {
          const contraction = (peakVal - atrVals[troughIdx]!) / peakVal;
          if (contraction > 0.1) vcpCount += 1;
        }
      }
    }
  }

  // Tightest 10-day range within the base.
  const highs = base.map((b) => b.high);
  const lows = base.map((b) => b.low);
  const rMax = rollingMax(highs, 10);
  const rMin = rollingMin(lows, 10);
  const rangePcts: number[] = [];
  for (let i = 0; i < base.length; i++) {
    if (!Number.isNaN(rMax[i]!) && !Number.isNaN(rMin[i]!)) {
      rangePcts.push(((rMax[i]! - rMin[i]!) / rMin[i]!) * 100);
    }
  }
  const tightestRangePct =
    rangePcts.length > 0 ? pyRound(Math.min(...rangePcts), 2) : priceRangePct;

  const isConsolidating =
    priceRangePct < 30 && atrContractionPct > 5 && baseWindow >= minDays;

  return {
    isConsolidating,
    daysInBase: baseWindow,
    priceRangePct,
    atrContractionPct,
    volumeDryUpPct: volDryUp,
    vcpContractions: vcpCount,
    tightestRangePct,
  };
}
