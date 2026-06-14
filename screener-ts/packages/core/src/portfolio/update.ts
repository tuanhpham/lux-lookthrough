import type { AccountState, Bar, EquitySnapshot } from '../types/index.js';
import type { IdFactory } from './ids.js';
import { processOrders, type FillEvent } from './orders.js';
import { computeCash } from './account.js';
import { computeEquity, computePositionsValue, type PriceMap } from './metrics.js';

export interface UpdateInput {
  /** All freshly-fetched bars per held/ordered ticker (ascending). */
  barsByTicker: Map<string, Bar[]>;
  /** As-of date for the snapshot (caller supplies — core has no clock). */
  asOfDate: string;
}

export interface UpdateResult {
  fills: FillEvent[];
  snapshot: EquitySnapshot;
}

/**
 * The manual "Update" action:
 *   1. Process pending orders across every NEW day (caller passes only bars
 *      after each order's relevant window; here we pass full new bars and the
 *      order engine scans chronologically).
 *   2. Recompute cash / positions value / equity at the latest prices.
 *   3. Append an EquitySnapshot.
 *
 * `latestPrices` is derived from the last bar of each ticker's series.
 */
export function runUpdate(
  state: AccountState,
  input: UpdateInput,
  nextId: IdFactory,
): UpdateResult {
  const fills = processOrders(state, input.barsByTicker, nextId);

  const prices: PriceMap = {};
  for (const [ticker, bars] of input.barsByTicker.entries()) {
    if (bars.length) prices[ticker] = bars[bars.length - 1]!.close;
  }

  const cash = computeCash(state);
  const positionsValue = computePositionsValue(state, prices);
  const equity = computeEquity(state, prices);

  const snapshot: EquitySnapshot = {
    date: input.asOfDate,
    equity,
    cash,
    positionsValue,
  };
  state.snapshots.push(snapshot);

  return { fills, snapshot };
}
