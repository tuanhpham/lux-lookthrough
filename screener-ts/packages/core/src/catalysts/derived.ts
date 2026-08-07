/**
 * Events that need NO API — they follow fixed calendar rules, so they are
 * computed locally and always cover the full window (no data-coverage gap).
 *
 *  - monthly options expiry / triple witching  → 3rd Friday
 *  - S&P quarterly rebalance                    → 3rd Friday of Mar/Jun/Sep/Dec
 *  - Russell reconstitution                     → last Friday of June
 *  - FOMC / CPI / NFP                           → published schedule table
 *
 * The FOMC/CPI dates are a hardcoded table on purpose: the Nasdaq economic
 * calendar only reaches ~3 weeks out and doesn't even list FOMC, while the Fed
 * publishes its dates a year ahead. Refresh FOMC_DATES each December.
 */
import type { CatalystEvent } from './types.js';

/** Pure Y-M-D helpers — no Date-parsing ambiguity, no timezone drift. */
function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Day of week for a Y-M-D date (0=Sun..6=Sat) via Zeller — avoids `new Date`
 * timezone surprises when the app runs in UTC+7 against US dates. */
export function dayOfWeek(y: number, m: number, d: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const yy = m < 3 ? y - 1 : y;
  return (yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + t[m - 1]! + d) % 7;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Nth occurrence of a weekday in a month, e.g. nth=3 dow=5 → 3rd Friday. */
export function nthWeekday(y: number, m: number, dow: number, nth: number): string {
  const first = dayOfWeek(y, m, 1);
  const offset = (dow - first + 7) % 7;
  return ymd(y, m, 1 + offset + (nth - 1) * 7);
}

/** Last occurrence of a weekday in a month, e.g. last Friday of June. */
export function lastWeekday(y: number, m: number, dow: number): string {
  const last = daysInMonth(y, m);
  const lastDow = dayOfWeek(y, m, last);
  return ymd(y, m, last - ((lastDow - dow + 7) % 7));
}

/**
 * FOMC decision days (the SECOND day of each two-day meeting — the 14:00 ET
 * statement is what moves the tape). Source: federalreserve.gov calendar.
 * ⚠️ Extend this table every December; entries outside it simply don't render.
 */
const FOMC_DATES = [
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16',
  '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-16',
  '2027-07-28', '2027-09-22', '2027-11-03', '2027-12-15',
];

/** CPI release days (08:30 ET), BLS schedule. Extend annually alongside FOMC. */
const CPI_DATES = [
  '2026-01-13', '2026-02-11', '2026-03-11', '2026-04-10', '2026-05-12', '2026-06-10',
  '2026-07-14', '2026-08-12', '2026-09-11', '2026-10-13', '2026-11-10', '2026-12-10',
];

/**
 * Non-farm payrolls: first Friday of the month in the common case. This is a
 * RULE, not the published table, so it is marked `derived` — BLS occasionally
 * shifts a release and the rule would be a day off.
 */
function nfpDate(y: number, m: number): string {
  return nthWeekday(y, m, 5, 1);
}

/** Inclusive list of `YYYY-MM` months touched by a date window. */
function monthsBetween(from: string, to: string): Array<{ y: number; m: number }> {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  const out: Array<{ y: number; m: number }> = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push({ y, m });
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

function ev(e: Omit<CatalystEvent, 'id' | 'source'> & { slug: string }): CatalystEvent {
  const { slug, ...rest } = e;
  return { ...rest, id: `${e.kind}:${slug}:${e.date}`, source: 'derived' };
}

/**
 * Every rule-based event whose date falls in [from, to] inclusive.
 * Always complete for the whole window — these need no coverage caveat.
 *
 * `liveMacroDates` (optional) lists the dates the LIVE econ feed already covers.
 * The hardcoded MACRO table is suppressed on exactly those days, so the feed —
 * authoritative and continuously updated — wins where it has data and this table
 * only fills the days it doesn't. Without that, a stale entry here renders a
 * PHANTOM print: the table says CPI on 2026-08-12 while the feed has it on
 * 08-13, so the calendar shows CPI twice, on two different days, one wrong.
 *
 * A set (not a cutoff date) because the feed has HOLES inside its own horizon —
 * verified: it returned data for 2026-09-01 but null for 08-31 and 09-02. A
 * single cutoff would leave those interior gaps unfilled.
 *
 * Expiry/rebalance events are pure date arithmetic and are never suppressed.
 */
export function derivedEvents(
  from: string,
  to: string,
  liveMacroDates?: ReadonlySet<string>,
): CatalystEvent[] {
  const out: CatalystEvent[] = [];
  const inRange = (d: string): boolean => d >= from && d <= to;
  const macroInRange = (d: string): boolean => inRange(d) && !liveMacroDates?.has(d);

  for (const d of FOMC_DATES) {
    if (!macroInRange(d)) continue;
    out.push(ev({
      slug: 'fomc', kind: 'macro', date: d, timing: 'intraday', confidence: 'confirmed',
      symbol: null, title: 'FOMC rate decision',
      detail: 'Statement 14:00 ET · press conference 14:30 ET', impact: 95,
    }));
  }

  for (const d of CPI_DATES) {
    if (!macroInRange(d)) continue;
    out.push(ev({
      slug: 'cpi', kind: 'macro', date: d, timing: 'bmo', confidence: 'confirmed',
      symbol: null, title: 'CPI inflation report', detail: '08:30 ET', impact: 85,
    }));
  }

  for (const { y, m } of monthsBetween(from, to)) {
    const nfp = nfpDate(y, m);
    if (macroInRange(nfp)) {
      out.push(ev({
        slug: 'nfp', kind: 'macro', date: nfp, timing: 'bmo', confidence: 'derived',
        symbol: null, title: 'Non-farm payrolls', detail: '08:30 ET · first Friday', impact: 80,
      }));
    }

    // Monthly options expiry — 3rd Friday. In Mar/Jun/Sep/Dec index futures and
    // index options expire the same day too ("triple witching"), which is the
    // higher-volume, more dislocating version.
    const third = nthWeekday(y, m, 5, 3);
    const quarterly = m === 3 || m === 6 || m === 9 || m === 12;
    if (inRange(third)) {
      out.push(ev({
        slug: quarterly ? 'triple-witching' : 'opex', kind: 'expiry', date: third,
        timing: 'intraday', confidence: 'derived', symbol: null,
        title: quarterly ? 'Triple witching' : 'Monthly options expiry',
        detail: quarterly
          ? 'Index futures, index options and single-stock options all expire'
          : 'Third Friday — elevated volume, pinning near big strikes',
        impact: quarterly ? 70 : 45,
      }));

      // S&P index rebalance shares the same day as the quarterly expiry.
      out.push(...(quarterly ? [ev({
        slug: 'sp-rebalance', kind: 'rebalance', date: third, timing: 'amc',
        confidence: 'derived', symbol: null, title: 'S&P quarterly rebalance',
        detail: 'Forced index buying/selling on the close', impact: 65,
      })] : []));
    }

    // Russell reconstitution — last Friday of June, the single largest
    // forced-flow day of the US year.
    if (m === 6) {
      const russell = lastWeekday(y, 6, 5);
      if (inRange(russell)) {
        out.push(ev({
          slug: 'russell-recon', kind: 'rebalance', date: russell, timing: 'amc',
          confidence: 'derived', symbol: null, title: 'Russell reconstitution',
          detail: 'Largest forced-flow close of the year', impact: 75,
        }));
      }
    }
  }

  return out;
}
