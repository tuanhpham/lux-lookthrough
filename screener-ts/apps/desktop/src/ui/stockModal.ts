import { scanStock, type Period } from '@screener/core';
import type { AppContext } from '../context.js';
import { $, num, fmtBig, money, fmtPrice, isVnSymbol, scoreColor, signalBadge, stageBadge } from './dom.js';
import { drawCandles, EMA_CONFIG, type CandleChart } from './charts.js';
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
    const pattern = ohlcv.bars.length >= 60 ? scanStock(symbol, ohlcv.bars) : null;
    const f = fund as Awaited<ReturnType<AppContext['data']['getFundamentals']>>;

    $('#modal-title')!.innerHTML = `${symbol} <span class="muted" style="font-weight:400;font-size:13px">${f.name ?? ''}</span>`;

    body.innerHTML = renderDetail(symbol, f, pattern);
    attachTooltips(body);

    const chartEl = $('#detail-chart')!;
    chart = drawCandles(chartEl, ohlcv.bars, pattern, emaState);

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
        const p2 = data.bars.length >= 60 ? scanStock(symbol, data.bars) : null;
        chart?.destroy();
        chart = drawCandles(chartEl, data.bars, p2, emaState);
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
  p: ReturnType<typeof scanStock> | null,
): string {
  const price = f.currentPrice ?? (p ? p.stage.price : null);
  let patternBlock = '';
  if (p) {
    patternBlock = `
      <div class="row" style="margin-bottom:10px">
        ${signalBadge(p.signal)} ${stageBadge(p.stage.stage, p.stage.label)}
        <div style="margin-left:auto" class="row">
          <span class="scorebar" style="width:90px"><span style="width:${Math.max(0, p.score)}%;background:${scoreColor(p.score)}"></span></span>
          <strong style="color:${scoreColor(p.score)};font-size:18px">${num(p.score, 0)}</strong>
        </div>
      </div>
      <div class="grid" style="grid-template-columns:repeat(4,1fr)">
        ${stat('Entry', fmtPrice(p.entryPrice, symbol), 'entry')}
        ${stat('Stop', fmtPrice(p.stopLoss, symbol), 'stop')}
        ${stat('Target', fmtPrice(p.targetPrice, symbol), 'target')}
        ${stat('R:R', p.riskReward != null ? num(p.riskReward, 1) + 'R' : '—', 'rr')}
        ${stat('Pivot', fmtPrice(p.pivot.pivotHigh, symbol), 'pivot')}
        ${stat('Range', num(p.consolidation.priceRangePct, 1) + '%', 'price_range')}
        ${stat('Vol dry-up', num(p.consolidation.volumeDryUpPct, 1) + '%', 'volume_dryup')}
        ${stat('VCP', String(p.consolidation.vcpContractions), 'vcp')}
      </div>
      <div class="card analysis-card" style="margin-top:12px">
        <div class="section-title" style="margin-top:0">${t('detail.analysis')}</div>
        ${analysisHtml(p)}
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

/** Professional bullet-point analysis with highlighted key figures. Bilingual. */
function analysisHtml(p: ReturnType<typeof scanStock>): string {
  const vi = getLang() === 'vi';
  const hl = (s: string) => `<span class="hl">${s}</span>`;
  // Price unit follows the ticker (VND for .VN, USD otherwise).
  const px = (v: number | null | undefined) => fmtPrice(v, p.symbol);
  const sig = p.signal === 'BREAKOUT_IMMINENT'
    ? (vi ? 'Bứt phá sắp xảy ra' : 'Breakout imminent')
    : p.signal === 'CONSOLIDATING'
      ? (vi ? 'Đang tích lũy' : 'Consolidating')
      : (vi ? 'Chưa có tín hiệu' : 'No actionable signal');
  const stageTxt: Record<number, string> = vi
    ? { 0: 'chưa xác định', 1: 'Giai đoạn 1 — tạo nền', 2: 'Giai đoạn 2 — tăng giá (vùng mua)', 3: 'Giai đoạn 3 — tạo đỉnh', 4: 'Giai đoạn 4 — giảm giá' }
    : { 0: 'undetermined', 1: 'Stage 1 — basing', 2: 'Stage 2 — advancing (buy zone)', 3: 'Stage 3 — topping', 4: 'Stage 4 — declining' };

  const items: string[] = [];
  items.push(
    vi
      ? `<b>${sig}</b> · điểm tin cậy ${hl(num(p.score, 0) + '/100')} · ${stageTxt[p.stage.stage]}`
      : `<b>${sig}</b> · conviction ${hl(num(p.score, 0) + '/100')} · ${stageTxt[p.stage.stage]}`,
  );
  const c = p.consolidation;
  items.push(
    vi
      ? `Nền giá ~${hl(String(c.daysInBase) + ' phiên')}, biên độ ${hl(num(c.priceRangePct, 1) + '%')}` +
        (c.atrContractionPct > 0 ? `, biến động co lại ${hl(num(c.atrContractionPct, 1) + '%')}` : '') +
        (c.volumeDryUpPct > 0 ? `, thanh khoản cạn ${hl(num(c.volumeDryUpPct, 1) + '%')}` : '')
      : `Base ~${hl(String(c.daysInBase) + ' days')}, range ${hl(num(c.priceRangePct, 1) + '%')}` +
        (c.atrContractionPct > 0 ? `, volatility contracted ${hl(num(c.atrContractionPct, 1) + '%')}` : '') +
        (c.volumeDryUpPct > 0 ? `, volume dry-up ${hl(num(c.volumeDryUpPct, 1) + '%')}` : ''),
  );
  if (c.vcpContractions > 0) {
    items.push(
      vi
        ? `${hl(String(c.vcpContractions) + ' lần co thắt VCP')} — các nhịp điều chỉnh thu hẹp dần`
        : `${hl(String(c.vcpContractions) + ' VCP contraction' + (c.vcpContractions !== 1 ? 's' : ''))} — successively tighter pullbacks`,
    );
  }
  if (p.pivot.pivotHigh) {
    items.push(
      vi
        ? `Cách pivot ${hl(px(p.pivot.pivotHigh))} khoảng ${hl(num(p.pivot.distanceToPivotPct, 1) + '%')}`
        : `${hl(num(p.pivot.distanceToPivotPct, 1) + '%')} below the pivot at ${hl(px(p.pivot.pivotHigh))}`,
    );
  }
  if (p.entryPrice && p.stopLoss && p.targetPrice) {
    const rr = p.riskReward ? num(p.riskReward, 1) + 'R' : '—';
    items.push(
      vi
        ? `Kế hoạch: mua ${hl(px(p.entryPrice))}, cắt lỗ ${hl(px(p.stopLoss))}, mục tiêu ${hl(px(p.targetPrice))} (${hl(rr)})`
        : `Plan: buy ${hl(px(p.entryPrice))}, stop ${hl(px(p.stopLoss))}, target ${hl(px(p.targetPrice))} (${hl(rr)})`,
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
