/**
 * The scan behind the Calendar tab's three analytical sections: Top attention,
 * VCP (prior advance now consolidating), and Mean Reversion candidates.
 *
 * Refresh model is the SAME contract as Picks, and for the same reason: one pass
 * over the curated universe is ~540 requests, so it runs when the user presses
 * Run, is persisted for the day via scanCache, and never fires on tab open. The
 * calendar sweep next door spends ~60 requests a day; silently adding 540 on
 * every open would be a nine-fold regression of the exact bug that budget exists
 * to prevent.
 *
 * One cache entry holds all three sections. They come from the same bars, so
 * splitting them would mean fetching the universe twice for no gain.
 */
import {
  DEFAULT_MEAN_REVERSION_CONFIG,
  SECTOR_STOCKS,
  computeMomentumScore,
  detectMeanReversion,
  detectRegime,
  fetchMany,
  scanQm,
  type Bar,
  type MeanReversionResult,
  type OHLCV,
  type Period,
  type RegimeType,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { curatedUniverse } from '../adapters/universe.js';
import { getCachedSectorLabel } from '../adapters/sectorLabelCache.js';
import { loadScan, saveScan, type CachedScan } from './scanCache.js';

/** Static symbol → sector map, same source the screener uses. */
const SECTOR_BY_SYMBOL: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [sector, syms] of Object.entries(SECTOR_STOCKS)) {
    for (const s of syms) if (!(s in out)) out[s] = sector;
  }
  return out;
})();

function sectorFor(symbol: string): string | null {
  return SECTOR_BY_SYMBOL[symbol] ?? getCachedSectorLabel(symbol)?.sector ?? null;
}

/** Enough history for EMA200 + the 20-bar rising check the trend gate needs. */
const PERIOD: Period = '2y';
const BATCH = 60;
const CONCURRENCY = 6;
const BENCHMARK = 'SPY';

/** Cache id — one slot, shared by all three sections. */
export const CALENDAR_SCAN_ID = 'calwatch:us:curated';

/** A consolidating stock with a real prior advance: the VCP section's row. */
export interface VcpWatchRow {
  symbol: string;
  sector: string | null;
  price: number;
  /** VCP-local confidence, which is what this section ranks on. */
  confidence: number;
  qualityScore: number;
  previousAdvancePct: number;
  contractions: number;
  baseDepthPct: number;
  baseLength: number;
  volumeContractionPct: number;
  atrContractionPct: number;
  pivot: number | null;
  entryPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  /** Distance to the pivot as a % of price; negative = already above it. */
  distanceToPivotPct: number | null;
  /** The QM trend gate. Reported, not required — see collectVcp. */
  trendPassed: boolean;
}

/** A stretched-but-intact pullback: the Mean Reversion section's row. */
export interface MeanReversionRow {
  symbol: string;
  sector: string | null;
  price: number;
  confidence: number;
  anchor: number;
  stretchAtr: number;
  stretchPct: number;
  rsi: number;
  pullbackFromHighPct: number;
  trendEmaValue: number;
  stabilizing: boolean;
  targetPrice: number | null;
  invalidationPrice: number | null;
  upsideToTargetPct: number;
}

/** Per-symbol technical signals, for feeding `rankAttention`. */
export interface AttentionSignal {
  symbol: string;
  qualityScore: number | null;
  setupType: string | null;
  distanceToPivotPct: number | null;
  momentumScore: number | null;
  relativeStrength: number | null;
}

export interface CalendarScanResult {
  vcp: VcpWatchRow[];
  meanReversion: MeanReversionRow[];
  signals: AttentionSignal[];
  regime: RegimeType | null;
  scanned: number;
}

export interface ScanProgress {
  done: number;
  total: number;
  vcp: number;
  meanReversion: number;
}

/** Today's cached scan, or null. Never fetches. */
export async function loadCalendarScan(
  ctx: AppContext,
): Promise<CachedScan<CalendarScanResult> | null> {
  // The payload is a single object, but scanCache stores arrays — so it lives as
  // a one-element `rows`. Cheaper than a parallel cache layer for one caller.
  return loadScan<CalendarScanResult>(ctx, CALENDAR_SCAN_ID);
}

/**
 * VCP rows worth showing, ranked by VCP confidence.
 *
 * The trend gate is REPORTED rather than required here. Picks answers "what can I
 * buy today", where a failed trend filter is disqualifying; this section answers
 * "what is setting up", and a base that is still forming under a recovering EMA
 * stack is precisely what you want to have noticed early. The row carries
 * `trendPassed` so the UI can mark it, which keeps the distinction visible
 * instead of hiding it behind a filter.
 */
function toVcpRow(
  scan: ReturnType<typeof scanQm>,
  sector: string | null,
): VcpWatchRow | null {
  const v = scan.vcp;
  if (!v.isVcp || v.pivot == null) return null;
  const distanceToPivotPct =
    scan.price > 0 ? Number((((v.pivot - scan.price) / scan.price) * 100).toFixed(2)) : null;
  return {
    symbol: scan.symbol,
    sector,
    price: scan.price,
    confidence: v.confidence,
    qualityScore: scan.qualityScore,
    previousAdvancePct: v.previousAdvancePct,
    contractions: v.contractions,
    baseDepthPct: v.baseDepthPct,
    baseLength: v.baseLength,
    volumeContractionPct: v.volumeContractionPct,
    atrContractionPct: v.atrContractionPct,
    pivot: v.pivot,
    entryPrice: scan.levels.entryPrice,
    stopLoss: scan.levels.stopLoss,
    targetPrice: scan.levels.targetPrice,
    distanceToPivotPct,
    trendPassed: scan.trend.passed,
  };
}

function toMeanReversionRow(
  symbol: string,
  sector: string | null,
  r: MeanReversionResult,
): MeanReversionRow {
  return {
    symbol,
    sector,
    price: r.price,
    confidence: r.confidence,
    anchor: r.anchor,
    stretchAtr: r.stretchAtr,
    stretchPct: r.stretchPct,
    rsi: r.rsi,
    pullbackFromHighPct: r.pullbackFromHighPct,
    trendEmaValue: r.trendEmaValue,
    stabilizing: r.stabilizing,
    targetPrice: r.targetPrice,
    invalidationPrice: r.invalidationPrice,
    upsideToTargetPct: r.upsideToTargetPct,
  };
}

/**
 * Run the full scan and persist it for the day.
 *
 * `shouldStop` is polled between batches so the user can abandon a scan they
 * started by accident without waiting out 540 requests.
 */
export async function runCalendarScan(
  ctx: AppContext,
  onProgress: (p: ScanProgress) => void,
  shouldStop: () => boolean = () => false,
): Promise<CalendarScanResult | null> {
  const symbols = curatedUniverse();

  // The benchmark drives relative strength and the regime line. A failure here is
  // not fatal — RS simply goes unscored rather than the whole scan being lost.
  let benchmark: readonly Bar[] | undefined;
  let regime: RegimeType | null = null;
  try {
    const bm = await fetchMany(ctx.data, [BENCHMARK], PERIOD, 1);
    const spy = bm.get(BENCHMARK);
    if (spy?.bars.length) {
      benchmark = spy.bars;
      regime = detectRegime(spy.bars).regimeType;
    }
  } catch {
    benchmark = undefined;
  }

  const vcp: VcpWatchRow[] = [];
  const meanReversion: MeanReversionRow[] = [];
  const signals: AttentionSignal[] = [];
  let scanned = 0;

  for (let i = 0; i < symbols.length; i += BATCH) {
    if (shouldStop()) return null;
    const batch = symbols.slice(i, i + BATCH);
    let data: Map<string, OHLCV>;
    try {
      data = await fetchMany(ctx.data, batch, PERIOD, CONCURRENCY);
    } catch {
      // A dead batch loses those symbols, not the scan. Partial results beat none.
      continue;
    }
    if (shouldStop()) return null;

    for (const series of data.values()) {
      const bars = series.bars;
      // EMA200 + the 20-bar rising lookback is the binding requirement; anything
      // shorter cannot be judged by the mean-reversion trend gate at all.
      if (!bars || bars.length < 60) continue;
      scanned += 1;
      const sector = sectorFor(series.symbol);

      const q = scanQm(series.symbol, bars);
      const row = toVcpRow(q, sector);
      if (row) vcp.push(row);

      const enough = bars.length >= DEFAULT_MEAN_REVERSION_CONFIG.trendEma +
        DEFAULT_MEAN_REVERSION_CONFIG.trendEmaRisingLookback;
      if (enough) {
        const mr = detectMeanReversion(bars);
        if (mr.isCandidate) meanReversion.push(toMeanReversionRow(series.symbol, sector, mr));
      }

      const mom = computeMomentumScore(series.symbol, bars, benchmark);
      // Only symbols with something to say are kept: rankAttention already handles
      // a symbol it has no signals for, and carrying 540 empty rows into storage
      // is how the `accounts` row reached 912 KB.
      if (q.setupType !== 'NONE' || mom.momentumScore >= 60) {
        signals.push({
          symbol: series.symbol,
          qualityScore: q.qualityScore,
          setupType: q.setupType,
          distanceToPivotPct: row?.distanceToPivotPct ?? null,
          momentumScore: mom.momentumScore,
          relativeStrength: mom.relativeStrength,
        });
      }
    }

    onProgress({
      done: Math.min(i + BATCH, symbols.length),
      total: symbols.length,
      vcp: vcp.length,
      meanReversion: meanReversion.length,
    });
    // Yield to the event loop so the progress bar actually paints.
    await new Promise((r) => setTimeout(r, 0));
  }

  vcp.sort((a, b) => b.confidence - a.confidence || b.qualityScore - a.qualityScore);
  meanReversion.sort((a, b) => b.confidence - a.confidence || b.stretchAtr - a.stretchAtr);

  const result: CalendarScanResult = {
    // Capped: these are read-and-scan lists, not databases, and the whole payload
    // syncs to D1 on every write.
    vcp: vcp.slice(0, 40),
    meanReversion: meanReversion.slice(0, 40),
    signals: signals.slice(0, 200),
    regime,
    scanned,
  };
  await saveScan<CalendarScanResult>(ctx, CALENDAR_SCAN_ID, [result], scanned).catch(() => {});
  return result;
}
