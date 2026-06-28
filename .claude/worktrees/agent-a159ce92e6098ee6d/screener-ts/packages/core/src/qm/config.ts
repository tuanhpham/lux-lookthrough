/**
 * Qullamaggie screening configuration — the single source of truth for every
 * threshold and scoring weight used by the QM scanners (trend filter, VCP,
 * episodic pivot, relative strength, quality score).
 *
 * There are NO hard-coded numbers in the scanner bodies: each scanner takes a
 * `QmConfig` (defaulting to `DEFAULT_QM_CONFIG`) and reads every magic number
 * from it, so the whole module is tunable per call. This mirrors the existing
 * param-default idiom in `detectConsolidation`/`detectPivot`/`calculateTradeLevels`
 * while keeping `@screener/core` zero-dependency.
 */

export interface QmTrendConfig {
  /** Fast EMA period (price must be above it). */
  emaFast: number;
  /** Mid EMA period (must sit below the fast EMA). */
  emaMid: number;
  /** Slow EMA period (must sit below the mid EMA and be rising). */
  emaSlow: number;
  /** Bars back used to confirm the slow EMA is rising. */
  emaSlowRisingLookback: number;
  /** Max % the price may sit below its 52-week high. */
  maxPctBelow52wHigh: number;
  /** Bars used as the 52-week window (≈252 trading days). */
  week52Lookback: number;
  /** Minimum recent dollar volume (price × volume). */
  minDollarVolume: number;
  /** Minimum recent average share volume. */
  minAvgVolume: number;
  /** Bars averaged for the dollar/average volume liquidity gates. */
  avgVolumeLookback: number;
}

export interface QmVcpConfig {
  /** Minimum prior advance (%) leading into the base. */
  minPreviousAdvancePct: number;
  /** Bars to look back when measuring the prior advance. */
  advanceLookback: number;
  /** Minimum number of impulse up-legs detected in the advance. */
  minImpulses: number;
  /** Minimum threshold (%) for an up-leg to count as an impulse. */
  minImpulsePct: number;
  /** Minimum base length in bars. */
  minBaseLength: number;
  /** Maximum base length in bars. */
  maxBaseLength: number;
  /** argrelextrema order used to find swing highs/lows. */
  extremaOrder: number;
  /** Minimum number of contracting pullbacks required. */
  minContractions: number;
  /** Each pullback must be ≤ previous × this ratio (the 20→12→8→5 shrink). */
  contractionShrinkRatio: number;
  /** Minimum volume contraction (%) across the base. */
  minVolumeContractionPct: number;
  /** Minimum ATR contraction (%) across the base. */
  minAtrContractionPct: number;
  /** Require price above the fast EMA for a valid VCP. */
  requireAboveEmaFast: boolean;
}

export interface QmEpConfig {
  /** Minimum gap-up (%) versus the prior close. */
  minGapPct: number;
  /** Minimum relative volume (today vs the lookback average). */
  minRelativeVolume: number;
  /** Bars averaged for the relative-volume baseline. */
  relVolumeLookback: number;
  /** Bars whose high the gap day must clear (gap above resistance). */
  resistanceLookback: number;
  /** Close location in the day's range to count as "near the high" (0..1). */
  minCloseLocationInRange: number;
  /** Reject the setup if the gap fills (close back below the prior close). */
  rejectGapFill: boolean;
  /** Confidence points added when a positive EPS surprise is supplied. */
  epsSurpriseBoost: number;
  /** Confidence points added when a positive revenue surprise is supplied. */
  revenueSurpriseBoost: number;
}

export interface QmWeights {
  trend: number;
  previousAdvance: number;
  vcp: number;
  volume: number;
  relativeStrength: number;
  liquidity: number;
  breakout: number;
}

export interface QmRsConfig {
  /** Lookback periods (bars) blended into the momentum score. */
  periods: number[];
  /** Weight for each period (same length as `periods`; should sum to 1). */
  weights: number[];
}

export interface QmConfig {
  trend: QmTrendConfig;
  vcp: QmVcpConfig;
  ep: QmEpConfig;
  /** Quality-score weights — total = 100 (F4). */
  weights: QmWeights;
  rs: QmRsConfig;
}

/**
 * Default Qullamaggie configuration. Weights total 100 (Trend 20, Previous
 * Advance 10, VCP 25, Volume 15, RS 15, Liquidity 10, Breakout 5).
 */
export const DEFAULT_QM_CONFIG: QmConfig = {
  trend: {
    emaFast: 50,
    emaMid: 150,
    emaSlow: 200,
    emaSlowRisingLookback: 20,
    maxPctBelow52wHigh: 25,
    week52Lookback: 252,
    minDollarVolume: 20_000_000,
    minAvgVolume: 1_000_000,
    avgVolumeLookback: 50,
  },
  vcp: {
    minPreviousAdvancePct: 30,
    advanceLookback: 252,
    minImpulses: 1,
    minImpulsePct: 15,
    minBaseLength: 15,
    maxBaseLength: 90,
    extremaOrder: 5,
    minContractions: 2,
    contractionShrinkRatio: 0.85,
    minVolumeContractionPct: 20,
    minAtrContractionPct: 10,
    requireAboveEmaFast: true,
  },
  ep: {
    minGapPct: 8,
    minRelativeVolume: 2.0,
    relVolumeLookback: 50,
    resistanceLookback: 60,
    minCloseLocationInRange: 0.6,
    rejectGapFill: true,
    epsSurpriseBoost: 10,
    revenueSurpriseBoost: 10,
  },
  weights: {
    trend: 20,
    previousAdvance: 10,
    vcp: 25,
    volume: 15,
    relativeStrength: 15,
    liquidity: 10,
    breakout: 5,
  },
  rs: {
    periods: [63, 126, 189, 252],
    weights: [0.4, 0.2, 0.2, 0.2],
  },
};
