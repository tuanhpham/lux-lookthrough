/**
 * The Trade Station's case studies: opened at the buy, written to by every sell.
 *
 * The user's rule (2026-10-03): a study is created when the trade is bought. A trade booked
 * entirely in the past — bought AND sold in one go — is filed closed; anything still held is
 * filed open, and the sells close it. So a study here is not a post-mortem typed afterwards
 * but the trade's own record, which is why it carries `fills` and the lots it bought.
 *
 * Pure: no storage, no DOM, so the arithmetic that decides "closed, at what price, for how
 * many R" is testable without the page. Prices stay in the currency they were typed in, the
 * same rule `CaseStudy.currency` follows everywhere else.
 */
import { autoCaseTitle, exitMath, emptyExit } from './planExit.js';
import { newCaseId, type CaseFill, type CaseRating, type CaseStudy } from '../caseStudies/store.js';

export interface StationBuy {
  symbol: string;
  accountId: string;
  lotId: string;
  date: string;
  shares: number;
  price: number;
  currency: 'EUR' | 'USD';
  fee?: number;
  stop: number | null;
  target: number | null;
  setup: string;
  rating: CaseRating;
  /** Sanitised HTML. */
  notes: string;
  todayIso: string;
}

export interface StationSell {
  date: string;
  shares: number;
  /** In the study's currency already — the caller converts. */
  price: number;
  fee?: number;
  /** Shares of this trade still held in the account after the sale. 0 closes the study. */
  heldAfter: number;
  /** The reason as the user reads it, and as a key when it came from the list. */
  reason: string;
  reasonKey?: string;
}

/** A fresh study for a buy. Open until a sell (`applySell`) takes the holding to zero. */
export function caseForBuy(b: StationBuy): CaseStudy {
  const fill: CaseFill = {
    date: b.date, side: 'buy', shares: b.shares, price: b.price, currency: b.currency,
    ...(b.fee ? { fee: b.fee } : {}),
  };
  const setupType = b.setup || 'Other';
  return {
    id: newCaseId(),
    symbol: b.symbol.toUpperCase(),
    title: autoCaseTitle(b.symbol, b.date, setupType),
    keyDate: b.date,
    windowMonths: 3,
    setupType,
    outcome: 'open',
    rating: b.rating,
    entry: b.price,
    stop: b.stop,
    target: b.target,
    exitDate: null,
    exitPrice: null,
    rMultiple: null,
    ...(b.currency === 'EUR' ? { currency: 'EUR' as const } : {}),
    catalysts: [],
    notes: b.notes,
    accountId: b.accountId,
    lotIds: [b.lotId],
    fills: [fill],
    createdAt: b.todayIso,
    updatedAt: b.todayIso,
  };
}

const sum = (xs: readonly number[]): number => xs.reduce((s, v) => s + v, 0);

/** Share-weighted average price of one side's fills, or null when there are none. */
export function avgFill(fills: readonly CaseFill[], side: 'buy' | 'sell'): number | null {
  const f = fills.filter((x) => x.side === side && x.shares > 0);
  const n = sum(f.map((x) => x.shares));
  return n > 0 ? sum(f.map((x) => x.price * x.shares)) / n : null;
}

/**
 * Record a sale on the study. Mutates and returns it.
 *
 * While shares remain the study stays open and only gains the fill. When the last share goes,
 * it closes: the exit is the average of every sell (scaling out of a winner is one exit at
 * its average, not three studies), the entry the average of every buy, and R is measured
 * against the PLANNED stop, exactly as `exitMath` does for the planner.
 */
export function applySell(study: CaseStudy, s: StationSell, todayIso: string): CaseStudy {
  const fills = study.fills ?? [];
  fills.push({
    date: s.date, side: 'sell', shares: s.shares, price: s.price, currency: study.currency ?? 'USD',
    ...(s.fee ? { fee: s.fee } : {}),
  });
  study.fills = fills;
  study.updatedAt = todayIso;
  if (s.heldAfter > 0) return study;

  const entry = avgFill(fills, 'buy') ?? study.entry;
  const exitPrice = avgFill(fills, 'sell');
  const bought = sum(fills.filter((f) => f.side === 'buy').map((f) => f.shares));
  const m = exitMath({
    entry,
    stop: study.stop,
    shares: bought,
    date: study.keyDate,
    exit: { ...emptyExit(), date: s.date, price: exitPrice },
  });
  study.entry = entry === null ? null : round4(entry);
  study.exitDate = s.date;
  study.exitPrice = exitPrice === null ? null : round4(exitPrice);
  study.rMultiple = m.rMultiple;
  study.outcome = m.outcome;
  if (s.reason) study.exitReason = s.reason;
  if (s.reasonKey) study.exitReasonKey = s.reasonKey;
  return study;
}

/** The open study a sale of these lots belongs to, if any. */
export function studyForLots(studies: readonly CaseStudy[], accountId: string, lotIds: readonly string[]): CaseStudy | null {
  return studies.find((c) => c.accountId === accountId && c.outcome === 'open'
    && (c.lotIds ?? []).some((id) => lotIds.includes(id))) ?? null;
}

function round4(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}
