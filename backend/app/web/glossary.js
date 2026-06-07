// Single source of truth for all terminology.
// Used by both the Learn page and the hover tooltips.
window.GLOSSARY = {
  score: {
    term: "Conviction Score (0–100)",
    short: "How strong the setup is. 70+ = high conviction, 40–69 = developing, below 40 = weak.",
    long:
      "A 0–100 score blending six factors: Weinstein stage, ATR contraction, price-range tightness, " +
      "volume dry-up, number of VCP contractions, and how close price is to the pivot. " +
      "Higher means a tighter, more textbook consolidation near a breakout point. " +
      "It is a relative ranking aid — not a guarantee.",
  },
  signal: {
    term: "Signal",
    short: "BREAKOUT IMMINENT = score ≥ 70 and within 3% of pivot. CONSOLIDATING = score ≥ 40. NO SIGNAL otherwise.",
    long:
      "A plain-language label for the setup. BREAKOUT IMMINENT: the stock is coiled tight and sitting right " +
      "under a breakout level (score ≥ 70, within 3% of pivot). CONSOLIDATING: a valid base is forming " +
      "(score ≥ 40) but it is not at the trigger yet. NO SIGNAL: no tradeable setup right now.",
  },
  stage: {
    term: "Weinstein Stage (1–4)",
    short: "Where a stock is in its cycle. Stage 2 (Advancing) is the buy zone.",
    long:
      "Stan Weinstein's Stage Analysis classifies a trend using moving averages. " +
      "Stage 1 — Basing: sideways after a decline, building a floor. " +
      "Stage 2 — Advancing: uptrend, price above rising MAs — the classic buy zone. " +
      "Stage 3 — Topping: momentum fading, MAs flattening. " +
      "Stage 4 — Declining: downtrend, price below falling MAs — avoid.",
  },
  vcp: {
    term: "VCP — Volatility Contraction Pattern",
    short: "Each pullback in a base gets smaller and quieter. 3+ contractions is a textbook setup.",
    long:
      "Coined by Mark Minervini. As a healthy base forms, each successive pullback is shallower and " +
      "trades on lighter volume — like a spring coiling tighter. We count the number of these distinct " +
      "contractions; 2–3+ tight contractions indicate supply is drying up before a potential breakout.",
  },
  atr_contraction: {
    term: "ATR Contraction %",
    short: "How much daily volatility has shrunk inside the base. Higher = tighter = better.",
    long:
      "ATR (Average True Range) measures average daily price movement. We compare ATR at the start of the " +
      "base vs the end. A high contraction % means the stock is trading in an increasingly narrow range — " +
      "a sign of equilibrium between buyers and sellers that often precedes a sharp move.",
  },
  price_range: {
    term: "Price Range %",
    short: "High-to-low spread of the base. Tighter (smaller) is better.",
    long:
      "The percentage distance between the highest high and lowest low of the consolidation window. " +
      "A tight range (under ~15%) signals a well-controlled base; a wide range means the stock is still " +
      "swinging and hasn't settled.",
  },
  volume_dryup: {
    term: "Volume Dry-up %",
    short: "Drop in recent volume vs the base average. Higher = less selling pressure.",
    long:
      "Compares recent average volume to the volume earlier in the base. A positive dry-up means trading " +
      "activity has quieted — sellers are exhausted. Low volume in a tight base, followed by a volume surge " +
      "on the breakout, is the ideal sequence.",
  },
  pivot: {
    term: "Pivot / Pivot High",
    short: "The resistance level just overhead. A break above it is the buy trigger.",
    long:
      "The pivot is the most recent significant high acting as resistance. It is the line in the sand: " +
      "a decisive move above the pivot (ideally on big volume) is the classic breakout entry trigger.",
  },
  distance: {
    term: "Distance to Pivot %",
    short: "How far price is below the breakout level. Smaller = closer to triggering.",
    long:
      "How many percent the current price sits below the pivot. 0% means price is at the breakout line. " +
      "Setups within ~3% are 'imminent' — a small move would trigger the breakout.",
  },
  entry: {
    term: "Entry Price",
    short: "Suggested buy trigger — just above the pivot high.",
    long:
      "The breakout entry: a fraction above the pivot high. The idea is to buy strength as the stock clears " +
      "resistance, ideally confirmed by a surge in volume.",
  },
  stop: {
    term: "Stop-Loss",
    short: "Where you'd exit to cap a loss — based on recent volatility (ATR).",
    long:
      "A protective exit placed below entry, sized using ATR (≈1.5× ATR by default) so the stop respects the " +
      "stock's normal noise. If price falls here, the setup has failed and you cut the loss.",
  },
  target: {
    term: "Target Price",
    short: "Profit objective, set at 3× your risk by default.",
    long:
      "The first profit objective, computed from the risk distance (entry − stop) times the reward multiple " +
      "(3R by default). It gives a concrete level to plan partial or full profit-taking.",
  },
  rr: {
    term: "Risk : Reward (R:R)",
    short: "Potential reward divided by risk. 3R means you risk 1 to make 3.",
    long:
      "The ratio of potential profit (target − entry) to potential loss (entry − stop). A 3:1 R:R means a " +
      "winning trade pays three times what a losing trade costs — favorable math even if you're right less " +
      "than half the time.",
  },
  days_in_base: {
    term: "Days in Base",
    short: "How long the consolidation window analyzed is (trading days).",
    long:
      "The length of the consolidation window the engine evaluated (default ~60 trading days). Longer, " +
      "well-formed bases can lead to more powerful breakouts.",
  },
  volume_change: {
    term: "Sector Volume Change %",
    short: "Recent 3-month avg volume vs the 6-month avg, per sector.",
    long:
      "For the Sector scanner: the % change between a sector's average daily volume over the last 3 months " +
      "vs the last 6 months. Rising volume often signals fresh institutional interest rotating into a sector.",
  },
  // Fundamentals
  pe_ratio: {
    term: "P/E Ratio",
    short: "Price ÷ earnings per share. How much you pay per $1 of profit.",
    long:
      "Price-to-Earnings: share price divided by trailing earnings per share. A rough gauge of how richly a " +
      "stock is valued. High P/E = growth expectations priced in; low P/E = cheaper or out-of-favor.",
  },
  eps: {
    term: "EPS — Earnings Per Share",
    short: "Company profit divided by number of shares.",
    long:
      "A company's net profit divided by its outstanding shares. Growing EPS is one of the strongest drivers " +
      "of sustained stock advances.",
  },
  market_cap: {
    term: "Market Cap",
    short: "Total value of all shares (price × shares outstanding).",
    long:
      "The total market value of the company: share price times shares outstanding. Determines whether a " +
      "stock is small-, mid-, or large-cap.",
  },
  beta: {
    term: "Beta",
    short: "Volatility vs the market. >1 = swings more than the market; <1 = less.",
    long:
      "Measures how much a stock moves relative to the overall market. Beta of 1.0 moves with the market; " +
      "1.5 tends to swing 50% more; 0.7 is calmer than the market.",
  },
  dividend_yield: {
    term: "Dividend Yield",
    short: "Annual dividend as a % of share price.",
    long: "The annual dividend payment expressed as a percentage of the current share price.",
  },
  roe: {
    term: "ROE — Return on Equity",
    short: "Profit generated per $1 of shareholder equity. Higher = more efficient.",
    long:
      "Return on Equity measures how efficiently a company turns shareholder capital into profit. " +
      "Consistently high ROE (e.g. 15%+) is a hallmark of quality businesses.",
  },
  profit_margin: {
    term: "Profit Margin",
    short: "Share of revenue kept as profit.",
    long: "Net profit divided by revenue — how many cents of each sales dollar end up as profit.",
  },
  revenue_growth: {
    term: "Revenue Growth",
    short: "Year-over-year sales growth.",
    long: "The year-over-year percentage change in revenue. Strong, accelerating sales growth often precedes big winners.",
  },
  week52: {
    term: "52-Week High / Low",
    short: "The highest and lowest price over the past year.",
    long:
      "The price extremes over the trailing 12 months. Stocks breaking out near 52-week highs (rather than " +
      "languishing near lows) statistically tend to continue higher — strength begets strength.",
  },
};
