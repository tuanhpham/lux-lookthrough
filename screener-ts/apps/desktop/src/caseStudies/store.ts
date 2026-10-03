/**
 * Case Studies — a journal of annotated past setups. Each entry pins a stock to
 * a key date with trade levels, dated catalysts and notes, for documenting how a
 * setup looked and played out. Stored through ctx.storage so it SYNCS across
 * devices (same SyncedStorage layer as watchlists/posts/accounts).
 *
 * Storage layout: `casestudies:index` → CaseStudyMeta[]; `casestudy:<id>` → CaseStudy.
 */
import type { AppContext } from '../context.js';
import type { PlanSnapshot } from '../portfolio/planSnapshot.js';

/**
 * The trade plan a case study was filed from, frozen.
 *
 * ── WHY IT IS THE LOT SNAPSHOT'S SHAPE, MINUS THE LOT ───────────────────────
 * `PlanSnapshot` already answers "what was decided before this trade, and how big was it
 * allowed to be" — the plan, the scored checklist, the letter in force, the levels as typed and
 * the ladder share that applied at the time. A case study filed from the planner needs exactly
 * that, and a second almost-identical shape would be a second thing to keep in step with the
 * report that renders it. `lotId` is the one field that does not carry over: a case study can be
 * reconstructed for a trade that was never recorded in an account, which is the whole point of
 * being able to set the trade date into the past.
 */
export type CasePlan = Omit<PlanSnapshot, 'lotId'>;

/** One execution of a station trade. `price` is in `currency`, as typed; `fee` in the account's. */
export interface CaseFill {
  date: string;
  side: 'buy' | 'sell';
  shares: number;
  price: number;
  currency: 'EUR' | 'USD';
  fee?: number;
}

/** A dated catalyst / news note attached to a case study. */
export interface Catalyst {
  date: string; // ISO YYYY-MM-DD
  text: string;
}

export type CaseOutcome = 'win' | 'loss' | 'open' | 'scratch';

/** Subjective quality grade for the setup. '' = ungraded. */
export type CaseRating = '' | 'A' | 'B' | 'C' | 'D';

export interface CaseStudy {
  id: string;
  symbol: string;
  title: string;
  /** The pivotal date the chart is centered on (entry / breakout day). */
  keyDate: string;
  /** Months of context shown on each side of the key date (default 3 → 6mo total). */
  windowMonths: number;
  setupType: string; // free text: "VCP", "Episodic Pivot", "Surge", custom…
  outcome: CaseOutcome;
  /** Subjective A–D grade of the setup quality. Optional for back-compat. */
  rating?: CaseRating;
  entry: number | null;
  stop: number | null;
  target: number | null;
  exitDate: string | null;
  exitPrice: number | null;
  /** Realized R-multiple, if computed/entered. */
  rMultiple: number | null;
  /**
   * WHY the trade was closed, in one line: a reason from the planner's list, the user's own
   * words, or "reason — words". Plain text, escaped wherever it is shown.
   *
   * Optional, and separate from `notes`, because it is the field a journal is read back BY. The
   * lesson of a losing trade is almost never in the chart; it is in whether the stop was hit or
   * the position was abandoned two days early, and that distinction is unfindable once it has
   * been folded into a paragraph.
   */
  exitReason?: string;
  /**
   * The same reason as a vocabulary key (see `portfolio/exitReasons.ts`), when it came from the
   * list rather than being typed freehand.
   *
   * Separate from `exitReason` because that field holds the line the user reads — "Stop hit —
   * gapped straight through it" — in whichever language the app was in when it was filed. Only a
   * key can be counted, which was the entire reason for having a list. Absent on a reason the
   * user simply wrote out, and on everything filed before this existed.
   */
  exitReasonKey?: string;
  /**
   * The currency `entry` / `stop` / `target` / `exitPrice` are written in. Absent means USD.
   *
   * ── WHY THIS HAD TO EXIST ───────────────────────────────────────────────────
   * Bars arrive in dollars, always, so until now a study simply stored dollars: the planner
   * converted the euro levels the user had typed before filing, and the chart matched. It was
   * internally consistent and still wrong to read. A trade entered at €167 was journalled as
   * "$194.12" beside a frozen plan section that said "€167.19" — one trade, two prices, in one
   * document — and a study typed by hand in euros had its lines drawn in the wrong place entirely.
   *
   * With this field the levels are filed AS TYPED and the chart is converted to meet them (see
   * `inCurrency`), which is the way round that keeps the prices the user recognises.
   *
   * Absent on every study filed before 2026-09-29, so every reader must default it to USD — and a
   * EUR study needs a rate to draw at all, which is why the chart callers pass one.
   */
  currency?: 'USD' | 'EUR';
  catalysts: Catalyst[];
  /** Free-form markdown-ish notes / lessons learned. */
  notes: string;
  /**
   * The trade plan this study was filed from, frozen at the moment of filing.
   *
   * Absent on every study written by hand in this tab, and on everything saved before the
   * planner could file one — so every reader has to treat it as optional.
   */
  plan?: CasePlan;
  /**
   * The account a study opened from the Trade Station follows, and the lots it bought there.
   * A sale of any of those lots is written back into this study (see `stationCase.ts`), which
   * is how a journal entry made at the buy closes itself when the position does. Absent on
   * every study filed any other way.
   */
  accountId?: string;
  lotIds?: string[];
  /** Every buy and sell of the trade, oldest first, in each fill's own currency. */
  fills?: CaseFill[];
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
}

export interface CaseStudyMeta {
  id: string;
  symbol: string;
  title: string;
  keyDate: string;
  outcome: CaseOutcome;
  rating?: CaseRating;
  /**
   * Copied into the index so the list can show the setup, the result and whether a plan was
   * frozen with the study without loading every study. Absent on entries saved before this;
   * the list then simply leaves them out until the study is saved again.
   */
  setupType?: string;
  rMultiple?: number | null;
  hasPlan?: boolean;
}

const INDEX_KEY = 'casestudies:index';
const studyKey = (id: string): string => `casestudy:${id}`;

export function newCaseId(): string {
  return globalThis.crypto?.randomUUID?.() ?? 'cs-' + Math.random().toString(36).slice(2);
}

export async function loadCaseIndex(ctx: AppContext): Promise<CaseStudyMeta[]> {
  return (await ctx.storage.get<CaseStudyMeta[]>(INDEX_KEY)) ?? [];
}

export async function loadCase(ctx: AppContext, id: string): Promise<CaseStudy | null> {
  return ctx.storage.get<CaseStudy>(studyKey(id));
}

/** Insert or update a case study and keep the index in sync. */
export async function saveCase(ctx: AppContext, study: CaseStudy): Promise<void> {
  await ctx.storage.set(studyKey(study.id), study);
  const idx = await loadCaseIndex(ctx);
  const meta: CaseStudyMeta = {
    id: study.id,
    symbol: study.symbol,
    title: study.title,
    keyDate: study.keyDate,
    outcome: study.outcome,
    rating: study.rating,
    setupType: study.setupType,
    rMultiple: study.rMultiple,
    hasPlan: !!study.plan,
  };
  const i = idx.findIndex((m) => m.id === study.id);
  if (i >= 0) idx[i] = meta;
  else idx.push(meta);
  // Newest key date first.
  idx.sort((a, b) => (a.keyDate < b.keyDate ? 1 : -1));
  await ctx.storage.set(INDEX_KEY, idx);
}

export async function deleteCase(ctx: AppContext, id: string): Promise<void> {
  const idx = (await loadCaseIndex(ctx)).filter((m) => m.id !== id);
  await ctx.storage.set(INDEX_KEY, idx);
  await ctx.storage.delete(studyKey(id));
}

/** A blank study seeded with sensible defaults for the create form. */
export function blankCase(todayIso: string): CaseStudy {
  return {
    id: newCaseId(),
    symbol: '',
    title: '',
    keyDate: todayIso,
    windowMonths: 3,
    setupType: 'VCP',
    outcome: 'open',
    rating: '',
    entry: null,
    stop: null,
    target: null,
    exitDate: null,
    exitPrice: null,
    rMultiple: null,
    catalysts: [],
    notes: '',
    createdAt: todayIso,
    updatedAt: todayIso,
  };
}
