import type {
  AccountState,
  BuyLot,
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
  stop?: number;
  target?: number;
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
    stop: input.stop,
    target: input.target,
  };
  state.lots.push(lot);
  return lot;
}

export interface SellInput {
  ticker: string;
  sellDate: string;
  sellPrice: number;
  shares: number;
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
