import { describe, it, expect } from 'vitest';
import {
  detectPlaybookRegime, atrRatioOf, REGIME_MIN_BARS, ATR_EXPANDED,
} from '../../src/planning/playbookRegime.js';
import { bar, series } from '../qm/helpers.js';
import type { Bar } from '../../src/types/market.js';

/** Bars whose closes come from `f`, with a tight OHLC band so the ATR stays small. */
function closes(n: number, f: (i: number) => number): Bar[] {
  return series(n, f);
}

const N = 320; // comfortably past REGIME_MIN_BARS

describe('detectPlaybookRegime', () => {
  it('needs 210 bars before it will name a regime at all', () => {
    // WHY THIS MATTERS MORE THAN IT LOOKS: the fallback for "not enough history"
    // must not be RANGE. RANGE halves position size, so returning it here would
    // half-size every trade on a short history while the screen blames the tape.
    expect(detectPlaybookRegime(closes(REGIME_MIN_BARS - 1, (i) => 100 + i))).toBeNull();
    expect(detectPlaybookRegime([])).toBeNull();
    expect(detectPlaybookRegime(closes(REGIME_MIN_BARS, (i) => 100 + i))).not.toBeNull();
  });

  it('calls a steady advance an UPTREND and reports the numbers behind it', () => {
    const r = detectPlaybookRegime(closes(N, (i) => 100 + i * 0.5))!;
    expect(r.regime).toBe('UPTREND');
    expect(r.close).toBeGreaterThan(r.ma50);
    expect(r.ma50).toBeGreaterThan(r.ma200);
    expect(r.slope50Pct).toBeGreaterThan(0.5);
    // The read says which session it is a read OF; a regime with no date cannot be
    // recognised as stale next week.
    expect(r.asOf).toBe(closes(N, () => 1)[N - 1]!.date);
  });

  it('calls a steady decline a DOWNTREND', () => {
    const r = detectPlaybookRegime(closes(N, (i) => 400 - i * 0.5))!;
    expect(r.regime).toBe('DOWNTREND');
    expect(r.close).toBeLessThan(r.ma200);
    expect(r.slope50Pct).toBeLessThan(-0.5);
  });

  it('distinguishes UPTREND_UNDER_STRESS from DOWNTREND — the whole reason this function exists', () => {
    // A long advance, then a short drop that loses the 50MA while the 50 is still
    // rising and still above the 200. This is the state the 3-state QQQ regime cannot
    // express, and it is exactly the half-size case in the ladder.
    const bars = closes(N, (i) => (i < N - 6 ? 100 + i * 0.5 : 100 + (N - 6) * 0.5 - (i - (N - 6)) * 4));
    const r = detectPlaybookRegime(bars)!;
    expect(r.regime).toBe('UPTREND_UNDER_STRESS');
    expect(r.ma50).toBeGreaterThan(r.ma200);
    expect(r.close).toBeLessThan(r.ma50);
    expect(r.slope50Pct).toBeGreaterThan(0.5); // the advance is still in force
  });

  it('does NOT call a long-dead advance "under stress" just because price is under a flat 50MA', () => {
    // Regression: the literal reading of the rule ("50 > 200 and price < 50MA") fires
    // every day a market that topped out months ago closes a hair below a dead-flat
    // 50MA. That is chop. Naming it "uptrend under stress" tells the user to look for
    // continuation setups in a tape that has stopped producing them.
    const bars = closes(N, (i) =>
      i < 180 ? 100 + i * 0.5
        : i === N - 1 ? 189            // and today happens to close just under it
          : 190 + (i % 2 ? 0.5 : -0.5)); // months of chop around 190
    const r = detectPlaybookRegime(bars)!;
    expect(r.ma50).toBeGreaterThan(r.ma200); // the literal condition is satisfied…
    expect(r.close).toBeLessThan(r.ma50);
    expect(r.regime).toBe('RANGE');          // …and the answer is still RANGE
  });

  it('calls a flat chop a RANGE even while the 50 sits above the 200', () => {
    // Rose for a long time, then went sideways: the stack is still bullish but the
    // slope is gone. The playbook trades this differently, so the slope must guard
    // UPTREND rather than the MA stack alone.
    const bars = closes(N, (i) => (i < 200 ? 100 + i * 0.5 : 200 + Math.sin(i) * 0.4));
    const r = detectPlaybookRegime(bars)!;
    expect(r.regime).toBe('RANGE');
    expect(Math.abs(r.slope50Pct)).toBeLessThanOrEqual(0.5);
  });

  it('is a simple average, not an exponential one', () => {
    // The user compares this against TradingView's default, and at the boundary the
    // two disagree by enough to flip the classification. Pin the arithmetic.
    const bars = closes(N, (i) => 100 + i);
    const r = detectPlaybookRegime(bars)!;
    const last50 = bars.slice(-50).reduce((s, b) => s + b.close, 0) / 50;
    const last200 = bars.slice(-200).reduce((s, b) => s + b.close, 0) / 200;
    expect(r.ma50).toBeCloseTo(Math.round(last50 * 100) / 100, 2);
    expect(r.ma200).toBeCloseTo(Math.round(last200 * 100) / 100, 2);
  });

  it('returns exactly one of the four states, always', () => {
    const shapes: Bar[][] = [
      closes(N, (i) => 100 + i * 0.5),
      closes(N, (i) => 400 - i * 0.5),
      closes(N, () => 100),
      closes(N, (i) => 100 + Math.sin(i / 7) * 20),
      closes(N, (i) => (i < 160 ? 100 + i : 260 - (i - 160) * 0.8)),
    ];
    const seen = new Set(shapes.map((b) => detectPlaybookRegime(b)!.regime));
    for (const s of seen) {
      expect(['UPTREND', 'UPTREND_UNDER_STRESS', 'RANGE', 'DOWNTREND']).toContain(s);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('atrRatioOf', () => {
  it('is null — never 1 — when there is no 100-session baseline', () => {
    // A filler 1.0 would read as "normal volatility" and quietly grant full size in
    // a tape nobody has measured. Same rule as `fx` never defaulting to a rate of 1.
    expect(atrRatioOf(closes(60, (i) => 100 + i))).toBeNull();
    expect(atrRatioOf([])).toBeNull();
    const r = detectPlaybookRegime(closes(REGIME_MIN_BARS, (i) => 100 + i * 0.5))!;
    expect(r.atrRatio).not.toBe(1);
  });

  it('sits near 1 in a tape whose range has not changed', () => {
    const bars = closes(300, (i) => 100 + i * 0.1);
    const ratio = atrRatioOf(bars)!;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.2);
  });

  it('goes above the expansion threshold when the daily range blows out', () => {
    // Quiet for 250 sessions, then bars four times as wide: the same 1% of equity
    // has to buy fewer shares, which is the only thing the ladder does with this.
    const quiet = Array.from({ length: 250 }, (_, i) => bar(i, 100, { high: 100.5, low: 99.5 }));
    const wild = Array.from({ length: 30 }, (_, i) =>
      bar(250 + i, 100, { high: 106, low: 94 }));
    const ratio = atrRatioOf([...quiet, ...wild])!;
    expect(ratio).toBeGreaterThan(ATR_EXPANDED);
  });

  it('measures ATR as a PERCENT of price, so a 10:1 stock split changes nothing', () => {
    // An absolute ATR would make every high-priced index look permanently volatile.
    const big = closes(300, (i) => 1000 + i);
    const small = closes(300, (i) => (1000 + i) / 10);
    expect(atrRatioOf(big)!).toBeCloseTo(atrRatioOf(small)!, 2);
  });
});
