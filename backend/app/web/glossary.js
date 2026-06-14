// Single source of truth for all terminology — bilingual (English / Vietnamese).
// Used by both the Learn page and the hover tooltips.
// Each field (term/short/long) holds { en, vi }; use gloss(key) to resolve to the
// active language.
window.GLOSSARY = {
  score: {
    term: { en: "Conviction Score (0–100)", vi: "Điểm tin cậy (0–100)" },
    short: {
      en: "How strong the setup is. 70+ = high conviction, 40–69 = developing, below 40 = weak.",
      vi: "Mức độ mạnh của thiết lập. 70+ = tin cậy cao, 40–69 = đang hình thành, dưới 40 = yếu.",
    },
    long: {
      en:
        "A 0–100 score blending six factors: Weinstein stage, ATR contraction, price-range tightness, " +
        "volume dry-up, number of VCP contractions, and how close price is to the pivot. " +
        "Higher means a tighter, more textbook consolidation near a breakout point. " +
        "It is a relative ranking aid — not a guarantee.",
      vi:
        "Điểm 0–100 kết hợp sáu yếu tố: giai đoạn Weinstein, sự co thắt ATR, độ chặt của biên độ giá, " +
        "sự cạn kiệt khối lượng, số lần co thắt VCP, và mức độ giá gần điểm pivot. " +
        "Điểm càng cao nghĩa là nền tích lũy càng chặt và sát điểm bứt phá. " +
        "Đây là công cụ xếp hạng tương đối — không phải sự bảo đảm.",
    },
  },
  signal: {
    term: { en: "Signal", vi: "Tín hiệu" },
    short: {
      en: "BREAKOUT IMMINENT = score ≥ 70 and within 3% of pivot. CONSOLIDATING = score ≥ 40. NO SIGNAL otherwise.",
      vi: "BỨT PHÁ SẮP XẢY RA = điểm ≥ 70 và trong vòng 3% so với pivot. TÍCH LŨY = điểm ≥ 40. Còn lại là KHÔNG TÍN HIỆU.",
    },
    long: {
      en:
        "A plain-language label for the setup. BREAKOUT IMMINENT: the stock is coiled tight and sitting right " +
        "under a breakout level (score ≥ 70, within 3% of pivot). CONSOLIDATING: a valid base is forming " +
        "(score ≥ 40) but it is not at the trigger yet. NO SIGNAL: no tradeable setup right now.",
      vi:
        "Nhãn mô tả dễ hiểu cho thiết lập. BỨT PHÁ SẮP XẢY RA: cổ phiếu đã nén chặt và nằm ngay dưới mức bứt phá " +
        "(điểm ≥ 70, trong vòng 3% so với pivot). TÍCH LŨY: một nền giá hợp lệ đang hình thành (điểm ≥ 40) " +
        "nhưng chưa tới điểm kích hoạt. KHÔNG TÍN HIỆU: hiện chưa có thiết lập giao dịch.",
    },
  },
  stage: {
    term: { en: "Weinstein Stage (1–4)", vi: "Giai đoạn Weinstein (1–4)" },
    short: {
      en: "Where a stock is in its cycle. Stage 2 (Advancing) is the buy zone.",
      vi: "Vị trí của cổ phiếu trong chu kỳ. Giai đoạn 2 (Tăng giá) là vùng mua.",
    },
    long: {
      en:
        "Stan Weinstein's Stage Analysis classifies a trend using moving averages. " +
        "Stage 1 — Basing: sideways after a decline, building a floor. " +
        "Stage 2 — Advancing: uptrend, price above rising MAs — the classic buy zone. " +
        "Stage 3 — Topping: momentum fading, MAs flattening. " +
        "Stage 4 — Declining: downtrend, price below falling MAs — avoid.",
      vi:
        "Phân tích Giai đoạn của Stan Weinstein phân loại xu hướng bằng các đường trung bình động. " +
        "Giai đoạn 1 — Tạo nền: đi ngang sau khi giảm, xây nền móng. " +
        "Giai đoạn 2 — Tăng giá: xu hướng tăng, giá trên các MA đang dốc lên — vùng mua kinh điển. " +
        "Giai đoạn 3 — Tạo đỉnh: đà tăng yếu dần, các MA đi ngang. " +
        "Giai đoạn 4 — Giảm giá: xu hướng giảm, giá dưới các MA dốc xuống — nên tránh.",
    },
  },
  vcp: {
    term: { en: "VCP — Volatility Contraction Pattern", vi: "VCP — Mẫu hình co thắt biến động" },
    short: {
      en: "Each pullback in a base gets smaller and quieter. 3+ contractions is a textbook setup.",
      vi: "Mỗi nhịp điều chỉnh trong nền nhỏ dần và yên ắng hơn. 3+ lần co thắt là thiết lập chuẩn mực.",
    },
    long: {
      en:
        "Coined by Mark Minervini. As a healthy base forms, each successive pullback is shallower and " +
        "trades on lighter volume — like a spring coiling tighter. We count the number of these distinct " +
        "contractions; 2–3+ tight contractions indicate supply is drying up before a potential breakout.",
      vi:
        "Khái niệm của Mark Minervini. Khi một nền lành mạnh hình thành, mỗi nhịp điều chỉnh kế tiếp nông hơn và " +
        "có khối lượng nhẹ hơn — như chiếc lò xo nén chặt dần. Ta đếm số lần co thắt riêng biệt; " +
        "2–3+ lần co thắt chặt cho thấy lực cung đang cạn trước một cú bứt phá tiềm năng.",
    },
  },
  atr_contraction: {
    term: { en: "ATR Contraction %", vi: "% Co thắt ATR" },
    short: {
      en: "How much daily volatility has shrunk inside the base. Higher = tighter = better.",
      vi: "Mức độ thu hẹp của biến động hằng ngày trong nền. Càng cao = càng chặt = càng tốt.",
    },
    long: {
      en:
        "ATR (Average True Range) measures average daily price movement. We compare ATR at the start of the " +
        "base vs the end. A high contraction % means the stock is trading in an increasingly narrow range — " +
        "a sign of equilibrium between buyers and sellers that often precedes a sharp move.",
      vi:
        "ATR (Khoảng dao động thực trung bình) đo biên độ giá trung bình mỗi ngày. Ta so sánh ATR ở đầu nền " +
        "với cuối nền. % co thắt cao nghĩa là cổ phiếu giao dịch trong biên độ ngày càng hẹp — dấu hiệu cân bằng " +
        "giữa bên mua và bên bán, thường xảy ra trước một cú bứt phá mạnh.",
    },
  },
  price_range: {
    term: { en: "Price Range %", vi: "% Biên độ giá" },
    short: {
      en: "High-to-low spread of the base. Tighter (smaller) is better.",
      vi: "Khoảng cách đỉnh–đáy của nền. Càng chặt (nhỏ) càng tốt.",
    },
    long: {
      en:
        "The percentage distance between the highest high and lowest low of the consolidation window. " +
        "A tight range (under ~15%) signals a well-controlled base; a wide range means the stock is still " +
        "swinging and hasn't settled.",
      vi:
        "Khoảng cách phần trăm giữa đỉnh cao nhất và đáy thấp nhất của vùng tích lũy. " +
        "Biên độ chặt (dưới ~15%) cho thấy nền được kiểm soát tốt; biên độ rộng nghĩa là cổ phiếu vẫn dao động " +
        "và chưa ổn định.",
    },
  },
  volume_dryup: {
    term: { en: "Volume Dry-up %", vi: "% Cạn khối lượng" },
    short: {
      en: "Drop in recent volume vs the base average. Higher = less selling pressure.",
      vi: "Mức giảm khối lượng gần đây so với trung bình nền. Càng cao = áp lực bán càng ít.",
    },
    long: {
      en:
        "Compares recent average volume to the volume earlier in the base. A positive dry-up means trading " +
        "activity has quieted — sellers are exhausted. Low volume in a tight base, followed by a volume surge " +
        "on the breakout, is the ideal sequence.",
      vi:
        "So sánh khối lượng trung bình gần đây với khối lượng giai đoạn đầu nền. Cạn khối lượng dương nghĩa là " +
        "hoạt động giao dịch đã lắng xuống — bên bán đã cạn. Khối lượng thấp trong nền chặt, theo sau là khối " +
        "lượng tăng vọt khi bứt phá, là trình tự lý tưởng.",
    },
  },
  pivot: {
    term: { en: "Pivot / Pivot High", vi: "Pivot / Đỉnh pivot" },
    short: {
      en: "The resistance level just overhead. A break above it is the buy trigger.",
      vi: "Mức kháng cự ngay phía trên. Vượt qua nó là tín hiệu mua.",
    },
    long: {
      en:
        "The pivot is the most recent significant high acting as resistance. It is the line in the sand: " +
        "a decisive move above the pivot (ideally on big volume) is the classic breakout entry trigger.",
      vi:
        "Pivot là đỉnh quan trọng gần nhất đóng vai trò kháng cự. Đó là lằn ranh: một cú vượt dứt khoát qua pivot " +
        "(lý tưởng là với khối lượng lớn) là tín hiệu vào lệnh bứt phá kinh điển.",
    },
  },
  distance: {
    term: { en: "Distance to Pivot %", vi: "% Khoảng cách tới pivot" },
    short: {
      en: "How far price is below the breakout level. Smaller = closer to triggering.",
      vi: "Giá còn cách mức bứt phá bao xa. Càng nhỏ = càng gần kích hoạt.",
    },
    long: {
      en:
        "How many percent the current price sits below the pivot. 0% means price is at the breakout line. " +
        "Setups within ~3% are 'imminent' — a small move would trigger the breakout.",
      vi:
        "Giá hiện tại đang ở dưới pivot bao nhiêu phần trăm. 0% nghĩa là giá đang ở ngay lằn bứt phá. " +
        "Các thiết lập trong vòng ~3% là 'sắp xảy ra' — chỉ một nhịp nhỏ là kích hoạt bứt phá.",
    },
  },
  entry: {
    term: { en: "Entry Price", vi: "Giá vào lệnh" },
    short: {
      en: "Suggested buy trigger — just above the pivot high.",
      vi: "Điểm mua đề xuất — ngay trên đỉnh pivot.",
    },
    long: {
      en:
        "The breakout entry: a fraction above the pivot high. The idea is to buy strength as the stock clears " +
        "resistance, ideally confirmed by a surge in volume.",
      vi:
        "Điểm vào lệnh bứt phá: cao hơn đỉnh pivot một chút. Ý tưởng là mua theo sức mạnh khi cổ phiếu vượt " +
        "kháng cự, lý tưởng là được xác nhận bằng khối lượng tăng vọt.",
    },
  },
  stop: {
    term: { en: "Stop-Loss", vi: "Cắt lỗ" },
    short: {
      en: "Where you'd exit to cap a loss — based on recent volatility (ATR).",
      vi: "Nơi thoát lệnh để giới hạn lỗ — dựa trên biến động gần đây (ATR).",
    },
    long: {
      en:
        "A protective exit placed below entry, sized using ATR (≈1.5× ATR by default) so the stop respects the " +
        "stock's normal noise. If price falls here, the setup has failed and you cut the loss.",
      vi:
        "Một điểm thoát bảo vệ đặt dưới giá vào lệnh, tính theo ATR (mặc định ≈1,5× ATR) để mức cắt lỗ tôn trọng " +
        "nhiễu giá bình thường của cổ phiếu. Nếu giá rơi tới đây, thiết lập đã thất bại và bạn cắt lỗ.",
    },
  },
  target: {
    term: { en: "Target Price", vi: "Giá mục tiêu" },
    short: {
      en: "Profit objective, set at 3× your risk by default.",
      vi: "Mục tiêu lợi nhuận, mặc định bằng 3× rủi ro của bạn.",
    },
    long: {
      en:
        "The first profit objective, computed from the risk distance (entry − stop) times the reward multiple " +
        "(3R by default). It gives a concrete level to plan partial or full profit-taking.",
      vi:
        "Mục tiêu lợi nhuận đầu tiên, tính từ khoảng rủi ro (giá vào − cắt lỗ) nhân hệ số lợi nhuận (mặc định 3R). " +
        "Nó cho một mức cụ thể để lên kế hoạch chốt lời một phần hoặc toàn bộ.",
    },
  },
  rr: {
    term: { en: "Risk : Reward (R:R)", vi: "Rủi ro : Lợi nhuận (R:R)" },
    short: {
      en: "Potential reward divided by risk. 3R means you risk 1 to make 3.",
      vi: "Lợi nhuận tiềm năng chia cho rủi ro. 3R nghĩa là rủi ro 1 để kiếm 3.",
    },
    long: {
      en:
        "The ratio of potential profit (target − entry) to potential loss (entry − stop). A 3:1 R:R means a " +
        "winning trade pays three times what a losing trade costs — favorable math even if you're right less " +
        "than half the time.",
      vi:
        "Tỷ lệ giữa lợi nhuận tiềm năng (mục tiêu − giá vào) và rủi ro tiềm năng (giá vào − cắt lỗ). R:R 3:1 nghĩa " +
        "là một lệnh thắng mang lại gấp ba lần chi phí của một lệnh thua — phép toán có lợi ngay cả khi bạn đúng " +
        "dưới một nửa số lần.",
    },
  },
  days_in_base: {
    term: { en: "Days in Base", vi: "Số ngày trong nền" },
    short: {
      en: "How long the consolidation window analyzed is (trading days).",
      vi: "Độ dài vùng tích lũy được phân tích (số phiên giao dịch).",
    },
    long: {
      en:
        "The length of the consolidation window the engine evaluated (default ~60 trading days). Longer, " +
        "well-formed bases can lead to more powerful breakouts.",
      vi:
        "Độ dài vùng tích lũy mà công cụ đánh giá (mặc định ~60 phiên). Những nền dài, được hình thành tốt " +
        "có thể dẫn tới những cú bứt phá mạnh hơn.",
    },
  },
  volume_change: {
    term: { en: "Sector Volume Change %", vi: "% Thay đổi khối lượng ngành" },
    short: {
      en: "Recent 3-month avg volume vs the 6-month avg, per sector.",
      vi: "Khối lượng trung bình 3 tháng gần đây so với trung bình 6 tháng, theo ngành.",
    },
    long: {
      en:
        "For the Sector scanner: the % change between a sector's average daily volume over the last 3 months " +
        "vs the last 6 months. Rising volume often signals fresh institutional interest rotating into a sector.",
      vi:
        "Cho máy quét ngành: % thay đổi giữa khối lượng trung bình ngày của một ngành trong 3 tháng gần đây " +
        "so với 6 tháng gần đây. Khối lượng tăng thường báo hiệu dòng tiền tổ chức mới đang luân chuyển vào ngành.",
    },
  },
  // Fundamentals
  pe_ratio: {
    term: { en: "P/E Ratio", vi: "Tỷ số P/E" },
    short: {
      en: "Price ÷ earnings per share. How much you pay per $1 of profit.",
      vi: "Giá ÷ lợi nhuận trên mỗi cổ phiếu. Bạn trả bao nhiêu cho mỗi 1$ lợi nhuận.",
    },
    long: {
      en:
        "Price-to-Earnings: share price divided by trailing earnings per share. A rough gauge of how richly a " +
        "stock is valued. High P/E = growth expectations priced in; low P/E = cheaper or out-of-favor.",
      vi:
        "Giá trên Lợi nhuận: giá cổ phiếu chia cho lợi nhuận trên mỗi cổ phiếu 12 tháng gần nhất. Thước đo sơ bộ " +
        "mức định giá. P/E cao = kỳ vọng tăng trưởng đã phản ánh vào giá; P/E thấp = rẻ hơn hoặc kém được ưa chuộng.",
    },
  },
  eps: {
    term: { en: "EPS — Earnings Per Share", vi: "EPS — Lợi nhuận trên mỗi cổ phiếu" },
    short: {
      en: "Company profit divided by number of shares.",
      vi: "Lợi nhuận công ty chia cho số lượng cổ phiếu.",
    },
    long: {
      en:
        "A company's net profit divided by its outstanding shares. Growing EPS is one of the strongest drivers " +
        "of sustained stock advances.",
      vi:
        "Lợi nhuận ròng của công ty chia cho số cổ phiếu đang lưu hành. EPS tăng trưởng là một trong những động " +
        "lực mạnh nhất cho đà tăng bền vững của cổ phiếu.",
    },
  },
  market_cap: {
    term: { en: "Market Cap", vi: "Vốn hóa thị trường" },
    short: {
      en: "Total value of all shares (price × shares outstanding).",
      vi: "Tổng giá trị tất cả cổ phiếu (giá × số cổ phiếu lưu hành).",
    },
    long: {
      en:
        "The total market value of the company: share price times shares outstanding. Determines whether a " +
        "stock is small-, mid-, or large-cap.",
      vi:
        "Tổng giá trị thị trường của công ty: giá cổ phiếu nhân số cổ phiếu lưu hành. Xác định cổ phiếu thuộc " +
        "nhóm vốn hóa nhỏ, vừa hay lớn.",
    },
  },
  beta: {
    term: { en: "Beta", vi: "Beta" },
    short: {
      en: "Volatility vs the market. >1 = swings more than the market; <1 = less.",
      vi: "Biến động so với thị trường. >1 = dao động mạnh hơn thị trường; <1 = ít hơn.",
    },
    long: {
      en:
        "Measures how much a stock moves relative to the overall market. Beta of 1.0 moves with the market; " +
        "1.5 tends to swing 50% more; 0.7 is calmer than the market.",
      vi:
        "Đo mức độ biến động của cổ phiếu so với toàn thị trường. Beta 1,0 dao động cùng thị trường; " +
        "1,5 thường dao động mạnh hơn 50%; 0,7 thì êm hơn thị trường.",
    },
  },
  dividend_yield: {
    term: { en: "Dividend Yield", vi: "Tỷ suất cổ tức" },
    short: {
      en: "Annual dividend as a % of share price.",
      vi: "Cổ tức hằng năm tính theo % giá cổ phiếu.",
    },
    long: {
      en: "The annual dividend payment expressed as a percentage of the current share price.",
      vi: "Khoản cổ tức hằng năm biểu thị theo phần trăm của giá cổ phiếu hiện tại.",
    },
  },
  roe: {
    term: { en: "ROE — Return on Equity", vi: "ROE — Lợi nhuận trên vốn chủ sở hữu" },
    short: {
      en: "Profit generated per $1 of shareholder equity. Higher = more efficient.",
      vi: "Lợi nhuận tạo ra trên mỗi 1$ vốn chủ sở hữu. Càng cao = càng hiệu quả.",
    },
    long: {
      en:
        "Return on Equity measures how efficiently a company turns shareholder capital into profit. " +
        "Consistently high ROE (e.g. 15%+) is a hallmark of quality businesses.",
      vi:
        "ROE đo mức độ hiệu quả của công ty trong việc biến vốn cổ đông thành lợi nhuận. " +
        "ROE cao ổn định (ví dụ 15%+) là dấu hiệu của doanh nghiệp chất lượng.",
    },
  },
  profit_margin: {
    term: { en: "Profit Margin", vi: "Biên lợi nhuận" },
    short: {
      en: "Share of revenue kept as profit.",
      vi: "Phần doanh thu giữ lại thành lợi nhuận.",
    },
    long: {
      en: "Net profit divided by revenue — how many cents of each sales dollar end up as profit.",
      vi: "Lợi nhuận ròng chia cho doanh thu — mỗi đồng doanh thu còn lại bao nhiêu xu là lợi nhuận.",
    },
  },
  revenue_growth: {
    term: { en: "Revenue Growth", vi: "Tăng trưởng doanh thu" },
    short: {
      en: "Year-over-year sales growth.",
      vi: "Tăng trưởng doanh thu so với cùng kỳ năm trước.",
    },
    long: {
      en: "The year-over-year percentage change in revenue. Strong, accelerating sales growth often precedes big winners.",
      vi: "Phần trăm thay đổi doanh thu so với cùng kỳ năm trước. Tăng trưởng doanh thu mạnh và tăng tốc thường đi trước những cổ phiếu thắng lớn.",
    },
  },
  week52: {
    term: { en: "52-Week High / Low", vi: "Đỉnh / Đáy 52 tuần" },
    short: {
      en: "The highest and lowest price over the past year.",
      vi: "Giá cao nhất và thấp nhất trong năm qua.",
    },
    long: {
      en:
        "The price extremes over the trailing 12 months. Stocks breaking out near 52-week highs (rather than " +
        "languishing near lows) statistically tend to continue higher — strength begets strength.",
      vi:
        "Các mức giá cực trị trong 12 tháng gần nhất. Cổ phiếu bứt phá gần đỉnh 52 tuần (thay vì lình xình gần " +
        "đáy) theo thống kê thường tiếp tục tăng — sức mạnh sinh ra sức mạnh.",
    },
  },
};

// Resolve a glossary entry to flat {term, short, long} strings in the active
// language (falls back to English). Used by the Learn page and tooltips.
window.gloss = function (key, lang) {
  const e = window.GLOSSARY[key];
  if (!e) return null;
  const pick = (f) => (f && (f[lang || (window.I18N ? window.I18N.getLang() : "en")] ?? f.en)) || "";
  return { term: pick(e.term), short: pick(e.short), long: pick(e.long) };
};
