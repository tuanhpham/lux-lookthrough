import {
  runBacktest,
  computeStats,
  vcpStrategy,
  momentumStrategy,
  DEFAULT_BACKTEST_CONFIG,
  toCsv,
  toHtmlTable,
  type BacktestResult,
  type BacktestStats,
  type Trade,
  type ReportColumn,
  type Period,
  type OHLCV,
  type Bar,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el, num } from '../ui/dom.js';
import { drawLine } from '../ui/charts.js';
import { downloadCsv, downloadHtml } from '../ui/exportFile.js';
import { openStock } from '../ui/stockModal.js';
import { t } from '../ui/i18n.js';

type BtStrategy = 'vcp' | 'momentum';
let btStrategy: BtStrategy = 'vcp';

/** Preset periods shown as pill buttons. 'custom' triggers the date pickers. */
type PeriodMode = '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max' | 'custom';
let periodMode: PeriodMode = '5y';

/** Today's date string (YYYY-MM-DD) for capping the date picker max. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** A date N years before today. */
function yearsAgo(n: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
}

const PERIOD_PRESETS: { mode: PeriodMode; label: string }[] = [
  { mode: '3mo', label: '3M' },
  { mode: '6mo', label: '6M' },
  { mode: '1y', label: '1Y' },
  { mode: '2y', label: '2Y' },
  { mode: '5y', label: '5Y' },
  { mode: 'max', label: 'Max' },
  { mode: 'custom', label: '📅 Custom' },
];

export function renderBacktest(ctx: AppContext): void {
  const root = $('#tab-backtest')!;
  root.innerHTML = `
    <h1>${t('backtest.title')}</h1>
    <p class="subtitle">${t('backtest.sub')}</p>
    <div class="notice" style="margin-bottom:14px">${t('backtest.note')}</div>
    <div class="card" style="margin-bottom:16px">
      <div style="margin-bottom:12px">
        <label class="field-label">${t('backtest.strategy')}</label>
        <div class="toolbar" style="margin:0;gap:6px">
          <button class="range-btn ${btStrategy === 'vcp' ? 'active' : ''}" data-btstrat="vcp">${t('backtest.strat.vcp')}</button>
          <button class="range-btn ${btStrategy === 'momentum' ? 'active' : ''}" data-btstrat="momentum">${t('backtest.strat.momentum')}</button>
        </div>
        <p id="bt-strat-desc" class="muted" style="font-size:12px;margin:6px 0 0;line-height:1.5">${stratDesc(btStrategy)}</p>
      </div>
      <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:12px">
        <div><label class="field-label">${t('backtest.symbols')}</label>
          <input id="bt-symbols" class="field" placeholder="AAPL, NVDA, MSFT" /></div>
        <div><label class="field-label">${t('backtest.risk')}</label>
          <input id="bt-risk" class="field" type="number" value="1" step="0.25" /></div>
        <div><label class="field-label">${t('backtest.capital')}</label>
          <input id="bt-capital" class="field" type="number" value="100000" step="10000" /></div>
      </div>
      <div style="margin-bottom:12px">
        <label class="field-label">${t('backtest.period')}</label>
        <div class="toolbar" style="margin:0;gap:5px" id="bt-period-row">
          ${PERIOD_PRESETS.map(
            (p) =>
              `<button class="range-btn ${p.mode === periodMode ? 'active' : ''}" data-btperiod="${p.mode}">${p.label}</button>`,
          ).join('')}
        </div>
        <div id="bt-custom-dates" class="${periodMode === 'custom' ? '' : 'hidden'}" style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div>
            <label class="field-label">${t('backtest.from')}</label>
            <input id="bt-from" class="field" type="date" style="width:160px"
              value="${yearsAgo(3)}" max="${today()}" />
          </div>
          <div>
            <label class="field-label">${t('backtest.to')}</label>
            <input id="bt-to" class="field" type="date" style="width:160px"
              value="${today()}" max="${today()}" />
          </div>
        </div>
      </div>
      <div class="row" style="margin-top:14px">
        <button id="bt-run" class="btn">${t('backtest.run')}</button>
        <span id="bt-status" class="muted"></span>
      </div>
    </div>
    <div id="bt-results"></div>`;

  // Strategy toggle.
  root.querySelectorAll<HTMLElement>('[data-btstrat]').forEach((b) =>
    b.addEventListener('click', () => {
      btStrategy = b.dataset.btstrat as BtStrategy;
      root.querySelectorAll('[data-btstrat]').forEach((x) => x.classList.toggle('active', x === b));
      $('#bt-strat-desc')!.textContent = stratDesc(btStrategy);
    }),
  );

  // Period preset pills.
  root.querySelectorAll<HTMLElement>('[data-btperiod]').forEach((b) =>
    b.addEventListener('click', () => {
      periodMode = b.dataset.btperiod as PeriodMode;
      root.querySelectorAll('[data-btperiod]').forEach((x) => x.classList.toggle('active', x === b));
      $('#bt-custom-dates')!.classList.toggle('hidden', periodMode !== 'custom');
    }),
  );

  $('#bt-run')!.addEventListener('click', () => void runBt(ctx));
}

function stratDesc(s: BtStrategy): string {
  return s === 'vcp' ? t('backtest.strat.vcp.desc') : t('backtest.strat.momentum.desc');
}

/** Slice bars to [fromDate, toDate] inclusive. Both are YYYY-MM-DD strings. */
function sliceBars(bars: readonly Bar[], fromDate: string, toDate: string): Bar[] {
  return bars.filter((b) => b.date >= fromDate && b.date <= toDate);
}

async function runBt(ctx: AppContext): Promise<void> {
  const status = $('#bt-status')!;
  const out = $('#bt-results')!;
  const symbols = ($('#bt-symbols') as HTMLInputElement).value
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (!symbols.length) {
    status.textContent = t('backtest.needsymbols');
    return;
  }

  const riskPctPerTrade = Number(($('#bt-risk') as HTMLInputElement).value) || 1;
  const initialCapital = Number(($('#bt-capital') as HTMLInputElement).value) || 100_000;

  // Resolve which API period to fetch and the optional date-clipping window.
  let fetchPeriod: Period;
  let clipFrom: string | null = null;
  let clipTo: string | null = null;

  if (periodMode === 'custom') {
    clipFrom = ($('#bt-from') as HTMLInputElement).value;
    clipTo = ($('#bt-to') as HTMLInputElement).value;
    if (!clipFrom || !clipTo || clipFrom >= clipTo) {
      status.textContent = t('backtest.baddates');
      return;
    }
    // Always fetch max so we have the full adj-close history for clipping.
    fetchPeriod = 'max';
  } else {
    fetchPeriod = periodMode as Period;
  }

  status.innerHTML = `<span class="spinner"></span> ${t('msg.loading')} ${symbols.length}…`;
  out.innerHTML = '';

  const series: OHLCV[] = [];
  const skipped: string[] = [];
  const minBars = btStrategy === 'momentum' ? 60 : 100;

  for (const sym of symbols) {
    try {
      const ohlcv = await ctx.data.getOHLCV(sym, fetchPeriod);
      const bars = clipFrom && clipTo ? sliceBars(ohlcv.bars, clipFrom, clipTo) : ohlcv.bars;
      if (bars.length >= minBars) {
        series.push({ symbol: sym, bars });
      } else {
        skipped.push(`${sym} (${bars.length} bars)`);
      }
    } catch {
      skipped.push(`${sym} (fetch failed)`);
    }
  }
  if (!series.length) {
    status.textContent = t('backtest.nodata');
    return;
  }

  const cfg = { ...DEFAULT_BACKTEST_CONFIG, riskPctPerTrade, initialCapital };
  const strategy = btStrategy === 'momentum' ? momentumStrategy() : vcpStrategy();

  status.innerHTML = `<span class="spinner"></span> ${t('backtest.running')}`;
  await new Promise((r) => setTimeout(r, 0));

  const res = runBacktest(series, strategy, cfg);
  const stats = computeStats(res.trades, res.equityCurve, cfg);

  const periodLabel = clipFrom && clipTo ? `${clipFrom} → ${clipTo}` : periodMode.toUpperCase();
  const skipNote = skipped.length ? ` · ${skipped.length} skipped (${skipped.join(', ')})` : '';
  status.textContent = `${res.trades.length} ${t('backtest.trades')} · ${series.length}/${symbols.length} ${t('picks.scanned')} · ${periodLabel}${skipNote}.`;
  renderResults(ctx, res, stats, skipped);
}

function statCard(label: string, value: string, good?: boolean): string {
  const color = good === undefined ? 'var(--text)' : good ? 'var(--accent)' : 'var(--danger)';
  return `<div class="stat"><div class="k">${label}</div><div class="v" style="color:${color}">${value}</div></div>`;
}

function renderResults(ctx: AppContext, res: BacktestResult, s: BacktestStats, skipped: string[]): void {
  const out = $('#bt-results')!;
  const zeroBlock = res.trades.length === 0 ? renderZeroTradesHelp(res, skipped) : '';

  out.innerHTML = `
    ${zeroBlock}
    <div class="row" style="justify-content:flex-end;margin-bottom:8px;gap:6px">
      <button class="range-btn" id="bt-csv">${t('export.csv')}</button>
      <button class="range-btn" id="bt-html">${t('export.html')}</button>
    </div>
    <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px">
      ${statCard(t('backtest.totalreturn'), num(s.totalReturnPct, 1) + '%', s.totalReturnPct >= 0)}
      ${statCard('CAGR', num(s.cagrPct, 1) + '%', s.cagrPct >= 0)}
      ${statCard(t('backtest.maxdd'), '−' + num(s.maxDrawdownPct, 1) + '%', false)}
      ${statCard('Sharpe', num(s.sharpe, 2), s.sharpe >= 1)}
      ${statCard(t('backtest.winrate'), num(s.winRatePct, 0) + '%', s.winRatePct >= 50)}
      ${statCard(t('backtest.profitfactor'), s.profitFactor === Infinity ? '∞' : num(s.profitFactor, 2), s.profitFactor >= 1)}
      ${statCard(t('backtest.expectancy'), num(s.expectancyR, 2) + 'R', s.expectancyR >= 0)}
      ${statCard('MAR', num(s.mar, 2), s.mar >= 0.5)}
      ${statCard(t('backtest.trades'), String(s.trades))}
      ${statCard(t('backtest.avgwin'), num(s.avgWin, 0), true)}
      ${statCard(t('backtest.avgloss'), num(s.avgLoss, 0), false)}
      ${statCard(t('backtest.avghold'), num(s.avgHoldBars, 0) + 'd')}
    </div>
    <div class="card" style="margin-bottom:14px;padding:10px">
      <div class="section-title" style="margin:4px 6px">${t('backtest.equity')}</div>
      <div id="bt-equity" class="chart" style="height:260px"></div>
    </div>
    <div class="section-title">${t('backtest.tradelog')}</div>
    <div id="bt-trades"></div>`;

  drawLine(
    $('#bt-equity')!,
    res.equityCurve.map((p) => ({ time: p.date, value: p.equity })),
    { money: true, currency: '$', height: 260 },
  );

  const tbl = el(`<div class="card" style="overflow-x:auto"></div>`);
  if (!res.trades.length) {
    tbl.innerHTML = `<div class="muted" style="text-align:center;padding:24px">${t('backtest.notrades')}</div>`;
  } else {
    const rows = res.trades
      .map(
        (tr) => `<tr data-sym="${tr.symbol}">
        <td><strong>${tr.symbol}</strong></td>
        <td>${tr.entryDate}</td><td>${tr.exitDate}</td>
        <td>${num(tr.entryPrice, 2)}</td><td>${num(tr.exitPrice, 2)}</td>
        <td class="${tr.netPnL >= 0 ? 'accent' : 'danger'}">${num(tr.netPnL, 0)}</td>
        <td class="${tr.rMultiple >= 0 ? 'accent' : 'danger'}">${num(tr.rMultiple, 2)}R</td>
        <td>${tr.barsHeld}d</td><td class="muted">${tr.exitReason}</td>
      </tr>`,
      )
      .join('');
    tbl.innerHTML = `<table><thead><tr>
      <th>Symbol</th><th>Entry</th><th>Exit</th><th>In</th><th>Out</th><th>PnL</th><th>R</th><th>Held</th><th>Reason</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
    tbl.querySelectorAll<HTMLElement>('tr[data-sym]').forEach((tr) =>
      tr.addEventListener('click', () => void openStock(ctx, tr.dataset.sym!)),
    );
  }
  $('#bt-trades')!.appendChild(tbl);

  $('#bt-csv')!.addEventListener('click', () => downloadCsv(toCsv(res.trades, TRADE_COLS), 'backtest-trades'));
  $('#bt-html')!.addEventListener('click', () =>
    downloadHtml(
      toHtmlTable(res.trades, TRADE_COLS, {
        title: `Backtest — ${res.strategy}`,
        subtitle: `${res.startDate}→${res.endDate} · ${res.trades.length} trades · CAGR ${num(s.cagrPct, 1)}% · maxDD −${num(s.maxDrawdownPct, 1)}%`,
      }),
      'backtest-trades',
    ),
  );
}

function renderZeroTradesHelp(res: BacktestResult, skipped: string[]): string {
  const bars = res.equityCurve.length;
  const days = Math.round(bars / 252);
  const hints: string[] = [];

  if (btStrategy === 'vcp') {
    hints.push('The VCP strategy only enters when a full Volatility Contraction Pattern forms: a prior 30%+ advance, then 2+ contracting pullbacks with drying volume and ATR. This setup is rare — a single stock may form 0–2 VCPs per year.');
    hints.push('Try a longer period (5Y or Max) or add several more symbols. A universe of 5–10 strong trending stocks over 5 years gives the best results.');
    if (bars < 252) hints.push(`Only ~${bars} bars in the selected window (~${days}y). The VCP detector needs at least 150 bars just to start checking. Use 5Y or a wider custom date range.`);
    if (periodMode === 'custom') hints.push('With a custom date range, make sure the "From" date is early enough to include at least a year of history for the pattern to form.');
  } else {
    hints.push('The Momentum strategy enters when the momentum score ≥ 65 AND price is above EMA50. For some periods the stock may have been in a long downtrend (score always low).');
    hints.push('Try adding 3–5 symbols, or choose a period when the stock was trending strongly.');
    if (bars < 120) hints.push(`Only ~${bars} bars in the window. Momentum scoring needs at least 60 bars; more gives better score stability.`);
  }

  if (skipped.length) {
    hints.push(`These symbols were skipped due to insufficient data: ${skipped.join(', ')}.`);
  }

  return `<div class="notice" style="margin-bottom:14px">
    <strong>0 trades — why?</strong>
    <ul style="margin:8px 0 0;padding-left:18px;line-height:1.65">
      ${hints.map((h) => `<li>${h}</li>`).join('')}
    </ul>
  </div>`;
}

const TRADE_COLS: ReportColumn<Trade>[] = [
  { key: 'symbol', label: 'Symbol' },
  { key: 'entryDate', label: 'Entry Date' },
  { key: 'exitDate', label: 'Exit Date' },
  { key: 'entryPrice', label: 'Entry', format: (v) => (v as number).toFixed(2) },
  { key: 'exitPrice', label: 'Exit', format: (v) => (v as number).toFixed(2) },
  { key: 'netPnL', label: 'Net PnL', format: (v) => (v as number).toFixed(2) },
  { key: 'rMultiple', label: 'R', format: (v) => (v as number).toFixed(2) },
  { key: 'barsHeld', label: 'Bars Held' },
  { key: 'exitReason', label: 'Exit Reason' },
];
