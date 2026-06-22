/**
 * Minimal EN/VI internationalization. `t(key)` resolves to the active language;
 * `setLang` persists the choice and notifies subscribers so views re-render.
 */
type Lang = 'en' | 'vi';

const STRINGS: Record<string, { en: string; vi: string }> = {
  // Brand / nav
  'brand.name': { en: 'Screener', vi: 'Bộ lọc' },
  'brand.sub': { en: 'TypeScript edition', vi: 'Phiên bản TypeScript' },
  'nav.picks': { en: 'Top Picks', vi: 'Lựa chọn hàng đầu' },
  'nav.screener': { en: 'Screener', vi: 'Bộ lọc' },
  'nav.watchlist': { en: 'Watchlists', vi: 'Danh sách theo dõi' },
  'nav.sectors': { en: 'Sectors', vi: 'Ngành' },
  'nav.portfolio': { en: 'Paper Trading', vi: 'Giao dịch giấy' },
  'nav.blog': { en: 'Analysis', vi: 'Phân tích' },
  'nav.playbook': { en: 'Playbook', vi: 'Sổ tay' },
  'nav.learn': { en: 'Learn', vi: 'Tìm hiểu' },
  'foot.disclaimer': { en: 'Educational use only. Not financial advice.', vi: 'Chỉ dùng cho mục đích học tập. Không phải lời khuyên đầu tư.' },

  // Landing
  'landing.badge': { en: 'Pattern-based US equity screener', vi: 'Bộ lọc cổ phiếu Mỹ theo mẫu hình' },
  'landing.h1a': { en: "Find tomorrow's breakouts,", vi: 'Tìm cú bứt phá của ngày mai,' },
  'landing.h1b': { en: 'before they break out.', vi: 'trước khi chúng bứt phá.' },
  'landing.sub': {
    en: 'Scan any stock or sector for tight consolidations, VCP setups and Stage-2 momentum — ranked by a 0–100 conviction score, with interactive charts, EMAs, and a paper-trading engine.',
    vi: 'Quét bất kỳ cổ phiếu hay ngành nào để tìm nền giá chặt, mẫu hình VCP và đà tăng Giai đoạn 2 — xếp hạng theo điểm tin cậy 0–100, kèm biểu đồ tương tác, EMA và công cụ giao dịch giấy.',
  },
  'landing.cta': { en: 'Launch the Screener →', vi: 'Mở bộ lọc →' },
  'landing.nosignup': { en: 'No sign-up · runs locally', vi: 'Không cần đăng ký · chạy cục bộ' },
  'landing.f1.t': { en: 'Custom Screener', vi: 'Bộ lọc tùy chỉnh' },
  'landing.f1.d': { en: 'Type tickers or pick sectors. Filter by score, signal and stage.', vi: 'Nhập mã hoặc chọn ngành. Lọc theo điểm, tín hiệu và giai đoạn.' },
  'landing.f2.t': { en: 'Pro Charts', vi: 'Biểu đồ chuyên nghiệp' },
  'landing.f2.d': { en: 'Candles with EMAs, volume, and trade levels drawn on the chart.', vi: 'Nến với EMA, khối lượng và các mức giao dịch vẽ trên biểu đồ.' },
  'landing.f3.t': { en: 'Top Picks', vi: 'Lựa chọn hàng đầu' },
  'landing.f3.d': { en: 'Auto-ranked best setups across the market by strategy.', vi: 'Tự động xếp hạng các thiết lập tốt nhất theo chiến lược.' },
  'landing.f4.t': { en: 'Paper Trading', vi: 'Giao dịch giấy' },
  'landing.f4.d': { en: 'Multi-account strategy testing with equity curves and risk metrics.', vi: 'Thử nghiệm chiến lược đa tài khoản với đường vốn và chỉ số rủi ro.' },

  // Picks
  'picks.title': { en: 'Top Picks', vi: 'Lựa chọn hàng đầu' },
  'picks.sub': { en: 'Highest-conviction setups, auto-ranked across the universe.', vi: 'Các thiết lập có độ tin cậy cao nhất, tự động xếp hạng trên toàn vũ trụ cổ phiếu.' },
  'picks.breakout': { en: 'Breakout-ready', vi: 'Sẵn sàng bứt phá' },
  'picks.momentum': { en: 'Stage-2 momentum', vi: 'Đà tăng Giai đoạn 2' },
  'picks.vcp': { en: 'Tight VCP', vi: 'VCP chặt' },
  'picks.broad': { en: 'Broad universe', vi: 'Toàn thị trường' },
  'picks.run': { en: '↻ Run', vi: '↻ Chạy' },
  'picks.market': { en: 'Market', vi: 'Thị trường' },
  'picks.market.us': { en: '🇺🇸 US', vi: '🇺🇸 Mỹ' },
  'picks.market.vn': { en: '🇻🇳 Vietnam', vi: '🇻🇳 Việt Nam' },
  'picks.universe': { en: 'Universe', vi: 'Phạm vi' },
  'picks.uni.curated': { en: 'Curated (~540)', vi: 'Chọn lọc (~540)' },
  'picks.uni.broad': { en: 'S&P 1500', vi: 'S&P 1500' },
  'picks.uni.all': { en: 'All US stocks', vi: 'Toàn bộ CK Mỹ' },
  'picks.uni.vn30': { en: 'VN30', vi: 'VN30' },
  'picks.uni.vn100': { en: 'VN100', vi: 'VN100' },
  'picks.uni.vnall': { en: 'All HOSE (~390)', vi: 'Toàn sàn HOSE (~390)' },
  'picks.uni.vnall.hint': {
    en: 'Scans every HOSE-listed stock (~390) via Yahoo. Takes a few minutes; some may be rate-limited — use Stop anytime. HNX/UPCoM are not available on Yahoo.',
    vi: 'Quét toàn bộ cổ phiếu niêm yết HOSE (~390) qua Yahoo. Mất vài phút; một số mã có thể bị giới hạn — bấm Dừng bất cứ lúc nào. HNX/UPCoM không có trên Yahoo.',
  },
  'picks.uni.all.hint': {
    en: 'Scans every NASDAQ + NYSE/AMEX common stock (~6000+). Takes several minutes and some symbols may be rate-limited — use the Stop button anytime.',
    vi: 'Quét toàn bộ cổ phiếu NASDAQ + NYSE/AMEX (~6000+). Mất vài phút và một số mã có thể bị giới hạn — bấm Dừng bất cứ lúc nào.',
  },
  'picks.stop': { en: '■ Stop', vi: '■ Dừng' },
  'picks.loadinguni': { en: 'Loading symbol list…', vi: 'Đang tải danh sách mã…' },
  'picks.scanned': { en: 'scanned', vi: 'đã quét' },
  'picks.matches': { en: 'match(es) so far', vi: 'kết quả đến hiện tại' },
  'picks.stopped': { en: 'Stopped', vi: 'Đã dừng' },
  'picks.done': { en: 'Done', vi: 'Hoàn tất' },
  'picks.unavailable': { en: 'unavailable this run', vi: 'không tải được lần này' },

  // Screener
  'screener.title': { en: 'Custom Screener', vi: 'Bộ lọc tùy chỉnh' },
  'screener.sub': { en: 'Find consolidation & breakout setups across any stocks or sectors.', vi: 'Tìm thiết lập tích lũy & bứt phá trên bất kỳ cổ phiếu hay ngành nào.' },
  'screener.symbols': { en: 'Symbols (comma separated)', vi: 'Mã cổ phiếu (cách nhau bằng dấu phẩy)' },
  'screener.orsectors': { en: 'Or pick sectors', vi: 'Hoặc chọn ngành' },
  'screener.minscore': { en: 'Min score', vi: 'Điểm tối thiểu' },
  'screener.nolimit': { en: 'no limit', vi: 'không giới hạn' },
  'screener.minscore.hint': {
    en: 'Leave blank for no limit. Scores can be negative (e.g. when volatility expands), so a min of 0 hides those stocks.',
    vi: 'Để trống = không giới hạn. Điểm có thể âm (vd khi biến động tăng), nên đặt mức tối thiểu 0 sẽ ẩn các cổ phiếu đó.',
  },
  'screener.signal': { en: 'Signal', vi: 'Tín hiệu' },
  'screener.stage': { en: 'Stage', vi: 'Giai đoạn' },
  'screener.sortby': { en: 'Sort by', vi: 'Sắp xếp theo' },
  'screener.run': { en: 'Run Screen', vi: 'Chạy lọc' },
  'opt.any': { en: 'Any', vi: 'Tất cả' },

  // Sectors
  'sectors.title': { en: 'Industry Volume Scanner', vi: 'Máy quét khối lượng theo ngành' },
  'sectors.sub': { en: 'Sectors ranked by 3m-vs-6m average-volume change. Click one for its volume trend.', vi: 'Các ngành xếp hạng theo thay đổi khối lượng 3 tháng so với 6 tháng. Nhấp để xem xu hướng khối lượng.' },
  'sectors.scan': { en: '↻ Scan sectors', vi: '↻ Quét ngành' },
  'sectors.screenstocks': { en: 'Screen stocks →', vi: 'Lọc cổ phiếu →' },

  // Watchlist
  'wl.title': { en: 'Watchlist', vi: 'Danh sách theo dõi' },
  'wl.sub': { en: 'Track symbols and screen them in one click. Stored locally.', vi: 'Theo dõi các mã và lọc chúng chỉ với một cú nhấp. Lưu cục bộ.' },
  'wl.add': { en: 'Add', vi: 'Thêm' },
  'wl.screenall': { en: 'Screen All', vi: 'Lọc tất cả' },

  // Portfolio
  'pf.title': { en: 'Paper Trading', vi: 'Giao dịch giấy' },
  'pf.sub': { en: 'Independent multi-account strategy testing. Cash, PnL and risk are per account.', vi: 'Thử nghiệm chiến lược đa tài khoản độc lập. Tiền mặt, lãi/lỗ và rủi ro tính riêng cho từng tài khoản.' },

  // Detail modal
  'detail.analysis': { en: 'Analysis', vi: 'Phân tích' },
  'detail.pricehistory': { en: 'Price History', vi: 'Lịch sử giá' },
  'detail.fundtrend': { en: 'Fundamentals Trend', vi: 'Xu hướng cơ bản' },
  'detail.fundamentals': { en: 'Fundamentals', vi: 'Chỉ số cơ bản' },
  'detail.about': { en: 'About', vi: 'Giới thiệu' },

  // Misc
  'common.slower': { en: '(slower)', vi: '(chậm hơn)' },
  'msg.scanning': { en: 'Scanning', vi: 'Đang quét' },
  'msg.loading': { en: 'Loading', vi: 'Đang tải' },
};

let lang: Lang = ((): Lang => {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('lang') : null;
  return saved === 'vi' ? 'vi' : 'en';
})();

const subscribers: Array<(l: Lang) => void> = [];

export function getLang(): Lang {
  return lang;
}

export function t(key: string): string {
  const e = STRINGS[key];
  if (!e) return key;
  return e[lang] ?? e.en;
}

export function onLangChange(fn: (l: Lang) => void): void {
  subscribers.push(fn);
}

export function setLang(next: Lang): void {
  lang = next;
  try {
    localStorage.setItem('lang', next);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = next;
  subscribers.forEach((fn) => fn(next));
}
