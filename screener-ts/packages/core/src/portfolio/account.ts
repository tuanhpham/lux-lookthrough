import type { Account, AccountState } from '../types/portfolio.js';
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
 * Net cash flows are dated deposits (+) / withdrawals (−) after opening.
 */
export function computeCash(state: AccountState): number {
  const bought = state.lots.reduce((s, l) => s + l.buyPrice * l.shares, 0);
  const sold = state.sells.reduce((s, r) => s + r.sellPrice * r.shares, 0);
  return state.account.initialCapital + netCashFlow(state) - bought + sold;
}

/** Sum of all cash deposits (+) and withdrawals (−). 0 for legacy accounts. */
export function netCashFlow(state: AccountState): number {
  return (state.cashFlows ?? []).reduce((s, f) => s + f.amount, 0);
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
