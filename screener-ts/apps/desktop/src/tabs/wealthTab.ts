/**
 * Financial Status — the Portfolio plus bank accounts, savings, cash and debts, in euros.
 *
 * The model (what a balance reading means, how a date is converted, where the chart
 * starts) is in `@screener/core` `wealth/` and is tested there; storage and rates are in
 * `wealth/store.ts`. This file is the page: it reads the portfolio snapshots, draws, and
 * turns clicks into book edits.
 *
 * ── WHERE THE PORTFOLIO NUMBER COMES FROM ───────────────────────────────────
 * Each portfolio account's persisted daily `snapshots` — the same series the Portfolio
 * Overview draws, and synced, so a phone that never pressed Update still has a curve. It
 * is only as current as the last Portfolio Update, which is why this page's Update runs
 * that first and says which date the portfolio figure is from. An account with no
 * positions has no snapshots (`update()` clears them), so its cash is counted flat from
 * the day it was created — leaving it out would drop real money from the total.
 */
import {
  accountStatus,
  balanceOn,
  balancesOf,
  editBalance,
  lastSettledSession,
  pointOn,
  removeBalance,
  removeWealthAccount,
  setBalance,
  parseAmount,
  wealthSeries,
  WEALTH_CURRENCIES,
  WEALTH_KINDS,
  type FxTable,
  type WealthAccount,
  type WealthBalance,
  type WealthBook,
  type WealthCurrency,
  type WealthKind,
  type WealthSeries,
} from '@screener/core';
import { openAttrShut, wireCollapse } from '../ui/collapse.js';
import type { AppContext } from '../context.js';
import { $, pct } from '../ui/dom.js';
import { t, getLang } from '../ui/i18n.js';
import { pageHero } from '../ui/pageHero.js';
import { formDialog } from '../ui/forms.js';
import { countChip, sectionHead } from '../ui/sectionHead.js';
import { cbButton, cbIcon, cbSegment, commandBar } from '../ui/commandBar.js';
import { drawLine, drawStacked } from '../ui/charts.js';
import { accounts, ensureAccountsLoaded, today, uuid } from '../portfolio/store.js';
import { isHydrated } from '../adapters/storage.js';
import { refreshStalePrices, updateAllAccounts } from './portfolioTab.js';
import { onAgentWrite } from '../portfolio/writes.js';
import { loadBook, loadFx, portfolioSide, refreshFx, saveBook, type PortfolioSide } from '../wealth/store.js';

let book: WealthBook = { accounts: [], balances: [] };
let fx: FxTable | null = null;
let view: 'total' | 'stack' = 'total';
let range: 'all' | '2y' | '1y' | '6m' = 'all';
/** Accounts whose chart and reading history are unfolded. Page-local: a list, not a setting. */
const openHistory = new Set<string>();
/** The allocation bar names this many holdings before the rest become one "Other (n)". */
const ALLOC_TOP = 8;
const OTHER_COLOR = '#8a8f9c';
const ALLOC_FOLD = 'wealth:alloc-all';
/** Draws account charts as they near the viewport; replaced on every render. */
let chartIo: IntersectionObserver | null = null;
/** A foreign account's own chart: in its own currency (what the bank statement says) or in EUR. */
const chartMode = new Map<string, 'native' | 'eur'>();
/**
 * How the accounts table is ordered. Remembered in `wealth_sort`, which syncs like the book:
 * it is a choice the user made, and the same page on the phone should open the same way.
 * The Portfolio row is not part of it — it stays first, as the row the others are measured against.
 */
type SortKey = 'name' | 'kind' | 'ccy' | 'eur' | 'asof' | 'change';
const SORT_STORE = 'wealth_sort';
const SORT_KEYS: readonly SortKey[] = ['name', 'kind', 'ccy', 'eur', 'asof', 'change'];
/** First click on a column: A→Z for words, biggest / newest first for numbers and dates. */
const FIRST_DIR: Record<SortKey, 1 | -1> = { name: 1, kind: 1, ccy: 1, eur: -1, asof: -1, change: -1 };
// By name until the user clicks a header — the user's choice of default.
let sort: { key: SortKey; dir: 1 | -1 } = { key: 'name', dir: 1 };
/**
 * The currency the page's totals are SHOWN in. The model stays in EUR; this is a view.
 *
 * Each date's EUR figure is multiplied by that same date's rate, never by today's: "what I was
 * worth in dong on 1 March" is the March value at the March EURVND, exactly as the EUR line
 * is built. So a VND view of the curve is not the EUR curve rescaled — it also moves with the
 * rate. With no rate for the chosen currency the page stays in EUR and says so, rather than
 * printing euro numbers next to a ₫. Remembered in `wealth_ccy` (synced, like `wealth_sort`).
 */
const DISPLAY_STORE = 'wealth_ccy';
let display: WealthCurrency = 'EUR';
/** What the current draw actually used: `display`, or EUR when its rate is missing. */
let shown: WealthCurrency = 'EUR';
/** The Portfolio row's key in `openHistory` — no wealth account can have it, ids are uuids. */
const PF_ROW = '__portfolio__';
let busy = false;
/**
 * The accounts table's filter: the search box and the account picker. Page-local, like
 * `openHistory`: "only these three today" is a glance, not a setting, so it is not synced and
 * a reload shows every row again. It hides table rows only; the KPIs and charts stay whole.
 */
let query = '';
/** Rows ticked in the picker; empty = no pick, every row. Account ids, and `PF_ROW`. */
const picked = new Set<string>();
let pickCloseWired = false;

/**
 * Colours. The portfolio has its own. Every other account takes the colour of its CURRENCY:
 * the user's request, because a colour per account said nothing, whereas one per currency
 * shows at a glance how much sits in dong or in dollars. Two accounts in the same currency
 * would then be one indistinguishable layer in the stacked chart, so each one after the first
 * gets a lighter or darker shade of that hue (`shade`). Six-digit hex throughout, because the
 * stacked chart appends an alpha byte.
 */
const PF_COLOR = '#18d89a';
const CCY_COLOR: Record<WealthCurrency, string> = { EUR: '#4f8cff', USD: '#f5a524', VND: '#f43f5e', CNY: '#a78bfa' };
/** Shade steps for the 2nd, 3rd… account in one currency: + toward white, − toward black. */
const SHADES = [0, 0.35, -0.3, 0.6, -0.5, 0.2, -0.15, 0.75];
/** The by-type allocation bars. Loans are red: theirs is the negative bar. */
const KIND_COLOR: Record<WealthKind, string> = {
  bank: '#4f8cff',
  savings: '#22d3ee',
  cash: '#a3e635',
  broker: '#f5a524',
  crypto: '#a78bfa',
  gold: '#facc15',
  property: '#fb923c',
  pension: '#2dd4bf',
  loan: '#f43f5e',
  other: '#94a3b8',
};
/** A reading older than this is flagged: the total is quietly using an old statement. */
const STALE_DAYS = 100;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** An amount in its own currency: euros and dollars to the cent, dong whole. */
function fmt(v: number, ccy: WealthCurrency, cents = true): string {
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (ccy === 'VND') return `${sign}${Math.round(a).toLocaleString('en-US')} ₫`;
  const body = a.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  return `${sign}${SYMBOL[ccy]}${body}`;
}
/** A page total, in the display currency. Named for what it was before the toggle existed. */
const eur = (v: number): string => fmt(v, shown, false);
/** Used by `fmt` and the account charts. Dong is written after the number, in `fmt`. */
const SYMBOL: Record<WealthCurrency, string> = { EUR: '€', USD: '$', VND: '₫', CNY: '¥' };
const tone = (v: number): string => (v >= 0 ? 'var(--up)' : 'var(--danger)');
/** An amount as it is put back in an input: grouped, all its decimals. See `saveReading`. */
const grouped = (v: number): string => v.toLocaleString('en-US', { maximumFractionDigits: 8 });
/** The currency as a chip in that currency's colour — the colour the dots and charts use. */
const ccyChip = (c: WealthCurrency): string => `<span class="w-ccy" style="--c:${CCY_COLOR[c]}">${c}</span>`;

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f)));
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
}

/**
 * An account's colour: its currency's hue, shaded by its place among the accounts in that
 * currency, in the order they were added. That order, not the table's sort, so a colour
 * does not change when a header is clicked.
 */
function colorOf(accountId: string): string {
  const a = book.accounts.find((x) => x.id === accountId);
  if (!a) return CCY_COLOR.EUR;
  const i = book.accounts.filter((x) => x.currency === a.currency).indexOf(a);
  return shade(CCY_COLOR[a.currency], SHADES[i % SHADES.length]!);
}

/** "● EUR ● VND …" for the currencies in the book, so the colours can be read. */
function currencyLegend(): string {
  const used = [...new Set(book.accounts.map((a) => a.currency))];
  if (!used.length) return '';
  return `<div style="display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:6px;font-size:11px" class="muted">${used
    .map((c) => `<span class="kpi-key"><span class="kpi-dot" style="background:${CCY_COLOR[c]}"></span>${c}</span>`)
    .join('')}</div>`;
}

// ── Render ─────────────────────────────────────────────────────────────────

let agentWired = false;

export async function renderWealth(ctx: AppContext): Promise<void> {
  const root = $('#tab-wealth');
  if (!root) return;
  if (!agentWired) {
    agentWired = true;
    // A balance recorded from chat. The module copy of the book is reloaded even when the
    // page is hidden: the page's own edits build on `book`, and a stale copy would save
    // right over the reading the user just approved.
    onAgentWrite(() => {
      void loadBook(ctx).then((b) => {
        book = b;
        const r = $('#tab-wealth');
        if (r && !r.classList.contains('hidden')) draw(ctx);
      });
    });
  }
  await ensureAccountsLoaded(ctx);
  const [b, f, done, srt, disp] = await Promise.all([
    loadBook(ctx),
    loadFx(ctx),
    ctx.storage.get<string>(AUTO_KEY),
    ctx.storage.get<{ key?: unknown; dir?: unknown }>(SORT_STORE),
    ctx.storage.get<string>(DISPLAY_STORE),
  ]);
  book = b;
  fx = f;
  autoDone = done ?? null;
  if (srt && SORT_KEYS.includes(srt.key as SortKey)) sort = { key: srt.key as SortKey, dir: srt.dir === 1 ? 1 : -1 };
  if ((WEALTH_CURRENCIES as readonly string[]).includes(disp ?? '')) display = disp as WealthCurrency;
  draw(ctx);
  // Draw from what is cached first, then catch up — the page never waits on Yahoo.
  void autoUpdate(ctx);
  watchForClose(ctx);
}

// ── The automatic update ───────────────────────────────────────────────────

/**
 * The session this device has brought Financial Status up to: "the portfolio and the rates
 * here include that US close". Under `wealth_fx:`, so device-local, for the reason
 * `pf_autoupdate` is: the bars it vouches for never leave this machine.
 */
const AUTO_KEY = 'wealth_fx:session';
let autoDone: string | null = null;
/** How often an open Wealth page checks whether a new close has settled. The check is one storage read. */
const WATCH_MS = 10 * 60_000;
let watching = false;

/**
 * Update by itself once per trading day — after the close has settled (`lastSettledSession`:
 * 17:00 New York, about 23:00 in Luxembourg), not at midnight, because a fetch made during
 * the session only gets today's live patch.
 *
 * The portfolio half is the Portfolio tab's own `refreshStalePrices`: only the accounts whose
 * bars are behind, once per session per device, and it never rejects. Then the rates. The
 * receipt is written only when the rates came back, so an offline evening is retried on the
 * next check instead of being counted as done.
 *
 * Balances are not fetched: a bank account is whatever was last typed. What moves daily is
 * the portfolio and the EUR value of the USD and VND accounts.
 */
async function autoUpdate(ctx: AppContext): Promise<void> {
  if (busy || !isHydrated()) return;
  const session = lastSettledSession();
  if (autoDone === session || (await ctx.storage.get<string>(AUTO_KEY)) === session) return;
  busy = true;
  const loadingMsg = t('wealth.auto.running').replace('{session}', session);
  const r0 = $('#tab-wealth');
  if (r0) setStatus(r0, `<span class="status-chip status-chip--loading"><span class="spinner"></span>${loadingMsg}</span>`);
  let failed: WealthCurrency[] = [];
  try {
    await refreshStalePrices(ctx);
    const side = portfolioSide(accounts);
    const start = wealthSeries({ book, portfolio: side.lines, fx: fx!, today: today() }).start ?? today();
    failed = await refreshFx(ctx, start, neededCurrencies());
    fx = await loadFx(ctx);
    if (!failed.length) {
      await ctx.storage.set(AUTO_KEY, session);
      autoDone = session;
    }
  } finally {
    busy = false;
  }
  const root = $('#tab-wealth');
  if (!root || root.classList.contains('hidden')) return; // the next render draws it
  draw(ctx);
  setStatus(
    $('#tab-wealth')!,
    failed.length
      ? errChip(t('wealth.warn.fxfetch').replace('{ccy}', failed.join(', ')))
      : okChip(`✓ ${t('wealth.auto.done').replace('{session}', session)}`),
  );
}

/**
 * Keep an open page current across the close: someone who leaves Financial Status on screen
 * through the evening sees it update when the session settles, without pressing anything.
 * Only while this page is the one shown and the window is visible — every other entry
 * goes through `renderWealth`, which checks on its own.
 */
function watchForClose(ctx: AppContext): void {
  if (watching) return;
  watching = true;
  const check = (): void => {
    const root = $('#tab-wealth');
    if (document.visibilityState !== 'visible' || !root || root.classList.contains('hidden')) return;
    void autoUpdate(ctx);
  };
  setInterval(check, WATCH_MS);
  document.addEventListener('visibilitychange', check);
}

/** The currencies the page needs a rate for: every account's, and USD for a dollar portfolio account. */
function neededCurrencies(): WealthCurrency[] {
  const need = new Set<WealthCurrency>(book.accounts.map((a) => a.currency));
  for (const a of accounts) if (a.account.currency === 'USD') need.add('USD');
  need.add(display);
  return [...need];
}

function draw(ctx: AppContext): void {
  const root = $('#tab-wealth')!;
  // A deleted account left ticked would hide every row behind an empty pick.
  for (const id of picked) if (id !== PF_ROW && !book.accounts.some((a) => a.id === id)) picked.delete(id);
  const side = portfolioSide(accounts);
  const series = inDisplay(wealthSeries({ book, portfolio: side.lines, fx: fx!, today: today() }));
  root.innerHTML = pageHtml(side, series);
  wire(ctx, root, series);
}

/** The series in the display currency, each point at its own date's rate. Sets `shown`. */
function inDisplay(s: WealthSeries): WealthSeries {
  shown = 'EUR';
  if (display === 'EUR' || !fx) return s;
  const rates = s.points.map((p) => fx!.perEur(display, p.date));
  if (rates.some((r) => r == null)) return s;
  shown = display;
  const by = (o: Record<string, number>, r: number): Record<string, number> =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * r]));
  return {
    ...s,
    points: s.points.map((p, i) => {
      const r = rates[i]!;
      return { date: p.date, portfolio: p.portfolio * r, byAccount: by(p.byAccount, r), others: p.others * r, total: p.total * r };
    }),
  };
}

/** An EUR amount on `date` in the display currency; null when that date has no rate. */
function fromEur(v: number, date: string): number | null {
  if (shown === 'EUR') return v;
  const r = fx?.perEur(shown, date);
  return r ? v * r : null;
}

/** `{ccy}` in a label becomes the currency actually shown. */
const tc = (key: string): string => t(key).replace(/\{ccy\}/g, shown);

function pageHtml(side: PortfolioSide, s: WealthSeries): string {
  const now = s.points[s.points.length - 1] ?? null;
  const first = s.points[0] ?? null;
  const yearAgo = now ? pointOn(s.points, shiftDays(now.date, -365)) : null;
  const change = (from: typeof first): string => {
    if (!now || !from || from === now || !from.total) return '—';
    const d = now.total - from.total;
    return `<span style="color:${tone(d)}">${eur(d)} (${pct((d / Math.abs(from.total)) * 100)})</span>`;
  };

  const warnings: string[] = [];
  if (s.missingFx.length) warnings.push(t('wealth.warn.fx').replace('{ccy}', s.missingFx.join(', ')));
  if (display !== shown) warnings.push(t('wealth.warn.display').replace(/\{ccy\}/g, display));
  if (side.missing.length) warnings.push(t('wealth.warn.pf').replace('{names}', esc(side.missing.join(', '))));
  const stale = book.accounts.filter((a) => (accountStatus(book, a.id, today()).ageDays ?? 0) > STALE_DAYS);
  if (stale.length) warnings.push(t('wealth.warn.stale').replace('{n}', String(STALE_DAYS)).replace('{names}', esc(stale.map((a) => a.name).join(', '))));

  return `
    ${pageHero({
      icon: '🏦', tone: 'var(--blue)',
      kicker: getLang() === 'vi' ? 'Tiền · Tổng tài sản' : 'Money · Net worth',
      title: t('wealth.title'), sub: tc('wealth.sub'),
    })}
    ${commandBar({
      actions: [
        cbButton({ id: 'w-add', label: t('wealth.add.btn'), icon: 'plus', primary: true }),
        cbButton({ id: 'w-record', label: t('wealth.record'), icon: 'ledger', disabled: !book.accounts.length, title: t('wealth.record.btn') }),
        cbButton({ id: 'w-update', label: t('wealth.update'), icon: 'refresh', title: t('wealth.auto.hint') }),
      ],
      controls: [
        cbSegment({
          label: t('wealth.display'),
          title: t('wealth.display.hint'),
          items: WEALTH_CURRENCIES.map((c) => ({ label: `${SYMBOL[c]} ${c}`, active: display === c, attrs: `data-w-disp="${c}"` })),
        }),
      ],
      meta: `<span id="w-status"></span><span class="cb-hint" title="${t('wealth.auto.hint')}">${cbIcon('clock', 13)}${
        autoDone ? t('wealth.auto.last').replace('{session}', autoDone) : t('wealth.auto.short')}</span>`,
    })}
    ${warnings.length ? `<div class="cb-warns">${warnings.map((w) => `<div class="cb-warn"><span aria-hidden="true">⚠</span><div>${w}</div></div>`).join('')}</div>` : ''}

    <div class="grid kpi-stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-bottom:14px">
      <div class="stat"><div class="k">${t('wealth.kpi.total')}</div><div class="v">${now ? eur(now.total) : '—'}</div></div>
      <div class="stat"><div class="k">${t('wealth.kpi.portfolio')}${side.asOf ? ` · ${side.asOf}` : ''}</div><div class="v">${now ? eur(now.portfolio) : '—'}</div></div>
      <div class="stat"><div class="k">${t('wealth.kpi.others')}</div><div class="v">${now ? eur(now.others) : '—'}</div></div>
      <div class="stat"><div class="k">${t('wealth.kpi.since')}${s.start ? ` ${s.start}` : ''}</div><div class="v">${change(first)}</div></div>
      <div class="stat"><div class="k">${t('wealth.kpi.year')}</div><div class="v">${yearAgo && yearAgo !== first ? change(yearAgo) : '—'}</div></div>
    </div>

    ${now ? allocationHtml(now) : ''}

    <div class="card" style="margin-bottom:14px;padding:8px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 6px 8px">
        <span class="section-title" style="margin:0">${tc('wealth.chart')}</span>
        <div class="toolbar seg" style="margin:0;gap:4px">
          <button class="range-btn${view === 'total' ? ' active' : ''}" data-w-view="total">${t('wealth.view.total')}</button>
          <button class="range-btn${view === 'stack' ? ' active' : ''}" data-w-view="stack">${t('wealth.view.stack')}</button>
        </div>
        <div class="toolbar seg" style="margin:0;gap:4px">
          ${(['all', '2y', '1y', '6m'] as const).map((r) => `<button class="range-btn${range === r ? ' active' : ''}" data-w-range="${r}">${r === 'all' ? 'All' : r.toUpperCase()}</button>`).join('')}
        </div>
      </div>
      <div id="wealth-chart" style="height:280px"></div>
    </div>

    ${sectionHead(t('wealth.accounts'), [countChip(book.accounts.length + 1, undefined, t('pf.unit.accounts'))], { sub: tc('wealth.accounts.sub') })}
    ${filterHtml(now)}
    <div class="card" style="overflow-x:auto;margin-bottom:14px">
      ${accountsTable(now, side)}
    </div>`;
}

function allocationHtml(now: NonNullable<WealthSeries['points'][number]>): string {
  const parts = [
    { name: t('nav.portfolio'), color: PF_COLOR, v: now.portfolio },
    ...book.accounts.map((a) => ({ name: a.name, color: colorOf(a.id), v: now.byAccount[a.id] ?? 0 })),
  ].filter((p) => p.v > 0);
  const gross = parts.reduce((x, p) => x + p.v, 0);
  if (gross <= 0) return '';
  parts.sort((a, b) => b.v - a.v);
  // 26 accounts made 26 slivers and a legend of 26 chips. The bar keeps the biggest few and
  // lumps the tail into one grey "Other (n)"; the full ranked list sits in a fold below it.
  const head = parts.length > ALLOC_TOP + 1 ? parts.slice(0, ALLOC_TOP) : parts;
  const tail = parts.slice(head.length);
  const segs = tail.length
    ? [...head, { name: t('wealth.alloc.other').replace('{n}', String(tail.length)), color: OTHER_COLOR, v: tail.reduce((x, p) => x + p.v, 0) }]
    : head;
  const pct = (v: number): string => `${((v / gross) * 100).toFixed(1)}%`;
  const bar = segs.map((p) => `<span title="${esc(p.name)} · ${eur(p.v)} · ${pct(p.v)}" style="flex:${p.v};background:${p.color}"></span>`).join('');
  const keys = segs
    .map((p) => `<span class="w-akey"><span class="kpi-dot" style="background:${p.color}"></span><span class="w-akey-n">${esc(p.name)}</span><span class="w-akey-p">${pct(p.v)}</span><span class="muted w-akey-v">${eur(p.v)}</span></span>`)
    .join('');
  const top = parts[0]!.v;
  const all = tail.length
    ? `<details class="w-alloc-all" data-collapse="${ALLOC_FOLD}"${openAttrShut(ALLOC_FOLD)}>
        <summary>${t('wealth.alloc.all').replace('{n}', String(parts.length))}</summary>
        <div class="w-alloc-list">${parts
          .map((p) => `<div class="w-gbar">
            <span class="w-gbar-l" title="${esc(p.name)}"><span class="kpi-dot" style="background:${p.color}"></span>${esc(p.name)}</span>
            <span class="w-gbar-t"><span style="width:${((p.v / top) * 100).toFixed(2)}%;background:${p.color}"></span></span>
            <span class="w-gbar-v">${eur(p.v)}</span>
            <span class="w-gbar-p">${pct(p.v)}</span>
          </div>`)
          .join('')}</div>
      </details>`
    : '';
  const pf = { label: t('nav.portfolio'), color: PF_COLOR, v: now.portfolio };
  const byCcy = groupBars(t('wealth.alloc.ccy'), [
    pf,
    ...book.accounts.map((a) => ({ label: a.currency, color: CCY_COLOR[a.currency], v: now.byAccount[a.id] ?? 0 })),
  ], t('wealth.alloc.pfnote'));
  const byKind = groupBars(t('wealth.alloc.kind'), [
    { ...pf, label: t('wealth.kind.portfolio') },
    ...book.accounts.map((a) => ({ label: t('wealth.kind.' + a.kind), color: KIND_COLOR[a.kind], v: now.byAccount[a.id] ?? 0 })),
  ]);
  return `<div class="card" style="margin-bottom:14px;padding:10px 12px">
      <div class="w-alloc">${bar}</div>
      <div class="w-akeys">${keys}</div>
      ${all}
      ${currencyLegend()}
    </div>
    ${byCcy || byKind ? `<div class="w-ggrid">${byCcy}${byKind}</div>` : ''}`;
}

/**
 * One horizontal bar per group (a currency, an account type), the accounts in it summed:
 * every bank account is one "Bank account" bar. Shares are of the gross assets, so the
 * positive bars add up to 100% and a loan shows as a red, negative share of them — netting
 * it in would let a big debt make every other share look larger than the money is.
 * The Portfolio is its own group in both: it is one figure here, not a list of holdings.
 */
function groupBars(title: string, rows: { label: string; color: string; v: number }[], foot = ''): string {
  const by = new Map<string, { label: string; color: string; v: number }>();
  for (const r of rows) {
    const g = by.get(r.label);
    if (g) g.v += r.v;
    else by.set(r.label, { ...r });
  }
  const groups = [...by.values()].filter((g) => Math.abs(g.v) > 1e-9).sort((a, b) => b.v - a.v);
  const gross = groups.reduce((x, g) => x + Math.max(g.v, 0), 0);
  if (gross <= 0) return '';
  const lines = groups
    .map((g) => {
      const p = (g.v / gross) * 100;
      const neg = g.v < 0;
      return `<div class="w-gbar">
          <span class="w-gbar-l" title="${esc(g.label)}"><span class="kpi-dot" style="background:${g.color}"></span>${esc(g.label)}</span>
          <span class="w-gbar-t"><span style="width:${Math.min(Math.abs(p), 100).toFixed(2)}%;background:${neg ? 'var(--danger)' : g.color}"></span></span>
          <span class="w-gbar-v"${neg ? ' style="color:var(--danger)"' : ''}>${eur(g.v)}</span>
          <span class="w-gbar-p"${neg ? ' style="color:var(--danger)"' : ''}>${p.toFixed(1)}%</span>
        </div>`;
    })
    .join('');
  return `<div class="card w-gcard">
      <div class="section-title" style="margin:0 0 8px">${title}</div>${lines}
      ${foot ? `<div class="muted" style="font-size:11px;margin-top:6px">${foot}</div>` : ''}
    </div>`;
}

/**
 * The bar above the accounts table: search, the account picker, expand / collapse all,
 * and the "3/7 shown · €…" line plus the picked-account chips that `applyFilter` fills.
 *
 * The picker is a popover, not a native multi-select (which is a cramped list box on a
 * desktop and a full-screen wheel on a phone). Accounts are grouped by currency, each with
 * its type and its value, and the list has its own search for when there are many.
 */
function filterHtml(now: WealthSeries['points'][number] | null): string {
  if (!book.accounts.length) return '';
  const opt = (id: string, name: string, color: string, sub: string, v: number | null): string =>
    `<label class="w-pick-opt" data-w-optname="${esc(name.toLocaleLowerCase())}">
        <input type="checkbox" data-w-pick="${id}"${picked.has(id) ? ' checked' : ''}>
        <span class="w-pick-box"></span>
        <span class="kpi-dot" style="background:${color}"></span>
        <span class="w-pick-name">${esc(name)}<span class="w-pick-sub">${sub}</span></span>
        <span class="w-pick-v">${v == null ? '' : eur(v)}</span>
      </label>`;
  const groups = WEALTH_CURRENCIES.map((c) => ({ c, list: book.accounts.filter((a) => a.currency === c).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.list.length)
    .map(
      (g) => `<div class="w-pick-group">${ccyChip(g.c)}<span class="muted">${g.list.length}</span></div>
        ${g.list.map((a) => opt(a.id, a.name, colorOf(a.id), t('wealth.kind.' + a.kind), now?.byAccount[a.id] ?? null)).join('')}`,
    )
    .join('');
  const allOpen = [PF_ROW, ...book.accounts.map((a) => a.id)].every((id) => openHistory.has(id));
  return `<div class="w-filter">
      <div class="w-search-wrap">
        <span class="w-search-ico" aria-hidden="true">⌕</span>
        <input class="field w-search" id="w-q" type="search" autocomplete="off" placeholder="${t('wealth.filter.search')}" value="${esc(query)}">
      </div>
      <details class="w-pick">
        <summary class="w-pick-btn"><span id="w-pick-label">${pickLabel()}</span><span class="w-pick-caret">▾</span></summary>
        <div class="w-pick-menu" role="dialog">
          <div class="w-pick-head">
            <strong>${t('wealth.filter.title')}</strong>
            <span class="muted" id="w-pick-count"></span>
          </div>
          <input class="field w-pick-find" id="w-pick-find" type="search" autocomplete="off" placeholder="${t('wealth.filter.find')}">
          <div class="w-pick-list">
            ${opt(PF_ROW, t('nav.portfolio'), PF_COLOR, t('wealth.kind.portfolio'), now?.portfolio ?? null)}
            ${groups}
          </div>
          <div class="w-pick-foot">
            <button class="btn-outline" data-w-pickclear>${t('wealth.filter.clear')}</button>
            <button class="btn" data-w-pickdone>${t('wealth.filter.done')}</button>
          </div>
        </div>
      </details>
      <button class="btn-outline w-fold-all" data-w-foldall="${allOpen ? 'close' : 'open'}">${allOpen ? `▴ ${t('wealth.collapseall')}` : `▾ ${t('wealth.expandall')}`}</button>
      <span class="muted" id="w-shown" style="font-size:12px"></span>
      <div class="w-chips" id="w-chips"></div>
    </div>`;
}

const pickLabel = (): string =>
  picked.size ? t('wealth.filter.some').replace('{n}', String(picked.size)) : t('wealth.filter.everything');

/** Whether a table row passes the picker and the search (name, note, type, currency). */
function rowVisible(id: string): boolean {
  if (picked.size && !picked.has(id)) return false;
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  const a = book.accounts.find((x) => x.id === id);
  const hay = id === PF_ROW ? `${t('nav.portfolio')} ${t('wealth.kind.portfolio')}` : a ? `${a.name} ${a.note ?? ''} ${t('wealth.kind.' + a.kind)} ${a.currency}` : '';
  return hay.toLocaleLowerCase().includes(q);
}

/**
 * Hide the filtered-out rows in place — no redraw, so the search box keeps its focus and
 * caret while typing — and say how many are shown and what they add up to.
 */
function applyFilter(root: HTMLElement, now: WealthSeries['points'][number] | null): void {
  const ids = [PF_ROW, ...book.accounts.map((a) => a.id)];
  let n = 0;
  let sum = 0;
  for (const id of ids) {
    const on = rowVisible(id);
    root.querySelectorAll<HTMLElement>(`[data-w-row="${id}"]`).forEach((r) => r.classList.toggle('hidden', !on));
    if (!on) continue;
    n++;
    sum += id === PF_ROW ? (now?.portfolio ?? 0) : (now?.byAccount[id] ?? 0);
  }
  const out = root.querySelector<HTMLElement>('#w-shown');
  if (out)
    out.innerHTML =
      picked.size || query.trim()
        ? t('wealth.filter.shown').replace('{n}', String(n)).replace('{m}', String(ids.length)).replace('{v}', now ? eur(sum) : '—')
        : '';
  const label = root.querySelector<HTMLElement>('#w-pick-label');
  if (label) label.textContent = pickLabel();
  root.querySelector('.w-pick')?.classList.toggle('on', picked.size > 0);
  const count = root.querySelector<HTMLElement>('#w-pick-count');
  if (count) count.textContent = picked.size ? `${picked.size}/${ids.length}` : t('wealth.filter.everything');
  // The picked accounts as removable chips, so what is hiding the rest stays in sight.
  const chips = root.querySelector<HTMLElement>('#w-chips');
  if (chips)
    chips.innerHTML = ids
      .filter((id) => picked.has(id))
      .map((id) => {
        const a = book.accounts.find((x) => x.id === id);
        const name = id === PF_ROW ? t('nav.portfolio') : (a?.name ?? '');
        return `<span class="w-chip"><span class="kpi-dot" style="background:${id === PF_ROW ? PF_COLOR : colorOf(id)}"></span>${esc(name)}<button data-w-unpick="${id}" title="${t('wealth.filter.remove')}">×</button></span>`;
      })
      .join('');
}

function accountsTable(now: WealthSeries['points'][number] | null, side: PortfolioSide): string {
  const total = now?.total ?? 0;
  const share = (v: number): string => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '—');
  const pfOpen = openHistory.has(PF_ROW);
  const pfRow = `<tr data-w-row="${PF_ROW}">
      <td><a href="#" class="link-ticker w-toggle" data-w-hist="${PF_ROW}" title="${t('wealth.act.chart')}"><span class="w-caret">${pfOpen ? '▾' : '▸'}</span><span class="kpi-dot" style="background:${PF_COLOR}"></span><strong>${t('nav.portfolio')}</strong></a>
        <a href="#" class="muted w-note" id="w-open-pf" style="display:block">${t('wealth.pf.open')} →</a></td>
      <td>${t('wealth.kind.portfolio')}</td><td>${ccyChip(shown)}</td>
      <td>${now ? eur(now.portfolio) : '—'}</td><td>${now ? eur(now.portfolio) : '—'}</td><td>${now ? share(now.portfolio) : '—'}</td>
      <td>${side.asOf ?? '—'}</td><td class="muted">${t('wealth.pf.auto')}</td>
      <td><button class="pf-icon-btn${pfOpen ? ' active' : ''}" data-w-hist="${PF_ROW}" title="${t('wealth.act.chart')}">${pfOpen ? '▴' : '▾'}</button></td>
    </tr>${pfOpen ? `<tr class="w-hist" data-w-row="${PF_ROW}"><td colspan="9"><div class="w-acct-chart" data-w-chart="${PF_ROW}"></div></td></tr>` : ''}`;
  const rows = sortedAccounts(now)
    .map((a) => accountRow(a, now))
    .join('');
  // Balance and Share order by the EUR value too: balances in different currencies do not compare.
  const head = (label: string, key: SortKey): string => {
    const on = sort.key === key;
    return `<th data-w-sort="${key}" title="${t('wealth.sort.hint')}" style="cursor:pointer;user-select:none;white-space:nowrap${on ? ';color:var(--accent)' : ''}">${label}${on ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>`;
  };
  return `<table class="w-acct-t">
      <thead><tr>${head(t('wealth.col.name'), 'name')}${head(t('wealth.col.kind'), 'kind')}${head(t('wealth.col.ccy'), 'ccy')}${head(t('wealth.col.balance'), 'eur')}${head(tc('wealth.col.eur'), 'eur')}${head(t('wealth.col.share'), 'eur')}${head(t('wealth.col.asof'), 'asof')}${head(t('wealth.col.change'), 'change')}<th></th></tr></thead>
      <tbody>${pfRow}${rows}</tbody>
    </table>
    ${book.accounts.length ? '' : `<p class="muted" style="margin:10px 4px">${t('wealth.empty')}</p>`}`;
}

/**
 * The accounts in the table's order. An account with nothing to sort by (no reading yet, one
 * reading so no change, a currency with no rate) goes to the bottom in BOTH directions:
 * flipping to ascending should bring up the smallest balances, not the empty rows.
 * Ties fall back to the name, so the order does not shuffle between two redraws.
 */
function sortedAccounts(now: WealthSeries['points'][number] | null): WealthAccount[] {
  const value = (a: WealthAccount): string | number | null => {
    switch (sort.key) {
      case 'name':
        return a.name.toLocaleLowerCase();
      case 'kind':
        return t('wealth.kind.' + a.kind).toLocaleLowerCase();
      case 'ccy':
        return a.currency;
      case 'eur':
        return accountStatus(book, a.id, today()).latest ? (now?.byAccount[a.id] ?? 0) : null;
      case 'asof':
        return accountStatus(book, a.id, today()).latest?.date ?? null;
      case 'change': {
        // In EUR at the reading's date, so a dong change does not outrank every euro one.
        const st = accountStatus(book, a.id, today());
        const r = st.latest ? fx?.perEur(a.currency, st.latest.date) : null;
        return st.change == null || !r ? null : st.change / r;
      }
    }
  };
  const byName = (a: WealthAccount, b: WealthAccount): number => a.name.localeCompare(b.name);
  return [...book.accounts]
    .map((a) => ({ a, v: value(a) }))
    .sort((x, y) => {
      if (x.v == null || y.v == null) return x.v == null && y.v == null ? byName(x.a, y.a) : x.v == null ? 1 : -1;
      const c = typeof x.v === 'number' && typeof y.v === 'number' ? x.v - y.v : String(x.v).localeCompare(String(y.v));
      return c ? c * sort.dir : byName(x.a, y.a);
    })
    .map((x) => x.a);
}

function accountRow(a: WealthAccount, now: WealthSeries['points'][number] | null): string {
  const st = accountStatus(book, a.id, today());
  const v = now?.byAccount[a.id] ?? 0;
  const stale = (st.ageDays ?? 0) > STALE_DAYS;
  const total = now?.total ?? 0;
  const age = st.latest ? `${st.latest.date} <span class="muted">(${st.ageDays}d)</span>` : `<span class="muted">${t('wealth.noreading')}</span>`;
  const open = openHistory.has(a.id);
  const count = book.balances.filter((b) => b.accountId === a.id).length;
  const row = `<tr data-w-row="${a.id}">
      <td><a href="#" class="link-ticker w-toggle" data-w-hist="${a.id}" title="${t('wealth.act.history')}"><span class="w-caret">${open ? '▾' : '▸'}</span><span class="kpi-dot" style="background:${colorOf(a.id)}"></span><strong>${esc(a.name)}</strong></a>${a.note ? `<div class="muted w-note">${esc(a.note)}</div>` : ''}</td>
      <td>${t('wealth.kind.' + a.kind)}</td><td>${ccyChip(a.currency)}</td>
      <td>${st.latest ? fmt(st.latest.amount, a.currency) : '—'}</td>
      <td>${st.latest ? eur(v) : '—'}</td>
      <td>${st.latest && total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '—'}</td>
      <td${stale ? ' style="color:var(--warn)"' : ''}>${age}</td>
      <td>${st.change == null ? '—' : `<span style="color:${tone(st.change)}">${st.change >= 0 ? '+' : ''}${fmt(st.change, a.currency)}</span>`}</td>
      <td style="white-space:nowrap">
        <button class="pf-icon-btn" data-w-bal="${a.id}" title="${t('wealth.act.balance')}">${cbIcon('plus', 14)}</button>
        <button class="pf-icon-btn w-hist-btn${open ? ' active' : ''}" data-w-hist="${a.id}" title="${t('wealth.act.history')}">${count} ${open ? '▴' : '▾'}</button>
        <button class="pf-icon-btn" data-w-edit="${a.id}" title="${t('wealth.act.edit')}">${cbIcon('edit', 14)}</button>
        <button class="pf-icon-btn pf-icon-danger" data-w-del="${a.id}" title="${t('wealth.act.delete')}">${cbIcon('trash', 14)}</button>
      </td>
    </tr>`;
  if (!open) return row;
  const mode = chartMode.get(a.id) ?? 'native';
  const modes =
    a.currency === shown
      ? ''
      : `<div class="toolbar seg" style="margin:0 0 4px;gap:4px">${(['native', 'eur'] as const)
          .map((m) => `<button class="range-btn${mode === m ? ' active' : ''}" data-w-cmode="${a.id}" data-mode="${m}">${m === 'native' ? a.currency : shown}</button>`)
          .join('')}</div>`;
  return `${row}<tr class="w-hist" data-w-row="${a.id}"><td colspan="9">
      ${modes}<div class="w-acct-chart" data-w-chart="${a.id}"></div>
      ${readingsHtml(a)}
    </td></tr>`;
}

/**
 * An account's readings, newest first, each one editable where it stands: date, amount and
 * note are inputs. Typing marks the row (amber edge) and lights its ✓; Enter or ✓ saves,
 * Esc throws the edit away. Not saved on blur — moving from the amount to the note would
 * otherwise redraw the page under the cursor. The top row adds a reading.
 *
 * "Change" is against the reading before it, in the account's own currency: what the
 * statement moved by, without the exchange rate in it.
 */
function readingsHtml(a: WealthAccount): string {
  const asc = balancesOf(book, a.id);
  const latest = asc[asc.length - 1];
  const body = asc
    .map((b, i) => ({ b, prev: asc[i - 1] }))
    .reverse()
    .map(({ b, prev }) => {
      const r = fx?.perEur(a.currency, b.date);
      const then = r ? fromEur(b.amount / r, b.date) : null;
      const d = prev ? b.amount - prev.amount : null;
      return `<tr data-w-reading="${b.id}" title="${t('wealth.act.editreading')}">
          <td><input type="date" class="field w-in w-in-date" data-f="date" value="${b.date}"></td>
          <td><input class="field w-in w-in-amt" data-f="amount" inputmode="decimal" value="${grouped(b.amount)}"></td>
          <td class="w-delta">${d == null ? '<span class="muted">—</span>' : `<span style="color:${tone(d)}">${d >= 0 ? '+' : ''}${fmt(d, a.currency)}</span>`}</td>
          <td class="muted w-delta">${then == null ? '—' : eur(then)}</td>
          <td><input class="field w-in w-in-note" data-f="note" value="${esc(b.note ?? '')}" placeholder="${t('wealth.col.note')}"></td>
          <td style="white-space:nowrap">
            <button class="pf-icon-btn w-save" data-w-balsave="${b.id}" title="${t('wealth.act.save')}" disabled>✓</button>
            <button class="pf-icon-btn pf-icon-danger" data-w-baldel="${b.id}" title="${t('wealth.act.delreading')}">${cbIcon('trash', 14)}</button>
          </td>
        </tr>`;
    })
    .join('');
  const add = `<tr class="w-add-row" data-w-newfor="${a.id}">
      <td><input type="date" class="field w-in w-in-date" data-f="date" value="${today()}"></td>
      <td><input class="field w-in w-in-amt" data-f="amount" inputmode="decimal" placeholder="${latest ? grouped(latest.amount) : '0'}"></td>
      <td colspan="2" class="muted" style="font-size:11px">${t('wealth.readings.new')}</td>
      <td><input class="field w-in w-in-note" data-f="note" placeholder="${t('wealth.col.note')}"></td>
      <td><button class="btn w-add-btn" data-w-baladd="${a.id}" title="${t('wealth.act.balance')}">＋</button></td>
    </tr>`;
  return `<div class="w-readings" style="--c:${colorOf(a.id)}">
      <div class="w-readings-h"><strong>${t('wealth.readings')}</strong> ${ccyChip(a.currency)} <span class="muted">${asc.length} · ${t('wealth.readings.hint')}</span></div>
      <table class="w-hist-t">
        <thead><tr><th>${t('wealth.col.date')}</th><th>${t('wealth.col.balance')}</th><th>${t('wealth.col.delta')}</th><th>${tc('wealth.col.eurthen')}</th><th>${t('wealth.col.note')}</th><th></th></tr></thead>
        <tbody>${add}${body || `<tr><td colspan="6" class="muted">${t('wealth.noreading')}</td></tr>`}</tbody>
      </table>
    </div>`;
}

// ── Chart ──────────────────────────────────────────────────────────────────

function shiftDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** The points inside the page's range buttons — the main chart and every account chart share them. */
function inRange(s: WealthSeries): WealthSeries['points'] {
  const cutoff =
    range === 'all' || !s.points.length
      ? ''
      : shiftDays(s.points[s.points.length - 1]!.date, -({ '2y': 730, '1y': 365, '6m': 182 } as const)[range]);
  return s.points.filter((p) => p.date >= cutoff);
}


/**
 * One account's own line, on the same dates as the main chart.
 *
 * In its own currency the line is the readings carried forward — flat between two
 * statements, which is what a statement says. In EUR it is the page's converted value, so
 * a VND account that never changed still moves with EURVND; the toggle is there to tell
 * those two apart.
 */
function drawAccountChart(el: HTMLElement, id: string, s: WealthSeries): void {
  const pts = inRange(s);
  const a = book.accounts.find((x) => x.id === id);
  const native = a && a.currency !== shown && (chartMode.get(id) ?? 'native') === 'native';
  const sorted = a ? balancesOf(book, a.id) : [];
  const line = pts.map((p) => ({
    time: p.date,
    value: id === PF_ROW ? p.portfolio : native ? (balanceOn(sorted, p.date)?.amount ?? 0) : (p.byAccount[id] ?? 0),
  }));
  if (!line.length) {
    el.innerHTML = `<div class="muted" style="padding:20px 0;text-align:center">${t('wealth.nodata')}</div>`;
    return;
  }
  try {
    drawLine(el, line, { money: true, currency: native ? SYMBOL[a!.currency] : SYMBOL[shown], height: 200, maxLine: true, minLine: true });
  } catch {
    el.innerHTML = `<div class="muted">${t('pf.unavailable')}</div>`;
  }
}

function drawChart(el: HTMLElement, s: WealthSeries): void {
  const pts = inRange(s);
  if (!pts.length) {
    el.innerHTML = `<div class="muted" style="display:flex;align-items:center;justify-content:center;height:100%">${t('wealth.nodata')}</div>`;
    return;
  }
  try {
    if (view === 'total') {
      drawLine(el, pts.map((p) => ({ time: p.date, value: p.total })), { money: true, currency: SYMBOL[shown], height: 280, maxLine: true, minLine: true });
      return;
    }
    // Debts at the bottom, so the stack's top edge is still the true total.
    const order = [...book.accounts].sort((a, b) => (pointOn(pts, pts[pts.length - 1]!.date)!.byAccount[a.id] ?? 0) - (pointOn(pts, pts[pts.length - 1]!.date)!.byAccount[b.id] ?? 0));
    const negatives = order.filter((a) => (pts[pts.length - 1]!.byAccount[a.id] ?? 0) < 0);
    const positives = order.filter((a) => !negatives.includes(a)).reverse();
    drawStacked(
      el,
      [
        ...negatives.map((a) => ({ color: colorOf(a.id), points: pts.map((p) => ({ time: p.date, value: p.byAccount[a.id] ?? 0 })) })),
        { color: PF_COLOR, points: pts.map((p) => ({ time: p.date, value: p.portfolio })) },
        ...positives.map((a) => ({ color: colorOf(a.id), points: pts.map((p) => ({ time: p.date, value: p.byAccount[a.id] ?? 0 })) })),
      ],
      { currency: SYMBOL[shown], height: 280 },
    );
  } catch {
    el.innerHTML = `<div class="muted">${t('pf.unavailable')}</div>`;
  }
}

// ── Actions ────────────────────────────────────────────────────────────────

function kindOptions(): { value: string; label: string }[] {
  return WEALTH_KINDS.map((k) => ({ value: k, label: t('wealth.kind.' + k) }));
}

function setStatus(root: HTMLElement, html: string): void {
  const s = root.querySelector<HTMLElement>('#w-status');
  if (s) s.innerHTML = html;
}
const okChip = (msg: string): string => `<span class="status-chip status-chip--ok">${msg}</span>`;
const errChip = (msg: string): string => `<span class="status-chip status-chip--muted" style="color:var(--danger)">${esc(msg)}</span>`;

/** Persist, then redraw. A refused save (still syncing) is reported, and the edit is dropped. */
async function commit(ctx: AppContext, next: WealthBook): Promise<void> {
  const root = $('#tab-wealth')!;
  try {
    await saveBook(ctx, next);
    book = next;
    draw(ctx);
  } catch (e) {
    setStatus(root, errChip((e as Error).message));
  }
}

function parseOrWarn(raw: string): number | null {
  const v = parseAmount(raw);
  if (v == null && raw.trim()) alert(t('wealth.badamount').replace('{v}', raw));
  return v;
}

async function addAccountFlow(ctx: AppContext, start: string | null): Promise<void> {
  const res = await formDialog(t('wealth.add'), [
    { key: 'name', label: t('wealth.col.name'), placeholder: 'Vietcombank' },
    { key: 'kind', label: t('wealth.col.kind'), type: 'select', value: 'bank', options: kindOptions() },
    { key: 'ccy', label: t('wealth.col.ccy'), type: 'select', value: 'EUR', options: WEALTH_CURRENCIES.map((c) => ({ value: c, label: c })) },
    { key: 'amount', label: t('wealth.f.opening'), raw: true, placeholder: '250,000,000' },
    // The portfolio's first day by default: a balance dated today would show up in the chart
    // as money that appeared today, when it is only the day the user started tracking it.
    { key: 'date', label: t('wealth.f.openingdate'), type: 'date', value: start ?? today() },
    { key: 'note', label: t('wealth.col.note') },
  ]);
  if (!res || !res.name) return;
  const acct: WealthAccount = {
    id: uuid(),
    name: res.name.trim(),
    kind: (res.kind as WealthKind) || 'other',
    currency: (res.ccy as WealthCurrency) || 'EUR',
    createdAt: today(),
    ...(res.note ? { note: res.note.trim() } : {}),
  };
  let next: WealthBook = { accounts: [...book.accounts, acct], balances: book.balances };
  const amount = parseOrWarn(res.amount ?? '');
  if (amount != null && res.date) next = setBalance(next, { accountId: acct.id, date: res.date, amount }, uuid);
  await commit(ctx, next);
}

async function balanceFlow(ctx: AppContext, a: WealthAccount): Promise<void> {
  const st = accountStatus(book, a.id, today());
  const res = await formDialog(`${esc(a.name)} · ${a.currency}`, [
    { key: 'date', label: t('wealth.col.date'), type: 'date', value: today() },
    { key: 'amount', label: t('wealth.col.balance'), raw: true, placeholder: st.latest ? String(st.latest.amount) : '' },
    { key: 'note', label: t('wealth.col.note') },
  ]);
  if (!res || !res.date) return;
  const amount = parseOrWarn(res.amount ?? '');
  if (amount == null) return;
  await commit(ctx, setBalance(book, { accountId: a.id, date: res.date, amount, note: res.note?.trim() || undefined }, uuid));
}

/** The monthly routine: one date, one field per account, blanks skipped. */
async function recordAllFlow(ctx: AppContext): Promise<void> {
  const res = await formDialog(t('wealth.record'), [
    { key: '__date', label: t('wealth.col.date'), type: 'date', value: today() },
    { key: '__info', label: '', type: 'info', value: `<span class="muted">${t('wealth.record.hint')}</span>` },
    ...book.accounts.map((a) => {
      const st = accountStatus(book, a.id, today());
      return {
        key: a.id,
        label: `${esc(a.name)} · ${a.currency}`,
        raw: true,
        placeholder: st.latest ? `${fmt(st.latest.amount, a.currency)} (${st.latest.date})` : '',
      };
    }),
  ]);
  if (!res || !res.__date) return;
  let next = book;
  let n = 0;
  for (const a of book.accounts) {
    const raw = res[a.id] ?? '';
    if (!raw.trim()) continue;
    const amount = parseOrWarn(raw);
    if (amount == null) return; // nothing saved: a half-applied month is harder to spot than a retry
    next = setBalance(next, { accountId: a.id, date: res.__date, amount }, uuid);
    n++;
  }
  if (n) await commit(ctx, next);
}

/**
 * Save an inline edit of a recorded reading: date, amount, note.
 *
 * The amount input holds the value grouped (`250,000,000`) so a dong balance can be read, and
 * is only re-parsed when the user changed it. `parseAmount` cannot tell 1.234 (a decimal) from
 * 1.234 (a thousand), so round-tripping an untouched value through it could turn a
 * €1.234 reading into €1,234.
 */
async function saveReading(ctx: AppContext, a: WealthAccount, b: WealthBalance, date: string, typed: string, note: string): Promise<void> {
  if (!date) return;
  const amount = typed === grouped(b.amount) ? b.amount : parseOrWarn(typed);
  if (amount == null) return;
  const clash = book.balances.find((x) => x.accountId === b.accountId && x.date === date && x.id !== b.id);
  if (clash && !confirm(t('wealth.confirm.replace').replace('{date}', date).replace('{v}', fmt(clash.amount, a.currency)))) return;
  try {
    await commit(ctx, editBalance(book, b.id, { date, amount, note: note || undefined }));
  } catch (e) {
    setStatus($('#tab-wealth')!, errChip((e as Error).message));
  }
}

/** The readings panel's top row: a new reading, asking first if that date already has one. */
async function addReading(ctx: AppContext, a: WealthAccount, date: string, raw: string, note: string): Promise<void> {
  if (!date || !raw.trim()) return;
  const amount = parseOrWarn(raw);
  if (amount == null) return;
  const clash = book.balances.find((x) => x.accountId === a.id && x.date === date);
  if (clash && !confirm(t('wealth.confirm.replace').replace('{date}', date).replace('{v}', fmt(clash.amount, a.currency)))) return;
  await commit(ctx, setBalance(book, { accountId: a.id, date, amount, note: note || undefined }, uuid));
}

async function editFlow(ctx: AppContext, a: WealthAccount): Promise<void> {
  const hasReadings = book.balances.some((b) => b.accountId === a.id);
  const res = await formDialog(t('wealth.act.edit'), [
    { key: 'name', label: t('wealth.col.name'), value: esc(a.name) },
    { key: 'kind', label: t('wealth.col.kind'), type: 'select', value: a.kind, options: kindOptions() },
    // Changing the currency under existing readings would reinterpret every one of them.
    hasReadings
      ? { key: 'ccyinfo', label: t('wealth.col.ccy'), type: 'info', value: `${a.currency} <span class="muted">— ${t('wealth.ccy.locked')}</span>` }
      : { key: 'ccy', label: t('wealth.col.ccy'), type: 'select', value: a.currency, options: WEALTH_CURRENCIES.map((c) => ({ value: c, label: c })) },
    { key: 'note', label: t('wealth.col.note'), value: esc(a.note ?? '') },
  ]);
  if (!res || !res.name) return;
  const edited: WealthAccount = {
    ...a,
    name: res.name.trim(),
    kind: (res.kind as WealthKind) || a.kind,
    currency: !hasReadings && res.ccy ? (res.ccy as WealthCurrency) : a.currency,
  };
  if (res.note?.trim()) edited.note = res.note.trim();
  else delete edited.note;
  await commit(ctx, { accounts: book.accounts.map((x) => (x.id === a.id ? edited : x)), balances: book.balances });
}

async function updateFlow(ctx: AppContext, root: HTMLElement, s: WealthSeries): Promise<void> {
  if (busy) return;
  if (!isHydrated()) {
    setStatus(root, errChip(t('wealth.syncing')));
    return;
  }
  busy = true;
  const btn = root.querySelector<HTMLButtonElement>('#w-update');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('cb-busy');
  }
  const loading = (msg: string): string => `<span class="status-chip status-chip--loading"><span class="spinner"></span>${msg}</span>`;
  const problems: string[] = [];
  try {
    try {
      await updateAllAccounts(ctx, (name, i, n) => setStatus(root, loading(`${t('pf.updating')} ${esc(name)} (${i}/${n})…`)));
    } catch (e) {
      problems.push(`${t('nav.portfolio')}: ${(e as Error).message}`);
    }
    setStatus(root, loading(t('wealth.updating.fx')));
    const failed = await refreshFx(ctx, s.start ?? today(), neededCurrencies());
    if (failed.length) problems.push(t('wealth.warn.fxfetch').replace('{ccy}', failed.join(', ')));
    fx = await loadFx(ctx);
    if (!problems.length) {
      // A full manual update covers this session: the automatic one need not repeat it.
      autoDone = lastSettledSession();
      await ctx.storage.set(AUTO_KEY, autoDone);
    }
  } finally {
    busy = false;
  }
  draw(ctx);
  const r = $('#tab-wealth')!;
  setStatus(r, problems.length ? errChip(problems.join(' · ')) : okChip(`✓ ${t('wealth.updated')}`));
}

function wire(ctx: AppContext, root: HTMLElement, s: WealthSeries): void {
  const chartEl = root.querySelector<HTMLElement>('#wealth-chart');
  // Lazily: "expand all" opens a chart per account (26 for one user), and drawing them all
  // at once on a phone is 26 canvases before the first one is even on screen. Each is drawn
  // as it scrolls near the viewport; re-observing redraws the visible ones straight away.
  chartIo?.disconnect();
  const io = (chartIo = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        io.unobserve(en.target);
        const c = en.target as HTMLElement;
        drawAccountChart(c, c.dataset.wChart!, s);
      }
    },
    { rootMargin: '240px 0px' },
  ));
  const drawAccountCharts = (): void =>
    root.querySelectorAll<HTMLElement>('[data-w-chart]').forEach((c) => {
      io.unobserve(c);
      io.observe(c);
    });
  if (chartEl) drawChart(chartEl, s);
  drawAccountCharts();
  wireCollapse(root);

  root.querySelector('#w-add')?.addEventListener('click', () => void addAccountFlow(ctx, s.start));
  root.querySelector('#w-record')?.addEventListener('click', () => void recordAllFlow(ctx));
  root.querySelector('#w-update')?.addEventListener('click', () => void updateFlow(ctx, root, s));
  root.querySelector('#w-open-pf')?.addEventListener('click', (e) => {
    e.preventDefault();
    location.hash = '#portfolio'; // main.ts's hashchange handler switches tabs
  });

  root.querySelectorAll<HTMLElement>('[data-w-view]').forEach((b) =>
    b.addEventListener('click', () => {
      view = b.dataset.wView as typeof view;
      root.querySelectorAll('[data-w-view]').forEach((x) => x.classList.toggle('active', x === b));
      if (chartEl) drawChart(chartEl, s);
    }),
  );
  root.querySelectorAll<HTMLElement>('[data-w-range]').forEach((b) =>
    b.addEventListener('click', () => {
      range = b.dataset.wRange as typeof range;
      root.querySelectorAll('[data-w-range]').forEach((x) => x.classList.toggle('active', x === b));
      if (chartEl) drawChart(chartEl, s);
      drawAccountCharts();
    }),
  );

  const byId = (id: string | undefined): WealthAccount | undefined => book.accounts.find((a) => a.id === id);
  root.querySelectorAll<HTMLElement>('[data-w-bal]').forEach((b) =>
    b.addEventListener('click', () => {
      const a = byId(b.dataset.wBal);
      if (a) void balanceFlow(ctx, a);
    }),
  );
  root.querySelectorAll<HTMLElement>('[data-w-cmode]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.wCmode!;
      chartMode.set(id, b.dataset.mode as 'native' | 'eur');
      root.querySelectorAll<HTMLElement>(`[data-w-cmode="${id}"]`).forEach((x) => x.classList.toggle('active', x === b));
      const c = root.querySelector<HTMLElement>(`[data-w-chart="${id}"]`);
      if (c) drawAccountChart(c, id, s);
    }),
  );
  root.querySelectorAll<HTMLElement>('[data-w-hist]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      const id = b.dataset.wHist!;
      if (openHistory.has(id)) openHistory.delete(id);
      else openHistory.add(id);
      draw(ctx);
    }),
  );
  root.querySelectorAll<HTMLElement>('[data-w-edit]').forEach((b) =>
    b.addEventListener('click', () => {
      const a = byId(b.dataset.wEdit);
      if (a) void editFlow(ctx, a);
    }),
  );
  root.querySelectorAll<HTMLElement>('[data-w-del]').forEach((b) =>
    b.addEventListener('click', () => {
      const a = byId(b.dataset.wDel);
      if (!a) return;
      const n = book.balances.filter((x) => x.accountId === a.id).length;
      if (!confirm(t('wealth.confirm.delete').replace('{name}', a.name).replace('{n}', String(n)))) return;
      openHistory.delete(a.id);
      void commit(ctx, removeWealthAccount(book, a.id));
    }),
  );
  root.querySelectorAll<HTMLElement>('[data-w-disp]').forEach((btn) =>
    btn.addEventListener('click', () => {
      display = btn.dataset.wDisp as WealthCurrency;
      void ctx.storage.set(DISPLAY_STORE, display).catch(() => {});
      draw(ctx);
      // A currency no account uses has never been fetched: get its rate now, then redraw.
      if (display !== shown && !busy) {
        busy = true;
        void refreshFx(ctx, s.start ?? today(), [display])
          .then(() => loadFx(ctx))
          .then((f) => {
            fx = f;
          })
          .finally(() => {
            busy = false;
            draw(ctx);
          });
      }
    }),
  );
  root.querySelectorAll<HTMLElement>('[data-w-sort]').forEach((th) =>
    th.addEventListener('click', () => {
      const key = th.dataset.wSort as SortKey;
      sort = sort.key === key ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: FIRST_DIR[key] };
      void ctx.storage.set(SORT_STORE, sort).catch(() => {});
      draw(ctx);
    }),
  );
  const field = (tr: HTMLElement, f: string): string => tr.querySelector<HTMLInputElement>(`[data-f="${f}"]`)?.value.trim() ?? '';
  root.querySelectorAll<HTMLElement>('tr[data-w-reading]').forEach((tr) => {
    const save = tr.querySelector<HTMLButtonElement>('[data-w-balsave]');
    const go = (): void => {
      const row = book.balances.find((x) => x.id === tr.dataset.wReading);
      const a = row && byId(row.accountId);
      if (row && a) void saveReading(ctx, a, row, field(tr, 'date'), field(tr, 'amount'), field(tr, 'note'));
    };
    tr.querySelectorAll<HTMLInputElement>('input').forEach((inp) => {
      inp.addEventListener('input', () => {
        tr.classList.add('w-dirty');
        if (save) save.disabled = false;
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          go();
        } else if (e.key === 'Escape') draw(ctx);
      });
    });
    save?.addEventListener('click', go);
  });
  root.querySelectorAll<HTMLElement>('tr[data-w-newfor]').forEach((tr) => {
    const a = byId(tr.dataset.wNewfor);
    if (!a) return;
    const go = (): void => void addReading(ctx, a, field(tr, 'date'), field(tr, 'amount'), field(tr, 'note'));
    tr.querySelector('[data-w-baladd]')?.addEventListener('click', go);
    tr.querySelectorAll<HTMLInputElement>('input').forEach((inp) =>
      inp.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        go();
      }),
    );
  });

  const now = s.points[s.points.length - 1] ?? null;
  applyFilter(root, now);
  root.querySelector<HTMLInputElement>('#w-q')?.addEventListener('input', (e) => {
    query = (e.target as HTMLInputElement).value;
    applyFilter(root, now);
  });
  root.querySelectorAll<HTMLInputElement>('[data-w-pick]').forEach((cb) =>
    cb.addEventListener('change', () => {
      if (cb.checked) picked.add(cb.dataset.wPick!);
      else picked.delete(cb.dataset.wPick!);
      applyFilter(root, now);
    }),
  );
  const unpickAll = (): void => {
    picked.clear();
    root.querySelectorAll<HTMLInputElement>('[data-w-pick]').forEach((cb) => (cb.checked = false));
    applyFilter(root, now);
  };
  root.querySelector('[data-w-pickclear]')?.addEventListener('click', unpickAll);
  root.querySelector('[data-w-pickdone]')?.addEventListener('click', () => {
    const d = root.querySelector<HTMLDetailsElement>('.w-pick');
    if (d) d.open = false;
  });
  root.querySelector<HTMLInputElement>('#w-pick-find')?.addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.trim().toLocaleLowerCase();
    root.querySelectorAll<HTMLElement>('[data-w-optname]').forEach((o) => o.classList.toggle('hidden', !!q && !o.dataset.wOptname!.includes(q)));
  });
  // Chips are rebuilt by applyFilter, so one delegated listener instead of one per chip.
  root.querySelector('#w-chips')?.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-w-unpick]')?.dataset.wUnpick;
    if (!id) return;
    picked.delete(id);
    const cb = root.querySelector<HTMLInputElement>(`[data-w-pick="${id}"]`);
    if (cb) cb.checked = false;
    applyFilter(root, now);
  });
  root.querySelector<HTMLElement>('[data-w-foldall]')?.addEventListener('click', (e) => {
    const open = (e.currentTarget as HTMLElement).dataset.wFoldall === 'open';
    openHistory.clear();
    if (open) for (const id of [PF_ROW, ...book.accounts.map((a) => a.id)]) openHistory.add(id);
    draw(ctx);
  });
  if (!pickCloseWired) {
    pickCloseWired = true;
    // The picker is a <details>: close it on a click anywhere outside, as a dropdown does.
    document.addEventListener('click', (e) => {
      const d = document.querySelector<HTMLDetailsElement>('#tab-wealth .w-pick[open]');
      if (d && !d.contains(e.target as Node)) d.open = false;
    });
  }
  root.querySelectorAll<HTMLElement>('[data-w-baldel]').forEach((b) =>
    b.addEventListener('click', () => {
      const row = book.balances.find((x) => x.id === b.dataset.wBaldel);
      if (!row || !confirm(t('wealth.confirm.delreading').replace('{date}', row.date))) return;
      void commit(ctx, removeBalance(book, row.id));
    }),
  );
}
