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

const PERIOD: Period = '1y';

// ── Top Picks ─────────────────────────────────────────────────────────────────
let picksStrategy: StrategyKey = 'breakout';

export function renderPicks(ctx: AppContext): void {
  const root = $('#tab-picks')!;
  root.innerHTML = `
    <h1>Top Picks</h1>
    <p class="subtitle">Highest-conviction setups, auto-ranked across the curated universe.</p>
    <div class="toolbar">
      ${(['breakout', 'momentum', 'vcp'] as StrategyKey[])
        .map(
          (s) =>
            `<button class="range-btn ${s === picksStrategy ? 'active' : ''}" data-strategy="${s}">${
              s === 'breakout' ? 'Breakout-ready' : s === 'momentum' ? 'Stage-2 momentum' : 'Tight VCP'
            }</button>`,
        )
        .join('')}
      <button id="picks-refresh" class="btn-outline" style="margin-left:auto">↻ Run</button>
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
  $('#picks-refresh')!.addEventListener('click', () => void runPicks(ctx));
  void runPicks(ctx);
}

async function runPicks(ctx: AppContext): Promise<void> {
  const status = $('#picks-status')!;
  const out = $('#picks-results')!;
  status.innerHTML = `<span class="spinner"></span> Scanning the curated universe…`;
  out.innerHTML = '';
  // Curated universe (fast). The broad universe would be a config switch.
  const symbols = [...new Set(Object.values(SECTOR_STOCKS).flat())].slice(0, 120);
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
        <div class="row" style="margin-top:6px">${stageBadge(r.stage, r.stageLabel)}<span class="muted" style="margin-left:auto">$${num(r.price)}</span></div>
        <div class="muted" style="font-size:11px;margin-top:8px">Entry ${r.entryPrice != null ? '$' + num(r.entryPrice) : '—'} · Stop ${r.stopLoss != null ? '$' + num(r.stopLoss) : '—'} · ${r.riskReward != null ? num(r.riskReward, 1) + 'R' : '—'}</div>
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
    <h1>Custom Screener</h1>
    <p class="subtitle">Find consolidation &amp; breakout setups across any stocks or sectors.</p>
    <div class="card" style="margin-bottom:16px">
      <label class="field-label">Symbols (comma separated)</label>
      <input id="sym-input" class="field" placeholder="AAPL, MSFT, NVDA" />
      <div style="margin-top:12px">
        <label class="field-label">Or pick sectors</label>
        <div id="sector-chips" class="row"></div>
      </div>
      <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-top:12px">
        <div><label class="field-label">Min score</label><input id="min-score" class="field" type="number" value="40" /></div>
        <div><label class="field-label">Signal</label><select id="signal-filter" class="field">
          <option value="">Any</option><option value="BREAKOUT_IMMINENT">Breakout</option><option value="CONSOLIDATING">Consolidating</option></select></div>
        <div><label class="field-label">Stage</label><select id="stage-filter" class="field">
          <option value="">Any</option><option value="2">Stage 2</option><option value="1">Stage 1</option></select></div>
        <div><label class="field-label">Sort by</label><select id="sort-by" class="field">
          <option value="score">Score</option><option value="distance">Distance</option><option value="range">Range</option><option value="volume_dryup">Vol dry-up</option></select></div>
      </div>
      <div class="row" style="margin-top:14px"><button id="run-screen" class="btn">Run Screen</button><span id="screen-status" class="muted"></span></div>
    </div>
    <div id="screen-results"></div>`;

  const chips = $('#sector-chips')!;
  chips.innerHTML = ALL_SECTORS.map((s) => `<button class="range-btn" data-sector="${s}">${s}</button>`).join('');
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

async function runScreen(ctx: AppContext): Promise<void> {
  const status = $('#screen-status')!;
  const out = $('#screen-results')!;
  const symInput = ($('#sym-input') as HTMLInputElement).value
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const sectors = [...selectedSectors];
  const universe = [
    ...new Set([...symInput, ...sectors.flatMap((s) => SECTOR_STOCKS[s] ?? [])]),
  ];
  if (!universe.length) {
    status.textContent = 'Enter symbols or pick a sector.';
    return;
  }
  status.innerHTML = `<span class="spinner"></span> Scanning ${universe.length}…`;
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

// ── Sectors ──────────────────────────────────────────────────────────────────
export function renderSectors(ctx: AppContext): void {
  const root = $('#tab-sectors')!;
  root.innerHTML = `
    <h1>Industry Volume Scanner</h1>
    <p class="subtitle">Sectors ranked by 3m-vs-6m average-volume change.</p>
    <div class="row" style="margin-bottom:12px"><button id="load-sectors" class="btn-outline">↻ Scan sectors</button><span id="sector-status" class="muted"></span></div>
    <div id="sector-results"></div>`;
  $('#load-sectors')!.addEventListener('click', () => void runSectors(ctx));
}

async function runSectors(ctx: AppContext): Promise<void> {
  const status = $('#sector-status')!;
  const out = $('#sector-results')!;
  status.innerHTML = `<span class="spinner"></span> Scanning all 11 sectors…`;
  out.innerHTML = '';
  const symbols = [...new Set(Object.values(SECTOR_STOCKS).flat())];
  const data = await fetchMany(ctx.data, symbols, '6mo', 10);
  const ranked = computeSectorVolumeRank(data);
  status.textContent = `${ranked.length} sectors ranked.`;
  const card = el(`<div class="card" style="overflow-x:auto"></div>`);
  card.innerHTML = `<table><thead><tr><th>#</th><th>Sector</th><th>3m avg vol</th><th>6m avg vol</th><th>Change</th></tr></thead>
    <tbody>${ranked
      .map(
        (r) =>
          `<tr><td>${r.rank}</td><td><strong>${r.sector}</strong></td><td>${fmtBig(r.avgVolume3m)}</td><td>${fmtBig(
            r.avgVolume6m,
          )}</td><td style="color:${r.volumeChangePct >= 0 ? 'var(--accent)' : 'var(--danger)'}">${pct(
            r.volumeChangePct,
          )}</td></tr>`,
      )
      .join('')}</tbody></table>`;
  out.appendChild(card);
}
