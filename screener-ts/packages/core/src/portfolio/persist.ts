/**
 * What of an account is worth writing down, and what must never be.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The `accounts` key grew to 912 KB for four accounts. Nothing the user entered
 * accounts for that: 4 accounts of ~10 positions is a few tens of KB of lots,
 * sells, orders and cash flows. The bulk was a REBUILDABLE CHART CACHE that the
 * UI hangs off the state object (`_candleCache`) — full OHLCV bars for every
 * position plus two portfolio-wide series, ~105 bytes per bar per day. Because
 * the save path serialized the state object verbatim, every "Update" wrote that
 * cache to localStorage AND pushed it to D1.
 *
 * The damage was not theoretical:
 *   • It consumed most of the ~5 MB localStorage quota, so the Calendar's
 *     snapshot write threw QuotaExceededError and the tab reported a bogus
 *     "check the connection" error.
 *   • It made every portfolio edit push ~900 KB to D1 instead of ~30 KB.
 *
 * The cache is derived from `pf_bars:*`, which is device-local and re-fetchable,
 * so persisting it bought nothing at all.
 *
 * The rule: this module is the ONLY thing that decides what reaches storage.
 * Filtering here rather than at each call site means a future field hung off
 * `AccountState` cannot silently leak into storage or D1 the way this one did.
 */
import type { AccountState, EquitySnapshot } from '../types/portfolio.js';

/**
 * Own properties whose name starts with this are UI scratch space, never data.
 * `_candleCache` is the one that caused the incident; the prefix is a convention
 * so the next one is stripped for free.
 */
const TRANSIENT_PREFIX = '_';

/**
 * Money is rounded to cents before it is written.
 *
 * A dense daily equity series is ~500 rows per account, and a raw float prints
 * as `123456.78901234567` — 12 wasted bytes per number, three numbers per row.
 * Cents are the finest unit any of this is ever displayed in, so nothing is lost
 * and the series shrinks by roughly a third.
 */
function toCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function slimSnapshot(s: EquitySnapshot): EquitySnapshot {
  return {
    date: s.date,
    equity: toCents(s.equity),
    cash: toCents(s.cash),
    positionsValue: toCents(s.positionsValue),
  };
}

/**
 * The persistable projection of in-memory account state.
 *
 * Returns NEW objects: the caller keeps using the live state, whose transient
 * caches the charts still need. Mutating the input would blank the charts on
 * every save.
 *
 * `snapshots` is kept — unlike the candle cache it is NOT rebuildable on a fresh
 * device, because the bars it derives from are device-local. It is what lets a
 * newly signed-in phone draw the equity curve before its first Update.
 */
export function toPersistable(states: readonly AccountState[]): AccountState[] {
  return states.map((st) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(st)) {
      if (k.startsWith(TRANSIENT_PREFIX)) continue;
      out[k] = v;
    }
    out.snapshots = (st.snapshots ?? []).map(slimSnapshot);
    return out as unknown as AccountState;
  });
}

/**
 * True when the stored value carries fields that `toPersistable` would drop.
 *
 * Used for a one-time cleanup on load: an account blob written by an older build
 * still holds the fat cache, and it stays in localStorage until something
 * rewrites it. This says "rewrite is worth it" without guessing.
 */
export function hasTransientFields(states: readonly AccountState[]): boolean {
  return states.some((st) => Object.keys(st).some((k) => k.startsWith(TRANSIENT_PREFIX)));
}
