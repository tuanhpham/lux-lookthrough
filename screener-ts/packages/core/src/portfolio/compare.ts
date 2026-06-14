import type { AccountState } from '../types/index.js';
import { computeAccountMetrics, type PriceMap } from './metrics.js';

export interface AccountComparisonRow {
  accountId: string;
  name: string;
  totalReturnPct: number;
  equity: number;
  winRate: number;
  expectancy: number;
  avgRMultiple: number;
  maxDrawdownPct: number;
  totalOpenRiskPct: number;
  openTradeCount: number;
  closedTradeCount: number;
}

/**
 * Side-by-side comparison across accounts/strategies. `pricesByAccount` maps
 * accountId → latest prices (each account may hold different tickers).
 */
export function compareAccounts(
  states: readonly AccountState[],
  pricesByAccount: Map<string, PriceMap>,
): AccountComparisonRow[] {
  return states.map((s) => {
    const m = computeAccountMetrics(s, pricesByAccount.get(s.account.id) ?? {});
    return {
      accountId: s.account.id,
      name: s.account.name,
      totalReturnPct: m.totalPnLPct,
      equity: m.equity,
      winRate: m.winRate,
      expectancy: m.expectancy,
      avgRMultiple: m.avgRMultiple,
      maxDrawdownPct: m.maxDrawdownPct,
      totalOpenRiskPct: m.totalOpenRiskPct,
      openTradeCount: m.openTradeCount,
      closedTradeCount: m.closedTradeCount,
    };
  });
}
