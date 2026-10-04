/**
 * Quick trade-plan cards — what the stock page and the watchlist show in place of the old Trade
 * Planner, now that the Trade Station is where a plan is worked, graded, bought and filed.
 *
 * ── WHY THE PLANNER WAS FOLDED INTO THE STATION ─────────────────────────────
 * The user (2026-10-03): the planner and the case study were two versions of the same thing.
 * The station had every part of the planner — the checklist and its grade, the sizing, the
 * chart, a past trade date, the exit, the case study — plus the buy, the sell and the events.
 * Keeping both meant two checklists to keep agreeing. So the full plan lives in one place, and
 * here, beside a chart or a list, a card answers the quick question — "what does the plan say
 * about this one?" — with the SAME engine (`planEngine.ts`), and one press opens the station.
 *
 * Nothing is written from a card except the events the user picks in the finder.
 */
import type { Bar, SetupKey } from '@screener/core';
import { quoteCurrencyOf } from '@screener/core';
import type { AppContext } from '../context.js';
import { getLang } from '../ui/i18n.js';
import { drawCandles, type CandleChart } from '../ui/charts.js';
import { fetchEarningsReports } from '../adapters/earningsDates.js';
import { openEventFinder } from '../ui/eventFinder.js';
import { accounts, ensureAccountsLoaded, today } from './store.js';
import { ccyFactor, ensureEurUsdLive, eurUsdForDate } from './fx.js';
import { ensureRegime, currentRegime, ladderConfig, loadPlaybookConfig } from './playbook.js';
import { loadPlan, savePlan, type SymbolPlan } from './planStore.js';
import { candleDivisor, closeOnOrBefore, inCurrency, planChartWindow } from './planExit.js';
import { computePlan, isPast, periodFor, type PlanOut } from './planEngine.js';
import { setupName } from './planWords.js';
import { gradeColor } from './gradeView.js';
import { eventMarksOf, mergeCatalysts } from '../caseStudies/eventNotes.js';
import { openStation } from '../tabs/stationTab.js';

export interface CardMount {
  host: HTMLElement;
  symbols: () => string[] | Promise<string[]>;
  title: string;
  /** Plan as of this date (the stock page's time travel); null = today. */
  asOf?: string | null;
  onOpenSymbol?: (symbol: string) => void;
  /** Called before the station opens — the stock page closes its modal here. */
  onStation?: () => void;
  onClose?: () => void;
}

const vi = (): boolean => getLang() === 'vi';
const L = (en: string, v: string): string => (vi() ? v : en);
const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const SYM: Record<string, string> = { EUR: '€', USD: '$' };
const fmt = (v: number | null | undefined, d = 2): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString(vi() ? 'vi-VN' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const mounted = new Map<HTMLElement, { charts: CandleChart[]; token: number }>();
let tokens = 0;

export function planCardsIn(host: HTMLElement): boolean {
  return mounted.has(host);
}

export function closePlanCards(host?: HTMLElement): void {
  for (const [h, m] of mounted) {
    if (host && h !== host && !host.contains(h)) continue;
    for (const c of m.charts) { try { c.destroy(); } catch { /* gone */ } }
    h.innerHTML = '';
    mounted.delete(h);
  }
}

export async function openPlanCards(ctx: AppContext, m: CardMount): Promise<void> {
  closePlanCards(m.host);
  const token = ++tokens;
  const state = { charts: [] as CandleChart[], token };
  mounted.set(m.host, state);
  const date = m.asOf ?? today();
  m.host.innerHTML = `<section class="pc-panel card">
      <header class="pc-head">
        <div><b>📋 ${L('Trade plan', 'Trade plan')} · ${esc(m.title)}</b>
          <small>${L('Quick read with the station’s own grade and size. Work it, buy it or file it in the Trade Station.',
            'Xem nhanh bằng đúng cách chấm điểm và tính cỡ lệnh của Trạm. Làm tiếp, mua hoặc lưu case study trong Trạm giao dịch.')}${m.asOf ? ` · ⏪ ${L('as of', 'tính đến')} ${esc(m.asOf)}` : ''}</small></div>
        <button class="pc-x" data-pc-close aria-label="${L('Close', 'Đóng')}">✕</button>
      </header>
      <div class="pc-grid"><div class="pc-loading"><span class="spinner"></span> ${L('Planning…', 'Đang lập plan…')}</div></div>
    </section>`;
  m.host.querySelector('[data-pc-close]')?.addEventListener('click', () => { closePlanCards(m.host); m.onClose?.(); });

  await Promise.all([
    ensureAccountsLoaded(ctx).catch(() => {}),
    ensureEurUsdLive(ctx),
    loadPlaybookConfig(ctx).catch(() => null),
    currentRegime() ? Promise.resolve(null) : ensureRegime(ctx).catch(() => null),
  ]);
  const syms = [...new Set((await m.symbols()).map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 30);
  const grid = m.host.querySelector<HTMLElement>('.pc-grid');
  if (!grid || mounted.get(m.host)?.token !== token) return;
  if (!syms.length) { grid.innerHTML = `<div class="stn-empty">${L('No symbols to plan.', 'Không có mã nào để lập plan.')}</div>`; return; }
  grid.innerHTML = syms.map((s) => `<article class="pc-card" data-pc="${esc(s)}"><div class="pc-loading"><span class="spinner"></span> ${esc(s)}</div></article>`).join('');
  // A few at a time: a 30-symbol list must not open 30 requests at once.
  const queue = [...syms];
  const worker = async (): Promise<void> => {
    while (queue.length) {
      const s = queue.shift()!;
      if (mounted.get(m.host)?.token !== token) return;
      await fillCard(ctx, m, s, date, token).catch(() => {
        const el = m.host.querySelector<HTMLElement>(`[data-pc="${CSS.escape(s)}"]`);
        if (el) el.innerHTML = `<div class="stn-empty">${esc(s)} — ${L('could not load', 'không tải được')}</div>`;
      });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

async function fillCard(ctx: AppContext, m: CardMount, sym: string, date: string, token: number): Promise<void> {
  const [res, plan] = await Promise.all([
    ctx.data.getOHLCV(sym, periodFor(date, today())).catch(() => null),
    loadPlan(ctx, sym).catch(() => null),
  ]);
  const el = m.host.querySelector<HTMLElement>(`[data-pc="${CSS.escape(sym)}"]`);
  if (!el || mounted.get(m.host)?.token !== token) return;
  const bars = res?.bars ?? [];
  const st = accounts[0];
  const q = quoteCurrencyOf(sym);
  const acc = st?.account.currency;
  const ccy: 'EUR' | 'USD' = acc === 'EUR' || acc === 'USD' ? acc : q === 'EUR' ? 'EUR' : 'USD';
  const raw = closeOnOrBefore(bars, date) ?? bars[bars.length - 1]?.close ?? null;
  const price = raw === null ? null : Math.round(raw * ccyFactor(q === 'EUR' || q === 'USD' ? q : 'USD', ccy, date) * 100) / 100;
  const out: PlanOut | null = st && price ? computePlan({
    state: st, bars, symbol: sym, plan, price, ccy, date, setup: (plan?.setup || '') as SetupKey | '', stop: null, target: null,
  }) : null;
  el.innerHTML = cardHtml(sym, plan, out, price, ccy, date, bars);
  wireCard(ctx, m, el, sym, plan, date);
  drawCardChart(m, el, sym, bars, out, ccy, date, plan);
}

function cardHtml(sym: string, plan: SymbolPlan | null, out: PlanOut | null, price: number | null, ccy: 'EUR' | 'USD', date: string, bars: readonly Bar[]): string {
  const cs = SYM[ccy] ?? '';
  const g = out?.effective ?? null;
  const pct = g ? ladderConfig().ratingPct[g] : 100;
  const s = out?.sized ?? null;
  const stopPct = price && out?.stop ? ((price - out.stop) / price) * 100 : null;
  const r = price && out?.stop && out.target && out.stop < price ? (out.target - price) / (price - out.stop) : null;
  const evs = (plan?.events ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const strip = (h: string): string => h.replace(/<[^>]+>/g, ' ').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  const lvl = (k: string, v: string, cls = ''): string => `<div class="pc-lv ${cls}"><small>${k}</small><b>${v}</b></div>`;
  return `
    <header class="pc-ch">
      <button class="pc-sym" data-pc-open>${esc(sym)}</button>
      <span class="pc-setup">${plan?.setup ? esc(setupName(plan.setup as SetupKey, vi())) : L('no setup', 'chưa chọn setup')}</span>
      ${g ? `<span class="pc-grade" style="--g:${gradeColor(g)}">${g}${out?.grade ? `<small>${fmt(out.grade.score, 0)}</small>` : ''}</span>` : `<span class="pc-grade pc-grade-none">—</span>`}
      ${out?.past ? `<span class="pc-asof">⏪ ${esc(date)}</span>` : ''}
    </header>
    <div class="pc-lvs">
      ${lvl(L('Price', 'Giá'), price ? `${cs}${fmt(price)}` : '—')}
      ${lvl(L('Stop', 'Cắt lỗ'), out?.stop ? `${cs}${fmt(out.stop)}${stopPct !== null ? ` <i>−${fmt(stopPct, 1)}%</i>` : ''}` : '—', 'stp')}
      ${lvl(L('Target', 'Mục tiêu'), out?.target ? `${cs}${fmt(out.target)}${r !== null ? ` <i>${fmt(r, 1)}R</i>` : ''}` : '—', 'tgt')}
      ${lvl(L('Size', 'Cỡ lệnh'), s ? `${fmt(s.shares, 0)} ${L('sh', 'cp')} <i>${pct}%</i>` : '—')}
    </div>
    <div class="pc-chart" data-pc-chart></div>
    ${evs.length ? `<div class="pc-evs">${evs.slice(0, 4).map((e) => `<span class="pc-ev"><b>${esc(e.date)}</b> ${esc(strip(e.text).slice(0, 70))}</span>`).join('')}${evs.length > 4 ? `<span class="pc-ev pc-more">+${evs.length - 4}</span>` : ''}</div>` : ''}
    <footer class="pc-foot">
      <button class="pc-go" data-pc-station>⚡ ${L('Open in the Trade Station', 'Mở trong Trạm giao dịch')}</button>
      <button class="ai-find-btn" data-pc-find><span class="ai-find-ic" aria-hidden="true">✦</span>${L('Find events', 'Tìm sự kiện')}${evs.length ? ` · ${evs.length}` : ''}</button>
    </footer>
    ${!bars.length ? `<div class="stn-empty">${L('No price data.', 'Không có dữ liệu giá.')}</div>` : ''}`;
}

function drawCardChart(m: CardMount, el: HTMLElement, sym: string, bars: readonly Bar[], out: PlanOut | null, ccy: 'EUR' | 'USD', date: string, plan: SymbolPlan | null): void {
  const box = el.querySelector<HTMLElement>('[data-pc-chart]');
  if (!box || !bars.length) return;
  const rate = candleDivisor(sym, ccy, eurUsdForDate(date)) ?? 0;
  const frame = isPast(bars, date) ? planChartWindow(bars, date, null) : bars.slice(-130);
  // A lone card (the stock page plans one symbol) spans the row, so it gets the taller chart.
  const chart = drawCandles(box, inCurrency(frame, rate), { stop: out?.stop ?? null, target: out?.target ?? null },
    { 5: false, 10: true, 21: true, 50: true, 150: false, 200: true }, { height: el.parentElement?.childElementCount === 1 ? 320 : 210, noVolume: false });
  mounted.get(m.host)?.charts.push(chart);
  chart.setEvents(eventMarksOf(plan?.events, vi()));
  void fetchEarningsReports(sym).then((rows) => {
    if (box.isConnected) chart.setEarnings((m.asOf ? rows.filter((r) => r.date <= m.asOf!) : rows).map((r) => ({ date: r.date })));
  }).catch(() => {});
}

function wireCard(ctx: AppContext, m: CardMount, el: HTMLElement, sym: string, plan: SymbolPlan | null, date: string): void {
  el.querySelector('[data-pc-open]')?.addEventListener('click', () => m.onOpenSymbol?.(sym));
  el.querySelector('[data-pc-station]')?.addEventListener('click', () => {
    m.onStation?.();
    openStation(sym, m.asOf ?? null);
  });
  el.querySelector('[data-pc-find]')?.addEventListener('click', async () => {
    const p = plan ?? (await loadPlan(ctx, sym));
    const res = await openEventFinder(ctx, { symbol: sym, date, setup: p.setup || undefined }, [
      { id: 'plan', what: 'events', label: L(`The ${sym} trade plan (and case studies filed from it)`, `Trade plan của ${sym} (và case study lập từ plan)`), on: true },
      { id: 'note', what: 'note', label: L('The plan’s note', 'Ghi chú của plan'), on: true },
    ]);
    if (!res) return;
    if (res.targets.has('plan')) p.events = mergeCatalysts(p.events ?? [], res.events);
    if (res.targets.has('note') && res.noteHtml) { p.note = (p.note || '') + res.noteHtml; p.noteEdited = true; }
    await savePlan(ctx, p).catch(() => {});
    await fillCard(ctx, m, sym, date, mounted.get(m.host)?.token ?? -1);
  });
}
