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
import { copyToClipboard } from '../ui/askChatGpt.js';
import { openSettingsAt } from './settingsTab.js';
import { rankChartSvg, rankChartColor, type RankHistory } from './scannerRankChart.js';
import {
  chipHtml, countChip, rangeChip, sectionHead, type Chip, type ChipInput,
} from '../ui/sectionHead.js';
import { sectorName, sectorTip } from '../ui/sectorNames.js';
import {
  caretHtml, foldBlock, openAttr, openAttrShut, revealCollapse, setAllCollapsed, wireCollapse,
} from '../ui/collapse.js';
import {
  alertKindLabel, playbookNote, reasonLabel, setupLabel, setupWord, tableLabel,
} from './scannerVocab.js';
import {
  CFG_DOC, CFG_SCALAR, G, METRICS, PLAN_STEPS, REJ_INTRO, REJ_LEGEND, REJ_TOTAL,
  SETUP_DOC, WATCH_WHY,
  cfgNote, cfgNum, gateText, planStepText, say, thrText, watchChecks,
  type Cfg, type Gate,
} from './scannerGuide.js';

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

/**
 * Removes the jump bar's window listeners. Every `draw()` replaces the bar, and a
 * listener holding a reference to a bar that is no longer in the document would keep
 * running (and keep the dead node alive) once per scroll frame, forever.
 */
let jumpDispose: (() => void) | null = null;

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

/**
 * A setup group's heading: `Breakout (BO)`, not `BO`.
 *
 * The scanner keys its payload by two-letter codes, and those codes were the whole
 * heading. `BO` is a thing you either already know or cannot look up — and the
 * candidates under it are the part of this page a reader acts on. The code stays in
 * brackets because the VM's logs and Telegram messages still speak in codes.
 *
 * Returns HTML, because `sectionHead`'s label is HTML — hence the `esc` here.
 */
const setupHead = (code: string): string => {
  const l = setupLabel(code);
  return l.tip
    ? `<span title="${esc(l.tip)}">${esc(l.text)}</span>`
    : esc(l.text);
};

/**
 * `setups.py` computes BO → RV → LEAD, and every block on this page is keyed by
 * those codes. Sorting the keys alphabetically would read BO, LEAD, RV — an order
 * nothing else in the system uses. Anything new the scanner adds sorts in after the
 * three known ones.
 */
const SETUP_ORDER = ['BO', 'RV', 'LEAD'];

const bySetupOrder = (a: string, b: string): number => {
  const rank = (s: string): number => {
    const i = SETUP_ORDER.indexOf(s.trim().toUpperCase());
    return i < 0 ? SETUP_ORDER.length : i;
  };
  return rank(a) - rank(b) || a.localeCompare(b);
};

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

  // The tail matters as much as the warning: once pushing stops, every date on the
  // page freezes at the moment of the last snapshot, and a reader who does not know
  // that reads "bars: Friday" on a Tuesday as a SECOND fault — a nightly run that
  // skipped Monday — when it is the same one fault seen from below. On Monday the
  // newest closed session really was Friday, and that is what the snapshot says.
  if (pushedAt && Date.now() - pushedAt > PUSH_STALE_SEC * 1000) {
    out.push(`${t('scan.warn.stale')} (${ago(pushedAt)}) — ${t('scan.warn.stale.tail')}`);
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
  const r = snap?.row;
  if (!r) return `<p class="muted">${t('scan.today.none')}</p>`;

  const pb = snap?.playbook ?? {};
  // The words, not the codes — this tile answers "what am I allowed to trade today".
  // The raw codes stay in the tooltip: they are what the VM's log and Telegram say.
  const setups = pb.setups?.length
    ? `<span title="${esc(pb.setups.join(' · '))}">`
      + esc(pb.setups.map((k) => setupWord(k).text).join(' · ')) + '</span>'
    : esc(t('scan.today.nosetup'));

  const tiles = [
    stat(t('scan.today.trend'), enumLabel('trend', r.trend), trendColor(r.trend)),
    stat(t('scan.today.vol'), enumLabel('vol', r.vol), volColor(r.vol)),
    stat(t('scan.today.setups'), setups,
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

  // TRANSLATED, not printed raw. `config.PLAYBOOK`'s note is accented Vietnamese because
  // the same string is the body of the morning Telegram message, and this was the loudest
  // half of the user's "tieng viet va tieng anh lan lon trong khi user chon tieng anh": the
  // most prominent sentence on the page ignored the language switch entirely. Keyed on the
  // regime pair beside it, so it cannot go stale against a reworded note.
  const noteTxt = pb.note ? playbookNote(r.trend, r.vol, pb.note) : '';
  const note = noteTxt
    ? `<div class="card" style="margin-top:10px">${esc(noteTxt)}${changed}</div>`
    : changed;

  return `
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
  return `<span style="color:${v > 0 ? 'var(--up)' : 'var(--danger)'}">`
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
  const title = tags(snap?.d ? { n: snap.d, kind: 'date' } : null);
  const rows = snap?.rows ?? [];
  if (!rows.length) return `${title}<p class="muted">${t('scan.sectors.none')}</p>`;

  const chg = snap?.chg ?? {};
  const wins = snap?.wins?.length ? snap.wins : [5, 21];

  // Defensive sectors in the top 3. This is a real regime signal that the trend
  // classifier cannot see — SPY can still be above both averages while the money
  // inside it has already moved to staples and utilities — so it is a banner, not
  // a table cell.
  // Named, not just tickered: "XLP, XLU" is the finding, but "Consumer Staples,
  // Utilities" is what makes it a sentence about where the money went.
  const def = snap?.defensive ?? [];
  const banner = def.length
    ? `<div class="notice" style="margin-bottom:8px">`
      + `${t('scan.sectors.defensive')} <b>${def.map((s) => {
        const name = sectorName(s);
        return `<span title="${esc(sectorTip(s))}">${esc(s)}${name ? ` (${esc(name)})` : ''}</span>`;
      }).join(', ')}</b></div>`
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
      + `<td${top ? ' style="font-weight:700"' : ''} title="${esc(sectorTip(r.sym))}">${tkr(r.sym)}`
      + `${sectorName(r.sym) ? `<div class="scan-secname">${esc(sectorName(r.sym)!)}</div>` : ''}</td>`
      + cell(num(r.composite, 1))
      + cell(signedFrac(r.ret21), (r.ret21 ?? 0) >= 0 ? 'var(--up)' : 'var(--danger)')
      + cell(signedFrac(r.ret63), (r.ret63 ?? 0) >= 0 ? 'var(--up)' : 'var(--danger)')
      + cell(signedFrac(r.ret126), (r.ret126 ?? 0) >= 0 ? 'var(--up)' : 'var(--danger)')
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
  // The two chips answer the two questions this chart cannot be read without: HOW
  // MANY sessions it covers, and WHICH ones. A rank chart over 2 sessions and one
  // over 60 look identical at a glance and mean entirely different things.
  const title = sectionHead(t('scan.sec.chart'), days.length
    ? [
        countChip(days.length, undefined, t('scan.chart.sessions')),
        rangeChip(days[0]!, days[days.length - 1]!),
      ]
    : [{ text: t('scan.chart.none'), kind: 'warn' }]);

  if (days.length < 2 || !order.length) {
    return `${title}<p class="muted">${t('scan.chart.none')}</p>`;
  }

  const emphasis = new Set((snap?.rows ?? [])
    .filter((r) => (r.rank ?? 99) <= topN)
    .map((r) => r.sym ?? ''));

  // The legend is also the glossary: the sector's NAME rides next to its ticker, so
  // "which line is leading" and "what is XLRE" are answered by the same glance. The
  // name is the quiet half — this is a legend for a chart, not a table of funds.
  const chips = order.map((sym) => {
    const off = chartOff.has(sym);
    const c = rankChartColor(order, sym);
    const name = sectorName(sym);
    const rank = (snap?.rows ?? []).find((r) => r.sym === sym)?.rank ?? null;
    return `<button class="tag scan-legend" data-chart-sym="${esc(sym)}"`
      + ` title="${esc(sectorTip(sym))}"`
      + ` style="cursor:pointer;border:1px solid ${off ? 'var(--border)' : c};`
      + `background:transparent;color:${off ? 'var(--faint)' : c};`
      + `${off ? 'text-decoration:line-through;' : ''}font-weight:600">`
      + `<i class="scan-legend-dash" style="background:${off ? 'var(--border)' : c}"></i>`
      + `${rank != null ? `<b>${rank}</b>` : ''}${esc(sym)}`
      + `${name ? `<span class="scan-legend-name">${esc(name)}</span>` : ''}</button>`;
  }).join('');

  return `${title}
    <div class="card">
      ${rankChartSvg(hist, { order, hidden: chartOff, emphasis, label: sectorTip, bandTo: topN })}
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
/**
 * Why anything is on the watch list at all, and how its plan was built.
 *
 * The four steps are provable rather than descriptive: `push.watchlist_payload()` is
 * `WHERE setup='LEAD' ORDER BY quality DESC LIMIT watch_top`, so every row demonstrably
 * cleared the LEAD gates, came from a top-N sector, and ranked inside the ceiling. The
 * plan half is `plan.make()` with the live `plan.*` numbers substituted in — the user's
 * "so sanh voi cai gi" applies to the plan as much as to the KPIs.
 */
function watchDocHtml(cfg: Cfg, topN: number, watchTop: number | null): string {
  // Numbered, because these four are a sequence: each one only looks at what the one
  // before it left. The number is part of the heading rather than a separate marker so
  // it survives the two-column grid.
  const steps = WATCH_WHY.map((w, i) =>
    docSec(`<span class="scan-doc-i">${i + 1}</span>${say(w.h)}`,
      `<p>${say(w.p)
        .replace('{top}', `<b>${topN}</b>`)
        .replace('{n}', `<b>${watchTop == null ? '—' : watchTop}</b>`)}</p>`)).join('');
  const plan = PLAN_STEPS.map((s) =>
    `<tr><td class="scan-gt-k">${say(s.k)}</td>`
    + `<td class="scan-gt-c" colspan="2">${planStepText(s.v, cfg)}</td></tr>`).join('');
  return steps + docSec(say(G.planHow!),
    `<div class="scan-doc-tw"><table class="scan-gt scan-mt"><thead><tr>`
    + `<th>${say(G.thStep!)}</th><th colspan="2">${say(G.thHow!)}</th>`
    + `</tr></thead><tbody>${plan}</tbody></table></div>`);
}

const WATCH_COLS = ['trigger', 'togo', 'stop', 'target', 'size_pct', 'quality', 'ref_close',
  'atr_pct', 'off_high', 'rs21', 'rs63', 'base_len', 'adv20'] as const;

/**
 * One row's KPIs against the thresholds they had to clear — the user's *"co phan la why it
 * is on the list voi cac KPIs nhung so sanh voi cai gi de biet duoc vao cac KPIs do thoa
 * man"*.
 *
 * A `·` is not a `✕`. Two of the LEAD gates cannot be re-checked from a watch row — the
 * dollar-volume gate used the 50-session average and the row carries the 20-session one,
 * and RVOL is not stored on the row at all — so those print as unknown with the reason
 * said out loud. Showing a red cross for a number this payload does not contain would
 * accuse a row that passed.
 */
function watchWhyHtml(r: WatchRow, cfg: Cfg, top: readonly string[], span: number): string {
  const MARK: Record<string, [string, string]> = {
    ok: ['✓', 'var(--accent)'],
    bad: ['✕', 'var(--danger)'],
    unknown: ['·', 'var(--faint)'],
  };
  const lines = watchChecks(r, cfg, top).map((c) => {
    const [m, col] = MARK[c.state]!;
    return `<tr><td class="wl-chk-m" style="color:${col}">${m}</td>`
      + `<td class="wl-chk-k">${esc(c.label)}</td>`
      + `<td class="wl-chk-v">${esc(c.value)}</td>`
      + `<td class="wl-chk-t">${esc(c.vs)}</td>`
      + `<td class="wl-chk-n">${c.note ? esc(c.note) : ''}</td></tr>`;
  }).join('');
  return `<tr class="wl-why" data-why-for="${esc(r.sym ?? '')}" hidden>`
    + `<td colspan="${span}">`
    + `<div class="wl-why-h">${say(G.why!)} — <b>${esc(r.sym ?? '')}</b></div>`
    // Real column headers instead of a footnote under the block. "Measured / required"
    // printed at the bottom left the reader to work out which of two mono numbers on a
    // line was which — and that pairing is the entire content of the table.
    + `<table class="wl-chk"><thead><tr><th class="wl-chk-m"></th>`
    + `<th>${say(G.thCheck!)}</th><th>${say(G.measured!)}</th>`
    + `<th>${say(G.required!)}</th><th>${say(G.thNote!)}</th></tr></thead>`
    + `<tbody>${lines}</tbody></table>`
    + `</td></tr>`;
}

function renderWatch(
  snap: WatchSnap | null, blocked: boolean,
  cfg: Cfg, topN: number, topSectors: readonly string[],
): string {
  const rows = snap?.rows ?? [];
  const total = snap?.total ?? rows.length;
  const watchTop = cfgNum(cfg, 'nightly.watch_top');
  const title = tags(
    snap?.d ? { n: snap.d, kind: 'date' } : null,
    rows.length ? countChip(rows.length, total) : null,
  );
  const doc = docFold('scan:doc:watch', say(G.how!), watchDocHtml(cfg, topN, watchTop));

  if (!rows.length) {
    return `${title}<p class="muted">`
      + `${blocked ? t('scan.watch.blocked') : t('scan.watch.none')}</p>${doc}`;
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
    // The ⓘ opens this row's KPI checklist. It has to sit inside the symbol cell rather
    // than in a column of its own: the table is already 15 columns wide and scrolls
    // sideways on a phone, and a 16th column would be the first thing off the screen.
    const why = `<button class="wl-why-b" data-why="${esc(r.sym ?? '')}"`
      + ` title="${esc(say(G.whyOpen!))}" aria-label="${esc(say(G.whyOpen!))}">ⓘ</button>`;
    return `<tr data-sym="${esc(r.sym ?? '')}">`
      + `<td class="wl-sep-r">${r.sym ? tvLink(r.sym) : '—'}${why}</td>`
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
      + cell(signedFrac(r.rs21), (r.rs21 ?? 0) >= 0 ? 'var(--up)' : 'var(--danger)')
      + cell(signedFrac(r.rs63), (r.rs63 ?? 0) >= 0 ? 'var(--up)' : 'var(--danger)')
      + cell(r.base_len == null ? '—' : String(r.base_len))
      + cell(fmtBig(r.adv20))
      + `</tr>`
      // Rendered for every row, hidden until asked for. Built in the string rather than on
      // demand because this page re-renders on every poll: a row built by script after
      // mount would vanish on the next one, mid-read.
      + watchWhyHtml(r, cfg, topSectors, 1 + PLAN.length + CTX.length);
  }).join('');

  return `${title}
    ${doc}
    <div class="card" style="padding:0;overflow-x:auto">
      <table class="wl"><thead>${head}</thead><tbody>${body}</tbody></table>
    </div>
    ${docFold('scan:doc:watchcols', say(G.cols!), metricDocHtml(WATCH_COLS))}
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
  const last = night?.last;
  if (!last) return `<p class="muted">${t('scan.night.none')}</p>`;

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
      last.code ? 'var(--danger)' : 'var(--up)'),
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

  return `
    <div class="grid grid-cards">${tiles}</div>
    ${dry}
    ${stages ? `<div class="card" style="padding:0;overflow-x:auto;margin-top:10px">
      <table><thead><tr><th></th><th>${t('scan.night.stage')}</th><th></th>
      <th>${t('scan.night.sec')}</th><th>${t('scan.night.detail')}</th></tr></thead>
      <tbody>${stages}</tbody></table></div>` : ''}
    ${warns}`;
}

// ── the runbook ──────────────────────────────────────────────────────────────

/**
 * The one command that re-runs a night. Kept apart: it is 90% of the visits here.
 *
 * SELF-CONTAINED ON PURPOSE — it activates the venv itself rather than assuming the
 * reader did step 01. This is the line that gets copied into a freshly opened SSH
 * window, and the system python has neither yfinance nor pandas: without the
 * activation it fails on `ModuleNotFoundError`, which reads like a broken install.
 */
const RERUN_CMD = 'cd ~/scanner && source .venv/bin/activate && git pull && python nightly.py';

/**
 * One step of the runbook.
 *
 * `p` holds i18n keys; `cmd` holds the command EXACTLY as it is typed and is never
 * translated — a translated command is a command that does not run.
 */
interface GuideStep {
  h: string;
  p: string[];
  cmd?: string;
  /**
   * These lines are crontab CONTENT, not shell. Pasted into a terminal, bash reads
   * the leading `0` as a command name and answers `0: command not found` — which
   * looks like a broken file and is only a paste into the wrong place.
   */
  crontab?: boolean;
}

/**
 * The nightly runbook, in the order it is actually performed.
 *
 * ── WHY IT IS IN THE APP AND NOT ONLY IN `error.txt` ────────────────────────
 * Because this is the page you are already looking at when you find out the run
 * failed. The run record above says WHICH stage broke; a file on another machine
 * cannot say what to do about it, and the answer is four commands that are easy to
 * get subtly wrong (`sudo crontab -e` instead of `crontab -e`, a crontab line pasted
 * into a shell, `nightly.py` on an empty candle store). Every line below is a rule
 * that was learned by breaking something, so the reasons travel with the commands.
 *
 * It stays in sync with `error.txt` VM-4, VM-7 and LOCK-3 by being the same facts,
 * not by being generated from them — there is no build step that could check that,
 * so changing one means changing the other.
 *
 * The displayed number is the INDEX, so inserting a step renumbers everything after
 * it. The `sN` key names are stable ids and no longer match that number (`s1` shows
 * as 02) — deliberately, because renaming a key to renumber it is how you end up with
 * a missing translation. What DOES have to be chased on insert is prose that names a
 * step: `scan.g.now.none` and `scan.g.s7.a` both point at one.
 */
const GUIDE: readonly GuideStep[] = [
  {
    h: 'scan.g.venv.h',
    p: ['scan.g.venv.a', 'scan.g.venv.b'],
    cmd: 'cd ~/scanner && source .venv/bin/activate',
  },
  {
    h: 'scan.g.s1.h',
    p: ['scan.g.s1.a', 'scan.g.s1.b'],
    cmd: 'python scripts/db_lock.py',
  },
  { h: 'scan.g.s2.h', p: ['scan.g.s2.a'], cmd: 'sudo systemctl restart scanner' },
  { h: 'scan.g.s3.h', p: ['scan.g.s3.a', 'scan.g.s3.b'], cmd: RERUN_CMD },
  {
    h: 'scan.g.s4.h',
    p: ['scan.g.s4.a', 'scan.g.s4.b'],
    cmd: 'python nightly.py --dry-run\npython nightly.py --status',
  },
  { h: 'scan.g.s5.h', p: ['scan.g.s5.a', 'scan.g.s5.b', 'scan.g.s5.c', 'scan.g.s5.d'] },
  {
    h: 'scan.g.s6.h',
    p: ['scan.g.s6.a', 'scan.g.s6.b'],
    // Self-contained like RERUN_CMD: this is the other step people jump straight to,
    // days later, in a new window that has no venv.
    cmd: 'cd ~/scanner && source .venv/bin/activate && python bars.py --sync --full',
  },
  { h: 'scan.g.s7.h', p: ['scan.g.s7.a', 'scan.g.s7.b'] },
  {
    h: 'scan.g.s8.h',
    p: ['scan.g.s8.a', 'scan.g.s8.b', 'scan.g.s8.c'],
    crontab: true,
    cmd:
      'CRON_TZ=America/New_York\n'
      + '0 8 * * 1-5  cd /home/ubuntu/scanner && .venv/bin/python nightly.py >> state/prep.log 2>&1\n'
      + '5 9 * * 1-5  /usr/bin/systemctl restart scanner',
  },
  { h: 'scan.g.s9.h', p: ['scan.g.s9.a', 'scan.g.s9.b'] },
  { h: 'scan.g.s10.h', p: ['scan.g.s10.a', 'scan.g.s10.b'] },
];

/**
 * Backticked fragments in the runbook prose become `<code>`.
 *
 * The guide is full of literal flags, filenames and values (`--dry-run`,
 * `journal_mode = wal`), and a reader who has to retype one needs to see where it
 * ends. Escaped inside the span because some of those literals are shell redirects.
 */
const codeSpans = (s: string): string =>
  s.replace(/`([^`]+)`/g, (_m, c: string) => `<code>${esc(c)}</code>`);

/** A command block with a copy button. The button reads the `<pre>` beside it. */
function cmdBlock(cmd: string, warn?: string): string {
  return `<div class="scan-cmd">
    ${warn ? `<p class="scan-cmd-warn">${codeSpans(warn)}</p>` : ''}
    <pre>${esc(cmd)}</pre>
    <button class="scan-cmd-copy" data-copy>${t('scan.g.copy')}</button>
  </div>`;
}

/**
 * What to do right now, read off the last run.
 *
 * The reason this section is worth more than the text file it came from: it can name
 * the stage that actually broke. A required stage that failed is a night that did not
 * happen — the page above is showing yesterday's market with today's date on it —
 * while a failed `push` or `telegram` is a run that worked and could not say so.
 */
function guideVerdict(night: NightBlock | null | undefined): string {
  const last = night?.last;
  if (!last) return `<div class="notice">${t('scan.g.now.none')}</div>`;
  const stages = last.stages ?? [];
  const broke = stages.find((s) => !s.ok && !s.skipped && !s.blocked);
  if (last.ok && !broke) {
    return `<p class="muted" style="margin:0 0 10px">${t('scan.g.now.ok')}</p>`;
  }
  const required = ['bars', 'sectors', 'structure', 'setups'];
  const name = broke?.stage ?? '';
  const key = required.includes(name) ? 'scan.g.now.fail' : 'scan.g.now.soft';
  return `<div class="notice">${t(key)}${name ? ` <b>${esc(name)}</b>` : ''}${
    broke?.err ? ` — ${esc(broke.err)}` : ''
  }</div>`;
}

/**
 * The runbook itself: the one command in the open, the rest behind a summary.
 *
 * Collapsed for the same reason the thresholds are: you come here when something
 * surprised you, and ten steps of shell in the middle of a nine-section market page
 * would be read once and scrolled past forever after.
 */
function renderGuide(night: NightBlock | null | undefined): string {
  const steps = GUIDE.map(
    (s, i) => `<li>
      <h3>${String(i + 1).padStart(2, '0')} · ${t(s.h)}</h3>
      ${s.p.map((k) => `<p>${codeSpans(t(k))}</p>`).join('')}
      ${s.cmd ? cmdBlock(s.cmd, s.crontab ? t('scan.g.crontab') : undefined) : ''}
    </li>`,
  ).join('');
  return `
    ${guideVerdict(night)}
    ${cmdBlock(RERUN_CMD)}
    <p class="muted" style="font-size:12px;margin:8px 0 0">${codeSpans(t('scan.g.then'))}</p>
    <div class="notice" style="margin-top:10px">${codeSpans(t('scan.g.secrets'))}</div>
    <details class="scan-th" style="margin-top:12px">
      <summary>${t('scan.g.open')}</summary>
      <p class="muted" style="font-size:12px;margin:0 0 8px">${codeSpans(t('scan.g.note'))}</p>
      <ol class="scan-guide">${steps}</ol>
    </details>`;
}

/**
 * The way into the VM operations guide on Settings & Guides.
 *
 * The runbook below covers re-running a night, which is what this page is for. Everything
 * else about keeping the VM alive — SSH, updating, the service and its logs, the full
 * crontab, the four common failures, where each threshold lives — is on the Settings page,
 * with a copy button on every command; one chip per topic opens it at that topic.
 */
const OPS_LINKS: readonly { id: string; key: string }[] = [
  { id: 'scan-connect', key: 'scan.ops.connect' },
  { id: 'scan-service', key: 'scan.ops.service' },
  { id: 'scan-cron', key: 'scan.ops.cron' },
  { id: 'scan-trouble', key: 'scan.ops.trouble' },
  { id: 'scan-config', key: 'scan.ops.config' },
];

function opsBanner(): string {
  return `<div class="scan-ops">
      <div class="scan-ops-h"><span aria-hidden="true">🛠</span><div><b>${t('scan.ops.title')}</b><span>${t('scan.ops.sub')}</span></div></div>
      <div class="scan-ops-links">${OPS_LINKS.map((l) => `<button class="scan-ops-link" data-ops="${l.id}">${t(l.key)} →</button>`).join('')}</div>
    </div>`;
}

function wireOpsBanner(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-ops]').forEach((b) =>
    b.addEventListener('click', () => openSettingsAt(b.dataset.ops!)),
  );
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
  const cfg = snap?.config;
  if (!cfg) return `<p class="muted">${t('scan.th.none')}</p>`;

  const sections = Object.entries(cfg).map(([group, val]) => {
    // `playbook` is the 12-row lookup table, not a bag of scalars — the one group
    // that has to keep its own shape to be readable at all.
    if (group === 'playbook' && Array.isArray(val)) {
      const rows = (val as Record<string, unknown>[]).map((p) => {
        const trend = p.trend == null ? '' : String(p.trend);
        const vol = p.vol == null ? '' : String(p.vol);
        const setups = Array.isArray(p.setups)
          // The words, with the codes in the tooltip — same treatment as the tile in 01,
          // and the reason `SPIKE` now has a dictionary entry: it appears only here.
          ? `<span title="${esc(p.setups.map((k) => String(k)).join(' · '))}">`
            + esc(p.setups.map((k) => setupWord(String(k)).text).join(' · ')) + '</span>'
          : thValue(p.setups);
        // Not escaped: `enumLabel` returns the translated word plus the raw code in a muted
        // span, exactly as the tile in section 01 prints it.
        return `<tr><td>${enumLabel('trend', trend)}</td>`
          + `<td>${enumLabel('vol', vol)}</td>`
          + `<td>${setups}</td>`
          + `<td>${sizeText(typeof p.size === 'number' ? p.size : null)}</td>`
          // Translated, for the same reason as the tile in section 01: this is the same
          // accented-Vietnamese string, and all 12 of them were printed raw here.
          + `<td>${esc(playbookNote(trend, vol, p.note == null ? '' : String(p.note)))}</td></tr>`;
      }).join('');
      return `${sectionHead(t('scan.sec.playbook'), [countChip(val.length, undefined, t('scan.col.regime'))])}
        <div class="card" style="padding:0;overflow-x:auto">
        <table><thead><tr><th>${t('scan.col.regime')}</th><th>${t('scan.col.volat')}</th>
        <th>${t('scan.col.setups')}</th><th>${t('scan.col.size')}</th>
        <th>${t('scan.col.note')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      // Every row used to be `min_dollar_vol | 20000000.0` — a schema name and a number,
      // in a section whose whole job is to explain the numbers on the rest of the page.
      // `CFG_DOC` carries the name in words and the comment that sits beside the value in
      // `config.py`, which is the only reason any of these numbers are readable. An
      // undocumented key still prints, under its raw name: hiding it would be worse.
      const doc = CFG_DOC[group];
      const rows = Object.entries(val as Record<string, unknown>).map(([k, v]) => {
        const kd = doc?.keys[k];
        return `<tr><td class="scan-cfg-k">`
          + `<div>${esc(kd ? say(kd.label) : k)}</div>`
          + `<div class="scan-cfg-raw">${esc(k)}</div></td>`
          + `<td class="scan-cfg-v">${thValue(v)}</td>`
          + `<td class="scan-cfg-n">${kd ? cfgNote(kd.note, v) : ''}</td></tr>`;
      }).join('');
      const label = doc
        ? `${esc(say(doc.label))} <span class="muted" style="font-size:11px">${esc(group)}</span>`
        : esc(group);
      return `${sectionHead(label, [countChip(Object.keys(val as object).length)],
        doc ? { sub: say(doc.lead) } : undefined)}
        <div class="card" style="padding:0;overflow-x:auto">
        <table class="scan-cfg"><thead><tr><th>${say(G.thKey!)}</th>
        <th>${say(G.thVal!)}</th><th>${say(G.thWhy!)}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    }
    const sd = CFG_SCALAR[group];
    return `<div class="stat"${sd ? ` title="${esc(say(sd.note).replace(/<[^>]+>/g, ''))}"` : ''}>`
      + `<div class="k">${esc(sd ? say(sd.label) : group)}</div>`
      + `<div class="v" style="font-size:13px">${thValue(val)}</div>`
      + (sd ? `<div class="scan-cfg-n" style="margin-top:4px">${say(sd.note)}</div>` : '')
      + `</div>`;
  });

  // Scalars first in one card row, then the grouped tables.
  const scalars = sections.filter((s) => s.startsWith('<div class="stat"'));
  const groups = sections.filter((s) => !s.startsWith('<div class="stat"'));

  return `<details class="scan-th"><summary>${t('scan.th.show')}</summary>
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
  // `name` is the D1 table, and it used to BE the label: `bars`, `struct`, `candidates`,
  // hardcoded English schema names in a panel that is otherwise fully translated. `struct`
  // in particular is not a word in either language. So the tile prints the table's meaning
  // and keeps the schema name in the tooltip, where it is still needed to match the VM's log.
  const table = (name: string, info: TableInfo | undefined, rows?: string): string => {
    const l = tableLabel(name);
    const label = `<div class="stat" title="${esc(`${name} — ${l.tip}`)}">`
      + `<div class="k">${esc(l.text)}</div>`;
    if (!info) return `${label}<div class="v"><span class="muted">${t('scan.st.missing')}</span></div></div>`;
    const age = info.age;
    const warn = age != null && age > MAX_AGE_DAYS;
    const body = `${rows ?? String(info.rows ?? 0)}`
      + `<span class="muted" style="font-size:11px"> · ${esc(info.last ?? '—')}`
      + `${age == null ? '' : ` (${age}d)`}</span>`;
    return `${label}<div class="v"${warn ? ' style="color:var(--danger)"' : ''}>${body}</div></div>`;
  };

  const bySetup = status.candidates?.by_setup ?? {};
  // Words here too, with the code line in the tooltip: this is the health panel, so
  // it has to stay comparable with the VM's log, but it is still read by a human.
  const setupLine = Object.keys(bySetup).length
    ? `<span title="${esc(Object.entries(bySetup).map(([k, n]) => `${k} ${n}`).join(' · '))}">`
      + Object.entries(bySetup)
          .sort((a, b) => bySetupOrder(a[0], b[0]))
          .map(([k, n]) => `${esc(setupWord(k).text)} ${n}`)
          .join(' · ')
      + '</span>'
    : String(status.candidates?.rows ?? 0);

  const tables = [
    table('bars', status.bars, `${status.bars?.syms ?? 0} · ${fmtBig(status.bars?.rows)}`),
    table('struct', status.struct),
    table('candidates', status.candidates, setupLine),
  ].join('');

  return `
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

/* ── explanation blocks ──────────────────────────────────────────────────── */

/**
 * A fold of explanation, closed by default, whose open state survives a re-render.
 *
 * Closed, because this page is read most often by someone who already knows what a
 * breakout is and wants the rows. Persisted, because the reader who does NOT know should
 * not have to re-open it on every 60-second poll — `data-collapse` puts the state in the
 * same store `ui/collapse.ts` uses for the sections themselves.
 */
const docFold = (id: string, label: string, body: string): string =>
  `<details class="scan-th scan-doc" data-collapse="${esc(id)}"${openAttrShut(id)}>`
  + `<summary>${label}</summary><div class="scan-doc-in">${body}</div></details>`;

/** A sub-heading inside a doc fold. Not `sectionHead`: that one numbers the page's spine. */
const docH = (label: string): string => `<h4 class="scan-doc-h">${label}</h4>`;

/**
 * One titled block of explanation: the heading on the left, its content on the right.
 *
 * The user's report was that an opened fold is "text but cover only 1/3 of the page" with
 * the headings "bi che lap di boi qua nhieu text". Both come from the same shape — a
 * measure-capped column of prose under small grey headings, stacked. A two-column grid
 * fixes both at once: the heading can never be buried because it is in its own column,
 * and the content is free to use the width it was given.
 */
const docSec = (label: string, body: string): string =>
  `<section class="scan-doc-sec">${docH(label)}<div class="scan-doc-b">${body}</div></section>`;

/**
 * The gates as a TABLE rather than a list of sentences.
 *
 * The order is still the information — `setups.py` records the first failing gate and
 * stops — so the `#` column stays. What the table adds is a second column with a heading:
 * the reason the threshold is that number, which is the half of `config.py` that explains
 * the other half, and which in a bullet list was just more sentence.
 */
function gateTable(gates: readonly Gate[], cfg: Cfg): string {
  const rows = gates.map((g, i) =>
    `<tr><td class="scan-gt-n">${i + 1}</td>`
    + `<td class="scan-gt-c">${gateText(g, cfg)}</td>`
    + `<td class="scan-gt-w">${g.note ? say(g.note) : ''}</td></tr>`).join('');
  return `<div class="scan-doc-tw"><table class="scan-gt"><thead><tr>`
    + `<th class="scan-gt-n">${say(G.thNo!)}</th><th>${say(G.thCrit!)}</th>`
    + `<th>${say(G.thWhy!)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/**
 * One setup, explained: what it is, the universe, every gate in test order with its live
 * or mirrored threshold, the caps, what `quality` means, and what still has to happen
 * intraday.
 *
 * The gate TABLE is the answer to "cho minh mot kieu summary vi du nhu phai dat moc nao do
 * cua cac criteria thi moi" — a criterion without its threshold beside it is not a
 * criterion, it is a topic.
 */
function setupDocHtml(code: string, cfg: Cfg): string {
  const doc = SETUP_DOC[code.trim().toUpperCase()];
  if (!doc) return '';
  // The opening claim is not a titled section: it is what the reader opened the fold to
  // find out, so it leads, in a lighter frame and one size up from the rest.
  const parts = [
    `<p class="scan-doc-lead">${say(doc.what)}</p>`,
    doc.universe
      ? docSec(say(G.universe!), `<p>${say(doc.universe).replace(
        '{v}', `<b>${thrText(cfgNum(cfg, 'sectors.top_n'), 'int')}</b>`)}</p>`)
      : '',
    docSec(say(G.gates!),
      `<p class="scan-doc-note">${say(doc.mirrored ? G.mirror! : G.live!)}`
      + `${cfg ? '' : ` ${say(G.noCfg!)}`}</p>`
      + gateTable(doc.gates, cfg)),
    doc.caps?.length ? docSec(say(G.caps!), gateTable(doc.caps, cfg)) : '',
    docSec(say(G.quality!), `<p>${say(doc.quality)}</p>`),
    doc.trigger ? docSec(say(G.trigger!), `<p>${say(doc.trigger)}</p>`) : '',
  ];
  return parts.join('');
}

/**
 * The measurement columns of a table, defined, with what each is compared against.
 *
 * Three columns, because there are three different kinds of fact here and the reader is
 * usually after one of them: which column, what it measures, and the threshold it had to
 * clear. Run together in a sentence they had to be read in full to find out which.
 */
function metricDocHtml(keys: readonly string[]): string {
  const rows = keys.map((k) => {
    const m = METRICS[k];
    if (!m) return '';
    return `<tr><td class="scan-gt-k">${say(m.label)}</td>`
      + `<td class="scan-gt-c">${say(m.what)}</td>`
      + `<td class="scan-gt-w">${m.vs ? say(m.vs) : ''}</td></tr>`;
  }).filter(Boolean).join('');
  return rows
    ? `<div class="scan-doc-tw"><table class="scan-gt scan-mt"><thead><tr>`
      + `<th>${say(G.thCol!)}</th><th>${say(G.thWhat!)}</th><th>${say(G.thVs!)}</th>`
      + `</tr></thead><tbody>${rows}</tbody></table></div>`
    : '';
}

const CAND_COLS = ['quality', 'ref_close', 'pivot', 'dist_pivot', 'base_len', 'base_depth',
  'off_high', 'rs_pct', 'adv20', 'atr_pct', 'fund_ok'] as const;

/**
 * The raw candidate tables, one fold per setup.
 *
 * Folded because of the user's "danh sach qua dai, scroll rat met": three setups of up to
 * 500 rows each, stacked, put the config section several screens below anything that would
 * make you want it. `foldBlock` means the heading and its count chip stay visible, so the
 * page still reads as "BO 42 · RV 7 · LEAD 10" with nothing opened.
 */
function renderCandidates(snap: CandidatesSnap | null, cfg: Cfg): string {
  const by = snap?.by_setup ?? {};
  const setups = Object.keys(by).filter((k) => Array.isArray(by[k])).sort(bySetupOrder);
  if (!setups.length) {
    return `<p class="muted">${t('scan.nocand')}</p>`;
  }

  const blocks = setups.map((s) => {
    const rows = by[s] as Candidate[];
    const total = typeof by[`${s}_total`] === 'number' ? (by[`${s}_total`] as number) : rows.length;
    // Rows arrive sorted by quality and truncated to TOP_N. They are NOT re-sorted
    // here: re-ranking a truncated list by "closest to pivot" would read as "the
    // closest in the market" when it is only the closest among the top N by quality.
    const head = candHead().map((h) => `<th>${esc(h)}</th>`).join('');
    const doc = setupDocHtml(s, cfg);
    const body = `
      ${doc ? docFold(`scan:doc:cand:${s}`, say(G.how!), doc) : ''}
      ${docFold(`scan:doc:candcols:${s}`, say(G.cols!), metricDocHtml(CAND_COLS))}
      <div class="card" style="padding:0;overflow-x:auto">
        <table><thead><tr>${head}</tr></thead>
        <tbody>${rows.map(candRow).join('')}</tbody></table>
      </div>`;
    const sub = SETUP_DOC[s.trim().toUpperCase()]?.sub;
    return foldBlock(
      `scan:cand:${s}`,
      sectionHead(setupHead(s), [countChip(rows.length, total)],
        sub ? { sub: say(sub) } : undefined),
      body,
      t('sec.fold'),
    );
  });

  return blocks.join('');
}

/**
 * What the three columns of "Why rejected" actually mean — as VISIBLE content.
 *
 * Straight from the user's questions: *"share o day co nghia la gi, count cai gi vay number
 * of stocks ah?"*. Both answers existed only in the author's head. `Count` is stocks, not
 * events; `Share` is out of every symbol examined for that setup, which is the rejected
 * rows plus the passed chip — so the table sums to 100% and a single dominant row is
 * immediately readable as "this one gate is deciding everything".
 */
const rejLegendHtml = (): string =>
  `<p class="scan-doc-lead">${say(REJ_INTRO)}</p>`
  + `<div class="scan-doc-tw"><table class="scan-gt scan-mt"><thead><tr>`
  + `<th>${say(G.thTerm!)}</th><th colspan="2">${say(G.thMeaning!)}</th></tr></thead><tbody>`
  + REJ_LEGEND.map((r) =>
    `<tr><td class="scan-gt-k">${say(r.term)}</td>`
    + `<td class="scan-gt-c" colspan="2">${say(r.def)}</td></tr>`).join('')
  + `</tbody></table></div>`;

function renderRejects(snap: RejectsSnap | null, cfg: Cfg): string {
  const by = snap?.by_setup ?? {};
  const setups = Object.keys(by).sort(bySetupOrder);
  if (!setups.length) {
    return `<p class="muted">${t('scan.norej')}</p>`;
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
    // LEAD only: how many cleared the quality floor BEFORE the per-sector and total
    // caps were applied. Without it, `12 passed` hides which of the two did the
    // cutting — a floor too strict and a cap too tight need opposite fixes.
    const floor = raw['_qua_san'];
    const total = reasons.reduce((n, [, v]) => n + v, 0) + passed;
    const rows = reasons.map(([reason, n]) => {
      const share = total ? (n / total) * 100 : 0;
      // An unmapped reason is shown in italics with its raw key in the tooltip, so
      // the gap is visible and fixable instead of silently reading as a translation.
      const r = reasonLabel(reason);
      // The explanation is now a VISIBLE second line, not only a `title=`. Every one of
      // these sentences already existed in `scannerVocab.ts` and was reachable only by
      // hovering a table cell — which on a phone means not at all. The user asked for
      // exactly this: "Phan reason phai co them doan details nua, nghia la gi".
      const detail = r.known && r.tip && r.tip !== reason
        ? `<div class="scan-rej-why">${esc(r.tip)}</div>` : '';
      return `<tr><td${r.known ? '' : ' class="scan-raw"'}>`
        + `<div${r.known ? '' : ` title="${esc(r.tip)}"`}>${esc(r.text)}</div>${detail}</td>`
        + `<td>${n}</td>`
        + `<td><span class="scorebar"><span style="width:${share.toFixed(1)}%"></span></span>`
        + ` <span class="muted">${share.toFixed(1)}%</span></td></tr>`;
    });
    const doc = setupDocHtml(s, cfg);
    const body = `
      ${doc ? docFold(`scan:doc:rej:${s}`, say(G.gates!), doc) : ''}
      <div class="card" style="padding:0;overflow-x:auto">
        <table class="scan-rej"><thead><tr><th>${t('scan.col.reason')}</th>
        <th>${t('scan.col.count')}</th><th>${t('scan.col.share')}</th></tr></thead>
        <tbody>${rows.join('')}</tbody></table>
      </div>`;
    return foldBlock(
      `scan:rej:${s}`,
      sectionHead(setupHead(s), [
        { n: passed, text: t('scan.rej.passed'), kind: 'count' },
        floor != null && floor !== passed
          ? { n: floor, text: t('scan.rej.floor'), kind: 'count' as const } : null,
        cutoff ? { n: cutoff, text: t('scan.rej.cut'), kind: 'warn' } : null,
      ], { sub: `${total} ${say(REJ_TOTAL)}` }),
      body,
      t('sec.fold'),
    );
  });

  const meta: Chip[] = [];
  // The table name in words — `struct` was the one hardcoded English string in this
  // section, and it is a schema identifier rather than a word in either language.
  if (snap?.struct != null) {
    const l = tableLabel('struct');
    meta.push({ n: snap.struct, text: l.text, kind: 'count', title: `struct — ${l.tip}` });
  }
  if (snap?.cho_fund) meta.push({ n: snap.cho_fund, text: t('scan.rej.fund'), kind: 'warn' });

  return `
    ${tags(...meta)}
    <p class="muted" style="font-size:12px;margin:0 0 8px">${t('scan.rej.note')}</p>
    ${docFold('scan:doc:rejlegend', say(G.legend!), rejLegendHtml())}
    ${blocks.join('')}`;
}

/**
 * `+15m`, `MFE`, `MAE` are the three most opaque strings on the page: they are jargon in
 * English and untranslated jargon in Vietnamese, and the columns they head are the only
 * place the scanner grades its own alerts. `score` needs a definition too — it shares a
 * name with the nightly `quality` column and has nothing to do with it.
 */
const ALERT_COLS = ['score', 'px', 'chg', 'rvol', 'dollar_vol',
  'px15', 'px_close', 'hi_after', 'lo_after'] as const;

function renderAlerts(snap: AlertsSnap | null): string {
  const rows = snap?.rows ?? [];
  const title = tags(snap?.day ? { n: snap.day, kind: 'date' } : null);
  if (!rows.length) return `${title}<p class="muted">${t('scan.noalerts')}</p>`;

  const body = rows.map((r) => {
    // Outcome prices are shown as a move from the alert price, not as raw prices:
    // "+1.4%" answers "was the alert any good", "18.42" does not.
    const g = (v: number | null | undefined): string => {
      const m = move(r.px, v);
      return m == null ? '—' : `<span style="color:${m >= 0 ? 'var(--up)' : 'var(--danger)'}">${signed(m)}</span>`;
    };
    // `NEW` / `UP` in words. The difference between them is the column's whole reason for
    // existing — an `UP` is the same opportunity getting stronger, not a second one — and
    // two raw uppercase codes conveyed that to nobody, in either language.
    const kind = alertKindLabel(r.kind);
    return `<tr data-sym="${esc(r.sym ?? '')}">`
      + `<td>${esc((r.ts_et ?? '').slice(11, 16) || '—')}</td>`
      + `<td${kind.tip ? ` title="${esc(kind.tip)}"` : ''}`
      + `${kind.known ? '' : ' class="scan-raw"'}>${esc(kind.text)}</td>`
      + `<td>${tkr(r.sym)}</td>`
      + cell(num(r.score, 1))
      + cell(num(r.px, 2))
      + cell(signedFrac(r.chg), (r.chg ?? 0) >= 0 ? 'var(--up)' : 'var(--danger)')
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
    </div>
    ${docFold('scan:doc:alertcols', say(G.cols!), metricDocHtml(ALERT_COLS))}`;
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
  { id: 'today', key: 'scan.sec.today', lead: 'scan.lead.today' },
  { id: 'sectors', key: 'scan.sec.sectors', lead: 'scan.lead.sectors' },
  { id: 'watch', key: 'scan.sec.watch', lead: 'scan.lead.watch' },
  { id: 'night', key: 'scan.sec.night', lead: 'scan.lead.night' },
  // Straight after the run record on purpose: that section is where you find out a
  // stage failed, and this one is what to type about it.
  { id: 'guide', key: 'scan.sec.guide', lead: 'scan.lead.guide' },
  { id: 'status', key: 'scan.sec.status', lead: 'scan.lead.status' },
  { id: 'cand', key: 'scan.sec.cand', lead: 'scan.lead.cand' },
  { id: 'rejects', key: 'scan.sec.rejects', lead: 'scan.lead.rejects' },
  { id: 'alerts', key: 'scan.sec.alerts', lead: 'scan.lead.alerts' },
  { id: 'thresholds', key: 'scan.sec.thresholds', lead: 'scan.lead.thresholds' },
] as const;

/**
 * Wrap one section: a numbered header, a real title, a line saying what the
 * section answers, then the body.
 *
 * Every section used to open with `<h2 class="section-title">` — 11px, uppercase,
 * `var(--faint)`. Nine of those stacked down a page is nine identical grey
 * whispers, and the reader has to parse the table under each one to find out
 * which section they are in. The number gives the page a spine (it is a
 * nine-stage pipeline and now it reads like one), and the lead line answers
 * "why am I looking at this" before the first row of data does.
 */
const sec = (id: string, html: string): string => {
  const i = SECS.findIndex((x) => x.id === id);
  const s = SECS[i]!;
  // `<details>`, so the ten stages fold. The header IS the summary: a separate
  // toggle button beside a heading gives the reader two things to aim at for one
  // action. Open state is baked into the string here, never patched after mount —
  // this page re-renders on a poll and a post-mount close would flinch every time.
  return `<details class="scan-sec" id="scan-sec-${id}" data-collapse="scan:${id}"${openAttr(`scan:${id}`)}>
    <summary class="scan-head">
      <span class="scan-head-n">${String(i + 1).padStart(2, '0')}</span>
      <div class="scan-head-txt">
        <h2>${t(s.key)}</h2>
        <p>${t(s.lead)}</p>
      </div>
      ${caretHtml(t('sec.fold'))}
    </summary>
    <div class="scan-sec-body">${html}</div></details>`;
};

/**
 * The status strip: what state the bridge is in, how old the snapshot under it is,
 * and the button that re-reads it.
 *
 * It used to be three loose things in a `.toolbar` — a chip, a button, and the words
 * "read 0s" — and the colour was the bug: `status-chip--muted` painted "1 to check"
 * in the same grey as the timestamp next to it, so the one line on the page that says
 * something is broken read as furniture.
 *
 * Two ages, not one, because they answer different questions. "Read" is when this
 * browser last asked; the SNAPSHOT age is how old the numbers below actually are. A
 * page can be read one second ago and be a day old — which is exactly the state this
 * strip exists to make impossible to miss, so the snapshot age turns amber on its own
 * rather than waiting for the notice underneath to be read.
 */
function statusStrip(status: Status | null, pushedAt: number | null, notes: string[]): string {
  const state = loading
    ? { k: 'load', txt: `<span class="spinner"></span> ${t('scan.loading')}` }
    : loadError
      ? { k: 'bad', txt: esc(loadError) }
      : notes.length
        ? { k: 'warn', txt: `${notes.length} ${t('scan.issues')}` }
        : status
          ? { k: 'ok', txt: t('scan.ok') }
          : null;

  const stale = pushedAt != null && Date.now() - pushedAt > PUSH_STALE_SEC * 1000;
  const ages: string[] = [];
  if (pushedAt) {
    ages.push(`<span class="scan-age${stale ? ' is-stale' : ''}" title="${t('scan.snapwhat')}">`
      + `${t('scan.snapage').replace('{age}', ago(pushedAt))}</span>`);
  }
  if (lastLoad) {
    ages.push(`<span class="scan-age" title="${t('scan.readwhat')}">`
      + `${t('scan.readago').replace('{age}', ago(lastLoad))}</span>`);
  }

  return `<div class="scan-bar" data-state="${state?.k ?? 'none'}">
    ${state ? `<span class="scan-bar-state"><i class="scan-dot"></i>${state.txt}</span>` : ''}
    ${ages.length ? `<div class="scan-bar-ages">${ages.join('<span class="scan-age-sep">·</span>')}</div>` : ''}
    <button class="btn-outline scan-bar-btn" id="scan-refresh"${loading ? ' disabled' : ''}>
      <span aria-hidden="true">↻</span> ${t('scan.refresh')}</button>
  </div>`;
}

/**
 * The chips that used to crowd a section title (a date, a row count).
 *
 * Typed now, via `ui/sectionHead.ts`: a count is tinted with its number in mono and
 * a date is mono throughout, so "12 / 40" and "2026-09-25" stop looking like the same
 * kind of thing. Callers pass DATA — `chipHtml` escapes it, so do not `esc()` first.
 */
const tags = (...items: ChipInput[]): string => {
  const on = items.map(chipHtml).filter(Boolean);
  return on.length ? `<div class="scan-tags">${on.join('')}</div>` : '';
};

/**
 * The jump bar, which is now an index that follows the reader.
 *
 * It was a row of ten identical grey pills above the fold, and above the fold is the
 * one place it is useless: you are already at the top of the page when you can see
 * it. So the bar STICKS under the top nav and marks which section you are in, which
 * is the other half of an index — "where am I" is asked far more often than "take me
 * somewhere". The pills carry the same 01..10 numbers as the section headers, so the
 * bar and the page read as one spine.
 *
 * Pattern borrowed from `ui/stickyToc.ts` rather than the module itself: that one
 * discovers its entries from the DOM and keeps a single module-level instance, and
 * mounting it here would tear the listeners off the Learn tab's bar and share its
 * bookmark key. Ten hand-listed sections do not need discovery.
 */
function wireJump(root: HTMLElement): void {
  jumpDispose?.();
  jumpDispose = null;

  const bar = root.querySelector<HTMLElement>('.scan-jump');
  const pills = Array.from(root.querySelectorAll<HTMLElement>('[data-jump]'));
  if (!bar || !pills.length) return;
  const secs = pills.map((p) => root.querySelector<HTMLElement>(`#scan-sec-${p.dataset.jump}`));

  for (const p of pills) {
    p.addEventListener('click', () => {
      // `scroll-margin-top` on .scan-sec clears both the fixed nav and this bar, so
      // the target heading never lands underneath the thing that sent you to it.
      const target = root.querySelector(`#scan-sec-${p.dataset.jump}`);
      // Unfold first: a jump that lands on a folded section reads as a dead link —
      // the page moves and the thing you asked for is not there.
      revealCollapse(target);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  root.querySelector('#scan-top')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Which section owns the reading line. Same offset as `scroll-margin-top`: a
  // section counts as current from the moment its header clears the sticky bar.
  const OFFSET = 116;
  let idx = -1;
  const paint = (): void => {
    // The tab can be display:none (another tab is open) — every rect is 0 then, and
    // that would park the marker on the last section.
    if (!bar.offsetParent) return;
    let next = 0;
    for (let i = 0; i < secs.length; i++) {
      const el = secs[i];
      if (el && el.getBoundingClientRect().top - OFFSET <= 0) next = i;
      else break;
    }
    if (next === idx) return;
    idx = next;
    pills.forEach((p, i) => {
      p.classList.toggle('active', i === idx);
      if (i === idx) p.setAttribute('aria-current', 'true');
      else p.removeAttribute('aria-current');
    });
    // The pill row scrolls sideways on a phone, so the active pill has to be brought
    // into view or the marker is on a pill nobody can see. `nearest` on both axes:
    // the bar is already visible, so this must not move the page vertically.
    pills[idx]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  let raf = 0;
  const onScroll = (): void => {
    // Every redraw builds a new bar; this catches the case where a listener outlived
    // its DOM (a redraw that did not go through `wireJump`, e.g. a language switch).
    if (!bar.isConnected) {
      jumpDispose?.();
      return;
    }
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      paint();
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  paint();

  jumpDispose = () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    if (raf) cancelAnimationFrame(raf);
    jumpDispose = null;
  };
}

function draw(ctx: AppContext): void {
  const root = $('#tab-scanner')!;

  if (!isSyncEnabled()) {
    root.innerHTML = `
      <h1>${t('scan.title')}</h1>
      <p class="subtitle">${t('scan.sub')}</p>
      <div class="card">
        <p style="margin:0 0 12px">${t('scan.needcode')}</p>
        <button class="btn" id="scan-setcode">${t('scan.setcode')}</button>
      </div>
      ${opsBanner()}`;
    root.querySelector('#scan-setcode')?.addEventListener('click', () => openSyncSettings(ctx));
    wireOpsBanner(root);
    return;
  }

  const statusHeld = held.get(KEY_STATUS);
  const status = (statusHeld?.value as Status | undefined) ?? null;
  const pushedAt = statusHeld?.updatedAt ?? null;
  // Only after a completed read: before one, "the VM has never pushed" would be a
  // false accusation against the VM for the browser not having asked yet.
  const notes = lastLoad ? healthNotes(status, pushedAt) : [];

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

  // The running config, passed down to every section that prints a threshold. Read from
  // the VM's own `config.snapshot()` rather than mirrored in TypeScript, so a gate list on
  // this page cannot quietly disagree with the gate the scanner ran — the two exceptions
  // are the BO and RV dicts, which `config.snapshot()` does not publish and which
  // `scannerGuide.ts` therefore labels as mirrored.
  const cfg: Cfg = thresholds?.config;
  // Which sectors are currently in the top N, for the watch list's first check. From the
  // sectors snapshot, NOT from the watch rows: the question is whether this name's sector
  // is one of the strong ones today, and the row can only say which sector it is in.
  const topSectors = (sectors?.rows ?? [])
    .filter((r) => (r.rank ?? 99) <= topN)
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .map((r) => r.sym ?? '')
    .filter(Boolean);

  // Did the filter stage run? An empty watch list means two opposite things and
  // only the run record can tell them apart. Absent a run record, assume it ran:
  // accusing a stage of having failed on no evidence is its own kind of wrong.
  const setupsStage = status?.night?.last?.stages?.find((s) => s.stage === 'setups');
  const watchBlocked = !!setupsStage && !setupsStage.ok;

  root.innerHTML = `
    <h1>${t('scan.title')}</h1>
    <p class="subtitle">${t('scan.sub')}</p>
    ${statusStrip(status, pushedAt, notes)}
    ${opsBanner()}
    ${notes.map((n) => `<div class="notice" style="margin-bottom:8px">${esc(n)}</div>`).join('')}
    ${status || !lastLoad ? '' : `<p class="muted">${t('scan.nodata')}</p>`}
    <nav class="scan-jump" aria-label="${t('scan.jump')}">
      <span class="scan-jump-lbl">${t('scan.jump')}</span>
      <div class="scan-jump-pills">
        ${SECS.map((x, i) => `<button class="scan-pill" data-jump="${x.id}">`
          + `<span class="scan-pill-n">${String(i + 1).padStart(2, '0')}</span>${t(x.key)}</button>`).join('')}
      </div>
      <button class="scan-jump-up" id="scan-fold" title="${t('sec.foldall')}"
        aria-label="${t('sec.foldall')}">⤡</button>
      <button class="scan-jump-up" id="scan-top" title="${t('scan.top')}" aria-label="${t('scan.top')}">↑</button>
    </nav>
    ${sec('today', renderToday(get<RegimeSnap>(KEY_REGIME)))}
    ${sec('sectors', renderSectors(sectors, topN))}
    ${sec('watch', renderWatch(get<WatchSnap>(KEY_WATCH), watchBlocked, cfg, topN, topSectors))}
    ${sec('night', renderNight(status?.night))}
    ${sec('guide', renderGuide(status?.night))}
    ${sec('status', renderStatus(status, pushedAt))}
    ${sec('cand', renderCandidates(get<CandidatesSnap>(KEY_CANDIDATES), cfg))}
    ${sec('rejects', renderRejects(get<RejectsSnap>(KEY_REJECTS), cfg))}
    ${sec('alerts', renderAlerts(alertsKey ? get<AlertsSnap>(alertsKey) : null))}
    ${sec('thresholds', renderThresholds(thresholds))}`;

  root.querySelector('#scan-refresh')?.addEventListener('click', () => void load(ctx, true));

  // Copy a runbook command. The text is read back out of the `<pre>` rather than
  // carried in an attribute: these commands contain quotes, `&&` and newlines, and an
  // attribute round-trip is one escaping mistake away from copying a broken command.
  root.querySelectorAll<HTMLElement>('[data-copy]').forEach((b) => {
    b.addEventListener('click', () => {
      const cmd = b.closest('.scan-cmd')?.querySelector('pre')?.textContent ?? '';
      if (cmd) void copyToClipboard(cmd, b);
    });
  });

  wireJump(root);
  wireCollapse(root);
  wireOpsBanner(root);

  // One button, two jobs: it folds everything, and once everything is folded it
  // unfolds everything. Two buttons for a binary state is one button too many.
  root.querySelector('#scan-fold')?.addEventListener('click', () => {
    const open = Array.from(root.querySelectorAll<HTMLDetailsElement>('.scan-sec'))
      .some((d) => d.open);
    setAllCollapsed(root, open);
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
      // Same for the ⓘ: it expands the row in place, and opening the chart over the
      // explanation the reader just asked for would hide it behind a modal.
      if ((e.target as HTMLElement).closest('[data-tv],[data-why]')) return;
      void openStock(ctx, sym);
    });
  });

  // The per-row "why it is on the list". A plain hidden-row toggle rather than a popover:
  // the checklist is 11 lines wide with a note column, and the numbers it compares are in
  // the row directly above it — which is the whole point of showing them together.
  root.querySelectorAll<HTMLElement>('[data-why]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const sym = b.dataset.why ?? '';
      const row = root.querySelector<HTMLElement>(`tr.wl-why[data-why-for="${CSS.escape(sym)}"]`);
      if (!row) return;
      const open = row.hidden;
      row.hidden = !open;
      b.classList.toggle('on', open);
      b.setAttribute('aria-expanded', String(open));
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
