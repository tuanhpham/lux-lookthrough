import { mean } from './rolling.js';
import { pyRound } from '../util/round.js';

/**
 * Volume dry-up % within a base window, matching the Python:
 *
 *   vol_baseline = base.volume.iloc[:30].mean()   # first 30 bars of base
 *   vol_recent   = base.volume.iloc[-10:].mean()  # last 10 bars of base
 *   dry_up = (1 - vol_recent / vol_baseline) * 100   (0 if baseline <= 0)
 *
 * Positive = volume has quieted (sellers exhausted). Rounded to 2 dp.
 */
export function volumeDryUpPct(baseVolumes: readonly number[]): number {
  const baseline = mean(baseVolumes.slice(0, 30));
  const recent = mean(baseVolumes.slice(-10));
  if (!(baseline > 0)) return 0;
  return pyRound((1 - recent / baseline) * 100, 2);
}
