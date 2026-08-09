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
  type CatalystEvent,
  type CatalystKind,
  type CatalystWindow,
  computeCash,
  dateRange,
  dayRisks,
  filterEvents,
  groupByDate,
  isWeekend,
  mergeEvents,
  uncoveredKinds,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el, fmtBig } from '../ui/dom.js';
import { t, getLang } from '../ui/i18n.js';
import { openStock } from '../ui/stockModal.js';
import { formDialog } from '../ui/forms.js';
import { loadIndex, loadItems } from '../ui/watchlists.js';
import { fetchCatalystWindow, todayLocal } from '../adapters/CatalystProvider.js';
import { loadWindow, saveWindow, SnapshotTooLargeError, updatedAtLabel } from './catalystCache.js';
import { addCustom, customToEvents, deleteCustom, loadCustom, type CustomEvent } from './customEvents.js';

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
  holdWeights: new Map<string, number>(),
};

let current: CatalystWindow | null = null;
let customEvents: CustomEvent[] = [];
let appCtx: AppContext;
/** Guards against the stale-snapshot rebuild firing on every re-render. */
let rebuilding = false;

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
    <div id="cal-day"></div>`;
  void boot();
}

async function boot(): Promise<void> {
  await loadScopeData();
  customEvents = await loadCustom(appCtx);

  const cached = await loadWindow(appCtx, todayLocal());
  if (cached) {
    current = cached;
    renderAll();
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

  // Portfolio weights: each open position's COST BASIS as a share of equity.
  // Cost basis rather than market value keeps the weight stable as price moves,
  // which is what "how much capital is exposed to this event" should mean.
  try {
    const accounts = (await appCtx.storage.get<AccountState[]>('accounts')) ?? [];
    const weights = new Map<string, number>();
    for (const acct of accounts) {
      const open = acct.lots.filter((l) => l.remainingShares > 0);
      const invested = open.reduce((s, l) => s + l.buyPrice * l.remainingShares, 0);
      const equity = invested + Math.max(0, computeCash(acct));
      if (equity <= 0) continue;
      for (const l of open) {
        const sym = l.ticker.toUpperCase();
        weights.set(sym, (weights.get(sym) ?? 0) + (l.buyPrice * l.remainingShares) / equity);
      }
    }
    view.holdWeights = weights;
  } catch {
    view.holdWeights = new Map();
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
    : view.scope === 'portfolio' ? [...view.holdWeights.keys()]
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
  const stale = current.builtOn !== todayLocal();

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
      ${stale
        ? (lang === 'vi' ? `Ảnh chụp ngày ${current.builtOn} — đang làm mới…`
                         : `Snapshot from ${current.builtOn} — refreshing…`)
        : updatedAtLabel(current.at, lang)}${gapNote}
    </p>`;

  if (stale) void rebuild(); // local date rolled over → refresh in place
}

/** "My event risk": which holdings report, and what share of capital is exposed. */
function renderRisk(): void {
  const host = $('#cal-risk')!;
  if (!current || view.holdWeights.size === 0) {
    host.innerHTML = '';
    return;
  }
  const risks = dayRisks(allEvents(), view.holdWeights);
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
    return `<tr data-goto="${d.date}" style="cursor:pointer">
      <td class="mono">${d.date}</td>
      <td>${d.symbols.map((s) => `<span class="badge">${s}</span>`).join(' ')}</td>
      <td class="mono" style="text-align:right;color:${hot ? 'var(--danger)' : 'var(--text)'}">
        ${(d.exposure * 100).toFixed(1)}%</td>
    </tr>`;
  }).join('');

  host.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="section-title" style="margin:0 0 6px">${t('cal.myrisk')}</div>
      <table><thead><tr>
        <th>${t('cal.event.date')}</th><th>${t('cal.holdings')}</th>
        <th style="text-align:right">${t('cal.ofcapital')}</th>
      </tr></thead><tbody>${rows}</tbody></table>
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
