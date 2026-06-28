import type { Bar } from '../types/market.js';
import { pyRound } from '../util/round.js';

/**
 * "Volume Surge" screen — detects a single abnormal spike day within the
 * recent window versus the longer-term baseline average.
 *
 * Signal logic:
 *   peakVolume  = max(volume, last `recentDays` bars)   ← single best day
 *   baselineAvg = mean(volume, prior `baselineDays` bars, no overlap)
 *   ratio = peakVolume / baselineAvg
 *   isVolumeSurge = ratio >= minRatio
 *
 * Using the peak (not the average) of the recent window means one explosive
 * day within a quiet period still fires the signal — matching the user's
 * intent of "was there an abnormal day this month?".
 * The baseline window uses bars BEFORE the recent window so the two do not
 * overlap — clean separation between "now" and "normal".
 */
export interface VolumeSurgeConfig {
  /** Number of recent bars to scan for the peak (default 5 ≈ 1 week). */
  recentDays: number;
  /** Number of bars in the baseline window (default 50 ≈ 10 weeks). */
  baselineDays: number;
  /** Minimum ratio (peakVolume / baselineAvg) to qualify (default 2.0). */
  minRatio: number;
}

export const DEFAULT_VOLUME_SURGE_CONFIG: VolumeSurgeConfig = {
  recentDays: 5,
  baselineDays: 50,
  minRatio: 2.0,
};

export interface VolumeSurgeResult {
  isVolumeSurge: boolean;
  /** Single highest-volume day in the recent window. */
  peakVolume: number;
  /** Average volume over the recent window (shown in table for context). */
  recentAvgVolume: number;
  /** Average volume over the baseline window (excludes the recent window). */
  baselineAvgVolume: number;
  /** peakVolume / baselineAvg, rounded to 2dp. */
  ratio: number;
  /** Absolute change (peak − baseline avg). */
  volumeDelta: number;
}

const EMPTY: VolumeSurgeResult = {
  isVolumeSurge: false,
  peakVolume: 0,
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

  // Recent window: last `recentDays` bars — find the peak day.
  let recentSum = 0;
  let peakVolume = 0;
  for (let i = n - cfg.recentDays; i < n; i++) {
    const v = bars[i]!.volume;
    recentSum += v;
    if (v > peakVolume) peakVolume = v;
  }
  const recentAvgVolume = recentSum / cfg.recentDays;

  // Baseline window: `baselineDays` bars immediately before the recent window.
  let baselineSum = 0;
  const baselineStart = n - cfg.recentDays - cfg.baselineDays;
  for (let i = baselineStart; i < n - cfg.recentDays; i++) baselineSum += bars[i]!.volume;
  const baselineAvgVolume = baselineSum / cfg.baselineDays;

  if (baselineAvgVolume <= 0) return EMPTY;

  // Ratio based on the single best day vs the quiet baseline.
  const ratio = pyRound(peakVolume / baselineAvgVolume, 2);

  return {
    isVolumeSurge: ratio >= cfg.minRatio,
    peakVolume: Math.round(peakVolume),
    recentAvgVolume: Math.round(recentAvgVolume),
    baselineAvgVolume: Math.round(baselineAvgVolume),
    ratio,
    volumeDelta: Math.round(peakVolume - baselineAvgVolume),
  };
}
