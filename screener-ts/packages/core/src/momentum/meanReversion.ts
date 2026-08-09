import type { Bar } from '../types/market.js';
import { emaOfCloses } from '../indicators/ema.js';
import { atr } from '../indicators/atr.js';
import { rsiOfCloses } from '../indicators/rsi.js';
import { mean } from '../indicators/rolling.js';
import { pyRound } from '../util/round.js';

/**
 * Mean-reversion candidates — a stock in an intact long-term uptrend that has
 * been stretched too far BELOW its own mean, where the snap back to that mean is
 * the trade.
 *
 * The one rule this detector exists to enforce: **a stock in a downtrend is not
 * a mean-reversion candidate, it is a falling knife.** "Oversold" is trivially
 * easy to satisfy on the way to zero — RSI 25 and −4 ATR from the mean describe
 * both a healthy pullback and a collapsing business, and the only thing that
 * separates them is the state of the long-term trend. So `close > EMA200` and a
 * rising EMA200 are hard gates, not scoring inputs: no amount of oversold-ness
 * can earn a candidate flag without them.
 *
 * The stretch is measured in ATRs, not percent. A 10% drop is routine for a 6%-
 * ATR biotech and a crisis for a 1%-ATR utility; percent thresholds silently
 * screen for volatility instead of for dislocation.
 *
 * The reversion TARGET is the anchor EMA (the mean being reverted to), and the
 * invalidation is the long-term EMA — so the trade this describes is bounded on
 * both sides before it is taken.
 *
 * Reuses ema / atr / rsi / mean / pyRound — no duplicated indicator math.
 */

export interface MeanReversionConfig {
  /** The "mean" price reverts to (default EMA50). */
  anchorEma: number;
  /** Long-term trend EMA that must hold for the setup to be valid (default 200). */
  trendEma: number;
  /** Bars back used to confirm the trend EMA is rising. */
  trendEmaRisingLookback: number;
  /** Minimum distance below the anchor, in ATRs. */
  minStretchAtr: number;
  /** RSI period and the level at or below which price counts as oversold. */
  rsiPeriod: number;
  maxRsi: number;
  /** Pullback from the recent swing high must be at least this (%). */
  minPullbackPct: number;
  /**
   * …and at most this (%). Past it the uptrend thesis is gone even if EMA200
   * has not broken yet — EMA200 is slow, and waiting for it to confirm a 45%
   * drawdown is how a "dip" becomes a position that never comes back.
   */
  maxPullbackPct: number;
  /** Bars searched for the swing high the pullback is measured from. */
  highLookback: number;
  /** Bars inspected for the stabilization signal. */
  stabilizeLookback: number;
  /** Minimum recent dollar volume — thin names gap through any plan. */
  minDollarVolume: number;
  /** Bars averaged for the dollar-volume estimate. */
  volumeLookback: number;
}

export const DEFAULT_MEAN_REVERSION_CONFIG: MeanReversionConfig = {
  anchorEma: 50,
  trendEma: 200,
  trendEmaRisingLookback: 20,
  minStretchAtr: 1.5,
  rsiPeriod: 14,
  maxRsi: 40,
  minPullbackPct: 8,
  maxPullbackPct: 35,
  highLookback: 63,
  stabilizeLookback: 3,
  minDollarVolume: 10_000_000,
  volumeLookback: 50,
};

export interface MeanReversionResult {
  /** All hard gates passed — an actionable pullback in an intact uptrend. */
  isCandidate: boolean;
  /** Why it failed (empty when isCandidate). */
  reason: string;
  price: number;
  /** The mean being reverted to (anchor EMA), and the distance to it. */
  anchor: number;
  /** Distance below the anchor in ATRs (positive = below the mean). */
  stretchAtr: number;
  /** Distance below the anchor in % of price (positive = below). */
  stretchPct: number;
  rsi: number;
  /** Drawdown from the swing high in the lookback (%). */
  pullbackFromHighPct: number;
  /** Long-term trend EMA, and whether the uptrend is intact. */
  trendEmaValue: number;
  aboveTrendEma: boolean;
  trendEmaRising: boolean;
  /**
   * Early evidence the fall is being absorbed: a higher low, an up close, or a
   * close in the top third of the day's range. Reported, never required — the
   * whole point of the section is to surface setups BEFORE they turn.
   */
  stabilizing: boolean;
  /** Reversion target = the anchor EMA. */
  targetPrice: number | null;
  /** Invalidation = a close below the long-term EMA. */
  invalidationPrice: number | null;
  /** Upside to the target (%), the reward half of the trade. */
  upsideToTargetPct: number;
  /** 0..100 blended confidence. */
  confidence: number;
}

const EMPTY: MeanReversionResult = {
  isCandidate: false,
  reason: 'insufficient history',
  price: 0,
  anchor: 0,
  stretchAtr: 0,
  stretchPct: 0,
  rsi: 50,
  pullbackFromHighPct: 0,
  trendEmaValue: 0,
  aboveTrendEma: false,
  trendEmaRising: false,
  stabilizing: false,
  targetPrice: null,
  invalidationPrice: null,
  upsideToTargetPct: 0,
  confidence: 0,
};

export function detectMeanReversion(
  bars: readonly Bar[],
  cfg: MeanReversionConfig = DEFAULT_MEAN_REVERSION_CONFIG,
): MeanReversionResult {
  const n = bars.length;
  // The trend gate is the point of this detector, so a series too short to
  // establish the long-term EMA cannot be waved through — it returns "no", not
  // "probably fine". Anything less would let every freshly-listed collapse in.
  if (n < cfg.trendEma + cfg.trendEmaRisingLookback) return EMPTY;

  const price = bars[n - 1]!.close;
  const anchorArr = emaOfCloses(bars, cfg.anchorEma);
  const trendArr = emaOfCloses(bars, cfg.trendEma);
  const anchor = anchorArr[n - 1]!;
  const trendEmaValue = trendArr[n - 1]!;
  if (!Number.isFinite(anchor) || !Number.isFinite(trendEmaValue)) return EMPTY;

  const atrSeries = atr(bars, 14);
  const currentAtr = atrSeries[n - 1]!;
  const rsiSeries = rsiOfCloses(bars, cfg.rsiPeriod);
  const rsiNow = rsiSeries[n - 1]!;
  if (!Number.isFinite(currentAtr) || !Number.isFinite(rsiNow)) return EMPTY;

  // ── Stretch below the mean, in ATRs (volatility-normalised). ──
  const stretchAtr = currentAtr > 0 ? pyRound((anchor - price) / currentAtr, 2) : 0;
  const stretchPct = price > 0 ? pyRound(((anchor - price) / price) * 100, 2) : 0;

  // ── Long-term trend state — the falling-knife guard. ──
  const aboveTrendEma = price > trendEmaValue;
  const trendThen = trendArr[n - 1 - cfg.trendEmaRisingLookback]!;
  const trendEmaRising = Number.isFinite(trendThen) && trendEmaValue > trendThen;

  // ── Drawdown from the recent swing high. ──
  const window = bars.slice(Math.max(0, n - cfg.highLookback));
  const swingHigh = Math.max(...window.map((b) => b.high));
  const pullbackFromHighPct = swingHigh > 0 ? pyRound(((swingHigh - price) / swingHigh) * 100, 2) : 0;

  // ── Liquidity. ──
  const volWindow = bars.slice(Math.max(0, n - cfg.volumeLookback));
  const avgVolume = volWindow.length ? mean(volWindow.map((b) => b.volume)) : 0;
  const dollarVolume = avgVolume * price;

  // ── Stabilization: any of a higher low, an up close, or a strong close. ──
  const recent = bars.slice(Math.max(0, n - cfg.stabilizeLookback));
  const last = bars[n - 1]!;
  const prev = n >= 2 ? bars[n - 2]! : last;
  const range = last.high - last.low;
  const closeLocation = range > 0 ? (last.close - last.low) / range : 0.5;
  const lows = recent.map((b) => b.low);
  const higherLow = lows.length >= 2 && lows[lows.length - 1]! > Math.min(...lows.slice(0, -1));
  const stabilizing = higherLow || last.close > prev.close || closeLocation >= 0.66;

  // ── Trade bounds: revert to the mean, invalidate below the long-term trend. ──
  const targetPrice = pyRound(anchor, 2);
  const invalidationPrice = pyRound(trendEmaValue, 2);
  const upsideToTargetPct = price > 0 ? pyRound(((anchor - price) / price) * 100, 2) : 0;

  // ── Hard gates. Order matters only for the message the UI shows. ──
  let reason = '';
  if (!aboveTrendEma) reason = `below EMA${cfg.trendEma} — downtrend, not a pullback`;
  else if (!trendEmaRising) reason = `EMA${cfg.trendEma} not rising`;
  else if (pullbackFromHighPct > cfg.maxPullbackPct)
    reason = `drawdown ${pullbackFromHighPct}% exceeds ${cfg.maxPullbackPct}%`;
  else if (pullbackFromHighPct < cfg.minPullbackPct)
    reason = `only ${pullbackFromHighPct}% off the high`;
  else if (stretchAtr < cfg.minStretchAtr)
    reason = `${stretchAtr} ATR below the mean, needs ${cfg.minStretchAtr}`;
  else if (rsiNow > cfg.maxRsi) reason = `RSI ${pyRound(rsiNow, 1)} above ${cfg.maxRsi}`;
  else if (dollarVolume < cfg.minDollarVolume) reason = 'insufficient dollar volume';

  const isCandidate = reason === '';

  // ── Confidence 0..100: how good the dislocation is, GIVEN the gates hold. ──
  // Deliberately not a substitute for them — a failed gate scores whatever it
  // scores and still isn't a candidate.
  const cStretch = clamp01(stretchAtr / (cfg.minStretchAtr * 2)) * 30;
  const cRsi = clamp01((cfg.maxRsi - rsiNow) / cfg.maxRsi) * 25;
  // Best when the pullback sits in the lower half of the accepted band: deep
  // enough to be worth taking, shallow enough that the trend is unquestioned.
  const bandMid = (cfg.minPullbackPct + cfg.maxPullbackPct) / 2;
  const cDepth =
    clamp01(1 - Math.abs(pullbackFromHighPct - cfg.minPullbackPct) / Math.max(bandMid, 1)) * 20;
  const cTrend = (aboveTrendEma ? 1 : 0) * (trendEmaRising ? 1 : 0.5) * 15;
  const cStab = stabilizing ? 10 : 0;
  const confidence = pyRound(Math.min(cStretch + cRsi + cDepth + cTrend + cStab, 100), 1);

  return {
    isCandidate,
    reason,
    price: pyRound(price, 2),
    anchor: pyRound(anchor, 2),
    stretchAtr,
    stretchPct,
    rsi: pyRound(rsiNow, 1),
    pullbackFromHighPct,
    trendEmaValue: pyRound(trendEmaValue, 2),
    aboveTrendEma,
    trendEmaRising,
    stabilizing,
    targetPrice,
    invalidationPrice,
    upsideToTargetPct,
    confidence,
  };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
