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

const KEY_STATUS = 'scanner:status';
const KEY_CANDIDATES = 'scanner:candidates';
const KEY_REJECTS = 'scanner:rejects';
const ALERTS_PREFIX = 'scanner:alerts:';

/**
 * Mirrors `setups.MAX_AGE`. Duplicated on purpose: the browser has no way to read
 * a Python constant, and the number is worth showing even when it drifts, because
 * the failure it describes is invisible otherwise — a `candidates` table older
 * than this makes `load_candidates()` return empty and the bot goes *completely*
 * silent, with no error and no message. If the Python side changes it, change it
 * here too.
 */
const MAX_AGE_DAYS = 5;

/** `beat` is written every 20s by main.py, so anything older means the loop stopped. */
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
    if (b.ts && Date.now() - b.ts > BEAT_STALE_SEC * 1000) {
      out.push(`${t('scan.warn.beatstale')} (${ago(b.ts)})`);
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
  return out;
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

const CAND_HEAD = ['Sym', 'Qual', 'Close', 'Pivot', 'To pivot', 'Base', 'Depth',
  'Off high', 'RS', 'ADV20', 'ATR%', 'Fund'];

function candRow(c: Candidate): string {
  const dist = c.dist_pivot;
  // dist_pivot > 0 means still below the pivot; <= 0 means already through it.
  const distColor = dist == null ? undefined
    : dist <= 0 ? 'var(--accent)'
    : dist <= 0.02 ? 'var(--warn)'
    : undefined;
  const fund = c.fund_ok === true ? 'ok' : c.fund_ok === false ? 'no' : '—';
  return `<tr data-sym="${esc(c.sym ?? '')}">`
    + `<td>${esc(c.sym ?? '—')}</td>`
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
    const head = CAND_HEAD.map((h) => `<th>${h}</th>`).join('');
    return `
      <div class="section-title-row">
        <h3 class="section-title">${esc(s)}</h3>${cut}
      </div>
      <div class="card" style="padding:0;overflow-x:auto">
        <table><thead><tr>${head}</tr></thead>
        <tbody>${rows.map(candRow).join('')}</tbody></table>
      </div>`;
  });

  return `<h2 class="section-title">${t('scan.sec.watch')}</h2>${blocks.join('')}`;
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
        <table><thead><tr><th>Reason</th><th>Count</th><th>Share</th></tr></thead>
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
      + `<td>${esc(r.sym ?? '—')}</td>`
      + cell(num(r.score, 1))
      + cell(num(r.px, 2))
      + cell(signedFrac(r.chg), (r.chg ?? 0) >= 0 ? 'var(--accent)' : 'var(--danger)')
      + cell(num(r.rvol, 1))
      + cell(fmtBig(r.dollar_vol))
      + `<td>${g(r.px15)}</td><td>${g(r.px60)}</td><td>${g(r.px_close)}</td>`
      + `<td>${g(r.hi_after)}</td><td>${g(r.lo_after)}</td>`
      + `</tr>`;
  });

  const head = ['Time', 'Kind', 'Sym', 'Score', 'Px', 'Chg', 'RVol', '$Vol',
    '+15m', '+60m', 'Close', 'MFE', 'MAE'].map((h) => `<th>${h}</th>`).join('');
  return `${title}
    <div class="card" style="padding:0;overflow-x:auto">
      <table><thead><tr>${head}</tr></thead><tbody>${body.join('')}</tbody></table>
    </div>`;
}

// ── shell ────────────────────────────────────────────────────────────────────

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
    ${renderStatus(status, pushedAt)}
    ${renderCandidates(get<CandidatesSnap>(KEY_CANDIDATES))}
    ${renderRejects(get<RejectsSnap>(KEY_REJECTS))}
    ${renderAlerts(alertsKey ? get<AlertsSnap>(alertsKey) : null)}`;

  root.querySelector('#scan-refresh')?.addEventListener('click', () => void load(ctx, true));
  // Any row carrying a ticker opens the app's own chart for it — the whole point
  // of a watch list is to look at the chart of what is on it.
  root.querySelectorAll<HTMLElement>('tr[data-sym]').forEach((tr) => {
    const sym = tr.dataset.sym;
    if (!sym) return;
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => void openStock(ctx, sym));
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
