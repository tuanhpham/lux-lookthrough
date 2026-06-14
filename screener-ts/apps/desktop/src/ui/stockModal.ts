import { scanStock, buildSummary, type Period } from '@screener/core';
import type { AppContext } from '../context.js';
import { $, num, fmtBig, money, scoreColor, signalBadge, stageBadge } from './dom.js';
import { drawCandles, EMA_CONFIG, type CandleChart } from './charts.js';
import { t, getLang } from './i18n.js';

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

    renderFundChart(fin);
    body.querySelectorAll<HTMLElement>('[data-fund]').forEach((btn) =>
      btn.addEventListener('click', () => {
        body.querySelectorAll('[data-fund]').forEach((b) => b.classList.toggle('active', b === btn));
        renderFundChart(fin, btn.dataset.fund as 'revenue' | 'netIncome');
      }),
    );
  } catch (e) {
    body.innerHTML = `<div class="danger" style="text-align:center;padding:40px">${(e as Error).message}</div>`;
  }
}

function stat(k: string, v: string): string {
  return `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`;
}

function renderDetail(
  symbol: string,
  f: { sector?: string | null; industry?: string | null; currentPrice?: number | null; marketCap?: number | null; peRatio?: number | null; eps?: number | null; roe?: number | null; profitMargin?: number | null; revenueGrowth?: number | null; beta?: number | null; dividendYield?: number | null; week52Low?: number | null; week52High?: number | null; summary?: string | null },
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
        ${stat('Entry', p.entryPrice != null ? '$' + num(p.entryPrice) : '—')}
        ${stat('Stop', p.stopLoss != null ? '$' + num(p.stopLoss) : '—')}
        ${stat('Target', p.targetPrice != null ? '$' + num(p.targetPrice) : '—')}
        ${stat('R:R', p.riskReward != null ? num(p.riskReward, 1) + 'R' : '—')}
        ${stat('Pivot', p.pivot.pivotHigh != null ? '$' + num(p.pivot.pivotHigh) : '—')}
        ${stat('Range', num(p.consolidation.priceRangePct, 1) + '%')}
        ${stat('Vol dry-up', num(p.consolidation.volumeDryUpPct, 1) + '%')}
        ${stat('VCP', String(p.consolidation.vcpContractions))}
      </div>
      <div class="card" style="margin-top:12px;background:var(--surface)">
        <div class="section-title" style="margin-top:0">${t('detail.analysis')}</div>
        <p style="line-height:1.6;margin:0">${buildSummary(p)[getLang()]}</p>
      </div>`;
  }
  return `
    <div class="row" style="margin-bottom:12px">
      <div>
        <div style="font-size:22px;font-weight:700">${price != null ? '$' + num(price) : '—'}</div>
        <div class="muted" style="font-size:12px">${f.sector ?? ''}${f.industry ? ' · ' + f.industry : ''}</div>
      </div>
    </div>
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
        <div class="row" style="margin-left:auto">
          <button class="range-btn active" data-fund="revenue">Revenue</button>
          <button class="range-btn" data-fund="netIncome">Net Income</button>
        </div>
      </div>
      <div id="fund-chart" class="chart" style="height:160px"></div>
    </div>
    <div class="section-title">${t('detail.fundamentals')}</div>
    <div class="grid" style="grid-template-columns:repeat(3,1fr)">
      ${stat('Market Cap', fmtBig(f.marketCap))}
      ${stat('P/E', num(f.peRatio, 1))}
      ${stat('EPS', f.eps != null ? '$' + num(f.eps) : '—')}
      ${stat('ROE', f.roe != null ? num(f.roe * 100, 1) + '%' : '—')}
      ${stat('Profit Margin', f.profitMargin != null ? num(f.profitMargin * 100, 1) + '%' : '—')}
      ${stat('Rev Growth', f.revenueGrowth != null ? num(f.revenueGrowth * 100, 1) + '%' : '—')}
      ${stat('Beta', num(f.beta, 2))}
      ${stat('Div Yield', f.dividendYield != null ? num(f.dividendYield * 100, 2) + '%' : '—')}
      ${stat('52w Range', f.week52Low != null && f.week52High != null ? '$' + num(f.week52Low, 0) + '–' + num(f.week52High, 0) : '—')}
    </div>
    ${f.summary ? `<div class="section-title">${t('detail.about')}</div><p class="muted" style="line-height:1.6">${f.summary}</p>` : ''}
    <div class="muted" style="font-size:11px;margin-top:14px">${t('foot.disclaimer')}${money(0).slice(0, 0)}</div>
  `;
}

function renderFundChart(
  fin: { annual: { period: string; revenue: number | null; netIncome: number | null }[] },
  metric: 'revenue' | 'netIncome' = 'revenue',
): void {
  const el = $('#fund-chart');
  if (!el) return;
  const series = fin.annual.filter((p) => p[metric] != null);
  if (!series.length) {
    el.innerHTML = `<div class="muted" style="text-align:center;padding:30px">No data.</div>`;
    return;
  }
  const values = series.map((p) => p[metric] as number);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const W = Math.max(el.clientWidth || 600, series.length * 60);
  const H = 160;
  const zeroY = 18 + (max / span) * (H - 40);
  const slot = W / series.length;
  const bars = series
    .map((p, i) => {
      const v = p[metric] as number;
      const h = (Math.abs(v) / span) * (H - 40);
      const y = v >= 0 ? zeroY - h : zeroY;
      const cx = i * slot + slot / 2;
      const color = v >= 0 ? '#00d49b' : '#ff5260';
      const lbl = (v < 0 ? '-$' : '$') + fmtBig(Math.abs(v));
      return `<rect x="${cx - 16}" y="${y}" width="32" height="${Math.max(h, 1)}" rx="3" fill="${color}" opacity=".85"><title>${p.period}: ${lbl}</title></rect>
        <text x="${cx}" y="${H - 6}" text-anchor="middle" font-size="9" fill="#5b6577">${p.period.slice(0, 4)}</text>`;
    })
    .join('');
  el.innerHTML = `<div style="overflow-x:auto"><svg width="${W}" height="${H}">${bars}</svg></div>`;
}
