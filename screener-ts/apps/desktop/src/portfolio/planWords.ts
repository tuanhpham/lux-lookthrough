/**
 * The words for a plan, in one place — the copy half of what `setupPlaybook.ts` is
 * for the arithmetic.
 *
 * ── WHY THIS IS NOT INSIDE THE BUY FORM ─────────────────────────────────────
 * Two screens now explain the same plan: the Buy card on Portfolio and the Trade
 * Planner on Watchlist. Core deliberately returns codes rather than sentences
 * (`warnings`, `cuts`, `means`) so the app owns the phrasing — but "the app" was one
 * file, and a second copy of these tables is how the planner ends up saying the stop
 * is "below the recent low" while the form calls the same level "below the last
 * contraction". The user then has two explanations of one number and no way to tell
 * which is the rule. Same argument that put the rule table in core; this is its
 * other half.
 *
 * ── WHY THE EXPLANATION IS A LIST OF STRINGS, NOT HTML FOR ONE LAYOUT ───────
 * The Buy form prints these as `<br>`-joined lines under the fields; the planner
 * seeds them into a rich-text note the user then edits by hand. Returning lines lets
 * each wrap them its own way, and keeps the note free of markup the editor would have
 * to sanitize back out.
 */
import type { SetupKey } from '@screener/core';
import type { BuyPlan } from './playbook.js';
import { num } from '../ui/dom.js';
import { regimeStale } from './playbook.js';

/**
 * The setup names, for the three dropdowns that offer them.
 *
 * `SetupKey` is already the English name for most of them, so this table exists for the
 * Vietnamese column and for the two that read badly raw ('EP', 'Other').
 */
export const SETUP_NAMES: Record<SetupKey, [string, string]> = {
  VCP: ['VCP', 'VCP'],
  EP: ['Điểm xoay đột biến', 'Episodic Pivot'],
  'Mean Reversion': ['Hồi quy trung bình', 'Mean Reversion'],
  Breakout: ['Bứt phá', 'Breakout'],
  Pullback: ['Điều chỉnh', 'Pullback'],
  Surge: ['Tăng vọt', 'Surge'],
  Other: ['Khác', 'Other'],
};

export function setupName(k: SetupKey, vi: boolean): string {
  return vi ? SETUP_NAMES[k][0] : SETUP_NAMES[k][1];
}

/** Where the suggested stop is hanging, in words. */
export const ANCHOR_MEANS: Record<string, [string, string]> = {
  pullbackLow: ['dưới đáy của nhịp điều chỉnh', 'below the pullback low'],
  contractionLow: ['dưới đáy của lần nén cuối', 'below the last contraction low'],
  breakoutBarLow: ['dưới đáy nến bứt phá', 'below the breakout bar’s low'],
  signalBarLow: ['dưới đáy nến tín hiệu', 'below the signal bar’s low'],
  gapBarLow: ['dưới đáy nến nhảy khoảng', 'below the gap bar’s low'],
  recentLow: ['dưới đáy gần nhất', 'below the recent low'],
  atrOnly: ['theo ATR, vì thiết lập này không có mốc cấu trúc', 'by ATR — this setup has no structural mark'],
};

export const LEVEL_WARN: Record<string, [string, string]> = {
  // Deliberately phrased as a consequence, not as an error: the wide stop is CORRECT
  // and the smaller position is the right response to it.
  stopWiderThanAtr: [
    'Cấu trúc đặt cắt lỗ xa hơn thước đo ATR — đúng thì vẫn là đúng, nên số cổ nhỏ đi thay vì kéo cắt lỗ lại gần.',
    'Structure puts the stop wider than the ATR guide — that stands, so the share count shrinks instead of the stop moving in.',
  ],
  belowMinRR: [
    'Dưới mức R:R tối thiểu. Cẩm nang: bỏ qua, bất kể mẫu hình đẹp đến đâu.',
    'Under the minimum R:R. The book: skip it, however pretty the pattern.',
  ],
  fellBackToAtr: [
    'Không có đáy nào dưới giá vào để neo — đã dùng ATR thay thế.',
    'No low below the entry to anchor on — used ATR instead.',
  ],
  emaTargetBelowEntry: [
    'EMA chốt lời chưa nằm trên giá vào, nên chưa có mục tiêu để đặt.',
    'The exit EMA is not above the entry yet, so there is no target to set.',
  ],
  measuredMoveTooSmall: [
    'Chiều cao nền nhỏ hơn R:R tối thiểu — đã dùng bội số R.',
    'The base height came out under the minimum R:R — used the R multiple.',
  ],
};

export const SIZE_WARN: Record<string, [string, string]> = {
  heatExceeded: [
    'Tổng rủi ro đang mở đã chạm hạn mức — đóng hoặc nâng cắt lỗ một vị thế trước.',
    'Total open risk is already at the limit — close or tighten something first.',
  ],
  noNewLongs: ['Thị trường ở xu hướng giảm: không mở lệnh mua mới.', 'Downtrend: no new longs.'],
  tooManyPositions: [
    'Đã đủ số vị thế cho bậc rủi ro hiện tại.',
    'Already at the position count for this risk rung.',
  ],
  notEnoughCash: ['Tiền còn lại không đủ mua một cổ.', 'Not enough cash for a single share.'],
};

export const SIZE_LIMIT: Record<string, [string, string]> = {
  risk: ['rủi ro mỗi lệnh', 'risk per trade'],
  cash: ['tiền còn lại', 'cash on hand'],
  concentration: ['tỷ trọng tối đa một mã', 'max weight in one name'],
  heat: ['tổng rủi ro đang mở', 'total open risk'],
};

export const REGIME_SHORT: Record<string, [string, string]> = {
  UPTREND: ['tăng', 'uptrend'],
  UPTREND_UNDER_STRESS: ['tăng nhưng căng', 'uptrend under stress'],
  RANGE: ['đi ngang', 'range'],
  DOWNTREND: ['giảm', 'downtrend'],
};

/** Why each cut applied, for the "risk for this trade" line. */
export const CUT_SHORT: Record<string, [string, string]> = {
  regimeDowntrend: ['thị trường giảm', 'downtrend'],
  volExpanded: ['biến động giãn ra', 'volatility expanded'],
  regimeStress: ['xu hướng tăng đang căng', 'uptrend under stress'],
  regimeRange: ['thị trường đi ngang', 'range'],
  losingStreak: ['lỗ liên tiếp', 'losing streak'],
  rating: ['xếp hạng', 'the grade'],
  flooredAtMin: ['chạm sàn rủi ro', 'hit the risk floor'],
};

/**
 * What each grade means, said out loud next to the number.
 *
 * The grade is the only input to the size that comes from nowhere but the user's own
 * judgement, so the app has to show what it did with it. "C" on its own is a letter;
 * "C → 50% of the budget" is a decision the user can disagree with.
 */
export const RATING_MEANS: Record<string, [string, string]> = {
  A: ['đúng cái mình muốn — cỡ đầy đủ', 'exactly what you wanted — full size'],
  B: ['tốt nhưng có điểm chưa hoàn hảo', 'good, with something not quite right'],
  C: ['tạm được — vào nhỏ', 'acceptable — go small'],
  D: ['yếu; cân nhắc bỏ qua hẳn', 'weak; consider skipping it altogether'],
};

export interface PlanWordOpts {
  vi: boolean;
  /** Currency symbol for the LEVELS (stop/target) — the form's own currency. */
  levelSym: string;
  /** Currency symbol for the MONEY (risk, position value) — the ACCOUNT's currency. */
  moneySym: string;
  /** Include the risk-in-money line. Off where the card prints its own stat grid. */
  money?: boolean;
}

/**
 * The plan, explained — one string per line, safe to drop into HTML.
 *
 * Order is the order the decision was made in: where the stop goes, therefore how many
 * shares, therefore why that many, and only then the market and the warnings. A reader
 * who stops after two lines has still read the two numbers they are about to trade.
 */
export function planLines(plan: BuyPlan, opts: PlanWordOpts): string[] {
  const { vi, levelSym, moneySym } = opts;
  const lines: string[] = [];

  const anchor = ANCHOR_MEANS[plan.levels.rule.means];
  lines.push(
    `<b>${vi ? 'Cắt lỗ' : 'Stop'}</b> ${levelSym}${num(plan.stop)} ` +
    `<span class="muted">(${plan.stopPct.toFixed(1)}% — ${vi ? anchor![0] : anchor![1]})</span>` +
    (plan.target !== null
      ? ` · <b>${vi ? 'Mục tiêu' : 'Target'}</b> ${levelSym}${num(plan.target)}` +
        (plan.rMultiple !== null ? ` <span class="muted">(${plan.rMultiple.toFixed(1)}R)</span>` : '')
      : ''),
  );

  const limit = plan.size.limitedBy ? SIZE_LIMIT[plan.size.limitedBy] : null;
  lines.push(
    `<b>${plan.shares}</b> ${vi ? 'cổ' : 'sh'}` +
    (limit ? ` <span class="muted">· ${vi ? 'bị chặn bởi' : 'bound by'} ${vi ? limit[0] : limit[1]}</span>` : '') +
    ` · ${vi ? 'rủi ro' : 'risk'} <b>${plan.budget.pct}%</b>` +
    (opts.money && plan.size.riskAmount > 0
      ? ` <span class="muted">(${moneySym}${num(plan.size.riskAmount, 0)})</span>`
      : '') +
    ` <span class="muted">(${vi ? 'bậc' : 'rung'} ${plan.budget.stage.stage}, ` +
    `${plan.budget.stage.closedTrades} ${vi ? 'lệnh đã đóng' : 'closed trades'})</span>` +
    ` · ${vi ? 'tổng rủi ro mở sau lệnh' : 'open risk after'} <b>${plan.size.heatPctAfter}%</b>`,
  );

  // The grade gets its own line rather than a parenthesis, because it is the one input
  // the app cannot check: if the size looks wrong, this is the line to argue with.
  if (plan.rating) {
    const means = RATING_MEANS[plan.rating];
    const scaled = plan.budget.cuts.includes('rating');
    lines.push(
      `<span class="muted">${vi ? 'Xếp hạng' : 'Grade'} <b>${plan.rating}</b>` +
      (means ? ` — ${vi ? means[0] : means[1]}` : '') +
      (scaled
        ? ''
        : ` <span class="muted">(${vi ? 'không giảm cỡ' : 'no size cut'})</span>`) +
      '</span>',
    );
  }

  const cuts = plan.budget.cuts.map((c) => {
    const w = CUT_SHORT[c];
    return w ? (vi ? w[0] : w[1]) : c;
  });
  if (cuts.length) {
    lines.push(`<span class="muted">${vi ? 'Cỡ bị giảm vì' : 'Size cut by'}: ${cuts.join(' · ')}</span>`);
  }

  const r = plan.regime;
  lines.push(
    `<span class="muted">${vi ? 'Thị trường' : 'Market'}: ` +
    (r
      ? `${vi ? REGIME_SHORT[r.regime]![0] : REGIME_SHORT[r.regime]![1]} (SPY ${r.asOf}` +
        `${regimeStale() ? (vi ? ', đã cũ' : ', stale') : ''})` +
        (r.atrRatio !== null ? ` · ATR ${r.atrRatio}×` : '')
      : (vi ? 'chưa xác định được — bấm ↻ Cập nhật' : 'not established yet — press ↻ Update')) +
    '</span>',
  );

  for (const w of plan.levels.warnings) {
    const m = LEVEL_WARN[w];
    if (m) lines.push(`<span style="color:var(--warn,#ffb648)">⚠ ${vi ? m[0] : m[1]}</span>`);
  }
  for (const w of plan.size.warnings) {
    const m = SIZE_WARN[w];
    if (m) lines.push(`<span style="color:var(--warn,#ffb648)">⚠ ${vi ? m[0] : m[1]}</span>`);
  }
  if (plan.levels.rule.source === 'derived') {
    lines.push(
      `<span class="muted">${vi
        ? 'Cẩm nang không có dòng cho thiết lập này — các con số là suy ra, nên xem lại.'
        : 'The book has no row for this setup — these numbers are extrapolated, worth a look.'}</span>`,
    );
  }

  return lines;
}
