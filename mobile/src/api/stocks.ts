import { apiClient } from "./client";
import type { OHLCVResponse } from "@/types";

export async function fetchOHLCV(
  symbol: string,
  period = "6mo"
): Promise<OHLCVResponse> {
  const { data } = await apiClient.get<OHLCVResponse>(
    `/api/stocks/${encodeURIComponent(symbol)}/ohlcv`,
    { params: { period } }
  );
  return data;
}
