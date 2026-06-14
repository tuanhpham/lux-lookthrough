import {
  screen,
  recommend,
  fetchMany,
  computeSectorVolumeRank,
  SECTOR_STOCKS,
  ALL_SECTORS,
  type StrategyKey,
  type Period,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el, num, pct, fmtBig, scoreColor, signalBadge, stageBadge } from '../ui/dom.js';
import { resultsTable } from '../ui/resultsTable.js';
import { openStock } from '../ui/stockModal.js';
import { drawLine } from '../ui/charts.js';
import { t } from '../ui/i18n.js';

const PERIOD: Period = '1y';
const CURATED = [...new Set(Object.values(SECTOR_STOCKS).flat())]; // 546 symbols

// ── Top Picks ─────────────────────────────────────────────────────────────────
let picksStrategy: StrategyKey = 'breakout';
let picksBroad = false;

export function renderPicks(ctx: AppContext): void {
  const root = $('#tab-picks')!;
  root.innerHTML = `
    <h1>${t('picks.title')}</h1>
    <p class="subtitle">${t('picks.sub')}</p>
    <div class="toolbar">
      ${(['breakout', 'momentum', 'vcp'] as StrategyKey[])
        .map(
          (s) =>
            `<button class="range-btn ${s === picksStrategy ? 'active' : ''}" data-strategy="${s}">${t(
              'picks.' + s,
            )}</button>`,
        )
        .join('')}
      <label class="row" style="gap:6px;margin-left:auto;cursor:pointer"><input id="picks-broad" type="checkbox" ${
        picksBroad ? 'checked' : ''
      } /> ${t('picks.broad')} <span class="muted">${t('common.slower')}</span></label>
      <button id="picks-refresh" class="btn-outline">${t('picks.run')}</button>
    </div>
    <div id="picks-status" class="muted" style="margin-bottom:12px"></div>
    <div id="picks-results"></div>`;

  root.querySelectorAll<HTMLElement>('[data-strategy]').forEach((b) =>
    b.addEventListener('click', () => {
      picksStrategy = b.dataset.strategy as StrategyKey;
      root.querySelectorAll('[data-strategy]').forEach((x) => x.classList.toggle('active', x === b));
      void runPicks(ctx);
    }),
  );
  ($('#picks-broad') as HTMLInputElement).addEventListener('change', (e) => {
    picksBroad = (e.target as HTMLInputElement).checked;
    void runPicks(ctx);
  });
  $('#picks-refresh')!.addEventListener('click', () => void runPicks(ctx));

  // Auto-run on render (the app enters straight into this tab).
  void runPicks(ctx);
}

async function runPicks(ctx: AppContext): Promise<void> {
  const status = $('#picks-status')!;
  const out = $('#picks-results')!;
  // The broad universe would expand via constituent lists; here we scan the full
  // curated universe (546 names) — the same set the Python falls back to.
  const symbols = CURATED;
  status.innerHTML = `<span class="spinner"></span> ${t('msg.scanning')} ${symbols.length}…`;
  out.innerHTML = '';
  const data = await fetchMany(ctx.data, symbols, PERIOD, 8);
  const series = [...data.values()];
  const res = recommend(series, picksStrategy, 30);
  status.textContent = `${res.matched} ${res.strategyLabel} setup(s) from ${res.scanned} scanned.`;
  if (!res.results.length) {
    out.innerHTML = `<div class="card muted" style="text-align:center;padding:30px">No setups matched.</div>`;
    return;
  }
  const grid = el(`<div class="grid grid-cards"></div>`);
  for (const r of res.results) {
    const card = el(`
      <div class="card" style="cursor:pointer">
        <div class="row"><strong style="font-size:16px">${r.symbol}</strong> ${signalBadge(r.signal)}
          <span style="margin-left:auto;color:${scoreColor(r.score)};font-weight:800">${num(r.score, 0)}</span></div>
        <div class="row" style="margin-top:6px">${stageBadge(r.stage, r.stageLabel)}<span class="muted" style="margin-left:auto">$${num(
          r.price,
        )}</span></div>
        <div class="muted" style="font-size:11px;margin-top:8px">Entry ${
          r.entryPrice != null ? '$' + num(r.entryPrice) : '—'
        } · Stop ${r.stopLoss != null ? '$' + num(r.stopLoss) : '—'} · ${
          r.riskReward != null ? num(r.riskReward, 1) + 'R' : '—'
        }</div>
      </div>`);
    card.addEventListener('click', () => void openStock(ctx, r.symbol));
    grid.appendChild(card);
  }
  out.appendChild(grid);
}

// ── Screener ────────────────────────────────────────────────────────────────────
const selectedSectors = new Set<string>();

export function renderScreener(ctx: AppContext): void {
  const root = $('#tab-screener')!;
  root.innerHTML = `
    <h1>${t('screener.title')}</h1>
    <p class="subtitle">${t('screener.sub')}</p>
    <div class="card" style="margin-bottom:16px">
      <label class="field-label">${t('screener.symbols')}</label>
      <input id="sym-input" class="field" placeholder="AAPL, MSFT, NVDA" />
      <div style="margin-top:12px">
        <label class="field-label">${t('screener.orsectors')}</label>
        <div id="sector-chips" class="row"></div>
      </div>
      <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-top:12px">
        <div><label class="field-label">${t('screener.minscore')}</label><input id="min-score" class="field" type="number" value="40" /></div>
        <div><label class="field-label">${t('screener.signal')}</label><select id="signal-filter" class="field">
          <option value="">${t('opt.any')}</option><option value="BREAKOUT_IMMINENT">Breakout</option><option value="CONSOLIDATING">Consolidating</option></select></div>
        <div><label class="field-label">${t('screener.stage')}</label><select id="stage-filter" class="field">
          <option value="">${t('opt.any')}</option><option value="2">Stage 2</option><option value="1">Stage 1</option></select></div>
        <div><label class="field-label">${t('screener.sortby')}</label><select id="sort-by" class="field">
          <option value="score">Score</option><option value="distance">Distance</option><option value="range">Range</option><option value="volume_dryup">Vol dry-up</option></select></div>
      </div>
      <div class="row" style="margin-top:14px"><button id="run-screen" class="btn">${t('screener.run')}</button><span id="screen-status" class="muted"></span></div>
    </div>
    <div id="screen-results"></div>`;

  const chips = $('#sector-chips')!;
  chips.innerHTML = ALL_SECTORS.map(
    (s) => `<button class="range-btn ${selectedSectors.has(s) ? 'active' : ''}" data-sector="${s}">${s}</button>`,
  ).join('');
  chips.querySelectorAll<HTMLElement>('[data-sector]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = b.dataset.sector!;
      if (selectedSectors.has(s)) selectedSectors.delete(s);
      else selectedSectors.add(s);
      b.classList.toggle('active', selectedSectors.has(s));
    }),
  );
  $('#run-screen')!.addEventListener('click', () => void runScreen(ctx));
}

/** Programmatic entry used by the Sectors tab "Screen stocks" button. */
export function screenSector(ctx: AppContext, sector: string): void {
  renderScreener(ctx);
  selectedSectors.clear();
  selectedSectors.add(sector);
  $('#tab-screener')!
    .querySelectorAll<HTMLElement>('[data-sector]')
    .forEach((b) => b.classList.toggle('active', b.dataset.sector === sector));
  void runScreen(ctx);
}

async function runScreen(ctx: AppContext): Promise<void> {
  const status = $('#screen-status')!;
  const out = $('#screen-results')!;
  const symInput = ($('#sym-input') as HTMLInputElement).value
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const sectors = [...selectedSectors];
  const universe = [...new Set([...symInput, ...sectors.flatMap((s) => SECTOR_STOCKS[s] ?? [])])];
  if (!universe.length) {
    status.textContent = 'Enter symbols or pick a sector.';
    return;
  }
  status.innerHTML = `<span class="spinner"></span> ${t('msg.scanning')} ${universe.length}…`;
  out.innerHTML = '';
  const data = await fetchMany(ctx.data, universe, PERIOD, 8);
  const signal = ($('#signal-filter') as HTMLSelectElement).value;
  const stage = ($('#stage-filter') as HTMLSelectElement).value;
  const res = screen([...data.values()], {
    minScore: Number(($('#min-score') as HTMLInputElement).value) || 0,
    signals: signal ? [signal as 'BREAKOUT_IMMINENT' | 'CONSOLIDATING'] : undefined,
    stages: stage ? [Number(stage)] : undefined,
    sortBy: ($('#sort-by') as HTMLSelectElement).value as 'score',
    limit: 200,
  });
  status.textContent = `${res.matched} match(es) of ${res.scanned} scanned.`;
  out.appendChild(resultsTable(res.results, (sym) => void openStock(ctx, sym)));
}

// ── Sectors (rank + expandable volume charts) ──────────────────────────────────
export function renderSectors(ctx: AppContext): void {
  const root = $('#tab-sectors')!;
  root.innerHTML = `
    <h1>${t('sectors.title')}</h1>
    <p class="subtitle">${t('sectors.sub')}</p>
    <div class="row" style="margin-bottom:12px"><button id="load-sectors" class="btn-outline">${t('sectors.scan')}</button><span id="sector-status" class="muted"></span></div>
    <div id="sector-results"></div>`;
  $('#load-sectors')!.addEventListener('click', () => void runSectors(ctx));
  void runSectors(ctx);
}

async function runSectors(ctx: AppContext): Promise<void> {
  const status = $('#sector-status')!;
  const out = $('#sector-results')!;
  status.innerHTML = `<span class="spinner"></span> ${t('msg.scanning')} 11 sectors…`;
  out.innerHTML = '';
  const data = await fetchMany(ctx.data, CURATED, '6mo', 10);
  const ranked = computeSectorVolumeRank(data);
  status.textContent = `${ranked.length} sectors ranked.`;
  out.innerHTML = '';
  for (const r of ranked) {
    const color = r.volumeChangePct >= 0 ? 'var(--accent)' : 'var(--danger)';
    const row = el(`
      <div class="sector-row">
        <div class="sector-head" data-sector="${r.sector}">
          <span class="sector-rank">#${r.rank}</span>
          <div style="flex:1"><strong>${r.sector}</strong>
            <div class="muted" style="font-size:11px">3m ${fmtBig(r.avgVolume3m)} · 6m ${fmtBig(r.avgVolume6m)} avg vol</div></div>
          <span class="badge" style="background:color-mix(in srgb,${color} 16%,transparent);color:${color}">${pct(
            r.volumeChangePct,
          )}</span>
          <span class="muted caret">▾</span>
        </div>
        <div class="sector-detail hidden" data-detail="${r.sector}">
          <div class="row" style="margin-bottom:8px">
            <div class="row" data-freq-group>
              <button class="range-btn active" data-freq="weekly">Weekly</button>
              <button class="range-btn" data-freq="monthly">Monthly</button>
            </div>
            <button class="btn-outline" style="margin-left:auto" data-screen="${r.sector}">${t('sectors.screenstocks')}</button>
          </div>
          <div class="chart sector-chart" style="height:180px"></div>
        </div>
      </div>`);
    out.appendChild(row);

    const head = row.querySelector<HTMLElement>('.sector-head')!;
    const detail = row.querySelector<HTMLElement>('.sector-detail')!;
    const caret = row.querySelector<HTMLElement>('.caret')!;
    let drawn = false;
    let freq: 'weekly' | 'monthly' = 'weekly';

    const drawChart = async () => {
      const chartEl = row.querySelector<HTMLElement>('.sector-chart')!;
      chartEl.innerHTML = `<div class="muted" style="text-align:center;padding:40px"><span class="spinner"></span></div>`;
      const series = await ctx.data.getSectorVolume(r.sector, '1y', freq).catch(() => ({ points: [] }));
      if (!series.points.length) {
        chartEl.innerHTML = `<div class="muted" style="text-align:center;padding:40px">No volume data.</div>`;
        return;
      }
      drawLine(chartEl, series.points.map((p) => ({ time: p.date, value: p.volume })));
    };

    head.addEventListener('click', () => {
      const open = !detail.classList.contains('hidden');
      detail.classList.toggle('hidden', open);
      caret.textContent = open ? '▾' : '▴';
      if (!open && !drawn) {
        drawn = true;
        void drawChart();
      }
    });
    detail.querySelectorAll<HTMLElement>('[data-freq]').forEach((b) =>
      b.addEventListener('click', () => {
        freq = b.dataset.freq as 'weekly' | 'monthly';
        detail.querySelectorAll('[data-freq]').forEach((x) => x.classList.toggle('active', x === b));
        void drawChart();
      }),
    );
    detail.querySelector<HTMLElement>('[data-screen]')!.addEventListener('click', () => {
      // Switch to the Screener tab, then pre-fill + run for this sector.
      document.querySelector<HTMLElement>('[data-tab="screener"]')?.click();
      screenSector(ctx, r.sector);
    });
  }
}
