/**
 * Minimal EN/VI internationalization. `t(key)` resolves to the active language;
 * `setLang` persists the choice and notifies subscribers so views re-render.
 */
type Lang = 'en' | 'vi';

const STRINGS: Record<string, { en: string; vi: string }> = {
  // Brand / nav
  'brand.name': { en: 'The Professional', vi: 'The Professional' },
  'brand.sub': { en: 'The Platform', vi: 'Nền tảng' },
  'nav.home': { en: 'Home', vi: 'Trang chủ' },
  'nav.picks': { en: 'Top Picks', vi: 'Lựa chọn hàng đầu' },
  'nav.screener': { en: 'Screener', vi: 'Bộ lọc' },
  'nav.watchlist': { en: 'Watchlists', vi: 'Danh sách theo dõi' },
  'nav.sectors': { en: 'Sectors', vi: 'Ngành' },
  'nav.portfolio': { en: 'Portfolio', vi: 'Danh Mục' },
  'nav.backtest': { en: 'Backtest', vi: 'Backtest' },
  'nav.playbook': { en: 'Playbook', vi: 'Sổ tay' },
  'nav.learn': { en: 'Learn', vi: 'Tìm hiểu' },
  'nav.about': { en: 'About', vi: 'Giới thiệu' },
  'nav.casestudies': { en: 'Case Studies', vi: 'Hồ sơ Setup' },
  'nav.calendar': { en: 'Calendar', vi: 'Lịch sự kiện' },
  'nav.scanner': { en: 'Scanner', vi: 'Máy quét' },
  'nav.more': { en: 'More', vi: 'Thêm' },
  'foot.disclaimer': { en: 'Educational use only. Not financial advice.', vi: 'Chỉ dùng cho mục đích học tập. Không phải lời khuyên đầu tư.' },

  // The round button that closes the story, at the end of the last chapter. One
  // word on purpose: it sits inside a 130px circle, uppercase and letter-spaced.
  'story.discover': { en: 'Discover', vi: 'Khám phá' },

  // Landing
  'landing.badge': { en: 'The Platform', vi: 'Nền tảng' },
  'landing.h1a': { en: 'Trade the strongest stocks,', vi: 'Giao dịch những cổ phiếu mạnh nhất,' },
  'landing.h1b': { en: 'in the strongest setups.', vi: 'ở những thiết lập tốt nhất.' },
  'landing.sub': {
    en: 'A professional-grade equity screener built on Qullamaggie methodology. Scan for VCP & episodic-pivot setups, rank momentum leaders with a 0–100 quality score, and read market regime and sector rotation. Then backtest, plan trades, paper-trade a graded portfolio, and journal your setups — synced across every device, no account required.',
    vi: 'Bộ lọc cổ phiếu chuyên nghiệp xây dựng trên phương pháp Qullamaggie. Quét thiết lập VCP & điểm xoay đột biến, xếp hạng mã động lượng qua điểm chất lượng 0–100, đọc bối cảnh thị trường và luân chuyển ngành. Rồi backtest, lập kế hoạch, giao dịch mô phỏng danh mục có xếp hạng, và ghi nhật ký setup — đồng bộ trên mọi thiết bị, không cần tài khoản.',
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
  'landing.f7.t': { en: 'Paper Portfolio', vi: 'Danh mục mô phỏng' },
  'landing.f7.d': { en: 'Multi-account paper trading with live quotes: buy/sell, tag each entry with a setup and A–D grade, and track PnL, risk, win rate and a live equity curve in € or $.', vi: 'Giao dịch mô phỏng nhiều tài khoản với giá trực tiếp: mua/bán, gắn thẻ mỗi lệnh với thiết lập và hạng A–D, theo dõi lãi/lỗ, rủi ro, tỷ lệ thắng và đường vốn trực tiếp theo € hoặc $.' },
  'landing.f8.t': { en: 'Case Studies', vi: 'Hồ sơ Setup' },
  'landing.f8.d': { en: 'A journal of past setups: pin a stock to a key date with levels, dated catalysts and rich notes, get an annotated chart, and export a standalone PDF report.', vi: 'Nhật ký các thiết lập trong quá khứ: ghim mã vào ngày then chốt kèm các mức, chất xúc tác có ngày và ghi chú, xem biểu đồ chú thích, và xuất báo cáo PDF độc lập.' },
  'landing.f9.t': { en: 'Time Machine', vi: 'Cỗ máy thời gian' },
  'landing.f9.d': { en: 'Point-in-time screening: pick any past date and screen, chart and paper-trade exactly as the market looked then — no lookahead. Perfect for studying real setups.', vi: 'Lọc theo thời điểm: chọn bất kỳ ngày quá khứ nào và lọc, vẽ biểu đồ, giao dịch mô phỏng đúng như thị trường lúc đó — không nhìn trước. Hoàn hảo để nghiên cứu các thiết lập thật.' },
  'landing.f10.t': { en: 'Syncs Everywhere', vi: 'Đồng bộ mọi nơi' },
  'landing.f10.d': { en: 'Your watchlists, portfolios and case studies follow you across devices with a private access code — no account, no email, no tracking.', vi: 'Danh sách theo dõi, danh mục và hồ sơ setup của bạn đi theo trên mọi thiết bị qua mã truy cập riêng — không tài khoản, không email, không theo dõi.' },

  // Picks
  'picks.title': { en: 'Top Picks', vi: 'Lựa chọn hàng đầu' },
  'picks.sub': { en: 'Qullamaggie setups and momentum leaders, auto-ranked across the universe.', vi: 'Thiết lập Qullamaggie và mã dẫn dắt động lượng, tự động xếp hạng trên toàn vũ trụ cổ phiếu.' },
  'picks.qm': { en: 'Qullamaggie', vi: 'Qullamaggie' },
  'picks.momentumscan': { en: 'Momentum', vi: 'Động lượng' },
  'picks.surge': { en: 'Surge', vi: 'Bứt tốc' },
  'picks.volume': { en: 'Volume', vi: 'Khối lượng' },
  'picks.vol.period': { en: 'Volume period', vi: 'Kỳ khối lượng' },
  'picks.vol.minavgvol': { en: 'Min Peak Vol', vi: 'KL đỉnh tối thiểu' },
  'picks.vol.period.1w': { en: '1 Week', vi: '1 tuần' },
  'picks.vol.period.1m': { en: '1 Month', vi: '1 tháng' },
  'picks.vol.period.3m': { en: '3 Months', vi: '3 tháng' },
  'picks.vol.ratio': { en: 'Vol Ratio', vi: 'Tỷ lệ KL' },
  'picks.vol.peak': { en: 'Peak Vol', vi: 'KL đỉnh' },
  'picks.vol.baseline': { en: 'Baseline Avg Vol', vi: 'KL nền' },
  'picks.vol.sector': { en: 'Sector ΔVol%', vi: 'ΔVol% ngành' },
  'picks.prefilter': { en: 'Momentum pre-filter', vi: 'Lọc động lượng trước' },
  'picks.minprice': { en: 'Min Price', vi: 'Giá tối thiểu' },
  'picks.broad': { en: 'Broad universe', vi: 'Toàn thị trường' },
  'picks.strategy': { en: 'Strategy', vi: 'Chiến lược' },
  'picks.filter': { en: 'Filter', vi: 'Lọc' },
  'picks.asof': { en: 'As of', vi: 'Tính đến' },
  'picks.run': { en: 'Run scan', vi: 'Chạy quét' },
  'picks.market': { en: 'Market', vi: 'Thị trường' },
  'picks.market.us': { en: 'US', vi: 'Mỹ' },
  'picks.market.vn': { en: 'Vietnam', vi: 'Việt Nam' },
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
  'wl.plan.possize': { en: 'Position size', vi: 'Cỡ vị thế' },
  'wl.plan.custom': { en: 'Custom', vi: 'Tùy chỉnh' },
  'wl.plan.useacct': { en: 'Use account cash', vi: 'Dùng tiền tài khoản' },
  'wl.plan.manualeq': { en: 'Manual equity', vi: 'Vốn thủ công' },
  'wl.plan.eqfromacct': {
    en: 'From the chosen account — edit it there',
    vi: 'Lấy từ tài khoản đã chọn — sửa ở tài khoản đó',
  },
  // The Buy form's plan half. The grade is an OVERRIDE now that the checklist scores the
  // trade, and the label has to say so — a box labelled "Rating" invites the user to pick
  // the letter the app just spent 26 criteria computing.
  'pf.buy.gradeover': { en: 'Grade (override)', vi: 'Hạng (ghi đè)' },
  'pf.buy.gradeauto': { en: '— Auto (from score)', vi: '— Tự động (theo điểm)' },
  'pf.buy.plannote': { en: 'Plan note — saved with the trade', vi: 'Ghi chú kế hoạch — lưu cùng giao dịch' },
  // The tooltip says the plan survives, because that is what makes this button safe to press:
  // the checklist and the note are stored under the symbol, not in the form.
  'pf.buy.reset': { en: 'Reset', vi: 'Bỏ chọn' },
  'pf.buy.resettitle': {
    en: 'Clear the form and unchoose this stock. The trade plan itself is kept — type the ticker again and its checklist, grade and note come back.',
    vi: 'Xóa trắng form và bỏ chọn mã này. Kế hoạch giao dịch vẫn được giữ — nhập lại mã là bảng tiêu chí, hạng và ghi chú trở lại.',
  },
  // The transaction row's plan button. "Frozen" / "lúc mua" is the whole point of the label:
  // this is not the symbol's current plan, it is the one the trade was actually made on, and a
  // user who expects to edit it here would read the document as if it were still live.
  'pf.tx.plan': { en: 'Plan', vi: 'Kế hoạch' },
  'pf.tx.plantitle': {
    en: 'Show the trade plan this position was bought on — the checklist, grade and levels as they stood at the buy, unchanged since',
    vi: 'Xem kế hoạch giao dịch đã dùng để mua vị thế này — bảng tiêu chí, hạng và các mức giá đúng như lúc mua, không đổi từ đó',
  },
  'pf.tx.planttl': { en: 'Trade plan at the buy', vi: 'Kế hoạch lúc mua' },
  'pf.tx.planprint': { en: 'Print / Save PDF', vi: 'In / Lưu PDF' },
  'pf.tx.planclose': { en: 'Close', vi: 'Đóng' },
  // Not `pf.buy.*` or `wl.plan.*`: the Buy form and the Trade Planner print the same report
  // from the same module, so one label rather than two that can drift apart.
  'plan.print': { en: 'Print plan', vi: 'In kế hoạch' },
  'plan.printtitle': {
    en: 'Download this trade plan as a standalone HTML file — open it and print to save as PDF',
    vi: 'Tải kế hoạch giao dịch này thành một tệp HTML độc lập — mở ra rồi in để lưu PDF',
  },
  // The user's "doi khi minh chi muon xem thoi chu khong muon print": the same document, read
  // on screen. The viewer carries its own print button, so this is not a lesser version of it.
  'plan.view': { en: 'View plan', vi: 'Xem kế hoạch' },
  'plan.viewtitle': {
    en: 'Read the full trade plan on screen — with a print button, if you want it after all',
    vi: 'Đọc toàn bộ kế hoạch giao dịch trên màn hình — có nút in ở trong, nếu cuối cùng bạn vẫn muốn in',
  },
  'plan.viewttl': { en: 'Trade plan', vi: 'Kế hoạch giao dịch' },
  'wl.plan.cfg': { en: 'Playbook', vi: 'Cẩm nang' },
  'wl.plan.cfgtitle': {
    en: 'Change the playbook’s numbers: stops, targets, size per setup, and where A/B/C fall',
    vi: 'Đổi các con số của cẩm nang: cắt lỗ, mục tiêu, cỡ vị thế theo từng thiết lập, và hai đường A/B/C',
  },
  'wl.plan.nocash': {
    en: 'Not enough cash: needs {need} but only {have} available (short {over}). Reduce the position size or shares.',
    vi: 'Không đủ tiền: cần {need} nhưng chỉ có {have} (thiếu {over}). Giảm cỡ vị thế hoặc số cổ phiếu.',
  },
  'wl.plan.riskpos': { en: 'Risk $ (of pos.)', vi: 'Rủi ro $ (theo vị thế)' },
  'wl.plan.riskeq': { en: 'Risk % of equity', vi: 'Rủi ro % vốn' },
  'wl.plan.note': { en: 'Note', vi: 'Ghi chú' },
  'wl.plan.noteph': { en: 'Plan notes — trigger, invalidation, context…', vi: 'Ghi chú kế hoạch — điều kiện, ngưỡng hủy, bối cảnh…' },
  // The playbook half of the planner: which rule row, and how much conviction.
  'wl.plan.setup': { en: 'Setup', vi: 'Loại thiết lập' },
  'wl.plan.nosetupopt': { en: '— none', vi: '— chưa chọn' },
  // 'wl.plan.grade' and 'wl.plan.nograde' were removed with the manual A–D dropdown. The
  // old blank option read "— none (full size)", which is now actively wrong: leaving the
  // override blank does not mean ungraded, it means "use the score".
  // The grade is now SCORED from criteria, so the dropdown is an override rather than the
  // input. The wording has to say so, or the user will read the blank option as "ungraded"
  // and wonder why the card shows a B.
  'wl.plan.gradeover': { en: 'Grade override', vi: 'Ghi đè xếp hạng' },
  'wl.plan.gradeauto': { en: '— use the score', vi: '— dùng điểm tự tính' },
  'wl.plan.gradesize': { en: '{pct}% of full size', vi: '{pct}% cỡ đầy đủ' },
  'wl.plan.gradeoverridden': { en: 'overridden (scored {auto})', vi: 'đã ghi đè (điểm ra {auto})' },
  'wl.plan.criteria': { en: 'Criteria {n}/{m}', vi: 'Tiêu chí {n}/{m}' },
  'wl.plan.gradethin': {
    en: 'Not enough measured yet to set a letter — planned at full size. Pick a setup and an entry.',
    vi: 'Chưa đủ dữ liệu để xếp hạng — tính theo cỡ đầy đủ. Hãy chọn thiết lập và giá vào.',
  },
  'wl.plan.critfoot': {
    en: 'Ticks are measured from the bars and are not editable. The questions below them are yours — click an answer again to unset it; unanswered questions do not count against the score.',
    vi: 'Dấu tích do app tự đo từ dữ liệu giá, không sửa được. Các câu hỏi là của bạn — bấm lại để bỏ chọn; câu chưa trả lời không bị tính là sai.',
  },
  'wl.plan.yes': { en: 'Yes', vi: 'Có' },
  'wl.plan.no': { en: 'No', vi: 'Không' },
  // The subtraction, in the user's own framing. Shown on the card and not only in the
  // Note, because a grade that changes the size without showing its arithmetic is
  // indistinguishable from a grade that does nothing.
  'wl.plan.gradedfrom': {
    en: 'Full size {full} → {pct} for this grade → {now}',
    vi: 'Cỡ đầy đủ {full} → {pct} theo hạng này → {now}',
  },
  'wl.plan.frombook': { en: 'Playbook', vi: 'Cẩm nang' },
  // Was `usdlevels`, a fixed sentence: the boxes now follow the €/$ toggle, because the user
  // buys these names in euros most of the time and a stop has to be typeable in the currency
  // the broker quotes.
  'wl.plan.levelccy': {
    en: 'Entry, stop and target are in {ccy}',
    vi: 'Giá vào, cắt lỗ và mục tiêu tính bằng {ccy}',
  },
  'wl.plan.ccytitle': {
    en: 'Switch this panel between € and $ — the prices in the boxes convert with it, at the trade date’s rate',
    vi: 'Đổi bảng này giữa € và $ — giá trong các ô cũng được đổi theo, theo tỷ giá của ngày giao dịch',
  },
  'wl.plan.ccynorate': {
    en: 'No EUR/USD rate loaded yet, so nothing can be converted — press ↻ Update on the Portfolio tab',
    vi: 'Chưa nạp tỷ giá EUR/USD nên chưa thể quy đổi — bấm ↻ Cập nhật ở tab Danh Mục',
  },
  'wl.plan.picksetup': {
    en: 'Pick a <b>Setup</b> to get the stop, the target and the share count from the playbook.',
    vi: 'Chọn <b>Loại thiết lập</b> để cẩm nang tính cắt lỗ, mục tiêu và số cổ.',
  },
  'wl.plan.nolevels': {
    en: 'No stop level below this entry for this setup — set the stop yourself.',
    vi: 'Không có mốc cắt lỗ nào dưới giá vào cho thiết lập này — hãy tự đặt cắt lỗ.',
  },
  'wl.plan.costbasis': {
    en: 'no prices cached for this account, so equity is at cost — run ↻ Update on Portfolio',
    vi: 'tài khoản này chưa có giá nào được nạp, nên vốn đang tính theo giá mua — bấm ↻ Cập nhật ở tab Danh Mục',
  },
  'wl.plan.manualnote': {
    en: 'no account chosen, so the size assumes no closed trades yet (the learning rung)',
    vi: 'chưa chọn tài khoản, nên cỡ vị thế tính như chưa đóng lệnh nào (bậc đang học)',
  },

  // Opening the planner for one name. Two buttons, two places, same panel: the ✕ on a
  // watchlist row's 📋 and the 📋 on the stock page.
  'wl.plan.one': { en: 'Trade plan for this stock only', vi: 'Kế hoạch riêng cho mã này' },
  'wl.plan.here': { en: 'Plan this stock here on this page', vi: 'Lập kế hoạch cho mã này ngay tại trang này' },

  // The trade date. Everything downstream hangs off it: the FX rate used to convert the
  // fill, the date the lot is booked under, and the date printed on the frozen report.
  'wl.plan.date': { en: 'Trade date', vi: 'Ngày giao dịch' },
  'wl.plan.datetitle': {
    en: 'Leave as today, or pick a past day — the whole plan is then recomputed as it stood on that date (and the EUR/USD rate of that day is the one used).',
    vi: 'Để nguyên ngày hôm nay, hoặc chọn một ngày trong quá khứ — cả kế hoạch sẽ được tính lại đúng như ngày đó (và tỷ giá EUR/USD của ngày đó được dùng).',
  },

  // ── Planning a past date ──────────────────────────────────────────────────
  // What CAN be replayed is everything the bars decide; what CANNOT is the money, because
  // there is no history of the account's equity to go back to. Both are said out loud.
  'wl.plan.asof': { en: 'As of {date}', vi: 'Tính theo ngày {date}' },
  'wl.plan.asofbars': {
    en: 'setup, levels, grade and chart are computed from the bars up to that date — nothing after it is used',
    vi: 'mẫu hình, mức giá, hạng và biểu đồ đều tính từ dữ liệu đến hết ngày đó — không dùng gì sau ngày đó',
  },
  'wl.plan.asofmoney': {
    en: '⚠ money is TODAY’S: equity, cash, open risk and the position count come from the account as it stands now',
    vi: '⚠ tiền là của HÔM NAY: vốn, tiền mặt, rủi ro đang mở và số vị thế lấy từ tài khoản hiện tại',
  },
  'wl.plan.asofnoregime': {
    en: '⚠ no market read for that date (SPY history does not reach back far enough), so the two market criteria stay unanswered',
    vi: '⚠ không đọc được trạng thái thị trường ngày đó (dữ liệu SPY chưa đủ dài), nên hai tiêu chí về thị trường để trống',
  },

  // ── Asking ChatGPT the criteria the app cannot measure ────────────────────
  // Five of the twenty-six criteria need reading rather than measuring, and they are the ones
  // that sit unanswered and cost the trade its letter. The button asks exactly those, as of the
  // trade date, and takes the reply back in — see `portfolio/criteriaAsk.ts`.
  'wl.plan.ask': { en: 'Ask ChatGPT', vi: 'Hỏi ChatGPT' },
  'wl.plan.asktitle': {
    en: 'Ask ChatGPT the checklist questions this app cannot measure — as of the trade date — then paste the answer back to tick them and file the summary in the note',
    vi: 'Hỏi ChatGPT các tiêu chí mà ứng dụng không tự đo được — tính theo ngày giao dịch — rồi dán câu trả lời về để tự tích và lưu đoạn tóm tắt vào ghi chú',
  },
  'wl.plan.ask.ttl': {
    en: 'The questions the app cannot measure',
    vi: 'Những tiêu chí ứng dụng không tự đo được',
  },
  'wl.plan.ask.lead': {
    en: 'ChatGPT is asked to research these using only what existed on or before <b>{date}</b>, answer each YES / NO / UNKNOWN with its evidence, and finish with a summary. Paste the reply below and the answers are ticked for you.',
    vi: 'ChatGPT được yêu cầu chỉ dùng thông tin có trước hoặc trong ngày <b>{date}</b>, trả lời từng câu CÓ / KHÔNG / KHÔNG RÕ kèm bằng chứng, và kết bằng một đoạn tóm tắt. Dán câu trả lời xuống dưới là các ô được tự tích.',
  },
  'wl.plan.ask.paste': { en: 'Paste ChatGPT’s answer', vi: 'Dán câu trả lời của ChatGPT' },
  'wl.plan.ask.pasteph': {
    en: 'Paste the whole reply — the ANSWERS block, the explanations and the summary.',
    vi: 'Dán toàn bộ câu trả lời — khối ANSWERS, phần giải thích và đoạn tóm tắt.',
  },
  'wl.plan.ask.apply': { en: 'Apply answers', vi: 'Áp dụng câu trả lời' },
  'wl.plan.ask.cancel': { en: 'Cancel', vi: 'Hủy' },
  // Refusing to close rather than swallowing the paste: see `openCriteriaAsk`.
  'wl.plan.ask.none': {
    en: 'Nothing recognised in that text. The reply needs a line per question, like: [epsGrowth]: YES — EPS +41% in the Feb quarter',
    vi: 'Không đọc được gì trong đoạn đó. Câu trả lời cần mỗi câu hỏi một dòng, dạng: [epsGrowth]: YES — EPS +41% trong quý tháng 2',
  },
  'wl.plan.ask.applied': { en: '{n} answered ✓', vi: 'Đã nhận {n} câu ✓' },
  // The heading written into the plan's note above the answers and the summary.
  'wl.plan.ask.notehead': {
    en: 'Criteria research — as of {date}',
    vi: 'Nghiên cứu tiêu chí — tính theo ngày {date}',
  },

  // Buying straight from the plan.
  'wl.plan.buy': { en: '✓ Buy this plan', vi: '✓ Mua theo kế hoạch' },
  'wl.plan.buyready': {
    en: 'Buy {shares} {sym} into {acct} on {date}',
    vi: 'Mua {shares} {sym} vào {acct} ngày {date}',
  },
  'wl.plan.buyno.card': { en: 'plan not computed yet', vi: 'kế hoạch chưa được tính' },
  'wl.plan.buyno.acct': { en: 'choose an account first', vi: 'hãy chọn tài khoản trước' },
  'wl.plan.buyno.entry': { en: 'set an entry price', vi: 'hãy đặt giá vào' },
  'wl.plan.buyno.shares': { en: 'the share count is zero', vi: 'số cổ phiếu đang bằng 0' },
  'wl.plan.buyno.stop': {
    en: 'the stop is at or above the entry',
    vi: 'cắt lỗ đang bằng hoặc cao hơn giá vào',
  },
  // A refusal, not a silent conversion at 1 — see `plannedPrice` in portfolio/writes.ts.
  'wl.plan.buyno.norate': {
    en: 'no EUR/USD rate for this date — run ↻ Update on Portfolio, then try again',
    vi: 'chưa có tỷ giá EUR/USD cho ngày này — bấm ↻ Cập nhật ở tab Danh Mục rồi thử lại',
  },
  'wl.plan.buyno.gone': {
    en: 'that account no longer exists — pick another',
    vi: 'tài khoản đó không còn nữa — hãy chọn tài khoản khác',
  },
  'wl.plan.buyttl': { en: 'Record this buy?', vi: 'Ghi nhận lệnh mua này?' },
  'wl.plan.buyacct': { en: 'Account', vi: 'Tài khoản' },
  'wl.plan.buycost': { en: 'Cost', vi: 'Chi phí' },
  'wl.plan.buycash': { en: 'Cash after', vi: 'Tiền mặt còn lại' },
  'wl.plan.buyrate': { en: 'Rate used', vi: 'Tỷ giá dùng' },
  'wl.plan.buygrade': { en: 'Setup · grade', vi: 'Thiết lập · hạng' },
  'wl.plan.buyok': { en: '✓ Record the buy', vi: '✓ Ghi nhận lệnh mua' },
  'wl.plan.buycancel': { en: 'Cancel', vi: 'Hủy' },
  'wl.plan.buydone': { en: '✓ Recorded into {acct}', vi: '✓ Đã ghi vào {acct}' },

  // Portfolio
  'pf.title': { en: 'Portfolio', vi: 'Danh Mục' },
  'pf.sub': { en: 'Independent multi-account strategy testing. Cash, PnL and risk are per account.', vi: 'Thử nghiệm chiến lược đa tài khoản độc lập. Tiền mặt, lãi/lỗ và rủi ro tính riêng cho từng tài khoản.' },
  'pf.sub.overview': { en: 'Overview across all accounts. To update prices or clear cache, switch to an individual account.', vi: 'Tổng quan tất cả tài khoản. Để cập nhật giá hoặc xóa bộ nhớ đệm, chuyển sang tài khoản riêng.' },
  'pf.overview': { en: 'Overview', vi: 'Tổng quan' },
  'pf.update': { en: '↻ Update', vi: '↻ Cập nhật' },
  'pf.updateall': { en: '↻ Update All', vi: '↻ Cập nhật tất cả' },
  'pf.clearcache': { en: '↺ Clear', vi: '↺ Xóa cache' },
  'pf.newacct': { en: '＋ New account', vi: '＋ Tài khoản mới' },
  'pf.editacct': { en: '✎ Edit account', vi: '✎ Sửa tài khoản' },
  'pf.delacct': { en: '✕ Delete account', vi: '✕ Xóa tài khoản' },
  'pf.selectacct': { en: 'Select account…', vi: 'Chọn tài khoản…' },
  'pf.clickacct': { en: 'Click an account name to open it.', vi: 'Nhấn tên tài khoản để mở.' },
  'pf.addacct.hint': { en: 'Add another account (＋) to compare strategies side by side.', vi: 'Thêm tài khoản (＋) để so sánh chiến lược.' },
  'pf.updating': { en: 'Updating', vi: 'Đang cập nhật' },
  'pf.updated.all': { en: 'accounts updated', vi: 'tài khoản đã cập nhật' },
  // The automatic refresh. It says which close it went to get, because the whole
  // point is that the reader can trust the numbers without pressing anything.
  'pf.auto.running': { en: 'Getting the close of', vi: 'Đang lấy giá đóng cửa ngày' },
  'pf.auto.done': { en: 'Prices as of', vi: 'Giá đến ngày' },
  'pf.sec.openpos': { en: 'Open Positions', vi: 'Vị thế đang mở' },
  'pf.sec.openpos.hint': { en: 'click a ticker to open its chart', vi: 'nhấp mã để xem biểu đồ' },
  'pf.sec.txhistory': { en: 'Transaction History', vi: 'Lịch sử giao dịch' },
  'pf.sec.orders': { en: 'Pending Orders', vi: 'Lệnh chờ' },
  'pf.sec.buy': { en: 'Buy / Sell', vi: 'Mua / Bán' },
  'pf.col.ticker': { en: 'Ticker', vi: 'Mã' },
  'pf.col.shares': { en: 'Shares', vi: 'Số CP' },
  'pf.col.avgcost': { en: 'Avg cost', vi: 'Giá TB' },
  'pf.col.last': { en: 'Last', vi: 'Giá hiện tại' },
  'pf.col.value': { en: 'Value', vi: 'Giá trị' },
  'pf.col.unrealpnl': { en: 'Unreal. P&L', vi: 'Lãi/lỗ chưa thực' },
  'pf.col.risk': { en: 'Risk', vi: 'Rủi ro' },
  'pf.col.rmult': { en: 'R-mult.', vi: 'Bội R' },
  'pf.riskfree': { en: 'Free', vi: 'An toàn' },
  'pf.kpi.invested': { en: 'Invested', vi: 'Đã đầu tư' },
  'pf.col.stop': { en: 'Stop', vi: 'Dừng lỗ' },
  'pf.col.target': { en: 'Target', vi: 'Mục tiêu' },
  'pf.col.days': { en: 'Days', vi: 'Ngày' },
  'pf.col.conc': { en: 'Conc.%', vi: 'Tập trung%' },
  'pf.col.actions': { en: 'Actions', vi: 'Thao tác' },
  'pf.col.account': { en: 'Account', vi: 'Tài khoản' },
  'pf.col.return': { en: 'Return %', vi: 'Lợi nhuận %' },
  'pf.col.twr': { en: 'TWR %', vi: 'TWR %' },
  'pf.col.equity2': { en: 'Equity', vi: 'Vốn' },
  'pf.col.winrate': { en: 'Win rate', vi: 'Tỷ lệ thắng' },
  'pf.col.avgr': { en: 'Avg R', vi: 'R trung bình' },
  'pf.col.maxdd': { en: 'Max DD', vi: 'Sụt giảm tối đa' },
  'pf.col.openrisk': { en: 'Open risk %', vi: 'Rủi ro mở %' },
  'pf.col.open': { en: 'Open', vi: 'Đang mở' },
  'pf.col.closed': { en: 'Closed', vi: 'Đã đóng' },
  'pf.col.status': { en: 'Status', vi: 'Trạng thái' },
  'pf.col.buyprice': { en: 'Buy Price', vi: 'Giá mua' },
  'pf.col.sellprice': { en: 'Sell Price', vi: 'Giá bán' },
  'pf.col.buydate': { en: 'Buy Date', vi: 'Ngày mua' },
  'pf.col.selldate': { en: 'Sell Date', vi: 'Ngày bán' },
  'pf.col.held': { en: 'Held', vi: 'Nắm giữ' },
  'pf.col.realizedpnl': { en: 'Realized PnL', vi: 'Lãi/lỗ thực' },
  'pf.col.pnlpct': { en: 'PnL %', vi: '% Lãi/lỗ' },
  'pf.col.weight': { en: 'Weight', vi: 'Tỷ trọng' },
  'pf.col.pnlpctcap': { en: 'PnL % cap.', vi: '% L/L vốn' },
  'pf.col.note': { en: 'Note', vi: 'Ghi chú' },
  'pf.col.setup': { en: 'Setup', vi: 'Thiết lập' },
  'pf.setup.title': { en: 'Setup & rating', vi: 'Thiết lập & xếp hạng' },
  'pf.setup.type': { en: 'Setup type', vi: 'Loại thiết lập' },
  'pf.setup.rating': { en: 'Rating', vi: 'Xếp hạng' },
  'pf.note.placeholder': { en: 'Note (optional) — add details later with ✎', vi: 'Ghi chú (tùy chọn) — thêm chi tiết sau với ✎' },
  'pf.note.label': { en: 'Note (optional)', vi: 'Ghi chú (tùy chọn)' },
  'pf.note.title': { en: 'Transaction note', vi: 'Ghi chú giao dịch' },
  'pf.note.add': { en: 'Add note', vi: 'Thêm ghi chú' },
  'pf.note.edit': { en: 'Edit note', vi: 'Sửa ghi chú' },
  'pf.cash.adjust': { en: '± Cash', vi: '± Tiền mặt' },
  'pf.cash.adjusttitle': { en: 'Deposit or withdraw cash (dated)', vi: 'Nạp hoặc rút tiền (theo ngày)' },
  'pf.cash.type': { en: 'Type', vi: 'Loại' },
  'pf.cash.deposit': { en: 'Deposit', vi: 'Nạp tiền' },
  'pf.cash.withdraw': { en: 'Withdrawal', vi: 'Rút tiền' },
  'pf.cash.amount': { en: 'Amount', vi: 'Số tiền' },
  'pf.cash.date': { en: 'Date', vi: 'Ngày' },
  'pf.cash.note': { en: 'Note (optional)', vi: 'Ghi chú (tùy chọn)' },
  'pf.cash.invalid': { en: 'Enter a positive amount (e.g. 5000).', vi: 'Nhập số tiền dương (vd 5000).' },
  'pf.stat.initialcap': { en: 'Initial capital', vi: 'Vốn ban đầu' },
  'pf.stat.contributed': { en: 'Capital in', vi: 'Vốn đã nạp' },
  'pf.stat.twr': { en: 'TWR', vi: 'TWR' },
  'pf.stat.annualized': { en: 'p.a.', vi: '/năm' },
  'pf.stat.avgr': { en: 'Avg R', vi: 'R trung bình' },
  'pf.stat.maxdd': { en: 'Max drawdown', vi: 'Sụt giảm tối đa' },
  'pf.stat.hold': { en: 'Avg holding period', vi: 'Thời gian nắm giữ TB' },
  'pf.stat.totalcap': { en: 'Total capital', vi: 'Tổng vốn' },
  'pf.stat.totalequity': { en: 'Total equity', vi: 'Tổng vốn cổ phần' },
  'pf.stat.totalcash': { en: 'Total cash', vi: 'Tổng tiền mặt' },
  'pf.stat.totalpnl': { en: 'Total PnL', vi: 'Tổng lãi/lỗ' },
  'pf.stat.best': { en: 'Best', vi: 'Tốt nhất' },
  'pf.stat.worst': { en: 'Worst', vi: 'Kém nhất' },
  'pf.stat.avgwinrate': { en: 'Avg win rate', vi: 'Tỷ lệ thắng TB' },
  'pf.stat.openclosed': { en: 'Open / Closed', vi: 'Đang mở / Đã đóng' },
  'pf.stat.avghold': { en: 'Avg holding', vi: 'Nắm giữ TB' },
  'pf.nopos': { en: 'No open positions.', vi: 'Không có vị thế đang mở.' },
  'pf.btn.stop': { en: 'Stop', vi: 'Dừng lỗ' },
  'pf.btn.target': { en: 'Target', vi: 'Mục tiêu' },
  'pf.btn.sell': { en: 'Sell', vi: 'Bán' },
  'pf.btn.chart': { en: 'Chart', vi: 'Biểu đồ' },
  'pf.buy.ticker': { en: 'Ticker', vi: 'Mã CP' },
  'pf.buy.shares': { en: 'Shares', vi: 'Số lượng' },
  'pf.buy.price': { en: 'Price', vi: 'Giá' },
  'pf.buy.date': { en: 'Date', vi: 'Ngày' },
  'pf.buy.stop': { en: 'Stop', vi: 'Dừng lỗ' },
  'pf.buy.target': { en: 'Target', vi: 'Mục tiêu' },
  'pf.buy.btn': { en: 'Buy', vi: 'Mua' },
  'pf.sell.btn': { en: 'Sell', vi: 'Bán' },
  'pf.stat.equity': { en: 'Equity', vi: 'Vốn' },
  'pf.stat.cash': { en: 'Cash', vi: 'Tiền mặt' },
  'pf.stat.invested': { en: 'Invested', vi: 'Đang đầu tư' },
  'pf.stat.pnl': { en: 'Total P&L', vi: 'Tổng lãi/lỗ' },
  'pf.stat.realizedpnl': { en: 'Realized P&L', vi: 'Lãi/lỗ đã thực' },
  'pf.stat.unrealpnl': { en: 'Unrealized P&L', vi: 'Lãi/lỗ chưa thực' },
  'pf.stat.openpos': { en: 'Open positions', vi: 'Vị thế mở' },
  'pf.stat.winrate': { en: 'Win rate', vi: 'Tỷ lệ thắng' },
  'pf.stat.avgwin': { en: 'Avg win', vi: 'Lãi TB' },
  'pf.stat.avgloss': { en: 'Avg loss', vi: 'Lỗ TB' },
  'pf.stat.expectancy': { en: 'Expectancy', vi: 'Kỳ vọng' },
  'pf.stat.risk': { en: 'Total risk', vi: 'Rủi ro tổng' },
  'pf.chart.equity': { en: 'Equity', vi: 'Vốn' },
  'pf.chart.candle': { en: 'Candle', vi: 'Nến' },
  'pf.chart.twr': { en: 'TWR %', vi: 'TWR %' },
  'pf.chart.twr.title': {
    en: 'Time-weighted return — deposits and withdrawals removed, so only market moves show',
    vi: 'Lợi nhuận theo thời gian — đã loại nạp/rút tiền, chỉ còn biến động thị trường',
  },
  'pf.nodata': { en: 'No data yet — click Update first', vi: 'Chưa có dữ liệu — nhấn Cập nhật' },
  'pf.nodata.overview': { en: 'No data yet — update individual accounts first', vi: 'Chưa có dữ liệu — cập nhật từng tài khoản trước' },
  'pf.loading': { en: 'Loading…', vi: 'Đang tải…' },
  'pf.failload': { en: 'Failed to load data', vi: 'Không tải được dữ liệu' },
  'pf.unavailable': { en: 'Chart unavailable', vi: 'Biểu đồ không khả dụng' },
  'pf.overview.combined': { en: 'Combined Portfolio', vi: 'Danh mục kết hợp' },
  'pf.overview.compare': { en: 'Account Comparison', vi: 'So sánh tài khoản' },

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

  // Calendar (catalysts)
  'cal.title': { en: 'Event Calendar', vi: 'Lịch sự kiện' },
  'cal.sub': {
    en: 'Earnings and market-moving events for the next 30 days.',
    vi: 'Lịch công bố kết quả và các sự kiện tác động giá trong 30 ngày tới.',
  },
  'cal.refresh': { en: 'Refresh', vi: 'Làm mới' },
  'cal.building': { en: 'Building calendar', vi: 'Đang dựng lịch' },
  'cal.upcoming': { en: 'Next 7 days', vi: '7 ngày tới' },
  'cal.noevents': { en: 'No events', vi: 'Không có sự kiện' },
  'cal.nodata': { en: 'No data yet', vi: 'Chưa có dữ liệu' },
  'cal.nodata.tip': {
    en: 'The source calendar does not reach this far ahead yet — this is missing data, not an empty day.',
    vi: 'Nguồn dữ liệu chưa có thông tin tới ngày này — đây là thiếu dữ liệu, không phải ngày trống.',
  },
  'cal.partial': { en: 'partial data', vi: 'dữ liệu chưa đầy đủ' },
  'cal.scope.all': { en: 'All market', vi: 'Toàn thị trường' },
  'cal.scope.watchlist': { en: 'Watchlists', vi: 'Danh sách theo dõi' },
  'cal.scope.portfolio': { en: 'Portfolio', vi: 'Danh mục' },
  'cal.mincap': { en: 'Min. market cap', vi: 'Vốn hóa tối thiểu' },
  'cal.kind.earnings': { en: 'Earnings', vi: 'Kết quả KD' },
  'cal.kind.dividend': { en: 'Ex-dividend', vi: 'Ngày GDKHQ' },
  'cal.kind.split': { en: 'Splits', vi: 'Chia tách' },
  'cal.kind.ipo': { en: 'IPOs', vi: 'IPO' },
  'cal.kind.lockup': { en: 'Lockup expiry', vi: 'Hết hạn lockup' },
  'cal.kind.macro': { en: 'Macro', vi: 'Vĩ mô' },
  'cal.kind.expiry': { en: 'Expiry', vi: 'Đáo hạn' },
  'cal.kind.rebalance': { en: 'Rebalance', vi: 'Tái cân bằng' },
  'cal.kind.custom': { en: 'My events', vi: 'Sự kiện của tôi' },
  'cal.timing.bmo': { en: 'Before open', vi: 'Trước giờ mở' },
  'cal.timing.amc': { en: 'After close', vi: 'Sau giờ đóng' },
  'cal.timing.intraday': { en: 'Intraday', vi: 'Trong phiên' },
  'cal.timing.unknown': { en: 'Time TBA', vi: 'Chưa rõ giờ' },
  'cal.estimated': { en: 'Estimated date', vi: 'Ngày dự kiến' },
  'cal.estimated.tip': {
    en: 'The source has not confirmed this date — it can still move by days.',
    vi: 'Nguồn chưa xác nhận ngày này — vẫn có thể thay đổi vài ngày.',
  },
  'cal.today': { en: 'Today', vi: 'Hôm nay' },
  'cal.myrisk': { en: 'My event risk', vi: 'Rủi ro sự kiện của tôi' },
  'cal.myrisk.none': {
    en: 'No holdings report in this window.',
    vi: 'Không có vị thế nào công bố trong khoảng này.',
  },
  'cal.ofcapital': { en: 'of capital', vi: 'trên tổng vốn' },
  'cal.holdings': { en: 'holdings', vi: 'vị thế' },
  'cal.addevent': { en: 'Add event', vi: 'Thêm sự kiện' },
  'cal.event.date': { en: 'Date', vi: 'Ngày' },
  'cal.event.symbol': { en: 'Symbol (optional)', vi: 'Mã (không bắt buộc)' },
  'cal.event.title': { en: 'What happens', vi: 'Nội dung sự kiện' },
  'cal.event.note': { en: 'Note', vi: 'Ghi chú' },
  'cal.delete': { en: 'Delete', vi: 'Xóa' },
  'cal.failed': {
    en: 'Could not load the calendar. Check the connection and retry.',
    vi: 'Không tải được lịch. Kiểm tra kết nối và thử lại.',
  },
  // The sweep is ~60 requests, so it is rationed to once a day. When today's run
  // already happened but left no snapshot behind, re-running automatically would
  // spend that budget again on every tab open — so we say so and offer ↻.
  'cal.swept.nosnapshot': {
    en: 'Already swept today, but the snapshot could not be stored. Use ↻ to sweep again.',
    vi: 'Hôm nay đã quét rồi nhưng không lưu được dữ liệu. Bấm ↻ để quét lại.',
  },
  // Saving is a SEPARATE failure from fetching: the calendar below is complete
  // and usable, it just won't be remembered for tomorrow. Saying "check the
  // connection" here would send the user after the wrong problem entirely.
  'cal.nosave': {
    en: 'Calendar loaded, but could not be saved — it will reload next time.',
    vi: 'Đã tải lịch nhưng không lưu được — lần sau sẽ tải lại.',
  },
  'cal.nosave.full': {
    en: 'Calendar loaded, but browser storage is full so it was not saved. Everything below is up to date.',
    vi: 'Đã tải lịch nhưng bộ nhớ trình duyệt đã đầy nên không lưu được. Dữ liệu bên dưới vẫn là mới nhất.',
  },

  // Calendar — the three analytical sections (attention / VCP / mean reversion)
  // Column headers. 'cal.event.symbol' is the *form field* label ("Symbol
  // (optional)") and reads wrong in a table head, so these are separate.
  'col.symbol': { en: 'Symbol', vi: 'Mã' },
  'col.price': { en: 'Price', vi: 'Giá' },
  'cal.watch.title': { en: 'What to watch', vi: 'Cần chú ý' },
  'cal.watch.sub': {
    en: 'Three reads over the curated US universe, from one scan a day: what needs attention now, what is consolidating, and what has fallen too far below its mean.',
    vi: 'Ba góc nhìn trên danh mục cổ phiếu Mỹ đã chọn lọc, từ một lần quét mỗi ngày: mã nào cần chú ý ngay, mã nào đang tích lũy, và mã nào đã rơi quá sâu dưới đường trung bình.',
  },
  'cal.watch.run': { en: 'Run the scan', vi: 'Chạy quét' },
  'cal.watch.rerun': { en: 'Re-scan', vi: 'Quét lại' },
  'cal.watch.stop': { en: 'Stop', vi: 'Dừng' },
  'cal.watch.prompt': {
    en: 'These sections need one pass over ~540 stocks. It is not run automatically — press Run once and the result is kept for the rest of the day, on every device.',
    vi: 'Các phần này cần quét qua khoảng 540 mã. Hệ thống không tự chạy — bấm Chạy quét một lần, kết quả giữ nguyên cả ngày trên mọi thiết bị.',
  },
  'cal.watch.scanning': { en: 'Scanning', vi: 'Đang quét' },
  'cal.watch.stopped': { en: 'Scan stopped.', vi: 'Đã dừng quét.' },
  'cal.watch.failed': {
    en: 'The scan could not finish. Check the connection and try again.',
    vi: 'Không hoàn tất được lần quét. Kiểm tra kết nối rồi thử lại.',
  },

  'cal.top.title': { en: 'Top 7 to watch', vi: '7 mã cần chú ý nhất' },
  'cal.top.sub': {
    en: 'Ranked by what is coming (dated catalysts) against where the stock is (setup, momentum) — and whether you own it.',
    vi: 'Xếp hạng theo sự kiện sắp tới (có ngày cụ thể) kết hợp với trạng thái cổ phiếu (thiết lập, động lượng) — và bạn có đang giữ mã đó hay không.',
  },
  'cal.top.none': {
    en: 'Nothing stands out in this window.',
    vi: 'Không có mã nào nổi bật trong khoảng thời gian này.',
  },
  'cal.top.score': { en: 'Attention', vi: 'Mức chú ý' },
  'cal.top.next': { en: 'Next event', vi: 'Sự kiện tới' },
  'cal.top.why': { en: 'Why', vi: 'Vì sao' },
  // Reason chips — one per AttentionReason tag.
  'cal.why.held': { en: 'You hold it', vi: 'Bạn đang giữ' },
  'cal.why.watchlist': { en: 'On a watchlist', vi: 'Trong danh sách theo dõi' },
  'cal.why.earnings-soon': { en: 'Reports soon', vi: 'Sắp báo cáo KD' },
  'cal.why.event-soon': { en: 'Event soon', vi: 'Sắp có sự kiện' },
  'cal.why.high-impact': { en: 'High impact', vi: 'Tác động lớn' },
  'cal.why.multi-event': { en: 'Several events', vi: 'Nhiều sự kiện' },
  'cal.why.strong-setup': { en: 'Strong setup', vi: 'Thiết lập tốt' },
  'cal.why.near-pivot': { en: 'At the pivot', vi: 'Sát pivot' },
  'cal.why.strong-momentum': { en: 'Strong momentum', vi: 'Động lượng mạnh' },
  'cal.why.unconfirmed-date': { en: 'Date unconfirmed', vi: 'Ngày chưa xác nhận' },

  'cal.vcp.title': { en: 'Consolidating after an advance (VCP)', vi: 'Đang tích lũy sau nhịp tăng (VCP)' },
  'cal.vcp.sub': {
    en: 'A real prior advance, now contracting: tighter pullbacks, drying volume, falling range. The base is the setup; the pivot is the trigger.',
    vi: 'Đã có nhịp tăng thật, giờ đang co thắt: các nhịp điều chỉnh nhỏ dần, khối lượng cạn dần, biên độ hẹp lại. Nền giá là thiết lập; pivot là điểm kích hoạt.',
  },
  'cal.vcp.none': {
    en: 'No VCP bases in the scanned universe.',
    vi: 'Không có nền VCP nào trong danh mục đã quét.',
  },
  'cal.vcp.advance': { en: 'Prior advance', vi: 'Nhịp tăng trước' },
  'cal.vcp.contractions': { en: 'Contractions', vi: 'Số lần co thắt' },
  'cal.vcp.depth': { en: 'Base depth', vi: 'Độ sâu nền' },
  'cal.vcp.topivot': { en: 'To pivot', vi: 'Tới pivot' },
  'cal.vcp.abovepivot': { en: 'above pivot', vi: 'trên pivot' },
  'cal.vcp.notrend': { en: 'Trend filter not passed', vi: 'Chưa đạt bộ lọc xu hướng' },
  'cal.vcp.notrend.tip': {
    en: 'The base is forming, but the EMA stack is not yet aligned. Worth watching early — not yet worth buying.',
    vi: 'Nền giá đang hình thành nhưng các đường EMA chưa xếp đúng thứ tự. Đáng theo dõi sớm — chưa đáng mua.',
  },

  'cal.mr.title': { en: 'Stretched below the mean (Mean Reversion)', vi: 'Giãn quá xa dưới trung bình (Mean Reversion)' },
  'cal.mr.sub': {
    en: 'An intact long-term uptrend, pulled unusually far below its 50-day mean. The uptrend is a hard requirement: oversold in a downtrend is a falling knife, not a setup.',
    vi: 'Xu hướng dài hạn còn nguyên vẹn nhưng giá bị kéo xuống quá xa dưới đường trung bình 50 ngày. Xu hướng tăng là điều kiện bắt buộc: quá bán trong xu hướng giảm là dao rơi, không phải thiết lập.',
  },
  'cal.mr.none': {
    en: 'No mean-reversion candidates in the scanned universe.',
    vi: 'Không có mã nào phù hợp mean reversion trong danh mục đã quét.',
  },
  'cal.mr.stretch': { en: 'Below mean', vi: 'Dưới trung bình' },
  'cal.mr.drawdown': { en: 'Off the high', vi: 'So với đỉnh' },
  'cal.mr.target': { en: 'Target (EMA50)', vi: 'Mục tiêu (EMA50)' },
  'cal.mr.invalidation': { en: 'Invalid below', vi: 'Vô hiệu nếu dưới' },
  'cal.mr.upside': { en: 'Upside', vi: 'Tiềm năng' },
  'cal.mr.stabilizing': { en: 'Stabilizing', vi: 'Đang ổn định lại' },
  'cal.mr.stabilizing.tip': {
    en: 'A higher low, an up close, or a strong close. Early evidence the fall is being absorbed — never required, because the point is to see the setup before it turns.',
    vi: 'Đáy cao hơn, đóng cửa tăng, hoặc đóng cửa ở vùng cao trong phiên. Dấu hiệu sớm cho thấy lực bán đang được hấp thụ — không bắt buộc, vì mục đích là thấy thiết lập trước khi nó đảo chiều.',
  },
  'cal.mr.falling.tip': {
    en: 'Every row here closed above a RISING 200-day EMA. That gate is what separates a pullback from a collapse.',
    vi: 'Mọi mã ở đây đều đóng cửa trên đường EMA200 ĐANG ĐI LÊN. Đúng điều kiện đó mới phân biệt được nhịp điều chỉnh với một cú sụp.',
  },

  // Stock modal — research prompts
  'prompts.title': { en: 'Research prompts', vi: 'Prompt nghiên cứu' },
  'prompts.sub': {
    en: 'Four questions worth asking, each pre-filled with the numbers measured above. Copy one, or send it straight to your GPT.',
    vi: 'Bốn câu hỏi đáng đặt ra, mỗi cái đã điền sẵn các số liệu đo được ở trên. Chép lại, hoặc gửi thẳng sang GPT của bạn.',
  },
  'prompts.copy': { en: 'Copy', vi: 'Chép' },
  'prompts.copied': { en: 'Copied ✓', vi: 'Đã chép ✓' },
  'prompts.ask': { en: 'Ask ChatGPT', vi: 'Hỏi ChatGPT' },
  // Deliberately NOT "Sent". Whether the prompt actually runs depends on the
  // extension being installed, which this code cannot see — claiming "Sent" would
  // have the user waiting for an answer to a question still sitting in a composer.
  'prompts.sent': { en: 'Opening →', vi: 'Đang mở →' },
  'prompts.toolong': { en: 'Copied — paste it', vi: 'Đã chép — hãy dán' },
  'prompts.ask.hint': {
    en: 'Opens ChatGPT with the question in the URL, and copies it as a backup. A custom GPT will not run it on its own — OpenAI gives them no API — so install the extension in extension/ to have it filled and sent for you. Without it, just paste.',
    vi: 'Mở ChatGPT với câu hỏi nằm trong URL, đồng thời chép lại để dự phòng. Custom GPT sẽ không tự chạy — OpenAI không cho chúng API — nên hãy cài extension trong thư mục extension/ để nó tự điền và gửi. Không có extension thì bạn chỉ cần dán.',
  },
  'prompts.show': { en: 'Show prompt', vi: 'Xem prompt' },
  'prompts.hide': { en: 'Hide prompt', vi: 'Ẩn prompt' },
  'prompts.gpt.set': { en: 'Set my GPT', vi: 'Đặt GPT của tôi' },
  'prompts.gpt.title': { en: 'Your custom GPT', vi: 'Custom GPT của bạn' },
  'prompts.gpt.label': { en: 'ChatGPT link', vi: 'Đường link ChatGPT' },
  'prompts.gpt.help': {
    en: 'Paste the link to your own GPT (chatgpt.com/g/…) so “Ask ChatGPT” opens it, signed in to your account. Leave empty for plain ChatGPT. Only https links on chatgpt.com are accepted.',
    vi: 'Dán link GPT của riêng bạn (chatgpt.com/g/…) để nút “Hỏi ChatGPT” mở đúng GPT đó, với tài khoản bạn đã đăng nhập. Để trống thì dùng ChatGPT thường. Chỉ nhận link https trên chatgpt.com.',
  },
  'prompts.gpt.rejected': {
    en: 'That link was not accepted — only https links on chatgpt.com or chat.openai.com are used.',
    vi: 'Link đó không được chấp nhận — chỉ dùng link https trên chatgpt.com hoặc chat.openai.com.',
  },
  'prompts.gpt.custom': { en: 'Your GPT', vi: 'GPT của bạn' },
  'prompts.disclaimer': {
    en: 'These prompts hand an LLM the numbers measured here; they do not verify its answer. Every one of them asks the model to name what would disprove it — read that part.',
    vi: 'Các prompt này đưa số liệu đo được ở đây cho LLM; chúng không kiểm chứng câu trả lời. Mỗi prompt đều yêu cầu mô hình nêu điều gì sẽ phủ định kết luận của nó — hãy đọc phần đó.',
  },

  // The assistant — API connection settings. `ai.*` is the assistant; `prompts.*`
  // above stays with Ask ChatGPT, which is a different, key-free feature.
  'ai.menu': { en: 'Assistant', vi: 'Trợ lý' },
  'ai.settings.title': { en: 'Assistant API key', vi: 'Khoá API cho trợ lý' },
  'ai.provider': { en: 'Provider', vi: 'Nhà cung cấp' },
  'ai.key': { en: 'API key', vi: 'Khoá API' },
  'ai.key.placeholder': { en: 'paste your key', vi: 'dán khoá của bạn' },
  'ai.key.clear': {
    en: 'Leave empty to remove the stored key.',
    vi: 'Để trống để xoá khoá đã lưu.',
  },
  'ai.model': { en: 'Model', vi: 'Mô hình' },
  'ai.model.manual': {
    en: 'Model id (type it — the list could not be loaded)',
    vi: 'Mã mô hình (hãy tự nhập — không tải được danh sách)',
  },
  'ai.baseurl': { en: 'Endpoint (API root, e.g. …/v1)', vi: 'Endpoint (gốc API, ví dụ …/v1)' },
  // Named after the request field itself rather than described in prose: the person
  // who needs to change this is reading a provider's 400 that quotes that exact name.
  'ai.tokenfield': { en: 'Output-limit field', vi: 'Trường giới hạn đầu ra' },
  // Not offered as a nicety: some gateways answer a non-streamed request with
  // "stream must be set to true" and nothing else, so this is a compatibility
  // switch that happens to also make answers appear as they are written.
  'ai.stream': { en: 'Streaming', vi: 'Truyền dần' },
  'ai.stream.on': { en: 'On — required by some gateways', vi: 'Bật — một số cổng yêu cầu' },
  'ai.stream.off': { en: 'Off', vi: 'Tắt' },
  'ai.price.in': { en: 'Price in, $ / 1M tokens', vi: 'Giá vào, $ / 1M token' },
  'ai.price.out': { en: 'Price out, $ / 1M tokens', vi: 'Giá ra, $ / 1M token' },
  'ai.price.help': {
    en: 'Only used for the cost estimate. Left empty, the assistant shows tokens but no dollars — better than a figure taken from a price list that has since changed.',
    vi: 'Chỉ dùng để ước tính chi phí. Để trống thì trợ lý hiển thị số token mà không quy ra tiền — vẫn tốt hơn một con số lấy từ bảng giá đã đổi.',
  },
  'ai.key.local': {
    en: 'The key is saved on THIS DEVICE only — it is never synced and never stored on the server. It is saved in the clear, so treat it like any key pasted into a web tool: scope it, and rotate it if the device is shared.',
    vi: 'Khoá chỉ được lưu TRÊN THIẾT BỊ NÀY — không đồng bộ, không lưu trên máy chủ. Khoá lưu dạng văn bản thường, nên hãy đối xử như mọi khoá dán vào một công cụ web: giới hạn quyền và đổi khoá nếu máy dùng chung.',
  },
  'ai.provider.switch': {
    en: 'Provider changed — press Save to reload with that provider’s key and models.',
    vi: 'Đã đổi nhà cung cấp — nhấn Lưu để tải lại khoá và danh sách mô hình của nhà đó.',
  },
  'ai.getkey': { en: 'Get a key', vi: 'Lấy khoá' },
  'ai.pricing': { en: 'Prices', vi: 'Bảng giá' },
  'ai.test.ok': { en: 'Connected ✓', vi: 'Đã kết nối ✓' },
  'ai.test.badkey': {
    en: 'The provider rejected that key. Check it was copied whole, and that the account is active.',
    vi: 'Nhà cung cấp từ chối khoá đó. Kiểm tra đã chép đủ chưa, và tài khoản còn hoạt động không.',
  },
  'ai.test.noaccess': {
    en: 'The key works but that model is not available on this account. Pick another model.',
    vi: 'Khoá dùng được nhưng tài khoản không có mô hình đó. Hãy chọn mô hình khác.',
  },
  'ai.test.unreachable': {
    en: 'Could not reach the provider. Check the connection and try again.',
    vi: 'Không kết nối được tới nhà cung cấp. Kiểm tra mạng và thử lại.',
  },
  // For the same thrown fetch as above, when the provider is one the page calls
  // directly. Its own sentence because "check the connection" is then wrong advice:
  // the network is fine and the browser is refusing a cross-origin call. See
  // `unreachableCause` in core for why that can only be inferred, never read.
  'ai.test.blocked': {
    en:
      'The browser blocked this, and it is not a network problem. A custom or local endpoint is called straight from the page, so it has to answer with a CORS header allowing this site — most gateways answer with none, and the browser then reports only "Failed to fetch". The same key and URL work in the desktop app. To use this endpoint on the web it has to be added to the app\'s relay list, which is a code change.',
    vi:
      'Trình duyệt đã chặn, và đây không phải lỗi mạng. Endpoint tự nhập hoặc chạy nội bộ được gọi trực tiếp từ trang, nên nó phải trả về header CORS cho phép trang này — phần lớn cổng trung gian không trả, và trình duyệt chỉ báo đúng một câu "Failed to fetch". Cùng khoá và URL đó vẫn chạy trong app máy tính. Muốn dùng endpoint này trên web thì phải thêm nó vào danh sách relay của app, tức là phải sửa code.',
  },
  'ai.model.missing': {
    en: 'No model set. Add a key first, or type a model id.',
    vi: 'Chưa chọn mô hình. Hãy thêm khoá trước, hoặc tự nhập mã mô hình.',
  },
  'ai.free': {
    en: 'No key yet? Ask ChatGPT keeps working without one — it runs on your ChatGPT subscription and costs no tokens.',
    vi: 'Chưa có khoá? Tính năng Hỏi ChatGPT vẫn dùng được — nó chạy bằng gói ChatGPT của bạn và không tốn token.',
  },

  // Assistant panel
  'chat.title': { en: 'Assistant', vi: 'Trợ lý' },
  'chat.open': { en: 'Assistant', vi: 'Trợ lý' },
  'chat.close': { en: 'Close', vi: 'Đóng' },
  'chat.new': { en: 'New conversation', vi: 'Hội thoại mới' },
  'chat.send': { en: 'Send', vi: 'Gửi' },
  'chat.placeholder': {
    en: 'Ask about your portfolio…',
    vi: 'Hỏi về danh mục của bạn…',
  },
  'chat.askgpt': { en: 'Ask ChatGPT', vi: 'Hỏi ChatGPT' },
  'chat.askgpt.help': {
    en: 'Open ChatGPT with your question and your numbers already filled in — costs no API tokens.',
    vi: 'Mở ChatGPT với câu hỏi và số liệu của bạn điền sẵn — không tốn token API.',
  },
  'chat.meter.help': {
    en: 'Tokens used in this conversation, and the estimated cost when the price is known.',
    vi: 'Số token đã dùng trong hội thoại này, và chi phí ước tính khi biết giá.',
  },
  'chat.tokens': { en: 'tokens', vi: 'token' },
  'chat.notconfigured': { en: 'No key', vi: 'Chưa có khoá' },
  'chat.thinking': { en: 'Thinking…', vi: 'Đang suy nghĩ…' },
  'chat.error': { en: 'That did not work', vi: 'Không thực hiện được' },
  'chat.retry': { en: 'Try again', vi: 'Thử lại' },
  'chat.truncated': { en: 'cut off', vi: 'bị cắt' },
  'chat.local.badge': { en: 'from your data', vi: 'từ dữ liệu của bạn' },
  'chat.disclaimer': {
    en: 'Reads your portfolio, and can fill in a trade for you — nothing is saved until you approve the card it shows you.',
    vi: 'Đọc danh mục của bạn, và có thể điền giao dịch giúp bạn — không có gì được lưu cho tới khi bạn xác nhận thẻ mà trợ lý hiện ra.',
  },
  'chat.needkey': {
    en: 'That one needs a model. Add an API key in settings, or press Ask ChatGPT to send it to your ChatGPT subscription for free.',
    vi: 'Câu này cần đến mô hình. Hãy thêm khoá API trong cài đặt, hoặc nhấn Hỏi ChatGPT để gửi sang gói ChatGPT của bạn miễn phí.',
  },
  'chat.empty.title': {
    en: 'Ask about your accounts, positions, trades or a price.',
    vi: 'Hỏi về tài khoản, vị thế, giao dịch hoặc giá.',
  },
  'chat.empty.hint': {
    en: 'Everyday lookups are answered straight from your data, for free. Anything needing judgement goes to the model.',
    vi: 'Các câu tra cứu thường ngày được trả lời trực tiếp từ dữ liệu của bạn, miễn phí. Những gì cần nhận định sẽ gửi tới mô hình.',
  },
  'chat.empty.nokey': {
    en: 'No key yet — the lookups below still work, straight from your data. For anything else, press Ask ChatGPT.',
    vi: 'Chưa có khoá — các câu tra cứu dưới đây vẫn dùng được, lấy trực tiếp từ dữ liệu của bạn. Với những câu khác, hãy nhấn Hỏi ChatGPT.',
  },
  'chat.s1': { en: 'What do I own?', vi: 'Tôi đang giữ gì?' },
  'chat.s2': { en: 'How much cash do I have?', vi: 'Tôi còn bao nhiêu tiền mặt?' },
  'chat.s3': { en: 'How am I doing?', vi: 'Hiệu suất của tôi?' },
  'chat.s4': { en: 'My trade history', vi: 'Lịch sử giao dịch' },

  // The approval card. The one screen between a sentence and a stored trade, so it
  // names the account and shows the price twice when a currency was converted — the
  // user has to be able to catch "232.50, read as dollars" before pressing the button.
  'chat.write.title.create_account': { en: 'Create account', vi: 'Tạo tài khoản' },
  'chat.write.title.record_buy': { en: 'Record a buy', vi: 'Ghi lệnh mua' },
  'chat.write.title.record_sell': { en: 'Record a sell', vi: 'Ghi lệnh bán' },
  'chat.write.title.set_stop': { en: 'Move the stop', vi: 'Đổi mức cắt lỗ' },
  'chat.write.title.record_cash_flow': { en: 'Cash movement', vi: 'Nạp / rút tiền' },
  'chat.write.title.place_order': { en: 'Place an order', vi: 'Đặt lệnh chờ' },
  'chat.write.account': { en: 'Account', vi: 'Tài khoản' },
  'chat.write.shares': { en: 'Shares', vi: 'Số lượng' },
  'chat.write.ticker': { en: 'Symbol', vi: 'Mã' },
  'chat.write.price': { en: 'Price', vi: 'Giá' },
  'chat.write.cost': { en: 'Cost', vi: 'Tổng tiền' },
  'chat.write.proceeds': { en: 'Proceeds', vi: 'Tiền thu về' },
  'chat.write.date': { en: 'Date', vi: 'Ngày' },
  'chat.write.stop': { en: 'Stop', vi: 'Cắt lỗ' },
  'chat.write.previous': { en: 'Now', vi: 'Hiện tại' },
  'chat.write.lots': { en: 'Open lots', vi: 'Lô đang mở' },
  'chat.write.target': { en: 'Target', vi: 'Mục tiêu' },
  'chat.write.setup': { en: 'Setup', vi: 'Mẫu hình' },
  'chat.write.rating': { en: 'Rating', vi: 'Xếp loại' },
  'chat.write.note': { en: 'Note', vi: 'Ghi chú' },
  'chat.write.type': { en: 'Type', vi: 'Loại' },
  'chat.write.threshold': { en: 'Trigger', vi: 'Giá kích hoạt' },
  'chat.write.capital': { en: 'Starting capital', vi: 'Vốn ban đầu' },
  'chat.write.currency': { en: 'Currency', vi: 'Tiền tệ' },
  'chat.write.deposit': { en: 'Deposit', vi: 'Nạp vào' },
  'chat.write.withdraw': { en: 'Withdraw', vi: 'Rút ra' },
  'chat.write.of': { en: 'of', vi: 'trong' },
  'chat.write.hint': {
    en: 'Check it, then save. Nothing is written until you do.',
    vi: 'Kiểm tra lại rồi lưu. Chưa lưu gì cho tới khi bạn xác nhận.',
  },
  'chat.write.accept': { en: 'Save it', vi: 'Lưu lại' },
  'chat.write.decline': { en: 'No', vi: 'Không' },
  'chat.write.accepted': { en: 'Saved to your portfolio.', vi: 'Đã lưu vào danh mục.' },
  'chat.write.declined': { en: 'Not saved.', vi: 'Không lưu.' },
  'chat.write.recent': {
    en: 'Recorded from chat on this device',
    vi: 'Đã ghi từ cửa sổ chat trên máy này',
  },

  // Assistant answers built from local data
  'chat.local.stale': {
    en: 'No prices fetched yet this session, so last price falls back to cost — press Update on the Portfolio tab.',
    vi: 'Phiên này chưa tải giá, nên giá cuối tạm lấy theo giá mua — hãy nhấn Cập nhật ở tab Danh mục.',
  },
  'chat.local.noaccounts': {
    en: 'There are no accounts yet. Create one on the Portfolio tab.',
    vi: 'Chưa có tài khoản nào. Hãy tạo một tài khoản ở tab Danh mục.',
  },
  'chat.local.open': { en: 'open', vi: 'đang mở' },
  'chat.local.positions': { en: 'positions', vi: 'vị thế' },
  'chat.local.equity': { en: 'Equity', vi: 'Vốn chủ' },
  'chat.local.cash': { en: 'cash', vi: 'tiền mặt' },
  'chat.local.totalpnl': { en: 'Total PnL', vi: 'Tổng lãi/lỗ' },
  'chat.local.oncapitalin': { en: 'on capital in', vi: 'trên vốn đã nạp' },
  'chat.local.twr': { en: 'Time-weighted return', vi: 'Lợi nhuận theo thời gian (TWR)' },
  'chat.local.pa': { en: 'p.a.', vi: '/năm' },
  'chat.local.unrealized': { en: 'Unrealized', vi: 'Chưa thực hiện' },
  'chat.local.realized': { en: 'Realized', vi: 'Đã thực hiện' },
  'chat.local.risk': { en: 'Open risk', vi: 'Rủi ro đang mở' },
  'chat.local.ofequity': { en: 'of equity', vi: 'vốn chủ' },
  'chat.local.trades': { en: 'Trades', vi: 'Giao dịch' },
  'chat.local.open2': { en: 'open', vi: 'đang mở' },
  'chat.local.closed': { en: 'closed', vi: 'đã đóng' },
  'chat.local.winrate': { en: 'win rate', vi: 'tỷ lệ thắng' },
  'chat.local.nostop': { en: 'Positions with no stop', vi: 'Vị thế chưa có stop' },
  'chat.local.nopositions': {
    en: 'No open positions in this account.',
    vi: 'Tài khoản này không có vị thế nào đang mở.',
  },
  'chat.local.nostop2': { en: 'no stop', vi: 'chưa có stop' },
  'chat.local.riskfree': { en: 'risk-free', vi: 'hết rủi ro' },
  'chat.local.stop': { en: 'stop', vi: 'stop' },
  'chat.local.notrades': {
    en: 'No trades recorded in this account.',
    vi: 'Tài khoản này chưa ghi giao dịch nào.',
  },
  'chat.local.showing': { en: 'showing', vi: 'đang hiển thị' },
  'chat.local.noquote': { en: 'no price', vi: 'không có giá' },
  'chat.local.day': { en: 'day', vi: 'ngày' },
  'chat.local.belowhigh': { en: 'below high', vi: 'dưới đỉnh' },

  // Scanner tab — read-only view of the Python scanner on the Oracle VM.
  //
  // Column headers ARE translated, under `scan.col.*`. They used to be left in
  // English on the grounds that they name fields in the scanner's own database,
  // which is true of `ADV20` or `RVol` but was not true of `Reason`, `Count` or
  // `Close` — those are ordinary words, and leaving them made the page read as
  // half-finished next to every other tab. Field-name headers stay as they are.
  'scan.title': { en: 'Scanner', vi: 'Máy quét' },
  'scan.sub': {
    en: 'Live state of the alert bot: its watch list, why the rest of the market was rejected, and what it alerted today. Read-only — the bot runs on its own machine and pushes these snapshots out.',
    vi: 'Trạng thái của bot cảnh báo: danh sách theo dõi, lý do phần còn lại của thị trường bị loại, và những gì nó đã báo hôm nay. Chỉ đọc — bot chạy trên máy riêng và tự đẩy các bản chụp này lên.',
  },
  'scan.needcode': {
    en: 'The scanner reads through the same access code as sync. Set one to see it.',
    vi: 'Máy quét dùng chung mã truy cập với đồng bộ. Đặt mã để xem.',
  },
  'scan.setcode': { en: 'Set access code', vi: 'Đặt mã truy cập' },
  'scan.refresh': { en: 'Refresh', vi: 'Tải lại' },
  'scan.loading': { en: 'Reading', vi: 'Đang đọc' },
  'scan.ok': { en: 'Healthy', vi: 'Bình thường' },
  'scan.issues': { en: 'to check', vi: 'cần xem' },
  // The two ages in the status strip. Kept as whole sentences with a slot rather than
  // a label plus a bare number: "read 23h" is ambiguous about which direction the
  // time runs in, and these two are the numbers you decide whether to trust the page
  // by. `snapage` is how old the VM's snapshot is, `readago` is when this browser
  // last asked for it — see `statusStrip`.
  'scan.snapage': { en: 'Snapshot {age} old', vi: 'Bản chụp cũ {age}' },
  'scan.snapwhat': {
    en: 'How long ago the VM last pushed a status snapshot. Everything on this page comes from that moment.',
    vi: 'Lần cuối VM đẩy bản chụp trạng thái lên, cách đây bao lâu. Mọi thứ trên trang này là của thời điểm đó.',
  },
  'scan.readago': { en: 'Read {age} ago', vi: 'Đọc {age} trước' },
  'scan.readwhat': {
    en: 'When this browser last read the snapshots. Reading again does not make the VM push.',
    vi: 'Lần cuối trình duyệt này đọc các bản chụp. Đọc lại không làm VM đẩy dữ liệu mới.',
  },
  'scan.top': { en: 'Back to top', vi: 'Lên đầu trang' },
  'scan.nodata': {
    en: 'Nothing pushed yet. Run `python push.py --all` on the VM.',
    vi: 'Chưa có gì được đẩy lên. Chạy `python push.py --all` trên VM.',
  },
  'scan.nocand': {
    en: 'No watch list. `setups.py --build` has not run, or nothing qualified.',
    vi: 'Không có danh sách theo dõi. `setups.py --build` chưa chạy, hoặc không mã nào đạt.',
  },
  'scan.norej': {
    en: 'No rejection table. It is only built by `push.py --all`, once a night.',
    vi: 'Chưa có bảng lý do bị loại. Bảng này chỉ dựng bởi `push.py --all`, mỗi tối một lần.',
  },
  'scan.noalerts': { en: 'No alerts on the latest day pushed.', vi: 'Không có cảnh báo trong ngày mới nhất được đẩy lên.' },

  // Table column headers. Short by necessity — a table of 15 columns cannot carry
  // sentences — so the meaning lives in the note under each table.
  'scan.col.sym': { en: 'Sym', vi: 'Mã' },
  'scan.col.score': { en: 'Score', vi: 'Điểm' },
  'scan.col.qual': { en: 'Qual', vi: 'Chất lượng' },
  'scan.col.close': { en: 'Close', vi: 'Giá đóng' },
  'scan.col.pivot': { en: 'Pivot', vi: 'Pivot' },
  'scan.col.topivot': { en: 'To pivot', vi: 'Cách pivot' },
  'scan.col.base': { en: 'Base', vi: 'Nền' },
  'scan.col.depth': { en: 'Depth', vi: 'Độ sâu' },
  'scan.col.offhigh': { en: 'Off high', vi: 'Cách đỉnh' },
  'scan.col.sector': { en: 'Sector', vi: 'Ngành' },
  'scan.col.fund': { en: 'Fund', vi: 'Cơ bản' },
  'scan.col.fundok': { en: 'ok', vi: 'đạt' },
  'scan.col.fundno': { en: 'no', vi: 'không' },
  'scan.col.slope': { en: 'Slope', vi: 'Độ dốc' },
  'scan.col.reason': { en: 'Reason', vi: 'Lý do' },
  'scan.col.count': { en: 'Count', vi: 'Số mã' },
  'scan.col.share': { en: 'Share', vi: 'Tỷ lệ' },
  'scan.col.time': { en: 'Time', vi: 'Giờ' },
  'scan.col.kind': { en: 'Kind', vi: 'Loại' },
  'scan.col.note': { en: 'Note', vi: 'Ghi chú' },
  'scan.col.bars': { en: 'bars', vi: 'nến' },
  'scan.col.regime': { en: 'Regime', vi: 'Bối cảnh' },
  'scan.col.volat': { en: 'Vol', vi: 'Biên độ' },
  'scan.col.setups': { en: 'Setups', vi: 'Setup' },
  'scan.col.size': { en: 'Size', vi: 'Cỡ' },
  'scan.sec.playbook': { en: 'Playbook', vi: 'Kịch bản' },

  // Jump links across the top of the page — the tab is nine sections long, and the
  // one you came to read is rarely the first.
  'scan.jump': { en: 'Jump to', vi: 'Đến phần' },

  // One line under each section title, saying what that section answers. Nine
  // uppercase micro-labels in a column told the reader nothing about which of the
  // nine they wanted; a sentence does, and it costs one line.
  'scan.lead.today': {
    en: 'The market regime measured on last night’s close, and the playbook cell it puts you in.',
    vi: 'Bối cảnh thị trường đo trên nến chốt đêm qua, và ô playbook mà nó đặt bạn vào.',
  },
  'scan.lead.sectors': {
    en: 'Which of the 11 sector baskets money is rotating into. Only the top three are looked inside.',
    vi: 'Dòng tiền đang chảy vào rổ nào trong 11 rổ ngành. Chỉ ba rổ dẫn đầu được tìm bên trong.',
  },
  'scan.lead.watch': {
    en: 'The trade plan set on last night’s closed bar: what to watch, at what price, stop and size.',
    vi: 'Kế hoạch lệnh đặt trên nến đã chốt đêm qua: canh mã nào, giá nào, cắt lỗ và cỡ bao nhiêu.',
  },
  'scan.lead.night': {
    en: 'Did the chain actually run? Stage by stage with its exit code. An empty table above means nothing until this says the stage ran.',
    vi: 'Chuỗi chạy có chạy thật không? Từng bước kèm mã thoát. Bảng trống ở trên chưa nói được gì nếu bước đó không chạy.',
  },
  'scan.lead.status': {
    en: 'The heartbeat of the VM: session, uptime, how many symbols it scanned, when it last pushed.',
    vi: 'Nhịp tim của VM: phiên, thời gian chạy, quét bao nhiêu mã, đẩy dữ liệu lần cuối lúc nào.',
  },
  'scan.lead.cand': {
    en: 'The raw candidates per setup, before the quality floor cuts them down to a watch list.',
    vi: 'Ứng viên thô theo từng setup, trước khi sàn chất lượng cắt xuống thành danh sách theo dõi.',
  },
  'scan.lead.rejects': {
    en: 'What the filters threw away, and why. A stage that rejects everything is a threshold set wrong.',
    vi: 'Bộ lọc đã loại những gì, và vì sao. Một bước loại sạch mọi thứ là một ngưỡng bị đặt sai.',
  },
  'scan.lead.alerts': {
    en: 'Every alert sent today, with what price did next — 15 minutes, 60 minutes, and the close.',
    vi: 'Mọi cảnh báo đã gửi hôm nay, kèm việc giá đã làm gì sau đó — 15 phút, 60 phút và lúc đóng cửa.',
  },
  'scan.lead.thresholds': {
    en: 'Every number the scanner is currently using, read out of the config.py running on the VM.',
    vi: 'Mọi con số máy quét đang dùng, đọc từ chính file config.py đang chạy trên VM.',
  },

  // Status tiles
  'scan.sec.status': { en: 'Status', vi: 'Trạng thái' },
  'scan.st.session': { en: 'Session', vi: 'Phiên' },
  'scan.st.uptime': { en: 'Uptime', vi: 'Thời gian chạy' },
  'scan.st.scans': { en: 'Scans', vi: 'Số lần quét' },
  'scan.st.errors': { en: 'Errors', vi: 'Lỗi' },
  'scan.st.universe': { en: 'Universe', vi: 'Số mã quét' },
  'scan.st.alerts': { en: 'Alerts today', vi: 'Cảnh báo hôm nay' },
  'scan.st.tracking': { en: 'Tracking', vi: 'Đang theo dõi' },
  'scan.st.pushed': { en: 'Last push', vi: 'Đẩy lần cuối' },
  'scan.st.missing': { en: 'table missing', vi: 'chưa có bảng' },

  // Sections
  'scan.sec.watch': { en: 'Watch list', vi: 'Danh sách theo dõi' },
  'scan.sec.cand': { en: 'Candidates by setup', vi: 'Ứng viên theo setup' },
  'scan.sec.rejects': { en: 'Why rejected', vi: 'Lý do bị loại' },
  'scan.sec.alerts': { en: 'Alerts', vi: 'Cảnh báo' },

  // ── Nightly swing funnel (Stage 1–4) ──────────────────────────────────────
  // Today panel: market regime + the playbook cell in force.
  'scan.sec.today': { en: 'Today', vi: 'Hôm nay' },
  'scan.today.none': {
    en: 'No market regime has been measured yet. Run the nightly chain once (nightly.py) — until it does, no stage downstream of it has anything to stand on.',
    vi: 'Chưa đo được bối cảnh thị trường lần nào. Chạy chuỗi buổi sáng một lần (nightly.py) — chưa có nó thì mọi bước phía sau đều không có gì để dựa vào.',
  },
  'scan.today.trend': { en: 'Regime', vi: 'Bối cảnh' },
  'scan.today.vol': { en: 'Volatility', vi: 'Biên độ' },
  'scan.today.setups': { en: 'Playbook', vi: 'Được phép' },
  'scan.today.size': { en: 'Position size', vi: 'Cỡ vị thế' },
  'scan.today.bar': { en: 'Decision bar', vi: 'Nến quyết định' },
  'scan.today.nosize': { en: 'no new entries', vi: 'không vào lệnh mới' },
  'scan.today.nosetup': { en: 'none', vi: 'không có' },
  'scan.today.changed': { en: 'changed from', vi: 'đổi từ' },
  'scan.today.atr': { en: 'ATR vs its own average', vi: 'ATR so với trung bình của chính nó' },

  // Trend / volatility labels. These mirror regime.py's enum, one label per value —
  // the raw value is also shown, because that is what the database holds.
  'scan.trend.UPTREND': { en: 'Uptrend', vi: 'Xu hướng tăng' },
  'scan.trend.UPTREND_UNDER_STRESS': { en: 'Uptrend under stress', vi: 'Xu hướng tăng đang yếu' },
  'scan.trend.RANGE': { en: 'Range', vi: 'Đi ngang' },
  'scan.trend.DOWNTREND': { en: 'Downtrend', vi: 'Xu hướng giảm' },
  'scan.vol.CONTRACTED': { en: 'Contracted', vi: 'Co hẹp' },
  'scan.vol.NORMAL': { en: 'Normal', vi: 'Bình thường' },
  'scan.vol.EXPANDED': { en: 'Expanded', vi: 'Nở rộng' },

  // Sector ranking + rank history chart.
  'scan.sec.sectors': { en: 'Sector ranking', vi: 'Xếp hạng ngành' },
  'scan.sectors.none': {
    en: 'No sector ranking has been stored yet. It is what picks the three baskets Stage 3 looks inside, so the watch list stays empty until it exists.',
    vi: 'Chưa lưu được bảng xếp hạng ngành. Chính nó chọn ba rổ mà bước lọc cổ phiếu tìm bên trong, nên chưa có nó thì danh sách theo dõi vẫn trống.',
  },
  'scan.sectors.defensive': {
    en: 'Defensive sectors are in the top 3 — money is leaving risk. Long setups work worse from here even when the regime still reads as an uptrend.',
    vi: 'Nhóm phòng thủ đã vào top 3 — dòng tiền đang rút khỏi rủi ro. Từ đây các setup mua chạy kém hơn, kể cả khi bối cảnh vẫn đọc ra là xu hướng tăng.',
  },
  'scan.sec.chart': { en: 'Rank history', vi: 'Lịch sử xếp hạng' },
  'scan.chart.note': {
    en: 'Rank 1 is at the top, so a line RISING means money rotating in. Click a ticker to hide its line. A break in a line is a session with no data — not a flat stretch.',
    vi: 'Hạng 1 ở trên cùng, nên đường ĐI LÊN nghĩa là dòng tiền đang chảy vào. Bấm vào mã để ẩn đường của nó. Đường bị ngắt là phiên không có dữ liệu — không phải là đi ngang.',
  },
  'scan.chart.none': { en: 'not enough history yet', vi: 'chưa đủ lịch sử' },
  'scan.chart.sessions': { en: 'sessions', vi: 'phiên' },

  // Swing watch list (the nightly output, distinct from intraday candidates).
  'scan.watch.none': {
    en: 'No stock cleared the quality floor in the top 3 sectors. That is a normal result, not a fault — on most days nothing is worth a new position.',
    vi: 'Không mã nào qua hết sàn chất lượng trong 3 ngành dẫn đầu. Đây là kết quả bình thường, không phải lỗi — phần lớn các ngày không có gì đáng mở vị thế mới.',
  },
  'scan.watch.blocked': {
    en: 'The filter stage did not run, so this table is empty for a reason that has nothing to do with the market. See the run report below.',
    vi: 'Bước lọc không chạy, nên bảng này trống vì một lý do không liên quan gì đến thị trường. Xem báo cáo chuỗi chạy bên dưới.',
  },
  'scan.watch.tv': { en: 'Open in TradingView', vi: 'Mở trong TradingView' },

  // The trade plan computed last night. Column headers stay short on purpose —
  // the note below the table carries the meaning, the header only labels.
  'scan.watch.grp.plan': { en: 'Trade plan (set last night)', vi: 'Kế hoạch lệnh (đặt từ đêm trước)' },
  'scan.watch.grp.ctx': { en: 'Why it is on the list', vi: 'Lý do có trong danh sách' },
  'scan.watch.entry': { en: 'Entry', vi: 'Vào' },
  'scan.watch.togo': { en: 'To entry', vi: 'Cách vào' },
  'scan.watch.stop': { en: 'Stop', vi: 'Cắt lỗ' },
  'scan.watch.target': { en: 'Target', vi: 'Mục tiêu' },
  'scan.watch.sizepct': { en: 'Size', vi: 'Cỡ' },
  'scan.watch.noplan': { en: 'no plan', vi: 'chưa có kế hoạch' },
  'scan.watch.note': {
    en: 'Entry, stop, target and size were all computed from last night\'s closed bar — they do not move during the session. Size is the final figure (risk 0.75% of capital divided by the stop distance, already scaled by the playbook cell), so do not scale it again. "To entry" is how far price has to travel, in per cent and in ATR.',
    vi: 'Điểm vào, cắt lỗ, mục tiêu và cỡ vị thế đều được tính từ nến đã chốt của đêm trước — chúng không đổi trong phiên. Cỡ là con số cuối cùng (rủi ro 0,75% vốn chia cho khoảng cách cắt lỗ, đã nhân hệ số của ô playbook), nên đừng nhân thêm lần nữa. "Cách vào" là khoảng giá còn phải đi, tính theo phần trăm và theo ATR.',
  },

  // Nightly run report.
  'scan.sec.night': { en: 'Nightly run', vi: 'Chuỗi chạy buổi sáng' },
  'scan.night.none': {
    en: 'The nightly chain has never reported a run. Either it is not in cron yet, or push.py cannot read its table.',
    vi: 'Chuỗi chạy buổi sáng chưa báo về lần nào. Hoặc nó chưa vào cron, hoặc push.py không đọc được bảng của nó.',
  },
  'scan.night.last': { en: 'Last run', vi: 'Lần chạy cuối' },
  'scan.night.lastok': { en: 'Last success', vi: 'Thành công gần nhất' },
  'scan.night.never': { en: 'never', vi: 'chưa lần nào' },
  'scan.night.took': { en: 'Duration', vi: 'Thời gian chạy' },
  // Column header, so it has to stay short; the tile above uses the long form.
  'scan.night.sec': { en: 'Took', vi: 'Giây' },
  'scan.night.exit': { en: 'Exit code', vi: 'Mã thoát' },
  'scan.night.stage': { en: 'Stage', vi: 'Bước' },
  'scan.night.detail': { en: 'Result', vi: 'Kết quả' },
  'scan.night.ok': { en: 'ok', vi: 'xong' },
  'scan.night.failed': { en: 'failed', vi: 'lỗi' },
  'scan.night.blocked': { en: 'did not run', vi: 'không chạy' },
  'scan.night.skipped': { en: 'skipped', vi: 'bỏ qua' },
  'scan.night.dry': { en: 'dry run — nothing was written', vi: 'chạy thử — không ghi gì' },
  'scan.night.warn': { en: 'Warnings', vi: 'Cảnh báo' },
  'scan.night.source': { en: 'Data source', vi: 'Nguồn dữ liệu' },
  'scan.night.sourceval': {
    en: 'yfinance daily bars, cached on the VM — delayed, not realtime',
    vi: 'nến ngày từ yfinance, cache trên VM — có độ trễ, không phải thời gian thực',
  },

  // The nightly runbook. Commands are NEVER translated — a translated command is a
  // command that does not run — so only the prose around them has both languages.
  'scan.sec.guide': { en: 'Re-running the nightly', vi: 'Chạy lại chuỗi buổi sáng' },
  'scan.lead.guide': {
    en: 'What to type, in what order, and what to check when it says it finished.',
    vi: 'Gõ gì, theo thứ tự nào, và kiểm lại gì khi nó báo xong.',
  },
  'scan.g.now.none': {
    en: 'No run has ever been reported, so there is nothing to re-run yet — the chain is either not in cron or push.py cannot reach its table. Step 09 below is the cron it belongs in.',
    vi: 'Chưa có lần chạy nào được báo về, nên chưa có gì để chạy lại — hoặc chuỗi chưa vào cron, hoặc push.py không đọc được bảng của nó. Bước 09 dưới đây là dòng cron của nó.',
  },
  'scan.g.now.ok': {
    en: 'The last run finished clean. Re-run it only if you want fresher numbers than the ones above.',
    vi: 'Lần chạy gần nhất sạch. Chỉ chạy lại nếu bạn muốn số mới hơn những gì ở trên.',
  },
  'scan.g.now.fail': {
    en: 'A REQUIRED stage failed, so this page is showing the previous night’s market with today’s date on it. Fix this, then re-run:',
    vi: 'Một bước BẮT BUỘC đã lỗi, nên trang này đang hiển thị thị trường của đêm trước với ngày của hôm nay. Sửa chỗ này rồi chạy lại:',
  },
  'scan.g.now.soft': {
    en: 'An optional stage failed. The night itself ran, so the lists above are good — the run just could not finish reporting:',
    vi: 'Một bước không bắt buộc đã lỗi. Bản thân chuỗi vẫn chạy nên các danh sách ở trên vẫn dùng được — chỉ là nó chưa báo xong:',
  },
  'scan.g.copy': { en: 'Copy', vi: 'Chép' },
  'scan.g.then': {
    en: 'Then press Refresh at the top of this page. The run pushes its new snapshots at the end, and this page only reads them — Refresh cannot start anything on the VM.',
    vi: 'Xong thì nhấn Làm mới ở đầu trang này. Chuỗi chạy đẩy các bản chụp mới lên ở cuối lượt, còn trang này chỉ đọc chúng — Làm mới không khởi động được gì trên VM.',
  },
  'scan.g.secrets': {
    en: 'The VM’s SCANNER_TOKEN never comes down to the browser, and must never be typed into this page. The only secret you type in the app is the sync code, in the ☁ box. Nothing from .env belongs in a commit.',
    vi: 'SCANNER_TOKEN của VM không bao giờ xuống trình duyệt, và tuyệt đối không gõ vào trang này. Thứ duy nhất bạn gõ trong app là mã đồng bộ, ở ô ☁. Không có gì trong .env được phép vào commit.',
  },
  'scan.g.open': { en: 'The full runbook, step by step', vi: 'Sổ tay đầy đủ, từng bước' },
  'scan.g.note': {
    en: 'The same steps as error.txt (VM-4, VM-7, LOCK-3), kept here because this is the page you are on when you find out a stage failed. Nothing here runs by itself; you are typing it over SSH as the user ubuntu, in a venv you activated in step 01.',
    vi: 'Đúng các bước như trong error.txt (VM-4, VM-7, LOCK-3), để ở đây vì đây chính là trang bạn đang mở khi phát hiện một bước bị lỗi. Không có gì ở đây tự chạy; bạn gõ qua SSH bằng user ubuntu, trong venv đã bật ở bước 01.',
  },
  'scan.g.crontab': {
    en: 'This is crontab CONTENT, not shell. Paste it inside the editor that `crontab -e` opens. Pasted into a terminal, bash reads the leading 0 as a command name and answers `0: command not found` — that is a paste in the wrong place, not a broken file.',
    vi: 'Đây là NỘI DUNG crontab, không phải lệnh shell. Dán vào trong trình soạn thảo mà `crontab -e` mở ra. Dán thẳng vào terminal thì bash đọc số 0 ở đầu là tên lệnh và trả về `0: command not found` — đó là dán sai chỗ, không phải file hỏng.',
  },

  'scan.g.venv.h': {
    en: 'First: activate the venv',
    vi: 'Trước tiên: bật venv',
  },
  'scan.g.venv.a': {
    en: 'Every `python` in this runbook means the one inside `~/scanner/.venv`. The system python has no yfinance and no pandas, so `python nightly.py` without activating first dies on `ModuleNotFoundError` — which reads like a broken install and is only a missing activation.',
    vi: 'Mọi chữ `python` trong sổ tay này là python nằm trong `~/scanner/.venv`. Python của hệ thống không có yfinance, không có pandas, nên `python nightly.py` mà chưa bật venv sẽ chết vì `ModuleNotFoundError` — đọc thì tưởng cài đặt hỏng, thật ra chỉ là quên bật.',
  },
  'scan.g.venv.b': {
    en: 'Check it took: the prompt gains a `(.venv)` prefix, and `which python` answers `/home/ubuntu/scanner/.venv/bin/python`. It lasts for this SSH session only — a new window starts without it. Cron cannot activate anything, which is why the crontab further down spells out `.venv/bin/python` instead.',
    vi: 'Kiểm lại là đã bật: dấu nhắc có thêm `(.venv)` ở đầu, và `which python` trả về `/home/ubuntu/scanner/.venv/bin/python`. Nó chỉ sống trong phiên SSH này — mở cửa sổ mới là mất. Cron không bật venv được, nên dòng crontab ở dưới viết thẳng `.venv/bin/python`.',
  },
  'scan.g.s1.h': {
    en: 'Then: make sure nobody is holding the database',
    vi: 'Sau đó: chắc chắn không ai đang giữ database',
  },
  'scan.g.s1.a': {
    en: 'Two things have to be true in the output: `journal_mode = wal`, and section 4 saying it got the lock in a fraction of a second. If it still says `delete`, a process is holding the file — section 3 of the script prints its pid and command line.',
    vi: 'Kết quả phải có đủ hai thứ: `journal_mode = wal`, và mục 4 báo xin được khoá trong một phần của giây. Nếu vẫn là `delete` thì còn tiến trình đang giữ file — mục 3 của chính script in pid và dòng lệnh của nó.',
  },
  'scan.g.s1.b': {
    en: 'Do not set WAL by hand. Once nobody is holding the file, the first connection the scanner opens switches it, and WAL is a property of the FILE — set once, set for every process.',
    vi: 'Đừng tự bật WAL bằng tay. Khi không còn ai giữ file, kết nối đầu tiên máy quét mở sẽ tự đổi, và WAL là thuộc tính của FILE — đổi một lần là xong cho mọi tiến trình.',
  },
  'scan.g.s2.h': {
    en: 'Only ever one main.py',
    vi: 'Luôn chỉ một main.py',
  },
  'scan.g.s2.a': {
    en: 'Two of them both call Telegram getUpdates and the second one gets a 409. So restart, never start a second — and a mid-session restart is safe: the alerts table is re-read, so nothing is sent twice, and the watch list is pruned by age rather than rebuilt.',
    vi: 'Hai tiến trình cùng gọi getUpdates của Telegram và cái thứ hai ăn 409. Nên hãy restart, đừng start thêm — và restart giữa phiên là an toàn: bảng alerts được đọc lại nên không bắn trùng tin, còn danh sách theo dõi dọn theo tuổi chứ không dựng lại.',
  },
  'scan.g.s3.h': { en: 'The run itself', vi: 'Chính lượt chạy' },
  'scan.g.s3.a': {
    en: 'Required stages: bars, sectors, structure, setups. If one of those fails, the night did not happen. Optional: prep, regime, mktcap, push, telegram — a failure there is a run that worked and could not report.',
    vi: 'Các bước bắt buộc: bars, sectors, structure, setups. Một trong số đó lỗi thì coi như đêm đó không chạy. Không bắt buộc: prep, regime, mktcap, push, telegram — lỗi ở đây là lượt chạy vẫn tốt, chỉ là chưa báo được.',
  },
  'scan.g.s3.b': {
    en: 'It always sends a Telegram message, including when it fails, and it names the stage and the reason. So the phone tells you before this page does.',
    vi: 'Nó luôn gửi tin Telegram, kể cả khi lỗi, và nói rõ bước nào lỗi vì cái gì. Nên điện thoại báo cho bạn trước cả trang này.',
  },
  'scan.g.s4.h': { en: 'Trying it without downloading anything', vi: 'Thử mà không tải gì' },
  'scan.g.s4.a': {
    en: '`--dry-run` chains every step with the bars stage making no network call — for checking the wiring after a change. The run record above marks a dry run as one, so it cannot be mistaken for a real night.',
    vi: '`--dry-run` xâu đủ các bước nhưng bước bars KHÔNG gọi mạng — dùng để kiểm lại đường dây sau khi sửa. Mục chuỗi chạy ở trên đánh dấu rõ lượt chạy thử, nên không thể nhầm nó với một đêm thật.',
  },
  'scan.g.s4.b': {
    en: '`--status` prints the last run from the night table — the same record the section above this one is showing.',
    vi: '`--status` in ra lần chạy gần nhất từ bảng night — đúng bản ghi mà mục ngay trên đây đang hiển thị.',
  },
  'scan.g.s5.h': {
    en: 'When it says it finished, check these four things',
    vi: 'Khi nó báo xong, kiểm bốn thứ này',
  },
  'scan.g.s5.a': {
    en: 'The four required stages read OK in the section above. Exit code 0 is a clean run; 1, 2 and 3 are the failure codes the chain hands out to cron, and the Exit tile shows the last one.',
    vi: 'Bốn bước bắt buộc phải là OK ở mục trên. Mã thoát 0 là sạch; 1, 2, 3 là các mã lỗi chuỗi chạy trả cho cron, và ô Mã thoát hiện mã của lần cuối.',
  },
  'scan.g.s5.b': {
    en: '`XONG:` from the bars stage does NOT mean everything downloaded — read the failure count in that same line. A batch that errored prints its error and moves on without printing a progress line.',
    vi: '`XONG:` ở bước bars KHÔNG có nghĩa là tải đủ — đọc số thất bại trong chính dòng đó. Lô nào lỗi thì in lỗi rồi đi tiếp, không in dòng tiến độ.',
  },
  'scan.g.s5.c': {
    en: 'The run refuses to continue when more than 25% of symbols fail to download, and that refusal is correct: percentile ranking across what is left comes out skewed while the list still looks perfectly normal.',
    vi: 'Lượt chạy tự dừng khi hơn 25% mã tải thất bại, và dừng như vậy là ĐÚNG: xếp hạng percentile trên phần còn lại sẽ lệch, mà danh sách thì vẫn trông bình thường.',
  },
  'scan.g.s5.d': {
    en: 'The bar the run decided on must not equal the day it ran — when they match, the bar had not closed yet. The tile above turns red when they do.',
    vi: 'Ngày nến mà lượt chạy chốt không được trùng ngày chạy — trùng nghĩa là nến chưa đóng. Ô ở trên chuyển đỏ khi trùng.',
  },
  'scan.g.s6.h': {
    en: 'Never run it on an empty candle store',
    vi: 'Đừng chạy khi kho nến còn rỗng',
  },
  'scan.g.s6.a': {
    en: 'The bars stage pulls one month, not two years, so it cannot bootstrap the store — it fills a store that already exists. Build the store first with the command below.',
    vi: 'Bước bars chỉ tải một tháng, không phải hai năm, nên nó không tự dựng được kho — nó chỉ đổ thêm vào kho đã có. Dựng kho trước bằng lệnh dưới đây.',
  },
  'scan.g.s6.b': {
    en: 'Re-running the full sync is safe: it commits batch by batch and has no resume, so a second run costs time, never data.',
    vi: 'Chạy lại lệnh sync đầy đủ là an toàn: nó commit theo từng lô và không có resume, nên chạy lại chỉ mất thời gian, không mất dữ liệu.',
  },
  'scan.g.s7.h': { en: 'If it dies with `database is locked`', vi: 'Nếu nó chết vì `database is locked`' },
  'scan.g.s7.a': {
    en: 'Do not go and change yfinance or the journal mode. The journal mode is the victim, not the cause: a write transaction left open elsewhere is. Step 02’s script prints the pid holding it.',
    vi: 'Đừng đi sửa yfinance hay chế độ journal. Chế độ journal là nạn nhân, không phải nguyên nhân: thủ phạm là một transaction ghi bị bỏ mở ở chỗ khác. Script ở bước 02 in ra pid đang giữ.',
  },
  'scan.g.s7.b': {
    en: 'Do not raise the busy timeout past 30 seconds either. It only makes the run die later, and hides the thing you need to see.',
    vi: 'Cũng đừng nâng busy timeout quá 30 giây. Nó chỉ làm lượt chạy chết muộn hơn, và che đúng cái cần thấy.',
  },
  'scan.g.s8.h': { en: 'The schedule it normally runs on', vi: 'Lịch nó vẫn chạy hàng ngày' },
  'scan.g.s8.a': {
    en: 'Run `crontab -e` as the user ubuntu, NOT `sudo crontab -e`. Root has its own crontab, a different working directory and no access to this venv — the lines would look installed and never run. `crontab -l` afterwards must show the CRON_TZ line too.',
    vi: 'Chạy `crontab -e` bằng user ubuntu, KHÔNG phải `sudo crontab -e`. Root có crontab riêng, thư mục làm việc khác và không dùng được venv này — các dòng sẽ trông như đã cài mà không bao giờ chạy. Chạy `crontab -l` sau đó phải thấy cả dòng CRON_TZ.',
  },
  'scan.g.s8.b': {
    en: 'Keep the 09:05 restart. The run writes the new baseline at 08:00 ET, but main.py only loads a baseline at startup and at the ET day change (00:00) — eight hours earlier. Without the restart the bot trades the whole session on yesterday’s baseline, and nothing says so.',
    vi: 'GIỮ dòng restart 09:05. Lượt chạy ghi baseline mới lúc 08:00 giờ New York, nhưng main.py chỉ nạp baseline lúc khởi động và lúc sang ngày ET (00:00) — tám tiếng trước đó. Bỏ dòng restart thì bot chạy cả phiên bằng baseline của hôm qua, và không có gì báo.',
  },
  'scan.g.s8.c': {
    en: 'Pick cron OR a systemd timer, never both. Two schedules calling the same run at 08:00 is two downloads of the same day.',
    vi: 'Chọn cron HOẶC systemd timer, đừng bật cả hai. Hai lịch cùng gọi một lượt chạy lúc 08:00 là tải hai lần cho cùng một ngày.',
  },
  'scan.g.s9.h': {
    en: 'What this page can and cannot tell you',
    vi: 'Trang này nói được gì và không nói được gì',
  },
  'scan.g.s9.a': {
    en: 'Every table here is a snapshot the VM pushed out. The VM accepts no inbound connection, so nothing on this tab can start, stop or fix anything on it — this section is a list of things to type somewhere else.',
    vi: 'Mọi bảng ở đây là bản chụp do VM đẩy ra. VM không nhận kết nối vào, nên không gì ở tab này khởi động, dừng hay sửa được thứ gì trên đó — mục này là danh sách những thứ cần gõ ở nơi khác.',
  },
  'scan.g.s9.b': {
    en: 'If "last OK run" is days older than "last run", the runs are failing rather than missing — and that is a different problem from cron never firing.',
    vi: 'Nếu "lần chạy tốt cuối" cũ hơn "lần chạy cuối" vài ngày thì các lượt chạy đang LỖI chứ không phải không chạy — và đó là vấn đề khác với việc cron không nổ.',
  },
  'scan.g.s10.h': { en: 'Two schedules that are not this one', vi: 'Hai lịch khác, không phải lịch này' },
  'scan.g.s10.a': {
    en: 'The Saturday 06:30 prep and the 09:00 ETF marking are separate cron lines with separate jobs. Re-running the nightly does not re-run either, and neither of them rebuilds the candle store.',
    vi: 'Lượt prep 06:30 thứ Bảy và lượt đánh dấu ETF 09:00 là hai dòng cron riêng, việc riêng. Chạy lại nightly không chạy lại hai lượt đó, và không lượt nào trong đó dựng lại kho nến.',
  },
  'scan.g.s10.b': {
    en: 'To run any cron line by hand, drop the five schedule fields at the front and keep the rest — and drop the `>>` redirect too, so the error lands on your screen instead of in a log you then have to go and open.',
    vi: 'Muốn chạy tay một dòng cron thì bỏ 5 trường lịch ở đầu, giữ phần sau — và bỏ luôn phần `>>` chuyển hướng, để lỗi hiện ngay trên màn hình thay vì nằm trong log rồi phải đi mở.',
  },

  // Read-only thresholds.
  'scan.sec.thresholds': { en: 'Active thresholds', vi: 'Ngưỡng đang chạy' },
  'scan.th.note': {
    en: 'Read straight out of the running config.py on the VM, not a copy kept here. If a number on this page looks wrong, it IS what the scanner used.',
    vi: 'Đọc trực tiếp từ file config.py đang chạy trên VM, không phải bản copy giữ ở đây. Nếu một con số ở trang này trông sai thì đó ĐÚNG là con số máy quét đã dùng.',
  },
  'scan.th.none': { en: 'The VM has not pushed its thresholds yet.', vi: 'VM chưa đẩy bảng ngưỡng lên.' },
  'scan.th.show': { en: 'Show thresholds', vi: 'Xem bảng ngưỡng' },
  'scan.rej.passed': { en: 'passed', vi: 'qua lọc' },
  'scan.rej.cut': { en: 'over ceiling', vi: 'bị cắt trần' },
  'scan.rej.fund': { en: 'awaiting fundamentals', vi: 'chờ điểm cơ bản' },
  'scan.rej.note': {
    en: 'Recomputed against the thresholds in force right now, not stored when the list was built. "no consolidation base" dominating is normal — most of the market is not in a base. "still far from pivot" dominating means the market just fell, and the setup should be quiet.',
    vi: 'Tính lại theo đúng ngưỡng đang có hiệu lực, không phải bảng lưu lúc dựng danh sách. "khong co nen tich luy" chiếm gần hết là bình thường — phần lớn thị trường không ở nền. "con xa pivot" chiếm gần hết nghĩa là thị trường vừa rơi, và setup đúng ra nên im lặng.',
  },

  // Health warnings — every one of these is a state that produces SILENCE, not an
  // error, so the wording says what is silently not happening.
  'scan.warn.nopush': {
    en: 'The VM has never pushed a status. Either push.py is not in cron yet, or its token is wrong.',
    vi: 'VM chưa từng đẩy trạng thái lên. Hoặc push.py chưa vào cron, hoặc token sai.',
  },
  'scan.warn.db': { en: 'Cannot read the scanner database', vi: 'Không đọc được cơ sở dữ liệu của máy quét' },
  'scan.warn.stale': {
    en: 'Status is stale — the push cron has stopped',
    vi: 'Trạng thái đã cũ — cron đẩy dữ liệu đã dừng',
  },
  // Said in the same breath as the staleness, because the page below it goes on
  // looking perfectly healthy: every date on it is simply frozen at the last push,
  // and a frozen date reads exactly like a nightly run that skipped a session.
  'scan.warn.stale.tail': {
    en: 'everything below is frozen at that moment, so the dates you read are that snapshot’s, not today’s',
    vi: 'mọi thứ bên dưới đứng yên ở thời điểm đó, nên các ngày bạn đọc là của bản chụp cũ, không phải hôm nay',
  },
  'scan.warn.silent': {
    en: 'The candidates table is older than the bot will accept, so it is sending nothing at all: no alerts, no errors',
    vi: 'Bảng candidates cũ hơn mức bot chấp nhận, nên nó không gửi gì cả: không cảnh báo, không lỗi',
  },
  'scan.warn.nobeat': {
    en: 'No heartbeat from the scanner process: it has never started, or it is running a build from before heartbeats existed.',
    vi: 'Không có nhịp tim từ tiến trình máy quét: nó chưa từng chạy, hoặc đang chạy bản cũ chưa có nhịp tim.',
  },
  'scan.warn.beatstale': {
    en: 'The scanner loop has stopped writing its heartbeat',
    vi: 'Vòng quét đã ngừng ghi nhịp tim',
  },
  'scan.warn.dry': {
    en: 'Running in dry mode: it scans and scores, but sends no messages.',
    vi: 'Đang chạy chế độ thử: vẫn quét và chấm điểm, nhưng không gửi tin nhắn nào.',
  },
  'scan.warn.universe': {
    en: 'The universe has not refreshed for a long time — the quote source is down',
    vi: 'Danh sách mã đã lâu không làm mới — nguồn giá đang lỗi',
  },
  'scan.warn.halts': { en: 'Halt feed error', vi: 'Lỗi nguồn tin tạm dừng giao dịch' },
  'scan.warn.news': { en: 'News feed error', vi: 'Lỗi nguồn tin' },
  'scan.warn.spool': {
    en: 'Messages are queued undelivered — Telegram is rejecting them',
    vi: 'Có tin nhắn xếp hàng chưa gửi được — Telegram đang từ chối',
  },
  'scan.warn.nightstale': {
    en: 'The nightly chain has not completed for more than',
    vi: 'Chuỗi chạy buổi sáng đã không hoàn tất quá',
  },
  'scan.warn.nightstale.tail': {
    en: 'working hours — everything below is from an older session',
    vi: 'giờ làm việc — mọi thứ bên dưới là của một phiên cũ hơn',
  },
  'scan.warn.nightnever': {
    en: 'The nightly chain has never completed successfully — nothing below has ever been refreshed',
    vi: 'Chuỗi chạy buổi sáng chưa hoàn tất thành công lần nào — chưa có gì bên dưới từng được làm mới',
  },
  'scan.warn.nightfail': {
    en: 'Last nightly run failed at',
    vi: 'Lần chạy buổi sáng gần nhất bị lỗi ở',
  },

  // Sync indicator (top bar)
  'sync.state.off': { en: 'Local only', vi: 'Chỉ lưu máy này' },
  'sync.state.error': { en: 'Not saved', vi: 'Chưa lưu được' },
  // The pull failed, so nothing is being uploaded at all. Worded as "not syncing"
  // rather than "offline" because a rejected code produces it too.
  'sync.state.stalled': { en: 'Not syncing', vi: 'Không đồng bộ được' },
  'sync.state.pending': { en: 'Syncing…', vi: 'Đang đồng bộ…' },
  'sync.state.ok': { en: 'Synced', vi: 'Đã đồng bộ' },
  'sync.status.hint': {
    en: 'click to open device sync',
    vi: 'bấm để mở đồng bộ thiết bị',
  },

  // Misc
  'common.slower': { en: '(slower)', vi: '(chậm hơn)' },
  'msg.scanning': { en: 'Scanning', vi: 'Đang quét' },
  'msg.loading': { en: 'Loading', vi: 'Đang tải' },
};

let lang: Lang = ((): Lang => {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('lang') : null;
  const resolved: Lang = saved === 'vi' ? 'vi' : 'en';
  // Guarded like `localStorage` above, and for a bigger reason than symmetry: this runs at
  // MODULE LOAD, so an unguarded `document` makes importing `i18n` throw outside a browser —
  // and since half the app imports it for `t()`, that put every module downstream of it
  // beyond the reach of the test suite, which runs under `environment: 'node'`.
  if (typeof document !== 'undefined') document.documentElement.lang = resolved;
  return resolved;
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
