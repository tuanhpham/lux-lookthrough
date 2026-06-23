import {
  scanQm,
  computeMomentumScore,
  type Period,
  type QmScanResult,
  type MomentumResult,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { $, num, fmtBig, money, fmtPrice, isVnSymbol, scoreColor } from './dom.js';
import { drawCandles, EMA_CONFIG, type CandleChart } from './charts.js';
import { setupBadge, classBadge } from './badges.js';
import { t, getLang } from './i18n.js';
import { loadIndex, loadItems, saveItems, createList, listsContaining } from './watchlists.js';
import { infoIcon as info, attachTooltips } from './tooltip.js';
import { vnTradingViewSymbol } from '../adapters/universe.js';

const RANGES: { label: string; period: Period }[] = [
  { label: '6M', period: '6mo' },
  { label: '1Y', period: '1y' },
  { label: '2Y', period: '2y' },
  { label: '5Y', period: '5y' },
];

let chart: CandleChart | null = null;
const emaState: Record<number, boolean> = Object.fromEntries(EMA_CONFIG.map((e) => [e.period, e.on]));

// Re-render the (hand-drawn SVG) fundamentals chart on resize/rotate. The SVG
// has a fixed pixel width computed at draw time, so unlike the candle chart it
// won't reflow on its own when the phone is rotated — we re-run the last draw.
let redrawFundChart: (() => void) | null = null;
let resizeHandler: (() => void) | null = null;

let onCloseCb: (() => void) | null = null;
/** Register a callback fired whenever the stock modal closes — used to refresh
 * the active tab so watchlist changes made in the modal show immediately. */
export function onModalClose(cb: () => void): void {
  onCloseCb = cb;
}

export function initModal(): void {
  $('#modal-close')!.addEventListener('click', closeModal);
  $('#modal-backdrop')!.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal')!.classList.contains('hidden')) closeModal();
  });
}

function closeModal(): void {
  if ($('#modal')!.classList.contains('hidden')) return;
  $('#modal')!.classList.add('hidden');
  if (chart) {
    chart.destroy();
    chart = null;
  }
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    window.removeEventListener('orientationchange', resizeHandler);
    resizeHandler = null;
  }
  redrawFundChart = null;
  onCloseCb?.();
}

export async function openStock(ctx: AppContext, symbol: string): Promise<void> {
  symbol = symbol.toUpperCase();
  const modal = $('#modal')!;
  modal.classList.remove('hidden');
  $('#modal-title')!.textContent = symbol;
  const body = $('#modal-body')!;
  body.innerHTML = `<div class="muted" style="text-align:center;padding:40px"><span class="spinner"></span> Loading ${symbol}…</div>`;

  let period: Period = '1y';

  try {
    const [fund, ohlcv, fin] = await Promise.all([
      ctx.data.getFundamentals(symbol).catch(() => ({ symbol })),
      ctx.data.getOHLCV(symbol, period).catch(() => ({ symbol, bars: [] })),
      ctx.data.getFinancials(symbol).catch(() => ({ symbol, annual: [], quarterly: [] })),
    ]);
    const qm = ohlcv.bars.length >= 60 ? scanQm(symbol, ohlcv.bars) : null;
    const mom = ohlcv.bars.length >= 60 ? computeMomentumScore(symbol, ohlcv.bars) : null;
    const f = fund as Awaited<ReturnType<AppContext['data']['getFundamentals']>>;

    $('#modal-title')!.innerHTML = `${symbol} <span class="muted" style="font-weight:400;font-size:13px">${f.name ?? ''}</span>`;

    body.innerHTML = renderDetail(symbol, f, qm, mom);
    attachTooltips(body);

    const chartEl = $('#detail-chart')!;
    chart = drawCandles(chartEl, ohlcv.bars, qmOverlay(qm), emaState);

    // EMA legend toggles
    body.querySelectorAll<HTMLElement>('[data-ema]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const p = Number(btn.dataset.ema);
        emaState[p] = !emaState[p];
        btn.classList.toggle('active', emaState[p]);
        chart?.setEma(p, emaState[p]!);
      }),
    );

    // Range buttons re-fetch + redraw
    body.querySelectorAll<HTMLElement>('[data-period]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        period = btn.dataset.period as Period;
        body.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('active', b === btn));
        chartEl.innerHTML = `<div class="muted" style="text-align:center;padding:40px"><span class="spinner"></span></div>`;
        const data = await ctx.data.getOHLCV(symbol, period).catch(() => ({ symbol, bars: [] }));
        const q2 = data.bars.length >= 60 ? scanQm(symbol, data.bars) : null;
        chart?.destroy();
        chart = drawCandles(chartEl, data.bars, qmOverlay(q2), emaState);
      }),
    );

    let fundMetric: 'revenue' | 'netIncome' | 'eps' = 'revenue';
    let fundFreq: 'annual' | 'quarterly' = 'annual';
    // Closure capturing the current metric/freq so we can re-draw on rotate.
    redrawFundChart = () => renderFundChart(fin, fundMetric, fundFreq);
    redrawFundChart();
    body.querySelectorAll<HTMLElement>('[data-fund]').forEach((btn) =>
      btn.addEventListener('click', () => {
        fundMetric = btn.dataset.fund as 'revenue' | 'netIncome' | 'eps';
        body.querySelectorAll('[data-fund]').forEach((b) => b.classList.toggle('active', b === btn));
        redrawFundChart!();
      }),
    );
    body.querySelectorAll<HTMLElement>('[data-freq]').forEach((btn) =>
      btn.addEventListener('click', () => {
        fundFreq = btn.dataset.freq as 'annual' | 'quarterly';
        body.querySelectorAll('[data-freq]').forEach((b) => b.classList.toggle('active', b === btn));
        redrawFundChart!();
      }),
    );

    // On window resize / orientation change, re-flow the fund chart (debounced).
    // The candle chart reflows itself via its own ResizeObserver.
    let rafId = 0;
    resizeHandler = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        // After a rotate the layout settles a frame later; redraw the SVG chart.
        setTimeout(() => redrawFundChart?.(), 120);
      });
    };
    window.addEventListener('resize', resizeHandler);
    window.addEventListener('orientationchange', resizeHandler);

    void wireWatchlistPicker(ctx, symbol);

    // The richer fields (sector, beta, dividend yield, ROE, margin, company
    // summary + website) arrive from a slow background crumb fetch. Poll the
    // cache briefly and live-patch them into the open modal as they land, so
    // the page renders instantly AND About/website fill in without a reopen.
    void patchWhenEnriched(ctx, symbol, body);
  } catch (e) {
    body.innerHTML = `<div class="danger" style="text-align:center;padding:40px">${(e as Error).message}</div>`;
  }
}

function stat(k: string, v: string, tipKey?: string): string {
  return `<div class="stat"><div class="k">${k}${tipKey ? ' ' + info(tipKey) : ''}</div><div class="v">${v}</div></div>`;
}

function renderDetail(
  symbol: string,
  f: { name?: string | null; currency?: string | null; sector?: string | null; industry?: string | null; currentPrice?: number | null; marketCap?: number | null; peRatio?: number | null; eps?: number | null; roe?: number | null; profitMargin?: number | null; revenueGrowth?: number | null; beta?: number | null; dividendYield?: number | null; week52Low?: number | null; week52High?: number | null; summary?: string | null },
  q: QmScanResult | null,
  mom: MomentumResult | null,
): string {
  const price = f.currentPrice ?? q?.price ?? null;
  let patternBlock = '';
  if (q) {
    const rr = q.vcp.pivot != null && q.levels.riskReward != null ? num(q.levels.riskReward, 1) + 'R' : '—';
    patternBlock = `
      <div class="row" style="margin-bottom:10px">
        ${setupBadge(q.setupType)} ${mom ? classBadge(mom.classification) : ''}
        <div style="margin-left:auto" class="row">
          <span class="muted" style="font-size:11px">${t('detail.quality')}</span>
          <span class="scorebar" style="width:90px"><span style="width:${Math.max(0, q.qualityScore)}%;background:${scoreColor(q.qualityScore)}"></span></span>
          <strong style="color:${scoreColor(q.qualityScore)};font-size:18px">${num(q.qualityScore, 0)}</strong>
        </div>
      </div>
      <div class="grid" style="grid-template-columns:repeat(4,1fr)">
        ${stat('Entry', fmtPrice(q.levels.entryPrice, symbol), 'entry')}
        ${stat('Stop', fmtPrice(q.levels.stopLoss, symbol), 'stop')}
        ${stat('Target', fmtPrice(q.levels.targetPrice, symbol), 'target')}
        ${stat('R:R', rr, 'rr')}
        ${stat('Pivot', fmtPrice(q.vcp.pivot, symbol), 'pivot')}
        ${stat('Prev advance', num(q.vcp.previousAdvancePct, 1) + '%', 'prev_advance')}
        ${stat('VCP contr.', String(q.vcp.contractions), 'vcp')}
        ${stat('Risk %', q.riskPct != null ? num(q.riskPct, 1) + '%' : '—', 'risk_pct')}
      </div>
      ${mom ? `<div class="grid" style="grid-template-columns:repeat(4,1fr);margin-top:8px">
        ${stat('Momentum', num(mom.momentumScore, 0), 'momentum_score')}
        ${stat('1M', num(mom.returns.oneMonth, 1) + '%', 'return_1m')}
        ${stat('3M', num(mom.returns.threeMonth, 1) + '%', 'return_3m')}
        ${stat('6M', num(mom.returns.sixMonth, 1) + '%', 'return_6m')}
        ${stat('RS', num(mom.relativeStrength, 1), 'rs')}
        ${stat('ATR%', num(mom.atrPct, 1) + '%', 'atr_pct')}
        ${stat('% off 52wH', num(mom.distanceFrom52wHighPct, 1) + '%', 'dist_52w')}
        ${stat('Trend', q.trend.passed ? '✓ pass' : '✗ fail', 'trend_gate')}
      </div>` : ''}
      <div class="card analysis-card" style="margin-top:12px">
        <div class="section-title" style="margin-top:0">${t('detail.analysis')}</div>
        ${analysisHtml(q, mom)}
      </div>`;
  }
  // TradingView needs EXCHANGE:TICKER for VN names (HOSE:FPT) — `FPT.VN` won't
  // resolve. US tickers pass through unchanged.
  const tvSymbol = isVnSymbol(symbol) ? (vnTradingViewSymbol(symbol) ?? symbol) : symbol;
  const tvUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;
  return `
    <div class="row" style="margin-bottom:12px">
      <div>
        <div style="font-size:22px;font-weight:700">${fmtPrice(price, symbol)}</div>
        <div id="detail-subtitle" class="muted" style="font-size:12px">${f.sector ?? ''}${f.industry ? ' · ' + f.industry : ''}</div>
      </div>
      <div class="row" style="margin-left:auto;gap:8px">
        <button id="wl-toggle" class="btn-outline" style="padding:7px 12px">☆ Watchlist</button>
        <a class="btn-outline btn-icon" href="${tvUrl}" target="_blank" rel="noopener" title="Open in TradingView">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>
          <span>TradingView</span>
          <svg class="ext" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/></svg>
        </a>
      </div>
    </div>
    <div id="wl-picker" class="card hidden" style="margin-bottom:12px;background:var(--surface)"></div>
    ${patternBlock}
    <div class="card" style="margin-top:14px;padding:8px">
      <div class="toolbar" style="margin:4px 6px">
        <span class="section-title" style="margin:0">${t('detail.pricehistory')}</span>
        <div class="row" style="margin-left:auto">
          ${RANGES.map((r) => `<button class="range-btn ${r.period === '1y' ? 'active' : ''}" data-period="${r.period}">${r.label}</button>`).join('')}
        </div>
      </div>
      <div class="row" style="margin:0 6px 6px">
        ${EMA_CONFIG.map((e) => `<button class="range-btn ${e.on ? 'active' : ''}" data-ema="${e.period}">EMA${e.period}</button>`).join('')}
      </div>
      <div id="detail-chart" class="chart"></div>
    </div>
    <div class="card" style="margin-top:14px;padding:8px">
      <div class="toolbar" style="margin:4px 6px">
        <span class="section-title" style="margin:0">${t('detail.fundtrend')}</span>
        <div class="row" style="margin-left:auto;gap:10px">
          <div class="row">
            <button class="range-btn active" data-fund="revenue">Revenue</button>
            <button class="range-btn" data-fund="netIncome">Net Income</button>
            <button class="range-btn" data-fund="eps">EPS</button>
          </div>
          <div class="row">
            <button class="range-btn active" data-freq="annual">Annual</button>
            <button class="range-btn" data-freq="quarterly">Quarterly</button>
          </div>
        </div>
      </div>
      <div id="fund-chart" class="chart" style="height:160px"></div>
    </div>
    <div class="section-title">${t('detail.fundamentals')}</div>
    <div id="fund-grid" class="grid" style="grid-template-columns:repeat(3,1fr)">${fundGridHtml(f, symbol)}</div>
    <div class="section-title">${t('detail.about')}</div>
    <div id="about-block">${aboutHtml(symbol, f)}</div>
    <div class="muted" style="font-size:11px;margin-top:14px">${t('foot.disclaimer')}${money(0).slice(0, 0)}</div>
  `;
}

/** Truncate to ~`max` chars on a word boundary, like the backend's 600-char cap. */
function shorten(text: string, max = 600): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

/** About paragraph + website link (re-renderable as enrichment arrives). */
function aboutHtml(
  symbol: string,
  f: { name?: string | null; currency?: string | null; summary?: string | null; website?: string | null; sector?: string | null; industry?: string | null },
): string {
  const link = f.website
    ? `<a href="${f.website}" target="_blank" rel="noopener" class="link-ext">${f.website} ↗</a>`
    : '';
  if (f.summary) return `<p class="muted" style="line-height:1.6">${shorten(f.summary)}</p>${link}`;
  return `<p class="muted" style="line-height:1.6">${
    f.name ? f.name + (f.currency ? ` · ${f.currency}` : '') : symbol
  } — fetching company profile…</p>`;
}

/** Fundamentals stat grid — re-rendered when enrichment lands so beta / dividend
 * yield / ROE / margin appear once the crumb fetch resolves. */
function fundGridHtml(f: {
  marketCap?: number | null; peRatio?: number | null; eps?: number | null; roe?: number | null;
  profitMargin?: number | null; revenueGrowth?: number | null; beta?: number | null;
  dividendYield?: number | null; week52Low?: number | null; week52High?: number | null;
}, symbol?: string): string {
  const vn = isVnSymbol(symbol);
  const ccy = vn ? ' ₫' : '';
  // VN market cap is in VND (huge) — fmtBig's T/B suffixes apply; tag the unit.
  const mcap = f.marketCap != null ? fmtBig(f.marketCap) + (vn ? ' ₫' : '') : '—';
  // EPS in VND is whole-đồng (e.g. 5,216 ₫); in USD it's a few dollars.
  const eps = f.eps != null ? (vn ? num(f.eps, 0) + ' ₫' : '$' + num(f.eps)) : '—';
  const range =
    f.week52Low != null && f.week52High != null
      ? (vn ? num(f.week52Low, 0) + '–' + num(f.week52High, 0) + ccy : '$' + num(f.week52Low, 0) + '–' + num(f.week52High, 0))
      : '—';
  return [
    stat('Market Cap', mcap, 'market_cap'),
    stat('P/E', num(f.peRatio, 1), 'pe_ratio'),
    stat('EPS', eps, 'eps'),
    stat('ROE', f.roe != null ? num(f.roe * 100, 1) + '%' : '—', 'roe'),
    stat('Profit Margin', f.profitMargin != null ? num(f.profitMargin * 100, 1) + '%' : '—', 'profit_margin'),
    stat('Rev Growth', f.revenueGrowth != null ? num(f.revenueGrowth * 100, 1) + '%' : '—', 'revenue_growth'),
    stat('Beta', num(f.beta, 2), 'beta'),
    stat('Div Yield', f.dividendYield != null ? num(f.dividendYield * 100, 2) + '%' : '—', 'dividend_yield'),
    stat('52w Range', range, 'week52'),
  ].join('');
}

/** Trade-level overlay for the candle chart, sourced from a QM scan. */
function qmOverlay(q: QmScanResult | null): import('./charts.js').TradeOverlay | null {
  if (!q) return null;
  return {
    pivot: q.vcp.pivot,
    entry: q.levels.entryPrice,
    stop: q.levels.stopLoss,
    target: q.levels.targetPrice,
  };
}

const SETUP_PHRASE: Record<string, [string, string]> = {
  VCP: ['a Volatility Contraction Pattern (VCP)', 'mẫu hình co thắt biến động (VCP)'],
  EPISODIC_PIVOT: ['an episodic pivot (news/earnings gap)', 'điểm xoay đột biến (tin tức/lợi nhuận)'],
  BOTH: ['a VCP that is also gapping on a catalyst', 'một VCP đồng thời gap theo chất xúc tác'],
  NONE: ['no actionable QM setup yet', 'chưa có thiết lập QM rõ ràng'],
};

/** Professional bullet-point analysis for the QM + momentum model. Bilingual. */
function analysisHtml(q: QmScanResult, mom: MomentumResult | null): string {
  const vi = getLang() === 'vi';
  const hl = (s: string) => `<span class="hl">${s}</span>`;
  const px = (v: number | null | undefined) => fmtPrice(v, q.symbol);

  const items: string[] = [];
  const [setupEn, setupVi] = SETUP_PHRASE[q.setupType] ?? SETUP_PHRASE.NONE!;
  items.push(
    vi
      ? `<b>${setupVi}</b> · điểm chất lượng ${hl(num(q.qualityScore, 0) + '/100')} · bộ lọc xu hướng ${q.trend.passed ? hl('đạt') : 'chưa đạt'}`
      : `<b>${setupEn}</b> · quality ${hl(num(q.qualityScore, 0) + '/100')} · trend filter ${q.trend.passed ? hl('passed') : 'not passed'}`,
  );

  if (q.vcp.previousAdvancePct > 0) {
    items.push(
      vi
        ? `Nhịp tăng trước nền ${hl(num(q.vcp.previousAdvancePct, 1) + '%')}, ${hl(String(q.vcp.contractions) + ' lần co thắt')}` +
          (q.vcp.volumeContractionPct > 0 ? `, thanh khoản cạn ${hl(num(q.vcp.volumeContractionPct, 1) + '%')}` : '')
        : `Prior advance ${hl(num(q.vcp.previousAdvancePct, 1) + '%')} into a base with ${hl(String(q.vcp.contractions) + ' contraction' + (q.vcp.contractions !== 1 ? 's' : ''))}` +
          (q.vcp.volumeContractionPct > 0 ? `, volume contracted ${hl(num(q.vcp.volumeContractionPct, 1) + '%')}` : ''),
    );
  }

  if (q.ep.isEp) {
    items.push(
      vi
        ? `Gap ${hl(num(q.ep.gapPct, 1) + '%')} với khối lượng tương đối ${hl(num(q.ep.relativeVolume, 1) + '×')}${q.ep.catalyst ? ` — ${q.ep.catalyst}` : ''}`
        : `Gapped ${hl(num(q.ep.gapPct, 1) + '%')} on ${hl(num(q.ep.relativeVolume, 1) + '×')} relative volume${q.ep.catalyst ? ` — ${q.ep.catalyst}` : ''}`,
    );
  }

  if (mom) {
    items.push(
      vi
        ? `Động lượng ${hl(num(mom.momentumScore, 0) + '/100')} (${mom.classification}) · 1M ${hl(num(mom.returns.oneMonth, 1) + '%')} · 3M ${hl(num(mom.returns.threeMonth, 1) + '%')} · 6M ${hl(num(mom.returns.sixMonth, 1) + '%')} · RS ${hl(num(mom.relativeStrength, 1))}`
        : `Momentum ${hl(num(mom.momentumScore, 0) + '/100')} (${mom.classification}) · 1M ${hl(num(mom.returns.oneMonth, 1) + '%')} · 3M ${hl(num(mom.returns.threeMonth, 1) + '%')} · 6M ${hl(num(mom.returns.sixMonth, 1) + '%')} · RS ${hl(num(mom.relativeStrength, 1))}`,
    );
  }

  if (q.vcp.pivot && q.levels.entryPrice && q.levels.stopLoss) {
    const rr = q.levels.riskReward ? num(q.levels.riskReward, 1) + 'R' : '—';
    items.push(
      vi
        ? `Kế hoạch: pivot ${hl(px(q.vcp.pivot))}, mua ${hl(px(q.levels.entryPrice))}, cắt lỗ ${hl(px(q.levels.stopLoss))}${q.levels.targetPrice ? `, mục tiêu ${hl(px(q.levels.targetPrice))}` : ''} (${hl(rr)})`
        : `Plan: pivot ${hl(px(q.vcp.pivot))}, buy ${hl(px(q.levels.entryPrice))}, stop ${hl(px(q.levels.stopLoss))}${q.levels.targetPrice ? `, target ${hl(px(q.levels.targetPrice))}` : ''} (${hl(rr)})`,
    );
  }

  const note = vi
    ? 'Phân tích tự động mang tính giáo dục — không phải lời khuyên đầu tư.'
    : 'Automated, educational read — not financial advice.';
  return `<ul class="analysis-list">${items.map((i) => `<li>${i}</li>`).join('')}</ul>
    <div class="muted" style="font-size:11px;margin-top:6px">${note}</div>`;
}

/**
 * Wires the "☆ Watchlist" button: shows which lists already contain the symbol,
 * lets the user toggle membership per list, and create a new list inline.
 */
async function wireWatchlistPicker(ctx: AppContext, symbol: string): Promise<void> {
  const btn = $('#wl-toggle');
  const picker = $('#wl-picker');
  if (!btn || !picker) return;

  const refreshBtn = async () => {
    const inLists = await listsContaining(ctx, symbol);
    btn.textContent = inLists.size ? `★ Watchlist (${inLists.size})` : '☆ Watchlist';
  };

  const renderPicker = async () => {
    const idx = await loadIndex(ctx);
    const inLists = await listsContaining(ctx, symbol);
    picker.innerHTML = `
      <div class="section-title" style="margin-top:0">Add ${symbol} to…</div>
      <div class="row" style="flex-wrap:wrap">
        ${idx
          .map(
            (w) =>
              `<button class="range-btn ${inLists.has(w.id) ? 'active' : ''}" data-list="${w.id}">${
                inLists.has(w.id) ? '★ ' : '＋ '
              }${w.name}</button>`,
          )
          .join('')}
        <button class="range-btn" data-new>＋ New list…</button>
      </div>`;
    picker.querySelectorAll<HTMLElement>('[data-list]').forEach((b) =>
      b.addEventListener('click', async () => {
        const id = b.dataset.list!;
        const items = await loadItems(ctx, id);
        const has = items.includes(symbol);
        await saveItems(ctx, id, has ? items.filter((s) => s !== symbol) : [...items, symbol]);
        await renderPicker();
        await refreshBtn();
      }),
    );
    picker.querySelector<HTMLElement>('[data-new]')!.addEventListener('click', async () => {
      const name = prompt('Name your new watchlist:', '');
      if (!name?.trim()) return;
      const meta = await createList(ctx, name.trim());
      await saveItems(ctx, meta.id, [symbol]);
      await renderPicker();
      await refreshBtn();
    });
  };

  btn.addEventListener('click', async () => {
    const hidden = picker.classList.toggle('hidden');
    if (!hidden) await renderPicker();
  });
  await refreshBtn();
}

/**
 * Poll the fundamentals cache for a few seconds and live-patch the enriched
 * fields (sector/industry subtitle, company About + website) into the open
 * modal once the background crumb fetch resolves. Stops as soon as the summary
 * lands or the modal is closed, and gives up after the budget.
 */
async function patchWhenEnriched(ctx: AppContext, symbol: string, body: HTMLElement): Promise<void> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    // Modal closed or navigated to another symbol → stop polling.
    if ($('#modal')!.classList.contains('hidden')) return;
    const f = (await ctx.data.getFundamentals(symbol).catch(() => null)) as
      | (Awaited<ReturnType<AppContext['data']['getFundamentals']>> & { website?: string | null })
      | null;
    if (!f) continue;
    // Only patch the currently-open symbol.
    if (!$('#modal-title')!.textContent?.toUpperCase().startsWith(symbol)) return;

    if (f.summary || f.sector || f.beta != null || f.dividendYield != null) {
      const about = body.querySelector('#about-block');
      if (about) about.innerHTML = aboutHtml(symbol, f);
      const grid = body.querySelector('#fund-grid');
      if (grid) {
        grid.innerHTML = fundGridHtml(f, symbol);
        attachTooltips(grid);
      }
      const sub = body.querySelector('#detail-subtitle');
      if (sub && (f.sector || f.industry)) {
        sub.textContent = `${f.sector ?? ''}${f.industry ? ' · ' + f.industry : ''}`;
      }
      if (f.summary) return; // fully enriched — done
    }
  }
}

type FinPoint = { period: string; revenue: number | null; netIncome: number | null; eps: number | null };

function renderFundChart(
  fin: { annual: FinPoint[]; quarterly: FinPoint[] },
  metric: 'revenue' | 'netIncome' | 'eps' = 'revenue',
  freq: 'annual' | 'quarterly' = 'annual',
): void {
  const el = $('#fund-chart');
  if (!el) return;
  let series = (freq === 'annual' ? fin.annual : fin.quarterly).filter((p) => p[metric] != null);
  // Keep the most recent ~12 quarters so labels stay readable.
  if (freq === 'quarterly' && series.length > 12) series = series.slice(-12);
  if (!series.length) {
    el.innerHTML = `<div class="muted" style="text-align:center;padding:30px">No data available.</div>`;
    return;
  }
  const isEps = metric === 'eps';
  const values = series.map((p) => p[metric] as number);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  // Available width of the chart card (measured live so rotate reflows correctly).
  // Fall back through parent → 600 when the element is briefly unmeasurable.
  const avail = el.clientWidth || (el.parentElement?.clientWidth ?? 0) || 600;
  // Fill the container; only scroll horizontally when there are too many bars to
  // fit comfortably (≥52px each). This keeps sparse data from looking stretched
  // and dense data from being cramped.
  const W = Math.max(avail, series.length * 52);
  const H = 160;
  const zeroY = 18 + (max / span) * (H - 40);
  const slot = W / series.length;
  const label = (p: FinPoint): string => {
    const d = new Date(p.period);
    if (freq === 'annual' || Number.isNaN(d.getTime())) return p.period.slice(0, 4);
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `Q${q} '${String(d.getUTCFullYear()).slice(2)}`;
  };
  const fmtVal = (v: number): string =>
    isEps ? (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2) : (v < 0 ? '-$' : '$') + fmtBig(Math.abs(v));
  const bars = series
    .map((p, i) => {
      const v = p[metric] as number;
      const h = (Math.abs(v) / span) * (H - 40);
      const y = v >= 0 ? zeroY - h : zeroY;
      const cx = i * slot + slot / 2;
      const bw = Math.min(slot * 0.6, 40);
      const color = v >= 0 ? '#00d49b' : '#ff5260';
      return `<rect x="${cx - bw / 2}" y="${y}" width="${bw}" height="${Math.max(h, 1)}" rx="3" fill="${color}" opacity=".85"><title>${label(p)}: ${fmtVal(v)}</title></rect>
        <text x="${cx}" y="${(v >= 0 ? y - 4 : y + h + 11)}" text-anchor="middle" font-size="9" fill="#aab3c4">${fmtVal(v)}</text>
        <text x="${cx}" y="${H - 5}" text-anchor="middle" font-size="9" fill="#5b6577">${label(p)}</text>`;
    })
    .join('');
  el.innerHTML = `<div style="overflow-x:auto"><svg width="${W}" height="${H}">${bars}</svg></div>`;
}
