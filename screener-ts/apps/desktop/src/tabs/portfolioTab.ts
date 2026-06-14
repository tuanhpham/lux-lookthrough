import {
  createAccount,
  buy,
  sell,
  setStop,
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
import { $, el, num, money, pct } from '../ui/dom.js';
import { drawLine } from '../ui/charts.js';
import { formDialog } from '../ui/forms.js';
import { attachCombobox } from '../ui/combobox.js';
import { openStock } from '../ui/stockModal.js';

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
function wirePriceHint(ctx: AppContext, tickerSel: string, hintSel: string, priceSel: string): void {
  const tickerEl = $(tickerSel) as HTMLInputElement | null;
  const hintEl = $(hintSel);
  const priceEl = $(priceSel) as HTMLInputElement | null;
  if (!tickerEl || !hintEl || !priceEl) return;

  let token = 0;
  const fetchHint = async () => {
    const sym = tickerEl.value.trim().toUpperCase();
    if (!sym) {
      hintEl.innerHTML = '';
      return;
    }
    const mine = ++token;
    hintEl.innerHTML = `<span class="spinner"></span> latest close…`;
    const ohlcv = await ctx.data.getOHLCV(sym, '1mo').catch(() => null);
    if (mine !== token) return; // a newer lookup superseded this one
    const last = ohlcv?.bars[ohlcv.bars.length - 1];
    if (!last) {
      hintEl.textContent = 'no recent price';
      return;
    }
    hintEl.innerHTML = `latest close <b>$${num(last.close)}</b> (${last.date}) · <a href="#" data-use>use</a>`;
    hintEl.querySelector('[data-use]')!.addEventListener('click', (e) => {
      e.preventDefault();
      priceEl.value = String(num(last.close));
    });
  };
  tickerEl.addEventListener('change', () => void fetchHint());
  tickerEl.addEventListener('blur', () => void fetchHint());
}

const ACCT_KEY = 'accounts';
const uuid: IdFactory = () =>
  (globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2));
const today = () => new Date().toISOString().slice(0, 10);

let accounts: AccountState[] = [];
let activeId: string | null = null;

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
  if (!activeId || !accounts.some((a) => a.account.id === activeId)) activeId = accounts[0]!.account.id;
}
async function save(ctx: AppContext): Promise<void> {
  await ctx.storage.set(ACCT_KEY, accounts);
}
function active(): AccountState {
  return accounts.find((a) => a.account.id === activeId) ?? accounts[0]!;
}

/** Latest known price per ticker from the most recent snapshot-time fetch. */
const priceCache = new Map<string, PriceMap>();
function prices(accId: string): PriceMap {
  return priceCache.get(accId) ?? {};
}
/** Record a manually-entered price so equity/positions reflect it right away. */
function seedPrice(accId: string, ticker: string, price: number): void {
  const m = priceCache.get(accId) ?? {};
  m[ticker] = price;
  priceCache.set(accId, m);
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

/** Share-weighted average holding period (days) across closed (sold) trades. */
function avgHoldingDays(st: AccountState): { days: number; count: number } {
  const lotById = new Map(st.lots.map((l) => [l.id, l]));
  let wSum = 0;
  let shares = 0;
  for (const s of st.sells) {
    const lot = lotById.get(s.lotId);
    if (!lot) continue;
    wSum += daysBetween(lot.buyDate, s.sellDate) * s.shares;
    shares += s.shares;
  }
  return { days: shares > 0 ? wSum / shares : 0, count: st.sells.length };
}

export async function renderPortfolio(ctx: AppContext): Promise<void> {
  await load(ctx);
  draw(ctx);
}

function draw(ctx: AppContext): void {
  const root = $('#tab-portfolio')!;
  const st = active();
  const p = prices(st.account.id);
  const m = computeAccountMetrics(st, p);
  const positions = buildPositions(st, p, today());
  const avgHold = avgHoldingDays(st);

  root.innerHTML = `
    <h1>Paper Trading</h1>
    <p class="subtitle">Independent multi-account strategy testing. All cash, PnL and risk are per account.</p>
    <div class="toolbar">
      ${accounts
        .map(
          (a) =>
            `<button class="range-btn ${a.account.id === activeId ? 'active' : ''}" data-acct="${a.account.id}">${a.account.name}</button>`,
        )
        .join('')}
      <button id="acct-new" class="range-btn">＋ New account</button>
      <button id="acct-edit" class="range-btn">✎ Edit account</button>
      <button id="acct-update" class="btn" style="margin-left:auto">↻ Update prices</button>
      <button id="acct-compare" class="btn-outline">Compare</button>
    </div>
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
      <div class="section-title" style="margin:6px">Equity Curve</div>
      <div id="equity-chart" class="chart" style="height:220px"></div>
    </div>

    ${m.openPositionsWithoutStop > 0 ? `<div class="notice" style="margin-bottom:12px">${m.openPositionsWithoutStop} open position(s) have no stop set — risk is excluded until you add one.</div>` : ''}

    <div class="section-title">Open Positions <span class="muted" style="text-transform:none;font-weight:400">— click a ticker to open its chart</span></div>
    <div class="card" style="overflow-x:auto;margin-bottom:14px">
      <table><thead><tr><th>Ticker</th><th>Shares</th><th>Avg cost</th><th>Last</th><th>Mkt value</th><th>Unreal. PnL</th><th>Risk €</th><th>R</th><th>Stop</th><th>Target</th><th>Days</th><th>Conc.</th><th>Actions</th></tr></thead>
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
            <button class="range-btn" data-stop="${pos.ticker}">${pos.stop != null ? 'Edit stop' : 'Set stop'}</button>
            <button class="range-btn" data-target="${pos.ticker}">Target</button>
            <button class="range-btn" data-sell="${pos.ticker}">Sell</button></td></tr>`,
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
    <div class="card" style="overflow-x:auto;margin-bottom:14px">${transactionHistoryHtml(st)}</div>

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
    </div>
    <div id="compare-panel" style="margin-top:16px"></div>`;

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

  // equity curve — dedupe snapshots by date (keep the last per day) and sort
  // ascending, because lightweight-charts requires strictly increasing,
  // unique timestamps (otherwise it throws "data must be asc ordered by time").
  const st = active();
  const eq = $('#equity-chart')!;
  const byDate = new Map<string, number>();
  for (const s of st.snapshots) byDate.set(s.date, s.equity);
  const points = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([time, value]) => ({ time, value }));
  if (points.length) {
    try {
      drawLine(eq, points, { baseline: st.account.initialCapital });
    } catch (err) {
      eq.innerHTML = `<div class="muted" style="text-align:center;padding:40px">Chart unavailable.</div>`;
      console.error('equity chart error', err);
    }
  } else {
    eq.innerHTML = `<div class="muted" style="text-align:center;padding:40px">No snapshots yet — click “Update prices”.</div>`;
  }

  // orders list
  renderOrders(ctx);

  // Styled ticker comboboxes + live latest-close hints.
  const tickers = tickerList();
  attachCombobox({ input: $('#b-ticker') as HTMLInputElement, options: tickers });
  attachCombobox({ input: $('#o-ticker') as HTMLInputElement, options: tickers });
  wirePriceHint(ctx, '#b-ticker', '#b-pricehint', '#b-price');
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
      const res = await formDialog(`Sell ${t}`, [
        { key: 'shares', label: 'Shares to sell', type: 'number' },
        { key: 'price', label: 'Sell price', type: 'number' },
        { key: 'date', label: 'Date', type: 'date', value: today() },
      ]);
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

  // update
  $('#acct-update')!.addEventListener('click', () => void update(ctx));

  // compare
  $('#acct-compare')!.addEventListener('click', () => renderCompare());
}

/** A unified, date-sorted ledger of every BUY and SELL (closed trades included),
 * each sell showing realized PnL. */
/** Whole-day difference between two ISO dates (>= 0). */
function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
}

function transactionHistoryHtml(st: AccountState): string {
  interface Tx {
    sortDate: string; kind: 'BUY' | 'SELL'; ticker: string; shares: number; price: number;
    buyDate: string; sellDate: string | null; holdDays: number | null; pnl: number | null;
  }
  const lotById = new Map(st.lots.map((l) => [l.id, l]));
  const txs: Tx[] = [];
  for (const l of st.lots)
    txs.push({ sortDate: l.buyDate, kind: 'BUY', ticker: l.ticker, shares: l.shares, price: l.buyPrice,
      buyDate: l.buyDate, sellDate: null, holdDays: null, pnl: null });
  for (const s of st.sells) {
    const lot = lotById.get(s.lotId);
    const buyDate = lot?.buyDate ?? '—';
    const hold = lot ? daysBetween(lot.buyDate, s.sellDate) : null;
    txs.push({ sortDate: s.sellDate, kind: 'SELL', ticker: s.ticker, shares: s.shares, price: s.sellPrice,
      buyDate, sellDate: s.sellDate, holdDays: hold, pnl: s.realizedPnL });
  }
  if (!txs.length) {
    return `<div class="muted" style="text-align:center;padding:20px">No transactions yet.</div>`;
  }

  // Average holding period across closed (sold) trades, share-weighted by sale size.
  const sold = txs.filter((t) => t.kind === 'SELL' && t.holdDays != null);
  let avgHold = 0;
  if (sold.length) {
    const wSum = sold.reduce((s, t) => s + t.holdDays! * t.shares, 0);
    const shares = sold.reduce((s, t) => s + t.shares, 0);
    avgHold = shares > 0 ? wSum / shares : 0;
  }
  const avgLine = sold.length
    ? `<p class="muted" style="font-size:12px;margin:0 0 8px">Average holding period (closed trades): <b class="accent">${num(avgHold, 0)} days</b> over ${sold.length} sale(s).</p>`
    : '';

  // Newest first; BUY before SELL on the same date for readability.
  txs.sort((a, b) => (a.sortDate !== b.sortDate ? (a.sortDate < b.sortDate ? 1 : -1) : a.kind === b.kind ? 0 : a.kind === 'BUY' ? 1 : -1));
  const rows = txs
    .map((tx) => {
      const val = tx.shares * tx.price;
      const pnl =
        tx.pnl == null
          ? '—'
          : `<span style="color:${tx.pnl >= 0 ? 'var(--accent)' : 'var(--danger)'}">${money(tx.pnl)}</span>`;
      const kindColor = tx.kind === 'BUY' ? 'var(--accent2)' : 'var(--warn)';
      return `<tr>
        <td><span class="badge" style="background:color-mix(in srgb,${kindColor} 16%,transparent);color:${kindColor}">${tx.kind}</span></td>
        <td><a href="#" class="link-ticker" data-open="${tx.ticker}"><strong>${tx.ticker}</strong></a></td>
        <td>${tx.shares}</td><td>$${num(tx.price)}</td><td>${money(val)}</td>
        <td>${tx.buyDate}</td><td>${tx.sellDate ?? '—'}</td>
        <td>${tx.holdDays != null ? tx.holdDays + 'd' : '—'}</td>
        <td>${pnl}</td></tr>`;
    })
    .join('');
  return `${avgLine}<table><thead><tr><th>Type</th><th>Ticker</th><th>Shares</th><th>Price</th><th>Value</th><th>Buy date</th><th>Sell date</th><th>Held</th><th>Realized PnL</th></tr></thead><tbody>${rows}</tbody></table>`;
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
  // Tickers we hold or have pending orders for.
  const tickers = [
    ...new Set([
      ...st.lots.filter((l) => l.remainingShares > 0).map((l) => l.ticker),
      ...st.orders.filter((o) => o.status === 'pending').map((o) => o.ticker),
    ]),
  ];
  if (!tickers.length) {
    status.textContent = 'Nothing to update — no holdings or pending orders.';
    return;
  }
  status.innerHTML = `<span class="spinner"></span> Fetching ${tickers.length} ticker(s)…`;
  const data = await fetchMany(ctx.data, tickers, '6mo', 8);

  // Only feed NEW bars (after the last snapshot date) to the order engine.
  const lastDate = st.snapshots.length ? st.snapshots[st.snapshots.length - 1]!.date : '0000-00-00';
  const barsByTicker = new Map<string, Bar[]>();
  const priceMap: PriceMap = {};
  for (const [sym, ohlcv] of data.entries()) {
    const fresh = ohlcv.bars.filter((b) => b.date > lastDate);
    barsByTicker.set(sym, fresh);
    if (ohlcv.bars.length) priceMap[sym] = ohlcv.bars[ohlcv.bars.length - 1]!.close;
  }
  priceCache.set(st.account.id, priceMap);

  const res = runUpdate(st, { barsByTicker, asOfDate: today() }, uuid);
  await save(ctx);
  const fills = res.fills.filter((f) => f.filled).length;
  const rejects = res.fills.filter((f) => !f.filled);
  status.innerHTML = `Updated. ${fills} order(s) filled.${
    rejects.length ? ` <span class="warn">${rejects.map((r) => r.reason).join('; ')}</span>` : ''
  }`;
  draw(ctx);
  // Re-show the status after redraw clobbered it.
  $('#update-status')!.innerHTML = status.innerHTML;
}

function renderCompare(): void {
  const panel = $('#compare-panel')!;
  // Toggle: a second click hides it.
  if (panel.dataset.open === '1') {
    panel.innerHTML = '';
    panel.dataset.open = '';
    return;
  }
  panel.dataset.open = '1';
  const pricesByAccount = new Map(accounts.map((a) => [a.account.id, prices(a.account.id)]));
  const rows = compareAccounts(accounts, pricesByAccount);
  const note =
    accounts.length < 2
      ? `<p class="muted" style="font-size:12px;margin:0 0 8px">Add another account (＋ New account) to compare strategies side by side.</p>`
      : '';
  panel.innerHTML = `
    <div class="section-title">Cross-account comparison</div>
    ${note}
    <div class="card" style="overflow-x:auto">
      <table><thead><tr><th>Account</th><th>Return %</th><th>Equity</th><th>Win rate</th><th>Expectancy</th><th>Avg R</th><th>Max DD</th><th>Open risk %</th><th>Open</th><th>Closed</th></tr></thead>
      <tbody>${rows
        .map(
          (r) =>
            `<tr><td><strong>${r.name}</strong></td><td style="color:${r.totalReturnPct >= 0 ? 'var(--accent)' : 'var(--danger)'}">${pct(r.totalReturnPct)}</td><td>${money(r.equity)}</td><td>${num(r.winRate * 100, 0)}%</td><td>${money(r.expectancy)}</td><td>${num(r.avgRMultiple, 2)}R</td><td>${num(r.maxDrawdownPct, 1)}%</td><td>${num(r.totalOpenRiskPct, 1)}%</td><td>${r.openTradeCount}</td><td>${r.closedTradeCount}</td></tr>`,
        )
        .join('')}</tbody></table>
    </div>`;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
