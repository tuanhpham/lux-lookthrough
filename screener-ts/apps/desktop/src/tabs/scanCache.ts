/**
 * Once-a-day scan-result persistence. A full scan over a large universe costs
 * thousands of requests, so we save the COMPUTED result rows (not the raw bars)
 * keyed by strategy+market+universe and the trading day. On opening the tab, if
 * today's results exist they render instantly with a "Scanned at HH:MM" banner
 * and a manual Refresh — nothing refetches on its own (tab switch or reload).
 *
 * Storage goes through ctx.storage, so results sync to D1 too: run once on any
 * device, see the same picks everywhere. Old days are pruned to keep it tiny.
 */
import type { AppContext } from '../context.js';

const PREFIX = 'scan:';
const KEEP_DAYS = 3; // prune anything older than the last few days

/** Local trading-day stamp (YYYY-MM-DD) in the user's timezone. */
export function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayKey(id: string, day: string): string {
  return `${PREFIX}${id}:${day}`;
}

export interface CachedScan<T> {
  id: string;
  day: string;
  /** epoch-ms the scan finished; shown as "Scanned at HH:MM". */
  at: number;
  /** how many symbols were scanned, for the banner. */
  scanned: number;
  rows: T[];
}

/** Load today's cached scan for `id`, or null if none. */
export async function loadScan<T>(ctx: AppContext, id: string): Promise<CachedScan<T> | null> {
  return ctx.storage.get<CachedScan<T>>(dayKey(id, today()));
}

/** Save today's scan results and prune stale days (best-effort). */
export async function saveScan<T>(
  ctx: AppContext,
  id: string,
  rows: T[],
  scanned: number,
): Promise<void> {
  const day = today();
  const payload: CachedScan<T> = { id, day, at: Date.now(), scanned, rows };
  await ctx.storage.set(dayKey(id, day), payload);
  void pruneOldScans(ctx).catch(() => {});
}

/** Remove this strategy's cached result for today (forces a re-run next open). */
export async function clearScan(ctx: AppContext, id: string): Promise<void> {
  await ctx.storage.delete(dayKey(id, today()));
}

/** Delete any `scan:*` entry whose day is older than the KEEP_DAYS window. */
async function pruneOldScans(ctx: AppContext): Promise<void> {
  const keys = await ctx.storage.list(PREFIX);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(
    cutoff.getDate(),
  ).padStart(2, '0')}`;
  for (const k of keys) {
    const day = k.slice(k.lastIndexOf(':') + 1);
    if (day < cutoffStr) await ctx.storage.delete(k);
  }
}

/** Format the "Scanned at HH:MM today" banner text. */
export function scannedAtLabel(at: number, lang: 'en' | 'vi'): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return lang === 'vi' ? `Đã quét lúc ${hh}:${mm} hôm nay` : `Scanned at ${hh}:${mm} today`;
}
