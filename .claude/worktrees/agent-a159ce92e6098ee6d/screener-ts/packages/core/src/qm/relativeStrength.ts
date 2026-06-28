import type { Bar } from '../types/market.js';
import { DEFAULT_QM_CONFIG, type QmConfig } from './config.js';
import { pyRound } from '../util/round.js';

/**
 * Relative-strength input for the quality score.
 *
 * Blends the symbol's return over several lookback periods (cfg.rs.periods)
 * using cfg.rs.weights. When a `benchmark` series is supplied the return is
 * measured RELATIVE to the benchmark over the same window (symbolReturn −
 * benchmarkReturn); otherwise it falls back to the symbol's absolute momentum.
 *
 * Returns a raw weighted return in %. Larger = stronger. (The quality score
 * squashes this into 0..1 — see qualityScore/scanQm.)
 */
export function relativeStrength(
  bars: readonly Bar[],
  cfg: QmConfig = DEFAULT_QM_CONFIG,
  benchmark?: readonly Bar[],
): number {
  const { periods, weights } = cfg.rs;
  if (bars.length < 2) return 0;

  const periodReturn = (series: readonly Bar[], period: number): number | null => {
    if (series.length <= period) return null;
    const now = series[series.length - 1]!.close;
    const then = series[series.length - 1 - period]!.close;
    if (then <= 0) return null;
    return ((now - then) / then) * 100;
  };

  let weighted = 0;
  let usedWeight = 0;
  for (let i = 0; i < periods.length; i++) {
    const period = periods[i]!;
    const w = weights[i] ?? 0;
    const symRet = periodReturn(bars, period);
    if (symRet === null) continue;
    let value = symRet;
    if (benchmark) {
      const benchRet = periodReturn(benchmark, period);
      if (benchRet !== null) value = symRet - benchRet;
    }
    weighted += value * w;
    usedWeight += w;
  }

  if (usedWeight === 0) return 0;
  return pyRound(weighted / usedWeight, 2);
}
