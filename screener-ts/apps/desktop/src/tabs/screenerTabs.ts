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
  detectVolumeSurge,
  filterByMomentum,
  generateWatchlists,
  type Period,
  type QmRow,
  type QmScanResult,
  type QmSetupType,
  type MomentumRow,
  type MomentumResult,
  type MomentumClassification,
  type MarketRegime,
  type SectorMomentumReport,
  type SectorMomentum,
  type OHLCV,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el, num, pct, fmtBig, flagSvg } from '../ui/dom.js';
import { qmTable, type QmSortKey } from '../ui/qmTable.js';
import { momentumTable, type MomentumSortKey } from '../ui/momentumTable.js';
import { screenerTable, type ScreenerRow, type ScreenerSortKey } from '../ui/screenerTable.js';
import { toCsv, toHtmlTable, type ReportColumn } from '@screener/core';
import { downloadCsv, downloadHtml } from '../ui/exportFile.js';
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
import { loadScan, saveScan, scannedAtLabel } from './scanCache.js';
import { getLang } from '../ui/i18n.js';
import {
  asOfControlsHtml,
  wireAsOfControls,
  getAsOf,
  isHistorical,
  fetchPeriodFor,
  sliceMap,
  sliceSeries,
  cacheSuffix,
  asOfLabel,
  type AsOfScope,
} from '../ui/asOf.js';
import {
  loadSectorLabels,
  saveSectorLabels,
  getCachedSectorLabel,
  isCacheLoaded,
} from '../adapters/sectorLabelCache.js';

const PERIOD: Period = '1y';
const CURATED = [...new Set(Object.values(SECTOR_STOCKS).flat())]; // ~543 symbols
/** VN symbols that are in the static sector maps (already labelled). */
const VN_CURATED = new Set(Object.values(VN_SECTOR_STOCKS).flat());
/** US symbols that are in the static sector map. */
const US_CURATED = new Set(CURATED);

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
 * exploration scan of strongest movers), Surge (held above EMA5 all week +
 * a >20% two-week move), and Volume (abnormal volume vs own baseline). */
type PicksStrategy = 'qm' | 'momentumscan' | 'surge' | 'volume';

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

/** Look up sector for a symbol: static map first, then persistent enrichment cache. */
function sectorForSymbol(symbol: string): string | null {
  return SECTOR_BY_SYMBOL[symbol] ?? getCachedSectorLabel(symbol)?.sector ?? null;
}

/**
 * Fire-and-forget: fetch sector/industry for any symbols missing from the static
 * maps, save them to the persistent cache. Max 4 concurrent requests so this
 * never throttles the provider during an active scan.
 */
async function enrichUnknownSymbols(ctx: AppContext, symbols: readonly string[]): Promise<void> {
  if (!isCacheLoaded()) await loadSectorLabels(ctx.storage);
  const unknown = symbols.filter((s) => !US_CURATED.has(s) && !VN_CURATED.has(s) && !getCachedSectorLabel(s));
  if (!unknown.length) return;
  const results: Record<string, { sector: string | null; industry: string | null }> = {};
  const queue = [...unknown];
  const worker = async (): Promise<void> => {
    for (;;) {
      const sym = queue.shift();
      if (!sym) return;
      const label = await ctx.data.getSectorLabel(sym).catch(() => ({ sector: null, industry: null }));
      if (label.sector || label.industry) results[sym] = label;
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, unknown.length) }, worker));
  if (Object.keys(results).length) await saveSectorLabels(ctx.storage, results);
}

/** Momentum pre-filter toggle (F4). Default OFF — the QM/VCP scan runs on the
 * full universe; tick it to narrow to top-momentum names first. */
let momentumPrefilter = false;

const MIN_PRICE_OPTS_US = [0, 1, 5, 10, 20, 50] as const;
const MIN_PRICE_OPTS_VN = [0, 5_000, 10_000, 20_000, 50_000, 100_000] as const;
type MinPriceOpt = 0 | 1 | 5 | 10 | 20 | 50 | 5000 | 10000 | 20000 | 50000 | 100000;
let minPicksPrice: MinPriceOpt = 0;

function minPriceOpts(): readonly number[] {
  return picksMarket === 'vn' ? MIN_PRICE_OPTS_VN : MIN_PRICE_OPTS_US;
}
function minPriceLabel(v: number): string {
  if (v === 0) return t('opt.any');
  if (picksMarket === 'vn') return v >= 1000 ? `${v / 1000}K` : String(v);
  return `$${v}`;
}

const MIN_AVG_VOL_OPTS = [0, 10_000, 50_000, 100_000, 200_000, 500_000, 1_000_000] as const;
type MinAvgVolOpt = (typeof MIN_AVG_VOL_OPTS)[number];
let minAvgVol: MinAvgVolOpt = 0;

/** Recent-window length (trading days) for the Volume strategy. */
type VolumePeriod = '1w' | '1m' | '3m';
const VOLUME_PERIOD_DAYS: Record<VolumePeriod, number> = { '1w': 5, '1m': 21, '3m': 63 };
let volumePeriod: VolumePeriod = '1w';

let picksStrategy: PicksStrategy = 'qm';
let picksMarket: Market = 'us';
let picksUniverse: UniverseMode = 'curated';
let qmSort: { key: QmSortKey; desc: boolean } = { key: 'qualityScore', desc: true };
let momentumSort: { key: MomentumSortKey; desc: boolean } = { key: 'momentumScore', desc: true };
let screenSort: { key: ScreenerSortKey; desc: boolean } = { key: 'qualityScore', desc: true };

// Cancellation token for an in-flight scan; bumping it aborts the running scan.
let scanToken = 0;

/** Cache id for the current picks selection (strategy + market + universe). The
 * day is appended by the scanCache layer; an as-of suffix keeps a historical
 * scan in its own slot so it never collides with the live one. */
function picksCacheId(): string {
  const pf = momentumPrefilter ? ':pf' : '';
  const mp = minPicksPrice > 0 ? `:p${minPicksPrice}` : '';
  const vp = picksStrategy === 'volume' ? `:${volumePeriod}` : '';
  const mv = picksStrategy === 'volume' && minAvgVol > 0 ? `:v${minAvgVol}` : '';
  return `${picksStrategy}:${picksMarket}:${picksUniverse}${pf}${mp}${vp}${mv}${cacheSuffix('picks')}`;
}

/** Render the "Scanned at HH:MM today · Refresh" banner into a status element.
 * `onRefresh` re-runs the live scan. `runLabel` is the verb on the button. */
function renderScanBannerInto(
  selector: string,
  at: number,
  scanned: number,
  onRefresh: () => void,
  runLabel: string = t('picks.run'),
): void {
  const status = $(selector)!;
  const lang = getLang();
  status.innerHTML = `<span class="scan-cached">${scannedAtLabel(at, lang)} · ${scanned} ${t(
    'picks.scanned',
  )}</span> <button class="link-btn scan-rescan">${runLabel}</button>`;
  status.querySelector('.scan-rescan')!.addEventListener('click', onRefresh);
}

/** Top Picks banner (writes to #picks-status). */
function renderScanBanner(at: number, scanned: number, onRefresh: () => void): void {
  renderScanBannerInto('#picks-status', at, scanned, onRefresh);
}

export function renderPicks(ctx: AppContext): void {
  // Load the persistent sector-label cache so cached scan results get sector
  // annotations immediately, without waiting for a re-scan.
  if (!isCacheLoaded()) void loadSectorLabels(ctx.storage);
  const root = $('#tab-picks')!;
  const markets: [Market, string][] = [
    ['us', `${flagSvg('us')} ${t('picks.market.us')}`],
    ['vn', `${flagSvg('vn')} ${t('picks.market.vn')}`],
  ];
  root.innerHTML = `
    <h1>${t('picks.title')}</h1>
    <p class="subtitle">${t('picks.sub')}</p>

    <div class="picks-config card">
      <div class="picks-config-row">
        <span class="picks-config-label">${t('picks.strategy') ?? 'Strategy'}</span>
        <div class="picks-pill-group">
          ${(['qm', 'momentumscan', 'surge', 'volume'] as PicksStrategy[])
            .map((s) => `<button class="range-btn ${s === picksStrategy ? 'active' : ''}" data-strategy="${s}">${t('picks.' + s)}</button>`)
            .join('')}
        </div>
      </div>
      <div class="picks-config-row">
        <span class="picks-config-label">${t('picks.market')}</span>
        <div class="picks-pill-group">
          ${markets.map(([m, label]) => `<button class="range-btn ${m === picksMarket ? 'active' : ''}" data-market="${m}">${label}</button>`).join('')}
        </div>
      </div>
      <div class="picks-config-row">
        <span class="picks-config-label">${t('picks.universe') ?? 'Universe'}</span>
        <div class="picks-pill-group" id="picks-uni-row"></div>
      </div>
      <div class="picks-config-row">
        <span class="picks-config-label">${t('picks.minprice')}</span>
        <div class="picks-pill-group" id="picks-minprice-row"></div>
      </div>
      <div class="picks-config-row">
        <span class="picks-config-label">${t('picks.filter')}</span>
        <div class="picks-pill-group">
          <label class="picks-prefilter-label">
            <input type="checkbox" id="picks-prefilter" ${momentumPrefilter ? 'checked' : ''} />
            ${t('picks.prefilter')}
          </label>
        </div>
      </div>
      <div class="picks-config-row${picksStrategy === 'volume' ? '' : ' hidden'}" id="picks-vol-period-row">
        <span class="picks-config-label">${t('picks.vol.period')}</span>
        <div class="picks-pill-group">
          ${(['1w', '1m', '3m'] as VolumePeriod[])
            .map((p) => `<button class="range-btn ${p === volumePeriod ? 'active' : ''}" data-volperiod="${p}">${t('picks.vol.period.' + p)}</button>`)
            .join('')}
        </div>
      </div>
      <div class="picks-config-row${picksStrategy === 'volume' ? '' : ' hidden'}" id="picks-vol-minavgvol-row">
        <span class="picks-config-label">${t('picks.vol.minavgvol')}</span>
        <div class="picks-pill-group">
          ${(MIN_AVG_VOL_OPTS as readonly MinAvgVolOpt[]).map((v) =>
            `<button class="range-btn ${v === minAvgVol ? 'active' : ''}" data-minavgvol="${v}">${
              v === 0 ? t('opt.any') : v >= 1_000_000 ? '1M' : `${v / 1000}K`
            }</button>`
          ).join('')}
        </div>
      </div>
      <div class="picks-config-row">
        <span class="picks-config-label">${t('picks.asof')}</span>
        <div class="picks-pill-group">
          ${asOfControlsHtml('picks')}
        </div>
      </div>
      <div class="picks-config-actions">
        <button id="picks-refresh" class="btn">${t('picks.run')}</button>
        <button id="picks-stop" class="btn-outline hidden">${t('picks.stop')}</button>
      </div>
    </div>
    <div id="picks-regime" class="muted picks-regime-bar"></div>

    <div id="picks-progress" class="picks-progress hidden"><div id="picks-bar"></div></div>
    <div id="picks-status" class="muted" style="margin:8px 0 12px"></div>
    <div id="picks-results"></div>`;

  root.querySelectorAll<HTMLElement>('[data-strategy]').forEach((b) =>
    b.addEventListener('click', () => {
      picksStrategy = b.dataset.strategy as PicksStrategy;
      root.querySelectorAll('[data-strategy]').forEach((x) => x.classList.toggle('active', x === b));
      const isVol = picksStrategy === 'volume';
      $('#picks-vol-period-row')!.classList.toggle('hidden', !isVol);
      $('#picks-vol-minavgvol-row')!.classList.toggle('hidden', !isVol);
      void showPicks(ctx);
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
      renderMinPriceRow(ctx);
      void showPicks(ctx);
    }),
  );
  renderUniverseRow(ctx);
  renderMinPriceRow(ctx);
  $('#picks-refresh')!.addEventListener('click', () => void runPicks(ctx));
  $('#picks-stop')!.addEventListener('click', () => {
    scanToken++; // abort the running scan loop
  });
  $('#picks-prefilter')!.addEventListener('change', (e) => {
    momentumPrefilter = (e.target as HTMLInputElement).checked;
    void showPicks(ctx);
  });
  root.querySelectorAll<HTMLElement>('[data-minavgvol]').forEach((b) =>
    b.addEventListener('click', () => {
      minAvgVol = parseInt(b.dataset.minavgvol!, 10) as MinAvgVolOpt;
      root.querySelectorAll('[data-minavgvol]').forEach((x) => x.classList.toggle('active', x === b));
      void showPicks(ctx);
    }),
  );
  root.querySelectorAll<HTMLElement>('[data-volperiod]').forEach((b) =>
    b.addEventListener('click', () => {
      volumePeriod = b.dataset.volperiod as VolumePeriod;
      root.querySelectorAll('[data-volperiod]').forEach((x) => x.classList.toggle('active', x === b));
      void showPicks(ctx);
    }),
  );
  wireAsOfControls('picks', root, () => {
    applyHistoricalFlag('picks', root);
    void showPicks(ctx);
  });
  applyHistoricalFlag('picks', root);

  // Show today's cached results if we already scanned this selection; otherwise
  // a prompt. We deliberately do NOT auto-run a live scan (it can be thousands
  // of requests) — the user runs it once via Run, and it sticks all day.
  void showPicks(ctx);
}

/**
 * Render today's cached results for the current selection if present (instant,
 * zero requests), else a "press Run" prompt. Never triggers a live fetch.
 */
async function showPicks(ctx: AppContext): Promise<void> {
  const out = $('#picks-results')!;
  const status = $('#picks-status')!;
  renderRegimeBanner(null, null);
  const asOf = getAsOf('picks').date;

  if (picksStrategy === 'qm') {
    const cached = await loadScan<QmRow>(ctx, picksCacheId());
    if (cached) {
      renderScanBanner(cached.at, cached.scanned, () => void runPicks(ctx));
      out.replaceChildren(
        qmTable(cached.rows, {
          sortKey: qmSort.key,
          sortDesc: qmSort.desc,
          onRowClick: (sym) => void openStock(ctx, sym, asOf),
          onSortChange: (key, desc) => {
            qmSort = { key, desc };
          },
        }),
      );
      return;
    }
  } else if (picksStrategy === 'volume') {
    const cached = await loadScan<VolumeRow>(ctx, picksCacheId());
    if (cached) {
      renderScanBanner(cached.at, cached.scanned, () => void runPicks(ctx));
      out.replaceChildren(
        volumeTable(cached.rows, {
          sortKey: volumeSort.key,
          sortDesc: volumeSort.desc,
          onRowClick: (sym) => void openStock(ctx, sym, asOf),
          onSortChange: (key, desc) => { volumeSort = { key, desc }; },
        }),
      );
      return;
    }
  } else {
    const cached = await loadScan<MomentumRow>(ctx, picksCacheId());
    if (cached) {
      renderScanBanner(cached.at, cached.scanned, () => void runPicks(ctx));
      out.replaceChildren(
        momentumTable(cached.rows, {
          sortKey: momentumSort.key,
          sortDesc: momentumSort.desc,
          onRowClick: (sym) => void openStock(ctx, sym, asOf),
          onSortChange: (key, desc) => {
            momentumSort = { key, desc };
          },
        }),
      );
      return;
    }
  }

  // No cache for today → prompt to run.
  out.innerHTML = '';
  const lang = getLang();
  status.innerHTML = `<span class="muted">${
    lang === 'vi'
      ? 'Chưa quét hôm nay. Bấm “' + t('picks.run') + '” để chạy một lần — kết quả giữ cả ngày.'
      : 'Not scanned today. Press “' + t('picks.run') + '” to run once — results stay all day.'
  }</span>`;
}

/** (Re)build the universe toggle row for the active market and wire its clicks. */
function renderUniverseRow(ctx: AppContext): void {
  const row = $('#picks-uni-row')!;
  const opts = UNIVERSES_BY_MARKET[picksMarket];
  row.innerHTML =
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
      void showPicks(ctx);
    }),
  );
}

function renderMinPriceRow(ctx: AppContext): void {
  const row = $('#picks-minprice-row')!;
  // Reset selection when current value doesn't exist in the new market's presets.
  if (!minPriceOpts().includes(minPicksPrice)) minPicksPrice = 0;
  row.innerHTML = minPriceOpts()
    .map((v) => `<button class="range-btn ${v === minPicksPrice ? 'active' : ''}" data-minprice="${v}">${minPriceLabel(v)}</button>`)
    .join('');
  row.querySelectorAll<HTMLElement>('[data-minprice]').forEach((b) =>
    b.addEventListener('click', () => {
      minPicksPrice = parseInt(b.dataset.minprice!, 10) as MinPriceOpt;
      row.querySelectorAll('[data-minprice]').forEach((x) => x.classList.toggle('active', x === b));
      void showPicks(ctx);
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
  period: Period = PERIOD,
  asOf: string | null = null,
): Promise<Map<string, OHLCV> | null> {
  const status = $('#picks-status')!;
  const bar = $('#picks-bar')!;
  const BATCH = BIG_UNIVERSES.has(picksUniverse) ? 120 : 60;
  const CONCURRENCY = 6;
  const map = new Map<string, OHLCV>();

  for (let i = 0; i < symbols.length; i += BATCH) {
    if (myToken !== scanToken) return null;
    const batch = symbols.slice(i, i + BATCH);
    const data = await fetchMany(ctx.data, batch, period, CONCURRENCY);
    if (myToken !== scanToken) return null;
    for (const [sym, series] of data) map.set(sym, sliceSeries(series, asOf));
    const doneCount = Math.min(i + BATCH, symbols.length);
    bar.style.width = `${Math.round((doneCount / symbols.length) * 100)}%`;
    status.innerHTML = `<span class="spinner"></span> ${t('msg.scanning')} ${doneCount}/${symbols.length}`;
    await new Promise((r) => setTimeout(r, 0));
  }
  return map;
}

/** Fetch the index benchmarks (SPY/QQQ) for regime + relative strength. US-only;
 * returns nulls for VN where these indices don't resolve. `period` lets the
 * caller request a longer history for as-of slicing; `market` overrides the
 * US-gate (defaults to the Top Picks market for backward compatibility). */
async function fetchBenchmarks(
  ctx: AppContext,
  period: Period = PERIOD,
  market: Market = picksMarket,
): Promise<{ spy: OHLCV | null; qqq: OHLCV | null }> {
  if (market !== 'us') return { spy: null, qqq: null };
  try {
    const data = await fetchMany(ctx.data, BENCHMARKS, period, BENCHMARKS.length);
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
 * Top Picks dispatcher: routes to the Qullamaggie scan, the Momentum/Surge
 * scan, or the Volume surge scan.
 */
async function runPicks(ctx: AppContext): Promise<void> {
  if (picksStrategy === 'momentumscan' || picksStrategy === 'surge') {
    await runMomentumPicks(ctx, picksStrategy === 'surge');
    return;
  }
  if (picksStrategy === 'volume') {
    await runVolumePicks(ctx);
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
  // As-of: fetch a longer range and slice each series to the chosen date.
  const asOf = getAsOf('picks').date;
  const fetchPeriod = fetchPeriodFor('picks', PERIOD);

  // ── F4: optional momentum pre-filter (US only; needs SPY/QQQ + full ranking). ──
  // When ON we fetch the whole universe once, rank momentum, narrow to the top
  // slice (optionally intersected with hot sectors), annotate the regime banner,
  // and scan ONLY the survivors from the already-fetched data. The VCP/QM
  // detection itself is unchanged — it just receives a smaller universe.
  let prefetched: Map<string, OHLCV> | null = null;
  if (momentumPrefilter && picksMarket === 'us') {
    status.innerHTML = `<span class="spinner"></span> ${t('msg.scanning')} (momentum pre-filter)…`;
    const { spy: spyRaw, qqq: qqqRaw } = await fetchBenchmarks(ctx, fetchPeriod);
    const spy = spyRaw ? sliceSeries(spyRaw, asOf) : null;
    const qqq = qqqRaw ? sliceSeries(qqqRaw, asOf) : null;
    if (myToken !== scanToken) return;
    const fullMap = await fetchUniverseToMap(ctx, symbols, myToken, fetchPeriod, asOf);
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
  const allScans: QmScanResult[] = [];
  let scanned = 0;
  let fetched = 0;

  const renderTable = (): void => {
    matches.sort((a, b) => b.qualityScore - a.qualityScore);
    const top = matches.slice(0, 50);
    out.replaceChildren(
      qmTable(top, {
        sortKey: qmSort.key,
        sortDesc: qmSort.desc,
        onRowClick: (sym) => void openStock(ctx, sym, asOf),
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
    // Reuse pre-filter data when present (already fetched); else fetch the batch
    // (longer range in as-of mode, sliced to the chosen date).
    let data: Map<string, OHLCV>;
    if (prefetched) {
      data = new Map();
      for (const sym of batch) {
        const s = prefetched.get(sym);
        if (s) data.set(sym, s);
      }
    } else {
      data = sliceMap(await fetchMany(ctx.data, batch, fetchPeriod, CONCURRENCY), asOf);
    }
    if (myToken !== scanToken) continue;

    fetched += data.size;
    for (const series of data.values() as IterableIterator<OHLCV>) {
      if (!series.bars || series.bars.length < 60) continue;
      if (minPicksPrice > 0 && series.bars[series.bars.length - 1]!.close < minPicksPrice) continue;
      scanned += 1;
      const r = scanQm(series.symbol, series.bars, DEFAULT_QM_CONFIG);
      allScans.push(r);
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
    // Append generated watchlist summary below the results table.
    const sectorReport = computeSectorMomentum(prefetched ?? new Map(), undefined);
    const wl = generateWatchlists(allScans, [], sectorReport);
    renderGeneratedWatchlists(ctx, out, wl);
  }
  // Persist today's results (top 50, as displayed) so the scan sticks all day
  // and syncs across devices. Stored even when empty, so an empty day isn't
  // re-run on every open.
  matches.sort((a, b) => b.qualityScore - a.qualityScore);
  void saveScan<QmRow>(ctx, picksCacheId(), matches.slice(0, 50), scanned);
  void enrichUnknownSymbols(ctx, matches.map((r) => r.symbol));
  finish();
}

/**
 * Render a collapsible "Generated Watchlists" panel below the picks table.
 * Each category is a pill-row of symbol chips; clicking any chip opens the
 * stock detail modal. Collapsed by default so it doesn't clutter the scan view.
 */
function renderGeneratedWatchlists(ctx: AppContext, container: HTMLElement, wl: import('@screener/core').GeneratedWatchlists): void {
  const cats: { label: string; syms: string[] }[] = [
    { label: '🏆 Top VCP', syms: wl.topVcp },
    { label: '⚡ Episodic Pivots', syms: wl.topEp },
    { label: '🚀 Breakout Candidates', syms: wl.topBreakouts },
    { label: '🔷 Tight Bases', syms: wl.topTightBases },
    { label: '📊 Top RS', syms: wl.topRelativeStrength },
  ];
  const filled = cats.filter((c) => c.syms.length > 0);
  if (!filled.length) return;

  const wrap = el(`
    <details style="margin-top:16px">
      <summary style="cursor:pointer;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--faint);padding:8px 0;user-select:none">
        📋 Generated Watchlists (${filled.length} categories)
      </summary>
      <div class="wl-gen-body" style="margin-top:10px"></div>
    </details>`);

  const body = wrap.querySelector('.wl-gen-body')!;
  for (const cat of filled) {
    const section = el(`<div style="margin-bottom:12px"></div>`);
    section.appendChild(el(`<div class="section-title" style="margin:0 0 6px">${cat.label}</div>`));
    const chips = el(`<div class="row" style="flex-wrap:wrap;gap:6px"></div>`);
    for (const sym of cat.syms) {
      const chip = el(`<button class="range-btn" style="font-size:12px">${sym}</button>`);
      chip.addEventListener('click', () => void openStock(ctx, sym));
      chips.appendChild(chip);
    }
    section.appendChild(chips);
    body.appendChild(section);
  }
  container.appendChild(wrap);
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

  // As-of: longer fetch range, sliced to the chosen date (null = live).
  const asOf = getAsOf('picks').date;
  const fetchPeriod = fetchPeriodFor('picks', PERIOD);

  // Need the full set for relative ranking + regime/sector context.
  const { spy: spyRaw, qqq: qqqRaw } = await fetchBenchmarks(ctx, fetchPeriod);
  const spy = spyRaw ? sliceSeries(spyRaw, asOf) : null;
  const qqq = qqqRaw ? sliceSeries(qqqRaw, asOf) : null;
  if (myToken !== scanToken) return;
  const fullMap = await fetchUniverseToMap(ctx, symbols, myToken, fetchPeriod, asOf);
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
  if (minPicksPrice > 0) {
    ranked = ranked.filter((r) => {
      const bars = fullMap.get(r.symbol)?.bars;
      return bars ? bars[bars.length - 1]!.close >= minPicksPrice : false;
    });
  }
  const rows: MomentumRow[] = ranked.map((r) => {
    const sector = sectorForSymbol(r.symbol);
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
        onRowClick: (sym) => void openStock(ctx, sym, asOf),
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
  // Persist today's ranked movers (top 50, as displayed) so the scan sticks all
  // day and syncs across devices.
  void saveScan<MomentumRow>(ctx, picksCacheId(), rows.slice(0, 50), fullMap.size);
  void enrichUnknownSymbols(ctx, rows.map((r) => r.symbol));
  finish();
}

// ── Volume Surge scan ──────────────────────────────────────────────────────────

interface VolumeRow {
  symbol: string;
  sector: string | null;
  price: number;
  ratio: number;
  peakVolume: number;
  recentAvgVolume: number;
  baselineAvgVolume: number;
  sectorVolChangePct: number | null;
}

type VolumeSortKey = 'symbol' | 'ratio' | 'peakVolume' | 'sectorVolChangePct';
let volumeSort: { key: VolumeSortKey; desc: boolean } = { key: 'ratio', desc: true };

function volumeTable(
  rows: VolumeRow[],
  opts: {
    sortKey?: VolumeSortKey;
    sortDesc?: boolean;
    onRowClick?: (sym: string) => void;
    onSortChange?: (key: VolumeSortKey, desc: boolean) => void;
  } = {},
): HTMLElement {
  const COLS: { key: VolumeSortKey; label: string; defaultDesc: boolean }[] = [
    { key: 'symbol', label: 'Symbol', defaultDesc: false },
    { key: 'ratio', label: t('picks.vol.ratio'), defaultDesc: true },
    { key: 'peakVolume', label: t('picks.vol.peak'), defaultDesc: true },
    { key: 'sectorVolChangePct', label: t('picks.vol.sector'), defaultDesc: true },
  ];

  let sortKey = opts.sortKey ?? 'ratio';
  let sortDesc = opts.sortDesc ?? true;

  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.style.overflowX = 'auto';

  const render = (): void => {
    const sortedRows = [...rows].sort((a, b) => {
      const av = sortKey === 'symbol' ? a[sortKey] : (a[sortKey] ?? -Infinity);
      const bv = sortKey === 'symbol' ? b[sortKey] : (b[sortKey] ?? -Infinity);
      let c: number;
      if (typeof av === 'string') c = av.localeCompare(String(bv));
      else c = (av as number) - (bv as number);
      return sortDesc ? -c : c;
    });

    const arrow = (k: VolumeSortKey): string => (k === sortKey ? (sortDesc ? ' ▾' : ' ▴') : '');
    const headLabels = ['Symbol', t('picks.vol.ratio'), t('picks.vol.peak'), t('picks.vol.baseline'), t('picks.vol.sector'), 'Sector'];
    const headKeys: (VolumeSortKey | null)[] = ['symbol', 'ratio', 'peakVolume', null, 'sectorVolChangePct', null];
    const headHtml = headKeys.map((k, i) =>
      k != null
        ? `<th class="sortable ${k === sortKey ? 'sorted' : ''}" data-vsort="${k}">${headLabels[i]}${arrow(k)}</th>`
        : `<th>${headLabels[i]}</th>`,
    ).join('');

    const bodyHtml = sortedRows.map((r) => {
      const sectorStr = r.sectorVolChangePct != null
        ? `${r.sectorVolChangePct >= 0 ? '+' : ''}${r.sectorVolChangePct.toFixed(1)}%`
        : '—';
      const ratioColor = r.ratio >= 3 ? 'var(--accent)' : r.ratio >= 2 ? 'var(--warn)' : 'inherit';
      return `<tr data-vsym="${r.symbol}" style="cursor:pointer">
        <td><strong>${r.symbol}</strong></td>
        <td style="color:${ratioColor};font-weight:700">${r.ratio.toFixed(2)}×</td>
        <td>${fmtBig(r.peakVolume)}</td>
        <td class="muted">${fmtBig(r.baselineAvgVolume)}</td>
        <td>${r.sectorVolChangePct != null ? `<span style="color:${r.sectorVolChangePct >= 0 ? 'var(--accent)' : 'var(--danger)'}">${sectorStr}</span>` : '—'}</td>
        <td class="muted" style="font-size:11px">${r.sector ?? '—'}</td>
      </tr>`;
    }).join('');

    const emptyRow = sortedRows.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--subtext)">No volume surges found.</td></tr>`
      : '';

    wrap.innerHTML = `<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}${emptyRow}</tbody></table>`;

    wrap.querySelectorAll<HTMLElement>('th.sortable').forEach((th) =>
      th.addEventListener('click', () => {
        const k = th.dataset.vsort as VolumeSortKey;
        if (k === sortKey) sortDesc = !sortDesc;
        else { sortKey = k; sortDesc = COLS.find((c) => c.key === k)?.defaultDesc ?? true; }
        opts.onSortChange?.(sortKey, sortDesc);
        render();
      }),
    );
    if (opts.onRowClick) {
      wrap.querySelectorAll<HTMLElement>('[data-vsym]').forEach((tr) =>
        tr.addEventListener('click', () => opts.onRowClick!(tr.dataset.vsym!)),
      );
    }
  };

  render();
  return wrap;
}

/**
 * Volume Surge scan: fetches the full universe, runs `detectVolumeSurge` per
 * symbol to find stocks trading ≥2× their 10-week baseline volume, and ranks
 * them by ratio descending. Each row is annotated with its sector's 3m-vs-6m
 * volume change so the user can see whether the surge is stock-specific or
 * part of a sector rotation.
 */
async function runVolumePicks(ctx: AppContext): Promise<void> {
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

  const asOf = getAsOf('picks').date;
  const fetchPeriod = fetchPeriodFor('picks', PERIOD);

  const fullMap = await fetchUniverseToMap(ctx, symbols, myToken, fetchPeriod, asOf);
  if (fullMap === null) {
    status.textContent = `${t('picks.stopped')}.`;
    finish();
    return;
  }

  // Sector volume change map (3m vs 6m) for industry comparison context.
  const sectorMap = picksMarket === 'vn' ? VN_SECTOR_STOCKS : SECTOR_STOCKS;
  const sectorRanks = computeSectorVolumeRank(fullMap, sectorMap);
  const sectorVolByName = new Map(sectorRanks.map((r) => [r.sector, r.volumeChangePct]));

  const recentDays = VOLUME_PERIOD_DAYS[volumePeriod];
  const baselineDays = recentDays * 3; // baseline = 3× the recent window
  const volCfg = { recentDays, baselineDays, minRatio: 2.0 };
  const minBars = recentDays + baselineDays;

  const rows: VolumeRow[] = [];
  let filteredByBars = 0, filteredByPrice = 0, filteredByRatio = 0, filteredByPeakVol = 0;
  for (const [sym, ohlcv] of fullMap) {
    if (!ohlcv.bars || ohlcv.bars.length < minBars) { filteredByBars++; continue; }
    if (minPicksPrice > 0 && ohlcv.bars[ohlcv.bars.length - 1]!.close < minPicksPrice) { filteredByPrice++; continue; }
    const vs = detectVolumeSurge(ohlcv.bars, volCfg);
    if (!vs.isVolumeSurge) { filteredByRatio++; continue; }
    // Min peak vol filter: the spike itself must meet the liquidity threshold.
    if (minAvgVol > 0 && vs.peakVolume < minAvgVol) { filteredByPeakVol++; continue; }
    const sector = sectorForSymbol(sym);
    rows.push({
      symbol: sym,
      sector,
      price: ohlcv.bars[ohlcv.bars.length - 1]!.close,
      ratio: vs.ratio,
      peakVolume: vs.peakVolume,
      recentAvgVolume: vs.recentAvgVolume,
      baselineAvgVolume: vs.baselineAvgVolume,
      sectorVolChangePct: sector ? (sectorVolByName.get(sector) ?? null) : null,
    });
  }

  rows.sort((a, b) => b.ratio - a.ratio);

  if (myToken !== scanToken) { finish(); return; }

  const label = t('picks.volume');
  const filterParts: string[] = [];
  if (filteredByBars > 0) filterParts.push(`${filteredByBars} no history`);
  if (filteredByPrice > 0) filterParts.push(`${filteredByPrice} price<${minPicksPrice}`);
  if (filteredByRatio > 0) filterParts.push(`${filteredByRatio} no spike`);
  if (filteredByPeakVol > 0) filterParts.push(`${filteredByPeakVol} peak<${fmtBig(minAvgVol)}`);
  const filterNote = filterParts.length ? ` · filtered: ${filterParts.join(', ')}` : '';
  status.textContent =
    `${t('picks.done')}: ${rows.length} ${label} ${t('picks.matches')} (${t('picks.scanned')} ${fullMap.size}${filterNote}).`;

  const renderTable = (): void => {
    out.replaceChildren(
      volumeTable(rows.slice(0, 50), {
        sortKey: volumeSort.key,
        sortDesc: volumeSort.desc,
        onRowClick: (sym) => void openStock(ctx, sym, asOf),
        onSortChange: (key, desc) => { volumeSort = { key, desc }; },
      }),
    );
  };

  if (!rows.length) {
    out.innerHTML = `<div class="card muted" style="text-align:center;padding:30px">No ${label} surges found in universe.</div>`;
  } else {
    renderTable();
  }

  void saveScan<VolumeRow>(ctx, picksCacheId(), rows.slice(0, 50), fullMap.size);
  void enrichUnknownSymbols(ctx, rows.map((r) => r.symbol));
  finish();
}

// ── Screener ────────────────────────────────────────────────────────────────────
const selectedSectors = new Set<string>();
let screenerMarket: Market = 'us';

const screenerSectorMap = (): Record<string, string[]> =>
  screenerMarket === 'vn' ? VN_SECTOR_STOCKS : SECTOR_STOCKS;

/** Cache id for the current screener inputs (market + sectors + symbols + filters + asof). */
function screenerCacheId(): string {
  const syms = (($('#sym-input') as HTMLInputElement | null)?.value ?? '')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).sort().join(',');
  const sects = [...selectedSectors].sort().join(',');
  const setup = ($('#setup-filter') as HTMLSelectElement | null)?.value ?? '';
  const minQ   = ($('#min-quality') as HTMLInputElement | null)?.value.trim() ?? '';
  const mom   = ($('#momentum-filter') as HTMLSelectElement | null)?.value ?? '';
  const parts = [screenerMarket, sects || '_', syms || '_', setup || '_', minQ || '_', mom || '_'];
  return `screener:${parts.join(':')}${cacheSuffix('screener')}`;
}

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
  if (!isCacheLoaded()) void loadSectorLabels(ctx.storage);
  const root = $('#tab-screener')!;
  const markets: [Market, string][] = [
    ['us', `${flagSvg('us')} ${t('picks.market.us')}`],
    ['vn', `${flagSvg('vn')} ${t('picks.market.vn')}`],
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
      ${asOfControlsHtml('screener')}
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
  wireAsOfControls('screener', root, () => applyHistoricalFlag('screener', root));
  applyHistoricalFlag('screener', root);
  $('#run-screen')!.addEventListener('click', () => void runScreen(ctx));
  void showScreen(ctx);
}

/** Toggle the .historical-mode class on a tab root so its results edge tints
 * (and any other historical-only styling applies). */
function applyHistoricalFlag(scope: AsOfScope, root: HTMLElement): void {
  root.classList.toggle('historical-mode', isHistorical(scope));
}

/** Render cached screener results if available, else show prompt. */
async function showScreen(ctx: AppContext): Promise<void> {
  const cached = await loadScan<ScreenerRow>(ctx, screenerCacheId());
  if (!cached) return; // no cache — leave the empty state, user presses Run
  const asOf = getAsOf('screener').date;
  renderScanBannerInto('#screen-status', cached.at, cached.scanned, () => void runScreen(ctx), t('screener.run'));
  const out = $('#screen-results')!;
  out.innerHTML = '';
  if (cached.rows.length) out.appendChild(exportBar(cached.rows, 'screener'));
  out.appendChild(
    screenerTable(cached.rows, {
      sortKey: screenSort.key,
      sortDesc: screenSort.desc,
      onRowClick: (sym) => void openStock(ctx, sym, asOf),
      onSortChange: (key, desc) => { screenSort = { key, desc }; },
    }),
  );
}

/** Programmatic entry used by the Sectors tab "Screen stocks" button.
 * Checks cache first — only runs a live scan if no results exist for today. */
export function screenSector(ctx: AppContext, sector: string): void {
  // Keep the Screener's market aligned with the Sectors tab so the sector exists.
  screenerMarket = sectorMarket;
  renderScreener(ctx);
  selectedSectors.clear();
  selectedSectors.add(sector);
  $('#tab-screener')!
    .querySelectorAll<HTMLElement>('[data-sector]')
    .forEach((b) => b.classList.toggle('active', b.dataset.sector === sector));
  // Show cached results if available; only run live if none found.
  void loadScan<ScreenerRow>(ctx, screenerCacheId()).then((cached) => {
    if (cached) {
      void showScreen(ctx);
    } else {
      void runScreen(ctx);
    }
  });
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
  const asOf = getAsOf('screener').date;
  status.innerHTML = `<span class="spinner"></span> ${t('msg.scanning')} ${universe.length}…${
    asOf ? ` (${asOfLabel('screener')})` : ''
  }`;
  out.innerHTML = '';
  // Historical mode fetches a longer range so EMA200 etc. are defined before the
  // as-of date, then slices each series to that date.
  const fetchPeriod = fetchPeriodFor('screener', PERIOD);
  const rawData = await fetchMany(ctx.data, universe, fetchPeriod, 8);
  const data = sliceMap(rawData, asOf);

  // New QM + Momentum filters.
  const setupFilter = ($('#setup-filter') as HTMLSelectElement).value as QmSetupType | '';
  const minQualityRaw = ($('#min-quality') as HTMLInputElement).value.trim();
  const minQuality = minQualityRaw === '' ? -Infinity : Number(minQualityRaw);
  const momentumFilter = ($('#momentum-filter') as HTMLSelectElement).value as MomentumClassification | '';
  const sortBy = ($('#sort-by') as HTMLSelectElement).value as ScreenerSortKey;
  const classRank: Record<MomentumClassification, number> = { Weak: 1, Building: 2, Strong: 3, Explosive: 4 };

  // Benchmark (SPY) for relative strength, sliced to the as-of date too.
  const { spy: spyRaw } = await fetchBenchmarks(ctx, fetchPeriod, screenerMarket);
  const spy = spyRaw ? sliceSeries(spyRaw, asOf) : null;

  // Sector volume ranks for industry comparison in each row.
  const screenerSectorStocks = screenerSectorMap();
  const sectorVolRanks = computeSectorVolumeRank(data, screenerSectorStocks);
  const screenerSectorVolByName = new Map(sectorVolRanks.map((r) => [r.sector, r.volumeChangePct]));

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
    const vs = detectVolumeSurge(series.bars);
    const sector = sectorForSymbol(series.symbol);
    rows.push(toScreenerRow(q, m, vs.ratio > 0 ? vs.ratio : undefined, sector ? screenerSectorVolByName.get(sector) : undefined));
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
  const top = rows.slice(0, 200);
  if (top.length) out.appendChild(exportBar(top, 'screener'));
  out.appendChild(
    screenerTable(top, {
      sortKey: screenSort.key,
      sortDesc: screenSort.desc,
      onRowClick: (sym) => void openStock(ctx, sym, asOf),
      onSortChange: (key, desc) => {
        screenSort = { key, desc };
      },
    }),
  );
  // Persist results so coming back (or switching from Sectors) is instant.
  await saveScan<ScreenerRow>(ctx, screenerCacheId(), top, scanned);
  void enrichUnknownSymbols(ctx, top.map((r) => r.symbol));
  renderScanBannerInto('#screen-status', Date.now(), scanned, () => void runScreen(ctx), t('screener.run'));
}

/** Columns for exporting screener rows to CSV/HTML (Phase 12). */
const SCREENER_EXPORT_COLS: ReportColumn<ScreenerRow>[] = [
  { key: 'symbol', label: 'Symbol' },
  { key: 'qualityScore', label: 'Quality', format: (v) => (v as number).toFixed(0) },
  { key: 'setupType', label: 'Setup' },
  { key: 'momentumScore', label: 'Momentum', format: (v) => (v as number).toFixed(0) },
  { key: 'classification', label: 'Class' },
  { key: 'return1m', label: '1M %', format: (v) => (v == null ? '' : (v as number).toFixed(1)) },
  { key: 'return3m', label: '3M %', format: (v) => (v == null ? '' : (v as number).toFixed(1)) },
  { key: 'return6m', label: '6M %', format: (v) => (v == null ? '' : (v as number).toFixed(1)) },
  { key: 'relativeStrength', label: 'RS', format: (v) => (v as number).toFixed(1) },
  { key: 'volRatio', label: 'Vol×', format: (v) => (v == null ? '' : (v as number).toFixed(2)) },
  { key: 'pivot', label: 'Pivot', format: (v) => (v == null ? '' : (v as number).toFixed(2)) },
  { key: 'entryPrice', label: 'Entry', format: (v) => (v == null ? '' : (v as number).toFixed(2)) },
  { key: 'stopLoss', label: 'Stop', format: (v) => (v == null ? '' : (v as number).toFixed(2)) },
  { key: 'riskPct', label: 'Risk %', format: (v) => (v == null ? '' : (v as number).toFixed(1)) },
];

/** A small "Export ▾" bar that downloads the current rows as CSV or HTML. */
function exportBar(rows: ScreenerRow[], basename: string): HTMLElement {
  const bar = el(
    `<div class="row" style="justify-content:flex-end;margin-bottom:8px;gap:6px">
       <span class="muted" style="font-size:12px">${rows.length} ${t('export.rows')}</span>
       <button class="range-btn" data-exp="csv">${t('export.csv')}</button>
       <button class="range-btn" data-exp="html">${t('export.html')}</button>
     </div>`,
  );
  const title = 'The Professional — Screener';
  bar.querySelector('[data-exp="csv"]')!.addEventListener('click', () =>
    downloadCsv(toCsv(rows, SCREENER_EXPORT_COLS), basename),
  );
  bar.querySelector('[data-exp="html"]')!.addEventListener('click', () =>
    downloadHtml(toHtmlTable(rows, SCREENER_EXPORT_COLS, { title, subtitle: new Date().toISOString().slice(0, 10) }), basename),
  );
  return bar;
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
  volRatio?: number,
  sectorVolChangePct?: number | null,
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
    volRatio,
    sectorVolChangePct,
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
    ['us', `${flagSvg('us')} ${t('picks.market.us')}`],
    ['vn', `${flagSvg('vn')} ${t('picks.market.vn')}`],
  ];
  root.innerHTML = `
    <h1>${t('sectors.title')}</h1>
    <p class="subtitle">${t('sectors.sub')}</p>
    <div class="picks-config card">
      <div class="picks-config-row">
        <span class="picks-config-label">${t('picks.market')}</span>
        <div class="picks-pill-group">
          ${markets
            .map(
              ([m, label]) =>
                `<button class="range-btn ${m === sectorMarket ? 'active' : ''}" data-sector-market="${m}">${label}</button>`,
            )
            .join('')}
        </div>
      </div>
      <div class="picks-config-row">
        <span class="picks-config-label">${t('picks.asof')}</span>
        <div class="picks-pill-group">
          ${asOfControlsHtml('sectors')}
        </div>
      </div>
      <div class="picks-config-actions">
        <button id="load-sectors" class="btn">${t('sectors.scan')}</button>
        <span id="sector-status" class="muted"></span>
      </div>
    </div>
    <div id="sector-results"></div>`;
  root.querySelectorAll<HTMLElement>('[data-sector-market]').forEach((b) =>
    b.addEventListener('click', () => {
      const m = b.dataset.sectorMarket as Market;
      if (m === sectorMarket) return;
      sectorMarket = m;
      root.querySelectorAll('[data-sector-market]').forEach((x) => x.classList.toggle('active', x === b));
      void showSectors(ctx);
    }),
  );
  wireAsOfControls('sectors', root, () => {
    applyHistoricalFlag('sectors', root);
    void showSectors(ctx);
  });
  applyHistoricalFlag('sectors', root);
  $('#load-sectors')!.addEventListener('click', () => void runSectors(ctx));
  // Show today's cached ranking if present (instant, zero requests); else prompt.
  // Never auto-fetches — Scan runs it once and it sticks all day + syncs.
  void showSectors(ctx);
}

/** Self-contained, serializable row of a sector scan — everything the list and
 * the per-sector volume charts need, so the scan renders fully from cache (and
 * syncs to D1) WITHOUT keeping the raw OHLCV around. The hot/cold flags let the
 * rotation banner rebuild from rows alone. */
interface SectorSnapshotRow {
  sector: string;
  rank: number | null;
  avgReturn1m: number | null;
  avgReturn3m: number | null;
  avgRelativeStrength: number | null;
  avgVolume3m: number | null;
  avgVolume6m: number | null;
  volumeChangePct: number | null;
  /** Signed-volume flow: positive = net accumulation (money IN), negative = distribution (money OUT). */
  netFlowChangePct: number | null;
  hot: boolean;
  cold: boolean;
  weekly: { date: string; volume: number }[];
  monthly: { date: string; volume: number }[];
}

const sectorsCacheId = (): string => `sectors:${sectorMarket}${cacheSuffix('sectors')}`;

/** Render today's cached sector scan if present, else a "press Scan" prompt.
 * Never triggers a live fetch. */
async function showSectors(ctx: AppContext): Promise<void> {
  const out = $('#sector-results')!;
  const cached = await loadScan<SectorSnapshotRow>(ctx, sectorsCacheId());
  if (cached && cached.rows.length) {
    renderScanBannerInto('#sector-status', cached.at, cached.scanned, () => void runSectors(ctx), t('sectors.scan'));
    renderSectorSnapshot(ctx, cached.rows);
    return;
  }
  out.innerHTML = '';
  const lang = getLang();
  $('#sector-status')!.innerHTML = `<span class="muted">${
    lang === 'vi'
      ? 'Chưa quét hôm nay. Bấm “' + t('sectors.scan') + '” để chạy một lần — kết quả giữ cả ngày.'
      : 'Not scanned today. Press “' + t('sectors.scan') + '” to run once — results stay all day.'
  }</span>`;
}

async function runSectors(ctx: AppContext): Promise<void> {
  const status = $('#sector-status')!;
  const out = $('#sector-results')!;
  const sectorMap = sectorMapFor(sectorMarket);
  const universe = [...new Set(Object.values(sectorMap).flat())];
  const asOf = getAsOf('sectors').date;
  const fetchPeriod = fetchPeriodFor('sectors', PERIOD);
  status.innerHTML = `<span class="spinner"></span> ${t('msg.scanning')} ${Object.keys(sectorMap).length} sectors…${
    asOf ? ` (${asOfLabel('sectors')})` : ''
  }`;
  out.innerHTML = '';
  // 1y of history so the momentum returns (incl. 6M) are well-defined; the
  // volume chart simply resamples whatever range is fetched. As-of mode fetches
  // a longer range and slices each series to the chosen date.
  const data = sliceMap(await fetchMany(ctx.data, universe, fetchPeriod, 10), asOf);
  sectorData = data;

  // Volume ranking (existing) + momentum ranking (new). For US we also fetch SPY
  // so sector relative strength is measured vs the benchmark.
  const ranked = computeSectorVolumeRank(data, sectorMap);
  const { spy: spyRaw } = await fetchBenchmarks(ctx, fetchPeriod, sectorMarket);
  const spy = spyRaw ? sliceSeries(spyRaw, asOf) : null;
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

  // Build self-contained rows (rank/returns + precomputed volume series) so the
  // scan can be persisted, synced across devices, and re-rendered without the
  // raw OHLCV.
  const coldSet = new Set(momReport.coldSectors);
  const rows: SectorSnapshotRow[] = orderedSectors.map((sector) => {
    const r = volBySector.get(sector);
    const mom = momBySector.get(sector);
    const syms = sectorMap[sector] ?? [];
    return {
      sector,
      rank: mom ? mom.rank : null,
      avgReturn1m: mom ? mom.avgReturn1m : null,
      avgReturn3m: mom ? mom.avgReturn3m : null,
      avgRelativeStrength: mom ? mom.avgRelativeStrength : null,
      avgVolume3m: r ? r.avgVolume3m : null,
      avgVolume6m: r ? r.avgVolume6m : null,
      volumeChangePct: r ? r.volumeChangePct : null,
      netFlowChangePct: r ? r.netFlowChangePct : null,
      hot: hotSet.has(sector),
      cold: coldSet.has(sector),
      weekly: sectorVolumeSeries(syms, 'weekly'),
      monthly: sectorVolumeSeries(syms, 'monthly'),
    };
  });

  status.textContent = `${orderedSectors.length} sectors ranked.`;
  renderSectorSnapshot(ctx, rows);
  // Persist today's scan (local + D1) so it sticks all day and syncs.
  await saveScan<SectorSnapshotRow>(ctx, sectorsCacheId(), rows, universe.length);
}

/** Render sector rows (used by both the live scan and the cached path). The
 * per-sector volume charts draw from each row's precomputed series. */
function renderSectorSnapshot(ctx: AppContext, rows: SectorSnapshotRow[]): void {
  const out = $('#sector-results')!;
  out.innerHTML = '';
  renderSectorRotationBanner({
    hotSectors: rows.filter((r) => r.hot).map((r) => r.sector),
    coldSectors: rows.filter((r) => r.cold).map((r) => r.sector),
  } as SectorMomentumReport);

  for (const s of rows) {
    const color = s.avgRelativeStrength != null
      ? s.avgRelativeStrength >= 0 ? 'var(--accent)' : 'var(--danger)'
      : 'var(--faint)';
    const momRank = s.rank != null ? `#${s.rank}` : '—';
    const hot = s.hot ? ' 🔥' : '';
    const hasVol = s.avgVolume3m != null;
    // Flow label: signed-volume change tells whether increased volume = buying or selling.
    const flowVal = s.netFlowChangePct;
    const flowLabel = flowVal == null
      ? ''
      : flowVal >= 5
        ? `<span style="color:var(--accent)">▲ inflow ${pct(flowVal)}</span>`
        : flowVal <= -5
          ? `<span style="color:var(--danger)">▼ outflow ${pct(flowVal)}</span>`
          : `<span style="color:var(--faint)">≈ neutral ${pct(flowVal)}</span>`;
    const volLine = hasVol
      ? `vol ${pct(s.volumeChangePct)} · ${flowLabel}`
      : 'no volume data';
    const row = el(`
      <div class="sector-row">
        <div class="sector-head" data-sector="${s.sector}">
          <span class="sector-rank">${momRank}</span>
          <div style="flex:1"><strong>${s.sector}${hot}</strong>
            <div class="muted" style="font-size:11px">${
              s.rank != null ? `1M ${pct(s.avgReturn1m)} · 3M ${pct(s.avgReturn3m)} · RS ${num(s.avgRelativeStrength, 1)} · ` : ''
            }${volLine}</div></div>
          <span class="badge" style="background:color-mix(in srgb,${color} 16%,transparent);color:${color}">${
            s.rank != null ? num(s.avgRelativeStrength, 1) + ' RS' : (hasVol ? pct(s.volumeChangePct) : '—')
          }</span>
          <span class="muted caret">▾</span>
        </div>
        <div class="sector-detail hidden" data-detail="${s.sector}">
          <div class="row" style="margin-bottom:8px">
            <div class="row" data-freq-group>
              <button class="range-btn active" data-freq="weekly">Weekly</button>
              <button class="range-btn" data-freq="monthly">Monthly</button>
            </div>
            <button class="btn-outline" style="margin-left:auto" data-screen="${s.sector}">${t('sectors.screenstocks')}</button>
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
      const points = freq === 'weekly' ? s.weekly : s.monthly;
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
      screenSector(ctx, s.sector);
      window.dispatchEvent(new CustomEvent('app:show-tab', { detail: 'screener' }));
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
