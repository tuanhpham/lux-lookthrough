import json, numpy as np, pandas as pd
from app.services.pattern_engine import (
    analyze_stage, detect_consolidation, detect_pivot, compute_score,
    calculate_trade_levels, scan_stock, _compute_atr,
)

def make_df(seed, n, start, end, noise, vol_lo, vol_hi, tighten=False):
    rng = np.random.default_rng(seed)
    base = np.linspace(start, end, n) + rng.normal(0, noise, n)
    if tighten:
        # progressively shrink daily range in the last 80 bars (VCP-ish)
        spread = np.ones(n)
        spread[-80:] = np.linspace(1.0, 0.2, 80)
    else:
        spread = np.ones(n)
    high = base + spread
    low = base - spread
    close = base
    openp = base + rng.normal(0, noise*0.3, n)
    vol = rng.integers(vol_lo, vol_hi, n).astype(float)
    if tighten:
        vol[-20:] = vol[-20:] * 0.4  # volume dry-up
    idx = pd.date_range("2023-01-02", periods=n, freq="B")
    return pd.DataFrame({"open":openp,"high":high,"low":low,"close":close,"volume":vol}, index=idx)

def bars(df):
    return [
        {"date": idx.date().isoformat(),
         "open": float(r["open"]), "high": float(r["high"]),
         "low": float(r["low"]), "close": float(r["close"]),
         "volume": float(r["volume"])}
        for idx, r in df.iterrows()
    ]

def round6(x):
    if x is None: return None
    return round(float(x), 6)

cases = [
    dict(name="uptrend_tightening", seed=1, n=300, start=50, end=95, noise=1.0, vol_lo=1_000_000, vol_hi=2_000_000, tighten=True),
    dict(name="choppy_sideways",    seed=7, n=260, start=70, end=72, noise=2.5, vol_lo=800_000,  vol_hi=1_500_000, tighten=False),
    dict(name="downtrend",          seed=3, n=260, start=120, end=60, noise=1.5, vol_lo=500_000, vol_hi=1_200_000, tighten=False),
    dict(name="short_series",       seed=5, n=80,  start=30, end=40, noise=0.8, vol_lo=300_000, vol_hi=600_000,  tighten=False),
    dict(name="strong_uptrend",     seed=9, n=300, start=20, end=140, noise=1.2, vol_lo=2_000_000, vol_hi=4_000_000, tighten=True),
]

out = []
for c in cases:
    df = make_df(c["seed"], c["n"], c["start"], c["end"], c["noise"], c["vol_lo"], c["vol_hi"], c["tighten"])
    stage = analyze_stage(df)
    cons = detect_consolidation(df)
    pivot = detect_pivot(df)
    score = compute_score(stage, cons, pivot)
    atr_series = _compute_atr(df, 14).dropna()
    current_atr = float(atr_series.iloc[-1]) if not atr_series.empty else 0.0
    current_price = float(df["close"].iloc[-1])
    entry, stop, target, rr = calculate_trade_levels(current_price, pivot.pivot_high, current_atr)
    result = scan_stock(c["name"].upper(), df)
    out.append({
        "name": c["name"],
        "bars": bars(df),
        "expected": {
            "stage": stage.stage, "stage_label": stage.label,
            "ma_50": round6(stage.ma_50), "ma_150": round6(stage.ma_150), "ma_200": round6(stage.ma_200),
            "price": round6(stage.price),
            "is_consolidating": cons.is_consolidating,
            "days_in_base": cons.days_in_base,
            "price_range_pct": round6(cons.price_range_pct),
            "atr_contraction_pct": round6(cons.atr_contraction_pct),
            "volume_dry_up_pct": round6(cons.volume_dry_up_pct),
            "vcp_contractions": cons.vcp_contractions,
            "tightest_range_pct": round6(cons.tightest_range_pct),
            "pivot_high": round6(pivot.pivot_high),
            "distance_to_pivot_pct": round6(pivot.distance_to_pivot_pct),
            "recent_pivots": [round6(p) for p in pivot.recent_pivots],
            "current_atr": round6(current_atr),
            "score": round6(score),
            "signal": result.signal,
            "entry_price": round6(entry), "stop_loss": round6(stop),
            "target_price": round6(target), "risk_reward": round6(rr),
        },
    })

import numpy as _np
def _co(o):
    if isinstance(o,(_np.bool_,)): return bool(o)
    if isinstance(o,(_np.integer,)): return int(o)
    if isinstance(o,(_np.floating,)): return float(o)
    raise TypeError(str(type(o)))
print(json.dumps(out, indent=2, default=_co))
