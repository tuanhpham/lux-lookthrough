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

// Bumped whenever any list's items change (add/remove/from modal or tab), so
// views can detect staleness and refetch without an explicit refresh click.
let _version = 0;
export function watchlistsVersion(): number {
  return _version;
}

/**
 * The list index, seeding a default list when there is none.
 *
 * The seed is returned but NOT persisted unless there is genuinely something to
 * carry over (legacy single-list data). Persisting an empty default here stamps
 * `watchlists:index` with a fresh "now" and, with sync on, pushes it up — where
 * last-write-wins makes it beat the real synced index and the lists vanish. This
 * fires on any read, including the very first render on a new device. Leaving it
 * unsaved keeps `tsOf()` at 0, so the merge treats the server copy as newer and
 * restores it; the index persists the moment the user actually creates or edits
 * a list. Same reasoning as portfolioTab's starter account.
 */
export async function loadIndex(ctx: AppContext): Promise<WatchlistMeta[]> {
  const idx = (await ctx.storage.get<WatchlistMeta[]>(INDEX_KEY)) ?? [];
  if (idx.length) return idx;
  const seeded = [{ id: 'default', name: 'My Watchlist' }];
  const legacy = (await ctx.storage.get<string[]>('watchlist:default')) ?? [];
  if (legacy.length) {
    // Real user data from the pre-multi-list era — migrating it is worth a write.
    await ctx.storage.set(INDEX_KEY, seeded);
    await ctx.storage.set(itemsKey('default'), legacy);
  }
  return seeded;
}

export async function saveIndex(ctx: AppContext, idx: WatchlistMeta[]): Promise<void> {
  await ctx.storage.set(INDEX_KEY, idx);
}

export async function loadItems(ctx: AppContext, id: string): Promise<string[]> {
  return (await ctx.storage.get<string[]>(itemsKey(id))) ?? [];
}

export async function saveItems(ctx: AppContext, id: string, syms: string[]): Promise<void> {
  await ctx.storage.set(itemsKey(id), [...new Set(syms)]);
  _version++;
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
