import type { Bar } from '../types/market.js';
import type { QmScanResult, QmSetupType, QmQualityParts } from './types.js';
import { DEFAULT_QM_CONFIG, type QmConfig } from './config.js';
import { trendFilter } from './trend.js';
import { detectVcp } from './vcp.js';
import { detectEpisodicPivot, type EpSurprise } from './episodicPivot.js';
import { relativeStrength } from './relativeStrength.js';
import { computeQmQuality } from './qualityScore.js';
import { calculateTradeLevels } from '../scoring/tradeLevels.js';
import { atr } from '../indicators/atr.js';
import { emaOfCloses } from '../indicators/ema.js';
import { pyRound } from '../util/round.js';

export interface QmScanOptions {
  /** Benchmark OHLCV for relative-strength (e.g. SPY); optional. */
  benchmark?: readonly Bar[];
  /** Optional analyst-estimate surprises that enrich the episodic-pivot catalyst. */
  surprise?: EpSurprise;
}

/**
 * Full Qullamaggie single-stock scan — orchestrates the trend filter, VCP and
 * episodic-pivot detectors, relative strength, the weighted quality score, and
 * trade levels. Mirrors the shape of `scanStock` but for the QM module.
 *
 * Reuses `calculateTradeLevels` (pivot + ATR → entry/stop/target/RR) so QM
 * inherits the exact same risk math as the core pattern engine.
 */
export function scanQm(
  symbol: string,
  bars: readonly Bar[],
  cfg: QmConfig = DEFAULT_QM_CONFIG,
  opts: QmScanOptions = {},
): QmScanResult {
  const price = bars.length ? bars[bars.length - 1]!.close : 0;

  // Compute EMA50 once and thread it into the VCP gate to avoid recomputation.
  const ema50Arr = emaOfCloses(bars, cfg.trend.emaFast);
  const ema50Last = ema50Arr.length ? ema50Arr[ema50Arr.length - 1]! : NaN;

  const trend = trendFilter(bars, cfg);
  const vcp = detectVcp(bars, cfg, ema50Last);
  const ep = detectEpisodicPivot(bars, cfg, opts.surprise);
  const rs = relativeStrength(bars, cfg, opts.benchmark);

  // Trade levels off the VCP pivot + current ATR (reused from the core engine).
  const atrSeries = atr(bars, 14).filter((x) => !Number.isNaN(x));
  const currentAtr = atrSeries.length ? atrSeries[atrSeries.length - 1]! : 0;
  const levels = calculateTradeLevels(price, vcp.pivot, currentAtr);

  const riskPct =
    levels.entryPrice != null && levels.stopLoss != null && levels.entryPrice > 0
      ? pyRound(((levels.entryPrice - levels.stopLoss) / levels.entryPrice) * 100, 2)
      : null;

  // ── Quality parts (each 0..1). ──
  const parts: QmQualityParts = {
    // Trend: count of the four trend conditions that hold.
    trend:
      ([trend.aboveEma50, trend.ema50AboveEma150, trend.ema150AboveEma200, trend.ema200Rising].filter(
        Boolean,
      ).length) / 4,
    // Previous advance: full credit at 2× the configured minimum.
    previousAdvance: clamp01(vcp.previousAdvancePct / (cfg.vcp.minPreviousAdvancePct * 2)),
    // VCP: its own confidence, normalised.
    vcp: clamp01(vcp.confidence / 100),
    // Volume contraction: full credit at 40%.
    volume: clamp01(vcp.volumeContractionPct / 40),
    // Relative strength: squash ±50% into 0..1 (0% → 0.5).
    relativeStrength: clamp01((rs + 50) / 100),
    // Liquidity: ratio of dollar volume to the configured minimum.
    liquidity: clamp01(trend.dollarVolume / cfg.trend.minDollarVolume),
    // Breakout proximity: full credit when price is within 5% under the pivot.
    breakout:
      vcp.pivot && price > 0
        ? clamp01((5 - Math.max(((vcp.pivot - price) / price) * 100, 0)) / 5)
        : 0,
  };
  const qualityScore = computeQmQuality(parts, cfg);

  // ── Setup classification. ──
  let setupType: QmSetupType = 'NONE';
  const vcpOk = vcp.isVcp && trend.passed;
  if (vcpOk && ep.isEp) setupType = 'BOTH';
  else if (vcpOk) setupType = 'VCP';
  else if (ep.isEp) setupType = 'EPISODIC_PIVOT';

  return {
    symbol,
    price: pyRound(price, 2),
    setupType,
    qualityScore,
    relativeStrength: rs,
    trend,
    vcp,
    ep,
    levels,
    riskPct,
  };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
