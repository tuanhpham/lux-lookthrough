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
 * lesson, and the sentence without the label is a lesson you cannot count.
 *
 * ── WHY THIS FILE HAS NO DOM IN IT ──────────────────────────────────────────
 * The app's vitest runs in `node` with no jsdom, so the only things that can be tested are pure
 * functions. Everything here that can be got wrong — the R multiple's sign, which outcome a
 * flat trade is, the currency the case study is stored in — is arithmetic, and it lives here
 * rather than inside the card's repaint so it can be checked. See `tests/planExit.test.ts`.
 */
import type { ConvictionRating, SetupKey } from '@screener/core';
import {
  newCaseId,
  type CaseOutcome,
  type CasePlan,
  type CaseRating,
  type CaseStudy,
} from '../caseStudies/store.js';

/** The fixed vocabulary of exit reasons. See the header for why there is one. */
export type ExitReasonKey =
  | 'stop' | 'target' | 'trail' | 'time' | 'thesis' | 'market' | 'better' | 'scaled' | 'panic' | 'other';

export const EXIT_REASONS: readonly { key: ExitReasonKey; en: string; vi: string }[] = [
  { key: 'stop', en: 'Stop hit', vi: 'Chạm cắt lỗ' },
  { key: 'target', en: 'Target reached', vi: 'Đạt mục tiêu' },
  { key: 'trail', en: 'Trailing stop / broke a moving average', vi: 'Cắt lỗ dời theo / mất đường trung bình' },
  { key: 'time', en: 'Time stop — it went nowhere', vi: 'Hết kiên nhẫn — giá không đi đâu' },
  { key: 'thesis', en: 'The reason for the trade broke', vi: 'Lý do vào lệnh không còn đúng' },
  { key: 'market', en: 'The market turned', vi: 'Thị trường chung xấu đi' },
  { key: 'better', en: 'Moved the money to a better setup', vi: 'Chuyển tiền sang cơ hội tốt hơn' },
  { key: 'scaled', en: 'Took part of it off', vi: 'Bán một phần' },
  { key: 'panic', en: 'Sold out of fear — not the plan', vi: 'Bán vì sợ — không theo kế hoạch' },
  { key: 'other', en: 'Something else', vi: 'Lý do khác' },
];

export function exitReasonLabel(key: ExitReasonKey | '', vi: boolean): string {
  const r = EXIT_REASONS.find((x) => x.key === key);
  return r ? (vi ? r.vi : r.en) : '';
}

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
 * ── WHY THE LEVELS ARRIVE IN DOLLARS ────────────────────────────────────────
 * The planner's boxes are in `planCcy`, which for this user is usually euros. A `CaseStudy` is
 * stored with no currency field at all: its report prints `$`, and — the part that actually
 * breaks — its chart draws these numbers as price lines against raw closes, which are dollars.
 * A €198 entry stored here would print as "$198.00" beside a $232 candle. So the conversion
 * happens at the call site, where the rate lives, and this function takes dollars and says so.
 */
export interface CaseFromPlan {
  symbol: string;
  /** The trade date. Becomes the case study's key date, which the chart centres on. */
  date: string;
  /** The playbook row, which doubles as `setupType` — the keys match the journal's dropdown. */
  setup: SetupKey | '';
  /** Entry / stop / target in USD. See the note above. */
  levels: { entry: number | null; stop: number | null; target: number | null };
  /** The exit, with `price` in USD. */
  exit: PlanExit;
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
    // Not derived from the note: catalysts are dated events the user adds in the journal's own
    // editor, and inventing them from a criteria summary would put made-up dates on a timeline.
    catalysts: [],
    notes: i.notes,
    ...(reason ? { exitReason: reason } : {}),
    plan: i.plan,
    createdAt: i.createdAt ?? i.todayIso,
    updatedAt: i.todayIso,
  };
}
