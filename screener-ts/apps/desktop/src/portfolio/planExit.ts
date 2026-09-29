/**
 * The exit half of a trade plan, and the case study a finished plan turns into.
 *
 * ── WHY A PLAN NEEDS AN EXIT AT ALL ─────────────────────────────────────────
 * The user's "do thi nen co them cai exit price de user dien that su khi ma muon save vao case
 * study, con neu ma buy thi khong can nhe … va exit nen co mot cai cho de bo ly do vao". Two
 * different uses of the same card:
 *
 *   • Planning a trade to place → there is no exit yet, and asking for one would be asking the
 *     user to invent it. Nothing here may ever gate the Buy button.
 *   • Reconstructing a trade on a past date, to file it → the exit is the whole outcome, and a
 *     case study without one is a chart with no verdict on it.
 *
 * So the exit is optional everywhere and required by nothing. `outcome` reads 'open' when the
 * price is missing, which is a state the Case Studies journal already has.
 *
 * ── WHY THE REASON IS A LIST PLUS FREE TEXT ─────────────────────────────────
 * "mot cai cho de bo ly do vao" is the free text, and that is the field that carries the
 * thinking. The list beside it exists because a journal is only worth keeping if it can be read
 * back in aggregate: "how did I do on the trades I sold early out of fear" is a question you can
 * only ask of a fixed vocabulary, and one the user will never be able to ask of ten differently
 * worded sentences. Neither is required; the list without the sentence is a label with no
 * lesson, and the sentence without the label is a lesson you cannot count. The vocabulary itself
 * — shipped rows plus the user's own — lives in `exitReasons.ts`.
 *
 * ── WHY THIS FILE HAS NO DOM IN IT ──────────────────────────────────────────
 * The app's vitest runs in `node` with no jsdom, so the only things that can be tested are pure
 * functions. Everything here that can be got wrong — the R multiple's sign, which outcome a
 * flat trade is, the currency the case study is stored in — is arithmetic, and it lives here
 * rather than inside the card's repaint so it can be checked. See `tests/planExit.test.ts`.
 */
import type { Bar, ConvictionRating, SetupKey } from '@screener/core';
import {
  newCaseId,
  type CaseOutcome,
  type CasePlan,
  type CaseRating,
  type CaseStudy,
} from '../caseStudies/store.js';
import { exitReasonLabel, type ExitReasonKey } from './exitReasons.js';

/** The exit as the card holds it. Prices are in the card's display currency. */
export interface PlanExit {
  date: string | null;
  price: number | null;
  reason: ExitReasonKey | '';
  /** The user's own words. Plain text — it is escaped everywhere it is shown. */
  note: string;
}

export function emptyExit(): PlanExit {
  return { date: null, price: null, reason: '', note: '' };
}

/** Is there anything here worth saving or drawing? */
export function hasExit(x: PlanExit): boolean {
  return x.price !== null || x.date !== null || x.reason !== '' || x.note.trim() !== '';
}

/** One line for the record: "Stop hit — gapped through it on earnings". */
export function exitReasonText(x: PlanExit, vi: boolean): string {
  const label = exitReasonLabel(x.reason, vi);
  const note = x.note.trim();
  if (label && note) return `${label} — ${note}`;
  return label || note;
}

/** What the recorded exit makes of the trade. Every field is null when it cannot be known. */
export interface ExitMath {
  /** (exit − entry) / (entry − stop): what the trade made in units of what it risked. */
  rMultiple: number | null;
  pctGain: number | null;
  /** Money made or lost on the recorded share count, in the levels' own currency. */
  pnl: number | null;
  /** Calendar days from the trade date to the exit. Negative is a user error, not clamped. */
  daysHeld: number | null;
  outcome: CaseOutcome;
}

/**
 * A trade that finished flat enough not to count either way, in percent.
 *
 * A journal where every 0.1% scratch is filed as a win or a loss reports a win rate that is
 * really a coin-flip rate, and the user then draws conclusions from it.
 */
const SCRATCH_PCT = 0.25;

export function exitMath(i: {
  entry: number | null;
  stop: number | null;
  shares: number;
  /** The trade date — where the holding period starts. */
  date: string;
  exit: PlanExit;
}): ExitMath {
  const { entry, stop, exit } = i;
  const px = exit.price;
  const daysHeld = exit.date && i.date
    ? Math.round(
      (new Date(exit.date + 'T00:00:00').getTime() - new Date(i.date + 'T00:00:00').getTime()) / 864e5,
    )
    : null;

  if (px === null || entry === null || !(entry > 0)) {
    return { rMultiple: null, pctGain: null, pnl: null, daysHeld, outcome: 'open' };
  }
  const pctGain = ((px - entry) / entry) * 100;
  // The risk the trade was taken on, from the PLANNED stop — not from where it actually got
  // out. An exit above the stop that still lost money is a 0.4R loss, and saying so is the
  // point of R: it compares the outcome to what was deliberately put at risk.
  const risk = stop !== null && stop > 0 && stop < entry ? entry - stop : null;
  const shares = Math.max(0, Math.round(i.shares || 0));
  return {
    rMultiple: risk !== null ? round2((px - entry) / risk) : null,
    pctGain: round2(pctGain),
    pnl: shares > 0 ? round2((px - entry) * shares) : null,
    daysHeld,
    outcome: Math.abs(pctGain) < SCRATCH_PCT ? 'scratch' : pctGain > 0 ? 'win' : 'loss',
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ── The chart window, and the price the exit box is seeded with ──────────────
/** Months of chart shown BEFORE the trade date — enough to see the base the entry came out of. */
export const PLAN_CHART_MONTHS_BEFORE = 4;
/** Months shown AFTER the trade date, or after the exit when there is one. */
export const PLAN_CHART_MONTHS_AFTER = 2;

/**
 * An ISO date shifted by whole months, with the JS Date rollover (31 Jan − 1 month → 3 Mar).
 *
 * UTC on both sides of the trip. Parsing `'2024-05-20T00:00:00'` gives LOCAL midnight, and
 * `toISOString()` then reports it in UTC — so east of Greenwich the day comes back one earlier
 * than it went in, for a shift of zero months. Harmless on a chart edge and wrong everywhere
 * else, which is exactly the kind of bug that gets copied into somewhere it matters.
 */
function shiftMonths(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * The bars a plan's chart shows: a window AROUND the trade date, not a cut at it.
 *
 * ── WHY THE CHART SEES PAST THE TRADE DATE AND THE GRADE STILL DOES NOT ─────
 * The user's "chart khong nen chi show den ngay hom do, ma nen show 6 thang around ngay hom do".
 * They are right, and the two things were being conflated. What the time machine has to protect
 * is the JUDGEMENT: the quality score, the contractions, the RS rank, the suggested stop, the
 * grade. Those are all computed from `planBars`, which stops dead at the trade date (`asOfBars`),
 * and nothing here widens that. The chart is a picture, and a picture of a setup cut off at the
 * entry bar is the one view that cannot answer the question a case study is for — did this work.
 *
 * ── THE THREE CASES ─────────────────────────────────────────────────────────
 *   • A date well in the past: 4 months before, 2 months after. Six months around the entry.
 *   • A date so recent that 2 months of bars do not exist yet: the right edge lands on the last
 *     bar there is, and the LEFT edge is pushed back to keep the window six months wide. Without
 *     that, a plan dated last week would draw a four-month sliver.
 *   • A trade held longer than the window: the right edge follows the EXIT, so the window grows
 *     with the hold — the user's "neu ma nam giu lau hon thi can phai khoang thoi gian lau hon".
 *
 * Pure and bar-shaped rather than living in the planner, because the Case Studies viewer has to
 * apply the identical window to the identical plan and two copies of this arithmetic would
 * eventually disagree about which chart a filed study is.
 */
export function planChartWindow(
  bars: readonly Bar[],
  planDate: string,
  exitDate: string | null,
): Bar[] {
  if (!bars.length || !planDate) return bars as Bar[];
  const anchorEnd = exitDate && exitDate > planDate ? exitDate : planDate;
  const hi = shiftMonths(anchorEnd, PLAN_CHART_MONTHS_AFTER);
  const capped = bars.filter((b) => b.date <= hi);
  // Everything is before the window: a plan dated years before the earliest bar. Better to draw
  // the oldest history there is than to hand the chart an empty array and draw nothing.
  if (!capped.length) return bars.slice(0, 1);
  const last = capped[capped.length - 1]!.date;
  const wide = shiftMonths(last, -(PLAN_CHART_MONTHS_BEFORE + PLAN_CHART_MONTHS_AFTER));
  const lo = [shiftMonths(planDate, -PLAN_CHART_MONTHS_BEFORE), wide].sort()[0]!;
  return capped.filter((b) => b.date >= lo);
}

/**
 * The same bars priced in the currency the plan is written in. `rate` 0 (or USD) means no change.
 *
 * ── WHY THE CHART MOVES AND NOT THE LEVELS ──────────────────────────────────
 * The price boxes are in `planCcy`, usually euros, and the bars are raw dollar closes. Converting
 * the LEVELS onto the dollar candles is what both charts used to do, and it is what the user saw:
 * "cac figures khac nhau o cac inputs (entry, target, stop) so voi cac so lieu tren do thi". The
 * lines were in the right PLACE — a €198 entry really is $232 — but they carried a number the form
 * beside them never mentioned, and the axis carried it too. A card that states two different
 * prices for the same level is a card nobody can check.
 *
 * ── WHY ONE RATE FOR THE WHOLE WINDOW ───────────────────────────────────────
 * Every bar is divided by the TRADE DATE's rate, not by its own day's rate. The result is the
 * dollar shape scaled by a constant: identical candles, identical EMAs, identical contractions,
 * a relabelled axis. Per-day rates would be more "correct" as a currency series and wrong as a
 * chart — the price action a setup is judged on would then include moves that were the euro's,
 * and a base could tighten or break on FX alone. The rest of the card is already in the trade
 * date's frame (`usdToLevel`, `plannedPrice`), so this keeps one frame for the whole document.
 */
export function inCurrency(bars: readonly Bar[], rate: number): Bar[] {
  if (!(rate > 0)) return bars as Bar[];
  return bars.map((b) => ({
    ...b,
    open: b.open / rate,
    high: b.high / rate,
    low: b.low / rate,
    close: b.close / rate,
  }));
}

/**
 * The close on a date, or on the last session before it — the number an exit box is seeded with.
 *
 * ── WHY THE EXIT PRICE IS SUGGESTED AT ALL ──────────────────────────────────
 * The user's "khi nguoi ta chon exit date, thi exit price co the duoc goi y dua vao gia dong cua
 * ngay hom do … tuong tu nhu gia goi y buy o trong buy form". Reconstructing a trade from
 * eighteen months ago, nobody remembers the fill; the close of the day is both the honest default
 * and the number they would otherwise go and look up by hand in another window.
 *
 * Walks BACKWARDS to the last session on or before the date, because the user picks calendar days
 * and markets close at weekends: an exact-match lookup would silently offer nothing for every
 * Saturday and look broken. A week of slack covers weekends and the longest market holidays;
 * beyond that the walk gives up and returns null rather than offering a price from another month
 * because the cache happens to stop there. A dash the user fills in is a missing number; a stale
 * close in the exit box is a wrong one that gets filed.
 */
const MAX_STALE_DAYS = 7;

export function closeOnOrBefore(bars: readonly Bar[], date: string): number | null {
  if (!bars.length || !date) return null;
  if (date < bars[0]!.date) return null;
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i]!;
    if (b.date > date) continue;
    const gap = (new Date(date + 'T00:00:00').getTime() - new Date(b.date + 'T00:00:00').getTime()) / 864e5;
    if (gap > MAX_STALE_DAYS) return null;
    return Number.isFinite(b.close) ? b.close : null;
  }
  return null;
}

/** "NVDA May 2024 VCP" — the same shape the Case Studies editor generates by hand. */
export function autoCaseTitle(symbol: string, keyDate: string, setupLabel: string): string {
  const d = keyDate ? new Date(keyDate + 'T00:00:00') : null;
  const when = d && !Number.isNaN(d.getTime())
    ? `${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`
    : '';
  return `${symbol.toUpperCase()} ${when} ${setupLabel}`.replace(/\s+/g, ' ').trim();
}

/**
 * Everything the planner has to hand over to file a card as a case study.
 *
 * ── WHY THE LEVELS ARRIVE AS TYPED, NOT IN DOLLARS ──────────────────────────
 * They used to arrive converted, because a `CaseStudy` had no currency field: its report printed
 * `$` and its chart drew the levels against raw closes, which are dollars, so a €198 entry had to
 * become $232 or the entry line would land off the axis.
 *
 * `CaseStudy.currency` ended that. The levels now arrive in `planCcy` — the numbers the user
 * actually typed and will recognise — and the CHART is converted to meet them instead
 * (`inCurrency`). The old way was internally consistent and unreadable: the journal said "$194.12"
 * for a trade the frozen plan printed beside it recorded as "€167.19".
 */
export interface CaseFromPlan {
  symbol: string;
  /** The trade date. Becomes the case study's key date, which the chart centres on. */
  date: string;
  /** The playbook row, which doubles as `setupType` — the keys match the journal's dropdown. */
  setup: SetupKey | '';
  /** Entry / stop / target in `currency`, exactly as typed. See the note above. */
  levels: { entry: number | null; stop: number | null; target: number | null };
  /** The exit, with `price` in `currency` too. */
  exit: PlanExit;
  /**
   * What `levels` and `exit.price` are denominated in. Written onto the study, so its chart can be
   * converted to match and its report can print the right symbol.
   */
  currency: 'USD' | 'EUR';
  shares: number;
  /** The letter in force, which becomes the journal's rating. */
  effective: ConvictionRating | null;
  /** The plan's note, already sanitised HTML. */
  notes: string;
  /** The frozen plan, so the case study can still show what was decided beforehand. */
  plan: CasePlan;
  vi: boolean;
  todayIso: string;
  /** A title the user typed in the save dialog. Auto-generated when blank. */
  title?: string;
  /** Re-saving over an existing study keeps its id and creation date. */
  id?: string;
  createdAt?: string;
}

/**
 * A planner card as a journal entry.
 *
 * ── WHY THE PLAN IS EMBEDDED RATHER THAN LINKED ─────────────────────────────
 * The same reason `planSnapshot.ts` exists: `plan:NVDA` is one mutable plan per symbol, the plan
 * for the NEXT NVDA trade. A case study that pointed at it would show this year's reasoning
 * beside last year's chart the moment the user planned NVDA again — and it would look exactly as
 * authoritative. A post-mortem is worth nothing if the plan it grades can be edited after the
 * outcome is known, so the plan is copied in and never written again.
 */
export function caseStudyFromPlan(i: CaseFromPlan): CaseStudy {
  const m = exitMath({ entry: i.levels.entry, stop: i.levels.stop, shares: i.shares, date: i.date, exit: i.exit });
  const setupType = i.setup || 'Other';
  const reason = exitReasonText(i.exit, i.vi);
  return {
    id: i.id ?? newCaseId(),
    symbol: i.symbol.toUpperCase(),
    title: (i.title ?? '').trim() || autoCaseTitle(i.symbol, i.date, setupType),
    keyDate: i.date,
    // ±3 months is what the journal defaults to, and it is the window that shows the base the
    // entry came out of as well as what happened next. The detail view can still change it.
    windowMonths: 3,
    setupType,
    outcome: m.outcome,
    // The scored letter, not a second hand-picked one: the journal's A–D and the planner's
    // conviction grade are the same judgement, and letting them diverge would give the user two
    // gradings of one trade with nothing to say which was meant.
    rating: (i.effective ?? '') as CaseRating,
    entry: i.levels.entry,
    stop: i.levels.stop,
    target: i.levels.target,
    exitDate: i.exit.date,
    exitPrice: i.exit.price,
    rMultiple: m.rMultiple,
    // Only written when it is not the default, so a dollar study stays byte-for-byte what it
    // always was — this blob syncs, and a field that is always present is a diff on every study.
    ...(i.currency === 'EUR' ? { currency: 'EUR' as const } : {}),
    // Not derived from the note: catalysts are dated events the user adds in the journal's own
    // editor, and inventing them from a criteria summary would put made-up dates on a timeline.
    catalysts: [],
    notes: i.notes,
    ...(reason ? { exitReason: reason } : {}),
    // The key as well as the sentence. The sentence is what the report prints and what the user
    // recognises; the key is the only part that can be counted, and it is stored in the language
    // the vocabulary is defined in rather than the one the app happened to be showing.
    ...(i.exit.reason ? { exitReasonKey: i.exit.reason } : {}),
    plan: i.plan,
    createdAt: i.createdAt ?? i.todayIso,
    updatedAt: i.todayIso,
  };
}
