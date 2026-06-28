/** Bilingual glossary, ported from the backend's glossary.js (term + long
 * description, grouped). Used by the Learn tab. */
import { getLang } from './i18n.js';

interface Entry {
  term: { en: string; vi: string };
  long: { en: string; vi: string };
}

export const GLOSSARY: Record<string, Entry> = {
  quality: {
    term: { en: 'Quality Score (0–100)', vi: 'Điểm chất lượng (0–100)' },
    long: {
      en: 'The Qullamaggie quality score blends seven weighted factors: trend alignment (20), previous advance (10), VCP quality (25), volume dry-up (15), relative strength (15), liquidity (10) and breakout proximity (5). Higher means a cleaner, higher-probability setup right now. A ranking aid — not a guarantee.',
      vi: 'Điểm chất lượng Qullamaggie kết hợp bảy yếu tố có trọng số: xu hướng (20), nhịp tăng trước (10), chất lượng VCP (25), cạn khối lượng (15), sức mạnh tương đối (15), thanh khoản (10) và mức độ gần điểm bứt phá (5). Càng cao = thiết lập càng sạch, xác suất cao hơn. Là công cụ xếp hạng — không phải bảo đảm.',
    },
  },
  setup_type: {
    term: { en: 'Setup Type', vi: 'Loại thiết lập' },
    long: {
      en: 'VCP — a volatility contraction pattern after a strong advance. EPISODIC PIVOT — a news/earnings gap with heavy volume closing near the high. VCP + EP — a base that is also gapping on a catalyst. NONE — no actionable Qullamaggie setup right now.',
      vi: 'VCP — mẫu hình co thắt biến động sau một nhịp tăng mạnh. ĐIỂM XOAY ĐỘT BIẾN — cú gap theo tin tức/lợi nhuận với khối lượng lớn, đóng cửa gần đỉnh. VCP + EP — nền đồng thời gap theo chất xúc tác. KHÔNG — hiện chưa có thiết lập.',
    },
  },
  trend_gate: {
    term: { en: 'Trend Filter', vi: 'Bộ lọc xu hướng' },
    long: {
      en: 'A pass/fail gate: price above EMA50, EMA50 above EMA150, EMA150 above EMA200, EMA200 rising, within range of the 52-week high, and sufficiently liquid. Qullamaggie only trades stocks in a confirmed uptrend.',
      vi: 'Cổng đạt/không đạt: giá trên EMA50, EMA50 trên EMA150, EMA150 trên EMA200, EMA200 đang lên, gần đỉnh 52 tuần và đủ thanh khoản. Qullamaggie chỉ giao dịch cổ phiếu trong xu hướng tăng đã xác nhận.',
    },
  },
  prev_advance: {
    term: { en: 'Previous Advance %', vi: '% Nhịp tăng trước' },
    long: {
      en: 'The size of the prior up-leg leading into the base. Qullamaggie setups follow a strong advance (≥ ~30%) — the base is a rest after a sprint, not a random range.',
      vi: 'Độ lớn của nhịp tăng dẫn vào nền. Thiết lập Qullamaggie đi sau một nhịp tăng mạnh (≥ ~30%) — nền là khoảng nghỉ sau một cú chạy nước rút, không phải dao động ngẫu nhiên.',
    },
  },
  momentum_score: {
    term: { en: 'Momentum Score (0–100)', vi: 'Điểm động lượng (0–100)' },
    long: {
      en: 'Blends 1-month (15), 3-month (25) and 6-month (25) returns, relative strength vs SPY (25) and liquidity (10). Stocks are classed by percentile: Weak → Building → Strong → Explosive. Answers "what is running right now?".',
      vi: 'Kết hợp lợi nhuận 1 tháng (15), 3 tháng (25), 6 tháng (25), sức mạnh tương đối so với SPY (25) và thanh khoản (10). Phân loại theo phân vị: Yếu → Đang xây → Mạnh → Bùng nổ. Trả lời "mã nào đang chạy?".',
    },
  },
  rs: {
    term: { en: 'Relative Strength (RS)', vi: 'Sức mạnh tương đối (RS)' },
    long: {
      en: 'Performance versus a benchmark (SPY) over several lookbacks. Positive RS means the stock is outperforming the market — leadership that often persists.',
      vi: 'Hiệu suất so với chỉ số tham chiếu (SPY) qua nhiều khung thời gian. RS dương nghĩa là cổ phiếu vượt trội thị trường — vị thế dẫn dắt thường duy trì.',
    },
  },
  regime: {
    term: { en: 'Market Regime', vi: 'Bối cảnh thị trường' },
    long: {
      en: 'The overall market state from SPY/QQQ: BULL (above stacked, rising EMAs — risk-on), TRANSITION (mixed), or BEAR (below the 200-EMA — risk-off). It frames when to press and when to stand aside.',
      vi: 'Trạng thái chung của thị trường từ SPY/QQQ: TĂNG (trên các EMA xếp tầng, dốc lên — risk-on), CHUYỂN TIẾP (hỗn hợp), hay GIẢM (dưới EMA200 — risk-off). Cho biết khi nào nên mạnh tay và khi nào nên đứng ngoài.',
    },
  },
  vcp: {
    term: { en: 'VCP — Volatility Contraction Pattern', vi: 'VCP — Mẫu hình co thắt biến động' },
    long: {
      en: 'Coined by Mark Minervini. As a healthy base forms, each successive pullback is shallower and trades on lighter volume — like a spring coiling tighter. 2–3+ tight contractions indicate supply is drying up before a potential breakout.',
      vi: 'Khái niệm của Mark Minervini. Khi nền lành mạnh hình thành, mỗi nhịp điều chỉnh kế tiếp nông hơn và khối lượng nhẹ hơn — như lò xo nén chặt dần. 2–3+ lần co thắt chặt cho thấy lực cung đang cạn trước cú bứt phá tiềm năng.',
    },
  },
  atr_contraction: {
    term: { en: 'ATR Contraction %', vi: '% Co thắt ATR' },
    long: {
      en: 'ATR (Average True Range) measures average daily price movement. We compare ATR at the start of the base vs the end. A high contraction % means an increasingly narrow range — equilibrium between buyers and sellers that often precedes a sharp move.',
      vi: 'ATR (Khoảng dao động thực trung bình) đo biên độ giá trung bình mỗi ngày. Ta so sánh ATR đầu nền với cuối nền. % co thắt cao nghĩa là biên độ ngày càng hẹp — sự cân bằng giữa bên mua và bên bán, thường xảy ra trước một cú bứt phá mạnh.',
    },
  },
  price_range: {
    term: { en: 'Price Range %', vi: '% Biên độ giá' },
    long: {
      en: 'The percentage distance between the highest high and lowest low of the consolidation window. A tight range (under ~15%) signals a well-controlled base; a wide range means the stock is still swinging.',
      vi: 'Khoảng cách phần trăm giữa đỉnh cao nhất và đáy thấp nhất của vùng tích lũy. Biên độ chặt (dưới ~15%) cho thấy nền được kiểm soát tốt; biên độ rộng nghĩa là cổ phiếu vẫn dao động.',
    },
  },
  volume_dryup: {
    term: { en: 'Volume Dry-up %', vi: '% Cạn khối lượng' },
    long: {
      en: 'Compares recent average volume to the volume earlier in the base. A positive dry-up means trading has quieted — sellers are exhausted. Low volume in a tight base, followed by a volume surge on the breakout, is the ideal sequence.',
      vi: 'So sánh khối lượng trung bình gần đây với khối lượng giai đoạn đầu nền. Cạn khối lượng dương nghĩa là giao dịch đã lắng xuống — bên bán đã cạn. Khối lượng thấp trong nền chặt, theo sau là khối lượng tăng vọt khi bứt phá, là trình tự lý tưởng.',
    },
  },
  days_in_base: {
    term: { en: 'Days in Base', vi: 'Số ngày trong nền' },
    long: {
      en: 'The length of the consolidation window the engine evaluated (default ~60 trading days). Longer, well-formed bases can lead to more powerful breakouts.',
      vi: 'Độ dài vùng tích lũy mà công cụ đánh giá (mặc định ~60 phiên). Những nền dài, hình thành tốt có thể dẫn tới những cú bứt phá mạnh hơn.',
    },
  },
  pivot: {
    term: { en: 'Pivot / Pivot High', vi: 'Pivot / Đỉnh pivot' },
    long: {
      en: 'The most recent significant high acting as resistance — the line in the sand. A decisive move above the pivot (ideally on big volume) is the classic breakout entry trigger.',
      vi: 'Đỉnh quan trọng gần nhất đóng vai trò kháng cự — lằn ranh. Một cú vượt dứt khoát qua pivot (lý tưởng với khối lượng lớn) là tín hiệu vào lệnh bứt phá kinh điển.',
    },
  },
  distance: {
    term: { en: 'Distance to Pivot %', vi: '% Khoảng cách tới pivot' },
    long: {
      en: 'How many percent the current price sits below the pivot. 0% means price is at the breakout line. Setups within ~3% are "imminent" — a small move would trigger the breakout.',
      vi: 'Giá hiện tại đang ở dưới pivot bao nhiêu phần trăm. 0% nghĩa là giá ở ngay lằn bứt phá. Các thiết lập trong ~3% là "sắp xảy ra" — chỉ một nhịp nhỏ là kích hoạt.',
    },
  },
  entry: {
    term: { en: 'Entry Price', vi: 'Giá vào lệnh' },
    long: {
      en: 'The breakout entry: a fraction above the pivot high. Buy strength as the stock clears resistance, ideally confirmed by a surge in volume.',
      vi: 'Điểm vào lệnh bứt phá: cao hơn đỉnh pivot một chút. Mua theo sức mạnh khi cổ phiếu vượt kháng cự, lý tưởng được xác nhận bằng khối lượng tăng vọt.',
    },
  },
  stop: {
    term: { en: 'Stop-Loss', vi: 'Cắt lỗ' },
    long: {
      en: 'A protective exit below entry, sized using ATR (≈1.5× ATR by default) so the stop respects the stock\'s normal noise. If price falls here, the setup has failed and you cut the loss.',
      vi: 'Điểm thoát bảo vệ đặt dưới giá vào lệnh, tính theo ATR (mặc định ≈1,5× ATR) để tôn trọng nhiễu giá bình thường. Nếu giá rơi tới đây, thiết lập đã thất bại và bạn cắt lỗ.',
    },
  },
  target: {
    term: { en: 'Target Price', vi: 'Giá mục tiêu' },
    long: {
      en: 'The first profit objective, computed from the risk distance (entry − stop) times the reward multiple (3R by default). A concrete level to plan profit-taking.',
      vi: 'Mục tiêu lợi nhuận đầu tiên, tính từ khoảng rủi ro (giá vào − cắt lỗ) nhân hệ số lợi nhuận (mặc định 3R). Một mức cụ thể để lên kế hoạch chốt lời.',
    },
  },
  rr: {
    term: { en: 'Risk : Reward (R:R)', vi: 'Rủi ro : Lợi nhuận (R:R)' },
    long: {
      en: 'The ratio of potential profit (target − entry) to potential loss (entry − stop). A 3:1 R:R means a winning trade pays three times what a losing trade costs — favorable math even if you are right less than half the time.',
      vi: 'Tỷ lệ giữa lợi nhuận tiềm năng (mục tiêu − giá vào) và rủi ro tiềm năng (giá vào − cắt lỗ). R:R 3:1 nghĩa là một lệnh thắng mang lại gấp ba lần chi phí một lệnh thua — phép toán có lợi ngay cả khi bạn đúng dưới một nửa số lần.',
    },
  },
  r_multiple: {
    term: { en: 'R-multiple (paper trading)', vi: 'Bội số R (giao dịch giấy)' },
    long: {
      en: 'Trade PnL ÷ initial per-share risk, where risk = entry − stop. +2R means you made twice what you risked. The portfolio expectancy is the average R across closed trades.',
      vi: 'Lãi/lỗ của lệnh ÷ rủi ro ban đầu mỗi cổ phiếu, với rủi ro = giá vào − cắt lỗ. +2R nghĩa là bạn lãi gấp đôi số đã rủi ro. Kỳ vọng của danh mục là R trung bình trên các lệnh đã đóng.',
    },
  },
  volume_change: {
    term: { en: 'Sector Volume Change %', vi: '% Thay đổi khối lượng ngành' },
    long: {
      en: "The % change between a sector's average daily volume over the last 3 months vs the last 6 months. Rising volume often signals fresh institutional interest rotating into a sector.",
      vi: 'Thay đổi % giữa khối lượng trung bình ngày của ngành trong 3 tháng so với 6 tháng. Khối lượng tăng thường báo hiệu dòng tiền tổ chức mới luân chuyển vào ngành.',
    },
  },
  pe_ratio: {
    term: { en: 'P/E Ratio (TTM)', vi: 'Tỷ số P/E (TTM)' },
    long: {
      en: 'Trailing twelve-month P/E: current share price divided by the sum of the last four reported quarterly EPS. A rough gauge of valuation — refreshed live as the price moves. High P/E = growth expectations priced in; low P/E = cheaper or out-of-favor. Note: the Fundamentals Trend chart shows P/E at each annual fiscal year-end, which will differ.',
      vi: 'P/E 12 tháng gần nhất (TTM): giá cổ phiếu hiện tại chia cho tổng EPS của 4 quý báo cáo gần nhất. Thước đo sơ bộ định giá — cập nhật theo giá trực tiếp. P/E cao = kỳ vọng tăng trưởng; P/E thấp = rẻ hơn hoặc kém ưa chuộng. Lưu ý: biểu đồ Xu hướng cơ bản hiển thị P/E tại cuối mỗi năm tài chính, có thể khác nhau.',
    },
  },
  eps: {
    term: { en: 'EPS — Trailing Twelve Months', vi: 'EPS — 12 tháng gần nhất' },
    long: {
      en: "Earnings Per Share for the trailing twelve months (TTM): sum of diluted EPS from the last four reported quarters. This is the most current profitability read. Growing EPS is one of the strongest drivers of sustained stock advances. Note: each bar in the Fundamentals Trend chart shows EPS for a single fiscal year or quarter — those figures represent a fixed period, not a rolling sum, so they will typically differ from this TTM number.",
      vi: 'Lợi nhuận trên mỗi cổ phiếu (EPS) trong 12 tháng gần nhất (TTM): tổng EPS pha loãng của 4 quý báo cáo gần nhất. Đây là thước đo lợi nhuận hiện tại nhất. EPS tăng trưởng là một trong những động lực mạnh nhất cho đà tăng bền vững. Lưu ý: mỗi cột trong biểu đồ Xu hướng cơ bản hiển thị EPS của một năm tài chính hoặc quý cố định — khác với tổng TTM này.',
    },
  },
  market_cap: {
    term: { en: 'Market Cap (Live)', vi: 'Vốn hóa thị trường (trực tiếp)' },
    long: {
      en: 'The total market value of the company: current share price times shares outstanding — updated in real time as the price changes. Determines small- (<$2B), mid- ($2–10B), or large-cap (>$10B).',
      vi: 'Tổng giá trị thị trường: giá cổ phiếu hiện tại nhân số cổ phiếu lưu hành — cập nhật theo thời gian thực theo giá. Xác định vốn hóa nhỏ (<2 tỷ $), vừa (2–10 tỷ $) hay lớn (>10 tỷ $).',
    },
  },
  profit_margin: {
    term: { en: 'Profit Margin (TTM)', vi: 'Biên lợi nhuận (TTM)' },
    long: {
      en: 'Net profit margin for the trailing twelve months: net income ÷ revenue over the last four reported quarters. How many cents of each sales dollar end up as profit — on a rolling basis. A rising margin trend is a positive quality signal.',
      vi: 'Biên lợi nhuận ròng 12 tháng gần nhất: lợi nhuận ròng ÷ doanh thu trong 4 quý báo cáo gần nhất. Mỗi đồng doanh thu còn lại bao nhiêu xu là lợi nhuận — theo giai đoạn liên tục. Biên lợi nhuận tăng dần là tín hiệu chất lượng tích cực.',
    },
  },
  roe: {
    term: { en: 'ROE — Return on Equity (TTM)', vi: 'ROE — Lợi nhuận trên vốn chủ (TTM)' },
    long: {
      en: 'Return on Equity for the trailing twelve months: net income ÷ shareholder equity. How efficiently a company turns capital into profit on a rolling basis. Consistently high ROE (15%+) is a hallmark of quality businesses.',
      vi: 'ROE 12 tháng gần nhất: lợi nhuận ròng ÷ vốn chủ sở hữu. Mức độ hiệu quả công ty biến vốn thành lợi nhuận theo giai đoạn liên tục. ROE cao ổn định (15%+) là dấu hiệu doanh nghiệp chất lượng.',
    },
  },
  revenue_growth: {
    term: { en: 'Revenue Growth (YoY)', vi: 'Tăng trưởng doanh thu (YoY)' },
    long: {
      en: 'Year-over-year revenue growth for the most recent reported quarter vs the same quarter one year ago. A positive number means the latest quarter was larger. Strong, accelerating quarterly growth often precedes big winners. Note: the Fundamentals Trend chart shows annual revenue for each fiscal year.',
      vi: 'Tăng trưởng doanh thu so cùng kỳ (YoY) của quý báo cáo gần nhất so với quý tương ứng năm trước. Số dương có nghĩa quý gần nhất lớn hơn. Tăng trưởng quý mạnh và tăng tốc thường đi trước những cổ phiếu thắng lớn. Lưu ý: biểu đồ Xu hướng cơ bản hiển thị doanh thu theo từng năm tài chính.',
    },
  },
  beta: {
    term: { en: 'Beta (5-Year)', vi: 'Beta (5 năm)' },
    long: {
      en: '5-year monthly beta versus the S&P 500: how much a stock moves relative to the market. Beta 1.0 tracks the market; 1.5 swings ~50% more; 0.7 is calmer. High-beta momentum names can amplify both gains and losses.',
      vi: 'Beta tháng 5 năm so với S&P 500: mức độ biến động của cổ phiếu so với thị trường. Beta 1,0 dao động cùng thị trường; 1,5 mạnh hơn ~50%; 0,7 êm hơn. Mã momentum beta cao có thể khuếch đại cả lãi lẫn lỗ.',
    },
  },
  dividend_yield: {
    term: { en: 'Dividend Yield', vi: 'Tỷ suất cổ tức' },
    long: {
      en: 'The annual dividend expressed as a percentage of the current share price.',
      vi: 'Khoản cổ tức hằng năm biểu thị theo phần trăm giá cổ phiếu hiện tại.',
    },
  },
  week52: {
    term: { en: '52-Week High / Low', vi: 'Đỉnh / Đáy 52 tuần' },
    long: {
      en: 'The price extremes over the trailing 12 months. Stocks breaking out near 52-week highs statistically tend to continue higher — strength begets strength.',
      vi: 'Các mức giá cực trị trong 12 tháng gần nhất. Cổ phiếu bứt phá gần đỉnh 52 tuần theo thống kê thường tiếp tục tăng — sức mạnh sinh ra sức mạnh.',
    },
  },
  risk_pct: {
    term: { en: 'Risk % (entry → stop)', vi: '% Rủi ro (vào lệnh → cắt lỗ)' },
    long: {
      en: 'The percentage distance from the entry price to the stop-loss. A smaller risk % means a tighter stop — less capital at stake if the trade fails. Qullamaggie targets under ~8%.',
      vi: 'Khoảng cách phần trăm từ giá vào lệnh đến mức cắt lỗ. % rủi ro nhỏ hơn nghĩa là cắt lỗ chặt hơn — ít vốn bị đe dọa hơn nếu lệnh thất bại. Qullamaggie nhắm dưới ~8%.',
    },
  },
  return_1m: {
    term: { en: '1-Month Return %', vi: '% Lợi nhuận 1 tháng' },
    long: {
      en: 'Price change over the last ~21 trading days. A short-term pulse check — recent strength matters but can be noisy.',
      vi: 'Thay đổi giá trong ~21 phiên giao dịch gần nhất. Kiểm tra xung nhịp ngắn hạn — sức mạnh gần đây quan trọng nhưng có thể nhiễu.',
    },
  },
  return_3m: {
    term: { en: '3-Month Return %', vi: '% Lợi nhuận 3 tháng' },
    long: {
      en: 'Price change over the last ~63 trading days. The most heavily weighted return window in the momentum score — captures a meaningful intermediate trend.',
      vi: 'Thay đổi giá trong ~63 phiên gần nhất. Khung thời gian lợi nhuận có trọng số cao nhất trong điểm động lượng — nắm bắt xu hướng trung hạn có ý nghĩa.',
    },
  },
  return_6m: {
    term: { en: '6-Month Return %', vi: '% Lợi nhuận 6 tháng' },
    long: {
      en: 'Price change over the last ~126 trading days. Alongside 3M return, this is one of the two strongest predictors in the classic momentum literature.',
      vi: 'Thay đổi giá trong ~126 phiên gần nhất. Cùng với lợi nhuận 3 tháng, đây là một trong hai yếu tố dự báo mạnh nhất trong nghiên cứu động lượng kinh điển.',
    },
  },
  atr_pct: {
    term: { en: 'ATR % (of price)', vi: 'ATR % (theo giá)' },
    long: {
      en: 'Average True Range expressed as a percentage of the current price. Measures day-to-day volatility — how much the stock typically moves in a session. High ATR% = wide swings; useful for sizing stops.',
      vi: 'ATR (Khoảng dao động thực trung bình) tính theo phần trăm giá hiện tại. Đo độ biến động từng ngày — cổ phiếu thường di chuyển bao nhiêu mỗi phiên. ATR% cao = biên độ rộng; hữu ích để tính khoảng dừng lỗ.',
    },
  },
  dist_52w: {
    term: { en: '% Off 52-Week High', vi: '% Dưới đỉnh 52 tuần' },
    long: {
      en: 'How far the current price sits below its 52-week high. Qullamaggie setups typically occur within ~25% of the high — the stock is consolidating, not in a deep downtrend.',
      vi: 'Giá hiện tại đang thấp hơn đỉnh 52 tuần bao nhiêu phần trăm. Thiết lập Qullamaggie thường xuất hiện trong ~25% dưới đỉnh — cổ phiếu đang tích lũy, không phải trong xu hướng giảm sâu.',
    },
  },
  pf_ticker: {
    term: { en: 'Ticker', vi: 'Ticker' },
    long: { en: 'The stock or ETF symbol.', vi: 'The stock or ETF symbol.' },
  },
  pf_shares: {
    term: { en: 'Shares', vi: 'Shares' },
    long: { en: 'Total shares held across all open lots for this position.', vi: 'Total shares held across all open lots for this position.' },
  },
  pf_avgcost: {
    term: { en: 'Avg Cost', vi: 'Avg Cost' },
    long: { en: 'Share-weighted average purchase price across all open lots.', vi: 'Share-weighted average purchase price across all open lots.' },
  },
  pf_last: {
    term: { en: 'Last Price', vi: 'Last Price' },
    long: { en: 'Most recent closing price fetched from Yahoo Finance.', vi: 'Most recent closing price fetched from Yahoo Finance.' },
  },
  pf_mktval: {
    term: { en: 'Market Value', vi: 'Market Value' },
    long: { en: 'Current value of the position: shares × last price.', vi: 'Current value of the position: shares × last price.' },
  },
  pf_unrealpnl: {
    term: { en: 'Unrealised PnL', vi: 'Unrealised PnL' },
    long: { en: 'Paper gain/loss vs your average cost. Positive = above cost, negative = below. Percentage is return vs total cost of the position.', vi: 'Paper gain/loss vs your average cost. Positive = above cost, negative = below. Percentage is return vs total cost of the position.' },
  },
  pf_risk: {
    term: { en: 'Risk (€)', vi: 'Risk (€)' },
    long: { en: 'Capital currently at risk: (entry − stop) × shares. Only shown when a stop is set.', vi: 'Capital currently at risk: (entry − stop) × shares. Only shown when a stop is set.' },
  },
  pf_rmult: {
    term: { en: 'R-Multiple', vi: 'R-Multiple' },
    long: { en: 'Current gain expressed as a multiple of your initial risk. 1R = you\'ve made back exactly what you risked. 2R = doubled your risk. Negative means you\'re in drawdown relative to your stop.', vi: 'Current gain expressed as a multiple of your initial risk. 1R = you\'ve made back exactly what you risked. 2R = doubled your risk. Negative means you\'re in drawdown relative to your stop.' },
  },
  pf_stop: {
    term: { en: 'Stop Loss', vi: 'Stop Loss' },
    long: { en: 'The exit price at which you would sell to cap your loss. Sets the risk calculation. Clear it to remove risk from the display.', vi: 'The exit price at which you would sell to cap your loss. Sets the risk calculation. Clear it to remove risk from the display.' },
  },
  pf_target: {
    term: { en: 'Target', vi: 'Target' },
    long: { en: 'Your profit objective. Informational — the app won\'t auto-sell at this level.', vi: 'Your profit objective. Informational — the app won\'t auto-sell at this level.' },
  },
  pf_days: {
    term: { en: 'Days Held', vi: 'Days Held' },
    long: { en: 'Calendar days since the oldest open buy date for this ticker.', vi: 'Calendar days since the oldest open buy date for this ticker.' },
  },
  pf_conc: {
    term: { en: 'Concentration', vi: 'Concentration' },
    long: { en: 'This position\'s market value as a percentage of total portfolio equity. A high concentration means a single stock dominates your risk.', vi: 'This position\'s market value as a percentage of total portfolio equity. A high concentration means a single stock dominates your risk.' },
  },
  pf_actions: {
    term: { en: 'Actions', vi: 'Actions' },
    long: { en: 'Set or edit stop / target, record a partial or full sell, or view the price × shares chart for this position.', vi: 'Set or edit stop / target, record a partial or full sell, or view the price × shares chart for this position.' },
  },
  pf_tx_status: {
    term: { en: 'Status', vi: 'Status' },
    long: { en: 'CLOSED = fully or partially sold. OPEN = still held. A single buy can have both a CLOSED row (shares sold) and an OPEN row (shares remaining).', vi: 'CLOSED = fully or partially sold. OPEN = still held. A single buy can have both a CLOSED row (shares sold) and an OPEN row (shares remaining).' },
  },
  pf_tx_shares: {
    term: { en: 'Shares', vi: 'Shares' },
    long: { en: 'Number of shares in this specific transaction lot.', vi: 'Number of shares in this specific transaction lot.' },
  },
  pf_tx_buyprice: {
    term: { en: 'Buy Price', vi: 'Buy Price' },
    long: { en: 'The price per share paid when opening this lot.', vi: 'The price per share paid when opening this lot.' },
  },
  pf_tx_sellprice: {
    term: { en: 'Sell Price', vi: 'Sell Price' },
    long: { en: 'The price per share received when closing this lot. Blank for open rows.', vi: 'The price per share received when closing this lot. Blank for open rows.' },
  },
  pf_tx_buydate: {
    term: { en: 'Buy Date', vi: 'Buy Date' },
    long: { en: 'The date this lot was purchased.', vi: 'The date this lot was purchased.' },
  },
  pf_tx_selldate: {
    term: { en: 'Sell Date', vi: 'Sell Date' },
    long: { en: 'The date this lot was (fully or partially) sold. Blank for open rows.', vi: 'The date this lot was (fully or partially) sold. Blank for open rows.' },
  },
  pf_tx_held: {
    term: { en: 'Held', vi: 'Held' },
    long: { en: 'Calendar days between buy and sell date (closed), or buy date to today (open).', vi: 'Calendar days between buy and sell date (closed), or buy date to today (open).' },
  },
  pf_tx_pnl: {
    term: { en: 'Realized PnL', vi: 'Realized PnL' },
    long: { en: 'Profit or loss locked in at the time of sale: (sell − buy) × shares.', vi: 'Profit or loss locked in at the time of sale: (sell − buy) × shares.' },
  },
};

export const GLOSSARY_GROUPS: { title: { en: string; vi: string }; keys: string[] }[] = [
  {
    title: { en: 'Qullamaggie Setup', vi: 'Thiết lập Qullamaggie' },
    keys: ['quality', 'setup_type', 'trend_gate', 'prev_advance', 'vcp', 'atr_contraction', 'price_range', 'volume_dryup'],
  },
  {
    title: { en: 'Momentum & Regime', vi: 'Động lượng & bối cảnh' },
    keys: ['momentum_score', 'rs', 'regime', 'volume_change'],
  },
  {
    title: { en: 'Pivots & Trade Levels', vi: 'Pivot & các mức giao dịch' },
    keys: ['pivot', 'distance', 'entry', 'stop', 'target', 'rr', 'r_multiple'],
  },
  {
    title: { en: 'Fundamentals', vi: 'Chỉ số cơ bản' },
    keys: ['pe_ratio', 'eps', 'market_cap', 'profit_margin', 'week52'],
  },
];

export function gloss(key: string): { term: string; long: string } | null {
  const e = GLOSSARY[key];
  if (!e) return null;
  const l = getLang();
  return { term: e.term[l] ?? e.term.en, long: e.long[l] ?? e.long.en };
}
