/**
 * EURUSD, per day — one copy, shared.
 *
 * ── WHY THIS LEFT THE PORTFOLIO TAB ─────────────────────────────────────────
 * `prices.ts` says the FX machinery stays private to the tab because "a reader of
 * this map needs the price, never the rate". That was true while only the tab could
 * WRITE a trade. It stopped being true the moment the assistant could record one:
 * a lot entered at $232.50 in a EUR account is stored as its EUR equivalent, and
 * the divisor is the rate ON THE TRADE DATE. Recomputing that rate from a second
 * cache would put two different numbers on the same trade depending on who booked
 * it — the exact drift `store.ts` and `prices.ts` were extracted to prevent.
 *
 * The bars themselves are still fetched and cached by the Portfolio tab (they are
 * part of its Update), and still stored under the device-local `pf_eurusd_bars`.
 * This module only holds them in memory and answers questions about them.
 *
 * ── WHAT THE FALLBACK MEANS, AND WHY THERE IS ALSO `hasEurUsd` ───────────────
 * `eurUsdForDate` falls back to the latest known rate and finally to 1, because
 * every DISPLAY path needs a number to render and 1 is the only neutral one. A
 * WRITE path must not accept that: converting $232.50 at a rate of 1 silently
 * records €232.50, a 10% error in the cost basis that nothing downstream can spot.
 * So writers ask `hasEurUsd()` first and refuse, which is why the two live together
 * here rather than the fallback being everyone's problem.
 */
import type { Bar } from '@screener/core';
import type { AppContext } from '../context.js';

/** The device-local cache the Portfolio tab fills on Update. */
const EURUSD_CACHE_KEY = 'pf_eurusd_bars';

let latest: number | null = null;
let latestDate: string | null = null;
const byDate = new Map<string, number>();

/** Merge EURUSD=X daily bars into the in-memory rate table. */
export function applyEurUsdBars(bars: readonly Bar[]): void {
  for (const b of bars) byDate.set(b.date, b.close);
  if (bars.length) {
    const last = bars[bars.length - 1]!;
    latest = last.close;
    latestDate = last.date;
  }
}

/**
 * Rate for one date: 1 EUR = N USD.
 *
 * Falls back to the latest rate for a date with no bar (a weekend, a holiday, or
 * today before the close), and to 1 when nothing has been loaded at all. See the
 * header for why a writer must check `hasEurUsd()` instead of trusting that 1.
 */
export function eurUsdForDate(date: string): number {
  return byDate.get(date) ?? latest ?? 1;
}

/** The most recent rate, or null when none has been loaded. */
export function latestEurUsd(): number | null {
  return latest;
}

/** Whether any rate is known — i.e. whether a conversion would be real. */
export function hasEurUsd(): boolean {
  return latest !== null;
}

/**
 * The latest rate WITH the date it came from, for a reader outside this app.
 *
 * The scanner VM has to compare a stop level stored in euros against a USD quote,
 * and it has no FX source of its own. It could grow one — but then the level it
 * alerts on would be computed from a different rate than the one the Portfolio tab
 * shows, so the message and the screen would disagree about the same stop. Publishing
 * the rate the portfolio itself uses keeps one number in play, and the `date` is the
 * part that lets the reader decide the rate is too old to trust instead of quietly
 * converting with a stale one.
 */
export function latestEurUsdAsOf(): { rate: number; date: string } | null {
  return latest !== null && latestDate ? { rate: latest, date: latestDate } : null;
}

/**
 * Load the cached rates if nothing is in memory yet.
 *
 * The assistant can be asked to record a trade in a session where the Portfolio tab
 * was never opened, so its Update never ran and this table is empty. The cache on
 * disk is usually days old at worst and needs no network, which is enough to book a
 * trade against a real rate instead of refusing. Nothing is fetched here on purpose:
 * a chat message must not start a market-data download.
 */
export async function ensureEurUsd(ctx: AppContext): Promise<void> {
  if (hasEurUsd()) return;
  const bars = (await ctx.storage.get<Bar[]>(EURUSD_CACHE_KEY)) ?? [];
  applyEurUsdBars(bars);
}
