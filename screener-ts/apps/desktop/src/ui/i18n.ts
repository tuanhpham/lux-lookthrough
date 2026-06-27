/**
 * Minimal EN/VI internationalization. `t(key)` resolves to the active language;
 * `setLang` persists the choice and notifies subscribers so views re-render.
 */
type Lang = 'en' | 'vi';

const STRINGS: Record<string, { en: string; vi: string }> = {
  // Brand / nav
  'brand.name': { en: 'The Professional', vi: 'The Professional' },
  'brand.sub': { en: 'Screener for The Professionals', vi: 'Bộ lọc cho dân chuyên nghiệp' },
  'nav.home': { en: 'Home', vi: 'Trang chủ' },
  'nav.picks': { en: 'Top Picks', vi: 'Lựa chọn hàng đầu' },
  'nav.screener': { en: 'Screener', vi: 'Bộ lọc' },
  'nav.watchlist': { en: 'Watchlists', vi: 'Danh sách theo dõi' },
  'nav.sectors': { en: 'Sectors', vi: 'Ngành' },
  'nav.portfolio': { en: 'Paper Trading', vi: 'Giao Dịch Mô Phỏng' },
  'nav.backtest': { en: 'Backtest', vi: 'Backtest' },
  'nav.blog': { en: 'Analysis', vi: 'Phân tích' },
  'nav.playbook': { en: 'Playbook', vi: 'Sổ tay' },
  'nav.learn': { en: 'Learn', vi: 'Tìm hiểu' },
  'nav.about': { en: 'About', vi: 'Giới thiệu' },
  'nav.casestudies': { en: 'Case Studies', vi: 'Hồ sơ Setup' },
  'nav.more': { en: 'More', vi: 'Thêm' },
  'foot.disclaimer': { en: 'Educational use only. Not financial advice.', vi: 'Chỉ dùng cho mục đích học tập. Không phải lời khuyên đầu tư.' },

  // Landing
  'landing.badge': { en: 'Screener for The Professionals', vi: 'Bộ lọc cho dân chuyên nghiệp' },
  'landing.h1a': { en: 'Trade the strongest stocks,', vi: 'Giao dịch những cổ phiếu mạnh nhất,' },
  'landing.h1b': { en: 'in the strongest setups.', vi: 'ở những thiết lập tốt nhất.' },
  'landing.sub': {
    en: 'A professional-grade equity screener built on Qullamaggie methodology. Scan any stock or sector for VCP & episodic-pivot setups, track momentum leaders with a 0–100 quality score, read market regime and sector rotation — then backtest, plan trades and paper-trade — all in one place.',
    vi: 'Bộ lọc cổ phiếu chuyên nghiệp xây dựng trên phương pháp Qullamaggie. Quét bất kỳ mã hay ngành nào để tìm thiết lập VCP & điểm xoay đột biến, theo dõi mã dẫn dắt động lượng qua điểm chất lượng 0–100, đọc bối cảnh thị trường và luân chuyển ngành — rồi backtest, lập kế hoạch và giao dịch mô phỏng — tất cả trong một nơi.',
  },
  'landing.cta': { en: 'Launch the Platform →', vi: 'Vào nền tảng →' },
  'landing.nosignup': { en: 'No sign-up · runs locally', vi: 'Không cần đăng ký · chạy cục bộ' },
  // Strategy strip
  'landing.strat.title': { en: 'Three scanning strategies, one tool', vi: 'Ba chiến lược quét, một công cụ' },
  'landing.strat.qm.t': { en: 'Qullamaggie (QM)', vi: 'Qullamaggie (QM)' },
  'landing.strat.qm.d': { en: 'VCP bases and episodic pivots ranked by a 7-factor quality score. The same setups Minervini-style traders look for every morning.', vi: 'Nền VCP và điểm xoay đột biến xếp hạng theo điểm chất lượng 7 yếu tố. Đúng những thiết lập trader theo phong cách Minervini tìm mỗi sáng.' },
  'landing.strat.mom.t': { en: 'Momentum', vi: 'Momentum' },
  'landing.strat.mom.d': { en: 'Top movers ranked by 1M/3M/6M return and RS vs SPY. Classed Weak → Building → Strong → Explosive so you always know what is running.', vi: 'Mã tăng mạnh nhất xếp hạng theo lợi nhuận 1T/3T/6T và RS so SPY. Phân loại Yếu → Đang xây → Mạnh → Bùng nổ để bạn luôn biết mã nào đang chạy.' },
  'landing.strat.surge.t': { en: 'Surge', vi: 'Surge (bứt tốc)' },
  'landing.strat.surge.d': { en: 'Fresh fast movers only: close held above EMA5 all week AND up >20% in two weeks. The tightest filter — the fewest names, the most immediate momentum.', vi: 'Chỉ mã mới bứt phá: đóng cửa trên EMA5 cả tuần VÀ tăng >20% trong 2 tuần. Bộ lọc chặt nhất — ít mã nhất, động lượng trực tiếp nhất.' },
  // Feature cards
  'landing.f1.t': { en: 'Custom Screener', vi: 'Bộ lọc tùy chỉnh' },
  'landing.f1.d': { en: 'Paste any tickers or click sector chips. Filter by setup type, quality score and momentum tier in real time.', vi: 'Nhập mã hoặc nhấp chip ngành. Lọc theo loại thiết lập, điểm chất lượng và tầng động lượng ngay lập tức.' },
  'landing.f2.t': { en: 'Pro Charts', vi: 'Biểu đồ chuyên nghiệp' },
  'landing.f2.d': { en: 'Candles, EMAs (20/50/150/200), volume bars, and pivot/entry/stop/target levels overlaid precisely on every chart.', vi: 'Nến Nhật, EMA (20/50/150/200), khối lượng và các mức pivot/mua/cắt lỗ/mục tiêu vẽ chính xác trên mọi biểu đồ.' },
  'landing.f3.t': { en: 'Market Regime', vi: 'Bối cảnh thị trường' },
  'landing.f3.d': { en: 'SPY/QQQ define BULL / TRANSITION / BEAR and a risk-on flag. Know when to press and when to stand aside before you even open a chart.', vi: 'SPY/QQQ xác định TĂNG / CHUYỂN TIẾP / GIẢM và cờ risk-on. Biết khi nào nên mạnh tay trước khi mở bất kỳ biểu đồ nào.' },
  'landing.f4.t': { en: 'Sector Rotation', vi: 'Luân chuyển ngành' },
  'landing.f4.d': { en: 'All sectors ranked by 1M/3M return and RS. See exactly where institutional money is flowing — and which sectors are going cold.', vi: 'Toàn bộ ngành xếp hạng theo lợi nhuận 1T/3T và RS. Thấy chính xác dòng tiền tổ chức đang chảy về đâu — và ngành nào đang lạnh đi.' },
  'landing.f5.t': { en: 'Backtest Engine', vi: 'Công cụ Backtest' },
  'landing.f5.d': { en: 'Simulate VCP breakout or momentum rebalancing strategies on historical daily bars. No lookahead. Equity curve, trade log, CAGR, Sharpe and max drawdown in seconds.', vi: 'Mô phỏng chiến lược VCP breakout hay momentum rebalancing trên dữ liệu ngày lịch sử. Không nhìn trước. Đường vốn, nhật ký lệnh, CAGR, Sharpe và max drawdown trong vài giây.' },
  'landing.f6.t': { en: 'Trade Planner', vi: 'Kế hoạch giao dịch' },
  'landing.f6.d': { en: 'Position sizing, entry, stop, target and R:R computed from your account equity and risk % — for every symbol in your watchlist at once.', vi: 'Kích thước vị thế, điểm mua, cắt lỗ, mục tiêu và R:R tính từ vốn và % rủi ro của bạn — cho toàn bộ mã trong danh sách theo dõi cùng lúc.' },

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
  'wl.refresh': { en: 'Refresh quotes', vi: 'Làm mới giá' },
  'wl.plan': { en: 'Trade Plan', vi: 'Lập kế hoạch' },
  'wl.export': { en: 'Export', vi: 'Xuất' },
  'wl.export.tip': { en: 'Download all watchlists as a JSON backup', vi: 'Tải toàn bộ danh sách dưới dạng JSON' },
  'wl.import': { en: 'Import', vi: 'Nhập' },
  'wl.import.tip': { en: 'Restore watchlists from a JSON backup', vi: 'Khôi phục danh sách từ tệp JSON' },
  'wl.empty': { en: 'No symbols yet — add some above.', vi: 'Chưa có mã — hãy thêm ở trên.' },
  'wl.screenall': { en: 'Screen All', vi: 'Lọc tất cả' },
  // Trade planner
  'wl.plan.title': { en: 'Trade Planner', vi: 'Kế hoạch giao dịch' },
  'wl.plan.equity': { en: 'Account equity', vi: 'Vốn tài khoản' },
  'wl.plan.risk': { en: 'Risk %/trade', vi: 'Rủi ro %/lệnh' },
  'wl.plan.run': { en: '↻ Plan', vi: '↻ Lập kế hoạch' },
  'wl.plan.actionable': { en: 'Actionable', vi: 'Có thể giao dịch' },
  'wl.plan.nosetup': { en: 'No setup', vi: 'Chưa có setup' },
  'wl.plan.entry': { en: 'Entry', vi: 'Mua vào' },
  'wl.plan.stop': { en: 'Stop', vi: 'Dừng lỗ' },
  'wl.plan.target': { en: 'Target', vi: 'Mục tiêu' },
  'wl.plan.shares': { en: 'Shares', vi: 'Số cổ phiếu' },
  'wl.plan.posval': { en: 'Position $', vi: 'Giá trị vị thế' },
  'wl.plan.riskamt': { en: 'Risk $ (pct)', vi: 'Rủi ro $ (%)' },

  // Portfolio
  'pf.title': { en: 'Paper Trading', vi: 'Giao Dịch Mô Phỏng' },
  'pf.sub': { en: 'Independent multi-account strategy testing. Cash, PnL and risk are per account.', vi: 'Thử nghiệm chiến lược đa tài khoản độc lập. Tiền mặt, lãi/lỗ và rủi ro tính riêng cho từng tài khoản.' },

  // Detail modal
  'detail.quality': { en: 'Quality', vi: 'Chất lượng' },
  'detail.analysis': { en: 'Analysis', vi: 'Phân tích' },
  'detail.pricehistory': { en: 'Price History', vi: 'Lịch sử giá' },
  'detail.fundtrend': { en: 'Fundamentals Trend', vi: 'Xu hướng cơ bản' },
  'detail.fundamentals': { en: 'Fundamentals', vi: 'Chỉ số cơ bản' },
  'detail.about': { en: 'About', vi: 'Giới thiệu' },

  // Backtest
  'backtest.title': { en: 'Backtest', vi: 'Backtest' },
  'backtest.sub': { en: 'Simulate trading strategies on historical daily bars.', vi: 'Mô phỏng chiến lược trên dữ liệu ngày lịch sử.' },
  'backtest.note': {
    en: 'Focused backtest: enter 1–10 symbols. Daily bars; no-lookahead. Large universes re-fetch each run (no persistent cache).',
    vi: 'Backtest tập trung: nhập 1–10 mã. Dữ liệu ngày; không nhìn trước. Danh sách lớn sẽ tải lại mỗi lần chạy.',
  },
  'backtest.strategy': { en: 'Strategy', vi: 'Chiến lược' },
  'backtest.strat.vcp': { en: 'VCP Breakout', vi: 'Bứt phá VCP' },
  'backtest.strat.vcp.desc': {
    en: 'Enters when a VCP base forms and arms a buy-stop at the pivot. Exits below EMA20 or on ATR stop. Needs a 30%+ prior advance + 2+ contracting pullbacks — rare on a single stock per year.',
    vi: 'Mua khi nền VCP hình thành và đặt lệnh buy-stop tại pivot. Thoát khi giá phá EMA20 hoặc chạm dừng lỗ ATR. Cần nhịp tăng 30%+ và ≥2 lần co thắt — hiếm trên một mã mỗi năm.',
  },
  'backtest.strat.momentum': { en: 'Momentum Rebalancing', vi: 'Luân chuyển động lượng' },
  'backtest.strat.momentum.desc': {
    en: 'Enters when momentum score ≥65 and price is above EMA50. Exits when score drops below 45 or price breaks the exit EMA. Good for trending stocks over longer periods.',
    vi: 'Mua khi điểm động lượng ≥65 và giá trên EMA50. Thoát khi điểm giảm xuống dưới 45 hoặc giá phá EMA thoát. Phù hợp với mã đang tăng trong xu hướng dài hạn.',
  },
  'backtest.symbols': { en: 'Symbols', vi: 'Mã cổ phiếu' },
  'backtest.period': { en: 'History', vi: 'Lịch sử' },
  'backtest.risk': { en: 'Risk %/trade', vi: 'Rủi ro %/lệnh' },
  'backtest.capital': { en: 'Capital', vi: 'Vốn' },
  'backtest.run': { en: 'Run Backtest', vi: 'Chạy Backtest' },
  'backtest.running': { en: 'Running simulation…', vi: 'Đang mô phỏng…' },
  'backtest.needsymbols': { en: 'Enter at least one symbol.', vi: 'Nhập ít nhất một mã.' },
  'backtest.from': { en: 'From', vi: 'Từ ngày' },
  'backtest.to': { en: 'To', vi: 'Đến ngày' },
  'backtest.baddates': { en: 'From date must be before To date.', vi: 'Ngày bắt đầu phải trước ngày kết thúc.' },
  'backtest.nodata': { en: 'No symbol had enough history. Try a longer period or different symbols.', vi: 'Không mã nào đủ lịch sử. Thử chu kỳ dài hơn hoặc mã khác.' },
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
