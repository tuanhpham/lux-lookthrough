import type { AccountState } from '../types/index.js';
import { computeAccountMetrics, type PriceMap } from './metrics.js';

export interface AccountComparisonRow {
  accountId: string;
  name: string;
  /** Money-weighted: PnL over capital contributed. What the money earned. */
  totalReturnPct: number;
  /**
   * Time-weighted return %. The fair basis for ranking accounts against each
   * other — an account that got a large mid-window top-up is not penalised.
   */
  twrPct: number;
  twrAnnualizedPct: number;
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
      twrPct: m.twrPct,
      twrAnnualizedPct: m.twrAnnualizedPct,
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
