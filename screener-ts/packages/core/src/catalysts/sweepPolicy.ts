/**
 * When may the ~60-request catalyst sweep run?
 *
 * ── THE BUG THIS FIXES ──────────────────────────────────────────────────────
 * "Once a day" was implemented by asking "is there a snapshot for today?" — the
 * SNAPSHOT was also the record that a sweep had happened. So the moment a
 * snapshot could not be stored (localStorage full — see the 912 KB `accounts`
 * row), that record never appeared, and **every single open of the Calendar tab
 * launched a fresh 60-request sweep**. The one condition under which a sweep is
 * most expensive to repeat was the exact condition that guaranteed repetition.
 *
 * The fix is to separate the two facts:
 *   • the SNAPSHOT is the data (large, may fail to store),
 *   • the SWEEP LOG is the receipt (a few dozen bytes, always fits).
 *
 * The receipt is written when the FETCH succeeds, whether or not the snapshot
 * could be saved. A day with a successful fetch is a day that must not be swept
 * again, even if nothing was persisted.
 *
 * PURE — no clock, no storage. The caller supplies today's date.
 */

/** The receipt: the last day a sweep actually completed its fetch. */
export interface SweepLog {
  /** Local `YYYY-MM-DD` of the last sweep whose FETCH succeeded. */
  lastSweepDay: string;
  /** epoch-ms it finished — shown as "Updated at HH:MM". */
  at: number;
  /** Sweeps completed on `lastSweepDay`, including manual refreshes. */
  count?: number;
}

export type SweepDecision =
  /** Nothing stored and nothing swept today — fetch now. */
  | 'sweep'
  /** Today's snapshot is in hand; render it. */
  | 'use-snapshot'
  /**
   * A sweep already ran today but its snapshot is not available (the save
   * failed, or another device holds it). Do NOT re-sweep: show the newest
   * snapshot we do have, stale-labelled, and wait for tomorrow.
   */
  | 'swept-but-no-snapshot';

export interface SweepInput {
  /** Local date, `YYYY-MM-DD`. */
  today: string;
  /** Whether a snapshot built on `today` is available. */
  hasSnapshotForToday: boolean;
  /** The stored receipt, if any. */
  log: SweepLog | null;
}

/**
 * Decide whether an AUTOMATIC sweep may run.
 *
 * A manual Refresh must bypass this entirely: the user asking for fresh data is
 * always allowed, and is the escape hatch when a day's sweep returned something
 * wrong. Only the automatic path is rationed.
 *
 * A `lastSweepDay` in the FUTURE (device clock moved backwards, or a snapshot
 * synced from a device in a later timezone) is treated as "already swept" rather
 * than triggering a sweep on every open until the calendar catches up. Being one
 * day stale is cheaper than 60 requests per tab open.
 */
export function decideSweep(input: SweepInput): SweepDecision {
  if (input.hasSnapshotForToday) return 'use-snapshot';
  if (input.log && input.log.lastSweepDay >= input.today) return 'swept-but-no-snapshot';
  return 'sweep';
}

/** The receipt to store after a successful fetch. Increments same-day count. */
export function recordSweep(prev: SweepLog | null, day: string, at: number): SweepLog {
  const sameDay = prev?.lastSweepDay === day;
  return { lastSweepDay: day, at, count: (sameDay ? (prev?.count ?? 0) : 0) + 1 };
}
