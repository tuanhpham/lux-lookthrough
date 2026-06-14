"""
Per-stock analysis summary — rule-based, bilingual (English + Vietnamese).

Turns the raw figures the pattern engine produces (Weinstein stage, conviction
score, base tightness, ATR contraction, volume dry-up, VCP count, pivot
proximity, and the entry/stop/target/R:R trade plan) into a short, plain-language
narrative a human can read at a glance — in both English (``en``) and
Vietnamese (``vi``).

Deterministic and offline: no LLM, no API key, no network. The same figures
always yield the same prose, so it is safe to cache alongside the scan result.
"""

from __future__ import annotations

from app.services.pattern_engine import PatternResult

# ── Small bilingual formatting helpers ─────────────────────────────────────────


def _money(v: float | None) -> str:
    return f"${v:,.2f}" if v is not None else "—"


def _pct(v: float | None, digits: int = 1) -> str:
    return f"{v:.{digits}f}%" if v is not None else "—"


# Signal → (English phrase, Vietnamese phrase)
_SIGNAL_PHRASE = {
    "BREAKOUT_IMMINENT": (
        "a breakout looks imminent",
        "một cú bứt phá có vẻ sắp xảy ra",
    ),
    "CONSOLIDATING": (
        "a base is still forming",
        "nền giá vẫn đang hình thành",
    ),
    "NO_SIGNAL": (
        "there is no actionable setup right now",
        "hiện chưa có thiết lập giao dịch nào",
    ),
}

# Weinstein stage → (English label, Vietnamese label)
_STAGE_PHRASE = {
    1: ("Stage 1 (basing)", "Giai đoạn 1 (tạo nền)"),
    2: ("Stage 2 (advancing — the buy zone)", "Giai đoạn 2 (tăng giá — vùng mua)"),
    3: ("Stage 3 (topping)", "Giai đoạn 3 (tạo đỉnh)"),
    4: ("Stage 4 (declining — avoid)", "Giai đoạn 4 (giảm giá — nên tránh)"),
    0: ("an undetermined stage (insufficient data)", "giai đoạn chưa xác định (thiếu dữ liệu)"),
}


def _conviction(score: float) -> tuple[str, str]:
    """Map a 0–100 score to a qualitative English/Vietnamese descriptor."""
    if score >= 70:
        return "high-conviction", "độ tin cậy cao"
    if score >= 40:
        return "developing", "đang hình thành"
    return "weak", "yếu"


def build_summary(result: PatternResult) -> dict[str, str]:
    """Build a bilingual analysis summary for one scanned stock.

    Args:
        result: The :class:`PatternResult` from ``scan_stock``.

    Returns:
        A dict ``{"en": <english text>, "vi": <vietnamese text>}``.
    """
    sym = result.symbol
    stage = result.stage
    cons = result.consolidation
    pivot = result.pivot

    conv_en, conv_vi = _conviction(result.score)
    sig_en, sig_vi = _SIGNAL_PHRASE.get(result.signal, _SIGNAL_PHRASE["NO_SIGNAL"])
    stage_en, stage_vi = _STAGE_PHRASE.get(stage.stage, _STAGE_PHRASE[0])

    en: list[str] = []
    vi: list[str] = []

    # ── Sentence 1 — headline: stage, conviction, signal ──────────────────────
    en.append(
        f"{sym} is in {stage_en} with a {conv_en} score of {result.score:.0f}/100, "
        f"and {sig_en}."
    )
    vi.append(
        f"{sym} đang ở {stage_vi} với điểm {conv_vi} {result.score:.0f}/100, "
        f"và {sig_vi}."
    )

    # ── Sentence 2 — the base: tightness, ATR, volume, VCP ────────────────────
    base_en = (
        f"The base spans about {cons.days_in_base} trading days with a "
        f"{_pct(cons.price_range_pct)} price range"
    )
    base_vi = (
        f"Nền giá kéo dài khoảng {cons.days_in_base} phiên với biên độ giá "
        f"{_pct(cons.price_range_pct)}"
    )

    if cons.atr_contraction_pct > 0:
        base_en += f", and daily volatility has contracted {_pct(cons.atr_contraction_pct)}"
        base_vi += f", và biến động hằng ngày đã co lại {_pct(cons.atr_contraction_pct)}"

    if cons.volume_dry_up_pct > 0:
        base_en += f" as volume dried up {_pct(cons.volume_dry_up_pct)}"
        base_vi += f" khi thanh khoản cạn dần {_pct(cons.volume_dry_up_pct)}"

    base_en += "."
    base_vi += "."
    en.append(base_en)
    vi.append(base_vi)

    if cons.vcp_contractions > 0:
        en.append(
            f"It shows {cons.vcp_contractions} VCP contraction"
            f"{'s' if cons.vcp_contractions != 1 else ''} — "
            "successively tighter pullbacks that hint supply is drying up."
        )
        vi.append(
            f"Mẫu hình cho thấy {cons.vcp_contractions} lần co thắt VCP — "
            "các nhịp điều chỉnh thu hẹp dần, dấu hiệu lực bán đang cạn."
        )

    # ── Sentence 3 — the pivot ────────────────────────────────────────────────
    if pivot.pivot_high:
        en.append(
            f"Price sits {_pct(pivot.distance_to_pivot_pct)} below the pivot at "
            f"{_money(pivot.pivot_high)}, the breakout trigger to watch."
        )
        vi.append(
            f"Giá đang ở dưới điểm pivot {_money(pivot.pivot_high)} khoảng "
            f"{_pct(pivot.distance_to_pivot_pct)} — đây là mốc kích hoạt bứt phá cần theo dõi."
        )

    # ── Sentence 4 — the trade plan ───────────────────────────────────────────
    if result.entry_price and result.stop_loss and result.target_price:
        rr = f"{result.risk_reward:.1f}R" if result.risk_reward else "—"
        en.append(
            f"A plan would buy near {_money(result.entry_price)}, "
            f"stop at {_money(result.stop_loss)}, and target {_money(result.target_price)} "
            f"for a {rr} risk/reward."
        )
        vi.append(
            f"Một kế hoạch giao dịch có thể mua quanh {_money(result.entry_price)}, "
            f"cắt lỗ tại {_money(result.stop_loss)}, và chốt lời ở {_money(result.target_price)}, "
            f"tương ứng tỷ lệ rủi ro/lợi nhuận {rr}."
        )

    # ── Closing caveat ────────────────────────────────────────────────────────
    en.append("This is an automated, educational read — not financial advice.")
    vi.append("Đây là phân tích tự động mang tính giáo dục — không phải lời khuyên đầu tư.")

    return {"en": " ".join(en), "vi": " ".join(vi)}
