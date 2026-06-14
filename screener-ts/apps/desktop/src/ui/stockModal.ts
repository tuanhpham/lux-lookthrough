import { scanStock, buildSummary, type Period } from '@screener/core';
import type { AppContext } from '../context.js';
import { $, num, fmtBig, money, scoreColor, signalBadge, stageBadge } from './dom.js';
import { drawCandles, EMA_CONFIG, type CandleChart } from './charts.js';
import { t, getLang } from './i18n.js';
import { loadIndex, loadItems, saveItems, createList, listsContaining } from './watchlists.js';
import { infoIcon as info, attachTooltips } from './tooltip.js';

const RANGES: { label: string; period: Period }[] = [
  { label: '6M', period: '6mo' },
  { label: '1Y', period: '1y' },
  { label: '2Y', period: '2y' },
  { label: '5Y', period: '5y' },
];

let chart: CandleChart | null = null;
const emaState: Record<number, boolean> = Object.fromEntries(EMA_CONFIG.map((e) => [e.period, e.on]));

export function initModal(): void {
  $('#modal-close')!.addEventListener('click', closeModal);
  $('#modal-backdrop')!.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function closeModal(): void {
  $('#modal')!.classList.add('hidden');
  if (chart) {
    chart.destroy();
    chart = null;
  }
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
    renderFundChart(fin, fundMetric, fundFreq);
    body.querySelectorAll<HTMLElement>('[data-fund]').forEach((btn) =>
      btn.addEventListener('click', () => {
        fundMetric = btn.dataset.fund as 'revenue' | 'netIncome' | 'eps';
        body.querySelectorAll('[data-fund]').forEach((b) => b.classList.toggle('active', b === btn));
        renderFundChart(fin, fundMetric, fundFreq);
      }),
    );
    body.querySelectorAll<HTMLElement>('[data-freq]').forEach((btn) =>
      btn.addEventListener('click', () => {
        fundFreq = btn.dataset.freq as 'annual' | 'quarterly';
        body.querySelectorAll('[data-freq]').forEach((b) => b.classList.toggle('active', b === btn));
        renderFundChart(fin, fundMetric, fundFreq);
      }),
    );

    void wireWatchlistPicker(ctx, symbol);
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
        ${stat('Entry', p.entryPrice != null ? '$' + num(p.entryPrice) : '—', 'entry')}
        ${stat('Stop', p.stopLoss != null ? '$' + num(p.stopLoss) : '—', 'stop')}
        ${stat('Target', p.targetPrice != null ? '$' + num(p.targetPrice) : '—', 'target')}
        ${stat('R:R', p.riskReward != null ? num(p.riskReward, 1) + 'R' : '—', 'rr')}
        ${stat('Pivot', p.pivot.pivotHigh != null ? '$' + num(p.pivot.pivotHigh) : '—', 'pivot')}
        ${stat('Range', num(p.consolidation.priceRangePct, 1) + '%', 'price_range')}
        ${stat('Vol dry-up', num(p.consolidation.volumeDryUpPct, 1) + '%', 'volume_dryup')}
        ${stat('VCP', String(p.consolidation.vcpContractions), 'vcp')}
      </div>
      <div class="card" style="margin-top:12px;background:var(--surface)">
        <div class="section-title" style="margin-top:0">${t('detail.analysis')}</div>
        <p style="line-height:1.6;margin:0">${buildSummary(p)[getLang()]}</p>
      </div>`;
  }
  const tvUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`;
  return `
    <div class="row" style="margin-bottom:12px">
      <div>
        <div style="font-size:22px;font-weight:700">${price != null ? '$' + num(price) : '—'}</div>
        <div class="muted" style="font-size:12px">${f.sector ?? ''}${f.industry ? ' · ' + f.industry : ''}</div>
      </div>
      <div class="row" style="margin-left:auto;gap:8px">
        <button id="wl-toggle" class="btn-outline" style="padding:7px 12px">☆ Watchlist</button>
        <a class="btn-outline" style="padding:7px 12px;text-decoration:none" href="${tvUrl}" target="_blank" rel="noopener" title="Open in TradingView">📈 TradingView ↗</a>
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
    <div class="grid" style="grid-template-columns:repeat(3,1fr)">
      ${stat('Market Cap', fmtBig(f.marketCap), 'market_cap')}
      ${stat('P/E', num(f.peRatio, 1), 'pe_ratio')}
      ${stat('EPS', f.eps != null ? '$' + num(f.eps) : '—', 'eps')}
      ${stat('ROE', f.roe != null ? num(f.roe * 100, 1) + '%' : '—', 'roe')}
      ${stat('Profit Margin', f.profitMargin != null ? num(f.profitMargin * 100, 1) + '%' : '—', 'profit_margin')}
      ${stat('Rev Growth', f.revenueGrowth != null ? num(f.revenueGrowth * 100, 1) + '%' : '—', 'revenue_growth')}
      ${stat('Beta', num(f.beta, 2), 'beta')}
      ${stat('Div Yield', f.dividendYield != null ? num(f.dividendYield * 100, 2) + '%' : '—', 'dividend_yield')}
      ${stat('52w Range', f.week52Low != null && f.week52High != null ? '$' + num(f.week52Low, 0) + '–' + num(f.week52High, 0) : '—', 'week52')}
    </div>
    <div class="section-title">${t('detail.about')}</div>
    ${
      f.summary
        ? `<p class="muted" style="line-height:1.6">${f.summary}</p>`
        : `<p class="muted" style="line-height:1.6">${
            f.name ? f.name + (f.currency ? ` · ${f.currency}` : '') : symbol
          }. Yahoo no longer serves the company description without authentication; open TradingView above for the full profile.</p>`
    }
    <div class="muted" style="font-size:11px;margin-top:14px">${t('foot.disclaimer')}${money(0).slice(0, 0)}</div>
  `;
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
  const W = Math.max(el.clientWidth || 600, series.length * 52);
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
