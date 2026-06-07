import { apiClient } from "./client";
import type {
  ScreenRequest,
  ScreenResponse,
  WatchlistCollection,
  WatchlistItem,
} from "@/types";

// ── Screener ──────────────────────────────────────────────────────────────────

export async function fetchUniverse(): Promise<string[]> {
  const { data } = await apiClient.get<{ sectors: string[] }>(
    "/api/screener/universe"
  );
  return data.sectors;
}

export async function runScreen(req: ScreenRequest): Promise<ScreenResponse> {
  const { data } = await apiClient.post<ScreenResponse>(
    "/api/screener/screen",
    req
  );
  return data;
}

// ── Watchlists (named collections) ───────────────────────────────────────────

export async function fetchWatchlists(): Promise<WatchlistCollection[]> {
  const { data } = await apiClient.get<WatchlistCollection[]>(
    "/api/screener/watchlists"
  );
  return data;
}

export async function createWatchlist(
  name: string
): Promise<WatchlistCollection> {
  const { data } = await apiClient.post<WatchlistCollection>(
    "/api/screener/watchlists",
    { name }
  );
  return data;
}

export async function renameWatchlist(
  id: number,
  name: string
): Promise<WatchlistCollection> {
  const { data } = await apiClient.patch<WatchlistCollection>(
    `/api/screener/watchlists/${id}`,
    { name }
  );
  return data;
}

export async function deleteWatchlist(id: number): Promise<void> {
  await apiClient.delete(`/api/screener/watchlists/${id}`);
}

export async function addWatchlistSymbol(
  symbol: string,
  watchlistId: number
): Promise<WatchlistItem> {
  const { data } = await apiClient.post<WatchlistItem>(
    "/api/screener/watchlist",
    { symbol, watchlist_id: watchlistId }
  );
  return data;
}

export async function removeWatchlistSymbol(
  symbol: string,
  watchlistId: number
): Promise<void> {
  await apiClient.delete(
    `/api/screener/watchlist/${encodeURIComponent(symbol)}`,
    { params: { watchlist_id: watchlistId } }
  );
}

export async function screenWatchlist(
  watchlistId: number,
  req: ScreenRequest = {}
): Promise<ScreenResponse> {
  const { data } = await apiClient.post<ScreenResponse>(
    `/api/screener/watchlists/${watchlistId}/screen`,
    req
  );
  return data;
}
