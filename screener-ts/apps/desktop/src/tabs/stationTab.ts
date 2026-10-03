/**
 * Trạm giao dịch — the Trade Station: one full-width page to buy and sell, laid out the way
 * an exchange's spot screen is (ticker bar · list + level ladder · chart · ticket · tabs).
 *
 * ── WHAT IT IS NOT ──────────────────────────────────────────────────────────
 * A broker. Nothing leaves the app: a "buy" here RECORDS a trade into a paper account, through
 * the same audited `applyWrite` path the Portfolio form, the planner and the assistant use —
 * so a lot booked here is indistinguishable from one booked anywhere else. There is no order
 * book and no intraday feed, so the column an exchange fills with bids and asks holds the
 * thing a swing trader actually reads instead: the plan's levels, stacked against the price.
 *
 * ── THE USER'S RULES (2026-10-03) ───────────────────────────────────────────
 * · Fees come from the account's broker, recognised by name, in an editable table
 *   (Trade Republic €1, Scalable €0.99, Degiro €2, Equate Plus 0) — see `brokerFees.ts`.
 * · The trade plan is part of the buy, not a separate screen: the checklist, the grade and the
 *   size are worked out the moment a symbol is opened and follow every change on the ticket.
 * · A case study is created AT THE BUY. A trade booked entirely in the past (bought and sold
 *   in one go) is filed closed; otherwise it is open and the sells close it.
 * · A sell knows how many shares the chosen account holds and cannot exceed it.
 * · Short selling is reserved (a disabled tab), not built.
 */
import type { Bar, ConvictionRating, GradeResult, SetupKey } from '@screener/core';
import { computeCash, computeEquity, gradeTrade, qmGradeEvidence, quoteCurrencyOf, scanQm, SETUP_KEYS } from '@screener/core';
import type { AppContext } from '../context.js';
import { getLang } from '../ui/i18n.js';
import { drawCandles, type CandleChart } from '../ui/charts.js';
import { openStock } from '../ui/stockModal.js';
import { accounts, ensureAccountsLoaded, today, withAccounts } from '../portfolio/store.js';
import { cancelOrder } from '@screener/core';
import { accountPrices } from '../portfolio/prices.js';
import { applyEurUsdBars, ccyFactor, ensureEurUsd, hasEurUsd } from '../portfolio/fx.js';
import {
  applyWrite, heldShares, openLots, plannedPrice, quoteThreshold, type PlannedPrice, type Rating, type WritePlan,
} from '../portfolio/writes.js';
import { buildBuyPlan, currentRegime, ensureRegime, ladderConfig, loadPlaybookConfig, type BuyPlan } from '../portfolio/playbook.js';
import { loadPlan, savePlan, type SymbolPlan } from '../portfolio/planStore.js';
import { gradePanelHtml } from '../portfolio/gradeView.js';
import { brokerFees, brokerOf, feeOf, loadBrokerFees, saveBrokerFees, type BrokerFee } from '../portfolio/brokerFees.js';
import { savePlanSnapshot } from '../portfolio/planSnapshot.js';
import { closeOnOrBefore } from '../portfolio/planExit.js';
import { exitReasonLabel, exitReasonOptgroupsHtml } from '../portfolio/exitReasons.js';
import { setupName } from '../portfolio/planWords.js';
import { loadCase, loadCaseIndex, saveCase, type CaseRating, type CaseStudy } from '../caseStudies/store.js';
import { applySell, caseForBuy, studyForLots } from '../portfolio/stationCase.js';
import { loadIndex as loadWatchlists, loadItems as loadWatchItems } from '../ui/watchlists.js';
import { sanitizeNoteHtml } from '../ui/richNote.js';

const vi = (): boolean => getLang() === 'vi';
const L = (en: string, viText: string): string => (vi() ? viText : en);

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

type Ccy = 'EUR' | 'USD';
type Side = 'buy' | 'sell';
type BottomTab = 'pos' | 'orders' | 'hist' | 'cases';
type Pick = 'price' | 'stop' | 'target';

const SYM_KEY = 'station_sym';
const SYM: Record<string, string> = { EUR: '€', USD: '$' };
const fmt = (v: number | null | undefined, d = 2): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString(vi() ? 'vi-VN' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const cash = (v: number | null | undefined, ccy: string): string => (v === null || v === undefined ? '—' : `${SYM[ccy] ?? ''}${fmt(v)}`);
const posNum = (s: string | undefined): number | null => {
  const v = Number(String(s ?? '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
};

// ── state, kept outside the DOM so a re-render (language, theme) keeps the ticket ─────────

interface Ticket {
  side: Side;
  /** Record a fill now, or leave a pending order for the engine to fill on a later bar. */
  mode: 'fill' | 'order';
  /** Sell side, pending: which exit order. */
  orderType: 'STOP_LOSS' | 'TAKE_PROFIT';
  acctId: string;
  price: number | null;
  /** Whether the price is still the one this page put there — a date change may replace it. */
  priceAuto: boolean;
  ccy: Ccy;
  date: string;
  shares: number | null;
  stop: number | null;
  target: number | null;
  setup: SetupKey | '';
  fee: number | null;
  note: string;
  caseOn: boolean;
  /** Buy side only: the trade is already over — book its sale too and file the study closed. */
  closedOn: boolean;
  exitDate: string;
  exitPrice: number | null;
  exitReason: string;
}

let sym = '';
let bars: Bar[] = [];
let plan: SymbolPlan | null = null;
let suggestion: BuyPlan | null = null;
/** The bars scanned once per symbol — the measured half of the checklist. */
let scan: ReturnType<typeof scanQm> | null = null;
/** The checklist scored against the ticket as it stands. */
let grade: GradeResult | null = null;
let critOpen = true;
let ticket: Ticket = freshTicket();
let bottom: BottomTab = 'pos';
let chart: CandleChart | null = null;
let msg: { err: boolean; text: string } | null = null;
let busy = false;
let loadToken = 0;
/** The level the next click on the chart sets, or null when clicks only pan. */
let pick: Pick | null = null;
let liveCtx: AppContext | null = null;
let liveRoot: HTMLElement | null = null;
let list: { held: string[]; watch: { name: string; syms: string[] }[] } = { held: [], watch: [] };

function freshTicket(acctId = ''): Ticket {
  return {
    side: 'buy', mode: 'fill', orderType: 'STOP_LOSS', acctId, price: null, priceAuto: true, ccy: 'USD', date: today(),
    shares: null, stop: null, target: null, setup: '', fee: null, note: '', caseOn: true,
    closedOn: false, exitDate: today(), exitPrice: null, exitReason: '',
  };
}

/** Open the station on a symbol — from the stock page, a position row or the planner. */
export function openStation(symbol: string): void {
  const s = symbol.trim().toUpperCase();
  if (s) {
    try { localStorage.setItem(SYM_KEY, s); } catch { /* private mode */ }
  }
  window.dispatchEvent(new CustomEvent('app:open-station', { detail: s }));
}

// ── derived numbers ───────────────────────────────────────────────────────────

const quoteCcy = (): Ccy | null => {
  const q = quoteCurrencyOf(sym);
  return q === 'EUR' || q === 'USD' ? q : null;
};
const acct = () => accounts.find((a) => a.account.id === ticket.acctId) ?? null;
const acctCcy = (): string => acct()?.account.currency ?? 'EUR';
const last = (): Bar | null => bars[bars.length - 1] ?? null;
const prev = (): Bar | null => bars[bars.length - 2] ?? null;
/** A ticket value (in `ticket.ccy`) moved into the bars' currency, for the chart and ladder. */
const toQuote = (v: number | null): number | null =>
  v === null ? null : v * ccyFactor(ticket.ccy, quoteCcy() ?? 'USD', ticket.date);
const fromQuote = (v: number): number => v * ccyFactor(quoteCcy() ?? 'USD', ticket.ccy, ticket.date);

/** The letter in force: the user's override, else the score's. */
function effective(): ConvictionRating | null {
  return (plan?.gradeOverride ?? grade?.grade ?? null) as ConvictionRating | null;
}

/** The account's fee as the ticket's default. A value typed on the ticket wins. */
function feeNow(): number {
  if (ticket.fee !== null) return ticket.fee;
  const a = acct();
  return a ? feeOf(a.account) : 0;
}

/** shares × price in the account's currency. */
function costInAcct(shares: number, price: number, date: string): number {
  return shares * price * ccyFactor(ticket.ccy, acctCcy(), date);
}

function heldIn(accountId: string): number {
  const st = accounts.find((a) => a.account.id === accountId);
  return st ? heldShares(st, sym) : 0;
}

// ── loading ───────────────────────────────────────────────────────────────────

async function loadSymbol(ctx: AppContext, s: string, root: HTMLElement): Promise<void> {
  const token = ++loadToken;
  sym = s.trim().toUpperCase();
  try { localStorage.setItem(SYM_KEY, sym); } catch { /* private mode */ }
  bars = [];
  plan = null;
  suggestion = null;
  scan = null;
  grade = null;
  const keep = ticket;
  ticket = freshTicket(keep.acctId);
  ticket.side = keep.side;
  ticket.mode = keep.mode;
  ticket.ccy = quoteCcy() ?? 'USD';
  msg = null;
  paint(ctx, root);
  if (!sym) return;
  const [res, p] = await Promise.all([
    ctx.data.getOHLCV(sym, '1y', { fresh: true }).catch(() => null),
    loadPlan(ctx, sym).catch(() => null),
  ]);
  if (token !== loadToken) return;
  bars = res?.bars ?? [];
  plan = p;
  // `scanQm` needs enough history to measure a base; below that the trade stays ungraded.
  scan = bars.length >= 60 ? scanQm(sym, bars) : null;
  ticket.setup = (p?.setup || '') as SetupKey | '';
  const lp = last()?.close ?? null;
  if (lp !== null) ticket.price = round(fromQuote(lp));
  suggest();
  pickAccount();
  paint(ctx, root);
}

/**
 * The plan for the ticket as it stands: levels, grade, size — the Buy form's two passes.
 *
 * Pass one finds the stop and target with no grade in the way; the checklist is then scored
 * against THOSE levels (its R:R and stop-width criteria describe this trade); pass two sizes
 * the position with the letter that came out. A value the user typed is never overwritten.
 */
function suggest(): void {
  const st = acct() ?? accounts[0];
  if (!st || !bars.length || !(ticket.price && ticket.price > 0)) { suggestion = null; regrade(); return; }
  const common = {
    state: st, prices: accountPrices(st.account.id), bars, symbol: sym,
    entry: ticket.price, entryCurrency: ticket.ccy, setup: (ticket.setup || 'Breakout') as SetupKey,
    date: ticket.date,
  };
  const lv = buildBuyPlan({ ...common, rating: null });
  if (lv) {
    if (ticket.stop === null) ticket.stop = lv.stop;
    if (ticket.target === null) ticket.target = lv.target;
  }
  regrade();
  suggestion = buildBuyPlan({ ...common, rating: effective() }) ?? lv;
  if (suggestion && ticket.shares === null && ticket.side === 'buy') ticket.shares = suggestion.shares || null;
}

/** Score the checklist: measured criteria from the bars, manual ones from the saved plan. */
function regrade(): void {
  if (!scan || !plan) { grade = null; return; }
  const px = ticket.price ?? 0;
  const rps = px > 0 && ticket.stop !== null && ticket.stop > 0 && ticket.stop < px ? px - ticket.stop : 0;
  grade = gradeTrade(qmGradeEvidence(scan, {
    setup: ticket.setup,
    regime: currentRegime()?.regime ?? null,
    // null, not 0, when there is nothing to divide: the grader reads a missing number as
    // unmeasured and a zero as a failing measurement.
    rMultiple: rps > 0 && ticket.target !== null && ticket.target > px ? (ticket.target - px) / rps : null,
    stopPct: rps > 0 ? (rps / px) * 100 : null,
  }), plan.answers);
}

function storePlan(ctx: AppContext): void {
  if (!plan) return;
  const mine = plan.symbol;
  void savePlan(ctx, plan).then((saved) => { if (plan && plan.symbol === mine) plan = saved; }).catch(() => {});
}

/** Buy: keep the chosen account. Sell: the first account that actually holds the symbol. */
function pickAccount(): void {
  const ok = (id: string): boolean => accounts.some((a) => a.account.id === id);
  if (ticket.side === 'sell') {
    if (!(ok(ticket.acctId) && heldIn(ticket.acctId) > 0)) {
      ticket.acctId = accounts.find((a) => heldShares(a, sym) > 0)?.account.id ?? ticket.acctId;
    }
    const held = heldIn(ticket.acctId);
    if (ticket.shares === null || ticket.shares > held) ticket.shares = held || null;
    return;
  }
  if (!ok(ticket.acctId)) ticket.acctId = accounts[0]?.account.id ?? '';
}

async function loadList(ctx: AppContext): Promise<void> {
  const held = new Set<string>();
  for (const a of accounts) for (const l of a.lots) if (l.remainingShares > 0) held.add(l.ticker);
  const watch: { name: string; syms: string[] }[] = [];
  try {
    const idx = await loadWatchlists(ctx);
    for (const w of idx.slice(0, 6)) {
      const items = await loadWatchItems(ctx, w.id).catch(() => []);
      if (items.length) watch.push({ name: w.name, syms: items.slice(0, 30) });
    }
  } catch { /* no watchlists */ }
  list = { held: [...held].sort(), watch };
}

// ── painting ──────────────────────────────────────────────────────────────────

export async function renderStation(ctx: AppContext): Promise<void> {
  const root = document.querySelector<HTMLElement>('#tab-station');
  if (!root) return;
  await Promise.all([
    ensureAccountsLoaded(ctx).catch(() => {}),
    ensureEurUsd(ctx).catch(() => {}),
    loadPlaybookConfig(ctx).catch(() => null),
    loadBrokerFees(ctx).catch(() => null),
    currentRegime() ? Promise.resolve(null) : ensureRegime(ctx).catch(() => null),
  ]);
  // The device cache is all `ensureEurUsd` reads. A station opened before Portfolio ever ran
  // would then refuse every EUR-account trade of a dollar stock, so fetch the rate once here.
  if (!hasEurUsd()) {
    const fx = await ctx.data.getOHLCV('EURUSD=X', '2y').catch(() => null);
    if (fx?.bars.length) applyEurUsdBars(fx.bars);
  }
  await loadList(ctx);
  let want = '';
  try { want = localStorage.getItem(SYM_KEY) ?? ''; } catch { /* private mode */ }
  want = want || list.held[0] || list.watch[0]?.syms[0] || 'NVDA';
  if (want !== sym || !bars.length) await loadSymbol(ctx, want, root);
  else { pickAccount(); paint(ctx, root); }
}

function paint(ctx: AppContext, root: HTMLElement): void {
  liveCtx = ctx;
  liveRoot = root;
  bindKeys();
  root.innerHTML = `
    <div class="stn">
      ${tickerBarHtml()}
      <aside class="stn-side card">${listHtml()}${ladderHtml()}</aside>
      <section class="stn-main card">
        ${pickBarHtml()}
        <div class="stn-chart${pick ? ' picking' : ''}" id="stn-chart"></div>
      </section>
      <section class="stn-plan card" id="stn-plan">${planPanelHtml()}</section>
      <aside class="stn-ticket card" id="stn-ticket">${ticketHtml()}</aside>
      <section class="stn-bottom card">${bottomHtml()}</section>
    </div>
    <div class="stn-dock">
      <button class="stn-dock-b stn-buy" data-stn-dock="buy">${L('Buy', 'Mua')}</button>
      <button class="stn-dock-b stn-sell" data-stn-dock="sell">${L('Sell', 'Bán')}</button>
    </div>`;
  wire(ctx, root);
  drawChart(root);
  void paintBottom(ctx, root);
}

function tickerBarHtml(): string {
  const b = last();
  const p = prev();
  const qc = quoteCcy();
  const chg = b && p && p.close > 0 ? ((b.close - p.close) / p.close) * 100 : null;
  const yr = bars.slice(-252);
  const hi = yr.length ? Math.max(...yr.map((x) => x.high)) : null;
  const lo = yr.length ? Math.min(...yr.map((x) => x.low)) : null;
  const pos = b && hi !== null && lo !== null && hi > lo ? ((b.close - lo) / (hi - lo)) * 100 : null;
  const adv = bars.slice(-20);
  const dollarVol = adv.length ? adv.reduce((s, x) => s + x.close * x.volume, 0) / adv.length : null;
  const big = (v: number | null): string => (v === null ? '—' : v >= 1e9 ? `${fmt(v / 1e9, 1)}B` : v >= 1e6 ? `${fmt(v / 1e6, 1)}M` : fmt(v, 0));
  const held = accounts.reduce((s, a) => s + heldShares(a, sym), 0);
  const g = effective();
  const stat = (k: string, v: string, cls = ''): string => `<div class="stn-stat"><small>${k}</small><b class="${cls}">${v}</b></div>`;
  return `<header class="stn-bar card">
      <div class="stn-title"><span aria-hidden="true">⚡</span>${L('Trade Station', 'Trạm giao dịch')}</div>
      <div class="stn-sym">
        <input class="field stn-sym-in" id="stn-sym" value="${esc(sym)}" spellcheck="false" autocomplete="off" aria-label="${L('Symbol', 'Mã')}">
        <button class="btn-outline stn-mini" id="stn-open-stock" title="${L('Stock page', 'Trang cổ phiếu')}">↗</button>
      </div>
      <div class="stn-px">
        <b>${b ? `${SYM[qc ?? 'USD'] ?? ''}${fmt(b.close)}` : '—'}</b>
        <span class="${chg === null ? '' : chg >= 0 ? 'stn-up' : 'stn-down'}">${chg === null ? '' : `${chg >= 0 ? '+' : ''}${fmt(chg)}%`}</span>
      </div>
      <div class="stn-stats">
        ${stat(L('Day high / low', 'Cao / thấp phiên'), b ? `${fmt(b.high)} / ${fmt(b.low)}` : '—')}
        ${stat(L('52-week range', 'Biên 52 tuần'), pos === null ? '—' : `<span class="stn-range"><i style="left:${pos.toFixed(0)}%"></i></span>${fmt(pos, 0)}%`)}
        ${stat(L('Avg $ volume 20d', 'GT giao dịch TB 20p'), big(dollarVol))}
        ${stat(L('Last bar', 'Nến cuối'), b ? b.date : '—')}
        ${stat(L('Held', 'Đang giữ'), held ? `${fmt(held, 0)} ${L('sh', 'cp')}` : '—')}
        ${stat(L('Plan grade', 'Điểm plan'), g ?? '—', g ? `stn-grade stn-grade-${g}` : '')}
      </div>
      <span class="stn-delay">${L('Daily bars · quotes ~15 min late', 'Nến ngày · giá trễ ~15 phút')}</span>
    </header>`;
}

function listHtml(): string {
  const row = (s: string, tag = ''): string =>
    `<button class="stn-li${s === sym ? ' on' : ''}" data-stn-sym="${esc(s)}"><b>${esc(s)}</b>${tag ? `<small>${tag}</small>` : ''}</button>`;
  const heldTag = (s: string): string => {
    const n = accounts.reduce((t, a) => t + heldShares(a, s), 0);
    return n ? `${fmt(n, 0)} ${L('sh', 'cp')}` : '';
  };
  const groups = [
    list.held.length ? `<div class="stn-lh">💼 ${L('Held', 'Đang giữ')}</div>${list.held.map((s) => row(s, heldTag(s))).join('')}` : '',
    ...list.watch.map((w) => `<div class="stn-lh">⭐ ${esc(w.name)}</div>${w.syms.map((s) => row(s)).join('')}`),
  ].join('');
  return `<div class="stn-list">${groups || `<div class="stn-empty">${L('No positions or watchlists yet — type a symbol above.', 'Chưa có vị thế hay watchlist — gõ mã ở ô phía trên.')}</div>`}</div>`;
}

/** The plan's levels against the price — the swing trader's order book. */
function ladderHtml(): string {
  const b = last();
  const lp = b?.close ?? null;
  const st = acct();
  const lots = st ? openLots(st, sym) : [];
  const held = lots.reduce((s, l) => s + l.remainingShares, 0);
  // The account's average cost, back into the bars' currency so it sits on the same scale.
  const avgAcct = held ? lots.reduce((s, l) => s + l.buyPrice * l.remainingShares, 0) / held : null;
  const avgQ = avgAcct === null ? null : avgAcct * ccyFactor(acctCcy(), quoteCcy() ?? 'USD', today());
  const rows: { k: string; v: number | null; cls: string }[] = [
    { k: L('Target', 'Mục tiêu'), v: toQuote(ticket.target), cls: 'tgt' },
    { k: L('Last', 'Giá'), v: lp, cls: 'px' },
    { k: L('Entry', 'Vào lệnh'), v: toQuote(ticket.price), cls: 'ent' },
    { k: L('Your avg cost', 'Giá vốn TB'), v: avgQ, cls: 'avg' },
    { k: L('Stop', 'Cắt lỗ'), v: toQuote(ticket.stop), cls: 'stp' },
  ];
  const shown = rows.filter((r) => r.v !== null && r.v > 0).sort((a, z) => z.v! - a.v!);
  const qs = SYM[quoteCcy() ?? 'USD'] ?? '';
  return `<div class="stn-ladder">
      <div class="stn-lh">🎯 ${L('Level ladder', 'Thang mức giá')}</div>
      ${shown.map((r) => {
        const d = lp && r.cls !== 'px' ? ((r.v! - lp) / lp) * 100 : null;
        return `<div class="stn-lv stn-lv-${r.cls}"><span>${r.k}</span><b>${qs}${fmt(r.v)}</b><small>${d === null ? '' : `${d >= 0 ? '+' : ''}${fmt(d, 1)}%`}</small></div>`;
      }).join('') || `<div class="stn-empty">${L('Levels appear once there is a price.', 'Các mức hiện ra khi có giá.')}</div>`}
    </div>`;
}

function pickBarHtml(): string {
  const b = (k: Pick, label: string, cls: string): string =>
    `<button class="stn-pk stn-pk-${cls}${pick === k ? ' on' : ''}" data-stn-pick="${k}">${label}</button>`;
  return `<div class="stn-pickbar">
      <span>${pick ? L('Click the chart to set it · Esc cancels', 'Bấm vào chart để đặt · Esc để huỷ') : L('Set a level from the chart:', 'Đặt mức giá từ chart:')}</span>
      ${b('price', ticket.mode === 'order' ? L('Trigger', 'Kích hoạt') : L('Price', 'Giá'), 'ent')}
      ${ticket.side === 'buy' ? b('stop', L('Stop', 'Cắt lỗ'), 'stp') + b('target', L('Target', 'Mục tiêu'), 'tgt') : ''}
      <span class="stn-keys">${L('Keys', 'Phím')}: <kbd>B</kbd> ${L('buy', 'mua')} · <kbd>S</kbd> ${L('sell', 'bán')}</span>
    </div>`;
}

/** The trade plan, generated for the ticket: setup, grade with its criteria, and the sizing. */
function planPanelHtml(): string {
  const g = effective();
  const pct = g ? ladderConfig().ratingPct[g] : 100;
  const s = suggestion;
  const head = `<div class="stn-ph">
      <b>📋 ${L('Trade plan', 'Kế hoạch giao dịch')}</b>
      <small>${L('scored live from the chart and the ticket', 'tự chấm theo chart và phiếu lệnh')}</small>
    </div>
    <div class="stn-row2">
      <label class="stn-f"><span>Setup</span><select class="field" data-stnp="setup">
        <option value="">${L('— choose —', '— chọn —')}</option>${SETUP_KEYS.map((k) => `<option value="${k}"${k === ticket.setup ? ' selected' : ''}>${esc(setupName(k, vi()))}</option>`).join('')}
      </select></label>
      <label class="stn-f"><span>${L('Your grade', 'Điểm của bạn')}</span><select class="field" data-stnp="override">
        <option value="">${L('Automatic', 'Tự động')}${grade?.grade ? ` (${grade.grade})` : ''}</option>
        ${(['A', 'B', 'C', 'D'] as const).map((k) => `<option value="${k}"${plan?.gradeOverride === k ? ' selected' : ''}>${k}</option>`).join('')}
      </select></label>
    </div>`;
  const body = grade
    ? gradePanelHtml(grade, { ns: 'stn', id: sym, vi: vi(), open: critOpen, override: plan?.gradeOverride ?? null, effective: g, pctOfFull: pct })
    : `<div class="stn-empty">${!bars.length ? L('Loading…', 'Đang tải…')
      : L('Not enough history to score this setup (needs ~60 sessions).', 'Chưa đủ dữ liệu để chấm setup này (cần khoảng 60 phiên).')}</div>`;
  const rg = s?.regime?.regime ?? currentRegime()?.regime ?? null;
  const sizing = s ? `<div class="stn-size">
      <div><span>${L('Market', 'Thị trường')}</span><b>${esc(rg ?? '—')}</b></div>
      <div><span>${L('Risk budget', 'Mức rủi ro')}</span><b>${fmt(s.budget.pct)}% ${L('of equity', 'vốn')}</b></div>
      <div><span>${L('Stop width', 'Độ rộng stop')}</span><b>${fmt(s.stopPct, 1)}%${s.rMultiple ? ` · ${fmt(s.rMultiple, 1)}R` : ''}</b></div>
      <div><span>${L('Full size → grade', 'Cỡ đầy đủ → theo điểm')}</span><b>${fmt(s.size.fullShares, 0)} → ${pct}% → ${fmt(s.size.shares, 0)} ${L('sh', 'cp')}</b></div>
      ${s.budget.pct === 0 ? `<div class="stn-warnline">${L('The playbook says no new longs in this market.', 'Playbook: không mở lệnh mua mới trong thị trường này.')}</div>` : ''}
    </div>` : '';
  return `${head}<div class="stn-grade">${body}</div>${sizing}`;
}

function acctOptions(): string {
  return accounts.map((a) => {
    const h = heldShares(a, sym);
    const dis = ticket.side === 'sell' && h <= 0;
    const label = ticket.side === 'sell'
      ? `${a.account.name} · ${h ? `${fmt(h, 0)} ${L('sh', 'cp')}` : L('none held', 'không giữ')}`
      : `${a.account.name} · ${a.account.currency}`;
    return `<option value="${esc(a.account.id)}"${a.account.id === ticket.acctId ? ' selected' : ''}${dis ? ' disabled' : ''}>${esc(label)}</option>`;
  }).join('');
}

function ticketHtml(): string {
  const st = acct();
  const isBuy = ticket.side === 'buy';
  const isOrder = ticket.mode === 'order';
  const qc = quoteCcy();
  const ac = acctCcy();
  const held = st ? heldShares(st, sym) : 0;
  const fee = feeNow();
  const shares = Math.max(0, Math.round(ticket.shares ?? 0));
  const px = ticket.price ?? 0;
  const gross = shares && px ? costInAcct(shares, px, ticket.date) : 0;
  const cashNow = st ? computeCash(st) : 0;
  const equity = st ? computeEquity(st, accountPrices(st.account.id)) : 0;
  const riskPer = isBuy && ticket.stop !== null && px > ticket.stop ? px - ticket.stop : null;
  const risk = riskPer !== null ? costInAcct(shares, riskPer, ticket.date) + fee : null;
  const rr = riskPer !== null && ticket.target !== null && ticket.target > px ? (ticket.target - px) / riskPer : null;
  const basis = isBuy ? suggestion?.shares ?? 0 : held;
  const pctOf = basis > 0 ? Math.min(100, Math.round((shares / basis) * 100)) : 0;
  const nowCash = isOrder ? cashNow : isBuy ? cashNow - gross - fee : cashNow + gross - fee;

  const fifo = !isBuy && st ? fifoPreview(st, shares, px) : '';
  const field = (k: string, label: string, val: string, extra = ''): string =>
    `<label class="stn-f"><span>${label}</span><input class="field" data-stn="${k}" inputmode="decimal" value="${esc(val)}"${extra}></label>`;
  const v = (n: number | null, d = 2): string => (n === null ? '' : String(round(n, d)));

  const noAcct = !accounts.length;
  const vnd = !qc;
  const block = noAcct
    ? L('Create an account in Portfolio first.', 'Tạo tài khoản ở trang Danh mục trước.')
    : vnd
      ? L('This market’s currency is not supported on the ticket yet (EUR and USD only).', 'Phiếu lệnh chưa hỗ trợ đồng tiền của thị trường này (chỉ EUR và USD).')
      : !isBuy && held <= 0
        ? L(`No account holds ${sym}.`, `Không tài khoản nào đang giữ ${sym}.`)
        : '';

  return `
    <div class="stn-tabs seg" role="tablist">
      <button class="${isBuy ? 'on stn-t-buy' : ''}" data-stn-side="buy">${L('Buy', 'Mua')}</button>
      <button class="${!isBuy ? 'on stn-t-sell' : ''}" data-stn-side="sell">${L('Sell', 'Bán')}</button>
      <button disabled title="${L('Coming later', 'Sắp có')}">Short <small>${L('soon', 'sắp có')}</small></button>
    </div>
    <div class="stn-mode seg">
      <button class="${!isOrder ? 'on' : ''}" data-stn-mode="fill">${L('Filled now', 'Khớp ngay')}</button>
      <button class="${isOrder ? 'on' : ''}" data-stn-mode="order">${L('Pending order', 'Lệnh chờ')}</button>
    </div>
    ${isOrder ? `<div class="stn-note">${isBuy
      ? L('A buy stop: it fills at the trigger on the first day the high reaches it — checked when Portfolio › Update runs. No case study opens by itself; open one here once it has filled.',
        'Lệnh buy stop: khớp tại giá kích hoạt vào ngày đầu tiên giá cao nhất chạm tới — kiểm tra khi bấm Cập nhật ở Danh mục. Case study không tự mở; mở ở đây sau khi lệnh đã khớp.')
      : L('Sold at the trigger the first day price reaches it — checked when Portfolio › Update runs.',
        'Bán tại giá kích hoạt vào ngày đầu tiên giá chạm tới — kiểm tra khi bấm Cập nhật ở Danh mục.')}</div>` : ''}
    <label class="stn-f stn-acct"><span>${L('Account', 'Tài khoản')}</span>
      <select class="field" data-stn="acct"${noAcct ? ' disabled' : ''}>${acctOptions()}</select></label>
    <div class="stn-acct-info">
      <span>${L('Cash', 'Tiền mặt')} <b>${cash(cashNow, ac)}</b></span>
      <button class="stn-link" id="stn-fee-edit" title="${L('Broker fees — edit the table', 'Phí broker — sửa bảng phí')}">${L('Fee', 'Phí')} ${cash(st ? feeOf(st.account) : 0, ac)} · ${esc(feeSource(st))} ✎</button>
    </div>
    <div class="stn-row2">
      ${field('price', `${isOrder ? L('Trigger', 'Giá kích hoạt') : L('Price', 'Giá')} (${ticket.ccy})`, v(ticket.price))}
      ${isOrder && !isBuy
        ? `<label class="stn-f"><span>${L('Order', 'Loại lệnh')}</span><select class="field" data-stn="orderType">
            <option value="STOP_LOSS"${ticket.orderType === 'STOP_LOSS' ? ' selected' : ''}>${L('Stop loss (price ≤)', 'Cắt lỗ (giá ≤)')}</option>
            <option value="TAKE_PROFIT"${ticket.orderType === 'TAKE_PROFIT' ? ' selected' : ''}>${L('Take profit (price ≥)', 'Chốt lời (giá ≥)')}</option></select></label>`
        : isOrder ? '<span></span>'
        : `<label class="stn-f"><span>${L('Date', 'Ngày')}</span><input class="field" type="date" data-stn="date" value="${ticket.date}" max="${today()}"></label>`}
    </div>
    ${field('shares', `${L('Shares', 'Số lượng')}${!isBuy ? ` · max ${fmt(held, 0)}` : ''}`, ticket.shares === null ? '' : String(ticket.shares))}
    <div class="stn-slider">
      <input type="range" min="0" max="100" step="1" value="${pctOf}" data-stn="pct" aria-label="%">
      <div class="stn-pcts">${[25, 50, 75, 100].map((p) => `<button data-stn-pct="${p}" class="${pctOf === p ? 'on' : ''}">${p === 100 && !isBuy ? 'Max' : `${p}%`}</button>`).join('')}</div>
      <small>${isBuy ? L(`% of the playbook size (${fmt(basis, 0)})`, `% cỡ lệnh theo playbook (${fmt(basis, 0)})`) : L(`% of the ${fmt(held, 0)} held`, `% của ${fmt(held, 0)} cp đang giữ`)}</small>
    </div>
    ${isBuy ? `<div class="stn-row2">
        ${field('stop', L('Stop', 'Cắt lỗ'), v(ticket.stop))}
        ${field('target', L('Target', 'Mục tiêu'), v(ticket.target))}
      </div>` : isOrder ? '' : `<label class="stn-f"><span>${L('Why', 'Lý do bán')}</span><select class="field" data-stn="reason">
        <option value="">—</option>${exitReasonOptgroupsHtml(ticket.exitReason, vi(), esc)}</select></label>`}
    ${field('fee', `${L('Fee this order', 'Phí lệnh này')} (${ac})`, ticket.fee === null ? '' : String(ticket.fee), ` placeholder="${fmt(st ? feeOf(st.account) : 0)}"`)}
    <label class="stn-f"><span>${L('Note', 'Ghi chú')}</span><textarea class="field" rows="2" data-stn="note" placeholder="${isBuy ? L('Why this trade, in one line', 'Vì sao vào lệnh này, một dòng') : L('What happened, in one line', 'Chuyện gì đã xảy ra, một dòng')}">${esc(ticket.note)}</textarea></label>
    ${isBuy && !isOrder ? `<label class="stn-check"><input type="checkbox" data-stn="closedOn"${ticket.closedOn ? ' checked' : ''}> ${L('Already sold — book the exit too (closed case study)', 'Đã bán rồi — ghi luôn lệnh bán (case study đóng)')}</label>
      ${ticket.closedOn ? `<div class="stn-exit">
        <div class="stn-row2">
          <label class="stn-f"><span>${L('Exit date', 'Ngày bán')}</span><input class="field" type="date" data-stn="exitDate" value="${ticket.exitDate}" max="${today()}" min="${ticket.date}"></label>
          ${field('exitPrice', `${L('Exit price', 'Giá bán')} (${ticket.ccy})`, v(ticket.exitPrice))}
        </div>
        <label class="stn-f"><span>${L('Why', 'Lý do bán')}</span><select class="field" data-stn="reason"><option value="">—</option>${exitReasonOptgroupsHtml(ticket.exitReason, vi(), esc)}</select></label>
      </div>` : ''}` : ''}
    ${isOrder ? '' : `<label class="stn-check"><input type="checkbox" data-stn="caseOn"${ticket.caseOn ? ' checked' : ''}> ${isBuy
      ? L('Open a case study for this trade', 'Mở case study cho lệnh này')
      : L('Write this sale into its case study', 'Ghi lệnh bán vào case study của nó')}</label>`}
    <div class="stn-sum">
      <div><span>${isBuy ? L('Cost', 'Tổng tiền') : L('Proceeds', 'Tiền thu')}</span><b>${cash(gross, ac)}</b></div>
      ${fee ? `<div><span>${L('Fee', 'Phí')}</span><b>${cash(fee, ac)}</b></div>` : ''}
      ${isBuy && risk !== null ? `<div><span>${L('Risk', 'Rủi ro')}</span><b class="stn-down">${cash(risk, ac)} · ${equity > 0 ? fmt((risk / equity) * 100) : '—'}%</b></div>` : ''}
      ${isBuy && rr !== null ? `<div><span>R:R</span><b>${fmt(rr, 1)}R</b></div>` : ''}
      <div><span>${L('Cash after', 'Tiền mặt sau lệnh')}</span><b class="${nowCash < 0 ? 'stn-down' : ''}">${cash(nowCash, ac)}</b></div>
    </div>
    ${isOrder ? '' : fifo}
    ${block ? `<div class="stn-block">${block}</div>` : ''}
    ${msg ? `<div class="stn-msg${msg.err ? ' err' : ''}">${esc(msg.text)}</div>` : ''}
    <button class="stn-go ${isBuy ? 'stn-go-buy' : 'stn-go-sell'}" id="stn-go"${block || busy || !shares || !px ? ' disabled' : ''}>
      ${busy ? '…' : isOrder
        ? `${L('Place', 'Đặt')} ${isBuy ? 'buy stop' : ticket.orderType === 'STOP_LOSS' ? L('stop loss', 'lệnh cắt lỗ') : L('take profit', 'lệnh chốt lời')} · ${shares ? fmt(shares, 0) : ''} ${esc(sym)}`
        : `${isBuy ? L('Buy', 'Mua') : L('Sell', 'Bán')} ${shares ? fmt(shares, 0) : ''} ${esc(sym)}`}
    </button>`;
}

/** Which lots a sale of `shares` takes from, oldest first — the order core's `sell` uses. */
function fifoPreview(st: (typeof accounts)[number], shares: number, px: number): string {
  if (!shares || !px) return '';
  const ac = st.account.currency;
  const pxAcct = px * ccyFactor(ticket.ccy, ac, ticket.date);
  const lots = openLots(st, sym).slice().sort((a, b) => (a.buyDate < b.buyDate ? -1 : a.buyDate > b.buyDate ? 1 : 0));
  let left = shares;
  const rows: string[] = [];
  let pnl = 0;
  for (const l of lots) {
    if (left <= 0) break;
    const take = Math.min(left, l.remainingShares);
    const p = (pxAcct - l.buyPrice) * take;
    pnl += p;
    left -= take;
    rows.push(`<div><span>${l.buyDate} · ${fmt(take, 0)} @ ${cash(l.buyPrice, ac)}</span><b class="${p >= 0 ? 'stn-up' : 'stn-down'}">${p >= 0 ? '+' : ''}${cash(p, ac)}</b></div>`);
  }
  return `<div class="stn-fifo"><div class="stn-lh">${L('Lots sold (FIFO)', 'Các lô bị bán (FIFO)')}</div>${rows.join('')}
      <div class="stn-fifo-t"><span>${L('Realised', 'Lãi/lỗ thực hiện')}</span><b class="${pnl >= 0 ? 'stn-up' : 'stn-down'}">${pnl >= 0 ? '+' : ''}${cash(pnl, ac)}</b></div></div>`;
}

function bottomHtml(): string {
  const tab = (k: BottomTab, label: string): string => `<button class="${bottom === k ? 'on' : ''}" data-stn-bottom="${k}">${label}</button>`;
  return `<div class="stn-btabs seg">
      ${tab('pos', L('Positions', 'Vị thế'))}${tab('orders', `${L('Pending', 'Lệnh chờ')}${pendingCount() ? ` · ${pendingCount()}` : ''}`)}${tab('hist', L('Fills', 'Lịch sử khớp'))}${tab('cases', L('Case studies', 'Case study'))}
    </div>
    <div class="stn-bbody" id="stn-bbody"></div>`;
}

async function paintBottom(ctx: AppContext, root: HTMLElement): Promise<void> {
  const body = root.querySelector<HTMLElement>('#stn-bbody');
  if (!body) return;
  if (bottom === 'pos') body.innerHTML = positionsHtml();
  if (bottom === 'orders') {
    body.innerHTML = ordersHtml();
    body.querySelectorAll<HTMLElement>('[data-stn-cancel]').forEach((b) => b.addEventListener('click', async () => {
      const [aid, oid] = b.dataset.stnCancel!.split('|');
      try {
        await withAccounts(ctx, (all) => { const a = all.find((x) => x.account.id === aid); if (a) cancelOrder(a, oid!); });
      } catch (e) { msg = { err: true, text: (e as Error).message }; }
      paint(ctx, root);
    }));
  }
  if (bottom === 'hist') body.innerHTML = historyHtml();
  if (bottom === 'cases') {
    const idx = (await loadCaseIndex(ctx).catch(() => [])).filter((m) => m.symbol === sym);
    body.innerHTML = idx.length
      ? `<div class="stn-tbl">${idx.map((m) => `<button class="stn-tr stn-case" data-stn-case="${esc(m.id)}">
          <span>${esc(m.keyDate)}</span><span class="stn-grow">${esc(m.title)}</span>
          <span class="stn-out stn-out-${m.outcome}">${outcomeWord(m.outcome)}</span>
          <span>${m.rMultiple === null || m.rMultiple === undefined ? '' : `${fmt(m.rMultiple, 1)}R`}</span></button>`).join('')}</div>`
      : `<div class="stn-empty">${L(`No case study for ${sym} yet.`, `Chưa có case study nào cho ${sym}.`)}</div>`;
    body.querySelectorAll<HTMLElement>('[data-stn-case]').forEach((b) => b.addEventListener('click', () =>
      window.dispatchEvent(new CustomEvent('app:open-case', { detail: b.dataset.stnCase }))));
  }
}

function outcomeWord(o: string): string {
  const w: Record<string, [string, string]> = { open: ['Open', 'Đang mở'], win: ['Win', 'Thắng'], loss: ['Loss', 'Thua'], scratch: ['Scratch', 'Hòa'] };
  return L(...(w[o] ?? [o, o]));
}

function pendingCount(): number {
  return accounts.reduce((n, a) => n + (a.orders ?? []).filter((o) => o.ticker === sym && o.status === 'pending').length, 0);
}

function ordersHtml(): string {
  const qs = SYM[quoteCcy() ?? 'USD'] ?? '';
  const word = (t: string): string => ({
    BUY_STOP: L('BUY STOP', 'MUA KHI ≥'), STOP_LOSS: L('STOP LOSS', 'CẮT LỖ ≤'), TAKE_PROFIT: L('TAKE PROFIT', 'CHỐT LỜI ≥'),
  } as Record<string, string>)[t] ?? t;
  const rows = accounts.flatMap((a) => (a.orders ?? []).filter((o) => o.ticker === sym && o.status === 'pending').map((o) =>
    `<div class="stn-tr"><span>${esc(o.createdDate)}</span><span class="${o.type === 'BUY_STOP' ? 'stn-side-b' : 'stn-side-s'}">${word(o.type)}</span>
      <span class="stn-grow">${esc(a.account.name)}</span><span>${fmt(o.shares, 0)} @ ${qs}${fmt(o.threshold)}</span>
      <button class="btn-outline stn-mini" data-stn-cancel="${esc(a.account.id)}|${esc(o.id)}">${L('Cancel', 'Huỷ')}</button></div>`));
  return rows.length ? `<div class="stn-tbl">${rows.join('')}</div>`
    : `<div class="stn-empty">${L(`No pending orders for ${sym}.`, `Không có lệnh chờ nào cho ${sym}.`)}</div>`;
}

function positionsHtml(): string {
  const lp = last()?.close ?? null;
  const rows = accounts.map((a) => {
    const lots = openLots(a, sym);
    const n = lots.reduce((s, l) => s + l.remainingShares, 0);
    if (!n) return '';
    const ac = a.account.currency;
    const avg = lots.reduce((s, l) => s + l.buyPrice * l.remainingShares, 0) / n;
    const now = lp === null ? null : lp * ccyFactor(quoteCcy() ?? 'USD', ac, today());
    const pnl = now === null ? null : (now - avg) * n;
    const pct = now === null ? null : ((now - avg) / avg) * 100;
    return `<div class="stn-tr">
        <span class="stn-grow"><b>${esc(a.account.name)}</b></span>
        <span>${fmt(n, 0)} ${L('sh', 'cp')}</span><span>${L('avg', 'TB')} ${cash(avg, ac)}</span>
        <span class="${(pnl ?? 0) >= 0 ? 'stn-up' : 'stn-down'}">${pnl === null ? '—' : `${pnl >= 0 ? '+' : ''}${cash(pnl, ac)} · ${fmt(pct, 1)}%`}</span>
        <button class="btn-outline stn-mini" data-stn-sellacct="${esc(a.account.id)}">${L('Sell', 'Bán')}</button>
      </div>`;
  }).join('');
  return rows ? `<div class="stn-tbl">${rows}</div>` : `<div class="stn-empty">${L(`No account holds ${sym}.`, `Không tài khoản nào đang giữ ${sym}.`)}</div>`;
}

function historyHtml(): string {
  type Row = { date: string; html: string };
  const out: Row[] = [];
  for (const a of accounts) {
    const ac = a.account.currency;
    for (const l of a.lots.filter((x) => x.ticker === sym)) {
      out.push({ date: l.buyDate, html: `<span>${l.buyDate}</span><span class="stn-side-b">${L('BUY', 'MUA')}</span><span class="stn-grow">${esc(a.account.name)}</span><span>${fmt(l.shares, 0)} @ ${cash(l.buyPrice, ac)}</span><span>${l.fee ? `${L('fee', 'phí')} ${cash(l.fee, ac)}` : ''}</span>` });
    }
    for (const r of a.sells.filter((x) => x.ticker === sym)) {
      out.push({ date: r.sellDate, html: `<span>${r.sellDate}</span><span class="stn-side-s">${L('SELL', 'BÁN')}</span><span class="stn-grow">${esc(a.account.name)}${r.exitReasonKey ? ` · ${esc(exitReasonLabel(r.exitReasonKey, vi()))}` : ''}</span><span>${fmt(r.shares, 0)} @ ${cash(r.sellPrice, ac)}</span><span class="${r.realizedPnL >= 0 ? 'stn-up' : 'stn-down'}">${r.realizedPnL >= 0 ? '+' : ''}${cash(r.realizedPnL, ac)}</span>` });
    }
  }
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out.length ? `<div class="stn-tbl">${out.map((r) => `<div class="stn-tr">${r.html}</div>`).join('')}</div>`
    : `<div class="stn-empty">${L(`No fills for ${sym} yet.`, `Chưa có lệnh khớp nào cho ${sym}.`)}</div>`;
}

function drawChart(root: HTMLElement): void {
  const box = root.querySelector<HTMLElement>('#stn-chart');
  chart?.destroy();
  chart = null;
  if (!box) return;
  if (!bars.length) {
    box.innerHTML = `<div class="stn-empty">${sym ? L('Loading the chart…', 'Đang tải chart…') : ''}</div>`;
    return;
  }
  const h = window.innerWidth < 900 ? 300 : window.innerWidth >= 1600 ? 540 : 440;
  chart = drawCandles(box, bars.slice(-190), {
    entry: toQuote(ticket.price), stop: ticket.side === 'buy' ? toQuote(ticket.stop) : null,
    target: ticket.side === 'buy' ? toQuote(ticket.target) : null,
  }, { 5: false, 10: true, 21: true, 50: true, 150: false, 200: true }, { height: h });
  const c = chart;
  c.chart.subscribeClick((param) => {
    if (!pick || !param.point || chart !== c || !liveCtx || !liveRoot) return;
    const q = c.priceAt(param.point.y);
    if (q === null || !(q > 0)) return;
    const v = round(fromQuote(q));
    if (pick === 'price') { ticket.price = v; ticket.priceAuto = false; if (ticket.side === 'buy' && ticket.mode === 'fill') suggest(); }
    if (pick === 'stop') ticket.stop = v;
    if (pick === 'target') ticket.target = v;
    pick = null;
    repaintPickBar(liveCtx, liveRoot);
    repaintLive(liveCtx, liveRoot);
  });
}

function repaintPickBar(ctx: AppContext, root: HTMLElement): void {
  const bar = root.querySelector<HTMLElement>('.stn-pickbar');
  if (bar) bar.outerHTML = pickBarHtml();
  root.querySelector('#stn-chart')?.classList.toggle('picking', !!pick);
  wirePickBar(ctx, root);
}

function wirePickBar(ctx: AppContext, root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-stn-pick]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.stnPick as Pick;
    pick = pick === k ? null : k;
    repaintPickBar(ctx, root);
  }));
}

/** B and S switch the ticket, Esc stops a chart pick — only while this page is on screen. */
let keysBound = false;
function bindKeys(): void {
  if (keysBound) return;
  keysBound = true;
  document.addEventListener('keydown', (e) => {
    const page = document.querySelector('#tab-station');
    if (!page || page.classList.contains('hidden') || !liveCtx || !liveRoot) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.closest('input, textarea, select, [contenteditable="true"]') || tgt.closest('.dialog-host, #modal:not(.hidden)'))) return;
    if (document.querySelector('.dialog-host')) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' && pick) { pick = null; repaintPickBar(liveCtx, liveRoot); return; }
    if (k !== 'b' && k !== 's') return;
    e.preventDefault();
    setSide(k === 'b' ? 'buy' : 'sell');
    repaintLive(liveCtx, liveRoot);
    repaintPickBar(liveCtx, liveRoot);
    drawChart(liveRoot);
    liveRoot.querySelector<HTMLInputElement>('[data-stn="shares"]')?.focus();
  });
}

/** Repaint the ticket, the ladder and the chart lines — not the whole page — while typing. */
function repaintLive(ctx: AppContext, root: HTMLElement, focusKey?: string): void {
  const t = root.querySelector<HTMLElement>('#stn-ticket');
  if (t) {
    const caret = focusKey ? (root.querySelector<HTMLInputElement>(`[data-stn="${focusKey}"]`)?.selectionStart ?? null) : null;
    t.innerHTML = ticketHtml();
    wireTicket(ctx, root);
    if (focusKey) {
      const f = root.querySelector<HTMLInputElement>(`[data-stn="${focusKey}"]`);
      if (f) { f.focus(); if (caret !== null && 'setSelectionRange' in f && f.type !== 'range') { try { f.setSelectionRange(caret, caret); } catch { /* date inputs */ } } }
    }
  }
  const lad = root.querySelector<HTMLElement>('.stn-ladder');
  if (lad) lad.outerHTML = ladderHtml();
  const pp = root.querySelector<HTMLElement>('#stn-plan');
  if (pp) pp.innerHTML = planPanelHtml();
  chart?.setOverlay({
    entry: toQuote(ticket.price), stop: ticket.side === 'buy' ? toQuote(ticket.stop) : null,
    target: ticket.side === 'buy' ? toQuote(ticket.target) : null,
  });
}

// ── wiring ────────────────────────────────────────────────────────────────────

function wire(ctx: AppContext, root: HTMLElement): void {
  const symIn = root.querySelector<HTMLInputElement>('#stn-sym');
  symIn?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && symIn.value.trim()) void loadSymbol(ctx, symIn.value, root);
  });
  symIn?.addEventListener('focus', () => symIn.select());
  root.querySelector('#stn-open-stock')?.addEventListener('click', () => { if (sym) void openStock(ctx, sym); });
  root.querySelectorAll<HTMLElement>('[data-stn-sym]').forEach((b) =>
    b.addEventListener('click', () => void loadSymbol(ctx, b.dataset.stnSym!, root)));
  wirePlan(ctx, root);
  wireBottomTabs(ctx, root);
  root.querySelectorAll<HTMLElement>('[data-stn-dock]').forEach((b) =>
    b.addEventListener('click', () => {
      setSide(b.dataset.stnDock as Side);
      repaintLive(ctx, root);
      root.querySelector('#stn-ticket')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  wireTicket(ctx, root);
  wirePickBar(ctx, root);
}

/**
 * The plan panel is redrawn on every keystroke in the ticket, so its controls are handled by
 * delegation from the section, which stays put.
 */
function wirePlan(ctx: AppContext, root: HTMLElement): void {
  const box = root.querySelector<HTMLElement>('#stn-plan');
  if (!box) return;
  box.addEventListener('click', (ev) => {
    const hit = ev.target as HTMLElement;
    if (hit.closest('[data-stn-crit]')) { critOpen = !critOpen; repaintLive(ctx, root); return; }
    const btn = hit.closest<HTMLElement>('[data-stn-ans]');
    if (!btn || !plan) return;
    const key = btn.dataset.key!;
    const want = btn.dataset.val === 'yes';
    // The answer already chosen clears back to "not asked", which a checkbox cannot say.
    if (plan.answers[key] === want) delete plan.answers[key];
    else plan.answers[key] = want;
    storePlan(ctx);
    if (ticket.side === 'buy') { ticket.shares = null; suggest(); } else regrade();
    repaintLive(ctx, root);
  });
  box.addEventListener('change', (ev) => {
    const f = (ev.target as HTMLElement).closest<HTMLSelectElement>('[data-stnp]');
    if (!f || !plan) return;
    if (f.dataset.stnp === 'setup') {
      ticket.setup = (f.value || '') as SetupKey | '';
      plan.setup = ticket.setup;
      ticket.stop = null; ticket.target = null; ticket.shares = null;
    } else {
      plan.gradeOverride = (['A', 'B', 'C', 'D'].includes(f.value) ? f.value : null) as ConvictionRating | null;
      ticket.shares = null;
    }
    storePlan(ctx);
    suggest();
    repaintLive(ctx, root);
    drawChart(root);
  });
}

function wireBottomTabs(ctx: AppContext, root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.stn-btabs [data-stn-bottom]').forEach((b) =>
    b.addEventListener('click', () => {
      bottom = b.dataset.stnBottom as BottomTab;
      root.querySelector('.stn-bottom')!.innerHTML = bottomHtml();
      wireBottomTabs(ctx, root);
      void paintBottom(ctx, root);
    }));
  root.querySelector('#stn-bbody')?.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-stn-sellacct]');
    if (!b) return;
    setSide('sell');
    ticket.acctId = b.dataset.stnSellacct!;
    ticket.shares = heldIn(ticket.acctId) || null;
    repaintLive(ctx, root);
    root.querySelector('#stn-ticket')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function setSide(side: Side): void {
  if (ticket.side === side) return;
  ticket.side = side;
  if (pick !== 'price') pick = null;
  ticket.shares = null;
  ticket.closedOn = false;
  pickAccount();
  if (side === 'buy') suggest();
}

function wireTicket(ctx: AppContext, root: HTMLElement): void {
  const t = root.querySelector<HTMLElement>('#stn-ticket');
  if (!t) return;
  t.querySelectorAll<HTMLElement>('[data-stn-side]').forEach((b) =>
    b.addEventListener('click', () => { setSide(b.dataset.stnSide as Side); repaintLive(ctx, root); drawChart(root); }));
  t.querySelectorAll<HTMLElement>('[data-stn-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      ticket.mode = b.dataset.stnMode as 'fill' | 'order';
      if (ticket.mode === 'order') { ticket.closedOn = false; ticket.date = today(); }
      repaintLive(ctx, root);
      repaintPickBar(ctx, root);
    }));
  t.querySelectorAll<HTMLElement>('[data-stn-pct]').forEach((b) =>
    b.addEventListener('click', () => { setPct(Number(b.dataset.stnPct)); repaintLive(ctx, root); }));
  t.querySelector('#stn-fee-edit')?.addEventListener('click', () => void editFee(ctx, root));
  t.querySelector('#stn-go')?.addEventListener('click', () => void submit(ctx, root));

  t.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-stn]').forEach((f) => {
    const key = f.dataset.stn!;
    const ev = f.tagName === 'SELECT' || (f as HTMLInputElement).type === 'checkbox' || (f as HTMLInputElement).type === 'date' ? 'change' : 'input';
    f.addEventListener(ev, () => {
      const val = (f as HTMLInputElement).type === 'checkbox' ? (f as HTMLInputElement).checked : f.value;
      onField(key, val);
      const structural = ['acct', 'closedOn', 'caseOn', 'date', 'orderType'].includes(key);
      if (['price', 'stop', 'target', 'acct', 'date'].includes(key) && ticket.side === 'buy') suggest();
      repaintLive(ctx, root, structural || key === 'note' ? undefined : key);
      if (key === 'note') {
        const n = root.querySelector<HTMLTextAreaElement>('[data-stn="note"]');
        if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
      }
    });
  });
}

function onField(key: string, val: string | boolean): void {
  const s = typeof val === 'string' ? val : '';
  switch (key) {
    case 'acct': ticket.acctId = s; if (ticket.side === 'sell') ticket.shares = heldIn(s) || null; break;
    case 'price': ticket.price = posNum(s); ticket.priceAuto = false; break;
    case 'date': {
      ticket.date = s || today();
      // A backdated trade starts from that day's close, unless the user typed a price.
      if (ticket.priceAuto) {
        const c = closeOnOrBefore(bars, ticket.date);
        if (c !== null) ticket.price = round(fromQuote(c));
      }
      if (ticket.exitDate < ticket.date) ticket.exitDate = ticket.date;
      break;
    }
    case 'shares': {
      const n = posNum(s);
      ticket.shares = n === null ? null : Math.round(n);
      if (ticket.side === 'sell' && ticket.shares !== null) ticket.shares = Math.min(ticket.shares, heldIn(ticket.acctId));
      break;
    }
    case 'pct': setPct(Number(s)); break;
    case 'stop': ticket.stop = posNum(s); break;
    case 'target': ticket.target = posNum(s); break;
    case 'setup': ticket.setup = s as SetupKey | ''; ticket.stop = null; ticket.target = null; ticket.shares = null; break;
    case 'fee': { const v = Number(s.replace(',', '.')); ticket.fee = s.trim() === '' || !Number.isFinite(v) || v < 0 ? null : v; break; }
    case 'note': ticket.note = s; break;
    case 'caseOn': ticket.caseOn = !!val; break;
    case 'closedOn': ticket.closedOn = !!val; break;
    case 'exitDate': ticket.exitDate = s || today(); break;
    case 'exitPrice': ticket.exitPrice = posNum(s); break;
    case 'reason': ticket.exitReason = s; break;
    case 'orderType': ticket.orderType = s === 'TAKE_PROFIT' ? 'TAKE_PROFIT' : 'STOP_LOSS'; break;
  }
}

function setPct(p: number): void {
  const basis = ticket.side === 'buy' ? suggestion?.shares ?? 0 : heldIn(ticket.acctId);
  if (basis > 0) ticket.shares = Math.max(0, Math.round((basis * p) / 100)) || null;
}

/** Where the account's fee comes from, in a few words. */
function feeSource(st: (typeof accounts)[number] | null): string {
  if (!st) return '';
  if (typeof st.account.fee === 'number') return L('own fee', 'phí riêng');
  return brokerOf(st.account.name)?.name ?? L('no broker recognised', 'chưa nhận ra broker');
}

async function editFee(ctx: AppContext, root: HTMLElement): Promise<void> {
  const st = acct();
  const rows: BrokerFee[] = brokerFees();
  const host = document.createElement('div');
  host.className = 'dialog-host';
  const rowHtml = (r: BrokerFee, i: number): string => `<div class="stn-brow" data-i="${i}">
      <input class="field" data-k="name" value="${esc(r.name)}" placeholder="${L('Broker name', 'Tên broker')}">
      <input class="field" data-k="fee" inputmode="decimal" value="${r.fee}">
      <button class="btn-outline stn-mini" data-del="${i}" title="${L('Remove', 'Xoá')}">✕</button></div>`;
  const own = st && typeof st.account.fee === 'number' ? String(st.account.fee) : '';
  host.innerHTML = `<div class="dialog-backdrop"></div>
    <div class="dialog stn-confirm" style="width:min(520px,94vw)">
      <div class="dialog-head"><span class="dialog-ic">🏦</span><div>
        <div class="dialog-title">${L('Broker fees', 'Phí broker')}</div>
        <div class="dialog-sub">${L('An account whose name contains the broker pays its fee on every buy and every sell. Change a price here when your broker does.',
          'Tài khoản có tên chứa tên broker sẽ trả phí đó cho mỗi lệnh mua và mỗi lệnh bán. Broker đổi giá thì sửa ở đây.')}</div></div></div>
      <div class="dialog-body">
        <div class="stn-brows"><div class="stn-bhead"><span>${L('Name contains', 'Tên chứa')}</span><span>${L('Fee / order', 'Phí / lệnh')}</span><span></span></div>${rows.map(rowHtml).join('')}</div>
        <button class="btn-outline stn-mini" data-add>+ ${L('Add a broker', 'Thêm broker')}</button>
        ${st ? `<div class="stn-own">
          <div class="stn-lh">${esc(st.account.name)}</div>
          <label class="stn-f"><span>${L('Own fee for this account (blank = from the table above)', 'Phí riêng cho tài khoản này (để trống = theo bảng trên)')}</span>
            <input class="field" data-own inputmode="decimal" value="${esc(own)}" placeholder="${fmt(feeOf({ name: st.account.name }))}"></label>
        </div>` : ''}
      </div>
      <div class="dialog-actions">
        <button class="btn-outline" data-act="no">${L('Cancel', 'Huỷ')}</button>
        <button class="btn" data-act="yes">${L('Save', 'Lưu')}</button>
      </div>
    </div>`;
  document.body.appendChild(host);
  const list = host.querySelector<HTMLElement>('.stn-brows')!;
  const read = (): BrokerFee[] => [...list.querySelectorAll<HTMLElement>('.stn-brow')].map((row) => ({
    name: row.querySelector<HTMLInputElement>('[data-k="name"]')!.value.trim(),
    fee: Number(row.querySelector<HTMLInputElement>('[data-k="fee"]')!.value.replace(',', '.')),
  }));
  list.addEventListener('click', (e) => {
    const d = (e.target as HTMLElement).closest<HTMLElement>('[data-del]');
    if (d) d.closest('.stn-brow')?.remove();
  });
  host.querySelector('[data-add]')!.addEventListener('click', () => {
    list.insertAdjacentHTML('beforeend', rowHtml({ name: '', fee: 0 }, list.children.length));
    list.querySelector<HTMLInputElement>('.stn-brow:last-child [data-k="name"]')?.focus();
  });
  const done = (): void => host.remove();
  host.querySelector('.dialog-backdrop')!.addEventListener('click', done);
  host.querySelector('[data-act="no"]')!.addEventListener('click', done);
  host.querySelector('[data-act="yes"]')!.addEventListener('click', async () => {
    const ownRaw = host.querySelector<HTMLInputElement>('[data-own]')?.value.trim() ?? '';
    const ownV = Number(ownRaw.replace(',', '.'));
    done();
    try {
      await saveBrokerFees(ctx, read());
      if (st) {
        await withAccounts(ctx, (all) => {
          const a = all.find((x) => x.account.id === st.account.id);
          if (!a) return;
          if (ownRaw !== '' && Number.isFinite(ownV) && ownV >= 0) a.account.fee = ownV;
          else delete a.account.fee;
        });
      }
      ticket.fee = null;
    } catch (e) {
      msg = { err: true, text: (e as Error).message };
    }
    repaintLive(ctx, root);
  });
}

// ── recording ─────────────────────────────────────────────────────────────────

function confirm2(title: string, rows: [string, string, string?][], okLabel: string, sell: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'dialog-host';
    host.innerHTML = `<div class="dialog-backdrop"></div>
      <div class="dialog stn-confirm" style="width:min(460px,94vw)">
        <div class="dialog-title">${title}</div>
        <div class="dialog-body"><div class="stn-sum">${rows.map(([k, v, c]) => `<div><span>${esc(k)}</span><b${c ? ` class="${c}"` : ''}>${v}</b></div>`).join('')}</div></div>
        <div class="dialog-actions">
          <button class="btn-outline" data-act="no">${L('Cancel', 'Huỷ')}</button>
          <button class="stn-go ${sell ? 'stn-go-sell' : 'stn-go-buy'}" style="width:auto;padding:0 22px" data-act="yes">${okLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(host);
    const done = (a: boolean): void => { host.remove(); resolve(a); };
    host.querySelector('[data-act="no"]')!.addEventListener('click', () => done(false));
    host.querySelector('.dialog-backdrop')!.addEventListener('click', () => done(false));
    host.querySelector('[data-act="yes"]')!.addEventListener('click', () => done(true));
  });
}

function priced(v: number, date: string): PlannedPrice | null {
  const p = plannedPrice(acctCcy(), v, ticket.ccy, date);
  return 'error' in p ? null : p;
}

const noteHtml = (): string | undefined => (ticket.note.trim() ? sanitizeNoteHtml(`<p>${esc(ticket.note.trim())}</p>`) : undefined);

async function submit(ctx: AppContext, root: HTMLElement): Promise<void> {
  const st = acct();
  const shares = Math.round(ticket.shares ?? 0);
  if (!st || !shares || !ticket.price) return;
  msg = null;
  try {
    if (ticket.mode === 'order') await submitOrder(ctx, st, shares);
    else if (ticket.side === 'buy') await submitBuy(ctx, st, shares);
    else await submitSell(ctx, st, shares);
  } catch (e) {
    msg = { err: true, text: (e as Error).message };
  }
  busy = false;
  await loadList(ctx);
  paint(ctx, root);
}

async function submitBuy(ctx: AppContext, st: (typeof accounts)[number], shares: number): Promise<void> {
  const account = { id: st.account.id, name: st.account.name, currency: st.account.currency };
  const price = priced(ticket.price!, ticket.date);
  const stop = ticket.stop === null ? undefined : priced(ticket.stop, ticket.date);
  const target = ticket.target === null ? undefined : priced(ticket.target, ticket.date);
  if (!price || stop === null || target === null) throw new Error(L('No EUR/USD rate for that date yet — press Update in Portfolio.', 'Chưa có tỷ giá EUR/USD cho ngày đó — bấm Cập nhật ở Danh mục.'));
  if (ticket.stop !== null && ticket.stop >= ticket.price!) throw new Error(L('The stop must be below the price.', 'Stop phải thấp hơn giá mua.'));
  const fee = feeNow();
  const g = effective();
  const write: WritePlan & { kind: 'record_buy' } = {
    kind: 'record_buy', account, ticker: sym, shares, price, date: ticket.date,
    ...(stop ? { stop } : {}), ...(target ? { target } : {}),
    ...(ticket.setup ? { setupType: ticket.setup } : {}),
    ...(g ? { rating: g as Rating } : {}),
    ...(noteHtml() ? { note: noteHtml() } : {}),
    ...(fee ? { fee } : {}),
    cost: shares * price.stored,
  };
  let exit: { price: PlannedPrice; date: string } | null = null;
  if (ticket.closedOn) {
    if (!ticket.exitPrice) throw new Error(L('Give the exit price.', 'Nhập giá bán.'));
    const ep = priced(ticket.exitPrice, ticket.exitDate);
    if (!ep) throw new Error(L('No EUR/USD rate for the exit date.', 'Chưa có tỷ giá cho ngày bán.'));
    exit = { price: ep, date: ticket.exitDate };
  }
  const ac = account.currency;
  const rows: [string, string, string?][] = [
    [L('Account', 'Tài khoản'), esc(account.name)],
    [L('Date', 'Ngày'), ticket.date],
    [L('Shares', 'Số lượng'), `${fmt(shares, 0)} × ${esc(sym)}`],
    [L('Price', 'Giá'), `${cash(price.given, price.currency)}${price.stored !== price.given ? ` → ${cash(price.stored, ac)}` : ''}`],
    ...(stop ? [[L('Stop', 'Cắt lỗ'), cash(stop.given, stop.currency), 'stn-down'] as [string, string, string]] : []),
    ...(target ? [[L('Target', 'Mục tiêu'), cash(target.given, target.currency)] as [string, string]] : []),
    [L('Cost', 'Tổng tiền'), cash(write.cost, ac)],
    ...(fee ? [[L('Fee', 'Phí'), cash(fee, ac)] as [string, string]] : []),
    ...(exit ? [[L('Sold', 'Đã bán'), `${exit.date} @ ${cash(exit.price.given, exit.price.currency)}`] as [string, string]] : []),
    [L('Plan grade', 'Điểm plan'), g ? `${g}${grade ? ` · ${fmt(grade.score, 0)}/100` : ''}` : L('ungraded', 'chưa chấm')],
    [L('Case study', 'Case study'), ticket.caseOn ? (exit ? L('filed closed', 'lưu dạng đã đóng') : L('opened', 'mở mới')) : L('no', 'không')],
  ];
  if (!(await confirm2(L('Record this buy?', 'Ghi lệnh mua này?'), rows, L('Buy', 'Mua'), false))) return;
  busy = true;

  const lotId = (await applyWrite(ctx, write)).lotId ?? '';
  let soldShares = 0;
  if (exit && lotId) {
    await applyWrite(ctx, {
      kind: 'record_sell', account, ticker: sym, shares, price: exit.price, date: exit.date,
      ...(ticket.exitReason ? { exitReasonKey: ticket.exitReason } : {}),
      ...(fee ? { fee } : {}), held: shares, proceeds: shares * exit.price.stored,
    });
    soldShares = shares;
  }

  // Confirming a dialog that listed every number IS having read the plan: record it, against
  // the levels and the letter as they stand, the way the planner's Buy does.
  if (plan) {
    plan.setup = ticket.setup;
    plan.reviewedAt = new Date().toISOString();
    plan.levels = { entry: ticket.price, stop: ticket.stop, target: ticket.target };
    plan.reviewedGrade = g;
    storePlan(ctx);
  }
  // The plan as it stood, frozen against the lot — the same snapshot the planner's Buy cuts.
  const snap = plan ? {
    symbol: sym, savedAt: new Date().toISOString(), date: ticket.date, plan: { ...plan, answers: { ...plan.answers } }, grade, effective: g,
    levels: { entry: ticket.price, stop: ticket.stop, target: ticket.target }, shares, currency: ticket.ccy,
    pctOfFull: g ? ladderConfig().ratingPct[g] : 100,
  } : null;
  if (snap && lotId) await savePlanSnapshot(ctx, { lotId, ...snap }).catch(() => {});

  if (ticket.caseOn && lotId) {
    const study = caseForBuy({
      symbol: sym, accountId: account.id, lotId, date: ticket.date, shares, price: ticket.price!, currency: ticket.ccy,
      ...(fee ? { fee } : {}), stop: ticket.stop, target: ticket.target, setup: ticket.setup,
      rating: (g ?? '') as CaseRating, notes: noteHtml() ?? '', todayIso: today(),
    });
    if (snap) study.plan = snap;
    if (exit) {
      applySell(study, {
        date: exit.date, shares: soldShares, price: ticket.exitPrice!, ...(fee ? { fee } : {}), heldAfter: 0,
        reason: ticket.exitReason ? exitReasonLabel(ticket.exitReason, vi()) : '', ...(ticket.exitReason ? { reasonKey: ticket.exitReason } : {}),
      }, today());
    }
    await saveCase(ctx, study);
  }
  msg = { err: false, text: exit
    ? L(`Recorded: bought and sold ${shares} ${sym}.`, `Đã ghi: mua và bán ${shares} ${sym}.`)
    : L(`Recorded: bought ${shares} ${sym} in ${account.name}.`, `Đã ghi: mua ${shares} ${sym} vào ${account.name}.`) };
  ticket = freshTicket(ticket.acctId);
  ticket.ccy = quoteCcy() ?? 'USD';
  const lp = last()?.close ?? null;
  if (lp !== null) ticket.price = round(fromQuote(lp));
  suggest();
}

async function submitOrder(ctx: AppContext, st: (typeof accounts)[number], shares: number): Promise<void> {
  const isBuy = ticket.side === 'buy';
  const type = isBuy ? 'BUY_STOP' as const : ticket.orderType;
  const held = heldShares(st, sym);
  if (!isBuy && shares > held) throw new Error(L(`Only ${held} held in this account.`, `Tài khoản này chỉ giữ ${held} cp.`));
  const date = today();
  const threshold = priced(ticket.price!, date);
  if (!threshold) throw new Error(L('No EUR/USD rate yet — press Update in Portfolio.', 'Chưa có tỷ giá EUR/USD — bấm Cập nhật ở Danh mục.'));
  const account = { id: st.account.id, name: st.account.name, currency: st.account.currency };
  const q = quoteThreshold(sym, threshold, date);
  const qs = SYM[quoteCcy() ?? 'USD'] ?? '';
  const last0 = last()?.close ?? null;
  // A buy stop below the price, or a stop loss above it, fills on the very next bar — almost
  // always a typo for the other order type, so it is said before it is placed.
  const warn = last0 === null ? '' : type === 'BUY_STOP' && q <= last0
    ? L('The trigger is at or below the last price: it fills on the next bar.', 'Giá kích hoạt ≤ giá hiện tại: lệnh sẽ khớp ngay ở nến kế tiếp.')
    : type === 'STOP_LOSS' && q >= last0 ? L('The stop is at or above the last price: it fills on the next bar.', 'Mức cắt lỗ ≥ giá hiện tại: lệnh sẽ khớp ngay ở nến kế tiếp.')
      : type === 'TAKE_PROFIT' && q <= last0 ? L('The target is at or below the last price: it fills on the next bar.', 'Mức chốt lời ≤ giá hiện tại: lệnh sẽ khớp ngay ở nến kế tiếp.') : '';
  const rows: [string, string, string?][] = [
    [L('Account', 'Tài khoản'), esc(account.name)],
    [L('Order', 'Lệnh'), type.replace('_', ' ')],
    [L('Shares', 'Số lượng'), `${fmt(shares, 0)} × ${esc(sym)}`],
    [L('Trigger', 'Giá kích hoạt'), `${qs}${fmt(q)}`],
    ...(warn ? [[L('Note', 'Lưu ý'), esc(warn), 'stn-down'] as [string, string, string]] : []),
  ];
  if (!(await confirm2(L('Place this order?', 'Đặt lệnh chờ này?'), rows, L('Place', 'Đặt lệnh'), !isBuy))) return;
  busy = true;
  await applyWrite(ctx, { kind: 'place_order', account, ticker: sym, type, threshold, shares, date });
  msg = { err: false, text: L(`Order placed: ${type.replace('_', ' ')} ${shares} ${sym} @ ${qs}${fmt(q)}.`, `Đã đặt lệnh chờ: ${shares} ${sym} @ ${qs}${fmt(q)}.`) };
  bottom = 'orders';
}

async function submitSell(ctx: AppContext, st: (typeof accounts)[number], shares: number): Promise<void> {
  const held = heldShares(st, sym);
  if (shares > held) throw new Error(L(`Only ${held} held in this account.`, `Tài khoản này chỉ giữ ${held} cp.`));
  const account = { id: st.account.id, name: st.account.name, currency: st.account.currency };
  const price = priced(ticket.price!, ticket.date);
  if (!price) throw new Error(L('No EUR/USD rate for that date yet.', 'Chưa có tỷ giá EUR/USD cho ngày đó.'));
  const fee = feeNow();
  const ac = account.currency;
  const rows: [string, string, string?][] = [
    [L('Account', 'Tài khoản'), esc(account.name)],
    [L('Date', 'Ngày'), ticket.date],
    [L('Shares', 'Số lượng'), `${fmt(shares, 0)} / ${fmt(held, 0)} × ${esc(sym)}`],
    [L('Price', 'Giá'), `${cash(price.given, price.currency)}${price.stored !== price.given ? ` → ${cash(price.stored, ac)}` : ''}`],
    [L('Proceeds', 'Tiền thu'), cash(shares * price.stored, ac)],
    ...(fee ? [[L('Fee', 'Phí'), cash(fee, ac)] as [string, string]] : []),
    ...(ticket.exitReason ? [[L('Why', 'Lý do'), esc(exitReasonLabel(ticket.exitReason, vi()))] as [string, string]] : []),
  ];
  if (!(await confirm2(L('Record this sale?', 'Ghi lệnh bán này?'), rows, L('Sell', 'Bán'), true))) return;
  busy = true;
  const res = await applyWrite(ctx, {
    kind: 'record_sell', account, ticker: sym, shares, price, date: ticket.date,
    ...(noteHtml() ? { note: noteHtml() } : {}),
    ...(ticket.exitReason ? { exitReasonKey: ticket.exitReason } : {}),
    ...(fee ? { fee } : {}), held, proceeds: shares * price.stored,
  });
  let caseNote = '';
  const soldIds = (res.sold ?? []).map((x) => x.lotId);
  if (ticket.caseOn && soldIds.length) {
    const idx = (await loadCaseIndex(ctx).catch(() => [])).filter((m) => m.symbol === sym && m.outcome === 'open');
    const studies = (await Promise.all(idx.map((m) => loadCase(ctx, m.id).catch(() => null)))).filter((c): c is CaseStudy => !!c);
    const study = studyForLots(studies, account.id, soldIds);
    if (study) {
      const live = accounts.find((a) => a.account.id === account.id);
      const left = live ? (study.lotIds ?? []).reduce((s, id) => s + (live.lots.find((l) => l.id === id)?.remainingShares ?? 0), 0) : 0;
      const inCase = ticket.price! * ccyFactor(ticket.ccy, study.currency ?? 'USD', ticket.date);
      // Only the shares that came out of THIS trade's lots: FIFO may have taken the rest from an
      // older position in the same account, which belongs to another study or to none.
      const mine = (res.sold ?? []).filter((x) => (study.lotIds ?? []).includes(x.lotId)).reduce((t, x) => t + x.shares, 0);
      applySell(study, {
        date: ticket.date, shares: mine, price: round(inCase, 4), ...(fee ? { fee } : {}), heldAfter: left,
        reason: ticket.exitReason ? exitReasonLabel(ticket.exitReason, vi()) : '', ...(ticket.exitReason ? { reasonKey: ticket.exitReason } : {}),
      }, today());
      await saveCase(ctx, study);
      caseNote = left > 0 ? L(' Case study updated.', ' Đã ghi vào case study.') : L(' Case study closed.', ' Case study đã đóng.');
    }
  }
  msg = { err: false, text: L(`Recorded: sold ${shares} ${sym} from ${account.name}.`, `Đã ghi: bán ${shares} ${sym} từ ${account.name}.`) + caseNote };
  ticket.shares = null;
  ticket.note = '';
  ticket.exitReason = '';
  pickAccount();
}

function round(v: number, d = 2): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
