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
      vi: 'Điểm chất lượng Qullamaggie gộp bảy yếu tố có trọng số: xu hướng (20), nhịp tăng trước (10), chất lượng VCP (25), volume cạn kiệt (15), sức mạnh tương đối (15), thanh khoản (10) và độ gần điểm breakout (5). Điểm càng cao, setup càng sạch và xác suất thắng ngay lúc này càng tốt. Chỉ để xếp hạng — không phải bảo đảm.',
    },
  },
  setup_type: {
    term: { en: 'Setup Type', vi: 'Loại setup' },
    long: {
      en: 'VCP — a volatility contraction pattern after a strong advance. EPISODIC PIVOT — a news/earnings gap with heavy volume closing near the high. VCP + EP — a base that is also gapping on a catalyst. NONE — no actionable Qullamaggie setup right now.',
      vi: 'VCP — mẫu hình co thắt biến động sau một nhịp tăng mạnh. EPISODIC PIVOT — gap vì tin tức/KQKD, volume lớn, đóng cửa sát đỉnh phiên. VCP + EP — base đang có sẵn lại gap nhờ chất xúc tác. NONE — hiện chưa có setup Qullamaggie nào để vào.',
    },
  },
  trend_gate: {
    term: { en: 'Trend Filter', vi: 'Bộ lọc xu hướng' },
    long: {
      en: 'A pass/fail gate: price above EMA50, EMA50 above EMA150, EMA150 above EMA200, EMA200 rising, within range of the 52-week high, and sufficiently liquid. Qullamaggie only trades stocks in a confirmed uptrend.',
      vi: 'Cổng đạt/trượt: giá trên EMA50, EMA50 trên EMA150, EMA150 trên EMA200, EMA200 đang dốc lên, giá đủ gần đỉnh 52 tuần và đủ thanh khoản. Qullamaggie chỉ trade cổ phiếu đã xác nhận xu hướng tăng.',
    },
  },
  prev_advance: {
    term: { en: 'Previous Advance %', vi: '% Nhịp tăng trước' },
    long: {
      en: 'The size of the prior up-leg leading into the base. Qullamaggie setups follow a strong advance (≥ ~30%) — the base is a rest after a sprint, not a random range.',
      vi: 'Độ lớn của nhịp tăng ngay trước base. Setup Qullamaggie luôn đi sau một nhịp tăng mạnh (≥ ~30%) — base là quãng nghỉ sau cú chạy nước rút, không phải một vùng đi ngang ngẫu nhiên.',
    },
  },
  momentum_score: {
    term: { en: 'Momentum Score (0–100)', vi: 'Điểm động lượng (0–100)' },
    long: {
      en: 'Blends 1-month (15), 3-month (25) and 6-month (25) returns, relative strength vs SPY (25) and liquidity (10). Stocks are classed by percentile: Weak → Building → Strong → Explosive. Answers "what is running right now?".',
      vi: 'Gộp lợi nhuận 1 tháng (15), 3 tháng (25), 6 tháng (25), sức mạnh tương đối so với SPY (25) và thanh khoản (10). Mã được xếp theo phân vị: Yếu → Đang hình thành → Mạnh → Bùng nổ. Trả lời câu hỏi "mã nào đang chạy?".',
    },
  },
  rs: {
    term: { en: 'Relative Strength (RS)', vi: 'Sức mạnh tương đối (RS)' },
    long: {
      en: 'Performance versus a benchmark (SPY) over several lookbacks. Positive RS means the stock is outperforming the market — leadership that often persists.',
      vi: 'Hiệu suất so với chỉ số tham chiếu (SPY) qua nhiều khung thời gian. RS dương nghĩa là mã đang khỏe hơn thị trường — và vai trò dẫn dắt thường kéo dài.',
    },
  },
  regime: {
    term: { en: 'Market Regime', vi: 'Bối cảnh thị trường' },
    long: {
      en: 'The overall market state from SPY/QQQ: BULL (above stacked, rising EMAs — risk-on), TRANSITION (mixed), or BEAR (below the 200-EMA — risk-off). It frames when to press and when to stand aside.',
      vi: 'Trạng thái chung của thị trường, đọc từ SPY/QQQ: BULL (giá trên các EMA xếp tầng đang dốc lên — risk-on), TRANSITION (lẫn lộn) hoặc BEAR (dưới EMA200 — risk-off). Giúp biết lúc nào nên đánh mạnh, lúc nào nên đứng ngoài.',
    },
  },
  vcp: {
    term: { en: 'VCP — Volatility Contraction Pattern', vi: 'VCP — Mẫu hình co thắt biến động' },
    long: {
      en: 'Coined by Mark Minervini. As a healthy base forms, each successive pullback is shallower and trades on lighter volume — like a spring coiling tighter. 2–3+ tight contractions indicate supply is drying up before a potential breakout.',
      vi: 'Khái niệm do Mark Minervini đặt ra. Khi một base khỏe hình thành, mỗi nhịp pullback sau nông hơn nhịp trước và volume nhỏ dần — như lò xo bị nén chặt dần. 2–3+ lần co thắt chặt cho thấy nguồn cung đang cạn trước một cú breakout tiềm năng.',
    },
  },
  atr_contraction: {
    term: { en: 'ATR Contraction %', vi: '% Co thắt ATR' },
    long: {
      en: 'ATR (Average True Range) measures average daily price movement. We compare ATR at the start of the base vs the end. A high contraction % means an increasingly narrow range — equilibrium between buyers and sellers that often precedes a sharp move.',
      vi: 'ATR (Average True Range) đo biên độ dao động trung bình mỗi phiên. App so ATR lúc đầu base với lúc cuối base. % co thắt cao nghĩa là biên độ ngày càng hẹp — bên mua và bên bán đang cân bằng, trạng thái thường xuất hiện ngay trước một cú chạy mạnh.',
    },
  },
  price_range: {
    term: { en: 'Price Range %', vi: '% Biên độ giá' },
    long: {
      en: 'The percentage distance between the highest high and lowest low of the consolidation window. A tight range (under ~15%) signals a well-controlled base; a wide range means the stock is still swinging.',
      vi: 'Khoảng cách % giữa đỉnh cao nhất và đáy thấp nhất trong vùng tích lũy. Biên độ chặt (dưới ~15%) cho thấy base gọn gàng, có kiểm soát; biên độ rộng nghĩa là mã vẫn còn lắc mạnh.',
    },
  },
  volume_dryup: {
    term: { en: 'Volume Dry-up %', vi: '% Volume cạn kiệt' },
    long: {
      en: 'Compares recent average volume to the volume earlier in the base. A positive dry-up means trading has quieted — sellers are exhausted. Low volume in a tight base, followed by a volume surge on the breakout, is the ideal sequence.',
      vi: 'So khối lượng trung bình gần đây với khối lượng đầu base. Số dương nghĩa là giao dịch đã lắng xuống — bên bán đã kiệt sức. Trình tự lý tưởng: volume thấp trong một base chặt, rồi volume bùng lên khi breakout.',
    },
  },
  days_in_base: {
    term: { en: 'Days in Base', vi: 'Số ngày trong base' },
    long: {
      en: 'The length of the consolidation window the engine evaluated (default ~60 trading days). Longer, well-formed bases can lead to more powerful breakouts.',
      vi: 'Độ dài vùng tích lũy mà engine xét (mặc định ~60 phiên). Base càng dài và đẹp thì cú breakout có thể càng mạnh.',
    },
  },
  pivot: {
    term: { en: 'Pivot / Pivot High', vi: 'Pivot / Đỉnh pivot' },
    long: {
      en: 'The most recent significant high acting as resistance — the line in the sand. Exactly: the highest HIGH within the last 90 sessions (the base window), rounded to 2 decimals. Not the 52-week high: on a stock that peaked a year ago the pivot sits far below it. The 52-week high only appears as a filter (setups must be within ~25% of it), never in the levels. A decisive move above the pivot (ideally on big volume) is the classic breakout trigger.',
      vi: 'Đỉnh quan trọng gần nhất, đóng vai trò kháng cự — lằn ranh phải vượt. Cụ thể: GIÁ CAO NHẤT (high) trong 90 phiên gần nhất (cửa sổ base), làm tròn 2 chữ số thập phân. Không phải đỉnh 52 tuần: với mã đã lập đỉnh từ một năm trước, pivot nằm thấp hơn đỉnh đó rất nhiều. Đỉnh 52 tuần chỉ dùng để LỌC (setup phải nằm trong khoảng ~25% dưới đỉnh), không bao giờ dùng để tính các mức giá. Vượt pivot dứt khoát (lý tưởng là kèm volume lớn) là tín hiệu breakout kinh điển.',
    },
  },
  distance: {
    term: { en: 'Distance to Pivot %', vi: '% Khoảng cách tới pivot' },
    long: {
      en: 'How many percent the current price sits below the pivot. 0% means price is at the breakout line. Setups within ~3% are "imminent" — a small move would trigger the breakout.',
      vi: 'Giá hiện tại đang nằm dưới pivot bao nhiêu %. 0% nghĩa là giá đang ở ngay ngưỡng breakout. Setup cách pivot trong ~3% được xem là "sắp nổ" — chỉ cần nhích nhẹ là kích hoạt.',
    },
  },
  entry: {
    term: { en: 'Entry Price', vi: 'Giá vào lệnh' },
    long: {
      en: 'The breakout trigger: pivot × 1.001 — one tenth of a percent above the pivot, so the order only fills once resistance is actually cleared. It is therefore ALWAYS just above the recent high by construction; it is a trigger price, not a valuation. Buy strength as the stock clears resistance, ideally confirmed by a surge in volume.',
      vi: 'Giá kích hoạt breakout: pivot × 1,001 — cao hơn pivot 0,1%, để lệnh chỉ khớp khi giá thật sự vượt kháng cự. Vì cách tính như vậy nên entry LUÔN nằm ngay trên đỉnh gần nhất; đây là giá kích hoạt, không phải định giá. Mua theo sức mạnh khi mã vượt kháng cự, lý tưởng là có volume bùng lên xác nhận.',
    },
  },
  stop: {
    term: { en: 'Stop-Loss', vi: 'Cắt lỗ' },
    long: {
      en: 'entry − 1.5 × ATR(14): a protective exit placed a volatility unit below the trigger, so the stop respects the stock\'s normal noise instead of a round number. This is the only level that reacts to the individual stock — a quiet stock gets a tight stop, a wild one a wide stop. If price falls here, the setup has failed and you cut the loss.',
      vi: 'entry − 1,5 × ATR(14): mức thoát bảo vệ đặt dưới giá kích hoạt một đơn vị biến động, để stop chừa chỗ cho nhịp lắc bình thường của mã thay vì đặt theo số tròn. Đây là mức DUY NHẤT thay đổi theo từng mã — mã êm thì stop gần, mã lắc mạnh thì stop xa. Giá chạm tới đây nghĩa là setup đã hỏng và bạn cắt lỗ.',
    },
  },
  target: {
    term: { en: 'Target Price', vi: 'Giá mục tiêu' },
    long: {
      en: 'entry + 3 × (entry − stop), i.e. entry + 4.5 × ATR(14). A planning level derived from your own risk, NOT a forecast read off the chart — no resistance level, measured move or analyst figure enters it. Change the reward multiple and the target moves with it.',
      vi: 'entry + 3 × (entry − stop), tức entry + 4,5 × ATR(14). Đây là mức để LÊN KẾ HOẠCH, suy ra từ chính mức rủi ro bạn chịu, KHÔNG phải dự báo đọc từ chart — không có kháng cự, "measured move" hay giá mục tiêu của chuyên gia nào nằm trong phép tính. Đổi hệ số lợi nhuận thì target đổi theo.',
    },
  },
  rr: {
    term: { en: 'Risk : Reward (R:R)', vi: 'Rủi ro : Lợi nhuận (R:R)' },
    long: {
      en: 'The ratio of potential profit (target − entry) to potential loss (entry − stop). A 3:1 R:R means a winning trade pays three times what a losing trade costs — favorable math even if you are right less than half the time. Note that on these cards R:R always reads 3.0 because the target is DEFINED as 3 × risk: it says nothing about the individual stock. What does vary per stock is Risk % (the ATR-based stop distance).',
      vi: 'Tỷ lệ giữa lãi tiềm năng (target − entry) và lỗ tiềm năng (entry − stop). R:R 3:1 nghĩa là một lệnh thắng bù được ba lệnh thua — vẫn có lời dù bạn đúng chưa tới một nửa số lần. Lưu ý: trên các thẻ này R:R luôn là 3,0 vì target được ĐỊNH NGHĨA bằng 3 × rủi ro — con số này không nói gì về riêng mã đó. Thứ thay đổi theo từng mã là Risk % (khoảng cách tới stop tính theo ATR).',
    },
  },
  r_multiple: {
    term: { en: 'R-multiple (paper trading)', vi: 'R-multiple (paper trading)' },
    long: {
      en: 'Trade PnL ÷ initial per-share risk, where risk = entry − stop. +2R means you made twice what you risked. The portfolio expectancy is the average R across closed trades.',
      vi: 'P&L của lệnh ÷ rủi ro ban đầu trên mỗi cổ phiếu, với rủi ro = entry − stop. +2R nghĩa là bạn lãi gấp đôi số tiền đã đặt vào rủi ro. Kỳ vọng (expectancy) của Danh mục là R trung bình của các lệnh đã đóng.',
    },
  },
  volume_change: {
    term: { en: 'Sector Volume Change %', vi: '% Thay đổi khối lượng ngành' },
    long: {
      en: "The % change between a sector's average daily volume over the last 3 months vs the last 6 months. Rising volume often signals fresh institutional interest rotating into a sector.",
      vi: 'Mức thay đổi % giữa khối lượng trung bình mỗi phiên của ngành trong 3 tháng gần nhất so với 6 tháng gần nhất. Volume tăng thường là dấu hiệu dòng tiền tổ chức mới đang xoay vòng vào ngành.',
    },
  },
  pe_ratio: {
    term: { en: 'P/E Ratio (TTM)', vi: 'Tỷ số P/E (TTM)' },
    long: {
      en: 'Trailing twelve-month P/E: current share price divided by the sum of the last four reported quarterly EPS. A rough gauge of valuation — refreshed live as the price moves. High P/E = growth expectations priced in; low P/E = cheaper or out-of-favor. Note: the Fundamentals Trend chart shows P/E at each annual fiscal year-end, which will differ.',
      vi: 'P/E 12 tháng gần nhất (TTM): giá hiện tại chia cho tổng EPS của 4 quý đã báo cáo gần nhất. Thước đo định giá sơ bộ — tự cập nhật khi giá chạy. P/E cao = thị trường đã kỳ vọng tăng trưởng; P/E thấp = rẻ hơn hoặc đang bị ngó lơ. Lưu ý: chart Xu hướng cơ bản hiện P/E tại cuối mỗi năm tài chính nên sẽ khác con số này.',
    },
  },
  eps: {
    term: { en: 'EPS — Trailing Twelve Months', vi: 'EPS — 12 tháng gần nhất' },
    long: {
      en: "Earnings Per Share for the trailing twelve months (TTM): sum of diluted EPS from the last four reported quarters. This is the most current profitability read. Growing EPS is one of the strongest drivers of sustained stock advances. Note: each bar in the Fundamentals Trend chart shows EPS for a single fiscal year or quarter — those figures represent a fixed period, not a rolling sum, so they will typically differ from this TTM number.",
      vi: 'Lợi nhuận trên mỗi cổ phiếu (EPS) 12 tháng gần nhất (TTM): tổng EPS pha loãng của 4 quý đã báo cáo gần nhất — số liệu lợi nhuận mới nhất có được. EPS tăng trưởng là một trong những động lực mạnh nhất giúp giá tăng bền. Lưu ý: mỗi cột trên chart Xu hướng cơ bản là EPS của đúng một năm tài chính hoặc một quý, không phải tổng cuốn chiếu, nên thường khác con số TTM này.',
    },
  },
  market_cap: {
    term: { en: 'Market Cap (Live)', vi: 'Vốn hóa (realtime)' },
    long: {
      en: 'The total market value of the company: current share price times shares outstanding — updated in real time as the price changes. Determines small- (<$2B), mid- ($2–10B), or large-cap (>$10B).',
      vi: 'Tổng giá trị thị trường của công ty: giá hiện tại × số cổ phiếu lưu hành — cập nhật realtime theo giá. Dùng để chia vốn hóa nhỏ (<2 tỷ $), vừa (2–10 tỷ $) hay lớn (>10 tỷ $).',
    },
  },
  profit_margin: {
    term: { en: 'Profit Margin (TTM)', vi: 'Biên lợi nhuận (TTM)' },
    long: {
      en: 'Net profit margin for the trailing twelve months: net income ÷ revenue over the last four reported quarters. How many cents of each sales dollar end up as profit — on a rolling basis. A rising margin trend is a positive quality signal.',
      vi: 'Biên lợi nhuận ròng 12 tháng gần nhất: lợi nhuận ròng ÷ doanh thu của 4 quý đã báo cáo gần nhất. Cho biết mỗi đồng doanh thu giữ lại được bao nhiêu xu lợi nhuận — tính cuốn chiếu. Biên lợi nhuận đi lên là tín hiệu tốt về chất lượng doanh nghiệp.',
    },
  },
  roe: {
    term: { en: 'ROE — Return on Equity (TTM)', vi: 'ROE — Lợi nhuận trên vốn chủ (TTM)' },
    long: {
      en: 'Return on Equity for the trailing twelve months: net income ÷ shareholder equity. How efficiently a company turns capital into profit on a rolling basis. Consistently high ROE (15%+) is a hallmark of quality businesses.',
      vi: 'ROE 12 tháng gần nhất: lợi nhuận ròng ÷ vốn chủ sở hữu. Cho biết công ty dùng vốn để sinh lời hiệu quả tới đâu, tính cuốn chiếu. ROE cao đều đặn (15%+) là dấu hiệu của doanh nghiệp chất lượng.',
    },
  },
  revenue_growth: {
    term: { en: 'Revenue Growth (YoY)', vi: 'Tăng trưởng doanh thu (YoY)' },
    long: {
      en: 'Year-over-year revenue growth for the most recent reported quarter vs the same quarter one year ago. A positive number means the latest quarter was larger. Strong, accelerating quarterly growth often precedes big winners. Note: the Fundamentals Trend chart shows annual revenue for each fiscal year.',
      vi: 'Tăng trưởng doanh thu so với cùng kỳ (YoY): quý vừa báo cáo so với cùng quý năm trước. Số dương nghĩa là quý mới nhất cao hơn. Doanh thu quý tăng mạnh và ngày càng nhanh thường xuất hiện trước những siêu cổ phiếu. Lưu ý: chart Xu hướng cơ bản hiện doanh thu theo từng năm tài chính.',
    },
  },
  beta: {
    term: { en: 'Beta (5-Year)', vi: 'Beta (5 năm)' },
    long: {
      en: '5-year monthly beta versus the S&P 500: how much a stock moves relative to the market. Beta 1.0 tracks the market; 1.5 swings ~50% more; 0.7 is calmer. High-beta momentum names can amplify both gains and losses.',
      vi: 'Beta 5 năm (dữ liệu tháng) so với S&P 500: mã biến động mạnh hay nhẹ hơn thị trường bao nhiêu. Beta 1,0 đi cùng thị trường; 1,5 lắc mạnh hơn ~50%; 0,7 thì êm hơn. Mã momentum beta cao có thể khuếch đại cả lãi lẫn lỗ.',
    },
  },
  dividend_yield: {
    term: { en: 'Dividend Yield', vi: 'Tỷ suất cổ tức' },
    long: {
      en: 'The annual dividend expressed as a percentage of the current share price.',
      vi: 'Cổ tức hằng năm tính theo % giá cổ phiếu hiện tại.',
    },
  },
  week52: {
    term: { en: '52-Week High / Low', vi: 'Đỉnh / Đáy 52 tuần' },
    long: {
      en: 'The price extremes over the trailing 12 months. Stocks breaking out near 52-week highs statistically tend to continue higher — strength begets strength.',
      vi: 'Giá cao nhất và thấp nhất trong 12 tháng gần nhất. Theo thống kê, mã breakout gần đỉnh 52 tuần thường tiếp tục đi lên — mạnh thì càng mạnh.',
    },
  },
  risk_pct: {
    term: { en: 'Risk % (entry → stop)', vi: '% Rủi ro (entry → stop)' },
    long: {
      en: 'The percentage distance from the entry price to the stop-loss. A smaller risk % means a tighter stop — less capital at stake if the trade fails. Qullamaggie targets under ~8%.',
      vi: 'Khoảng cách % từ entry xuống stop. % rủi ro càng nhỏ thì stop càng chặt — lệnh hỏng thì mất ít vốn hơn. Qullamaggie thường giữ dưới ~8%.',
    },
  },
  return_1m: {
    term: { en: '1-Month Return %', vi: '% Lợi nhuận 1 tháng' },
    long: {
      en: 'Price change over the last ~21 trading days. A short-term pulse check — recent strength matters but can be noisy.',
      vi: 'Biến động giá trong ~21 phiên gần nhất. Bắt mạch ngắn hạn — sức mạnh gần đây quan trọng nhưng dễ nhiễu.',
    },
  },
  return_3m: {
    term: { en: '3-Month Return %', vi: '% Lợi nhuận 3 tháng' },
    long: {
      en: 'Price change over the last ~63 trading days. The most heavily weighted return window in the momentum score — captures a meaningful intermediate trend.',
      vi: 'Biến động giá trong ~63 phiên gần nhất. Khung lợi nhuận có trọng số cao nhất trong điểm động lượng — phản ánh rõ xu hướng trung hạn.',
    },
  },
  return_6m: {
    term: { en: '6-Month Return %', vi: '% Lợi nhuận 6 tháng' },
    long: {
      en: 'Price change over the last ~126 trading days. Alongside 3M return, this is one of the two strongest predictors in the classic momentum literature.',
      vi: 'Biến động giá trong ~126 phiên gần nhất. Cùng với lợi nhuận 3 tháng, đây là một trong hai yếu tố dự báo mạnh nhất theo các nghiên cứu momentum kinh điển.',
    },
  },
  atr_pct: {
    term: { en: 'ATR % (of price)', vi: 'ATR % (theo giá)' },
    long: {
      en: 'Average True Range expressed as a percentage of the current price. Measures day-to-day volatility — how much the stock typically moves in a session. High ATR% = wide swings; useful for sizing stops.',
      vi: 'ATR (Average True Range) tính theo % giá hiện tại. Đo độ biến động hằng ngày — mỗi phiên mã thường chạy bao nhiêu. ATR% cao = biên độ rộng; dùng để canh khoảng đặt stop.',
    },
  },
  dist_52w: {
    term: { en: '% Off 52-Week High', vi: '% Dưới đỉnh 52 tuần' },
    long: {
      en: 'How far the current price sits below its 52-week high. Qullamaggie setups typically occur within ~25% of the high — the stock is consolidating, not in a deep downtrend.',
      vi: 'Giá hiện tại đang thấp hơn đỉnh 52 tuần bao nhiêu %. Setup Qullamaggie thường nằm trong khoảng ~25% dưới đỉnh — mã đang tích lũy chứ không phải đang trong xu hướng giảm sâu.',
    },
  },
  pf_ticker: {
    term: { en: 'Ticker', vi: 'Mã' },
    long: { en: 'The stock or ETF symbol.', vi: 'Mã cổ phiếu hoặc ETF.' },
  },
  pf_shares: {
    term: { en: 'Shares', vi: 'Số CP' },
    long: { en: 'Total shares held across all open lots for this position.', vi: 'Tổng số cổ phiếu đang nắm của vị thế này, cộng tất cả các lot còn mở.' },
  },
  pf_avgcost: {
    term: { en: 'Avg Cost', vi: 'Giá vốn TB' },
    long: { en: 'Share-weighted average purchase price across all open lots.', vi: 'Giá mua bình quân (gia quyền theo số cổ phiếu) của các lot còn mở.' },
  },
  pf_last: {
    term: { en: 'Last Price', vi: 'Giá cuối' },
    long: { en: 'Most recent closing price fetched from Yahoo Finance.', vi: 'Giá đóng cửa gần nhất lấy từ Yahoo Finance.' },
  },
  pf_mktval: {
    term: { en: 'Market Value', vi: 'Giá trị thị trường' },
    long: { en: 'Current value of the position: shares × last price.', vi: 'Giá trị hiện tại của vị thế: số cổ phiếu × giá cuối.' },
  },
  pf_unrealpnl: {
    term: { en: 'Unrealised PnL', vi: 'Lãi/lỗ tạm tính' },
    long: { en: 'Paper gain/loss vs your average cost. Positive = above cost, negative = below. Percentage is return vs total cost of the position.', vi: 'Lãi/lỗ trên giấy so với giá vốn bình quân. Dương = đang trên giá vốn, âm = dưới giá vốn. Phần trăm là lợi nhuận so với tổng vốn bỏ vào vị thế.' },
  },
  pf_risk: {
    term: { en: 'Risk (€)', vi: 'Rủi ro (€)' },
    long: { en: 'Capital currently at risk: (entry − stop) × shares. Only shown when a stop is set.', vi: 'Số vốn đang chịu rủi ro: (entry − stop) × số cổ phiếu. Chỉ hiện khi đã đặt stop.' },
  },
  pf_rmult: {
    term: { en: 'R-Multiple', vi: 'R-multiple' },
    long: { en: 'Current gain expressed as a multiple of your initial risk. 1R = you\'ve made back exactly what you risked. 2R = doubled your risk. Negative means you\'re in drawdown relative to your stop.', vi: 'Lãi hiện tại tính theo bội số rủi ro ban đầu. 1R = lãi đúng bằng số tiền đã chấp nhận rủi ro. 2R = gấp đôi số đó. Âm nghĩa là vị thế đang lỗ, tính theo khoảng cách tới stop.' },
  },
  pf_stop: {
    term: { en: 'Stop Loss', vi: 'Stop' },
    long: { en: 'The exit price at which you would sell to cap your loss. Sets the risk calculation. Clear it to remove risk from the display.', vi: 'Giá bạn sẽ bán ra để chặn lỗ. Phần tính rủi ro dựa vào mức này. Xóa đi thì cột rủi ro không hiện nữa.' },
  },
  pf_target: {
    term: { en: 'Target', vi: 'Target' },
    long: { en: 'Your profit objective. Informational — the app won\'t auto-sell at this level.', vi: 'Mức chốt lời bạn nhắm tới. Chỉ để tham khảo — app không tự bán ở mức này.' },
  },
  pf_days: {
    term: { en: 'Days Held', vi: 'Số ngày giữ' },
    long: { en: 'Calendar days since the oldest open buy date for this ticker.', vi: 'Số ngày lịch tính từ ngày mua sớm nhất còn mở của mã này.' },
  },
  pf_conc: {
    term: { en: 'Concentration', vi: 'Tỷ trọng' },
    long: { en: 'This position\'s market value as a percentage of total portfolio equity. A high concentration means a single stock dominates your risk.', vi: 'Giá trị thị trường của vị thế tính theo % tổng tài sản Danh mục. Tỷ trọng cao nghĩa là rủi ro dồn vào một mã duy nhất.' },
  },
  pf_actions: {
    term: { en: 'Actions', vi: 'Thao tác' },
    long: { en: 'Set or edit stop / target, record a partial or full sell, or view the price × shares chart for this position.', vi: 'Đặt hoặc sửa stop / target, ghi lệnh bán một phần hay toàn bộ, hoặc xem chart giá × số cổ phiếu của vị thế này.' },
  },
  pf_tx_status: {
    term: { en: 'Status', vi: 'Trạng thái' },
    long: { en: 'CLOSED = fully or partially sold. OPEN = still held. A single buy can have both a CLOSED row (shares sold) and an OPEN row (shares remaining).', vi: 'CLOSED = đã bán hết hoặc một phần. OPEN = vẫn đang giữ. Một lệnh mua có thể vừa có dòng CLOSED (phần đã bán) vừa có dòng OPEN (phần còn lại).' },
  },
  pf_tx_shares: {
    term: { en: 'Shares', vi: 'Số CP' },
    long: { en: 'Number of shares in this specific transaction lot.', vi: 'Số cổ phiếu trong đúng lot giao dịch này.' },
  },
  pf_tx_buyprice: {
    term: { en: 'Buy Price', vi: 'Giá mua' },
    long: { en: 'The price per share paid when opening this lot.', vi: 'Giá mỗi cổ phiếu đã trả khi mở lot này.' },
  },
  pf_tx_sellprice: {
    term: { en: 'Sell Price', vi: 'Giá bán' },
    long: { en: 'The price per share received when closing this lot. Blank for open rows.', vi: 'Giá mỗi cổ phiếu nhận được khi đóng lot này. Dòng còn mở thì để trống.' },
  },
  pf_tx_buydate: {
    term: { en: 'Buy Date', vi: 'Ngày mua' },
    long: { en: 'The date this lot was purchased.', vi: 'Ngày mua lot này.' },
  },
  pf_tx_selldate: {
    term: { en: 'Sell Date', vi: 'Ngày bán' },
    long: { en: 'The date this lot was (fully or partially) sold. Blank for open rows.', vi: 'Ngày bán lot này (hết hoặc một phần). Dòng còn mở thì để trống.' },
  },
  pf_tx_held: {
    term: { en: 'Held', vi: 'Đã giữ' },
    long: { en: 'Calendar days between buy and sell date (closed), or buy date to today (open).', vi: 'Số ngày lịch từ ngày mua tới ngày bán (đã đóng), hoặc từ ngày mua tới hôm nay (còn mở).' },
  },
  pf_tx_pnl: {
    term: { en: 'Realized PnL', vi: 'Lãi/lỗ đã chốt' },
    long: { en: 'Profit or loss locked in at the time of sale: (sell − buy) × shares.', vi: 'Lãi hoặc lỗ đã chốt lúc bán: (giá bán − giá mua) × số cổ phiếu.' },
  },
  pf_tx_pnlpct: {
    term: { en: 'PnL %', vi: 'P&L %' },
    long: {
      en: "Return on the position's own cost: realized PnL ÷ (buy price × shares).",
      vi: 'Lợi nhuận trên chính vốn của vị thế: lãi/lỗ đã chốt ÷ (giá mua × số cổ phiếu).',
    },
  },
  pf_tx_weight: {
    term: { en: 'Weight', vi: 'Tỷ trọng' },
    long: {
      en: 'Position size vs the capital the account held when it was opened: cost ÷ (initial capital + deposits up to that date + realized PnL booked before it).',
      vi: 'Quy mô vị thế so với vốn của tài khoản lúc mở lệnh: giá vốn ÷ (vốn ban đầu + tiền nạp tới ngày đó + lãi/lỗ đã chốt trước đó).',
    },
  },
  pf_tx_pnlpctcap: {
    term: { en: 'PnL % of capital', vi: 'P&L % trên vốn' },
    long: {
      en: 'Impact on the whole account: realized PnL ÷ capital held when the position was opened. Equals PnL % × Weight.',
      vi: 'Tác động lên cả tài khoản: lãi/lỗ đã chốt ÷ vốn lúc mở vị thế. Bằng P&L % × Tỷ trọng.',
    },
  },
};

export const GLOSSARY_GROUPS: { title: { en: string; vi: string }; keys: string[] }[] = [
  {
    title: { en: 'Qullamaggie Setup', vi: 'Setup Qullamaggie' },
    keys: ['quality', 'setup_type', 'trend_gate', 'prev_advance', 'vcp', 'atr_contraction', 'price_range', 'volume_dryup'],
  },
  {
    title: { en: 'Momentum & Regime', vi: 'Động lượng & bối cảnh' },
    keys: ['momentum_score', 'rs', 'regime', 'volume_change'],
  },
  {
    title: { en: 'Pivots & Trade Levels', vi: 'Pivot & các mức giá giao dịch' },
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
