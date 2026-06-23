/**
 * Momentum / regime / sector configuration — the single source of truth for the
 * institutional-workflow layer (market regime → sector rotation → momentum →
 * pattern scanners). Like `DEFAULT_QM_CONFIG`, every threshold/weight lives here
 * so there are no hard-coded magic numbers in the engine bodies, and the whole
 * layer is tunable per call. Zero-dependency, consistent with the rest of core.
 */

export interface MomentumReturnPeriods {
  /** Bars in a "1-month" return window. */
  oneMonth: number;
  /** Bars in a "3-month" return window. */
  threeMonth: number;
  /** Bars in a "6-month" return window. */
  sixMonth: number;
  /** Bars in a "12-month" return window. */
  twelveMonth: number;
}

export interface MomentumWeights {
  /** 1M return weight (F1 default 15). */
  oneMonth: number;
  /** 3M return weight (F1 default 25). */
  threeMonth: number;
  /** 6M return weight (F1 default 25). */
  sixMonth: number;
  /** Relative-strength-vs-benchmark weight (F1 default 25). */
  relativeStrength: number;
  /** Liquidity weight (F1 default 10). */
  liquidity: number;
}

export interface MomentumNormalization {
  /** Return (%) that maps a single-period return to a full 1.0 component. */
  returnFullScalePct: number;
  /** Relative-strength (%) that maps to a full 1.0 RS component (±). */
  rsFullScalePct: number;
  /** Dollar volume that maps to a full 1.0 liquidity component. */
  liquidityFullDollarVolume: number;
  /** Bars averaged for the liquidity (dollar-volume) estimate. */
  liquidityLookback: number;
}

/** Percentile cutoffs (0–100) for the momentum classification buckets. */
export interface MomentumClassificationCutoffs {
  /** Below this percentile → "Weak". */
  weakBelow: number;
  /** Below this percentile → "Building". */
  buildingBelow: number;
  /** Below this percentile → "Strong"; at/above → "Explosive". */
  strongBelow: number;
}

export interface SectorMomentumConfig {
  /** A stock is "top momentum" if its percentile ≥ this (for the top-10% count). */
  topMomentumPercentile: number;
  /** How many sectors count as "hot" (top N). */
  hotSectorCount: number;
  /** How many sectors count as "cold" (bottom N). */
  coldSectorCount: number;
}

export interface RegimeConfig {
  emaFast: number;
  emaMid: number;
  emaSlow: number;
  /** Bars back used to confirm the slow EMA is rising. */
  emaSlowRisingLookback: number;
}

export interface MomentumFilterConfig {
  /** Default fraction of the universe kept by the momentum pre-filter (F4). */
  topPct: number;
}

export interface MomentumConfig {
  periods: MomentumReturnPeriods;
  weights: MomentumWeights;
  normalization: MomentumNormalization;
  classification: MomentumClassificationCutoffs;
  sector: SectorMomentumConfig;
  regime: RegimeConfig;
  filter: MomentumFilterConfig;
  /** Min bars needed to score a symbol (≈ the 6M window). */
  minBars: number;
}

export const DEFAULT_MOMENTUM_CONFIG: MomentumConfig = {
  periods: {
    oneMonth: 21,
    threeMonth: 63,
    sixMonth: 126,
    twelveMonth: 252,
  },
  weights: {
    oneMonth: 15,
    threeMonth: 25,
    sixMonth: 25,
    relativeStrength: 25,
    liquidity: 10,
  },
  normalization: {
    returnFullScalePct: 50,
    rsFullScalePct: 30,
    liquidityFullDollarVolume: 50_000_000,
    liquidityLookback: 50,
  },
  classification: {
    weakBelow: 40,
    buildingBelow: 70,
    strongBelow: 90,
  },
  sector: {
    topMomentumPercentile: 90,
    hotSectorCount: 3,
    coldSectorCount: 3,
  },
  regime: {
    emaFast: 50,
    emaMid: 150,
    emaSlow: 200,
    emaSlowRisingLookback: 20,
  },
  filter: {
    topPct: 0.15,
  },
  minBars: 126,
};
