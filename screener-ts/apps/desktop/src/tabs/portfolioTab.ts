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
  fetchMany,
  type AccountState,
  type PriceMap,
  type IdFactory,
  type Bar,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el, num, money, pct } from '../ui/dom.js';
import { drawLine } from '../ui/charts.js';

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
      <button id="acct-update" class="btn" style="margin-left:auto">↻ Update prices</button>
      <button id="acct-compare" class="btn-outline">Compare</button>
    </div>
    <div id="update-status" class="muted" style="margin-bottom:10px"></div>

    <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px">
      <div class="stat"><div class="k">Equity</div><div class="v">${money(m.equity)}</div></div>
      <div class="stat"><div class="k">Cash</div><div class="v">${money(m.cash)}</div></div>
      <div class="stat"><div class="k">Total PnL</div><div class="v" style="color:${m.totalPnL >= 0 ? 'var(--accent)' : 'var(--danger)'}">${money(m.totalPnL)} (${pct(m.totalPnLPct)})</div></div>
      <div class="stat"><div class="k">Open risk</div><div class="v">${money(m.totalOpenRiskEur)} (${pct(m.totalOpenRiskPct)})</div></div>
      <div class="stat"><div class="k">Realized / Unrealized</div><div class="v">${money(m.realizedPnL)} / ${money(m.unrealizedPnL)}</div></div>
      <div class="stat"><div class="k">Win rate</div><div class="v">${num(m.winRate * 100, 0)}%</div></div>
      <div class="stat"><div class="k">Avg R / Expectancy</div><div class="v">${num(m.avgRMultiple, 2)}R / ${money(m.expectancy)}</div></div>
      <div class="stat"><div class="k">Max drawdown</div><div class="v">${num(m.maxDrawdownPct, 1)}%</div></div>
    </div>

    <div class="card" style="margin-bottom:14px;padding:8px">
      <div class="section-title" style="margin:6px">Equity Curve</div>
      <div id="equity-chart" class="chart" style="height:220px"></div>
    </div>

    ${m.openPositionsWithoutStop > 0 ? `<div class="notice" style="margin-bottom:12px">${m.openPositionsWithoutStop} open position(s) have no stop set — risk is excluded until you add one.</div>` : ''}

    <div class="section-title">Open Positions</div>
    <div class="card" style="overflow-x:auto;margin-bottom:14px">
      <table><thead><tr><th>Ticker</th><th>Shares</th><th>Avg cost</th><th>Last</th><th>Mkt value</th><th>Unreal. PnL</th><th>Risk €</th><th>R</th><th>Stop</th><th>Days</th><th>Conc.</th><th></th></tr></thead>
      <tbody>${
        positions.length
          ? positions
              .map(
                (pos) =>
                  `<tr><td><strong>${pos.ticker}</strong></td><td>${pos.shares}</td><td>$${num(pos.avgCost)}</td><td>$${num(pos.lastPrice)}</td><td>${money(pos.marketValue)}</td>
          <td style="color:${pos.unrealizedPnL >= 0 ? 'var(--accent)' : 'var(--danger)'}">${money(pos.unrealizedPnL)} (${pct(pos.unrealizedPnLPct)})</td>
          <td>${pos.riskEur != null ? money(pos.riskEur) : '<span class="warn">— set stop</span>'}</td>
          <td>${pos.rMultiple != null ? num(pos.rMultiple, 2) + 'R' : '—'}</td>
          <td>${pos.stop != null ? '$' + num(pos.stop) : '—'}</td><td>${pos.daysHeld}</td><td>${num(pos.concentrationPct, 0)}%</td>
          <td><button class="range-btn" data-sell="${pos.ticker}">Sell</button></td></tr>`,
              )
              .join('')
          : `<tr><td colspan="12" class="muted" style="text-align:center;padding:20px">No open positions.</td></tr>`
      }</tbody></table>
    </div>

    <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
      <div class="card">
        <div class="section-title" style="margin-top:0">Record a Buy</div>
        <div class="row"><input id="b-ticker" class="field" placeholder="Ticker" style="width:90px" />
          <input id="b-shares" class="field" type="number" placeholder="Shares" style="width:90px" />
          <input id="b-price" class="field" type="number" placeholder="Price" style="width:90px" />
          <input id="b-date" class="field" type="date" value="${today()}" /></div>
        <div class="row" style="margin-top:8px"><input id="b-stop" class="field" type="number" placeholder="Stop (optional)" style="width:130px" />
          <input id="b-target" class="field" type="number" placeholder="Target (optional)" style="width:130px" />
          <button id="b-go" class="btn">Buy</button></div>
      </div>
      <div class="card">
        <div class="section-title" style="margin-top:0">Pending BUY_STOP Order</div>
        <div class="row"><input id="o-ticker" class="field" placeholder="Ticker" style="width:90px" />
          <input id="o-thresh" class="field" type="number" placeholder="Trigger ≥" style="width:100px" />
          <input id="o-shares" class="field" type="number" placeholder="Shares" style="width:90px" />
          <button id="o-go" class="btn">Place</button></div>
        <div id="orders-list" class="muted" style="margin-top:10px;font-size:12px"></div>
      </div>
    </div>
    <div id="compare-panel" style="margin-top:16px"></div>`;

  // account switch / new
  root.querySelectorAll<HTMLElement>('[data-acct]').forEach((b) =>
    b.addEventListener('click', () => {
      activeId = b.dataset.acct!;
      draw(ctx);
    }),
  );
  $('#acct-new')!.addEventListener('click', async () => {
    const name = prompt('Account name:', `Strategy ${String.fromCharCode(65 + accounts.length)}`);
    if (!name) return;
    const cap = Number(prompt('Initial capital (EUR):', '50000')) || 50000;
    accounts.push(createAccount({ name, initialCapital: cap, currency: 'EUR', createdAt: today() }, uuid));
    activeId = accounts[accounts.length - 1]!.account.id;
    await save(ctx);
    draw(ctx);
  });

  // equity curve
  const eq = $('#equity-chart')!;
  if (st.snapshots.length) {
    drawLine(
      eq,
      st.snapshots.map((s) => ({ time: s.date, value: s.equity })),
      { baseline: st.account.initialCapital },
    );
  } else {
    eq.innerHTML = `<div class="muted" style="text-align:center;padding:40px">No snapshots yet — click “Update prices”.</div>`;
  }

  // orders list
  renderOrders();

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
    await save(ctx);
    draw(ctx);
  });

  // sells
  root.querySelectorAll<HTMLElement>('[data-sell]').forEach((b) =>
    b.addEventListener('click', async () => {
      const t = b.dataset.sell!;
      const shares = Number(prompt(`Sell how many shares of ${t}?`, '0'));
      const price = Number(prompt('Sell price?', '0'));
      if (shares <= 0 || price <= 0) return;
      try {
        sell(active(), { ticker: t, sellDate: today(), sellPrice: price, shares }, uuid);
        await save(ctx);
        draw(ctx);
      } catch (e) {
        alert((e as Error).message);
      }
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

function renderOrders(): void {
  const list = $('#orders-list')!;
  const orders = active().orders;
  if (!orders.length) {
    list.textContent = 'No orders.';
    return;
  }
  list.innerHTML = orders
    .map(
      (o) =>
        `${o.ticker} ${o.type} ${o.shares}@${o.threshold} — <strong>${o.status}</strong>${o.note ? ` <span class="warn">(${o.note})</span>` : ''}`,
    )
    .join('<br>');
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
  const pricesByAccount = new Map(accounts.map((a) => [a.account.id, prices(a.account.id)]));
  const rows = compareAccounts(accounts, pricesByAccount);
  panel.innerHTML = `
    <div class="section-title">Cross-account comparison</div>
    <div class="card" style="overflow-x:auto">
      <table><thead><tr><th>Account</th><th>Return %</th><th>Equity</th><th>Win rate</th><th>Expectancy</th><th>Avg R</th><th>Max DD</th><th>Open risk %</th><th>Open</th><th>Closed</th></tr></thead>
      <tbody>${rows
        .map(
          (r) =>
            `<tr><td><strong>${r.name}</strong></td><td style="color:${r.totalReturnPct >= 0 ? 'var(--accent)' : 'var(--danger)'}">${pct(r.totalReturnPct)}</td><td>${money(r.equity)}</td><td>${num(r.winRate * 100, 0)}%</td><td>${money(r.expectancy)}</td><td>${num(r.avgRMultiple, 2)}R</td><td>${num(r.maxDrawdownPct, 1)}%</td><td>${num(r.totalOpenRiskPct, 1)}%</td><td>${r.openTradeCount}</td><td>${r.closedTradeCount}</td></tr>`,
        )
        .join('')}</tbody></table>
    </div>`;
}
