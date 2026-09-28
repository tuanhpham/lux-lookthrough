import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETUP_RULES, DEFAULT_RISK_LADDER, SETUP_KEYS, RATING_KEYS,
  isSetupKey, isRating, ratingScale, rulesFor, closedTradePnls, riskStageOf, riskBudget,
  suggestLevels, suggestSize, openRiskOf,
  type SetupKey, type StageRead,
} from '../../src/planning/setupPlaybook.js';
import { bar } from '../qm/helpers.js';
import type { Bar } from '../../src/types/market.js';
import type { AccountState, BuyLot, SellRecord } from '../../src/types/portfolio.js';

/** Flat bars at `px` with an explicit low, so the anchor under test is unambiguous. */
function flat(n: number, px: number, low = px * 0.97): Bar[] {
  return Array.from({ length: n }, (_, i) => bar(i, px, { high: px * 1.01, low }));
}

function lot(p: Partial<BuyLot> & { id: string }): BuyLot {
  return {
    accountId: 'A', ticker: 'X', buyDate: '2026-01-01', buyPrice: 100,
    shares: 10, remainingShares: 0, ...p,
  };
}
function sell(p: Partial<SellRecord> & { id: string; lotId: string }): SellRecord {
  return {
    accountId: 'A', ticker: 'X', sellDate: '2026-02-01', sellPrice: 110,
    shares: 10, realizedPnL: 100, ...p,
  };
}
function state(lots: BuyLot[], sells: SellRecord[]): AccountState {
  return {
    account: { id: 'A' } as AccountState['account'],
    lots, sells, orders: [], snapshots: [],
  };
}

// ---------------------------------------------------------------------------
// The rule table
// ---------------------------------------------------------------------------
describe('the setup rule table', () => {
  it('has a rule for every setup the Buy form can offer', () => {
    // The form's dropdown and this table are two lists of the same thing. If the form
    // gains a setup this table does not have, `rulesFor` returns undefined fields and
    // the form silently fills nothing — which reads as "no suggestion for this setup"
    // rather than as the bug it is.
    const formValues: SetupKey[] = ['VCP', 'EP', 'Mean Reversion', 'Breakout', 'Pullback', 'Surge', 'Other'];
    expect([...SETUP_KEYS].sort()).toEqual([...formValues].sort());
    for (const k of formValues) expect(DEFAULT_SETUP_RULES[k]).toBeDefined();
  });

  it('never defaults a target below the 2R floor the playbook sets', () => {
    // "Under 2R, skip it however pretty the pattern." A default that shipped at 1.5R
    // would quietly put the user in trades their own rules reject.
    for (const k of SETUP_KEYS) {
      const r = DEFAULT_SETUP_RULES[k];
      if (r.targetKind === 'rMultiple' || r.targetKind === 'measuredMove') {
        expect(r.firstTargetR).toBeGreaterThanOrEqual(DEFAULT_RISK_LADDER.minRR);
      }
    }
  });

  it('marks which rows are the book’s own and which are extrapolation', () => {
    // EP and Surge are not in the book's exit table. Saying so is the difference
    // between a default the user should check and one they can lean on.
    expect(DEFAULT_SETUP_RULES.VCP.source).toBe('playbook');
    expect(DEFAULT_SETUP_RULES.Breakout.source).toBe('playbook');
    expect(DEFAULT_SETUP_RULES['Mean Reversion'].source).toBe('playbook');
    expect(DEFAULT_SETUP_RULES.EP.source).toBe('derived');
    expect(DEFAULT_SETUP_RULES.Surge.source).toBe('derived');
  });

  it('puts EMA10 on the TRAIL for a breakout, not on the initial stop', () => {
    // The distinction the user asked about directly. EMA10 sits far closer to price
    // than the breakout bar's low, so using it as the initial stop would inflate the
    // share count and get swept by the first normal pullback. The book's answer is
    // that EMA10 is where you LEAVE, once you are already in profit.
    expect(DEFAULT_SETUP_RULES.Breakout.trailEma).toBe(10);
    expect(DEFAULT_SETUP_RULES.Breakout.anchor).toBe('signalBarLow');
  });

  it('exits mean reversion at an EMA with no trail, and expires it', () => {
    const r = DEFAULT_SETUP_RULES['Mean Reversion'];
    expect(r.targetKind).toBe('ema');
    expect(r.targetEma).toBe(20);
    expect(r.trailEma).toBeNull();      // a snapback is not a trend; nothing to trail
    expect(r.maxHoldSessions).toBe(7);  // and if it does not snap back, the idea is wrong
  });

  it('merges overrides field by field, leaving the rest of the rule intact', () => {
    const r = rulesFor('VCP', { VCP: { firstTargetR: 4 } });
    expect(r.firstTargetR).toBe(4);
    expect(r.anchor).toBe(DEFAULT_SETUP_RULES.VCP.anchor);
    expect(r.trailEma).toBe(DEFAULT_SETUP_RULES.VCP.trailEma);
    // And overriding one setup must not touch another.
    expect(rulesFor('Pullback', { VCP: { firstTargetR: 4 } }).firstTargetR)
      .toBe(DEFAULT_SETUP_RULES.Pullback.firstTargetR);
  });

  it('does not mutate the defaults when overrides are applied', () => {
    rulesFor('VCP', { VCP: { firstTargetR: 99 } });
    expect(DEFAULT_SETUP_RULES.VCP.firstTargetR).toBe(3);
  });

  it('recognises only real setup keys', () => {
    expect(isSetupKey('VCP')).toBe(true);
    expect(isSetupKey('')).toBe(false);       // the form's "— None"
    expect(isSetupKey(undefined)).toBe(false); // a legacy lot with no setup
    expect(isSetupKey('vcp')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------
describe('suggestLevels', () => {
  it('hangs a VCP stop under the lowest low of the lookback, with padding', () => {
    const bars = [
      ...Array.from({ length: 30 }, (_, i) => bar(i, 100, { high: 101, low: 99 })),
      ...Array.from({ length: 9 }, (_, i) => bar(30 + i, 100, { high: 101, low: 95 })),
      bar(39, 100, { high: 101, low: 99 }),
    ];
    const s = suggestLevels(bars, 100, 'VCP')!;
    expect(s.anchorPrice).toBe(95);                 // lowest low of the last 10
    expect(s.stop).toBeCloseTo(95 * 0.997, 2);      // padded below it
    expect(s.stop).toBeLessThan(95);
  });

  it('pads the stop below the anchor rather than sitting exactly on it', () => {
    // A stop resting on a known low is taken out by the same wick that made the low.
    const bars = flat(40, 100, 90);
    const s = suggestLevels(bars, 100, 'Pullback')!;
    expect(s.stop).toBeLessThan(90);
  });

  it('uses the signal bar’s low for a breakout, not the entry itself', () => {
    const bars = [...flat(30, 95, 93), bar(30, 100, { high: 101, low: 96 })];
    const s = suggestLevels(bars, 100, 'Breakout')!;
    expect(s.anchorPrice).toBe(96);
    // A literal "below the pivot" would be a ~0.1% stop, i.e. a 1000-share plan on a
    // $1000 risk budget. Guard against that reading returning.
    expect(s.stopPct).toBeGreaterThan(1);
  });

  it('targets the base height for a breakout — a measured move, not a fixed R', () => {
    // 20-session range 90..110 = 20 points of height, from a 100 entry → 120.
    const bars = [
      bar(0, 100, { high: 110, low: 90 }),
      ...Array.from({ length: 18 }, (_, i) => bar(1 + i, 100, { high: 102, low: 98 })),
      bar(19, 100, { high: 101, low: 97 }),
    ];
    const s = suggestLevels(bars, 100, 'Breakout')!;
    expect(s.target).toBeCloseTo(120, 1);
    expect(s.rMultiple!).toBeGreaterThan(DEFAULT_RISK_LADDER.minRR);
  });

  it('falls back to the R multiple when the measured move is smaller than 2R', () => {
    // A base with almost no height would otherwise produce a target inside the noise.
    const bars = Array.from({ length: 25 }, (_, i) => bar(i, 100, { high: 100.2, low: 99.8 }));
    const s = suggestLevels(bars, 100, 'Breakout')!;
    expect(s.warnings).toContain('measuredMoveTooSmall');
    expect(s.rMultiple).toBeCloseTo(DEFAULT_SETUP_RULES.Breakout.firstTargetR, 2);
  });

  it('aims mean reversion at the EMA20 itself', () => {
    // Falling into the entry, so the EMA20 is above price: that IS the target.
    const bars = Array.from({ length: 60 }, (_, i) => bar(i, 140 - i * 0.5, { high: 141 - i * 0.5, low: 138 - i * 0.5 }));
    const s = suggestLevels(bars, 110, 'Mean Reversion')!;
    expect(s.target).not.toBeNull();
    expect(s.target!).toBeGreaterThan(110);
    expect(s.warnings).not.toContain('emaTargetBelowEntry');
  });

  it('says so rather than inventing a target when the EMA is not above entry', () => {
    const bars = Array.from({ length: 60 }, (_, i) => bar(i, 100 + i, { high: 101 + i, low: 98 + i }));
    const s = suggestLevels(bars, 1000, 'Mean Reversion')!;
    expect(s.target).toBeNull();
    expect(s.warnings).toContain('emaTargetBelowEntry');
    expect(s.stop).toBeLessThan(1000); // the stop is still usable
  });

  // Quiet bars (daily range ~1 point) with one deep flush to 88 inside the lookback: a
  // 12-point structural stop where the ATR guide would have said ~3.6. Shared by the two
  // tests below, which are the same trade under the two readings of the cap.
  const deepFlush = (): Bar[] => [
    ...flat(60, 100, 99.5),
    bar(60, 100, { high: 100.5, low: 88, open: 100 }),
    ...Array.from({ length: 5 }, (_, i) => bar(61 + i, 100, { high: 100.5, low: 99.5 })),
  ];

  it('WARNS about a structure stop wider than the ATR guide — and does NOT pull it in for money', () => {
    // THE RULE THAT MUST NOT BE SOFTENED. Stops are placed by structure; clamping one
    // to fit a share count is moving the stop for money reasons, which is the book's
    // first-listed way to lose money. The correct response is fewer shares. `'off'` is
    // that reading, and it stays reachable per setup.
    const s = suggestLevels(deepFlush(), 100, 'Pullback', { Pullback: { maxStopRef: 'off' } })!;
    expect(s.warnings).toContain('stopWiderThanAtr');
    expect(s.warnings).not.toContain('stopCappedByMax');
    expect(s.stop).toBeLessThan(88);                       // still under the real low
    expect(s.riskPerShare).toBeGreaterThan(s.atr! * 2);    // untouched by the ATR guide
    expect(s.maxStopPrice).toBeNull();                     // nothing was even measured
  });

  it('caps that same stop against the ATR guide, and says it did', () => {
    // The default rule now. Price is flat at its own 21 EMA, so the EMA is not below the
    // entry and cannot be a stop — the ATR guide alone is the cap, which is the case where
    // the cap bites hardest. See `maxStopRef`.
    const s = suggestLevels(deepFlush(), 100, 'Pullback')!;
    expect(s.warnings).toContain('stopCappedByMax');
    expect(s.maxStopEmaValue).toBeNull();
    expect(s.stop).toBeCloseTo(100 - s.atr! * 2, 2);
    expect(s.stop).toBeGreaterThan(88);                    // pulled up off the flush low
    expect(s.anchorPrice).toBeCloseTo(88, 2);              // but the anchor is still reported
  });

  it('takes the deeper of the EMA and the ATR guide, so the cap stays generous', () => {
    // A steady advance: the entry sits well above the 21 EMA, so both references exist.
    // 'deeper' must pick the lower of the two and leave a stop between them alone.
    const bars = Array.from({ length: 80 }, (_, i) => bar(i, 100 + i, { high: 101 + i, low: 99 + i }));
    const entry = 180;
    const deep = suggestLevels(bars, entry, 'VCP')!;
    const tight = suggestLevels(bars, entry, 'VCP', { VCP: { maxStopRef: 'shallower' } })!;
    expect(deep.maxStopEmaValue).not.toBeNull();
    expect(deep.maxStopPrice!).toBeLessThanOrEqual(tight.maxStopPrice!);
    // The same two references, read the two ways: the tighter reading can only produce a
    // stop at or above the more generous one.
    expect(tight.stop).toBeGreaterThanOrEqual(deep.stop);
  });

  it('never pushes a stop DOWN to meet the cap — the cap limits distance only', () => {
    // A tight stop the rule did not ask for: `Surge` anchors on the lowest low of 3, which
    // here is inches below the entry, while the cap sits far lower. It must stay put.
    const bars = Array.from({ length: 80 }, (_, i) => bar(i, 100 + i, { high: 101 + i, low: 99 + i }));
    const s = suggestLevels(bars, 180, 'Surge')!;
    expect(s.maxStopPrice!).toBeLessThan(s.stop);
    expect(s.warnings).not.toContain('stopCappedByMax');
  });

  it('ignores an EMA that is not below the entry rather than stopping above it', () => {
    // Falling into the entry: the 21 EMA is ABOVE price, so as a cap it would put the stop
    // over the entry. 'shallower' is the reading that would do it, so test that one.
    const bars = Array.from({ length: 60 }, (_, i) => bar(i, 200 - i, { high: 201 - i, low: 198 - i }));
    const s = suggestLevels(bars, 141, 'Mean Reversion', { 'Mean Reversion': { maxStopRef: 'shallower' } })!;
    expect(s.maxStopEmaValue).toBeNull();
    expect(s.stop).toBeLessThan(141);
  });

  it('warns when the plan comes out under 2R instead of filling it silently', () => {
    const bars = flat(40, 100, 60);
    const s = suggestLevels(bars, 100, 'Other', { Other: { firstTargetR: 1.2 } })!;
    expect(s.rMultiple!).toBeLessThan(2);
    expect(s.warnings).toContain('belowMinRR');
  });

  it('uses pure ATR for "Other", where there is no structure to speak of', () => {
    const bars = flat(40, 100, 98);
    const s = suggestLevels(bars, 100, 'Other')!;
    expect(s.anchorPrice).toBeNull();
    expect(s.stop).toBeCloseTo(100 - s.atr! * 1.5, 1);
    expect(s.warnings).not.toContain('fellBackToAtr'); // ATR is the RULE here, not a fallback
  });

  it('falls back to ATR and says so when the structural anchor is above the entry', () => {
    // Buying a gap that opened above the whole base: no low below the entry to use.
    const bars = flat(40, 200, 190);
    const s = suggestLevels(bars, 100, 'VCP')!;
    expect(s.warnings).toContain('fellBackToAtr');
    expect(s.anchorPrice).toBeNull();
    expect(s.stop).toBeLessThan(100);
  });

  it('refuses to answer rather than return a broken plan', () => {
    expect(suggestLevels([], 100, 'VCP')).toBeNull();
    expect(suggestLevels(flat(40, 100, 90), 0, 'VCP')).toBeNull();
    expect(suggestLevels(flat(40, 100, 90), -5, 'VCP')).toBeNull();
    // Too few bars for an ATR and no usable low either.
    expect(suggestLevels([bar(0, 100, { high: 101, low: 101 })], 100, 'VCP')).toBeNull();
  });

  it('always returns a stop strictly below entry and a positive risk per share', () => {
    // Everything downstream divides by riskPerShare. A zero would be an Infinity
    // share count presented as a plan.
    for (const k of SETUP_KEYS) {
      for (const bars of [flat(60, 100, 99.9), flat(60, 100, 50), flat(300, 100, 90)]) {
        const s = suggestLevels(bars, 100, k);
        if (!s) continue;
        expect(s.stop).toBeLessThan(100);
        expect(s.riskPerShare).toBeGreaterThan(0);
        expect(Number.isFinite(s.riskPerShare)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------
describe('closedTradePnls', () => {
  it('counts a scale-out as ONE trade, not two', () => {
    // Half at 2R and the rest on the trail is one decision with one outcome. Counting
    // sell ROWS would reach "50 trades" at 25 real ones, promote the size ladder a
    // stage early, and read a single scale-out as a two-trade winning streak.
    const s = state(
      [lot({ id: 'L1', remainingShares: 0 })],
      [sell({ id: 's1', lotId: 'L1', shares: 5, realizedPnL: 60, sellDate: '2026-02-01' }),
       sell({ id: 's2', lotId: 'L1', shares: 5, realizedPnL: 40, sellDate: '2026-02-10' })],
    );
    expect(closedTradePnls(s)).toEqual([100]);
  });

  it('ignores a lot that is still holding shares', () => {
    // A partial exit on an open position has no final outcome to learn from yet.
    const s = state(
      [lot({ id: 'L1', remainingShares: 5 })],
      [sell({ id: 's1', lotId: 'L1', shares: 5, realizedPnL: 60 })],
    );
    expect(closedTradePnls(s)).toEqual([]);
  });

  it('orders trades by when they CLOSED, so the streak reads the right three', () => {
    const s = state(
      [lot({ id: 'A' }), lot({ id: 'B' }), lot({ id: 'C' })],
      [sell({ id: '1', lotId: 'B', realizedPnL: -10, sellDate: '2026-03-01' }),
       sell({ id: '2', lotId: 'A', realizedPnL: 50, sellDate: '2026-01-01' }),
       sell({ id: '3', lotId: 'C', realizedPnL: -20, sellDate: '2026-05-01' })],
    );
    expect(closedTradePnls(s)).toEqual([50, -10, -20]);
  });

  it('is empty for an account that has never sold anything', () => {
    expect(closedTradePnls(state([lot({ id: 'L1', remainingShares: 10 })], []))).toEqual([]);
  });
});

describe('riskStageOf', () => {
  const wins = (n: number) => Array.from({ length: n }, () => 100);

  it('starts on the learning rung, whatever the record looks like', () => {
    expect(riskStageOf([]).stage).toBe('learning');
    expect(riskStageOf([]).basePct).toBe(0.25);
    expect(riskStageOf(wins(49)).stage).toBe('learning');
  });

  it('will not promote an account that is still losing money, however many trades', () => {
    // The trade count is not the point; the proof is. 80 trades of net losses is not
    // "proving", it is paying tuition — so it stays at the tuition rate.
    const losers = Array.from({ length: 80 }, () => -50);
    expect(riskStageOf(losers).stage).toBe('learning');
    expect(riskStageOf(Array.from({ length: 150 }, () => -50)).stage).toBe('learning');
  });

  it('reaches proving at 50 profitable trades and stable at 100', () => {
    expect(riskStageOf(wins(50)).stage).toBe('proving');
    expect(riskStageOf(wins(50)).basePct).toBe(0.5);
    expect(riskStageOf(wins(100)).stage).toBe('stable');
    expect(riskStageOf(wins(100)).basePct).toBe(1);
  });

  it('never exceeds 1% even at the top rung', () => {
    expect(riskStageOf(wins(5000)).basePct).toBeLessThanOrEqual(1);
  });

  it('counts the losing streak back from the most recent close only', () => {
    expect(riskStageOf([-1, -1, -1, 50]).losingStreak).toBe(0);
    expect(riskStageOf([50, -1, -1, -1]).losingStreak).toBe(3);
    expect(riskStageOf([-1, 50, -1, -1]).losingStreak).toBe(2);
    // Break-even is not a loss: a scratch trade must not extend a drawdown streak.
    expect(riskStageOf([-1, -1, 0]).losingStreak).toBe(0);
  });

  it('takes its thresholds from config, not from hard-coded numbers', () => {
    const cfg = { ...DEFAULT_RISK_LADDER, learningTrades: 5, stableTrades: 10, stablePct: 0.75 };
    expect(riskStageOf(wins(6), cfg).stage).toBe('proving');
    expect(riskStageOf(wins(10), cfg).basePct).toBe(0.75);
  });
});

describe('riskBudget', () => {
  const stable: StageRead = riskStageOf(Array.from({ length: 120 }, () => 100));

  it('leaves a clean uptrend at full stage size', () => {
    const b = riskBudget(stable, { regime: 'UPTREND', atrRatio: 1.0 });
    expect(b.pct).toBe(1);
    expect(b.cuts).toEqual([]);
  });

  it('refuses new longs outright in a downtrend', () => {
    // Not "smaller" — none. A 0.5% plan in a bear market is still a plan to fight it.
    const b = riskBudget(stable, { regime: 'DOWNTREND', atrRatio: 1.0 });
    expect(b.pct).toBe(0);
    expect(b.maxPositions).toBe(0);
    expect(b.cuts).toEqual(['regimeDowntrend']);
  });

  it('halves size in a range and under stress, and caps the position count', () => {
    expect(riskBudget(stable, { regime: 'RANGE', atrRatio: 1 }).pct).toBe(0.5);
    expect(riskBudget(stable, { regime: 'UPTREND_UNDER_STRESS', atrRatio: 1 }).pct).toBe(0.5);
    expect(riskBudget(stable, { regime: 'RANGE', atrRatio: 1 }).maxPositions).toBeLessThan(5);
  });

  it('halves size when volatility is expanded even in an uptrend', () => {
    const b = riskBudget(stable, { regime: 'UPTREND', atrRatio: 1.6 });
    expect(b.pct).toBe(0.5);
    expect(b.cuts).toContain('volExpanded');
  });

  it('stacks the cuts, because two bad conditions are worse than one', () => {
    const bruised = riskStageOf([...Array.from({ length: 120 }, () => 100), -1, -1, -1]);
    const b = riskBudget(bruised, { regime: 'UPTREND', atrRatio: 1.6 });
    expect(b.pct).toBe(0.25); // 1% → half for vol → half for the streak
    expect(b.cuts).toEqual(expect.arrayContaining(['volExpanded', 'losingStreak']));
    expect(b.maxPositions).toBe(2);
  });

  it('floors the stack instead of reaching zero, and says it floored', () => {
    // A plan of nought shares reads like a bug rather than a decision. The floor is a
    // number the user can see and change, not a silent rescue.
    const bruised = riskStageOf([...Array.from({ length: 10 }, () => 100), -1, -1, -1]);
    const b = riskBudget(bruised, { regime: 'RANGE', atrRatio: 1.9 });
    expect(b.pct).toBe(DEFAULT_RISK_LADDER.minRiskPct);
    expect(b.cuts).toContain('flooredAtMin');
  });

  it('does not invent a penalty for a regime it could not measure', () => {
    // A short index history means "unknown", and the app has to say so. Charging a cut
    // for missing data would look like the book asked for one.
    const b = riskBudget(stable, { regime: null, atrRatio: null });
    expect(b.pct).toBe(1);
    expect(b.cuts).toEqual([]);
  });

  it('does not treat an unmeasured ATR ratio as expanded either', () => {
    const b = riskBudget(stable, { regime: 'UPTREND', atrRatio: null });
    expect(b.pct).toBe(1);
    expect(b.cuts).not.toContain('volExpanded');
  });

  it('knows nothing about the conviction grade', () => {
    // The budget is the FULL-SIZE risk percent. The grade scales the finished share count
    // in `suggestSize`, because risk percent is only one of four limits on a position and
    // scaling it did nothing whenever another limit was the binding one.
    const b = riskBudget(stable, { regime: 'UPTREND', atrRatio: 1 });
    expect(b.pct).toBe(1);
    expect(b.cuts).not.toContain('rating');
  });

  it('stacks the cuts in the order it prints them', () => {
    const bruised = riskStageOf([...Array.from({ length: 120 }, () => 100), -1, -1, -1]);
    const b = riskBudget(bruised, { regime: 'RANGE', atrRatio: 1.6 });
    // 1% → half for the range → half for the streak. The expanded ATR charges nothing
    // here: that cut is the uptrend's, because in a range the halving for the range
    // itself has already said the same thing.
    expect(b.pct).toBe(0.25);
    expect(b.cuts).toEqual(['regimeRange', 'losingStreak']);
  });

  it('floors the LADDER’s own cuts, which is all the floor is for', () => {
    // `minRiskPct` stops the regime and the record from whittling a position to nothing
    // on the user's behalf. It deliberately does not apply to the conviction grade —
    // see the note on `riskBudget` and the `suggestSize` cases below.
    // The learning rung is 0.25%; a range halves it and three losses running halve it
    // again → 0.0625%, under the 0.1% floor.
    const bruisedLearner = riskStageOf([100, -1, -1, -1]);
    const b = riskBudget(bruisedLearner, { regime: 'RANGE', atrRatio: 1 });
    expect(b.pct).toBe(DEFAULT_RISK_LADDER.minRiskPct);
    expect(b.cuts).toEqual(['regimeRange', 'losingStreak', 'flooredAtMin']);
  });

  it('does not open a long in a downtrend', () => {
    const b = riskBudget(stable, { regime: 'DOWNTREND', atrRatio: 1 });
    expect(b.pct).toBe(0);
  });
});

describe('ratingScale', () => {
  it('reads an unset grade and an A as the same thing: full size', () => {
    // The ladder's percentages are written for the trade you actually wanted, and A is
    // the name for that trade.
    expect(ratingScale(null)).toBe(1);
    expect(ratingScale(undefined)).toBe(1);
    expect(ratingScale('A')).toBe(1);
  });

  it('turns the configured percent into a fraction', () => {
    expect(ratingScale('B')).toBeCloseTo(0.75, 6);
    expect(ratingScale('D', { ...DEFAULT_RISK_LADDER, ratingPct: { A: 100, B: 60, C: 40, D: 10 } }))
      .toBeCloseTo(0.1, 6);
  });

  it('reads nonsense as "no grade" rather than as zero', () => {
    // A negative or missing entry would otherwise come back as a share count, and a
    // plan of 0 shares has to be a decision, never a typo in a settings box.
    const bad = { ...DEFAULT_RISK_LADDER, ratingPct: { A: 100, B: -5, C: NaN, D: 25 } };
    expect(ratingScale('B', bad)).toBe(1);
    expect(ratingScale('C', bad)).toBe(1);
    expect(ratingScale('D', bad)).toBeCloseTo(0.25, 6);
  });
});

describe('isRating', () => {
  it('accepts the four letters and nothing else', () => {
    for (const k of RATING_KEYS) expect(isRating(k)).toBe(true);
    expect(isRating('')).toBe(false);
    expect(isRating('E')).toBe(false);
    expect(isRating('a')).toBe(false); // the dropdown's values are upper case
    expect(isRating(undefined)).toBe(false);
    expect(isRating(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Size
// ---------------------------------------------------------------------------
describe('suggestSize', () => {
  const stable = riskStageOf(Array.from({ length: 120 }, () => 100));
  const budget = riskBudget(stable, { regime: 'UPTREND', atrRatio: 1 });
  const base = {
    equity: 100_000, cash: 100_000, entry: 100, riskPerShare: 4,
    budget, openRisk: 0, openPositions: 0,
  };

  it('sizes by risk: (equity × risk%) ÷ risk per share', () => {
    const s = suggestSize(base);
    expect(s.shares).toBe(250);          // 1% of 100k = $1000 ÷ $4
    expect(s.riskAmount).toBeCloseTo(1000, 2);
    expect(s.limitedBy).toBe('risk');
    expect(s.riskPctOfEquity).toBeCloseTo(1, 2);
  });

  it('rounds shares DOWN, so the plan never risks more than the budget', () => {
    // entry 30 so the 25%-of-equity cap (833 sh) is not what bites here.
    const s = suggestSize({ ...base, entry: 30, riskPerShare: 3 });
    expect(s.shares).toBe(333);              // 333.33 → 333, never 334
    expect(s.limitedBy).toBe('risk');
    expect(s.riskAmount).toBeLessThanOrEqual(1000);
  });

  it('cannot buy with cash the account does not have', () => {
    const s = suggestSize({ ...base, cash: 5_000 });
    expect(s.shares).toBe(50);
    expect(s.limitedBy).toBe('cash');
  });

  it('caps one position’s notional even when the risk budget would allow more', () => {
    // A 50-cent stop on a $100 stock would otherwise buy 2000 shares — $200k of a
    // $100k account. The risk math is right and the position is still absurd.
    const s = suggestSize({ ...base, riskPerShare: 0.5 });
    expect(s.limitedBy).toBe('concentration');
    expect(s.positionValue).toBeLessThanOrEqual(25_000);
  });

  it('limits total open risk across the book, not just this trade', () => {
    // THE LIMIT NOBODY NOTICES: each trade looks correctly sized right up until the
    // fifth one has 6% of equity riding on one sector selling off together.
    const s = suggestSize({ ...base, openRisk: 3_500 }); // 3.5% already at risk of 4%
    expect(s.limitedBy).toBe('heat');
    expect(s.shares).toBe(125);                           // only $500 of room left
    expect(s.heatPctAfter).toBeCloseTo(4, 1);
  });

  it('returns nothing and says why when the book is already at the heat limit', () => {
    const s = suggestSize({ ...base, openRisk: 4_500 });
    expect(s.shares).toBe(0);
    expect(s.warnings).toContain('heatExceeded');
    expect(s.heatPctAfter).toBeCloseTo(4.5, 1);
  });

  it('plans no shares at all in a downtrend', () => {
    const dt = riskBudget(stable, { regime: 'DOWNTREND', atrRatio: 1 });
    const s = suggestSize({ ...base, budget: dt });
    expect(s.shares).toBe(0);
    expect(s.warnings).toContain('noNewLongs');
  });

  it('warns about the position count without blocking the arithmetic', () => {
    // The user may well be replacing a position they are about to close. Say it,
    // let them decide — but do not hand back a blank form.
    const s = suggestSize({ ...base, openPositions: 9 });
    expect(s.warnings).toContain('tooManyPositions');
    expect(s.shares).toBeGreaterThan(0);
  });

  it('never returns a negative or non-finite share count', () => {
    for (const bad of [
      { ...base, equity: 0 }, { ...base, entry: 0 }, { ...base, riskPerShare: 0 },
      { ...base, cash: -500 }, { ...base, openRisk: 1e9 },
      { ...base, riskPerShare: Number.NaN },
    ]) {
      const s = suggestSize(bad);
      expect(Number.isFinite(s.shares)).toBe(true);
      expect(s.shares).toBeGreaterThanOrEqual(0);
    }
  });

  it('reports which limit bound it, because the four mean different things', () => {
    // "risk" is the plan working; "cash" is a fact about the account; the other two
    // are the user's own guard rails. Collapsing them into "0 shares" loses the
    // difference between "deposit more" and "close something first".
    expect(suggestSize(base).limitedBy).toBe('risk');
    expect(suggestSize({ ...base, cash: 1_000 }).limitedBy).toBe('cash');
    expect(suggestSize({ ...base, riskPerShare: 0.5 }).limitedBy).toBe('concentration');
    expect(suggestSize({ ...base, openRisk: 3_800 }).limitedBy).toBe('heat');
  });

  // ── The conviction grade ──────────────────────────────────────────────────
  it('gives each grade its share of the full size', () => {
    expect(suggestSize({ ...base, rating: 'A' }).shares).toBe(250);
    expect(suggestSize({ ...base, rating: 'B' }).shares).toBe(187); // 250 × 0.75
    expect(suggestSize({ ...base, rating: 'C' }).shares).toBe(125);
    expect(suggestSize({ ...base, rating: 'D' }).shares).toBe(62);  // 62.5 → down
  });

  it('SCALES A SIZE SOME OTHER LIMIT DECIDED — the whole reason it lives here', () => {
    // THE REGRESSION. The grade used to scale `budget.pct`, which only moves the risk
    // limit. A 50-cent stop on a $100 stock is capped by CONCENTRATION at 250 shares, so
    // every grade produced 250 and the dropdown looked broken to the user.
    const capped = { ...base, riskPerShare: 0.5 };
    expect(suggestSize(capped).limitedBy).toBe('concentration');
    expect(suggestSize({ ...capped, rating: 'A' }).shares).toBe(250);
    expect(suggestSize({ ...capped, rating: 'C' }).shares).toBe(125);
    // Same for cash, and for heat.
    expect(suggestSize({ ...base, cash: 1_000, rating: 'C' }).shares).toBe(5); // 10 → 5
    expect(suggestSize({ ...base, openRisk: 3_800, rating: 'C' }).shares).toBe(25); // 50 → 25
  });

  it('reports the full size next to the graded one', () => {
    // So the card can print the subtraction — "full size 250 ($25,000) → 75% → 187" —
    // rather than a lone number the user cannot check.
    const b = suggestSize({ ...base, rating: 'B' });
    expect(b.fullShares).toBe(250);
    expect(b.fullPositionValue).toBeCloseTo(25_000, 2);
    expect(b.gradeScale).toBe(0.75);
    expect(b.positionValue).toBeCloseTo(18_700, 2);
    // And the risk reported is the risk actually taken, not the budget it came from.
    expect(b.riskAmount).toBeCloseTo(748, 2);        // 187 × $4
    expect(b.riskPctOfEquity).toBeCloseTo(0.748, 3);
  });

  it('treats an absent grade as full size, not as a quarter', () => {
    const blank = suggestSize({ ...base, rating: null });
    expect(blank.shares).toBe(250);
    expect(blank.shares).toBe(blank.fullShares);
    expect(blank.gradeScale).toBe(1);
  });

  it('rounds the grade DOWN, never up', () => {
    // 250 × 0.25 = 62.5. Handing back 63 would make a D bigger than the quarter the user
    // asked for, which is the one direction the rounding must not go.
    expect(suggestSize({ ...base, rating: 'D' }).shares).toBe(62);
  });

  it('never grades a tradeable position down to zero shares', () => {
    // Full size 2 shares, grade D → 0.5 → would floor to 0. "Smaller" must not become
    // "no", because that is a refusal and the grade does not get to make one.
    const thin = { ...base, equity: 1_000, cash: 1_000, riskPerShare: 4, entry: 100 };
    const full = suggestSize(thin);
    expect(full.shares).toBe(2); // $10 of budget ÷ $4
    const d = suggestSize({ ...thin, rating: 'D' });
    expect(d.shares).toBe(1);
  });

  it('still reports no trade when the FULL size is zero', () => {
    // The clamp above is not a licence to invent a position the account cannot take. A
    // downtrend, or cash for less than one share, is still nought shares with an A on it.
    const dt = riskBudget(stable, { regime: 'DOWNTREND', atrRatio: 1 });
    expect(suggestSize({ ...base, budget: dt, rating: 'A' }).shares).toBe(0);
    expect(suggestSize({ ...base, cash: 10, rating: 'A' }).shares).toBe(0);
  });

  it('is configurable, and reads nonsense as ungraded', () => {
    const cfg = { ...DEFAULT_RISK_LADDER, ratingPct: { A: 100, B: 50, C: 25, D: 10 } };
    expect(suggestSize({ ...base, rating: 'B', cfg }).shares).toBe(125);
    const nonsense = { ...DEFAULT_RISK_LADDER, ratingPct: { A: 100, B: -5, C: 50, D: 25 } };
    expect(suggestSize({ ...base, rating: 'B', cfg: nonsense }).shares).toBe(250);
  });
});

describe('openRiskOf', () => {
  it('sums (buy − stop) × remaining over open lots', () => {
    const s = state([
      lot({ id: 'A', buyPrice: 100, stop: 90, remainingShares: 10 }),  // 100
      lot({ id: 'B', buyPrice: 50, stop: 45, remainingShares: 20 }),   // 100
    ], []);
    expect(openRiskOf(s)).toBeCloseTo(200, 2);
  });

  it('counts only the shares still held, not the original size', () => {
    const s = state([lot({ id: 'A', buyPrice: 100, stop: 90, shares: 100, remainingShares: 10 })], []);
    expect(openRiskOf(s)).toBeCloseTo(100, 2);
  });

  it('contributes nothing for a lot with no stop — deliberately', () => {
    // Their real risk is the whole position, so counting it would be defensible. But
    // then a book of unstopped lots reports itself permanently over the heat limit and
    // blocks every trade, which trains the user to ignore the number. Missing stops
    // are warned about on their own, by the positions digest.
    const s = state([lot({ id: 'A', buyPrice: 100, remainingShares: 10 })], []);
    expect(openRiskOf(s)).toBe(0);
  });

  it('ignores a stop above the buy price rather than reporting negative risk', () => {
    // A stop moved up to lock in profit is not negative risk to be netted off some
    // other position's exposure.
    const s = state([
      lot({ id: 'A', buyPrice: 100, stop: 110, remainingShares: 10 }),
      lot({ id: 'B', buyPrice: 100, stop: 90, remainingShares: 10 }),
    ], []);
    expect(openRiskOf(s)).toBeCloseTo(100, 2);
  });

  it('is 0 for an empty account', () => {
    expect(openRiskOf(state([], []))).toBe(0);
  });
});
