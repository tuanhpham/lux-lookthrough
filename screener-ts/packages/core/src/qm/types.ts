/** Result types for the Qullamaggie scanners. Kept separate from the
 * parity-locked `types/signals.ts` so the existing `ScreenRow`/`sortableTable`
 * contract is untouched. */

import type { TradeLevels } from '../types/signals.js';

export type QmSetupType = 'VCP' | 'EPISODIC_PIVOT' | 'BOTH' | 'NONE';

/** F3 — trend & liquidity gate. */
export interface TrendFilterResult {
  passed: boolean;
  /** Human-readable reason a stock failed (empty when passed). */
  reason: string;
  price: number;
  ema50: number;
  ema150: number;
  ema200: number;
  aboveEma50: boolean;
  ema50AboveEma150: boolean;
  ema150AboveEma200: boolean;
  ema200Rising: boolean;
  pctBelow52wHigh: number;
  dollarVolume: number;
  avgVolume: number;
}

/** F1 — Volatility Contraction Pattern. */
export interface VcpResult {
  isVcp: boolean;
  /** Pivot = highest high in the base (the pre-breakout high). */
  pivot: number | null;
  /** Number of contracting pullbacks detected within the base. */
  contractions: number;
  /** Base depth: (baseHigh − baseLow) / baseHigh × 100. */
  baseDepthPct: number;
  /** Prior advance leading into the base (%). */
  previousAdvancePct: number;
  /** Volume contraction across the base (%, via volumeDryUpPct). */
  volumeContractionPct: number;
  /** ATR contraction across the base (%). */
  atrContractionPct: number;
  /** Number of impulse up-legs detected in the advance. */
  impulseCount: number;
  /** Base length in bars. */
  baseLength: number;
  /** Whether price is above the fast EMA. */
  aboveEmaFast: boolean;
  /** Sequence of pullback depths (%), newest last — for transparency/tests. */
  pullbacks: number[];
  /** VCP-local confidence 0..100. */
  confidence: number;
}

/** F2 — Episodic (earnings/news) pivot. */
export interface EpisodicPivotResult {
  isEp: boolean;
  /** Gap vs prior close (%). */
  gapPct: number;
  /** Relative volume (gap day vs lookback average). */
  relativeVolume: number;
  /** Close location within the day's range (0..1; 1 = closed at high). */
  closeLocation: number;
  /** Whether the gap cleared the prior resistance high. */
  gapAboveResistance: boolean;
  /** Catalyst description (e.g. "Earnings gap + EPS & revenue surprise"). */
  catalyst: string | null;
  /** Reason for rejection (empty when isEp). */
  reason: string;
  /** Gap score 0..100. */
  gapScore: number;
  /** Confidence 0..100 (includes optional EPS/revenue surprise boosts). */
  confidence: number;
}

/** Inputs that subdivide into the weighted quality buckets (F4). */
export interface QmQualityParts {
  /** 0..1 — trend strength. */
  trend: number;
  /** 0..1 — prior advance magnitude. */
  previousAdvance: number;
  /** 0..1 — VCP quality. */
  vcp: number;
  /** 0..1 — volume contraction quality. */
  volume: number;
  /** 0..1 — relative strength. */
  relativeStrength: number;
  /** 0..1 — liquidity. */
  liquidity: number;
  /** 0..1 — breakout proximity. */
  breakout: number;
}

/** Full QM scan output (the rich object `scanQm` returns). */
export interface QmScanResult {
  symbol: string;
  price: number;
  setupType: QmSetupType;
  qualityScore: number;
  relativeStrength: number;
  trend: TrendFilterResult;
  vcp: VcpResult;
  ep: EpisodicPivotResult;
  levels: TradeLevels;
  /** Stop-based risk per share as a % of entry. */
  riskPct: number | null;
}

/** Flattened QM row for the UI table (analogous to `ScreenRow`). */
export interface QmRow {
  symbol: string;
  sector?: string | null;
  price: number;
  qualityScore: number;
  setupType: QmSetupType;
  previousAdvancePct: number | null;
  vcpContractions: number | null;
  atrContractionPct: number | null;
  volumeContractionPct: number | null;
  pivot: number | null;
  entryPrice: number | null;
  stopLoss: number | null;
  riskPct: number | null;
  relativeStrength: number | null;
  gapPct: number | null;
  catalyst: string | null;
}
