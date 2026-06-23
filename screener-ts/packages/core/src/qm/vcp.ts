import type { Bar } from '../types/market.js';
import type { VcpResult } from './types.js';
import { DEFAULT_QM_CONFIG, type QmConfig } from './config.js';
import { atr } from '../indicators/atr.js';
import { emaOfCloses } from '../indicators/ema.js';
import { mean } from '../indicators/rolling.js';
import { volumeDryUpPct } from '../indicators/volumeDryUp.js';
import { argrelextrema } from '../util/extrema.js';
import { pyRound } from '../util/round.js';

const EMPTY: VcpResult = {
  isVcp: false,
  pivot: null,
  contractions: 0,
  baseDepthPct: 0,
  previousAdvancePct: 0,
  volumeContractionPct: 0,
  atrContractionPct: 0,
  impulseCount: 0,
  baseLength: 0,
  aboveEmaFast: false,
  pullbacks: [],
  confidence: 0,
};

/**
 * F1 — true Volatility Contraction Pattern.
 *
 * Pipeline (all thresholds from `cfg.vcp`):
 *  1. Find swing highs/lows via argrelextrema(order).
 *  2. Base = trailing region after the last swing high; must be within
 *     [minBaseLength, maxBaseLength] bars.
 *  3. Previous advance % = (baseTopHigh − priorSwingLow)/priorSwingLow×100,
 *     measured over `advanceLookback` bars before the base. Reject below min.
 *  4. Impulse count = up-legs in the advance whose gain ≥ minImpulsePct.
 *  5. Contracting pullbacks: each pullback ≤ previous × contractionShrinkRatio.
 *  6. Volume contraction via volumeDryUpPct over the base.
 *  7. ATR contraction over the base (same formula as detectConsolidation).
 *  8. Price > EMA50 gate (when requireAboveEmaFast).
 *  9. Pivot = highest base high; baseDepth = (high−low)/high×100.
 *
 * Reuses atr/ema/mean/volumeDryUpPct/argrelextrema/pyRound — no duplicated math.
 */
export function detectVcp(
  bars: readonly Bar[],
  cfg: QmConfig = DEFAULT_QM_CONFIG,
  ema50Last?: number,
): VcpResult {
  const v = cfg.vcp;
  const n = bars.length;
  if (n < v.minBaseLength + 2 * v.extremaOrder + 20) return EMPTY;

  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const closes = bars.map((b) => b.close);

  const swingHighs = argrelextrema(highs, 'greater', v.extremaOrder);
  const swingLows = argrelextrema(lows, 'less', v.extremaOrder);
  if (swingHighs.length === 0) return EMPTY;

  // Base anchors at the highest high within the recent maxBaseLength window —
  // the peak the stock is now consolidating below (NOT merely the last swing
  // high, which in a real VCP is an internal lower-high inside the base).
  const searchStart = Math.max(0, n - 1 - v.maxBaseLength);
  let baseStart = searchStart;
  for (let i = searchStart; i < n; i++) {
    if (highs[i]! > highs[baseStart]!) baseStart = i;
  }
  const baseEnd = n - 1;
  const baseLength = baseEnd - baseStart;
  if (baseLength < v.minBaseLength || baseLength > v.maxBaseLength) return EMPTY;

  const base = bars.slice(baseStart);
  const baseTopHigh = highs[baseStart]!;
  const baseHigh = Math.max(...base.map((b) => b.high));
  const baseLow = Math.min(...base.map((b) => b.low));
  const baseDepthPct = baseHigh > 0 ? pyRound(((baseHigh - baseLow) / baseHigh) * 100, 2) : 0;

  // ── Previous advance: lowest swing low before the base, within lookback. ──
  const advanceStartIdx = Math.max(0, baseStart - v.advanceLookback);
  const priorLows = swingLows.filter((i) => i >= advanceStartIdx && i < baseStart);
  // Fall back to the window's plain low if no swing low resolved.
  const priorSwingLow =
    priorLows.length > 0
      ? Math.min(...priorLows.map((i) => lows[i]!))
      : Math.min(...lows.slice(advanceStartIdx, baseStart + 1));
  const previousAdvancePct =
    priorSwingLow > 0 ? pyRound(((baseTopHigh - priorSwingLow) / priorSwingLow) * 100, 2) : 0;

  // ── Impulse count: consecutive trough→peak up-legs in the advance. ──
  const advanceExtrema = [
    ...swingLows.filter((i) => i >= advanceStartIdx && i <= baseStart).map((i) => ({ i, kind: 'low' as const })),
    ...swingHighs.filter((i) => i >= advanceStartIdx && i <= baseStart).map((i) => ({ i, kind: 'high' as const })),
  ].sort((a, b) => a.i - b.i);
  let impulseCount = 0;
  for (let k = 0; k < advanceExtrema.length - 1; k++) {
    const cur = advanceExtrema[k]!;
    const next = advanceExtrema[k + 1]!;
    if (cur.kind === 'low' && next.kind === 'high') {
      const lo = lows[cur.i]!;
      const hi = highs[next.i]!;
      if (lo > 0 && ((hi - lo) / lo) * 100 >= v.minImpulsePct) impulseCount += 1;
    }
  }

  // ── Contracting pullbacks within the base. ──
  // Walk the alternating peak→trough sequence and measure each peak-to-next-trough drop.
  const baseHighsIdx = swingHighs.filter((i) => i >= baseStart);
  const baseLowsIdx = swingLows.filter((i) => i >= baseStart);
  const baseSeq = [
    ...baseHighsIdx.map((i) => ({ i, kind: 'high' as const })),
    ...baseLowsIdx.map((i) => ({ i, kind: 'low' as const })),
  ].sort((a, b) => a.i - b.i);

  const pullbacks: number[] = [];
  for (let k = 0; k < baseSeq.length - 1; k++) {
    const cur = baseSeq[k]!;
    const next = baseSeq[k + 1]!;
    if (cur.kind === 'high' && next.kind === 'low') {
      const peak = highs[cur.i]!;
      const trough = lows[next.i]!;
      if (peak > 0) pullbacks.push(pyRound(((peak - trough) / peak) * 100, 2));
    }
  }

  // Count the leading run of monotonically contracting pullbacks.
  let contractions = 0;
  for (let k = 0; k < pullbacks.length; k++) {
    if (k === 0) {
      contractions = 1;
    } else if (pullbacks[k]! <= pullbacks[k - 1]! * v.contractionShrinkRatio) {
      contractions += 1;
    } else {
      break;
    }
  }
  if (pullbacks.length === 0) contractions = 0;

  // ── Volume contraction across the base. ──
  const volumeContractionPct = volumeDryUpPct(base.map((b) => b.volume));

  // ── ATR contraction across the base (mirror detectConsolidation's formula). ──
  const atrFull = atr(bars, 14);
  const atrBase = atrFull.slice(baseStart).filter((x) => !Number.isNaN(x));
  let atrContractionPct = 0;
  if (atrBase.length >= 20) {
    const atrStart = mean(atrBase.slice(0, 10));
    const atrEnd = mean(atrBase.slice(-10));
    atrContractionPct = atrStart > 0 ? pyRound((1 - atrEnd / atrStart) * 100, 2) : 0;
  }

  // ── Price above EMA50 gate. ──
  const price = closes[n - 1]!;
  const emaFast = ema50Last ?? (() => {
    const arr = emaOfCloses(bars, cfg.trend.emaFast);
    return arr[arr.length - 1]!;
  })();
  const aboveEmaFast = price > emaFast;

  const pivot = pyRound(baseHigh, 2);

  // ── Pass/fail gates. ──
  const isVcp =
    previousAdvancePct >= v.minPreviousAdvancePct &&
    impulseCount >= v.minImpulses &&
    contractions >= v.minContractions &&
    volumeContractionPct >= v.minVolumeContractionPct &&
    atrContractionPct >= v.minAtrContractionPct &&
    (!v.requireAboveEmaFast || aboveEmaFast);

  // ── VCP-local confidence 0..100 (blend of the strengths). ──
  const cContractions = Math.min(contractions / 4, 1) * 30;
  const cTight = Math.max(0, (30 - baseDepthPct) / 25) * 20;
  const cVol = Math.min(Math.max(volumeContractionPct, 0) / 40, 1) * 20;
  const cAtr = Math.min(Math.max(atrContractionPct, 0) / 40, 1) * 20;
  const distToPivot = pivot > 0 ? ((pivot - price) / price) * 100 : 100;
  const cProx = Math.max(0, (5 - Math.max(distToPivot, 0)) / 5) * 10;
  const confidence = pyRound(Math.min(cContractions + cTight + cVol + cAtr + cProx, 100), 1);

  return {
    isVcp,
    pivot,
    contractions,
    baseDepthPct,
    previousAdvancePct,
    volumeContractionPct,
    atrContractionPct,
    impulseCount,
    baseLength,
    aboveEmaFast,
    pullbacks,
    confidence,
  };
}
