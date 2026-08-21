/**
 * The latest known price per ticker, per account — one copy, shared.
 *
 * Extracted from `tabs/portfolioTab.ts` for the same reason `store.ts` was: the
 * assistant has to report the numbers the Portfolio table is showing. A second
 * price map filled from a second fetch would disagree with the table within
 * seconds of an Update, and the bug reads as "the chat says I'm up 4%, the table
 * says 6%" — which is worse than no assistant at all.
 *
 * ── WHAT IS IN HERE, AND WHAT IS DELIBERATELY NOT ───────────────────────────
 * A `PriceMap` value is ALREADY NORMALIZED to the account's currency: the tab
 * divides a USD close by the EURUSD rate before it lands here, because every
 * metric downstream (`buildPositions`, `computeAccountMetrics`) works in one
 * currency. That is why the FX machinery — `eurUsdForDate`, `latestEurUsdRate`,
 * the EURUSD bar cache — stays private to the tab: a reader of this map needs the
 * price, never the rate, and duplicating the conversion is how two copies drift.
 *
 * The map is memory-only and empty until the user runs an Update. That is a fact
 * callers must handle rather than a gap to paper over — see `hasPrices`. An
 * assistant that reported "your position is worth €0" because nothing had been
 * fetched yet would be stating a loss that did not happen.
 */
import type { PriceMap } from '@screener/core';

const priceCache = new Map<string, PriceMap>();

/** Prices for one account. Empty until an Update has run in this session. */
export function accountPrices(accId: string): PriceMap {
  return priceCache.get(accId) ?? {};
}

/** Replace an account's whole map — what an Update (or a re-normalization) does. */
export function setAccountPrices(accId: string, map: PriceMap): void {
  priceCache.set(accId, map);
}

/**
 * Record one price, so a manually-entered fill shows up in equity immediately
 * instead of waiting for the next Update.
 */
export function seedPrice(accId: string, ticker: string, price: number): void {
  const m = priceCache.get(accId) ?? {};
  m[ticker] = price;
  priceCache.set(accId, m);
}

/**
 * Whether this account has any prices at all.
 *
 * The honest answer to "what is my portfolio worth" before the first Update is
 * "I don't have prices yet", not a number computed from cost basis.
 */
export function hasPrices(accId: string): boolean {
  return Object.keys(priceCache.get(accId) ?? {}).length > 0;
}
