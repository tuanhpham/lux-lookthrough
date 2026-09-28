/**
 * One trade plan per symbol, shared by the Trade Planner and the Buy form, and persisted.
 *
 * ── WHY A PLAN OUTLIVES THE PANEL IT WAS WRITTEN IN ─────────────────────────
 * The user's request was that buying a stock should go THROUGH its trade plan: evaluate,
 * confirm, then buy — and that the Buy form's note IS the plan's note, with more added.
 * That is only true if there is one plan, in one place, that both screens read and write.
 *
 * Before this, the planner's per-card edits (`PlanEdit`) lived in a `Map` that was thrown
 * away when the panel was closed, and the Buy form had no notion of a plan at all. So the
 * work of going through a checklist — the manual criteria, the note, a deliberate grade
 * override — vanished on reload, and doing it in the planner did nothing for the Buy form
 * five minutes later. Anything the user is asked to think carefully about must survive
 * being interrupted, or they learn not to bother.
 *
 * ── WHY ONE KEY PER SYMBOL AND NOT ONE BLOB ─────────────────────────────────
 * `plan:NVDA` rather than a `plans` record. Plans are written one at a time, from two
 * screens, and this storage syncs: a single blob makes every note the user types a
 * read-modify-write of every other plan they have, and two devices editing two different
 * symbols would clobber each other wholesale. Per-symbol keys make that collision the
 * narrowest it can be — you can only lose a plan by editing THAT plan in two places.
 *
 * The cost is that there is no cheap "list every plan", which is why `KNOWN_KEY` keeps an
 * index. It can drift from reality; `listPlans` therefore treats it as a hint and drops
 * symbols whose plan has gone, rather than trusting it.
 */
import type { AppContext } from '../context.js';
import type { ConvictionRating, SetupKey } from '@screener/core';

/** The answers to the manual criteria: criterion key → the user's yes/no. */
export type PlanAnswers = Record<string, boolean>;

export interface SymbolPlan {
  /** Upper-case ticker. Stored as well as keyed, so a plan read alone still knows itself. */
  symbol: string;
  /** The playbook row chosen, which decides which criteria the checklist asks. */
  setup: SetupKey | '';
  /** Manual criteria the user has answered. Absent = not answered, which is not "no". */
  answers: PlanAnswers;
  /**
   * A letter the user insisted on, overriding the computed grade — or null to use it.
   *
   * Kept separate from the computed grade rather than replacing it, because the two
   * disagreeing IS the information: "the checklist says C and I am taking it anyway" is a
   * decision worth being able to read back after the trade closes.
   */
  gradeOverride: ConvictionRating | null;
  /** The note. HTML, already sanitised by `richNote` before it arrives here. */
  note: string;
  /**
   * Whether the user has written in the note themselves.
   *
   * The note starts as the plan in words — the levels, the risk, why the setup passed — and
   * follows the plan as the entry moves. The moment the user types, it stops: regenerating
   * over someone's own reasoning on the next keystroke destroys the most valuable text on
   * the screen, and there is no undo for it.
   */
  noteEdited: boolean;
  /**
   * When the user last acknowledged having read this plan — the soft gate's memory.
   *
   * Null means "not acknowledged". It is a TIMESTAMP rather than a boolean so the
   * acknowledgement can be compared against `levelsAt`: a tick from before the levels
   * moved is not an acknowledgement of the plan as it now stands.
   */
  reviewedAt: string | null;
  /**
   * The entry/stop/target the acknowledgement was made against, and when.
   *
   * ── WHY THE LEVELS ARE STORED WITH THE TICK ─────────────────────────────────
   * The user chose a soft gate: the Buy button unlocks once the plan is evaluated and the
   * box is ticked, and the tick resets when the ticker, price or setup changes. Resetting
   * needs something to compare against, and "the form fields right now" is not enough —
   * the form is redrawn constantly. Storing what was on screen when they ticked means the
   * question "is this still the plan they agreed to?" has an answer after a reload too.
   */
  levels: { entry: number | null; stop: number | null; target: number | null } | null;
  /**
   * The letter that was on screen when the user acknowledged the plan.
   *
   * ── WHY THE GRADE IS PART OF WHAT WAS AGREED TO ─────────────────────────────
   * Comparing the setup and the levels catches a retyped entry, but not the other way the
   * plan can change under a tick: answering one more criterion. Ticking "I have read this
   * plan — grade B" and then unticking two criteria leaves the box ticked beside a D, and the
   * D is a quarter of the position size — the biggest single consequence in the app.
   *
   * Storing the letter rather than the answers means one comparison covers every route to a
   * different grade: criteria, setup, and a hand-picked override.
   */
  reviewedGrade: ConvictionRating | null;
  /** ISO timestamp of the last write, for the report footer and for "is this stale". */
  updatedAt: string;
}

const PREFIX = 'plan:';
const KNOWN_KEY = 'plan_symbols';

export function planKey(symbol: string): string {
  return PREFIX + symbol.trim().toUpperCase();
}

export function emptyPlan(symbol: string): SymbolPlan {
  return {
    symbol: symbol.trim().toUpperCase(),
    setup: '',
    answers: {},
    gradeOverride: null,
    note: '',
    noteEdited: false,
    reviewedAt: null,
    levels: null,
    reviewedGrade: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Read a plan, or a fresh empty one.
 *
 * Never returns null: every caller wants a plan to edit, and half of them would otherwise
 * write `?? emptyPlan(sym)` — which is one place for the default to drift out of step.
 * Field-by-field normalisation rather than a cast, because this blob syncs between devices
 * and can predate any field added here.
 */
export async function loadPlan(ctx: AppContext, symbol: string): Promise<SymbolPlan> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return emptyPlan(sym);
  const raw = await ctx.storage.get<Partial<SymbolPlan>>(planKey(sym)).catch(() => null);
  if (!raw) return emptyPlan(sym);
  return normalizePlan(raw, sym);
}

/**
 * A stored blob → a plan this code can trust, field by field.
 *
 * Exported because a plan is stored in two shapes: under its own key, and FROZEN inside a
 * lot's plan snapshot (`planSnapshot.ts`). Both come off the same sync and can predate any
 * field here, and the boolean guard on `answers` is the one that must not be duplicated — a
 * stringy `"false"` is truthy, and would award a criterion the user never ticked.
 */
export function normalizePlan(raw: Partial<SymbolPlan>, symbol: string): SymbolPlan {
  const sym = symbol.trim().toUpperCase();
  const base = emptyPlan(sym);
  return {
    symbol: sym,
    setup: typeof raw.setup === 'string' ? (raw.setup as SetupKey | '') : '',
    // Only booleans survive: a stringy "true" from a hand-edited blob would be truthy and
    // silently count as a met criterion, which is points the user never gave.
    answers: Object.fromEntries(
      Object.entries(raw.answers ?? {}).filter(([, v]) => typeof v === 'boolean'),
    ) as PlanAnswers,
    gradeOverride: raw.gradeOverride ?? null,
    note: typeof raw.note === 'string' ? raw.note : '',
    // A stored note with no flag beside it came from a version that had no flag, and the
    // safe reading is "the user wrote this": treating it as ours would let the next
    // keystroke in the price box overwrite it.
    noteEdited: typeof raw.noteEdited === 'boolean' ? raw.noteEdited : !!raw.note,
    reviewedAt: typeof raw.reviewedAt === 'string' ? raw.reviewedAt : null,
    levels: raw.levels && typeof raw.levels === 'object'
      ? {
        entry: numOrNull(raw.levels.entry),
        stop: numOrNull(raw.levels.stop),
        target: numOrNull(raw.levels.target),
      }
      : null,
    reviewedGrade: raw.reviewedGrade ?? null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
  };
}

/**
 * The stored plans for a set of symbols — only the symbols that actually have one.
 *
 * The Trade Planner seeds each card from the scan (a suggested setup, levels read off the
 * pattern) and then lets a stored plan overwrite the parts the user owns. So unlike every
 * other reader it has to tell "no plan" from "a plan with nothing in it", which `loadPlan`
 * deliberately will not do: it always hands back something editable. A symbol missing from
 * this map keeps the scan's suggestion; a symbol present with an empty setup means the user
 * cleared it, and that has to stick.
 *
 * Read by key rather than through `KNOWN_KEY`, because the caller already knows which symbols
 * it is asking about and the index is only a hint.
 */
export async function loadStoredPlans(
  ctx: AppContext,
  symbols: readonly string[],
): Promise<Map<string, SymbolPlan>> {
  const out = new Map<string, SymbolPlan>();
  const wanted = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  await Promise.all(wanted.map(async (sym) => {
    const raw = await ctx.storage.get<Partial<SymbolPlan>>(planKey(sym)).catch(() => null);
    if (raw) out.set(sym, await loadPlan(ctx, sym));
  }));
  return out;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Write a plan and keep the symbol index in step.
 *
 * `updatedAt` is stamped here rather than by callers: a caller that forgets makes the
 * report footer claim a plan is older than it is, and the omission is invisible.
 */
export async function savePlan(ctx: AppContext, plan: SymbolPlan): Promise<SymbolPlan> {
  const next: SymbolPlan = { ...plan, updatedAt: new Date().toISOString() };
  await ctx.storage.set(planKey(next.symbol), next);
  const known = await loadKnown(ctx);
  if (!known.includes(next.symbol)) {
    await ctx.storage.set(KNOWN_KEY, [...known, next.symbol].sort());
  }
  return next;
}

async function loadKnown(ctx: AppContext): Promise<string[]> {
  const raw = await ctx.storage.get<unknown>(KNOWN_KEY).catch(() => null);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Every plan the index knows about, with the ones that no longer exist dropped.
 *
 * The index is a hint, not a record. It can list a symbol whose plan was deleted on another
 * device, and trusting it would put an empty plan on screen claiming to be the user's work.
 */
export async function listPlans(ctx: AppContext): Promise<SymbolPlan[]> {
  const known = await loadKnown(ctx);
  const out: SymbolPlan[] = [];
  for (const sym of known) {
    const raw = await ctx.storage.get<Partial<SymbolPlan>>(planKey(sym)).catch(() => null);
    if (raw) out.push(await loadPlan(ctx, sym));
  }
  return out;
}

export async function deletePlan(ctx: AppContext, symbol: string): Promise<void> {
  const sym = symbol.trim().toUpperCase();
  await ctx.storage.set(planKey(sym), null);
  await ctx.storage.set(KNOWN_KEY, (await loadKnown(ctx)).filter((s) => s !== sym));
}

/** The levels currently on a form, in the shape the acknowledgement is compared against. */
export interface PlanLevels {
  entry: number | null;
  stop: number | null;
  target: number | null;
}

/**
 * Has the user acknowledged the plan AS IT NOW STANDS?
 *
 * ── WHY A TICK EXPIRES ──────────────────────────────────────────────────────
 * The soft gate exists so that buying is preceded by having looked at the plan. A tick that
 * survived a change of setup or a moved entry would let the user acknowledge a $100 entry
 * with a $95 stop and then buy at $118 with the gate still satisfied — which is the exact
 * trade the gate was put there to slow down, with a green tick next to it.
 *
 * The symbol is not compared here because a different symbol is a different plan and a
 * different storage key; it cannot arrive at this function by accident.
 *
 * Entry is compared with a tolerance: the price box is re-filled from the latest close on
 * every redraw, and a close that moved by a cent is not a new plan. The stop and target are
 * compared exactly, because those move only when something decided they should.
 *
 * `grade` is the letter in force NOW. Passing it is what makes answering one more criterion
 * expire the tick, without every screen that can change an answer having to remember to clear
 * it — there are three such places already, and the fourth would be the one that forgot.
 */
export function reviewCurrent(
  plan: SymbolPlan,
  setup: SetupKey | '',
  levels: PlanLevels,
  grade: ConvictionRating | null,
): boolean {
  if (!plan.reviewedAt) return false;
  if (plan.setup !== setup) return false;
  if (plan.reviewedGrade !== grade) return false;
  const was = plan.levels;
  if (!was) return false;
  const near = (a: number | null, b: number | null): boolean => {
    if (a === null || b === null) return a === b;
    // 0.5% or a cent, whichever is larger: a tolerance in percent alone is meaningless on
    // a $2 stock, and a tolerance in cents alone is meaningless on a $900 one.
    return Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.005);
  };
  const same = (a: number | null, b: number | null): boolean => a === b;
  return near(was.entry, levels.entry) && same(was.stop, levels.stop) && same(was.target, levels.target);
}
