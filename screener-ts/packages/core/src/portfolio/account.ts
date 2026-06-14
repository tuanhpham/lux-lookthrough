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
 * Cash = initialCapital - total bought + total sold. Always computed, never
 * stored stale. "Total bought" uses each lot's ORIGINAL shares (buyPrice *
 * shares); "total sold" sums sell proceeds (sellPrice * shares).
 */
export function computeCash(state: AccountState): number {
  const bought = state.lots.reduce((s, l) => s + l.buyPrice * l.shares, 0);
  const sold = state.sells.reduce((s, r) => s + r.sellPrice * r.shares, 0);
  return state.account.initialCapital - bought + sold;
}

/** Total realized PnL across all sells. */
export function realizedPnL(state: AccountState): number {
  return state.sells.reduce((s, r) => s + r.realizedPnL, 0);
}
