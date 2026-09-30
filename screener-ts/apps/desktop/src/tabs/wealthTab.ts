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
  type WealthBook,
  type WealthCurrency,
  type WealthKind,
  type WealthSeries,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { $, pct } from '../ui/dom.js';
import { t } from '../ui/i18n.js';
import { formDialog } from '../ui/forms.js';
import { countChip, sectionHead } from '../ui/sectionHead.js';
import { drawLine, drawStacked } from '../ui/charts.js';
import { accounts, ensureAccountsLoaded, today, uuid } from '../portfolio/store.js';
import { isHydrated } from '../adapters/storage.js';
import { refreshStalePrices, updateAllAccounts } from './portfolioTab.js';
import { loadBook, loadFx, portfolioSide, refreshFx, saveBook, type PortfolioSide } from '../wealth/store.js';

let book: WealthBook = { accounts: [], balances: [] };
let fx: FxTable | null = null;
let view: 'total' | 'stack' = 'total';
let range: 'all' | '2y' | '1y' | '6m' = 'all';
/** Accounts whose chart and reading history are unfolded. Page-local: a list, not a setting. */
const openHistory = new Set<string>();
/** A foreign account's own chart: in its own currency (what the bank statement says) or in EUR. */
const chartMode = new Map<string, 'native' | 'eur'>();
/** The Portfolio row's key in `openHistory` — no wealth account can have it, ids are uuids. */
const PF_ROW = '__portfolio__';
let busy = false;

/** The portfolio's own layer colour, then one per account. Six-digit hex: the stack adds alpha. */
const PF_COLOR = '#18d89a';
const PALETTE = ['#4f8cff', '#f5a524', '#a78bfa', '#f472b6', '#22d3ee', '#fb7185', '#facc15', '#94a3b8', '#c084fc', '#34d399'];
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
  return `${sign}${ccy === 'EUR' ? '€' : '$'}${body}`;
}
const eur = (v: number): string => fmt(v, 'EUR', false);
const tone = (v: number): string => (v >= 0 ? 'var(--accent)' : 'var(--danger)');

function colorOf(accountId: string): string {
  const i = book.accounts.findIndex((a) => a.id === accountId);
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length]!;
}

// ── Render ─────────────────────────────────────────────────────────────────

export async function renderWealth(ctx: AppContext): Promise<void> {
  const root = $('#tab-wealth');
  if (!root) return;
  await ensureAccountsLoaded(ctx);
  const [b, f, done] = await Promise.all([loadBook(ctx), loadFx(ctx), ctx.storage.get<string>(AUTO_KEY)]);
  book = b;
  fx = f;
  autoDone = done ?? null;
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
  return [...need];
}

function draw(ctx: AppContext): void {
  const root = $('#tab-wealth')!;
  const side = portfolioSide(accounts);
  const series = wealthSeries({ book, portfolio: side.lines, fx: fx!, today: today() });
  root.innerHTML = pageHtml(side, series);
  wire(ctx, root, series);
}

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
  if (side.missing.length) warnings.push(t('wealth.warn.pf').replace('{names}', esc(side.missing.join(', '))));
  const stale = book.accounts.filter((a) => (accountStatus(book, a.id, today()).ageDays ?? 0) > STALE_DAYS);
  if (stale.length) warnings.push(t('wealth.warn.stale').replace('{n}', String(STALE_DAYS)).replace('{names}', esc(stale.map((a) => a.name).join(', '))));

  return `
    <h1>${t('wealth.title')}</h1>
    <p class="subtitle">${t('wealth.sub')}</p>
    <div class="toolbar" style="flex-wrap:wrap;gap:8px;margin-bottom:10px">
      <button class="btn" id="w-add">+ ${t('wealth.add')}</button>
      <button class="btn-outline" id="w-record"${book.accounts.length ? '' : ' disabled'}>${t('wealth.record')}</button>
      <button class="btn-outline" id="w-update">${t('wealth.update')}</button>
      <span id="w-status"></span>
      <span class="muted" style="font-size:12px">${t('wealth.auto.hint')}${autoDone ? ` · ${t('wealth.auto.last').replace('{session}', autoDone)}` : ''}</span>
    </div>
    ${warnings.map((w) => `<div class="status-chip status-chip--muted" style="display:block;white-space:normal;margin-bottom:8px;color:var(--warn)">${w}</div>`).join('')}

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
        <span class="section-title" style="margin:0">${t('wealth.chart')}</span>
        <div class="toolbar" style="margin:0;gap:4px">
          <button class="range-btn${view === 'total' ? ' active' : ''}" data-w-view="total">${t('wealth.view.total')}</button>
          <button class="range-btn${view === 'stack' ? ' active' : ''}" data-w-view="stack">${t('wealth.view.stack')}</button>
        </div>
        <div class="toolbar" style="margin:0;gap:4px">
          ${(['all', '2y', '1y', '6m'] as const).map((r) => `<button class="range-btn${range === r ? ' active' : ''}" data-w-range="${r}">${r === 'all' ? 'All' : r.toUpperCase()}</button>`).join('')}
        </div>
      </div>
      <div id="wealth-chart" style="height:280px"></div>
    </div>

    ${sectionHead(t('wealth.accounts'), [countChip(book.accounts.length + 1, undefined, t('pf.unit.accounts'))], { sub: t('wealth.accounts.sub') })}
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
  const bar = parts.map((p) => `<span title="${esc(p.name)} · ${eur(p.v)}" style="flex:${p.v};background:${p.color}"></span>`).join('');
  const keys = parts
    .sort((a, b) => b.v - a.v)
    .map((p) => `<span class="kpi-key"><span class="kpi-dot" style="background:${p.color}"></span>${esc(p.name)} <span class="muted">${((p.v / gross) * 100).toFixed(1)}%</span></span>`)
    .join('');
  return `<div class="card" style="margin-bottom:14px;padding:10px 12px">
      <div class="w-alloc">${bar}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px;font-size:12px">${keys}</div>
    </div>`;
}

function accountsTable(now: WealthSeries['points'][number] | null, side: PortfolioSide): string {
  const total = now?.total ?? 0;
  const share = (v: number): string => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '—');
  const pfRow = `<tr>
      <td><span class="kpi-dot" style="background:${PF_COLOR};margin-right:6px"></span><a href="#" class="link-ticker" id="w-open-pf"><strong>${t('nav.portfolio')}</strong></a></td>
      <td>${t('wealth.kind.portfolio')}</td><td>EUR</td>
      <td>${now ? eur(now.portfolio) : '—'}</td><td>${now ? eur(now.portfolio) : '—'}</td><td>${now ? share(now.portfolio) : '—'}</td>
      <td>${side.asOf ?? '—'}</td><td class="muted">${t('wealth.pf.auto')}</td>
      <td><button class="pf-icon-btn" data-w-hist="${PF_ROW}" title="${t('wealth.act.chart')}">${openHistory.has(PF_ROW) ? '▴' : '▾'}</button></td>
    </tr>${openHistory.has(PF_ROW) ? `<tr class="w-hist"><td colspan="9"><div class="w-acct-chart" data-w-chart="${PF_ROW}"></div></td></tr>` : ''}`;
  const rows = [...book.accounts]
    .sort((a, b) => (now?.byAccount[b.id] ?? 0) - (now?.byAccount[a.id] ?? 0))
    .map((a) => accountRow(a, now))
    .join('');
  return `<table>
      <thead><tr><th>${t('wealth.col.name')}</th><th>${t('wealth.col.kind')}</th><th>${t('wealth.col.ccy')}</th><th>${t('wealth.col.balance')}</th><th>${t('wealth.col.eur')}</th><th>${t('wealth.col.share')}</th><th>${t('wealth.col.asof')}</th><th>${t('wealth.col.change')}</th><th></th></tr></thead>
      <tbody>${pfRow}${rows}</tbody>
    </table>
    ${book.accounts.length ? '' : `<p class="muted" style="margin:10px 4px">${t('wealth.empty')}</p>`}`;
}

function accountRow(a: WealthAccount, now: WealthSeries['points'][number] | null): string {
  const st = accountStatus(book, a.id, today());
  const v = now?.byAccount[a.id] ?? 0;
  const stale = (st.ageDays ?? 0) > STALE_DAYS;
  const total = now?.total ?? 0;
  const age = st.latest ? `${st.latest.date} <span class="muted">(${st.ageDays}d)</span>` : `<span class="muted">${t('wealth.noreading')}</span>`;
  const row = `<tr>
      <td><span class="kpi-dot" style="background:${colorOf(a.id)};margin-right:6px"></span><a href="#" class="link-ticker" data-w-hist="${a.id}"><strong>${esc(a.name)}</strong></a>${a.note ? `<div class="muted" style="font-size:11px">${esc(a.note)}</div>` : ''}</td>
      <td>${t('wealth.kind.' + a.kind)}</td><td>${a.currency}</td>
      <td>${st.latest ? fmt(st.latest.amount, a.currency) : '—'}</td>
      <td>${st.latest ? eur(v) : '—'}</td>
      <td>${st.latest && total > 0 ? `${((v / total) * 100).toFixed(1)}%` : '—'}</td>
      <td${stale ? ' style="color:var(--warn)"' : ''}>${age}</td>
      <td>${st.change == null ? '—' : `<span style="color:${tone(st.change)}">${st.change >= 0 ? '+' : ''}${fmt(st.change, a.currency)}</span>`}</td>
      <td style="white-space:nowrap">
        <button class="pf-icon-btn" data-w-bal="${a.id}" title="${t('wealth.act.balance')}">＋</button>
        <button class="pf-icon-btn" data-w-hist="${a.id}" title="${t('wealth.act.history')}">${openHistory.has(a.id) ? '▴' : '▾'}</button>
        <button class="pf-icon-btn" data-w-edit="${a.id}" title="${t('wealth.act.edit')}">✎</button>
        <button class="pf-icon-btn" data-w-del="${a.id}" title="${t('wealth.act.delete')}">✕</button>
      </td>
    </tr>`;
  if (!openHistory.has(a.id)) return row;
  const hist = balancesOf(book, a.id).reverse();
  const inner = hist.length
    ? hist
        .map((b) => {
          const r = fx?.perEur(a.currency, b.date);
          return `<tr><td>${b.date}</td><td>${fmt(b.amount, a.currency)}</td><td class="muted">${r ? eur(b.amount / r) : '—'}</td><td class="muted">${b.note ? esc(b.note) : ''}</td><td><button class="pf-icon-btn" data-w-baldel="${b.id}" title="${t('wealth.act.delreading')}">✕</button></td></tr>`;
        })
        .join('')
    : `<tr><td colspan="5" class="muted">${t('wealth.noreading')}</td></tr>`;
  const mode = chartMode.get(a.id) ?? 'native';
  const modes =
    a.currency === 'EUR'
      ? ''
      : `<div class="toolbar" style="margin:0 0 4px;gap:4px">${(['native', 'eur'] as const)
          .map((m) => `<button class="range-btn${mode === m ? ' active' : ''}" data-w-cmode="${a.id}" data-mode="${m}">${m === 'native' ? a.currency : 'EUR'}</button>`)
          .join('')}</div>`;
  return `${row}<tr class="w-hist"><td colspan="9">
      ${modes}<div class="w-acct-chart" data-w-chart="${a.id}"></div>
      <table class="w-hist-t"><thead><tr><th>${t('wealth.col.date')}</th><th>${t('wealth.col.balance')}</th><th>${t('wealth.col.eurthen')}</th><th>${t('wealth.col.note')}</th><th></th></tr></thead><tbody>${inner}</tbody></table>
    </td></tr>`;
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

const SYMBOL: Record<WealthCurrency, string> = { EUR: '€', USD: '$', VND: '₫' };

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
  const native = a && a.currency !== 'EUR' && (chartMode.get(id) ?? 'native') === 'native';
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
    drawLine(el, line, { money: true, currency: native ? SYMBOL[a!.currency] : '€', height: 200, maxLine: true, minLine: true });
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
      drawLine(el, pts.map((p) => ({ time: p.date, value: p.total })), { money: true, currency: '€', height: 280, maxLine: true, minLine: true });
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
      { currency: '€', height: 280 },
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
  if (btn) btn.disabled = true;
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
  const drawAccountCharts = (): void =>
    root.querySelectorAll<HTMLElement>('[data-w-chart]').forEach((c) => drawAccountChart(c, c.dataset.wChart!, s));
  if (chartEl) drawChart(chartEl, s);
  drawAccountCharts();

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
  root.querySelectorAll<HTMLElement>('[data-w-baldel]').forEach((b) =>
    b.addEventListener('click', () => {
      const row = book.balances.find((x) => x.id === b.dataset.wBaldel);
      if (!row || !confirm(t('wealth.confirm.delreading').replace('{date}', row.date))) return;
      void commit(ctx, removeBalance(book, row.id));
    }),
  );
}
