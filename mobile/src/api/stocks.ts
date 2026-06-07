import { apiClient } from "./client";
import type {
  FinancialsResponse,
  Fundamentals,
  OHLCVResponse,
} from "@/types";

export async function fetchOHLCV(
  symbol: string,
  period = "1y"
): Promise<OHLCVResponse> {
  const { data } = await apiClient.get<OHLCVResponse>(
    `/api/stocks/${encodeURIComponent(symbol)}/ohlcv`,
    { params: { period } }
  );
  return data;
}

export async function fetchFundamentals(symbol: string): Promise<Fundamentals> {
  const { data } = await apiClient.get<Fundamentals>(
    `/api/stocks/${encodeURIComponent(symbol)}/fundamentals`
  );
  return data;
}

export async function fetchFinancials(
  symbol: string
): Promise<FinancialsResponse> {
  const { data } = await apiClient.get<FinancialsResponse>(
    `/api/stocks/${encodeURIComponent(symbol)}/financials`
  );
  return data;
}
