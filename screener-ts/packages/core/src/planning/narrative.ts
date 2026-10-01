import type { QmScanResult } from '../qm/types.js';

/** A bilingual string. Core stays i18n-agnostic; the UI selects the language. */
export interface Bilingual {
  en: string;
  vi: string;
}

/** Why a scan is (or isn't) interesting — structured, not free-form (Phase 8). */
export interface TradeExplanation {
  /** One-line headline summarizing the setup. */
  headline: Bilingual;
  /** Gates the stock PASSED (the bull case). */
  passed: Bilingual[];
  /** Gates the stock FAILED (the caveats). */
  failed: Bilingual[];
}

const fmtPct = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

/**
 * Phase 8 — explain a QM scan in plain language: why it passed / failed each
 * gate. Reuses the boolean + numeric fields already on the scan result (trend,
 * VCP, EP, momentum, liquidity); computes nothing new. The `analysis/`
 * AnalysisProvider scaffold remains the optional hook for a richer LLM narrative.
 */
export function explainPlan(scan: QmScanResult): TradeExplanation {
  const passed: Bilingual[] = [];
  const failed: Bilingual[] = [];
  const t = scan.trend;
  const v = scan.vcp;

  // ── Trend / stage ──
  if (t.passed) {
    passed.push({
      en: 'In a confirmed uptrend (price > EMA50 > EMA150 > EMA200, EMA200 rising).',
      vi: 'Đang trong uptrend đã xác nhận (giá > EMA50 > EMA150 > EMA200, EMA200 hướng lên).',
    });
  } else {
    failed.push({
      en: `Trend filter not passed${t.reason ? ` — ${t.reason}` : ''}.`,
      vi: `Chưa qua bộ lọc xu hướng${t.reason ? ` — ${t.reason}` : ''}.`,
    });
  }

  // ── Distance from 52-week high ──
  if (t.pctBelow52wHigh <= 25) {
    passed.push({
      en: `Within ${t.pctBelow52wHigh.toFixed(1)}% of its 52-week high — near leadership.`,
      vi: `Cách đỉnh 52 tuần ${t.pctBelow52wHigh.toFixed(1)}% — sát vùng của mã dẫn dắt.`,
    });
  }

  // ── VCP base ──
  if (v.isVcp) {
    passed.push({
      en: `Valid VCP: ${v.contractions} contraction(s), prior advance ${fmtPct(v.previousAdvancePct)}, volume contracted ${fmtPct(v.volumeContractionPct)}.`,
      vi: `VCP hợp lệ: ${v.contractions} nhịp co, nhịp tăng trước đó ${fmtPct(v.previousAdvancePct)}, volume co lại ${fmtPct(v.volumeContractionPct)}.`,
    });
  } else if (v.previousAdvancePct > 0) {
    failed.push({
      en: `No complete VCP yet (${v.contractions} contraction(s), base ${v.baseLength} bars).`,
      vi: `VCP chưa hoàn chỉnh (${v.contractions} nhịp co, base ${v.baseLength} phiên).`,
    });
  }

  // ── Episodic pivot ──
  if (scan.ep.isEp) {
    passed.push({
      en: `Episodic pivot: gapped ${fmtPct(scan.ep.gapPct)} on ${scan.ep.relativeVolume.toFixed(1)}× volume${scan.ep.catalyst ? ` (${scan.ep.catalyst})` : ''}.`,
      vi: `Episodic pivot: gap ${fmtPct(scan.ep.gapPct)}, volume gấp ${scan.ep.relativeVolume.toFixed(1)}×${scan.ep.catalyst ? ` (${scan.ep.catalyst})` : ''}.`,
    });
  }

  // ── Relative strength ──
  if (scan.relativeStrength > 0) {
    passed.push({
      en: `Outperforming the market (RS ${fmtPct(scan.relativeStrength)}).`,
      vi: `Mạnh hơn thị trường (RS ${fmtPct(scan.relativeStrength)}).`,
    });
  } else {
    failed.push({
      en: `Lagging the market (RS ${fmtPct(scan.relativeStrength)}).`,
      vi: `Yếu hơn thị trường (RS ${fmtPct(scan.relativeStrength)}).`,
    });
  }

  // ── Liquidity ──
  const dvM = (t.dollarVolume / 1_000_000).toFixed(1);
  if (t.dollarVolume >= 20_000_000) {
    passed.push({ en: `Liquid: ~$${dvM}M daily dollar volume.`, vi: `Thanh khoản tốt: ~$${dvM}M giá trị giao dịch/ngày.` });
  } else {
    failed.push({ en: `Thin liquidity: ~$${dvM}M daily dollar volume.`, vi: `Thanh khoản mỏng: ~$${dvM}M giá trị giao dịch/ngày.` });
  }

  const setupLabel: Record<QmScanResult['setupType'], Bilingual> = {
    VCP: { en: 'a VCP setup', vi: 'setup VCP' },
    EPISODIC_PIVOT: { en: 'an episodic pivot', vi: 'episodic pivot' },
    BOTH: { en: 'a VCP + episodic pivot', vi: 'VCP + episodic pivot' },
    NONE: { en: 'no actionable setup', vi: 'chưa có setup để vào lệnh' },
  };
  const s = setupLabel[scan.setupType];
  const headline: Bilingual = {
    en: `${scan.symbol}: ${s.en}, quality ${scan.qualityScore.toFixed(0)}/100.`,
    vi: `${scan.symbol}: ${s.vi}, điểm chất lượng ${scan.qualityScore.toFixed(0)}/100.`,
  };

  return { headline, passed, failed };
}
