/**
 * Parsers for the (undocumented) api.nasdaq.com calendar responses → the shared
 * `CatalystEvent` shape. PURE: these take already-fetched JSON, so they are
 * fully unit-testable and the network layer stays in the app adapter.
 *
 * Verified response quirks (probed 2026-08-07 — each cost a real bug otherwise):
 *  - earnings   → rows at `data.rows`; `time` is `time-pre-market` /
 *                 `time-after-hours` / `time-not-supplied`
 *  - dividends  → rows at `data.calendar.rows` (one level deeper!), and the
 *                 response is genuinely ONE day per request
 *  - splits     → rows at `data.rows`, but a single request returns EVERY
 *                 upcoming split keyed by `executionDate` — so one call covers
 *                 the whole window and the query date is only a lower bound
 *  - ipo        → `data.priced.rows` and `data.filed.rows`, but upcoming is
 *                 nested at `data.upcoming.upcomingTable.rows`
 *  - econ       → rows at `data.rows`, `country` is a full name
 *                 ("United States"), `actual` is `&nbsp;` when unreleased
 */
import type { CatalystEvent, CatalystTiming } from './types.js';

/* ── shared field helpers ────────────────────────────────────────────────── */

/** `$71,937,231,179` / `$382,500,000.00` → number, or null for `N/A` / ''. */
export function parseMoney(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const cleaned = v.replace(/[$,\s]/g, '');
  if (!cleaned || cleaned === 'N/A') return null;
  // Accounting negatives: ($0.13) → -0.13
  const neg = /^\(.*\)$/.test(cleaned);
  const n = Number(cleaned.replace(/[()]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

/** `8/10/2026` or `08/10/2026` → `2026-08-10`. Returns null on anything else
 * (the API uses `N/A` freely, and a bad date must not become "today"). */
export function parseUsDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mo, d, y] = m;
  return `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
}

/** Nasdaq leaks HTML entities into text fields (`&nbsp;`, `&amp;`). */
export function unescapeHtml(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function timingFromNasdaq(v: unknown): CatalystTiming {
  switch (v) {
    case 'time-pre-market': return 'bmo';
    case 'time-after-hours': return 'amc';
    default: return 'unknown';
  }
}

/** Row containers differ per endpoint; pull them defensively. */
function rowsAt(json: unknown, path: readonly string[]): Record<string, unknown>[] {
  let node: unknown = json;
  for (const key of path) {
    if (!node || typeof node !== 'object') return [];
    node = (node as Record<string, unknown>)[key];
  }
  return Array.isArray(node) ? (node as Record<string, unknown>[]) : [];
}

/* ── earnings ────────────────────────────────────────────────────────────── */

/**
 * Impact score for an earnings print. Size drives how much index/sector flow it
 * drags with it, and a thin analyst count means a wider surprise distribution —
 * i.e. a bigger gap, which is exactly what the EP scanner wants.
 */
function earningsImpact(marketCap: number | null, numEstimates: number | null): number {
  let s = 60;
  if (marketCap != null) {
    if (marketCap >= 200e9) s += 25;
    else if (marketCap >= 10e9) s += 15;
    else if (marketCap >= 2e9) s += 8;
    else if (marketCap < 300e6) s -= 15;
  }
  if (numEstimates != null && numEstimates > 0 && numEstimates <= 4) s += 5;
  return Math.max(0, Math.min(100, s));
}

/** `data.rows` of `/calendar/earnings?date=<day>`. `day` is the event date —
 * the response's own rows carry no date field. */
export function parseEarnings(json: unknown, day: string): CatalystEvent[] {
  const out: CatalystEvent[] = [];
  for (const r of rowsAt(json, ['data', 'rows'])) {
    const symbol = unescapeHtml(r.symbol).toUpperCase();
    if (!symbol) continue;
    const marketCap = parseMoney(r.marketCap);
    const eps = unescapeHtml(r.epsForecast);
    const nEst = parseMoney(r.noOfEsts);
    const bits: string[] = [];
    if (eps && eps !== 'N/A') bits.push(`EPS est. ${eps}`);
    if (nEst) bits.push(`${nEst} analyst${nEst === 1 ? '' : 's'}`);
    const fq = unescapeHtml(r.fiscalQuarterEnding);
    if (fq && fq !== 'N/A') bits.push(`Q ending ${fq}`);

    out.push({
      id: `earnings:${symbol}:${day}`,
      kind: 'earnings',
      date: day,
      timing: timingFromNasdaq(r.time),
      // Nasdaq lists scheduled dates; it does not expose a confirmed/estimated
      // flag, so we do NOT claim `confirmed`. Yahoo's calendarEvents can
      // upgrade this per-symbol later.
      confidence: 'estimated',
      symbol,
      title: unescapeHtml(r.name) || symbol,
      detail: bits.join(' · ') || undefined,
      marketCap,
      impact: earningsImpact(marketCap, nEst),
      source: 'nasdaq',
    });
  }
  return out;
}

/* ── dividends ───────────────────────────────────────────────────────────── */

/** `data.calendar.rows` of `/calendar/dividends?date=<day>`. Dated by the row's
 * own ex-date so a stray row for another day can't be mis-filed. */
export function parseDividends(json: unknown, day: string): CatalystEvent[] {
  const out: CatalystEvent[] = [];
  for (const r of rowsAt(json, ['data', 'calendar', 'rows'])) {
    const symbol = unescapeHtml(r.symbol).toUpperCase();
    if (!symbol) continue;
    const date = parseUsDate(r.dividend_Ex_Date) ?? day;
    const rate = parseMoney(r.dividend_Rate);
    const annual = parseMoney(r.indicated_Annual_Dividend);
    const pay = parseUsDate(r.payment_Date);
    const bits: string[] = [];
    if (rate != null) bits.push(`$${rate.toFixed(2)}/share`);
    if (annual != null) bits.push(`$${annual.toFixed(2)} annual`);
    if (pay) bits.push(`paid ${pay}`);

    out.push({
      id: `dividend:${symbol}:${date}`,
      kind: 'dividend',
      date,
      // The ex-date adjustment happens at the open.
      timing: 'bmo',
      confidence: 'confirmed',
      symbol,
      title: unescapeHtml(r.companyName) || symbol,
      detail: bits.join(' · ') || undefined,
      // Routine ex-dates barely move price; they matter for accounting, and for
      // not mistaking the ex-date drop for a breakdown.
      impact: 20,
      source: 'nasdaq',
    });
  }
  return out;
}

/* ── splits ──────────────────────────────────────────────────────────────── */

/**
 * `data.rows` of `/calendar/splits?date=<day>`. Verified: ONE request returns
 * every upcoming split, each with its own `executionDate` — so the caller makes
 * a single call for the whole window instead of one per day.
 */
export function parseSplits(json: unknown): CatalystEvent[] {
  const out: CatalystEvent[] = [];
  for (const r of rowsAt(json, ['data', 'rows'])) {
    const symbol = unescapeHtml(r.symbol).toUpperCase();
    const date = parseUsDate(r.executionDate);
    if (!symbol || !date) continue;
    const ratio = unescapeHtml(r.ratio);
    // `1 : 10` is a reverse split (often a delisting-defence move on a broken
    // chart); `10 : 1` is a forward split, usually after a strong run.
    const [a, b] = ratio.split(':').map((s) => Number(s.trim()));
    const reverse = a != null && b != null && a < b;
    out.push({
      id: `split:${symbol}:${date}`,
      kind: 'split',
      date,
      timing: 'bmo',
      confidence: 'confirmed',
      symbol,
      title: unescapeHtml(r.name) || symbol,
      detail: `${reverse ? 'Reverse split' : 'Split'} ${ratio}`,
      impact: reverse ? 45 : 30,
      source: 'nasdaq',
    });
  }
  return out;
}

/* ── IPOs (+ lockup expiry) ──────────────────────────────────────────────── */

/** Add `days` to a `YYYY-MM-DD` date, staying in UTC to avoid any local shift. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Standard US IPO insider lockup, in calendar days. */
export const LOCKUP_DAYS = 180;

/**
 * `/api/ipo/calendar?date=YYYY-MM` → upcoming IPO pricings AND the lockup
 * expiries of already-priced deals (priced date + 180d). Lockup expiry is a
 * supply event: insiders can finally sell, and it is reliably bearish pressure.
 * `window` clips both, since a month query returns deals outside it.
 */
export function parseIpos(
  json: unknown,
  window: { from: string; to: string },
): CatalystEvent[] {
  const out: CatalystEvent[] = [];

  // Upcoming pricings — note the extra `upcomingTable` nesting level.
  for (const r of rowsAt(json, ['data', 'upcoming', 'upcomingTable', 'rows'])) {
    const symbol = unescapeHtml(r.proposedTickerSymbol).toUpperCase();
    const date = parseUsDate(r.expectedPriceDate);
    if (!symbol || !date || date < window.from || date > window.to) continue;
    const price = unescapeHtml(r.proposedSharePrice);
    const amount = unescapeHtml(r.dollarValueOfSharesOffered);
    const bits = [unescapeHtml(r.proposedExchange)];
    if (price) bits.push(`$${price}/share`);
    if (amount) bits.push(amount);
    out.push({
      id: `ipo:${symbol}:${date}`,
      kind: 'ipo',
      date,
      timing: 'bmo',
      // "Expected" pricing date — routinely slips by days.
      confidence: 'estimated',
      symbol,
      title: `${unescapeHtml(r.companyName) || symbol} IPO`,
      detail: bits.filter(Boolean).join(' · ') || undefined,
      impact: 40,
      source: 'nasdaq',
    });
  }

  // Lockup expiries derived from priced deals.
  for (const r of rowsAt(json, ['data', 'priced', 'rows'])) {
    const symbol = unescapeHtml(r.proposedTickerSymbol).toUpperCase();
    const priced = parseUsDate(r.pricedDate);
    if (!symbol || !priced) continue;
    const date = addDays(priced, LOCKUP_DAYS);
    if (date < window.from || date > window.to) continue;
    out.push({
      id: `lockup:${symbol}:${date}`,
      kind: 'lockup',
      date,
      timing: 'bmo',
      // Rule-based (priced + 180d): the real agreement can differ.
      confidence: 'derived',
      symbol,
      title: `${unescapeHtml(r.companyName) || symbol} lockup expiry`,
      detail: `IPO priced ${priced} · insiders may sell from here`,
      impact: 55,
      source: 'nasdaq',
    });
  }

  return out;
}

/* ── economic events ─────────────────────────────────────────────────────── */

/**
 * Macro prints we care about; everything else is noise for a US equity trader.
 * ORDER MATTERS — the first match wins, so narrow exclusions come before the
 * broad family patterns they carve out of.
 */
const ECON_IMPACT: Array<{ re: RegExp; impact: number }> = [
  // A regional Fed president at a conference is NOT a rate decision. Without
  // this first, /\bFOMC\b/ scores "FOMC Member Barkin Speaks" at 95, putting a
  // speech on the same footing as the statement itself.
  { re: /\bspeaks?\b|speech|testimony|testifies|press conference/i, impact: 45 },
  // Regional nowcasts (Cleveland Fed's CPI estimate) predict the BLS print, they
  // aren't it. Must precede the CPI pattern.
  { re: /cleveland|nowcast|\bIPSOS\b|\bPCSI\b/i, impact: 0 },
  { re: /\bFOMC\b|fed interest rate|federal funds|rate decision/i, impact: 95 },
  { re: /\bCPI\b|consumer price/i, impact: 85 },
  { re: /nonfarm|non-farm|payroll/i, impact: 80 },
  { re: /\bPCE\b/i, impact: 78 },
  { re: /\bPPI\b|producer price/i, impact: 65 },
  { re: /unemployment rate/i, impact: 65 },
  { re: /retail sales/i, impact: 60 },
  { re: /\bGDP\b/i, impact: 58 },
  { re: /\bISM\b|purchasing managers|\bPMI\b/i, impact: 55 },
  { re: /initial jobless claims/i, impact: 45 },
  { re: /consumer confidence|consumer sentiment/i, impact: 42 },
  { re: /crude oil inventories/i, impact: 35 },
];

/**
 * Series family for collapsing the feed's variants of ONE release into one row.
 *
 * The 08:30 CPI release arrives as eight rows — `CPI`, `CPI` again, `Core CPI`
 * ×2, `Core CPI Index`, `CPI Index, n.s.a.`, `CPI Index, s.a`, `CPI, n.s.a` —
 * and PPI likewise. Deduping on name+time keeps all eight because the names
 * differ; the calendar then reads as eight separate catalysts when it is one.
 * The shortest name in a family wins, since that's the headline series.
 */
function econFamily(name: string): string | null {
  if (/\bCPI\b|consumer price/i.test(name)) return 'cpi';
  if (/\bPPI\b|producer price/i.test(name)) return 'ppi';
  if (/\bPCE\b/i.test(name)) return 'pce';
  if (/jobless claims/i.test(name)) return 'claims';
  if (/nonfarm|non-farm|payroll/i.test(name)) return 'nfp';
  return null;
}

/**
 * `data.rows` of `/calendar/economicevents?date=<day>`, filtered to the US and
 * to prints that actually matter (`minImpact`). Auctions, Redbook and the long
 * tail of regional surveys are dropped — 33 rows/day of noise buries the two
 * that move the market.
 *
 * ⚠️ This endpoint only has data ~3 weeks out; beyond that it returns
 * "No record found". The caller records that as a coverage limit.
 */
export function parseEconEvents(json: unknown, day: string, minImpact = 40): CatalystEvent[] {
  /** Kept rows, keyed by dedupe key so a later variant can replace an earlier. */
  const kept = new Map<string, CatalystEvent>();

  for (const r of rowsAt(json, ['data', 'rows'])) {
    const country = unescapeHtml(r.country);
    if (country !== 'United States') continue;
    const name = unescapeHtml(r.eventName);
    if (!name) continue;
    const impact = ECON_IMPACT.find((m) => m.re.test(name))?.impact ?? 0;
    if (impact < minImpact) continue;

    const gmt = unescapeHtml(r.gmt);
    // Collapse a release's variants (CPI / Core CPI / CPI Index, n.s.a. / …) onto
    // one family key so the 08:30 CPI drop is ONE row, not eight. Unfamilied
    // prints still dedupe on their own name+time.
    const family = econFamily(name);
    const key = family ? `${family}|${gmt}` : `${name}|${gmt}`;

    const consensus = unescapeHtml(r.consensus);
    const previous = unescapeHtml(r.previous);
    const bits: string[] = [];
    if (gmt) bits.push(`${gmt} ET`);
    if (consensus) bits.push(`est. ${consensus}`);
    if (previous) bits.push(`prev. ${previous}`);

    const ev: CatalystEvent = {
      // Key the id on the family too, so mergeEvents() dedupes across the day's
      // variants the same way this map does.
      id: `macro:${(family ?? name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${day}`,
      kind: 'macro',
      date: day,
      // Most prints land 08:30/10:00 ET — before or just after the open.
      timing: gmt && gmt < '09:30' ? 'bmo' : 'intraday',
      confidence: 'confirmed',
      symbol: null,
      title: name,
      detail: bits.join(' · ') || undefined,
      impact,
      source: 'nasdaq',
    };

    const prev = kept.get(key);
    // Within a family, prefer the SHORTEST name ("CPI" over "CPI Index, n.s.a")
    // — that's the headline series everyone quotes. Break ties on the row that
    // actually carries a consensus, which is the more useful card.
    if (!prev) kept.set(key, ev);
    else if (family && (name.length < prev.title.length ||
             (name.length === prev.title.length && !prev.detail && ev.detail))) {
      kept.set(key, ev);
    }
  }
  return [...kept.values()];
}
