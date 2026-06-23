import type { Bar } from '../types/market.js';
import type { EpisodicPivotResult } from './types.js';
import { DEFAULT_QM_CONFIG, type QmConfig } from './config.js';
import { mean } from '../indicators/rolling.js';
import { pyRound } from '../util/round.js';

/** Optional analyst-estimate surprise inputs (price-first design: when omitted
 * the scan still runs on OHLCV alone; when present they enrich catalyst/confidence). */
export interface EpSurprise {
  epsSurprisePositive?: boolean;
  revenueSurprisePositive?: boolean;
}

const EMPTY: EpisodicPivotResult = {
  isEp: false,
  gapPct: 0,
  relativeVolume: 0,
  closeLocation: 0,
  gapAboveResistance: false,
  catalyst: null,
  reason: 'insufficient history',
  gapScore: 0,
  confidence: 0,
};

/**
 * F2 — Episodic Pivot (earnings/news gap), price-first.
 *
 * On the latest bar requires: gap-up ≥ minGapPct vs prior close, relative
 * volume ≥ minRelativeVolume, close in the top of the day's range
 * (≥ minCloseLocationInRange), and the gap clears the prior resistance high.
 * Rejects weak close, gap fill, and low volume. Optional EPS/revenue surprise
 * raise the catalyst description and confidence but are never required.
 */
export function detectEpisodicPivot(
  bars: readonly Bar[],
  cfg: QmConfig = DEFAULT_QM_CONFIG,
  surprise?: EpSurprise,
): EpisodicPivotResult {
  const e = cfg.ep;
  const n = bars.length;
  if (n < Math.max(e.relVolumeLookback, e.resistanceLookback) + 1) return EMPTY;

  const today = bars[n - 1]!;
  const prior = bars[n - 2]!;

  const gapPct = prior.close > 0 ? pyRound(((today.open - prior.close) / prior.close) * 100, 2) : 0;

  // Relative volume: today vs the trailing average (excluding today).
  const volWindow = bars.slice(n - 1 - e.relVolumeLookback, n - 1).map((b) => b.volume);
  const avgVol = mean(volWindow);
  const relativeVolume = avgVol > 0 ? pyRound(today.volume / avgVol, 2) : 0;

  // Close location within the day's range (1 = closed at the high).
  const range = today.high - today.low;
  const closeLocation = range > 0 ? pyRound((today.close - today.low) / range, 2) : 0;

  // Gap above resistance: today's close clears the prior N-day high.
  const resWindow = bars.slice(n - 1 - e.resistanceLookback, n - 1);
  const resistance = resWindow.length ? Math.max(...resWindow.map((b) => b.high)) : Infinity;
  const gapAboveResistance = today.close > resistance;

  // Rejections.
  let reason = '';
  if (gapPct < e.minGapPct) reason = 'gap too small';
  else if (relativeVolume < e.minRelativeVolume) reason = 'low relative volume';
  else if (closeLocation < e.minCloseLocationInRange) reason = 'weak close';
  else if (e.rejectGapFill && today.close < prior.close) reason = 'gap filled';
  else if (!gapAboveResistance) reason = 'did not clear resistance';

  // Gap score 0..100 from the price-only components.
  const sGap = Math.min(gapPct / 20, 1) * 40;
  const sRvol = Math.min(relativeVolume / 5, 1) * 30;
  const sClose = Math.max(0, (closeLocation - 0.5) / 0.5) * 20;
  const sRes = gapAboveResistance ? 10 : 0;
  const gapScore = pyRound(Math.min(sGap + sRvol + sClose + sRes, 100), 1);

  // Catalyst + confidence (optional surprise boosts).
  const catalystParts: string[] = [];
  let confidence = gapScore;
  if (surprise?.epsSurprisePositive) {
    catalystParts.push('EPS surprise');
    confidence += e.epsSurpriseBoost;
  }
  if (surprise?.revenueSurprisePositive) {
    catalystParts.push('revenue surprise');
    confidence += e.revenueSurpriseBoost;
  }
  const isEp = reason === '';
  const catalyst = isEp
    ? catalystParts.length
      ? `Earnings gap + ${catalystParts.join(' & ')}`
      : 'Price/volume gap'
    : null;
  confidence = pyRound(Math.min(confidence, 100), 1);

  return {
    isEp,
    gapPct,
    relativeVolume,
    closeLocation,
    gapAboveResistance,
    catalyst,
    reason,
    gapScore,
    confidence,
  };
}
