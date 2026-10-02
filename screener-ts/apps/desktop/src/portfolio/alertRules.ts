/**
 * Telegram alerts on the user's own watchlists — the rules, and the digest the VM reads.
 *
 * WHAT THE USER SETS
 * ------------------
 * Per watchlist: whether it alerts at all, and which kinds — a price level, unusual
 * volume, a big day move — each with its own threshold. Per ticker: the level(s) to
 * watch, typed in the ticker's own quote currency (USD, EUR for .DE, VND for .VN).
 * A ticker in two alerting lists gets the union of both lists' kinds and the more
 * sensitive threshold of each, so adding a name to a second list never makes it quieter.
 *
 * WHAT CROSSES TO THE VM (`scanner:alerts`)
 * -----------------------------------------
 * One flat row per ticker: the names of the lists it is alerting through, and the
 * thresholds that apply. Not list ids, not the tickers of lists that do not alert,
 * not the levels of tickers whose lists have price alerts off. Pure functions only:
 * the plumbing (storage, throttle, bridge) lives in alertsFeed.ts.
 */
import { quoteCurrencyOf } from '@screener/core';

export interface ListRule {
  /** The list alerts at all. */
  on: boolean;
  /** Fire when a ticker crosses the level set for it. */
  price: boolean;
  /** Fire when today's volume, adjusted for the time of day, is `rvol`× the 20-day average. */
  volume: boolean;
  rvol: number;
  /** Fire when the price is `movePct`% away from yesterday's close, either way. */
  move: boolean;
  movePct: number;
}

export interface SymLevels {
  /** Alert when the price trades at or above this. */
  above?: number;
  /** Alert when the price trades at or below this. */
  below?: number;
}

export interface AlertsConfig {
  v: 1;
  /** Master switch: off publishes an empty digest, so the VM stops at once. */
  on: boolean;
  lists: Record<string, ListRule>;
  levels: Record<string, SymLevels>;
}

export interface AlertsDigestRow {
  lists: string[];
  above?: number;
  below?: number;
  rvol?: number;
  move?: number;
}

export interface AlertsDigest {
  v: 1;
  at: string;
  on: boolean;
  n: number;
  syms: Record<string, AlertsDigestRow>;
  warn: string[];
}

/**
 * ×2 volume and ±4%: rare enough to mean something on a liquid name, common enough to
 * fire on a real news day. The VM also refuses volume in the first 15 minutes, when
 * the open auction alone can look like ×3.
 */
export const DEFAULT_RULE: ListRule = { on: false, price: true, volume: true, rvol: 2, move: false, movePct: 4 };

/** One yfinance 1-minute download per poll covers all of these; past it the poll outruns the minute. */
export const MAX_ALERT_SYMS = 120;

export const RVOL_RANGE = [1.2, 10] as const;
export const MOVE_RANGE = [1, 30] as const;

export function emptyConfig(): AlertsConfig {
  return { v: 1, on: true, lists: {}, levels: {} };
}

const num = (x: unknown): number | undefined =>
  typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : undefined;

const clamp = (x: unknown, [lo, hi]: readonly [number, number], dflt: number): number => {
  const n = num(x);
  return n === undefined ? dflt : Math.min(hi, Math.max(lo, n));
};

/** Whatever storage holds, as a config the rest of the code can trust. */
export function normalizeConfig(raw: unknown): AlertsConfig {
  const out = emptyConfig();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<AlertsConfig>;
  out.on = r.on !== false;
  for (const [id, rule] of Object.entries(r.lists ?? {})) {
    if (!rule || typeof rule !== 'object') continue;
    out.lists[id] = {
      on: rule.on === true,
      price: rule.price !== false,
      volume: rule.volume === true,
      rvol: clamp(rule.rvol, RVOL_RANGE, DEFAULT_RULE.rvol),
      move: rule.move === true,
      movePct: clamp(rule.movePct, MOVE_RANGE, DEFAULT_RULE.movePct),
    };
  }
  for (const [sym, lv] of Object.entries(r.levels ?? {})) {
    if (!lv || typeof lv !== 'object') continue;
    const above = num(lv.above);
    const below = num(lv.below);
    if (above === undefined && below === undefined) continue;
    out.levels[sym.toUpperCase()] = { ...(above !== undefined ? { above } : {}), ...(below !== undefined ? { below } : {}) };
  }
  return out;
}

export function ruleOf(cfg: AlertsConfig, listId: string): ListRule {
  return cfg.lists[listId] ?? { ...DEFAULT_RULE };
}

/** The market a ticker trades in, as the VM names it — and so the hours it is watched. */
export function alertMarketOf(sym: string): 'US' | 'EU' | 'VN' | null {
  const c = quoteCurrencyOf(sym);
  return c === 'USD' ? 'US' : c === 'EUR' ? 'EU' : c === 'VND' ? 'VN' : null;
}

export interface ListInput {
  id: string;
  name: string;
  items: string[];
}

/**
 * The flat per-ticker digest. Sorted keys, so the same rules always serialise the
 * same way and the feed's "unchanged" check holds.
 */
export function buildAlertsDigest(cfg: AlertsConfig, lists: ListInput[], now: Date): AlertsDigest {
  const rows = new Map<string, AlertsDigestRow>();
  const warn: string[] = [];
  const noLevel = new Set<string>();
  const noMarket = new Set<string>();
  if (cfg.on) {
    for (const l of lists) {
      const rule = cfg.lists[l.id];
      if (!rule?.on || !(rule.price || rule.volume || rule.move)) continue;
      for (const raw of l.items) {
        const sym = raw.trim().toUpperCase();
        if (!sym) continue;
        if (!alertMarketOf(sym)) {
          noMarket.add(sym);
          continue;
        }
        const lv = cfg.levels[sym];
        const row: AlertsDigestRow = rows.get(sym) ?? { lists: [] };
        let used = false;
        if (rule.price) {
          if (lv?.above !== undefined) row.above = lv.above;
          if (lv?.below !== undefined) row.below = lv.below;
          if (lv?.above !== undefined || lv?.below !== undefined) used = true;
          else if (!rule.volume && !rule.move) noLevel.add(sym);
        }
        if (rule.volume) {
          row.rvol = Math.min(row.rvol ?? Infinity, rule.rvol);
          used = true;
        }
        if (rule.move) {
          row.move = Math.min(row.move ?? Infinity, rule.movePct);
          used = true;
        }
        if (!used) continue;
        if (!row.lists.includes(l.name)) row.lists.push(l.name);
        rows.set(sym, row);
      }
    }
  }
  for (const s of noLevel) if (!rows.has(s)) warn.push(`${s}: no price level set`);
  if (noMarket.size) warn.push(`no market hours known for ${[...noMarket].sort().join(', ')}`);
  let keys = [...rows.keys()].sort();
  if (keys.length > MAX_ALERT_SYMS) {
    warn.push(`${keys.length} tickers, only the first ${MAX_ALERT_SYMS} are watched`);
    keys = keys.slice(0, MAX_ALERT_SYMS);
  }
  const syms: Record<string, AlertsDigestRow> = {};
  for (const k of keys) {
    const r = rows.get(k)!;
    syms[k] = { ...r, lists: [...r.lists].sort() };
  }
  return { v: 1, at: now.toISOString(), on: cfg.on, n: keys.length, syms, warn };
}
