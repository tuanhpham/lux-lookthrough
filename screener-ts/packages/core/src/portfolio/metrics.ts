import type {
  AccountState,
  Position,
  AccountMetrics,
  BuyLot,
} from '../types/index.js';
import { pyRound } from '../util/round.js';
import { computeCash, netCashFlow, realizedPnL } from './account.js';
import { computeTwr } from './twr.js';

/** Whole-number day difference between two ISO dates (b - a). */
function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export interface PriceMap {
  /** latest close per ticker */
  [ticker: string]: number;
}

/**
 * Build derived positions per ticker from open lots.
 *
 * Aggregation across a ticker's open lots:
 *   shares    = Σ remainingShares
 *   costBasis = Σ remainingShares * buyPrice
 *   avgCost   = costBasis / shares
 *   marketValue = shares * lastPrice
 *   unrealizedPnL = marketValue - costBasis
 *   realizedPnL  = Σ realized from sells for this ticker
 *
 * Risk (only from open lots that HAVE a stop):
 *   riskEur = Σ (buyPrice - stop) * remainingShares   over stop-bearing lots
 *   If NO open lot has a stop → riskEur undefined (excluded from total risk).
 *   If a stop exists but sits at/above entry (raised to lock in profit) →
 *     riskEur = 0, riskFree = true, lockedInProfit = Σ (stop - buyPrice) * shares.
 *
 * R-multiple (only when risk is defined and > 0):
 *   perShareRisk = riskEur / sharesWithStop
 *   rMultiple    = unrealizedPnL_onStoppedShares / riskEur
 *   (we use the stopped-shares' share of unrealized PnL for honesty)
 *   Undefined when risk-free (division by zero).
 *
 * stop/target shown = those of the OLDEST open lot carrying them (representative).
 * distanceToStopPct  = (lastPrice - stop)/lastPrice*100
 * distanceToTargetPct = (target - lastPrice)/lastPrice*100
 */
export function buildPositions(
  state: AccountState,
  prices: PriceMap,
  asOfDate: string,
): Position[] {
  const tickers = [
    ...new Set(state.lots.filter((l) => l.remainingShares > 0).map((l) => l.ticker)),
  ];

  // realized PnL per ticker
  const realizedByTicker = new Map<string, number>();
  for (const r of state.sells) {
    realizedByTicker.set(r.ticker, (realizedByTicker.get(r.ticker) ?? 0) + r.realizedPnL);
  }

  const positions: Position[] = [];
  const equity = computeEquity(state, prices);

  for (const ticker of tickers) {
    const lots = state.lots.filter((l) => l.ticker === ticker && l.remainingShares > 0);
    const lastPrice = prices[ticker] ?? lots[lots.length - 1]!.buyPrice;

    let shares = 0;
    let costBasis = 0;
    let riskEur = 0;
    let sharesWithStop = 0;
    let unrealizedOnStopped = 0;
    let hasStop = false;
    let earliest: BuyLot | undefined;

    for (const lot of lots) {
      shares += lot.remainingShares;
      costBasis += lot.remainingShares * lot.buyPrice;
      if (!earliest || lot.buyDate < earliest.buyDate) earliest = lot;
      if (lot.stop !== undefined) {
        hasStop = true;
        sharesWithStop += lot.remainingShares;
        riskEur += (lot.buyPrice - lot.stop) * lot.remainingShares;
        unrealizedOnStopped += (lastPrice - lot.buyPrice) * lot.remainingShares;
      }
    }

    const avgCost = shares > 0 ? costBasis / shares : 0;
    const marketValue = shares * lastPrice;
    const unrealizedPnL = marketValue - costBasis;
    const unrealizedPnLPct = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

    // Representative stop/target from the earliest open lot.
    const stop = earliest?.stop;
    const target = earliest?.target;

    const pos: Position = {
      ticker,
      shares,
      avgCost: pyRound(avgCost, 6),
      lastPrice: pyRound(lastPrice, 6),
      marketValue: pyRound(marketValue, 6),
      costBasis: pyRound(costBasis, 6),
      unrealizedPnL: pyRound(unrealizedPnL, 6),
      unrealizedPnLPct: pyRound(unrealizedPnLPct, 6),
      realizedPnL: pyRound(realizedByTicker.get(ticker) ?? 0, 6),
      stop,
      target,
      daysHeld: earliest ? daysBetween(earliest.buyDate, asOfDate) : 0,
      concentrationPct: equity > 0 ? pyRound((marketValue / equity) * 100, 6) : 0,
    };

    if (hasStop) {
      if (riskEur > 0) {
        // Stop below entry — real capital at risk.
        pos.riskEur = pyRound(riskEur, 6);
        pos.rMultiple = pyRound(unrealizedOnStopped / riskEur, 6);
      } else {
        // Stop at/above entry — the trade is risk-free: the stop guarantees a
        // non-negative outcome, so there is no capital left at risk (riskEur 0).
        // lockedInProfit = Σ (stop - buyPrice) * shares on stop-bearing lots.
        pos.riskEur = 0;
        pos.riskFree = true;
        pos.lockedInProfit = pyRound(-riskEur, 6);
        // R-multiple is undefined when risk is zero (division by zero) — omit it.
      }
    }
    if (stop !== undefined && lastPrice > 0) {
      pos.distanceToStopPct = pyRound(((lastPrice - stop) / lastPrice) * 100, 6);
    }
    if (target !== undefined && lastPrice > 0) {
      pos.distanceToTargetPct = pyRound(((target - lastPrice) / lastPrice) * 100, 6);
    }

    positions.push(pos);
  }

  positions.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return positions;
}

/** Market value of all open positions. */
export function computePositionsValue(state: AccountState, prices: PriceMap): number {
  let mv = 0;
  for (const lot of state.lots) {
    if (lot.remainingShares <= 0) continue;
    const price = prices[lot.ticker] ?? lot.buyPrice;
    mv += lot.remainingShares * price;
  }
  return mv;
}

/** Equity = cash + positions value. */
export function computeEquity(state: AccountState, prices: PriceMap): number {
  return computeCash(state) + computePositionsValue(state, prices);
}

/**
 * Max drawdown %, measured on the cash-flow-neutral TWR index rather than on
 * raw equity. On raw equity a withdrawal is indistinguishable from a loss —
 * taking 20% of the account out would book a 20% drawdown that never happened.
 * With no cash flows the index is just equity scaled by opening capital, so
 * this is identical to the peak-to-trough of the equity curve.
 */
export function maxDrawdownPct(state: AccountState): number {
  return computeTwr(state).maxDrawdownPct;
}

/**
 * Closed-trade stats. A "closed trade" is a lot fully consumed by sells
 * (remainingShares === 0). Win = total realized PnL for that lot > 0.
 * R-multiple per closed lot = realizedPnL / |initialRisk|, where
 * initialRisk = (buyPrice - stop) * originalShares (only if stop was set).
 */
function closedTradeStats(state: AccountState): {
  closedCount: number;
  wins: number;
  avgR: number;
  expectancy: number;
} {
  const realizedByLot = new Map<string, number>();
  for (const r of state.sells) {
    realizedByLot.set(r.lotId, (realizedByLot.get(r.lotId) ?? 0) + r.realizedPnL);
  }

  const closedLots = state.lots.filter((l) => l.remainingShares === 0 && realizedByLot.has(l.id));
  let wins = 0;
  let pnlSum = 0;
  const rValues: number[] = [];

  for (const lot of closedLots) {
    const pnl = realizedByLot.get(lot.id) ?? 0;
    pnlSum += pnl;
    if (pnl > 0) wins += 1;
    if (lot.stop !== undefined) {
      const initialRisk = (lot.buyPrice - lot.stop) * lot.shares;
      if (initialRisk > 0) rValues.push(pnl / initialRisk);
    }
  }

  const closedCount = closedLots.length;
  const avgR = rValues.length ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0;
  const expectancy = closedCount ? pnlSum / closedCount : 0;
  return { closedCount, wins, avgR, expectancy };
}

/** Whole-account roll-up. */
export function computeAccountMetrics(
  state: AccountState,
  prices: PriceMap,
): AccountMetrics {
  const cash = computeCash(state);
  const positionsValue = computePositionsValue(state, prices);
  const equity = cash + positionsValue;
  const initial = state.account.initialCapital;
  // PnL is measured against the money actually put in, not just the opening
  // balance. Deposits and withdrawals land in `equity` via computeCash(), so
  // they must land in the base too — otherwise a 10k top-up reads as +10k PnL.
  const flows = netCashFlow(state);
  const contributed = initial + flows;

  const positions = buildPositions(state, prices, state.account.createdAt);
  let totalOpenRiskEur = 0;
  let withoutStop = 0;
  let unrealized = 0;
  for (const p of positions) {
    unrealized += p.unrealizedPnL;
    if (p.riskEur !== undefined) totalOpenRiskEur += p.riskEur;
    else withoutStop += 1;
  }

  const realized = realizedPnL(state);
  const { closedCount, wins, avgR, expectancy } = closedTradeStats(state);
  const twr = computeTwr(state);

  return {
    accountId: state.account.id,
    cash: pyRound(cash, 6),
    positionsValue: pyRound(positionsValue, 6),
    equity: pyRound(equity, 6),
    initialCapital: initial,
    netCashFlow: pyRound(flows, 6),
    contributedCapital: pyRound(contributed, 6),
    totalPnL: pyRound(equity - contributed, 6),
    totalPnLPct:
      contributed > 0 ? pyRound(((equity - contributed) / contributed) * 100, 6) : 0,
    twrPct: twr.totalPct,
    twrAnnualizedPct: twr.annualizedPct,
    unrealizedPnL: pyRound(unrealized, 6),
    realizedPnL: pyRound(realized, 6),
    totalOpenRiskEur: pyRound(totalOpenRiskEur, 6),
    totalOpenRiskPct: equity > 0 ? pyRound((totalOpenRiskEur / equity) * 100, 6) : 0,
    openPositionsWithoutStop: withoutStop,
    maxDrawdownPct: twr.maxDrawdownPct,
    winRate: closedCount ? pyRound(wins / closedCount, 6) : 0,
    avgRMultiple: pyRound(avgR, 6),
    expectancy: pyRound(expectancy, 6),
    openTradeCount: positions.length,
    closedTradeCount: closedCount,
  };
}
