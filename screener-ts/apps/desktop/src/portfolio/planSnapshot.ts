/**
 * The trade plan a lot was actually bought on, frozen at the moment of the buy.
 *
 * ── WHY A SNAPSHOT AND NOT A LOOKUP ─────────────────────────────────────────
 * The user asked to be able to open a buy — or a closed position — and see the trade plan it
 * was made from. Reading `plan:NVDA` back at that point would answer a different question.
 * That plan is ONE per symbol and mutable by design: it is the plan for the NEXT NVDA trade.
 * Buy in January, edit the checklist in March, and the January lot would show March's
 * reasoning — the one place in the app where being wrong is invisible, because the document
 * looks exactly as authoritative either way. A post-mortem is worth nothing if the plan it
 * compares against can be edited after the outcome is known.
 *
 * So the buy takes a copy: the plan, the scored checklist, the letter in force, the levels and
 * size as entered. None of it is ever written again.
 *
 * ── WHY IT IS NOT A FIELD ON THE LOT ────────────────────────────────────────
 * One key per lot, `plansnap:<lotId>`, rather than `lot.plan`. Every lot lives inside the
 * single `accounts` row, which is read-modify-written on every trade, every stop change and
 * every price refresh, and which syncs whole — it has been 912 KB before. A checklist of 26
 * criteria plus a note per lot would go straight back there. Out here the snapshot is written
 * once, read only when the user asks for it, and costs the accounts row nothing.
 *
 * The lot's id IS the key, so nothing needs to be added to `BuyLot` and there is no index to
 * drift: `lotIdsWithPlan` lists the prefix.
 *
 * ── WHAT IS DELIBERATELY NOT STORED ─────────────────────────────────────────
 * Bars. The chart is redrawn from the price history at viewing time, which needs no storage
 * and is the more useful picture anyway — by then it shows what the stock did after the plan
 * was written, next to the stop that was planned for it.
 */
import type { ConvictionRating, GradeResult } from '@screener/core';
import type { AppContext } from '../context.js';
import { normalizePlan, type PlanLevels, type SymbolPlan } from './planStore.js';

export interface PlanSnapshot {
  /** The lot this plan bought. Also the storage key. */
  lotId: string;
  symbol: string;
  /** When the buy was RECORDED. Not `date` — a backdated trade is entered long after. */
  savedAt: string;
  /** The trade date as entered, which is what the report is centred on. */
  date: string;
  /** The plan as it stood, including whether it had been acknowledged and against what. */
  plan: SymbolPlan;
  /** The scored checklist, or null when the trade was never graded. */
  grade: GradeResult | null;
  /** The letter in force at the buy: the override, else the score's. */
  effective: ConvictionRating | null;
  /** Entry / stop / target as entered on the form, in `currency`. */
  levels: PlanLevels;
  shares: number;
  /** The currency the levels were typed in — the form's, not the account's. */
  currency: 'EUR' | 'USD';
  /**
   * Share of full size the letter allowed, from the ladder AS IT WAS.
   *
   * Stored rather than recomputed because the user can edit the ladder: recomputing would
   * quietly restate an old trade as if today's rules had applied to it.
   */
  pctOfFull: number;
}

const PREFIX = 'plansnap:';

export function planSnapshotKey(lotId: string): string {
  return PREFIX + lotId;
}

/**
 * Write the snapshot. Never overwrites: a plan snapshot is a record of a decision already
 * taken, and the only honest way to change it is not to.
 *
 * Failure is swallowed by the caller on purpose — a storage that is full must not cost the
 * user the trade they were recording.
 */
export async function savePlanSnapshot(ctx: AppContext, snap: PlanSnapshot): Promise<void> {
  if (!snap.lotId) return;
  await ctx.storage.set(planSnapshotKey(snap.lotId), snap);
}

/**
 * Read one lot's snapshot, or null.
 *
 * Normalised on the way in rather than cast. This blob syncs, it is the oldest data in the
 * app by construction, and the viewer walks `grade.outcomes` — a grade that arrives without
 * one would throw inside the report, which on screen is a button that does nothing.
 */
export async function loadPlanSnapshot(ctx: AppContext, lotId: string): Promise<PlanSnapshot | null> {
  if (!lotId) return null;
  const raw = await ctx.storage.get<Partial<PlanSnapshot>>(planSnapshotKey(lotId)).catch(() => null);
  if (!raw) return null;
  const symbol = typeof raw.symbol === 'string' ? raw.symbol.toUpperCase() : '';
  const lv = raw.levels && typeof raw.levels === 'object' ? raw.levels : null;
  return {
    lotId,
    symbol,
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
    date: typeof raw.date === 'string' ? raw.date : '',
    plan: normalizePlan(raw.plan ?? {}, symbol),
    grade: validGrade(raw.grade),
    effective: raw.effective ?? null,
    levels: {
      entry: numOrNull(lv?.entry),
      stop: numOrNull(lv?.stop),
      target: numOrNull(lv?.target),
    },
    shares: typeof raw.shares === 'number' && Number.isFinite(raw.shares) ? raw.shares : 0,
    currency: raw.currency === 'EUR' ? 'EUR' : 'USD',
    // 100, not 0: an unreadable ladder share must not print a trade as having been allowed
    // no size at all, which reads as a refusal the app never made.
    pctOfFull: typeof raw.pctOfFull === 'number' && Number.isFinite(raw.pctOfFull) ? raw.pctOfFull : 100,
  };
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * A grade the report can render, or null.
 *
 * The whole thing is dropped rather than patched: a `GradeResult` missing its outcomes is not
 * a grade with a gap, it is a letter with nothing behind it, and printing that under the word
 * "Scorecard" would be the report making a claim it cannot show.
 */
function validGrade(raw: unknown): GradeResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Partial<GradeResult>;
  if (!Array.isArray(g.outcomes)) return null;
  if (typeof g.score !== 'number' || !Number.isFinite(g.score)) return null;
  return g as GradeResult;
}

/**
 * Which lots have a plan on file — read once per repaint, so a row can offer the button only
 * when there is something behind it.
 *
 * The transaction table is rendered synchronously from `accounts`, so it cannot await a read
 * per row; and a button that opens an empty dialog on every historical trade would teach the
 * user to stop pressing it.
 */
export async function lotIdsWithPlan(ctx: AppContext): Promise<Set<string>> {
  const keys = await ctx.storage.list(PREFIX).catch(() => [] as string[]);
  return new Set(keys.map((k) => k.slice(PREFIX.length)).filter(Boolean));
}

/** Forget a lot's plan. Called when the lot itself is deleted, so nothing is orphaned. */
export async function deletePlanSnapshot(ctx: AppContext, lotId: string): Promise<void> {
  if (!lotId) return;
  await ctx.storage.delete(planSnapshotKey(lotId)).catch(() => {});
}
