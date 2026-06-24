/**
 * Case Studies — a journal of annotated past setups. Each entry pins a stock to
 * a key date with trade levels, dated catalysts and notes, for documenting how a
 * setup looked and played out. Stored through ctx.storage so it SYNCS across
 * devices (same SyncedStorage layer as watchlists/posts/accounts).
 *
 * Storage layout: `casestudies:index` → CaseStudyMeta[]; `casestudy:<id>` → CaseStudy.
 */
import type { AppContext } from '../context.js';

/** A dated catalyst / news note attached to a case study. */
export interface Catalyst {
  date: string; // ISO YYYY-MM-DD
  text: string;
}

export type CaseOutcome = 'win' | 'loss' | 'open' | 'scratch';

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
  entry: number | null;
  stop: number | null;
  target: number | null;
  exitDate: string | null;
  exitPrice: number | null;
  /** Realized R-multiple, if computed/entered. */
  rMultiple: number | null;
  catalysts: Catalyst[];
  /** Free-form markdown-ish notes / lessons learned. */
  notes: string;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
}

export interface CaseStudyMeta {
  id: string;
  symbol: string;
  title: string;
  keyDate: string;
  outcome: CaseOutcome;
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
