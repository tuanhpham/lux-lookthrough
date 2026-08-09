/**
 * Calendar tab — a rolling 30-day window of everything that can move a US stock:
 * earnings, ex-dividends, splits, IPOs, IPO lockup expiries, macro prints,
 * options expiry / index rebalances, plus hand-entered events (PDUFA dates,
 * investor days).
 *
 * Refresh model: the ~60-request sweep runs ONCE A DAY and is snapshotted to
 * storage (and thus to D1). Opening the tab reads today's snapshot instantly;
 * when the local date rolls over, the next open rebuilds it. That rollover IS
 * the daily auto-refresh — see catalystCache.ts.
 *
 * Two rules this UI must never break:
 *  1. "No data" and "no events" must LOOK DIFFERENT. The Nasdaq econ feed runs
 *     dry after ~3 weeks, so an empty far-out cell means unknown, not all-clear.
 *  2. An unconfirmed earnings date is visibly marked. Nasdaq publishes scheduled
 *     dates that shift by days; planning around one as if it were fixed is how a
 *     position gets held into a print by accident.
 */
import {
  type AccountState,
  type AttentionInput,
  type AttentionReason,
  type AttentionRow,
  type CapitalExposure,
  type CatalystEvent,
  type CatalystKind,
  type CatalystWindow,
  capitalExposure,
  dateRange,
  decideSweep,
  dayRisks,
  eventsBySymbol,
  filterEvents,
  groupByDate,
  isWeekend,
  mergeEvents,
  rankAttention,
  uncoveredKinds,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el, fmtBig } from '../ui/dom.js';
import { t, getLang } from '../ui/i18n.js';
import { openStock } from '../ui/stockModal.js';
import { formDialog } from '../ui/forms.js';
import { loadIndex, loadItems } from '../ui/watchlists.js';
import { fetchCatalystWindow, todayLocal } from '../adapters/CatalystProvider.js';
import {
  listSnapshotDays,
  loadSweepLog,
  loadWindow,
  noteSweep,
  saveWindow,
  SnapshotTooLargeError,
  updatedAtLabel,
} from './catalystCache.js';
import { addCustom, customToEvents, deleteCustom, loadCustom, type CustomEvent } from './customEvents.js';
import {
  loadCalendarScan,
  runCalendarScan,
  type CalendarScanResult,
  type MeanReversionRow,
  type VcpWatchRow,
} from './calendarScan.js';
import { scannedAtLabel } from './scanCache.js';

/** All kinds, in the order the filter chips render (most actionable first). */
const KINDS: CatalystKind[] = [
  'earnings', 'macro', 'custom', 'lockup', 'split', 'ipo', 'expiry', 'rebalance', 'dividend',
];

/** Per-kind accent colour + one-glyph marker for chips and day cells. */
const KIND_STYLE: Record<CatalystKind, { color: string; glyph: string }> = {
  earnings:  { color: 'var(--accent)', glyph: 'E' },
  macro:     { color: '#c88bff',       glyph: 'M' },
  custom:    { color: '#5b8cff',       glyph: '★' },
  lockup:    { color: 'var(--danger)', glyph: 'L' },
  split:     { color: '#ffb648',       glyph: 'S' },
  ipo:       { color: '#3fd6c4',       glyph: 'I' },
  expiry:    { color: '#9aa4b2',       glyph: 'X' },
  rebalance: { color: '#9aa4b2',       glyph: 'R' },
  dividend:  { color: '#7f8b99',       glyph: 'D' },
};

type Scope = 'all' | 'watchlist' | 'portfolio';

/** View state, kept across re-renders within a session. */
const view = {
  scope: 'all' as Scope,
  // Ex-dividends are off by default: they're numerous and rarely move a chart.
  kinds: new Set<CatalystKind>(['earnings', 'macro', 'custom', 'lockup', 'split', 'ipo']),
  minCap: 0,
  selectedDate: null as string | null,
  /** Cached scope sets so filtering doesn't re-read storage on every click. */
  watchSymbols: [] as string[],
  /** Cost-basis exposure across ALL accounts, one shared denominator. */
  exposure: null as CapitalExposure | null,
};

/** Held symbols, for the portfolio scope filter. */
function heldSymbols(): string[] {
  return [...(view.exposure?.amounts.keys() ?? [])];
}

let current: CatalystWindow | null = null;
let customEvents: CustomEvent[] = [];
let appCtx: AppContext;
/**
 * Today's technical scan behind the three analytical sections, and when it ran.
 *
 * Deliberately separate from `current`: the calendar sweep (~60 requests) and the
 * universe scan (~540) have different budgets and different failure modes, and
 * tying them together would mean one could not run without the other.
 */
let watchScan: CalendarScanResult | null = null;
let watchScanAt = 0;
/**
 * Abort signal. Every run captures its own value and stops as soon as this no
 * longer matches, so bumping it cancels whatever is in flight.
 */
let watchToken = 0;
/**
 * Which run currently owns the `#cal-watch` host, or 0 when none does.
 *
 * Separate from `watchToken` because Stop and Re-scan both cancel the running scan
 * but mean opposite things about the host: after Stop the cancelled run should
 * restore the sections, after Re-scan it must leave the NEW run's progress card
 * untouched. Comparing against `watchOwner` is what tells them apart — with only
 * the token, a fast Stop→Run would blank the new scan's progress bar.
 */
let watchOwner = 0;
let watchScanning = false;
/** Guards against the stale-snapshot rebuild firing on every re-render. */
let rebuilding = false;
/**
 * Last local day a sweep's fetch succeeded, mirrored in memory.
 *
 * `renderStatus` runs synchronously on every re-render and needs this to decide
 * whether an auto-refresh is still owed, so it cannot await storage. Seeded in
 * boot() and advanced by rebuild().
 */
let sweptDay = '';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── entry point ─────────────────────────────────────────────────────────── */

export function renderCalendar(ctx: AppContext): void {
  appCtx = ctx;
  const root = $('#tab-calendar')!;
  root.innerHTML = `
    <h1>${t('cal.title')}</h1>
    <p class="subtitle">${t('cal.sub')}</p>
    <div id="cal-controls"></div>
    <div id="cal-status"></div>
    <div id="cal-risk"></div>
    <div id="cal-upcoming"></div>
    <div id="cal-grid"></div>
    <div id="cal-day"></div>
    <div id="cal-watch"></div>`;
  void boot();
}

async function boot(): Promise<void> {
  await loadScopeData();
  customEvents = await loadCustom(appCtx);

  // Today's technical scan, if one already ran. Loading it costs nothing and
  // never triggers a fetch — the sections render from cache or offer a Run button.
  const cachedScan = await loadCalendarScan(appCtx).catch(() => null);
  if (cachedScan?.rows[0]) {
    watchScan = cachedScan.rows[0];
    watchScanAt = cachedScan.at;
  }

  const today = todayLocal();
  const cached = await loadWindow(appCtx, today);
  const log = await loadSweepLog(appCtx).catch(() => null);
  sweptDay = log?.lastSweepDay ?? '';
  const decision = decideSweep({ today, hasSnapshotForToday: cached !== null, log });

  if (decision === 'use-snapshot') {
    current = cached;
    renderAll();
    return;
  }

  if (decision === 'swept-but-no-snapshot') {
    // A sweep already ran today; its snapshot just isn't here (the save failed,
    // or it lives on another device that hasn't synced yet). Re-sweeping would
    // fire 60 requests on every tab open, which is exactly the bug this avoids.
    // Show the newest snapshot we do have and let the user force a refresh.
    const days = await listSnapshotDays(appCtx);
    const newest = days[0] ? await loadWindow(appCtx, days[0]) : null;
    if (newest) {
      current = newest;
      renderAll();
      return;
    }
    // Nothing at all to show. A manual Refresh is the only sensible offer —
    // sweeping automatically here would restore the runaway loop.
    $('#cal-status')!.innerHTML = `<div class="card" style="margin-bottom:14px">
      <span class="muted">${t('cal.swept.nosnapshot')}</span>
      <button id="cal-retry" class="range-btn" style="margin-left:12px">↻ ${t('cal.refresh')}</button>
    </div>`;
    $('#cal-retry')?.addEventListener('click', () => void rebuild());
    // The technical sections do not depend on the event window, so they still
    // render even when there is no calendar to show.
    renderWatch();
    return;
  }

  await rebuild();
}

/** Read watchlist symbols and portfolio weights, for the scope filters. */
async function loadScopeData(): Promise<void> {
  try {
    const idx = await loadIndex(appCtx);
    const all: string[] = [];
    for (const w of idx) all.push(...(await loadItems(appCtx, w.id)));
    view.watchSymbols = [...new Set(all.map((s) => s.toUpperCase()))];
  } catch {
    view.watchSymbols = [];
  }

  // Portfolio weights: each holding's cost basis over the capital of the WHOLE
  // book. This used to divide by each account's own equity and then sum across
  // accounts, which made four fully-invested accounts total ~400% and produced
  // the reported "278% of capital". `capitalExposure` uses one shared
  // denominator so the figure is a real share of the money. See exposure.ts.
  try {
    const accounts = (await appCtx.storage.get<AccountState[]>('accounts')) ?? [];
    view.exposure = capitalExposure(accounts);
  } catch {
    view.exposure = null;
  }
}

/** Run the full sweep with live progress, then snapshot it. */
async function rebuild(): Promise<void> {
  if (rebuilding) return;
  rebuilding = true;
  const status = $('#cal-status')!;
  status.innerHTML = '';
  status.appendChild(el(`
    <div class="card" style="margin-bottom:14px">
      <div class="row" style="align-items:center;gap:12px;flex-wrap:nowrap">
        <span class="muted" id="cal-prog-label" style="font-size:12px">${t('cal.building')}…</span>
        <div style="flex:1;height:6px;background:var(--surface);border-radius:999px;overflow:hidden">
          <div id="cal-prog-bar" style="height:100%;width:0;background:var(--accent);transition:width .2s"></div>
        </div>
        <span class="mono muted" id="cal-prog-pct" style="font-size:12px">0%</span>
      </div>
    </div>`));

  // Only the FETCH may report a connection problem. Saving and rendering are
  // separate failures with separate causes, and conflating them told the user to
  // "check the connection" when the sweep had in fact succeeded and the browser
  // was simply out of storage.
  let w: CatalystWindow;
  try {
    w = await fetchCatalystWindow({
      onProgress: ({ done, total, label }) => {
        const p = Math.round((done / total) * 100);
        const bar = $('#cal-prog-bar');
        if (bar) bar.style.width = `${p}%`;
        const pctEl = $('#cal-prog-pct');
        if (pctEl) pctEl.textContent = `${p}%`;
        const lab = $('#cal-prog-label');
        if (lab) lab.textContent = label;
      },
    });
  } catch {
    status.innerHTML = `<div class="card" style="margin-bottom:14px;border-color:var(--danger)">
      <span style="color:var(--danger)">${t('cal.failed')}</span>
      <button id="cal-retry" class="range-btn" style="margin-left:12px">↻ ${t('cal.refresh')}</button>
    </div>`;
    $('#cal-retry')?.addEventListener('click', () => void rebuild());
    rebuilding = false;
    return;
  }

  // The window is in hand — from here nothing may stop it being shown.
  current = w;

  // Write the receipt BEFORE the snapshot, and independently of it. The fetch
  // succeeded, so today's request budget is spent whether or not the ~500 KB
  // snapshot fits in storage. Recording it only on a successful save is what let
  // a full store turn "once a day" into "60 requests every tab open".
  sweptDay = w.builtOn;
  await noteSweep(appCtx, w.builtOn, w.at).catch(() => {});

  let saveWarning = '';
  try {
    await saveWindow(appCtx, w);
  } catch (e) {
    // Not fatal: the calendar works this session, it just won't persist, so
    // tomorrow's open re-sweeps. Say that plainly instead of blaming the network.
    saveWarning =
      e instanceof SnapshotTooLargeError
        ? t('cal.nosave.full')
        : t('cal.nosave');
  }

  // `rebuilding` must stay true across renderAll(): renderStatus() re-triggers
  // rebuild() whenever it sees a stale snapshot, and this flag is the only thing
  // stopping that from recursing forever if a sweep ever returns a stale builtOn
  // (e.g. the local date rolls over mid-sweep).
  try {
    renderAll();
    if (saveWarning) {
      $('#cal-status')?.appendChild(el(`
        <div class="card" style="margin-bottom:14px;border-color:#ffb648">
          <span style="color:#ffb648">⚠ ${saveWarning}</span>
        </div>`));
    }
  } finally {
    rebuilding = false;
  }
}

/* ── event assembly ──────────────────────────────────────────────────────── */

/** The window's events plus hand-entered ones, before scope/kind filtering. */
function allEvents(): CatalystEvent[] {
  if (!current) return [];
  // Custom events go last so a manual entry wins any id collision.
  return mergeEvents(current.events, customToEvents(customEvents, current.from, current.to));
}

/** Events after the active scope, kind and market-cap filters. */
function visibleEvents(): CatalystEvent[] {
  const scopeSymbols =
    view.scope === 'watchlist' ? view.watchSymbols
    : view.scope === 'portfolio' ? heldSymbols()
    : undefined;
  return filterEvents(allEvents(), {
    kinds: [...view.kinds],
    symbols: scopeSymbols,
    minMarketCap: view.minCap || undefined,
  });
}

/* ── render ──────────────────────────────────────────────────────────────── */

function renderAll(): void {
  renderControls();
  renderStatus();
  renderRisk();
  renderUpcoming();
  renderGrid();
  renderDayPanel();
  renderWatch();
}

function renderControls(): void {
  const host = $('#cal-controls')!;
  const scopeBtn = (s: Scope, label: string): string =>
    `<button class="range-btn${view.scope === s ? ' active' : ''}" data-scope="${s}">${label}</button>`;

  host.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="row" style="gap:8px">
        ${scopeBtn('all', t('cal.scope.all'))}
        ${scopeBtn('watchlist', t('cal.scope.watchlist'))}
        ${scopeBtn('portfolio', t('cal.scope.portfolio'))}
        <span style="flex:1"></span>
        <label class="field-label" style="margin:0">${t('cal.mincap')}</label>
        <select id="cal-mincap" class="field" style="width:auto;min-width:96px">
          <option value="0"${view.minCap === 0 ? ' selected' : ''}>—</option>
          <option value="300000000"${view.minCap === 3e8 ? ' selected' : ''}>$300M</option>
          <option value="2000000000"${view.minCap === 2e9 ? ' selected' : ''}>$2B</option>
          <option value="10000000000"${view.minCap === 1e10 ? ' selected' : ''}>$10B</option>
        </select>
        <button id="cal-add" class="range-btn">+ ${t('cal.addevent')}</button>
        <button id="cal-refresh" class="range-btn">↻ ${t('cal.refresh')}</button>
      </div>
      <div class="row" style="gap:6px;margin-top:10px">
        ${KINDS.map((k) => {
          const { color, glyph } = KIND_STYLE[k];
          return `<button class="cal-chip${view.kinds.has(k) ? ' on' : ''}" data-kind="${k}"
            style="--chip:${color}"><span class="cal-glyph">${glyph}</span>${t(`cal.kind.${k}`)}</button>`;
        }).join('')}
      </div>
    </div>`;

  host.querySelectorAll<HTMLElement>('[data-scope]').forEach((b) =>
    b.addEventListener('click', () => {
      view.scope = b.dataset.scope as Scope;
      renderAll();
    }),
  );
  host.querySelectorAll<HTMLElement>('[data-kind]').forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.kind as CatalystKind;
      if (view.kinds.has(k)) view.kinds.delete(k);
      else view.kinds.add(k);
      renderAll();
    }),
  );
  $<HTMLSelectElement>('#cal-mincap')!.addEventListener('change', (e) => {
    view.minCap = Number((e.target as HTMLSelectElement).value);
    renderAll();
  });
  $('#cal-refresh')!.addEventListener('click', () => void rebuild());
  $('#cal-add')!.addEventListener('click', () => void promptAddEvent());
}

function renderStatus(): void {
  if (!current) return;
  const lang = getLang();
  const today = todayLocal();
  const stale = current.builtOn !== today;
  // Whether the auto-refresh below is still allowed today. renderStatus runs on
  // EVERY re-render — each filter chip, each scope switch — so this must consult
  // the sweep receipt, not just staleness. Otherwise a day whose snapshot failed
  // to save re-swept 60 requests on every click.
  const mayResweep = stale && sweptDay < today;

  // Coverage is per-kind; surface the EARLIEST horizon among the active kinds,
  // since that's the first date this view stops being complete.
  const active = [...view.kinds];
  const firstGap = current.coverage
    .filter((c) => active.includes(c.kind))
    .map((c) => c.until)
    .sort()[0];
  const gapNote =
    firstGap && firstGap < current.to
      ? ` · <span style="color:#ffb648">${t('cal.partial')} ${lang === 'vi' ? 'sau' : 'after'} ${firstGap}</span>`
      : '';

  $('#cal-status')!.innerHTML = `
    <p class="muted" style="margin:-6px 0 14px;font-size:12px">
      ${current.from} → ${current.to} ·
      ${!stale
        ? updatedAtLabel(current.at, lang)
        : mayResweep
          ? (lang === 'vi' ? `Ảnh chụp ngày ${current.builtOn} — đang làm mới…`
                           : `Snapshot from ${current.builtOn} — refreshing…`)
          // Already swept today: say so plainly instead of promising a refresh
          // that will not come. Refresh above is the way to force one.
          : (lang === 'vi' ? `Ảnh chụp ngày ${current.builtOn} — đã quét hôm nay, bấm ↻ để quét lại`
                           : `Snapshot from ${current.builtOn} — already swept today; use ↻ to force`)
      }${gapNote}
    </p>`;

  if (mayResweep) void rebuild(); // local date rolled over → refresh in place
}

/** "My event risk": which holdings report, and what share of capital is exposed. */
function renderRisk(): void {
  const host = $('#cal-risk')!;
  const exp = view.exposure;
  if (!current || !exp || exp.amounts.size === 0) {
    host.innerHTML = '';
    return;
  }
  const risks = dayRisks(allEvents(), exp.weights);
  if (!risks.length) {
    host.innerHTML = `<div class="card" style="margin-bottom:14px">
      <div class="section-title" style="margin:0 0 6px">${t('cal.myrisk')}</div>
      <span class="muted">${t('cal.myrisk.none')}</span></div>`;
    return;
  }
  const rows = risks.slice(0, 8).map((d) => {
    // 20% of capital into one day's prints is where it stops being a detail and
    // starts being the dominant driver of the week's P&L.
    const hot = d.exposure >= 0.2;
    // The money amount alongside the percentage: a percentage on its own was what
    // made the old wrong figure hard to spot. An absolute number is checkable
    // against the Portfolio tab, so a broken denominator shows up immediately.
    const amount = d.symbols.reduce((s, sym) => s + (exp.amounts.get(sym.toUpperCase()) ?? 0), 0);
    return `<tr data-goto="${d.date}" style="cursor:pointer">
      <td class="mono">${d.date}</td>
      <td>${d.symbols.map((s) => `<span class="badge">${s}</span>`).join(' ')}</td>
      <td class="mono" style="text-align:right;color:${hot ? 'var(--danger)' : 'var(--text)'}">
        ${(d.exposure * 100).toFixed(1)}%
        <span class="muted" style="font-size:11px"> · ${fmtBig(amount)}</span></td>
    </tr>`;
  }).join('');

  // State the denominator. "% of capital" is ambiguous until you say WHICH
  // capital, and the old bug was invisible precisely because nothing on screen
  // said what the number was divided by.
  const lang = getLang();
  const basis = lang === 'vi'
    ? `Tính trên tổng vốn ${fmtBig(exp.totalCapital)} của tất cả tài khoản (giá vốn + tiền mặt).`
    : `Against total capital of ${fmtBig(exp.totalCapital)} across all accounts (cost basis + cash).`;
  const fxNote = exp.mixedCurrency
    ? `<br><span style="color:#ffb648">⚠ ${lang === 'vi'
        ? 'Các tài khoản dùng nhiều loại tiền khác nhau — số tiền được cộng thẳng, chưa quy đổi.'
        : 'Accounts use different currencies — amounts are summed without conversion.'}</span>`
    : '';

  host.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="section-title" style="margin:0 0 6px">${t('cal.myrisk')}</div>
      <table><thead><tr>
        <th>${t('cal.event.date')}</th><th>${t('cal.holdings')}</th>
        <th style="text-align:right">${t('cal.ofcapital')}</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <p class="muted" style="margin:8px 0 0;font-size:11px">${basis}${fxNote}</p>
    </div>`;

  host.querySelectorAll<HTMLElement>('[data-goto]').forEach((tr) =>
    tr.addEventListener('click', () => {
      view.selectedDate = tr.dataset.goto!;
      renderGrid();
      renderDayPanel();
      $('#cal-day')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }),
  );
}

/** High-impact strip for the coming week — what to actually prepare for. */
function renderUpcoming(): void {
  const host = $('#cal-upcoming')!;
  if (!current) return;
  const cutoff = dateRange(current.from, current.to)[7] ?? current.to;
  const soon = visibleEvents()
    .filter((e) => e.date <= cutoff)
    .sort((a, b) => b.impact - a.impact || a.date.localeCompare(b.date))
    .slice(0, 12);

  if (!soon.length) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = `
    <div class="section-title">${t('cal.upcoming')}</div>
    <div class="cal-strip">${soon.map(eventCardHtml).join('')}</div>`;
  wireSymbolClicks(host);
}

function timingBadge(e: CatalystEvent): string {
  if (e.timing === 'unknown' && e.kind !== 'earnings') return '';
  // BMO vs AMC decides WHICH session gaps on the news — never leave it implicit.
  const strong = e.timing === 'bmo' || e.timing === 'amc';
  return `<span class="badge"${strong ? ' style="border-color:var(--accent-line);color:var(--accent)"' : ''}
    >${t(`cal.timing.${e.timing}`)}</span>`;
}

function eventCardHtml(e: CatalystEvent): string {
  const { color, glyph } = KIND_STYLE[e.kind];
  const est = e.confidence === 'estimated'
    ? `<span class="badge" title="${esc(t('cal.estimated.tip'))}"
         style="border-color:#ffb648;color:#ffb648">~ ${t('cal.estimated')}</span>`
    : '';
  const sym = e.symbol
    ? `<button class="cal-sym" data-sym="${e.symbol}">${e.symbol}</button>`
    : `<span class="cal-sym-none">${t(`cal.kind.${e.kind}`)}</span>`;
  return `
    <div class="cal-card" style="--chip:${color}">
      <div class="cal-card-head">
        <span class="cal-glyph">${glyph}</span>${sym}
        <span class="mono muted cal-card-date">${e.date}</span>
      </div>
      <div class="cal-card-title">${esc(e.title)}</div>
      ${e.detail ? `<div class="cal-card-detail">${esc(e.detail)}</div>` : ''}
      <div class="cal-card-badges">${timingBadge(e)}${est}${
        e.marketCap ? `<span class="badge">${fmtBig(e.marketCap)}</span>` : ''}</div>
    </div>`;
}

/**
 * Month grid on wide screens, day list on phones — a 7-column grid is unreadable
 * on an iPhone SE. Both views come from the same grouped data; CSS picks one.
 */
function renderGrid(): void {
  if (!current) return;
  const byDate = groupByDate(visibleEvents(), current.from, current.to);
  const days = [...byDate.keys()];
  const today = todayLocal();
  const active = [...view.kinds];

  // Lead with blank cells so the first day lands under its weekday column.
  // Parsed as UTC deliberately: the string is a calendar date, not a moment.
  const firstDow = new Date(`${days[0]}T00:00:00Z`).getUTCDay();
  const lead = '<div class="cal-cell cal-cell--pad"></div>'.repeat(firstDow);

  const cells = days.map((date) => {
    const dayEvents = byDate.get(date) ?? [];
    const missing = uncoveredKinds(current!.coverage, date, active);

    // One chip per KIND with a count, instead of 40 unreadable rows on a peak day.
    const counts = new Map<CatalystKind, number>();
    for (const e of dayEvents) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    const chips = [...counts.entries()]
      .sort((a, b) => KINDS.indexOf(a[0]) - KINDS.indexOf(b[0]))
      .map(([k, n]) => `<span class="cal-daychip" style="--chip:${KIND_STYLE[k].color}"
        >${KIND_STYLE[k].glyph}${n > 1 ? `<b>${n}</b>` : ''}</span>`)
      .join('');

    // Highest-impact symbol, so a cell is scannable without opening it.
    const lead0 = dayEvents[0];
    const peek = lead0?.symbol
      ? `<div class="cal-peek">${lead0.symbol}${dayEvents.length > 1 ? ` +${dayEvents.length - 1}` : ''}</div>`
      : '';

    // Missing data is HATCHED when the cell is empty — otherwise an empty
    // far-out cell would read as "nothing scheduled" when it means "the source
    // has no data yet". A cell that DOES have events but is still missing a kind
    // gets a corner dot, because "3 earnings" there is a floor, not the total.
    const gapTip = missing.length
      ? ` title="${esc(t('cal.nodata.tip'))} (${missing.map((k) => t(`cal.kind.${k}`)).join(', ')})"`
      : '';

    return `<div class="cal-cell${isWeekend(date) ? ' cal-cell--weekend' : ''}${
      view.selectedDate === date ? ' cal-cell--sel' : ''}${
      date === today ? ' cal-cell--today' : ''}${
      missing.length && !dayEvents.length ? ' cal-cell--nodata' : ''}${
      missing.length && dayEvents.length ? ' cal-cell--partial' : ''}"
      data-date="${date}"${gapTip}>
      <div class="cal-cell-date">${Number(date.slice(8, 10))}</div>
      <div class="cal-cell-chips">${chips}</div>${peek}
    </div>`;
  });

  const dow = getLang() === 'vi'
    ? ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Mobile list: only days that have something, so there's no endless scroll.
  const listRows = days.filter((d) => byDate.get(d)!.length).map((date) => {
    const dayEvents = byDate.get(date)!;
    return `<button class="cal-listrow${view.selectedDate === date ? ' on' : ''}" data-date="${date}">
      <span class="mono cal-listdate">${date.slice(5)}${date === today ? ` · ${t('cal.today')}` : ''}</span>
      <span class="cal-listchips">${dayEvents.slice(0, 5).map((e) =>
        `<span class="cal-daychip" style="--chip:${KIND_STYLE[e.kind].color}"
          >${e.symbol ?? KIND_STYLE[e.kind].glyph}</span>`).join('')}${
        dayEvents.length > 5 ? `<span class="muted">+${dayEvents.length - 5}</span>` : ''}</span>
    </button>`;
  }).join('');

  $('#cal-grid')!.innerHTML = `
    <div class="cal-monthgrid">
      <div class="cal-dow">${dow.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-cells">${lead}${cells.join('')}</div>
    </div>
    <div class="cal-daylist">${listRows || `<p class="muted">${t('cal.noevents')}</p>`}</div>`;

  $('#cal-grid')!.querySelectorAll<HTMLElement>('[data-date]').forEach((c) =>
    c.addEventListener('click', () => {
      view.selectedDate = view.selectedDate === c.dataset.date ? null : c.dataset.date!;
      renderGrid();
      renderDayPanel();
    }),
  );
}

function renderDayPanel(): void {
  const host = $('#cal-day')!;
  const date = view.selectedDate;
  if (!current || !date) {
    host.innerHTML = '';
    return;
  }
  const dayEvents = visibleEvents().filter((e) => e.date === date);
  const missing = uncoveredKinds(current.coverage, date, [...view.kinds]);

  const body = dayEvents.length
    ? `<div class="cal-strip">${dayEvents.map(eventCardHtml).join('')}</div>`
    : `<p class="muted">${missing.length ? t('cal.nodata') : t('cal.noevents')}</p>`;

  const warn = missing.length
    ? `<p class="muted" style="font-size:12px;margin:8px 0 0">⚠ ${t('cal.nodata.tip')}
        (${missing.map((k) => t(`cal.kind.${k}`)).join(', ')})</p>`
    : '';

  // Manual entries get a delete affordance — they're the only user-owned rows.
  const mine = customEvents.filter((c) => c.date === date);
  const mineHtml = mine.length
    ? `<div style="margin-top:10px;display:flex;flex-direction:column;gap:6px">${mine.map((c) => `
        <div class="row" style="gap:8px;flex-wrap:nowrap">
          <span class="badge" style="border-color:#5b8cff;color:#5b8cff">★</span>
          <span style="flex:1;font-size:13px">${esc(c.title)}</span>
          <button class="range-btn" data-del="${c.id}" style="padding:2px 9px;font-size:11px"
            >${t('cal.delete')}</button>
        </div>`).join('')}</div>`
    : '';

  host.innerHTML = `
    <div class="card" style="margin-top:14px">
      <div class="row" style="flex-wrap:nowrap">
        <div class="section-title" style="margin:0">${date}</div>
        <span style="flex:1"></span>
        <button id="cal-day-add" class="range-btn">+ ${t('cal.addevent')}</button>
      </div>
      ${body}${warn}${mineHtml}
    </div>`;

  wireSymbolClicks(host);
  $('#cal-day-add')!.addEventListener('click', () => void promptAddEvent(date));
  host.querySelectorAll<HTMLElement>('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      await deleteCustom(appCtx, b.dataset.del!);
      customEvents = await loadCustom(appCtx);
      renderAll();
    }),
  );
}

/* ── the three analytical sections ───────────────────────────────────────── */

/**
 * Top attention / VCP / Mean Reversion.
 *
 * All three come from one cached scan. Until that scan has run today, the section
 * shows a Run button and NOT a spinner: ~540 requests must be a deliberate act,
 * for the same reason Picks works this way.
 */
function renderWatch(): void {
  const host = $('#cal-watch')!;
  if (watchScanning) return; // the progress card owns the host mid-scan

  const header = `
    <div class="section-title" style="margin-top:22px">${t('cal.watch.title')}</div>
    <p class="muted" style="margin:-6px 0 12px;font-size:12px;line-height:1.55">${t('cal.watch.sub')}</p>`;

  if (!watchScan) {
    host.innerHTML = `${header}
      <div class="card" style="text-align:center;padding:26px">
        <p class="muted" style="margin:0 auto 14px;max-width:60ch;line-height:1.6">${t('cal.watch.prompt')}</p>
        <button id="cal-watch-run" class="btn">${t('cal.watch.run')}</button>
      </div>`;
    $('#cal-watch-run')!.addEventListener('click', () => void startWatchScan());
    return;
  }

  const lang = getLang();
  const regime = watchScan.regime
    ? ` · <span class="badge">${watchScan.regime}</span>`
    : '';
  host.innerHTML = `${header}
    <p class="muted" style="margin:-6px 0 12px;font-size:12px">
      ${scannedAtLabel(watchScanAt, lang)} · ${watchScan.scanned} ${t('picks.scanned')}${regime}
      <button id="cal-watch-rerun" class="link-btn" style="margin-left:8px">${t('cal.watch.rerun')}</button>
    </p>
    <div id="cal-top"></div>
    <div id="cal-vcp"></div>
    <div id="cal-mr"></div>`;
  $('#cal-watch-rerun')!.addEventListener('click', () => void startWatchScan());

  renderTopAttention();
  renderVcpSection(watchScan.vcp);
  renderMeanReversionSection(watchScan.meanReversion);
}

/** Run the universe scan with live progress, then re-render the sections. */
async function startWatchScan(): Promise<void> {
  const host = $('#cal-watch')!;
  const myToken = ++watchToken;
  watchOwner = myToken;
  watchScanning = true;

  host.innerHTML = `
    <div class="section-title" style="margin-top:22px">${t('cal.watch.title')}</div>
    <div class="card">
      <div class="row" style="align-items:center;gap:12px;flex-wrap:nowrap">
        <span class="muted" id="cal-watch-label" style="font-size:12px">${t('cal.watch.scanning')}…</span>
        <div style="flex:1;height:6px;background:var(--surface);border-radius:999px;overflow:hidden">
          <div id="cal-watch-bar" style="height:100%;width:0;background:var(--accent);transition:width .2s"></div>
        </div>
        <button id="cal-watch-stop" class="range-btn">${t('cal.watch.stop')}</button>
      </div>
    </div>`;
  // Bumping the token is what the scan polls; it stops between batches rather
  // than mid-fetch, so an in-flight request is never orphaned.
  $('#cal-watch-stop')!.addEventListener('click', () => {
    watchToken += 1;
  });

  try {
    const result = await runCalendarScan(
      appCtx,
      ({ done, total, vcp, meanReversion }) => {
        if (myToken !== watchToken) return;
        const bar = $('#cal-watch-bar');
        if (bar) bar.style.width = `${Math.round((done / total) * 100)}%`;
        const lab = $('#cal-watch-label');
        if (lab) {
          lab.textContent =
            `${t('cal.watch.scanning')} ${done}/${total} — ${vcp} VCP · ${meanReversion} MR`;
        }
      },
      () => myToken !== watchToken,
    );
    if (myToken !== watchToken) {
      // Cancelled. If a newer run has since taken the host, this one is done and
      // must touch nothing — otherwise it wipes the new progress card.
      if (watchOwner !== myToken) return;
      watchOwner = 0;
      watchScanning = false;
      // Stopped, with nothing newer running: restore whatever was cached rather
      // than leaving the section blank.
      renderWatch();
      if (!watchScan) {
        host.appendChild(el(`<p class="muted" style="font-size:12px">${t('cal.watch.stopped')}</p>`));
      }
      return;
    }
    watchOwner = 0;
    watchScanning = false;
    if (result) {
      watchScan = result;
      watchScanAt = Date.now();
    }
    renderWatch();
  } catch {
    if (watchOwner !== myToken) return; // superseded — the live run owns the host
    watchOwner = 0;
    watchScanning = false;
    renderWatch();
    host.appendChild(el(`
      <div class="card" style="border-color:var(--danger)">
        <span style="color:var(--danger)">${t('cal.watch.failed')}</span>
      </div>`));
  }
}

/**
 * Top 7 — the blend of upcoming catalysts and technical state.
 *
 * The event side comes from the calendar window (already loaded), the technical
 * side from the cached scan, and ownership from the portfolio/watchlists. Symbols
 * with events but no scan row still rank: `rankAttention` scores them on event
 * terms alone rather than dropping them, which matters most for exactly the case
 * you care about — a stock you hold that is about to report.
 */
function renderTopAttention(): void {
  const host = $('#cal-top');
  if (!host) return;
  const today = todayLocal();
  const bySymbol = eventsBySymbol(visibleEvents());
  const signals = new Map((watchScan?.signals ?? []).map((s) => [s.symbol, s]));
  const held = view.exposure?.weights ?? new Map<string, number>();
  const watched = new Set(view.watchSymbols);

  // The candidate pool is the union: anything with an event, anything with a
  // technical signal, everything held, everything watchlisted. Restricting it to
  // symbols with events would make this a prettier earnings calendar.
  const pool = new Set<string>([
    ...bySymbol.keys(),
    ...signals.keys(),
    ...held.keys(),
    ...watched,
  ]);

  const inputs: AttentionInput[] = [...pool].map((symbol) => {
    const s = signals.get(symbol);
    return {
      symbol,
      events: bySymbol.get(symbol) ?? [],
      qualityScore: s?.qualityScore ?? null,
      setupType: s?.setupType ?? null,
      distanceToPivotPct: s?.distanceToPivotPct ?? null,
      momentumScore: s?.momentumScore ?? null,
      relativeStrength: s?.relativeStrength ?? null,
      weight: held.get(symbol) ?? 0,
      watchlisted: watched.has(symbol),
    };
  });

  const rows = rankAttention(inputs, today, 7);
  host.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="section-title" style="margin:0 0 2px">${t('cal.top.title')}</div>
      <p class="muted" style="margin:0 0 10px;font-size:11px;line-height:1.5">${t('cal.top.sub')}</p>
      ${rows.length ? topTableHtml(rows) : `<p class="muted" style="margin:0">${t('cal.top.none')}</p>`}
    </div>`;
  wireSymbolClicks(host);
}

function topTableHtml(rows: AttentionRow[]): string {
  const body = rows.map((r, i) => {
    const ev = r.nextEvent;
    // "in 3d" is the actionable form of a date; the date itself is the checkable
    // one. Both, because either alone leads to a misread.
    const when = ev && r.daysAway !== null
      ? `<span class="mono">${ev.date}</span> <span class="muted">· ${daysLabel(r.daysAway)}</span>`
      : '<span class="muted">—</span>';
    const what = ev
      ? `<div class="muted" style="font-size:11px">${esc(ev.title)}${
          r.eventCount > 1 ? ` +${r.eventCount - 1}` : ''}</div>`
      : '';
    const chips = r.reasons
      .map((why) => `<span class="badge" style="${reasonStyle(why)}">${t(`cal.why.${why}`)}</span>`)
      .join(' ');
    const q = r.qualityScore != null ? `<span class="mono">${r.qualityScore.toFixed(0)}</span>` : '—';
    return `<tr>
      <td class="muted mono" style="width:1%">${i + 1}</td>
      <td><button class="cal-sym" data-sym="${r.symbol}">${r.symbol}</button></td>
      <td>${when}${what}</td>
      <td style="text-align:right">${q}</td>
      <td class="mono" style="text-align:right;font-weight:600">${r.score.toFixed(0)}</td>
      <td>${chips}</td>
    </tr>`;
  }).join('');

  return `<table><thead><tr>
      <th></th><th>${t('col.symbol')}</th>
      <th>${t('cal.top.next')}</th>
      <th style="text-align:right">${t('detail.quality')}</th>
      <th style="text-align:right">${t('cal.top.score')}</th>
      <th>${t('cal.top.why')}</th>
    </tr></thead><tbody>${body}</tbody></table>`;
}

/** Held and unconfirmed-date chips are the two that change what you should do. */
function reasonStyle(why: AttentionReason): string {
  if (why === 'held') return 'border-color:var(--accent-line);color:var(--accent)';
  if (why === 'unconfirmed-date') return 'border-color:#ffb648;color:#ffb648';
  return '';
}

function daysLabel(days: number): string {
  const vi = getLang() === 'vi';
  if (days === 0) return t('cal.today');
  if (days === 1) return vi ? 'mai' : 'tomorrow';
  return vi ? `còn ${days} ngày` : `in ${days}d`;
}

function renderVcpSection(rows: VcpWatchRow[]): void {
  const host = $('#cal-vcp');
  if (!host) return;
  const top = rows.slice(0, 12);
  const body = top.map((r) => {
    const d = r.distanceToPivotPct;
    // A negative distance means price is already through the pivot: the base has
    // broken out, which is a different trade from a base still forming.
    const toPivot = d == null ? '—'
      : d < 0 ? `<span style="color:var(--accent)">${Math.abs(d).toFixed(1)}% ${t('cal.vcp.abovepivot')}</span>`
      : `${d.toFixed(1)}%`;
    const trendFlag = r.trendPassed ? '' :
      `<span class="badge" title="${esc(t('cal.vcp.notrend.tip'))}"
         style="border-color:#ffb648;color:#ffb648">⚠ ${t('cal.vcp.notrend')}</span>`;
    return `<tr>
      <td><button class="cal-sym" data-sym="${r.symbol}">${r.symbol}</button>
        ${r.sector ? `<div class="muted" style="font-size:11px">${esc(r.sector)}</div>` : ''}</td>
      <td class="mono" style="text-align:right">${r.price.toFixed(2)}</td>
      <td class="mono" style="text-align:right">${r.previousAdvancePct.toFixed(0)}%</td>
      <td class="mono" style="text-align:right">${r.contractions}</td>
      <td class="mono" style="text-align:right">${r.baseDepthPct.toFixed(1)}%</td>
      <td class="mono" style="text-align:right">${r.pivot != null ? r.pivot.toFixed(2) : '—'}</td>
      <td class="mono" style="text-align:right">${toPivot}</td>
      <td class="mono" style="text-align:right;font-weight:600">${r.confidence.toFixed(0)}</td>
      <td>${trendFlag}</td>
    </tr>`;
  }).join('');

  host.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="section-title" style="margin:0 0 2px">${t('cal.vcp.title')}</div>
      <p class="muted" style="margin:0 0 10px;font-size:11px;line-height:1.5">${t('cal.vcp.sub')}</p>
      ${top.length ? `<div style="overflow-x:auto"><table><thead><tr>
        <th>${t('col.symbol')}</th>
        <th style="text-align:right">${t('col.price')}</th>
        <th style="text-align:right">${t('cal.vcp.advance')}</th>
        <th style="text-align:right">${t('cal.vcp.contractions')}</th>
        <th style="text-align:right">${t('cal.vcp.depth')}</th>
        <th style="text-align:right">Pivot</th>
        <th style="text-align:right">${t('cal.vcp.topivot')}</th>
        <th style="text-align:right">${t('detail.quality')}</th>
        <th></th>
      </tr></thead><tbody>${body}</tbody></table></div>`
      : `<p class="muted" style="margin:0">${t('cal.vcp.none')}</p>`}
    </div>`;
  wireSymbolClicks(host);
}

function renderMeanReversionSection(rows: MeanReversionRow[]): void {
  const host = $('#cal-mr');
  if (!host) return;
  const top = rows.slice(0, 12);
  const body = top.map((r) => {
    const stab = r.stabilizing
      ? `<span class="badge" title="${esc(t('cal.mr.stabilizing.tip'))}"
           style="border-color:var(--accent-line);color:var(--accent)">${t('cal.mr.stabilizing')}</span>`
      : '';
    return `<tr>
      <td><button class="cal-sym" data-sym="${r.symbol}">${r.symbol}</button>
        ${r.sector ? `<div class="muted" style="font-size:11px">${esc(r.sector)}</div>` : ''}</td>
      <td class="mono" style="text-align:right">${r.price.toFixed(2)}</td>
      <td class="mono" style="text-align:right">${r.stretchAtr.toFixed(1)}× ATR
        <div class="muted" style="font-size:11px">${r.stretchPct.toFixed(1)}%</div></td>
      <td class="mono" style="text-align:right">${r.rsi.toFixed(0)}</td>
      <td class="mono" style="text-align:right">${r.pullbackFromHighPct.toFixed(1)}%</td>
      <td class="mono" style="text-align:right">${r.targetPrice != null ? r.targetPrice.toFixed(2) : '—'}
        <div class="muted" style="font-size:11px">+${r.upsideToTargetPct.toFixed(1)}%</div></td>
      <td class="mono" style="text-align:right">${
        r.invalidationPrice != null ? r.invalidationPrice.toFixed(2) : '—'}</td>
      <td class="mono" style="text-align:right;font-weight:600">${r.confidence.toFixed(0)}</td>
      <td>${stab}</td>
    </tr>`;
  }).join('');

  host.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="section-title" style="margin:0 0 2px">${t('cal.mr.title')}</div>
      <p class="muted" style="margin:0 0 10px;font-size:11px;line-height:1.5">${t('cal.mr.sub')}</p>
      ${top.length ? `<div style="overflow-x:auto"><table><thead><tr>
        <th>${t('col.symbol')}</th>
        <th style="text-align:right">${t('col.price')}</th>
        <th style="text-align:right">${t('cal.mr.stretch')}</th>
        <th style="text-align:right">RSI</th>
        <th style="text-align:right">${t('cal.mr.drawdown')}</th>
        <th style="text-align:right">${t('cal.mr.target')}</th>
        <th style="text-align:right">${t('cal.mr.invalidation')}</th>
        <th style="text-align:right">${t('detail.quality')}</th>
        <th></th>
      </tr></thead><tbody>${body}</tbody></table></div>
      <p class="muted" style="margin:8px 0 0;font-size:11px">${t('cal.mr.falling.tip')}</p>`
      : `<p class="muted" style="margin:0">${t('cal.mr.none')}</p>`}
    </div>`;
  wireSymbolClicks(host);
}

/** Ticker buttons open the existing stock detail modal. */
function wireSymbolClicks(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-sym]').forEach((b) =>
    b.addEventListener('click', (ev) => {
      ev.stopPropagation(); // don't also toggle the day cell underneath
      void openStock(appCtx, b.dataset.sym!);
    }),
  );
}

async function promptAddEvent(date?: string): Promise<void> {
  const res = await formDialog(t('cal.addevent'), [
    { key: 'date', label: t('cal.event.date'), type: 'date', value: date ?? todayLocal() },
    { key: 'symbol', label: t('cal.event.symbol') },
    { key: 'title', label: t('cal.event.title'), placeholder: 'PDUFA / Investor day / Product launch' },
    { key: 'note', label: t('cal.event.note') },
  ]);
  if (!res?.date || !res.title?.trim()) return;
  await addCustom(appCtx, {
    date: res.date,
    symbol: res.symbol?.trim() ? res.symbol.trim().toUpperCase() : null,
    title: res.title.trim(),
    note: res.note?.trim() || undefined,
  });
  customEvents = await loadCustom(appCtx);
  view.selectedDate = res.date;
  renderAll();
}
