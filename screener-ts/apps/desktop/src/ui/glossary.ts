/** Bilingual glossary, ported from the backend's glossary.js (term + long
 * description, grouped). Used by the Learn tab. */
import { getLang } from './i18n.js';

interface Entry {
  term: { en: string; vi: string };
  long: { en: string; vi: string };
}

export const GLOSSARY: Record<string, Entry> = {
  score: {
    term: { en: 'Conviction Score (0–100)', vi: 'Điểm tin cậy (0–100)' },
    long: {
      en: 'A 0–100 score blending six factors: Weinstein stage, ATR contraction, price-range tightness, volume dry-up, number of VCP contractions, and how close price is to the pivot. Higher means a tighter, more textbook consolidation near a breakout point. It is a relative ranking aid — not a guarantee.',
      vi: 'Điểm 0–100 kết hợp sáu yếu tố: giai đoạn Weinstein, sự co thắt ATR, độ chặt của biên độ giá, sự cạn kiệt khối lượng, số lần co thắt VCP, và mức độ giá gần điểm pivot. Điểm càng cao nghĩa là nền tích lũy càng chặt và sát điểm bứt phá. Đây là công cụ xếp hạng tương đối — không phải sự bảo đảm.',
    },
  },
  signal: {
    term: { en: 'Signal', vi: 'Tín hiệu' },
    long: {
      en: 'A plain-language label. BREAKOUT IMMINENT: coiled tight and sitting right under a breakout level (score ≥ 70, within 3% of pivot). CONSOLIDATING: a valid base is forming (score ≥ 40) but not at the trigger yet. NO SIGNAL: no tradeable setup right now.',
      vi: 'Nhãn mô tả dễ hiểu. BỨT PHÁ SẮP XẢY RA: nén chặt và nằm ngay dưới mức bứt phá (điểm ≥ 70, trong 3% so với pivot). TÍCH LŨY: nền hợp lệ đang hình thành (điểm ≥ 40) nhưng chưa tới điểm kích hoạt. KHÔNG TÍN HIỆU: hiện chưa có thiết lập.',
    },
  },
  stage: {
    term: { en: 'Weinstein Stage (1–4)', vi: 'Giai đoạn Weinstein (1–4)' },
    long: {
      en: "Stan Weinstein's Stage Analysis classifies a trend using moving averages. Stage 1 — Basing: sideways after a decline. Stage 2 — Advancing: uptrend, price above rising MAs (the buy zone). Stage 3 — Topping: momentum fading. Stage 4 — Declining: downtrend, price below falling MAs — avoid.",
      vi: 'Phân tích Giai đoạn của Stan Weinstein phân loại xu hướng bằng đường trung bình động. Giai đoạn 1 — Tạo nền: đi ngang sau khi giảm. Giai đoạn 2 — Tăng giá: xu hướng tăng, giá trên các MA dốc lên (vùng mua). Giai đoạn 3 — Tạo đỉnh: đà tăng yếu dần. Giai đoạn 4 — Giảm giá: giá dưới các MA dốc xuống — nên tránh.',
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
    title: { en: 'Screener Metrics', vi: 'Chỉ số bộ lọc' },
    keys: ['score', 'signal', 'stage', 'vcp', 'atr_contraction', 'price_range', 'volume_dryup', 'days_in_base'],
  },
  {
    title: { en: 'Pivots & Trade Levels', vi: 'Pivot & các mức giao dịch' },
    keys: ['pivot', 'distance', 'entry', 'stop', 'target', 'rr', 'r_multiple'],
  },
  {
    title: { en: 'Fundamentals', vi: 'Chỉ số cơ bản' },
    keys: ['pe_ratio', 'eps', 'market_cap', 'profit_margin', 'week52'],
  },
  {
    title: { en: 'Sector Scanner', vi: 'Máy quét ngành' },
    keys: ['volume_change'],
  },
];

export function gloss(key: string): { term: string; long: string } | null {
  const e = GLOSSARY[key];
  if (!e) return null;
  const l = getLang();
  return { term: e.term[l] ?? e.term.en, long: e.long[l] ?? e.long.en };
}
