import {
  fetchMany,
  computeSectorVolumeRank,
  computeSectorMomentum,
  SECTOR_STOCKS,
  ALL_SECTORS,
  VN_SECTOR_STOCKS,
  VN_ALL_SECTORS,
  scanQm,
  qmToRow,
  DEFAULT_QM_CONFIG,
  rankMomentum,
  computeMomentumScore,
  momentumToRow,
  detectRegime,
  detectSurge,
  filterByMomentum,
  type Period,
  type QmRow,
  type QmSetupType,
  type MomentumRow,
  type MomentumClassification,
  type MarketRegime,
  type SectorMomentumReport,
  type SectorMomentum,
  type OHLCV,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el, num, pct, fmtBig } from '../ui/dom.js';
import { qmTable, type QmSortKey } from '../ui/qmTable.js';
import { momentumTable, type MomentumSortKey } from '../ui/momentumTable.js';
import { screenerTable, type ScreenerRow, type ScreenerSortKey } from '../ui/screenerTable.js';
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

/** Top Picks strategies: Qullamaggie (QM pattern setups), Momentum (the
 * exploration scan of strongest movers), and Surge (held above EMA5 all week +
 * a >20% two-week move). The legacy conviction-score presets were removed. */
type PicksStrategy = 'qm' | 'momentumscan' | 'surge';

/** US index benchmarks for market regime + relative strength (F2). */
const BENCHMARKS = ['SPY', 'QQQ'];

/** Reverse map: symbol → its (first) sector, for annotating momentum rows (F6). */
const SECTOR_BY_SYMBOL: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [sector, syms] of Object.entries(SECTOR_STOCKS)) {
    for (const s of syms) if (!(s in out)) out[s] = sector;
  }
  return out;
})();

/** Momentum pre-filter toggle (F4). Default ON — narrows the QM/VCP universe to
 * top-momentum names; switch OFF to restore the exact prior scan behavior. */
let momentumPrefilter = true;

let picksStrategy: PicksStrategy = 'qm';
let picksMarket: Market = 'us';
let picksUniverse: UniverseMode = 'curated';
let qmSort: { key: QmSortKey; desc: boolean } = { key: 'qualityScore', desc: true };
let momentumSort: { key: MomentumSortKey; desc: boolean } = { key: 'momentumScore', desc: true };
let screenSort: { key: ScreenerSortKey; desc: boolean } = { key: 'qualityScore', desc: true };

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
      ${(['qm', 'momentumscan', 'surge'] as PicksStrategy[])
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
    <div class="toolbar" style="margin-top:-4px">
      <label class="muted" style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="picks-prefilter" ${momentumPrefilter ? 'checked' : ''} />
        ${t('picks.prefilter')}
      </label>
    </div>
    <div id="picks-regime" class="muted" style="margin:6px 0 0;font-size:12px"></div>
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
  $('#picks-prefilter')!.addEventListener('change', (e) => {
    momentumPrefilter = (e.target as HTMLInputElement).checked;
    void runPicks(ctx);
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
 * Fetch a whole universe into a Map in batches, updating the progress bar and
 * honouring cancellation. Used by the momentum scan and the momentum pre-filter,
 * both of which need the FULL fetched set to compute relative percentile ranks
 * (unlike the per-batch incremental scans). Returns null if the scan was
 * superseded/stopped mid-fetch.
 */
async function fetchUniverseToMap(
  ctx: AppContext,
  symbols: string[],
  myToken: number,
): Promise<Map<string, OHLCV> | null> {
  const status = $('#picks-status')!;
  const bar = $('#picks-bar')!;
  const BATCH = BIG_UNIVERSES.has(picksUniverse) ? 120 : 60;
  const CONCURRENCY = 6;
  const map = new Map<string, OHLCV>();

  for (let i = 0; i < symbols.length; i += BATCH) {
    if (myToken !== scanToken) return null;
    const batch = symbols.slice(i, i + BATCH);
    const data = await fetchMany(ctx.data, batch, PERIOD, CONCURRENCY);
    if (myToken !== scanToken) return null;
    for (const [sym, series] of data) map.set(sym, series);
    const doneCount = Math.min(i + BATCH, symbols.length);
    bar.style.width = `${Math.round((doneCount / symbols.length) * 100)}%`;
    status.innerHTML = `<span class="spinner"></span> ${t('msg.scanning')} ${doneCount}/${symbols.length}`;
    await new Promise((r) => setTimeout(r, 0));
  }
  return map;
}

/** Fetch the index benchmarks (SPY/QQQ) for regime + relative strength. US-only;
 * returns nulls for VN where these indices don't resolve. */
async function fetchBenchmarks(
  ctx: AppContext,
): Promise<{ spy: OHLCV | null; qqq: OHLCV | null }> {
  if (picksMarket !== 'us') return { spy: null, qqq: null };
  try {
    const data = await fetchMany(ctx.data, BENCHMARKS, PERIOD, BENCHMARKS.length);
    return { spy: data.get('SPY') ?? null, qqq: data.get('QQQ') ?? null };
  } catch {
    return { spy: null, qqq: null };
  }
}

/** Render the market-regime + hot/cold-sector banner above the results (F6 annotation). */
function renderRegimeBanner(regime: MarketRegime | null, sectors: SectorMomentumReport | null): void {
  const elBanner = $('#picks-regime')!;
  if (!regime && !sectors) {
    elBanner.textContent = '';
    return;
  }
  const parts: string[] = [];
  if (regime) {
    const color =
      regime.regimeType === 'BULL' ? 'var(--accent)' : regime.regimeType === 'BEAR' ? 'var(--danger)' : 'var(--warn)';
    const flag = regime.riskOn ? 'risk-on' : 'risk-off';
    parts.push(
      `Market: <strong style="color:${color}">${regime.regimeType}</strong> (${flag}, strength ${num(regime.strengthScore, 0)})`,
    );
  }
  if (sectors && sectors.hotSectors.length) {
    parts.push(`🔥 Hot: ${sectors.hotSectors.join(', ')}`);
  }
  if (sectors && sectors.coldSectors.length) {
    parts.push(`🧊 Cold: ${sectors.coldSectors.join(', ')}`);
  }
  elBanner.innerHTML = parts.join(' &nbsp;·&nbsp; ');
}

/**
 * Top Picks dispatcher: routes to the Qullamaggie scan, the Momentum
 * exploration scan, or the Surge scan. All are incremental, cancellable, and
 * render their own table; the legacy conviction-score path was removed.
 */
async function runPicks(ctx: AppContext): Promise<void> {
  if (picksStrategy === 'momentumscan' || picksStrategy === 'surge') {
    await runMomentumPicks(ctx, picksStrategy === 'surge');
    return;
  }
  await runQmPicks(ctx);
}

/**
 * QM (Qullamaggie) scan: incremental/cancellable fetch-and-scan that runs
 * `scanQm` per symbol, keeps only stocks that pass the trend filter AND form a
 * VCP or episodic-pivot setup, and renders the `qmTable` (Quality, Setup,
 * contractions, pivot, risk).
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

  // ── F4: optional momentum pre-filter (US only; needs SPY/QQQ + full ranking). ──
  // When ON we fetch the whole universe once, rank momentum, narrow to the top
  // slice (optionally intersected with hot sectors), annotate the regime banner,
  // and scan ONLY the survivors from the already-fetched data. The VCP/QM
  // detection itself is unchanged — it just receives a smaller universe.
  let prefetched: Map<string, OHLCV> | null = null;
  if (momentumPrefilter && picksMarket === 'us') {
    status.innerHTML = `<span class="spinner"></span> ${t('msg.scanning')} (momentum pre-filter)…`;
    const { spy, qqq } = await fetchBenchmarks(ctx);
    if (myToken !== scanToken) return;
    const fullMap = await fetchUniverseToMap(ctx, symbols, myToken);
    if (fullMap === null) return; // stopped mid-fetch
    const regime = spy ? detectRegime(spy.bars, qqq?.bars) : null;
    const sectorReport = computeSectorMomentum(fullMap, spy?.bars);
    renderRegimeBanner(regime, sectorReport);
    const filtered = filterByMomentum(fullMap, { benchmark: spy?.bars });
    symbols = filtered.symbols;
    prefetched = fullMap;
  } else {
    renderRegimeBanner(null, null);
  }

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
    // Reuse pre-filter data when present (already fetched); else fetch the batch.
    let data: Map<string, OHLCV>;
    if (prefetched) {
      data = new Map();
      for (const sym of batch) {
        const s = prefetched.get(sym);
        if (s) data.set(sym, s);
      }
    } else {
      data = await fetchMany(ctx.data, batch, PERIOD, CONCURRENCY);
    }
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

/**
 * Momentum exploration scan ("show me what's running right now"). NOT a VCP
 * scan: it fetches the whole universe, ranks every name by momentum, and shows
 * the top 50 movers (strong 1M/3M/6M, high RS), annotated with the market regime
 * and sector rotation. Stocks need not be in any pattern.
 *
 * When `surgeOnly` is set (the "Surge" strategy), the ranked list is first
 * narrowed to names passing `detectSurge` — close held ≥ EMA5 all week AND a
 * >20% two-week move — surfacing fresh fast movers specifically.
 */
async function runMomentumPicks(ctx: AppContext, surgeOnly = false): Promise<void> {
  const myToken = ++scanToken;
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

  // Need the full set for relative ranking + regime/sector context.
  const { spy, qqq } = await fetchBenchmarks(ctx);
  if (myToken !== scanToken) return;
  const fullMap = await fetchUniverseToMap(ctx, symbols, myToken);
  if (fullMap === null) {
    status.textContent = `${t('picks.stopped')}.`;
    finish();
    return;
  }

  const regime = spy ? detectRegime(spy.bars, qqq?.bars) : null;
  const sectorReport = computeSectorMomentum(fullMap, spy?.bars);
  renderRegimeBanner(regime, sectorReport);
  const hotSet = new Set(sectorReport.hotSectors);
  const sectorRankByName = new Map(sectorReport.rankings.map((r) => [r.sector, r]));

  let ranked = rankMomentum(fullMap, spy?.bars);
  if (surgeOnly) {
    // Keep only fresh fast movers: held ≥ EMA5 all week + >20% in two weeks.
    ranked = ranked.filter((r) => {
      const bars = fullMap.get(r.symbol)?.bars;
      return bars ? detectSurge(bars).isSurge : false;
    });
  }
  const rows: MomentumRow[] = ranked.map((r) => {
    const sector = SECTOR_BY_SYMBOL[r.symbol] ?? null;
    const sec = sector ? sectorRankByName.get(sector) ?? null : null;
    return momentumToRow(r, {
      sector,
      regime,
      sector_: sec,
      isHotSector: sector ? hotSet.has(sector) : false,
    });
  });

  const renderTable = (): void => {
    out.replaceChildren(
      momentumTable(rows.slice(0, 50), {
        sortKey: momentumSort.key,
        sortDesc: momentumSort.desc,
        onRowClick: (sym) => void openStock(ctx, sym),
        onSortChange: (key, desc) => {
          momentumSort = { key, desc };
        },
      }),
    );
  };

  if (myToken !== scanToken) {
    finish();
    return;
  }
  const label = surgeOnly ? t('picks.surge') : t('picks.momentumscan');
  status.textContent =
    `${t('picks.done')}: ${rows.length} ${label} ${t('picks.matches')} (${t('picks.scanned')} ${fullMap.size}).`;
  if (!rows.length) {
    out.innerHTML = `<div class="card muted" style="text-align:center;padding:30px">No ${label} matches found.</div>`;
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
        <div><label class="field-label">${t('screener.setup')}</label><select id="setup-filter" class="field">
          <option value="">${t('opt.any')}</option>
          <option value="VCP">${t('screener.setup.vcp')}</option>
          <option value="EPISODIC_PIVOT">${t('screener.setup.ep')}</option>
          <option value="BOTH">${t('screener.setup.both')}</option></select></div>
        <div><label class="field-label">${t('screener.minquality')}</label><input id="min-quality" class="field" type="number" placeholder="${t('screener.nolimit')}" /></div>
        <div><label class="field-label">${t('screener.minmomentum')}</label><select id="momentum-filter" class="field">
          <option value="">${t('opt.any')}</option>
          <option value="Building">${t('mom.class.building')}+</option>
          <option value="Strong">${t('mom.class.strong')}+</option>
          <option value="Explosive">${t('mom.class.explosive')}</option></select></div>
        <div><label class="field-label">${t('screener.sortby')}</label><select id="sort-by" class="field">
          <option value="qualityScore">${t('screener.col.quality')}</option>
          <option value="momentumScore">${t('screener.col.momentum')}</option>
          <option value="return3m">3M</option>
          <option value="relativeStrength">RS</option></select></div>
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

  // New QM + Momentum filters.
  const setupFilter = ($('#setup-filter') as HTMLSelectElement).value as QmSetupType | '';
  const minQualityRaw = ($('#min-quality') as HTMLInputElement).value.trim();
  const minQuality = minQualityRaw === '' ? -Infinity : Number(minQualityRaw);
  const momentumFilter = ($('#momentum-filter') as HTMLSelectElement).value as MomentumClassification | '';
  const sortBy = ($('#sort-by') as HTMLSelectElement).value as ScreenerSortKey;
  const classRank: Record<MomentumClassification, number> = { Weak: 1, Building: 2, Strong: 3, Explosive: 4 };

  // Benchmark (SPY) for relative strength when screening US names.
  const { spy } = await fetchBenchmarks(ctx);

  let scanned = 0;
  const rows: ScreenerRow[] = [];
  for (const series of data.values() as IterableIterator<OHLCV>) {
    if (!series.bars || series.bars.length < 60) continue;
    scanned += 1;
    const q = scanQm(series.symbol, series.bars, DEFAULT_QM_CONFIG);
    const m = computeMomentumScore(series.symbol, series.bars, spy?.bars);
    // Apply filters.
    if (setupFilter && q.setupType !== setupFilter) continue;
    if (q.qualityScore < minQuality) continue;
    if (momentumFilter && classRank[m.classification] < classRank[momentumFilter]) continue;
    rows.push(toScreenerRow(q, m));
  }

  rows.sort((a, b) => screenerSortValue(b, sortBy) - screenerSortValue(a, sortBy));

  // Transparency: explain any gap between what you asked for and what showed up.
  const fetched = data.size;
  const fetchDropped = universe.length - fetched; // failed network / 0 bars
  const tooFew = fetched - scanned; // fetched but < 60 bars
  const filtered = scanned - rows.length; // scanned but filtered out
  const parts: string[] = [`${rows.length} match(es) of ${universe.length} requested`];
  if (fetchDropped > 0) parts.push(`${fetchDropped} couldn't be fetched (network/rate-limit — click Run to retry)`);
  if (tooFew > 0) parts.push(`${tooFew} had too little history (<60 bars)`);
  if (filtered > 0) parts.push(`${filtered} scanned but filtered out (setup/quality/momentum)`);
  status.textContent = parts.join(' · ') + '.';
  out.appendChild(
    screenerTable(rows.slice(0, 200), {
      sortKey: screenSort.key,
      sortDesc: screenSort.desc,
      onRowClick: (sym) => void openStock(ctx, sym),
      onSortChange: (key, desc) => {
        screenSort = { key, desc };
      },
    }),
  );
}

/** Numeric value for the initial screener sort (the table handles re-sorts). */
function screenerSortValue(r: ScreenerRow, key: ScreenerSortKey): number {
  const v = (r as unknown as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : 0;
}

/** Combine a QM scan + momentum result into one Custom-Screener row. */
function toScreenerRow(
  q: ReturnType<typeof scanQm>,
  m: ReturnType<typeof computeMomentumScore>,
): ScreenerRow {
  return {
    symbol: q.symbol,
    price: q.price,
    qualityScore: q.qualityScore,
    setupType: q.setupType,
    trendPassed: q.trend.passed,
    pivot: q.vcp.pivot,
    entryPrice: q.levels.entryPrice,
    stopLoss: q.levels.stopLoss,
    riskPct: q.riskPct,
    momentumScore: m.momentumScore,
    classification: m.classification,
    return1m: m.returns.oneMonth,
    return3m: m.returns.threeMonth,
    return6m: m.returns.sixMonth,
    relativeStrength: m.relativeStrength,
    distanceFrom52wHighPct: m.distanceFrom52wHighPct,
    atrPct: m.atrPct,
  };
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
  // 1y of history so the momentum returns (incl. 6M) are well-defined; the
  // volume chart simply resamples whatever range is fetched.
  const data = await fetchMany(ctx.data, universe, PERIOD, 10);
  sectorData = data;

  // Volume ranking (existing) + momentum ranking (new). For US we also fetch SPY
  // so sector relative strength is measured vs the benchmark.
  const ranked = computeSectorVolumeRank(data, sectorMap);
  const { spy } = sectorMarket === 'us' ? await fetchBenchmarks(ctx) : { spy: null };
  const momReport = computeSectorMomentum(data, spy?.bars ?? undefined, sectorMap);
  const momBySector = new Map(momReport.rankings.map((m) => [m.sector, m]));
  const hotSet = new Set(momReport.hotSectors);

  // Order sectors by momentum rank (the new primary signal), falling back to the
  // volume ranking for any sector momentum couldn't rank.
  const volBySector = new Map(ranked.map((r) => [r.sector, r]));
  const orderedSectors = [
    ...momReport.rankings.map((m) => m.sector),
    ...ranked.map((r) => r.sector).filter((s) => !momBySector.has(s)),
  ];

  status.textContent = `${orderedSectors.length} sectors ranked.`;
  out.innerHTML = '';
  renderSectorRotationBanner(momReport);
  for (const sector of orderedSectors) {
    const r = volBySector.get(sector);
    const mom = momBySector.get(sector);
    const color = mom
      ? mom.avgRelativeStrength >= 0 ? 'var(--accent)' : 'var(--danger)'
      : 'var(--faint)';
    const momRank = mom ? `#${mom.rank}` : '—';
    const hot = hotSet.has(sector) ? ' 🔥' : '';
    const volLine = r
      ? `3m ${fmtBig(r.avgVolume3m)} · 6m ${fmtBig(r.avgVolume6m)} avg vol · vol ${pct(r.volumeChangePct)}`
      : 'no volume data';
    const row = el(`
      <div class="sector-row">
        <div class="sector-head" data-sector="${sector}">
          <span class="sector-rank">${momRank}</span>
          <div style="flex:1"><strong>${sector}${hot}</strong>
            <div class="muted" style="font-size:11px">${
              mom ? `1M ${pct(mom.avgReturn1m)} · 3M ${pct(mom.avgReturn3m)} · RS ${num(mom.avgRelativeStrength, 1)} · ` : ''
            }${volLine}</div></div>
          <span class="badge" style="background:color-mix(in srgb,${color} 16%,transparent);color:${color}">${
            mom ? num(mom.avgRelativeStrength, 1) + ' RS' : (r ? pct(r.volumeChangePct) : '—')
          }</span>
          <span class="muted caret">▾</span>
        </div>
        <div class="sector-detail hidden" data-detail="${sector}">
          <div class="row" style="margin-bottom:8px">
            <div class="row" data-freq-group>
              <button class="range-btn active" data-freq="weekly">Weekly</button>
              <button class="range-btn" data-freq="monthly">Monthly</button>
            </div>
            <button class="btn-outline" style="margin-left:auto" data-screen="${sector}">${t('sectors.screenstocks')}</button>
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
      const points = sectorVolumeSeries(sectorMapFor(sectorMarket)[sector] ?? [], freq);
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
      screenSector(ctx, sector);
    });
  }
}

/** Banner above the sector list: hot vs cold sectors from the momentum report. */
function renderSectorRotationBanner(report: SectorMomentumReport): void {
  const out = $('#sector-results')!;
  if (!report.hotSectors.length && !report.coldSectors.length) return;
  const banner = el(
    `<div class="muted" style="font-size:12px;margin-bottom:10px">` +
      (report.hotSectors.length ? `🔥 ${t('sectors.hot')}: <strong>${report.hotSectors.join(', ')}</strong>` : '') +
      (report.coldSectors.length ? ` &nbsp;·&nbsp; 🧊 ${t('sectors.cold')}: ${report.coldSectors.join(', ')}` : '') +
      `</div>`,
  );
  out.appendChild(banner);
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
