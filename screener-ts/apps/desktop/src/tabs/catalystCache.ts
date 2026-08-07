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
import type { CatalystWindow } from '@screener/core';
import type { AppContext } from '../context.js';

const PREFIX = 'calendar:';
/** Keep a couple of weeks of snapshots — small (~100KB each) and useful as the
 * seed of point-in-time history. */
const KEEP_DAYS = 14;

const key = (day: string): string => `${PREFIX}${day}`;

/** Load a specific day's snapshot (default: today's). */
export async function loadWindow(ctx: AppContext, day: string): Promise<CatalystWindow | null> {
  return ctx.storage.get<CatalystWindow>(key(day));
}

export async function saveWindow(ctx: AppContext, w: CatalystWindow): Promise<void> {
  await ctx.storage.set(key(w.builtOn), w);
  void pruneOld(ctx).catch(() => {});
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
