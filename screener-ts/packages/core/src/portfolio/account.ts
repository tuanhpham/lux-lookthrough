import type { Account, AccountState, CashFlow } from '../types/portfolio.js';
import type { IdFactory } from './ids.js';

export interface CreateAccountInput {
  name: string;
  description?: string;
  initialCapital: number;
  currency?: string;
  createdAt: string; // caller supplies the date (core has no clock)
}

/** Create a fresh, empty account state. */
export function createAccount(input: CreateAccountInput, nextId: IdFactory): AccountState {
  const account: Account = {
    id: nextId(),
    name: input.name,
    description: input.description,
    initialCapital: input.initialCapital,
    currency: input.currency ?? 'EUR',
    createdAt: input.createdAt,
  };
  return { account, lots: [], sells: [], orders: [], snapshots: [] };
}

/**
 * Cash = initialCapital + net cash flows - total bought + total sold. Always
 * computed, never stored stale. "Total bought" uses each lot's ORIGINAL shares
 * (buyPrice * shares); "total sold" sums sell proceeds (sellPrice * shares).
 * Net cash flows are dated deposits (+) / withdrawals (−) after opening, plus the
 * dividends, interest and tax booked as cash (`netIncomeFlow`).
 */
export function computeCash(state: AccountState): number {
  const bought = state.lots.reduce((s, l) => s + l.buyPrice * l.shares, 0);
  const sold = state.sells.reduce((s, r) => s + r.sellPrice * r.shares, 0);
  return state.account.initialCapital + netCashFlow(state) + netIncomeFlow(state) - bought + sold - totalFees(state);
}

/** A deposit from / withdrawal to the bank — capital. Dividends, interest and tax are return. */
export function isCapitalFlow(f: Pick<CashFlow, 'kind'>): boolean {
  return !f.kind || f.kind === 'deposit' || f.kind === 'withdraw';
}

/** Dividends, interest, tax withheld and tax corrections: cash the positions earned or paid. */
export function netIncomeFlow(state: AccountState): number {
  return (state.cashFlows ?? []).reduce((s, f) => s + (isCapitalFlow(f) ? 0 : f.amount), 0);
}

/** Every fee paid on this account's buys and sells. 0 on accounts that never set one. */
export function totalFees(state: AccountState): number {
  const f = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return state.lots.reduce((s, l) => s + f(l.fee), 0) + state.sells.reduce((s, r) => s + f(r.fee), 0);
}

/**
 * Sum of the capital deposits (+) and withdrawals (−) — the money put in. 0 for legacy accounts.
 * Not dividends or tax (`netIncomeFlow`): counted here they would read as capital, not return.
 */
export function netCashFlow(state: AccountState): number {
  return (state.cashFlows ?? []).reduce((s, f) => s + (isCapitalFlow(f) ? f.amount : 0), 0);
}

/**
 * Total capital available on (and including) a date: opening capital, plus all
 * cash flows dated on/before that date, plus realized PnL from sells that
 * occurred STRICTLY BEFORE that date. Used to weight a position against the
 * capital the account actually held when the position was opened.
 */
export function capitalAsOf(state: AccountState, date: string): number {
  const flows = (state.cashFlows ?? [])
    .filter((f) => f.date <= date)
    .reduce((s, f) => s + f.amount, 0);
  const priorRealized = state.sells
    .filter((r) => r.sellDate < date)
    .reduce((s, r) => s + r.realizedPnL, 0);
  return state.account.initialCapital + flows + priorRealized;
}

/** Total realized PnL across all sells. */
export function realizedPnL(state: AccountState): number {
  return state.sells.reduce((s, r) => s + r.realizedPnL, 0);
}
