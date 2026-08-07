/**
 * Catalyst calendar — one normalized event shape for every source (earnings,
 * ex-dividend, splits, IPOs, IPO lockup expiry, macro prints, derivatives
 * expiry, index rebalances, and hand-entered events like PDUFA dates).
 *
 * Everything downstream (the Calendar tab, the pre-armed EP list, portfolio
 * event-risk KPI, chart markers) reads `CatalystEvent`, so adding a source is a
 * new parser — never a change to the UI.
 */

/** Event families. Kept flat (not nested) so filter chips map 1:1 to a kind. */
export type CatalystKind =
  | 'earnings'
  | 'dividend'
  | 'split'
  | 'ipo'
  | 'lockup'
  | 'macro'
  | 'expiry'
  | 'rebalance'
  | 'custom';

/**
 * When during the session the event lands. This decides WHICH session gaps, so
 * it must never be inferred — an `amc` print gaps the NEXT day's open.
 *  - `bmo` before market open, `amc` after close, `intraday` during hours,
 *  - `unknown` = the source explicitly said "not supplied".
 */
export type CatalystTiming = 'bmo' | 'amc' | 'intraday' | 'unknown';

/**
 * How trustworthy the DATE is. Yahoo/Nasdaq happily return a placeholder date
 * that can move by two weeks, so this is surfaced in the UI rather than hidden:
 * planning a trade around an `estimated` date is a real way to lose money.
 */
export type CatalystConfidence = 'confirmed' | 'estimated' | 'derived';

export interface CatalystEvent {
  /** Stable id: `<kind>:<symbol|slug>:<date>`. Used for dedupe across sources. */
  id: string;
  kind: CatalystKind;
  /** Local market date, `YYYY-MM-DD` (US/Eastern trading day). */
  date: string;
  timing: CatalystTiming;
  confidence: CatalystConfidence;
  /** Ticker, or null for market-wide events (macro, expiry, rebalance). */
  symbol: string | null;
  /** Company or event name, already unescaped. */
  title: string;
  /** Short human detail line, e.g. "EPS est. $3.18 · 7 analysts". */
  detail?: string;
  /** Market cap in USD when known — drives the "hide micro caps" filter. */
  marketCap?: number | null;
  /** 0–100 heuristic: how much this event typically moves price. */
  impact: number;
  /** Which parser produced this, for debugging a wrong row. */
  source: 'nasdaq' | 'derived' | 'manual';
}

/**
 * Per-kind data coverage. The Nasdaq economic calendar runs dry after ~3 weeks,
 * so a day past `until` has NO DATA — which is NOT the same as "no events". The
 * UI must render those two states differently or it silently lies.
 */
export interface CatalystCoverage {
  kind: CatalystKind;
  /** Last date (`YYYY-MM-DD`) this kind has real data for. */
  until: string;
  /** Days inside the window whose fetch failed outright. */
  failedDates?: string[];
}

/** A merged, cached 30-day window — exactly what gets snapshotted to D1. */
export interface CatalystWindow {
  /** Day the snapshot was built (`YYYY-MM-DD`, local). */
  builtOn: string;
  /** epoch-ms the build finished; shown as "Updated at HH:MM". */
  at: number;
  from: string;
  to: string;
  events: CatalystEvent[];
  coverage: CatalystCoverage[];
}
