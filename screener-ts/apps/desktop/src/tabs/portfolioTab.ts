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
): void {
  const tickerEl = $(tickerSel) as HTMLInputElement | null;
  const hintEl = $(hintSel);
  const priceEl = $(priceSel) as HTMLInputElement | null;
  if (!tickerEl || !hintEl || !priceEl) return;
  const dateEl = dateSel ? ($(dateSel) as HTMLInputElement | null) : null;

  const todayStr = new Date().toISOString().slice(0, 10);

  let token = 0;
  const fetchHint = async () => {
    const sym = tickerEl.value.trim().toUpperCase();
    if (!sym) {
      hintEl.innerHTML = '';
      return;
    }
    // If a past date is chosen, fetch enough history to cover it and show the
    // close ON (or the last trading day before) that date — so a back-dated
    // buy/sell auto-fills the correct historical price.
    const wantDate = dateEl?.value && dateEl.value < todayStr ? dateEl.value : null;
    const mine = ++token;
    hintEl.innerHTML = `<span class="spinner"></span> ${wantDate ? `close on ${wantDate}…` : 'latest close…'}`;
    const ohlcv = await ctx.data.getOHLCV(sym, wantDate ? '5y' : '1mo').catch(() => null);
    if (mine !== token) return; // a newer lookup superseded this one
    if (!ohlcv || !ohlcv.bars.length) {
      hintEl.textContent = 'no price data';
      return;
    }
    // Pick the bar at-or-before the wanted date (markets close on weekends/holidays).
    const bar = wantDate
      ? [...ohlcv.bars].reverse().find((b) => b.date <= wantDate) ?? null
      : ohlcv.bars[ohlcv.bars.length - 1]!;
    if (!bar) {
      hintEl.textContent = `no price on/before ${wantDate}`;
      return;
    }
    const label = wantDate ? 'close' : 'latest close';
    hintEl.innerHTML = `${label} <b>$${num(bar.close)}</b> (${bar.date}) · <a href="#" data-use>use</a>`;
    hintEl.querySelector('[data-use]')!.addEventListener('click', (e) => {
      e.preventDefault();
      priceEl.value = String(num(bar.close));
    });
  };
  tickerEl.addEventListener('change', () => void fetchHint());
  tickerEl.addEventListener('blur', () => void fetchHint());
  // Re-price when the date changes so the hint always matches the chosen day.
  dateEl?.addEventListener('change', () => void fetchHint());
}

const ACCT_KEY = 'accounts';
const OVERVIEW_ID = '__overview__';
const uuid: IdFactory = () =>
  (globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2));
const today = () => new Date().toISOString().slice(0, 10);

let accounts: AccountState[] = [];
let activeId: string = OVERVIEW_ID;

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
  if (activeId !== OVERVIEW_ID && !accounts.some((a) => a.account.id === activeId)) activeId = OVERVIEW_ID;
  // Pre-populate barMapByAccount so row charts work before first Update click
  for (const acct of accounts) {
    if (!barMapByAccount.has(acct.account.id)) {
      void loadBarCache(ctx, acct.account.id).then((bc) => {
        barMapByAccount.set(acct.account.id, new Map(Object.entries(bc)));
      });
    }
  }
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

  const prevClose = new Map<string, number>();
  function getClose(sym: string, date: string): number | null {
    const b = barByTickerDate.get(sym)?.get(date);
    if (b) { prevClose.set(sym, b.close); return b.close; }
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
  draw(ctx);
}

function toolbarHtml(): string {
  return `<div class="toolbar">
      <button class="range-btn ${activeId === OVERVIEW_ID ? 'active' : ''}" data-acct="${OVERVIEW_ID}">Overview</button>
      ${accounts
        .map(
          (a) =>
            `<button class="range-btn ${a.account.id === activeId ? 'active' : ''}" data-acct="${a.account.id}">${a.account.name}</button>`,
        )
        .join('')}
      <button id="acct-new" class="range-btn">＋ New account</button>
      <button id="acct-edit" class="range-btn"${activeId === OVERVIEW_ID ? ' disabled' : ''}>✎ Edit account</button>
      <button id="acct-delete" class="range-btn"${activeId === OVERVIEW_ID ? ' disabled' : ''}>🗑 Delete account</button>
      <button id="acct-update" class="btn" style="margin-left:auto"${activeId === OVERVIEW_ID ? ' disabled title="Switch to an individual account to update prices"' : ''}>↻ Update</button>
      <button id="acct-clear-cache" class="btn-outline"${activeId === OVERVIEW_ID ? ' disabled' : ''} title="Wipe cached price bars so next update re-fetches full history">Clear cache</button>
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
    <h1>Paper Trading</h1>
    <p class="subtitle">Independent multi-account strategy testing. All cash, PnL and risk are per account.</p>
    ${toolbarHtml()}
    <div id="update-status" class="muted" style="margin-bottom:10px"></div>

    <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px">
      <div class="stat"><div class="k">Initial capital</div><div class="v">${money(st.account.initialCapital)}</div></div>
      <div class="stat"><div class="k">Equity</div><div class="v">${money(m.equity)}</div></div>
      <div class="stat"><div class="k">Cash</div><div class="v">${money(m.cash)}</div></div>
      <div class="stat"><div class="k">Total PnL</div><div class="v" style="color:${m.totalPnL >= 0 ? 'var(--accent)' : 'var(--danger)'}">${money(m.totalPnL)} (${pct(m.totalPnLPct)})</div></div>
      <div class="stat"><div class="k">Open risk</div><div class="v">${money(m.totalOpenRiskEur)} (${pct(m.totalOpenRiskPct)})</div></div>
      <div class="stat"><div class="k">Realized / Unrealized</div><div class="v">${money(m.realizedPnL)} / ${money(m.unrealizedPnL)}</div></div>
      <div class="stat"><div class="k">Win rate</div><div class="v">${num(m.winRate * 100, 0)}%</div></div>
      <div class="stat"><div class="k">Avg R / Expectancy</div><div class="v">${num(m.avgRMultiple, 2)}R / ${money(m.expectancy)}</div></div>
      <div class="stat"><div class="k">Max drawdown</div><div class="v">${num(m.maxDrawdownPct, 1)}%</div></div>
      <div class="stat"><div class="k">Avg holding period</div><div class="v">${avgHold.count ? num(avgHold.days, 0) + ' days' : '—'}</div></div>
    </div>

    <div class="card" style="margin-bottom:14px;padding:8px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 6px 8px">
        <span class="section-title" style="margin:0">Portfolio</span>
        <div class="toolbar" style="margin:0;gap:4px">
          <button class="range-btn" data-pf-view="equity">Equity</button>
          <button class="range-btn active" data-pf-view="candle">Candle</button>
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

    <div class="section-title">Open Positions <span class="muted" style="text-transform:none;font-weight:400">— click a ticker to open its chart</span></div>
    <div class="card" style="overflow-x:auto;margin-bottom:14px">
      <table style="white-space:nowrap"><thead><tr>
        <th>Ticker ${infoIcon('pf_ticker')}</th>
        <th>Shares ${infoIcon('pf_shares')}</th>
        <th>Avg cost ${infoIcon('pf_avgcost')}</th>
        <th>Last ${infoIcon('pf_last')}</th>
        <th>Mkt value ${infoIcon('pf_mktval')}</th>
        <th>Unreal. PnL ${infoIcon('pf_unrealpnl')}</th>
        <th>Risk ${infoIcon('pf_risk')}</th>
        <th>R ${infoIcon('pf_rmult')}</th>
        <th>Stop ${infoIcon('pf_stop')}</th>
        <th>Target ${infoIcon('pf_target')}</th>
        <th>Days ${infoIcon('pf_days')}</th>
        <th>Conc. ${infoIcon('pf_conc')}</th>
        <th>Actions ${infoIcon('pf_actions')}</th>
      </tr></thead>
      <tbody>${
        positions.length
          ? positions
              .map(
                (pos) =>
                  `<tr><td><a href="#" class="link-ticker" data-open="${pos.ticker}"><strong>${pos.ticker}</strong></a></td><td>${pos.shares}</td><td>$${num(pos.avgCost)}</td><td>$${num(pos.lastPrice)}</td><td>${money(pos.marketValue)}</td>
          <td style="color:${pos.unrealizedPnL >= 0 ? 'var(--accent)' : 'var(--danger)'}">${money(pos.unrealizedPnL)} (${pct(pos.unrealizedPnLPct)})</td>
          <td>${pos.riskEur != null ? money(pos.riskEur) : '<span class="warn">—</span>'}</td>
          <td>${pos.rMultiple != null ? num(pos.rMultiple, 2) + 'R' : '—'}</td>
          <td>${pos.stop != null ? '$' + num(pos.stop) : '<span class="warn">none</span>'}</td>
          <td>${pos.target != null ? '$' + num(pos.target) : '—'}</td>
          <td>${pos.daysHeld}</td><td>${num(pos.concentrationPct, 0)}%</td>
          <td class="row" style="gap:4px;flex-wrap:nowrap">
            <button class="action-btn action-btn--stop" data-stop="${pos.ticker}" title="${pos.stop != null ? 'Edit stop-loss level' : 'Set stop-loss level'}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1v7m0 0 3-3M8 8 5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="1" y="11" width="14" height="3" rx="1" fill="currentColor" opacity=".35"/></svg>Stop</button>
            <button class="action-btn action-btn--target" data-target="${pos.ticker}" title="Set profit target"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r=".8" fill="currentColor"/></svg>Target</button>
            <button class="action-btn action-btn--sell" data-sell="${pos.ticker}" title="Record a partial or full sell"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 8h12M9 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Sell</button>
            <button class="action-btn action-btn--chart" data-open-chart="${pos.ticker}" data-chart-from="${st.lots.filter((l) => l.ticker === pos.ticker).map((l) => l.buyDate).sort()[0] ?? ''}" data-chart-shares="${pos.shares}" title="Show price × shares chart"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M1 14 5 9l3 3 3-4 4-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Chart</button></td></tr>`,
              )
              .join('')
          : `<tr><td colspan="13" class="muted" style="text-align:center;padding:20px">No open positions.</td></tr>`
      }</tbody></table>
    </div>
    <p class="muted" style="font-size:11px;margin:-6px 0 14px">
      <b>Stop</b> = exit level that caps your loss (risk = entry − stop). <b>Target</b> = your profit objective.
      Set or edit either anytime with the buttons above; risk recalculates. Clearing the stop removes it.
    </p>

    <div class="section-title">Transaction History</div>
    <div class="card" style="overflow-x:auto;margin-bottom:4px">${transactionHistoryHtml(st)}</div>
    <div id="closed-chart-panel" style="margin-bottom:14px"></div>

    <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
      <div class="card">
        <div class="section-title" style="margin-top:0">Record a Buy / Sell</div>
        <div class="row"><input id="b-ticker" class="field" autocomplete="off" placeholder="Ticker" style="width:110px" />
          <input id="b-shares" class="field" type="number" placeholder="Shares" style="width:90px" />
          <input id="b-price" class="field" type="number" step="any" placeholder="Price" style="width:90px" />
          <input id="b-date" class="field" type="date" value="${today()}" /></div>
        <div id="b-pricehint" class="price-hint"></div>
        <div class="row" style="margin-top:8px"><input id="b-stop" class="field" type="number" step="any" placeholder="Stop (optional)" style="width:130px" />
          <input id="b-target" class="field" type="number" step="any" placeholder="Target (optional)" style="width:130px" />
          <button id="b-go" class="btn">Buy</button>
          <button id="s-go" class="btn-outline">Sell</button></div>
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
  // account switch / new
  root.querySelectorAll<HTMLElement>('[data-acct]').forEach((b) =>
    b.addEventListener('click', () => {
      activeId = b.dataset.acct!;
      draw(ctx);
    }),
  );
  $('#acct-new')!.addEventListener('click', async () => {
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
    let pfView: 'equity' | 'candle' = 'candle';
    let pfRange = 'all';
    let pfEma: Record<number, boolean> = { 5: false, 10: false, 21: false, 50: false, 150: false, 200: false };
    let pfCandleChart: ReturnType<typeof drawCandles> | null = null;

    const equityPoints = (() => {
      const byDate = new Map<string, number>();
      for (const s of stChart.snapshots) byDate.set(s.date, s.equity);
      return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([time, value]) => ({ time, value }));
    })();

    function renderPfChart() {
      if (pfCandleChart) { try { pfCandleChart.destroy(); } catch { /* ignore */ } pfCandleChart = null; }
      if (pfView === 'equity') {
        const pts = slicePoints(equityPoints, pfRange);
        if (pts.length) {
          try { drawLine(pfEl, pts, { baseline: stChart.account.initialCapital, money: true, currency: currSym, height: 260, maxLine: true, minLine: true, currentLine: true }); }
          catch { pfEl.innerHTML = `<div class=”muted” style=”text-align:center;padding:60px”>Chart unavailable.</div>`; }
        } else {
          pfEl.innerHTML = `<div class=”muted” style=”text-align:center;padding:60px”>No data yet — click <strong>Update</strong> first.</div>`;
        }
      } else {
        const bars = sliceBars(cache?.portfolio ?? [], pfRange);
        if (bars.length) {
          try { pfCandleChart = drawCandles(pfEl, bars, null, pfEma, { noVolume: true, height: 260, maxLine: true, minLine: true }); }
          catch { pfEl.innerHTML = `<div class=”muted” style=”text-align:center;padding:60px”>Chart unavailable.</div>`; }
        } else {
          pfEl.innerHTML = `<div class=”muted” style=”text-align:center;padding:60px”>No data yet — click <strong>Update</strong> first.</div>`;
        }
      }
      const emaBar = $('#pf-ema-bar');
      if (emaBar) emaBar.style.display = pfView === 'candle' ? '' : 'none';
    }
    renderPfChart();

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

    // ── Per-position row chart panel ────────────────────────────────────────────
    // Uses _candleCache.positions — same source as the portfolio chart, so no
    // async file I/O is needed. Bars are already scaled by shares held.
    const closedChartPanel = $('#closed-chart-panel')!;
    let rowCandleChart: ReturnType<typeof drawCandles> | null = null;
    let rowActiveBtn: HTMLElement | null = null;

    function openRowChart(b: HTMLElement, ticker: string, fromDate: string, toDate: string) {
      if (rowActiveBtn === b) {
        if (rowCandleChart) { try { rowCandleChart.destroy(); } catch { /* ignore */ } rowCandleChart = null; }
        closedChartPanel.innerHTML = '';
        rowActiveBtn = null;
        b.classList.remove('active');
        return;
      }
      rowActiveBtn?.classList.remove('active');
      rowActiveBtn = b;
      b.classList.add('active');

      // Bars from _candleCache — already scaled by shares, spanning the holding period
      const posBars: Bar[] = cache?.positions.find((p) => p.ticker === ticker)?.bars ?? [];

      const todayStr = new Date().toISOString().slice(0, 10);
      const holdDaysCount = fromDate ? daysBetween(fromDate, toDate || todayStr) : null;
      const dateRange = fromDate
        ? `${fromDate}<span style=”opacity:.45;padding:0 4px”>→</span>${toDate || 'now'}<span class=”pos-chart-days”>${holdDaysCount}d</span>`
        : 'Full history';

      closedChartPanel.innerHTML = `
        <div class=”card” style=”padding:8px”>
          <div class=”pos-chart-header”>
            <div class=”pos-chart-id”>
              <span class=”pos-chart-ticker”>${ticker}</span>
              <span class=”pos-chart-dates”>${dateRange}</span>
            </div>
            <div style=”display:flex;gap:6px;flex-wrap:wrap;align-items:center”>
              <div class=”toolbar” style=”margin:0;gap:3px”>
                <button class=”range-btn active” data-cl-view=”candle”>Candle</button>
                <button class=”range-btn” data-cl-view=”equity”>Equity</button>
              </div>
              <div class=”toolbar” style=”margin:0;gap:4px” id=”cl-ema-bar”>
                <button class=”range-btn” data-cl-ema=”5”>EMA5</button>
                <button class=”range-btn” data-cl-ema=”10”>EMA10</button>
                <button class=”range-btn” data-cl-ema=”21”>EMA21</button>
                <button class=”range-btn” data-cl-ema=”50”>EMA50</button>
                <button class=”range-btn” data-cl-ema=”150”>EMA150</button>
                <button class=”range-btn” data-cl-ema=”200”>EMA200</button>
              </div>
            </div>
          </div>
          <div id=”row-chart” style=”height:260px”></div>
        </div>`;

      let clView: 'candle' | 'equity' = 'candle';
      let clEma: Record<number, boolean> = { 5: false, 10: false, 21: false, 50: false, 150: false, 200: false };
      if (rowCandleChart) { try { rowCandleChart.destroy(); } catch { /* ignore */ } rowCandleChart = null; }

      function renderRowChart() {
        const chartEl = closedChartPanel.querySelector<HTMLElement>('#row-chart');
        if (!chartEl) return;
        if (rowCandleChart) { try { rowCandleChart.destroy(); } catch { /* ignore */ } rowCandleChart = null; }
        const emaBar = closedChartPanel.querySelector<HTMLElement>('#cl-ema-bar');
        if (emaBar) emaBar.style.display = clView === 'candle' ? '' : 'none';

        if (!posBars.length) {
          chartEl.innerHTML = `<div class=”muted” style=”text-align:center;padding:40px”>No price data for <strong>${ticker}</strong> — click <strong>Update</strong> first.</div>`;
          return;
        }
        chartEl.innerHTML = '';
        if (clView === 'candle') {
          try { rowCandleChart = drawCandles(chartEl, posBars, null, clEma, { noVolume: true, height: 260, maxLine: true, minLine: true }); }
          catch (e) { chartEl.innerHTML = `<div class=”muted” style=”text-align:center;padding:40px”>Chart error: ${(e as Error).message}</div>`; }
        } else {
          const pts = posBars.map((bar) => ({ time: bar.date, value: bar.close }));
          try { drawLine(chartEl, pts, { money: true, currency: currSym, height: 260, maxLine: true, minLine: true, currentLine: true }); }
          catch (e) { chartEl.innerHTML = `<div class=”muted” style=”text-align:center;padding:40px”>Chart error: ${(e as Error).message}</div>`; }
        }
      }
      renderRowChart();

      closedChartPanel.querySelectorAll<HTMLElement>('[data-cl-view]').forEach((vb) =>
        vb.addEventListener('click', () => {
          clView = vb.dataset.clView as 'candle' | 'equity';
          closedChartPanel.querySelectorAll('[data-cl-view]').forEach((x) => x.classList.remove('active'));
          vb.classList.add('active');
          renderRowChart();
        }),
      );
      closedChartPanel.querySelectorAll<HTMLElement>('[data-cl-ema]').forEach((eb) =>
        eb.addEventListener('click', () => {
          const p = Number(eb.dataset.clEma);
          clEma[p] = !clEma[p];
          eb.classList.toggle('active', clEma[p]);
          if (rowCandleChart) rowCandleChart.setEma(p, clEma[p]);
        }),
      );
    }

    root.querySelectorAll<HTMLElement>('[data-closed-chart]').forEach((b) =>
      b.addEventListener('click', () => openRowChart(b, b.dataset.closedChart!, b.dataset.chartFrom ?? '', b.dataset.chartTo ?? '')),
    );
    root.querySelectorAll<HTMLElement>('[data-open-chart]').forEach((b) =>
      b.addEventListener('click', () => openRowChart(b, b.dataset.openChart!, b.dataset.chartFrom ?? '', '')),
    );

    // orders list
    renderOrders(ctx);

    // Styled ticker comboboxes + live latest-close hints.
    const tickers = tickerList();
    attachCombobox({ input: $('#b-ticker') as HTMLInputElement, options: tickers });
    attachCombobox({ input: $('#o-ticker') as HTMLInputElement, options: tickers });
    wirePriceHint(ctx, '#b-ticker', '#b-pricehint', '#b-price', '#b-date');
    wirePriceHint(ctx, '#o-ticker', '#o-pricehint', '#o-thresh');

    // buy
    $('#b-go')!.addEventListener('click', async () => {
      const t = ($('#b-ticker') as HTMLInputElement).value.trim().toUpperCase();
      const shares = Number(($('#b-shares') as HTMLInputElement).value);
      const price = Number(($('#b-price') as HTMLInputElement).value);
      const date = ($('#b-date') as HTMLInputElement).value || today();
      const stop = Number(($('#b-stop') as HTMLInputElement).value) || undefined;
      const target = Number(($('#b-target') as HTMLInputElement).value) || undefined;
      if (!t || shares <= 0 || price <= 0) return;
      buy(active(), { ticker: t, buyDate: date, buyPrice: price, shares, stop, target }, uuid);
      seedPrice(active().account.id, t, price);
      snapshotNow(active());
      await save(ctx);
      draw(ctx);
    });

    // sell from the form (manual ticker/shares/price/date)
    $('#s-go')!.addEventListener('click', async () => {
      const t = ($('#b-ticker') as HTMLInputElement).value.trim().toUpperCase();
      const shares = Number(($('#b-shares') as HTMLInputElement).value);
      const price = Number(($('#b-price') as HTMLInputElement).value);
      const date = ($('#b-date') as HTMLInputElement).value || today();
      if (!t || shares <= 0 || price <= 0) return;
      try {
        sell(active(), { ticker: t, sellDate: date, sellPrice: price, shares }, uuid);
        seedPrice(active().account.id, t, price);
        snapshotNow(active());
        await save(ctx);
        draw(ctx);
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
        const initPrice = priceForDate(today());
        const res = await formDialog(`Sell ${t}`, [
          { key: 'shares', label: 'Shares to sell', type: 'number' },
          { key: 'price', label: 'Sell price', type: 'number', value: initPrice },
          { key: 'date', label: 'Date', type: 'date', value: today() },
        ], { onChange: (vals) => ({ price: priceForDate(vals.date ?? today()) }) });
        if (!res) return;
        const shares = Number(res.shares);
        const price = Number(res.price);
        if (shares <= 0 || price <= 0) return;
        try {
          sell(active(), { ticker: t, sellDate: res.date || today(), sellPrice: price, shares }, uuid);
          seedPrice(active().account.id, t, price);
          snapshotNow(active());
          await save(ctx);
          draw(ctx);
        } catch (e) {
          alert((e as Error).message);
        }
      }),
    );

    // set / edit the stop on every open lot of a ticker
    root.querySelectorAll<HTMLElement>('[data-stop]').forEach((b) =>
      b.addEventListener('click', async () => {
        const t = b.dataset.stop!;
        const cur = active().lots.find((l) => l.ticker === t && l.remainingShares > 0)?.stop;
        const res = await formDialog(`Stop-loss for ${t}`, [
          { key: 'stop', label: 'Stop price (blank to clear)', type: 'number', value: cur != null ? String(cur) : '' },
        ]);
        if (!res) return;
        const stop = res.stop === '' ? undefined : Number(res.stop);
        for (const l of active().lots) {
          if (l.ticker === t && l.remainingShares > 0) setStop(active(), l.id, stop);
        }
        await save(ctx);
        draw(ctx);
      }),
    );

    // set / edit the target on every open lot of a ticker
    root.querySelectorAll<HTMLElement>('[data-target]').forEach((b) =>
      b.addEventListener('click', async () => {
        const t = b.dataset.target!;
        const cur = active().lots.find((l) => l.ticker === t && l.remainingShares > 0)?.target;
        const res = await formDialog(`Target for ${t}`, [
          { key: 'target', label: 'Target price (blank to clear)', type: 'number', value: cur != null ? String(cur) : '' },
        ]);
        if (!res) return;
        const target = res.target === '' ? undefined : Number(res.target);
        for (const l of active().lots) {
          if (l.ticker === t && l.remainingShares > 0) l.target = target;
        }
        await save(ctx);
        draw(ctx);
      }),
    );

    // delete a single SELL (returns the shares to its lot) — testing convenience
    root.querySelectorAll<HTMLElement>('[data-del-sell]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Delete this sell? The shares return to the open position.')) return;
        deleteSell(active(), b.dataset.delSell!);
        snapshotNow(active());
        await save(ctx);
        draw(ctx);
      }),
    );

    // delete a BUY lot (and any sells matched to it)
    root.querySelectorAll<HTMLElement>('[data-del-lot]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Delete this buy and any of its sells? All figures recompute.')) return;
        deleteLot(active(), b.dataset.delLot!);
        snapshotNow(active());
        await save(ctx);
        draw(ctx);
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
      const pnl = r.pnl == null ? '—' : `<span style="color:${r.pnl >= 0 ? 'var(--accent)' : 'var(--danger)'}">${money(r.pnl)}</span>`;
      const heldDays = r.holdDays != null ? r.holdDays : daysBetween(r.buyDate, todayStr);
      const chartTo = r.status === 'CLOSED' ? (r.sellDate ?? '') : '';
      const chartBtn = `<button class="action-btn action-btn--chart" data-closed-chart="${r.ticker}" data-chart-from="${r.buyDate}" data-chart-to="${chartTo}" data-chart-shares="${r.shares}" title="Show price × shares chart"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M1 14 5 9l3 3 3-4 4-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Chart</button>`;
      return `<tr>
        <td><span class="badge" style="background:color-mix(in srgb,${c} 16%,transparent);color:${c}">${r.status}</span></td>
        <td><a href="#" class="link-ticker" data-open="${r.ticker}"><strong>${r.ticker}</strong></a></td>
        <td>${r.shares}</td>
        <td>$${num(r.buyPrice)}</td>
        <td>${r.sellPrice != null ? '$' + num(r.sellPrice) : '—'}</td>
        <td>${r.buyDate}</td>
        <td>${r.sellDate ?? '—'}</td>
        <td>${heldDays}d</td>
        <td>${pnl}</td>
        <td style="display:flex;gap:4px;align-items:center">${chartBtn}<button class="del-btn" title="Delete this transaction" data-del-${r.delKind}="${r.delId}"><svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></td>
      </tr>`;
    })
    .join('');
  return `${summaryLine}<table style="white-space:nowrap"><thead><tr>
    <th>Status ${infoIcon('pf_tx_status')}</th>
    <th>Ticker ${infoIcon('pf_ticker')}</th>
    <th>Shares ${infoIcon('pf_tx_shares')}</th>
    <th>Buy Price ${infoIcon('pf_tx_buyprice')}</th>
    <th>Sell Price ${infoIcon('pf_tx_sellprice')}</th>
    <th>Buy Date ${infoIcon('pf_tx_buydate')}</th>
    <th>Sell Date ${infoIcon('pf_tx_selldate')}</th>
    <th>Held ${infoIcon('pf_tx_held')}</th>
    <th>Realized PnL ${infoIcon('pf_tx_pnl')}</th>
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
  const status = $('#update-status')!;
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

  // Build price map from latest bar
  const priceMap: PriceMap = {};
  for (const sym of tickers) {
    const bars = barCache[sym];
    if (bars?.length) priceMap[sym] = bars[bars.length - 1]!.close;
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
 */
function buildCandleSeries(
  st: AccountState,
  allBars: Map<string, Bar[]>,
  endDate: string,
): {
  positions: { ticker: string; bars: Bar[] }[];
  portfolio: Bar[];
} {
  const start = accountEarliestDate(st);

  const dateSet = new Set<string>();
  for (const bars of allBars.values()) {
    for (const b of bars) {
      if (b.date >= start && b.date <= endDate) dateSet.add(b.date);
    }
  }
  const dates = [...dateSet].sort();
  if (!dates.length) return { positions: [], portfolio: [] };

  const barByTickerDate = new Map<string, Map<string, Bar>>();
  for (const [sym, bars] of allBars.entries()) {
    const m = new Map<string, Bar>();
    for (const b of bars) m.set(b.date, b);
    barByTickerDate.set(sym, m);
  }

  const prevClose = new Map<string, number>();
  function getBar(sym: string, date: string): Bar | null {
    const m = barByTickerDate.get(sym);
    const b = m?.get(date);
    if (b) { prevClose.set(sym, b.close); return b; }
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

  const portfolio: Bar[] = [];

  for (const date of dates) {
    while (evIdx < events.length && events[evIdx]!.date <= date) {
      cash += events[evIdx]!.delta;
      evIdx++;
    }

    let portO = cash, portH = cash, portL = cash, portC = cash;

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
    }

    portfolio.push({ date, open: portO, high: portH, low: portL, close: portC, volume: 0 });
  }

  const positions = openTickers
    .map((t) => ({ ticker: t, bars: posBars.get(t)! }))
    .filter((p) => p.bars.length > 0);

  return { positions, portfolio };
}

function buildOverviewHtml(): string {
  const pricesByAccount = new Map(accounts.map((a) => [a.account.id, prices(a.account.id)]));
  const compareRows = compareAccounts(accounts, pricesByAccount);

  const totalInitialCap = accounts.reduce((s, a) => s + a.account.initialCapital, 0);
  const totalEquity = accounts.reduce((s, a) => s + (computeAccountMetrics(a, prices(a.account.id)).equity), 0);
  const totalCash = accounts.reduce((s, a) => s + (computeAccountMetrics(a, prices(a.account.id)).cash), 0);
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

  const compareNote = accounts.length < 2
    ? `<p class="muted" style="font-size:12px;margin:0 0 8px">Add another account (＋ New account) to compare strategies side by side.</p>`
    : `<p class="muted" style="font-size:12px;margin:0 0 8px">Click an account name to open it.</p>`;

  return `
    <h1>Paper Trading</h1>
    <p class="subtitle">Overview across all accounts.</p>
    ${toolbarHtml()}
    <div id="update-status" class="muted" style="margin-bottom:10px"></div>

    <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px">
      <div class="stat"><div class="k">Total initial capital</div><div class="v">${money(totalInitialCap)}</div></div>
      <div class="stat"><div class="k">Total equity</div><div class="v">${money(totalEquity)}</div></div>
      <div class="stat"><div class="k">Total cash</div><div class="v">${money(totalCash)}</div></div>
      <div class="stat"><div class="k">Total PnL</div><div class="v" style="color:${totalPnL >= 0 ? 'var(--accent)' : 'var(--danger)'}">${money(totalPnL)} (${pct(totalPnLPct)})</div></div>
      <div class="stat"><div class="k">Best account</div><div class="v">${best ? `${best.name} (${pct(best.totalReturnPct)})` : '—'}</div></div>
      <div class="stat"><div class="k">Worst account</div><div class="v">${worst ? `${worst.name} (${pct(worst.totalReturnPct)})` : '—'}</div></div>
      <div class="stat"><div class="k">Avg win rate</div><div class="v">${num(avgWinRate * 100, 0)}%</div></div>
      <div class="stat"><div class="k">Total open positions</div><div class="v">${totalOpenPositions}</div></div>
      <div class="stat"><div class="k">Total closed trades</div><div class="v">${totalClosedTrades}</div></div>
      <div class="stat"><div class="k">Avg holding period</div><div class="v">${holdShares > 0 ? num(avgHoldDays, 0) + ' days' : '—'}</div></div>
    </div>

    <div class="card" style="margin-bottom:14px;padding:8px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 6px 8px">
        <span class="section-title" style="margin:0">Combined Portfolio</span>
        <div class="toolbar" style="margin:0;gap:4px">
          <button class="range-btn" data-pf-view="equity">Equity</button>
          <button class="range-btn active" data-pf-view="candle">Candle</button>
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

    <div class="section-title">Cross-account comparison</div>
    ${compareNote}
    <div class="card" style="overflow-x:auto;margin-bottom:14px">
      <table><thead><tr><th>Account</th><th>Return %</th><th>Equity</th><th>Win rate</th><th>Expectancy</th><th>Avg R</th><th>Max DD</th><th>Open risk %</th><th>Open</th><th>Closed</th></tr></thead>
      <tbody>${compareRows
        .map(
          (r) =>
            `<tr><td><a href="#" class="link-ticker" data-acct-open="${r.accountId}"><strong>${r.name}</strong></a></td><td style="color:${r.totalReturnPct >= 0 ? 'var(--accent)' : 'var(--danger)'}">${pct(r.totalReturnPct)}</td><td>${money(r.equity)}</td><td>${num(r.winRate * 100, 0)}%</td><td>${money(r.expectancy)}</td><td>${num(r.avgRMultiple, 2)}R</td><td>${num(r.maxDrawdownPct, 1)}%</td><td>${num(r.totalOpenRiskPct, 1)}%</td><td>${r.openTradeCount}</td><td>${r.closedTradeCount}</td></tr>`,
        )
        .join('')}</tbody></table>
    </div>`;
}

function wireOverview(ctx: AppContext, root: HTMLElement): void {
  // account switch buttons
  root.querySelectorAll<HTMLElement>('[data-acct]').forEach((b) =>
    b.addEventListener('click', () => {
      activeId = b.dataset.acct!;
      draw(ctx);
    }),
  );

  // new account
  $('#acct-new')!.addEventListener('click', async () => {
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

  // Update button is disabled on overview — still wire it to show a message
  const updateBtn = $('#acct-update') as HTMLButtonElement | null;
  if (updateBtn) {
    updateBtn.addEventListener('click', () => {
      const s = root.querySelector<HTMLElement>('#update-status');
      if (s) s.textContent = 'Switch to an individual account to update prices.';
    });
  }

  // open account links in compare table
  root.querySelectorAll<HTMLElement>('[data-acct-open]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      activeId = a.dataset.acctOpen!;
      draw(ctx);
      $('#tab-portfolio')!.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }),
  );

  // combined portfolio chart
  const byDate = new Map<string, number>();
  for (const acct of accounts) {
    for (const s of acct.snapshots) {
      byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.equity);
    }
  }
  const combinedEquity = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([time, value]) => ({ time, value }));
  const totalInitialCap = accounts.reduce((s, a) => s + a.account.initialCapital, 0);

  const mergedPortfolio = new Map<string, Bar>();
  for (const acct of accounts) {
    const cache = (acct as AccountState & { _candleCache?: ReturnType<typeof buildCandleSeries> })._candleCache;
    for (const b of cache?.portfolio ?? []) {
      const ex = mergedPortfolio.get(b.date);
      if (ex) { ex.open += b.open; ex.high += b.high; ex.low += b.low; ex.close += b.close; }
      else mergedPortfolio.set(b.date, { ...b });
    }
  }
  const combinedPortfolioBars = [...mergedPortfolio.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  const pfEl = root.querySelector<HTMLElement>('#portfolio-chart')!;
  let pfView: 'equity' | 'candle' = 'candle';
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
    if (pfView === 'equity') {
      const pts = slicePoints(combinedEquity, pfRange);
      if (pts.length) {
        try { drawLine(pfEl, pts, { baseline: totalInitialCap, money: true, currency: '€', height: 260 }); }
        catch { pfEl.innerHTML = `<div class="muted" style="text-align:center;padding:60px">Chart unavailable.</div>`; }
      } else {
        pfEl.innerHTML = `<div class="muted" style="text-align:center;padding:60px">No data yet — update individual accounts first.</div>`;
      }
    } else {
      const bars = sliceBars(combinedPortfolioBars, pfRange);
      if (bars.length) {
        try { pfCandleChart = drawCandles(pfEl, bars, null, pfEma, { noVolume: true, height: 260, maxLine: true, minLine: true }); }
        catch { pfEl.innerHTML = `<div class="muted" style="text-align:center;padding:60px">Chart unavailable.</div>`; }
      } else {
        pfEl.innerHTML = `<div class="muted" style="text-align:center;padding:60px">No data yet — update individual accounts first.</div>`;
      }
    }
    const emaBar = root.querySelector<HTMLElement>('#pf-ema-bar');
    if (emaBar) emaBar.style.display = pfView === 'candle' ? '' : 'none';
  }
  if (pfEl) renderPfChart();

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
