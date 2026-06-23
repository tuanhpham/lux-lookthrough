/**
 * Minimal EN/VI internationalization. `t(key)` resolves to the active language;
 * `setLang` persists the choice and notifies subscribers so views re-render.
 */
type Lang = 'en' | 'vi';

const STRINGS: Record<string, { en: string; vi: string }> = {
  // Brand / nav
  'brand.name': { en: 'The Professional', vi: 'The Professional' },
  'brand.sub': { en: 'Screener for The Professionals', vi: 'Bộ lọc cho dân chuyên nghiệp' },
  'nav.picks': { en: 'Top Picks', vi: 'Lựa chọn hàng đầu' },
  'nav.screener': { en: 'Screener', vi: 'Bộ lọc' },
  'nav.watchlist': { en: 'Watchlists', vi: 'Danh sách theo dõi' },
  'nav.sectors': { en: 'Sectors', vi: 'Ngành' },
  'nav.portfolio': { en: 'Paper Trading', vi: 'Giao dịch giấy' },
  'nav.backtest': { en: 'Backtest', vi: 'Kiểm thử' },
  'nav.blog': { en: 'Analysis', vi: 'Phân tích' },
  'nav.playbook': { en: 'Playbook', vi: 'Sổ tay' },
  'nav.learn': { en: 'Learn', vi: 'Tìm hiểu' },
  'foot.disclaimer': { en: 'Educational use only. Not financial advice.', vi: 'Chỉ dùng cho mục đích học tập. Không phải lời khuyên đầu tư.' },

  // Landing
  'landing.badge': { en: 'Screener for The Professionals', vi: 'Bộ lọc cho dân chuyên nghiệp' },
  'landing.h1a': { en: 'Trade the strongest stocks,', vi: 'Giao dịch những cổ phiếu mạnh nhất,' },
  'landing.h1b': { en: 'in the strongest setups.', vi: 'ở những thiết lập tốt nhất.' },
  'landing.sub': {
    en: 'Scan any stock or sector for Qullamaggie setups (VCP & episodic pivots) and the strongest momentum leaders — ranked by a 0–100 quality score with market-regime and sector-rotation context, interactive charts, and a paper-trading engine.',
    vi: 'Quét bất kỳ cổ phiếu hay ngành nào để tìm thiết lập Qullamaggie (VCP & điểm xoay đột biến) và các mã động lượng mạnh nhất — xếp hạng theo điểm chất lượng 0–100 kèm bối cảnh thị trường và luân chuyển ngành, biểu đồ tương tác và công cụ giao dịch giấy.',
  },
  'landing.cta': { en: 'Launch the Screener →', vi: 'Mở bộ lọc →' },
  'landing.nosignup': { en: 'No sign-up · runs locally', vi: 'Không cần đăng ký · chạy cục bộ' },
  'landing.f1.t': { en: 'Custom Screener', vi: 'Bộ lọc tùy chỉnh' },
  'landing.f1.d': { en: 'Type tickers or pick sectors. Filter by setup type, quality score and momentum.', vi: 'Nhập mã hoặc chọn ngành. Lọc theo loại thiết lập, điểm chất lượng và động lượng.' },
  'landing.f2.t': { en: 'Pro Charts', vi: 'Biểu đồ chuyên nghiệp' },
  'landing.f2.d': { en: 'Candles with EMAs, volume, and pivot/entry/stop levels drawn on the chart.', vi: 'Nến với EMA, khối lượng và các mức pivot/mua/cắt lỗ vẽ trên biểu đồ.' },
  'landing.f3.t': { en: 'Top Picks', vi: 'Lựa chọn hàng đầu' },
  'landing.f3.d': { en: 'Qullamaggie setups and momentum leaders, auto-ranked across the market.', vi: 'Thiết lập Qullamaggie và mã dẫn dắt động lượng, tự động xếp hạng toàn thị trường.' },
  'landing.f4.t': { en: 'Paper Trading', vi: 'Giao dịch giấy' },
  'landing.f4.d': { en: 'Multi-account strategy testing with equity curves and risk metrics.', vi: 'Thử nghiệm chiến lược đa tài khoản với đường vốn và chỉ số rủi ro.' },

  // Picks
  'picks.title': { en: 'Top Picks', vi: 'Lựa chọn hàng đầu' },
  'picks.sub': { en: 'Qullamaggie setups and momentum leaders, auto-ranked across the universe.', vi: 'Thiết lập Qullamaggie và mã dẫn dắt động lượng, tự động xếp hạng trên toàn vũ trụ cổ phiếu.' },
  'picks.qm': { en: 'Qullamaggie', vi: 'Qullamaggie' },
  'picks.momentumscan': { en: 'Momentum', vi: 'Động lượng' },
  'picks.surge': { en: 'Surge', vi: 'Bứt tốc' },
  'picks.prefilter': { en: 'Momentum pre-filter', vi: 'Lọc động lượng trước' },
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
  'picks.uni.hnx': { en: 'HNX (~135)', vi: 'Sàn HNX (~135)' },
  'picks.uni.upcom': { en: 'UPCoM (~360)', vi: 'Sàn UPCoM (~360)' },
  'picks.uni.vnmarket': { en: 'All VN (~880)', vi: 'Toàn TT VN (~880)' },
  'picks.uni.vnall.hint': {
    en: 'Scans the full universe via VNDirect (covers HOSE + HNX + UPCoM). Takes a few minutes; less-liquid names with little history are skipped — use Stop anytime.',
    vi: 'Quét toàn bộ qua VNDirect (gồm HOSE + HNX + UPCoM). Mất vài phút; các mã kém thanh khoản ít lịch sử sẽ bị bỏ qua — bấm Dừng bất cứ lúc nào.',
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

  // Screener (Qullamaggie + Momentum)
  'screener.title': { en: 'Custom Screener', vi: 'Bộ lọc tùy chỉnh' },
  'screener.sub': { en: 'Scan any stocks or sectors for Qullamaggie setups and momentum leaders.', vi: 'Quét bất kỳ cổ phiếu hay ngành nào để tìm thiết lập Qullamaggie và mã dẫn dắt động lượng.' },
  'screener.symbols': { en: 'Symbols (comma separated)', vi: 'Mã cổ phiếu (cách nhau bằng dấu phẩy)' },
  'screener.orsectors': { en: 'Or pick sectors', vi: 'Hoặc chọn ngành' },
  'screener.nolimit': { en: 'no limit', vi: 'không giới hạn' },
  'screener.setup': { en: 'Setup type', vi: 'Loại thiết lập' },
  'screener.setup.vcp': { en: 'VCP', vi: 'VCP' },
  'screener.setup.ep': { en: 'Episodic pivot', vi: 'Điểm xoay đột biến' },
  'screener.setup.both': { en: 'VCP + Episodic', vi: 'VCP + Đột biến' },
  'screener.minquality': { en: 'Min quality', vi: 'Chất lượng tối thiểu' },
  'screener.minmomentum': { en: 'Min momentum', vi: 'Động lượng tối thiểu' },
  'screener.sortby': { en: 'Sort by', vi: 'Sắp xếp theo' },
  'screener.col.quality': { en: 'Quality', vi: 'Chất lượng' },
  'screener.col.momentum': { en: 'Momentum', vi: 'Động lượng' },
  'screener.run': { en: 'Run Screen', vi: 'Chạy lọc' },
  'opt.any': { en: 'Any', vi: 'Tất cả' },

  // Momentum classifications
  'mom.class.weak': { en: 'Weak', vi: 'Yếu' },
  'mom.class.building': { en: 'Building', vi: 'Đang xây' },
  'mom.class.strong': { en: 'Strong', vi: 'Mạnh' },
  'mom.class.explosive': { en: 'Explosive', vi: 'Bùng nổ' },

  // Sectors
  'sectors.title': { en: 'Sector Rotation', vi: 'Luân chuyển ngành' },
  'sectors.sub': { en: 'Sectors ranked by momentum (1M/3M return + RS vs SPY), with the volume trend. Click one for details.', vi: 'Các ngành xếp hạng theo động lượng (lợi nhuận 1M/3M + RS so với SPY), kèm xu hướng khối lượng. Nhấp để xem chi tiết.' },
  'sectors.scan': { en: '↻ Scan sectors', vi: '↻ Quét ngành' },
  'sectors.screenstocks': { en: 'Screen stocks →', vi: 'Lọc cổ phiếu →' },
  'sectors.hot': { en: 'Hot', vi: 'Nóng' },
  'sectors.cold': { en: 'Cold', vi: 'Lạnh' },

  // Watchlist
  'wl.title': { en: 'Watchlist', vi: 'Danh sách theo dõi' },
  'wl.sub': { en: 'Track symbols and screen them in one click. Stored locally.', vi: 'Theo dõi các mã và lọc chúng chỉ với một cú nhấp. Lưu cục bộ.' },
  'wl.add': { en: 'Add', vi: 'Thêm' },
  'wl.screenall': { en: 'Screen All', vi: 'Lọc tất cả' },

  // Portfolio
  'pf.title': { en: 'Paper Trading', vi: 'Giao dịch giấy' },
  'pf.sub': { en: 'Independent multi-account strategy testing. Cash, PnL and risk are per account.', vi: 'Thử nghiệm chiến lược đa tài khoản độc lập. Tiền mặt, lãi/lỗ và rủi ro tính riêng cho từng tài khoản.' },

  // Detail modal
  'detail.quality': { en: 'Quality', vi: 'Chất lượng' },
  'detail.analysis': { en: 'Analysis', vi: 'Phân tích' },
  'detail.pricehistory': { en: 'Price History', vi: 'Lịch sử giá' },
  'detail.fundtrend': { en: 'Fundamentals Trend', vi: 'Xu hướng cơ bản' },
  'detail.fundamentals': { en: 'Fundamentals', vi: 'Chỉ số cơ bản' },
  'detail.about': { en: 'About', vi: 'Giới thiệu' },

  // Backtest
  'backtest.title': { en: 'Backtest', vi: 'Kiểm thử chiến lược' },
  'backtest.sub': { en: 'Simulate the VCP breakout strategy on historical data.', vi: 'Mô phỏng chiến lược bứt phá VCP trên dữ liệu lịch sử.' },
  'backtest.note': {
    en: 'Focused backtest: enter a few symbols. Daily bars; no-lookahead. Large universes re-fetch each run (no persistent cache).',
    vi: 'Kiểm thử tập trung: nhập vài mã. Dữ liệu ngày; không nhìn trước. Danh sách lớn sẽ tải lại mỗi lần chạy (chưa có cache lâu dài).',
  },
  'backtest.symbols': { en: 'Symbols', vi: 'Mã cổ phiếu' },
  'backtest.period': { en: 'History', vi: 'Lịch sử' },
  'backtest.risk': { en: 'Risk %/trade', vi: 'Rủi ro %/lệnh' },
  'backtest.capital': { en: 'Capital', vi: 'Vốn' },
  'backtest.run': { en: 'Run Backtest', vi: 'Chạy kiểm thử' },
  'backtest.running': { en: 'Running simulation…', vi: 'Đang mô phỏng…' },
  'backtest.needsymbols': { en: 'Enter at least one symbol.', vi: 'Nhập ít nhất một mã.' },
  'backtest.nodata': { en: 'No symbol had enough history (need ≥200 bars).', vi: 'Không mã nào đủ lịch sử (cần ≥200 phiên).' },
  'backtest.trades': { en: 'trades', vi: 'lệnh' },
  'backtest.notrades': { en: 'No trades were taken in this window.', vi: 'Không có lệnh nào trong khoảng này.' },
  'backtest.totalreturn': { en: 'Total Return', vi: 'Tổng lợi nhuận' },
  'backtest.maxdd': { en: 'Max Drawdown', vi: 'Sụt giảm tối đa' },
  'backtest.winrate': { en: 'Win Rate', vi: 'Tỷ lệ thắng' },
  'backtest.profitfactor': { en: 'Profit Factor', vi: 'Hệ số lợi nhuận' },
  'backtest.expectancy': { en: 'Expectancy', vi: 'Kỳ vọng' },
  'backtest.avgwin': { en: 'Avg Win', vi: 'Lãi TB' },
  'backtest.avgloss': { en: 'Avg Loss', vi: 'Lỗ TB' },
  'backtest.avghold': { en: 'Avg Hold', vi: 'Nắm giữ TB' },
  'backtest.equity': { en: 'Equity Curve', vi: 'Đường vốn' },
  'backtest.tradelog': { en: 'Trade Log', vi: 'Nhật ký lệnh' },

  // Export
  'export.rows': { en: 'rows', vi: 'dòng' },
  'export.csv': { en: '⬇ CSV', vi: '⬇ CSV' },
  'export.html': { en: '⬇ HTML', vi: '⬇ HTML' },

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
