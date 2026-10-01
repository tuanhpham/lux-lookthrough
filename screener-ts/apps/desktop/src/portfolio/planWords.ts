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
 * ── WHY THE EXPLANATION IS ROWS, NOT HTML FOR ONE LAYOUT ────────────────────
 * `planRows` is the content: one labelled fact per row. Two renderers sit on top of it
 * because the same facts are read in two different places — `planLines` for the live
 * hint under the Buy form's fields, `planNoteHtml` for the rich-text note the user then
 * edits by hand. Keeping the content separate from the markup is what stops the note
 * and the form drifting into two different explanations of one number.
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
  EP: ['Episodic Pivot', 'Episodic Pivot'],
  'Mean Reversion': ['Mean Reversion', 'Mean Reversion'],
  Breakout: ['Breakout', 'Breakout'],
  Pullback: ['Pullback', 'Pullback'],
  Surge: ['Surge', 'Surge'],
  Other: ['Khác', 'Other'],
};

export function setupName(k: SetupKey, vi: boolean): string {
  return vi ? SETUP_NAMES[k][0] : SETUP_NAMES[k][1];
}

/** Where the suggested stop is hanging, in words. */
export const ANCHOR_MEANS: Record<string, [string, string]> = {
  pullbackLow: ['dưới đáy nhịp pullback', 'below the pullback low'],
  contractionLow: ['dưới đáy nhịp co cuối cùng', 'below the last contraction low'],
  breakoutBarLow: ['dưới đáy nến breakout', 'below the breakout bar’s low'],
  signalBarLow: ['dưới đáy nến tín hiệu', 'below the signal bar’s low'],
  gapBarLow: ['dưới đáy nến gap', 'below the gap bar’s low'],
  recentLow: ['dưới đáy gần nhất', 'below the recent low'],
  atrOnly: ['theo ATR — setup này không có mốc cấu trúc', 'by ATR — this setup has no structural mark'],
};

export const LEVEL_WARN: Record<string, [string, string]> = {
  // Deliberately phrased as a consequence, not as an error: the wide stop is CORRECT
  // and the smaller position is the right response to it.
  stopWiderThanAtr: [
    'Cấu trúc chart đặt cắt lỗ xa hơn mức ATR gợi ý — mức đó vẫn đúng, nên giảm số cổ chứ không kéo cắt lỗ lại gần.',
    'Structure puts the stop wider than the ATR guide — that stands, so the share count shrinks instead of the stop moving in.',
  ],
  // The only warning in this table that says a number was CHANGED, so it says which rule
  // changed it and where to go and argue with that rule.
  stopCappedByMax: [
    'Đáy cấu trúc sâu hơn mức cắt lỗ tối đa (EMA / ATR) nên cắt lỗ đã kéo lên đúng mức đó — muốn giữ nguyên đáy thì đổi ở ⚙ Playbook.',
    'The structural low sat deeper than the maximum stop (EMA / ATR), so the stop was pulled up to it — change that in ⚙ Playbook if you would rather keep the low.',
  ],
  belowMinRR: [
    'Dưới R:R tối thiểu. Theo Playbook: bỏ qua, mẫu hình đẹp mấy cũng vậy.',
    'Under the minimum R:R. The book: skip it, however pretty the pattern.',
  ],
  fellBackToAtr: [
    'Không có đáy nào dưới giá vào để neo — dùng ATR thay thế.',
    'No low below the entry to anchor on — used ATR instead.',
  ],
  emaTargetBelowEntry: [
    'EMA chốt lời vẫn nằm dưới giá vào, nên chưa đặt được mục tiêu.',
    'The exit EMA is not above the entry yet, so there is no target to set.',
  ],
  measuredMoveTooSmall: [
    'Chiều cao nền chưa đủ R:R tối thiểu — dùng bội số R thay thế.',
    'The base height came out under the minimum R:R — used the R multiple.',
  ],
};

export const SIZE_WARN: Record<string, [string, string]> = {
  heatExceeded: [
    'Tổng rủi ro đang mở đã chạm hạn mức — đóng bớt hoặc nâng cắt lỗ một vị thế trước đã.',
    'Total open risk is already at the limit — close or tighten something first.',
  ],
  noNewLongs: ['Thị trường ở xu hướng giảm: không mở lệnh mua mới.', 'Downtrend: no new longs.'],
  tooManyPositions: [
    'Đã đủ số vị thế tối đa của bậc rủi ro hiện tại.',
    'Already at the position count for this risk rung.',
  ],
  notEnoughCash: ['Tiền mặt còn lại không đủ mua nổi một cổ.', 'Not enough cash for a single share.'],
};

export const SIZE_LIMIT: Record<string, [string, string]> = {
  risk: ['rủi ro mỗi lệnh', 'risk per trade'],
  cash: ['tiền mặt còn lại', 'cash on hand'],
  concentration: ['tỷ trọng tối đa một mã', 'max weight in one name'],
  heat: ['tổng rủi ro đang mở', 'total open risk'],
};

export const REGIME_SHORT: Record<string, [string, string]> = {
  UPTREND: ['tăng', 'uptrend'],
  UPTREND_UNDER_STRESS: ['tăng nhưng chịu áp lực', 'uptrend under stress'],
  RANGE: ['đi ngang', 'range'],
  DOWNTREND: ['giảm', 'downtrend'],
};

/** Why each cut applied, for the "risk for this trade" line. */
export const CUT_SHORT: Record<string, [string, string]> = {
  regimeDowntrend: ['thị trường giảm', 'downtrend'],
  volExpanded: ['biến động mở rộng', 'volatility expanded'],
  regimeStress: ['xu hướng tăng đang chịu áp lực', 'uptrend under stress'],
  regimeRange: ['thị trường đi ngang', 'range'],
  losingStreak: ['chuỗi lỗ liên tiếp', 'losing streak'],
  flooredAtMin: ['đã chạm mức rủi ro tối thiểu', 'hit the risk floor'],
  // No `rating` entry, and that is the point: the grade is not one of the ladder's cuts
  // any more. It scales the finished position, so it gets its own line with the
  // subtraction spelled out rather than a word in a list of penalties.
};

/**
 * What each grade means, said out loud next to the number.
 *
 * The grade is the only input to the size that comes from nowhere but the user's own
 * judgement, so the app has to show what it did with it. "C" on its own is a letter;
 * "C → 50% of the budget" is a decision the user can disagree with.
 */
export const RATING_MEANS: Record<string, [string, string]> = {
  A: ['đúng thứ mình muốn — vào đủ size', 'exactly what you wanted — full size'],
  B: ['tốt, nhưng còn điểm chưa ổn', 'good, with something not quite right'],
  C: ['tạm được — vào nhỏ', 'acceptable — go small'],
  D: ['yếu; nên cân nhắc bỏ hẳn', 'weak; consider skipping it altogether'],
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
 * One labelled fact about the plan.
 *
 * `k` empty means the row stands on its own — a warning, or a note about the book. Those
 * have no label because inventing one ("Warning: ⚠ …") would add a word and no information.
 */
export interface PlanRow {
  /** The label, already in the reader's language. Plain text. */
  k: string;
  /** The value. HTML, and may carry `<b>` and muted spans. */
  v: string;
  /** `warn` paints the whole row in the warning colour. */
  tone?: 'warn';
}

/**
 * Labels for the rows. The words were already in this file, inline in the old one-line-per-
 * fact strings; pulling them into a table is what let the same fact be rendered two ways.
 */
const ROW_LABEL: Record<string, [string, string]> = {
  stop: ['Cắt lỗ', 'Stop'],
  target: ['Mục tiêu', 'Target'],
  shares: ['Số cổ', 'Shares'],
  risk: ['Rủi ro', 'Risk'],
  grade: ['Hạng', 'Grade'],
  cuts: ['Giảm size vì', 'Size cut by'],
  market: ['Thị trường', 'Market'],
};

/**
 * Secondary detail, muted BOTH ways at once — and that is deliberate, not belt and braces.
 *
 * The class is what the app's own stylesheet knows about; the inline colour is what survives
 * `sanitizeNoteHtml`, which strips every attribute except a few inline styles. The note is the
 * one place these rows are stored rather than rendered, so without the inline copy the whole
 * explanation arrives in the note as one flat wall of same-coloured text — which is exactly
 * what the user was looking at when they asked for this to be "structured dep hon".
 */
function mu(s: string): string {
  return `<span class="muted" style="color:var(--subtext,#99a2b2)">${s}</span>`;
}

const WARN_STYLE = 'color:var(--warn,#ffb648)';

/**
 * The plan, explained — one labelled row per fact.
 *
 * Order is the order the decision was made in: where the stop goes, then what it is aiming at,
 * therefore how many shares, therefore how much money is on the table, and only then the grade,
 * the market and the warnings. A reader who stops after three rows has still read the stop, the
 * target and the share count.
 */
export function planRows(plan: BuyPlan, opts: PlanWordOpts): PlanRow[] {
  const { vi, levelSym, moneySym } = opts;
  const L = (k: string): string => (vi ? ROW_LABEL[k]![0] : ROW_LABEL[k]![1]);
  const rows: PlanRow[] = [];

  // What the stop is hanging on — the anchor, UNLESS the cap overrode it. Naming the
  // anchor for a capped stop would describe a level the plan does not contain: the whole
  // point of the cap is that the stop is no longer at the low.
  // No price is printed for the cap: `plan.stop` is in the form's currency and
  // `plan.levels.maxStopPrice` is raw USD, and one of those with the other's symbol in
  // front of it is exactly the silent error `fromUsd` exists to avoid.
  const capped = plan.levels.warnings.includes('stopCappedByMax');
  const anchor = ANCHOR_MEANS[plan.levels.rule.means];
  const stopWhy = capped
    ? (vi ? 'đã kéo lên mức cắt lỗ tối đa (EMA / ATR)' : 'pulled up to the maximum stop (EMA / ATR)')
    : (vi ? anchor![0] : anchor![1]);
  rows.push({
    k: L('stop'),
    v: `<b>${levelSym}${num(plan.stop)}</b> ${mu(`${plan.stopPct.toFixed(1)}% — ${stopWhy}`)}`,
  });
  // Its own row now. It used to share the stop's line behind a `·`, which is how the two
  // numbers a trade is actually made of ended up as the middle of a paragraph.
  if (plan.target !== null) {
    rows.push({
      k: L('target'),
      v: `<b>${levelSym}${num(plan.target)}</b>` +
        (plan.rMultiple !== null ? ` ${mu(`${plan.rMultiple.toFixed(1)}R`)}` : ''),
    });
  }

  const limit = plan.size.limitedBy ? SIZE_LIMIT[plan.size.limitedBy] : null;
  // The risk that is ACTUALLY on the table, not the budget it was drawn from. Those are
  // the same number only at full size and only when risk was the binding limit; printing
  // the budget for a graded or capped position overstates the trade by the same amount
  // the user just deliberately took off it.
  const realRisk = plan.size.riskPctOfEquity;
  const budgeted = plan.budget.pct;
  const differs = Math.abs(realRisk - budgeted) >= 0.01 && plan.shares > 0;
  rows.push({
    k: L('shares'),
    v: `<b>${plan.shares}</b> ${vi ? 'cổ' : 'sh'}` +
      (limit ? ` ${mu(`· ${vi ? 'size đầy đủ bị giới hạn bởi' : 'full size bound by'} ${vi ? limit[0] : limit[1]}`)}` : ''),
  });
  // Split off the share count, because it answers a different question: not "how big is this
  // position" but "how much of the account is at stake if the stop is hit". The two used to run
  // together into one line nobody read to the end of.
  rows.push({
    k: L('risk'),
    v: `<b>${differs ? realRisk : budgeted}%</b>` +
      (opts.money && plan.size.riskAmount > 0
        ? ` ${mu(`(${moneySym}${num(plan.size.riskAmount, 0)})`)}`
        : '') +
      (differs ? ` ${mu(`${vi ? 'trên hạn mức' : 'of a'} ${budgeted}% ${vi ? '' : 'budget'}`)}` : '') +
      ` ${mu(`(${vi ? 'bậc' : 'rung'} ${plan.budget.stage.stage}, ` +
        `${plan.budget.stage.closedTrades} ${vi ? 'lệnh đã đóng' : 'closed trades'})`)}` +
      ` · ${mu(vi ? 'tổng rủi ro mở sau lệnh' : 'open risk after')} <b>${plan.size.heatPctAfter}%</b>`,
  });

  // ── THE GRADE, WITH THE SUBTRACTION SHOWN ─────────────────────────────────
  // Its own row, not a parenthesis, because it is the one input the app cannot check:
  // if the size looks wrong, this is the line to argue with. And it shows BOTH counts —
  // full size and what the grade left — because "18 shares" alone gives the user no way
  // to tell whether the dropdown did anything. That was the actual complaint that led
  // here: the grade moved and the number did not.
  if (plan.rating) {
    const means = RATING_MEANS[plan.rating];
    const { fullShares, gradeScale, fullPositionValue, positionValue } = plan.size;
    const money = (v: number): string => (opts.money ? ` ${mu(`(${moneySym}${num(v, 0)})`)}` : '');
    const scaled = gradeScale !== 1 && fullShares > 0;
    rows.push({
      k: L('grade'),
      v: `<b>${plan.rating}</b>` +
        (means ? ` — ${mu(vi ? means[0] : means[1])}` : '') +
        (scaled
          ? ` · ${mu(vi ? 'size đầy đủ' : 'full size')} ${fullShares} ${vi ? 'cổ' : 'sh'}${money(fullPositionValue)}` +
            ` → ${Math.round(gradeScale * 100)}% → <b>${plan.shares}</b> ${vi ? 'cổ' : 'sh'}${money(positionValue)}`
          : ` ${mu(`(${vi ? 'không giảm size' : 'no size cut'})`)}`),
    });
  }

  const cuts = plan.budget.cuts.map((c) => {
    const w = CUT_SHORT[c];
    return w ? (vi ? w[0] : w[1]) : c;
  });
  if (cuts.length) rows.push({ k: L('cuts'), v: mu(cuts.join(' · ')) });

  const r = plan.regime;
  rows.push({
    k: L('market'),
    v: mu(
      r
        ? `${vi ? REGIME_SHORT[r.regime]![0] : REGIME_SHORT[r.regime]![1]} (SPY ${r.asOf}` +
          `${regimeStale() ? (vi ? ', đã cũ' : ', stale') : ''})` +
          (r.atrRatio !== null ? ` · ATR ${r.atrRatio}×` : '')
        : (vi ? 'chưa xác định được — bấm ↻ Cập nhật' : 'not established yet — press ↻ Update'),
    ),
  });

  for (const w of plan.levels.warnings) {
    const m = LEVEL_WARN[w];
    if (m) rows.push({ k: '', v: `⚠ ${vi ? m[0] : m[1]}`, tone: 'warn' });
  }
  for (const w of plan.size.warnings) {
    const m = SIZE_WARN[w];
    if (m) rows.push({ k: '', v: `⚠ ${vi ? m[0] : m[1]}`, tone: 'warn' });
  }
  if (plan.levels.rule.source === 'derived') {
    rows.push({
      k: '',
      v: mu(vi
        ? 'Playbook không có dòng cho setup này — các con số chỉ là suy ra, nên xem lại.'
        : 'The book has no row for this setup — these numbers are extrapolated, worth a look.'),
    });
  }

  return rows;
}

/**
 * The rows as one string each — for the live hint under the Buy form's fields, which the
 * caller joins with `<br>`.
 */
export function planLines(plan: BuyPlan, opts: PlanWordOpts): string[] {
  return planRows(plan, opts).map((r) => {
    const body = r.k ? `<b>${r.k}</b> ${r.v}` : r.v;
    return r.tone === 'warn' ? `<span style="${WARN_STYLE}">${body}</span>` : body;
  });
}

/**
 * The rows as a titled list, for the rich-text note.
 *
 * ── WHY A HEADING AND A LIST AND NOT A TABLE ────────────────────────────────
 * The user asked for this block to be "structured dep hon (table hay mot gi do that dep)", and a
 * two-column table is the obvious answer — but this HTML is not rendered, it is STORED, in a
 * note the user then edits by hand. `sanitizeNoteHtml` keeps a deliberately small subset of tags
 * and `TABLE` is not in it, so a table would arrive in the note as its own text with the grid
 * unwrapped: worse than what it replaced. A heading plus `<ul>` with a bold label per row does
 * survive, aligns the eye down the labels, and matches the shape the second half of this very
 * note is already in (`explainHtml` writes an `<h3>` and a list). One note, one layout.
 */
export function planNoteHtml(plan: BuyPlan, opts: PlanWordOpts): string {
  const items = planRows(plan, opts).map((r) => {
    const body = r.k ? `<b>${r.k}</b> — ${r.v}` : r.v;
    return `<li>${r.tone === 'warn' ? `<span style="${WARN_STYLE}">${body}</span>` : body}</li>`;
  }).join('');
  return `<h3>${opts.vi ? 'Các con số' : 'The numbers'}</h3><ul>${items}</ul>`;
}
