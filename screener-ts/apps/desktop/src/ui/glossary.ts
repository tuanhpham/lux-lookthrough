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
    term: { en: 'P/E Ratio', vi: 'Tỷ số P/E' },
    long: {
      en: 'Price-to-Earnings: share price divided by trailing earnings per share. A rough gauge of valuation. High P/E = growth expectations priced in; low P/E = cheaper or out-of-favor.',
      vi: 'Giá trên Lợi nhuận: giá cổ phiếu chia cho EPS 12 tháng gần nhất. Thước đo sơ bộ mức định giá. P/E cao = kỳ vọng tăng trưởng; P/E thấp = rẻ hơn hoặc kém ưa chuộng.',
    },
  },
  eps: {
    term: { en: 'EPS — Earnings Per Share', vi: 'EPS — Lợi nhuận trên mỗi cổ phiếu' },
    long: {
      en: "A company's net profit divided by its outstanding shares. Growing EPS is one of the strongest drivers of sustained stock advances.",
      vi: 'Lợi nhuận ròng của công ty chia cho số cổ phiếu lưu hành. EPS tăng trưởng là một trong những động lực mạnh nhất cho đà tăng bền vững.',
    },
  },
  market_cap: {
    term: { en: 'Market Cap', vi: 'Vốn hóa thị trường' },
    long: {
      en: 'The total market value of the company: share price times shares outstanding. Determines small-, mid-, or large-cap.',
      vi: 'Tổng giá trị thị trường: giá cổ phiếu nhân số cổ phiếu lưu hành. Xác định vốn hóa nhỏ, vừa hay lớn.',
    },
  },
  profit_margin: {
    term: { en: 'Profit Margin', vi: 'Biên lợi nhuận' },
    long: {
      en: 'Net profit divided by revenue — how many cents of each sales dollar end up as profit.',
      vi: 'Lợi nhuận ròng chia cho doanh thu — mỗi đồng doanh thu còn lại bao nhiêu xu là lợi nhuận.',
    },
  },
  roe: {
    term: { en: 'ROE — Return on Equity', vi: 'ROE — Lợi nhuận trên vốn chủ' },
    long: {
      en: 'Return on Equity = net income ÷ shareholder equity. How efficiently a company turns capital into profit. Consistently high ROE (15%+) is a hallmark of quality businesses.',
      vi: 'ROE = lợi nhuận ròng ÷ vốn chủ sở hữu. Mức độ hiệu quả công ty biến vốn thành lợi nhuận. ROE cao ổn định (15%+) là dấu hiệu doanh nghiệp chất lượng.',
    },
  },
  revenue_growth: {
    term: { en: 'Revenue Growth', vi: 'Tăng trưởng doanh thu' },
    long: {
      en: 'Year-over-year percentage change in revenue. Strong, accelerating sales growth often precedes big winners.',
      vi: 'Phần trăm thay đổi doanh thu so với cùng kỳ năm trước. Tăng trưởng mạnh và tăng tốc thường đi trước những cổ phiếu thắng lớn.',
    },
  },
  beta: {
    term: { en: 'Beta', vi: 'Beta' },
    long: {
      en: 'How much a stock moves relative to the market. Beta 1.0 moves with the market; 1.5 swings ~50% more; 0.7 is calmer.',
      vi: 'Mức độ biến động của cổ phiếu so với thị trường. Beta 1,0 dao động cùng thị trường; 1,5 mạnh hơn ~50%; 0,7 êm hơn.',
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
