import type { AccountState, Bar, Order, OrderType } from '../types/index.js';
import type { IdFactory } from './ids.js';
import { buy, sell } from './lots.js';
import { computeCash } from './account.js';

export interface CreateOrderInput {
  ticker: string;
  type: OrderType;
  threshold: number;
  shares: number;
  createdDate: string;
  lotId?: string;
}

export function createOrder(
  state: AccountState,
  input: CreateOrderInput,
  nextId: IdFactory,
): Order {
  const order: Order = {
    id: nextId(),
    accountId: state.account.id,
    ticker: input.ticker.toUpperCase(),
    type: input.type,
    threshold: input.threshold,
    shares: input.shares,
    status: 'pending',
    createdDate: input.createdDate,
    lotId: input.lotId,
  };
  state.orders.push(order);
  return order;
}

export function cancelOrder(state: AccountState, orderId: string): void {
  const o = state.orders.find((x) => x.id === orderId);
  if (o && o.status === 'pending') o.status = 'cancelled';
}

export interface FillEvent {
  orderId: string;
  ticker: string;
  type: OrderType;
  date: string;
  price: number;
  shares: number;
  filled: boolean;
  reason?: string; // why it did NOT fill (e.g. insufficient cash)
}

/**
 * Process pending orders against new daily bars, scanning EACH missed day in
 * chronological order (not just the latest).
 *
 * Fill rules (use intraday High/Low, fill AT the threshold):
 *   BUY_STOP   fills when day.high >= threshold → fill price = threshold
 *   STOP_LOSS  fills when day.low  <= threshold → fill price = threshold
 *   TAKE_PROFIT fills when day.high >= threshold → fill price = threshold
 *
 * Insufficient cash for a BUY_STOP: DO NOT partially fill. Mark the order with
 * a rejection note (needed vs available cash and the date) and leave it pending
 * is NOT desired — per spec we "mark the order accordingly". We set status to
 * 'cancelled' with a note so it stops re-triggering, and emit a FillEvent with
 * filled=false + reason. (A future "retry" can recreate it.)
 *
 * `barsByTicker` must contain only NEW bars (those after the last processed
 * date), already sorted ascending. The caller is responsible for that slice.
 */
export function processOrders(
  state: AccountState,
  barsByTicker: Map<string, Bar[]>,
  nextId: IdFactory,
): FillEvent[] {
  const events: FillEvent[] = [];

  // Collect the set of dates across all tickers, processed chronologically, so
  // fills and cash deductions interleave in true date order.
  const dateSet = new Set<string>();
  for (const bars of barsByTicker.values()) for (const b of bars) dateSet.add(b.date);
  const dates = [...dateSet].sort();

  for (const date of dates) {
    for (const order of state.orders) {
      if (order.status !== 'pending') continue;
      const bars = barsByTicker.get(order.ticker);
      if (!bars) continue;
      const bar = bars.find((b) => b.date === date);
      if (!bar) continue;

      if (order.type === 'BUY_STOP') {
        if (bar.high >= order.threshold) {
          const cost = order.threshold * order.shares;
          const cash = computeCash(state);
          if (cost > cash) {
            order.status = 'cancelled';
            order.note = `Insufficient cash on ${date}: need ${round2(cost)}, have ${round2(cash)}`;
            events.push({
              orderId: order.id,
              ticker: order.ticker,
              type: order.type,
              date,
              price: order.threshold,
              shares: order.shares,
              filled: false,
              reason: order.note,
            });
            continue;
          }
          const lot = buy(
            state,
            {
              ticker: order.ticker,
              buyDate: date,
              buyPrice: order.threshold,
              shares: order.shares,
              reason: `BUY_STOP @ ${order.threshold}`,
            },
            nextId,
          );
          order.status = 'filled';
          order.filledDate = date;
          order.filledPrice = order.threshold;
          order.lotId = lot.id;
          events.push({
            orderId: order.id,
            ticker: order.ticker,
            type: order.type,
            date,
            price: order.threshold,
            shares: order.shares,
            filled: true,
          });
        }
      } else if (order.type === 'STOP_LOSS') {
        if (bar.low <= order.threshold) {
          fillExit(state, order, date, nextId, events);
        }
      } else if (order.type === 'TAKE_PROFIT') {
        if (bar.high >= order.threshold) {
          fillExit(state, order, date, nextId, events);
        }
      }
    }
  }

  return events;
}

/** Shared exit fill for STOP_LOSS / TAKE_PROFIT — sells `shares` at threshold. */
function fillExit(
  state: AccountState,
  order: Order,
  date: string,
  nextId: IdFactory,
  events: FillEvent[],
): void {
  // Cap at currently-held shares of the ticker.
  const held = state.lots
    .filter((l) => l.ticker === order.ticker && l.remainingShares > 0)
    .reduce((s, l) => s + l.remainingShares, 0);
  const qty = Math.min(order.shares, held);
  if (qty <= 0) {
    order.status = 'cancelled';
    order.note = `No open shares of ${order.ticker} to exit on ${date}`;
    events.push({
      orderId: order.id,
      ticker: order.ticker,
      type: order.type,
      date,
      price: order.threshold,
      shares: 0,
      filled: false,
      reason: order.note,
    });
    return;
  }
  sell(state, { ticker: order.ticker, sellDate: date, sellPrice: order.threshold, shares: qty }, nextId);
  order.status = 'filled';
  order.filledDate = date;
  order.filledPrice = order.threshold;
  events.push({
    orderId: order.id,
    ticker: order.ticker,
    type: order.type,
    date,
    price: order.threshold,
    shares: qty,
    filled: true,
  });
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
