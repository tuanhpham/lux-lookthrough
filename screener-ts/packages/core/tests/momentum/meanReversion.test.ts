import { describe, it, expect } from 'vitest';
import {
  detectMeanReversion,
  DEFAULT_MEAN_REVERSION_CONFIG,
} from '../../src/momentum/meanReversion.js';
import { series } from '../qm/helpers.js';
import type { Bar } from '../../src/types/market.js';

/**
 * A long uptrend followed by a sharp pullback — the shape the detector exists to
 * find. `rise` bars of steady gains, then `drop` bars falling `dropPerBar`%.
 *
 * The rise COMPOUNDS (`50 * growth^i`) rather than being a linear ramp. With a
 * straight line, EMA200 tracks close enough to price that a 12-bar drop pushes
 * price under it and every gate downstream of the trend check becomes
 * unreachable — the fixture would silently test "below EMA200" over and over.
 */
function pullbackAfterUptrend(
  rise = 300,
  drop = 12,
  dropPerBar = 0.022,
  growth = 1.006,
): Bar[] {
  const bars = series(rise, (i) => 50 * Math.pow(growth, i), () => 3_000_000);
  const last = bars[bars.length - 1]!.close;
  for (let k = 1; k <= drop; k++) {
    const close = last * Math.pow(1 - dropPerBar, k);
    bars.push({
      date: `2029-0${((k % 9) + 1)}-0${(k % 9) + 1}`,
      open: close * 1.01,
      high: close * 1.015,
      low: close * 0.995,
      close,
      volume: 3_000_000,
    });
  }
  return bars;
}

/** A pure downtrend: every gate that matters must reject this. */
function downtrend(n = 300): Bar[] {
  return series(n, (i) => 300 - 0.7 * i, () => 3_000_000);
}

/**
 * A dead-cat bounce: a long decline, then a bounce sharp enough to lift price
 * back over the (lagging) EMA200 while the line's own 20-bar slope is still
 * negative, then a short fade. The bounce has to be violent and SHORT — a slow
 * recovery drags EMA200 up with it and the fixture stops testing anything.
 */
function deadCatBounce(): Bar[] {
  const bars = series(300, (i) => 600 * Math.pow(0.9945, i), () => 3_000_000);
  let p = bars[bars.length - 1]!.close;
  const push = (o: number, h: number, l: number) =>
    bars.push({ date: '2029-01-01', open: o, high: h, low: l, close: p, volume: 3_000_000 });
  for (let k = 0; k < 12; k++) { p *= 1.07; push(p, p * 1.02, p * 0.98); }
  for (let k = 0; k < 5; k++) { p *= 0.97; push(p * 1.02, p * 1.03, p * 0.98); }
  return bars;
}

describe('detectMeanReversion — the falling-knife guard', () => {
  it('rejects a stock in a downtrend no matter how oversold it is', () => {
    // THE POINT OF THE MODULE. This series is deeply oversold on every
    // "stretched below the mean" measure — and it is a stock going to zero.
    // Oversold is not a signal; oversold INSIDE AN UPTREND is.
    const r = detectMeanReversion(downtrend());
    expect(r.aboveTrendEma).toBe(false);
    expect(r.isCandidate).toBe(false);
    expect(r.reason).toContain('below EMA200');
    // And the stretch really is there — so it was the trend gate that saved us,
    // not a lack of dislocation.
    expect(r.stretchAtr).toBeGreaterThan(DEFAULT_MEAN_REVERSION_CONFIG.minStretchAtr);
  });

  it('rejects a stock above a FALLING long-term EMA', () => {
    // Price above the line is necessary but not sufficient; the line must also be
    // rising. This is the gate that separates "pullback in an uptrend" from
    // "bounce in a bear market", and only the second gate can catch it.
    const r = detectMeanReversion(deadCatBounce());
    expect(r.aboveTrendEma).toBe(true);
    expect(r.trendEmaRising).toBe(false);
    expect(r.isCandidate).toBe(false);
    expect(r.reason).toContain('not rising');
  });

  it('flags a real pullback in an intact uptrend', () => {
    const r = detectMeanReversion(pullbackAfterUptrend());
    expect(r.aboveTrendEma).toBe(true);
    expect(r.trendEmaRising).toBe(true);
    expect(r.stretchAtr).toBeGreaterThanOrEqual(DEFAULT_MEAN_REVERSION_CONFIG.minStretchAtr);
    expect(r.rsi).toBeLessThanOrEqual(DEFAULT_MEAN_REVERSION_CONFIG.maxRsi);
    expect(r.isCandidate).toBe(true);
    expect(r.reason).toBe('');
  });

  it('rejects a drawdown deeper than the accepted band even while EMA200 still holds', () => {
    // EMA200 is slow: a 40% collapse can sit above it for weeks. Waiting for the
    // line to break is how a "dip" becomes a position that never comes back.
    // A steeper prior advance (1%/bar) keeps EMA200 far enough below price that a
    // 37% drawdown still sits above it — which is exactly the trap being tested.
    const r = detectMeanReversion(pullbackAfterUptrend(300, 18, 0.025, 1.01));
    expect(r.aboveTrendEma).toBe(true);
    expect(r.trendEmaRising).toBe(true);
    expect(r.pullbackFromHighPct).toBeGreaterThan(
      DEFAULT_MEAN_REVERSION_CONFIG.maxPullbackPct,
    );
    expect(r.isCandidate).toBe(false);
    expect(r.reason).toContain('exceeds');
  });

  it('rejects a stock that has barely pulled back', () => {
    const r = detectMeanReversion(pullbackAfterUptrend(300, 2, 0.005));
    expect(r.isCandidate).toBe(false);
    expect(r.reason).toMatch(/off the high|ATR below the mean/);
  });

  it('measures the stretch in ATRs, so it does not just screen for volatility', () => {
    // Two stocks with the SAME % drop from the same mean, one twice as volatile.
    // A percent threshold would rate them identically; in ATRs the quiet stock is
    // the genuinely dislocated one.
    const calm = pullbackAfterUptrend(300, 10, 0.018);
    const wild = calm.map((b) => ({
      ...b,
      // Same closes, doubled daily range → roughly double the ATR.
      high: b.close * 1.06,
      low: b.close * 0.94,
    }));
    const rCalm = detectMeanReversion(calm);
    const rWild = detectMeanReversion(wild);
    expect(rCalm.stretchPct).toBeCloseTo(rWild.stretchPct, 6); // identical in %
    expect(rCalm.stretchAtr).toBeGreaterThan(rWild.stretchAtr); // different in ATRs
  });

  it('rejects an illiquid name that would gap through any plan', () => {
    const thin = pullbackAfterUptrend().map((b) => ({ ...b, volume: 1_000 }));
    const r = detectMeanReversion(thin);
    expect(r.isCandidate).toBe(false);
    expect(r.reason).toContain('dollar volume');
  });

  it('bounds the trade: target is the mean, invalidation is the long-term EMA', () => {
    const r = detectMeanReversion(pullbackAfterUptrend());
    expect(r.targetPrice).toBe(r.anchor);
    expect(r.invalidationPrice).toBe(r.trendEmaValue);
    // Both sides are defined and on the right side of price.
    expect(r.targetPrice!).toBeGreaterThan(r.price);
    expect(r.invalidationPrice!).toBeLessThan(r.price);
    expect(r.upsideToTargetPct).toBeGreaterThan(0);
  });

  it('reports stabilization without requiring it', () => {
    // An up close on the final bar is one of the three stabilization signals, and
    // the setup must be findable BEFORE it appears — otherwise the section only
    // ever shows setups that already turned.
    const falling = pullbackAfterUptrend();
    const r = detectMeanReversion(falling);
    expect(typeof r.stabilizing).toBe('boolean');
    expect(r.isCandidate).toBe(true); // candidate regardless of the flag
  });

  it('refuses to guess when history is too short for the trend gate', () => {
    // Fewer bars than EMA200 + the rising lookback: there is no way to know
    // whether the long-term trend is intact, so the answer is "no", not "maybe".
    const r = detectMeanReversion(series(150, (i) => 100 - 0.2 * i));
    expect(r.isCandidate).toBe(false);
    expect(r.reason).toBe('insufficient history');
  });

  it('honours a stricter config', () => {
    const bars = pullbackAfterUptrend();
    expect(detectMeanReversion(bars).isCandidate).toBe(true);
    const strict = detectMeanReversion(bars, {
      ...DEFAULT_MEAN_REVERSION_CONFIG,
      minStretchAtr: 99,
    });
    expect(strict.isCandidate).toBe(false);
    expect(strict.reason).toContain('needs 99');
  });

  it('keeps confidence inside 0..100 for every shape', () => {
    for (const bars of [downtrend(), pullbackAfterUptrend(), pullbackAfterUptrend(300, 30, 0.02)]) {
      const c = detectMeanReversion(bars).confidence;
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(100);
    }
  });

  it('scores a passing setup above a rejected downtrend', () => {
    // Confidence must not contradict the gates: the thing that passes should not
    // look worse than the falling knife that failed.
    const good = detectMeanReversion(pullbackAfterUptrend());
    const bad = detectMeanReversion(downtrend());
    expect(good.confidence).toBeGreaterThan(bad.confidence);
  });
});
