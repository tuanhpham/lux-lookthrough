/**
 * The place to change the playbook's numbers.
 *
 * ── WHY IT SAVES ONLY THE DIFFERENCES ───────────────────────────────────────
 * Every input here starts at a shipped default. Writing all 60-odd values back on
 * Save would freeze this version of the table into the user's synced data forever:
 * a later correction to, say, the Surge lookback would never reach them, and there
 * would be no way to tell a number they chose from one they merely saw. So Save
 * stores ONLY the fields that differ, and "Reset" is a delete rather than a write.
 *
 * ── WHY THE TOP OF THE DIALOG IS READ-ONLY ──────────────────────────────────
 * The regime, the closed-trade count and the resulting risk budget are shown but not
 * editable, because they are facts about the market and about the user's own record.
 * Showing them here is the point: the ladder's answer ("0.25%, halved twice, floored")
 * is otherwise invisible, and a number the user cannot see is a number they will
 * override by feel.
 *
 * ── WHY A PINNED PERCENT IS ALLOWED AT ALL ──────────────────────────────────
 * The book is firm that size follows the record, and the automatic ladder is the
 * default. But it is their money, and a rule with no override gets worked around in
 * ways the app cannot see (entering a smaller position by hand and losing the
 * suggestion entirely). An explicit, visible pin is the honest version of that.
 *
 * ── WHY HALF OF THIS FILE IS EXPLANATION ────────────────────────────────────
 * Two things in here were unreadable, and both were reported as such: the opening
 * line of SPY numbers ("Range · SPY 771.35 · MA50 … — what is that, where is it
 * from?") and the eleven columns of "Rules per setup", whose meanings lived in
 * `title=` tooltips — invisible on a phone, and invisible to anyone who does not
 * already suspect there is something to hover. So:
 *
 *   · the regime is a card that names the measurement that produced the label, what
 *     each of the five numbers is, and what the label costs in position size;
 *   · the risk budget is a chain — base percent, each cut, the answer — because the
 *     cuts multiply and a single number cannot say why it is what it is;
 *   · the rules table is grouped into the three questions it actually answers (where
 *     am I wrong / where am I right / how does the rest run), each with a colour that
 *     follows through into a visible legend;
 *   · and a worked example plans ONE fictional trade with whatever is in the boxes
 *     right now, so "Pad %" stops being a word and becomes 97.62 → 97.33.
 *
 * `ui/playbookHelp.ts` owns that copy and the example's arithmetic; this file is the
 * layout. The example is computed by `suggestLevels` — the same function the Buy form
 * uses — so it cannot drift from what the app will actually do.
 */
import {
  DEFAULT_RISK_LADDER,
  DEFAULT_GRADE_THRESHOLDS,
  DEFAULT_SETUP_RULES,
  GRADE_CRITERIA,
  SETUP_KEYS,
  RATING_KEYS,
  closedTradePnls,
  riskBudget,
  riskStageOf,
  type RiskCut,
  type RiskLadderConfig,
  type RiskStage,
  type SetupKey,
  type SetupRule,
  type SetupRuleOverrides,
  type AccountState,
  type RegimeRead,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { getLang } from './i18n.js';
import {
  currentRegime, ladderConfig, loadPlaybookConfig, playbookConfig,
  savePlaybookConfig, regimeStale, gradeThresholds, EMPTY_PLAYBOOK_CONFIG,
  notifyPlaybookChanged,
  type PlaybookConfig,
} from '../portfolio/playbook.js';
// Shared with the Buy form and the Trade Planner, so all three dropdowns spell the
// setups the same way.
import { setupName } from '../portfolio/planWords.js';
import { candleChart, emaOf, type Level, type Note, type Zone } from './miniChart.js';
import {
  DEMO_CANDLES, DEMO_ENTRY, REGIME_DOC, REGIME_STATS, RULE_GROUPS, SETUP_COLUMNS,
  demoLevels, exampleSteps, exampleWarnings,
  type RuleField, type RuleGroup,
} from './playbookHelp.js';

/** Editable numeric fields of a setup rule. The first three are in column order. */
const NUM_FIELDS = [
  'lookback', 'padPct', 'atrMult',
  'maxStopEma', 'firstTargetR', 'targetEma', 'trailEma', 'maxHoldSessions',
] as const;
type NumField = (typeof NUM_FIELDS)[number];

/** Numeric fields where an empty box means "none" rather than "keep the default". */
const NULLABLE_FIELDS: readonly NumField[] = ['maxStopEma', 'targetEma', 'trailEma', 'maxHoldSessions'];

const LADDER_FIELDS: { key: keyof RiskLadderConfig; vi: string; en: string; hint: { vi: string; en: string } }[] = [
  { key: 'learningPct', vi: 'Rủi ro khi đang học (%)', en: 'Risk while learning (%)',
    hint: { vi: 'Dưới số lệnh đã đóng bên dưới, hoặc khi kỳ vọng còn âm.', en: 'Under the closed-trade count below, or while expectancy is negative.' } },
  { key: 'provingPct', vi: 'Rủi ro khi đang chứng minh (%)', en: 'Risk while proving (%)',
    hint: { vi: 'Đã đủ số lệnh và kỳ vọng dương.', en: 'Past the trade count with a positive expectancy.' } },
  { key: 'stablePct', vi: 'Rủi ro khi đã ổn định (%)', en: 'Risk when stable (%)',
    hint: { vi: 'Cẩm nang: không có lý do gì để vượt 1%.', en: 'The book: there is no good reason to exceed 1%.' } },
  { key: 'learningTrades', vi: 'Số lệnh để hết "đang học"', en: 'Trades to leave “learning”',
    hint: { vi: 'Một lệnh = một lô bán hết, không phải một dòng bán.', en: 'One trade = one lot sold out, not one sell row.' } },
  { key: 'stableTrades', vi: 'Số lệnh để lên "ổn định"', en: 'Trades to reach “stable”', hint: { vi: '', en: '' } },
  { key: 'losingStreakTrigger', vi: 'Số lệnh lỗ liên tiếp thì giảm nửa', en: 'Losing streak that halves size', hint: { vi: '', en: '' } },
  { key: 'minRiskPct', vi: 'Sàn rủi ro (%)', en: 'Risk floor (%)',
    hint: { vi: 'Hai lần giảm nửa cộng lại không được về 0 — kế hoạch 0 cổ đọc như lỗi.', en: 'Two stacked halvings must not reach zero; a 0-share plan reads like a bug.' } },
  { key: 'maxPortfolioHeatPct', vi: 'Tổng rủi ro mở tối đa (%)', en: 'Max total open risk (%)',
    hint: { vi: 'Giới hạn không ai để ý: từng lệnh đúng cỡ, năm lệnh cộng lại thì không.', en: 'The limit nobody notices: each trade sized right, five of them not.' } },
  { key: 'maxPositionPct', vi: 'Tỷ trọng tối đa một mã (%)', en: 'Max one position (%)', hint: { vi: '', en: '' } },
  { key: 'minRR', vi: 'R:R tối thiểu', en: 'Minimum R:R',
    hint: { vi: 'Dưới mức này cẩm nang nói bỏ qua, bất kể mẫu hình đẹp đến đâu.', en: 'Below this the book says skip it, however pretty the pattern.' } },
];

const ANCHORS: { value: SetupRule['anchor']; vi: string; en: string }[] = [
  { value: 'signalBarLow', vi: 'Đáy nến tín hiệu', en: 'Signal bar low' },
  { value: 'lowestLowN', vi: 'Đáy thấp nhất N phiên', en: 'Lowest low of N' },
  { value: 'atr', vi: 'Theo ATR', en: 'By ATR' },
];
const MAX_STOP_REFS: { value: SetupRule['maxStopRef']; vi: string; en: string }[] = [
  { value: 'deeper', vi: 'Mốc sâu hơn', en: 'The deeper one' },
  { value: 'shallower', vi: 'Mốc gần hơn', en: 'The nearer one' },
  { value: 'off', vi: 'Không chặn', en: 'No cap' },
];
const TARGETS: { value: SetupRule['targetKind']; vi: string; en: string }[] = [
  { value: 'rMultiple', vi: 'Bội số R', en: 'R multiple' },
  { value: 'measuredMove', vi: 'Chiều cao nền', en: 'Measured move' },
  { value: 'ema', vi: 'Chạm EMA', en: 'At an EMA' },
];

/** `null` shows as an empty box — "no trail", "never expires" — not as a 0. */
function numVal(v: number | null): string {
  return v === null ? '' : String(v);
}

function numInput(setup: SetupKey, field: NumField, value: number | null): string {
  return `<input class="field" data-setup="${setup}" data-field="${field}" type="text"
    inputmode="decimal" autocorrect="off" autocapitalize="off"
    value="${numVal(value)}" style="width:100%;min-width:52px;padding:4px 6px;font-size:12px;text-align:right" />`;
}

const f2 = (v: number): string => v.toFixed(2);

/** A coloured heading: the group's colour appears here before the table uses it. */
function secHtml(title: string, sub: string, tone = 'var(--accent)'): string {
  return `<div class="pb-sec" style="--pb-tone:${tone}">
    <span class="pb-sec-t">${title}</span>
    ${sub ? `<span class="pb-sec-s">${sub}</span>` : ''}
  </div>`;
}

// ---------------------------------------------------------------------------
// The market-regime card
// ---------------------------------------------------------------------------

/**
 * "Range · SPY 771.35 · MA50 … · 2026-09-28" — what it is, where it is from, and
 * what it costs.
 *
 * This used to be one muted run-on line, and it was the first thing in the dialog,
 * which is a bad combination: the most consequential fact on the screen (a downtrend
 * means the app will refuse to plan a long at all) looked like a debug print. Each
 * number now carries its own label and its own note, and the label at the top is
 * followed by the measurement that produced it.
 */
function regimeHtml(r: RegimeRead | null, vi: boolean): string {
  if (!r) {
    return `<div class="pb-hero" style="--pb-tone:var(--faint)">
      <div class="pb-hero-top"><span class="pb-pill">${vi ? 'Chưa biết trạng thái thị trường' : 'Market regime unknown'}</span></div>
      <p class="pb-why">${vi
        ? 'Cần ít nhất <b>210 phiên</b> của SPY để đo (200 cho MA200, 10 cho độ dốc) và app chưa có đủ. Bấm <b>↻ Cập nhật</b> ở tab Portfolio. Trong lúc chờ, app coi như <b>không có khoản giảm nào</b> — nó sẽ không tự nghĩ ra một hình phạt cho dữ liệu còn thiếu.'
        : 'Naming it needs at least <b>210 SPY sessions</b> (200 for the 200MA, 10 for the slope) and the app does not have them yet. Press <b>↻ Update</b> on the Portfolio tab. Until then the app applies <b>no cut at all</b> — it will not invent a penalty for missing data.'}</p>
    </div>`;
  }

  const doc = REGIME_DOC[r.regime];
  const above = (v: number): string => (r.close > v
    ? `<span class="pb-rel" style="color:var(--accent)">${vi ? 'giá TRÊN' : 'price ABOVE'}</span>`
    : `<span class="pb-rel" style="color:var(--danger)">${vi ? 'giá DƯỚI' : 'price BELOW'}</span>`);
  const slopeRel = r.slope50Pct > 0.5
    ? `<span class="pb-rel" style="color:var(--accent)">${vi ? 'đang lên' : 'rising'}</span>`
    : r.slope50Pct < -0.5
      ? `<span class="pb-rel" style="color:var(--danger)">${vi ? 'đang xuống' : 'falling'}</span>`
      : `<span class="pb-rel" style="color:var(--warn)">${vi ? 'nằm ngang' : 'flat'}</span>`;
  const atrRel = r.atrRatio === null
    ? `<span class="pb-rel" style="color:var(--faint)">${vi ? 'chưa đo được' : 'not measured'}</span>`
    : r.atrRatio > 1.3
      ? `<span class="pb-rel" style="color:var(--warn)">${vi ? 'giãn ra' : 'expanded'}</span>`
      : `<span class="pb-rel" style="color:var(--accent)">${vi ? 'như thường' : 'as usual'}</span>`;

  const values: Record<string, string> = {
    close: f2(r.close),
    ma50: f2(r.ma50),
    ma200: f2(r.ma200),
    slope: `${r.slope50Pct > 0 ? '+' : ''}${r.slope50Pct}%`,
    atr: r.atrRatio === null ? '—' : `${r.atrRatio}×`,
  };
  const rels: Record<string, string> = {
    close: '', ma50: above(r.ma50), ma200: above(r.ma200), slope: slopeRel, atr: atrRel,
  };

  return `<div class="pb-hero" style="--pb-tone:${doc.color}">
    <div class="pb-hero-top">
      <span class="pb-pill">${vi ? doc.vi : doc.en}</span>
      <span class="pb-pill-note">${vi ? 'Cỡ vị thế' : 'Position size'}: <b>${vi ? doc.sizeVi : doc.sizeEn}</b></span>
    </div>
    <p class="pb-why"><b>${vi ? 'Vì sao gọi tên này' : 'Why that name'}:</b> ${vi ? doc.testVi : doc.testEn}</p>
    <div class="pb-stats">
      ${REGIME_STATS.map((s) => `
        <div class="pb-stat">
          <div class="pb-stat-k">${vi ? s.vi : s.en}</div>
          <div class="pb-stat-v">${values[s.key]} ${rels[s.key]}</div>
          <div class="pb-stat-n">${vi ? s.noteVi : s.noteEn}</div>
        </div>`).join('')}
    </div>
    <p class="pb-why">${vi
      ? `<b>Lấy từ đâu:</b> app tự đo từ <b>nến ngày của SPY</b> — chính dữ liệu bạn tải về bằng nút <b>↻ Cập nhật</b> ở tab Portfolio — chứ không ai nhập tay và cũng không phải dự báo. Nó chỉ mô tả những gì đã xảy ra tính đến hết phiên <b>${r.asOf}</b>.`
      : `<b>Where it comes from:</b> the app measures it from <b>SPY daily bars</b> — the same data the <b>↻ Update</b> button on the Portfolio tab fetches. Nobody types it in and it forecasts nothing: it describes what has already happened, up to the close of <b>${r.asOf}</b>.`}
      ${regimeStale()
        ? `<br><span class="pb-warn">⚠️ ${vi
            ? 'Số liệu này đã cũ — hãy cập nhật trước khi dựa vào nó để tính cỡ vị thế.'
            : 'This read is stale — update before sizing anything on it.'}</span>`
        : ''}</p>
  </div>`;
}

/** The record and the risk budget: base percent, each cut, the answer. */
function budgetHtml(state: AccountState, vi: boolean): string {
  const r = currentRegime();
  const ladder = ladderConfig();
  const cfg = playbookConfig();
  const pnls = closedTradePnls(state);
  const stage = riskStageOf(pnls, ladder);
  const budget = riskBudget(stage, { regime: r?.regime ?? null, atrRatio: r?.atrRatio ?? null }, ladder);
  // Keyed by the union rather than by `string`, so a seventh cut or a fourth stage in
  // core fails the BUILD here instead of rendering `undefined` into the chain.
  const stageLabel: Record<RiskStage, [string, string]> = {
    learning: ['đang học', 'learning'], proving: ['đang chứng minh', 'proving'], stable: ['ổn định', 'stable'],
  };
  const cutText: Record<RiskCut, [string, string]> = {
    regimeDowntrend: ['thị trường giảm → không mở lệnh mua mới', 'downtrend → no new longs'],
    volExpanded: ['biến động giãn ra → giảm nửa', 'volatility expanded → halved'],
    regimeStress: ['xu hướng tăng đang căng → giảm nửa', 'uptrend under stress → halved'],
    regimeRange: ['thị trường đi ngang → giảm nửa', 'range → halved'],
    losingStreak: [`${ladder.losingStreakTrigger} lệnh lỗ liên tiếp → giảm nửa`, `${ladder.losingStreakTrigger} losses in a row → halved`],
    // No `rating` entry, and the omission is the point: the conviction grade is no longer
    // one of these cuts. It scales the FINISHED share count in `suggestSize`, because risk
    // percent is only one of the four limits on a position and scaling it did nothing
    // whenever another limit was the binding one. Every cut listed here is something the
    // app decided on the user's behalf; the grade is the user choosing smaller.
    flooredAtMin: ['đã chạm sàn rủi ro', 'hit the risk floor'],
  };
  const pinned = cfg.pinnedRiskPct !== null;
  const tone = budget.pct === 0 ? 'var(--danger)' : pinned ? 'var(--blue)' : 'var(--up)';

  return `<div class="pb-note" style="--pb-tone:${tone};margin-top:10px">
    <div class="pb-chain">
      <span>${vi ? 'Bậc' : 'Rung'} <b>${vi ? stageLabel[stage.stage][0] : stageLabel[stage.stage][1]}</b>
        → ${vi ? 'cỡ đầy đủ' : 'full size'} <b>${stage.basePct}%</b></span>
      ${budget.cuts.map((c) => `<span class="pb-chain-arrow">→</span><span class="pb-cut">${
        vi ? cutText[c][0] : cutText[c][1]}</span>`).join('')}
      <span class="pb-chain-arrow">→</span>
      <span class="pb-final">${pinned ? cfg.pinnedRiskPct : budget.pct}%</span>
      <span>${vi ? 'mỗi lệnh, tối đa' : 'per trade, up to'} <b>${budget.maxPositions}</b> ${vi ? 'vị thế' : 'positions'}</span>
      ${pinned ? `<span class="pb-cut" style="color:var(--blue);background:color-mix(in srgb,var(--blue) 12%,transparent);border-color:color-mix(in srgb,var(--blue) 32%,transparent)">${
        vi ? `bạn đã ghim — thang tự động sẽ cho ${budget.pct}%` : `pinned by you — the ladder would say ${budget.pct}%`}</span>` : ''}
    </div>
    <div style="margin-top:7px">
      ${vi ? 'Hồ sơ của bạn' : 'Your record'}: <b>${pnls.length}</b> ${vi ? 'lệnh đã đóng' : 'closed trades'} ·
      ${vi ? 'kỳ vọng' : 'expectancy'} <b>${stage.expectancy > 0 ? '+' : ''}${stage.expectancy}</b> ${vi ? 'mỗi lệnh' : 'per trade'}
      ${stage.losingStreak > 0
        ? `· <b style="color:var(--warn)">${vi ? `đang lỗ ${stage.losingStreak} lệnh liên tiếp` : `${stage.losingStreak} losses in a row`}</b>`
        : ''}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Reading the boxes back
// ---------------------------------------------------------------------------

/**
 * The rule as the boxes currently say it — defaults with the user's edits applied.
 *
 * Shared by Save and by the worked example, deliberately: the example has to plan the
 * trade the user is ABOUT to save, including a number typed a second ago, and a second
 * reader of these inputs would be a second set of rules for what an empty box means.
 */
function readSetupBoxes(host: HTMLElement, k: SetupKey): SetupRule {
  const out: SetupRule = { ...DEFAULT_SETUP_RULES[k] };
  // One escape hatch for the whole loop: the field name comes from a `data-field`
  // attribute, so it is a string until it is checked, and every per-assignment cast
  // was a place to get a different one wrong.
  const w = out as unknown as Record<string, string | number | null>;
  const d = DEFAULT_SETUP_RULES[k] as unknown as Record<string, string | number | null>;
  for (const el of host.querySelectorAll<HTMLElement>(`[data-setup="${k}"]`)) {
    const field = el.dataset.field ?? '';
    if (!(field in w)) continue;
    const raw = (el as HTMLInputElement).value.trim().replace(',', '.');
    if (field === 'anchor' || field === 'targetKind' || field === 'maxStopRef') {
      if (raw) w[field] = raw;
      continue;
    }
    // Empty means null ("no trail", "never expires", "cap on ATR alone") for the fields
    // that allow it, and "leave the default alone" for the ones that do not.
    if (!raw) {
      if ((NULLABLE_FIELDS as readonly string[]).includes(field)) w[field] = null;
      continue;
    }
    const v = Number(raw);
    // Nonsense keeps the default rather than becoming a 0: a 0 here is a real setting
    // (a zero pad) and must never be something a half-typed number turned into.
    if (!Number.isFinite(v) || v < 0) continue;
    if (v !== d[field]) w[field] = v;
  }
  return out;
}

/** One ladder box as a number, or the saved value when it is blank or nonsense. */
function readLadderBox(host: HTMLElement, key: keyof RiskLadderConfig, fallback: number): number {
  const raw = (host.querySelector<HTMLInputElement>(`[data-ladder="${key}"]`)?.value ?? '')
    .trim().replace(',', '.');
  const v = Number(raw);
  return raw && Number.isFinite(v) && v >= 0 ? v : fallback;
}

// ---------------------------------------------------------------------------
// The worked example
// ---------------------------------------------------------------------------

/**
 * One fictional trade, planned with the boxes as they stand.
 *
 * The chart is the reason this exists rather than a paragraph: the shaded band IS
 * "N sessions", and the gap between the dashed low and the stop IS "Pad %". Both are
 * words that mean nothing until they are a distance on a chart.
 */
function exampleHtml(host: HTMLElement, k: SetupKey, vi: boolean): string {
  const rule = readSetupBoxes(host, k);
  const ladder = ladderConfig();
  const cfg: RiskLadderConfig = { ...ladder, minRR: readLadderBox(host, 'minRR', ladder.minRR) };
  const lv = demoLevels(k, rule, cfg);
  if (!lv) {
    return `<div class="pb-note">${vi
      ? 'Với những con số này app không dựng được kế hoạch nào trên đồ thị ví dụ — thường là vì cắt lỗ rơi lên trên hoặc trùng giá vào. Hãy xem lại Neo cắt lỗ và × ATR.'
      : 'With these numbers no plan can be built on the example chart at all — usually because the stop landed at or above the entry. Check the Stop anchor and × ATR.'}</div>`;
  }

  const n = DEMO_CANDLES.length;
  const levels: Level[] = [
    { y: DEMO_ENTRY, color: 'var(--blue)', label: f2(DEMO_ENTRY), dash: 'none' },
    { y: lv.stop, color: 'var(--danger)', label: f2(lv.stop) },
  ];
  if (lv.target !== null) levels.push({ y: lv.target, color: 'var(--accent)', label: f2(lv.target) });
  if (lv.anchorPrice !== null) {
    levels.push({ y: lv.anchorPrice, color: 'var(--faint)', label: f2(lv.anchorPrice), dash: '2 3' });
  }

  // The shaded band is the whole point of drawing this: `lookback` is abstract until
  // it is a width on a chart. Only drawn when the rule actually uses it.
  const usesN = rule.anchor === 'lowestLowN' || rule.targetKind === 'measuredMove';
  const zones: Zone[] = usesN
    ? [{
        from: Math.max(0, n - rule.lookback), to: n - 1,
        fill: 'color-mix(in srgb, var(--danger) 8%, transparent)',
        label: vi ? `${rule.lookback} phiên` : `${rule.lookback} sess`,
        color: 'var(--danger)',
      }]
    : [];
  const notes: Note[] = [{
    i: n - 1, at: 'below', text: vi ? 'nến tín hiệu' : 'signal bar', color: 'var(--faint)', dy: 12,
  }];
  const data = DEMO_CANDLES.map((c, i) => (i === n - 1 ? { ...c, ring: 'var(--blue)' } : c));
  const closes = DEMO_CANDLES.map((c) => c.c);
  const overlays = rule.maxStopRef !== 'off' && rule.maxStopEma
    ? [{ values: emaOf(closes, rule.maxStopEma), color: 'var(--warn)', width: 1.3 }]
    : [];

  const steps = exampleSteps(rule, lv, vi, cfg.minRR);
  const warns = exampleWarnings(lv, vi);
  const toneOf = (g: RuleGroup | 'result'): string =>
    RULE_GROUPS.find((x) => x.key === g)?.color ?? 'var(--border)';

  const key = (color: string, text: string): string =>
    `<span style="color:${color};font-weight:700">■</span> ${text}`;

  return `<div class="pb-eg">
    <div>
      <div class="pb-eg-fig">
        ${candleChart({
          data, levels, zones, notes, overlays, width: 560, height: 250, showVolume: false,
          title: vi ? 'Đồ thị ví dụ với giá vào, cắt lỗ và mục tiêu' : 'Example chart with entry, stop and target',
        })}
      </div>
      <div class="pb-eg-cap" style="padding-top:6px">
        ${key('var(--blue)', vi ? `giá vào ${f2(DEMO_ENTRY)}` : `entry ${f2(DEMO_ENTRY)}`)} ·
        ${key('var(--danger)', vi ? 'cắt lỗ' : 'stop')} ·
        ${lv.target !== null ? `${key('var(--accent)', vi ? 'mục tiêu' : 'target')} ·` : ''}
        ${lv.anchorPrice !== null ? `${key('var(--faint)', vi ? 'đáy được neo' : 'the anchor low')} ·` : ''}
        ${overlays.length ? `${key('var(--warn)', `EMA${rule.maxStopEma}`)} ·` : ''}
        ${vi
          ? `một mã tưởng tượng: tăng một nhịp, siết lại thành nền, và bạn đặt mua ở ${f2(DEMO_ENTRY)} — ngay trên đỉnh cây nến cuối.`
          : `a fictional stock: one advance, a tightening base, and a buy-stop at ${f2(DEMO_ENTRY)} — just above the last bar's high.`}
      </div>
    </div>
    <div class="pb-steps">
      ${steps.map((s) => `
        <div class="pb-step ${s.group === 'result' ? 'pb-step--result' : ''}" style="--pb-tone:${toneOf(s.group)}">
          <div class="pb-step-l">${s.label}</div>
          <div class="pb-step-v">${s.value}</div>
          <div class="pb-step-d">${s.detail}</div>
        </div>`).join('')}
      ${warns.length
        ? `<div class="pb-note" style="margin-top:3px">${warns.map((w) => `⚠️ ${w}`).join('<br>')}</div>`
        : ''}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// The dialog
// ---------------------------------------------------------------------------

/**
 * Open the dialog. `state` is the active account, used only for the read-only
 * status block — the dialog still works (and still saves) without one.
 */
export async function openPlaybookSettings(
  ctx: AppContext,
  state: AccountState | null,
  onSaved?: () => void,
): Promise<void> {
  await loadPlaybookConfig(ctx);
  const vi = getLang() === 'vi';
  const cfg = playbookConfig();
  const ladder = ladderConfig();
  const thresholds = gradeThresholds();

  /** The rule as it currently stands: default merged with the user's override. */
  const eff = (k: SetupKey): SetupRule => ({ ...DEFAULT_SETUP_RULES[k], ...(cfg.setups[k] ?? {}) });

  /** Where each group starts, so the header band and the dividing hairlines line up. */
  const groupOf = (f: RuleField): RuleGroup => SETUP_COLUMNS.find((c) => c.field === f)!.group;
  const colTone = (f: RuleField): string =>
    RULE_GROUPS.find((g) => g.key === groupOf(f))!.color;
  const isGroupStart = (i: number): boolean =>
    i > 0 && SETUP_COLUMNS[i]!.group !== SETUP_COLUMNS[i - 1]!.group;

  /** The editor for one cell. Driven by `SETUP_COLUMNS`, so a cell cannot end up
   *  under the wrong header. */
  const cellHtml = (k: SetupKey, field: RuleField, r: SetupRule): string => {
    const sel = (opts: { value: string; vi: string; en: string }[], cur: string, min: number): string =>
      `<select class="field" data-setup="${k}" data-field="${field}"
        style="width:100%;min-width:${min}px;padding:4px 6px;font-size:12px">
        ${opts.map((a) => `<option value="${a.value}"${a.value === cur ? ' selected' : ''}>${vi ? a.vi : a.en}</option>`).join('')}
      </select>`;
    if (field === 'anchor') return sel(ANCHORS, r.anchor, 130);
    if (field === 'maxStopRef') return sel(MAX_STOP_REFS, r.maxStopRef, 118);
    if (field === 'targetKind') return sel(TARGETS, r.targetKind, 120);
    return numInput(k, field as NumField, r[field as NumField]);
  };

  const host = document.createElement('div');
  host.className = 'modal';
  host.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-panel pb-modal">
      <div class="modal-head">
        <div>${vi ? '📖 Cấu hình cẩm nang' : '📖 Playbook settings'}</div>
        <button class="pb-x" style="background:0;border:0;color:var(--faint);font-size:22px;cursor:pointer">×</button>
      </div>
      <div class="modal-body" style="padding:16px;max-height:76vh;overflow:auto">

        ${secHtml(
          vi ? 'Thị trường hôm nay' : 'The market today',
          vi ? 'app đo, không sửa được — nhưng nó quyết định cỡ mọi lệnh bên dưới'
             : 'measured, not editable — and it decides the size of everything below',
          'var(--blue)',
        )}
        ${regimeHtml(currentRegime(), vi)}
        ${state ? budgetHtml(state, vi) : ''}

        <p class="pb-note" style="margin:14px 0 0">
          ${vi
            ? 'Mọi con số ở đây là một điểm khởi đầu hợp lý để bạn tự kiểm chứng, <b>không phải hằng số thiêng</b>. Ô để trống nghĩa là “không có” (không kéo theo EMA, không hết hạn) — khác với số 0. Khi bạn bấm <b>Lưu</b>, mọi kế hoạch <b>đang viết</b> trong app sẽ tự tính lại theo luật mới; cái đã mua, đã lưu kế hoạch hay đã lưu hồ sơ thì giữ nguyên con số lúc quyết định.'
            : 'Every number here is a reasonable starting point for you to verify, <b>not a sacred constant</b>. An empty box means “none” (no trail, never expires) — which is not the same as 0. When you press <b>Save</b>, every plan still being WRITTEN re-derives itself from the new rules; anything already bought, saved as a plan or filed as a case study keeps the numbers it was decided on.'}
        </p>

        ${secHtml(vi ? 'Cỡ vị thế — thang rủi ro' : 'Position size — the risk ladder',
          vi ? 'bạn được rủi ro bao nhiêu phần trăm tài khoản, và khi nào' : 'what percent of the account you may risk, and when')}
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px 18px">
          ${LADDER_FIELDS.map((f) => `
            <div>
              <label class="field-label" style="margin-bottom:2px">${vi ? f.vi : f.en}</label>
              <input class="field" data-ladder="${f.key}" type="text" inputmode="decimal"
                autocorrect="off" autocapitalize="off" value="${ladder[f.key as 'minRR']}"
                style="width:100%;padding:5px 7px;font-size:12px" />
              ${(vi ? f.hint.vi : f.hint.en)
                ? `<div class="muted" style="font-size:11px;line-height:1.4;margin-top:2px">${vi ? f.hint.vi : f.hint.en}</div>`
                : ''}
            </div>`).join('')}
        </div>

        <div style="margin-top:14px">
          <label class="field-label" style="margin-bottom:2px">
            ${vi ? 'Ghim rủi ro mỗi lệnh (%) — để trống để dùng thang tự động' : 'Pin risk per trade (%) — empty to use the automatic ladder'}
          </label>
          <input class="field" id="pb-pinned" type="text" inputmode="decimal" autocorrect="off" autocapitalize="off"
            value="${cfg.pinnedRiskPct ?? ''}" placeholder="${vi ? 'tự động' : 'automatic'}"
            style="width:160px;padding:5px 7px;font-size:12px" />
          <div class="muted" style="font-size:11px;line-height:1.4;margin-top:2px">
            ${vi
              ? 'Ghim vẫn không mở lệnh mua mới khi thị trường ở xu hướng giảm: đó là luật “có giao dịch hay không”, không phải luật “to bao nhiêu”.'
              : 'A pin still refuses new longs in a downtrend: that rule is about whether to trade, not about how big.'}
          </div>
        </div>

        ${secHtml(vi ? 'Cỡ theo xếp hạng' : 'Size by grade',
          vi ? 'lệnh hạng thấp thì nhỏ đi bao nhiêu' : 'how much smaller a lower-graded trade gets')}
        <p class="pb-note" style="margin:0 0 10px">
          ${vi
            ? 'Phần cỡ vị thế mà mỗi hạng được lấy, tính theo % của cỡ đầy đủ. <b>A là 100</b> vì A nghĩa là “đúng cái lệnh mà thang rủi ro được viết cho”. Ba hạng còn lại là số của app, không phải của cẩm nang — nên mới cho sửa. Trong Trade Planner, hạng do bảng tiêu chí tự tính ra, không phải tự chọn; chưa đủ dữ liệu để xếp hạng thì lệnh vẫn được cỡ đầy đủ.'
            : 'The share of the FINISHED position each grade gets, as a percent of full size. <b>A is 100</b> because A <i>means</i> “the trade the ladder was written for”. The other three are the app’s numbers, not the book’s — which is exactly why they are editable. In the Trade Planner the grade is scored from a criteria checklist rather than chosen; when too little can be measured to name a letter, the trade is planned at full size.'}
        </p>
        <div class="row" style="gap:10px;flex-wrap:wrap">
          ${RATING_KEYS.map((k) => `
            <div style="width:110px">
              <label class="field-label" style="margin-bottom:2px">${vi ? 'Hạng' : 'Grade'} ${k} (%)</label>
              <input class="field" data-rating="${k}" type="text" inputmode="decimal"
                autocorrect="off" autocapitalize="off" value="${ladder.ratingPct[k]}"
                style="width:100%;padding:5px 7px;font-size:12px;text-align:right" />
            </div>`).join('')}
        </div>
        <div class="muted" style="font-size:11px;line-height:1.4;margin-top:4px">
          ${vi
            ? 'Phần này nhân vào số cổ đã tính xong, chứ không nằm trong chồng giảm nửa vì thị trường: % rủi ro chỉ là một trong bốn giới hạn, nên nếu giới hạn tập trung 25% đang quyết định cỡ thì giảm % rủi ro sẽ không đổi được gì. Sàn rủi ro vì thế không chặn phần này — nó để chặn app tự bóp lệnh, không phải để chặn bạn. Nhưng hạng thấp nhất vẫn luôn còn ít nhất 1 cổ.'
            : 'This multiplies the finished share count rather than sitting in the stack of market halvings: risk percent is only one of four limits, so cutting it changed nothing whenever the 25% concentration cap was the binding one. The risk floor therefore does not catch this cut — the floor exists to stop the APP whittling a position away, not to stop you. The lowest grade still never falls below 1 share.'}
        </div>

        ${secHtml(vi ? 'Xếp hạng — hai đường A/B/C' : 'Grading — where A/B/C fall',
          vi ? 'độ khắt khe của riêng bạn' : 'your own selectivity')}
        <p class="pb-note" style="margin:0 0 10px">
          ${vi
            ? `Điểm tối thiểu để một lệnh được xếp hạng đó, tính theo % của phần bảng tiêu chí mà app trả lời được. Đây là <b>độ khắt khe của riêng bạn</b> nên mới cho sửa — còn các ngưỡng đo (RS 80, nền ≤ 25%, nhảy khoảng ≥ 10%) thì không, vì mỗi con số đó là một câu trích dẫn. ${GRADE_CRITERIA.length} tiêu chí, xem giải thích từng cái ở mục 11 của cẩm nang.`
            : `The minimum score for a trade to earn that letter, as a percent of the checklist the app could actually answer. This is <b>your own selectivity</b>, which is why it is editable — the measurement bars (RS 80, a base ≤ 25%, a gap ≥ 10%) are not, because each of those is a quotation. ${GRADE_CRITERIA.length} criteria, each explained in §11 of the playbook.`}
        </p>
        <div class="row" style="gap:10px;flex-wrap:wrap">
          ${(['a', 'b', 'c'] as const).map((k) => `
            <div style="width:110px">
              <label class="field-label" style="margin-bottom:2px">${
                vi ? 'Hạng' : 'Grade'} ${k.toUpperCase()} ${vi ? 'từ' : 'from'} (%)</label>
              <input class="field" data-grade-th="${k}" type="text" inputmode="decimal"
                autocorrect="off" autocapitalize="off" value="${thresholds[k]}"
                style="width:100%;padding:5px 7px;font-size:12px;text-align:right" />
            </div>`).join('')}
        </div>
        <div class="muted" style="font-size:11px;line-height:1.4;margin-top:4px">
          ${vi
            ? `Mặc định A ${DEFAULT_GRADE_THRESHOLDS.a} · B ${DEFAULT_GRADE_THRESHOLDS.b} · C ${DEFAULT_GRADE_THRESHOLDS.c}; dưới C là D. Nên sửa bằng dữ liệu của chính bạn sau 50–100 lệnh có ghi chép — nếu lệnh loại B thắng ngang loại A thì đường A đang quá cao — chứ không phải bằng cảm giác sau một lệnh thua. Sửa giữa hai lệnh thì được, sửa lúc đang cầm một lệnh thì không.`
            : `Defaults are A ${DEFAULT_GRADE_THRESHOLDS.a} · B ${DEFAULT_GRADE_THRESHOLDS.b} · C ${DEFAULT_GRADE_THRESHOLDS.c}; below C is a D. Move these on your own recorded data after 50–100 logged trades — if your Bs win as often as your As, the A line is too high — not on the feeling that follows a loss. Between trades, never while holding one.`}
        </div>

        ${secHtml(vi ? 'Luật theo từng thiết lập' : 'Rules per setup',
          vi ? 'cắt lỗ đi đâu, chốt lời ở đâu — cho từng loại lệnh' : 'where the stop goes and where the profit comes off, per kind of trade',
          'var(--danger)')}
        <p class="pb-note" style="margin:0 0 10px">
          ${vi
            ? 'Mười một cột, nhưng chỉ <b>ba câu hỏi</b>: chỗ nào chứng minh mình sai (<span style="color:var(--danger);font-weight:600">cắt lỗ</span>), chỗ nào chốt phần đầu (<span style="color:var(--accent);font-weight:600">mục tiêu</span>), và phần còn lại chạy thế nào (<span style="color:var(--violet);font-weight:600">kéo và hạn</span>). Màu ở đầu mỗi cột theo đúng ba nhóm đó, và phần <b>giải thích từng cột</b> nằm ngay dưới bảng. Không nhớ một ô làm gì thì đừng đoán — cuộn xuống phần <b>Ví dụ</b>: nó dựng đúng một lệnh bằng chính những con số đang có trong bảng.'
            : 'Eleven columns, but only <b>three questions</b>: where you are proved wrong (<span style="color:var(--danger);font-weight:600">the stop</span>), where the first piece comes off (<span style="color:var(--accent);font-weight:600">the target</span>), and how the rest is run (<span style="color:var(--violet);font-weight:600">trail and expiry</span>). The colour on each header follows those three groups, and <b>every column is explained</b> right under the table. If a box is a mystery, do not guess — scroll to the <b>Example</b>: it plans one trade using exactly the numbers now in the table.'}
        </p>
        <div style="overflow-x:auto">
          <table class="pb-tbl">
            <thead>
              <tr>
                <th class="pb-gh" rowspan="2" style="text-align:left;--pb-tone:var(--faint)">${vi ? 'Thiết lập' : 'Setup'}</th>
                ${RULE_GROUPS.map((g) => {
                  const cols = SETUP_COLUMNS.filter((c) => c.group === g.key);
                  return `<th class="pb-gh" colspan="${cols.length}" style="--pb-tone:${g.color}">${vi ? g.vi : g.en}</th>`;
                }).join('')}
                <th class="pb-gh" rowspan="2"></th>
              </tr>
              <tr>
                ${SETUP_COLUMNS.map((c, i) => `<th class="pb-ch ${isGroupStart(i) ? 'pb-gstart' : ''}"
                  style="--pb-tone:${colTone(c.field)}">${i + 1}. ${vi ? c.vi : c.en}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${SETUP_KEYS.map((k) => {
                const r = eff(k);
                const changed = Object.keys(cfg.setups[k] ?? {}).length > 0;
                return `<tr data-row="${k}">
                  <td class="pb-name">
                    <b>${setupName(k, vi)}</b>
                    ${DEFAULT_SETUP_RULES[k].source === 'derived'
                      ? `<span class="badge" style="border-color:var(--warn);color:var(--warn)"
                           title="${vi
                             ? 'Cẩm nang không có dòng nào cho thiết lập này; những con số này là suy ra từ nguyên tắc của nó. Nên xem lại trước khi tin.'
                             : 'The book has no row for this setup; these numbers are extrapolated from its principles. Worth reviewing before trusting.'}">${vi ? 'suy ra' : 'derived'}</span>`
                      : ''}
                    ${changed ? `<span class="badge" style="border-color:var(--accent);color:var(--accent)">${vi ? 'đã sửa' : 'edited'}</span>` : ''}
                  </td>
                  ${SETUP_COLUMNS.map((c, i) => `<td class="${isGroupStart(i) ? 'pb-gstart' : ''}"
                    style="--pb-tone:${colTone(c.field)}">${cellHtml(k, c.field, r)}</td>`).join('')}
                  <td style="white-space:nowrap">
                    <a href="#" data-reset="${k}" class="muted" style="font-size:11px">${vi ? 'về mặc định' : 'reset'}</a>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="pb-eg-cap" style="padding-top:7px">
          <span class="badge" style="border-color:var(--warn);color:var(--warn)">${vi ? 'suy ra' : 'derived'}</span>
          ${vi
            ? 'cẩm nang không có dòng nào cho thiết lập đó — số là suy ra từ nguyên tắc của nó, nên xem lại trước khi tin. '
            : 'the book has no row for that setup — these are extrapolated from its principles, so review before trusting. '}
          <span class="badge" style="border-color:var(--accent);color:var(--accent)">${vi ? 'đã sửa' : 'edited'}</span>
          ${vi ? 'bạn đã thay đổi ít nhất một ô ở dòng đó.' : 'you have changed at least one box on that row.'}
        </div>

        ${RULE_GROUPS.map((g) => {
          const cols = SETUP_COLUMNS.map((c, i) => ({ c, i })).filter((x) => x.c.group === g.key);
          return `
            ${secHtml(vi ? g.vi : g.en, '', g.color)}
            <p class="pb-note" style="margin:0 0 8px;--pb-tone:${g.color}">${vi ? g.leadVi : g.leadEn}</p>
            <div class="pb-legend">
              ${cols.map(({ c, i }) => `
                <div class="pb-legend-card" style="--pb-tone:${g.color}">
                  <div class="pb-legend-h"><span class="pb-legend-n">${i + 1}</span>${vi ? c.vi : c.en}</div>
                  <div class="pb-legend-w">${vi ? c.whatVi : c.whatEn}</div>
                  <div class="pb-legend-y">${vi ? c.whyVi : c.whyEn}</div>
                </div>`).join('')}
            </div>`;
        }).join('')}

        <div class="pb-sec" style="--pb-tone:var(--blue)">
          <span class="pb-sec-t">${vi ? 'Ví dụ — một lệnh, bằng chính các số ở trên' : 'Example — one trade, with the numbers above'}</span>
          <select class="field" id="pb-eg-setup" style="padding:3px 6px;font-size:12px;width:auto">
            ${SETUP_KEYS.map((k) => `<option value="${k}"${k === 'VCP' ? ' selected' : ''}>${setupName(k, vi)}</option>`).join('')}
          </select>
          <span class="pb-sec-s">${vi ? 'sửa ô nào ở trên thì ví dụ đổi theo ngay' : 'change any box above and this follows at once'}</span>
        </div>
        <div id="pb-eg"></div>

        <div id="pb-msg" class="muted" style="font-size:12px;min-height:18px;margin:10px 0"></div>
        <div class="row" style="justify-content:flex-end;gap:8px">
          <button id="pb-reset-all" class="btn-outline" style="margin-right:auto">${vi ? 'Về mặc định toàn bộ' : 'Reset everything'}</button>
          <button id="pb-cancel" class="btn-outline">${vi ? 'Hủy' : 'Cancel'}</button>
          <button id="pb-save" class="btn">${vi ? 'Lưu' : 'Save'}</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(host);
  const close = (): void => host.remove();
  const msg = host.querySelector('#pb-msg') as HTMLElement;
  const egBox = host.querySelector('#pb-eg') as HTMLElement;
  const egPick = host.querySelector('#pb-eg-setup') as HTMLSelectElement;

  const drawExample = (): void => {
    egBox.innerHTML = exampleHtml(host, egPick.value as SetupKey, vi);
  };
  drawExample();
  // One delegated listener rather than one per box: the example depends on eleven
  // inputs per row plus `minRR`, and a listener per field is a listener per field to
  // forget. `input` covers typing, `change` covers the selects.
  host.addEventListener('input', drawExample);
  host.addEventListener('change', drawExample);

  host.querySelector('.modal-backdrop')!.addEventListener('click', close);
  host.querySelector('.pb-x')!.addEventListener('click', close);
  host.querySelector('#pb-cancel')!.addEventListener('click', close);

  // Per-setup reset: put the shipped defaults back in the boxes. Nothing is stored
  // until Save, so this is undoable by cancelling.
  host.querySelectorAll<HTMLAnchorElement>('[data-reset]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const k = a.dataset.reset as SetupKey;
      const d = DEFAULT_SETUP_RULES[k];
      host.querySelectorAll<HTMLElement>(`[data-setup="${k}"]`).forEach((el) => {
        const f = el.dataset.field as keyof SetupRule;
        const v = d[f];
        (el as HTMLInputElement).value = typeof v === 'number' ? String(v) : v === null ? '' : String(v);
      });
      msg.textContent = vi ? `Đã đưa ${setupName(k, vi)} về mặc định (chưa lưu).` : `${setupName(k, vi)} back to defaults (not saved yet).`;
      drawExample();
    }),
  );

  host.querySelector('#pb-reset-all')!.addEventListener('click', async () => {
    // The user's own exit reasons survive "reset everything". Everything else in this blob is an
    // override of a number this app shipped, so resetting it restores a default; a reason the
    // user typed has no default to restore to, and dropping it here would be a silent delete of
    // their writing from a button that says it is putting things back the way they were.
    await savePlaybookConfig(ctx, { ...EMPTY_PLAYBOOK_CONFIG, exitReasons: cfg.exitReasons ?? [] });
    notifyPlaybookChanged();
    onSaved?.();
    close();
  });

  host.querySelector('#pb-save')!.addEventListener('click', async () => {
    // `exitReasons` is carried over rather than rebuilt: this dialog does not edit it (that is
    // the ⚙ beside the exit-reason dropdown), and a config written without it would delete the
    // user's own vocabulary every time they touched a risk number here.
    const next: PlaybookConfig = {
      setups: {}, ladder: {}, pinnedRiskPct: null, gradeThresholds: {},
      exitReasons: cfg.exitReasons ?? [],
    };

    // Ladder: keep only what differs from the default, and reject nonsense rather
    // than storing it — a blank or negative risk floor would come back as a plan.
    for (const f of LADDER_FIELDS) {
      const el = host.querySelector<HTMLInputElement>(`[data-ladder="${f.key}"]`);
      const raw = (el?.value ?? '').trim().replace(',', '.');
      const v = Number(raw);
      if (!raw || !Number.isFinite(v) || v < 0) continue;
      if (v !== DEFAULT_RISK_LADDER[f.key]) (next.ladder as Record<string, number>)[f.key] = v;
    }

    // ── WHY ALL FOUR GRADES GO IN OR NONE DO ────────────────────────────────
    // `ladderConfig()` merges one level deep (`{...DEFAULT_RISK_LADDER, ...cfg.ladder}`),
    // so a stored `ratingPct` REPLACES the default record wholesale instead of being
    // merged into it. Save only the differing letters and the other three come back
    // `undefined` — `ratingScale` would read them as "no grade" and quietly plan a C at
    // full size. So: if any letter differs, write the complete record.
    const gradePct: Record<string, number> = {};
    let gradeChanged = false;
    for (const k of RATING_KEYS) {
      const raw = (host.querySelector<HTMLInputElement>(`[data-rating="${k}"]`)?.value ?? '').trim().replace(',', '.');
      const v = Number(raw);
      // Nonsense keeps the default for that letter rather than storing a 0 that would
      // read as "plan no shares" — which must be a decision, never a typo.
      const use = raw && Number.isFinite(v) && v > 0 ? v : DEFAULT_RISK_LADDER.ratingPct[k];
      gradePct[k] = use;
      if (use !== DEFAULT_RISK_LADDER.ratingPct[k]) gradeChanged = true;
    }
    if (gradeChanged) next.ladder.ratingPct = gradePct as RiskLadderConfig['ratingPct'];

    // ── WHY ONLY THE LINES THAT DIFFER ARE STORED ───────────────────────────
    // `gradeThresholds()` merges field by field over the defaults, so a partial record is
    // safe here in a way `ladder.ratingPct` was not — and storing nothing when nothing was
    // changed means a later change to the shipped defaults reaches users who never touched
    // this box, which is the behaviour anyone would expect from "I left it alone".
    for (const k of ['a', 'b', 'c'] as const) {
      const raw = (host.querySelector<HTMLInputElement>(`[data-grade-th="${k}"]`)?.value ?? '')
        .trim().replace(',', '.');
      const v = Number(raw);
      // A blank or nonsensical line keeps the default rather than storing a 0, which would
      // make every trade an A — the one direction this field must never fail in.
      if (!raw || !Number.isFinite(v) || v <= 0 || v > 100) continue;
      if (v !== DEFAULT_GRADE_THRESHOLDS[k]) next.gradeThresholds[k] = v;
    }

    const pinnedRaw = (host.querySelector<HTMLInputElement>('#pb-pinned')?.value ?? '').trim().replace(',', '.');
    const pinned = Number(pinnedRaw);
    next.pinnedRiskPct = pinnedRaw && Number.isFinite(pinned) && pinned > 0 ? pinned : null;

    // Read the boxes the same way the worked example did, then keep only what moved.
    // One reader, so the example cannot be planning a different trade from the one
    // about to be saved.
    const setups: SetupRuleOverrides = {};
    for (const k of SETUP_KEYS) {
      const d = DEFAULT_SETUP_RULES[k];
      const box = readSetupBoxes(host, k);
      const diff: Partial<SetupRule> = {};
      for (const c of SETUP_COLUMNS) {
        if (box[c.field] !== d[c.field]) {
          (diff as Record<string, unknown>)[c.field] = box[c.field];
        }
      }
      if (Object.keys(diff).length) setups[k] = diff;
    }
    next.setups = setups;

    await savePlaybookConfig(ctx, next);
    // Every unfinished plan in the app re-derives itself from the new rules — a Buy card being
    // filled in, the trade planner's rows. What was already bought, saved as a plan or filed as a
    // case study keeps the numbers it was decided on. See `onPlaybookChange` in `playbook.ts`.
    notifyPlaybookChanged();
    onSaved?.();
    close();
  });
}
