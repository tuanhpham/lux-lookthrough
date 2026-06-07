import { apiClient } from "./client";
import type { SectorVolume, TopStock } from "@/types";

export async function fetchSectors(): Promise<SectorVolume[]> {
  const { data } = await apiClient.get<SectorVolume[]>("/api/industries");
  return data;
}

export async function fetchTopStocks(sector: string): Promise<TopStock[]> {
  const { data } = await apiClient.get<TopStock[]>(
    `/api/industries/${encodeURIComponent(sector)}/top-stocks`
  );
  return data;
}
