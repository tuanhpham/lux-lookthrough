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
import { computeCash, computeEquity, quoteCurrencyOf, SETUP_KEYS } from '@screener/core';
import type { AppContext } from '../context.js';
import { getLang } from '../ui/i18n.js';
import { drawCandles, EMA_CONFIG, type CandleChart } from '../ui/charts.js';
import { flagSvg, isEurSymbol, isVnSymbol } from '../ui/dom.js';
import { fetchEarningsReports, type EarningsReport } from '../adapters/earningsDates.js';
import { openStock } from '../ui/stockModal.js';
import { accounts, ensureAccountsLoaded, today, withAccounts } from '../portfolio/store.js';
import { cancelOrder } from '@screener/core';
import { accountPrices } from '../portfolio/prices.js';
import { applyEurUsdBars, ccyFactor, ensureEurUsd, eurUsdForDate, hasEurUsd } from '../portfolio/fx.js';
import {
  applyWrite, heldShares, openLots, plannedPrice, quoteThreshold, type PlannedPrice, type Rating, type WritePlan,
} from '../portfolio/writes.js';
import { currentRegime, ensureRegime, ladderConfig, loadPlaybookConfig, type BuyPlan } from '../portfolio/playbook.js';
import { loadPlan, savePlan, type SymbolPlan } from '../portfolio/planStore.js';
import { gradePanelHtml } from '../portfolio/gradeView.js';
import { brokerFees, brokerOf, feeOf, loadBrokerFees, saveBrokerFees, type BrokerFee } from '../portfolio/brokerFees.js';
import { savePlanSnapshot } from '../portfolio/planSnapshot.js';
import { candleDivisor, closeOnOrBefore, inCurrency, planChartWindow } from '../portfolio/planExit.js';
import { computePlan, isPast, periodFor } from '../portfolio/planEngine.js';
import { exitReasonLabel, exitReasonOptgroupsHtml } from '../portfolio/exitReasons.js';
import { setupName } from '../portfolio/planWords.js';
import { loadCase, loadCaseIndex, saveCase, type CaseRating, type CaseStudy } from '../caseStudies/store.js';
import { applySell, caseForBuy, studyForLots } from '../portfolio/stationCase.js';
import { loadIndex as loadWatchlists, loadItems as loadWatchItems } from '../ui/watchlists.js';
import { richNoteDialog, sanitizeNoteHtml } from '../ui/richNote.js';
import { openPlaybookSettings } from '../ui/playbookSettings.js';
import { openExitReasonsDialog } from '../portfolio/exitReasonsDialog.js';
import { openEventFinder } from '../ui/eventFinder.js';
import { eventMarksOf, mergeCatalysts } from '../caseStudies/eventNotes.js';
import type { Catalyst } from '../caseStudies/store.js';

const vi = (): boolean => getLang() === 'vi';
const L = (en: string, viText: string): string => (vi() ? viText : en);

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

type Ccy = 'EUR' | 'USD';
type Side = 'buy' | 'sell';
type BottomTab = 'list' | 'pos' | 'orders' | 'hist' | 'cases';
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
  /** Still the close of the exit date this page put there — moving the date replaces it. */
  exitAuto: boolean;
  exitReason: string;
  /** Events picked in the finder for the case study this buy opens. */
  events: Catalyst[];
  /** The finder's note, headed for the case study and/or the order's own note. */
  caseNote: string;
  orderNote: string;
}

let sym = '';
let bars: Bar[] = [];
let plan: SymbolPlan | null = null;
let suggestion: BuyPlan | null = null;
/** The checklist scored against the ticket as it stands. */
let grade: GradeResult | null = null;
let critOpen = true;
/** The stock page's EMA set, on the same defaults; toggles last for the session. */
const emaState: Record<number, boolean> = Object.fromEntries(EMA_CONFIG.map((e) => [e.period, e.on]));
let showEarnings = true;
let earnReports: EarningsReport[] = [];
/** The ticket's currency picked by the user, kept across symbols. Null = follow the account. */
let ccyChoice: Ccy | null = null;
let ticket: Ticket = freshTicket();
let bottom: BottomTab = 'list';
let chart: CandleChart | null = null;
let msg: { err: boolean; text: string } | null = null;
/** The study the last "case study only" filed, so the message can open it. */
let lastCaseId: string | null = null;
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
    closedOn: false, exitDate: today(), exitPrice: null, exitAuto: true, exitReason: '',
    events: [], caseNote: '', orderNote: '',
  };
}

/** A trade date to open on, handed over by `openStation` and taken once by `renderStation`. */
let pendingDate: string | null = null;

/** An account to select, handed over by `openStation` (the Portfolio account the user came from). */
let pendingAcct: string | null = null;

/** Open the station on a symbol — from the stock page, a position row or a plan card — optionally on a date and an account. */
export function openStation(symbol: string, date?: string | null, accountId?: string | null): void {
  pendingAcct = accountId || null;
  const s = symbol.trim().toUpperCase();
  if (s) {
    try { localStorage.setItem(SYM_KEY, s); } catch { /* private mode */ }
  }
  pendingDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  window.dispatchEvent(new CustomEvent('app:open-station', { detail: s }));
}

// ── derived numbers ───────────────────────────────────────────────────────────

const quoteCcy = (): Ccy | null => {
  const q = quoteCurrencyOf(sym);
  return q === 'EUR' || q === 'USD' ? q : null;
};
const acct = () => accounts.find((a) => a.account.id === ticket.acctId) ?? null;
const acctCcy = (): string => acct()?.account.currency ?? 'EUR';
const last = (): Bar | null => { const v = liveView(); return v[v.length - 1] ?? null; };
const prev = (): Bar | null => { const v = liveView(); return v[v.length - 2] ?? null; };
/** Whether the plan is being reconstructed on a past date. */
let pastPlan = false;
/** The history fetched for this symbol — widened when a far past date needs a full year before it. */
let fetched: '1y' | '2y' | '5y' | 'max' = '2y';
const fromQuote = (v: number, date = ticket.date): number => v * ccyFactor(quoteCcy() ?? 'USD', ticket.ccy, date);

/**
 * The candles in the ticket's currency, every bar at ONE rate (the trade date's), so the chart is
 * the dollar chart relabelled and the levels typed in euros sit where they belong — the planner's
 * rule. Everything drawn on this page reads these; the raw bars only feed the scan and the sizer.
 */
let viewKey = '';
let viewCache: Bar[] = [];
function view(): Bar[] {
  const rate = candleDivisor(sym, ticket.ccy, eurUsdForDate(ticket.date)) ?? 0;
  const past = isPast(bars, ticket.date);
  const exit = ticket.side === 'buy' && ticket.closedOn ? ticket.exitDate : null;
  const key = `${sym}:${bars.length}:${bars[bars.length - 1]?.date ?? ''}:${ticket.ccy}:${rate.toFixed(5)}:${past ? ticket.date : ''}:${exit ?? ''}`;
  if (key !== viewKey) {
    viewKey = key;
    // A reconstructed trade is read on the 6 months around it (4 before, 2 after the date or
    // the exit), the same window the planner and Case Studies use; a live one on the last year.
    const frame = past || exit ? planChartWindow(bars, ticket.date, exit) : bars.slice(-260);
    viewCache = inCurrency(frame, rate);
  }
  return viewCache;
}
/** The last bar there is — the ticker bar's "now", whatever window the chart is showing. */
function liveView(): Bar[] {
  const rate = candleDivisor(sym, ticket.ccy, eurUsdForDate(today())) ?? 0;
  return inCurrency(bars.slice(-260), rate);
}
/** The close of a date in the ticket's currency, at that date's rate. */
function closeIn(date: string): number | null {
  const c = closeOnOrBefore(bars, date);
  return c === null ? null : round(fromQuote(c, date));
}
/** Today's price on the ticket: today's close, else the last one there is (a long weekend). */
function priceNow(): number | null {
  const lastRaw = bars[bars.length - 1];
  return closeIn(today()) ?? (lastRaw ? round(fromQuote(lastRaw.close)) : null);
}
/** The currency the ticket starts in: what the user picked, else the account's, else the quote's. */
function defaultCcy(): Ccy {
  if (ccyChoice) return ccyChoice;
  const a = acct()?.account.currency;
  return a === 'EUR' || a === 'USD' ? a : quoteCcy() ?? 'USD';
}

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
  grade = null;
  const keep = ticket;
  ticket = freshTicket(keep.acctId);
  ticket.side = keep.side;
  ticket.mode = keep.mode;
  ticket.ccy = defaultCcy();
  earnReports = [];
  msg = null;
  paint(ctx, root);
  if (!sym) return;
  const [res, p] = await Promise.all([
    ctx.data.getOHLCV(sym, (fetched = '2y'), { fresh: true }).catch(() => null),
    loadPlan(ctx, sym).catch(() => null),
  ]);
  if (token !== loadToken) return;
  bars = res?.bars ?? [];
  plan = p;
  // `scanQm` needs enough history to measure a base; below that the trade stays ungraded.
  ticket.setup = (p?.setup || '') as SetupKey | '';
  pickAccount();
  ticket.ccy = defaultCcy();
  ticket.price = priceNow() ?? ticket.price;
  // Drawn after the candles, from the network, so the chart never waits on them.
  void fetchEarningsReports(sym).then((rows) => {
    if (token !== loadToken) return;
    earnReports = rows;
    paintEarnings();
  }).catch(() => {});
  suggest();
  pickAccount();
  paint(ctx, root);
}

/**
 * The plan for the ticket as it stands — levels, grade, size — from the shared engine
 * (`planEngine.ts`), so the station, the quick plan cards and every later reader agree.
 * A stop or target the user typed is kept; shares are only filled when empty.
 */
function suggest(): void {
  const st = acct() ?? accounts[0];
  if (!st || !bars.length || !(ticket.price && ticket.price > 0)) { suggestion = null; grade = null; pastPlan = false; return; }
  const out = computePlan({
    state: st, bars, symbol: sym, plan, price: ticket.price, ccy: ticket.ccy, date: ticket.date,
    setup: ticket.setup, stop: ticket.stop, target: ticket.target,
  });
  ticket.stop = out.stop;
  ticket.target = out.target;
  grade = out.grade;
  suggestion = out.sized;
  pastPlan = out.past;
  if (suggestion && ticket.shares === null && ticket.side === 'buy') ticket.shares = suggestion.shares || null;
}

/** Re-score after an answer or a sell-side change: the same engine, nothing else touched. */
function regrade(): void {
  suggest();
}

/** A date far enough back needs more history before it, or the scan reads a short year. */
async function ensureHistory(ctx: AppContext, root: HTMLElement): Promise<void> {
  const want = periodFor(ticket.date, today());
  const order = ['1y', '2y', '5y', 'max'];
  if (order.indexOf(want) <= order.indexOf(fetched)) return;
  const mine = sym;
  const res = await ctx.data.getOHLCV(sym, want).catch(() => null);
  if (mine !== sym || !res?.bars.length) return;
  fetched = want;
  bars = res.bars;
  viewKey = '';
  if (ticket.priceAuto) ticket.price = closeIn(ticket.date) ?? ticket.price;
  suggest();
  paint(ctx, root);
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
  if (pendingAcct && accounts.some((a) => a.account.id === pendingAcct)) {
    ticket.acctId = pendingAcct;
    ccyChoice = null;
  }
  pendingAcct = null;
  if (want !== sym || !bars.length) await loadSymbol(ctx, want, root);
  else { pickAccount(); ticket.ccy = defaultCcy(); suggest(); paint(ctx, root); }
  if (pendingDate) {
    ticket.date = pendingDate;
    pendingDate = null;
    ticket.price = closeIn(ticket.date) ?? ticket.price;
    ticket.priceAuto = true;
    ticket.stop = null; ticket.target = null; ticket.shares = null;
    suggest();
    paint(ctx, root);
    void ensureHistory(ctx, root);
  }
}

function paint(ctx: AppContext, root: HTMLElement): void {
  liveCtx = ctx;
  liveRoot = root;
  bindKeys();
  root.innerHTML = `
    <div class="stn">
      ${tickerBarHtml()}
      <div class="stn-left">
        <aside class="stn-side card"><div class="stn-side-in">${ladderHtml()}</div></aside>
        <aside class="stn-ticket card"><div class="stn-ticket-in" id="stn-ticket">${ticketHtml()}</div></aside>
      </div>
      <div class="stn-center">
      <div class="stn-strip2" id="stn-strip">${stripHtml()}</div>
      <section class="stn-bottom card">${bottomHtml()}</section>
      <section class="stn-main card">
        ${pickBarHtml()}
        <div class="stn-emas">${EMA_CONFIG.map((e) => `<button class="range-btn${emaState[e.period] ? ' active' : ''}" data-stn-ema="${e.period}">EMA${e.period}</button>`).join('')}
          <button class="range-btn${showEarnings ? ' active' : ''}" data-stn-earn title="${L('Earnings report dates', 'Ngày công bố KQKD')}">⬤ E</button></div>
        <div class="stn-chart${pick ? ' picking' : ''}" id="stn-chart"></div>
      </section>
      </div>
      <section class="stn-plan card" id="stn-plan">${planPanelHtml()}</section>
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
  const cs = SYM[ticket.ccy] ?? '';
  const chg = b && p && p.close > 0 ? ((b.close - p.close) / p.close) * 100 : null;
  const vb = liveView();
  const yr = vb.slice(-252);
  const hi = yr.length ? Math.max(...yr.map((x) => x.high)) : null;
  const lo = yr.length ? Math.min(...yr.map((x) => x.low)) : null;
  const pos = b && hi !== null && lo !== null && hi > lo ? ((b.close - lo) / (hi - lo)) * 100 : null;
  const adv = vb.slice(-20);
  const value = adv.length ? adv.reduce((t, x) => t + x.close * x.volume, 0) / adv.length : null;
  const big = (v: number | null): string => (v === null ? '—' : v >= 1e9 ? `${fmt(v / 1e9, 1)}B` : v >= 1e6 ? `${fmt(v / 1e6, 1)}M` : fmt(v, 0));
  const held = accounts.reduce((t, a) => t + heldShares(a, sym), 0);
  const g = effective();
  const flag = isVnSymbol(sym) ? flagSvg('vn') : isEurSymbol(sym) ? flagSvg('de') : flagSvg('us');
  const nextE = earnReports.map((e) => e.date).filter((d) => d >= today()).sort()[0] ?? null;
  const stat = (k: string, v: string, cls = ''): string => `<div class="stn-stat"><small>${k}</small><b class="${cls}">${v}</b></div>`;
  const seg = (c: Ccy): string => `<button class="${ticket.ccy === c ? 'on' : ''}" data-stn-ccy="${c}">${SYM[c]} ${c}</button>`;
  return `<header class="stn-bar card">
      <div class="stn-bar-l">
        <div class="stn-title"><span aria-hidden="true">⚡</span>${L('Trade Station', 'Trạm giao dịch')}</div>
        <label class="stn-sym">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="stn-sym" value="${esc(sym)}" spellcheck="false" autocomplete="off" aria-label="${L('Symbol', 'Mã')}">
          <span class="stn-flag" aria-hidden="true">${flag}</span>
        </label>
        <button class="stn-icon" id="stn-open-stock" title="${L('Open the stock page', 'Mở trang cổ phiếu')}">↗</button>
      </div>
      <div class="stn-px">
        <b>${b ? `${cs}${fmt(b.close)}` : '—'}</b>
        ${chg === null ? '' : `<span class="stn-chg ${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '▲' : '▼'} ${fmt(Math.abs(chg))}%</span>`}
      </div>
      <div class="stn-stats">
        ${stat(L('Day range', 'Biên phiên'), b ? `${fmt(b.low)} – ${fmt(b.high)}` : '—')}
        ${stat(L('52 weeks', '52 tuần'), pos === null ? '—' : `<span class="stn-range"><i style="left:${pos.toFixed(0)}%"></i></span>${fmt(pos, 0)}%`)}
        ${stat(L('Avg value 20d', 'GTGD TB 20p'), `${cs}${big(value)}`)}
        ${stat(L('Next earnings', 'KQKD tới'), nextE ?? '—', nextE ? 'stn-earn' : '')}
        ${stat(L('Held', 'Đang giữ'), held ? `${fmt(held, 0)} ${L('sh', 'cp')}` : '—')}
        ${stat(L('Plan', 'Plan'), g ?? '—', g ? `stn-grade stn-grade-${g}` : '')}
      </div>
      <div class="stn-bar-r">
        <div class="stn-ccy seg" role="group" aria-label="${L('Currency', 'Tiền tệ')}">${seg('EUR')}${seg('USD')}</div>
        <span class="stn-delay"><i></i>${b ? b.date : '—'} · ${L('daily bars, ~15 min late', 'nến ngày, trễ ~15 phút')}</span>
      </div>
    </header>`;
}

const GRP_KEY = 'stn_groups';
function groupOpen(id: string): boolean {
  try { return (JSON.parse(localStorage.getItem(GRP_KEY) ?? '{}') as Record<string, boolean>)[id] !== false; } catch { return true; }
}
function setGroupOpen(id: string, open: boolean): void {
  try {
    const m = JSON.parse(localStorage.getItem(GRP_KEY) ?? '{}') as Record<string, boolean>;
    m[id] = open;
    localStorage.setItem(GRP_KEY, JSON.stringify(m));
  } catch { /* private mode */ }
}

/** Held and every watchlist, each a fold of its own that remembers whether it was open. */
function listHtml(): string {
  const row = (s: string, tag = ''): string =>
    `<button class="stn-li${s === sym ? ' on' : ''}" data-stn-sym="${esc(s)}"><b>${esc(s)}</b>${tag ? `<small>${tag}</small>` : ''}</button>`;
  const heldTag = (s: string): string => {
    const n = accounts.reduce((t, a) => t + heldShares(a, s), 0);
    return n ? `${fmt(n, 0)} ${L('sh', 'cp')}` : '';
  };
  const grp = (id: string, icon: string, name: string, syms: string[], tag: (s: string) => string = () => ''): string =>
    `<details class="stn-grp" data-stn-grp="${esc(id)}"${groupOpen(id) ? ' open' : ''}>
      <summary><span class="stn-grp-ic">${icon}</span><span class="stn-grp-n">${esc(name)}</span><span class="stn-grp-c">${syms.length}</span><span class="stn-grp-chev" aria-hidden="true"></span></summary>
      <div class="stn-grp-b">${syms.map((s) => row(s, tag(s))).join('')}</div>
    </details>`;
  const groups = [
    list.held.length ? grp('held', '💼', L('Held', 'Đang giữ'), list.held, heldTag) : '',
    ...list.watch.map((w) => grp(`wl:${w.name}`, '⭐', w.name, w.syms)),
  ].join('');
  return `<div class="stn-list stn-list-tab">${groups || `<div class="stn-empty">${L('No positions or watchlists yet — type a symbol above.', 'Chưa có vị thế hay watchlist — gõ mã ở ô phía trên.')}</div>`}</div>`;
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
  const avgQ = avgAcct === null ? null : avgAcct * ccyFactor(acctCcy(), ticket.ccy, today());
  const rows: { k: string; v: number | null; cls: string }[] = [
    { k: L('Target', 'Mục tiêu'), v: ticket.target, cls: 'tgt' },
    { k: L('Last', 'Giá'), v: lp, cls: 'px' },
    { k: L('Entry', 'Vào lệnh'), v: ticket.price, cls: 'ent' },
    { k: L('Your avg cost', 'Giá vốn TB'), v: avgQ, cls: 'avg' },
    { k: L('Stop', 'Cắt lỗ'), v: ticket.stop, cls: 'stp' },
  ];
  const shown = rows.filter((r) => r.v !== null && r.v > 0).sort((a, z) => z.v! - a.v!);
  const qs = SYM[ticket.ccy] ?? '';
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
      <div class="stn-ph-t"><b>📋 ${L('Trade plan', 'Kế hoạch giao dịch')}</b>
        <small>${L('scored live from the chart and the ticket', 'tự chấm theo chart và phiếu lệnh')}</small></div>
      <div class="stn-tools">
        <button class="ui-btn sm" data-stn-playbook title="${L('The playbook: stops, targets and size per setup, the risk ladder, the grade lines', 'Playbook: stop, target và cỡ lệnh theo từng setup, thang rủi ro, ngưỡng điểm')}">⚙ Playbook</button>
        <button class="ui-btn sm" data-stn-reasons title="${L('The exit-reason list: add yours, remove the ones you never use', 'Danh sách lý do bán: thêm lý do của bạn, bỏ những lý do không dùng')}">🏷 ${L('Exit reasons', 'Lý do bán')}</button>
      </div>
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
  const asof = pastPlan ? `<div class="stn-asof">⏪ ${L(`Graded on the chart as it was after the close of ${ticket.date} — the market of that day. The account (cash, equity, open risk) is today's.`,
    `Chấm theo chart tính đến phiên ${ticket.date} — thị trường của ngày đó. Tài khoản (tiền mặt, vốn, rủi ro đang mở) là hiện tại.`)}</div>` : '';
  void sizing; // the sizing now lives in the strip above the chart, where it follows the ticket
  return `${head}${asof}${eventsHtml()}<div class="stn-gradebox">${body}</div>`;
}

/** The events saved on the plan, with the finder's button — the catalysts this trade is taken against. */
function eventsHtml(): string {
  const list = (plan?.events ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const pend = ticket.events.length || ticket.caseNote || ticket.orderNote;
  return `<div class="stn-evs">
      <div class="stn-evs-h">
        <b>📅 ${L('Events & catalysts', 'Sự kiện & catalyst')}${list.length ? ` · ${list.length}` : ''}</b>
        <button class="ai-find-btn" data-stn-find${sym ? '' : ' disabled'}><span class="ai-find-ic" aria-hidden="true">✦</span>${L('Find events with the assistant', 'Tìm sự kiện bằng trợ lý')}</button>
      </div>
      ${list.length ? `<div class="stn-evs-list">${list.map((e, i) => `<div class="stn-ev">
          <span class="stn-ev-d">${esc(e.date)}</span><span class="stn-ev-t note-html">${sanitizeNoteHtml(e.text)}</span>
          <button class="stn-ev-x" data-stn-evdel="${i}" title="${L('Remove', 'Xoá')}">✕</button></div>`).join('')}</div>`
        : `<div class="stn-evs-empty">${L(`Search the news around ${ticket.date}: the picked events are saved here, drawn on the chart as ◆ and filed with the case study.`,
          `Tìm tin tức quanh ngày ${ticket.date}: sự kiện được chọn sẽ lưu ở đây, hiện trên chart dạng ◆ và đi theo case study.`)}</div>`}
      ${pend ? `<div class="stn-evs-pend">✓ ${L('Waiting for the buy', 'Chờ lệnh mua')}: ${[
        ticket.events.length ? L(`${ticket.events.length} events → case study`, `${ticket.events.length} sự kiện → case study`) : '',
        ticket.caseNote ? L('note → case study', 'ghi chú → case study') : '',
        ticket.orderNote ? L('note → order', 'ghi chú → lệnh') : '',
      ].filter(Boolean).join(' · ')}</div>` : ''}
    </div>`;
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
    ${pendingHtml(isBuy && !isOrder)}
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
    ${isOrder ? '' : fifo}
    ${block ? `<div class="stn-block">${block}</div>` : ''}
    ${msg ? `<div class="stn-msg${msg.err ? ' err' : ''}">${esc(msg.text)}${!msg.err && lastCaseId ? ` <button class="stn-link" data-stn-opencase="${esc(lastCaseId)}">${L('Open it', 'Mở case study')} →</button>` : ''}</div>` : ''}
    ${isBuy && !isOrder ? `<button class="stn-case-only" id="stn-case-only"${!sym || !px || busy ? ' disabled' : ''} title="${L('No trade, no account: file the setup as a case study — reverse-engineering a past chart, or a trade you passed on.', 'Không giao dịch, không cần tài khoản: lưu setup thành case study — dựng lại một chart cũ, hoặc một lệnh bạn đã bỏ qua.')}">🗂 ${L('Save as a case study only — no buy', 'Chỉ lưu case study — không mua')}</button>` : ''}
    <button class="stn-go ${isBuy ? 'stn-go-buy' : 'stn-go-sell'}" id="stn-go"${block || busy || !shares || !px ? ' disabled' : ''}>
      ${busy ? '…' : isOrder
        ? `${L('Place', 'Đặt')} ${isBuy ? 'buy stop' : ticket.orderType === 'STOP_LOSS' ? L('stop loss', 'lệnh cắt lỗ') : L('take profit', 'lệnh chốt lời')} · ${shares ? fmt(shares, 0) : ''} ${esc(sym)}`
        : `${isBuy ? L('Buy', 'Mua') : L('Sell', 'Bán')} ${shares ? fmt(shares, 0) : ''} ${esc(sym)}`}
    </button>`;
}

/** Cost, fee, risk, R:R and the cash left — the ticket's arithmetic, shown above the chart. */
function stripHtml(): string {
  const st = acct();
  const isBuy = ticket.side === 'buy';
  const isOrder = ticket.mode === 'order';
  const ac = acctCcy();
  const fee = feeNow();
  const shares = Math.max(0, Math.round(ticket.shares ?? 0));
  const px = ticket.price ?? 0;
  const gross = shares && px ? costInAcct(shares, px, ticket.date) : 0;
  const cashNow = st ? computeCash(st) : 0;
  const equity = st ? computeEquity(st, accountPrices(st.account.id)) : 0;
  const riskPer = isBuy && ticket.stop !== null && px > ticket.stop ? px - ticket.stop : null;
  const risk = riskPer !== null ? costInAcct(shares, riskPer, ticket.date) + fee : null;
  const rr = riskPer !== null && ticket.target !== null && ticket.target > px ? (ticket.target - px) / riskPer : null;
  const nowCash = isOrder ? cashNow : isBuy ? cashNow - gross - fee : cashNow + gross - fee;
  let pnl: number | null = null;
  if (!isBuy && st && shares && px) {
    const pxA = px * ccyFactor(ticket.ccy, ac, ticket.date);
    let left = shares;
    pnl = 0;
    for (const l of openLots(st, sym).slice().sort((a, b) => (a.buyDate < b.buyDate ? -1 : 1))) {
      if (left <= 0) break;
      const take = Math.min(left, l.remainingShares);
      pnl += (pxA - l.buyPrice) * take;
      left -= take;
    }
    pnl -= fee;
  }
  const cell = (k: string, v: string, cls = ''): string => `<div class="stn-k ${cls}"><small>${k}</small><b>${v}</b></div>`;
  const side = isBuy ? L('Buy', 'Mua') : L('Sell', 'Bán');
  return `<div class="stn-k stn-k-side ${isBuy ? 'buy' : 'sell'}"><small>${isOrder ? L('Pending', 'Lệnh chờ') : L('Ticket', 'Phiếu lệnh')}</small><b>${side} ${shares ? fmt(shares, 0) : '—'} ${esc(sym)}</b></div>
    ${cell(isBuy ? L('Cost', 'Tổng tiền') : L('Proceeds', 'Tiền thu'), cash(gross, ac))}
    ${cell(L('Fee', 'Phí'), cash(fee, ac))}
    ${isBuy ? cell(L('Risk', 'Rủi ro'), risk === null ? '—' : `${cash(risk, ac)} · ${equity > 0 ? fmt((risk / equity) * 100) : '—'}%`, 'down') : cell(L('Realised', 'Lãi/lỗ thực hiện'), pnl === null ? '—' : `${pnl >= 0 ? '+' : ''}${cash(pnl, ac)}`, pnl !== null && pnl < 0 ? 'down' : 'up')}
    ${isBuy ? cell('R:R', rr === null ? '—' : `${fmt(rr, 1)}R`, rr !== null && rr >= 2 ? 'up' : '') : ''}
    ${cell(L('Cash after', 'Tiền mặt sau'), cash(nowCash, ac), nowCash < 0 ? 'down' : '')}
    ${isBuy ? playbookCells() : ''}`;
}

/** What the playbook would buy, so a ticket that differs from it shows it does. */
function playbookCells(): string {
  const s = suggestion;
  if (!s) return '';
  const g = effective();
  const pct = g ? ladderConfig().ratingPct[g] : 100;
  const rg = s.regime?.regime ?? currentRegime()?.regime ?? null;
  const mine = Math.round(ticket.shares ?? 0);
  const off = mine > 0 && s.size.shares > 0 && mine !== s.size.shares;
  return `<div class="stn-k stn-k-pb${off ? ' off' : ''}" title="${L('Full size, then the grade’s share of it', 'Cỡ đầy đủ, rồi phần theo điểm')}">
      <small>${L('Playbook size', 'Cỡ theo playbook')}</small><b>${fmt(s.size.fullShares, 0)} → ${pct}% → ${fmt(s.size.shares, 0)} ${L('sh', 'cp')}</b></div>
    <div class="stn-k"><small>${L('Risk budget', 'Mức rủi ro')}</small><b>${fmt(s.budget.pct)}% · ${esc(rg ?? '—')}</b></div>`;
}

/** The finder's note and events waiting for this buy: shown, editable, removable. */
function pendingHtml(show: boolean): string {
  if (!show) return '';
  const note = ticket.caseNote || ticket.orderNote;
  if (!note && !ticket.events.length) return '';
  const where = [ticket.caseNote ? L('case study', 'case study') : '', ticket.orderNote ? L('the buy’s note', 'ghi chú lệnh') : ''].filter(Boolean).join(' · ');
  return `<div class="stn-pnote">
      <div class="stn-pnote-h"><b>✦ ${L('From the assistant', 'Từ trợ lý')}</b>
        <span>${ticket.events.length ? L(`${ticket.events.length} events`, `${ticket.events.length} sự kiện`) : ''}${note && where ? ` · ${L('note', 'ghi chú')} → ${esc(where)}` : ''}</span>
        ${note ? `<button class="stn-ev-x" data-stn-pnote-edit title="${L('Edit', 'Sửa')}">✎</button>` : ''}
        <button class="stn-ev-x" data-stn-pnote-del title="${L('Remove', 'Bỏ')}">✕</button></div>
      ${note ? `<div class="note-html stn-pnote-b">${sanitizeNoteHtml(note)}</div>` : ''}
      ${ticket.events.length ? `<div class="stn-pnote-evs">${ticket.events.slice(0, 6).map((e) => `<span><b>${esc(e.date)}</b> ${esc(e.text.replace(/<[^>]+>/g, ' ').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60))}</span>`).join('')}${ticket.events.length > 6 ? `<span>+${ticket.events.length - 6}</span>` : ''}</div>` : ''}
    </div>`;
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
      ${tab('list', `${L('Lists', 'Danh sách')}${list.held.length + list.watch.length ? ` · ${list.held.length + list.watch.length}` : ''}`)}${tab('pos', L('Positions', 'Vị thế'))}${tab('orders', `${L('Pending', 'Lệnh chờ')}${pendingCount() ? ` · ${pendingCount()}` : ''}`)}${tab('hist', L('Fills', 'Lịch sử khớp'))}${tab('cases', L('Case studies', 'Case study'))}
    </div>
    <div class="stn-bbody" id="stn-bbody"></div>`;
}

async function paintBottom(ctx: AppContext, root: HTMLElement): Promise<void> {
  const body = root.querySelector<HTMLElement>('#stn-bbody');
  if (!body) return;
  if (bottom === 'list') {
    body.innerHTML = listHtml();
    body.querySelectorAll<HTMLDetailsElement>('[data-stn-grp]').forEach((d) =>
      d.addEventListener('toggle', () => setGroupOpen(d.dataset.stnGrp!, d.open)));
    body.querySelectorAll<HTMLElement>('[data-stn-sym]').forEach((b) =>
      b.addEventListener('click', () => void loadSymbol(ctx, b.dataset.stnSym!, root)));
  }
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
      ? `<div class="stn-table">
          <div class="stn-row stn-row-c stn-row-h"><span>${L('Key date', 'Ngày')}</span><span>${L('Title', 'Tiêu đề')}</span><span>${L('Outcome', 'Kết quả')}</span><span class="stn-c-n">R</span><span></span></div>
          ${idx.map((m) => `<button class="stn-row stn-row-c stn-case" data-stn-case="${esc(m.id)}">
          <span class="stn-c-d">${esc(m.keyDate)}</span><span class="stn-c-a"><b>${esc(m.title)}</b></span>
          <span><i class="stn-pill o-${m.outcome}">${outcomeWord(m.outcome)}</i></span>
          <span class="stn-c-n">${m.rMultiple === null || m.rMultiple === undefined ? '—' : `${fmt(m.rMultiple, 1)}R`}</span><span class="stn-c-x stn-open">→</span></button>`).join('')}</div>`
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
  const qs = SYM[ticket.ccy] ?? '';
  const inTicket = (v: number): number => v * ccyFactor(quoteCcy() ?? 'USD', ticket.ccy, today());
  const word = (t: string): string => ({
    BUY_STOP: L('Buy stop ≥', 'Mua khi ≥'), STOP_LOSS: L('Stop loss ≤', 'Cắt lỗ ≤'), TAKE_PROFIT: L('Take profit ≥', 'Chốt lời ≥'),
  } as Record<string, string>)[t] ?? t;
  const rows = accounts.flatMap((a) => (a.orders ?? []).filter((o) => o.ticker === sym && o.status === 'pending').map((o) =>
    `<div class="stn-row stn-row-o">
      <span class="stn-c-d">${esc(o.createdDate)}</span>
      <span><i class="stn-pill ${o.type === 'BUY_STOP' ? 'buy' : o.type === 'STOP_LOSS' ? 'sell' : 'tgt'}">${word(o.type)}</i></span>
      <span class="stn-c-a">${esc(a.account.name)}</span>
      <span class="stn-c-n">${fmt(o.shares, 0)}</span>
      <span class="stn-c-n"><b>${qs}${fmt(inTicket(o.threshold))}</b></span>
      <span class="stn-c-x"><button class="ui-btn sm ghost" data-stn-cancel="${esc(a.account.id)}|${esc(o.id)}">✕ ${L('Cancel', 'Huỷ')}</button></span>
    </div>`));
  return rows.length ? `<div class="stn-table">
      <div class="stn-row stn-row-o stn-row-h"><span>${L('Placed', 'Ngày đặt')}</span><span>${L('Order', 'Lệnh')}</span><span>${L('Account', 'Tài khoản')}</span><span class="stn-c-n">${L('Shares', 'Số lượng')}</span><span class="stn-c-n">${L('Trigger', 'Kích hoạt')}</span><span></span></div>
      ${rows.join('')}</div>`
    : `<div class="stn-empty">${L(`No pending orders for ${sym}.`, `Không có lệnh chờ nào cho ${sym}.`)}</div>`;
}

function positionsHtml(): string {
  const lp = last()?.close ?? null;
  const rows = accounts.map((a) => {
    const lots = openLots(a, sym);
    const n = lots.reduce((t, l) => t + l.remainingShares, 0);
    if (!n) return '';
    const ac = a.account.currency;
    const avg = lots.reduce((t, l) => t + l.buyPrice * l.remainingShares, 0) / n;
    const now = lp === null ? null : lp * ccyFactor(ticket.ccy, ac, today());
    const pnl = now === null ? null : (now - avg) * n;
    const pct = now === null ? null : ((now - avg) / avg) * 100;
    const stop = lots.find((l) => l.stop)?.stop ?? null;
    const up = (pnl ?? 0) >= 0;
    return `<div class="stn-row stn-row-p">
        <span class="stn-c-a"><b>${esc(a.account.name)}</b><small>${lots.length} ${L(lots.length === 1 ? 'lot' : 'lots', 'lô')} · ${L('since', 'từ')} ${esc(lots.map((l) => l.buyDate).sort()[0] ?? '')}</small></span>
        <span class="stn-c-n">${fmt(n, 0)}</span>
        <span class="stn-c-n">${cash(avg, ac)}</span>
        <span class="stn-c-n">${now === null ? '—' : cash(now, ac)}</span>
        <span class="stn-c-n">${stop ? cash(stop, ac) : '<i class="stn-warn">—</i>'}</span>
        <span class="stn-c-n"><i class="stn-pnl ${up ? 'up' : 'down'}">${pnl === null ? '—' : `${up ? '+' : ''}${cash(pnl, ac)} · ${up ? '+' : ''}${fmt(pct, 1)}%`}</i></span>
        <span class="stn-c-x"><button class="ui-btn sm danger" data-stn-sellacct="${esc(a.account.id)}">${L('Sell', 'Bán')} →</button></span>
      </div>`;
  }).join('');
  return rows ? `<div class="stn-table">
      <div class="stn-row stn-row-p stn-row-h"><span>${L('Account', 'Tài khoản')}</span><span class="stn-c-n">${L('Shares', 'Số lượng')}</span><span class="stn-c-n">${L('Avg cost', 'Giá vốn TB')}</span><span class="stn-c-n">${L('Last', 'Giá')}</span><span class="stn-c-n">${L('Stop', 'Cắt lỗ')}</span><span class="stn-c-n">${L('P&L', 'Lãi/lỗ')}</span><span></span></div>
      ${rows}</div>`
    : `<div class="stn-empty">${L(`No account holds ${sym}.`, `Không tài khoản nào đang giữ ${sym}.`)}</div>`;
}

function historyHtml(): string {
  type Row = { date: string; html: string };
  const out: Row[] = [];
  for (const a of accounts) {
    const ac = a.account.currency;
    for (const l of a.lots.filter((x) => x.ticker === sym)) {
      out.push({ date: l.buyDate, html: `<span class="stn-c-d">${l.buyDate}</span><span><i class="stn-pill buy">${L('Buy', 'Mua')}</i></span><span class="stn-c-a">${esc(a.account.name)}</span><span class="stn-c-n">${fmt(l.shares, 0)} @ ${cash(l.buyPrice, ac)}</span><span class="stn-c-n">${l.fee ? cash(l.fee, ac) : '—'}</span><span class="stn-c-n">—</span>` });
    }
    for (const r of a.sells.filter((x) => x.ticker === sym)) {
      const up = r.realizedPnL >= 0;
      out.push({ date: r.sellDate, html: `<span class="stn-c-d">${r.sellDate}</span><span><i class="stn-pill sell">${L('Sell', 'Bán')}</i></span><span class="stn-c-a">${esc(a.account.name)}${r.exitReasonKey ? `<small>${esc(exitReasonLabel(r.exitReasonKey, vi()))}</small>` : ''}</span><span class="stn-c-n">${fmt(r.shares, 0)} @ ${cash(r.sellPrice, ac)}</span><span class="stn-c-n">${r.fee ? cash(r.fee, ac) : '—'}</span><span class="stn-c-n"><i class="stn-pnl ${up ? 'up' : 'down'}">${up ? '+' : ''}${cash(r.realizedPnL, ac)}</i></span>` });
    }
  }
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out.length ? `<div class="stn-table">
      <div class="stn-row stn-row-f stn-row-h"><span>${L('Date', 'Ngày')}</span><span>${L('Side', 'Lệnh')}</span><span>${L('Account', 'Tài khoản')}</span><span class="stn-c-n">${L('Fill', 'Khớp')}</span><span class="stn-c-n">${L('Fee', 'Phí')}</span><span class="stn-c-n">${L('Realised', 'Lãi/lỗ')}</span></div>
      ${out.map((r) => `<div class="stn-row stn-row-f">${r.html}</div>`).join('')}</div>`
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
  chart = drawCandles(box, view(), {
    entry: ticket.price, stop: ticket.side === 'buy' ? ticket.stop : null,
    target: ticket.side === 'buy' ? ticket.target : null,
    exit: ticket.side === 'buy' && ticket.closedOn ? ticket.exitPrice : null,
  }, emaState, { height: h });
  paintEarnings();
  const c = chart;
  c.chart.subscribeClick((param) => {
    if (!pick || !param.point || chart !== c || !liveCtx || !liveRoot) return;
    const q = c.priceAt(param.point.y);
    if (q === null || !(q > 0)) return;
    const v = round(q);
    if (pick === 'price') { ticket.price = v; ticket.priceAuto = false; if (ticket.side === 'buy' && ticket.mode === 'fill') suggest(); }
    if (pick === 'stop') ticket.stop = v;
    if (pick === 'target') ticket.target = v;
    pick = null;
    repaintPickBar(liveCtx, liveRoot);
    repaintLive(liveCtx, liveRoot);
  });
}

function paintEarnings(): void {
  chart?.setEarnings(showEarnings ? earnReports.map((r) => ({ date: r.date })) : []);
  // The events this trade is taken against, as flags above the bars — like the case study chart.
  chart?.setEvents(eventMarksOf(mergeCatalysts(plan?.events ?? [], ticket.events), vi()));
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
  const sp = root.querySelector<HTMLElement>('#stn-strip');
  if (sp) sp.innerHTML = stripHtml();
  chart?.setOverlay({
    entry: ticket.price, stop: ticket.side === 'buy' ? ticket.stop : null,
    target: ticket.side === 'buy' ? ticket.target : null,
    exit: ticket.side === 'buy' && ticket.closedOn ? ticket.exitPrice : null,
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
  root.querySelectorAll<HTMLElement>('[data-stn-ccy]').forEach((b) => b.addEventListener('click', () => {
    const next = b.dataset.stnCcy as Ccy;
    if (next === ticket.ccy) return;
    // Every price on the ticket moves into the new currency at its own date's rate.
    const f = ccyFactor(ticket.ccy, next, ticket.date);
    const fx = ccyFactor(ticket.ccy, next, ticket.exitDate);
    for (const k of ['price', 'stop', 'target'] as const) if (ticket[k] !== null) ticket[k] = round(ticket[k]! * f);
    if (ticket.exitPrice !== null) ticket.exitPrice = round(ticket.exitPrice * fx);
    ticket.ccy = next;
    ccyChoice = next;
    suggest();
    paint(ctx, root);
  }));
  root.querySelectorAll<HTMLElement>('[data-stn-ema]').forEach((b) => b.addEventListener('click', () => {
    const per = Number(b.dataset.stnEma);
    emaState[per] = !emaState[per];
    b.classList.toggle('active', emaState[per]);
    chart?.setEma(per, emaState[per]!);
  }));
  root.querySelector<HTMLElement>('[data-stn-earn]')?.addEventListener('click', (e) => {
    showEarnings = !showEarnings;
    (e.currentTarget as HTMLElement).classList.toggle('active', showEarnings);
    paintEarnings();
  });
  root.querySelectorAll<HTMLDetailsElement>('[data-stn-grp]').forEach((d) =>
    d.addEventListener('toggle', () => setGroupOpen(d.dataset.stnGrp!, d.open)));
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
    if (hit.closest('[data-stn-find]')) { void findEvents(ctx, root); return; }
    if (hit.closest('[data-stn-playbook]')) {
      void openPlaybookSettings(ctx, acct(), () => { ticket.stop = null; ticket.target = null; ticket.shares = null; suggest(); paint(ctx, root); });
      return;
    }
    if (hit.closest('[data-stn-reasons]')) {
      void openExitReasonsDialog(ctx).then((changed) => { if (changed) repaintLive(ctx, root); });
      return;
    }
    const del = hit.closest<HTMLElement>('[data-stn-evdel]');
    if (del && plan?.events) {
      const sorted = plan.events.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
      const gone = sorted[Number(del.dataset.stnEvdel)];
      plan.events = plan.events.filter((e) => e !== gone);
      storePlan(ctx);
      repaintLive(ctx, root);
      paintEarnings();
      return;
    }
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

async function findEvents(ctx: AppContext, root: HTMLElement): Promise<void> {
  if (!sym || !plan) return;
  const res = await openEventFinder(ctx, {
    symbol: sym, date: ticket.date, setup: ticket.setup || undefined, entry: ticket.price, stop: ticket.stop, currency: ticket.ccy,
  }, [
    { id: 'plan', what: 'events', label: L(`The ${sym} trade plan (kept for the next trades too)`, `Trade plan của ${sym} (giữ cho cả các lệnh sau)`), on: true },
    { id: 'case', what: 'events', label: L('The case study this buy opens', 'Case study mà lệnh mua này mở'), on: ticket.caseOn },
    { id: 'case-note', what: 'note', label: L('The case study’s notes', 'Ghi chú của case study'), on: ticket.caseOn },
    { id: 'order-note', what: 'note', label: L('The buy’s own note (in Portfolio)', 'Ghi chú của lệnh mua (trong Danh mục)'), on: false },
    { id: 'plan-note', what: 'note', label: L('The trade plan’s note', 'Ghi chú của trade plan'), on: false },
  ]);
  if (!res) return;
  if (res.targets.has('plan') && res.events.length) plan.events = mergeCatalysts(plan.events ?? [], res.events);
  if (res.targets.has('plan-note') && res.noteHtml) { plan.note = (plan.note || '') + res.noteHtml; plan.noteEdited = true; }
  if (res.targets.has('plan') || res.targets.has('plan-note')) storePlan(ctx);
  if (res.targets.has('case')) { ticket.events = mergeCatalysts(ticket.events, res.events); ticket.caseOn = true; }
  if (res.targets.has('case-note')) { ticket.caseNote = res.noteHtml; ticket.caseOn = true; }
  if (res.targets.has('order-note')) ticket.orderNote = res.noteHtml;
  repaintLive(ctx, root);
  paintEarnings();
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
  t.querySelector('[data-stn-pnote-del]')?.addEventListener('click', () => {
    ticket.caseNote = ''; ticket.orderNote = ''; ticket.events = [];
    repaintLive(ctx, root);
    paintEarnings();
  });
  t.querySelector('[data-stn-pnote-edit]')?.addEventListener('click', async () => {
    const res = await richNoteDialog(L('Note from the assistant', 'Ghi chú từ trợ lý'), ticket.caseNote || ticket.orderNote, { lang: vi() ? 'vi' : 'en' });
    if (res === null) return;
    if (ticket.caseNote) ticket.caseNote = res;
    if (ticket.orderNote) ticket.orderNote = res;
    repaintLive(ctx, root);
  });
  t.querySelector('#stn-go')?.addEventListener('click', () => void submit(ctx, root));
  t.querySelector<HTMLElement>('[data-stn-opencase]')?.addEventListener('click', (e) =>
    window.dispatchEvent(new CustomEvent('app:open-case', { detail: (e.currentTarget as HTMLElement).dataset.stnOpencase })));
  t.querySelector('#stn-case-only')?.addEventListener('click', () => void saveCaseOnly(ctx, root));

  t.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-stn]').forEach((f) => {
    const key = f.dataset.stn!;
    const ev = f.tagName === 'SELECT' || (f as HTMLInputElement).type === 'checkbox' || (f as HTMLInputElement).type === 'date' ? 'change' : 'input';
    f.addEventListener(ev, () => {
      const val = (f as HTMLInputElement).type === 'checkbox' ? (f as HTMLInputElement).checked : f.value;
      onField(key, val);
      const structural = ['acct', 'closedOn', 'caseOn', 'date', 'orderType', 'exitDate'].includes(key);
      if (['price', 'stop', 'target', 'acct', 'date'].includes(key) && ticket.side === 'buy') suggest();
      if (key === 'date' || key === 'exitDate' || key === 'closedOn') { drawChart(root); void ensureHistory(ctx, root); }
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
      // A new date is a new chart: the price, and with it the levels and the size, follow it —
      // unless the user typed the price, in which case they are planning that number.
      if (ticket.priceAuto) {
        ticket.price = closeIn(ticket.date) ?? ticket.price;
        ticket.stop = null; ticket.target = null;
        if (ticket.side === 'buy') ticket.shares = null;
      }
      if (ticket.exitDate < ticket.date) { ticket.exitDate = ticket.date; if (ticket.exitAuto) ticket.exitPrice = closeIn(ticket.exitDate); }
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
    case 'closedOn':
      ticket.closedOn = !!val;
      // The close of the exit day, the way the Buy form and the planner seed it.
      if (ticket.closedOn && (ticket.exitAuto || ticket.exitPrice === null)) { ticket.exitPrice = closeIn(ticket.exitDate); ticket.exitAuto = true; }
      break;
    case 'exitDate':
      ticket.exitDate = s || today();
      if (ticket.exitAuto) ticket.exitPrice = closeIn(ticket.exitDate);
      break;
    case 'exitPrice': ticket.exitPrice = posNum(s); ticket.exitAuto = false; break;
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

const noteHtml = (): string | undefined => {
  const own = ticket.note.trim() ? `<p>${esc(ticket.note.trim())}</p>` : '';
  const html = own + (ticket.side === 'buy' ? ticket.orderNote : '');
  return html ? sanitizeNoteHtml(html) : undefined;
};

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
      rating: (g ?? '') as CaseRating, notes: sanitizeNoteHtml((noteHtml() ?? '') + ticket.caseNote), todayIso: today(),
    });
    if (snap) study.plan = snap;
    // The events this trade was taken against: the ones picked for it, and the plan's own.
    study.catalysts = mergeCatalysts(plan?.events ?? [], ticket.events);
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
  ticket.ccy = defaultCcy();
  ticket.price = priceNow();
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
  const tp = ticket.price!;
  const warn = last0 === null ? '' : type === 'BUY_STOP' && tp <= last0
    ? L('The trigger is at or below the last price: it fills on the next bar.', 'Giá kích hoạt ≤ giá hiện tại: lệnh sẽ khớp ngay ở nến kế tiếp.')
    : type === 'STOP_LOSS' && tp >= last0 ? L('The stop is at or above the last price: it fills on the next bar.', 'Mức cắt lỗ ≥ giá hiện tại: lệnh sẽ khớp ngay ở nến kế tiếp.')
      : type === 'TAKE_PROFIT' && tp <= last0 ? L('The target is at or below the last price: it fills on the next bar.', 'Mức chốt lời ≤ giá hiện tại: lệnh sẽ khớp ngay ở nến kế tiếp.') : '';
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

/**
 * A case study with no trade behind it: the ticket's levels, grade, events and notes, filed
 * straight to Case Studies. "Already sold" fills its exit, so a reverse-engineered past setup
 * is filed closed with its R; otherwise it is filed open, as an idea being followed.
 */
async function saveCaseOnly(ctx: AppContext, root: HTMLElement): Promise<void> {
  if (!sym || !ticket.price) return;
  const g = effective();
  const shares = Math.max(0, Math.round(ticket.shares ?? 0)) || 1;
  if (ticket.closedOn && !ticket.exitPrice) { msg = { err: true, text: L('Give the exit price.', 'Nhập giá bán.') }; repaintLive(ctx, root); return; }
  const snap = plan ? {
    symbol: sym, savedAt: new Date().toISOString(), date: ticket.date, plan: { ...plan, answers: { ...plan.answers } }, grade, effective: g,
    levels: { entry: ticket.price, stop: ticket.stop, target: ticket.target }, shares, currency: ticket.ccy,
    pctOfFull: g ? ladderConfig().ratingPct[g] : 100,
  } : null;
  const study = caseForBuy({
    symbol: sym, accountId: '', lotId: '', date: ticket.date, shares, price: ticket.price, currency: ticket.ccy,
    stop: ticket.stop, target: ticket.target, setup: ticket.setup, rating: (g ?? '') as CaseRating,
    notes: sanitizeNoteHtml((noteHtml() ?? '') + ticket.caseNote), todayIso: today(),
  });
  // Not a position in any account, so nothing for a later sale to find.
  delete study.accountId;
  delete study.lotIds;
  if (snap) study.plan = snap;
  study.catalysts = mergeCatalysts(plan?.events ?? [], ticket.events);
  if (ticket.closedOn) {
    applySell(study, {
      date: ticket.exitDate, shares, price: ticket.exitPrice!, heldAfter: 0,
      reason: ticket.exitReason ? exitReasonLabel(ticket.exitReason, vi()) : '', ...(ticket.exitReason ? { reasonKey: ticket.exitReason } : {}),
    }, today());
  }
  try {
    await saveCase(ctx, study);
  } catch (e) {
    msg = { err: true, text: (e as Error).message };
    repaintLive(ctx, root);
    return;
  }
  if (plan) storePlan(ctx);
  ticket.events = [];
  ticket.caseNote = '';
  lastCaseId = study.id;
  msg = { err: false, text: ticket.closedOn
    ? L(`Case study filed (closed, ${study.rMultiple ?? '—'}R). No trade was recorded.`, `Đã lưu case study (đã đóng, ${study.rMultiple ?? '—'}R). Không ghi lệnh nào.`)
    : L('Case study filed (open). No trade was recorded.', 'Đã lưu case study (đang mở). Không ghi lệnh nào.') };
  repaintLive(ctx, root);
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
