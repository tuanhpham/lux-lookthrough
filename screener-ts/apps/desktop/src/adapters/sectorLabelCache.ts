/**
 * Persistent sector/industry label cache — writes to ctx.storage so labels
 * accumulated across sessions survive app restarts and sync across devices.
 *
 * Storage key: `sectorlabels` → Record<string, SectorLabel>
 *
 * Used by scans to annotate symbols that are NOT in the static SECTOR_BY_SYMBOL
 * map (the ~543 US / ~390 VN curated list). Enrichment happens fire-and-forget
 * after a scan so it never blocks the result table.
 */
import type { Storage } from '@screener/core';

export interface SectorLabel {
  sector: string | null;
  industry: string | null;
}

const STORE_KEY = 'sectorlabels';

/** In-memory mirror so lookups are synchronous during a scan render. */
let memCache: Record<string, SectorLabel> = {};
let loaded = false;

/** Load the persisted map into memory. Call once at startup (or lazily). */
export async function loadSectorLabels(storage: Storage): Promise<void> {
  const stored = await storage.get<Record<string, SectorLabel>>(STORE_KEY);
  if (stored) memCache = stored;
  loaded = true;
}

/** Synchronous lookup — returns null if the symbol was never enriched. */
export function getCachedSectorLabel(symbol: string): SectorLabel | null {
  return memCache[symbol.toUpperCase()] ?? null;
}

/** Persist a batch of newly-fetched labels (merge with existing). */
export async function saveSectorLabels(
  storage: Storage,
  entries: Record<string, SectorLabel>,
): Promise<void> {
  if (!Object.keys(entries).length) return;
  // Merge into memory first so subsequent sync lookups are instant.
  for (const [sym, label] of Object.entries(entries)) {
    memCache[sym.toUpperCase()] = label;
  }
  // Only write the keys that changed (avoids rewriting unchanged entries every scan).
  const existing = (await storage.get<Record<string, SectorLabel>>(STORE_KEY)) ?? {};
  const merged = { ...existing, ...entries };
  await storage.set(STORE_KEY, merged);
}

export function isCacheLoaded(): boolean {
  return loaded;
}
