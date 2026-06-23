import {
  runBacktest,
  computeStats,
  vcpStrategy,
  DEFAULT_BACKTEST_CONFIG,
  toCsv,
  toHtmlTable,
  type BacktestResult,
  type BacktestStats,
  type Trade,
  type ReportColumn,
  type Period,
  type OHLCV,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el, num } from '../ui/dom.js';
import { drawLine } from '../ui/charts.js';
import { downloadCsv, downloadHtml } from '../ui/exportFile.js';
import { openStock } from '../ui/stockModal.js';
import { t } from '../ui/i18n.js';

export function renderBacktest(ctx: AppContext): void {
  const root = $('#tab-backtest')!;
  root.innerHTML = `
    <h1>${t('backtest.title')}</h1>
    <p class="subtitle">${t('backtest.sub')}</p>
    <div class="notice" style="margin-bottom:14px">${t('backtest.note')}</div>
    <div class="card" style="margin-bottom:16px">
      <div class="grid" style="grid-template-columns:repeat(4,1fr)">
        <div><label class="field-label">${t('backtest.symbols')}</label>
          <input id="bt-symbols" class="field" placeholder="AAPL, NVDA, MSFT" /></div>
        <div><label class="field-label">${t('backtest.period')}</label>
          <select id="bt-period" class="field">
            <option value="2y">2Y</option><option value="5y" selected>5Y</option><option value="max">Max</option>
          </select></div>
        <div><label class="field-label">${t('backtest.risk')}</label>
          <input id="bt-risk" class="field" type="number" value="1" step="0.25" /></div>
        <div><label class="field-label">${t('backtest.capital')}</label>
          <input id="bt-capital" class="field" type="number" value="100000" step="10000" /></div>
      </div>
      <div class="row" style="margin-top:14px">
        <button id="bt-run" class="btn">${t('backtest.run')}</button>
        <span id="bt-status" class="muted"></span>
      </div>
    </div>
    <div id="bt-results"></div>`;

  $('#bt-run')!.addEventListener('click', () => void runBt(ctx));
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
  const period = ($('#bt-period') as HTMLSelectElement).value as Period;
  const riskPctPerTrade = Number(($('#bt-risk') as HTMLInputElement).value) || 1;
  const initialCapital = Number(($('#bt-capital') as HTMLInputElement).value) || 100_000;

  status.innerHTML = `<span class="spinner"></span> ${t('msg.loading')} ${symbols.length}…`;
  out.innerHTML = '';

  // Fetch each symbol's history (focused backtest — small symbol lists).
  const series: OHLCV[] = [];
  for (const sym of symbols) {
    try {
      const ohlcv = await ctx.data.getOHLCV(sym, period);
      if (ohlcv.bars.length >= 200) series.push(ohlcv);
    } catch {
      /* skip unfetchable symbols */
    }
  }
  if (!series.length) {
    status.textContent = t('backtest.nodata');
    return;
  }

  const cfg = { ...DEFAULT_BACKTEST_CONFIG, riskPctPerTrade, initialCapital };
  status.innerHTML = `<span class="spinner"></span> ${t('backtest.running')}`;
  // Yield so the spinner paints before the (synchronous) backtest runs.
  await new Promise((r) => setTimeout(r, 0));

  const res = runBacktest(series, vcpStrategy(), cfg);
  const stats = computeStats(res.trades, res.equityCurve, cfg);

  status.textContent = `${res.trades.length} ${t('backtest.trades')} · ${series.length}/${symbols.length} ${t('picks.scanned')}.`;
  renderResults(ctx, res, stats);
}

function statCard(label: string, value: string, good?: boolean): string {
  const color = good === undefined ? 'var(--text)' : good ? 'var(--accent)' : 'var(--danger)';
  return `<div class="stat"><div class="k">${label}</div><div class="v" style="color:${color}">${value}</div></div>`;
}

function renderResults(ctx: AppContext, res: BacktestResult, s: BacktestStats): void {
  const out = $('#bt-results')!;
  out.innerHTML = `
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

  // Equity curve.
  drawLine(
    $('#bt-equity')!,
    res.equityCurve.map((p) => ({ time: p.date, value: p.equity })),
    { money: true, currency: '$', height: 260 },
  );

  // Trade log table.
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
