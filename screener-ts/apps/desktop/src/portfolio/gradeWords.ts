/**
 * The words for the conviction checklist — the copy half of `tradeGrader.ts`.
 *
 * Same split as `planWords.ts`: core returns criterion KEYS and leaves the sentences to
 * the app, so the checklist can be read in either language without the scoring knowing
 * which one. Every label is phrased as a claim that is either true or false about the
 * chart in front of the user, because a criterion they cannot check is a criterion they
 * will tick out of politeness.
 *
 * ── WHY THE LABELS CARRY THE NUMBER ─────────────────────────────────────────
 * "Relative strength 80+" rather than "strong relative strength". The threshold is the
 * criterion; hiding it would leave the user unable to tell whether a red cross is a
 * verdict about their stock or a disagreement with the rule. The numbers here have to
 * stay in step with `GRADE_BARS`, and `gradeWords.test.ts` checks that they do.
 */
import { GRADE_BARS, type GradeGroup } from '@screener/core';

/** `[vi, en]`, like every other table in this folder. */
type Pair = [string, string];

const B = GRADE_BARS;

export const CRITERION_LABEL: Record<string, Pair> = {
  // ── The market ──
  regimeUptrend: ['Chỉ số đang trong xu hướng tăng đã xác nhận', 'The index is in a confirmed uptrend'],
  regimeNotHostile: ['Chỉ số không trong xu hướng giảm', 'The index is not in a downtrend'],

  // ── Trend template ──
  aboveMa50: ['Giá trên MA50', 'Price above the 50-day average'],
  maStack: ['MA50 > MA150 > MA200 (xếp đúng thứ tự)', 'MA50 > MA150 > MA200, in that order'],
  ma200Rising: ['MA200 đang đi lên', 'The 200-day average is rising'],
  near52wHigh: [
    `Cách đỉnh 52 tuần không quá ${B.NEAR_HIGH_PCT}%`,
    `Within ${B.NEAR_HIGH_PCT}% of the 52-week high`,
  ],

  // ── Leadership ──
  rsStrong: [`Sức mạnh tương đối từ ${B.RS_STRONG} trở lên`, `Relative strength ${B.RS_STRONG}+`],
  rsElite: [`Sức mạnh tương đối từ ${B.RS_ELITE} trở lên`, `Relative strength ${B.RS_ELITE}+`],

  // ── The base ──
  contractions: [
    `Có ít nhất ${B.MIN_CONTRACTIONS} lần nén thu hẹp dần`,
    `At least ${B.MIN_CONTRACTIONS} contracting pullbacks`,
  ],
  baseTight: [`Nền sâu không quá ${B.MAX_BASE_DEPTH_PCT}%`, `Base no deeper than ${B.MAX_BASE_DEPTH_PCT}%`],
  atrContracting: [
    `Biên độ (ATR) co lại ít nhất ${B.MIN_ATR_CONTRACTION_PCT}% trong nền`,
    `Range (ATR) contracted at least ${B.MIN_ATR_CONTRACTION_PCT}% across the base`,
  ],
  noOverheadSupply: [
    'Không có vùng kẹt hàng nặng ngay phía trên',
    'No heavy overhead supply just above',
  ],

  // ── Demand ──
  volumeDryUp: [
    `Khối lượng cạn dần ít nhất ${B.MIN_VOLUME_DRYUP_PCT}% vào điểm mua`,
    `Volume dried up at least ${B.MIN_VOLUME_DRYUP_PCT}% into the pivot`,
  ],

  // ── The gap ──
  gapSize: [`Nhảy khoảng từ ${B.MIN_GAP_PCT}% trở lên`, `Gapped ${B.MIN_GAP_PCT}% or more`],
  gapVolume: [
    `Khối lượng ngày nhảy khoảng gấp ${B.MIN_EP_RVOL} lần trung bình`,
    `Gap-day volume ${B.MIN_EP_RVOL}× its average`,
  ],
  closedStrong: [
    'Đóng cửa ở nửa trên của biên độ ngày nhảy khoảng',
    'Closed in the upper half of the gap day’s range',
  ],
  clearedResistance: ['Nhảy vượt qua vùng kháng cự trước đó', 'Gapped clear of the prior resistance'],
  catalyst: ['Có nguyên nhân rõ ràng (kết quả kinh doanh, tin)', 'A named cause (earnings, news)'],

  // ── Momentum ──
  priorAdvance: [
    `Đã tăng ít nhất ${B.MIN_PRIOR_ADVANCE_PCT}% trước khi tạo nền`,
    `Advanced at least ${B.MIN_PRIOR_ADVANCE_PCT}% before the base`,
  ],

  // ── Liquidity ──
  liquid: [
    `Giá trị giao dịch trung bình từ ${B.MIN_DOLLAR_VOLUME / 1_000_000} triệu $/ngày`,
    `At least $${B.MIN_DOLLAR_VOLUME / 1_000_000}M traded per day`,
  ],

  // ── This trade's mechanics ──
  rrOk: [`Lãi/lỗ kỳ vọng từ ${B.MIN_RR}R trở lên`, `Reward-to-risk of ${B.MIN_RR}R or better`],
  stopSane: [`Cắt lỗ cách điểm vào không quá ${B.MAX_STOP_PCT}%`, `Stop within ${B.MAX_STOP_PCT}% of the entry`],
  earningsClear: [
    'Không có ngày báo cáo trong thời gian dự định giữ',
    'No earnings date inside the intended holding window',
  ],

  // ── The fundamentals ──
  epsGrowth: ['Lợi nhuận và doanh thu đang tăng tốc', 'Earnings and sales are accelerating'],
  groupLeader: ['Thuộc nhóm ngành đang dẫn dắt', 'In a leading industry group'],
  institutional: ['Có dấu hiệu tổ chức đang gom', 'Signs of institutional accumulation'],
};

export function criterionLabel(key: string, vi: boolean): string {
  const p = CRITERION_LABEL[key];
  // The key itself, not an empty string: a checklist row with no words is a bug the user
  // cannot report, whereas a raw key is one they can quote.
  if (!p) return key;
  return vi ? p[0] : p[1];
}

export const GROUP_LABEL: Record<GradeGroup, Pair> = {
  market: ['Thị trường', 'Market'],
  trend: ['Xu hướng', 'Trend'],
  strength: ['Sức mạnh tương đối', 'Relative strength'],
  base: ['Chất lượng nền', 'Base quality'],
  volume: ['Khối lượng', 'Volume'],
  pivot: ['Ngày nhảy khoảng', 'The gap'],
  momentum: ['Đà tăng trước đó', 'Prior advance'],
  liquidity: ['Thanh khoản', 'Liquidity'],
  risk: ['Cơ chế rủi ro', 'Risk mechanics'],
  fundamental: ['Cơ bản', 'Fundamentals'],
};

export function groupLabel(g: GradeGroup, vi: boolean): string {
  return vi ? GROUP_LABEL[g][0] : GROUP_LABEL[g][1];
}
