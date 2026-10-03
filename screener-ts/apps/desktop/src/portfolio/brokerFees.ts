/**
 * Broker fees, recognised from the account's name.
 *
 * The user's rule (2026-10-03): an account called "Trade Republic …" always pays €1 an order,
 * "Scalable …" €0.99, "Degiro …" €2, "Equate Plus …" nothing — and the list has to be editable,
 * because brokers change their prices. So the fee is not typed per account any more; it is
 * looked up in this table by name, and an account only carries its own `fee` when the user
 * deliberately overrides the table for it.
 *
 * Stored under one synced key, so a price change made on the laptop is the price on the phone.
 */
import type { Account } from '@screener/core';
import type { AppContext } from '../context.js';

export interface BrokerFee {
  /** What the account name starts with (or contains), e.g. "Trade Republic". */
  name: string;
  /** Flat fee per order, in the account's currency. */
  fee: number;
}

export const DEFAULT_BROKER_FEES: readonly BrokerFee[] = [
  { name: 'Trade Republic', fee: 1 },
  { name: 'Scalable', fee: 0.99 },
  { name: 'Degiro', fee: 2 },
  { name: 'Equate Plus', fee: 0 },
];

const KEY = 'broker_fees';
let cache: BrokerFee[] = [...DEFAULT_BROKER_FEES];

/** "Trade-Republic", "trade republic", "TradeRepublic" are one broker. */
const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

/** The broker an account name belongs to: the longest table name it starts with, else contains. */
export function brokerOf(accountName: string, rows: readonly BrokerFee[] = cache): BrokerFee | null {
  const n = norm(accountName);
  if (!n) return null;
  const hits = rows.filter((r) => norm(r.name) && n.includes(norm(r.name)));
  hits.sort((a, b) => Number(n.startsWith(norm(b.name))) - Number(n.startsWith(norm(a.name))) || norm(b.name).length - norm(a.name).length);
  return hits[0] ?? null;
}

/** The fee an order in this account pays: its own override, else its broker's, else 0. */
export function feeOf(account: Pick<Account, 'name' | 'fee'>, rows: readonly BrokerFee[] = cache): number {
  if (typeof account.fee === 'number' && Number.isFinite(account.fee)) return account.fee;
  return brokerOf(account.name, rows)?.fee ?? 0;
}

export function brokerFees(): BrokerFee[] {
  return cache.map((r) => ({ ...r }));
}

/** Field by field: the blob syncs and may come from a device older than any rule here. */
function clean(raw: unknown): BrokerFee[] {
  if (!Array.isArray(raw)) return [...DEFAULT_BROKER_FEES];
  return raw
    .map((r) => ({ name: String((r as BrokerFee)?.name ?? '').trim().slice(0, 40), fee: Number((r as BrokerFee)?.fee) }))
    .filter((r) => r.name && Number.isFinite(r.fee) && r.fee >= 0);
}

export async function loadBrokerFees(ctx: AppContext): Promise<BrokerFee[]> {
  const raw = await ctx.storage.get<unknown>(KEY).catch(() => null);
  cache = raw === null || raw === undefined ? [...DEFAULT_BROKER_FEES] : clean(raw);
  return brokerFees();
}

export async function saveBrokerFees(ctx: AppContext, rows: readonly BrokerFee[]): Promise<void> {
  cache = clean(rows);
  await ctx.storage.set(KEY, cache);
}
