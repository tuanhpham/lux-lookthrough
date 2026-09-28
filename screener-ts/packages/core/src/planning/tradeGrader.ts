/**
 * The conviction grade, derived from criteria instead of chosen from a dropdown.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * A–D started as a dropdown, which put the most consequential input to position size —
 * it is the last multiplier on the share count — entirely inside the user's mood. Nobody
 * grades their own idea a D at the moment they want to buy it. The way the trading
 * literature deals with this is not to ask for a verdict but for a CHECKLIST, scored
 * before the money is on the line, and every one of the writers this app is built on
 * published theirs.
 *
 * So the grade is now a score over named criteria. Ticking a box is still a judgement,
 * but it is a judgement about ONE thing the user can look up on the chart, and most of
 * the boxes the app can tick for them from the bars it already has.
 *
 * ── WHERE THE CRITERIA COME FROM ────────────────────────────────────────────
 * Every one is attributed in `authority`, and they are not this module's inventions:
 *
 *  • Mark Minervini, *Trade Like a Stock Market Wizard* — the Trend Template (the eight
 *    stage-2 conditions), and the VCP footprint: contracting pullbacks, each shallower
 *    than the last, with volume drying up into the pivot.
 *  • William O'Neil, *How to Make Money in Stocks* — CAN SLIM. The letters this module
 *    can check are S (supply/demand, read as volume), L (leader, read as relative
 *    strength) and M (market direction). C, A and I need fundamentals, so they are
 *    manual questions rather than silent omissions.
 *  • Stan Weinstein, *Secrets for Profiting in Bull and Bear Markets* — stage analysis:
 *    buy stage 2 advances only. That is what the moving-average stack is testing.
 *  • Kristjan Kullamägi (Qullamaggie) — the precondition the pattern writers assume and
 *    rarely state: a large prior advance, plus a hard liquidity floor, because a perfect
 *    base on a stock you cannot get out of is not a tradeable setup.
 *  • The app's own playbook (`setupPlaybook.ts`) — the 2R minimum and a stop close enough
 *    to the entry to be structural rather than hopeful.
 *
 * ── WHY THE AUTOMATIC ANSWERS ARE NOT TICKBOXES ─────────────────────────────
 * The criteria the app measures come back with the measurement attached and no way to
 * override them. A checkbox the user can untick when they dislike the answer reproduces
 * exactly the problem the checklist was brought in to solve — it just spreads it over
 * fifteen smaller decisions. The escape hatch is honest and at the top level instead:
 * the caller may set the grade by hand, and then the app says so.
 */

import type { PlaybookRegime } from './playbookRegime.js';
import type { ConvictionRating } from './setupPlaybook.js';

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/**
 * Groups exist for the UI, and for one substantive reason: a score of 70 assembled out
 * of trend and liquidity alone is a different trade from a 70 with a tight base and no
 * market behind it. Showing the subtotals lets the user see WHICH half is missing.
 */
export type GradeGroup =
  | 'trend'
  | 'strength'
  | 'base'
  | 'volume'
  | 'pivot'
  | 'momentum'
  | 'liquidity'
  | 'market'
  | 'risk'
  | 'fundamental';

export const GRADE_GROUPS: readonly GradeGroup[] = [
  'market', 'trend', 'strength', 'base', 'volume', 'pivot', 'momentum', 'liquidity', 'risk', 'fundamental',
];

export interface GradeCriterion {
  key: string;
  group: GradeGroup;
  /** Share of the total score. Deliberately not equal: the market is not a detail. */
  weight: number;
  /**
   * 'auto' — measured from the bars, reported with its number and not editable.
   * 'manual' — the app cannot see it, so the user answers yes/no or leaves it open.
   */
  source: 'auto' | 'manual';
  /** Who says this matters. Rendered in the UI, so the checklist teaches as it scores. */
  authority: string;
}

/**
 * What the app knows about the candidate. Every field is nullable, and null means
 * "not measured" rather than "failed".
 *
 * Deliberately FLAT primitives rather than the QM result objects. `planning` does not
 * import from `qm`: the grader has to work for a symbol the scanner never ran on, and a
 * checklist coupled to one scanner's output shape cannot be tested without building one.
 */
export interface GradeEvidence {
  // ── Trend template (Minervini) ──
  aboveMa50?: boolean | null;
  ma50AboveMa150?: boolean | null;
  ma150AboveMa200?: boolean | null;
  ma200Rising?: boolean | null;
  /** How far under the 52-week high, in percent (0 = at the high). */
  pctBelow52wHigh?: number | null;

  // ── Leadership ──
  /** Relative strength percentile, 0..100. */
  relativeStrength?: number | null;

  // ── Base quality ──
  contractions?: number | null;
  /** (baseHigh − baseLow) / baseHigh × 100. */
  baseDepthPct?: number | null;
  /** How much ATR contracted across the base, in percent. */
  atrContractionPct?: number | null;
  /** How much volume dried up across the base, in percent. */
  volumeContractionPct?: number | null;

  // ── Episodic pivot (a gap on news) ──
  // These and the base fields are alternatives, not a set: a VCP has no gap day and an
  // EP has no contracting base, so whichever family does not apply is left undefined and
  // drops out of the score. See `qmGradeEvidence`.
  /** Gap versus the prior close, in percent. */
  gapPct?: number | null;
  /** Gap-day volume as a multiple of its recent average. */
  relativeVolume?: number | null;
  /** Where the gap day closed inside its range, 0..1 (1 = on the high). */
  closeLocation?: number | null;
  gapAboveResistance?: boolean | null;
  /** Whether the gap has a named cause (earnings, guidance, news). */
  hasCatalyst?: boolean | null;

  // ── The move before the base ──
  previousAdvancePct?: number | null;

  // ── Liquidity ──
  /** Average daily dollar volume. */
  dollarVolume?: number | null;

  // ── The market ──
  regime?: PlaybookRegime | null;

  // ── This trade's own mechanics, from the plan ──
  /** Reward-to-risk of the planned stop and target. */
  rMultiple?: number | null;
  /** Stop distance as a percent of the entry. */
  stopPct?: number | null;
}

/** Answers to the questions the app cannot measure. Absent = unanswered, not "no". */
export type GradeAnswers = Partial<Record<string, boolean>>;

export interface CriterionOutcome {
  key: string;
  group: GradeGroup;
  weight: number;
  source: 'auto' | 'manual';
  authority: string;
  /**
   * False when the evidence needed is missing or the question is unanswered. Unknown
   * criteria are left out of BOTH sides of the fraction — see `gradeTrade`.
   */
  known: boolean;
  met: boolean;
  /** The measurement behind an automatic answer, for display ("RS 91", "3"). */
  measured: string | null;
}

export interface GradeResult {
  /**
   * The letter — or null when too little of the checklist could be answered to deserve
   * one. See `MIN_GRADE_WEIGHT`. Callers must treat null as UNGRADED, which in this app
   * means full size, not the smallest size.
   */
  grade: ConvictionRating | null;
  /** 0..100 — `earned / possible`, over the criteria that could be answered. */
  score: number;
  earned: number;
  possible: number;
  /** Weight of everything unanswered. The honest measure of how much is still unknown. */
  unknownWeight: number;
  outcomes: CriterionOutcome[];
}

export interface GradeThresholds {
  /** Score at or above which the trade is an A. */
  a: number;
  b: number;
  c: number;
}

export const DEFAULT_GRADE_THRESHOLDS: GradeThresholds = { a: 80, b: 65, c: 50 };

// ---------------------------------------------------------------------------
// Thresholds for the automatic criteria
// ---------------------------------------------------------------------------

/**
 * The numbers the automatic criteria are tested against.
 *
 * They live here as named constants rather than in the settings dialog on purpose: each
 * one is a quotation, and a user who moves `RS_STRONG` to 50 has not tuned the checklist,
 * they have deleted O'Neil's criterion and kept his name on it. What IS configurable is
 * where the A/B/C lines fall (`GradeThresholds`) — that is a question about the user's
 * own selectivity, which is theirs to set.
 */
export const GRADE_BARS = {
  /** O'Neil: leaders rank 80+; Minervini's template asks for 70 and prefers 80–90. */
  RS_STRONG: 80,
  RS_ELITE: 90,
  /** Minervini's template: within 25% of the 52-week high. */
  NEAR_HIGH_PCT: 25,
  /** Minervini: 2T/3T/4T — at least two contractions make it a VCP rather than a dip. */
  MIN_CONTRACTIONS: 2,
  /** A base deeper than this is a correction, not a consolidation. */
  MAX_BASE_DEPTH_PCT: 25,
  /** Some measurable tightening of range across the base. */
  MIN_ATR_CONTRACTION_PCT: 10,
  /** Volume drying up into the pivot — the footprint that separates VCP from drift. */
  MIN_VOLUME_DRYUP_PCT: 20,
  /** Qullamaggie's precondition: the base has to be resting from something. */
  MIN_PRIOR_ADVANCE_PCT: 30,
  /** Qullamaggie's EP: a gap big enough that the story changed, not just the price. */
  MIN_GAP_PCT: 10,
  /** The gap needs the crowd behind it — several times normal volume. */
  MIN_EP_RVOL: 3,
  /** Closing in the upper half of the gap day's range: buyers held it, not sellers. */
  MIN_CLOSE_LOCATION: 0.5,
  /** A liquidity floor, in average daily dollars. */
  MIN_DOLLAR_VOLUME: 20_000_000,
  /** The playbook's own rule: under 2R, skip it however pretty the pattern. */
  MIN_RR: 2,
  /** Wider than this and the stop is a hope rather than a level. */
  MAX_STOP_PCT: 10,
  /**
   * How much of the checklist has to be answerable before the score earns a letter.
   *
   * Not arbitrary caution: the letter multiplies the position size, so a D worked out from
   * three criteria would quarter a trade on almost no information. With a scan behind it
   * the trend, strength, market, liquidity and risk criteria alone clear this comfortably;
   * a hand-typed ticker with no bars and no entry does not, and then `grade` is null —
   * ungraded, which in this app means full size rather than the smallest one.
   */
  MIN_GRADE_WEIGHT: 50,
} as const;

// ---------------------------------------------------------------------------
// The checklist
// ---------------------------------------------------------------------------

/**
 * The criteria, in the order they are worth reading.
 *
 * The market comes first because it is the single heaviest item and the one traders skip:
 * O'Neil put M last in the acronym and spent the book saying it decides the outcome.
 */
export const GRADE_CRITERIA: readonly GradeCriterion[] = [
  // ── The market (CAN SLIM "M") ──
  { key: 'regimeUptrend', group: 'market', weight: 8, source: 'auto', authority: 'O’Neil (M — market direction)' },
  { key: 'regimeNotHostile', group: 'market', weight: 6, source: 'auto', authority: 'O’Neil (M); Weinstein' },

  // ── Trend template (Minervini) / stage 2 (Weinstein) ──
  { key: 'aboveMa50', group: 'trend', weight: 6, source: 'auto', authority: 'Minervini, Trend Template' },
  { key: 'maStack', group: 'trend', weight: 6, source: 'auto', authority: 'Minervini, Trend Template; Weinstein, stage 2' },
  { key: 'ma200Rising', group: 'trend', weight: 6, source: 'auto', authority: 'Minervini, Trend Template' },
  { key: 'near52wHigh', group: 'trend', weight: 6, source: 'auto', authority: 'Minervini, Trend Template' },

  // ── Leadership ──
  { key: 'rsStrong', group: 'strength', weight: 12, source: 'auto', authority: 'O’Neil (L — leader, RS 80+)' },
  { key: 'rsElite', group: 'strength', weight: 8, source: 'auto', authority: 'Minervini: the best sit 90+' },

  // ── The base (VCP footprint) ──
  { key: 'contractions', group: 'base', weight: 7, source: 'auto', authority: 'Minervini, VCP (2T/3T/4T)' },
  { key: 'baseTight', group: 'base', weight: 6, source: 'auto', authority: 'Minervini: shallow beats deep' },
  { key: 'atrContracting', group: 'base', weight: 5, source: 'auto', authority: 'Minervini, volatility contraction' },
  { key: 'noOverheadSupply', group: 'base', weight: 6, source: 'manual', authority: 'O’Neil: overhead supply' },

  // ── Demand ──
  { key: 'volumeDryUp', group: 'volume', weight: 10, source: 'auto', authority: 'O’Neil (S — supply/demand); Minervini' },

  // ── The gap, for an episodic pivot ──
  { key: 'gapSize', group: 'pivot', weight: 6, source: 'auto', authority: 'Qullamaggie, EP: a 10%+ gap' },
  { key: 'gapVolume', group: 'pivot', weight: 7, source: 'auto', authority: 'Qullamaggie, EP: volume behind the gap' },
  { key: 'closedStrong', group: 'pivot', weight: 5, source: 'auto', authority: 'Qullamaggie, EP: held the high' },
  { key: 'clearedResistance', group: 'pivot', weight: 5, source: 'auto', authority: 'O’Neil: gapped over the supply' },
  { key: 'catalyst', group: 'pivot', weight: 5, source: 'auto', authority: 'Qullamaggie, EP: a reason, not a squeeze' },

  // ── The move the base is resting from ──
  { key: 'priorAdvance', group: 'momentum', weight: 8, source: 'auto', authority: 'Qullamaggie: momentum first' },

  // ── Liquidity ──
  { key: 'liquid', group: 'liquidity', weight: 6, source: 'auto', authority: 'Qullamaggie: a hard floor' },

  // ── This trade's mechanics ──
  { key: 'rrOk', group: 'risk', weight: 6, source: 'auto', authority: 'The playbook: 2R minimum' },
  { key: 'stopSane', group: 'risk', weight: 4, source: 'auto', authority: 'The playbook: structural stop' },
  { key: 'earningsClear', group: 'risk', weight: 8, source: 'manual', authority: 'Minervini: do not hold a new position through earnings' },

  // ── The fundamentals nobody can read off a chart ──
  { key: 'epsGrowth', group: 'fundamental', weight: 8, source: 'manual', authority: 'O’Neil (C + A — current and annual earnings)' },
  { key: 'groupLeader', group: 'fundamental', weight: 8, source: 'manual', authority: 'O’Neil (L — leading industry group)' },
  { key: 'institutional', group: 'fundamental', weight: 6, source: 'manual', authority: 'O’Neil (I — institutional sponsorship)' },
];

/** Every criterion the app measures for itself, so callers can tell them apart. */
export function isAutoCriterion(key: string): boolean {
  return GRADE_CRITERIA.find((c) => c.key === key)?.source === 'auto';
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

/** An automatic answer: unknown (null) or met/unmet with the number that decided it. */
type Auto = { met: boolean; measured: string } | null;

const pct = (v: number): string => `${Math.round(v * 10) / 10}%`;

/**
 * Which numbers count as readings.
 *
 * ── WHY AN EXACT ZERO IS TREATED AS "NOT MEASURED" ──────────────────────────
 * The pattern detectors return a zero-filled result when they find nothing: a stock with
 * no base gets `baseDepthPct: 0`, `atrContractionPct: 0`, `volumeContractionPct: 0`. Read
 * as measurements those zeros grade the trade as having a terrible base, when what actually
 * happened is that no base was found — a different statement, and a harsher one. So the
 * `nonZero` fields go quiet instead, and the checklist's visible sign of that disagreement
 * is `contractions`, a COUNT, where 0 is a real and damning reading.
 *
 * Negatives still count: an ATR that expanded across the base is a measurement, and a
 * failing one. Only the exact 0 is ambiguous. `pctBelow52wHigh` is deliberately not in
 * this set — 0 there means "at the 52-week high", which is the best reading there is.
 */
function evaluateAuto(key: string, ev: GradeEvidence): Auto {
  const has = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);
  const nonZero = (v: number | null | undefined): v is number => has(v) && v !== 0;
  const flag = (v: boolean | null | undefined, yes: string, no: string): Auto =>
    v === null || v === undefined ? null : { met: v, measured: v ? yes : no };

  switch (key) {
    case 'regimeUptrend':
      return ev.regime ? { met: ev.regime === 'UPTREND', measured: ev.regime } : null;
    case 'regimeNotHostile':
      return ev.regime ? { met: ev.regime !== 'DOWNTREND', measured: ev.regime } : null;

    case 'aboveMa50':
      return flag(ev.aboveMa50, 'above', 'below');
    case 'maStack': {
      // One criterion out of two facts, because "50 above 150 above 200" is a single
      // statement about the stock — an ordering, not two independent tests.
      if (ev.ma50AboveMa150 === null || ev.ma50AboveMa150 === undefined) return null;
      if (ev.ma150AboveMa200 === null || ev.ma150AboveMa200 === undefined) return null;
      const met = ev.ma50AboveMa150 && ev.ma150AboveMa200;
      return { met, measured: met ? '50>150>200' : 'out of order' };
    }
    case 'ma200Rising':
      return flag(ev.ma200Rising, 'rising', 'flat or falling');
    case 'near52wHigh':
      return has(ev.pctBelow52wHigh)
        ? { met: ev.pctBelow52wHigh <= GRADE_BARS.NEAR_HIGH_PCT, measured: `${pct(ev.pctBelow52wHigh)} below` }
        : null;

    case 'rsStrong':
      return has(ev.relativeStrength)
        ? { met: ev.relativeStrength >= GRADE_BARS.RS_STRONG, measured: `RS ${Math.round(ev.relativeStrength)}` }
        : null;
    case 'rsElite':
      return has(ev.relativeStrength)
        ? { met: ev.relativeStrength >= GRADE_BARS.RS_ELITE, measured: `RS ${Math.round(ev.relativeStrength)}` }
        : null;

    case 'contractions':
      return has(ev.contractions)
        ? { met: ev.contractions >= GRADE_BARS.MIN_CONTRACTIONS, measured: `${ev.contractions}` }
        : null;
    case 'baseTight':
      return nonZero(ev.baseDepthPct)
        ? { met: ev.baseDepthPct <= GRADE_BARS.MAX_BASE_DEPTH_PCT, measured: pct(ev.baseDepthPct) }
        : null;
    case 'atrContracting':
      return nonZero(ev.atrContractionPct)
        ? { met: ev.atrContractionPct >= GRADE_BARS.MIN_ATR_CONTRACTION_PCT, measured: pct(ev.atrContractionPct) }
        : null;

    case 'volumeDryUp':
      return nonZero(ev.volumeContractionPct)
        ? { met: ev.volumeContractionPct >= GRADE_BARS.MIN_VOLUME_DRYUP_PCT, measured: pct(ev.volumeContractionPct) }
        : null;

    case 'gapSize':
      return nonZero(ev.gapPct)
        ? { met: ev.gapPct >= GRADE_BARS.MIN_GAP_PCT, measured: pct(ev.gapPct) }
        : null;
    case 'gapVolume':
      return nonZero(ev.relativeVolume)
        ? {
          met: ev.relativeVolume >= GRADE_BARS.MIN_EP_RVOL,
          measured: `${Math.round(ev.relativeVolume * 10) / 10}× vol`,
        }
        : null;
    case 'closedStrong':
      return nonZero(ev.closeLocation)
        ? {
          met: ev.closeLocation >= GRADE_BARS.MIN_CLOSE_LOCATION,
          measured: `${Math.round(ev.closeLocation * 100)}% of range`,
        }
        : null;
    case 'clearedResistance':
      return flag(ev.gapAboveResistance, 'cleared', 'still under it');
    case 'catalyst':
      return flag(ev.hasCatalyst, 'named', 'none found');

    case 'priorAdvance':
      return nonZero(ev.previousAdvancePct)
        ? { met: ev.previousAdvancePct >= GRADE_BARS.MIN_PRIOR_ADVANCE_PCT, measured: pct(ev.previousAdvancePct) }
        : null;

    case 'liquid':
      return nonZero(ev.dollarVolume)
        ? {
          met: ev.dollarVolume >= GRADE_BARS.MIN_DOLLAR_VOLUME,
          measured: `$${Math.round(ev.dollarVolume / 1_000_000)}M/day`,
        }
        : null;

    case 'rrOk':
      return has(ev.rMultiple)
        ? { met: ev.rMultiple >= GRADE_BARS.MIN_RR, measured: `${Math.round(ev.rMultiple * 10) / 10}R` }
        : null;
    case 'stopSane':
      return nonZero(ev.stopPct)
        ? { met: ev.stopPct <= GRADE_BARS.MAX_STOP_PCT, measured: pct(ev.stopPct) }
        : null;

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Score the checklist and turn the score into a letter.
 *
 * ── WHY UNKNOWNS LEAVE THE FRACTION ENTIRELY ────────────────────────────────
 * An unanswered question is not a failed one. Counting the five manual criteria as zero
 * until they are ticked would open every card at a D and teach the user that the
 * checklist is an obstacle — and worse, it would make "I have not looked yet" and "I
 * looked and it is bad" produce the same grade. So the denominator is what could be
 * answered, `unknownWeight` says how much that leaves out, and the UI can show it.
 *
 * The cost of that choice is real and worth stating: a card with only the automatic
 * criteria known can read A on well under half the checklist's total weight. It is an A
 * *on the evidence the app has*, which is why `unknownWeight` is in the result rather
 * than an internal — the UI is expected to show it next to the letter.
 *
 * It is also what lets the base and the pivot criteria coexist. A VCP has no gap day and
 * an episodic pivot has no contracting base; scoring both families would mark every trade
 * down for not being the other kind of trade. Each setup answers its own family and leaves
 * the other undefined.
 */
export function gradeTrade(
  ev: GradeEvidence,
  answers: GradeAnswers = {},
  thresholds: GradeThresholds = DEFAULT_GRADE_THRESHOLDS,
): GradeResult {
  const outcomes: CriterionOutcome[] = [];
  let earned = 0;
  let possible = 0;
  let unknownWeight = 0;

  for (const c of GRADE_CRITERIA) {
    let known = false;
    let met = false;
    let measured: string | null = null;

    if (c.source === 'auto') {
      const a = evaluateAuto(c.key, ev);
      if (a) { known = true; met = a.met; measured = a.measured; }
    } else {
      const ans = answers[c.key];
      if (ans !== undefined) { known = true; met = ans; }
    }

    if (known) {
      possible += c.weight;
      if (met) earned += c.weight;
    } else {
      unknownWeight += c.weight;
    }
    outcomes.push({ ...c, known, met, measured });
  }

  // Too little to go on. A score of 0/0 would read as "every criterion failed", and any
  // letter at all would put a size multiplier on almost no information — so the answer is
  // no letter, which the app already understands as full size.
  if (possible < GRADE_BARS.MIN_GRADE_WEIGHT) {
    const score = possible > 0 ? Math.round((earned / possible) * 1000) / 10 : 0;
    return { grade: null, score, earned, possible, unknownWeight, outcomes };
  }

  const score = Math.round((earned / possible) * 1000) / 10;
  const grade: ConvictionRating = score >= thresholds.a ? 'A'
    : score >= thresholds.b ? 'B'
      : score >= thresholds.c ? 'C'
        : 'D';

  return { grade, score, earned, possible, unknownWeight, outcomes };
}

/**
 * Per-group subtotals, for the UI's "which half is missing" view.
 *
 * A group with unanswered criteria is kept, with its weight under `unknown`: hiding it
 * would quietly shrink the checklist on screen, so the user would see tidy rows and no
 * sign that the fundamental questions were never asked. The filter only drops a group
 * that has no criteria at all — a guard for anything added to `GRADE_GROUPS` alone.
 */
export function gradeByGroup(
  res: GradeResult,
): { group: GradeGroup; earned: number; possible: number; unknown: number }[] {
  return GRADE_GROUPS.map((group) => {
    const inGroup = res.outcomes.filter((o) => o.group === group);
    return {
      group,
      earned: inGroup.filter((o) => o.known && o.met).reduce((s, o) => s + o.weight, 0),
      possible: inGroup.filter((o) => o.known).reduce((s, o) => s + o.weight, 0),
      unknown: inGroup.filter((o) => !o.known).reduce((s, o) => s + o.weight, 0),
    };
  }).filter((g) => g.possible > 0 || g.unknown > 0);
}
