import type { Bar, OHLCV } from '../types/market.js';
import { DEFAULT_BACKTEST_CONFIG, type BacktestConfig } from './config.js';
import type {
  Strategy,
  Trade,
  EquityPoint,
  BacktestResult,
  OpenPosition,
  EntrySignal,
} from './types.js';
import { pyRound } from '../util/round.js';

/** Internal: an entry armed on day t, to be filled on day t+1 if triggered. */
interface ArmedEntry {
  symbol: string;
  signal: EntrySignal;
}

/** Internal mutable position (OpenPosition + the risk used for R-multiples). */
interface LivePosition extends OpenPosition {
  riskPerShare: number;
}

/**
 * Phase 10 — event-driven, NO-LOOKAHEAD backtest engine.
 *
 * Walks a single merged, ascending date axis across all symbols. On each date:
 *   1. mark open positions, update barsHeld / highestClose
 *   2. check exits (stop/target fill intrabar at their level; ema/time/signal at
 *      this bar's close) → close trades
 *   3. fill any entry armed on the PREVIOUS bar if today's range trades through
 *      its trigger (fill at max(open, trigger) + slippage)
 *   4. ask the strategy for new exits/entries, passing bars sliced to [0..t]
 *      ONLY — so a decision on day t never sees day t+1
 *   5. snapshot equity (cash + marked-to-market open positions)
 *
 * Position sizing risks `riskPctPerTrade` of CURRENT equity to the stop, capped
 * by maxConcentrationPct and available cash; entries are skipped past
 * maxOpenPositions. Slippage and commission are applied on every fill.
 *
 * The engine intentionally tracks cash/equity directly (not via portfolio/lots)
 * because it needs intrabar stop/target fills the manual portfolio API doesn't
 * model; the Trade log it produces is the source of truth for statistics.
 */
export function runBacktest(
  series: readonly OHLCV[],
  strategy: Strategy,
  cfg: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
): BacktestResult {
  // Index each symbol's bars by date for O(1) "is there a bar today" lookups.
  const bySymbol = new Map<string, { bars: Bar[]; byDate: Map<string, number> }>();
  const allDates = new Set<string>();
  for (const s of series) {
    if (!s.bars?.length) continue;
    const byDate = new Map<string, number>();
    s.bars.forEach((b, i) => {
      byDate.set(b.date, i);
      allDates.add(b.date);
    });
    bySymbol.set(s.symbol, { bars: [...s.bars], byDate });
  }
  const dates = [...allDates].sort();

  let cash = cfg.initialCapital;
  const positions = new Map<string, LivePosition>();
  const armed = new Map<string, ArmedEntry>(); // symbol → entry armed yesterday
  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];

  const markToMarket = (priceOf: (sym: string) => number | null): number => {
    let v = cash;
    for (const [sym, p] of positions) {
      const px = priceOf(sym) ?? p.entryPrice;
      v += p.shares * px;
    }
    return v;
  };

  for (const date of dates) {
    const barToday = (sym: string): Bar | null => {
      const e = bySymbol.get(sym);
      if (!e) return null;
      const i = e.byDate.get(date);
      return i === undefined ? null : e.bars[i]!;
    };

    // ── 1. Update open positions' bookkeeping. ──
    for (const p of positions.values()) {
      const b = barToday(p.symbol);
      if (!b) continue;
      p.barsHeld += 1;
      if (b.close > p.highestClose) p.highestClose = b.close;
    }

    // ── 2. Exits. ──
    for (const [sym, p] of [...positions]) {
      const b = barToday(sym);
      if (!b) continue;
      const e = bySymbol.get(sym)!;
      const idx = e.byDate.get(date)!;
      const ctxBars = e.bars.slice(0, idx + 1); // no lookahead

      let exitPrice: number | null = null;
      let exitReason = '';

      // Hard stop / target fill intrabar at their level (stop checked first —
      // conservative when a bar straddles both).
      if (b.low <= p.stop) {
        exitPrice = p.stop;
        exitReason = 'stop';
      } else if (p.target != null && b.high >= p.target) {
        exitPrice = p.target;
        exitReason = 'target';
      } else {
        // Soft exits (ema/time/signal) decided by the strategy on today's close.
        const ex = strategy.shouldExit({ symbol: sym, bars: ctxBars, index: idx, cfg, position: p });
        if (ex) {
          exitPrice = ex.kind === 'stop' || ex.kind === 'target' ? ex.price : b.close;
          exitReason = ex.reason || ex.kind;
        }
      }

      if (exitPrice != null) {
        const fill = exitPrice * (1 - cfg.slippagePct); // sell slips down
        const proceeds = fill * p.shares;
        const commission = proceeds * cfg.commissionPct;
        cash += proceeds - commission;
        const gross = (exitPrice - p.entryPrice) * p.shares;
        const entryCommission = p.entryPrice * p.shares * cfg.commissionPct;
        const net = (fill - p.entryPrice) * p.shares - commission - entryCommission;
        trades.push({
          symbol: sym,
          entryDate: p.entryDate,
          exitDate: date,
          entryPrice: pyRound(p.entryPrice, 4),
          exitPrice: pyRound(fill, 4),
          shares: p.shares,
          grossPnL: pyRound(gross, 2),
          netPnL: pyRound(net, 2),
          rMultiple: p.riskPerShare > 0 ? pyRound(net / p.shares / p.riskPerShare, 2) : 0,
          barsHeld: p.barsHeld,
          exitReason,
        });
        positions.delete(sym);
      }
    }

    // ── 3. Fill entries armed on the previous bar. ──
    for (const [sym, a] of [...armed]) {
      armed.delete(sym);
      if (positions.has(sym)) continue;
      if (positions.size >= cfg.maxOpenPositions) continue;
      const b = barToday(sym);
      if (!b) continue;
      // Triggered only if today's range reaches the trigger price.
      if (b.high < a.signal.triggerPrice) continue;
      const rawFill = Math.max(b.open, a.signal.triggerPrice);
      const fill = rawFill * (1 + cfg.slippagePct); // buy slips up
      const riskPerShare = fill - a.signal.stop;
      if (riskPerShare <= 0) continue;

      const equity = markToMarket((s) => barToday(s)?.close ?? null);
      const sharesByRisk = Math.floor((equity * cfg.riskPctPerTrade) / 100 / riskPerShare);
      const sharesByCap = Math.floor((equity * cfg.maxConcentrationPct) / 100 / fill);
      const sharesByCash = Math.floor(cash / (fill * (1 + cfg.commissionPct)));
      const shares = Math.max(0, Math.min(sharesByRisk, sharesByCap, sharesByCash));
      if (shares <= 0) continue;

      const cost = fill * shares;
      cash -= cost + cost * cfg.commissionPct;
      positions.set(sym, {
        symbol: sym,
        entryDate: date,
        entryPrice: fill,
        shares,
        stop: a.signal.stop,
        target: a.signal.target,
        barsHeld: 0,
        highestClose: b.close,
        riskPerShare,
      });
    }

    // ── 4. Arm new entries for symbols that are flat. ──
    for (const [sym, e] of bySymbol) {
      if (positions.has(sym) || armed.has(sym)) continue;
      const idx = e.byDate.get(date);
      if (idx === undefined) continue;
      const ctxBars = e.bars.slice(0, idx + 1); // no lookahead
      const sig = strategy.shouldEnter({ symbol: sym, bars: ctxBars, index: idx, cfg, position: null });
      if (sig) armed.set(sym, { symbol: sym, signal: sig });
    }

    // ── 5. Snapshot equity. ──
    equityCurve.push({ date, equity: pyRound(markToMarket((s) => barToday(s)?.close ?? null), 2) });
  }

  return {
    strategy: strategy.name,
    symbols: [...bySymbol.keys()],
    trades,
    equityCurve,
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
    finalEquity: equityCurve.length ? equityCurve[equityCurve.length - 1]!.equity : cfg.initialCapital,
  };
}
