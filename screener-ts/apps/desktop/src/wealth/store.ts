/**
 * The Wealth Status book and its exchange rates — storage only; the model is in
 * `@screener/core` (`wealth/`).
 *
 * ── ONE SYNCED KEY, WRITTEN ONLY AFTER HYDRATION ────────────────────────────
 * `wealth` holds every non-portfolio account and every balance reading. It is a few KB
 * and it is the user's own typing, so it syncs like `accounts`. And like `accounts` it is
 * ONE blob resolved last-write-wins, so a save made before the first pull lands would stamp
 * an empty book with a fresh "now" and wipe the real one on every device. `saveBook`
 * therefore refuses before hydration — the page says "still syncing" and the user presses
 * Save again a second later, which is recoverable; the other outcome is not.
 *
 * ── THE RATES ARE THIS DEVICE'S ─────────────────────────────────────────────
 * EURUSD and EURVND daily bars live under `wealth_fx:`, which is local-only (see
 * `LOCAL_ONLY_PREFIXES`): market data, re-fetchable in one request each. EURUSD is seeded
 * from the Portfolio's own `pf_eurusd_bars` when this cache is empty, so a device that
 * has pressed Portfolio Update can convert dollars before its first Wealth Update.
 */
import {
  computeAccountMetrics,
  makeFxTable,
  normalizeBook,
  WEALTH_CURRENCIES,
  type AccountState,
  type Bar,
  type FxTable,
  type PortfolioLine,
  type WealthBook,
  type WealthCurrency,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { isHydrated } from '../adapters/storage.js';
import { today } from '../portfolio/store.js';

export const WEALTH_KEY = 'wealth';
const FX_PREFIX = 'wealth_fx:';
const PF_EURUSD_KEY = 'pf_eurusd_bars';
/** Yahoo quotes both as units per EUR, which is what `makeFxTable` expects. */
const FX_SYMBOL: Record<Exclude<WealthCurrency, 'EUR'>, string> = { USD: 'EURUSD=X', VND: 'EURVND=X' };

export async function loadBook(ctx: AppContext): Promise<WealthBook> {
  return normalizeBook(await ctx.storage.get<unknown>(WEALTH_KEY));
}

export async function saveBook(ctx: AppContext, book: WealthBook): Promise<void> {
  if (!isHydrated()) throw new Error('still syncing — try again in a moment');
  await ctx.storage.set(WEALTH_KEY, book);
}

async function cachedBars(ctx: AppContext, ccy: 'USD' | 'VND'): Promise<Bar[]> {
  const own = (await ctx.storage.get<Bar[]>(FX_PREFIX + ccy)) ?? [];
  if (own.length || ccy !== 'USD') return own;
  return (await ctx.storage.get<Bar[]>(PF_EURUSD_KEY)) ?? [];
}

/** The rate table from what this device already has. No network. */
export async function loadFx(ctx: AppContext): Promise<FxTable> {
  const [USD, VND] = await Promise.all([cachedBars(ctx, 'USD'), cachedBars(ctx, 'VND')]);
  return makeFxTable({ USD, VND });
}

type Period = '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y';
function periodFor(days: number): Period {
  if (days <= 30) return '1mo';
  if (days <= 90) return '3mo';
  if (days <= 180) return '6mo';
  if (days <= 365) return '1y';
  if (days <= 730) return '2y';
  return '5y';
}

/**
 * Top up the rates back to `from` (the chart's start) and up to today.
 *
 * Always re-fetches the tail, `fresh`: today's FX bar is a live patch, and skipping it is
 * the exact bug that made Portfolio Update do nothing (see CHAT-44). A cache that does not
 * reach back to `from` is re-fetched whole rather than patched, or the early part of the
 * chart would be converted at the first rate it happens to know.
 *
 * Returns the currencies that could not be fetched; their cached bars, if any, stay.
 */
export async function refreshFx(ctx: AppContext, from: string, need: readonly WealthCurrency[]): Promise<WealthCurrency[]> {
  const failed: WealthCurrency[] = [];
  const now = Date.now();
  for (const ccy of ['USD', 'VND'] as const) {
    if (!need.includes(ccy)) continue;
    try {
      const cached = await cachedBars(ctx, ccy);
      const first = cached[0]?.date;
      const last = cached[cached.length - 1]?.date;
      const whole = !first || !last || first > from;
      const since = whole ? from : last;
      const days = Math.ceil((now - Date.parse(since)) / 86_400_000) + 3;
      const got = await ctx.data.getOHLCV(FX_SYMBOL[ccy], periodFor(days), { fresh: true });
      if (!got?.bars.length) {
        failed.push(ccy);
        continue;
      }
      const m = new Map<string, Bar>();
      for (const b of whole ? [] : cached) m.set(b.date, b);
      for (const b of got.bars) m.set(b.date, b);
      const merged = [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
      await ctx.storage.set(FX_PREFIX + ccy, merged);
    } catch {
      failed.push(ccy);
    }
  }
  return failed;
}

// ── The portfolio side ─────────────────────────────────────────────────────

export interface PortfolioSide {
  lines: PortfolioLine[];
  /** The newest snapshot date across accounts — "portfolio as of". */
  asOf: string | null;
  /** Accounts holding positions with no snapshot on this device: not in the total. */
  missing: string[];
}

/**
 * Each portfolio account as a dated equity line, from its persisted `snapshots` — the
 * series the Portfolio Overview draws. Here, not in the tab, because the assistant's
 * `get_wealth` must count exactly what the page counts.
 */
export function portfolioSide(accounts: readonly AccountState[]): PortfolioSide {
  const lines: PortfolioLine[] = [];
  const missing: string[] = [];
  let asOf: string | null = null;
  for (const a of accounts) {
    const ccy: WealthCurrency = (WEALTH_CURRENCIES as readonly string[]).includes(a.account.currency)
      ? (a.account.currency as WealthCurrency)
      : 'EUR';
    const snaps = a.snapshots ?? [];
    if (snaps.length) {
      lines.push({ currency: ccy, points: snaps.map((s) => ({ date: s.date, equity: s.equity })) });
      const last = snaps[snaps.length - 1]!.date;
      if (!asOf || last > asOf) asOf = last;
      continue;
    }
    if (a.lots.some((l) => l.remainingShares > 0)) {
      missing.push(a.account.name);
      continue;
    }
    // No positions: `update()` keeps no snapshots, and equity is cash, which needs no price.
    const cash = computeAccountMetrics(a, {}).equity;
    if (cash) lines.push({ currency: ccy, points: [{ date: a.account.createdAt || today(), equity: cash }] });
  }
  return { lines, asOf, missing };
}
