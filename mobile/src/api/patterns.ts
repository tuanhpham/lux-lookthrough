import { apiClient } from "./client";
import type { PatternSignal, SectorScanResult } from "@/types";

export async function scanSymbol(
  symbol: string,
  sector?: string
): Promise<PatternSignal> {
  const params = sector ? { sector } : {};
  const { data } = await apiClient.get<PatternSignal>(
    `/api/patterns/scan/${encodeURIComponent(symbol)}`,
    { params }
  );
  return data;
}

export async function scanSector(
  sector: string,
  minScore = 55
): Promise<SectorScanResult> {
  const { data } = await apiClient.get<SectorScanResult>(
    `/api/patterns/scan-sector/${encodeURIComponent(sector)}`,
    { params: { min_score: minScore } }
  );
  return data;
}
