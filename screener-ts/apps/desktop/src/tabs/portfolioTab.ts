import {
  createAccount,
  buy,
  sell,
  setStop,
  deleteSell,
  deleteLot,
  createOrder,
  runUpdate,
  buildPositions,
  computeAccountMetrics,
  compareAccounts,
  computeCash,
  computeEquity,
  computePositionsValue,
  fetchMany,
  SECTOR_STOCKS,
  type AccountState,
  type PriceMap,
  type IdFactory,
  type Bar,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { $, num, money, pct } from '../ui/dom.js';
import { drawLine, drawCandles } from '../ui/charts.js';
import { formDialog } from '../ui/forms.js';
import { attachCombobox } from '../ui/combobox.js';
import { openStock } from '../ui/stockModal.js';
import { infoIcon, attachTooltips } from '../ui/tooltip.js';
import { t } from '../ui/i18n.js';

function noDataHtml(msg?: string): string {
  const text = msg ?? t('pf.nodata');
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:160px;gap:10px;user-select:none">
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" opacity=".25">
      <rect x="6" y="10" width="28" height="22" rx="3" stroke="currentColor" stroke-width="1.8"/>
      <path d="M6 16h28" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2"/>
      <path d="M13 26l4-5 4 4 4-6 4 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span class="muted" style="font-size:12px;text-align:center;line-height:1.5;max-width:200px">${text}</span>
  </div>`;
}

const CURATED = [...new Set(Object.values(SECTOR_STOCKS).flat())].sort();

/** Ticker list for the pickers: held tickers first, then the curated universe. */
function tickerList(): string[] {
  const held = [...new Set(active().lots.filter((l) => l.remainingShares > 0).map((l) => l.ticker))];
  return [...new Set([...held, ...CURATED])];
}

/**
 * Show the latest close beside a price input as the user picks a ticker, and
 * offer a one-click "use" to copy it into the price/threshold field.
 */
function wirePriceHint(
  ctx: AppContext,
  tickerSel: string,
  hintSel: string,
  priceSel: string,
  dateSel?: string,
  ccySel?: string,
): void {
  const tickerEl = $(tickerSel) as HTMLInputElement | null;
  const hintEl = $(hintSel);
  const priceEl = $(priceSel) as HTMLInputElement | null;
  if (!tickerEl || !hintEl || !priceEl) return;
  const dateEl = dateSel ? ($(dateSel) as HTMLInputElement | null) : null;
  const ccyEl = ccySel ? ($(ccySel) as HTMLSelectElement | null) : null;

  const todayStr = new Date().toISOString().slice(0, 10);

  // Holds the last fetched raw USD close and its date so we can re-convert
  // instantly when the currency selector changes without re-fetching.
  let lastRawClose: number | null = null;
  let lastBarDate: string | null = null;

  /** Convert raw USD close to the currently selected currency. */
  function convertClose(rawUsd: number, barDate: string): number {
    const ccy = ccyEl?.value ?? 'USD';
    if (ccy === 'EUR') {
      const fx = eurUsdForDate(barDate);
      return fx > 0 ? rawUsd / fx : rawUsd;
    }
    return rawUsd;
  }

  function refreshHint() {
    if (lastRawClose == null || lastBarDate == null || !hintEl || !priceEl) return;
    const converted = convertClose(lastRawClose, lastBarDate);
    const ccy = ccyEl?.value ?? 'USD';
    const sym = ccy === 'EUR' ? '€' : '$';
    const label = (dateEl?.value && dateEl.value < todayStr) ? 'close' : 'latest close';
    hintEl.innerHTML = `${label} <b>${sym}${num(converted)}</b> (${lastBarDate}) · <a href="#" data-use>use</a>`;
    hintEl.querySelector('[data-use]')!.addEventListener('click', (e) => {
      e.preventDefault();
      priceEl.value = String(num(converted));
      // Programmatic .value assignment doesn't fire input/change events — dispatch manually
      // so listeners like updateRiskHint pick up the new value.
      priceEl.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  let token = 0;
  const fetchHint = async () => {
    const sym = tickerEl.value.trim().toUpperCase();
    if (!sym) { hintEl.innerHTML = ''; return; }
    const wantDate = dateEl?.value && dateEl.value < todayStr ? dateEl.value : null;
    const mine = ++token;
    hintEl.innerHTML = `<span class="spinner"></span> ${wantDate ? `close on ${wantDate}…` : 'latest close…'}`;
    const ohlcv = await ctx.data.getOHLCV(sym, wantDate ? '5y' : '1mo').catch(() => null);
    if (mine !== token) return;
    if (!ohlcv || !ohlcv.bars.length) { hintEl.textContent = 'no price data'; return; }
    const bar = wantDate
      ? [...ohlcv.bars].reverse().find((b) => b.date <= wantDate) ?? null
      : ohlcv.bars[ohlcv.bars.length - 1]!;
    if (!bar) { hintEl.textContent = `no price on/before ${wantDate}`; return; }
    lastRawClose = bar.close;
    lastBarDate = bar.date;
    refreshHint();
  };

  tickerEl.addEventListener('change', () => void fetchHint());
  tickerEl.addEventListener('blur', () => void fetchHint());
  dateEl?.addEventListener('change', () => void fetchHint());
  // When currency selector changes, re-convert the already-fetched close instantly.
  ccyEl?.addEventListener('change', refreshHint);
}

const ACCT_KEY = 'accounts';
const OVERVIEW_ID = '__overview__';
const uuid: IdFactory = () =>
  (globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2));
const today = () => new Date().toISOString().slice(0, 10);

let accounts: AccountState[] = [];
let activeId: string = OVERVIEW_ID;

// ---------------------------------------------------------------------------
// EUR/USD display toggle
// ---------------------------------------------------------------------------

/** Rate at which 1 EUR = N USD (e.g. 1.08). Latest fetched rate. */
let latestEurUsdRate: number | null = null;
/** Daily EURUSD rates keyed by ISO date — populated on Update. */
const eurUsdRateByDate = new Map<string, number>();
/** Display currency chosen by the user (EUR by default). */
let displayCurrency: 'EUR' | 'USD' = 'EUR';
/** Whether portfolio/equity charts include cash. Persisted across redraws. */
let pfShowCash = true;

/**
 * Return the EURUSD rate for a given date, falling back to the latest known rate.
 * 1 EUR = returned value USD.
 */
function eurUsdForDate(date: string): number {
  return eurUsdRateByDate.get(date) ?? latestEurUsdRate ?? 1;
}

/**
 * Convert an amount stored in `stored` currency to `displayCurrency`,
 * using the rate for `date` (or latest if unset).
 * All internal values are in the account's currency (EUR by default).
 */
function toDisplay(amount: number, date?: string): number {
  if (displayCurrency === 'EUR') return amount;
  const rate = date ? eurUsdForDate(date) : (latestEurUsdRate ?? 1);
  return amount * rate;
}

/** The display symbol for the current display currency. */
function dispSymbol(): string {
  return displayCurrency === 'EUR' ? '€' : '$';
}

/**
 * Normalize a lot's buy price to the account's base currency (EUR).
 * If the lot was entered in USD, divide by the rate at buy time.
 */
function normalizeLotPrice(lot: { buyPrice: number; priceCurrency?: 'EUR' | 'USD'; fxRateAtBuy?: number }, acctCurrency: string): number {
  if (acctCurrency === 'EUR' && lot.priceCurrency === 'USD' && lot.fxRateAtBuy) {
    return lot.buyPrice / lot.fxRateAtBuy;
  }
  return lot.buyPrice;
}

async function load(ctx: AppContext): Promise<void> {
  accounts = (await ctx.storage.get<AccountState[]>(ACCT_KEY)) ?? [];
  if (!accounts.length) {
    const a = createAccount(
      { name: 'Strategy A', initialCapital: 50000, currency: 'EUR', createdAt: today() },
      uuid,
    );
    accounts = [a];
    await save(ctx);
  }
  // Scrub any NaN stop/target values that may have been stored via comma-decimal
  // input (e.g. "185,50" parsed by Number() → NaN). NaN is a valid JS value but
  // causes riskEur / rMultiple to silently become NaN and display as "—".
  let dirty = false;
  for (const acct of accounts) {
    for (const lot of acct.lots) {
      if (lot.stop !== undefined && isNaN(lot.stop)) { lot.stop = undefined; dirty = true; }
      if (lot.target !== undefined && isNaN(lot.target)) { lot.target = undefined; dirty = true; }
    }
  }
  if (dirty) await save(ctx);
  if (activeId !== OVERVIEW_ID && !accounts.some((a) => a.account.id === activeId)) activeId = OVERVIEW_ID;
}
async function save(ctx: AppContext): Promise<void> {
  await ctx.storage.set(ACCT_KEY, accounts);
}
function active(): AccountState {
  return accounts.find((a) => a.account.id === activeId) ?? accounts[0]!;
}


/** Latest known price per ticker from the most recent snapshot-time fetch. */
const priceCache = new Map<string, PriceMap>();
/** Raw bars per account — populated after Update so openRowChart can render synchronously. */
const barMapByAccount = new Map<string, Map<string, Bar[]>>();
function prices(accId: string): PriceMap {
  return priceCache.get(accId) ?? {};
}
/** Record a manually-entered price so equity/positions reflect it right away. */
function seedPrice(accId: string, ticker: string, price: number): void {
  const m = priceCache.get(accId) ?? {};
  m[ticker] = price;
  priceCache.set(accId, m);
}

// ---------------------------------------------------------------------------
// Incremental bar cache — stored in localStorage so updates only fetch the
// gap since the last fetch, not the full history every time.
// ---------------------------------------------------------------------------

type Period = '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y';
type BarCache = Record<string, Bar[]>;
const BAR_CACHE_PREFIX = 'pf_bars:';
const EURUSD_CACHE_KEY = 'pf_eurusd_bars';

function barCacheKey(accountId: string): string { return BAR_CACHE_PREFIX + accountId; }

async function loadBarCache(ctx: AppContext, accountId: string): Promise<BarCache> {
  return (await ctx.storage.get<BarCache>(barCacheKey(accountId))) ?? {};
}

async function saveBarCache(ctx: AppContext, accountId: string, cache: BarCache): Promise<void> {
  await ctx.storage.set(barCacheKey(accountId), cache);
}

function mergeBars(existing: Bar[], fresh: Bar[]): Bar[] {
  const m = new Map<string, Bar>();
  for (const b of existing) m.set(b.date, b);
  for (const b of fresh) m.set(b.date, b);
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function loadEurUsdCache(ctx: AppContext): Promise<Bar[]> {
  return (await ctx.storage.get<Bar[]>(EURUSD_CACHE_KEY)) ?? [];
}

async function saveEurUsdCache(ctx: AppContext, bars: Bar[]): Promise<void> {
  await ctx.storage.set(EURUSD_CACHE_KEY, bars);
}

/** Populate eurUsdRateByDate and latestEurUsdRate from cached EURUSD=X bars. */
function applyEurUsdBars(bars: Bar[]): void {
  for (const b of bars) eurUsdRateByDate.set(b.date, b.close);
  if (bars.length) latestEurUsdRate = bars[bars.length - 1]!.close;
}

/** Shortest Yahoo period covering gapDays. Capped at 5y — Yahoo silently returns
 *  monthly bars for range=max with interval=1d. */
function periodForGap(gapDays: number): Period {
  if (gapDays <= 30) return '1mo';
  if (gapDays <= 90) return '3mo';
  if (gapDays <= 180) return '6mo';
  if (gapDays <= 365) return '1y';
  if (gapDays <= 730) return '2y';
  return '5y';
}

/**
 * Build a dense daily equity series from the earliest buy date through endDate.
 * Replays buy/sell cash events and forward-fills close prices.
 * For EUR accounts, raw USD bar closes are divided by the EURUSD rate for each
 * date so that equity is always in the account's base currency.
 */
function buildDailyEquity(
  st: AccountState,
  allBars: Map<string, Bar[]>,
  endDate: string,
): { date: string; equity: number; cash: number; positionsValue: number }[] {
  const start = accountEarliestDate(st);
  const dateSet = new Set<string>();
  for (const bars of allBars.values()) {
    for (const b of bars) { if (b.date >= start && b.date <= endDate) dateSet.add(b.date); }
  }
  const dates = [...dateSet].sort();
  if (!dates.length) return [];

  const barByTickerDate = new Map<string, Map<string, Bar>>();
  for (const [sym, bars] of allBars.entries()) {
    const m = new Map<string, Bar>();
    for (const b of bars) m.set(b.date, b);
    barByTickerDate.set(sym, m);
  }

  // Normalize a raw USD close to the account's base currency on a given date.
  function normalizeClose(rawUsd: number, date: string): number {
    if (st.account.currency !== 'EUR') return rawUsd;
    const fx = eurUsdForDate(date);
    return fx > 1 ? rawUsd / fx : rawUsd;
  }

  const prevClose = new Map<string, number>(); // stores already-normalized closes
  function getClose(sym: string, date: string): number | null {
    const b = barByTickerDate.get(sym)?.get(date);
    if (b) {
      const normalized = normalizeClose(b.close, date);
      prevClose.set(sym, normalized);
      return normalized;
    }
    const pc = prevClose.get(sym);
    if (pc != null) return pc;
    return null;
  }

  interface TxEvent { date: string; delta: number; }
  const events: TxEvent[] = [];
  for (const lot of st.lots) events.push({ date: lot.buyDate, delta: -(lot.buyPrice * lot.shares) });
  for (const s of st.sells) events.push({ date: s.sellDate, delta: s.sellPrice * s.shares });
  events.sort((a, b) => (a.date < b.date ? -1 : 1));

  let cash = st.account.initialCapital;
  let evIdx = 0;
  const tickers = [...new Set(st.lots.map((l) => l.ticker))];
  const result: { date: string; equity: number; cash: number; positionsValue: number }[] = [];

  for (const date of dates) {
    while (evIdx < events.length && events[evIdx]!.date <= date) {
      cash += events[evIdx]!.delta;
      evIdx++;
    }
    let posVal = 0;
    for (const ticker of tickers) {
      let held = 0;
      for (const lot of st.lots) {
        if (lot.ticker !== ticker || lot.buyDate > date) continue;
        let h = lot.shares;
        for (const s of st.sells) { if (s.lotId === lot.id && s.sellDate <= date) h -= s.shares; }
        if (h > 0) held += h;
      }
      if (held === 0) continue;
      const c = getClose(ticker, date);
      if (c != null) posVal += c * held;
    }
    result.push({ date, equity: cash + posVal, cash, positionsValue: posVal });
  }
  return result;
}

/**
 * Record an equity snapshot for today using the latest known prices, replacing
 * any existing snapshot for the same day. Called after a buy/sell so the equity
 * curve moves immediately (snapshots otherwise only appended on Update prices).
 */
function snapshotNow(st: AccountState): void {
  const p = prices(st.account.id);
  const snap = {
    date: today(),
    equity: computeEquity(st, p),
    cash: computeCash(st),
    positionsValue: computePositionsValue(st, p),
  };
  const i = st.snapshots.findIndex((s) => s.date === snap.date);
  if (i >= 0) st.snapshots[i] = snap;
  else st.snapshots.push(snap);
}

/** Share-weighted average holding period across ALL lots — closed use sell date, open use today. */
function avgHoldingDays(st: AccountState): { days: number; count: number } {
  const todayStr = new Date().toISOString().slice(0, 10);
  const lotById = new Map(st.lots.map((l) => [l.id, l]));
  let wSum = 0;
  let shares = 0;
  for (const s of st.sells) {
    const lot = lotById.get(s.lotId);
    if (!lot) continue;
    wSum += daysBetween(lot.buyDate, s.sellDate) * s.shares;
    shares += s.shares;
  }
  for (const l of st.lots) {
    if (l.remainingShares <= 0) continue;
    wSum += daysBetween(l.buyDate, todayStr) * l.remainingShares;
    shares += l.remainingShares;
  }
  return { days: shares > 0 ? wSum / shares : 0, count: st.sells.length + st.lots.filter((l) => l.remainingShares > 0).length };
}

export async function renderPortfolio(ctx: AppContext): Promise<void> {
  await load(ctx);
  // Pre-load bar caches for all accounts and EURUSD rates into memory
  await Promise.all([
    ...accounts.map(async (acct) => {
      const bc = await loadBarCache(ctx, acct.account.id);
      barMapByAccount.set(acct.account.id, new Map(Object.entries(bc)));
      // Seed priceCache from the last cached bar so prices display immediately
      // on load without requiring a manual "Update" click.
      const priceMap: PriceMap = {};
      for (const [sym, bars] of Object.entries(bc)) {
        if (!bars.length) continue;
        const rawClose = bars[bars.length - 1]!.close;
        // Will be overwritten with proper FX-normalized value once EURUSD loads,
        // but use raw for now so the UI isn't blank.
        priceMap[sym] = rawClose;
      }
      priceCache.set(acct.account.id, priceMap);
    }),
    loadEurUsdCache(ctx).then((bars) => {
      applyEurUsdBars(bars);
      // Re-normalize priceCache with the now-loaded FX rates
      for (const acct of accounts) {
        const pm = priceCache.get(acct.account.id);
        if (!pm || acct.account.currency !== 'EUR') continue;
        const normalized: PriceMap = {};
        for (const [sym, rawClose] of Object.entries(pm)) {
          const bc = barMapByAccount.get(acct.account.id);
          const acctBars = bc?.get(sym);
          if (!acctBars?.length) { normalized[sym] = rawClose; continue; }
          const barDate = acctBars[acctBars.length - 1]!.date;
          const fx = eurUsdForDate(barDate);
          normalized[sym] = fx > 1 ? rawClose / fx : rawClose;
        }
        priceCache.set(acct.account.id, normalized);
      }
    }),
  ]);

  // Rebuild candle cache from persisted bars now that FX rates are loaded.
  // The cache stored in localStorage may have been built without EUR normalization;
  // rebuilding here ensures the candle close always matches the equity snapshot.
  const rebuildDate = new Date().toISOString().slice(0, 10);
  for (const acct of accounts) {
    const bm = barMapByAccount.get(acct.account.id);
    if (bm?.size) {
      (acct as AccountState & { _candleCache?: ReturnType<typeof buildCandleSeries> })._candleCache =
        buildCandleSeries(acct, bm, rebuildDate);
    }
  }

  draw(ctx);
}

function toolbarHtml(): string {
  const isOverview = activeId === OVERVIEW_ID;
  // Account selector: Overview button + dropdown for accounts (scales to any count)
  const activeAcct = isOverview ? null : accounts.find((a) => a.account.id === activeId);
  const acctOptions = accounts.map((a) => {
    const m = computeAccountMetrics(a, prices(a.account.id));
    return `<option value="${a.account.id}"${a.account.id === activeId ? ' selected' : ''}>${a.account.name}  (${pct(m.totalPnLPct)})</option>`;
  }).join('');

  const fxTitle = latestEurUsdRate ? ` · EURUSD ${latestEurUsdRate.toFixed(4)}` : '';
  return `<div class="pf-toolbar-wrap">
    <div class="pf-toolbar-nav">
      <button class="pf-nav-btn${isOverview ? ' active' : ''}" data-acct="${OVERVIEW_ID}">${t('pf.overview')}</button>
      <select id="pf-acct-select" class="pf-acct-select${!isOverview ? ' active' : ''}">
        <option value="" ${isOverview ? 'selected' : ''} disabled>${t('pf.selectacct')}</option>
        ${acctOptions}
      </select>
      <button id="acct-new"    class="pf-icon-btn" title="New account">＋</button>
      <button id="acct-edit"   class="pf-icon-btn"${isOverview ? ' disabled' : ''} title="Edit account">✎</button>
      <button id="acct-delete" class="pf-icon-btn"${isOverview ? ' disabled' : ''} title="Delete account">✕</button>
    </div>
    <div class="pf-toolbar-actions">
      ${!isOverview
        ? `<button id="acct-update"      class="pf-action-btn pf-action-btn--primary">${t('pf.update')}</button>
           <button id="acct-clear-cache" class="pf-action-btn">${t('pf.clearcache')}</button>`
        : `<button id="acct-update-all"  class="pf-action-btn pf-action-btn--primary">${t('pf.updateall')}</button>`}
      <button id="pf-ccy-toggle" class="pf-ccy-btn${displayCurrency === 'USD' ? ' usd' : ''}"
        title="Toggle display currency${fxTitle}">
        ${displayCurrency === 'EUR' ? '€ EUR' : '$ USD'}
      </button>
    </div>
  </div>`;
}

function draw(ctx: AppContext): void {
  const root = $('#tab-portfolio')!;

  if (activeId === OVERVIEW_ID) {
    root.innerHTML = buildOverviewHtml();
    try {
      wireOverview(ctx, root);
    } catch (e) {
      const s = root.querySelector('#update-status');
      if (s) s.innerHTML = `<span class="danger">UI error: ${(e as Error).message}</span>`;
      console.error('portfolio overview wire error', e);
    }
    return;
  }

  const st = active();
  const p = prices(st.account.id);
  const m = computeAccountMetrics(st, p);
  const positions = buildPositions(st, p, today());
  const avgHold = avgHoldingDays(st);
  const cache = (st as AccountState & { _candleCache?: ReturnType<typeof buildCandleSeries> })._candleCache;

  root.innerHTML = `
    <h1>${t('pf.title')}</h1>
    <p class="subtitle">${t('pf.sub')}</p>
    ${toolbarHtml()}
    <div id="update-status" class="muted" style="margin-bottom:10px"></div>

    <div class="kpi-row" style="margin-bottom:14px">
      <div class="card kpi-donut-card">${kpiDonut({
        equity: m.equity, cash: m.cash, invested: m.positionsValue,
        pnl: m.totalPnL, pnlPct: m.totalPnLPct,
      })}</div>
      <div class="grid kpi-stat-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><div class="k">${t('pf.stat.initialcap')}</div><div class="v">${money(toDisplay(st.account.initialCapital), dispSymbol())}</div></div>
      <div class="stat"><div class="k">${t('pf.stat.equity')}</div><div class="v">${money(toDisplay(m.equity), dispSymbol())}</div></div>
      <div class="stat"><div class="k">${t('pf.stat.cash')}</div><div class="v">${money(toDisplay(m.cash), dispSymbol())}</div></div>
      <div class="stat"><div class="k">${t('pf.stat.pnl')}</div><div class="v" style="color:${m.totalPnL >= 0 ? 'var(--accent)' : 'var(--danger)'}">${money(toDisplay(m.totalPnL), dispSymbol())} (${pct(m.totalPnLPct)})</div></div>
      <div class="stat"><div class="k">${t('pf.stat.risk')}</div><div class="v">${money(toDisplay(m.totalOpenRiskEur), dispSymbol())} (${pct(m.totalOpenRiskPct)})</div></div>
      <div class="stat"><div class="k">${t('pf.stat.realizedpnl')} / ${t('pf.stat.unrealpnl')}</div><div class="v">${money(toDisplay(m.realizedPnL), dispSymbol())} / ${money(toDisplay(m.unrealizedPnL), dispSymbol())}</div></div>
      <div class="stat"><div class="k">${t('pf.stat.winrate')}</div><div class="v">${num(m.winRate * 100, 0)}%</div></div>
      <div class="stat"><div class="k">${t('pf.stat.avgr')} / ${t('pf.stat.expectancy')}</div><div class="v">${num(m.avgRMultiple, 2)}R / ${money(toDisplay(m.expectancy), dispSymbol())}</div></div>
      <div class="stat"><div class="k">${t('pf.stat.maxdd')}</div><div class="v">${num(m.maxDrawdownPct, 1)}%</div></div>
      <div class="stat"><div class="k">${t('pf.stat.hold')}</div><div class="v">${avgHold.count ? num(avgHold.days, 0) + ' days' : '—'}</div></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:14px;padding:8px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 6px 8px">
        <span class="section-title" style="margin:0">${t('pf.title')}</span>
        <div class="toolbar" style="margin:0;gap:4px">
          <button class="range-btn active" data-pf-view="equity">${t('pf.chart.equity')}</button>
          <button class="range-btn" data-pf-view="candle">${t('pf.chart.candle')}</button>
        </div>
        <div class="toolbar" style="margin:0;gap:4px">
          <button class="range-btn${pfShowCash ? ' active' : ''}" id="pf-cash-toggle" title="Toggle cash inclusion">+Cash</button>
        </div>
        <div class="toolbar" style="margin:0;gap:4px" id="pf-range-bar">
          <button class="range-btn active" data-pf-range="all">All</button>
          <button class="range-btn" data-pf-range="5y">5Y</button>
          <button class="range-btn" data-pf-range="2y">2Y</button>
          <button class="range-btn" data-pf-range="1y">1Y</button>
          <button class="range-btn" data-pf-range="6m">6M</button>
        </div>
        <div class="toolbar" style="margin:0;gap:4px" id="pf-ema-bar">
          <button class="range-btn" data-pf-ema="5">EMA5</button>
          <button class="range-btn" data-pf-ema="10">EMA10</button>
          <button class="range-btn" data-pf-ema="21">EMA21</button>
          <button class="range-btn" data-pf-ema="50">EMA50</button>
          <button class="range-btn" data-pf-ema="150">EMA150</button>
          <button class="range-btn" data-pf-ema="200">EMA200</button>
        </div>
      </div>
      <div id="portfolio-chart" style="height:260px"></div>
    </div>

    ${m.openPositionsWithoutStop > 0 ? `<div class="notice" style="margin-bottom:12px">${m.openPositionsWithoutStop} open position(s) have no stop set — risk is excluded until you add one.</div>` : ''}

    <div class="section-title">${t('pf.sec.openpos')} <span class="muted" style="text-transform:none;font-weight:400">— ${t('pf.sec.openpos.hint')}</span></div>
    <div class="card" style="overflow-x:auto;margin-bottom:14px">
      <table style="white-space:nowrap"><thead><tr>
        <th>${t('pf.col.ticker')}${infoIcon('pf_ticker')}</th>
        <th>${t('pf.col.shares')}${infoIcon('pf_shares')}</th>
        <th>${t('pf.col.avgcost')}${infoIcon('pf_avgcost')}</th>
        <th>${t('pf.col.last')}${infoIcon('pf_last')}</th>
        <th>${t('pf.col.value')}${infoIcon('pf_mktval')}</th>
        <th>${t('pf.col.unrealpnl')}${infoIcon('pf_unrealpnl')}</th>
        <th>${t('pf.col.risk')}${infoIcon('pf_risk')}</th>
        <th>${t('pf.col.rmult')}${infoIcon('pf_rmult')}</th>
        <th>${t('pf.col.stop')}${infoIcon('pf_stop')}</th>
        <th>${t('pf.col.target')}${infoIcon('pf_target')}</th>
        <th>${t('pf.col.days')}${infoIcon('pf_days')}</th>
        <th>${t('pf.col.conc')}${infoIcon('pf_conc')}</th>
        <th>${t('pf.col.actions')}${infoIcon('pf_actions')}</th>
      </tr></thead>
      <tbody>${
        positions.length
          ? positions
              .map(
                (pos) =>
                  `<tr><td><a href="#" class="link-ticker" data-open="${pos.ticker}"><strong>${pos.ticker}</strong></a></td><td>${pos.shares}</td><td>${dispSymbol()}${num(toDisplay(pos.avgCost))}</td><td>${dispSymbol()}${num(toDisplay(pos.lastPrice))}</td><td>${money(toDisplay(pos.marketValue), dispSymbol())}</td>
          <td style="color:${pos.unrealizedPnL >= 0 ? 'var(--accent)' : 'var(--danger)'}">${money(toDisplay(pos.unrealizedPnL), dispSymbol())} (${pct(pos.unrealizedPnLPct)})</td>
          <td>${
            pos.riskFree
              ? `<span class="risk-free" title="Stop is at or above entry — capital is no longer at risk. Locked-in profit: ${money(toDisplay(pos.lockedInProfit ?? 0), dispSymbol())}">🔒 ${t('pf.riskfree')}</span>`
              : pos.riskEur != null ? money(toDisplay(pos.riskEur), dispSymbol()) : '<span class="warn">—</span>'
          }</td>
          <td>${
            pos.riskFree
              ? `<span class="risk-free" title="Locked-in profit: ${money(toDisplay(pos.lockedInProfit ?? 0), dispSymbol())}">+${money(toDisplay(pos.lockedInProfit ?? 0), dispSymbol())}</span>`
              : pos.rMultiple != null ? num(pos.rMultiple, 2) + 'R' : '—'
          }</td>
          <td>${pos.stop != null ? dispSymbol() + num(toDisplay(pos.stop)) : '<span class="warn">none</span>'}</td>
          <td>${pos.target != null ? dispSymbol() + num(toDisplay(pos.target)) : '—'}</td>
          <td>${pos.daysHeld}</td><td>${num(pos.concentrationPct, 0)}%</td>
          <td class="row" style="gap:4px;flex-wrap:nowrap">
            <button class="action-btn action-btn--stop" data-stop="${pos.ticker}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1v7m0 0 3-3M8 8 5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="1" y="11" width="14" height="3" rx="1" fill="currentColor" opacity=".35"/></svg>${t('pf.btn.stop')}</button>
            <button class="action-btn action-btn--target" data-target="${pos.ticker}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r=".8" fill="currentColor"/></svg>${t('pf.btn.target')}</button>
            <button class="action-btn action-btn--sell" data-sell="${pos.ticker}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M9 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>${t('pf.btn.sell')}</button>
            <button class="action-btn action-btn--chart" data-open-chart="${pos.ticker}" data-chart-from="${st.lots.filter((l) => l.ticker === pos.ticker).map((l) => l.buyDate).sort()[0] ?? ''}" data-chart-shares="${pos.shares}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1 14 5 9l3 3 3-4 4-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>${t('pf.btn.chart')}</button></td></tr>`,
              )
              .join('')
          : `<tr><td colspan="13" class="muted" style="text-align:center;padding:20px">${t('pf.nopos')}</td></tr>`
      }</tbody></table>
    </div>
    <p class="muted" style="font-size:11px;margin:-6px 0 14px">
      <b>Stop</b> = exit level that caps your loss (risk = entry − stop). <b>Target</b> = your profit objective.
      Set or edit either anytime with the buttons above; risk recalculates. Clearing the stop removes it.
    </p>

    <div class="section-title">${t('pf.sec.txhistory')}</div>
    <div class="card" style="overflow-x:auto;margin-bottom:4px">${transactionHistoryHtml(st)}</div>
    <div id="row-chart-panel" style="display:none;margin-bottom:14px">
      <div class="card" style="padding:8px">
        <div id="row-chart-header" class="pos-chart-header">
          <div class="pos-chart-id">
            <span id="row-chart-ticker" class="pos-chart-ticker"></span>
            <span id="row-chart-shares" class="pos-chart-shares"></span>
            <span id="row-chart-dates" class="pos-chart-dates"></span>
            <span id="row-chart-days" class="pos-chart-days"></span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <div class="toolbar" style="margin:0;gap:3px">
              <button class="range-btn active" id="row-view-candle" data-rv="candle">Candle</button>
              <button class="range-btn" id="row-view-equity" data-rv="equity">Equity</button>
            </div>
            <div class="toolbar" id="row-ema-bar" style="margin:0;gap:4px">
              <button class="range-btn" data-re="5">EMA5</button>
              <button class="range-btn" data-re="10">EMA10</button>
              <button class="range-btn" data-re="21">EMA21</button>
              <button class="range-btn" data-re="50">EMA50</button>
              <button class="range-btn" data-re="150">EMA150</button>
              <button class="range-btn" data-re="200">EMA200</button>
            </div>
          </div>
        </div>
        <div id="row-chart-div" style="height:260px"></div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
      <div class="card">
        <div class="section-title" style="margin-top:0">${t('pf.sec.buy')}</div>
        <div class="row"><input id="b-ticker" class="field" autocomplete="off" placeholder="Ticker" style="width:110px" />
          <input id="b-shares" class="field" type="text" inputmode="numeric" autocorrect="off" autocapitalize="off" placeholder="Shares" style="width:90px" />
          <input id="b-price" class="field" type="text" inputmode="decimal" autocorrect="off" autocapitalize="off" placeholder="Price" style="width:90px" />
          <select id="b-price-ccy" class="field" style="width:72px" title="Currency in which price is entered">
            <option value="USD" ${displayCurrency === 'USD' ? 'selected' : ''}>$ USD</option>
            <option value="EUR" ${displayCurrency === 'EUR' ? 'selected' : ''}>€ EUR</option>
          </select>
          <input id="b-date" class="field" type="date" value="${today()}" /></div>
        <div id="b-pricehint" class="price-hint"></div>
        <div class="row" style="margin-top:8px"><input id="b-stop" class="field" type="text" inputmode="decimal" autocorrect="off" autocapitalize="off" placeholder="Stop (optional)" style="width:130px" />
          <input id="b-target" class="field" type="text" inputmode="decimal" autocorrect="off" autocapitalize="off" placeholder="Target (optional)" style="width:130px" />
          <button id="b-go" class="btn">Buy</button>
          <button id="s-go" class="btn-outline">Sell</button></div>
        <div id="b-riskhint" class="price-hint" style="margin-top:4px"></div>
      </div>
      <div class="card">
        <div class="section-title" style="margin-top:0">Pending BUY_STOP Order</div>
        <div class="row"><input id="o-ticker" class="field" autocomplete="off" placeholder="Ticker" style="width:110px" />
          <input id="o-thresh" class="field" type="number" step="any" placeholder="Trigger ≥" style="width:100px" />
          <input id="o-shares" class="field" type="number" placeholder="Shares" style="width:90px" />
          <button id="o-go" class="btn">Place</button></div>
        <div id="o-pricehint" class="price-hint"></div>
        <div id="orders-list" class="muted" style="margin-top:10px;font-size:12px"></div>
      </div>
    </div>`;

  try {
    wire(ctx, root);
  } catch (e) {
    // Never let one wiring failure dead-end the whole tab.
    const s = $('#update-status');
    if (s) s.innerHTML = `<span class="danger">UI error: ${(e as Error).message}</span>`;
    console.error('portfolio wire error', e);
  }
}

/** All event wiring for the portfolio tab, isolated so a failure is contained. */
function wire(ctx: AppContext, root: HTMLElement): void {
  // EUR/USD display toggle
  const ccyBtn = $('#pf-ccy-toggle');
  if (ccyBtn) {
    ccyBtn.addEventListener('click', () => {
      displayCurrency = displayCurrency === 'EUR' ? 'USD' : 'EUR';
      draw(ctx);
    });
  }

  // Overview button + account dropdown
  root.querySelectorAll<HTMLElement>('[data-acct]').forEach((b) =>
    b.addEventListener('click', () => {
      activeId = b.dataset.acct!;
      draw(ctx);
    }),
  );
  const acctSelectWire = root.querySelector<HTMLSelectElement>('#pf-acct-select');
  if (acctSelectWire) {
    acctSelectWire.addEventListener('change', () => {
      if (acctSelectWire.value) { activeId = acctSelectWire.value; draw(ctx); }
    });
  }
  root.querySelector('#acct-new')!.addEventListener('click', async () => {
    const res = await formDialog('New account', [
      { key: 'name', label: 'Account name', value: `Strategy ${String.fromCharCode(65 + accounts.length)}` },
      { key: 'cap', label: 'Initial capital (EUR)', type: 'number', value: '50000' },
    ]);
    if (!res || !res.name) return;
    const cap = Number(res.cap) > 0 ? Number(res.cap) : 50000;
    accounts.push(createAccount({ name: res.name, initialCapital: cap, currency: 'EUR', createdAt: today() }, uuid));
    activeId = accounts[accounts.length - 1]!.account.id;
    await save(ctx);
    draw(ctx);
  });

  if (activeId !== OVERVIEW_ID) {
    // Edit the active account — rename and/or change its initial capital.
    $('#acct-edit')!.addEventListener('click', async () => {
      const a = active().account;
      const res = await formDialog('Edit account', [
        { key: 'name', label: 'Account name', value: a.name },
        { key: 'cap', label: 'Initial capital (EUR)', type: 'number', value: String(a.initialCapital) },
      ]);
      if (!res) return;
      if (res.name) a.name = res.name;
      const cap = Number(res.cap);
      if (cap > 0) a.initialCapital = cap; // cash & PnL recompute from this
      await save(ctx);
      draw(ctx);
    });

    // ── Chart helpers ──────────────────────────────────────────────────────────
    const stChart = active();
    const cache = (stChart as AccountState & { _candleCache?: ReturnType<typeof buildCandleSeries> })._candleCache;
    const currSym = stChart.account.currency === 'USD' ? '$' : stChart.account.currency === 'EUR' ? '€' : '';

    function sliceRange(bars: { time?: string; date?: string; value?: number }[], range: string) {
      if (range === 'all') return bars;
      const days = range === '6m' ? 182 : range === '1y' ? 365 : range === '2y' ? 730 : 1825;
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      return bars.filter((b) => ((b as { time?: string; date?: string }).time ?? (b as { date?: string }).date ?? '') >= cutoff);
    }
    function sliceBars(bars: Bar[], range: string): Bar[] {
      return sliceRange(bars as unknown as { time?: string; date?: string }[], range) as unknown as Bar[];
    }
    function slicePoints(pts: { time: string; value: number }[], range: string) {
      return sliceRange(pts as { time?: string; date?: string; value?: number }[], range) as { time: string; value: number }[];
    }

    // ── Portfolio chart ─────────────────────────────────────────────────────────
    const pfEl = $('#portfolio-chart')!;
    let pfView: 'equity' | 'candle' = 'equity';
    let pfRange = 'all';
    let pfEma: Record<number, boolean> = { 5: false, 10: false, 21: false, 50: false, 150: false, 200: false };
    let pfCandleChart: ReturnType<typeof drawCandles> | null = null;

    const equityPoints = (() => {
      const byDate = new Map<string, { equity: number; positionsValue: number }>();
      for (const s of stChart.snapshots) byDate.set(s.date, { equity: s.equity, positionsValue: s.positionsValue });
      return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([time, v]) => ({ time, equity: v.equity, positionsValue: v.positionsValue }));
    })();

    function renderPfChart() {
      if (pfCandleChart) { try { pfCandleChart.destroy(); } catch { /* ignore */ } pfCandleChart = null; }
      const dispCap = toDisplay(stChart.account.initialCapital);
      if (pfView === 'equity') {
        const pts = slicePoints(
          equityPoints.map((p) => ({
            time: p.time,
            value: toDisplay(pfShowCash ? p.equity : p.positionsValue, p.time),
          })),
          pfRange,
        );
        if (pts.length) {
          const baseline = pfShowCash ? dispCap : 0;
          try { drawLine(pfEl, pts, { baseline, money: true, currency: dispSymbol(), height: 260, maxLine: true, minLine: true, currentLine: true }); }
          catch { pfEl.innerHTML = `<div class=”muted” style=”text-align:center;padding:60px”>Chart unavailable.</div>`; }
        } else {
          pfEl.innerHTML = noDataHtml();
        }
      } else {
        const rawBars = pfShowCash ? (cache?.portfolio ?? []) : (cache?.portfolioNoCash ?? []);
        const bars = sliceBars(scaleBarsForDisplay(rawBars, stChart.account.currency), pfRange);
        if (bars.length) {
          try { pfCandleChart = drawCandles(pfEl, bars, null, pfEma, { noVolume: true, height: 260, maxLine: true, minLine: true }); }
          catch { pfEl.innerHTML = `<div class=”muted” style=”text-align:center;padding:60px”>Chart unavailable.</div>`; }
        } else {
          pfEl.innerHTML = noDataHtml();
        }
      }
      const emaBar = $('#pf-ema-bar');
      if (emaBar) emaBar.style.display = pfView === 'candle' ? '' : 'none';
    }
    renderPfChart();

    const cashToggleBtn = root.querySelector<HTMLElement>('#pf-cash-toggle');
    cashToggleBtn?.addEventListener('click', () => {
      pfShowCash = !pfShowCash;
      cashToggleBtn.classList.toggle('active', pfShowCash);
      renderPfChart();
    });

    root.querySelectorAll<HTMLElement>('[data-pf-view]').forEach((b) =>
      b.addEventListener('click', () => {
        pfView = b.dataset.pfView as 'equity' | 'candle';
        root.querySelectorAll('[data-pf-view]').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        renderPfChart();
      }),
    );
    root.querySelectorAll<HTMLElement>('[data-pf-range]').forEach((b) =>
      b.addEventListener('click', () => {
        pfRange = b.dataset.pfRange!;
        root.querySelectorAll('[data-pf-range]').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        renderPfChart();
      }),
    );
    root.querySelectorAll<HTMLElement>('[data-pf-ema]').forEach((b) =>
      b.addEventListener('click', () => {
        const p = Number(b.dataset.pfEma);
        pfEma[p] = !pfEma[p];
        b.classList.toggle('active', pfEma[p]);
        if (pfCandleChart) pfCandleChart.setEma(p, pfEma[p]);
      }),
    );

    // ── Per-position row chart panel ──────────────────────────────────────────
    // Static elements are in root.innerHTML — same approach as portfolio chart.
    const rowPanel    = $('#row-chart-panel')!;
    const rowChartDiv = $('#row-chart-div')!;
    const rowEmaBar   = $('#row-ema-bar')!;
    let rowChart: { destroy(): void } | null = null;
    let rowActiveBtn: HTMLElement | null = null;
    let rowClView: 'candle' | 'equity' = 'candle';
    let rowClEma: Record<number, boolean> = { 5: false, 10: false, 21: false, 50: false, 150: false, 200: false };
    let rowBars: Bar[] = [];

    function renderRowChart() {
      if (rowChart) { try { rowChart.destroy(); } catch { /* */ } rowChart = null; }
      rowEmaBar.style.display = rowClView === 'candle' ? '' : 'none';
      rowChartDiv.innerHTML = '';
      if (!rowBars.length) {
        rowChartDiv.innerHTML = noDataHtml();
        return;
      }
      if (rowClView === 'candle') {
        try { rowChart = drawCandles(rowChartDiv, rowBars, null, rowClEma, { noVolume: true, height: 260, maxLine: true, minLine: true }); }
        catch (e) { rowChartDiv.innerHTML = `<div class=”muted” style=”text-align:center;padding:40px”>${(e as Error).message}</div>`; }
      } else {
        const pts = rowBars.map((bar) => ({ time: bar.date, value: bar.close }));
        try {
          const lc = drawLine(rowChartDiv, pts, { money: true, currency: currSym, height: 260, maxLine: true, minLine: true });
          rowChart = { destroy() { try { lc.remove(); } catch { /* */ } rowChartDiv.innerHTML = ''; } };
        }
        catch (e) { rowChartDiv.innerHTML = `<div class=”muted” style=”text-align:center;padding:40px”>${(e as Error).message}</div>`; }
      }
    }

    // View toggle
    root.querySelectorAll<HTMLElement>('[data-rv]').forEach((vb) =>
      vb.addEventListener('click', () => {
        rowClView = vb.dataset.rv as 'candle' | 'equity';
        root.querySelectorAll('[data-rv]').forEach((x) => x.classList.remove('active'));
        vb.classList.add('active');
        renderRowChart();
      }),
    );
    // EMA toggle
    root.querySelectorAll<HTMLElement>('[data-re]').forEach((eb) =>
      eb.addEventListener('click', () => {
        const p = Number(eb.dataset.re);
        rowClEma[p] = !rowClEma[p];
        eb.classList.toggle('active', rowClEma[p]);
        if (rowChart && 'setEma' in rowChart) (rowChart as ReturnType<typeof drawCandles>).setEma(p, rowClEma[p]);
      }),
    );

    function openRowChart(b: HTMLElement, ticker: string, shares: number, fromDate: string, toDate: string) {
      if (rowActiveBtn === b) {
        rowPanel.style.display = 'none';
        if (rowChart) { try { rowChart.destroy(); } catch { /* */ } rowChart = null; }
        rowActiveBtn = null;
        b.classList.remove('active');
        return;
      }
      rowActiveBtn?.classList.remove('active');
      rowActiveBtn = b;
      b.classList.add('active');

      // Update header labels
      const todayStr = new Date().toISOString().slice(0, 10);
      const endStr = toDate || todayStr;
      ($('#row-chart-ticker') as HTMLElement).textContent = ticker;
      ($('#row-chart-shares') as HTMLElement).textContent = `×${shares}`;
      ($('#row-chart-dates') as HTMLElement).textContent = `${fromDate} → ${toDate || 'now'}`;
      ($('#row-chart-days') as HTMLElement).textContent = `${daysBetween(fromDate, endStr)}d`;

      // Reset view state
      rowClView = 'candle';
      rowClEma = { 5: false, 10: false, 21: false, 50: false, 150: false, 200: false };
      root.querySelectorAll('[data-rv]').forEach((x) => x.classList.remove('active'));
      ($('#row-view-candle') as HTMLElement).classList.add('active');
      root.querySelectorAll('[data-re]').forEach((x) => x.classList.remove('active'));

      rowPanel.style.display = '';

      function applyBars(raw: Bar[]) {
        // raw bars are in USD (stock prices); scale by shares first, then convert
        // to display currency. For EUR accounts showing USD: divide by EURUSD.
        // For USD display: no conversion needed (stock already in USD).
        const acctCcy = active().account.currency;
        const sharesScaled = raw
          .filter((bar) => bar.date >= fromDate && bar.date <= endStr)
          .map((bar) => ({ ...bar, open: bar.open * shares, high: bar.high * shares, low: bar.low * shares, close: bar.close * shares }));
        rowBars = (acctCcy === 'EUR' && displayCurrency === 'EUR')
          ? sharesScaled.map((b) => {
              const fx = eurUsdForDate(b.date);
              return fx > 1 ? { ...b, open: b.open / fx, high: b.high / fx, low: b.low / fx, close: b.close / fx } : b;
            })
          : sharesScaled; // USD display or USD account: keep raw USD × shares
        renderRowChart();
      }

      // barMapByAccount holds raw (unscaled) bars populated during renderPortfolio/update.
      // _candleCache bars are already scaled by remainingShares — wrong for closed rows.
      const rawFromMap = barMapByAccount.get(active().account.id)?.get(ticker);
      if (rawFromMap?.length) {
        applyBars(rawFromMap);
      } else {
        rowBars = [];
        rowChartDiv.innerHTML = noDataHtml(t('pf.loading'));
        loadBarCache(ctx, active().account.id).then((bc) => {
          applyBars(bc[ticker] ?? []);
        }).catch(() => {
          rowChartDiv.innerHTML = noDataHtml(t('pf.failload'));
        });
      }
    }

    root.querySelectorAll<HTMLElement>('[data-closed-chart]').forEach((b) =>
      b.addEventListener('click', () => openRowChart(
        b, b.dataset.closedChart!, Number(b.dataset.chartShares) || 1,
        b.dataset.chartFrom ?? '', b.dataset.chartTo ?? '',
      )),
    );
    root.querySelectorAll<HTMLElement>('[data-open-chart]').forEach((b) =>
      b.addEventListener('click', () => openRowChart(
        b, b.dataset.openChart!, Number(b.dataset.chartShares) || 1,
        b.dataset.chartFrom ?? '', '',
      )),
    );

    // orders list
    renderOrders(ctx);

    // Styled ticker comboboxes + live latest-close hints.
    const tickers = tickerList();
    attachCombobox({ input: $('#b-ticker') as HTMLInputElement, options: tickers });
    attachCombobox({ input: $('#o-ticker') as HTMLInputElement, options: tickers });
    wirePriceHint(ctx, '#b-ticker', '#b-pricehint', '#b-price', '#b-date', '#b-price-ccy');
    wirePriceHint(ctx, '#o-ticker', '#o-pricehint', '#o-thresh');

    // Live risk / R:R preview in the buy form.
    const riskHintEl = $('#b-riskhint')!;
    const updateRiskHint = () => {
      const price = Number(($('#b-price') as HTMLInputElement).value.replace(',', '.'));
      const stopVal = Number(($('#b-stop') as HTMLInputElement).value.replace(',', '.'));
      const targetVal = Number(($('#b-target') as HTMLInputElement).value.replace(',', '.'));
      const sharesVal = Number(($('#b-shares') as HTMLInputElement).value.replace(',', '.'));
      const priceCcyEl = $('#b-price-ccy') as HTMLSelectElement | null;
      const priceCcy = (priceCcyEl?.value ?? 'USD') as 'EUR' | 'USD';
      const sym = priceCcy === 'EUR' ? '€' : '$';
      if (!price || !stopVal || price <= stopVal) { riskHintEl.textContent = ''; return; }
      const riskPerShare = price - stopVal;
      const riskPct = (riskPerShare / price) * 100;
      const totalRisk = sharesVal > 0 ? riskPerShare * sharesVal : null;
      const rrStr = targetVal > price
        ? ` · R:R <b>${((targetVal - price) / riskPerShare).toFixed(1)}:1</b>`
        : '';
      riskHintEl.innerHTML =
        `Risk/share <b>${sym}${num(riskPerShare)}</b> (${riskPct.toFixed(1)}%)` +
        (totalRisk != null ? ` · Total <b>${sym}${num(totalRisk)}</b>` : '') +
        rrStr;
    };
    ['#b-price', '#b-stop', '#b-target', '#b-shares', '#b-price-ccy'].forEach((sel) => {
      const el = $(sel);
      el?.addEventListener('input', updateRiskHint);
      el?.addEventListener('change', updateRiskHint); // fallback for iOS WKWebView
    });

    // buy
    $('#b-go')!.addEventListener('click', async () => {
      const t = ($('#b-ticker') as HTMLInputElement).value.trim().toUpperCase();
      const shares = Number(($('#b-shares') as HTMLInputElement).value.replace(',', '.'));
      const price = Number(($('#b-price') as HTMLInputElement).value.replace(',', '.'));
      const date = ($('#b-date') as HTMLInputElement).value || today();
      const stop = Number(($('#b-stop') as HTMLInputElement).value.replace(',', '.')) || undefined;
      const target = Number(($('#b-target') as HTMLInputElement).value.replace(',', '.')) || undefined;
      const priceCcy = (($('#b-price-ccy') as HTMLSelectElement | null)?.value ?? 'USD') as 'EUR' | 'USD';
      if (!t || shares <= 0 || price <= 0) return;
      const fxAtBuy = eurUsdForDate(date);
      const lot = buy(active(), { ticker: t, buyDate: date, buyPrice: price, shares, stop, target }, uuid);
      lot.priceCurrency = priceCcy;
      lot.fxRateAtBuy = fxAtBuy;
      // If entered in EUR but account tracks in EUR-equivalent, normalize to EUR-denominated price
      const normPrice = normalizeLotPrice(lot, active().account.currency);
      if (normPrice !== price) {
        lot.buyPrice = normPrice;
        lot.stop = stop != null ? stop / fxAtBuy : undefined;
        lot.target = target != null ? target / fxAtBuy : undefined;
      }
      seedPrice(active().account.id, t, normPrice);
      snapshotNow(active());
      await save(ctx);
      draw(ctx);
      void update(ctx);
    });

    // sell from the form (manual ticker/shares/price/date)
    $('#s-go')!.addEventListener('click', async () => {
      const t = ($('#b-ticker') as HTMLInputElement).value.trim().toUpperCase();
      const shares = Number(($('#b-shares') as HTMLInputElement).value);
      const price = Number(($('#b-price') as HTMLInputElement).value);
      const date = ($('#b-date') as HTMLInputElement).value || today();
      const priceCcy = (($('#b-price-ccy') as HTMLSelectElement | null)?.value ?? 'USD') as 'EUR' | 'USD';
      if (!t || shares <= 0 || price <= 0) return;
      try {
        const fxAtSell = eurUsdForDate(date);
        const normSellPrice = (active().account.currency === 'EUR' && priceCcy === 'USD' && fxAtSell > 1)
          ? price / fxAtSell : price;
        const recs = sell(active(), { ticker: t, sellDate: date, sellPrice: normSellPrice, shares }, uuid);
        for (const r of recs) { r.priceCurrency = priceCcy; r.fxRateAtSell = fxAtSell; }
        seedPrice(active().account.id, t, normSellPrice);
        snapshotNow(active());
        await save(ctx);
        draw(ctx);
        void update(ctx);
      } catch (e) {
        alert((e as Error).message);
      }
    });

    // open a position's stock detail by clicking its ticker
    root.querySelectorAll<HTMLElement>('[data-open]').forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault();
        void openStock(ctx, a.dataset.open!);
      }),
    );

    // sell from a position row (in-app form, not prompt)
    root.querySelectorAll<HTMLElement>('[data-sell]').forEach((b) =>
      b.addEventListener('click', async () => {
        const t = b.dataset.sell!;
        // Pre-load bar cache so we can auto-fill the price when date changes
        const bc = await loadBarCache(ctx, active().account.id);
        const tickerBars = bc[t] ?? [];
        function priceForDate(date: string): string {
          if (!tickerBars.length) return '';
          // Walk backwards to find the last bar on or before the chosen date
          for (let i = tickerBars.length - 1; i >= 0; i--) {
            if (tickerBars[i]!.date <= date) return String(tickerBars[i]!.close);
          }
          return String(tickerBars[0]!.close);
        }
        const openShares = active().lots
          .filter((l) => l.ticker === t && l.remainingShares > 0)
          .reduce((s, l) => s + l.remainingShares, 0);
        function roundPrice(raw: string): string {
          const n = Number(raw);
          return raw && !Number.isNaN(n) ? n.toFixed(2) : raw;
        }
        // Convert raw USD close to the requested currency using the rate for the bar's date.
        function closeInCcy(rawUsd: number, barDate: string, ccy: string): string {
          if (ccy === 'EUR') {
            const fx = eurUsdForDate(barDate);
            return roundPrice(String(fx > 0 ? rawUsd / fx : rawUsd));
          }
          return roundPrice(String(rawUsd));
        }
        function priceForDateInCcy(date: string, ccy: string): string {
          const raw = priceForDate(date); // raw USD string from bar cache
          if (!raw || !Number(raw)) return '';
          return closeInCcy(Number(raw), date, ccy);
        }
        const initCcy = displayCurrency;
        const initPrice = priceForDateInCcy(today(), initCcy);
        // Track the last currency so we can detect a ccy-only change vs a date change.
        let prevCcy = initCcy;
        const res = await formDialog(`Sell ${t}`, [
          { key: 'ccy', label: 'Currency', type: 'select', value: initCcy,
            options: [{ value: 'USD', label: '$ USD' }, { value: 'EUR', label: '€ EUR' }] },
          { key: 'shares', label: 'Shares to sell', type: 'number', value: openShares > 0 ? String(openShares) : '' },
          { key: 'price', label: 'Sell price', type: 'number', value: initPrice },
          { key: 'date', label: 'Date', type: 'date', value: today() },
        ], {
          onChange: (vals) => {
            const newCcy = (vals.ccy ?? 'USD') as 'EUR' | 'USD';
            const date = vals.date ?? today();
            if (newCcy !== prevCcy) {
              // Currency changed — re-convert the current price field value.
              prevCcy = newCcy;
              const currentPrice = Number(vals.price);
              if (currentPrice > 0) {
                const fx = eurUsdForDate(date);
                const converted = (newCcy === 'EUR' && fx > 0)
                  ? currentPrice / fx           // USD → EUR
                  : currentPrice * (eurUsdForDate(date) || 1); // EUR → USD
                return { price: roundPrice(String(converted)) };
              }
              return {};
            }
            // Date changed — re-fetch the close in current currency.
            return { price: priceForDateInCcy(date, newCcy) };
          },
        });
        if (!res) return;
        const shares = Number(res.shares);
        const priceEntered = Number(res.price);
        if (shares <= 0 || priceEntered <= 0) return;
        try {
          const fxAtSell = eurUsdForDate(res.date || today());
          // Normalize entered price to account base currency (EUR)
          const normSellPrice = (active().account.currency === 'EUR' && res.ccy === 'USD' && fxAtSell > 1)
            ? priceEntered / fxAtSell : priceEntered;
          const recs = sell(active(), { ticker: t, sellDate: res.date || today(), sellPrice: normSellPrice, shares }, uuid);
          for (const r of recs) { r.priceCurrency = res.ccy as 'EUR' | 'USD'; r.fxRateAtSell = fxAtSell; }
          seedPrice(active().account.id, t, normSellPrice);
          snapshotNow(active());
          await save(ctx);
          draw(ctx);
          void update(ctx);
        } catch (e) {
          alert((e as Error).message);
        }
      }),
    );

    // set / edit the stop on every open lot of a ticker
    root.querySelectorAll<HTMLElement>('[data-stop]').forEach((b) =>
      b.addEventListener('click', async () => {
        const t = b.dataset.stop!;
        const openLots = active().lots.filter((l) => l.ticker === t && l.remainingShares > 0);
        const totalShares = openLots.reduce((s, l) => s + l.remainingShares, 0);
        const cur = openLots[0]?.stop;
        // Fall back to buy price if no market price is cached yet (before first Update)
        const latestPriceEur = prices(active().account.id)[t] ?? openLots[0]?.buyPrice ?? null;
        const curDisp = cur != null ? toDisplay(cur).toFixed(2) : '';
        const latestDisp = latestPriceEur != null ? toDisplay(latestPriceEur) : null;
        let prevStopCcy = displayCurrency;

        // Compute reference price in the same currency as the entered stop so that
        // the comparison and arithmetic are always in consistent units.
        function refInCcy(ccy: string): number | null {
          if (!latestPriceEur) return null;
          return ccy === 'USD' ? latestPriceEur * (latestEurUsdRate ?? 1) : latestPriceEur;
        }

        function stopRiskInfo(stopStr: string, ccyStr: string): string {
          const stopVal = Number(stopStr);
          if (!stopVal) return '';
          const ref = refInCcy(ccyStr);
          if (!ref || ref <= stopVal) return '';
          const sym = ccyStr === 'EUR' ? '€' : '$';
          const risk = ref - stopVal;
          const riskPct = (risk / ref) * 100;
          const total = totalShares > 0 ? risk * totalShares : null;
          return `<span class="muted" style="font-size:11px">Risk/share <b>${sym}${num(risk)}</b> (${riskPct.toFixed(1)}%)` +
            (total != null ? ` · Total <b>${sym}${num(total)}</b>` : '') + `</span>`;
        }

        const res = await formDialog(`Stop-loss for ${t}`, [
          { key: 'ccy', label: 'Currency', type: 'select', value: displayCurrency,
            options: [{ value: 'USD', label: '$ USD' }, { value: 'EUR', label: '€ EUR' }] },
          { key: 'stop', label: 'Stop price (blank to clear)', type: 'number', value: curDisp,
            placeholder: latestDisp != null ? `e.g. ${(latestDisp * 0.93).toFixed(2)}` : '' },
          { key: '_risk', label: '', type: 'info', value: stopRiskInfo(curDisp, displayCurrency) },
        ], {
          onChange: (vals) => {
            const newCcy = (vals.ccy ?? 'USD') as 'EUR' | 'USD';
            const stopStr = vals.stop ?? '';
            const updates: Partial<Record<string, string>> = {};
            if (newCcy !== prevStopCcy) {
              prevStopCcy = newCcy;
              const currentVal = Number(stopStr);
              if (currentVal) {
                const fx = latestEurUsdRate ?? 1;
                updates.stop = (newCcy === 'EUR' ? currentVal / fx : currentVal * fx).toFixed(2);
              }
            }
            updates._risk = stopRiskInfo(updates.stop ?? stopStr, newCcy);
            return updates;
          },
        });
        if (!res) return;
        // Replace comma decimal separator (iOS/European keyboards) before parsing.
        const stopStr2 = (res.stop ?? '').replace(',', '.');
        const stopRaw = stopStr2 === '' ? undefined : Number(stopStr2);
        if (stopRaw !== undefined && (isNaN(stopRaw) || stopRaw <= 0)) {
          alert('Invalid stop price — use numbers only (e.g. 185.50).');
          return;
        }
        // Normalize to account base currency (EUR)
        const fxNow = latestEurUsdRate ?? 1;
        const stop = (stopRaw != null && active().account.currency === 'EUR' && res.ccy === 'USD' && fxNow > 1)
          ? stopRaw / fxNow : stopRaw;
        for (const l of active().lots) {
          if (l.ticker === t && l.remainingShares > 0) setStop(active(), l.id, stop);
        }
        await save(ctx);
        draw(ctx);
        void update(ctx);
      }),
    );

    // set / edit the target on every open lot of a ticker
    root.querySelectorAll<HTMLElement>('[data-target]').forEach((b) =>
      b.addEventListener('click', async () => {
        const t = b.dataset.target!;
        const openLots = active().lots.filter((l) => l.ticker === t && l.remainingShares > 0);
        const totalShares = openLots.reduce((s, l) => s + l.remainingShares, 0);
        const cur = openLots[0]?.target;
        // Fall back to buy price if no market price is cached yet (before first Update)
        const latestPriceEur = prices(active().account.id)[t] ?? openLots[0]?.buyPrice ?? null;
        const curDisp = cur != null ? toDisplay(cur).toFixed(2) : '';
        const latestDisp = latestPriceEur != null ? toDisplay(latestPriceEur) : null;
        const stopEur = openLots[0]?.stop ?? null;
        let prevTargetCcy = displayCurrency;

        function refInCcy2(ccy: string): number | null {
          if (!latestPriceEur) return null;
          return ccy === 'USD' ? latestPriceEur * (latestEurUsdRate ?? 1) : latestPriceEur;
        }
        function stopInCcy(ccy: string): number | null {
          if (!stopEur) return null;
          return ccy === 'USD' ? stopEur * (latestEurUsdRate ?? 1) : stopEur;
        }

        function targetRRInfo(targetStr: string, ccyStr: string): string {
          const targetVal = Number(targetStr);
          if (!targetVal) return '';
          const ref = refInCcy2(ccyStr);
          const stopVal = stopInCcy(ccyStr);
          if (!ref || targetVal <= ref || !stopVal) return '';
          const sym = ccyStr === 'EUR' ? '€' : '$';
          const reward = targetVal - ref;
          const risk = ref - stopVal;
          if (risk <= 0) return '';
          const rr = reward / risk;
          const rewardPct = (reward / ref) * 100;
          const totalReward = totalShares > 0 ? reward * totalShares : null;
          return `<span class="muted" style="font-size:11px">Upside <b>${sym}${num(reward)}</b> (${rewardPct.toFixed(1)}%)` +
            (totalReward != null ? ` · Total <b>${sym}${num(totalReward)}</b>` : '') +
            ` · R:R <b>${rr.toFixed(1)}:1</b></span>`;
        }

        const res = await formDialog(`Target for ${t}`, [
          { key: 'ccy', label: 'Currency', type: 'select', value: displayCurrency,
            options: [{ value: 'USD', label: '$ USD' }, { value: 'EUR', label: '€ EUR' }] },
          { key: 'target', label: 'Target price (blank to clear)', type: 'number', value: curDisp,
            placeholder: latestDisp != null ? `e.g. ${(latestDisp * 1.20).toFixed(2)}` : '' },
          { key: '_rr', label: '', type: 'info', value: targetRRInfo(curDisp, displayCurrency) },
        ], {
          onChange: (vals) => {
            const newCcy = (vals.ccy ?? 'USD') as 'EUR' | 'USD';
            const targetStr = vals.target ?? '';
            const updates: Partial<Record<string, string>> = {};
            if (newCcy !== prevTargetCcy) {
              prevTargetCcy = newCcy;
              const currentVal = Number(targetStr);
              if (currentVal) {
                const fx = latestEurUsdRate ?? 1;
                updates.target = (newCcy === 'EUR' ? currentVal / fx : currentVal * fx).toFixed(2);
              }
            }
            updates._rr = targetRRInfo(updates.target ?? targetStr, newCcy);
            return updates;
          },
        });
        if (!res) return;
        const targetStr2 = (res.target ?? '').replace(',', '.');
        const targetRaw = targetStr2 === '' ? undefined : Number(targetStr2);
        if (targetRaw !== undefined && (isNaN(targetRaw) || targetRaw <= 0)) {
          alert('Invalid target price — use numbers only (e.g. 220.50).');
          return;
        }
        const fxNow = latestEurUsdRate ?? 1;
        const target = (targetRaw != null && active().account.currency === 'EUR' && res.ccy === 'USD' && fxNow > 1)
          ? targetRaw / fxNow : targetRaw;
        for (const l of active().lots) {
          if (l.ticker === t && l.remainingShares > 0) l.target = target;
        }
        await save(ctx);
        draw(ctx);
        void update(ctx);
      }),
    );

    // delete a single SELL (returns the shares to its lot — does NOT remove the buy)
    root.querySelectorAll<HTMLElement>('[data-del-sell]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Undo this sell? The shares return to the open position. The original buy lot remains.')) return;
        deleteSell(active(), b.dataset.delSell!);
        snapshotNow(active());
        await save(ctx);
        draw(ctx);
        void update(ctx);
      }),
    );

    // delete a BUY lot (and any sells matched to it)
    root.querySelectorAll<HTMLElement>('[data-del-lot]').forEach((b) =>
      b.addEventListener('click', async () => {
        const lotId = b.dataset.delLot!;
        const lot = active().lots.find((l) => l.id === lotId);
        const lotDesc = lot ? `${lot.shares} × ${lot.ticker} @ ${dispSymbol()}${num(toDisplay(lot.buyPrice))} on ${lot.buyDate}` : 'this buy';
        if (!confirm(`Delete buy: ${lotDesc}?\nThis removes the lot and any sells matched to it. Average cost will update.`)) return;
        deleteLot(active(), lotId);
        snapshotNow(active());
        await save(ctx);
        draw(ctx);
        void update(ctx);
      }),
    );

    // place order
    $('#o-go')!.addEventListener('click', async () => {
      const t = ($('#o-ticker') as HTMLInputElement).value.trim().toUpperCase();
      const threshold = Number(($('#o-thresh') as HTMLInputElement).value);
      const shares = Number(($('#o-shares') as HTMLInputElement).value);
      if (!t || threshold <= 0 || shares <= 0) return;
      createOrder(active(), { ticker: t, type: 'BUY_STOP', threshold, shares, createdDate: today() }, uuid);
      await save(ctx);
      draw(ctx);
    });

    // delete the active account
    $('#acct-delete')!.addEventListener('click', async () => {
      if (accounts.length <= 1) {
        alert('Keep at least one account. Create another first if you want to remove this one.');
        return;
      }
      if (!confirm(`Delete account “${active().account.name}” and all its transactions?`)) return;
      accounts = accounts.filter((a) => a.account.id !== activeId);
      activeId = OVERVIEW_ID;
      await save(ctx);
      draw(ctx);
    });

    // update
    $('#acct-update')!.addEventListener('click', () => void update(ctx));

    $('#acct-clear-cache')!.addEventListener('click', async () => {
      const st2 = active();
      await saveBarCache(ctx, st2.account.id, {});
      st2.snapshots = [];
      (st2 as AccountState & { _candleCache?: unknown })._candleCache = undefined;
      await save(ctx);
      draw(ctx);
      const s = $('#update-status');
      if (s) s.innerHTML = `<span class="status-chip status-chip--muted"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Cache cleared — click "Update" to re-fetch.</span>`;
    });
  }

  attachTooltips(root);
}

/** Whole-day difference between two ISO dates (>= 0). */
function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
}

/**
 * Per-lot lifecycle ledger. Each lot contributes:
 *   - one CLOSED row per sell matched to it (buy date + sell date + held + PnL), and
 *   - one OPEN row for any remainingShares (buy date only, no sell date).
 * So a 100-share buy with 40 sold shows: one 40-share closed row and one
 * 60-share open row — never a duplicate "buy" line.
 */
function transactionHistoryHtml(st: AccountState): string {
  interface Row {
    status: 'CLOSED' | 'OPEN';
    ticker: string; shares: number; buyPrice: number; sellPrice: number | null;
    buyDate: string; sellDate: string | null; holdDays: number | null; pnl: number | null;
    sortDate: string; delKind: 'sell' | 'lot'; delId: string;
  }
  const sellsByLot = new Map<string, typeof st.sells>();
  for (const s of st.sells) {
    const arr = sellsByLot.get(s.lotId) ?? [];
    arr.push(s);
    sellsByLot.set(s.lotId, arr);
  }

  const rows: Row[] = [];
  for (const l of st.lots) {
    for (const s of sellsByLot.get(l.id) ?? []) {
      rows.push({
        status: 'CLOSED', ticker: l.ticker, shares: s.shares, buyPrice: l.buyPrice, sellPrice: s.sellPrice,
        buyDate: l.buyDate, sellDate: s.sellDate, holdDays: daysBetween(l.buyDate, s.sellDate),
        pnl: s.realizedPnL, sortDate: s.sellDate, delKind: 'sell', delId: s.id,
      });
    }
    if (l.remainingShares > 0) {
      rows.push({
        status: 'OPEN', ticker: l.ticker, shares: l.remainingShares, buyPrice: l.buyPrice, sellPrice: null,
        buyDate: l.buyDate, sellDate: null, holdDays: null, pnl: null,
        sortDate: l.buyDate, delKind: 'lot', delId: l.id,
      });
    }
  }
  if (!rows.length) {
    return `<div class="muted" style="text-align:center;padding:20px">No transactions yet.</div>`;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const closed = rows.filter((r) => r.status === 'CLOSED');
  const openRows = rows.filter((r) => r.status === 'OPEN');

  let avgHold = 0;
  if (closed.length) {
    const wSum = closed.reduce((s, r) => s + r.holdDays! * r.shares, 0);
    const sh = closed.reduce((s, r) => s + r.shares, 0);
    avgHold = sh > 0 ? wSum / sh : 0;
  }
  let avgOpenHold = 0;
  if (openRows.length) {
    const wSum = openRows.reduce((s, r) => s + daysBetween(r.buyDate, todayStr) * r.shares, 0);
    const sh = openRows.reduce((s, r) => s + r.shares, 0);
    avgOpenHold = sh > 0 ? wSum / sh : 0;
  }

  const chips: string[] = [];
  if (closed.length) chips.push(`<span class="hold-chip hold-chip--closed"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M8 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Closed&nbsp;<strong>${num(avgHold, 0)}d avg</strong><span class="hold-chip__sub">${closed.length} trade${closed.length !== 1 ? 's' : ''}</span></span>`);
  if (openRows.length) chips.push(`<span class="hold-chip hold-chip--open"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="2"/><path d="M8 5v3l2 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>Open&nbsp;<strong>${num(avgOpenHold, 0)}d avg</strong><span class="hold-chip__sub">${openRows.length} position${openRows.length !== 1 ? 's' : ''}</span></span>`);
  const summaryLine = chips.length ? `<div class="hold-chips">${chips.join('')}</div>` : '';

  rows.sort((a, b) => (a.sortDate < b.sortDate ? 1 : a.sortDate > b.sortDate ? -1 : 0));
  const body = rows
    .map((r) => {
      const c = r.status === 'CLOSED' ? 'var(--warn)' : 'var(--accent2)';
      const pnl = r.pnl == null ? '—' : `<span style="color:${r.pnl >= 0 ? 'var(--accent)' : 'var(--danger)'}">${money(toDisplay(r.pnl, r.sellDate ?? r.buyDate), dispSymbol())}</span>`;
      const heldDays = r.holdDays != null ? r.holdDays : daysBetween(r.buyDate, todayStr);
      const chartTo = r.status === 'CLOSED' ? (r.sellDate ?? '') : '';
      const chartBtn = `<button class="action-btn action-btn--chart" data-closed-chart="${r.ticker}" data-chart-from="${r.buyDate}" data-chart-to="${chartTo}" data-chart-shares="${r.shares}" title="Show price × shares chart"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M1 14 5 9l3 3 3-4 4-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Chart</button>`;
      return `<tr>
        <td><span class="badge" style="background:color-mix(in srgb,${c} 16%,transparent);color:${c}">${r.status}</span></td>
        <td><a href="#" class="link-ticker" data-open="${r.ticker}"><strong>${r.ticker}</strong></a></td>
        <td>${r.shares}</td>
        <td>${dispSymbol()}${num(toDisplay(r.buyPrice, r.buyDate))}</td>
        <td>${r.sellPrice != null ? dispSymbol() + num(toDisplay(r.sellPrice, r.sellDate ?? r.buyDate)) : '—'}</td>
        <td>${r.buyDate}</td>
        <td>${r.sellDate ?? '—'}</td>
        <td>${heldDays}d</td>
        <td>${pnl}</td>
        <td style="display:flex;gap:4px;align-items:center">${chartBtn}<button class="del-btn" title="Delete this transaction" data-del-${r.delKind}="${r.delId}"><svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></td>
      </tr>`;
    })
    .join('');
  return `${summaryLine}<table style="white-space:nowrap"><thead><tr>
    <th>${t('pf.col.status')} ${infoIcon('pf_tx_status')}</th>
    <th>${t('pf.col.ticker')} ${infoIcon('pf_ticker')}</th>
    <th>${t('pf.col.shares')} ${infoIcon('pf_tx_shares')}</th>
    <th>${t('pf.col.buyprice')} ${infoIcon('pf_tx_buyprice')}</th>
    <th>${t('pf.col.sellprice')} ${infoIcon('pf_tx_sellprice')}</th>
    <th>${t('pf.col.buydate')} ${infoIcon('pf_tx_buydate')}</th>
    <th>${t('pf.col.selldate')} ${infoIcon('pf_tx_selldate')}</th>
    <th>${t('pf.col.held')} ${infoIcon('pf_tx_held')}</th>
    <th>${t('pf.col.realizedpnl')} ${infoIcon('pf_tx_pnl')}</th>
    <th></th>
  </tr></thead><tbody>${body}</tbody></table>`;
}

function renderOrders(ctx: AppContext): void {
  const list = $('#orders-list');
  if (!list) return;
  const orders = active().orders;
  if (!orders.length) {
    list.textContent = 'No pending or filled orders yet.';
    return;
  }
  list.innerHTML = orders
    .map(
      (o) =>
        `<div class="order-row" style="display:flex;gap:6px;align-items:center;margin-bottom:3px">
          <b>${o.ticker}</b> ${o.type} ${o.shares}@$${num(o.threshold)} —
          <span class="${o.status === 'pending' ? 'warn' : o.status === 'filled' ? 'accent' : 'muted'}">${o.status}</span>
          ${o.note ? `<span class="muted">(${o.note})</span>` : ''}
          ${o.status === 'pending' ? `<button class="range-btn" data-cancel="${o.id}" style="margin-left:auto">Cancel</button>` : ''}
        </div>`,
    )
    .join('');
  list.querySelectorAll<HTMLElement>('[data-cancel]').forEach((b) =>
    b.addEventListener('click', async () => {
      const o = active().orders.find((x) => x.id === b.dataset.cancel);
      if (o && o.status === 'pending') o.status = 'cancelled';
      await save(ctx);
      draw(ctx);
    }),
  );
}

async function update(ctx: AppContext): Promise<void> {
  const st = active();
  // #update-status only exists in the individual account view. When update() is
  // called from the Overview "Update All" loop the element is absent — use a
  // no-op stub so every subsequent status.innerHTML write is safe.
  const status = $('#update-status') ?? { innerHTML: '' };
  const endDate = today();

  const tickers = [
    ...new Set([
      ...st.lots.map((l) => l.ticker),
      ...st.orders.filter((o) => o.status === 'pending').map((o) => o.ticker),
    ]),
  ];

  if (!tickers.length) {
    st.snapshots = [];
    (st as AccountState & { _candleCache?: unknown })._candleCache = undefined;
    await save(ctx);
    draw(ctx);
    const s = $('#update-status');
    if (s) s.innerHTML = `<span class="status-chip status-chip--muted">No holdings — add a position to get started.</span>`;
    return;
  }

  status.innerHTML = `<span class="status-chip status-chip--loading"><span class="spinner"></span>Fetching ${tickers.length} ticker${tickers.length > 1 ? 's' : ''}…</span>`;

  // Earliest buy date per ticker
  const earliestBuyByTicker = new Map<string, string>();
  for (const lot of st.lots) {
    const cur = earliestBuyByTicker.get(lot.ticker);
    if (!cur || lot.buyDate < cur) earliestBuyByTicker.set(lot.ticker, lot.buyDate);
  }

  const barCache = await loadBarCache(ctx, st.account.id);

  // Decide what to fetch per ticker
  const needsFetch = new Map<string, Period>();
  for (const sym of tickers) {
    const cached = barCache[sym];
    const firstCached = cached?.length ? cached[0]!.date : null;
    const lastCached = cached?.length ? cached[cached.length - 1]!.date : null;
    const tickerStart = earliestBuyByTicker.get(sym) ?? endDate;
    if (!lastCached || (firstCached && firstCached > tickerStart)) {
      const fullGapDays = Math.ceil((Date.now() - Date.parse(tickerStart)) / 86_400_000);
      needsFetch.set(sym, periodForGap(fullGapDays));
      delete barCache[sym];
      continue;
    }
    if (lastCached >= endDate) continue;
    const gapDays = Math.ceil((Date.now() - Date.parse(lastCached)) / 86_400_000);
    needsFetch.set(sym, periodForGap(gapDays));
  }

  if (needsFetch.size > 0) {
    // Group tickers by period to batch requests
    const byPeriod = new Map<Period, string[]>();
    for (const [sym, period] of needsFetch) {
      const arr = byPeriod.get(period) ?? [];
      arr.push(sym);
      byPeriod.set(period, arr);
    }
    for (const [period, syms] of byPeriod) {
      const data = await fetchMany(ctx.data, syms, period, 8);
      for (const [sym, ohlcv] of data.entries()) {
        if (ohlcv.bars.length) {
          barCache[sym] = mergeBars(barCache[sym] ?? [], ohlcv.bars);
        }
      }
    }
    await saveBarCache(ctx, st.account.id, barCache);
  }

  // Fetch EURUSD=X rates (best-effort — don't block update on failure)
  try {
    const cachedFx = await loadEurUsdCache(ctx);
    const lastFxDate = cachedFx.length ? cachedFx[cachedFx.length - 1]!.date : null;
    const fxGapDays = lastFxDate
      ? Math.ceil((Date.now() - Date.parse(lastFxDate)) / 86_400_000)
      : 365 * 3;
    if (fxGapDays > 0) {
      const fxOhlcv = await ctx.data.getOHLCV('EURUSD=X', periodForGap(fxGapDays)).catch(() => null);
      if (fxOhlcv?.bars.length) {
        const merged = mergeBars(cachedFx, fxOhlcv.bars);
        await saveEurUsdCache(ctx, merged);
        applyEurUsdBars(merged);
      } else {
        applyEurUsdBars(cachedFx);
      }
    } else {
      applyEurUsdBars(cachedFx);
    }
  } catch {
    // EURUSD fetch failed — display stays in EUR or uses stale rate
  }

  // Build price map from latest bar — normalize to account base currency.
  // Yahoo always returns USD prices; EUR accounts need EUR prices so that
  // lastPrice matches the EUR-denominated buyPrice/stop/target in every lot.
  const priceMap: PriceMap = {};
  for (const sym of tickers) {
    const bars = barCache[sym];
    if (!bars?.length) continue;
    const rawClose = bars[bars.length - 1]!.close;
    if (st.account.currency === 'EUR') {
      const fx = eurUsdForDate(endDate);
      priceMap[sym] = fx > 1 ? rawClose / fx : rawClose;
    } else {
      priceMap[sym] = rawClose;
    }
  }
  priceCache.set(st.account.id, priceMap);

  // Run order fills (BUY_STOP orders)
  const lastDate = st.snapshots.length ? st.snapshots[st.snapshots.length - 1]!.date : '0000-00-00';
  const barsByTicker = new Map<string, Bar[]>();
  for (const sym of tickers) {
    barsByTicker.set(sym, (barCache[sym] ?? []).filter((b) => b.date > lastDate));
  }
  const res = runUpdate(st, { barsByTicker, asOfDate: endDate }, uuid);

  // Build dense daily equity snapshots
  const allBarsMap = new Map(Object.entries(barCache));
  barMapByAccount.set(st.account.id, allBarsMap);   // cache for synchronous row-chart access
  const dailyEquity = buildDailyEquity(st, allBarsMap, endDate);
  st.snapshots = dailyEquity.map((d) => ({
    date: d.date,
    equity: d.equity,
    cash: d.cash,
    positionsValue: d.positionsValue,
  }));

  // Build candle series cache
  (st as AccountState & { _candleCache?: ReturnType<typeof buildCandleSeries> })._candleCache =
    buildCandleSeries(st, allBarsMap, endDate);

  await save(ctx);

  const fills = res.fills.filter((f) => f.filled).length;
  const rejects = res.fills.filter((f) => !f.filled);
  const fillNote = fills > 0 ? ` · ${fills} order${fills > 1 ? 's' : ''} filled` : '';
  const rejectNote = rejects.length ? ` · <span style="color:var(--warn)">${rejects.map((r) => r.reason).join('; ')}</span>` : '';
  const statusMsg = `<span class="status-chip status-chip--ok"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Updated${fillNote}</span>${rejectNote}`;

  draw(ctx);
  const s = $('#update-status');
  if (s) s.innerHTML = statusMsg;
}

/** Earliest date we need bars from: the oldest buy date across all lots. */
function accountEarliestDate(st: AccountState): string {
  const dates = st.lots.map((l) => l.buyDate).filter(Boolean).sort();
  return dates[0] ?? st.account.createdAt ?? today();
}

/**
 * Build per-position candle bars (O/H/L/C × shares held on that day) and
 * portfolio candle bars (sum of all positions + cash).
 * When displayCurrency is USD and the account is EUR, multiplies each bar's
 * OHLC values by the EURUSD rate for that date so chart values match display.
 */
function buildCandleSeries(
  st: AccountState,
  allBars: Map<string, Bar[]>,
  endDate: string,
): {
  positions: { ticker: string; bars: Bar[] }[];
  portfolio: Bar[];
  portfolioNoCash: Bar[];
} {
  const start = accountEarliestDate(st);

  const dateSet = new Set<string>();
  for (const bars of allBars.values()) {
    for (const b of bars) {
      if (b.date >= start && b.date <= endDate) dateSet.add(b.date);
    }
  }
  const dates = [...dateSet].sort();
  if (!dates.length) return { positions: [], portfolio: [], portfolioNoCash: [] };

  const barByTickerDate = new Map<string, Map<string, Bar>>();
  for (const [sym, bars] of allBars.entries()) {
    const m = new Map<string, Bar>();
    for (const b of bars) m.set(b.date, b);
    barByTickerDate.set(sym, m);
  }

  // Normalize a raw USD bar to the account's base currency (EUR) on a given date.
  // Mirrors the normalizeClose() logic in buildDailyEquity so the candle close
  // matches the equity snapshot on any given day.
  function normalizeBar(b: Bar, date: string): Bar {
    if (st.account.currency !== 'EUR') return b;
    const fx = eurUsdForDate(date);
    if (!(fx > 1)) return b;
    return {
      date: b.date,
      open: b.open / fx,
      high: b.high / fx,
      low: b.low / fx,
      close: b.close / fx,
      volume: b.volume,
    };
  }

  const prevClose = new Map<string, number>();
  function getBar(sym: string, date: string): Bar | null {
    const m = barByTickerDate.get(sym);
    const raw = m?.get(date);
    if (raw) {
      const nb = normalizeBar(raw, date);
      prevClose.set(sym, nb.close);
      return nb;
    }
    const pc = prevClose.get(sym);
    if (pc == null) return null;
    return { date, open: pc, high: pc, low: pc, close: pc, volume: 0 };
  }

  interface TxEvent { date: string; delta: number; }
  const events: TxEvent[] = [];
  for (const lot of st.lots) events.push({ date: lot.buyDate, delta: -(lot.buyPrice * lot.shares) });
  for (const s of st.sells) events.push({ date: s.sellDate, delta: s.sellPrice * s.shares });
  events.sort((a, b) => (a.date < b.date ? -1 : 1));

  let cash = st.account.initialCapital;
  let evIdx = 0;

  const openTickers = [...new Set(st.lots.map((l) => l.ticker))];
  const posBars = new Map<string, Bar[]>(openTickers.map((t) => [t, []]));

  const portfolio: Bar[] = [];        // cash + positions
  const portfolioNoCash: Bar[] = [];  // positions only

  for (const date of dates) {
    while (evIdx < events.length && events[evIdx]!.date <= date) {
      cash += events[evIdx]!.delta;
      evIdx++;
    }

    let portO = cash, portH = cash, portL = cash, portC = cash;
    let posO = 0, posH = 0, posL = 0, posC = 0;

    for (const ticker of openTickers) {
      let held = 0;
      for (const lot of st.lots) {
        if (lot.ticker !== ticker || lot.buyDate > date) continue;
        let h = lot.shares;
        for (const s of st.sells) {
          if (s.lotId === lot.id && s.sellDate <= date) h -= s.shares;
        }
        if (h > 0) held += h;
      }
      if (held === 0) continue;

      const bar = getBar(ticker, date);
      if (!bar) continue;

      const posBar: Bar = {
        date,
        open: bar.open * held,
        high: bar.high * held,
        low: bar.low * held,
        close: bar.close * held,
        volume: bar.volume,
      };
      posBars.get(ticker)!.push(posBar);
      portO += posBar.open;
      portH += posBar.high;
      portL += posBar.low;
      portC += posBar.close;
      posO += posBar.open;
      posH += posBar.high;
      posL += posBar.low;
      posC += posBar.close;
    }

    portfolio.push({ date, open: portO, high: portH, low: portL, close: portC, volume: 0 });
    // Only emit a no-cash bar when at least one position is held
    if (posC > 0) portfolioNoCash.push({ date, open: posO, high: posH, low: posL, close: posC, volume: 0 });
  }

  const positions = openTickers
    .map((ticker) => ({ ticker, bars: posBars.get(ticker)! }))
    .filter((p) => p.bars.length > 0);

  return { positions, portfolio, portfolioNoCash };
}

/**
 * Scale candle bars from account base currency (EUR) to display currency.
 * Applied at render time so toggling is instant without rebuilding the cache.
 * No-op when displayCurrency matches the account currency.
 */
function scaleBarsForDisplay(bars: Bar[], acctCurrency: string): Bar[] {
  if (displayCurrency === acctCurrency) return bars;
  return bars.map((b) => {
    const fx = eurUsdForDate(b.date);
    return fx === 1 ? b : { ...b, open: b.open * fx, high: b.high * fx, low: b.low * fx, close: b.close * fx };
  });
}

/**
 * Professional KPI donut. The ring splits total equity into its two real
 * components — Cash and Invested (positions value) — and the hub carries the
 * headline numbers (Total Equity + P&L abs/%). All amounts come in EUR base and
 * are display-converted here. Pure SVG so it renders identically everywhere.
 */
function kpiDonut(opts: {
  equity: number;
  cash: number;
  invested: number;
  pnl: number;
  pnlPct: number;
  equityLabel?: string;
}): string {
  const equityLabel = opts.equityLabel ?? t('pf.stat.equity');
  const d = (v: number) => toDisplay(v);
  const sym = dispSymbol();
  // Compact money: keeps the donut hub + legend on one line regardless of size.
  // <10k → full (e.g. €8,450), else K/M with 1–2 sig decimals (€12.4K, €1.85M).
  const cmoney = (v: number): string => {
    const sign = v < 0 ? '-' : '';
    const a = Math.abs(v);
    if (a >= 1e6) return `${sign}${sym}${(a / 1e6).toFixed(2)}M`;
    if (a >= 1e4) return `${sign}${sym}${(a / 1e3).toFixed(1)}K`;
    return sign + money(a, sym);
  };
  const equity = Math.max(0, d(opts.equity));
  const cash = Math.max(0, d(opts.cash));
  const invested = Math.max(0, d(opts.invested));
  const pnl = d(opts.pnl);
  const total = cash + invested;
  const cashPct = total > 0 ? (cash / total) * 100 : 0;
  const investedPct = total > 0 ? (invested / total) * 100 : 0;
  const pnlPos = opts.pnl >= 0;

  // Ring geometry — stroke-dasharray over a circle of radius R, centered in a
  // Ring centered in a 200×200 viewBox. R is sized so the ring nearly fills the
  // box; the ~16px margin (200/2 − R − SW/2 − labelR slack) just fits the
  // outside percentage labels without clipping.
  const CX = 100, CY = 100;
  const R = 76;
  const C = 2 * Math.PI * R;
  const SW = 20; // stroke width
  // Small gaps between the two arcs so the ring reads as segmented, not solid.
  const GAP = total > 0 && cash > 0 && invested > 0 ? 3 : 0;
  const investedLen = Math.max(0, (investedPct / 100) * C - GAP);
  const cashLen = Math.max(0, (cashPct / 100) * C - GAP);
  const pnlColor = pnlPos ? 'var(--accent)' : 'var(--danger)';

  // Place a % label centered ON the arc band at the segment's angular midpoint,
  // so the ring can fill the viewBox without outside labels clipping the edge.
  // fracStart/fracEnd are 0..1 around the circle, clockwise from top.
  const labelR = R; // center of the stroke band
  function arcLabel(fracStart: number, fracEnd: number, value: number): string {
    const mid = (fracStart + fracEnd) / 2;
    const ang = mid * 2 * Math.PI - Math.PI / 2; // clockwise from 12 o'clock
    const x = CX + labelR * Math.cos(ang);
    const y = CY + labelR * Math.sin(ang);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" class="kpi-donut-pctout">${num(value, 0)}%</text>`;
  }
  const investedFrac = investedPct / 100;

  // True angular (conic-style) gradient along an arc. A linearGradient is a
  // straight-line projection, so on an arc wider than 180° its color reaches the
  // far end mid-arc then REVERSES (the "green→cyan→green" artifact). Instead we
  // draw the arc as many tiny sub-segments whose color interpolates start→end as
  // the angle sweeps, so the transition follows the curve exactly.
  const css = (n: string, fallback: string) =>
    (getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fallback);
  function hexToRgb(h: string): [number, number, number] {
    const m = h.replace('#', '');
    const v = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
    `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
  const pt = (frac: number): [number, number] => {
    const ang = frac * 2 * Math.PI - Math.PI / 2; // clockwise from 12 o'clock
    return [CX + R * Math.cos(ang), CY + R * Math.sin(ang)];
  };
  // Build one colour-swept arc band from frac0→frac1 (0..1 around the circle).
  function conicArc(frac0: number, frac1: number, cFrom: string, cTo: string): string {
    const from = hexToRgb(cFrom), to = hexToRgb(cTo);
    const span = frac1 - frac0;
    if (span <= 0) return '';
    const N = Math.max(6, Math.round(span * 160)); // ~160 segs for a full ring
    const overlap = span / N * 0.55; // extend each seg slightly to hide seams
    let paths = '';
    for (let i = 0; i < N; i++) {
      const f0 = frac0 + (span * i) / N;
      const f1 = Math.min(frac1, frac0 + (span * (i + 1)) / N + overlap);
      const [x0, y0] = pt(f0), [x1, y1] = pt(f1);
      const color = mix(from, to, (i + 0.5) / N);
      const cap = i === 0 ? 'round' : (i === N - 1 ? 'round' : 'butt');
      paths += `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${SW}" stroke-linecap="${cap}"/>`;
    }
    // Rounded end caps coloured to match the gradient extremes.
    const [sx, sy] = pt(frac0), [ex, ey] = pt(frac1);
    paths = `<circle cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" r="${SW / 2}" fill="${cFrom}"/>` + paths +
      `<circle cx="${ex.toFixed(2)}" cy="${ey.toFixed(2)}" r="${SW / 2}" fill="${cTo}"/>`;
    return paths;
  }
  const gapFrac = total > 0 && cash > 0 && invested > 0 ? GAP / C : 0;
  const invColor = [css('--donut-invested', '#00c389'), css('--donut-invested4', '#19d3e8')] as const;
  const cashColor = [css('--donut-cash', '#003781'), css('--donut-cash4', '#d65cf0')] as const;
  const invArc = invested > 0
    ? conicArc(gapFrac / 2, Math.max(gapFrac / 2, investedFrac - gapFrac / 2), invColor[0], invColor[1]) : '';
  const cashArc = cash > 0
    ? conicArc(investedFrac + gapFrac / 2, 1 - gapFrac / 2, cashColor[0], cashColor[1]) : '';

  return `
    <div class="kpi-donut-wrap">
      <svg viewBox="0 0 200 200" class="kpi-donut" role="img" aria-label="Equity composition">
        <defs>
          <filter id="kpi-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--donut-track)" stroke-width="${SW}"/>
        <g filter="url(#kpi-glow)">${invArc}${cashArc}</g>
        ${invested > 0 && investedPct >= 9 ? arcLabel(0, investedFrac, investedPct) : ''}
        ${cash > 0 && cashPct >= 9 ? arcLabel(investedFrac, 1, cashPct) : ''}
        <text x="${CX}" y="${CY - 16}" text-anchor="middle" class="kpi-donut-label">${equityLabel}</text>
        <text x="${CX}" y="${CY + 4}" text-anchor="middle" class="kpi-donut-value">${cmoney(equity)}</text>
        <text x="${CX}" y="${CY + 22}" text-anchor="middle" class="kpi-donut-pnl" fill="${pnlColor}">${(pnlPos ? '+' : '') + cmoney(pnl)} · ${pct(opts.pnlPct)}</text>
      </svg>
      <div class="kpi-donut-keys">
        <span class="kpi-key"><span class="kpi-dot" style="background:linear-gradient(135deg,var(--donut-invested),var(--donut-invested4))"></span>${t('pf.kpi.invested')}</span>
        <span class="kpi-key"><span class="kpi-dot" style="background:linear-gradient(135deg,var(--donut-cash),var(--donut-cash4))"></span>${t('pf.stat.cash')}</span>
      </div>
    </div>`;
}

function buildOverviewHtml(): string {
  const pricesByAccount = new Map(accounts.map((a) => [a.account.id, prices(a.account.id)]));
  const compareRows = compareAccounts(accounts, pricesByAccount);

  const totalInitialCap = accounts.reduce((s, a) => s + a.account.initialCapital, 0);
  const totalEquity = accounts.reduce((s, a) => s + (computeAccountMetrics(a, prices(a.account.id)).equity), 0);
  const totalCash = accounts.reduce((s, a) => s + (computeAccountMetrics(a, prices(a.account.id)).cash), 0);
  const totalInvested = accounts.reduce((s, a) => s + (computeAccountMetrics(a, prices(a.account.id)).positionsValue), 0);
  const totalPnL = totalEquity - totalInitialCap;
  const totalPnLPct = totalInitialCap > 0 ? (totalPnL / totalInitialCap) * 100 : 0;

  const best = compareRows.length ? [...compareRows].sort((a, b) => b.totalReturnPct - a.totalReturnPct)[0]! : null;
  const worst = compareRows.length ? [...compareRows].sort((a, b) => a.totalReturnPct - b.totalReturnPct)[0]! : null;

  const totalClosedTrades = accounts.reduce((s, a) => s + a.sells.length, 0);
  const totalOpenPositions = accounts.reduce((s, a) => s + a.lots.filter((l) => l.remainingShares > 0).length, 0);

  // Weighted avg win rate
  let winRateNum = 0, winRateDen = 0;
  for (const row of compareRows) {
    winRateNum += row.winRate * row.closedTradeCount;
    winRateDen += row.closedTradeCount;
  }
  const avgWinRate = winRateDen > 0 ? winRateNum / winRateDen : 0;

  // Combined avg holding period (weighted by shares)
  let holdSum = 0, holdShares = 0;
  const todayStr = today();
  for (const a of accounts) {
    const lotById = new Map(a.lots.map((l) => [l.id, l]));
    for (const s of a.sells) {
      const lot = lotById.get(s.lotId);
      if (!lot) continue;
      holdSum += daysBetween(lot.buyDate, s.sellDate) * s.shares;
      holdShares += s.shares;
    }
    for (const l of a.lots) {
      if (l.remainingShares <= 0) continue;
      holdSum += daysBetween(l.buyDate, todayStr) * l.remainingShares;
      holdShares += l.remainingShares;
    }
  }
  const avgHoldDays = holdShares > 0 ? holdSum / holdShares : 0;

  return `
    <h1>${t('pf.title')}</h1>
    <p class="subtitle">${t('pf.sub.overview')}</p>
    ${toolbarHtml()}
    <div id="overview-update-status" style="margin-bottom:10px"></div>

    <div class="kpi-row" style="margin-bottom:14px">
      <div class="card kpi-donut-card">${kpiDonut({
        equity: totalEquity, cash: totalCash, invested: totalInvested,
        pnl: totalPnL, pnlPct: totalPnLPct,
        equityLabel: t('pf.stat.totalequity'),
      })}</div>
      <div class="grid kpi-stat-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><div class="k">${t('pf.stat.totalcap')}</div><div class="v">${money(toDisplay(totalInitialCap), dispSymbol())}</div></div>
      <div class="stat"><div class="k">${t('pf.stat.totalequity')}</div><div class="v">${money(toDisplay(totalEquity), dispSymbol())}</div></div>
      <div class="stat"><div class="k">${t('pf.stat.totalcash')}</div><div class="v">${money(toDisplay(totalCash), dispSymbol())}</div></div>
      <div class="stat"><div class="k">${t('pf.stat.totalpnl')}</div><div class="v" style="color:${totalPnL >= 0 ? 'var(--accent)' : 'var(--danger)'}">${money(toDisplay(totalPnL), dispSymbol())} (${pct(totalPnLPct)})</div></div>
      <div class="stat"><div class="k">${t('pf.stat.best')}</div><div class="v" style="color:var(--accent)">${best ? `${best.name} · ${pct(best.totalReturnPct)}` : '—'}</div></div>
      <div class="stat"><div class="k">${t('pf.stat.worst')}</div><div class="v" style="color:var(--danger)">${worst && worst.totalReturnPct < 0 ? `${worst.name} · ${pct(worst.totalReturnPct)}` : '—'}</div></div>
      <div class="stat"><div class="k">${t('pf.stat.avgwinrate')}</div><div class="v">${num(avgWinRate * 100, 0)}%</div></div>
      <div class="stat"><div class="k">${t('pf.stat.openclosed')}</div><div class="v">${totalOpenPositions} / ${totalClosedTrades}</div></div>
      <div class="stat"><div class="k">${t('pf.stat.avghold')}</div><div class="v">${holdShares > 0 ? num(avgHoldDays, 0) + ' days' : '—'}</div></div>
      </div>
    </div>

    <div class="section-title-row">
      <span class="section-title" style="margin:0">${t('pf.overview.compare')}</span>
      ${accounts.length < 2
        ? `<span class="hint-chip"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>${t('pf.addacct.hint')}</span>`
        : `<span class="hint-chip"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 2l3.5 11 1.8-4.4L12.7 7 3 2z" fill="currentColor"/></svg>${t('pf.clickacct')}</span>`}
    </div>
    <div class="card" style="overflow-x:auto;margin-bottom:14px">
      <table><thead><tr><th>${t('pf.col.account')}</th><th>${t('pf.col.return')}</th><th>${t('pf.col.equity2')}</th><th>${t('pf.col.winrate')}</th><th>${t('pf.stat.expectancy')}</th><th>${t('pf.col.avgr')}</th><th>${t('pf.col.maxdd')}</th><th>${t('pf.col.openrisk')}</th><th>${t('pf.col.open')}</th><th>${t('pf.col.closed')}</th></tr></thead>
      <tbody>${compareRows
        .map(
          (r) =>
            `<tr><td><a href="#" class="link-ticker" data-acct-open="${r.accountId}"><strong>${r.name}</strong></a></td><td style="color:${r.totalReturnPct >= 0 ? 'var(--accent)' : 'var(--danger)'}">${pct(r.totalReturnPct)}</td><td>${money(toDisplay(r.equity), dispSymbol())}</td><td>${num(r.winRate * 100, 0)}%</td><td>${money(toDisplay(r.expectancy), dispSymbol())}</td><td>${num(r.avgRMultiple, 2)}R</td><td>${num(r.maxDrawdownPct, 1)}%</td><td>${num(r.totalOpenRiskPct, 1)}%</td><td>${r.openTradeCount}</td><td>${r.closedTradeCount}</td></tr>`,
        )
        .join('')}</tbody></table>
    </div>

    <div class="card" style="margin-bottom:14px;padding:8px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 6px 8px">
        <span class="section-title" style="margin:0">${t('pf.overview.combined')}</span>
        <div class="toolbar" style="margin:0;gap:4px">
          <button class="range-btn active" data-pf-view="equity">${t('pf.chart.equity')}</button>
          <button class="range-btn" data-pf-view="candle">${t('pf.chart.candle')}</button>
        </div>
        <div class="toolbar" style="margin:0;gap:4px">
          <button class="range-btn${pfShowCash ? ' active' : ''}" id="pf-cash-toggle" title="Toggle cash inclusion">+Cash</button>
        </div>
        <div class="toolbar" style="margin:0;gap:4px" id="pf-range-bar">
          <button class="range-btn active" data-pf-range="all">All</button>
          <button class="range-btn" data-pf-range="5y">5Y</button>
          <button class="range-btn" data-pf-range="2y">2Y</button>
          <button class="range-btn" data-pf-range="1y">1Y</button>
          <button class="range-btn" data-pf-range="6m">6M</button>
        </div>
        <div class="toolbar" style="margin:0;gap:4px" id="pf-ema-bar">
          <button class="range-btn" data-pf-ema="5">EMA5</button>
          <button class="range-btn" data-pf-ema="10">EMA10</button>
          <button class="range-btn" data-pf-ema="21">EMA21</button>
          <button class="range-btn" data-pf-ema="50">EMA50</button>
          <button class="range-btn" data-pf-ema="150">EMA150</button>
          <button class="range-btn" data-pf-ema="200">EMA200</button>
        </div>
      </div>
      <div id="portfolio-chart" style="height:260px"></div>
    </div>`;
}

function wireOverview(ctx: AppContext, root: HTMLElement): void {
  // EUR/USD display toggle
  const ccyBtn = root.querySelector<HTMLElement>('#pf-ccy-toggle');
  if (ccyBtn) {
    ccyBtn.addEventListener('click', () => {
      displayCurrency = displayCurrency === 'EUR' ? 'USD' : 'EUR';
      draw(ctx);
    });
  }

  // Overview button (always shown)
  root.querySelectorAll<HTMLElement>('[data-acct]').forEach((b) =>
    b.addEventListener('click', () => {
      activeId = b.dataset.acct!;
      draw(ctx);
    }),
  );

  // Account dropdown — replaces the old flat button row
  const acctSelect = root.querySelector<HTMLSelectElement>('#pf-acct-select');
  if (acctSelect) {
    acctSelect.addEventListener('change', () => {
      if (acctSelect.value) { activeId = acctSelect.value; draw(ctx); }
    });
  }

  // new account
  root.querySelector('#acct-new')!.addEventListener('click', async () => {
    const res = await formDialog('New account', [
      { key: 'name', label: 'Account name', value: `Strategy ${String.fromCharCode(65 + accounts.length)}` },
      { key: 'cap', label: 'Initial capital (EUR)', type: 'number', value: '50000' },
    ]);
    if (!res || !res.name) return;
    const cap = Number(res.cap) > 0 ? Number(res.cap) : 50000;
    accounts.push(createAccount({ name: res.name, initialCapital: cap, currency: 'EUR', createdAt: today() }, uuid));
    activeId = accounts[accounts.length - 1]!.account.id;
    await save(ctx);
    draw(ctx);
  });

  // account cards — click to open
  root.querySelectorAll<HTMLElement>('[data-acct-open]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      activeId = (a.dataset.acctOpen ?? a.closest<HTMLElement>('[data-acct-open]')?.dataset.acctOpen)!;
      draw(ctx);
      $('#tab-portfolio')!.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }),
  );

  // Update All — runs update() for each account sequentially and shows progress
  const updateAllBtn = root.querySelector<HTMLElement>('#acct-update-all');
  if (updateAllBtn) {
    updateAllBtn.addEventListener('click', async () => {
      const statusEl = root.querySelector<HTMLElement>('#overview-update-status');
      const savedActiveId = activeId;
      (updateAllBtn as HTMLButtonElement).disabled = true;
      const total = accounts.length;
      for (let i = 0; i < accounts.length; i++) {
        const acct = accounts[i]!;
        if (statusEl) statusEl.innerHTML = `<span class="status-chip status-chip--loading"><span class="spinner"></span>${t('pf.updating')} ${acct.account.name} (${i + 1}/${total})…</span>`;
        activeId = acct.account.id;
        await update(ctx);
      }
      activeId = savedActiveId;
      draw(ctx);
      const s = root.querySelector<HTMLElement>('#overview-update-status');
      if (s) s.innerHTML = `<span class="status-chip status-chip--ok"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8l4 4 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${total} ${t('pf.updated.all')}</span>`;
    });
  }

  // combined portfolio chart
  const byDateEquity = new Map<string, { equity: number; positionsValue: number }>();
  for (const acct of accounts) {
    for (const s of acct.snapshots) {
      const ex = byDateEquity.get(s.date) ?? { equity: 0, positionsValue: 0 };
      ex.equity += s.equity;
      ex.positionsValue += s.positionsValue;
      byDateEquity.set(s.date, ex);
    }
  }
  const combinedEquityPoints = [...byDateEquity.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([time, v]) => ({ time, equity: v.equity, positionsValue: v.positionsValue }));
  const totalInitialCap = accounts.reduce((s, a) => s + a.account.initialCapital, 0);

  // Merge portfolio bars (with cash) and positions-only bars across all accounts
  const mergedPortfolio = new Map<string, Bar>();
  const mergedPortfolioNoCash = new Map<string, Bar>();
  for (const acct of accounts) {
    const cache = (acct as AccountState & { _candleCache?: ReturnType<typeof buildCandleSeries> })._candleCache;
    for (const b of cache?.portfolio ?? []) {
      const ex = mergedPortfolio.get(b.date);
      if (ex) { ex.open += b.open; ex.high += b.high; ex.low += b.low; ex.close += b.close; }
      else mergedPortfolio.set(b.date, { ...b });
    }
    for (const b of cache?.portfolioNoCash ?? []) {
      const ex = mergedPortfolioNoCash.get(b.date);
      if (ex) { ex.open += b.open; ex.high += b.high; ex.low += b.low; ex.close += b.close; }
      else mergedPortfolioNoCash.set(b.date, { ...b });
    }
  }
  const combinedPortfolioBars = [...mergedPortfolio.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const combinedPortfolioNoCashBars = [...mergedPortfolioNoCash.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  const pfEl = root.querySelector<HTMLElement>('#portfolio-chart')!;
  let pfView: 'equity' | 'candle' = 'equity';
  let pfRange = 'all';
  let pfEma: Record<number, boolean> = { 5: false, 10: false, 21: false, 50: false, 150: false, 200: false };
  let pfCandleChart: ReturnType<typeof drawCandles> | null = null;

  function sliceRange(bars: { time?: string; date?: string; value?: number }[], range: string) {
    if (range === 'all') return bars;
    const days = range === '6m' ? 182 : range === '1y' ? 365 : range === '2y' ? 730 : 1825;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    return bars.filter((b) => ((b as { time?: string; date?: string }).time ?? (b as { date?: string }).date ?? '') >= cutoff);
  }
  function sliceBars(bars: Bar[], range: string): Bar[] {
    return sliceRange(bars as unknown as { time?: string; date?: string }[], range) as unknown as Bar[];
  }
  function slicePoints(pts: { time: string; value: number }[], range: string) {
    return sliceRange(pts as { time?: string; date?: string; value?: number }[], range) as { time: string; value: number }[];
  }

  function renderPfChart() {
    if (pfCandleChart) { try { pfCandleChart.destroy(); } catch { /* ignore */ } pfCandleChart = null; }
    const dispCap = toDisplay(totalInitialCap);
    if (pfView === 'equity') {
      const pts = slicePoints(
        combinedEquityPoints.map((p) => ({
          time: p.time,
          value: toDisplay(pfShowCash ? p.equity : p.positionsValue, p.time),
        })),
        pfRange,
      );
      if (pts.length) {
        const baseline = pfShowCash ? dispCap : 0;
        try { drawLine(pfEl, pts, { baseline, money: true, currency: dispSymbol(), height: 260 }); }
        catch { pfEl.innerHTML = noDataHtml(t('pf.unavailable')); }
      } else {
        pfEl.innerHTML = noDataHtml(t('pf.nodata.overview'));
      }
    } else {
      const rawBars = pfShowCash ? combinedPortfolioBars : combinedPortfolioNoCashBars;
      const scaledCombined = scaleBarsForDisplay(rawBars, accounts[0]?.account.currency ?? 'EUR');
      const bars = sliceBars(scaledCombined, pfRange);
      if (bars.length) {
        try { pfCandleChart = drawCandles(pfEl, bars, null, pfEma, { noVolume: true, height: 260, maxLine: true, minLine: true }); }
        catch { pfEl.innerHTML = noDataHtml(t('pf.unavailable')); }
      } else {
        pfEl.innerHTML = noDataHtml(t('pf.nodata.overview'));
      }
    }
    const emaBar = root.querySelector<HTMLElement>('#pf-ema-bar');
    if (emaBar) emaBar.style.display = pfView === 'candle' ? '' : 'none';
  }
  if (pfEl) renderPfChart();

  const cashToggleBtn2 = root.querySelector<HTMLElement>('#pf-cash-toggle');
  cashToggleBtn2?.addEventListener('click', () => {
    pfShowCash = !pfShowCash;
    cashToggleBtn2.classList.toggle('active', pfShowCash);
    renderPfChart();
  });

  root.querySelectorAll<HTMLElement>('[data-pf-view]').forEach((b) =>
    b.addEventListener('click', () => {
      pfView = b.dataset.pfView as 'equity' | 'candle';
      root.querySelectorAll('[data-pf-view]').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      renderPfChart();
    }),
  );
  root.querySelectorAll<HTMLElement>('[data-pf-range]').forEach((b) =>
    b.addEventListener('click', () => {
      pfRange = b.dataset.pfRange!;
      root.querySelectorAll('[data-pf-range]').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      renderPfChart();
    }),
  );
  root.querySelectorAll<HTMLElement>('[data-pf-ema]').forEach((b) =>
    b.addEventListener('click', () => {
      const p = Number(b.dataset.pfEma);
      pfEma[p] = !pfEma[p];
      b.classList.toggle('active', pfEma[p]);
      if (pfCandleChart) pfCandleChart.setEma(p, pfEma[p]);
    }),
  );

  attachTooltips(root);
}
