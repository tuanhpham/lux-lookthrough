/**
 * "Needs attention" ranking — the Top N stocks worth looking at in the calendar
 * window, blending WHAT IS COMING (catalysts) with WHERE THE STOCK IS (setup
 * quality, momentum) and WHETHER IT IS YOURS (held / watchlisted).
 *
 * The distinction that makes this list useful rather than decorative: a stock is
 * notable when a dated event meets a technical situation. NVDA reporting in 3
 * days matters much more when it is coiled 2% under a pivot than when it is
 * drifting mid-range — and an untradeable microcap reporting tomorrow is noise
 * regardless of how imminent the date is. Ranking on impact alone reproduces the
 * earnings calendar; ranking on quality alone reproduces the screener. Neither
 * answers "what should I look at this week".
 *
 * Two rules encoded here on purpose:
 *  1. **Held positions outrank everything comparable.** You cannot opt out of an
 *     event in a stock you own; a watchlist name you can simply skip. So
 *     ownership is a scoring term, and every reason line says so.
 *  2. **Imminence decays, it does not cliff.** A print 8 days out still deserves
 *     preparation, so nearness scores on a ramp rather than a "this week" flag —
 *     otherwise the list churns completely every Monday.
 *
 * PURE — no fetching, no DOM. Callers supply whatever signals they already have;
 * every field is optional, and a symbol with only events still ranks (on event
 * terms alone) rather than being dropped for missing a scan.
 */
import type { CatalystEvent } from './types.js';

/** Everything known about one symbol at ranking time. All signals optional. */
export interface AttentionInput {
  symbol: string;
  /** Dated events for this symbol inside the window. */
  events: readonly CatalystEvent[];
  /** QM quality score 0..100, when a scan is available. */
  qualityScore?: number | null;
  /** QM setup label, for the reason line. */
  setupType?: string | null;
  /** Distance to the pivot as a % of price (negative = already above it). */
  distanceToPivotPct?: number | null;
  /** Momentum score 0..100. */
  momentumScore?: number | null;
  /** Relative strength vs the benchmark (signed %). */
  relativeStrength?: number | null;
  /** Share of capital held, 0–1 (from `capitalExposure`). */
  weight?: number | null;
  /** On at least one watchlist. */
  watchlisted?: boolean;
}

export interface AttentionConfig {
  /** Days out at which imminence credit reaches zero. */
  horizonDays: number;
  /** Weights, summing to 100. */
  weights: {
    /** Nearest event's impact. */
    impact: number;
    /** How soon that event lands. */
    imminence: number;
    /** QM quality score. */
    quality: number;
    /** Momentum score. */
    momentum: number;
    /** Proximity to the pivot (coiled and ready). */
    proximity: number;
    /** Held / watchlisted. */
    ownership: number;
  };
  /** Pivot distance (%) at which proximity credit hits zero. */
  proximityFullPct: number;
  /** Extra impact credit when a symbol has several events in the window. */
  multiEventBonus: number;
}

export const DEFAULT_ATTENTION_CONFIG: AttentionConfig = {
  horizonDays: 21,
  weights: {
    impact: 25,
    imminence: 20,
    quality: 20,
    momentum: 10,
    proximity: 10,
    ownership: 15,
  },
  proximityFullPct: 8,
  multiEventBonus: 5,
};

export interface AttentionRow {
  symbol: string;
  /** 0..100 blended attention score. */
  score: number;
  /** The soonest event driving this row (null when the symbol has no events). */
  nextEvent: CatalystEvent | null;
  /** Days from `today` to that event (0 = today, negative never returned). */
  daysAway: number | null;
  /** How many of the symbol's events fall inside the window. */
  eventCount: number;
  qualityScore: number | null;
  momentumScore: number | null;
  distanceToPivotPct: number | null;
  /** Share of capital held, 0–1; 0 when not held. */
  weight: number;
  watchlisted: boolean;
  /**
   * Machine-readable reason tags, strongest first. The UI renders these as
   * chips and localizes them — deliberately NOT prose, so this module stays
   * language-free and the same tags can drive filtering later.
   */
  reasons: AttentionReason[];
}

/** Why a symbol made the list. Rendered as localized chips by the UI. */
export type AttentionReason =
  | 'held'
  | 'watchlist'
  | 'earnings-soon'
  | 'event-soon'
  | 'high-impact'
  | 'multi-event'
  | 'strong-setup'
  | 'near-pivot'
  | 'strong-momentum'
  | 'unconfirmed-date';

/** Whole days between two `YYYY-MM-DD` dates, UTC — no timezone drift. */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = to.split('-').map(Number) as [number, number, number];
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86_400_000);
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Rank symbols by how much they deserve attention over the window starting at
 * `today`. Returns at most `limit` rows, best first.
 *
 * Events dated before `today` are ignored: the calendar is forward-looking, and
 * a stale row at the top of an "attention" list destroys trust in the whole
 * panel. A symbol whose only events are in the past therefore ranks on its
 * technical signals alone.
 */
export function rankAttention(
  inputs: readonly AttentionInput[],
  today: string,
  limit = 7,
  cfg: AttentionConfig = DEFAULT_ATTENTION_CONFIG,
): AttentionRow[] {
  const w = cfg.weights;
  const rows: AttentionRow[] = [];

  for (const inp of inputs) {
    const upcoming = inp.events
      .filter((e) => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || b.impact - a.impact);
    const next = upcoming[0] ?? null;
    const daysAway = next ? daysBetween(today, next.date) : null;

    // ── Event terms. A symbol with no upcoming event scores 0 on both, which is
    // correct: it can still make the list on setup quality, just not on timing.
    const peakImpact = upcoming.length ? Math.max(...upcoming.map((e) => e.impact)) : 0;
    const multi = upcoming.length > 1 ? cfg.multiEventBonus : 0;
    const cImpact = clamp01((peakImpact + multi) / 100) * w.impact;
    const cImminence =
      daysAway === null ? 0 : clamp01((cfg.horizonDays - daysAway) / cfg.horizonDays) * w.imminence;

    // ── Technical terms. ──
    const cQuality = clamp01((inp.qualityScore ?? 0) / 100) * w.quality;
    const cMomentum = clamp01((inp.momentumScore ?? 0) / 100) * w.momentum;
    // Proximity: full credit at the pivot or above it, tapering to zero at
    // `proximityFullPct` below. A null distance scores 0, not a guess.
    const dist = inp.distanceToPivotPct;
    const cProximity =
      dist == null
        ? 0
        : clamp01((cfg.proximityFullPct - Math.max(dist, 0)) / cfg.proximityFullPct) * w.proximity;

    // ── Ownership. Held scales with position size (a 1% position is not the same
    // exposure as a 20% one); a watchlist entry gets a flat third of the term.
    const weight = inp.weight ?? 0;
    const heldCredit = weight > 0 ? 0.5 + clamp01(weight / 0.2) * 0.5 : 0;
    const cOwnership = (weight > 0 ? heldCredit : inp.watchlisted ? 0.33 : 0) * w.ownership;

    const score = Math.round(
      (cImpact + cImminence + cQuality + cMomentum + cProximity + cOwnership) * 10,
    ) / 10;

    // ── Reason tags, strongest first. ──
    const reasons: AttentionReason[] = [];
    if (weight > 0) reasons.push('held');
    else if (inp.watchlisted) reasons.push('watchlist');
    if (next && daysAway !== null && daysAway <= 7) {
      reasons.push(next.kind === 'earnings' ? 'earnings-soon' : 'event-soon');
    }
    if (peakImpact >= 80) reasons.push('high-impact');
    if (upcoming.length > 1) reasons.push('multi-event');
    if ((inp.qualityScore ?? 0) >= 70) reasons.push('strong-setup');
    if (dist != null && dist <= 3) reasons.push('near-pivot');
    if ((inp.momentumScore ?? 0) >= 70) reasons.push('strong-momentum');
    // Surfaced last but never omitted: an estimated date is the difference
    // between preparing for a print and being surprised by one.
    if (next?.confidence === 'estimated') reasons.push('unconfirmed-date');

    rows.push({
      symbol: inp.symbol.toUpperCase(),
      score,
      nextEvent: next,
      daysAway,
      eventCount: upcoming.length,
      qualityScore: inp.qualityScore ?? null,
      momentumScore: inp.momentumScore ?? null,
      distanceToPivotPct: dist ?? null,
      weight,
      watchlisted: inp.watchlisted ?? false,
      reasons,
    });
  }

  // Ties broken by the sooner event, then the symbol, so the order is stable
  // across renders — a list that reshuffles on every repaint cannot be scanned.
  rows.sort(
    (a, b) =>
      b.score - a.score ||
      (a.daysAway ?? 9999) - (b.daysAway ?? 9999) ||
      a.symbol.localeCompare(b.symbol),
  );
  return rows.slice(0, limit);
}

/**
 * Collapse events to one entry per symbol, for feeding `rankAttention`.
 * Market-wide events (`symbol === null`) are dropped: they apply to everything,
 * so they cannot distinguish one stock from another.
 */
export function eventsBySymbol(
  events: readonly CatalystEvent[],
): Map<string, CatalystEvent[]> {
  const map = new Map<string, CatalystEvent[]>();
  for (const e of events) {
    if (!e.symbol) continue;
    const sym = e.symbol.toUpperCase();
    const list = map.get(sym);
    if (list) list.push(e);
    else map.set(sym, [e]);
  }
  return map;
}
