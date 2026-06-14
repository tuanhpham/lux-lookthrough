/** Shared multi-watchlist storage used by both the Watchlist tab and the stock
 * detail modal. Stored as: `watchlists:index` → [{id,name}],
 * `watchlists:items:<id>` → string[]. */
import type { AppContext } from '../context.js';

export interface WatchlistMeta {
  id: string;
  name: string;
}
const INDEX_KEY = 'watchlists:index';
export const itemsKey = (id: string): string => `watchlists:items:${id}`;

export function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? 'wl-' + Math.random().toString(36).slice(2);
}

export async function loadIndex(ctx: AppContext): Promise<WatchlistMeta[]> {
  let idx = (await ctx.storage.get<WatchlistMeta[]>(INDEX_KEY)) ?? [];
  if (!idx.length) {
    const legacy = (await ctx.storage.get<string[]>('watchlist:default')) ?? [];
    idx = [{ id: 'default', name: 'My Watchlist' }];
    await ctx.storage.set(INDEX_KEY, idx);
    if (legacy.length) await ctx.storage.set(itemsKey('default'), legacy);
  }
  return idx;
}

export async function saveIndex(ctx: AppContext, idx: WatchlistMeta[]): Promise<void> {
  await ctx.storage.set(INDEX_KEY, idx);
}

export async function loadItems(ctx: AppContext, id: string): Promise<string[]> {
  return (await ctx.storage.get<string[]>(itemsKey(id))) ?? [];
}

export async function saveItems(ctx: AppContext, id: string, syms: string[]): Promise<void> {
  await ctx.storage.set(itemsKey(id), [...new Set(syms)]);
}

export async function createList(ctx: AppContext, name: string): Promise<WatchlistMeta> {
  const idx = await loadIndex(ctx);
  const meta = { id: newId(), name };
  await saveIndex(ctx, [...idx, meta]);
  return meta;
}

export async function addSymbol(ctx: AppContext, listId: string, symbol: string): Promise<void> {
  const items = await loadItems(ctx, listId);
  await saveItems(ctx, listId, [...items, symbol.toUpperCase()]);
}

export async function listsContaining(ctx: AppContext, symbol: string): Promise<Set<string>> {
  const idx = await loadIndex(ctx);
  const out = new Set<string>();
  for (const w of idx) {
    if ((await loadItems(ctx, w.id)).includes(symbol.toUpperCase())) out.add(w.id);
  }
  return out;
}
