/**
 * Scanner tab — read-only window onto the Python scanner running on the Oracle VM.
 *
 * The VM never accepts an inbound connection. It pushes JSON snapshots out to
 * `/api/scanner` (D1 table `scanner_kv`) via `push.py`, driven by cron; this tab
 * reads them back. So everything here is a *snapshot*, possibly minutes old, and
 * the age of each snapshot is itself information worth showing — see `healthNotes`.
 *
 * Nothing on this tab writes. Config editing and commands are separate keys
 * (`scanner:config`, `scanner:commands`) that only the app writes and only the VM
 * reads; the endpoint enforces that split with a 403, so a read-only tab cannot
 * accidentally become a write path.
 */
import type { AppContext } from '../context.js';
import { $, num, fmtBig } from '../ui/dom.js';
import { openStock } from '../ui/stockModal.js';
import { t } from '../ui/i18n.js';
import { isSyncEnabled } from '../adapters/syncClient.js';
import { scannerPull } from '../adapters/scannerClient.js';
import { openSyncSettings } from '../ui/syncSettings.js';
import { rankChartSvg, rankChartColor, type RankHistory } from './scannerRankChart.js';

const KEY_STATUS = 'scanner:status';
const KEY_CANDIDATES = 'scanner:candidates';
const KEY_REJECTS = 'scanner:rejects';
const ALERTS_PREFIX = 'scanner:alerts:';

// Nightly swing funnel (Stage 1–4). The spec for these asked for four HTTP
// endpoints; the VM opens no inbound port, so they are four D1 keys instead and
// `scannerPull` is the API. Note `scanner:thresholds`, NOT `scanner:config`: the
// endpoint reserves `scanner:config` for app→VM writes and would 403 the VM's
// writer token, so the read-only threshold view rides on a key the VM owns.
const KEY_REGIME = 'scanner:regime';
const KEY_SECTORS = 'scanner:sectors';
const KEY_WATCH = 'scanner:watchlist';
const KEY_THRESHOLDS = 'scanner:thresholds';

/**
 * Mirrors `setups.MAX_AGE`. Duplicated on purpose: the browser has no way to read
 * a Python constant, and the number is worth showing even when it drifts, because
 * the failure it describes is invisible otherwise — a `candidates` table older
 * than this makes `load_candidates()` return empty and the bot goes *completely*
 * silent, with no error and no message. If the Python side changes it, change it
 * here too.
 */
const MAX_AGE_DAYS = 5;

/**
 * `beat` is written every 20s by main.py's clock loop — unconditionally, not only
 * during market hours — so a beat more than this old *at the time of the push*
 * means the loop stopped. Compared against the push time, never against now; see
 * `healthNotes`.
 */
const BEAT_STALE_SEC = 120;
/** `--status` cron runs every minute during 04:00–20:59 ET. */
const PUSH_STALE_SEC = 600;
/** main.py's universe loop runs every 60s; 10 misses in a row is a dead source. */
const UNIVERSE_STALE_SEC = 600;

// ── shapes pushed by push.py ─────────────────────────────────────────────────
// Every field is optional: push.py builds status_payload() incrementally and
// omits a table it could not read, precisely so a half-built VM still reports.

interface Beat {
  ts?: number;
  pid?: number;
  up_sec?: number;
  dry?: boolean;
  session?: string;
  scanning?: boolean;
  scans?: number;
  errors?: number;
  n_alerts?: number;
  universe?: number;
  universe_age?: number | null;
  spool?: number;
  halts?: number;
  halts_err?: string | null;
  news_err?: string | null;
}

interface TableInfo {
  rows?: number;
  syms?: number;
  last?: string | null;
  updated?: string | null;
  age?: number | null;
  by_setup?: Record<string, number>;
}

/** One stage of the nightly chain, as `nightly.run()` records it. */
interface NightStage {
  stage?: string;
  ok?: boolean;
  fatal?: boolean;
  /** Did not run because a required stage ahead of it failed. NOT a failure. */
  blocked?: boolean;
  skipped?: boolean;
  sec?: number;
  err?: string | null;
  detail?: string | null;
}

interface NightRun {
  run_id?: string;
  day?: string;
  /** The bar the decisions were made on. Must be a CLOSED session. */
  bar?: string | null;
  ok?: boolean | number;
  code?: number;
  sec?: number;
  dry?: boolean | number;
  stages?: NightStage[];
  warn?: string[];
}

interface NightBlock {
  last?: NightRun | null;
  /** Last run that SUCCEEDED. A failed run does not make the data fresher. */
  last_ok?: NightRun | null;
  failed?: string[];
  blocked?: string[];
  stale?: {
    /** Working hours since the last success — weekends excluded. */
    hours?: number | null;
    limit?: number;
    stale?: boolean;
  };
}

interface Status {
  ts?: number;
  today?: string;
  db_error?: string;
  bars?: TableInfo;
  struct?: TableInfo;
  candidates?: TableInfo;
  alerts_today?: { n?: number; last?: string | null };
  tracking?: number;
  beat?: Beat;
  spool?: number;
  night?: NightBlock;
}

// ── nightly swing shapes ─────────────────────────────────────────────────────

interface RegimeRow {
  d?: string;
  trend?: string;
  vol?: string;
  slope_dir?: string;
  px?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  slope50?: number | null;
  atr14?: number | null;
  atr_pct?: number | null;
  atr_pct_avg?: number | null;
  atr_ratio?: number | null;
  bench?: string;
  n_bars?: number | null;
}

interface RegimeSnap {
  ts?: number;
  row?: RegimeRow;
  /** The previous session, so "what changed since yesterday" needs no second key. */
  prev?: RegimeRow | null;
  /**
   * Straight from the running `config.PLAYBOOK`, not from the row's stored
   * `playbook` column — so a drift between the two is visible rather than flattened.
   */
  playbook?: { setups?: string[]; size?: number | null; note?: string | null };
  age?: number | null;
}

interface SectorRow {
  d?: string;
  sym?: string;
  rank?: number | null;
  composite?: number | null;
  ret21?: number | null;
  ret63?: number | null;
  ret126?: number | null;
  px?: number | null;
  above_sma50?: number | null;
  above_ema21?: number | null;
  slope_up?: number | null;
  n_bars?: number | null;
}

interface SectorsSnap {
  ts?: number;
  d?: string;
  rows?: SectorRow[];
  /** `sym -> {"5": +2, "21": null}`. POSITIVE = moved UP. `null` = not knowable. */
  chg?: Record<string, Record<string, number | null>>;
  wins?: number[];
  /** Defensive sectors currently inside the top 3, or empty. */
  defensive?: string[];
  hist?: RankHistory;
  age?: number | null;
}

interface WatchRow {
  sym?: string;
  d?: string;
  sector?: string;
  ref_close?: number | null;
  pivot?: number | null;
  dist_pivot?: number | null;
  atr_pct?: number | null;
  off_high?: number | null;
  rs21?: number | null;
  rs63?: number | null;
  rs_pct?: number | null;
  adv20?: number | null;
  base_len?: number | null;
  quality?: number | null;
  /**
   * The playbook cell's coefficient (0 / 0.5 / 1), one value for the whole
   * session — "how much of a full position is today worth at all".
   */
  size?: number | null;
  /**
   * The trade plan, computed last night from the closed bar by plan.make().
   * These do not move during the session: the point of having them is that the
   * entry decision was made the night before and is only *executed* intraday.
   *
   * `size_pct` is the FINAL size as a fraction of capital — risk budget divided
   * by stop distance, with `size` above already folded in. Multiplying the two
   * halves the position and nobody notices.
   */
  trigger?: number | null;
  stop?: number | null;
  target?: number | null;
  stop_pct?: number | null;
  risk_pct?: number | null;
  size_pct?: number | null;
}

interface WatchSnap {
  ts?: number;
  d?: string;
  rows?: WatchRow[];
  /** Rows before the `watch_top` ceiling, so a truncated table says so. */
  total?: number;
  size?: number | null;
  age?: number | null;
}

interface ThresholdsSnap {
  ts?: number;
  config?: Record<string, unknown>;
}

interface Candidate {
  sym?: string;
  setup?: string;
  d?: string;
  ref_close?: number | null;
  pivot?: number | null;
  sma20?: number | null;
  adv20?: number | null;
  atr_pct?: number | null;
  base_len?: number | null;
  base_depth?: number | null;
  off_high?: number | null;
  rs_pct?: number | null;
  dist_pivot?: number | null;
  fund_ok?: boolean | null;
  quality?: number | null;
}

/** `by_setup` mixes `BO: Candidate[]` with `BO_total: number` — see candidates_payload(). */
interface CandidatesSnap {
  ts?: number;
  top?: number;
  by_setup?: Record<string, Candidate[] | number>;
}

interface RejectsSnap {
  ts?: number;
  struct?: number;
  cho_fund?: number | null;
  by_setup?: Record<string, Record<string, number>>;
}

interface AlertRow {
  ts_et?: string;
  kind?: string;
  sym?: string;
  score?: number | null;
  px?: number | null;
  chg?: number | null;
  rvol?: number | null;
  dollar_vol?: number | null;
  px15?: number | null;
  px60?: number | null;
  px_close?: number | null;
  hi_after?: number | null;
  lo_after?: number | null;
}

interface AlertsSnap {
  ts?: number;
  day?: string;
  rows?: AlertRow[];
}

// ── module state ─────────────────────────────────────────────────────────────
// Kept at module scope so re-rendering (theme flip, language flip, tab revisit)
// redraws the snapshot already in hand instead of re-fetching it. `since` makes
// the next poll incremental.

interface Held {
  value: unknown;
  /** Cloudflare's clock, not the VM's — the only stamp not subject to skew. */
  updatedAt: number;
}

const held = new Map<string, Held>();
let since = 0;
let loading = false;
let loadError: string | null = null;
let lastLoad = 0;

/** Sector table sort. Rank ascending is the order the ranking itself produced. */
type SectorSortKey = 'rank' | 'sym' | 'composite' | 'ret21' | 'ret63' | 'ret126'
  | 'chg0' | 'chg1';
let sectorSort: SectorSortKey = 'rank';
let sectorDesc = false;
/** Sectors switched off in the rank chart. Survives a redraw; not persisted. */
const chartOff = new Set<string>();

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function get<T>(key: string): T | null {
  return (held.get(key)?.value as T | undefined) ?? null;
}

/** Newest `scanner:alerts:<day>` we hold. push.py prunes anything over 10 days. */
function newestAlertsKey(): string | null {
  const keys = [...held.keys()].filter((k) => k.startsWith(ALERTS_PREFIX)).sort();
  return keys.length ? keys[keys.length - 1]! : null;
}

// ── small formatters ─────────────────────────────────────────────────────────

/** A 0..1 fraction as a percentage. Not `pct()` from dom.ts: that wants 0..100. */
const frac = (v: number | null | undefined, d = 1): string =>
  v == null ? '—' : (v * 100).toFixed(d) + '%';

const signed = (v: number | null | undefined, d = 1): string =>
  v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(d) + '%';

/**
 * A signed 0..1 fraction as a percentage. The `alerts.chg` column stores a
 * fraction (0.06), not a percent — render.py multiplies by 100 on its way into a
 * Telegram message. Reading it as a percent would print "+0.1%" for a 6% move,
 * which is wrong in the one direction nobody double-checks: it looks plausible.
 */
const signedFrac = (v: number | null | undefined, d = 1): string =>
  v == null ? '—' : signed(v * 100, d);

/** Percent move from `from` to `to`, both raw prices. */
const move = (from: number | null | undefined, to: number | null | undefined): number | null =>
  from == null || to == null || from <= 0 ? null : (to / from - 1) * 100;

function ago(ms: number | null | undefined): string {
  if (!ms) return '—';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function dur(sec: number | null | undefined): string {
  if (sec == null) return '—';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}

const stat = (k: string, v: string, color?: string): string =>
  `<div class="stat"><div class="k">${esc(k)}</div>`
  + `<div class="v"${color ? ` style="color:${color}"` : ''}>${v}</div></div>`;

const cell = (v: string, color?: string): string =>
  `<td${color ? ` style="color:${color}"` : ''}>${v}</td>`;

/**
 * A ticker, in the app's ticker colour.
 *
 * Every table in the app paints symbols with `.tkr` — the eye finds the one row it
 * came for by colour instead of reading down a column of monospace, and the scanner
 * has more symbol columns than anywhere else.
 */
const tkr = (sym: string | undefined): string =>
  sym ? `<span class="tkr">${esc(sym)}</span>` : '—';

// ── health ───────────────────────────────────────────────────────────────────

/**
 * The list of things that are wrong in a way that produces *silence* rather than
 * an error. Every entry here is a state where the scanner looks fine from the
 * outside — no crash, no alert, no message — and the only way to notice is to
 * come and read a number. That is the reason this tab exists at all, so this
 * block sits above the data, not below it.
 */
function healthNotes(status: Status | null, pushedAt: number | null): string[] {
  const out: string[] = [];
  if (!status) {
    out.push(t('scan.warn.nopush'));
    return out;
  }
  if (status.db_error) out.push(`${t('scan.warn.db')}: ${status.db_error}`);

  if (pushedAt && Date.now() - pushedAt > PUSH_STALE_SEC * 1000) {
    out.push(`${t('scan.warn.stale')} (${ago(pushedAt)})`);
  }

  const cAge = status.candidates?.age;
  if (cAge != null && cAge > MAX_AGE_DAYS) {
    out.push(`${t('scan.warn.silent')} (${cAge} > ${MAX_AGE_DAYS})`);
  }

  const b = status.beat;
  if (!b) {
    out.push(t('scan.warn.nobeat'));
  } else {
    // Measure the beat against the moment the snapshot was PUSHED, not against
    // now. `beat` only travels to the browser inside a snapshot, so once pushing
    // stops the beat inside the last snapshot ages forever and `Date.now()` would
    // accuse a perfectly healthy loop of having died — which is exactly what
    // happens between two `--status` runs, or before cron is installed at all.
    // A stalled pusher is a different fault and `scan.warn.stale` already owns it.
    // Clocks: b.ts is the VM's, pushedAt is Cloudflare's — both NTP-synced, so the
    // difference is meaningful in a way a browser clock never is. Clamp at 0 in
    // case the VM runs slightly ahead.
    const beatAge = b.ts ? Math.max(0, Math.round(((pushedAt ?? Date.now()) - b.ts) / 1000)) : null;
    if (beatAge != null && beatAge > BEAT_STALE_SEC) {
      out.push(`${t('scan.warn.beatstale')} (${dur(beatAge)})`);
    }
    if (b.dry) out.push(t('scan.warn.dry'));
    if (b.universe_age != null && b.universe_age > UNIVERSE_STALE_SEC) {
      out.push(`${t('scan.warn.universe')} (${dur(b.universe_age)})`);
    }
    if (b.halts_err) out.push(`${t('scan.warn.halts')}: ${b.halts_err}`);
    if (b.news_err) out.push(`${t('scan.warn.news')}: ${b.news_err}`);
  }

  const spool = status.spool ?? 0;
  if (spool > 0) out.push(`${t('scan.warn.spool')} (${spool})`);

  // The nightly chain. Its staleness is measured in WORKING hours on the VM, not
  // in wall-clock hours here: cron runs Mon–Fri, so a Monday morning is ~48 clock
  // hours after the last Friday run and a clock-hour threshold would raise the
  // banner every single Monday. A banner that cries every week stops being read,
  // and then it cannot report the real outage. See `push._biz_hours`.
  const ns = status.night?.stale;
  if (ns?.stale) {
    if (ns.hours == null) out.push(t('scan.warn.nightnever'));
    else {
      out.push(`${t('scan.warn.nightstale')} ${ns.limit ?? '?'} `
        + `${t('scan.warn.nightstale.tail')} (${Math.round(ns.hours)}h)`);
    }
  }
  // Named separately from staleness: a run that failed one hour ago is fresh AND
  // broken, and only the failure names which stage to go and look at.
  const nf = status.night?.failed ?? [];
  if (nf.length) out.push(`${t('scan.warn.nightfail')} ${nf.join(', ')}`);
  return out;
}

// ── nightly swing sections ───────────────────────────────────────────────────

/**
 * Colour of a regime. Only two states get a colour, and that is deliberate:
 * UPTREND is the one where the playbook opens up, DOWNTREND is the one where it
 * closes entirely. The two middle states are the ones you have to actually read
 * the note for, and painting them amber would invite deciding by colour instead.
 */
function trendColor(trend: string | undefined): string | undefined {
  if (trend === 'UPTREND') return 'var(--accent)';
  if (trend === 'DOWNTREND') return 'var(--danger)';
  return undefined;
}

const volColor = (vol: string | undefined): string | undefined =>
  vol === 'EXPANDED' ? 'var(--warn)' : undefined;

/** `1.0` → `100%`, `0.5` → `50%`, `0` → the words that say why. */
function sizeText(size: number | null | undefined): string {
  if (size == null) return '—';
  if (size <= 0) return `<span style="color:var(--danger)">${t('scan.today.nosize')}</span>`;
  return `${Math.round(size * 100)}%`;
}

const enumLabel = (kind: 'trend' | 'vol', v: string | undefined): string =>
  v ? `${t(`scan.${kind}.${v}`)} <span class="muted" style="font-size:11px">${esc(v)}</span>` : '—';

/**
 * Today: the regime, the volatility bucket, and the playbook cell they select.
 *
 * It sits first on the page because it is the one thing that changes what you are
 * allowed to do with everything below it. A watch list read without knowing the
 * regime is a list of trades you may not be permitted to take.
 */
function renderToday(snap: RegimeSnap | null): string {
  const title = `<h2 class="section-title">${t('scan.sec.today')}</h2>`;
  const r = snap?.row;
  if (!r) return `${title}<p class="muted">${t('scan.today.none')}</p>`;

  const pb = snap?.playbook ?? {};
  const setups = pb.setups?.length ? pb.setups.join(' · ') : t('scan.today.nosetup');

  const tiles = [
    stat(t('scan.today.trend'), enumLabel('trend', r.trend), trendColor(r.trend)),
    stat(t('scan.today.vol'), enumLabel('vol', r.vol), volColor(r.vol)),
    stat(t('scan.today.setups'), esc(setups),
      pb.setups?.length ? undefined : 'var(--danger)'),
    stat(t('scan.today.size'), sizeText(pb.size)),
  ].join('');

  // The decision bar, stated plainly. It is the answer to the one question this
  // whole pipeline can get catastrophically wrong — acting on a bar that has not
  // closed — and `nightly._check_bar` already raises a warning when it looks
  // wrong, so the number is here for the reader to confirm, not to be trusted on
  // its own.
  const bar = `<div class="stat"><div class="k">${t('scan.today.bar')}</div>`
    + `<div class="v">${esc(r.d ?? '—')}`
    + `<span class="muted" style="font-size:11px"> · ${esc(r.bench ?? '')}`
    + `${r.n_bars ? ` · ${r.n_bars} ${t('scan.col.bars')}` : ''}</span></div></div>`;

  const atr = `<div class="stat"><div class="k">${t('scan.today.atr')}</div>`
    + `<div class="v"${volColor(r.vol) ? ` style="color:${volColor(r.vol)}"` : ''}>`
    + `${num(r.atr_ratio, 2)}×`
    + `<span class="muted" style="font-size:11px"> · ${frac(r.atr_pct, 2)}</span>`
    + `</div></div>`;

  // Only when it actually changed. "unchanged since yesterday" printed every day
  // is noise that trains the eye to skip the line that matters on the day it does.
  const prev = snap?.prev;
  const changed = prev && prev.trend && prev.trend !== r.trend
    ? `<p class="muted" style="font-size:12px;margin:8px 0 0">`
      + `${t('scan.today.changed')} <b>${esc(t(`scan.trend.${prev.trend}`))}</b>`
      + `${prev.vol && prev.vol !== r.vol ? ` / ${esc(t(`scan.vol.${prev.vol}`))}` : ''}</p>`
    : '';

  const note = pb.note
    ? `<div class="card" style="margin-top:10px">${esc(pb.note)}${changed}</div>`
    : changed;

  return `${title}
    <div class="grid grid-cards">${tiles}</div>
    <div class="grid grid-cards" style="margin-top:10px">${bar}${atr}</div>
    ${note}`;
}

/** `+2` / `-1` / `—`. Zero prints `0`, never `—`: unchanged ≠ unknown. */
function rankDelta(v: number | null | undefined): string {
  if (v == null) return '<span class="muted">—</span>';
  if (v === 0) return '0';
  // Positive = moved UP the ranking = better. Arrow AND sign, because an arrow
  // alone inherits whichever direction the reader assumes "up" means in a table
  // whose rank numbers get smaller as things improve.
  return `<span style="color:${v > 0 ? 'var(--accent)' : 'var(--danger)'}">`
    + `${v > 0 ? '▲' : '▼'}${Math.abs(v)}</span>`;
}

/** A boolean trend flag. `·` for false rather than a red ✕: it is context, not a fault. */
const flag = (v: number | null | undefined): string =>
  v ? `<span style="color:var(--accent)">✓</span>` : `<span class="muted">·</span>`;

function sectorSortVal(r: SectorRow, key: SectorSortKey,
                       chg: Record<string, Record<string, number | null>>,
                       wins: number[]): number | string | null {
  switch (key) {
    case 'sym': return r.sym ?? '';
    case 'chg0': return chg[r.sym ?? '']?.[String(wins[0] ?? 5)] ?? null;
    case 'chg1': return chg[r.sym ?? '']?.[String(wins[1] ?? 21)] ?? null;
    default: return r[key] ?? null;
  }
}

function renderSectors(snap: SectorsSnap | null, topN: number): string {
  const title = `<div class="section-title-row">`
    + `<h2 class="section-title">${t('scan.sec.sectors')}</h2>`
    + `${snap?.d ? `<span class="tag">${esc(snap.d)}</span>` : ''}</div>`;
  const rows = snap?.rows ?? [];
  if (!rows.length) return `${title}<p class="muted">${t('scan.sectors.none')}</p>`;

  const chg = snap?.chg ?? {};
  const wins = snap?.wins?.length ? snap.wins : [5, 21];

  // Defensive sectors in the top 3. This is a real regime signal that the trend
  // classifier cannot see — SPY can still be above both averages while the money
  // inside it has already moved to staples and utilities — so it is a banner, not
  // a table cell.
  const def = snap?.defensive ?? [];
  const banner = def.length
    ? `<div class="notice" style="margin-bottom:8px">`
      + `${t('scan.sectors.defensive')} <b>${esc(def.join(', '))}</b></div>`
    : '';

  const cols: { key: SectorSortKey; label: string }[] = [
    { key: 'rank', label: '#' },
    { key: 'sym', label: t('scan.col.sym') },
    { key: 'composite', label: t('scan.col.score') },
    { key: 'ret21', label: '21d' },
    { key: 'ret63', label: '63d' },
    { key: 'ret126', label: '126d' },
    { key: 'chg0', label: `Δ${wins[0]}d` },
    { key: 'chg1', label: `Δ${wins[1]}d` },
  ];

  const sorted = [...rows].sort((a, b) => {
    const x = sectorSortVal(a, sectorSort, chg, wins);
    const y = sectorSortVal(b, sectorSort, chg, wins);
    // Unknown sorts last in BOTH directions. Treating `null` as 0 would park a
    // sector with no history in the middle of the ranking as though it had been
    // measured and found average.
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    const c = typeof x === 'string' || typeof y === 'string'
      ? String(x).localeCompare(String(y))
      : (x as number) - (y as number);
    return sectorDesc ? -c : c;
  });

  const arrow = (k: SectorSortKey) => (k === sectorSort ? (sectorDesc ? ' ▾' : ' ▴') : '');
  const head = cols.map((c) =>
    `<th class="sortable${c.key === sectorSort ? ' sorted' : ''}"`
    + ` data-sec-sort="${c.key}">${esc(c.label)}${arrow(c.key)}</th>`).join('')
    + `<th>&gt;50SMA</th><th>&gt;21EMA</th><th>${t('scan.col.slope')}</th>`;

  const body = sorted.map((r) => {
    const top = (r.rank ?? 99) <= topN;
    const cs = chg[r.sym ?? ''] ?? {};
    // Top 3 is the only highlight: those are the baskets Stage 3 is allowed to
    // look inside, so "in the top 3" is not a decoration, it is the boundary of
    // where stock picking happens at all.
    return `<tr${top ? ' style="background:color-mix(in srgb, var(--accent) 9%, transparent)"' : ''}>`
      + `<td${top ? ' style="color:var(--accent);font-weight:700"' : ''}>${r.rank ?? '—'}</td>`
      + `<td${top ? ' style="font-weight:700"' : ''}>${tkr(r.sym)}</td>`
      + cell(num(r.composite, 1))
      + cell(signedFrac(r.ret21), (r.ret21 ?? 0) >= 0 ? 'var(--accent)' : 'var(--danger)')
      + cell(signedFrac(r.ret63), (r.ret63 ?? 0) >= 0 ? 'var(--accent)' : 'var(--danger)')
      + cell(signedFrac(r.ret126), (r.ret126 ?? 0) >= 0 ? 'var(--accent)' : 'var(--danger)')
      + `<td>${rankDelta(cs[String(wins[0] ?? 5)])}</td>`
      + `<td>${rankDelta(cs[String(wins[1] ?? 21)])}</td>`
      + `<td>${flag(r.above_sma50)}</td><td>${flag(r.above_ema21)}</td>`
      + `<td>${flag(r.slope_up)}</td>`
      + `</tr>`;
  }).join('');

  return `${title}${banner}
    <div class="card" style="padding:0;overflow-x:auto">
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </div>
    ${renderRankChart(snap, topN)}`;
}

/**
 * The rank history chart, plus one toggle chip per sector.
 *
 * Toggling redraws the SVG from the snapshot already held — no fetch, and the
 * hidden set is module state so it survives a theme flip or a tab revisit. The
 * chips carry the line colour so "which line is XLE" needs no legend hunting.
 */
function renderRankChart(snap: SectorsSnap | null, topN: number): string {
  const hist = snap?.hist;
  const days = hist?.days ?? [];
  const order = Object.keys(hist?.series ?? {});
  const title = `<div class="section-title-row">`
    + `<h3 class="section-title">${t('scan.sec.chart')}</h3>`
    + (days.length
      ? `<span class="tag">${days.length} ${t('scan.chart.sessions')}</span>`
        + `<span class="tag">${esc(days[0]!)} → ${esc(days[days.length - 1]!)}</span>`
      : `<span class="tag">${t('scan.chart.none')}</span>`)
    + `</div>`;

  if (days.length < 2 || !order.length) {
    return `${title}<p class="muted">${t('scan.chart.none')}</p>`;
  }

  const emphasis = new Set((snap?.rows ?? [])
    .filter((r) => (r.rank ?? 99) <= topN)
    .map((r) => r.sym ?? ''));

  const chips = order.map((sym) => {
    const off = chartOff.has(sym);
    const c = rankChartColor(order, sym);
    return `<button class="tag" data-chart-sym="${esc(sym)}"`
      + ` style="cursor:pointer;border:1px solid ${off ? 'var(--border)' : c};`
      + `background:transparent;color:${off ? 'var(--faint)' : c};`
      + `${off ? 'text-decoration:line-through;' : ''}font-weight:600">${esc(sym)}</button>`;
  }).join('');

  return `${title}
    <div class="card">
      ${rankChartSvg(hist, { order, hidden: chartOff, emphasis })}
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:10px">${chips}</div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">${t('scan.chart.note')}</p>
    </div>`;
}

const tvHref = (sym: string): string =>
  `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sym)}`;

const tvLink = (sym: string): string =>
  `<a href="${tvHref(sym)}" target="_blank" rel="noopener" title="${t('scan.watch.tv')}"`
  + ` data-tv="1" class="tkr">${esc(sym)} ↗</a>`;

/**
 * The swing watch list — the nightly output, and the only list the intraday
 * process is ever allowed to alert on (prompt 2).
 *
 * `blocked` matters here: an empty table means "nothing cleared the floor" on a
 * normal day and "the filter never ran" on a broken one, and those two read almost
 * identically while calling for opposite actions. So the caller passes whether the
 * filter stage actually completed rather than letting the reader guess.
 */
function renderWatch(snap: WatchSnap | null, blocked: boolean): string {
  const rows = snap?.rows ?? [];
  const total = snap?.total ?? rows.length;
  const title = `<div class="section-title-row">`
    + `<h2 class="section-title">${t('scan.sec.watch')}</h2>`
    + `${snap?.d ? `<span class="tag">${esc(snap.d)}</span>` : ''}`
    + `${rows.length ? `<span class="tag">${total > rows.length ? `${rows.length} / ${total}` : total}</span>` : ''}`
    + `</div>`;

  if (!rows.length) {
    return `${title}<p class="muted">`
      + `${blocked ? t('scan.watch.blocked') : t('scan.watch.none')}</p>`;
  }

  // Two header rows: the plan you act on, then the evidence that put the ticker
  // there. They are genuinely different kinds of number and reading them as one
  // flat strip of 15 columns is how you end up entering at the pivot instead of
  // at the trigger.
  const PLAN = [t('scan.watch.entry'), t('scan.watch.togo'), t('scan.watch.stop'),
    t('scan.watch.target'), t('scan.watch.sizepct')];
  const CTX = [t('scan.col.sector'), t('scan.col.qual'), t('scan.col.close'),
    'ATR%', t('scan.col.offhigh'), 'RS21', 'RS63', t('scan.col.base'), 'ADV20'];
  const head = `<tr>`
    + `<th rowspan="2" class="wl-sep-r">${t('scan.col.sym')}</th>`
    + `<th colspan="${PLAN.length}" class="wl-grp wl-sep-r">${t('scan.watch.grp.plan')}</th>`
    + `<th colspan="${CTX.length}" class="wl-grp">${t('scan.watch.grp.ctx')}</th>`
    + `</tr><tr>`
    + PLAN.map((h, i) => `<th${i === PLAN.length - 1 ? ' class="wl-sep-r"' : ''}>${h}</th>`).join('')
    + CTX.map((h) => `<th>${h}</th>`).join('')
    + `</tr>`;

  const body = rows.map((r) => {
    // Distance still to travel to the planned trigger. Negative means price is
    // already through it — that is a ticker to look at first, not last, so it
    // gets the accent colour.
    const togo = r.trigger != null && r.ref_close != null && r.ref_close > 0
      ? r.trigger / r.ref_close - 1 : null;
    const togoColor = togo == null ? undefined
      : togo <= 0 ? 'var(--accent)'
      : togo <= 0.02 ? 'var(--warn)'
      : undefined;
    // …and the same distance in ATR, because 2% is close for a quiet stock and
    // nothing at all for a volatile one.
    const atr = r.atr_pct != null && r.ref_close != null ? r.atr_pct * r.ref_close : null;
    const togoAtr = togo != null && atr && atr > 0
      ? `<span class="muted" style="font-size:11px"> ${((togo * (r.ref_close ?? 0)) / atr).toFixed(1)}×A</span>`
      : '';
    const noPlan = r.trigger == null || r.stop == null;
    return `<tr data-sym="${esc(r.sym ?? '')}">`
      + `<td class="wl-sep-r">${r.sym ? tvLink(r.sym) : '—'}</td>`
      + (noPlan
        // One dash per cell would read as "zero"; one spanned note reads as
        // "this row has no plan", which is the actual state.
        ? `<td colspan="${PLAN.length}" class="muted wl-sep-r">${t('scan.watch.noplan')}</td>`
        : cell(num(r.trigger, 2), 'var(--text)')
          + cell(togo == null ? '—' : signedFrac(togo) + togoAtr, togoColor)
          + cell(`${num(r.stop, 2)}<span class="muted" style="font-size:11px">`
            + ` ${r.stop_pct == null ? '—' : `−${frac(r.stop_pct, 1)}`}</span>`,
            'var(--danger)')
          + cell(num(r.target, 2), 'var(--accent)')
          + `<td class="wl-sep-r">${sizeText(r.size_pct)}</td>`)
      + `<td><span class="tag">${esc(r.sector ?? '—')}</span></td>`
      + cell(num(r.quality, 2))
      + cell(num(r.ref_close, 2))
      + cell(frac(r.atr_pct, 1))
      + cell(frac(r.off_high, 1))
      // Relative strength vs the benchmark, as excess return in percentage points.
      // Both windows are shown because a single positive window can be luck and
      // Stage 3 requires both — so seeing both is seeing the reason it qualified.
      + cell(signedFrac(r.rs21), (r.rs21 ?? 0) >= 0 ? 'var(--accent)' : 'var(--danger)')
      + cell(signedFrac(r.rs63), (r.rs63 ?? 0) >= 0 ? 'var(--accent)' : 'var(--danger)')
      + cell(r.base_len == null ? '—' : String(r.base_len))
      + cell(fmtBig(r.adv20))
      + `</tr>`;
  }).join('');

  return `${title}
    <div class="card" style="padding:0;overflow-x:auto">
      <table class="wl"><thead>${head}</thead><tbody>${body}</tbody></table>
    </div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">${t('scan.watch.note')}</p>`;
}

const STAGE_MARK: Record<string, [string, string]> = {
  ok: ['✓', 'var(--accent)'],
  failed: ['✕', 'var(--danger)'],
  blocked: ['–', 'var(--faint)'],
  skipped: ['·', 'var(--faint)'],
};

/**
 * The nightly run report: when it last ran, when it last SUCCEEDED, and which
 * stage broke.
 *
 * `failed` and `blocked` are two different columns of the same table on purpose.
 * A blocked stage is a consequence — it never ran because something ahead of it
 * died — and counting it as an error turns one root cause into four, leaving the
 * reader to work out which one to go and fix. The same split exists in
 * `render_night._failed/_blocked` and in `push._night`; all three have to agree.
 */
function renderNight(night: NightBlock | null | undefined): string {
  const title = `<h2 class="section-title">${t('scan.sec.night')}</h2>`;
  const last = night?.last;
  if (!last) return `${title}<p class="muted">${t('scan.night.none')}</p>`;

  const ok = !!last.ok;
  const st = night?.stale;
  const tiles = [
    stat(t('scan.night.last'), esc((last.run_id ?? '').slice(0, 16) || '—'),
      ok ? undefined : 'var(--danger)'),
    stat(t('scan.night.lastok'),
      night?.last_ok?.run_id
        ? esc(night.last_ok.run_id.slice(0, 16))
        : `<span style="color:var(--danger)">${t('scan.night.never')}</span>`,
      st?.stale ? 'var(--danger)' : undefined),
    stat(t('scan.night.took'), last.sec == null ? '—' : `${last.sec.toFixed(1)}s`),
    stat(t('scan.night.exit'), String(last.code ?? '—'),
      last.code ? 'var(--danger)' : 'var(--accent)'),
    stat(t('scan.today.bar'), esc(last.bar ?? '—'),
      // The chain records the bar it decided on; when it equals the run day the
      // bar had not closed. nightly._check_bar already warns, and the warning
      // shows up in the list below — this colour is a second place to notice it.
      last.bar && last.bar === last.day ? 'var(--danger)' : undefined),
    stat(t('scan.night.source'), `<span style="font-size:12px;font-weight:500">`
      + `${t('scan.night.sourceval')}</span>`),
  ].join('');

  const stages = (last.stages ?? []).map((s) => {
    // `skipped` and `blocked` are tested BEFORE `ok`, and the order is the whole
    // point: the chain records a skipped stage as `ok: true` so that the stages
    // behind it still run, so testing `ok` first files every skip under a green
    // tick. That produced a row reading "push ✓ done — not configured (missing
    // SCANNER_PUSH_URL)", which is a page telling the reader two opposite things
    // at once about the one stage they would need to go and fix.
    const state = s.skipped ? 'skipped' : s.blocked ? 'blocked' : s.ok ? 'ok' : 'failed';
    const [glyph, color] = STAGE_MARK[state]!;
    return `<tr><td style="color:${color};text-align:center">${glyph}</td>`
      + `<td>${esc(s.stage ?? '—')}</td>`
      + `<td style="color:${color}">${t(`scan.night.${state}`)}</td>`
      + `<td>${s.sec == null ? '—' : `${s.sec.toFixed(2)}s`}</td>`
      + `<td>${esc(s.err ?? s.detail ?? '—')}</td></tr>`;
  }).join('');

  const warns = (last.warn ?? []).map((w) =>
    `<div class="notice" style="margin-top:6px;font-size:12px">${esc(w)}</div>`).join('');

  const dry = last.dry
    ? `<div class="notice" style="margin-top:8px">${t('scan.night.dry')}</div>` : '';

  return `${title}
    <div class="grid grid-cards">${tiles}</div>
    ${dry}
    ${stages ? `<div class="card" style="padding:0;overflow-x:auto;margin-top:10px">
      <table><thead><tr><th></th><th>${t('scan.night.stage')}</th><th></th>
      <th>${t('scan.night.sec')}</th><th>${t('scan.night.detail')}</th></tr></thead>
      <tbody>${stages}</tbody></table></div>` : ''}
    ${warns}`;
}

/** One config value, flattened for display. Tuples arrive as JSON arrays. */
function thValue(v: unknown): string {
  if (v == null) return '—';
  if (Array.isArray(v)) return esc(v.map((x) => String(x)).join(' · '));
  if (typeof v === 'object') return esc(JSON.stringify(v));
  return esc(String(v));
}

/**
 * The thresholds actually in force, read-only.
 *
 * Collapsed by default: it is a reference you open when a number on this page
 * surprises you, not something to scroll past every visit. It is the running
 * `config.snapshot()` from the VM, so if a figure here looks wrong, that IS the
 * figure the scanner used — the page cannot be out of date with respect to itself.
 */
function renderThresholds(snap: ThresholdsSnap | null): string {
  const title = `<h2 class="section-title">${t('scan.sec.thresholds')}</h2>`;
  const cfg = snap?.config;
  if (!cfg) return `${title}<p class="muted">${t('scan.th.none')}</p>`;

  const sections = Object.entries(cfg).map(([group, val]) => {
    // `playbook` is the 12-row lookup table, not a bag of scalars — the one group
    // that has to keep its own shape to be readable at all.
    if (group === 'playbook' && Array.isArray(val)) {
      const rows = (val as Record<string, unknown>[]).map((p) =>
        `<tr><td>${esc(String(p.trend ?? ''))}</td>`
        + `<td>${esc(String(p.vol ?? ''))}</td>`
        + `<td>${thValue(p.setups)}</td>`
        + `<td>${sizeText(typeof p.size === 'number' ? p.size : null)}</td>`
        + `<td>${esc(String(p.note ?? ''))}</td></tr>`).join('');
      return `<h3 class="section-title">${t('scan.sec.playbook')}</h3>
        <div class="card" style="padding:0;overflow-x:auto">
        <table><thead><tr><th>${t('scan.col.regime')}</th><th>${t('scan.col.volat')}</th>
        <th>${t('scan.col.setups')}</th><th>${t('scan.col.size')}</th>
        <th>${t('scan.col.note')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const rows = Object.entries(val as Record<string, unknown>).map(([k, v]) =>
        `<tr><td>${esc(k)}</td><td>${thValue(v)}</td></tr>`).join('');
      return `<h3 class="section-title">${esc(group)}</h3>
        <div class="card" style="padding:0;overflow-x:auto">
        <table><tbody>${rows}</tbody></table></div>`;
    }
    return `<div class="stat"><div class="k">${esc(group)}</div>`
      + `<div class="v" style="font-size:13px">${thValue(val)}</div></div>`;
  });

  // Scalars first in one card row, then the grouped tables.
  const scalars = sections.filter((s) => s.startsWith('<div class="stat"'));
  const groups = sections.filter((s) => !s.startsWith('<div class="stat"'));

  return `<details><summary style="cursor:pointer;margin:18px 0 4px">
      <span class="section-title" style="display:inline">${t('scan.sec.thresholds')}</span>
      <span class="muted" style="font-size:12px"> — ${t('scan.th.show')}</span>
    </summary>
    <p class="muted" style="font-size:12px;margin:0 0 8px">${t('scan.th.note')}</p>
    ${scalars.length ? `<div class="grid grid-cards">${scalars.join('')}</div>` : ''}
    ${groups.join('')}
  </details>`;
}

// ── sections ─────────────────────────────────────────────────────────────────

function renderStatus(status: Status | null, pushedAt: number | null): string {
  if (!status) return '';
  const b = status.beat;
  const tiles: string[] = [];

  tiles.push(stat(t('scan.st.session'), esc(b?.session ?? '—')));
  tiles.push(stat(t('scan.st.uptime'), dur(b?.up_sec)));
  tiles.push(stat(t('scan.st.scans'), b?.scans == null ? '—' : String(b.scans)));
  tiles.push(
    stat(
      t('scan.st.errors'),
      b?.errors == null ? '—' : String(b.errors),
      b?.errors ? 'var(--danger)' : undefined,
    ),
  );
  tiles.push(stat(t('scan.st.universe'), b?.universe == null ? '—' : String(b.universe)));
  tiles.push(stat(t('scan.st.alerts'), String(status.alerts_today?.n ?? 0)));
  tiles.push(stat(t('scan.st.tracking'), String(status.tracking ?? 0)));
  tiles.push(stat(t('scan.st.pushed'), ago(pushedAt)));

  // Table freshness. `age` is in trading-day terms from the VM's own `today`, and
  // it is the number that explains a silent scanner, so it gets its own row.
  const table = (label: string, info: TableInfo | undefined, rows?: string): string => {
    if (!info) return stat(label, `<span class="muted">${t('scan.st.missing')}</span>`);
    const age = info.age;
    const warn = age != null && age > MAX_AGE_DAYS;
    const body = `${rows ?? String(info.rows ?? 0)}`
      + `<span class="muted" style="font-size:11px"> · ${esc(info.last ?? '—')}`
      + `${age == null ? '' : ` (${age}d)`}</span>`;
    return stat(label, body, warn ? 'var(--danger)' : undefined);
  };

  const bySetup = status.candidates?.by_setup ?? {};
  const setupLine = Object.keys(bySetup).length
    ? Object.entries(bySetup)
        .map(([k, n]) => `${esc(k)} ${n}`)
        .join(' · ')
    : String(status.candidates?.rows ?? 0);

  const tables = [
    table('bars', status.bars, `${status.bars?.syms ?? 0} · ${fmtBig(status.bars?.rows)}`),
    table('struct', status.struct),
    table('candidates', status.candidates, setupLine),
  ].join('');

  return `
    <h2 class="section-title">${t('scan.sec.status')}</h2>
    <div class="grid grid-cards">${tiles.join('')}</div>
    <div class="grid grid-cards" style="margin-top:10px">${tables}</div>`;
}

/** Built per render, not once at module scope: the labels follow the language. */
const candHead = (): string[] => [
  t('scan.col.sym'), t('scan.col.qual'), t('scan.col.close'), t('scan.col.pivot'),
  t('scan.col.topivot'), t('scan.col.base'), t('scan.col.depth'),
  t('scan.col.offhigh'), 'RS', 'ADV20', 'ATR%', t('scan.col.fund'),
];

function candRow(c: Candidate): string {
  const dist = c.dist_pivot;
  // dist_pivot > 0 means still below the pivot; <= 0 means already through it.
  const distColor = dist == null ? undefined
    : dist <= 0 ? 'var(--accent)'
    : dist <= 0.02 ? 'var(--warn)'
    : undefined;
  const fund = c.fund_ok === true ? t('scan.col.fundok')
    : c.fund_ok === false ? t('scan.col.fundno') : '—';
  return `<tr data-sym="${esc(c.sym ?? '')}">`
    + `<td>${tkr(c.sym)}</td>`
    + cell(num(c.quality, 2))
    + cell(num(c.ref_close, 2))
    + cell(num(c.pivot, 2))
    + cell(dist == null ? '—' : frac(dist), distColor)
    + cell(c.base_len == null ? '—' : String(c.base_len))
    + cell(frac(c.base_depth, 0))
    + cell(frac(c.off_high, 0))
    + cell(num(c.rs_pct, 0))
    + cell(fmtBig(c.adv20))
    + cell(frac(c.atr_pct, 1))
    + cell(fund, c.fund_ok === false ? 'var(--danger)' : undefined)
    + `</tr>`;
}

function renderCandidates(snap: CandidatesSnap | null): string {
  const by = snap?.by_setup ?? {};
  const setups = Object.keys(by).filter((k) => Array.isArray(by[k])).sort();
  if (!setups.length) {
    return `<h2 class="section-title">${t('scan.sec.watch')}</h2>`
      + `<p class="muted">${t('scan.nocand')}</p>`;
  }

  const blocks = setups.map((s) => {
    const rows = by[s] as Candidate[];
    const total = typeof by[`${s}_total`] === 'number' ? (by[`${s}_total`] as number) : rows.length;
    // Rows arrive sorted by quality and truncated to TOP_N. They are NOT re-sorted
    // here: re-ranking a truncated list by "closest to pivot" would read as "the
    // closest in the market" when it is only the closest among the top N by quality.
    const cut = total > rows.length
      ? `<span class="tag">${rows.length} / ${total}</span>`
      : `<span class="tag">${total}</span>`;
    const head = candHead().map((h) => `<th>${esc(h)}</th>`).join('');
    return `
      <div class="section-title-row">
        <h3 class="section-title">${esc(s)}</h3>${cut}
      </div>
      <div class="card" style="padding:0;overflow-x:auto">
        <table><thead><tr>${head}</tr></thead>
        <tbody>${rows.map(candRow).join('')}</tbody></table>
      </div>`;
  });

  return `<h2 class="section-title">${t('scan.sec.cand')}</h2>${blocks.join('')}`;
}

function renderRejects(snap: RejectsSnap | null): string {
  const by = snap?.by_setup ?? {};
  const setups = Object.keys(by).sort();
  if (!setups.length) {
    return `<h2 class="section-title">${t('scan.sec.rejects')}</h2>`
      + `<p class="muted">${t('scan.norej')}</p>`;
  }

  const blocks = setups.map((s) => {
    const raw = by[s] ?? {};
    // Keys starting with `_` are counters, not reasons: `_qua_loc` = passed the
    // filter, `_bi_cat_tran` = passed but cut by the MAX_CAND ceiling.
    const reasons = Object.entries(raw)
      .filter(([k]) => !k.startsWith('_'))
      .sort((a, b) => b[1] - a[1]);
    const passed = raw['_qua_loc'] ?? 0;
    const cutoff = raw['_bi_cat_tran'] ?? 0;
    const total = reasons.reduce((n, [, v]) => n + v, 0) + passed;
    const rows = reasons.map(([reason, n]) => {
      const share = total ? (n / total) * 100 : 0;
      return `<tr><td>${esc(reason)}</td>`
        + `<td>${n}</td>`
        + `<td><span class="scorebar"><span style="width:${share.toFixed(1)}%"></span></span>`
        + ` <span class="muted">${share.toFixed(1)}%</span></td></tr>`;
    });
    return `
      <div class="section-title-row">
        <h3 class="section-title">${esc(s)}</h3>
        <span class="tag">${t('scan.rej.passed')} ${passed}</span>
        ${cutoff ? `<span class="tag">${t('scan.rej.cut')} ${cutoff}</span>` : ''}
      </div>
      <div class="card" style="padding:0;overflow-x:auto">
        <table><thead><tr><th>${t('scan.col.reason')}</th>
        <th>${t('scan.col.count')}</th><th>${t('scan.col.share')}</th></tr></thead>
        <tbody>${rows.join('')}</tbody></table>
      </div>`;
  });

  const meta: string[] = [];
  if (snap?.struct != null) meta.push(`struct ${snap.struct}`);
  if (snap?.cho_fund) meta.push(`${t('scan.rej.fund')} ${snap.cho_fund}`);

  return `
    <div class="section-title-row">
      <h2 class="section-title">${t('scan.sec.rejects')}</h2>
      ${meta.map((m) => `<span class="tag">${esc(m)}</span>`).join('')}
    </div>
    <p class="muted" style="font-size:12px;margin:0 0 8px">${t('scan.rej.note')}</p>
    ${blocks.join('')}`;
}

function renderAlerts(snap: AlertsSnap | null): string {
  const rows = snap?.rows ?? [];
  const title = `<div class="section-title-row"><h2 class="section-title">${t('scan.sec.alerts')}</h2>`
    + `${snap?.day ? `<span class="tag">${esc(snap.day)}</span>` : ''}</div>`;
  if (!rows.length) return `${title}<p class="muted">${t('scan.noalerts')}</p>`;

  const body = rows.map((r) => {
    // Outcome prices are shown as a move from the alert price, not as raw prices:
    // "+1.4%" answers "was the alert any good", "18.42" does not.
    const g = (v: number | null | undefined): string => {
      const m = move(r.px, v);
      return m == null ? '—' : `<span style="color:${m >= 0 ? 'var(--accent)' : 'var(--danger)'}">${signed(m)}</span>`;
    };
    return `<tr data-sym="${esc(r.sym ?? '')}">`
      + `<td>${esc((r.ts_et ?? '').slice(11, 16) || '—')}</td>`
      + `<td>${esc(r.kind ?? '—')}</td>`
      + `<td>${tkr(r.sym)}</td>`
      + cell(num(r.score, 1))
      + cell(num(r.px, 2))
      + cell(signedFrac(r.chg), (r.chg ?? 0) >= 0 ? 'var(--accent)' : 'var(--danger)')
      + cell(num(r.rvol, 1))
      + cell(fmtBig(r.dollar_vol))
      + `<td>${g(r.px15)}</td><td>${g(r.px60)}</td><td>${g(r.px_close)}</td>`
      + `<td>${g(r.hi_after)}</td><td>${g(r.lo_after)}</td>`
      + `</tr>`;
  });

  const head = [t('scan.col.time'), t('scan.col.kind'), t('scan.col.sym'),
    t('scan.col.score'), 'Px', 'Chg', 'RVol', '$Vol', '+15m', '+60m',
    t('scan.col.close'), 'MFE', 'MAE'].map((h) => `<th>${esc(h)}</th>`).join('');
  return `${title}
    <div class="card" style="padding:0;overflow-x:auto">
      <table><thead><tr>${head}</tr></thead><tbody>${body.join('')}</tbody></table>
    </div>`;
}

// ── shell ────────────────────────────────────────────────────────────────────

/**
 * The nine sections, in the order they are read.
 *
 * One list drives both the jump bar and the `<section>` wrappers, so a pill can
 * never point at an anchor that does not exist. The order is deliberate — the
 * market first (regime, sectors), then what to do about it (watch list), then the
 * machinery behind it (run log, status, raw candidates, rejects, alerts, config).
 */
const SECS = [
  { id: 'today', key: 'scan.sec.today' },
  { id: 'sectors', key: 'scan.sec.sectors' },
  { id: 'watch', key: 'scan.sec.watch' },
  { id: 'night', key: 'scan.sec.night' },
  { id: 'status', key: 'scan.sec.status' },
  { id: 'cand', key: 'scan.sec.cand' },
  { id: 'rejects', key: 'scan.sec.rejects' },
  { id: 'alerts', key: 'scan.sec.alerts' },
  { id: 'thresholds', key: 'scan.sec.thresholds' },
] as const;

/** Wrap one section's markup so the jump bar has something to scroll to. */
const sec = (id: string, html: string): string =>
  `<section class="scan-sec" id="scan-sec-${id}">${html}</section>`;

function draw(ctx: AppContext): void {
  const root = $('#tab-scanner')!;

  if (!isSyncEnabled()) {
    root.innerHTML = `
      <h1>${t('scan.title')}</h1>
      <p class="subtitle">${t('scan.sub')}</p>
      <div class="card">
        <p style="margin:0 0 12px">${t('scan.needcode')}</p>
        <button class="btn" id="scan-setcode">${t('scan.setcode')}</button>
      </div>`;
    root.querySelector('#scan-setcode')?.addEventListener('click', () => openSyncSettings(ctx));
    return;
  }

  const statusHeld = held.get(KEY_STATUS);
  const status = (statusHeld?.value as Status | undefined) ?? null;
  const pushedAt = statusHeld?.updatedAt ?? null;
  // Only after a completed read: before one, "the VM has never pushed" would be a
  // false accusation against the VM for the browser not having asked yet.
  const notes = lastLoad ? healthNotes(status, pushedAt) : [];

  const chip = loading
    ? `<span class="status-chip status-chip--loading"><span class="spinner"></span> ${t('scan.loading')}</span>`
    : loadError
      ? `<span class="status-chip status-chip--muted">${esc(loadError)}</span>`
      : notes.length
        ? `<span class="status-chip status-chip--muted">${notes.length} ${t('scan.issues')}</span>`
        : status
          ? `<span class="status-chip status-chip--ok">${t('scan.ok')}</span>`
          : '';

  const alertsKey = newestAlertsKey();
  const thresholds = get<ThresholdsSnap>(KEY_THRESHOLDS);
  const sectors = get<SectorsSnap>(KEY_SECTORS);

  // `top_n` from the thresholds the VM pushed, not a constant here. It decides
  // which rows are highlighted and which lines are emphasised, so a copy kept in
  // the browser would eventually highlight a different number of sectors than the
  // scanner actually picked from. 3 only until the first push arrives.
  const topN = (() => {
    const s = (thresholds?.config as { sectors?: { top_n?: number } } | undefined)?.sectors;
    return typeof s?.top_n === 'number' ? s.top_n : 3;
  })();

  // Did the filter stage run? An empty watch list means two opposite things and
  // only the run record can tell them apart. Absent a run record, assume it ran:
  // accusing a stage of having failed on no evidence is its own kind of wrong.
  const setupsStage = status?.night?.last?.stages?.find((s) => s.stage === 'setups');
  const watchBlocked = !!setupsStage && !setupsStage.ok;

  root.innerHTML = `
    <h1>${t('scan.title')}</h1>
    <p class="subtitle">${t('scan.sub')}</p>
    <div class="toolbar">
      ${chip}
      <button class="btn-outline" id="scan-refresh"${loading ? ' disabled' : ''}>${t('scan.refresh')}</button>
      <span class="muted" style="font-size:12px">${lastLoad ? `${t('scan.read')} ${ago(lastLoad)}` : ''}</span>
    </div>
    ${notes.map((n) => `<div class="notice" style="margin-bottom:8px">${esc(n)}</div>`).join('')}
    ${status || !lastLoad ? '' : `<p class="muted">${t('scan.nodata')}</p>`}
    <nav class="toolbar scan-jump">
      <span class="muted" style="font-size:12px">${t('scan.jump')}</span>
      ${SECS.map((x) => `<button class="range-btn" data-jump="${x.id}">${t(x.key)}</button>`).join('')}
    </nav>
    ${sec('today', renderToday(get<RegimeSnap>(KEY_REGIME)))}
    ${sec('sectors', renderSectors(sectors, topN))}
    ${sec('watch', renderWatch(get<WatchSnap>(KEY_WATCH), watchBlocked))}
    ${sec('night', renderNight(status?.night))}
    ${sec('status', renderStatus(status, pushedAt))}
    ${sec('cand', renderCandidates(get<CandidatesSnap>(KEY_CANDIDATES)))}
    ${sec('rejects', renderRejects(get<RejectsSnap>(KEY_REJECTS)))}
    ${sec('alerts', renderAlerts(alertsKey ? get<AlertsSnap>(alertsKey) : null))}
    ${sec('thresholds', renderThresholds(thresholds))}`;

  root.querySelector('#scan-refresh')?.addEventListener('click', () => void load(ctx, true));

  // Jump bar. `scroll-margin-top` on .scan-sec keeps the heading clear of the
  // fixed top bar, so this can stay a plain scrollIntoView.
  root.querySelectorAll<HTMLElement>('[data-jump]').forEach((b) => {
    b.addEventListener('click', () => {
      const target = root.querySelector(`#scan-sec-${b.dataset.jump}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Sector table sort. Client-side only: the 11 rows are already in hand, so
  // sorting must not cost a D1 read.
  root.querySelectorAll<HTMLElement>('[data-sec-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.secSort as SectorSortKey;
      if (key === sectorSort) sectorDesc = !sectorDesc;
      else {
        sectorSort = key;
        // Rank and ticker read naturally ascending (1 first, A first); every other
        // column is a magnitude, where the interesting end is the big one.
        sectorDesc = key !== 'rank' && key !== 'sym';
      }
      draw(ctx);
    });
  });

  // Rank-chart line toggles.
  root.querySelectorAll<HTMLElement>('[data-chart-sym]').forEach((b) => {
    b.addEventListener('click', () => {
      const sym = b.dataset.chartSym!;
      if (chartOff.has(sym)) chartOff.delete(sym);
      else chartOff.add(sym);
      draw(ctx);
    });
  });

  // Any row carrying a ticker opens the app's own chart for it — the whole point
  // of a watch list is to look at the chart of what is on it.
  root.querySelectorAll<HTMLElement>('tr[data-sym]').forEach((tr) => {
    const sym = tr.dataset.sym;
    if (!sym) return;
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', (e) => {
      // The TradingView link inside the row is a different destination. Without
      // this the modal opens behind the new tab on every single click of it.
      if ((e.target as HTMLElement).closest('[data-tv]')) return;
      void openStock(ctx, sym);
    });
  });
}

async function load(ctx: AppContext, force = false): Promise<void> {
  if (loading) return;
  loading = true;
  loadError = null;
  draw(ctx);
  try {
    // `force` re-reads everything from scratch. Without it the incremental pull
    // is correct but returns nothing when the VM has not pushed since last time,
    // which looks identical to a broken bridge — so the manual button resets.
    const { entries, now } = await scannerPull(force ? 0 : since);
    if (force) held.clear();
    for (const e of entries) held.set(e.key, { value: e.value, updatedAt: e.updatedAt });
    if (now) since = now;
    lastLoad = Date.now();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
    draw(ctx);
  }
}

export function renderScanner(ctx: AppContext): void {
  draw(ctx);
  // Fetch on the first visit only. Snapshots move at cron speed (a minute at
  // best), so re-fetching on every tab switch would spend D1 reads to redraw the
  // same bytes; the Refresh button covers the rest.
  if (isSyncEnabled() && !lastLoad && !loading) void load(ctx);
}
