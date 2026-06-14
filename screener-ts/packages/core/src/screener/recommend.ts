import type { OHLCV } from '../types/market.js';
import type { ScreenRow } from '../types/signals.js';
import { scanStock } from '../scoring/scanStock.js';
import { patternToRow } from './row.js';

export type StrategyKey = 'breakout' | 'momentum' | 'vcp';

interface StrategyConfig {
  label: string;
  minScore: number;
  signals?: Set<string>;
  stages?: Set<number>;
  minVcp?: number;
  /** Sort tuple builder (descending). Mirrors the Python lambda tuples. */
  sortTuple: (r: ScreenRow) => number[];
}

/** Port of the Python STRATEGIES presets (filters + sort). */
export const STRATEGIES: Record<StrategyKey, StrategyConfig> = {
  breakout: {
    label: 'Breakout-ready',
    minScore: 70,
    signals: new Set(['BREAKOUT_IMMINENT']),
    sortTuple: (r) => [r.score, -(r.distanceToPivotPct ?? 1e9)],
  },
  momentum: {
    label: 'Stage-2 momentum',
    minScore: 55,
    stages: new Set([2]),
    sortTuple: (r) => [r.score],
  },
  vcp: {
    label: 'Tight VCP near pivot',
    minScore: 60,
    minVcp: 2,
    sortTuple: (r) => [r.vcpContractions ?? 0, -(r.distanceToPivotPct ?? 1e9)],
  },
};

export interface RecommendResult {
  strategy: StrategyKey;
  strategyLabel: string;
  scanned: number;
  matched: number;
  results: ScreenRow[];
}

/** Descending lexicographic compare over the sort tuples. */
function byTuple(f: (r: ScreenRow) => number[]) {
  return (a: ScreenRow, b: ScreenRow): number => {
    const ta = f(a);
    const tb = f(b);
    for (let i = 0; i < ta.length; i++) {
      const d = (tb[i] ?? 0) - (ta[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  };
}

/**
 * Rank a pre-fetched universe by a named strategy — port of `recommend`'s
 * in-memory filter/sort (the caching + universe building lives in the app).
 */
export function recommend(
  series: readonly OHLCV[],
  strategy: StrategyKey = 'breakout',
  limit = 30,
  minBars = 60,
): RecommendResult {
  const cfg = STRATEGIES[strategy] ?? STRATEGIES.breakout;

  let scanned = 0;
  const all: ScreenRow[] = [];
  for (const s of series) {
    if (!s.bars || s.bars.length < minBars) continue;
    scanned += 1;
    all.push(patternToRow(scanStock(s.symbol, s.bars)));
  }

  let picks = all.filter((r) => r.score >= cfg.minScore);
  if (cfg.signals) picks = picks.filter((r) => cfg.signals!.has(r.signal));
  if (cfg.stages) picks = picks.filter((r) => cfg.stages!.has(r.stage));
  if (cfg.minVcp !== undefined) {
    picks = picks.filter((r) => (r.vcpContractions ?? 0) >= cfg.minVcp!);
  }

  picks.sort(byTuple(cfg.sortTuple));

  return {
    strategy,
    strategyLabel: cfg.label,
    scanned,
    matched: picks.length,
    results: picks.slice(0, limit),
  };
}
