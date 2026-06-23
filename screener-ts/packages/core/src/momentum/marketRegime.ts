import type { Bar } from '../types/market.js';
import type { MarketRegime, RegimeType } from './types.js';
import { DEFAULT_MOMENTUM_CONFIG, type MomentumConfig } from './config.js';
import { emaOfCloses } from '../indicators/ema.js';
import { pyRound } from '../util/round.js';

/**
 * F2 — Market regime filter.
 *
 * Classifies the overall market from a benchmark (SPY), optionally confirmed by
 * a second index (QQQ). Uses the same EMA-stack logic as the QM trend filter,
 * but without the single-stock liquidity gates (an index has no "dollar volume"
 * threshold to clear):
 *
 *   BULL       : price > EMA50 > EMA150 > EMA200 AND EMA200 rising
 *   BEAR       : price < EMA200
 *   TRANSITION : mixed EMA structure (anything else)
 *
 * `strengthScore` (0..100) blends the count of satisfied sub-conditions with how
 * far price sits above EMA200. `riskOn` is true only in a BULL regime.
 */
export function detectRegime(
  spyBars: readonly Bar[],
  qqqBars?: readonly Bar[],
  cfg: MomentumConfig = DEFAULT_MOMENTUM_CONFIG,
): MarketRegime {
  const r = cfg.regime;

  const empty: MarketRegime = {
    regimeType: 'TRANSITION',
    strengthScore: 0,
    riskOn: false,
    price: 0,
    ema50: 0,
    ema150: 0,
    ema200: 0,
    aboveEma200: false,
    emaStacked: false,
    ema200Rising: false,
  };
  if (spyBars.length < r.emaSlow + r.emaSlowRisingLookback) return empty;

  const last = (arr: number[]): number => arr[arr.length - 1]!;
  const ema50Arr = emaOfCloses(spyBars, r.emaFast);
  const ema150Arr = emaOfCloses(spyBars, r.emaMid);
  const ema200Arr = emaOfCloses(spyBars, r.emaSlow);

  const price = spyBars[spyBars.length - 1]!.close;
  const ema50 = last(ema50Arr);
  const ema150 = last(ema150Arr);
  const ema200 = last(ema200Arr);
  const ema200Prev = ema200Arr[ema200Arr.length - 1 - r.emaSlowRisingLookback]!;

  const aboveEma200 = price > ema200;
  const emaStacked = price > ema50 && ema50 > ema150 && ema150 > ema200;
  const ema200Rising = ema200 > ema200Prev;

  // Optional QQQ confirmation: require QQQ also above its EMA200 for a BULL.
  let qqqAboveEma200 = true;
  if (qqqBars && qqqBars.length >= r.emaSlow) {
    const qqqEma200 = emaOfCloses(qqqBars, r.emaSlow);
    qqqAboveEma200 = qqqBars[qqqBars.length - 1]!.close > last(qqqEma200);
  }

  let regimeType: RegimeType;
  if (emaStacked && ema200Rising && qqqAboveEma200) regimeType = 'BULL';
  else if (!aboveEma200) regimeType = 'BEAR';
  else regimeType = 'TRANSITION';

  // Strength: 70% from satisfied conditions, 30% from distance above EMA200.
  const conditions = [aboveEma200, emaStacked, ema200Rising, qqqAboveEma200];
  const condScore = (conditions.filter(Boolean).length / conditions.length) * 70;
  const distPct = ema200 > 0 ? ((price - ema200) / ema200) * 100 : 0;
  const distScore = Math.max(0, Math.min(distPct / 15, 1)) * 30;
  const strengthScore = pyRound(Math.max(0, Math.min(condScore + distScore, 100)), 1);

  return {
    regimeType,
    strengthScore,
    riskOn: regimeType === 'BULL',
    price: pyRound(price, 2),
    ema50: pyRound(ema50, 2),
    ema150: pyRound(ema150, 2),
    ema200: pyRound(ema200, 2),
    aboveEma200,
    emaStacked,
    ema200Rising,
  };
}
