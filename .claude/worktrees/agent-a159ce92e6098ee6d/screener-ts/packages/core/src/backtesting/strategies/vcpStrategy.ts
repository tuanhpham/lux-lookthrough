import type { Strategy, StrategyContext, EntrySignal, ExitSignal } from '../types.js';
import { detectVcp } from '../../qm/vcp.js';
import { DEFAULT_QM_CONFIG, type QmConfig } from '../../qm/config.js';
import { calculateTradeLevels } from '../../scoring/tradeLevels.js';
import { atr } from '../../indicators/atr.js';
import { emaOfCloses } from '../../indicators/ema.js';

/**
 * Phase 10 — VCP breakout strategy. Reuses the existing detector
 * (`detectVcp`) and risk math (`calculateTradeLevels`); it adds NO new pattern
 * logic — only the entry/exit rules a backtest needs.
 *
 *   Entry: a valid VCP with a pivot → arm a buy-stop at the pivot. The engine
 *          fills it next bar only if price trades through the pivot.
 *   Stop:  calculateTradeLevels' ATR stop (entry − ATR×mult).
 *   Exits: close below the configured EMA, or the time stop. The hard ATR stop
 *          and the R-target are handled by the engine (it has the fill levels).
 */
export function vcpStrategy(qmCfg: QmConfig = DEFAULT_QM_CONFIG): Strategy {
  return {
    name: 'VCP breakout',

    shouldEnter(ctx: StrategyContext): EntrySignal | null {
      const v = detectVcp(ctx.bars, qmCfg);
      if (!v.isVcp || v.pivot == null) return null;

      const atrSeries = atr(ctx.bars, 14).filter((x) => !Number.isNaN(x));
      const currentAtr = atrSeries.length ? atrSeries[atrSeries.length - 1]! : 0;
      const levels = calculateTradeLevels(
        ctx.bars[ctx.bars.length - 1]!.close,
        v.pivot,
        currentAtr,
        ctx.cfg.atrMultiplierStop,
        ctx.cfg.riskRewardTarget,
      );
      if (levels.entryPrice == null || levels.stopLoss == null) return null;

      return {
        triggerPrice: levels.entryPrice,
        stop: levels.stopLoss,
        target: levels.targetPrice,
        reason: `VCP breakout (${v.contractions} contractions)`,
      };
    },

    shouldExit(ctx: StrategyContext): ExitSignal | null {
      const bars = ctx.bars;
      const last = bars[bars.length - 1]!;

      // Time stop.
      if (ctx.cfg.timeStopBars > 0 && ctx.position && ctx.position.barsHeld >= ctx.cfg.timeStopBars) {
        return { kind: 'time', price: last.close, reason: `time stop ${ctx.cfg.timeStopBars} bars` };
      }

      // EMA-break exit: close below the configured EMA.
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
