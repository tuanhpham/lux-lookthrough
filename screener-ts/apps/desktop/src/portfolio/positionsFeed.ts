/**
 * Publish open positions to the scanner bridge (`scanner:positions`).
 *
 * WHY THIS EXISTS
 * ---------------
 * The intraday alerter on the VM cannot warn about a stop on a position it does
 * not know exists. Under DOWNTREND that is the *only* kind of alert it is allowed
 * to send, so without this key the regime gate degrades to total silence on
 * exactly the days a stop matters most.
 *
 * WHAT CROSSES, AND WHAT DOES NOT
 * -------------------------------
 * A derived digest: ticker, open shares, average cost, stop levels, the currency
 * each stop was entered in. Not cash, not equity, not total or realized P&L, not
 * account ids, not lot ids, not dates. The VM's token can READ every key on the
 * bridge (writes are gated, GETs are not — see the endpoint header), so the rule
 * is: publish what an alert needs to name a level, nothing that would reconstruct
 * the portfolio.
 *
 * The shape, and the three traps it exists to avoid (multi-lot stops, stops
 * entered as pending orders, EUR-entered prices against USD quotes), live with
 * `buildPositionsDigest` in core/portfolio/positionsDigest.ts. This file is only
 * the plumbing: when to send, when not to, and never failing loudly.
 *
 * Never throws, never blocks a save. It is a side effect of `saveAccounts()`, and
 * the portfolio write path is the one thing in this app that must never be made
 * more fragile — the repo has already lost account data twice.
 */
import {
  buildPositionsDigest,
  type PositionsDigest,
  type AccountState,
} from '@screener/core';
import { scannerPut } from '../adapters/scannerClient.js';
import { isHydrated } from '../adapters/storage.js';

/**
 * Same content twice = no write. D1's free tier counts writes, this shares that
 * budget with portfolio sync, and `saveAccounts()` fires on every keystroke-level
 * edit in the Portfolio tab — most of which change nothing this digest cares
 * about (a note, a rating, a sell from last month). `ts` is excluded from the
 * comparison or nothing would ever compare equal.
 */
let lastBody = '';
let lastSentAt = 0;
let pending: ReturnType<typeof setTimeout> | null = null;

/** Leading edge, then at most one trailing call per window. */
const MIN_GAP_MS = 10_000;

function bodyOf(d: PositionsDigest): string {
  return JSON.stringify({ n: d.n, rows: d.rows, warn: d.warn });
}

async function send(digest: PositionsDigest): Promise<boolean> {
  const ok = await scannerPut('scanner:positions', digest);
  if (ok) {
    lastBody = bodyOf(digest);
    lastSentAt = Date.now();
  }
  return ok;
}

/**
 * Best-effort publish. Call it from the portfolio write path and ignore the
 * result: 'off' (no sync code), 'skip' (unchanged), 'queued' (throttled) and
 * 'err' are all non-events for the caller.
 *
 * REFUSES BEFORE HYDRATION for the same reason `withAccounts` does: while a sync
 * code is set but the first pull has not landed, `accounts` may still be the
 * starter account. Publishing that would tell the VM the portfolio is empty and
 * silence every stop alert for the rest of the session.
 */
export async function publishPositions(
  list: AccountState[],
): Promise<'off' | 'skip' | 'queued' | 'ok' | 'err'> {
  try {
    if (!isHydrated()) return 'off';
    const digest = buildPositionsDigest(list);
    if (bodyOf(digest) === lastBody) return 'skip';

    const wait = MIN_GAP_MS - (Date.now() - lastSentAt);
    if (wait > 0) {
      // Trailing call: replace any queued one so the last edit wins. Not awaited
      // on purpose — the caller is a save, and a save must not wait 10 seconds.
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        void publishPositions(list).catch(() => {});
      }, wait);
      return 'queued';
    }
    return (await send(digest)) ? 'ok' : 'err';
  } catch {
    return 'err';
  }
}

/** Test seam: forget the throttle and the last-sent body. */
export function _resetPositionsFeed(): void {
  if (pending) clearTimeout(pending);
  pending = null;
  lastBody = '';
  lastSentAt = 0;
}
