/**
 * What every box in ⚙ Playbook actually means — the copy and the worked example.
 *
 * ── WHY THIS IS A MODULE AND NOT MORE `title=` ATTRIBUTES ───────────────────
 * The eleven columns of "Rules per setup" were documented in tooltips. A tooltip is
 * invisible: it needs a mouse (so it does not exist on the phone the app also runs
 * on), it needs the user to suspect there is something to hover, and it holds one
 * sentence. The user's report was simply "I do not know what Stop anchor, N sessions
 * or Pad are" — which is the honest outcome of documenting a table in its `title`s.
 * So the explanations are content now: a visible legend, in the same order and the
 * same colours as the columns they describe.
 *
 * ── WHY ONE TABLE DRIVES BOTH THE HEADER AND THE LEGEND ─────────────────────
 * `SETUP_COLUMNS` is the single source for the header labels AND the legend cards. A
 * twelfth column added to the table cannot then ship undocumented, and a renamed
 * header cannot end up disagreeing with its own explanation — which is exactly how
 * the tooltips had drifted from the shipped defaults.
 *
 * ── WHY THE WORKED EXAMPLE CALLS `suggestLevels` ────────────────────────────
 * The example is measured on a fixed fictional chart by the SAME function that plans
 * real trades, not by arithmetic re-typed here. Anything else is a second
 * implementation of the playbook whose only job is to be believed, and the day it
 * disagrees with the planner it is the example the user will trust. So this module
 * owns the demo bars and the wording; core owns every number.
 *
 * Nothing here touches the DOM, which is what lets `tests/playbookHelp.test.ts` check
 * that the legend covers every editable field and that the example's chain lands on
 * the stop core actually returned.
 */
import {
  LEVEL_WARN,
} from '../portfolio/planWords.js';
import {
  DEFAULT_RISK_LADDER,
  suggestLevels,
  type Bar,
  type LevelSuggestion,
  type PlaybookRegime,
  type RiskLadderConfig,
  type SetupKey,
  type SetupRule,
  type SetupRuleOverrides,
} from '@screener/core';
import { mkBars, seeded, type Candle } from './miniChart.js';

/** Every editable field of a `SetupRule`, in the column order of the table. */
export type RuleField =
  | 'anchor' | 'lookback' | 'padPct' | 'atrMult' | 'maxStopEma' | 'maxStopRef'
  | 'targetKind' | 'firstTargetR' | 'targetEma'
  | 'trailEma' | 'maxHoldSessions';

/**
 * Which idea a column belongs to. Three, because eleven numeric columns read as
 * eleven unrelated settings and as three questions: where am I wrong, where am I
 * right, and how do I let the rest run.
 */
export type RuleGroup = 'stop' | 'target' | 'manage';

export const RULE_GROUPS: readonly {
  key: RuleGroup;
  vi: string; en: string;
  /** A CSS custom property — the group's colour in the header, the legend and the example. */
  color: string;
  leadVi: string; leadEn: string;
}[] = [
  {
    key: 'stop', color: 'var(--danger)',
    vi: 'Cắt lỗ — chỗ luận điểm sai', en: 'The stop — where the idea is wrong',
    leadVi: 'Sáu ô này chỉ quyết định MỘT con số: cắt lỗ. Mà cắt lỗ quyết định số cổ, nên chúng quyết định luôn size vị thế.',
    leadEn: 'These six boxes decide ONE number: the stop. And because the stop decides the share count, they decide the position size too.',
  },
  {
    key: 'target', color: 'var(--accent)',
    vi: 'Mục tiêu — chỗ chốt nửa đầu', en: 'The target — where half comes off',
    leadVi: 'Chỗ chốt phần đầu tiên. Playbook chốt một nửa ở đây và để phần còn lại chạy tiếp.',
    leadEn: 'Where the first piece comes off. The book takes half here and lets the rest run.',
  },
  {
    key: 'manage', color: 'var(--violet)',
    vi: 'Phần còn lại — trailing và hạn', en: 'The runner — trail and expiry',
    leadVi: 'Phần chưa chốt quản lý ra sao, và lệnh đứng yên bao lâu thì hết hạn.',
    leadEn: 'How the unsold part is managed, and when a trade that is going nowhere expires.',
  },
];

export interface ColumnDoc {
  field: RuleField;
  group: RuleGroup;
  /** The header label. Kept short — the legend carries the meaning. */
  vi: string; en: string;
  /** What the number IS. One sentence, no jargon that is not defined in it. */
  whatVi: string; whatEn: string;
  /** What moving it does, or when it does nothing at all. */
  whyVi: string; whyEn: string;
}

/**
 * The eleven columns, in table order.
 *
 * `whyVi`/`whyEn` say what CHANGES, not what the field is called again: "a smaller
 * number means a tighter stop that gets swept" is usable, "the lookback period" is
 * the header read back.
 */
export const SETUP_COLUMNS: readonly ColumnDoc[] = [
  {
    field: 'anchor', group: 'stop', vi: 'Neo cắt lỗ', en: 'Stop anchor',
    whatVi: 'Điểm TRÊN CHART để treo cắt lỗ — một điểm cấu trúc, không phải số tiền bạn chịu lỗ nổi.',
    whatEn: 'The place ON THE CHART the stop hangs from — a structural point, not an amount of money you can stomach.',
    whyVi: '<b>Đáy nến tín hiệu</b> = đáy của chính cây nến khiến bạn muốn mua. <b>Đáy thấp nhất N phiên</b> = đáy thấp nhất trong N phiên gần nhất, dùng cho nền và nhịp pullback. <b>Theo ATR</b> = không dựa vào cấu trúc nào: lấy giá vào trừ (× ATR) × ATR.',
    whyEn: '<b>Signal bar low</b> = the low of the very bar that made you want in. <b>Lowest low of N</b> = the lowest low of the last N sessions, for bases and pullbacks. <b>By ATR</b> = no structure at all: entry minus (× ATR) × ATR.',
  },
  {
    field: 'lookback', group: 'stop', vi: 'N phiên', en: 'N sessions',
    whatVi: 'App nhìn lại bao nhiêu phiên để tìm “đáy thấp nhất” — và để đo chiều cao nền cho mục tiêu.',
    whatEn: 'How many sessions back the app looks for the “lowest low” — and measures the base height for the target.',
    whyVi: 'Nhỏ = cắt lỗ sát, mua được nhiều cổ hơn, nhưng chỉ một cây râu nến là bị quét. Lớn = cắt lỗ sâu, an toàn hơn nhưng ít cổ hơn. Không có tác dụng gì nếu Neo là <i>Đáy nến tín hiệu</i> hoặc <i>Theo ATR</i>.',
    whyEn: 'Small = a tight stop and more shares, but one wick takes you out. Large = a deeper, safer stop and fewer shares. Does nothing at all when the anchor is <i>Signal bar low</i> or <i>By ATR</i>.',
  },
  {
    field: 'padPct', group: 'stop', vi: 'Đệm %', en: 'Pad %',
    whatVi: 'Đặt cắt lỗ THẤP HƠN cái đáy vừa tìm được bao nhiêu %. 0,3 nghĩa là cắt lỗ nằm dưới đáy 0,3%.',
    whatEn: 'How much further BELOW that low to place the stop, in percent. 0.3 means the stop sits 0.3% under it.',
    whyVi: 'Đáy 97,62, đệm 0,3% → cắt lỗ 97,33. Vì sao cần đệm: cắt lỗ đặt đúng ngay đáy sẽ bị chính cây râu nến tạo ra đáy đó quét mất — bạn văng khỏi lệnh trước khi biết mình có sai hay không.',
    whyEn: 'A 97.62 low with a 0.3% pad → a 97.33 stop. Why it is there: a stop sitting exactly on a known low gets swept by the wick that made it — you lose the trade before you find out you were wrong.',
  },
  {
    field: 'atrMult', group: 'stop', vi: '× ATR', en: '× ATR',
    whatVi: 'Bội số của ATR(14) — biên độ dao động trung bình mỗi phiên, tính bằng tiền.',
    whatEn: 'A multiple of ATR(14) — the average size of one session’s move, in money.',
    whyVi: 'Có hai vai trò: chính là cắt lỗ khi Neo = <i>Theo ATR</i>, và là thước đo “cắt lỗ này có xa bất thường không” với mọi kiểu neo khác. ATR 1,96 và × ATR = 2 thì mốc ATR nằm dưới giá vào 3,92.',
    whyEn: 'Two jobs: it IS the stop when the anchor is <i>By ATR</i>, and it is the “is this stop unusually wide?” yardstick for every other anchor. An ATR of 1.96 with × ATR = 2 puts the ATR mark 3.92 below the entry.',
  },
  {
    field: 'maxStopEma', group: 'stop', vi: 'EMA chặn', en: 'Cap EMA',
    whatVi: 'Cắt lỗ không được sâu hơn đường EMA này. Để trống = bỏ EMA, chỉ chặn bằng mốc ATR.',
    whatEn: 'The stop may not sit deeper than this EMA. Empty = leave the EMA out and cap on the ATR mark alone.',
    whyVi: 'Ô này chặn việc neo vào một cái đáy CŨ: đáy từ 14 phiên trước không còn là cấu trúc của lệnh hôm nay. Mặc định 21 vì Playbook đã dùng EMA21 để trailing và để xét tín hiệu — thủng EMA21 là câu chuyện đã khác.',
    whyEn: 'This is what stops a STALE low being used: a low from fourteen sessions ago is not this trade’s structure. 21 by default because the book already trails and judges triggers against the 21 EMA — below it the idea has changed.',
  },
  {
    field: 'maxStopRef', group: 'stop', vi: 'Lấy mốc', en: 'Cap by',
    whatVi: 'Khi đo được cả hai mốc chặn (EMA và ATR) thì lấy mốc nào — và có chặn hay không.',
    whatEn: 'Which of the two marks (the EMA and the ATR one) wins when both can be measured — and whether to cap at all.',
    whyVi: '<b>Mốc sâu hơn</b> (mặc định): chỉ kéo cắt lỗ lên khi nó sâu hơn CẢ hai mốc — rộng rãi. <b>Mốc gần hơn</b>: mốc nào gần giá vào hơn thì mốc đó quyết định — chặt hơn nhiều, có thể ép cắt lỗ còn 2% ngay trong vùng nhiễu. <b>Không chặn</b>: để cấu trúc quyết định và giảm số cổ, đúng như Playbook.',
    whyEn: '<b>The deeper one</b> (default): pull the stop in only when it was below BOTH marks — generous. <b>The nearer one</b>: whichever mark is closer to the entry decides — much tighter, and it can squeeze the stop to 2% right inside the noise. <b>No cap</b>: structure decides and the share count shrinks, as the book has it.',
  },
  {
    field: 'targetKind', group: 'target', vi: 'Mục tiêu', en: 'Target',
    whatVi: 'Cách tính điểm chốt lời đầu tiên.',
    whatEn: 'How the first profit target is worked out.',
    whyVi: '<b>Bội số R</b> = giá vào + (R đầu × khoảng rủi ro). <b>Chiều cao nền</b> = giá vào + (đỉnh cao nhất − đáy thấp nhất trong N phiên): nền cao bao nhiêu thì cú breakout đi được bấy nhiêu. <b>Chạm EMA</b> = chốt hết tại EMA chốt, không theo R — dành cho lệnh mean reversion.',
    whyEn: '<b>R multiple</b> = entry + (First R × the risk distance). <b>Measured move</b> = entry + (highest high − lowest low over N): a breakout travels about as far as the base was tall. <b>At an EMA</b> = exit all of it at the exit EMA, with no R involved — for mean reversion.',
  },
  {
    field: 'firstTargetR', group: 'target', vi: 'R đầu', en: 'First R',
    whatVi: '1R = khoảng cách từ giá vào đến cắt lỗ. R đầu = 3 nghĩa là mục tiêu đầu cách giá vào gấp ba khoảng đó.',
    whatEn: '1R = the distance from entry to stop. First R = 3 means the first target sits three of those distances above the entry.',
    whyVi: 'Playbook chốt MỘT NỬA ở đây rồi trailing phần còn lại. Đây cũng là con số tạo ra R:R: dưới R:R tối thiểu thì Playbook bảo bỏ qua lệnh. Chỉ dùng khi Mục tiêu = <i>Bội số R</i>.',
    whyEn: 'The book takes HALF off here and trails the rest. It is also the number that makes the R:R: under the minimum R:R the book says skip the trade. Only used when the target is an <i>R multiple</i>.',
  },
  {
    field: 'targetEma', group: 'target', vi: 'EMA chốt', en: 'Exit EMA',
    whatVi: 'Đường EMA dùng làm điểm chốt khi Mục tiêu = <i>Chạm EMA</i>.',
    whatEn: 'The EMA the exit is taken at when the target is <i>At an EMA</i>.',
    whyVi: 'Lệnh mean reversion không có mục tiêu theo R: giá về lại đường trung bình là xong, dù chỗ đó là 1,2R hay 0,7R. Nếu EMA này đang nằm DƯỚI giá vào thì chẳng có gì để nhắm tới, và app sẽ báo vậy.',
    whyEn: 'A mean-reversion trade has no R target: it is over when price is back at the mean, whether that is 1.2R or 0.7R away. If this EMA is BELOW the entry there is nothing to aim at, and the app says so.',
  },
  {
    field: 'trailEma', group: 'manage', vi: 'EMA trailing', en: 'Trail EMA',
    whatVi: 'Phần còn lại sau khi chốt nửa đầu sẽ trailing theo đường EMA này. Để trống = không trailing, ra hết ở mục tiêu.',
    whatEn: 'The part left after the first sale is trailed against this EMA. Empty = no trail, all of it leaves at the target.',
    whyVi: 'EMA10 trailing sát: giữ được lãi nhưng dễ văng sớm trong một nhịp chạy dài. EMA21 cho lệnh không gian để thở: bắt được những con sóng lớn, nhưng trả lại nhiều hơn khi sóng không đến.',
    whyEn: 'A 10 EMA trails tight: it keeps the gain but takes you out early in a long run. A 21 EMA gives the trade room: it catches the big moves and gives back more when the move never comes.',
  },
  {
    field: 'maxHoldSessions', group: 'manage', vi: 'Hạn (phiên)', en: 'Expiry',
    whatVi: 'Sau bao nhiêu phiên thì luận điểm coi như hết hiệu lực, bất kể giá đang ở đâu. Để trống = không hết hạn.',
    whatEn: 'After how many sessions the thesis has expired regardless of where price is. Empty = never expires.',
    whyVi: 'Tiền nằm chết trong một lệnh đứng yên là tiền đang lỡ cơ hội ở chỗ khác — khoản lỗ duy nhất không bao giờ hiện trong sổ. Mean reversion mặc định 7 phiên: 7 phiên mà chưa hồi thì đó không phải cú hồi.',
    whyEn: 'Money in a trade going nowhere is money losing its chance elsewhere — the one loss that never shows up in the book. Mean reversion defaults to 7 sessions: if it has not reverted in seven, it was not a reversion.',
  },
];

/** Every regime, said in words, with the measurement that named it and what it costs. */
export const REGIME_DOC: Record<PlaybookRegime, {
  vi: string; en: string;
  /** The test in `detectPlaybookRegime` that produced this label. */
  testVi: string; testEn: string;
  /** What the sizing ladder does about it. */
  sizeVi: string; sizeEn: string;
  color: string;
}> = {
  UPTREND: {
    vi: 'Xu hướng tăng', en: 'Uptrend',
    testVi: 'Giá đóng cửa trên CẢ MA50 và MA200, và MA50 tăng hơn +0,5% trong 10 phiên.',
    testEn: 'The close is above BOTH the 50MA and the 200MA, and the 50MA has risen more than +0.5% over 10 sessions.',
    sizeVi: 'Full size — nhưng nếu biến động giãn ra (ATR > 1,3×) thì vẫn giảm nửa.',
    sizeEn: 'Full size — though expanded volatility (ATR > 1.3×) still halves it.',
    color: 'var(--accent)',
  },
  UPTREND_UNDER_STRESS: {
    vi: 'Tăng nhưng chịu áp lực', en: 'Uptrend under stress',
    testVi: 'MA50 vẫn trên MA200 và vẫn đang lên, nhưng giá đã thủng MA50 — xu hướng tăng vẫn còn, chỉ là giá vừa rơi khỏi nó.',
    testEn: 'The 50MA is still above the 200MA and still rising, but price has slipped under the 50MA — the advance is intact and price has just lost it.',
    sizeVi: 'Giảm nửa.', sizeEn: 'Half size.',
    color: 'var(--warn)',
  },
  RANGE: {
    vi: 'Đi ngang', en: 'Range',
    testVi: 'Không thuộc ba trường hợp kia — giá và các đường trung bình đan xen nhau, hoặc MA50 đã nằm ngang.',
    testEn: 'None of the other three fit — price and the averages are tangled, or the 50MA has gone flat.',
    sizeVi: 'Giảm nửa. Bù lại, thị trường đi ngang mở ra các setup mean reversion mà uptrend không có.',
    sizeEn: 'Half size. In exchange, a range unlocks the mean-reversion setups an uptrend does not offer.',
    color: 'var(--blue)',
  },
  DOWNTREND: {
    vi: 'Xu hướng giảm', en: 'Downtrend',
    testVi: 'Giá dưới CẢ MA50 và MA200, và MA50 giảm hơn −0,5% trong 10 phiên.',
    testEn: 'The close is below BOTH the 50MA and the 200MA, and the 50MA has fallen more than −0.5% over 10 sessions.',
    sizeVi: 'Không mở lệnh mua mới. Đây là luật “có vào lệnh hay không”, nên ghim rủi ro cũng không lách được.',
    sizeEn: 'No new longs. This is a whether-to-trade rule, so pinning the risk percent does not get past it.',
    color: 'var(--danger)',
  },
};

/** The five numbers on the regime line, each with what it is and where it came from. */
export const REGIME_STATS: readonly { key: string; vi: string; en: string; noteVi: string; noteEn: string }[] = [
  {
    key: 'close', vi: 'SPY đóng cửa', en: 'SPY close',
    noteVi: 'Giá đóng cửa của SPY ở phiên ghi bên dưới — không phải giá hiện tại.',
    noteEn: 'SPY’s closing price on the session named below — not the price right now.',
  },
  {
    key: 'ma50', vi: 'MA50', en: 'MA50',
    noteVi: 'Trung bình 50 phiên (SMA, giống mặc định của TradingView).',
    noteEn: 'The 50-session simple average — the same one TradingView draws by default.',
  },
  {
    key: 'ma200', vi: 'MA200', en: 'MA200',
    noteVi: 'Trung bình 200 phiên. Giá trên đường này là thị trường tăng dài hạn.',
    noteEn: 'The 200-session average. Above it is a long-term bull market.',
  },
  {
    key: 'slope', vi: 'Độ dốc MA50', en: 'MA50 slope',
    noteVi: 'MA50 hôm nay so với MA50 cách đây 10 phiên. Trên +0,5% là đang lên, dưới −0,5% là đang xuống, ở giữa là nằm ngang.',
    noteEn: 'The 50MA now against the 50MA ten sessions ago. Over +0.5% is rising, under −0.5% is falling, between is flat.',
  },
  {
    key: 'atr', vi: 'Biến động (ATR)', en: 'Volatility (ATR)',
    noteVi: 'ATR% hôm nay chia cho ATR% trung bình 100 phiên. 1,0 = bình thường; trên 1,3 = giãn ra, cùng 1% rủi ro giờ mua được ít cổ hơn nên app giảm nửa size.',
    noteEn: 'Today’s ATR% divided by its own 100-session average. 1.0 = as usual; over 1.3 = expanded, so the same 1% of risk buys fewer shares and the app halves size.',
  },
];

// ---------------------------------------------------------------------------
// The worked example
// ---------------------------------------------------------------------------

/**
 * The fictional chart every example is measured on: a 25-session advance, then a
 * base that tightens. Fixed closes and a seeded PRNG, so the figure is byte-identical
 * on every open — an illustration that reshuffles itself reads as a live feed.
 */
const DEMO_CLOSES: readonly number[] = [
  78, 79.4, 81, 80.2, 82.6, 84.1, 83.4, 85.8, 87.2, 88.9,
  88.1, 90.4, 92, 91.3, 93.6, 95.2, 97, 96.2, 98.4, 100.1,
  101.8, 103.2, 102.1, 100.4, 99.2, 98.1, 99.4, 100.6, 99.5, 98.2,
  99.1, 100.4, 99.3, 98.4, 99.6, 100.8, 100.1, 99.4, 100.6, 101.2,
];

/**
 * The entry the example plans from: a buy-stop at 102, just above the last bar's high
 * of 101.46, where a base that has stopped falling is bought.
 *
 * Deliberately NOT above the base's own highest wick (103.99, the spike that started
 * the base). That would be the textbook new-high pivot, but on these bars it puts the
 * entry 6% above every stop anchor, so all seven setups come back with
 * `stopWiderThanAtr` — a teaching figure whose every row is a warning teaches the
 * warning, not the arithmetic. At 102 the stops land between 2.1% and 3.8%, which is
 * the range a reader needs to recognise, and two setups still trip the stop cap, which
 * is the one warning worth meeting here.
 */
export const DEMO_ENTRY = 102;

export const DEMO_CANDLES: readonly Candle[] =
  Object.freeze(mkBars([...DEMO_CLOSES], seeded(99)));

/** The same bars as core sees them. Dates are plausible and never shown. */
export const DEMO_BARS: readonly Bar[] = Object.freeze(DEMO_CANDLES.map((c, i) => ({
  date: `2026-0${1 + Math.floor(i / 20)}-${String((i % 20) + 1).padStart(2, '0')}`,
  open: c.o, high: c.h, low: c.l, close: c.c, volume: Math.round((c.v ?? 100) * 1000),
})));

/**
 * Plan the demo entry under `rule`, exactly as the Buy form would.
 *
 * `rule` is passed as a complete override rather than merged here, so the example
 * reflects the boxes as they stand — including a number the user has typed but not
 * yet saved. `cfg` matters too: `minRR` decides whether a measured move is kept or
 * falls back to the R multiple.
 */
export function demoLevels(
  setup: SetupKey, rule: SetupRule, cfg: RiskLadderConfig = DEFAULT_RISK_LADDER,
): LevelSuggestion | null {
  const overrides: SetupRuleOverrides = { [setup]: rule };
  return suggestLevels(DEMO_BARS, DEMO_ENTRY, setup, overrides, cfg);
}

export interface ExampleStep {
  /** The column being exercised, so the step can be tinted like its header. `null` = a result. */
  field: RuleField | null;
  group: RuleGroup | 'result';
  label: string;
  /** The arithmetic, in words and numbers. May contain `<b>`. */
  detail: string;
  /** What the step lands on. */
  value: string;
}

const f2 = (v: number): string => v.toFixed(2);

/** Highest high minus lowest low over the rule's lookback, on the demo bars. */
function demoBaseHeight(lookback: number): { hi: number; lo: number } {
  const slice = DEMO_BARS.slice(-Math.max(2, lookback));
  return {
    hi: Math.max(...slice.map((b) => b.high)),
    lo: Math.min(...slice.map((b) => b.low)),
  };
}

/**
 * The stop-to-target chain for one rule, step by step, on the demo chart.
 *
 * Every number comes out of `lv` — which came out of `suggestLevels` — so a step can
 * describe the arithmetic but never perform it. The two exceptions are labelled as
 * such: the padded price before the cap (recomputed from `anchorPrice`, so the
 * example can show the cap biting) and the base height, which core does not return.
 */
export function exampleSteps(
  rule: SetupRule, lv: LevelSuggestion, vi: boolean, minRR: number,
): ExampleStep[] {
  const out: ExampleStep[] = [];
  const e = DEMO_ENTRY;

  // ── 1. the anchor ──
  if (lv.anchorPrice !== null) {
    out.push({
      field: 'anchor', group: 'stop',
      label: vi ? 'Neo cắt lỗ' : 'Stop anchor',
      detail: rule.anchor === 'signalBarLow'
        ? (vi ? 'Đáy của cây nến cuối — cây nến khiến bạn muốn mua' : 'The low of the last bar — the one that made you want in')
        : (vi ? `Đáy thấp nhất trong <b>${rule.lookback}</b> phiên gần nhất` : `The lowest low of the last <b>${rule.lookback}</b> sessions`),
      value: f2(lv.anchorPrice),
    });
  } else {
    out.push({
      field: 'anchor', group: 'stop',
      label: vi ? 'Neo cắt lỗ' : 'Stop anchor',
      detail: vi
        ? `Không dựa vào cấu trúc: ${f2(e)} − <b>${rule.atrMult}</b> × ATR(${lv.atr === null ? '?' : f2(lv.atr)})`
        : `No structure: ${f2(e)} − <b>${rule.atrMult}</b> × ATR(${lv.atr === null ? '?' : f2(lv.atr)})`,
      value: lv.atr === null ? '—' : f2(e - lv.atr * rule.atrMult),
    });
  }

  // ── 2. the pad ──
  // Recomputed rather than read back, because the padded price is the one number the
  // cap can overwrite — and showing it is the only way the cap step means anything.
  const padded = lv.anchorPrice === null ? null : lv.anchorPrice * (1 - rule.padPct / 100);
  if (padded !== null) {
    out.push({
      field: 'padPct', group: 'stop',
      label: vi ? 'Đệm' : 'Pad',
      detail: rule.padPct === 0
        ? (vi ? 'Đệm 0 — cắt lỗ nằm đúng ngay đáy, nên chính cây râu nến tạo ra đáy đó có thể quét bạn khỏi lệnh'
              : 'A 0 pad — the stop sits exactly on the low, so the wick that made it can sweep you out')
        : (vi ? `${f2(lv.anchorPrice!)} hạ thêm <b>${rule.padPct}%</b>` : `${f2(lv.anchorPrice!)} lowered by <b>${rule.padPct}%</b>`),
      value: f2(padded),
    });
  }

  // ── 3. the cap ──
  const atrGuide = lv.atr === null ? null : e - lv.atr * rule.atrMult;
  if (rule.maxStopRef === 'off') {
    out.push({
      field: 'maxStopRef', group: 'stop',
      label: vi ? 'Chặn' : 'Cap',
      detail: vi ? 'Không chặn — để cấu trúc quyết định, cần thì giảm số cổ'
                 : 'No cap — structure decides and the share count absorbs it',
      value: '—',
    });
  } else {
    const parts: string[] = [];
    if (lv.maxStopEmaValue !== null) {
      parts.push(`EMA${rule.maxStopEma} = <b>${f2(lv.maxStopEmaValue)}</b>`);
    } else if (rule.maxStopEma) {
      parts.push(vi ? `EMA${rule.maxStopEma} không nằm dưới giá vào nên bỏ qua` : `the ${rule.maxStopEma} EMA is not below the entry, so it is out`);
    }
    if (atrGuide !== null) parts.push(`${rule.atrMult}×ATR = <b>${f2(atrGuide)}</b>`);
    const pick = rule.maxStopRef === 'deeper'
      ? (vi ? 'lấy mốc sâu hơn' : 'take the deeper one')
      : (vi ? 'lấy mốc gần hơn' : 'take the nearer one');
    const bit = lv.warnings.includes('stopCappedByMax');
    out.push({
      field: 'maxStopRef', group: 'stop',
      label: vi ? 'Sâu nhất cho phép' : 'Deepest allowed',
      detail: `${parts.join(' · ')} → ${pick}`
        + (bit
          ? (vi ? ` — <b>đã chặn</b>: cắt lỗ bị kéo từ ${padded === null ? '' : f2(padded)} lên đây`
                : ` — <b>it bit</b>: the stop was pulled up from ${padded === null ? '' : f2(padded)} to here`)
          : (vi ? ' — không cần chặn' : ' — did not bite')),
      value: lv.maxStopPrice === null ? '—' : f2(lv.maxStopPrice),
    });
  }

  // ── 4. the stop, and what 1R is worth ──
  out.push({
    field: null, group: 'result',
    label: vi ? 'Cắt lỗ' : 'Stop',
    detail: vi
      ? `1R = ${f2(e)} − ${f2(lv.stop)} = <b>${f2(lv.riskPerShare)}</b> mỗi cổ, tức <b>${lv.stopPct}%</b> giá vào`
      : `1R = ${f2(e)} − ${f2(lv.stop)} = <b>${f2(lv.riskPerShare)}</b> per share, or <b>${lv.stopPct}%</b> of the entry`,
    value: f2(lv.stop),
  });

  // ── 5. the target ──
  if (rule.targetKind === 'rMultiple') {
    out.push({
      field: 'firstTargetR', group: 'target',
      label: vi ? 'Mục tiêu (bội số R)' : 'Target (R multiple)',
      detail: `${f2(e)} + <b>${rule.firstTargetR}</b> × ${f2(lv.riskPerShare)}`,
      value: lv.target === null ? '—' : f2(lv.target),
    });
  } else if (rule.targetKind === 'measuredMove') {
    const { hi, lo } = demoBaseHeight(rule.lookback);
    out.push({
      field: 'targetKind', group: 'target',
      label: vi ? 'Mục tiêu (chiều cao nền)' : 'Target (measured move)',
      detail: vi
        ? `Nền ${rule.lookback} phiên cao ${f2(hi)} − ${f2(lo)} = <b>${f2(hi - lo)}</b>, cộng vào giá vào`
        : `The ${rule.lookback}-session base is ${f2(hi)} − ${f2(lo)} = <b>${f2(hi - lo)}</b> tall, added to the entry`,
      value: lv.target === null ? '—' : f2(lv.target),
    });
  } else {
    out.push({
      field: 'targetEma', group: 'target',
      label: vi ? `Mục tiêu (chạm EMA${rule.targetEma ?? ''})` : `Target (at the ${rule.targetEma ?? ''} EMA)`,
      detail: lv.target === null
        ? (vi ? 'Trên chart ví dụ này EMA đó đang nằm DƯỚI giá vào — chẳng có gì để nhắm tới. Lệnh mean reversion chỉ hợp lý khi bạn vào dưới đường trung bình, không phải trên nó.'
              : 'On this example chart that EMA is BELOW the entry — nothing to aim at. A mean-reversion trade only makes sense entered under the mean, not above it.')
        : (vi ? 'Chốt hết tại đường trung bình, không theo R' : 'All of it comes off at the mean, with no R involved'),
      value: lv.target === null ? '—' : f2(lv.target),
    });
  }

  if (lv.rMultiple !== null) {
    out.push({
      field: null, group: 'result',
      label: 'R:R',
      detail: lv.rMultiple >= minRR
        ? (vi ? `Trên mức tối thiểu ${minRR} — được vào lệnh` : `Above the ${minRR} minimum — allowed`)
        : (vi ? `Dưới mức tối thiểu ${minRR} — Playbook bảo bỏ qua` : `Under the ${minRR} minimum — the book says skip it`),
      value: `${lv.rMultiple}R`,
    });
  }

  // ── 6. what happens to the rest ──
  out.push({
    field: 'trailEma', group: 'manage',
    label: vi ? 'Phần còn lại' : 'The runner',
    detail: rule.trailEma === null
      ? (vi ? 'Không trailing — ra hết ở mục tiêu' : 'No trail — all of it leaves at the target')
      : (vi ? `Chốt một nửa ở mục tiêu, nửa còn lại trailing theo <b>EMA${rule.trailEma}</b>`
            : `Half off at the target, the rest trailed against the <b>${rule.trailEma} EMA</b>`),
    value: rule.trailEma === null ? '—' : `EMA${rule.trailEma}`,
  });
  out.push({
    field: 'maxHoldSessions', group: 'manage',
    label: vi ? 'Hạn' : 'Expiry',
    detail: rule.maxHoldSessions === null
      ? (vi ? 'Không hết hạn — giữ đến khi chạm cắt lỗ hoặc mục tiêu' : 'Never expires — held until the stop or the target')
      : (vi ? `Quá <b>${rule.maxHoldSessions}</b> phiên thì luận điểm hết hiệu lực, dù giá ở đâu`
            : `After <b>${rule.maxHoldSessions}</b> sessions the thesis has expired, wherever price is`),
    value: rule.maxHoldSessions === null ? '—' : (vi ? `${rule.maxHoldSessions} phiên` : `${rule.maxHoldSessions} sess.`),
  });

  return out;
}

/** The warnings the demo plan raised, in the same words the Buy form uses. */
export function exampleWarnings(lv: LevelSuggestion, vi: boolean): string[] {
  return lv.warnings.map((w) => (vi ? LEVEL_WARN[w]?.[0] : LEVEL_WARN[w]?.[1]) ?? w);
}
