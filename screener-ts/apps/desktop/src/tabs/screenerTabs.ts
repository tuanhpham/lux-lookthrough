import {
  screen,
  recommend,
  fetchMany,
  computeSectorVolumeRank,
  SECTOR_STOCKS,
  ALL_SECTORS,
  VN_SECTOR_STOCKS,
  VN_ALL_SECTORS,
  scanStock,
  patternToRow,
  STRATEGIES,
  scanQm,
  qmToRow,
  DEFAULT_QM_CONFIG,
  type StrategyKey,
  type Period,
  type ScreenRow,
  type QmRow,
  type OHLCV,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el, num, pct, fmtBig, scoreColor, signalBadge, stageBadge } from '../ui/dom.js';
import { sortableTable, type SortKey } from '../ui/sortableTable.js';
import { qmTable, type QmSortKey } from '../ui/qmTable.js';
import { openStock } from '../ui/stockModal.js';
import { drawLine } from '../ui/charts.js';
import { t } from '../ui/i18n.js';
import {
  getBroadUniverse,
  getAllUsUniverse,
  getVn30Universe,
  getVn100Universe,
  getAllVnUniverse,
  getHnxUniverse,
  getUpcomUniverse,
  getAllVnMarketUniverse,
} from '../adapters/universe.js';

const PERIOD: Period = '1y';
const CURATED = [...new Set(Object.values(SECTOR_STOCKS).flat())]; // ~543 symbols

// ── Top Picks ─────────────────────────────────────────────────────────────────
type Market = 'us' | 'vn';
type UniverseMode =
  | 'curated' | 'broad' | 'all'
  | 'vn30' | 'vn100' | 'vnall' | 'hnx' | 'upcom' | 'vnmarket';

/** Universe options per market — the toggle row rebuilds from this. */
const UNIVERSES_BY_MARKET: Record<Market, { mode: UniverseMode; labelKey: string }[]> = {
  us: [
    { mode: 'curated', labelKey: 'picks.uni.curated' },
    { mode: 'broad', labelKey: 'picks.uni.broad' },
    { mode: 'all', labelKey: 'picks.uni.all' },
  ],
  vn: [
    { mode: 'vn30', labelKey: 'picks.uni.vn30' },
    { mode: 'vn100', labelKey: 'picks.uni.vn100' },
    { mode: 'vnall', labelKey: 'picks.uni.vnall' },
    { mode: 'hnx', labelKey: 'picks.uni.hnx' },
    { mode: 'upcom', labelKey: 'picks.uni.upcom' },
    { mode: 'vnmarket', labelKey: 'picks.uni.vnmarket' },
  ],
};

/** Universe modes large enough to warrant the long-scan hint + bigger batches. */
const BIG_UNIVERSES = new Set<UniverseMode>(['all', 'vnall', 'hnx', 'upcom', 'vnmarket']);

/** Top Picks strategies: the core ScreenRow presets plus the QM (Qullamaggie) scan. */
type PicksStrategy = StrategyKey | 'qm';

let picksStrategy: PicksStrategy = 'breakout';
let picksMarket: Market = 'us';
let picksUniverse: UniverseMode = 'curated';
let picksSort: { key: SortKey; desc: boolean } = { key: 'score', desc: true };
let qmSort: { key: QmSortKey; desc: boolean } = { key: 'qualityScore', desc: true };
let screenSort: { key: SortKey; desc: boolean } = { key: 'score', desc: true };

// Cancellation token for an in-flight scan; bumping it aborts the running scan.
let scanToken = 0;

export function renderPicks(ctx: AppContext): void {
  const root = $('#tab-picks')!;
  const markets: [Market, string][] = [
    ['us', t('picks.market.us')],
    ['vn', t('picks.market.vn')],
  ];
  root.innerHTML = `
    <h1>${t('picks.title')}</h1>
    <p class="subtitle">${t('picks.sub')}</p>
    <div class="toolbar">
      ${(['breakout', 'momentum', 'vcp', 'qm'] as PicksStrategy[])
        .map(
          (s) =>
            `<button class="range-btn ${s === picksStrategy ? 'active' : ''}" data-strategy="${s}">${t(
              'picks.' + s,
            )}</button>`,
        )
        .join('')}
      <button id="picks-refresh" class="btn-outline" style="margin-left:auto">${t('picks.run')}</button>
      <button id="picks-stop" class="btn-outline hidden">${t('picks.stop')}</button>
    </div>
    <div class="toolbar" style="margin-top:-4px">
      <span class="muted" style="font-size:12px">${t('picks.market')}:</span>
      ${markets
        .map(
          ([m, label]) =>
            `<button class="range-btn ${m === picksMarket ? 'active' : ''}" data-market="${m}">${label}</button>`,
        )
        .join('')}
    </div>
    <div class="toolbar" style="margin-top:-4px" id="picks-uni-row"></div>
    <div id="picks-progress" class="picks-progress hidden"><div id="picks-bar"></div></div>
    <div id="picks-status" class="muted" style="margin:8px 0 12px"></div>
    <div id="picks-results"></div>`;

  root.querySelectorAll<HTMLElement>('[data-strategy]').forEach((b) =>
    b.addEventListener('click', () => {
      picksStrategy = b.dataset.strategy as PicksStrategy;
      root.querySelectorAll('[data-strategy]').forEach((x) => x.classList.toggle('active', x === b));
      void runPicks(ctx);
    }),
  );
  root.querySelectorAll<HTMLElement>('[data-market]').forEach((b) =>
    b.addEventListener('click', () => {
      const m = b.dataset.market as Market;
      if (m === picksMarket) return;
      picksMarket = m;
      // Default to the first universe of the newly selected market.
      picksUniverse = UNIVERSES_BY_MARKET[m][0]!.mode;
      root.querySelectorAll('[data-market]').forEach((x) => x.classList.toggle('active', x === b));
      renderUniverseRow(ctx);
      void runPicks(ctx);
    }),
  );
  renderUniverseRow(ctx);
  $('#picks-refresh')!.addEventListener('click', () => void runPicks(ctx));
  $('#picks-stop')!.addEventListener('click', () => {
    scanToken++; // abort the running scan loop
  });

  // Auto-run on render (the app enters straight into this tab).
  void runPicks(ctx);
}

/** (Re)build the universe toggle row for the active market and wire its clicks. */
function renderUniverseRow(ctx: AppContext): void {
  const row = $('#picks-uni-row')!;
  const opts = UNIVERSES_BY_MARKET[picksMarket];
  row.innerHTML =
    `<span class="muted" style="font-size:12px">${t('picks.universe')}:</span>` +
    opts
      .map(
        (o) =>
          `<button class="range-btn ${o.mode === picksUniverse ? 'active' : ''}" data-universe="${o.mode}">${t(
            o.labelKey,
          )}</button>`,
      )
      .join('') +
    `<span id="picks-uni-hint" class="muted" style="font-size:11px">${universeHint()}</span>`;
  row.querySelectorAll<HTMLElement>('[data-universe]').forEach((b) =>
    b.addEventListener('click', () => {
      picksUniverse = b.dataset.universe as UniverseMode;
      row.querySelectorAll('[data-universe]').forEach((x) => x.classList.toggle('active', x === b));
      $('#picks-uni-hint')!.textContent = universeHint();
      void runPicks(ctx);
    }),
  );
}

/** Long-scan warning shown for the big universes. */
function universeHint(): string {
  if (picksUniverse === 'all') return t('picks.uni.all.hint');
  if (BIG_UNIVERSES.has(picksUniverse)) return t('picks.uni.vnall.hint');
  return '';
}

/** Resolve the symbol list for the active universe mode. */
async function resolveUniverse(mode: UniverseMode): Promise<string[]> {
  if (mode === 'curated') return CURATED;
  if (mode === 'broad') return getBroadUniverse();
  if (mode === 'vn30') return getVn30Universe();
  if (mode === 'vn100') return getVn100Universe();
  if (mode === 'vnall') return getAllVnUniverse();
  if (mode === 'hnx') return getHnxUniverse();
  if (mode === 'upcom') return getUpcomUniverse();
  if (mode === 'vnmarket') return getAllVnMarketUniverse();
  return getAllUsUniverse();
}

/**
 * Incremental, cancellable scan. Fetches symbols in batches, scores each batch
 * as it lands, accumulates matches for the active strategy, and re-renders the
 * results table + progress bar after every batch. This keeps the UI responsive
 * (and the browser tab alive) even for the full ~6000-symbol universe, and lets
 * the user Stop at any time. Failed/dropped symbols are simply skipped — click
 * Run to retry them.
 */
async function runPicks(ctx: AppContext): Promise<void> {
  // QM (Qullamaggie) is a distinct scanner returning QmRow (not ScreenRow), so
  // it runs on its own code path with its own table renderer.
  if (picksStrategy === 'qm') {
    await runQmPicks(ctx);
    return;
  }
  const myToken = ++scanToken; // also aborts any previous scan
  const status = $('#picks-status')!;
  const out = $('#picks-results')!;
  const progress = $('#picks-progress')!;
  const bar = $('#picks-bar')!;
  const stopBtn = $('#picks-stop')!;
  const runBtn = $('#picks-refresh')!;

  out.innerHTML = '';
  progress.classList.remove('hidden');
  stopBtn.classList.remove('hidden');
  runBtn.classList.add('hidden');
  bar.style.width = '0%';
  status.innerHTML = `<span class="spinner"></span> ${t('picks.loadinguni')}`;

  const finish = (): void => {
    progress.classList.add('hidden');
    stopBtn.classList.add('hidden');
    runBtn.classList.remove('hidden');
  };

  let symbols: string[];
  try {
    symbols = await resolveUniverse(picksUniverse);
  } catch {
    symbols = CURATED;
  }
  if (myToken !== scanToken) return; // superseded while loading the list

  // 'qm' already returned above, so picksStrategy here is a core StrategyKey.
  const cfg = STRATEGIES[picksStrategy as StrategyKey] ?? STRATEGIES.breakout;
  const strategyLabel = cfg.label;
  // Larger universes use bigger batches but the same modest per-batch concurrency
  // so we don't hammer Yahoo (which rate-limits → dropped symbols).
  const BATCH = BIG_UNIVERSES.has(picksUniverse) ? 120 : 60;
  const CONCURRENCY = 6;

  const matches: ScreenRow[] = [];
  let scanned = 0;
  let fetched = 0;

  const renderTable = (): void => {
    matches.sort((a, b) => b.score - a.score);
    const top = matches.slice(0, 50);
    out.replaceChildren(
      sortableTable(top, {
        sortKey: picksSort.key,
        sortDesc: picksSort.desc,
        onRowClick: (sym) => void openStock(ctx, sym),
        onSortChange: (key, desc) => {
          picksSort = { key, desc };
        },
      }),
    );
  };

  for (let i = 0; i < symbols.length; i += BATCH) {
    if (myToken !== scanToken) {
      // Stopped or superseded.
      status.textContent =
        `${t('picks.stopped')} — ${matches.length} ${strategyLabel} ${t('picks.matches')}, ` +
        `${scanned}/${symbols.length} ${t('picks.scanned')}.`;
      if (matches.length) renderTable();
      finish();
      return;
    }
    const batch = symbols.slice(i, i + BATCH);
    const data = await fetchMany(ctx.data, batch, PERIOD, CONCURRENCY);
    if (myToken !== scanToken) continue; // will be caught at loop top

    fetched += data.size;
    for (const series of data.values() as IterableIterator<OHLCV>) {
      if (!series.bars || series.bars.length < 60) continue;
      scanned += 1;
      const p = scanStock(series.symbol, series.bars);
      // Same preset filters as core's recommend(): score, signal/stage, VCP.
      if (p.score < cfg.minScore) continue;
      if (cfg.signals && !cfg.signals.has(p.signal)) continue;
      if (cfg.stages && !cfg.stages.has(p.stage.stage)) continue;
      if (cfg.minVcp != null && (p.consolidation.vcpContractions ?? 0) < cfg.minVcp) continue;
      matches.push(patternToRow(p));
    }

    const doneCount = Math.min(i + BATCH, symbols.length);
    bar.style.width = `${Math.round((doneCount / symbols.length) * 100)}%`;
    status.innerHTML =
      `<span class="spinner"></span> ${t('msg.scanning')} ${doneCount}/${symbols.length} — ` +
      `${matches.length} ${strategyLabel} ${t('picks.matches')}`;
    renderTable();
    // Yield to the event loop so the UI paints and stays responsive.
    await new Promise((r) => setTimeout(r, 0));
  }

  if (myToken !== scanToken) {
    finish();
    return;
  }
  const dropped = symbols.length - fetched;
  status.textContent =
    `${t('picks.done')}: ${matches.length} ${strategyLabel} setup(s) from ${scanned}/${symbols.length} ${t('picks.scanned')}` +
    (dropped > 0 ? ` (${dropped} ${t('picks.unavailable')} — ${t('picks.run')})` : '') +
    '.';
  if (!matches.length) {
    out.innerHTML = `<div class="card muted" style="text-align:center;padding:30px">No setups matched.</div>`;
  } else {
    renderTable();
  }
  finish();
}

/**
 * QM (Qullamaggie) variant of {@link runPicks}: same incremental/cancellable
 * fetch-and-scan scaffolding, but it runs `scanQm` per symbol, keeps only stocks
 * that pass the trend filter AND form a VCP or episodic-pivot setup, and renders
 * the richer `qmTable` (Quality, Setup, contractions, pivot, risk).
 */
async function runQmPicks(ctx: AppContext): Promise<void> {
  const myToken = ++scanToken; // also aborts any previous scan
  const status = $('#picks-status')!;
  const out = $('#picks-results')!;
  const progress = $('#picks-progress')!;
  const bar = $('#picks-bar')!;
  const stopBtn = $('#picks-stop')!;
  const runBtn = $('#picks-refresh')!;

  out.innerHTML = '';
  progress.classList.remove('hidden');
  stopBtn.classList.remove('hidden');
  runBtn.classList.add('hidden');
  bar.style.width = '0%';
  status.innerHTML = `<span class="spinner"></span> ${t('picks.loadinguni')}`;

  const finish = (): void => {
    progress.classList.add('hidden');
    stopBtn.classList.add('hidden');
    runBtn.classList.remove('hidden');
  };

  let symbols: string[];
  try {
    symbols = await resolveUniverse(picksUniverse);
  } catch {
    symbols = CURATED;
  }
  if (myToken !== scanToken) return;

  const strategyLabel = t('picks.qm');
  const BATCH = BIG_UNIVERSES.has(picksUniverse) ? 120 : 60;
  const CONCURRENCY = 6;

  const matches: QmRow[] = [];
  let scanned = 0;
  let fetched = 0;

  const renderTable = (): void => {
    matches.sort((a, b) => b.qualityScore - a.qualityScore);
    const top = matches.slice(0, 50);
    out.replaceChildren(
      qmTable(top, {
        sortKey: qmSort.key,
        sortDesc: qmSort.desc,
        onRowClick: (sym) => void openStock(ctx, sym),
        onSortChange: (key, desc) => {
          qmSort = { key, desc };
        },
      }),
    );
  };

  for (let i = 0; i < symbols.length; i += BATCH) {
    if (myToken !== scanToken) {
      status.textContent =
        `${t('picks.stopped')} — ${matches.length} ${strategyLabel} ${t('picks.matches')}, ` +
        `${scanned}/${symbols.length} ${t('picks.scanned')}.`;
      if (matches.length) renderTable();
      finish();
      return;
    }
    const batch = symbols.slice(i, i + BATCH);
    const data = await fetchMany(ctx.data, batch, PERIOD, CONCURRENCY);
    if (myToken !== scanToken) continue;

    fetched += data.size;
    for (const series of data.values() as IterableIterator<OHLCV>) {
      if (!series.bars || series.bars.length < 60) continue;
      scanned += 1;
      const r = scanQm(series.symbol, series.bars, DEFAULT_QM_CONFIG);
      // Keep only real QM setups (a passing trend + VCP or episodic pivot).
      if (r.setupType === 'NONE') continue;
      matches.push(qmToRow(r));
    }

    const doneCount = Math.min(i + BATCH, symbols.length);
    bar.style.width = `${Math.round((doneCount / symbols.length) * 100)}%`;
    status.innerHTML =
      `<span class="spinner"></span> ${t('msg.scanning')} ${doneCount}/${symbols.length} — ` +
      `${matches.length} ${strategyLabel} ${t('picks.matches')}`;
    renderTable();
    await new Promise((r) => setTimeout(r, 0));
  }

  if (myToken !== scanToken) {
    finish();
    return;
  }
  const dropped = symbols.length - fetched;
  status.textContent =
    `${t('picks.done')}: ${matches.length} ${strategyLabel} setup(s) from ${scanned}/${symbols.length} ${t('picks.scanned')}` +
    (dropped > 0 ? ` (${dropped} ${t('picks.unavailable')} — ${t('picks.run')})` : '') +
    '.';
  if (!matches.length) {
    out.innerHTML = `<div class="card muted" style="text-align:center;padding:30px">No QM setups matched.</div>`;
  } else {
    renderTable();
  }
  finish();
}

// ── Screener ────────────────────────────────────────────────────────────────────
const selectedSectors = new Set<string>();
let screenerMarket: Market = 'us';

const screenerSectorMap = (): Record<string, string[]> =>
  screenerMarket === 'vn' ? VN_SECTOR_STOCKS : SECTOR_STOCKS;

/** (Re)paint the sector chips for the active market and wire their toggles. */
function renderSectorChips(): void {
  const chips = $('#sector-chips')!;
  const sectors = screenerMarket === 'vn' ? VN_ALL_SECTORS : ALL_SECTORS;
  chips.innerHTML = sectors
    .map((s) => `<button class="range-btn ${selectedSectors.has(s) ? 'active' : ''}" data-sector="${s}">${s}</button>`)
    .join('');
  chips.querySelectorAll<HTMLElement>('[data-sector]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = b.dataset.sector!;
      if (selectedSectors.has(s)) selectedSectors.delete(s);
      else selectedSectors.add(s);
      b.classList.toggle('active', selectedSectors.has(s));
    }),
  );
}

export function renderScreener(ctx: AppContext): void {
  const root = $('#tab-screener')!;
  const markets: [Market, string][] = [
    ['us', t('picks.market.us')],
    ['vn', t('picks.market.vn')],
  ];
  root.innerHTML = `
    <h1>${t('screener.title')}</h1>
    <p class="subtitle">${t('screener.sub')}</p>
    <div class="card" style="margin-bottom:16px">
      <div class="toolbar" style="margin-bottom:10px">
        <span class="muted" style="font-size:12px">${t('picks.market')}:</span>
        ${markets
          .map(
            ([m, label]) =>
              `<button class="range-btn ${m === screenerMarket ? 'active' : ''}" data-screener-market="${m}">${label}</button>`,
          )
          .join('')}
      </div>
      <label class="field-label">${t('screener.symbols')}</label>
      <input id="sym-input" class="field" placeholder="${screenerMarket === 'vn' ? 'FPT.VN, HPG.VN, VCB.VN' : 'AAPL, MSFT, NVDA'}" />
      <div style="margin-top:12px">
        <label class="field-label">${t('screener.orsectors')}</label>
        <div id="sector-chips" class="row"></div>
      </div>
      <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-top:12px">
        <div><label class="field-label">${t('screener.minscore')}</label><input id="min-score" class="field" type="number" placeholder="${t('screener.nolimit')}" title="${t('screener.minscore.hint')}" /></div>
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

  renderSectorChips();
  root.querySelectorAll<HTMLElement>('[data-screener-market]').forEach((b) =>
    b.addEventListener('click', () => {
      const m = b.dataset.screenerMarket as Market;
      if (m === screenerMarket) return;
      screenerMarket = m;
      // Sector sets differ between markets — clear stale selections.
      selectedSectors.clear();
      renderScreener(ctx);
    }),
  );
  $('#run-screen')!.addEventListener('click', () => void runScreen(ctx));
}

/** Programmatic entry used by the Sectors tab "Screen stocks" button. */
export function screenSector(ctx: AppContext, sector: string): void {
  // Keep the Screener's market aligned with the Sectors tab so the sector exists.
  screenerMarket = sectorMarket;
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
  const sectorMap = screenerSectorMap();
  const universe = [...new Set([...symInput, ...sectors.flatMap((s) => sectorMap[s] ?? [])])];
  if (!universe.length) {
    status.textContent = 'Enter symbols or pick a sector.';
    return;
  }
  status.innerHTML = `<span class="spinner"></span> ${t('msg.scanning')} ${universe.length}…`;
  out.innerHTML = '';
  const data = await fetchMany(ctx.data, universe, PERIOD, 8);
  const signal = ($('#signal-filter') as HTMLSelectElement).value;
  const stage = ($('#stage-filter') as HTMLSelectElement).value;
  // Blank Min score → NO lower limit (−Infinity), so legitimately negative-
  // scoring stocks (e.g. STX, INTC — whose ATR expanded) are NOT silently
  // dropped. Only a number the user actually types becomes a floor.
  const minScoreRaw = ($('#min-score') as HTMLInputElement).value.trim();
  const minScore = minScoreRaw === '' ? -Infinity : Number(minScoreRaw);
  const res = screen([...data.values()], {
    minScore,
    signals: signal ? [signal as 'BREAKOUT_IMMINENT' | 'CONSOLIDATING'] : undefined,
    stages: stage ? [Number(stage)] : undefined,
    sortBy: ($('#sort-by') as HTMLSelectElement).value as 'score',
    limit: 200,
  });

  // Transparency: explain any gap between what you asked for and what showed up.
  const fetched = data.size;
  const fetchDropped = universe.length - fetched; // failed network / 0 bars
  const tooFew = fetched - res.scanned; // fetched but < 60 bars
  const filtered = res.scanned - res.matched; // scanned but filtered out
  const parts: string[] = [`${res.matched} match(es) of ${universe.length} requested`];
  if (fetchDropped > 0) parts.push(`${fetchDropped} couldn't be fetched (network/rate-limit — click Run to retry)`);
  if (tooFew > 0) parts.push(`${tooFew} had too little history (<60 bars)`);
  if (filtered > 0) parts.push(`${filtered} scanned but filtered out (score/signal/stage)`);
  status.textContent = parts.join(' · ') + '.';
  out.appendChild(
    sortableTable(res.results, {
      sortKey: screenSort.key,
      sortDesc: screenSort.desc,
      onRowClick: (sym) => void openStock(ctx, sym),
      onSortChange: (key, desc) => {
        screenSort = { key, desc };
      },
    }),
  );
}

// ── Sectors (rank + expandable volume charts) ──────────────────────────────────
let sectorMarket: Market = 'us';
// Cache the fetched 6mo OHLCV from the last scan so per-sector volume charts can
// be computed client-side (the provider's getSectorVolume is US-only).
let sectorData: Map<string, OHLCV> = new Map();

const sectorMapFor = (m: Market): Record<string, string[]> =>
  m === 'vn' ? VN_SECTOR_STOCKS : SECTOR_STOCKS;

export function renderSectors(ctx: AppContext): void {
  const root = $('#tab-sectors')!;
  const markets: [Market, string][] = [
    ['us', t('picks.market.us')],
    ['vn', t('picks.market.vn')],
  ];
  root.innerHTML = `
    <h1>${t('sectors.title')}</h1>
    <p class="subtitle">${t('sectors.sub')}</p>
    <div class="toolbar" style="margin-bottom:8px">
      <span class="muted" style="font-size:12px">${t('picks.market')}:</span>
      ${markets
        .map(
          ([m, label]) =>
            `<button class="range-btn ${m === sectorMarket ? 'active' : ''}" data-sector-market="${m}">${label}</button>`,
        )
        .join('')}
    </div>
    <div class="row" style="margin-bottom:12px"><button id="load-sectors" class="btn-outline">${t('sectors.scan')}</button><span id="sector-status" class="muted"></span></div>
    <div id="sector-results"></div>`;
  root.querySelectorAll<HTMLElement>('[data-sector-market]').forEach((b) =>
    b.addEventListener('click', () => {
      const m = b.dataset.sectorMarket as Market;
      if (m === sectorMarket) return;
      sectorMarket = m;
      root.querySelectorAll('[data-sector-market]').forEach((x) => x.classList.toggle('active', x === b));
      void runSectors(ctx);
    }),
  );
  $('#load-sectors')!.addEventListener('click', () => void runSectors(ctx));
  void runSectors(ctx);
}

async function runSectors(ctx: AppContext): Promise<void> {
  const status = $('#sector-status')!;
  const out = $('#sector-results')!;
  const sectorMap = sectorMapFor(sectorMarket);
  const universe = [...new Set(Object.values(sectorMap).flat())];
  status.innerHTML = `<span class="spinner"></span> ${t('msg.scanning')} ${Object.keys(sectorMap).length} sectors…`;
  out.innerHTML = '';
  const data = await fetchMany(ctx.data, universe, '6mo', 10);
  sectorData = data;
  const ranked = computeSectorVolumeRank(data, sectorMap);
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

    const drawChart = () => {
      const chartEl = row.querySelector<HTMLElement>('.sector-chart')!;
      // Compute the sector's summed volume series from the already-fetched 6mo
      // data (works for any market; the provider's getSectorVolume is US-only).
      const points = sectorVolumeSeries(sectorMapFor(sectorMarket)[r.sector] ?? [], freq);
      if (!points.length) {
        chartEl.innerHTML = `<div class="muted" style="text-align:center;padding:40px">No volume data.</div>`;
        return;
      }
      chartEl.innerHTML = '';
      drawLine(chartEl, points.map((p) => ({ time: p.date, value: p.volume })), {
        volume: true,
        height: 180,
      });
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

/** Sum daily volume across a sector's symbols (from the cached scan data) and
 * resample into weekly (week-ending Sunday) or monthly buckets. Mirrors the
 * provider's getSectorVolume but runs client-side so it works for any market. */
function sectorVolumeSeries(symbols: string[], freq: 'weekly' | 'monthly'): { date: string; volume: number }[] {
  const byDate = new Map<string, number>();
  for (const sym of symbols) {
    const ohlcv = sectorData.get(sym);
    if (!ohlcv) continue;
    for (const b of ohlcv.bars) byDate.set(b.date, (byDate.get(b.date) ?? 0) + b.volume);
  }
  const buckets = new Map<string, number>();
  for (const [date, vol] of [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const key = freq === 'weekly' ? weekEnding(date) : date.slice(0, 7);
    buckets.set(key, (buckets.get(key) ?? 0) + vol);
  }
  return [...buckets.entries()]
    .filter(([, v]) => v > 0)
    .map(([date, volume]) => ({ date: freq === 'monthly' ? `${date}-01` : date, volume }));
}

/** ISO week-ending (Sunday) date key, matching YahooProvider's weekKey. */
function weekEnding(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  const add = (7 - d.getUTCDay()) % 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}
