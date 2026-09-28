/**
 * The swing playbook as numbers a program can use.
 *
 * ── WHY THIS IS IN CORE AND NOT IN THE BUY FORM ─────────────────────────────
 * Two places have to answer "where does the stop go and how many shares": the Buy
 * form, and the Trade Planner on the Watchlist tab (via `buildTradePlan`). If each
 * carried its own copy of the rules, the planner would suggest a 3R target while the
 * form filled in 2R for the same setup, and the user would have no way to tell which
 * one was the rule. Same reason `fx.ts` was lifted out of `portfolioTab.ts`.
 *
 * ── WHY THE DEFAULTS ARE OVERRIDABLE, AND WHY THEY STILL HAVE TO BE GOOD ────
 * The playbook says it plainly: every specific number in it — the 21 EMA, 2R, 1.5x
 * volume — is "a reasonable starting point for you to verify, not a sacred constant".
 * So `SetupRuleOverrides` exists by design. But a default that is merely *present*
 * gets used as-is for months, so each one below is the playbook's own number where
 * the playbook has one, and `source: 'derived'` where it does not.
 *
 * ── WHY NOTHING HERE RETURNS A SENTENCE ─────────────────────────────────────
 * `warnings` and `why` are codes, not prose. The app is bilingual and the same
 * finding is worded differently in the Buy form ("stop cách 9.2% — quá xa") than in
 * the planner table. Core hands over the code and the numbers; `i18n.ts` owns copy.
 *
 * ── THE ONE RULE THAT MUST NOT BE SOFTENED ──────────────────────────────────
 * A stop is placed by structure, never by the money at risk: "the market does not
 * know what you can stomach". So when the structural stop comes out wider than the
 * ATR guide, this module does NOT pull it in — it widens the stop and shrinks the
 * share count, and warns. Clamping the stop to fit a share count is the single
 * mistake the playbook ranks first among its ways to lose money.
 */
import { atr } from '../indicators/atr.js';
import { emaOfCloses } from '../indicators/ema.js';
import type { Bar } from '../types/market.js';
import type { AccountState } from '../types/portfolio.js';
import { pyRound } from '../util/round.js';
import { ATR_EXPANDED, type PlaybookRegime } from './playbookRegime.js';

// ---------------------------------------------------------------------------
// Per-setup rules
// ---------------------------------------------------------------------------

/** The setup values the Buy form's dropdown offers (`SETUP_TYPES` in portfolioTab). */
export type SetupKey = 'VCP' | 'EP' | 'Mean Reversion' | 'Breakout' | 'Pullback' | 'Surge' | 'Other';

export const SETUP_KEYS: readonly SetupKey[] = [
  'VCP', 'EP', 'Mean Reversion', 'Breakout', 'Pullback', 'Surge', 'Other',
];

/**
 * Where the initial stop is anchored.
 *
 * Deliberately only three, though the playbook names five different lows ("below the
 * pullback low", "below the last contraction", "below the signal bar"…). All but one
 * of those reduce to *the lowest low over some number of sessions*; what changes is
 * how many sessions and what the trader calls it. Encoding five anchor kinds that
 * compute the same thing would be five code paths with one behaviour and five chances
 * to drift. `lookback` carries the meaning, and `SetupRule.means` names it.
 */
export type StopAnchor =
  /** Low of the most recent bar — the bar that both triggered the trade and defines "wrong". */
  | 'signalBarLow'
  /** Lowest low of the last `lookback` sessions. */
  | 'lowestLowN'
  /** No structure: `entry − atrMult × ATR(14)`. The fallback, and `Other`'s rule. */
  | 'atr';

export type TargetKind =
  /** `entry + firstTargetR × risk`. */
  | 'rMultiple'
  /** `entry + (highest high − lowest low over lookback)` — the base's own height. */
  | 'measuredMove'
  /** Exit all of it at an EMA rather than at an R multiple (mean reversion). */
  | 'ema';

export interface SetupRule {
  anchor: StopAnchor;
  /** Sessions the anchor and the measured move look back over. Unused by `signalBarLow`/`atr`. */
  lookback: number;
  /** Extra room below the anchor low, as a percent of it. Stops sitting exactly on a
   * known low get swept by the wick that made it. */
  padPct: number;
  /** ATR(14) multiple: the stop when `anchor === 'atr'`, and the "is this stop unusually
   * wide?" yardstick for every other anchor. */
  atrMult: number;
  targetKind: TargetKind;
  /** First partial exit in R. Half the position, per the playbook. */
  firstTargetR: number;
  /** EMA the exit is taken at when `targetKind === 'ema'`. */
  targetEma: number | null;
  /** EMA the runner is trailed against, or null for "no trail" (mean reversion). */
  trailEma: number | null;
  /** Sessions after which the thesis has expired regardless of price, or null. */
  maxHoldSessions: number | null;
  /** What a trader calls this anchor — the app turns it into the "why" line. */
  means: 'pullbackLow' | 'contractionLow' | 'breakoutBarLow' | 'signalBarLow' | 'gapBarLow' | 'recentLow' | 'atrOnly';
  /**
   * `'playbook'` = this row's numbers are in the book's own exit table.
   * `'derived'`  = the book has no row for this setup and these are an extrapolation
   *                from its principles. Worth reviewing before trusting.
   */
  source: 'playbook' | 'derived';
}

/**
 * The book's exit table, plus two rows it does not cover.
 *
 * ⚠️ ONE READING TO BE AWARE OF. The book's stop for a breakout is "below the pivot",
 * and the pivot is also the entry (`entry = pivot × 1.001` in `calculateTradeLevels`).
 * Read literally that is a stop a tenth of a percent away, which no one means. The
 * practical reading — and the one here — is the low of the bar that broke out: the
 * same principle the book states outright for signal bars, that the bar defining the
 * entry also defines where the idea is wrong.
 */
export const DEFAULT_SETUP_RULES: Readonly<Record<SetupKey, SetupRule>> = {
  VCP: {
    anchor: 'lowestLowN', lookback: 10, padPct: 0.3, atrMult: 2,
    targetKind: 'rMultiple', firstTargetR: 3, targetEma: null,
    trailEma: 10, maxHoldSessions: null, means: 'contractionLow', source: 'playbook',
  },
  Breakout: {
    anchor: 'signalBarLow', lookback: 20, padPct: 0.3, atrMult: 2,
    targetKind: 'measuredMove', firstTargetR: 2, targetEma: null,
    trailEma: 10, maxHoldSessions: null, means: 'breakoutBarLow', source: 'playbook',
  },
  Pullback: {
    anchor: 'lowestLowN', lookback: 10, padPct: 0.3, atrMult: 2,
    targetKind: 'rMultiple', firstTargetR: 2, targetEma: null,
    trailEma: 21, maxHoldSessions: null, means: 'pullbackLow', source: 'playbook',
  },
  'Mean Reversion': {
    anchor: 'signalBarLow', lookback: 5, padPct: 0.3, atrMult: 2,
    targetKind: 'ema', firstTargetR: 2, targetEma: 20,
    trailEma: null, maxHoldSessions: 7, means: 'signalBarLow', source: 'playbook',
  },
  EP: {
    anchor: 'signalBarLow', lookback: 5, padPct: 0.3, atrMult: 2,
    targetKind: 'rMultiple', firstTargetR: 2, targetEma: null,
    trailEma: 10, maxHoldSessions: null, means: 'gapBarLow', source: 'derived',
  },
  Surge: {
    anchor: 'lowestLowN', lookback: 3, padPct: 0.3, atrMult: 2,
    targetKind: 'rMultiple', firstTargetR: 2, targetEma: null,
    trailEma: 10, maxHoldSessions: null, means: 'recentLow', source: 'derived',
  },
  Other: {
    anchor: 'atr', lookback: 10, padPct: 0, atrMult: 1.5,
    targetKind: 'rMultiple', firstTargetR: 2, targetEma: null,
    trailEma: null, maxHoldSessions: null, means: 'atrOnly', source: 'derived',
  },
};

export type SetupRuleOverrides = Partial<Record<SetupKey, Partial<SetupRule>>>;

/** Is `v` one of the setups this module has a rule for? */
export function isSetupKey(v: string | undefined): v is SetupKey {
  return v !== undefined && (SETUP_KEYS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Conviction grade
// ---------------------------------------------------------------------------

/**
 * The A–D grade already carried on every buy lot (`Lot.rating`), read here as a
 * statement about size.
 *
 * The grade is how the trader says "this one is the real thing" versus "this one I am
 * taking because I am bored". The playbook has no table for it, so the ladder below is
 * the app's, not the book's — which is exactly why it is editable.
 *
 * It stays OPTIONAL everywhere. An ungraded trade is planned at full size rather than
 * refused: grading is a discipline the user is invited into, not a gate, and a blank
 * dropdown that silently quartered the position would teach the wrong lesson.
 */
export type ConvictionRating = 'A' | 'B' | 'C' | 'D';

export const RATING_KEYS: readonly ConvictionRating[] = ['A', 'B', 'C', 'D'];

export function isRating(v: string | undefined | null): v is ConvictionRating {
  return v !== undefined && v !== null && (RATING_KEYS as readonly string[]).includes(v);
}

/**
 * The grade's share of the full risk budget, as a fraction of 1.
 *
 * `null`/unset and `A` both mean 1: the ladder's percentages are written for the trade
 * you actually wanted, and A is the name for that trade.
 */
export function ratingScale(
  rating: ConvictionRating | null | undefined,
  cfg: RiskLadderConfig = DEFAULT_RISK_LADDER,
): number {
  if (!rating) return 1;
  const pct = cfg.ratingPct[rating];
  // A negative or absent entry would come back as a share count, so treat nonsense as
  // "no grade" rather than as zero — a plan of 0 shares must be a decision, never a typo.
  if (!Number.isFinite(pct) || pct < 0) return 1;
  return pct / 100;
}

export function rulesFor(setup: SetupKey, overrides?: SetupRuleOverrides): SetupRule {
  return { ...DEFAULT_SETUP_RULES[setup], ...(overrides?.[setup] ?? {}) };
}

// ---------------------------------------------------------------------------
// The risk ladder
// ---------------------------------------------------------------------------

export interface RiskLadderConfig {
  /** Risk per trade while the edge is unproven. The book's word for it is tuition. */
  learningPct: number;
  provingPct: number;
  /** The ceiling. The book: "there is no good reason to exceed it." */
  stablePct: number;
  /** Closed trades before `learning` can end. */
  learningTrades: number;
  /** Closed trades before `stable` can begin. */
  stableTrades: number;
  /** Max concurrent open positions per stage, in ladder order. */
  maxPositions: { learning: number; proving: number; stable: number };
  /** Total open risk across all positions, as a % of equity. */
  maxPortfolioHeatPct: number;
  /** Cap on one position's notional, as a % of equity. */
  maxPositionPct: number;
  /** Below this R multiple the book says skip the trade however pretty the pattern. */
  minRR: number;
  /** Consecutive losses that halve the size, and how long the cut lasts. */
  losingStreakTrigger: number;
  /**
   * Share of the full risk budget each conviction grade gets, in percent.
   *
   * A is 100 because A *means* "the size the ladder is written for"; the other three
   * are the app's numbers, not the book's. Kept as one record rather than four flat
   * fields so the four always move together — see the note in `playbookSettings.ts`
   * about why a partially-stored record would be a trap.
   */
  ratingPct: Record<ConvictionRating, number>;
  /**
   * A floor, so two stacked halvings cannot round the plan down to nothing.
   * The book stacks its cuts without saying where they stop; this is the app's
   * answer, and it is a number the user can see and change.
   */
  minRiskPct: number;
}

export const DEFAULT_RISK_LADDER: RiskLadderConfig = {
  learningPct: 0.25,
  provingPct: 0.5,
  stablePct: 1.0,
  learningTrades: 50,
  stableTrades: 100,
  maxPositions: { learning: 3, proving: 4, stable: 5 },
  maxPortfolioHeatPct: 4,
  maxPositionPct: 25,
  minRR: 2,
  losingStreakTrigger: 3,
  ratingPct: { A: 100, B: 75, C: 50, D: 25 },
  minRiskPct: 0.1,
};

export type RiskStage = 'learning' | 'proving' | 'stable';

export interface StageRead {
  stage: RiskStage;
  /** Risk per trade before any regime or streak cut, in percent of equity. */
  basePct: number;
  maxPositions: number;
  closedTrades: number;
  /** Mean realized P&L per closed trade, in account currency. */
  expectancy: number;
  /** How many of the most recent closed trades were losses, counting back. */
  losingStreak: number;
}

/**
 * Realized P&L per CLOSED POSITION, oldest first.
 *
 * Grouped by lot rather than taken from `sells` directly, because the playbook counts
 * trades and the app sells in pieces: taking half at 2R and the rest on the trail is
 * one trade, but two `SellRecord`s. Counting rows would reach "50 trades" at 25 real
 * ones, promote the size ladder a stage early, and read a scale-out as a two-trade
 * winning streak. A lot still holding shares is not counted at all — an open trade
 * has no realized outcome to learn from.
 */
export function closedTradePnls(state: AccountState): number[] {
  const openLots = new Set(state.lots.filter((l) => l.remainingShares > 0).map((l) => l.id));
  const byLot = new Map<string, { last: string; pnl: number }>();
  for (const s of state.sells) {
    if (openLots.has(s.lotId)) continue;
    const cur = byLot.get(s.lotId);
    if (cur) {
      cur.pnl += s.realizedPnL;
      if (s.sellDate > cur.last) cur.last = s.sellDate;
    } else {
      byLot.set(s.lotId, { last: s.sellDate, pnl: s.realizedPnL });
    }
  }
  return [...byLot.values()]
    .sort((a, b) => (a.last < b.last ? -1 : a.last > b.last ? 1 : 0))
    .map((t) => pyRound(t.pnl, 2));
}

/**
 * Which rung of the ladder the account is on.
 *
 * A positive expectancy is required to leave `learning` even past the trade count:
 * the count is not the point, the proof is. An account 80 trades in and still losing
 * money is not "proving", it is paying tuition — at the cheap rate.
 */
export function riskStageOf(
  pnls: readonly number[],
  cfg: RiskLadderConfig = DEFAULT_RISK_LADDER,
): StageRead {
  const n = pnls.length;
  const expectancy = n ? pyRound(pnls.reduce((s, p) => s + p, 0) / n, 2) : 0;

  let streak = 0;
  for (let i = n - 1; i >= 0 && pnls[i]! < 0; i--) streak++;

  let stage: RiskStage;
  if (n < cfg.learningTrades || expectancy <= 0) stage = 'learning';
  else if (n >= cfg.stableTrades) stage = 'stable';
  else stage = 'proving';

  const basePct = stage === 'stable' ? cfg.stablePct
    : stage === 'proving' ? cfg.provingPct
    : cfg.learningPct;

  return {
    stage, basePct, maxPositions: cfg.maxPositions[stage],
    closedTrades: n, expectancy, losingStreak: streak,
  };
}

/** Why the risk per trade ended up where it did. Rendered by the app. */
export type RiskCut =
  /** DOWNTREND: no new longs at all. */
  | 'regimeDowntrend'
  /** Uptrend but volatility is expanded — same risk, fewer shares. */
  | 'volExpanded'
  /** 50MA still above the 200MA but price has lost the 50MA. */
  | 'regimeStress'
  | 'regimeRange'
  | 'losingStreak'
  /** The stacked cuts hit `minRiskPct`. */
  | 'flooredAtMin';

export interface RiskBudget {
  /** Percent of equity to risk on the next trade. 0 means: do not open one. */
  pct: number;
  maxPositions: number;
  cuts: RiskCut[];
  stage: StageRead;
}

/**
 * Apply the regime and the recent record to the stage's base risk — the FULL-SIZE budget.
 *
 * The cuts MULTIPLY. Expanded volatility in a tape that has also just taken three
 * trades off you is not the same situation as either one alone, and the book's answer
 * to both is independently "half". `minRiskPct` stops the stack from reaching zero,
 * because a plan of nought shares reads like a bug rather than a decision.
 *
 * ── WHY THE CONVICTION GRADE IS *NOT* IN THIS STACK ──────────────────────────
 * It was, for one release, and that was wrong in a way the arithmetic hid. Risk percent
 * is only ONE of the four limits on a position (`suggestSize`); cash, concentration and
 * heat are the others. Whenever one of those bound the size — and the 25% concentration
 * cap binds routinely on a tight stop — scaling the risk percent changed the share count
 * by NOTHING AT ALL, so the grade dropdown moved and the position did not. The grade now
 * scales the finished size in `suggestSize`, where it applies to whichever limit won.
 *
 * The floor is the other half of the argument, and it cuts the same way. What
 * `minRiskPct` protects against is THE APP whittling the position down on the user's
 * behalf — regime, streak, volatility. The grade is the user saying "smaller" on
 * purpose, and flooring that would be the app overruling a deliberate choice: on the
 * learning rung a floored D came out at 0.1% against an A's 0.25%, which is 40% of full
 * size wearing a label that says 25%. So: the ladder's own cuts are floored, the user's
 * grade is not, and the two are reported separately.
 *
 * `regime === null` (not enough index history) is treated as no cut rather than as a
 * cut: the app has to say the regime is unknown, and inventing a penalty for missing
 * data would make it look like the book asked for one.
 */
export function riskBudget(
  stage: StageRead,
  ctx: {
    regime: PlaybookRegime | null;
    atrRatio: number | null;
  },
  cfg: RiskLadderConfig = DEFAULT_RISK_LADDER,
): RiskBudget {
  const cuts: RiskCut[] = [];

  if (ctx.regime === 'DOWNTREND') {
    return { pct: 0, maxPositions: 0, cuts: ['regimeDowntrend'], stage };
  }

  let pct = stage.basePct;
  let maxPositions = stage.maxPositions;

  if (ctx.regime === 'UPTREND' && ctx.atrRatio !== null && ctx.atrRatio > ATR_EXPANDED) {
    pct /= 2;
    maxPositions = Math.min(maxPositions, 3);
    cuts.push('volExpanded');
  }
  if (ctx.regime === 'UPTREND_UNDER_STRESS') {
    pct /= 2;
    maxPositions = Math.min(maxPositions, 3);
    cuts.push('regimeStress');
  } else if (ctx.regime === 'RANGE') {
    pct /= 2;
    maxPositions = Math.min(maxPositions, 3);
    cuts.push('regimeRange');
  }
  if (stage.losingStreak >= cfg.losingStreakTrigger) {
    pct /= 2;
    maxPositions = Math.min(maxPositions, 2);
    cuts.push('losingStreak');
  }
  if (pct < cfg.minRiskPct) {
    pct = cfg.minRiskPct;
    cuts.push('flooredAtMin');
  }

  return { pct: pyRound(pct, 4), maxPositions, cuts, stage };
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

export type LevelWarning =
  /** Structure put the stop further away than `atrMult × ATR`. Allowed, but size shrinks. */
  | 'stopWiderThanAtr'
  /** `rMultiple < minRR`. The book: skip it, however pretty the pattern. */
  | 'belowMinRR'
  /** Not enough bars for the anchor or the EMA — fell back to ATR. */
  | 'fellBackToAtr'
  /** `targetKind === 'ema'` but the EMA is at or below entry: nothing to aim at. */
  | 'emaTargetBelowEntry'
  /** The measured move came out under `minRR`, so the R multiple was used instead. */
  | 'measuredMoveTooSmall';

export interface LevelSuggestion {
  stop: number;
  /** null when the rule aims at an EMA that is not above entry yet. */
  target: number | null;
  riskPerShare: number;
  /** Stop distance as a percent of entry. */
  stopPct: number;
  /** Reward-to-risk of `target`, or null with no target. */
  rMultiple: number | null;
  /** The structural price the stop was hung on (before padding), or null for pure ATR. */
  anchorPrice: number | null;
  /** ATR(14) at the last bar, for the app to show alongside. */
  atr: number | null;
  rule: SetupRule;
  warnings: LevelWarning[];
}

function lowestLow(bars: readonly Bar[], n: number): number | null {
  const slice = bars.slice(-Math.max(1, n));
  if (!slice.length) return null;
  return Math.min(...slice.map((b) => b.low));
}

/**
 * Stop, target and their arithmetic for one planned entry.
 *
 * `bars` must be ascending and END at the session the plan is made from — the last
 * bar is "the signal bar" for every rule that references one. Returns null only when
 * there is nothing to work with at all (no bars, or a non-positive entry).
 */
export function suggestLevels(
  bars: readonly Bar[],
  entry: number,
  setup: SetupKey,
  overrides?: SetupRuleOverrides,
  cfg: RiskLadderConfig = DEFAULT_RISK_LADDER,
): LevelSuggestion | null {
  if (!(entry > 0) || !bars.length) return null;
  const rule = rulesFor(setup, overrides);
  const warnings: LevelWarning[] = [];

  const atrSeries = bars.length >= 15 ? atr(bars, 14) : null;
  const atrNow = atrSeries?.[atrSeries.length - 1];
  const atrVal = atrNow !== undefined && !Number.isNaN(atrNow) && atrNow > 0 ? atrNow : null;

  // ── the stop ──
  let anchorPrice: number | null = null;
  let stop: number | null = null;

  if (rule.anchor === 'signalBarLow') {
    anchorPrice = bars[bars.length - 1]!.low;
  } else if (rule.anchor === 'lowestLowN') {
    anchorPrice = lowestLow(bars, rule.lookback);
  }
  if (anchorPrice !== null && anchorPrice > 0 && anchorPrice < entry) {
    stop = anchorPrice * (1 - rule.padPct / 100);
  } else if (rule.anchor !== 'atr') {
    // The anchor is at or above the entry (a gap up over the whole base, or a stale
    // bar set). Structure cannot answer; say so rather than invent a level.
    anchorPrice = null;
    warnings.push('fellBackToAtr');
  }
  if (stop === null) {
    if (atrVal === null) return null;
    stop = entry - atrVal * rule.atrMult;
    if (rule.anchor !== 'atr' && !warnings.includes('fellBackToAtr')) {
      warnings.push('fellBackToAtr');
    }
  }
  stop = pyRound(stop, 2);
  if (!(stop > 0) || stop >= entry) return null;

  const riskPerShare = entry - stop;
  if (atrVal !== null && riskPerShare > atrVal * rule.atrMult) warnings.push('stopWiderThanAtr');

  // ── the target ──
  let target: number | null = null;
  if (rule.targetKind === 'ema' && rule.targetEma) {
    const series = emaOfCloses(bars, rule.targetEma);
    const v = series[series.length - 1];
    if (v !== undefined && !Number.isNaN(v) && v > entry) target = pyRound(v, 2);
    else warnings.push('emaTargetBelowEntry');
  } else if (rule.targetKind === 'measuredMove') {
    const slice = bars.slice(-Math.max(2, rule.lookback));
    const height = Math.max(...slice.map((b) => b.high)) - Math.min(...slice.map((b) => b.low));
    const byMove = height > 0 ? entry + height : 0;
    const byR = entry + riskPerShare * rule.firstTargetR;
    if (byMove >= entry + riskPerShare * cfg.minRR) {
      target = pyRound(byMove, 2);
    } else {
      target = pyRound(byR, 2);
      warnings.push('measuredMoveTooSmall');
    }
  } else {
    target = pyRound(entry + riskPerShare * rule.firstTargetR, 2);
  }

  const rMultiple = target !== null ? pyRound((target - entry) / riskPerShare, 2) : null;
  if (rMultiple !== null && rMultiple < cfg.minRR) warnings.push('belowMinRR');

  return {
    stop,
    target,
    riskPerShare: pyRound(riskPerShare, 4),
    stopPct: pyRound((riskPerShare / entry) * 100, 2),
    rMultiple,
    anchorPrice: anchorPrice !== null ? pyRound(anchorPrice, 2) : null,
    atr: atrVal !== null ? pyRound(atrVal, 4) : null,
    rule,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Size
// ---------------------------------------------------------------------------

/** Which constraint actually decided the share count. */
export type SizeLimit = 'risk' | 'cash' | 'concentration' | 'heat';

export type SizeWarning =
  /** Adding this position would push total open risk past `maxPortfolioHeatPct`. */
  | 'heatExceeded'
  /** The risk budget is 0 — a DOWNTREND. No long is planned at all. */
  | 'noNewLongs'
  /** Already at or over the stage's position count. */
  | 'tooManyPositions'
  /** Even one share costs more cash than the account has. */
  | 'notEnoughCash';

export interface SizeInput {
  /** Equity in the account currency — `computeEquity(state, prices)`. */
  equity: number;
  /** Uninvested cash. The hard limit on what can actually be bought. */
  cash: number;
  entry: number;
  riskPerShare: number;
  budget: RiskBudget;
  /** Sum of (entry − stop) × remaining shares over open lots THAT HAVE A STOP. */
  openRisk: number;
  /** Open positions right now, for the stage's count limit. */
  openPositions: number;
  /**
   * The trade's A–D grade, or null for ungraded (full size).
   *
   * It scales the FINISHED size — see the note on `riskBudget` for why it is applied
   * here and not to the risk percent.
   */
  rating?: ConvictionRating | null;
  cfg?: RiskLadderConfig;
}

export interface SizeSuggestion {
  /** What to buy: `fullShares` after the grade took its share. */
  shares: number;
  /**
   * The share count at full size — what an A (or an ungraded trade) would buy.
   *
   * Kept so the app can show the subtraction rather than just its answer: "full size
   * 2,000 → grade B → 1,500" is a sentence the user can check. A lone number is not.
   */
  fullShares: number;
  /** `fullShares × entry` — the "max position" the grade takes a percentage of. */
  fullPositionValue: number;
  /** 1 for A and for ungraded, 0.75 for B, … — what the grade multiplied by. */
  gradeScale: number;
  /** Cash actually at risk to the stop, at the GRADED size. */
  riskAmount: number;
  positionValue: number;
  /** `riskAmount` as a % of equity. Lands on `budget.pct` only at full size. */
  riskPctOfEquity: number;
  /** Open risk INCLUDING this position, as a % of equity. */
  heatPctAfter: number;
  /**
   * Which limit bound the FULL size. null when nothing bound it (shares === 0).
   *
   * The grade is deliberately not one of the options: it is not a limit the user ran
   * into, it is a fraction they asked for. Reporting it here would make a chosen size
   * look like a refused one.
   */
  limitedBy: SizeLimit | null;
  warnings: SizeWarning[];
}

/**
 * Share count for a planned entry, under every limit at once.
 *
 * The four limits are not interchangeable and the app should say which one bit:
 * "risk" is the plan working as intended, "cash" is a fact about the account,
 * "concentration" and "heat" are the user's own guard rails — and heat is the one
 * nobody notices, because each individual trade looks correctly sized right up until
 * the fifth one takes the book to 6% of equity on a single sector selling off.
 */
export function suggestSize(input: SizeInput): SizeSuggestion {
  const cfg = input.cfg ?? DEFAULT_RISK_LADDER;
  const { equity, cash, entry, riskPerShare, budget, openRisk, openPositions } = input;
  const warnings: SizeWarning[] = [];

  const gradeScale = ratingScale(input.rating, cfg);

  const none = (w?: SizeWarning): SizeSuggestion => {
    if (w) warnings.push(w);
    return {
      shares: 0, fullShares: 0, fullPositionValue: 0, gradeScale,
      riskAmount: 0, positionValue: 0, riskPctOfEquity: 0,
      heatPctAfter: equity > 0 ? pyRound((openRisk / equity) * 100, 2) : 0,
      limitedBy: null, warnings,
    };
  };

  if (budget.pct <= 0) return none('noNewLongs');
  if (!(equity > 0) || !(entry > 0) || !(riskPerShare > 0)) return none();
  if (openPositions >= budget.maxPositions) warnings.push('tooManyPositions');

  const riskMoney = (equity * budget.pct) / 100;
  const byRisk = Math.floor(riskMoney / riskPerShare);
  const byCash = Math.floor(Math.max(0, cash) / entry);
  const byCap = Math.floor((equity * cfg.maxPositionPct) / 100 / entry);

  // Heat is a limit on RISK, not on notional, so it converts through riskPerShare.
  const heatRoom = (equity * cfg.maxPortfolioHeatPct) / 100 - openRisk;
  const byHeat = Math.floor(Math.max(0, heatRoom) / riskPerShare);
  if (heatRoom <= 0) warnings.push('heatExceeded');

  const limits: [SizeLimit, number][] = [
    ['risk', byRisk], ['cash', byCash], ['concentration', byCap], ['heat', byHeat],
  ];
  let limitedBy: SizeLimit = 'risk';
  let fullShares = byRisk;
  for (const [name, n] of limits) {
    if (n < fullShares) { fullShares = n; limitedBy = name; }
  }
  fullShares = Math.max(0, fullShares);

  if (fullShares === 0) {
    if (byCash === 0) return none('notEnoughCash');
    return none();
  }

  // ── THE GRADE, APPLIED TO WHICHEVER LIMIT WON ─────────────────────────────
  // This is the line the user actually asked for: full size is decided by the regime,
  // the setup and the account (above); the grade then says how much of it to take. Doing
  // it here rather than to the risk percent is what makes B genuinely 75% of A — scaling
  // the percent alone left the two identical every time the concentration cap or cash
  // was the binding limit.
  //
  // `floor`, not `round`: rounding a grade UP would hand back more shares than the
  // fraction allows, and the whole point of a C is to be under full size.
  let shares = Math.floor(fullShares * gradeScale);
  // …but a graded trade is still a trade. Flooring a tiny full size to zero would turn
  // "bet smaller" into "do not bet", which is a decision the grade is not allowed to make.
  if (shares < 1) shares = 1;

  const riskAmount = pyRound(shares * riskPerShare, 2);
  const positionValue = pyRound(shares * entry, 2);
  return {
    shares,
    fullShares,
    fullPositionValue: pyRound(fullShares * entry, 2),
    gradeScale,
    riskAmount,
    positionValue,
    riskPctOfEquity: pyRound((riskAmount / equity) * 100, 3),
    heatPctAfter: pyRound(((openRisk + riskAmount) / equity) * 100, 2),
    limitedBy,
    warnings,
  };
}

/**
 * Open risk across the account: Σ (buyPrice − stop) × remainingShares.
 *
 * Lots with NO stop contribute nothing — deliberately, and it is the uncomfortable
 * choice. Their real risk is the whole position, so counting it would be defensible;
 * but then a portfolio of unstopped lots would report itself over the heat limit and
 * block every new trade, which trains the user to ignore the number. The app already
 * warns about missing stops in its own right (`positionsDigest`), and that is the
 * mechanism for that problem.
 */
export function openRiskOf(state: AccountState): number {
  let sum = 0;
  for (const l of state.lots) {
    if (l.remainingShares <= 0 || l.stop === undefined) continue;
    const per = l.buyPrice - l.stop;
    if (per > 0) sum += per * l.remainingShares;
  }
  return pyRound(sum, 2);
}
