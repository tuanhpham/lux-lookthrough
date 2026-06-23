import type { Bar, OHLCV } from '../types/market.js';
import type { MomentumResult, MomentumReturns, MomentumClassification } from './types.js';
import { DEFAULT_MOMENTUM_CONFIG, type MomentumConfig } from './config.js';
import { relativeStrength } from '../qm/relativeStrength.js';
import { DEFAULT_QM_CONFIG } from '../qm/config.js';
import { atr } from '../indicators/atr.js';
import { mean } from '../indicators/rolling.js';
import { pyRound } from '../util/round.js';

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * F1 — Momentum engine.
 *
 * Computes multi-period returns, a weighted momentum score (1M/3M/6M + RS-vs-
 * benchmark + liquidity), and — across a set of symbols — a percentile rank and
 * classification (Weak / Building / Strong / Explosive).
 *
 * Reuses `relativeStrength` (benchmark-aware multi-period return math from the
 * QM module), `atr`, `mean`, and `pyRound` — no duplicated indicator logic.
 */

/** Return over `period` bars, in %. Null when there isn't enough history. */
function periodReturnPct(bars: readonly Bar[], period: number): number | null {
  if (bars.length <= period) return null;
  const now = bars[bars.length - 1]!.close;
  const then = bars[bars.length - 1 - period]!.close;
  if (then <= 0) return null;
  return pyRound(((now - then) / then) * 100, 2);
}

/** F1 — the 1M/3M/6M/12M returns for one symbol. */
export function computeReturns(
  bars: readonly Bar[],
  cfg: MomentumConfig = DEFAULT_MOMENTUM_CONFIG,
): MomentumReturns {
  const p = cfg.periods;
  return {
    oneMonth: periodReturnPct(bars, p.oneMonth),
    threeMonth: periodReturnPct(bars, p.threeMonth),
    sixMonth: periodReturnPct(bars, p.sixMonth),
    twelveMonth: periodReturnPct(bars, p.twelveMonth),
  };
}

/**
 * F1 — weighted momentum score 0..100 for one symbol, plus the supporting
 * metrics (returns, RS, liquidity, ATR%, distance from 52w high). The
 * `percentileRank`/`classification` are placeholders here and filled by
 * {@link rankMomentum} once the whole set is known.
 */
export function computeMomentumScore(
  symbol: string,
  bars: readonly Bar[],
  benchmark?: readonly Bar[],
  cfg: MomentumConfig = DEFAULT_MOMENTUM_CONFIG,
): MomentumResult {
  const w = cfg.weights;
  const norm = cfg.normalization;
  const returns = computeReturns(bars, cfg);
  const price = bars.length ? bars[bars.length - 1]!.close : 0;

  // Relative strength vs benchmark (reuses the QM helper's period-return blend).
  const rs = relativeStrength(bars, DEFAULT_QM_CONFIG, benchmark);

  // Liquidity: recent dollar volume.
  const liqWindow = bars.slice(Math.max(0, bars.length - norm.liquidityLookback));
  const avgVolume = liqWindow.length ? mean(liqWindow.map((b) => b.volume)) : 0;
  const dollarVolume = avgVolume * price;

  // ATR as a % of price.
  const atrSeries = atr(bars, 14).filter((x) => !Number.isNaN(x));
  const currentAtr = atrSeries.length ? atrSeries[atrSeries.length - 1]! : 0;
  const atrPct = price > 0 ? pyRound((currentAtr / price) * 100, 2) : 0;

  // Distance below the 52-week high.
  const window = bars.slice(Math.max(0, bars.length - cfg.periods.twelveMonth));
  const high52 = window.length ? Math.max(...window.map((b) => b.high)) : price;
  const distanceFrom52wHighPct = high52 > 0 ? pyRound(((high52 - price) / high52) * 100, 2) : 0;

  // ── Weighted score: each component normalized to 0..1, then × its weight. ──
  const retComponent = (r: number | null): number =>
    r === null ? 0 : clamp01((r / norm.returnFullScalePct + 1) / 2);
  // Map a signed return through 0..1 with 0% → 0.5 so flat names score mid-low.

  const c1m = retComponent(returns.oneMonth);
  const c3m = retComponent(returns.threeMonth);
  const c6m = retComponent(returns.sixMonth);
  const cRs = clamp01((rs / norm.rsFullScalePct + 1) / 2);
  const cLiq = clamp01(dollarVolume / norm.liquidityFullDollarVolume);

  const momentumScore = pyRound(
    c1m * w.oneMonth +
      c3m * w.threeMonth +
      c6m * w.sixMonth +
      cRs * w.relativeStrength +
      cLiq * w.liquidity,
    1,
  );

  return {
    symbol,
    price: pyRound(price, 2),
    momentumScore,
    percentileRank: 0,
    classification: 'Weak',
    returns,
    relativeStrength: rs,
    dollarVolume: pyRound(dollarVolume, 0),
    atrPct,
    distanceFrom52wHighPct,
  };
}

/** Classify a percentile rank into a momentum bucket (F1). */
export function classifyMomentum(
  percentile: number,
  cfg: MomentumConfig = DEFAULT_MOMENTUM_CONFIG,
): MomentumClassification {
  const c = cfg.classification;
  if (percentile < c.weakBelow) return 'Weak';
  if (percentile < c.buildingBelow) return 'Building';
  if (percentile < c.strongBelow) return 'Strong';
  return 'Explosive';
}

/**
 * F1 — score every symbol in the map, then assign a percentile rank (0..100)
 * and classification across the scored set. Symbols with too little history are
 * skipped. Returned sorted by momentum score descending.
 */
export function rankMomentum(
  dataBySymbol: Map<string, OHLCV>,
  benchmark?: readonly Bar[],
  cfg: MomentumConfig = DEFAULT_MOMENTUM_CONFIG,
): MomentumResult[] {
  const scored: MomentumResult[] = [];
  for (const [symbol, ohlcv] of dataBySymbol) {
    if (!ohlcv.bars || ohlcv.bars.length < cfg.minBars) continue;
    scored.push(computeMomentumScore(symbol, ohlcv.bars, benchmark, cfg));
  }

  scored.sort((a, b) => a.momentumScore - b.momentumScore);
  const n = scored.length;
  for (let i = 0; i < n; i++) {
    // Percentile: fraction of the set scoring at or below this one.
    const percentile = n <= 1 ? 100 : pyRound((i / (n - 1)) * 100, 1);
    scored[i]!.percentileRank = percentile;
    scored[i]!.classification = classifyMomentum(percentile, cfg);
  }

  scored.sort((a, b) => b.momentumScore - a.momentumScore);
  return scored;
}
