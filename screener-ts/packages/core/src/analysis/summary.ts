import type { PatternResult } from '../types/signals.js';

/**
 * Per-stock analysis summary — rule-based, bilingual (English + Vietnamese).
 * Faithful port of the Python `build_summary` (backend/app/services/
 * analysis_summary.py). Deterministic and offline: same figures → same prose,
 * so it is safe to cache alongside the scan result. Pure logic — lives in core
 * so desktop and a future iOS app share it.
 */

function money(v: number | null): string {
  return v != null ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}
function pct(v: number | null, digits = 1): string {
  return v != null ? v.toFixed(digits) + '%' : '—';
}

const SIGNAL_PHRASE: Record<string, [string, string]> = {
  BREAKOUT_IMMINENT: ['a breakout looks imminent', 'một cú bứt phá có vẻ sắp xảy ra'],
  CONSOLIDATING: ['a base is still forming', 'nền giá vẫn đang hình thành'],
  NO_SIGNAL: ['there is no actionable setup right now', 'hiện chưa có thiết lập giao dịch nào'],
};

const STAGE_PHRASE: Record<number, [string, string]> = {
  1: ['Stage 1 (basing)', 'Giai đoạn 1 (tạo nền)'],
  2: ['Stage 2 (advancing — the buy zone)', 'Giai đoạn 2 (tăng giá — vùng mua)'],
  3: ['Stage 3 (topping)', 'Giai đoạn 3 (tạo đỉnh)'],
  4: ['Stage 4 (declining — avoid)', 'Giai đoạn 4 (giảm giá — nên tránh)'],
  0: ['an undetermined stage (insufficient data)', 'giai đoạn chưa xác định (thiếu dữ liệu)'],
};

function conviction(score: number): [string, string] {
  if (score >= 70) return ['high-conviction', 'độ tin cậy cao'];
  if (score >= 40) return ['developing', 'đang hình thành'];
  return ['weak', 'yếu'];
}

export interface BilingualText {
  en: string;
  vi: string;
}

export function buildSummary(result: PatternResult): BilingualText {
  const sym = result.symbol;
  const { stage, consolidation: cons, pivot } = result;

  const [convEn, convVi] = conviction(result.score);
  const [sigEn, sigVi] = SIGNAL_PHRASE[result.signal] ?? SIGNAL_PHRASE.NO_SIGNAL!;
  const [stageEn, stageVi] = STAGE_PHRASE[stage.stage] ?? STAGE_PHRASE[0]!;
  const s0 = result.score.toFixed(0);

  const en: string[] = [];
  const vi: string[] = [];

  // Sentence 1 — headline.
  en.push(`${sym} is in ${stageEn} with a ${convEn} score of ${s0}/100, and ${sigEn}.`);
  vi.push(`${sym} đang ở ${stageVi} với điểm ${convVi} ${s0}/100, và ${sigVi}.`);

  // Sentence 2 — the base.
  let baseEn = `The base spans about ${cons.daysInBase} trading days with a ${pct(cons.priceRangePct)} price range`;
  let baseVi = `Nền giá kéo dài khoảng ${cons.daysInBase} phiên với biên độ giá ${pct(cons.priceRangePct)}`;
  if (cons.atrContractionPct > 0) {
    baseEn += `, and daily volatility has contracted ${pct(cons.atrContractionPct)}`;
    baseVi += `, và biến động hằng ngày đã co lại ${pct(cons.atrContractionPct)}`;
  }
  if (cons.volumeDryUpPct > 0) {
    baseEn += ` as volume dried up ${pct(cons.volumeDryUpPct)}`;
    baseVi += ` khi thanh khoản cạn dần ${pct(cons.volumeDryUpPct)}`;
  }
  en.push(baseEn + '.');
  vi.push(baseVi + '.');

  if (cons.vcpContractions > 0) {
    const plural = cons.vcpContractions !== 1 ? 's' : '';
    en.push(
      `It shows ${cons.vcpContractions} VCP contraction${plural} — successively tighter pullbacks that hint supply is drying up.`,
    );
    vi.push(
      `Mẫu hình cho thấy ${cons.vcpContractions} lần co thắt VCP — các nhịp điều chỉnh thu hẹp dần, dấu hiệu lực bán đang cạn.`,
    );
  }

  // Sentence 3 — the pivot.
  if (pivot.pivotHigh) {
    en.push(
      `Price sits ${pct(pivot.distanceToPivotPct)} below the pivot at ${money(pivot.pivotHigh)}, the breakout trigger to watch.`,
    );
    vi.push(
      `Giá đang ở dưới điểm pivot ${money(pivot.pivotHigh)} khoảng ${pct(pivot.distanceToPivotPct)} — đây là mốc kích hoạt bứt phá cần theo dõi.`,
    );
  }

  // Sentence 4 — the trade plan.
  if (result.entryPrice && result.stopLoss && result.targetPrice) {
    const rr = result.riskReward ? result.riskReward.toFixed(1) + 'R' : '—';
    en.push(
      `A plan would buy near ${money(result.entryPrice)}, stop at ${money(result.stopLoss)}, and target ${money(result.targetPrice)} for a ${rr} risk/reward.`,
    );
    vi.push(
      `Một kế hoạch giao dịch có thể mua quanh ${money(result.entryPrice)}, cắt lỗ tại ${money(result.stopLoss)}, và chốt lời ở ${money(result.targetPrice)}, tương ứng tỷ lệ rủi ro/lợi nhuận ${rr}.`,
    );
  }

  // Closing caveat.
  en.push('This is an automated, educational read — not financial advice.');
  vi.push('Đây là phân tích tự động mang tính giáo dục — không phải lời khuyên đầu tư.');

  return { en: en.join(' '), vi: vi.join(' ') };
}
