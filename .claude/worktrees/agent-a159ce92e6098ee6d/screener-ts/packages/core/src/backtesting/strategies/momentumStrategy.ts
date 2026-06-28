import type { Strategy, StrategyContext, EntrySignal, ExitSignal } from '../types.js';
import { computeMomentumScore } from '../../momentum/momentumEngine.js';
import { DEFAULT_MOMENTUM_CONFIG, type MomentumConfig } from '../../momentum/config.js';
import { emaOfCloses } from '../../indicators/ema.js';
import { atr } from '../../indicators/atr.js';

/**
 * Momentum rebalancing strategy (Phase 10 extension).
 *
 * Logic:
 *   Entry: score the symbol on each bar; if the momentum score reaches the
 *          `minScore` threshold AND price is above its fast EMA, arm a market
 *          entry for the next open (trigger = today's close × 1.001 so the
 *          engine fills at open + slippage when the bar opens near close).
 *   Stop:  ATR-based (same multiplier as the VCP strategy so configs are
 *          comparable). No hard target — the strategy holds until the
 *          momentum score drops below `exitScore` or the EMA breaks.
 *   Exit:  Momentum score falls below `exitScore` threshold (soft signal at
 *          today's close) OR close drops below the exit EMA.
 *
 * This models the institutional practice of rotating into strong momentum
 * names and exiting when momentum deteriorates — NOT a pattern/breakout system.
 */
export interface MomentumStrategyOptions {
  /** Minimum momentum score (0–100) to enter a position. */
  minScore: number;
  /** Exit when score drops below this level. */
  exitScore: number;
  momCfg: MomentumConfig;
}

const DEFAULTS: MomentumStrategyOptions = {
  minScore: 65,
  exitScore: 45,
  momCfg: DEFAULT_MOMENTUM_CONFIG,
};

export function momentumStrategy(opts: Partial<MomentumStrategyOptions> = {}): Strategy {
  const { minScore, exitScore, momCfg } = { ...DEFAULTS, ...opts };

  return {
    name: 'Momentum rebalancing',

    shouldEnter(ctx: StrategyContext): EntrySignal | null {
      const bars = ctx.bars;
      if (bars.length < 60) return null;

      const result = computeMomentumScore(ctx.symbol, bars, undefined, momCfg);
      if (result.momentumScore < minScore) return null;

      // Price must be above the fast EMA (EMA 50) — trend confirmation.
      const ema50 = emaOfCloses(bars, 50);
      const lastEma = ema50[ema50.length - 1]!;
      const lastClose = bars[bars.length - 1]!.close;
      if (!Number.isNaN(lastEma) && lastClose < lastEma) return null;

      // Use ATR for a wide stop (momentum trades need room to breathe).
      const atrSeries = atr(bars, 14).filter((x) => !Number.isNaN(x));
      const currentAtr = atrSeries.length ? atrSeries[atrSeries.length - 1]! : 0;
      const stop = lastClose - ctx.cfg.atrMultiplierStop * currentAtr;
      if (stop <= 0 || currentAtr <= 0) return null;

      return {
        // Trigger just above today's close so a gap-up open fills quickly.
        triggerPrice: lastClose * 1.001,
        stop,
        // No hard target — exit is score/EMA driven, not fixed R.
        target: null,
        reason: `Momentum score ${result.momentumScore.toFixed(0)}`,
      };
    },

    shouldExit(ctx: StrategyContext): ExitSignal | null {
      const bars = ctx.bars;
      const last = bars[bars.length - 1]!;

      // Time stop.
      if (ctx.cfg.timeStopBars > 0 && ctx.position && ctx.position.barsHeld >= ctx.cfg.timeStopBars) {
        return { kind: 'time', price: last.close, reason: `time stop ${ctx.cfg.timeStopBars} bars` };
      }

      // Score deterioration exit.
      const result = computeMomentumScore(ctx.symbol, bars, undefined, momCfg);
      if (result.momentumScore < exitScore) {
        return { kind: 'signal', price: last.close, reason: `momentum faded (score ${result.momentumScore.toFixed(0)})` };
      }

      // EMA-break exit.
      if (ctx.cfg.exitEmaPeriod > 0) {
        const ema = emaOfCloses(bars, ctx.cfg.exitEmaPeriod);
        const e = ema[ema.length - 1]!;
        if (!Number.isNaN(e) && last.close < e) {
          return { kind: 'ema', price: last.close, reason: `close < EMA${ctx.cfg.exitEmaPeriod}` };
        }
      }

      return null;
    },
  };
}
