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

/** A historical id contains '@' (the as-of date suffix). For those we use a
 * stable key — the as-of date IS the discriminator, so "today" is irrelevant
 * and the result stays cached permanently until the user re-runs it. */
function isHistoricalId(id: string): boolean {
  return id.includes('@');
}

function storageKey(id: string, day: string): string {
  return isHistoricalId(id) ? `${PREFIX}${id}` : `${PREFIX}${id}:${day}`;
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

/** Load the cached scan for `id`:
 * - Live ids: only today's entry counts (once-a-day).
 * - Historical ids (contain '@'): load permanently — the as-of date is stable. */
export async function loadScan<T>(ctx: AppContext, id: string): Promise<CachedScan<T> | null> {
  return ctx.storage.get<CachedScan<T>>(storageKey(id, today()));
}

/** Save scan results. Live scans are keyed to today; historical scans are
 * stored permanently under a stable key. Stale live entries are pruned. */
export async function saveScan<T>(
  ctx: AppContext,
  id: string,
  rows: T[],
  scanned: number,
): Promise<void> {
  const day = today();
  const payload: CachedScan<T> = { id, day, at: Date.now(), scanned, rows };
  await ctx.storage.set(storageKey(id, day), payload);
  if (!isHistoricalId(id)) void pruneOldScans(ctx).catch(() => {});
}

/** Remove this strategy's cached result (forces a re-run next open). */
export async function clearScan(ctx: AppContext, id: string): Promise<void> {
  await ctx.storage.delete(storageKey(id, today()));
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
