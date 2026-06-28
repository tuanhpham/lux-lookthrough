import type { Bar } from '../types/market.js';
import { pyRound } from '../util/round.js';

/**
 * "Volume Surge" screen — stocks whose recent average volume is abnormally
 * elevated versus their own longer-term baseline.
 *
 * Signal logic:
 *   recentAvg  = mean(volume, last `recentDays` bars)
 *   baselineAvg = mean(volume, last `baselineDays` bars, excluding the recent window)
 *   ratio = recentAvg / baselineAvg
 *   isVolumeSurge = ratio >= minRatio
 *
 * A ratio of 2.0 means the stock traded 2× its normal volume this week.
 * The baseline window uses bars BEFORE the recent window so the two do not
 * overlap — clean separation between "now" and "normal".
 */
export interface VolumeSurgeConfig {
  /** Number of recent bars to average (default 5 ≈ 1 week). */
  recentDays: number;
  /** Number of bars in the baseline window (default 50 ≈ 10 weeks). */
  baselineDays: number;
  /** Minimum ratio (recentAvg / baselineAvg) to qualify (default 2.0). */
  minRatio: number;
}

export const DEFAULT_VOLUME_SURGE_CONFIG: VolumeSurgeConfig = {
  recentDays: 5,
  baselineDays: 50,
  minRatio: 2.0,
};

export interface VolumeSurgeResult {
  isVolumeSurge: boolean;
  /** Average volume over the recent window. */
  recentAvgVolume: number;
  /** Average volume over the baseline window (excludes the recent window). */
  baselineAvgVolume: number;
  /** recentAvg / baselineAvg, rounded to 2dp. */
  ratio: number;
  /** Absolute change in average volume (recent − baseline). */
  volumeDelta: number;
}

const EMPTY: VolumeSurgeResult = {
  isVolumeSurge: false,
  recentAvgVolume: 0,
  baselineAvgVolume: 0,
  ratio: 0,
  volumeDelta: 0,
};

export function detectVolumeSurge(
  bars: readonly Bar[],
  cfg: VolumeSurgeConfig = DEFAULT_VOLUME_SURGE_CONFIG,
): VolumeSurgeResult {
  const n = bars.length;
  const needed = cfg.recentDays + cfg.baselineDays;
  if (n < needed) return EMPTY;

  // Recent window: the last `recentDays` bars.
  let recentSum = 0;
  for (let i = n - cfg.recentDays; i < n; i++) recentSum += bars[i]!.volume;
  const recentAvgVolume = recentSum / cfg.recentDays;

  // Baseline window: the `baselineDays` bars immediately before the recent window.
  let baselineSum = 0;
  const baselineStart = n - cfg.recentDays - cfg.baselineDays;
  for (let i = baselineStart; i < n - cfg.recentDays; i++) baselineSum += bars[i]!.volume;
  const baselineAvgVolume = baselineSum / cfg.baselineDays;

  if (baselineAvgVolume <= 0) return EMPTY;

  const ratio = pyRound(recentAvgVolume / baselineAvgVolume, 2);

  return {
    isVolumeSurge: ratio >= cfg.minRatio,
    recentAvgVolume: Math.round(recentAvgVolume),
    baselineAvgVolume: Math.round(baselineAvgVolume),
    ratio,
    volumeDelta: Math.round(recentAvgVolume - baselineAvgVolume),
  };
}
