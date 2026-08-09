/**
 * Once-a-day catalyst-window persistence, mirroring `scanCache.ts`.
 *
 * A full sweep is ~60 upstream requests, so the MERGED window is stored keyed by
 * the day it was built. Opening the Calendar tab renders today's snapshot
 * instantly with an "Updated at HH:MM" banner; the sweep only re-runs when the
 * date rolls over (that IS the daily auto-refresh) or when Refresh is clicked.
 *
 * Storage goes through ctx.storage, so the snapshot syncs to D1: the sweep runs
 * once on any device and every other device reads it for free.
 *
 * The daily snapshots are also what makes point-in-time correct later: the
 * calendar APIs only ever return today-and-forward, so a historical as-of view
 * MUST read a stored snapshot and must never call the live API.
 */
import { type CatalystWindow, type SweepLog, recordSweep } from '@screener/core';
import type { AppContext } from '../context.js';

const PREFIX = 'calendar:';

/**
 * The sweep receipt, stored SEPARATELY from the snapshot.
 *
 * It must be tiny and it must never share a failure mode with the snapshot: the
 * whole point is that it still gets written when the ~500 KB snapshot does not
 * fit. Keeping it under its own key means a full store cannot cost us the record
 * that a sweep already ran — which is what made the Calendar re-sweep 60
 * requests on every single tab open.
 */
const SWEEP_LOG_KEY = 'calendar_sweep_log';

export async function loadSweepLog(ctx: AppContext): Promise<SweepLog | null> {
  return ctx.storage.get<SweepLog>(SWEEP_LOG_KEY);
}

/**
 * Record that a sweep's FETCH succeeded on `day`.
 *
 * Called before the snapshot is saved, deliberately: the receipt is what rations
 * tomorrow's requests, so it must survive a snapshot write that fails.
 */
export async function noteSweep(ctx: AppContext, day: string, at: number): Promise<void> {
  const next = recordSweep(await loadSweepLog(ctx).catch(() => null), day, at);
  await ctx.storage.set(SWEEP_LOG_KEY, next);
}
/**
 * How many daily snapshots to keep.
 *
 * ⚠️ MEASURED, not guessed: one 30-day window is ~500 KB (1,900 events — ~1,600
 * of them earnings). An earlier comment here claimed "~100KB each" and kept 14
 * days; that is ~6.8 MB against a ~5 MB localStorage quota, so the store filled
 * up and `set()` threw QuotaExceededError. Three days is enough for the
 * as-of/point-in-time seed while leaving room for the portfolio and caches.
 *
 * If this ever grows again, re-measure. The event count scales with earnings
 * season, so a window built in late October is the worst case, not a quiet week.
 */
const KEEP_DAYS = 3;

const key = (day: string): string => `${PREFIX}${day}`;

/** Load a specific day's snapshot (default: today's). */
export async function loadWindow(ctx: AppContext, day: string): Promise<CatalystWindow | null> {
  return ctx.storage.get<CatalystWindow>(key(day));
}

/** A storage-full failure, as opposed to any other write error. */
export class SnapshotTooLargeError extends Error {
  constructor(public readonly bytes: number) {
    super(`calendar snapshot (${Math.round(bytes / 1024)} KB) does not fit in storage`);
    this.name = 'SnapshotTooLargeError';
  }
}

/** localStorage signals a full store by name or by legacy code 22. */
function isQuotaError(e: unknown): boolean {
  const err = e as { name?: string; code?: number } | null;
  return (
    err?.name === 'QuotaExceededError' ||
    err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err?.code === 22
  );
}

/**
 * Persist today's window, pruning FIRST so the new snapshot has room, and
 * evicting older ones if the store is still full.
 *
 * Pruning used to run after the write and un-awaited, which is backwards: the
 * write is the thing that needs the space. On a full store it threw
 * QuotaExceededError, and because the caller wrapped fetch+save+render in one
 * try/catch the user saw "Could not load the calendar. Check the connection" —
 * blaming the network for a disk-full problem, on a sweep that had actually
 * succeeded.
 *
 * Throws `SnapshotTooLargeError` only when even a lone snapshot will not fit.
 * The caller must treat that as non-fatal and still render the fetched window.
 */
export async function saveWindow(ctx: AppContext, w: CatalystWindow): Promise<void> {
  await pruneOld(ctx).catch(() => {});
  try {
    await ctx.storage.set(key(w.builtOn), w);
    return;
  } catch (e) {
    if (!isQuotaError(e)) throw e;
  }

  // Still full: drop older snapshots, newest-first order means we shed the least
  // useful history first. Today's key is never a candidate — it is what we are
  // trying to write.
  const others = (await listSnapshotDays(ctx)).filter((d) => d !== w.builtOn);
  for (const day of [...others].reverse()) {
    await ctx.storage.delete(key(day)).catch(() => {});
    try {
      await ctx.storage.set(key(w.builtOn), w);
      return;
    } catch (e) {
      if (!isQuotaError(e)) throw e;
    }
  }
  throw new SnapshotTooLargeError(JSON.stringify(w).length);
}

export async function clearWindow(ctx: AppContext, day: string): Promise<void> {
  await ctx.storage.delete(key(day));
}

/** Snapshot days present in storage, newest first — the as-of picker reads this. */
export async function listSnapshotDays(ctx: AppContext): Promise<string[]> {
  const keys = await ctx.storage.list(PREFIX);
  return keys.map((k) => k.slice(PREFIX.length)).sort().reverse();
}

async function pruneOld(ctx: AppContext): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(
    cutoff.getDate(),
  ).padStart(2, '0')}`;
  for (const day of await listSnapshotDays(ctx)) {
    if (day < cutoffStr) await ctx.storage.delete(key(day));
  }
}

/** "Updated at HH:MM today" banner text. */
export function updatedAtLabel(at: number, lang: 'en' | 'vi'): string {
  const d = new Date(at);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return lang === 'vi' ? `Cập nhật lúc ${hh}:${mm} hôm nay` : `Updated at ${hh}:${mm} today`;
}
