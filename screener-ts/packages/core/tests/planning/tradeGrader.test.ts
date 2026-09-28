import { describe, it, expect } from 'vitest';
import {
  gradeTrade,
  gradeByGroup,
  gradeByHand,
  criteriaForFamily,
  isAutoCriterion,
  GRADE_CRITERIA,
  GRADE_BARS,
  type GradeEvidence,
  type GradeAnswers,
} from '../../src/planning/tradeGrader.js';

/** Everything the app can measure, all of it passing: the textbook setup. */
const PERFECT: GradeEvidence = {
  aboveMa50: true,
  ma50AboveMa150: true,
  ma150AboveMa200: true,
  ma200Rising: true,
  pctBelow52wHigh: 4,
  relativeStrength: 94,
  contractions: 3,
  baseDepthPct: 14,
  atrContractionPct: 42,
  volumeContractionPct: 55,
  previousAdvancePct: 90,
  dollarVolume: 180_000_000,
  regime: 'UPTREND',
  rMultiple: 3,
  stopPct: 6,
};

/** Every measurable criterion failing, but still measured. */
const AWFUL: GradeEvidence = {
  aboveMa50: false,
  ma50AboveMa150: false,
  ma150AboveMa200: false,
  ma200Rising: false,
  pctBelow52wHigh: 60,
  relativeStrength: 12,
  contractions: 0,
  baseDepthPct: 48,
  atrContractionPct: 1,
  volumeContractionPct: 2,
  previousAdvancePct: 5,
  dollarVolume: 400_000,
  regime: 'DOWNTREND',
  rMultiple: 0.8,
  stopPct: 22,
};

const outcome = (ev: GradeEvidence, key: string, answers: GradeAnswers = {}) =>
  gradeTrade(ev, answers).outcomes.find((o) => o.key === key)!;

describe('the checklist itself', () => {
  it('has unique keys and positive weights', () => {
    const keys = GRADE_CRITERIA.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of GRADE_CRITERIA) expect(c.weight).toBeGreaterThan(0);
  });

  it('attributes every criterion to someone', () => {
    // The whole point of the checklist is that it is not this module's opinion. A
    // criterion with no source is an opinion wearing a weight.
    for (const c of GRADE_CRITERIA) expect(c.authority.length).toBeGreaterThan(3);
  });

  it('can answer most of itself, so a fresh card is not mostly blank', () => {
    const auto = GRADE_CRITERIA.filter((c) => c.source === 'auto');
    const autoWeight = auto.reduce((s, c) => s + c.weight, 0);
    const total = GRADE_CRITERIA.reduce((s, c) => s + c.weight, 0);
    expect(autoWeight / total).toBeGreaterThan(0.7);
  });

  it('knows which criteria it measures for itself', () => {
    expect(isAutoCriterion('rsStrong')).toBe(true);
    expect(isAutoCriterion('epsGrowth')).toBe(false);
    expect(isAutoCriterion('nonsense')).toBe(false);
  });

  it('puts the market among the heaviest things it checks', () => {
    // O'Neil's M. If the checklist scored it like a footnote it would hand out A grades
    // in a bear market, which is the single most expensive way to be right about a chart.
    const market = GRADE_CRITERIA.filter((c) => c.group === 'market')
      .reduce((s, c) => s + c.weight, 0);
    const total = GRADE_CRITERIA.reduce((s, c) => s + c.weight, 0);
    expect(market / total).toBeGreaterThan(0.08);
  });
});

describe('gradeTrade — the ends of the scale', () => {
  it('grades the textbook setup an A', () => {
    const r = gradeTrade(PERFECT);
    expect(r.grade).toBe('A');
    expect(r.score).toBe(100);
    expect(r.earned).toBe(r.possible);
  });

  it('grades the setup that fails everything a D', () => {
    const r = gradeTrade(AWFUL);
    expect(r.grade).toBe('D');
    expect(r.score).toBe(0);
    expect(r.earned).toBe(0);
    expect(r.possible).toBeGreaterThan(0);
  });

  it('walks down the letters as criteria drop away', () => {
    // Not an exhaustive ladder — just proof the thresholds are ordered and reachable,
    // so a middling setup lands in the middle instead of at one of the extremes.
    const grades = [
      gradeTrade(PERFECT).grade,
      gradeTrade({ ...PERFECT, relativeStrength: 84, volumeContractionPct: 3 }).grade,
      gradeTrade({ ...PERFECT, relativeStrength: 40, volumeContractionPct: 3, regime: 'RANGE', contractions: 1 }).grade,
      gradeTrade(AWFUL).grade,
    ];
    expect(grades).toEqual(['A', 'A', 'C', 'D']);
  });
});

describe('unknowns', () => {
  it('leaves an unanswered manual question out of BOTH sides of the fraction', () => {
    // The reason: "I have not looked at the earnings date" and "earnings land inside my
    // holding window" are different facts, and scoring them the same would make the
    // checklist punish the user for opening the card.
    const r = gradeTrade(PERFECT);
    expect(r.score).toBe(100);
    expect(r.unknownWeight).toBeGreaterThan(0);
    for (const o of r.outcomes.filter((x) => x.source === 'manual')) {
      expect(o.known).toBe(false);
      expect(o.met).toBe(false);
    }
  });

  it('distinguishes "not looked" from "looked, and no"', () => {
    const notLooked = gradeTrade(PERFECT, {});
    const lookedNo = gradeTrade(PERFECT, { earningsClear: false });
    expect(notLooked.score).toBe(100);
    expect(lookedNo.score).toBeLessThan(100);
    expect(outcome(PERFECT, 'earningsClear', { earningsClear: false }).known).toBe(true);
  });

  it('counts a ticked manual question toward the score', () => {
    const r = gradeTrade(AWFUL, { epsGrowth: true, groupLeader: true, institutional: true });
    expect(r.earned).toBe(8 + 8 + 6);
    expect(r.possible).toBeGreaterThan(r.earned);
  });

  it('shrinks unknownWeight as the user answers', () => {
    const before = gradeTrade(PERFECT).unknownWeight;
    const after = gradeTrade(PERFECT, { epsGrowth: true }).unknownWeight;
    expect(after).toBe(before - 8);
  });

  it('treats missing evidence as unmeasured, not as failure', () => {
    // A symbol the scanner never ran: no VCP numbers at all. The base criteria have to
    // go quiet rather than score zero, or every hand-typed ticker opens at a D.
    const bare: GradeEvidence = { regime: 'UPTREND', aboveMa50: true, rMultiple: 3, stopPct: 5 };
    const r = gradeTrade(bare);
    expect(r.score).toBe(100);
    expect(outcome(bare, 'contractions').known).toBe(false);
    expect(outcome(bare, 'rsStrong').known).toBe(false);
    expect(r.possible).toBe(8 + 6 + 6 + 6 + 4); // regime ×2, aboveMa50, rr, stop
  });

  it('refuses to name a letter on too little evidence', () => {
    // 30 points of a possible ~174 is not a grade, and the letter is a size multiplier —
    // a D worked out from four criteria would quarter the trade on almost nothing. So it
    // reports the score and no letter, and null means UNGRADED: full size, not smallest.
    const thin: GradeEvidence = { regime: 'UPTREND', aboveMa50: true, rMultiple: 3, stopPct: 5 };
    const r = gradeTrade(thin);
    expect(r.possible).toBeLessThan(GRADE_BARS.MIN_GRADE_WEIGHT);
    expect(r.grade).toBeNull();
    expect(r.score).toBe(100); // the score is still honest about what it saw
  });

  it('names a letter once the scan is behind it', () => {
    // The threshold has to be crossable by the evidence the app normally has, or the
    // feature never fires. Trend + strength + market + liquidity + risk does it.
    const r = gradeTrade(PERFECT);
    expect(r.possible).toBeGreaterThanOrEqual(GRADE_BARS.MIN_GRADE_WEIGHT);
    expect(r.grade).toBe('A');
  });

  it('names no letter at all when it knows literally nothing', () => {
    const r = gradeTrade({});
    expect(r.grade).toBeNull();
    expect(r.score).toBe(0);
    expect(r.possible).toBe(0);
    expect(r.unknownWeight).toBe(GRADE_CRITERIA.reduce((s, c) => s + c.weight, 0));
  });
});

describe('the automatic criteria measure what they claim to', () => {
  it('reads the moving-average stack as one ordering, not two facts', () => {
    expect(outcome(PERFECT, 'maStack').met).toBe(true);
    expect(outcome({ ...PERFECT, ma150AboveMa200: false }, 'maStack').met).toBe(false);
    // Half the ordering known is not the ordering.
    expect(outcome({ ...PERFECT, ma150AboveMa200: null }, 'maStack').known).toBe(false);
  });

  it('splits relative strength into strong and elite, so 94 beats 82', () => {
    const strong = gradeTrade({ ...PERFECT, relativeStrength: 82 });
    const elite = gradeTrade({ ...PERFECT, relativeStrength: 94 });
    expect(elite.earned).toBe(strong.earned + 8);
    expect(outcome({ ...PERFECT, relativeStrength: 82 }, 'rsElite').met).toBe(false);
    expect(outcome({ ...PERFECT, relativeStrength: 82 }, 'rsStrong').met).toBe(true);
  });

  it('gives a range market partial credit and a downtrend none', () => {
    // Graduated without stopping being a tickbox: two criteria, one of which a range
    // still passes. A single all-or-nothing market item would score a choppy tape
    // identically to a bear market.
    const g = (regime: GradeEvidence['regime']) =>
      gradeByGroup(gradeTrade({ ...PERFECT, regime })).find((x) => x.group === 'market')!;
    expect(g('UPTREND').earned).toBe(14);
    expect(g('UPTREND_UNDER_STRESS').earned).toBe(6);
    expect(g('RANGE').earned).toBe(6);
    expect(g('DOWNTREND').earned).toBe(0);
  });

  it('tests each number against the documented bar, not a hidden one', () => {
    const at = (ev: Partial<GradeEvidence>, key: string) => outcome({ ...PERFECT, ...ev }, key).met;
    expect(at({ pctBelow52wHigh: GRADE_BARS.NEAR_HIGH_PCT }, 'near52wHigh')).toBe(true);
    expect(at({ pctBelow52wHigh: GRADE_BARS.NEAR_HIGH_PCT + 0.1 }, 'near52wHigh')).toBe(false);
    expect(at({ contractions: GRADE_BARS.MIN_CONTRACTIONS }, 'contractions')).toBe(true);
    expect(at({ contractions: GRADE_BARS.MIN_CONTRACTIONS - 1 }, 'contractions')).toBe(false);
    expect(at({ baseDepthPct: GRADE_BARS.MAX_BASE_DEPTH_PCT }, 'baseTight')).toBe(true);
    expect(at({ baseDepthPct: GRADE_BARS.MAX_BASE_DEPTH_PCT + 1 }, 'baseTight')).toBe(false);
    expect(at({ previousAdvancePct: GRADE_BARS.MIN_PRIOR_ADVANCE_PCT }, 'priorAdvance')).toBe(true);
    expect(at({ dollarVolume: GRADE_BARS.MIN_DOLLAR_VOLUME }, 'liquid')).toBe(true);
    expect(at({ dollarVolume: GRADE_BARS.MIN_DOLLAR_VOLUME - 1 }, 'liquid')).toBe(false);
    expect(at({ rMultiple: GRADE_BARS.MIN_RR }, 'rrOk')).toBe(true);
    expect(at({ rMultiple: GRADE_BARS.MIN_RR - 0.01 }, 'rrOk')).toBe(false);
    expect(at({ stopPct: GRADE_BARS.MAX_STOP_PCT }, 'stopSane')).toBe(true);
    expect(at({ stopPct: GRADE_BARS.MAX_STOP_PCT + 0.5 }, 'stopSane')).toBe(false);
  });

  it('reports the measurement beside every automatic answer', () => {
    // Without the number, a red cross is an accusation the user cannot check. With it,
    // "RS 12" is an argument.
    for (const o of gradeTrade(PERFECT).outcomes) {
      // Known automatic answers carry their number; unknown ones have nothing to show,
      // and manual ones are the user's word rather than a measurement.
      if (o.source === 'auto' && o.known) expect(o.measured).toBeTruthy();
      else expect(o.measured).toBeNull();
    }
    expect(outcome(PERFECT, 'rsStrong').measured).toBe('RS 94');
    expect(outcome(PERFECT, 'contractions').measured).toBe('3');
    expect(outcome(PERFECT, 'liquid').measured).toBe('$180M/day');
    expect(outcome(PERFECT, 'regimeUptrend').measured).toBe('UPTREND');
    expect(outcome(PERFECT, 'rrOk').measured).toBe('3R');
    expect(outcome(AWFUL, 'maStack').measured).toBe('out of order');
  });

  it('ignores a zero that means "no reading" rather than "zero percent"', () => {
    // A base depth of 0, a stop of 0% and $0 of volume are all arithmetic on missing
    // data, not measurements. Scoring them would hand out free points for a blank form.
    const zeroed: GradeEvidence = {
      ...PERFECT,
      baseDepthPct: 0, stopPct: 0, dollarVolume: 0,
      atrContractionPct: 0, volumeContractionPct: 0, previousAdvancePct: 0,
    };
    for (const key of ['baseTight', 'stopSane', 'liquid', 'atrContracting', 'volumeDryUp', 'priorAdvance']) {
      expect(outcome(zeroed, key).known, key).toBe(false);
    }
  });

  it('still scores a NEGATIVE reading, which is a measurement and a failing one', () => {
    // The zero rule is about the detectors' empty result, not about bad news. An ATR that
    // expanded across the base is exactly the thing the criterion is looking for.
    const expanded = { ...PERFECT, atrContractionPct: -18 };
    expect(outcome(expanded, 'atrContracting')).toMatchObject({ known: true, met: false });
  });

  it('counts being AT the 52-week high, which is the one zero that means something', () => {
    expect(outcome({ ...PERFECT, pctBelow52wHigh: 0 }, 'near52wHigh')).toMatchObject({ known: true, met: true });
  });

  it('ignores NaN, which is what a division on an empty window produces', () => {
    const nan: GradeEvidence = { ...PERFECT, relativeStrength: NaN, previousAdvancePct: NaN };
    expect(outcome(nan, 'rsStrong').known).toBe(false);
    expect(outcome(nan, 'priorAdvance').known).toBe(false);
  });

  it('keeps a false flag distinct from an absent one', () => {
    expect(outcome({ aboveMa50: false }, 'aboveMa50')).toMatchObject({ known: true, met: false });
    expect(outcome({}, 'aboveMa50').known).toBe(false);
  });
});

describe('thresholds', () => {
  it('lets the user move the letter lines without touching the criteria', () => {
    // The criteria are quotations and stay put; how selective the user is about them is
    // their own business. A 70 is a B by default and an A for someone less fussy.
    const ev = { ...PERFECT, relativeStrength: 40, volumeContractionPct: 4 };
    expect(gradeTrade(ev).grade).toBe('B');
    expect(gradeTrade(ev, {}, { a: 65, b: 55, c: 45 }).grade).toBe('A');
    expect(gradeTrade(ev, {}, { a: 95, b: 90, c: 85 }).grade).toBe('D');
  });

  it('treats each threshold as at-or-above', () => {
    const ev = { ...PERFECT, relativeStrength: 40, volumeContractionPct: 4 };
    const score = gradeTrade(ev).score;
    expect(gradeTrade(ev, {}, { a: score, b: 1, c: 1 }).grade).toBe('A');
    expect(gradeTrade(ev, {}, { a: score + 0.1, b: 1, c: 1 }).grade).toBe('B');
  });
});

describe('gradeByGroup', () => {
  it('shows which half of the case is missing', () => {
    // Two setups can score the same and be different trades: a clean chart with no
    // market behind it, versus a messy base in a raging bull. The subtotals are the
    // only place that difference is visible.
    const noMarket = gradeByGroup(gradeTrade({ ...PERFECT, regime: 'DOWNTREND' }));
    expect(noMarket.find((g) => g.group === 'market')!.earned).toBe(0);
    expect(noMarket.find((g) => g.group === 'base')!.earned).toBe(18);

    const noBase = gradeByGroup(gradeTrade({ ...PERFECT, contractions: 0, baseDepthPct: 45, atrContractionPct: 0 }));
    expect(noBase.find((g) => g.group === 'market')!.earned).toBe(14);
    expect(noBase.find((g) => g.group === 'base')!.earned).toBe(0);
  });

  it('adds up to the totals it was built from', () => {
    const r = gradeTrade(PERFECT, { epsGrowth: true, institutional: false });
    const g = gradeByGroup(r);
    expect(g.reduce((s, x) => s + x.earned, 0)).toBe(r.earned);
    expect(g.reduce((s, x) => s + x.possible, 0)).toBe(r.possible);
    expect(g.reduce((s, x) => s + x.unknown, 0)).toBe(r.unknownWeight);
  });

  it('keeps an unmeasured group on screen, carrying its weight as unknown', () => {
    // Hiding a group the app could not measure would quietly shrink the checklist: the
    // user would see eight tidy rows and no hint that the momentum and fundamental
    // questions were never asked. So the row stays, with its points in `unknown`.
    const g = gradeByGroup(gradeTrade({ regime: 'UPTREND' }));
    expect(g.find((x) => x.group === 'market')).toMatchObject({ earned: 14, possible: 14, unknown: 0 });
    expect(g.find((x) => x.group === 'momentum')).toMatchObject({ possible: 0, unknown: 8 });
    expect(g.find((x) => x.group === 'fundamental')).toMatchObject({ possible: 0, unknown: 22 });
  });
});

describe('criteriaForFamily', () => {
  it('asks a base setup the base rows and none of the gap rows', () => {
    const keys = criteriaForFamily('base').map((c) => c.key);
    expect(keys).toContain('contractions');
    expect(keys).toContain('volumeDryUp');
    expect(keys).not.toContain('gapSize');
    expect(keys).not.toContain('catalyst');
  });

  it('asks a gap setup the gap rows and none of the base rows', () => {
    const keys = criteriaForFamily('pivot').map((c) => c.key);
    expect(keys).toContain('gapSize');
    expect(keys).not.toContain('contractions');
    expect(keys).not.toContain('volumeDryUp');
  });

  it('asks a setup with no family only the universal rows', () => {
    // Mean reversion is not a pattern this checklist's authors would grade at all, so it
    // gets the trend, strength, market, liquidity and risk questions and nothing else.
    const fam = criteriaForFamily('none');
    expect(fam.every((c) => c.scope === 'always')).toBe(true);
    expect(fam.length).toBeLessThan(GRADE_CRITERIA.length);
    expect(fam.map((c) => c.key)).toContain('rsStrong');
  });

  it('gives every criterion to one family or another', () => {
    // A criterion no family asks is dead weight in the denominator of nothing — it would
    // sit in the table looking scored and never be reachable.
    const seen = new Set([
      ...criteriaForFamily('base').map((c) => c.key),
      ...criteriaForFamily('pivot').map((c) => c.key),
    ]);
    for (const c of GRADE_CRITERIA) expect(seen.has(c.key), c.key).toBe(true);
  });
});

describe('gradeByHand', () => {
  const all = (family: 'base' | 'pivot' | 'none') => criteriaForFamily(family).map((c) => c.key);

  it('scores a fully ticked checklist as 100 and an A', () => {
    const r = gradeByHand(all('base'), 'base');
    expect(r.score).toBe(100);
    expect(r.grade).toBe('A');
    expect(r.earned).toBe(r.possible);
  });

  it('scores nothing ticked as 0 and a D — not as ungraded', () => {
    // This is the whole reason the function exists. Through `gradeTrade` an untouched
    // checklist is `unknown`, so it scores 0/0 and comes back with no letter at all. Here
    // an unticked box is an answer: the user looked and it was false.
    const r = gradeByHand([], 'base');
    expect(r.grade).toBe('D');
    expect(r.score).toBe(0);
    expect(r.earned).toBe(0);
    expect(r.possible).toBeGreaterThan(GRADE_BARS.MIN_GRADE_WEIGHT);
    expect(r.unknownWeight).toBe(0);
  });

  it('never reports anything as unknown', () => {
    const r = gradeByHand(['rsStrong'], 'pivot');
    expect(r.unknownWeight).toBe(0);
    expect(r.outcomes.every((o) => o.known)).toBe(true);
  });

  it('leaves the other family out of the denominator entirely', () => {
    // A VCP must not be marked down for having no gap day, exactly as in `gradeTrade`.
    const base = gradeByHand(all('base'), 'base');
    const pivot = gradeByHand(all('pivot'), 'pivot');
    expect(base.possible).not.toBe(GRADE_CRITERIA.reduce((s, c) => s + c.weight, 0));
    expect(base.outcomes.map((o) => o.key)).not.toContain('gapSize');
    expect(pivot.outcomes.map((o) => o.key)).not.toContain('contractions');
    expect(base.grade).toBe('A');
    expect(pivot.grade).toBe('A');
  });

  it('ignores a key that is out of scope rather than crediting it', () => {
    // Ticking `gapSize` on a VCP must not earn points for a question the setup was never
    // asked, or the score could exceed the weight the checklist actually put on the table.
    const r = gradeByHand([...all('base'), 'gapSize', 'nonsense'], 'base');
    expect(r.score).toBe(100);
    expect(r.earned).toBe(r.possible);
  });

  it('honours the user’s own A/B/C lines', () => {
    // The thresholds are the configurable half of the checklist — the user's selectivity,
    // not a quotation. A stricter user should see the same ticks score a worse letter.
    const ticks = criteriaForFamily('base').filter((c) => c.weight >= 6).map((c) => c.key);
    const s = gradeByHand(ticks, 'base').score;
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(100);

    // Thresholds straddling the actual score, so the test says what it means — the same
    // ticks, graded by two users with different standards — rather than hard-coding a
    // letter that moves whenever a weight changes.
    const loose = gradeByHand(ticks, 'base', { a: s - 1, b: s - 2, c: s - 3 });
    const strict = gradeByHand(ticks, 'base', { a: s + 3, b: s + 2, c: s + 1 });
    expect(loose.score).toBe(s);
    expect(strict.score).toBe(s);
    expect(loose.grade).toBe('A');
    expect(strict.grade).toBe('D');
  });

  it('agrees with gradeByGroup about its own totals', () => {
    const r = gradeByHand(['rsStrong', 'rsElite', 'aboveMa50'], 'base');
    const g = gradeByGroup(r);
    expect(g.reduce((s, x) => s + x.earned, 0)).toBe(r.earned);
    expect(g.reduce((s, x) => s + x.possible, 0)).toBe(r.possible);
    expect(g.find((x) => x.group === 'strength')!.earned).toBe(20);
  });
});
