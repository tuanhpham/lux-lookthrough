import type { Bar, OHLCV } from '../types/market.js';
import { DEFAULT_MOMENTUM_CONFIG, type MomentumConfig } from './config.js';
import { rankMomentum } from './momentumEngine.js';
import { computeSectorMomentum } from './sectorMomentum.js';
import { SECTOR_STOCKS } from '../screener/sectors.js';

export interface MomentumFilterOptions {
  /** Fraction of the universe to keep (0..1). Defaults to cfg.filter.topPct. */
  topPct?: number;
  /** Also require membership in a hot sector (intersect with sector rotation). */
  hotSectorsOnly?: boolean;
  /** Sector→symbols map for the hot-sector intersection. */
  sectorStocks?: Record<string, string[]>;
  /** Benchmark bars for relative strength. */
  benchmark?: readonly Bar[];
}

export interface MomentumFilterResult {
  /** The symbols that survived the filter (the narrowed universe). */
  symbols: string[];
  /** Hot sectors used when `hotSectorsOnly` was set (else empty). */
  hotSectors: string[];
  /** How many symbols were scored before narrowing. */
  scored: number;
}

/**
 * F4 — momentum pre-filter for the VCP/QM entry pipeline.
 *
 * Narrows an already-fetched universe to the top `topPct` of symbols by momentum
 * score, optionally intersected with the hot sectors from the sector-rotation
 * report. This is PURE universe-narrowing: it returns a symbol list and never
 * calls the VCP scanner or alters detection — the caller passes the result into
 * the existing scanner unchanged, preserving backward compatibility.
 */
export function filterByMomentum(
  dataBySymbol: Map<string, OHLCV>,
  options: MomentumFilterOptions = {},
  cfg: MomentumConfig = DEFAULT_MOMENTUM_CONFIG,
): MomentumFilterResult {
  const topPct = options.topPct ?? cfg.filter.topPct;
  const benchmark = options.benchmark;

  const ranked = rankMomentum(dataBySymbol, benchmark, cfg);
  const scored = ranked.length;

  // Keep the top fraction (at least 1 when anything scored).
  const keepCount = scored === 0 ? 0 : Math.max(1, Math.ceil(scored * topPct));
  let kept = ranked.slice(0, keepCount).map((r) => r.symbol);

  let hotSectors: string[] = [];
  if (options.hotSectorsOnly) {
    const sectorStocks = options.sectorStocks ?? SECTOR_STOCKS;
    const report = computeSectorMomentum(dataBySymbol, benchmark, sectorStocks, cfg);
    hotSectors = report.hotSectors;
    const hotSet = new Set(hotSectors.flatMap((s) => sectorStocks[s] ?? []));
    kept = kept.filter((sym) => hotSet.has(sym));
  }

  return { symbols: kept, hotSectors, scored };
}
