import type {
  AccountState,
  BuyLot,
  CashFlow,
  SellRecord,
  SignalType,
} from '../types/index.js';
import type { IdFactory } from './ids.js';
import { pyRound } from '../util/round.js';

export interface BuyInput {
  ticker: string;
  buyDate: string;
  buyPrice: number;
  shares: number;
  reason?: string;
  signal?: SignalType;
  rating?: 'A' | 'B' | 'C' | 'D';
  setupType?: string;
  stop?: number;
  target?: number;
  priceCurrency?: 'EUR' | 'USD';
  fxRateAtBuy?: number;
  /** Fee paid, in the account's currency. */
  fee?: number;
}

/** Record a manual buy as a new lot. Mutates and returns the state. */
export function buy(state: AccountState, input: BuyInput, nextId: IdFactory): BuyLot {
  if (input.shares <= 0) throw new Error('buy: shares must be > 0');
  if (input.buyPrice < 0) throw new Error('buy: price must be >= 0');
  const lot: BuyLot = {
    id: nextId(),
    accountId: state.account.id,
    ticker: input.ticker.toUpperCase(),
    buyDate: input.buyDate,
    buyPrice: input.buyPrice,
    shares: input.shares,
    remainingShares: input.shares,
    reason: input.reason,
    signal: input.signal,
    rating: input.rating,
    setupType: input.setupType,
    stop: input.stop,
    target: input.target,
    priceCurrency: input.priceCurrency,
    fxRateAtBuy: input.fxRateAtBuy,
  };
  if (input.fee) lot.fee = input.fee;
  state.lots.push(lot);
  return lot;
}

export interface SellInput {
  ticker: string;
  sellDate: string;
  sellPrice: number;
  shares: number;
  /** Fee for the whole order, in the account's currency — booked on the first record. */
  fee?: number;
}

/**
 * Sell shares of a ticker, matching open lots FIFO (oldest buyDate first, then
 * insertion order). Partial sells allowed; each matched lot produces one
 * SellRecord with realizedPnL = (sellPrice - lot.buyPrice) * sharesFromLot.
 * The lot's remainingShares shrinks accordingly.
 *
 * Throws if there are not enough open shares to satisfy the sell.
 */
export function sell(
  state: AccountState,
  input: SellInput,
  nextId: IdFactory,
): SellRecord[] {
  const ticker = input.ticker.toUpperCase();
  if (input.shares <= 0) throw new Error('sell: shares must be > 0');

  const openLots = state.lots
    .filter((l) => l.ticker === ticker && l.remainingShares > 0)
    .sort((a, b) =>
      a.buyDate < b.buyDate ? -1 : a.buyDate > b.buyDate ? 1 : 0,
    ); // stable: ties keep insertion order

  const available = openLots.reduce((s, l) => s + l.remainingShares, 0);
  if (input.shares > available) {
    throw new Error(
      `sell: not enough shares of ${ticker} (have ${available}, tried ${input.shares})`,
    );
  }

  let remaining = input.shares;
  const records: SellRecord[] = [];
  for (const lot of openLots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.remainingShares, remaining);
    const realized = pyRound((input.sellPrice - lot.buyPrice) * take, 6);
    const rec: SellRecord = {
      id: nextId(),
      accountId: state.account.id,
      ticker,
      lotId: lot.id,
      sellDate: input.sellDate,
      sellPrice: input.sellPrice,
      shares: take,
      realizedPnL: realized,
    };
    if (input.fee && !records.length) rec.fee = input.fee;
    lot.remainingShares -= take;
    remaining -= take;
    state.sells.push(rec);
    records.push(rec);
  }
  return records;
}

/** Update (or clear) a lot's stop — risk recalculates downstream. */
export function setStop(state: AccountState, lotId: string, stop: number | undefined): void {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot) throw new Error(`setStop: lot ${lotId} not found`);
  lot.stop = stop;
}

/** Set (or clear) a buy lot's rich-text note. Empty string clears it. */
export function setLotNote(state: AccountState, lotId: string, note: string | undefined): void {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot) throw new Error(`setLotNote: lot ${lotId} not found`);
  lot.reason = note && note.trim() ? note : undefined;
}

/** Set (or clear) a buy lot's A–D rating. Empty/undefined clears it. */
export function setLotRating(state: AccountState, lotId: string, rating: 'A' | 'B' | 'C' | 'D' | undefined): void {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot) throw new Error(`setLotRating: lot ${lotId} not found`);
  lot.rating = rating;
}

/** Set (or clear) a buy lot's setup type. Empty string clears it. */
export function setLotSetup(state: AccountState, lotId: string, setupType: string | undefined): void {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot) throw new Error(`setLotSetup: lot ${lotId} not found`);
  lot.setupType = setupType && setupType.trim() ? setupType : undefined;
}

/** Set (or clear) a sell record's rich-text note. Empty string clears it. */
export function setSellNote(state: AccountState, sellId: string, note: string | undefined): void {
  const rec = state.sells.find((s) => s.id === sellId);
  if (!rec) throw new Error(`setSellNote: sell ${sellId} not found`);
  rec.note = note && note.trim() ? note : undefined;
}

/**
 * Delete a single sell record and return its shares to the matched lot's
 * remainingShares (so cash, positions, and PnL recompute as if it never
 * happened). Useful for correcting paper-trade mistakes.
 */
export function deleteSell(state: AccountState, sellId: string): void {
  const idx = state.sells.findIndex((s) => s.id === sellId);
  if (idx < 0) return;
  const rec = state.sells[idx]!;
  const lot = state.lots.find((l) => l.id === rec.lotId);
  if (lot) lot.remainingShares = Math.min(lot.shares, lot.remainingShares + rec.shares);
  state.sells.splice(idx, 1);
}

/**
 * Delete a buy lot and any sells matched against it (those sells would be
 * orphaned otherwise). All derived figures recompute from what remains.
 */
export function deleteLot(state: AccountState, lotId: string): void {
  state.sells = state.sells.filter((s) => s.lotId !== lotId);
  state.lots = state.lots.filter((l) => l.id !== lotId);
}

export interface CashFlowInput {
  date: string;
  amount: number; // + deposit, − withdrawal
  note?: string;
}

/** Record a dated cash deposit (+) or withdrawal (−). Cash recomputes downstream. */
export function addCashFlow(state: AccountState, input: CashFlowInput, nextId: IdFactory): CashFlow {
  if (!input.amount) throw new Error('addCashFlow: amount must be non-zero');
  const flow: CashFlow = {
    id: nextId(),
    accountId: state.account.id,
    date: input.date,
    amount: input.amount,
    note: input.note,
  };
  (state.cashFlows ??= []).push(flow);
  return flow;
}

/** Delete a cash flow by id. No-op if absent. */
export function deleteCashFlow(state: AccountState, flowId: string): void {
  if (!state.cashFlows) return;
  state.cashFlows = state.cashFlows.filter((f) => f.id !== flowId);
}

// ── Corrections ───────────────────────────────────────────────────────────────
// A paper trade booked with a typo (CHAT-100: "we might mistakenly save some wrong transaction
// with a little change needed") used to mean delete and re-enter, which also threw away its
// note, setup, rating and the frozen plan keyed by the lot id. These edit in place, keep the ids,
// and re-derive everything that depends on the edited figure.

export interface LotPatch {
  buyDate?: string;
  buyPrice?: number;
  shares?: number;
  stop?: number | null;
  target?: number | null;
  fee?: number | null;
}

/**
 * Correct a buy lot. Shares cannot drop below what has already been sold from it; the date
 * cannot move after its first sale. A new price re-prices every sale matched to the lot, since
 * a sale's realised P&L is measured against this lot's price.
 */
export function editLot(state: AccountState, lotId: string, patch: LotPatch): BuyLot {
  const lot = state.lots.find((l) => l.id === lotId);
  if (!lot) throw new Error(`editLot: lot ${lotId} not found`);
  const sells = state.sells.filter((s) => s.lotId === lotId);
  const sold = lot.shares - lot.remainingShares;
  if (patch.shares !== undefined) {
    if (!(patch.shares > 0)) throw new Error('editLot: shares must be > 0');
    if (patch.shares < sold) throw new Error(`editLot: ${sold} shares of this lot are already sold`);
  }
  if (patch.buyPrice !== undefined && !(patch.buyPrice >= 0)) throw new Error('editLot: price must be >= 0');
  if (patch.buyDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.buyDate)) throw new Error('editLot: date must be YYYY-MM-DD');
    const first = sells.map((s) => s.sellDate).sort()[0];
    if (first && patch.buyDate > first) throw new Error(`editLot: the lot was already sold on ${first}`);
    lot.buyDate = patch.buyDate;
  }
  if (patch.shares !== undefined) {
    lot.shares = patch.shares;
    lot.remainingShares = patch.shares - sold;
  }
  if (patch.buyPrice !== undefined) {
    lot.buyPrice = patch.buyPrice;
    for (const s of sells) s.realizedPnL = pyRound((s.sellPrice - lot.buyPrice) * s.shares, 6);
  }
  if (patch.stop !== undefined) lot.stop = patch.stop === null ? undefined : patch.stop;
  if (patch.target !== undefined) lot.target = patch.target === null ? undefined : patch.target;
  if (patch.fee !== undefined) { if (patch.fee) lot.fee = patch.fee; else delete lot.fee; }
  return lot;
}

export interface SellPatch {
  sellDate?: string;
  sellPrice?: number;
  shares?: number;
  fee?: number | null;
}

/**
 * Correct one sell record. More shares can only come from what the lot still holds; the date
 * cannot be before the buy. Realised P&L is re-derived from the corrected figures.
 */
export function editSell(state: AccountState, sellId: string, patch: SellPatch): SellRecord {
  const rec = state.sells.find((s) => s.id === sellId);
  if (!rec) throw new Error(`editSell: sell ${sellId} not found`);
  const lot = state.lots.find((l) => l.id === rec.lotId);
  if (patch.shares !== undefined) {
    if (!(patch.shares > 0)) throw new Error('editSell: shares must be > 0');
    const room = (lot?.remainingShares ?? 0) + rec.shares;
    if (patch.shares > room) throw new Error(`editSell: the lot only has ${room} shares for this sale`);
  }
  if (patch.sellPrice !== undefined && !(patch.sellPrice >= 0)) throw new Error('editSell: price must be >= 0');
  if (patch.sellDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.sellDate)) throw new Error('editSell: date must be YYYY-MM-DD');
    if (lot && patch.sellDate < lot.buyDate) throw new Error(`editSell: the lot was bought on ${lot.buyDate}`);
    rec.sellDate = patch.sellDate;
  }
  if (patch.shares !== undefined) {
    if (lot) lot.remainingShares = lot.remainingShares + rec.shares - patch.shares;
    rec.shares = patch.shares;
  }
  if (patch.sellPrice !== undefined) rec.sellPrice = patch.sellPrice;
  if (patch.fee !== undefined) { if (patch.fee) rec.fee = patch.fee; else delete rec.fee; }
  if (lot) rec.realizedPnL = pyRound((rec.sellPrice - lot.buyPrice) * rec.shares, 6);
  return rec;
}

/** Correct a cash deposit / withdrawal. */
export function editCashFlow(state: AccountState, flowId: string, patch: CashFlowInput): CashFlow {
  const f = state.cashFlows?.find((x) => x.id === flowId);
  if (!f) throw new Error(`editCashFlow: flow ${flowId} not found`);
  if (!patch.amount) throw new Error('editCashFlow: amount must be non-zero');
  f.date = patch.date;
  f.amount = patch.amount;
  f.note = patch.note;
  return f;
}
