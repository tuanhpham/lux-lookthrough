import type { OHLCV } from '../types/market.js';
import type { ScreenRow, SignalType } from '../types/signals.js';
import { scanStock } from '../scoring/scanStock.js';
import { patternToRow } from './row.js';

export type SortKey = 'score' | 'distance' | 'range' | 'volume_dryup' | 'symbol';

export interface ScreenFilters {
  minScore?: number;
  signals?: SignalType[];
  stages?: number[];
  maxDistanceToPivotPct?: number;
  sortBy?: SortKey;
  descending?: boolean;
  limit?: number;
  /** Minimum bars required to scan a symbol (Python uses 60). */
  minBars?: number;
}

export interface ScreenResult {
  scanned: number;
  matched: number;
  results: ScreenRow[];
}

/**
 * Screen a set of already-fetched OHLCV series — port of `run_screen`'s
 * filter/sort half. Data fetching is the app's job (via DataProvider); core
 * only does the logic so it stays platform-agnostic.
 *
 * Filters: score >= minScore, signal in signals, stage in stages, and
 * distanceToPivot <= maxDistance (only when a pivot exists, matching Python).
 * Sort keys mirror the Python `sort_keys` map.
 */
export function screen(series: readonly OHLCV[], filters: ScreenFilters = {}): ScreenResult {
  const {
    minScore = 0,
    signals,
    stages,
    maxDistanceToPivotPct,
    sortBy = 'score',
    descending = true,
    limit = 100,
    minBars = 60,
  } = filters;

  const signalSet = signals && signals.length ? new Set(signals) : null;
  const stageSet = stages && stages.length ? new Set(stages) : null;

  let scanned = 0;
  const rows: ScreenRow[] = [];

  for (const s of series) {
    if (!s.bars || s.bars.length < minBars) continue;
    scanned += 1;
    const r = scanStock(s.symbol, s.bars);

    if (r.score < minScore) continue;
    if (signalSet && !signalSet.has(r.signal)) continue;
    if (stageSet && !stageSet.has(r.stage.stage)) continue;
    if (
      maxDistanceToPivotPct !== undefined &&
      r.pivot.pivotHigh !== null &&
      r.pivot.distanceToPivotPct > maxDistanceToPivotPct
    ) {
      continue;
    }

    rows.push(patternToRow(r));
  }

  rows.sort(sortComparator(sortBy, descending));

  return { scanned, matched: rows.length, results: rows.slice(0, limit) };
}

function sortComparator(
  sortBy: SortKey,
  descending: boolean,
): (a: ScreenRow, b: ScreenRow) => number {
  const dir = descending ? -1 : 1;
  const numKey = (r: ScreenRow): number => {
    switch (sortBy) {
      case 'distance':
        return r.distanceToPivotPct ?? 0;
      case 'range':
        return r.priceRangePct ?? 0;
      case 'volume_dryup':
        return r.volumeDryUpPct ?? 0;
      case 'score':
      default:
        return r.score;
    }
  };
  if (sortBy === 'symbol') {
    return (a, b) => dir * a.symbol.localeCompare(b.symbol);
  }
  return (a, b) => dir * (numKey(a) - numKey(b));
}
