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
  'nav.picks': { en: 'Top Picks', vi: 'Top Picks' },
  'nav.screener': { en: 'Screener', vi: 'Screener' },
  'nav.watchlist': { en: 'Watchlists', vi: 'Watchlist' },
  'nav.sectors': { en: 'Sectors', vi: 'Ngành' },
  'nav.portfolio': { en: 'Portfolio', vi: 'Danh mục' },
  'nav.wealth': { en: 'Financial Status', vi: 'Tình trạng tài chính' },
  // ── Financial Status ──
  'wealth.title': { en: 'Financial Status', vi: 'Tình trạng tài chính' },
  'wealth.sub': { en: 'Portfolio plus bank accounts, savings, cash and debts, all converted to {ccy} at each date’s rate. Balances are readings: each one holds until the next.', vi: 'Danh mục cộng tài khoản ngân hàng, tiết kiệm, tiền mặt và các khoản nợ, quy về {ccy} theo tỷ giá từng ngày. Mỗi số dư ghi vào sẽ giữ nguyên cho đến lần ghi sau.' },
  'wealth.add': { en: 'Account', vi: 'Tài khoản' },
  'wealth.record': { en: 'Record balances', vi: 'Ghi số dư' },
  'wealth.add.btn': { en: 'Add account', vi: 'Thêm tài khoản' },
  'wealth.record.btn': { en: 'Enter one date’s balance for several accounts at once', vi: 'Nhập số dư một ngày cho nhiều tài khoản cùng lúc' },
  'wealth.auto.short': { en: 'Updates itself after the US close', vi: 'Tự cập nhật sau khi sàn Mỹ đóng cửa' },
  'wealth.record.hint': { en: 'One date for all. Leave a field blank to keep that account as it is. Separators are fine: 250,000,000 or 1.234,56.', vi: 'Một ngày cho tất cả. Ô nào để trống thì tài khoản đó giữ nguyên. Có dấu phân cách cũng được: 250,000,000 hoặc 1.234,56.' },
  'wealth.update': { en: 'Update', vi: 'Cập nhật' },
  'wealth.updated': { en: 'Portfolio and exchange rates updated', vi: 'Đã cập nhật danh mục và tỷ giá' },
  'wealth.updating.fx': { en: 'Fetching exchange rates…', vi: 'Đang lấy tỷ giá…' },
  'wealth.syncing': { en: 'Still syncing — try again in a moment', vi: 'Đang sync — chờ chút rồi thử lại' },
  'wealth.warn.fx': { en: 'No exchange rate yet for {ccy} — those accounts are left out of the totals. Press Update.', vi: 'Chưa có tỷ giá {ccy} — các tài khoản này chưa được tính vào tổng. Bấm Cập nhật.' },
  'wealth.warn.fxfetch': { en: 'Could not fetch the {ccy} rate', vi: 'Không lấy được tỷ giá {ccy}' },
  'wealth.warn.pf': { en: 'Portfolio account(s) {names} hold positions but have no history on this device yet — not counted. Press Update.', vi: 'Tài khoản danh mục {names} đang có vị thế nhưng máy này chưa có lịch sử — chưa được tính. Bấm Cập nhật.' },
  'wealth.warn.stale': { en: 'Last reading over {n} days old: {names}', vi: 'Quá {n} ngày chưa ghi số dư: {names}' },
  'wealth.kpi.total': { en: 'Total wealth', vi: 'Tổng tài sản' },
  'wealth.kpi.portfolio': { en: 'Portfolio', vi: 'Danh mục' },
  'wealth.kpi.others': { en: 'Other accounts', vi: 'Tài khoản khác' },
  'wealth.kpi.since': { en: 'Change since', vi: 'Thay đổi kể từ' },
  'wealth.kpi.year': { en: 'Change, 1 year', vi: 'Thay đổi 1 năm' },
  'wealth.chart': { en: 'Wealth over time ({ccy})', vi: 'Tài sản theo thời gian ({ccy})' },
  'wealth.view.total': { en: 'Total', vi: 'Tổng' },
  'wealth.view.stack': { en: 'Breakdown', vi: 'Phân bổ' },
  'wealth.nodata': { en: 'No data yet — add an account or update the Portfolio.', vi: 'Chưa có dữ liệu — hãy thêm tài khoản hoặc cập nhật Danh mục.' },
  'wealth.accounts': { en: 'Accounts', vi: 'Tài khoản' },
  'wealth.accounts.sub': { en: 'Native balance as last recorded; {ccy} at today’s rate. Click a name or ▾ for its chart and every reading.', vi: 'Số dư nguyên tệ theo lần ghi gần nhất; {ccy} theo tỷ giá hôm nay. Bấm vào tên hoặc ▾ để xem chart và các lần ghi.' },
  'wealth.empty': { en: 'No other accounts yet. “+ Account” adds a bank, savings, cash, crypto, a loan…', vi: 'Chưa có tài khoản nào khác. Bấm “+ Tài khoản” để thêm ngân hàng, tiết kiệm, tiền mặt, crypto, khoản vay…' },
  'wealth.noreading': { en: 'no reading', vi: 'chưa ghi' },
  'wealth.pf.auto': { en: 'from Portfolio', vi: 'lấy từ Danh mục' },
  'wealth.col.name': { en: 'Name', vi: 'Tên' },
  'wealth.col.kind': { en: 'Type', vi: 'Loại' },
  'wealth.col.ccy': { en: 'Currency', vi: 'Loại tiền' },
  'wealth.col.balance': { en: 'Balance', vi: 'Số dư' },
  'wealth.col.eur': { en: 'In {ccy}', vi: 'Quy ra {ccy}' },
  'wealth.col.eurthen': { en: '{ccy} on that date', vi: '{ccy} tại ngày đó' },
  'wealth.display': { en: 'Show in', vi: 'Hiển thị theo' },
  'wealth.display.hint': {
    en: 'Show every total in this currency, each date at that date’s rate',
    vi: 'Quy mọi số tổng về loại tiền này, mỗi ngày theo tỷ giá ngày đó',
  },
  'wealth.warn.display': {
    en: 'No {ccy} rate yet — amounts are still shown in EUR. Press Update.',
    vi: 'Chưa có tỷ giá {ccy} — số liệu vẫn đang hiện bằng EUR. Bấm Cập nhật.',
  },
  'wealth.col.share': { en: 'Share', vi: 'Tỷ trọng' },
  'wealth.col.asof': { en: 'Last update', vi: 'Cập nhật cuối' },
  'wealth.col.change': { en: 'vs previous', vi: 'So với lần trước' },
  'wealth.col.date': { en: 'Date', vi: 'Ngày' },
  'wealth.col.note': { en: 'Note', vi: 'Ghi chú' },
  'wealth.f.opening': { en: 'Opening balance', vi: 'Số dư ban đầu' },
  'wealth.f.openingdate': { en: 'Balance date (default: Portfolio start)', vi: 'Ngày số dư (mặc định: ngày bắt đầu Danh mục)' },
  'wealth.act.balance': { en: 'Record a balance', vi: 'Ghi số dư' },
  'wealth.act.chart': { en: 'Show chart', vi: 'Xem chart' },
  'wealth.auto.running': { en: 'Updating to the {session} close…', vi: 'Đang cập nhật theo giá đóng cửa {session}…' },
  'wealth.auto.done': { en: 'Updated to the {session} close', vi: 'Đã cập nhật theo giá đóng cửa {session}' },
  'wealth.auto.hint': { en: 'Updates itself once per trading day, after the US close (≈23:00 CET)', vi: 'Tự cập nhật mỗi ngày giao dịch một lần, sau khi sàn Mỹ đóng cửa (≈23:00 CET)' },
  'wealth.auto.last': { en: 'last: {session} close', vi: 'lần cuối: đóng cửa {session}' },
  'wealth.act.history': { en: 'Chart and readings', vi: 'Chart và các lần ghi' },
  'wealth.act.edit': { en: 'Edit account', vi: 'Sửa tài khoản' },
  'wealth.act.delete': { en: 'Delete account', vi: 'Xoá tài khoản' },
  'wealth.act.delreading': { en: 'Delete this reading', vi: 'Xoá lần ghi này' },
  'wealth.act.editreading': { en: 'Edit this reading', vi: 'Sửa lần ghi này' },
  'wealth.act.save': { en: 'Save (Enter)', vi: 'Lưu (Enter)' },
  'wealth.col.delta': { en: 'Change', vi: 'Thay đổi' },
  'wealth.readings': { en: 'Readings', vi: 'Các lần ghi' },
  'wealth.readings.hint': {
    en: 'edit in place — Enter or ✓ saves, Esc cancels',
    vi: 'sửa trực tiếp — Enter hoặc ✓ để lưu, Esc để huỷ',
  },
  'wealth.readings.new': { en: '← new reading', vi: '← lần ghi mới' },
  'wealth.alloc.ccy': { en: 'By currency', vi: 'Theo tiền tệ' },
  'wealth.alloc.kind': { en: 'By account type', vi: 'Theo loại tài khoản' },
  'wealth.alloc.other': { en: 'Other ({n})', vi: 'Khác ({n})' },
  'wealth.alloc.all': { en: 'All {n} holdings, largest first', vi: 'Xem đủ {n} khoản, lớn nhất trước' },
  'wealth.alloc.pfnote': {
    en: 'The Portfolio is its own bar: it is counted as one figure, not per holding. Shares are of total assets; debts show negative.',
    vi: 'Danh mục được tính là một thanh riêng, gộp thành một con số chứ không tách theo từng mã. Tỷ trọng tính trên tổng tài sản; khoản nợ hiện số âm.',
  },
  'wealth.filter.search': { en: 'Search accounts…', vi: 'Tìm tài khoản…' },
  'wealth.filter.title': { en: 'Show only these accounts', vi: 'Chỉ hiện các tài khoản này' },
  'wealth.filter.find': { en: 'Find in list…', vi: 'Tìm trong danh sách…' },
  'wealth.filter.everything': { en: 'All accounts', vi: 'Tất cả tài khoản' },
  'wealth.filter.some': { en: '{n} accounts selected', vi: 'Đã chọn {n} tài khoản' },
  'wealth.filter.clear': { en: 'Show all', vi: 'Hiện tất cả' },
  'wealth.filter.done': { en: 'Done', vi: 'Xong' },
  'wealth.filter.remove': { en: 'Remove from the selection', vi: 'Bỏ chọn' },
  'wealth.expandall': { en: 'Expand all', vi: 'Mở tất cả' },
  'wealth.collapseall': { en: 'Collapse all', vi: 'Thu gọn tất cả' },
  'wealth.filter.shown': { en: '{n}/{m} shown · {v}', vi: 'Đang hiện {n}/{m} · {v}' },
  'wealth.pf.open': { en: 'Open Portfolio', vi: 'Mở Danh mục' },
  'wealth.sort.hint': { en: 'Sort by this column — click again to reverse', vi: 'Sắp xếp theo cột này — bấm lần nữa để đảo thứ tự' },
  'wealth.confirm.replace': {
    en: 'There is already a reading on {date} ({v}). Replace it with this one?',
    vi: 'Ngày {date} đã có số dư ({v}). Thay bằng số mới này?',
  },
  'wealth.ccy.locked': { en: 'fixed once a balance is recorded', vi: 'không đổi được khi đã ghi số dư' },
  'wealth.badamount': { en: 'Not a number: {v}', vi: 'Không phải số: {v}' },
  'wealth.confirm.delete': { en: 'Delete “{name}” and its {n} reading(s)?', vi: 'Xoá “{name}” cùng {n} lần ghi?' },
  'wealth.confirm.delreading': { en: 'Delete the reading of {date}?', vi: 'Xoá lần ghi ngày {date}?' },
  'wealth.kind.portfolio': { en: 'Brokerage (tracked)', vi: 'Chứng khoán (tự cập nhật)' },
  'wealth.kind.bank': { en: 'Bank account', vi: 'Tài khoản ngân hàng' },
  'wealth.kind.savings': { en: 'Savings / deposit', vi: 'Tiết kiệm / tiền gửi' },
  'wealth.kind.cash': { en: 'Cash', vi: 'Tiền mặt' },
  'wealth.kind.broker': { en: 'Other brokerage', vi: 'Chứng khoán khác' },
  'wealth.kind.crypto': { en: 'Crypto', vi: 'Crypto' },
  'wealth.kind.gold': { en: 'Gold', vi: 'Vàng' },
  'wealth.kind.property': { en: 'Property', vi: 'Bất động sản' },
  'wealth.kind.pension': { en: 'Pension / insurance', vi: 'Hưu trí / bảo hiểm' },
  'wealth.kind.loan': { en: 'Loan / debt (negative)', vi: 'Khoản vay / nợ (số âm)' },
  'wealth.kind.other': { en: 'Other', vi: 'Khác' },
  'nav.backtest': { en: 'Backtest', vi: 'Backtest' },
  'nav.playbook': { en: 'Playbook', vi: 'Playbook' },
  'nav.learn': { en: 'Learn', vi: 'Tìm hiểu' },
  'nav.about': { en: 'About', vi: 'Giới thiệu' },
  'nav.settings': { en: 'Settings & Guides', vi: 'Cài đặt & Hướng dẫn' },
  'nav.casestudies': { en: 'Case Studies', vi: 'Case Study' },
  'nav.station': { en: 'Trade Station', vi: 'Trạm giao dịch' },
  'nav.calendar': { en: 'Calendar', vi: 'Lịch' },
  'nav.scanner': { en: 'Scanner', vi: 'Scanner' },
  'nav.more': { en: 'More', vi: 'Thêm' },
  'foot.disclaimer': { en: 'Educational use only. Not financial advice.', vi: 'Chỉ nhằm mục đích học tập. Không phải khuyến nghị đầu tư.' },

  // The round button that closes the story, at the end of the last chapter. One
  // word on purpose: it sits inside a 130px circle, uppercase and letter-spaced.
  'story.discover': { en: 'Discover', vi: 'Khám phá' },

  // Landing
  'landing.badge': { en: 'The Platform', vi: 'Nền tảng' },
  'landing.h1a': { en: 'Trade the strongest stocks,', vi: 'Trade những cổ phiếu mạnh nhất,' },
  'landing.h1b': { en: 'in the strongest setups.', vi: 'với những setup đẹp nhất.' },
  'landing.sub': {
    en: 'A professional-grade equity screener built on Qullamaggie methodology. Scan for VCP & episodic-pivot setups, rank momentum leaders with a 0–100 quality score, and read market regime and sector rotation. Then backtest, plan trades, paper-trade a graded portfolio, and journal your setups — synced across every device, no account required.',
    vi: 'Screener cổ phiếu chuẩn chuyên nghiệp, xây trên phương pháp Qullamaggie. Quét setup VCP & episodic pivot, xếp hạng các mã dẫn dắt momentum bằng điểm chất lượng 0–100, đọc trạng thái thị trường và dòng tiền luân chuyển ngành. Sau đó backtest, lập trade plan, giao dịch giả lập với danh mục có chấm điểm, và ghi lại setup — sync trên mọi thiết bị, không cần tạo tài khoản.',
  },
  'landing.cta': { en: 'Launch the Platform →', vi: 'Vào nền tảng →' },
  'landing.nosignup': { en: 'No sign-up · runs locally', vi: 'Không cần đăng ký · chạy cục bộ' },
  // Strategy strip
  'landing.strat.title': { en: 'Three scanning strategies, one tool', vi: 'Ba chiến lược quét, gói trong một công cụ' },
  'landing.strat.qm.t': { en: 'Qullamaggie (QM)', vi: 'Qullamaggie (QM)' },
  'landing.strat.qm.d': { en: 'VCP bases and episodic pivots ranked by a 7-factor quality score. The same setups Minervini-style traders look for every morning.', vi: 'Base VCP và episodic pivot, xếp hạng theo điểm chất lượng 7 yếu tố. Đúng những setup mà trader theo trường phái Minervini săn mỗi sáng.' },
  'landing.strat.mom.t': { en: 'Momentum', vi: 'Momentum' },
  'landing.strat.mom.d': { en: 'Top movers ranked by 1M/3M/6M return and RS vs SPY. Classed Weak → Building → Strong → Explosive so you always know what is running.', vi: 'Các mã tăng mạnh nhất, xếp hạng theo lợi nhuận 1T/3T/6T và RS so với SPY. Chia thành Yếu → Đang hình thành → Mạnh → Bùng nổ để bạn luôn biết mã nào đang chạy.' },
  'landing.strat.surge.t': { en: 'Surge', vi: 'Surge' },
  'landing.strat.surge.d': { en: 'Fresh fast movers only: close held above EMA5 all week AND up >20% in two weeks. The tightest filter — the fewest names, the most immediate momentum.', vi: 'Chỉ những mã vừa bứt tốc: đóng cửa trên EMA5 suốt cả tuần VÀ tăng >20% trong hai tuần. Bộ lọc chặt nhất — ít mã nhất, momentum nóng nhất.' },
  // Feature cards
  'landing.f1.t': { en: 'Custom Screener', vi: 'Screener tuỳ chỉnh' },
  'landing.f1.d': { en: 'Paste any tickers or click sector chips. Filter by setup type, quality score and momentum tier in real time.', vi: 'Dán mã bất kỳ hoặc bấm chọn ngành. Lọc theo loại setup, điểm chất lượng và mức momentum ngay tức thì.' },
  'landing.f2.t': { en: 'Pro Charts', vi: 'Chart chuyên nghiệp' },
  'landing.f2.d': { en: 'Candles, EMAs (20/50/150/200), volume bars, and pivot/entry/stop/target levels overlaid precisely on every chart.', vi: 'Nến, EMA (20/50/150/200), cột khối lượng, cùng các mức pivot/entry/stop/target vẽ chính xác trên mọi chart.' },
  'landing.f3.t': { en: 'Market Regime', vi: 'Trạng thái thị trường' },
  'landing.f3.d': { en: 'SPY/QQQ define BULL / TRANSITION / BEAR and a risk-on flag. Know when to press and when to stand aside before you even open a chart.', vi: 'SPY/QQQ xác định BULL / TRANSITION / BEAR và cờ risk-on. Biết lúc nào nên đánh mạnh, lúc nào nên đứng ngoài trước cả khi mở chart.' },
  'landing.f4.t': { en: 'Sector Rotation', vi: 'Luân chuyển ngành' },
  'landing.f4.d': { en: 'All sectors ranked by 1M/3M return and RS. See exactly where institutional money is flowing — and which sectors are going cold.', vi: 'Mọi ngành xếp hạng theo lợi nhuận 1T/3T và RS. Thấy rõ dòng tiền tổ chức đang chảy vào đâu — và ngành nào đang nguội dần.' },
  'landing.f5.t': { en: 'Backtest Engine', vi: 'Backtest' },
  'landing.f5.d': { en: 'Simulate VCP breakout or momentum rebalancing strategies on historical daily bars. No lookahead. Equity curve, trade log, CAGR, Sharpe and max drawdown in seconds.', vi: 'Chạy thử chiến lược VCP breakout hoặc momentum rebalancing trên dữ liệu ngày quá khứ. Không nhìn trước tương lai. Equity curve, nhật ký lệnh, CAGR, Sharpe và max drawdown chỉ trong vài giây.' },
  'landing.f6.t': { en: 'Trade Planner', vi: 'Trade Plan' },
  'landing.f6.d': { en: 'Position sizing, entry, stop, target and R:R computed from your account equity and risk % — for every symbol in your watchlist at once.', vi: 'Size vị thế, entry, stop, target và R:R tính theo vốn tài khoản và % rủi ro của bạn — cho mọi mã trong watchlist cùng lúc.' },
  'landing.f7.t': { en: 'Paper Portfolio', vi: 'Danh mục giả lập' },
  'landing.f7.d': { en: 'Multi-account paper trading with live quotes: buy/sell, tag each entry with a setup and A–D grade, and track PnL, risk, win rate and a live equity curve in € or $.', vi: 'Giao dịch giả lập nhiều tài khoản với giá realtime: mua/bán, gắn setup và hạng A–D cho từng lệnh, theo dõi lãi/lỗ, rủi ro, tỷ lệ thắng và equity curve trực tiếp bằng € hoặc $.' },
  'landing.f8.t': { en: 'Case Studies', vi: 'Case Study' },
  'landing.f8.d': { en: 'A journal of past setups: pin a stock to a key date with levels, dated catalysts and rich notes, get an annotated chart, and export a standalone PDF report.', vi: 'Nhật ký các setup đã qua: ghim một mã vào ngày then chốt kèm các mức giá, catalyst theo ngày và ghi chú chi tiết, xem chart có chú thích, rồi xuất báo cáo PDF riêng.' },
  'landing.f9.t': { en: 'Time Machine', vi: 'Cỗ máy thời gian' },
  'landing.f9.d': { en: 'Point-in-time screening: pick any past date and screen, chart and paper-trade exactly as the market looked then — no lookahead. Perfect for studying real setups.', vi: 'Lọc tại một thời điểm: chọn một ngày bất kỳ trong quá khứ rồi lọc, xem chart và giao dịch giả lập đúng như thị trường lúc ấy — không nhìn trước tương lai. Lý tưởng để học từ các setup thật.' },
  'landing.f10.t': { en: 'Syncs Everywhere', vi: 'Đồng bộ mọi nơi' },
  'landing.f10.d': { en: 'Your watchlists, portfolios and case studies follow you across devices with a private access code — no account, no email, no tracking.', vi: 'Watchlist, danh mục và case study đi theo bạn trên mọi thiết bị bằng một mã truy cập riêng — không tài khoản, không email, không theo dõi.' },

  // Picks
  'picks.title': { en: 'Top Picks', vi: 'Top Picks' },
  'picks.sub': { en: 'Qullamaggie setups and momentum leaders, auto-ranked across the universe.', vi: 'Setup Qullamaggie và các mã dẫn dắt momentum, tự động xếp hạng trên toàn bộ danh sách mã.' },
  'picks.qm': { en: 'Qullamaggie', vi: 'Qullamaggie' },
  'picks.momentumscan': { en: 'Momentum', vi: 'Momentum' },
  'picks.surge': { en: 'Surge', vi: 'Surge' },
  'picks.volume': { en: 'Volume', vi: 'Khối lượng' },
  'picks.vol.period': { en: 'Volume period', vi: 'Khung khối lượng' },
  'picks.vol.minavgvol': { en: 'Min Peak Vol', vi: 'KL đỉnh tối thiểu' },
  'picks.vol.period.1w': { en: '1 Week', vi: '1 tuần' },
  'picks.vol.period.1m': { en: '1 Month', vi: '1 tháng' },
  'picks.vol.period.3m': { en: '3 Months', vi: '3 tháng' },
  'picks.vol.ratio': { en: 'Vol Ratio', vi: 'Tỷ lệ KL' },
  'picks.vol.peak': { en: 'Peak Vol', vi: 'KL đỉnh' },
  'picks.vol.baseline': { en: 'Baseline Avg Vol', vi: 'KL trung bình nền' },
  'picks.vol.sector': { en: 'Sector ΔVol%', vi: 'ΔVol% ngành' },
  'picks.prefilter': { en: 'Momentum pre-filter', vi: 'Lọc trước theo momentum' },
  'picks.minprice': { en: 'Min Price', vi: 'Giá tối thiểu' },
  'picks.broad': { en: 'Broad universe', vi: 'Toàn thị trường' },
  'picks.strategy': { en: 'Strategy', vi: 'Chiến lược' },
  'picks.filter': { en: 'Filter', vi: 'Lọc' },
  'picks.asof': { en: 'As of', vi: 'Tính đến' },
  'picks.run': { en: 'Run scan', vi: 'Quét' },
  'picks.market': { en: 'Market', vi: 'Thị trường' },
  'picks.market.us': { en: 'US', vi: 'Mỹ' },
  'picks.market.vn': { en: 'Vietnam', vi: 'Việt Nam' },
  'picks.market.de': { en: 'Germany', vi: 'Đức' },
  'picks.universe': { en: 'Universe', vi: 'Phạm vi' },
  'picks.uni.curated': { en: 'Curated (~540)', vi: 'Chọn lọc (~540)' },
  'picks.uni.broad': { en: 'S&P 1500', vi: 'S&P 1500' },
  'picks.uni.all': { en: 'All US stocks', vi: 'Toàn bộ cổ phiếu Mỹ' },
  'picks.uni.vn30': { en: 'VN30', vi: 'VN30' },
  'picks.uni.vn100': { en: 'VN100', vi: 'VN100' },
  'picks.uni.vnall': { en: 'All HOSE (~390)', vi: 'Toàn sàn HOSE (~390)' },
  'picks.uni.hnx': { en: 'HNX (~135)', vi: 'Sàn HNX (~135)' },
  'picks.uni.upcom': { en: 'UPCoM (~360)', vi: 'Sàn UPCoM (~360)' },
  'picks.uni.vnmarket': { en: 'All VN (~880)', vi: 'Toàn thị trường VN (~880)' },
  'picks.uni.dax': { en: 'DAX large caps (~40)', vi: 'DAX vốn hoá lớn (~40)' },
  'picks.uni.deall': { en: 'DAX + MDAX (~100)', vi: 'DAX + MDAX (~100)' },
  'picks.uni.vnall.hint': {
    en: 'Scans the full universe via VNDirect (covers HOSE + HNX + UPCoM). Takes a few minutes; less-liquid names with little history are skipped — use Stop anytime.',
    vi: 'Quét toàn bộ qua VNDirect (gồm HOSE + HNX + UPCoM). Mất vài phút; mã thanh khoản thấp, ít lịch sử sẽ bị bỏ qua — có thể bấm Dừng bất cứ lúc nào.',
  },
  'picks.uni.all.hint': {
    en: 'Scans every NASDAQ + NYSE/AMEX common stock (~6000+). Takes several minutes and some symbols may be rate-limited — use the Stop button anytime.',
    vi: 'Quét mọi cổ phiếu phổ thông trên NASDAQ + NYSE/AMEX (~6000+). Mất vài phút và một số mã có thể bị giới hạn truy vấn — có thể bấm Dừng bất cứ lúc nào.',
  },
  'picks.stop': { en: '■ Stop', vi: '■ Dừng' },
  'picks.loadinguni': { en: 'Loading symbol list…', vi: 'Đang tải danh sách mã…' },
  'picks.scanned': { en: 'scanned', vi: 'đã quét' },
  'picks.matches': { en: 'match(es) so far', vi: 'mã khớp đến giờ' },
  'picks.stopped': { en: 'Stopped', vi: 'Đã dừng' },
  'picks.done': { en: 'Done', vi: 'Hoàn tất' },
  'picks.unavailable': { en: 'unavailable this run', vi: 'lần này không tải được' },

  // Screener (Qullamaggie + Momentum)
  'screener.title': { en: 'Custom Screener', vi: 'Screener tuỳ chỉnh' },
  'screener.sub': { en: 'Scan any stocks or sectors for Qullamaggie setups and momentum leaders.', vi: 'Quét bất kỳ mã hay ngành nào để tìm setup Qullamaggie và các mã dẫn dắt momentum.' },
  'screener.symbols': { en: 'Symbols (comma separated)', vi: 'Mã (cách nhau bằng dấu phẩy)' },
  'screener.orsectors': { en: 'Or pick sectors', vi: 'Hoặc chọn ngành' },
  'screener.nolimit': { en: 'no limit', vi: 'không giới hạn' },
  'screener.setup': { en: 'Setup type', vi: 'Loại setup' },
  'screener.setup.vcp': { en: 'VCP', vi: 'VCP' },
  'screener.setup.ep': { en: 'Episodic pivot', vi: 'Episodic pivot' },
  'screener.setup.both': { en: 'VCP + Episodic', vi: 'VCP + Episodic' },
  'screener.minquality': { en: 'Min quality', vi: 'Chất lượng tối thiểu' },
  'screener.minmomentum': { en: 'Min momentum', vi: 'Momentum tối thiểu' },
  'screener.sortby': { en: 'Sort by', vi: 'Sắp xếp theo' },
  'screener.col.quality': { en: 'Quality', vi: 'Chất lượng' },
  'screener.col.momentum': { en: 'Momentum', vi: 'Momentum' },
  'screener.run': { en: 'Run Screen', vi: 'Lọc' },
  'opt.any': { en: 'Any', vi: 'Tất cả' },

  // Momentum classifications
  'mom.class.weak': { en: 'Weak', vi: 'Yếu' },
  'mom.class.building': { en: 'Building', vi: 'Đang hình thành' },
  'mom.class.strong': { en: 'Strong', vi: 'Mạnh' },
  'mom.class.explosive': { en: 'Explosive', vi: 'Bùng nổ' },

  // Sectors
  'sectors.title': { en: 'Sector Rotation', vi: 'Luân chuyển ngành' },
  'sectors.sub': { en: 'Sectors ranked by momentum (1M/3M return + RS vs SPY), with the volume trend. Click one for details.', vi: 'Các ngành xếp hạng theo momentum (lợi nhuận 1M/3M + RS so với SPY), kèm xu hướng khối lượng. Bấm vào một ngành để xem chi tiết.' },
  'sectors.scan': { en: '↻ Scan sectors', vi: '↻ Quét ngành' },
  'sectors.screenstocks': { en: 'Screen stocks →', vi: 'Lọc cổ phiếu →' },
  'sectors.hot': { en: 'Hot', vi: 'Nóng' },
  'sectors.cold': { en: 'Cold', vi: 'Lạnh' },

  // Watchlist
  'wl.title': { en: 'Watchlist', vi: 'Watchlist' },
  'wl.sub': { en: 'Track symbols and screen them in one click. Stored locally.', vi: 'Theo dõi mã và lọc chỉ bằng một cú bấm. Lưu trên máy này.' },
  'wl.add': { en: 'Add', vi: 'Thêm' },
  'wl.refresh': { en: 'Refresh quotes', vi: 'Làm mới giá' },
  'wl.plan': { en: 'Trade Plan', vi: 'Trade Plan' },
  'wl.export': { en: 'Export', vi: 'Xuất' },
  'wl.export.tip': { en: 'Download all watchlists as a JSON backup', vi: 'Tải toàn bộ watchlist về dạng file JSON để sao lưu' },
  'wl.import': { en: 'Import', vi: 'Nhập' },
  'wl.import.tip': { en: 'Restore watchlists from a JSON backup', vi: 'Khôi phục watchlist từ file JSON sao lưu' },
  'wl.empty': { en: 'No symbols yet — add some above.', vi: 'Chưa có mã nào — thêm ở phía trên.' },
  'wl.screenall': { en: 'Screen All', vi: 'Lọc tất cả' },
  // Trade planner
  'wl.plan.title': { en: 'Trade Planner', vi: 'Trade Plan' },
  'wl.plan.equity': { en: 'Account equity', vi: 'Vốn tài khoản' },
  'wl.plan.risk': { en: 'Risk %/trade', vi: '% rủi ro/lệnh' },
  'wl.plan.run': { en: '↻ Plan', vi: '↻ Lập plan' },
  'wl.plan.actionable': { en: 'Actionable', vi: 'Vào được lệnh' },
  'wl.plan.nosetup': { en: 'No setup', vi: 'Chưa có setup' },
  'wl.plan.entry': { en: 'Entry', vi: 'Entry' },
  'wl.plan.stop': { en: 'Stop', vi: 'Stop' },
  'wl.plan.target': { en: 'Target', vi: 'Target' },
  'wl.plan.shares': { en: 'Shares', vi: 'Số cổ' },
  'wl.plan.posval': { en: 'Position $', vi: 'Giá trị vị thế' },
  'wl.plan.riskamt': { en: 'Risk $ (pct)', vi: 'Rủi ro $ (%)' },
  'wl.plan.possize': { en: 'Position size', vi: 'Size vị thế' },
  'wl.plan.custom': { en: 'Custom', vi: 'Tùy chỉnh' },
  'wl.plan.useacct': { en: 'Use account cash', vi: 'Dùng tiền mặt tài khoản' },
  'wl.plan.manualeq': { en: 'Manual equity', vi: 'Tự nhập vốn' },
  'wl.plan.eqfromacct': {
    en: 'From the chosen account — edit it there',
    vi: 'Lấy từ tài khoản đã chọn — muốn sửa thì sửa ở đó',
  },
  // The Buy form's plan half. The grade is an OVERRIDE now that the checklist scores the
  // trade, and the label has to say so — a box labelled "Rating" invites the user to pick
  // the letter the app just spent 26 criteria computing.
  'pf.buy.gradeover': { en: 'Grade (override)', vi: 'Hạng (tự chọn)' },
  'pf.buy.gradeauto': { en: '— Auto (from score)', vi: '— Tự động (theo điểm)' },
  'pf.buy.plannote': { en: 'Plan note — saved with the trade', vi: 'Ghi chú plan — lưu kèm giao dịch' },
  // The tooltip says the plan survives, because that is what makes this button safe to press:
  // the checklist and the note are stored under the symbol, not in the form.
  'pf.buy.reset': { en: 'Reset', vi: 'Làm lại' },
  'pf.buy.resettitle': {
    en: 'Clear the form and unchoose this stock. The trade plan itself is kept — type the ticker again and its checklist, grade and note come back.',
    vi: 'Xoá form và bỏ chọn mã này. Trade plan vẫn được giữ — nhập lại mã là checklist, hạng và ghi chú hiện lại.',
  },
  // The transaction row's plan button. "Frozen" / "lúc mua" is the whole point of the label:
  // this is not the symbol's current plan, it is the one the trade was actually made on, and a
  // user who expects to edit it here would read the document as if it were still live.
  'pf.tx.plan': { en: 'Plan', vi: 'Kế hoạch' },
  'pf.tx.plantitle': {
    en: 'Show the trade plan this position was bought on — the checklist, grade and levels as they stood at the buy, unchanged since',
    vi: 'Xem trade plan lúc mua vị thế này — checklist, hạng và các mức giá giữ nguyên như lúc mua',
  },
  'pf.tx.planttl': { en: 'Trade plan at the buy', vi: 'Kế hoạch lúc mua' },
  'pf.tx.planprint': { en: 'Print / Save PDF', vi: 'In / Lưu PDF' },
  'pf.tx.planclose': { en: 'Close', vi: 'Đóng' },
  // Not `pf.buy.*` or `wl.plan.*`: the Buy form and the Trade Planner print the same report
  // from the same module, so one label rather than two that can drift apart.
  'plan.print': { en: 'Print plan', vi: 'In kế hoạch' },
  'plan.printtitle': {
    en: 'Download this trade plan as a standalone HTML file — open it and print to save as PDF',
    vi: 'Tải trade plan này về thành file HTML riêng — mở ra rồi in để lưu PDF',
  },
  // The user's "doi khi minh chi muon xem thoi chu khong muon print": the same document, read
  // on screen. The viewer carries its own print button, so this is not a lesser version of it.
  'plan.view': { en: 'View plan', vi: 'Xem kế hoạch' },
  'plan.viewtitle': {
    en: 'Read the full trade plan on screen — with a print button, if you want it after all',
    vi: 'Xem toàn bộ trade plan trên màn hình — có sẵn nút in nếu cần',
  },
  'plan.viewttl': { en: 'Trade plan', vi: 'Trade plan' },
  'wl.plan.cfg': { en: 'Playbook', vi: 'Playbook' },
  'wl.plan.cfgtitle': {
    en: 'Change the playbook’s numbers: stops, targets, size per setup, and where A/B/C fall',
    vi: 'Chỉnh các thông số của playbook: stop, target, size theo từng setup, và ngưỡng A/B/C',
  },
  'wl.plan.nocash': {
    en: 'Not enough cash: needs {need} but only {have} available (short {over}). Reduce the position size or shares.',
    vi: 'Không đủ tiền: cần {need} nhưng chỉ còn {have} (thiếu {over}). Giảm size hoặc số cổ.',
  },
  'wl.plan.riskpos': { en: 'Risk $ (of pos.)', vi: 'Rủi ro $ (trên vị thế)' },
  'wl.plan.riskeq': { en: 'Risk % of equity', vi: '% rủi ro trên vốn' },
  'wl.plan.note': { en: 'Note', vi: 'Ghi chú' },
  'wl.plan.noteph': { en: 'Plan notes — trigger, invalidation, context…', vi: 'Ghi chú plan — điểm kích hoạt, điều kiện huỷ, bối cảnh…' },
  // The playbook half of the planner: which rule row, and how much conviction.
  'wl.plan.setup': { en: 'Setup', vi: 'Setup' },
  'wl.plan.nosetupopt': { en: '— none', vi: '— chưa chọn' },
  // 'wl.plan.grade' and 'wl.plan.nograde' were removed with the manual A–D dropdown. The
  // old blank option read "— none (full size)", which is now actively wrong: leaving the
  // override blank does not mean ungraded, it means "use the score".
  // The grade is now SCORED from criteria, so the dropdown is an override rather than the
  // input. The wording has to say so, or the user will read the blank option as "ungraded"
  // and wonder why the card shows a B.
  'wl.plan.gradeover': { en: 'Grade override', vi: 'Tự chọn hạng' },
  'wl.plan.gradeauto': { en: '— use the score', vi: '— theo điểm' },
  'wl.plan.gradesize': { en: '{pct}% of full size', vi: '{pct}% size đầy đủ' },
  'wl.plan.gradeoverridden': { en: 'overridden (scored {auto})', vi: 'đã tự chọn (điểm chấm: {auto})' },
  'wl.plan.criteria': { en: 'Criteria {n}/{m}', vi: 'Tiêu chí {n}/{m}' },
  'wl.plan.gradethin': {
    en: 'Not enough measured yet to set a letter — planned at full size. Pick a setup and an entry.',
    vi: 'Chưa đủ dữ liệu để xếp hạng — tạm tính full size. Hãy chọn setup và entry.',
  },
  'wl.plan.critfoot': {
    en: 'Ticks are measured from the bars and are not editable. The questions below them are yours — click an answer again to unset it; unanswered questions do not count against the score.',
    vi: 'Các ô tích do app tự đo từ dữ liệu giá, không sửa được. Câu hỏi bên dưới là phần của bạn — bấm lại vào câu trả lời để bỏ chọn; câu chưa trả lời không bị trừ điểm.',
  },
  'wl.plan.yes': { en: 'Yes', vi: 'Có' },
  'wl.plan.no': { en: 'No', vi: 'Không' },
  // The subtraction, in the user's own framing. Shown on the card and not only in the
  // Note, because a grade that changes the size without showing its arithmetic is
  // indistinguishable from a grade that does nothing.
  'wl.plan.gradedfrom': {
    en: 'Full size {full} → {pct} for this grade → {now}',
    vi: 'Full size {full} → {pct} theo hạng này → {now}',
  },
  'wl.plan.frombook': { en: 'Playbook', vi: 'Playbook' },
  // Was `usdlevels`, a fixed sentence: the boxes now follow the €/$ toggle, because the user
  // buys these names in euros most of the time and a stop has to be typeable in the currency
  // the broker quotes.
  'wl.plan.levelccy': {
    en: 'Entry, stop and target are in {ccy}',
    vi: 'Entry, stop và target tính bằng {ccy}',
  },
  'wl.plan.ccytitle': {
    en: 'Switch this panel between € and $ — the prices in the boxes convert with it, at the trade date’s rate',
    vi: 'Chuyển bảng này giữa € và $ — giá trong các ô cũng quy đổi theo tỷ giá ngày giao dịch',
  },
  'wl.plan.ccynorate': {
    en: 'No EUR/USD rate loaded yet, so nothing can be converted — press ↻ Update on the Portfolio tab',
    vi: 'Chưa có tỷ giá EUR/USD nên chưa quy đổi được — bấm ↻ Cập nhật ở tab Danh mục',
  },
  'wl.plan.picksetup': {
    en: 'Pick a <b>Setup</b> to get the stop, the target and the share count from the playbook.',
    vi: 'Chọn <b>Setup</b> để playbook tính stop, target và số cổ.',
  },
  'wl.plan.nolevels': {
    en: 'No stop level below this entry for this setup — set the stop yourself.',
    vi: 'Setup này không có mức stop nào dưới entry — hãy tự đặt stop.',
  },
  'wl.plan.costbasis': {
    en: 'no prices cached for this account, so equity is at cost — run ↻ Update on Portfolio',
    vi: 'tài khoản này chưa có giá, nên vốn đang tính theo giá vốn — bấm ↻ Cập nhật ở tab Danh mục',
  },
  'wl.plan.manualnote': {
    en: 'no account chosen, so the size assumes no closed trades yet (the learning rung)',
    vi: 'chưa chọn tài khoản, nên size được tính như chưa đóng lệnh nào (bậc mới học)',
  },

  // Opening the planner for one name. Two buttons, two places, same panel: the ✕ on a
  // watchlist row's 📋 and the 📋 on the stock page.
  'wl.plan.one': { en: 'Trade plan for this stock only', vi: 'Trade plan chỉ cho mã này' },
  'wl.plan.here': { en: 'Plan this stock here on this page', vi: 'Lập plan cho mã này ngay tại đây' },

  // The trade date. Everything downstream hangs off it: the FX rate used to convert the
  // fill, the date the lot is booked under, and the date printed on the frozen report.
  'wl.plan.date': { en: 'Trade date', vi: 'Ngày giao dịch' },
  'wl.plan.datetitle': {
    en: 'Leave as today, or pick a past day — the whole plan is then recomputed as it stood on that date (and the EUR/USD rate of that day is the one used). On a stock page the page itself follows the date too.',
    vi: 'Để mặc định là hôm nay, hoặc chọn một ngày trong quá khứ — cả plan sẽ được tính lại như vào ngày đó (dùng luôn tỷ giá EUR/USD của ngày đó). Ở trang cổ phiếu, cả trang cũng chuyển theo ngày đó.',
  },
  'wl.plan.todaytitle': {
    en: 'Back to today — the plan, and the stock page around it, return to live data.',
    vi: 'Về hôm nay — plan và trang cổ phiếu xung quanh trở lại dữ liệu hiện tại.',
  },

  // ── Planning a past date ──────────────────────────────────────────────────
  // What CAN be replayed is everything the bars decide; what CANNOT is the money, because
  // there is no history of the account's equity to go back to. Both are said out loud.
  'wl.plan.asof': { en: 'As of {date}', vi: 'Tại ngày {date}' },
  // The chart is NOT in this list any more, and the difference is the point: since the window
  // became six months AROUND the trade date, the picture shows what happened next while the
  // judgement still cannot. Saying "and chart" here would have been a false claim to the user.
  'wl.plan.asofbars': {
    en: 'setup, levels and grade are computed from the bars up to that date — nothing after it is used; the chart also shows the weeks after, so the outcome can be seen',
    vi: 'setup, các mức giá và hạng đều tính từ dữ liệu đến hết ngày đó — không dùng gì sau ngày đó; riêng chart có hiện thêm vài tuần sau để thấy kết quả',
  },
  'wl.plan.asofmoney': {
    en: '⚠ money is TODAY’S: equity, cash, open risk and the position count come from the account as it stands now',
    vi: '⚠ tiền là số của HÔM NAY: vốn, tiền mặt, rủi ro đang mở và số vị thế đều lấy từ tài khoản hiện tại',
  },
  // ── Earnings dots under the plan chart ───────────────────────────────────
  // The user's "the graph nen co earning date as well neu trong timeframe". A purple E with no
  // caption is a mystery glyph, and the Nasdaq feed's four-quarter limit has to be stated or a
  // back-dated plan with no dots in range looks like the feature is broken rather than out of data.
  'wl.plan.earn': {
    en: '⬤ E = earnings report date',
    vi: '⬤ E = ngày công bố KQKD',
  },
  'wl.plan.earnsrc': {
    en: 'source: Nasdaq — US listings, last 4 quarters only',
    vi: 'nguồn: Nasdaq — chỉ cổ phiếu Mỹ, chỉ 4 quý gần nhất',
  },
  'wl.plan.earnnone': {
    en: 'no report date falls inside this window — Nasdaq only publishes the last 4 quarters, so a plan from further back gets no dots',
    vi: 'không có ngày công bố KQKD nào trong khung này — Nasdaq chỉ có 4 quý gần nhất, nên plan lùi xa hơn sẽ không có điểm nào',
  },
  'wl.plan.asofnoregime': {
    en: '⚠ no market read for that date (SPY history does not reach back far enough), so the two market criteria stay unanswered',
    vi: '⚠ không có dữ liệu thị trường cho ngày đó (lịch sử SPY không đủ xa), nên hai tiêu chí về thị trường để trống',
  },

  // ── Asking ChatGPT the criteria the app cannot measure ────────────────────
  // Five of the twenty-six criteria need reading rather than measuring, and they are the ones
  // that sit unanswered and cost the trade its letter. The button asks exactly those, as of the
  // trade date, and takes the reply back in — see `portfolio/criteriaAsk.ts`.
  'wl.plan.ask': { en: 'Ask ChatGPT', vi: 'Hỏi ChatGPT' },
  'wl.plan.asktitle': {
    en: 'Ask ChatGPT the checklist questions this app cannot measure — as of the trade date — then paste the answer back to tick them and file the summary in the note',
    vi: 'Hỏi ChatGPT những câu trong checklist mà app không tự đo được — tính tại ngày giao dịch — rồi dán câu trả lời vào để tự tích và lưu phần tóm tắt vào ghi chú',
  },
  'wl.plan.ask.ttl': {
    en: 'The questions the app cannot measure',
    vi: 'Những câu app không tự đo được',
  },
  'wl.plan.ask.lead': {
    en: 'ChatGPT is asked to research these using only what existed on or before <b>{date}</b>, answer each YES / NO / UNKNOWN with its evidence, and finish with a summary. Paste the reply below and the answers are ticked for you.',
    vi: 'ChatGPT sẽ chỉ dùng thông tin có từ ngày <b>{date}</b> trở về trước, trả lời từng câu CÓ / KHÔNG / KHÔNG RÕ kèm dẫn chứng, rồi tóm tắt lại. Dán câu trả lời vào ô dưới, app sẽ tự tích giúp bạn.',
  },
  'wl.plan.ask.paste': { en: 'Paste ChatGPT’s answer', vi: 'Dán câu trả lời của ChatGPT' },
  'wl.plan.ask.pasteph': {
    en: 'Paste the whole reply — the ANSWERS block, the explanations and the summary.',
    vi: 'Dán toàn bộ câu trả lời — khối ANSWERS, phần giải thích và đoạn tóm tắt.',
  },
  'wl.plan.ask.apply': { en: 'Apply answers', vi: 'Áp dụng' },
  'wl.plan.ask.cancel': { en: 'Cancel', vi: 'Hủy' },
  // Refusing to close rather than swallowing the paste: see `openCriteriaAsk`.
  'wl.plan.ask.none': {
    en: 'Nothing recognised in that text. The reply needs a line per question, like: [epsGrowth]: YES — EPS +41% in the Feb quarter',
    vi: 'Không nhận ra được gì trong đoạn này. Câu trả lời cần mỗi câu hỏi một dòng, kiểu: [epsGrowth]: YES — EPS +41% trong quý tháng 2',
  },
  'wl.plan.ask.applied': { en: '{n} answered ✓', vi: 'Đã trả lời {n} câu ✓' },
  // The heading written into the plan's note above the answers and the summary.
  'wl.plan.ask.notehead': {
    en: 'Criteria research — as of {date}',
    vi: 'Nghiên cứu tiêu chí — tại ngày {date}',
  },

  // ── How the trade ended, and filing it in the journal ─────────────────────
  // The user's "nen co them cai exit price … con neu ma buy thi khong can nhe … va exit nen co
  // mot cai cho de bo ly do vao". Folded away on today's date, unfolded on a past one, and
  // labelled optional in both — nothing here gates the Buy button. See `portfolio/planExit.ts`.
  'wl.plan.exit': { en: 'How it ended', vi: 'Kết cục lệnh' },
  'wl.plan.exit.opt': {
    en: 'optional — only needed to file a case study',
    vi: 'không bắt buộc — chỉ cần khi lưu thành case study',
  },
  'wl.plan.exit.lead': {
    en: 'Fill this in when the trade is over and you want to keep it as a case study. Leave it empty to buy — nothing here affects the plan, the grade or the size.',
    vi: 'Điền khi lệnh đã đóng và bạn muốn giữ lại làm case study. Chỉ mua thì để trống — phần này không ảnh hưởng gì đến plan, hạng hay size.',
  },
  'wl.plan.exit.date': { en: 'Exit date', vi: 'Ngày bán' },
  'wl.plan.exit.price': { en: 'Exit price', vi: 'Giá bán' },
  'wl.plan.exit.reason': { en: 'Why you got out', vi: 'Vì sao bán' },
  'wl.plan.exit.noreason': { en: '— pick a reason', vi: '— chọn lý do' },
  'wl.plan.exit.cfg.title': {
    en: 'Manage the reason list — add your own, and they show up here and in Sell',
    vi: 'Quản lý danh sách lý do — tự thêm lý do riêng, chúng sẽ hiện ở đây và ở phần Bán',
  },
  'wl.plan.exit.note': { en: 'In your own words', vi: 'Ghi theo cách của bạn' },
  'wl.plan.exit.noteph': {
    en: 'e.g. gapped through the stop on earnings; I sold the open rather than wait',
    vi: 'VD: gap xuyên qua stop sau BCTC; bán luôn đầu phiên chứ không đợi',
  },
  'wl.plan.exit.nopx': {
    en: 'Enter an exit price and this fills in: R, percent, money and days held.',
    vi: 'Nhập giá bán là phần này tự điền: R, phần trăm, số tiền và số ngày giữ.',
  },
  'wl.plan.exit.outcome': { en: 'Outcome', vi: 'Kết quả' },
  'wl.plan.exit.pnl': { en: 'Money', vi: 'Lãi/lỗ' },
  'wl.plan.exit.held': { en: 'Days held', vi: 'Số ngày giữ' },
  'wl.plan.exit.out.win': { en: 'Win', vi: 'Thắng' },
  'wl.plan.exit.out.loss': { en: 'Loss', vi: 'Thua' },
  'wl.plan.exit.out.open': { en: 'Still open', vi: 'Đang mở' },
  'wl.plan.exit.out.scratch': { en: 'Scratch', vi: 'Hoà vốn' },

  // Filing the card in the Case Studies journal — the existing tab, not a second one.
  'wl.plan.case': { en: 'Save as case study', vi: 'Lưu thành case study' },
  'wl.plan.case.title': {
    en: 'File this plan in the Case Studies tab — with the chart, the grade, the whole scorecard and the exit, frozen as they are now',
    vi: 'Lưu plan này vào tab Case Study — kèm chart, hạng, toàn bộ bảng chấm điểm và phần thoát lệnh, giữ nguyên như hiện tại',
  },
  'wl.plan.case.ttl': { en: 'File this as a case study', vi: 'Lưu thành case study' },
  'wl.plan.case.lead': {
    en: 'The plan, the scorecard and the grade are copied in and never rewritten — so the study still shows what was decided before the outcome was known. Prices are converted to USD, which is what the journal stores.',
    vi: 'Plan, bảng chấm điểm và hạng được sao lại và không bao giờ bị sửa — nên case study vẫn cho thấy bạn đã quyết định gì trước khi biết kết quả. Giá được quy sang USD, vì nhật ký lưu bằng USD.',
  },
  'wl.plan.case.name': { en: 'Title', vi: 'Tiêu đề' },
  'wl.plan.case.open': {
    en: 'No exit price, so this is filed as still open. You can add the exit later in the Case Studies tab.',
    vi: 'Chưa có giá bán nên case study được lưu ở trạng thái đang mở. Có thể thêm phần thoát lệnh sau ở tab Case Study.',
  },
  'wl.plan.case.save': { en: 'File it', vi: 'Lưu' },
  'wl.plan.case.saved': {
    en: 'Filed — open the Case Studies tab to see it.',
    vi: 'Đã lưu — mở tab Case Study để xem.',
  },
  'wl.plan.case.ok': { en: 'Filed ✓', vi: 'Đã lưu ✓' },
  'wl.plan.case.noentry': {
    en: 'Enter an entry price first — the study’s chart is drawn around it.',
    vi: 'Nhập entry trước — chart của case study được vẽ quanh mức này.',
  },

  // Buying straight from the plan.
  'wl.plan.buy': { en: '✓ Buy this plan', vi: '✓ Mua theo plan' },
  'wl.plan.buyready': {
    en: 'Buy {shares} {sym} into {acct} on {date}',
    vi: 'Mua {shares} {sym} vào {acct} ngày {date}',
  },
  'wl.plan.buyno.card': { en: 'plan not computed yet', vi: 'plan chưa được tính' },
  'wl.plan.buyno.acct': { en: 'choose an account first', vi: 'hãy chọn tài khoản trước' },
  'wl.plan.buyno.entry': { en: 'set an entry price', vi: 'hãy nhập entry' },
  'wl.plan.buyno.shares': { en: 'the share count is zero', vi: 'số cổ đang là 0' },
  'wl.plan.buyno.stop': {
    en: 'the stop is at or above the entry',
    vi: 'stop đang bằng hoặc cao hơn entry',
  },
  // A refusal, not a silent conversion at 1 — see `plannedPrice` in portfolio/writes.ts.
  'wl.plan.buyno.norate': {
    en: 'no EUR/USD rate for this date — run ↻ Update on Portfolio, then try again',
    vi: 'chưa có tỷ giá EUR/USD cho ngày này — bấm ↻ Cập nhật ở tab Danh mục rồi thử lại',
  },
  'wl.plan.buyno.gone': {
    en: 'that account no longer exists — pick another',
    vi: 'tài khoản này không còn nữa — hãy chọn tài khoản khác',
  },
  'wl.plan.buyttl': { en: 'Record this buy?', vi: 'Ghi lệnh mua này?' },
  'wl.plan.buyacct': { en: 'Account', vi: 'Tài khoản' },
  'wl.plan.buycost': { en: 'Cost', vi: 'Giá trị lệnh' },
  'wl.plan.buycash': { en: 'Cash after', vi: 'Tiền mặt còn lại' },
  'wl.plan.buyrate': { en: 'Rate used', vi: 'Tỷ giá áp dụng' },
  'wl.plan.buygrade': { en: 'Setup · grade', vi: 'Setup · hạng' },
  'wl.plan.buyok': { en: '✓ Record the buy', vi: '✓ Ghi nhận lệnh mua' },
  'wl.plan.buycancel': { en: 'Cancel', vi: 'Hủy' },
  'wl.plan.buydone': { en: '✓ Recorded into {acct}', vi: '✓ Đã ghi vào {acct}' },

  // Portfolio
  'pf.title': { en: 'Portfolio', vi: 'Danh mục' },
  'pf.sub': { en: 'Independent multi-account strategy testing. Cash, PnL and risk are per account.', vi: 'Test chiến lược trên nhiều tài khoản độc lập. Tiền mặt, lãi/lỗ và rủi ro tính riêng từng tài khoản.' },
  'pf.sub.overview': { en: 'Overview across all accounts. To update prices or clear cache, switch to an individual account.', vi: 'Tổng quan mọi tài khoản. Muốn cập nhật giá hay xóa cache, hãy mở từng tài khoản.' },
  'pf.overview': { en: 'Overview', vi: 'Tổng quan' },
  'pf.update': { en: 'Update', vi: 'Cập nhật' },
  'pf.updateall': { en: 'Update All', vi: 'Cập nhật hết' },
  'pf.clearcache': { en: '↺ Clear', vi: '↺ Xóa cache' },
  'pf.newacct': { en: '＋ New account', vi: '＋ Tài khoản mới' },
  'pf.editacct': { en: '✎ Edit account', vi: '✎ Sửa tài khoản' },
  'pf.delacct': { en: '✕ Delete account', vi: '✕ Xóa tài khoản' },
  'pf.selectacct': { en: 'Select account…', vi: 'Chọn tài khoản…' },
  'pf.clickacct': { en: 'Click an account name to open it.', vi: 'Bấm vào tên tài khoản để mở.' },
  'pf.addacct.hint': { en: 'Add another account (＋) to compare strategies side by side.', vi: 'Thêm tài khoản (＋) để so sánh các chiến lược song song.' },
  'pf.updating': { en: 'Updating', vi: 'Đang cập nhật' },
  'pf.updated.all': { en: 'accounts updated', vi: 'tài khoản đã cập nhật' },
  // The automatic refresh. It says which close it went to get, because the whole
  // point is that the reader can trust the numbers without pressing anything.
  'pf.auto.running': { en: 'Getting the close of', vi: 'Đang lấy giá đóng cửa ngày' },
  'pf.auto.done': { en: 'Prices as of', vi: 'Giá tính đến' },
  'pf.sec.openpos': { en: 'Open Positions', vi: 'Vị thế đang mở' },
  'pf.sec.openpos.hint': { en: 'click a ticker to open its chart', vi: 'bấm vào mã để xem chart' },
  'pf.sec.txhistory': { en: 'Transaction History', vi: 'Lịch sử giao dịch' },
  'pf.sec.orders': { en: 'Pending Orders', vi: 'Lệnh chờ' },
  'pf.sec.buy': { en: 'Buy / Sell', vi: 'Mua / Bán' },
  // `BUY_STOP` stays in both languages: it is the order type the broker takes, not a
  // word. This heading was hard-coded English until the section-heading pass.
  'pf.sec.pendingorder': { en: 'Pending BUY_STOP Order', vi: 'Lệnh chờ BUY_STOP' },
  'pf.unit.positions': { en: 'positions', vi: 'vị thế' },
  'pf.unit.nostop': { en: 'no stop', vi: 'chưa đặt stop' },
  'pf.unit.accounts': { en: 'accounts', vi: 'tài khoản' },
  'pf.col.ticker': { en: 'Ticker', vi: 'Mã' },
  'pf.col.shares': { en: 'Shares', vi: 'Số CP' },
  'pf.col.avgcost': { en: 'Avg cost', vi: 'Giá TB' },
  'pf.col.last': { en: 'Last', vi: 'Giá hiện tại' },
  'pf.col.value': { en: 'Value', vi: 'Giá trị' },
  'pf.col.unrealpnl': { en: 'Unreal. P&L', vi: 'Lãi/lỗ tạm tính' },
  'pf.col.risk': { en: 'Risk', vi: 'Rủi ro' },
  'pf.col.rmult': { en: 'R-mult.', vi: 'Số R' },
  'pf.riskfree': { en: 'Free', vi: 'Hết rủi ro' },
  'pf.kpi.invested': { en: 'Invested', vi: 'Đang đầu tư' },
  'pf.col.stop': { en: 'Stop', vi: 'Stop' },
  'pf.col.target': { en: 'Target', vi: 'Target' },
  'pf.col.days': { en: 'Days', vi: 'Ngày' },
  'pf.col.conc': { en: 'Conc.%', vi: 'Tỷ trọng %' },
  'pf.col.actions': { en: 'Actions', vi: 'Thao tác' },
  'pf.col.account': { en: 'Account', vi: 'Tài khoản' },
  'pf.col.return': { en: 'Return %', vi: 'Lợi nhuận %' },
  'pf.col.twr': { en: 'TWR %', vi: 'TWR %' },
  'pf.col.equity2': { en: 'Equity', vi: 'Vốn' },
  'pf.col.winrate': { en: 'Win rate', vi: 'Tỷ lệ thắng' },
  'pf.col.avgr': { en: 'Avg R', vi: 'R trung bình' },
  'pf.col.maxdd': { en: 'Max DD', vi: 'Max DD' },
  'pf.col.openrisk': { en: 'Open risk %', vi: 'Rủi ro đang mở %' },
  'pf.col.open': { en: 'Open', vi: 'Đang mở' },
  'pf.col.closed': { en: 'Closed', vi: 'Đã đóng' },
  'pf.col.status': { en: 'Status', vi: 'Trạng thái' },
  'pf.col.buyprice': { en: 'Buy Price', vi: 'Giá mua' },
  'pf.col.sellprice': { en: 'Sell Price', vi: 'Giá bán' },
  'pf.col.buydate': { en: 'Buy Date', vi: 'Ngày mua' },
  'pf.col.selldate': { en: 'Sell Date', vi: 'Ngày bán' },
  'pf.col.held': { en: 'Held', vi: 'Thời gian giữ' },
  'pf.col.realizedpnl': { en: 'Realized PnL', vi: 'Lãi/lỗ đã chốt' },
  'pf.col.pnlpct': { en: 'PnL %', vi: 'Lãi/lỗ %' },
  'pf.col.weight': { en: 'Weight', vi: 'Tỷ trọng' },
  'pf.col.pnlpctcap': { en: 'PnL % cap.', vi: '% L/L trên vốn' },
  'pf.col.note': { en: 'Note', vi: 'Ghi chú' },
  'pf.col.setup': { en: 'Setup', vi: 'Setup' },
  'pf.setup.title': { en: 'Setup & rating', vi: 'Setup & đánh giá' },
  'pf.setup.type': { en: 'Setup type', vi: 'Loại setup' },
  'pf.setup.rating': { en: 'Rating', vi: 'Đánh giá' },
  'pf.note.placeholder': { en: 'Note (optional) — add details later with ✎', vi: 'Ghi chú (không bắt buộc) — bấm ✎ để bổ sung sau' },
  'pf.note.label': { en: 'Note (optional)', vi: 'Ghi chú (không bắt buộc)' },
  'pf.note.title': { en: 'Transaction note', vi: 'Ghi chú giao dịch' },
  'pf.note.add': { en: 'Add note', vi: 'Thêm ghi chú' },
  'pf.note.edit': { en: 'Edit note', vi: 'Sửa ghi chú' },
  'pf.cash.adjust': { en: '± Cash', vi: '± Tiền mặt' },
  'pf.cash.adjusttitle': { en: 'Deposit or withdraw cash (dated)', vi: 'Nạp hoặc rút tiền (có ghi ngày)' },
  'pf.cash.type': { en: 'Type', vi: 'Loại' },
  'pf.cash.deposit': { en: 'Deposit', vi: 'Nạp tiền' },
  'pf.cash.withdraw': { en: 'Withdrawal', vi: 'Rút tiền' },
  'pf.cash.amount': { en: 'Amount', vi: 'Số tiền' },
  'pf.cash.date': { en: 'Date', vi: 'Ngày' },
  'pf.cash.note': { en: 'Note (optional)', vi: 'Ghi chú (không bắt buộc)' },
  'pf.cash.invalid': { en: 'Enter a positive amount (e.g. 5000).', vi: 'Nhập số tiền lớn hơn 0 (vd 5000).' },
  'pf.stat.initialcap': { en: 'Initial capital', vi: 'Vốn ban đầu' },
  'pf.stat.contributed': { en: 'Capital in', vi: 'Vốn đã nạp' },
  'pf.stat.twr': { en: 'TWR', vi: 'TWR' },
  'pf.stat.annualized': { en: 'p.a.', vi: '/năm' },
  'pf.stat.avgr': { en: 'Avg R', vi: 'R trung bình' },
  'pf.stat.maxdd': { en: 'Max drawdown', vi: 'Sụt giảm tối đa' },
  'pf.stat.hold': { en: 'Avg holding period', vi: 'Thời gian giữ TB' },
  'pf.stat.totalcap': { en: 'Total capital', vi: 'Tổng vốn' },
  'pf.stat.totalequity': { en: 'Total equity', vi: 'Tổng tài sản' },
  'pf.stat.totalcash': { en: 'Total cash', vi: 'Tổng tiền mặt' },
  'pf.stat.totalpnl': { en: 'Total PnL', vi: 'Tổng lãi/lỗ' },
  'pf.stat.best': { en: 'Best', vi: 'Tốt nhất' },
  'pf.stat.worst': { en: 'Worst', vi: 'Tệ nhất' },
  'pf.stat.avgwinrate': { en: 'Avg win rate', vi: 'Tỷ lệ thắng TB' },
  'pf.stat.openclosed': { en: 'Open / Closed', vi: 'Đang mở / Đã đóng' },
  'pf.stat.avghold': { en: 'Avg holding', vi: 'Giữ TB' },
  'pf.nopos': { en: 'No open positions.', vi: 'Chưa có vị thế nào đang mở.' },
  'pf.btn.stop': { en: 'Stop', vi: 'Stop' },
  'pf.btn.target': { en: 'Target', vi: 'Target' },
  'pf.btn.sell': { en: 'Sell', vi: 'Bán' },
  'pf.btn.chart': { en: 'Chart', vi: 'Chart' },
  'pf.buy.ticker': { en: 'Ticker', vi: 'Mã' },
  'pf.buy.shares': { en: 'Shares', vi: 'Số lượng' },
  'pf.buy.price': { en: 'Price', vi: 'Giá' },
  'pf.buy.date': { en: 'Date', vi: 'Ngày' },
  'pf.buy.stop': { en: 'Stop', vi: 'Stop' },
  'pf.buy.target': { en: 'Target', vi: 'Target' },
  'pf.buy.btn': { en: 'Buy', vi: 'Mua' },
  'pf.sell.btn': { en: 'Sell', vi: 'Bán' },
  'pf.stat.equity': { en: 'Equity', vi: 'Vốn' },
  'pf.stat.cash': { en: 'Cash', vi: 'Tiền mặt' },
  'pf.stat.invested': { en: 'Invested', vi: 'Đang đầu tư' },
  'pf.stat.pnl': { en: 'Total P&L', vi: 'Tổng lãi/lỗ' },
  'pf.stat.realizedpnl': { en: 'Realized P&L', vi: 'Lãi/lỗ đã chốt' },
  'pf.stat.unrealpnl': { en: 'Unrealized P&L', vi: 'Lãi/lỗ tạm tính' },
  'pf.stat.openpos': { en: 'Open positions', vi: 'Vị thế đang mở' },
  'pf.stat.winrate': { en: 'Win rate', vi: 'Tỷ lệ thắng' },
  'pf.stat.avgwin': { en: 'Avg win', vi: 'Lãi TB' },
  'pf.stat.avgloss': { en: 'Avg loss', vi: 'Lỗ TB' },
  'pf.stat.expectancy': { en: 'Expectancy', vi: 'Kỳ vọng' },
  'pf.stat.risk': { en: 'Total risk', vi: 'Tổng rủi ro' },
  'pf.chart.equity': { en: 'Equity', vi: 'Vốn' },
  'pf.chart.candle': { en: 'Candle', vi: 'Nến' },
  'pf.chart.twr': { en: 'TWR %', vi: 'TWR %' },
  'pf.chart.twr.title': {
    en: 'Time-weighted return — deposits and withdrawals removed, so only market moves show',
    vi: 'Lợi nhuận TWR — đã bỏ phần nạp/rút, chỉ còn biến động của thị trường',
  },
  'pf.nodata': { en: 'No data yet — click Update first', vi: 'Chưa có dữ liệu — bấm Cập nhật trước' },
  'pf.nodata.overview': { en: 'No data yet — update individual accounts first', vi: 'Chưa có dữ liệu — hãy cập nhật từng tài khoản trước' },
  'pf.loading': { en: 'Loading…', vi: 'Đang tải…' },
  'pf.failload': { en: 'Failed to load data', vi: 'Không tải được dữ liệu' },
  'pf.unavailable': { en: 'Chart unavailable', vi: 'Không hiện được chart' },
  'pf.overview.combined': { en: 'Combined Portfolio', vi: 'Danh mục tổng hợp' },
  'pf.overview.compare': { en: 'Account Comparison', vi: 'So sánh tài khoản' },

  // Detail modal
  'detail.quality': { en: 'Quality', vi: 'Chất lượng' },
  'detail.analysis': { en: 'Analysis', vi: 'Phân tích' },
  'detail.pricehistory': { en: 'Price History', vi: 'Lịch sử giá' },
  'detail.fundtrend': { en: 'Fundamentals Trend', vi: 'Xu hướng chỉ số cơ bản' },
  'detail.fundamentals': { en: 'Fundamentals', vi: 'Chỉ số cơ bản' },
  'detail.about': { en: 'About', vi: 'Giới thiệu' },
  // `{sym}` sits mid-sentence in Vietnamese, so the ticker is substituted by the
  // caller rather than concatenated onto either end.
  'wl.addto': { en: 'Add {sym} to…', vi: 'Thêm {sym} vào…' },

  // Backtest
  'backtest.title': { en: 'Backtest', vi: 'Backtest' },
  'backtest.sub': { en: 'Simulate trading strategies on historical daily bars.', vi: 'Mô phỏng chiến lược giao dịch trên dữ liệu nến ngày quá khứ.' },
  'backtest.note': {
    en: 'Focused backtest: enter 1–10 symbols. Daily bars; no-lookahead. Large universes re-fetch each run (no persistent cache).',
    vi: 'Backtest tập trung: nhập 1–10 mã. Nến ngày, không dùng dữ liệu tương lai. Danh sách lớn sẽ tải lại mỗi lần chạy (không lưu cache).',
  },
  'backtest.strategy': { en: 'Strategy', vi: 'Chiến lược' },
  'backtest.strat.vcp': { en: 'VCP Breakout', vi: 'VCP Breakout' },
  'backtest.strat.vcp.desc': {
    en: 'Enters when a VCP base forms and arms a buy-stop at the pivot. Exits below EMA20 or on ATR stop. Needs a 30%+ prior advance + 2+ contracting pullbacks — rare on a single stock per year.',
    vi: 'Vào lệnh khi base VCP hình thành, đặt buy-stop tại pivot. Thoát khi giá thủng EMA20 hoặc dính stop ATR. Cần nhịp tăng trước đó 30%+ và ≥2 nhịp chỉnh co hẹp dần — mỗi mã một năm hiếm khi có.',
  },
  'backtest.strat.momentum': { en: 'Momentum Rebalancing', vi: 'Xoay vòng theo momentum' },
  'backtest.strat.momentum.desc': {
    en: 'Enters when momentum score ≥65 and price is above EMA50. Exits when score drops below 45 or price breaks the exit EMA. Good for trending stocks over longer periods.',
    vi: 'Vào lệnh khi điểm momentum ≥65 và giá trên EMA50. Thoát khi điểm rơi dưới 45 hoặc giá thủng EMA thoát. Hợp với mã có xu hướng rõ, nắm giữ dài hơn.',
  },
  'backtest.symbols': { en: 'Symbols', vi: 'Mã' },
  'backtest.period': { en: 'History', vi: 'Lịch sử' },
  'backtest.risk': { en: 'Risk %/trade', vi: 'Rủi ro %/lệnh' },
  'backtest.capital': { en: 'Capital', vi: 'Vốn' },
  'backtest.run': { en: 'Run Backtest', vi: 'Chạy Backtest' },
  'backtest.running': { en: 'Running simulation…', vi: 'Đang mô phỏng…' },
  'backtest.needsymbols': { en: 'Enter at least one symbol.', vi: 'Nhập ít nhất một mã.' },
  'backtest.from': { en: 'From', vi: 'Từ ngày' },
  'backtest.to': { en: 'To', vi: 'Đến ngày' },
  'backtest.baddates': { en: 'From date must be before To date.', vi: 'Ngày bắt đầu phải trước ngày kết thúc.' },
  'backtest.nodata': { en: 'No symbol had enough history. Try a longer period or different symbols.', vi: 'Không mã nào đủ dữ liệu lịch sử. Thử khoảng thời gian dài hơn hoặc mã khác.' },
  'backtest.trades': { en: 'trades', vi: 'lệnh' },
  'backtest.notrades': { en: 'No trades were taken in this window.', vi: 'Không có lệnh nào trong khoảng này.' },
  'backtest.totalreturn': { en: 'Total Return', vi: 'Tổng lợi nhuận' },
  'backtest.maxdd': { en: 'Max Drawdown', vi: 'Sụt giảm tối đa' },
  'backtest.winrate': { en: 'Win Rate', vi: 'Tỷ lệ thắng' },
  'backtest.profitfactor': { en: 'Profit Factor', vi: 'Profit factor' },
  'backtest.expectancy': { en: 'Expectancy', vi: 'Kỳ vọng' },
  'backtest.avgwin': { en: 'Avg Win', vi: 'Lãi TB' },
  'backtest.avgloss': { en: 'Avg Loss', vi: 'Lỗ TB' },
  'backtest.avghold': { en: 'Avg Hold', vi: 'Nắm giữ TB' },
  'backtest.equity': { en: 'Equity Curve', vi: 'Đường vốn' },
  'backtest.tradelog': { en: 'Trade Log', vi: 'Nhật ký giao dịch' },

  // Export
  'export.rows': { en: 'rows', vi: 'dòng' },
  'export.csv': { en: '⬇ CSV', vi: '⬇ CSV' },
  'export.html': { en: '⬇ HTML', vi: '⬇ HTML' },

  // Calendar (catalysts)
  'cal.title': { en: 'Event Calendar', vi: 'Lịch sự kiện' },
  'cal.sub': {
    en: 'Earnings and market-moving events for the next 30 days.',
    vi: 'Lịch báo cáo KQKD và các sự kiện có thể làm giá biến động trong 30 ngày tới.',
  },
  'cal.refresh': { en: 'Refresh', vi: 'Làm mới' },
  'cal.building': { en: 'Building calendar', vi: 'Đang tạo lịch' },
  'cal.upcoming': { en: 'Next 7 days', vi: '7 ngày tới' },
  'cal.noevents': { en: 'No events', vi: 'Không có sự kiện' },
  'cal.nodata': { en: 'No data yet', vi: 'Chưa có dữ liệu' },
  'cal.nodata.tip': {
    en: 'The source calendar does not reach this far ahead yet — this is missing data, not an empty day.',
    vi: 'Nguồn lịch chưa có dữ liệu xa đến vậy — đây là thiếu dữ liệu, không phải ngày trống.',
  },
  'cal.partial': { en: 'partial data', vi: 'dữ liệu chưa đầy đủ' },
  'cal.scope.all': { en: 'All market', vi: 'Toàn thị trường' },
  'cal.scope.watchlist': { en: 'Watchlists', vi: 'Watchlist' },
  'cal.scope.portfolio': { en: 'Portfolio', vi: 'Danh mục' },
  'cal.mincap': { en: 'Min. market cap', vi: 'Vốn hóa tối thiểu' },
  'cal.kind.earnings': { en: 'Earnings', vi: 'KQKD' },
  'cal.kind.dividend': { en: 'Ex-dividend', vi: 'GDKHQ cổ tức' },
  'cal.kind.split': { en: 'Splits', vi: 'Chia tách CP' },
  'cal.kind.ipo': { en: 'IPOs', vi: 'IPO' },
  'cal.kind.lockup': { en: 'Lockup expiry', vi: 'Hết hạn lockup' },
  'cal.kind.macro': { en: 'Macro', vi: 'Vĩ mô' },
  'cal.kind.expiry': { en: 'Expiry', vi: 'Đáo hạn' },
  'cal.kind.rebalance': { en: 'Rebalance', vi: 'Tái cân bằng' },
  'cal.kind.custom': { en: 'My events', vi: 'Sự kiện của tôi' },
  'cal.timing.bmo': { en: 'Before open', vi: 'Trước giờ mở cửa' },
  'cal.timing.amc': { en: 'After close', vi: 'Sau giờ đóng cửa' },
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
    vi: 'Không mã nào bạn đang giữ có báo cáo trong khoảng này.',
  },
  'cal.ofcapital': { en: 'of capital', vi: 'trên tổng vốn' },
  'cal.holdings': { en: 'holdings', vi: 'vị thế' },
  // Units for the chips beside a section heading. They are the quiet half of
  // "8 days" / "12 names", so they stay lower-case and singular-agnostic.
  'cal.unit.days': { en: 'days', vi: 'ngày' },
  'cal.unit.names': { en: 'names', vi: 'mã' },
  'cal.unit.events': { en: 'events', vi: 'sự kiện' },
  'cal.risk.peak': { en: 'peak day', vi: 'ngày rủi ro nhất' },
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
    vi: 'Đã tải lịch nhưng bộ nhớ trình duyệt đầy nên không lưu được. Dữ liệu bên dưới vẫn là mới nhất.',
  },

  // Calendar — the three analytical sections (attention / VCP / mean reversion)
  // Column headers. 'cal.event.symbol' is the *form field* label ("Symbol
  // (optional)") and reads wrong in a table head, so these are separate.
  'col.symbol': { en: 'Symbol', vi: 'Mã' },
  'col.price': { en: 'Price', vi: 'Giá' },
  'cal.watch.title': { en: 'What to watch', vi: 'Đáng chú ý' },
  'cal.watch.sub': {
    en: 'Three reads over the curated US universe, from one scan a day: what needs attention now, what is consolidating, and what has fallen too far below its mean.',
    vi: 'Ba góc nhìn trên rổ cổ phiếu Mỹ đã chọn lọc, từ một lần quét mỗi ngày: mã nào cần để ý ngay, mã nào đang tích lũy, và mã nào đã rơi quá xa dưới đường trung bình.',
  },
  'cal.watch.run': { en: 'Run the scan', vi: 'Chạy quét' },
  'cal.watch.rerun': { en: 'Re-scan', vi: 'Quét lại' },
  'cal.watch.stop': { en: 'Stop', vi: 'Dừng' },
  'cal.watch.prompt': {
    en: 'These sections need one pass over ~540 stocks. It is not run automatically — press Run once and the result is kept for the rest of the day, on every device.',
    vi: 'Các mục này cần quét khoảng 540 mã. App không tự chạy — bấm Chạy quét một lần, kết quả được giữ suốt ngày trên mọi thiết bị.',
  },
  'cal.watch.scanning': { en: 'Scanning', vi: 'Đang quét' },
  'cal.watch.stopped': { en: 'Scan stopped.', vi: 'Đã dừng quét.' },
  'cal.watch.failed': {
    en: 'The scan could not finish. Check the connection and try again.',
    vi: 'Không quét xong được. Kiểm tra kết nối rồi thử lại.',
  },

  'cal.top.title': { en: 'Top 7 to watch', vi: '7 mã cần chú ý nhất' },
  'cal.top.sub': {
    en: 'Ranked by what is coming (dated catalysts) against where the stock is (setup, momentum) — and whether you own it.',
    vi: 'Xếp hạng theo sự kiện sắp tới (đã có ngày) đối chiếu với vị trí hiện tại của mã (setup, momentum) — và bạn có đang giữ mã đó không.',
  },
  'cal.top.none': {
    en: 'Nothing stands out in this window.',
    vi: 'Không có mã nào nổi bật trong khoảng này.',
  },
  'cal.top.score': { en: 'Attention', vi: 'Mức chú ý' },
  'cal.top.next': { en: 'Next event', vi: 'Sự kiện tới' },
  'cal.top.why': { en: 'Why', vi: 'Vì sao' },
  // Reason chips — one per AttentionReason tag.
  'cal.why.held': { en: 'You hold it', vi: 'Bạn đang giữ' },
  'cal.why.watchlist': { en: 'On a watchlist', vi: 'Có trong watchlist' },
  'cal.why.earnings-soon': { en: 'Reports soon', vi: 'Sắp ra KQKD' },
  'cal.why.event-soon': { en: 'Event soon', vi: 'Sắp có sự kiện' },
  'cal.why.high-impact': { en: 'High impact', vi: 'Tác động lớn' },
  'cal.why.multi-event': { en: 'Several events', vi: 'Nhiều sự kiện' },
  'cal.why.strong-setup': { en: 'Strong setup', vi: 'Setup đẹp' },
  'cal.why.near-pivot': { en: 'At the pivot', vi: 'Sát pivot' },
  'cal.why.strong-momentum': { en: 'Strong momentum', vi: 'Momentum mạnh' },
  'cal.why.unconfirmed-date': { en: 'Date unconfirmed', vi: 'Chưa chốt ngày' },

  'cal.vcp.title': { en: 'Consolidating after an advance (VCP)', vi: 'Tích lũy sau nhịp tăng (VCP)' },
  'cal.vcp.sub': {
    en: 'A real prior advance, now contracting: tighter pullbacks, drying volume, falling range. The base is the setup; the pivot is the trigger.',
    vi: 'Đã có nhịp tăng thực sự, giờ đang co hẹp: các nhịp chỉnh nông dần, volume cạn, biên độ thu hẹp. Base là setup; pivot là điểm kích hoạt.',
  },
  'cal.vcp.none': {
    en: 'No VCP bases in the scanned universe.',
    vi: 'Không có base VCP nào trong rổ đã quét.',
  },
  'cal.vcp.advance': { en: 'Prior advance', vi: 'Nhịp tăng trước' },
  'cal.vcp.contractions': { en: 'Contractions', vi: 'Số lần co hẹp' },
  'cal.vcp.depth': { en: 'Base depth', vi: 'Độ sâu base' },
  'cal.vcp.topivot': { en: 'To pivot', vi: 'Tới pivot' },
  'cal.vcp.abovepivot': { en: 'above pivot', vi: 'trên pivot' },
  'cal.vcp.notrend': { en: 'Trend filter not passed', vi: 'Chưa đạt bộ lọc xu hướng' },
  'cal.vcp.notrend.tip': {
    en: 'The base is forming, but the EMA stack is not yet aligned. Worth watching early — not yet worth buying.',
    vi: 'Base đang hình thành nhưng các đường EMA chưa xếp đúng thứ tự. Nên theo dõi sớm — chưa nên mua.',
  },

  'cal.mr.title': { en: 'Stretched below the mean (Mean Reversion)', vi: 'Rơi xa dưới trung bình (Mean Reversion)' },
  'cal.mr.sub': {
    en: 'An intact long-term uptrend, pulled unusually far below its 50-day mean. The uptrend is a hard requirement: oversold in a downtrend is a falling knife, not a setup.',
    vi: 'Xu hướng tăng dài hạn vẫn còn, nhưng giá bị kéo xuống xa bất thường dưới đường trung bình 50 ngày. Xu hướng tăng là điều kiện bắt buộc: quá bán trong downtrend là bắt dao rơi, không phải setup.',
  },
  'cal.mr.none': {
    en: 'No mean-reversion candidates in the scanned universe.',
    vi: 'Không có mã mean reversion nào trong rổ đã quét.',
  },
  'cal.mr.stretch': { en: 'Below mean', vi: 'Dưới trung bình' },
  'cal.mr.drawdown': { en: 'Off the high', vi: 'Cách đỉnh' },
  'cal.mr.target': { en: 'Target (EMA50)', vi: 'Target (EMA50)' },
  'cal.mr.invalidation': { en: 'Invalid below', vi: 'Vô hiệu nếu thủng' },
  'cal.mr.upside': { en: 'Upside', vi: 'Dư địa tăng' },
  'cal.mr.stabilizing': { en: 'Stabilizing', vi: 'Đang chững lại' },
  'cal.mr.stabilizing.tip': {
    en: 'A higher low, an up close, or a strong close. Early evidence the fall is being absorbed — never required, because the point is to see the setup before it turns.',
    vi: 'Đáy sau cao hơn, phiên đóng cửa tăng, hoặc đóng cửa mạnh. Dấu hiệu sớm cho thấy lực bán đang được hấp thụ — không bắt buộc, vì mục đích là thấy setup trước khi giá quay đầu.',
  },
  'cal.mr.falling.tip': {
    en: 'Every row here closed above a RISING 200-day EMA. That gate is what separates a pullback from a collapse.',
    vi: 'Mọi mã ở đây đều đóng cửa trên EMA200 ĐANG DỐC LÊN. Chính điều kiện này phân biệt nhịp điều chỉnh với một cú sập.',
  },

  // Stock modal — research prompts
  'prompts.title': { en: 'Research prompts', vi: 'Prompt nghiên cứu' },
  'prompts.sub': {
    en: 'Four questions worth asking, each pre-filled with the numbers measured above. Copy one, or send it straight to your GPT.',
    vi: 'Bốn câu hỏi nên đặt ra, đã điền sẵn số liệu đo ở trên. Copy một câu, hoặc gửi thẳng sang GPT của bạn.',
  },
  'prompts.copy': { en: 'Copy', vi: 'Copy' },
  'prompts.copied': { en: 'Copied ✓', vi: 'Đã copy ✓' },
  'prompts.ask': { en: 'Ask ChatGPT', vi: 'Hỏi ChatGPT' },
  // Deliberately NOT "Sent". Whether the prompt actually runs depends on the
  // extension being installed, which this code cannot see — claiming "Sent" would
  // have the user waiting for an answer to a question still sitting in a composer.
  'prompts.sent': { en: 'Opening →', vi: 'Đang mở →' },
  'prompts.toolong': { en: 'Copied — paste it', vi: 'Đã copy — hãy dán vào' },
  'prompts.ask.hint': {
    en: 'Opens ChatGPT with the question in the URL, and copies it as a backup. A custom GPT will not run it on its own — OpenAI gives them no API — so install the extension in extension/ to have it filled and sent for you. Without it, just paste.',
    vi: 'Mở ChatGPT với câu hỏi trong URL, đồng thời copy sẵn để dự phòng. Custom GPT không tự chạy được — OpenAI không mở API cho chúng — nên hãy cài extension trong thư mục extension/ để nó tự điền và gửi giúp bạn. Không có extension thì chỉ cần dán.',
  },
  'prompts.show': { en: 'Show prompt', vi: 'Xem prompt' },
  'prompts.assist': { en: 'Ask Assistant', vi: 'Hỏi Trợ lý' },
  'prompts.assist.help': {
    en: 'Send this prompt to the app’s own Assistant (your API key) and read the answer in its panel. Turn on 🌐 there for web research.',
    vi: 'Gửi prompt này cho Trợ lý của app (dùng API key của bạn) và đọc câu trả lời ngay trong khung chat. Bật 🌐 trong đó nếu cần tra web.',
  },
  'prompts.assist.fill': {
    en: 'Let the Assistant answer these questions straight into the box, then apply them',
    vi: 'Để Trợ lý trả lời thẳng vào ô dán, rồi bấm Áp dụng',
  },
  'prompts.assist.running': { en: 'The Assistant is answering…', vi: 'Trợ lý đang trả lời…' },
  'prompts.assist.stop': { en: 'Stop', vi: 'Dừng' },
  'prompts.assist.done': { en: 'Answer is in — read it over, then Apply.', vi: 'Đã có câu trả lời — đọc lại rồi bấm Áp dụng.' },
  'prompts.assist.nokey': {
    en: 'The Assistant needs an API key — add one in its settings (⚙ in the chat panel), or use Ask ChatGPT.',
    vi: 'Trợ lý cần API key — thêm trong phần cài đặt (⚙ ở khung chat), hoặc dùng Hỏi ChatGPT.',
  },
  'prompts.hide': { en: 'Hide prompt', vi: 'Ẩn prompt' },
  'prompts.gpt.set': { en: 'Set my GPT', vi: 'Chọn GPT của tôi' },
  'prompts.gpt.title': { en: 'Your custom GPT', vi: 'Custom GPT của bạn' },
  'prompts.gpt.label': { en: 'ChatGPT link', vi: 'Link ChatGPT' },
  'prompts.gpt.help': {
    en: 'Paste the link to your own GPT (chatgpt.com/g/…) so “Ask ChatGPT” opens it, signed in to your account. Leave empty for plain ChatGPT. Only https links on chatgpt.com are accepted.',
    vi: 'Dán link GPT của riêng bạn (chatgpt.com/g/…) để nút “Hỏi ChatGPT” mở đúng GPT đó, với tài khoản bạn đã đăng nhập. Để trống thì dùng ChatGPT thường. Chỉ nhận link https trên chatgpt.com.',
  },
  'prompts.gpt.rejected': {
    en: 'That link was not accepted — only https links on chatgpt.com or chat.openai.com are used.',
    vi: 'Link này không hợp lệ — chỉ dùng link https trên chatgpt.com hoặc chat.openai.com.',
  },
  'prompts.gpt.custom': { en: 'Your GPT', vi: 'GPT của bạn' },
  'prompts.disclaimer': {
    en: 'These prompts hand an LLM the numbers measured here; they do not verify its answer. Every one of them asks the model to name what would disprove it — read that part.',
    vi: 'Các prompt này chỉ đưa cho LLM số liệu đo ở đây; chúng không kiểm chứng câu trả lời. Prompt nào cũng yêu cầu model nêu điều gì sẽ bác bỏ kết luận — hãy đọc kỹ phần đó.',
  },

  // The assistant — API connection settings. `ai.*` is the assistant; `prompts.*`
  // above stays with Ask ChatGPT, which is a different, key-free feature.
  'ai.menu': { en: 'Assistant', vi: 'Trợ lý' },
  'ai.settings.title': { en: 'Assistant API key', vi: 'API key cho trợ lý' },
  'ai.provider': { en: 'Provider', vi: 'Nhà cung cấp' },
  'ai.key': { en: 'API key', vi: 'API key' },
  'ai.key.placeholder': { en: 'paste your key', vi: 'dán key của bạn' },
  'ai.key.clear': {
    en: 'Leave empty to remove the stored key.',
    vi: 'Để trống để xóa key đã lưu.',
  },
  'ai.model': { en: 'Model', vi: 'Model' },
  'ai.model.manual': {
    en: 'Model id (type it — the list could not be loaded)',
    vi: 'Model id (tự nhập — không tải được danh sách)',
  },
  'ai.baseurl': { en: 'Endpoint (API root, e.g. …/v1)', vi: 'Endpoint (gốc API, ví dụ …/v1)' },
  // Named after the request field itself rather than described in prose: the person
  // who needs to change this is reading a provider's 400 that quotes that exact name.
  'ai.tokenfield': { en: 'Output-limit field', vi: 'Trường giới hạn đầu ra' },
  // Not offered as a nicety: some gateways answer a non-streamed request with
  // "stream must be set to true" and nothing else, so this is a compatibility
  // switch that happens to also make answers appear as they are written.
  'ai.stream': { en: 'Streaming', vi: 'Streaming' },
  'ai.stream.on': { en: 'On — required by some gateways', vi: 'Bật — một số gateway bắt buộc' },
  'ai.stream.off': { en: 'Off', vi: 'Tắt' },
  'ai.price.in': { en: 'Price in, $ / 1M tokens', vi: 'Giá input, $ / 1M token' },
  'ai.price.out': { en: 'Price out, $ / 1M tokens', vi: 'Giá output, $ / 1M token' },
  'ai.price.help': {
    en: 'Only used for the cost estimate. Left empty, the assistant shows tokens but no dollars — better than a figure taken from a price list that has since changed.',
    vi: 'Chỉ dùng để ước tính chi phí. Để trống thì trợ lý chỉ hiện số token, không quy ra tiền — còn hơn một con số lấy từ bảng giá đã lỗi thời.',
  },
  'ai.key.local': {
    en: 'The key is saved on THIS DEVICE only — it is never synced and never stored on the server. It is saved in the clear, so treat it like any key pasted into a web tool: scope it, and rotate it if the device is shared.',
    vi: 'Key chỉ lưu TRÊN THIẾT BỊ NÀY — không sync, không lưu lên server. Key lưu dạng văn bản thường, nên hãy cẩn thận như với mọi key dán vào công cụ web: giới hạn quyền, và đổi key nếu máy dùng chung.',
  },
  'ai.provider.switch': {
    en: 'Provider changed — press Save to reload with that provider’s key and models.',
    vi: 'Đã đổi nhà cung cấp — bấm Lưu để tải lại key và danh sách model của nhà cung cấp đó.',
  },
  'ai.getkey': { en: 'Get a key', vi: 'Lấy key' },
  'ai.pricing': { en: 'Prices', vi: 'Bảng giá' },
  'ai.test.ok': { en: 'Connected ✓', vi: 'Đã kết nối ✓' },
  'ai.test.badkey': {
    en: 'The provider rejected that key. Check it was copied whole, and that the account is active.',
    vi: 'Nhà cung cấp từ chối key này. Kiểm tra xem đã copy đủ chưa và tài khoản còn hoạt động không.',
  },
  'ai.test.noaccess': {
    en: 'The key works but that model is not available on this account. Pick another model.',
    vi: 'Key dùng được nhưng tài khoản này không có quyền dùng model đó. Hãy chọn model khác.',
  },
  'ai.test.unreachable': {
    en: 'Could not reach the provider. Check the connection and try again.',
    vi: 'Không kết nối được nhà cung cấp. Kiểm tra mạng rồi thử lại.',
  },
  // For the same thrown fetch as above, when the provider is one the page calls
  // directly. Its own sentence because "check the connection" is then wrong advice:
  // the network is fine and the browser is refusing a cross-origin call. See
  // `unreachableCause` in core for why that can only be inferred, never read.
  'ai.test.blocked': {
    en:
      'The browser blocked this, and it is not a network problem. A custom or local endpoint is called straight from the page, so it has to answer with a CORS header allowing this site — most gateways answer with none, and the browser then reports only "Failed to fetch". The same key and URL work in the desktop app. To use this endpoint on the web it has to be added to the app\'s relay list, which is a code change.',
    vi:
      'Trình duyệt đã chặn yêu cầu này, không phải lỗi mạng. Endpoint tự nhập hoặc chạy local được gọi thẳng từ trang, nên nó phải trả về header CORS cho phép trang này — đa số gateway không trả, và trình duyệt chỉ báo "Failed to fetch". Cùng key và URL đó vẫn chạy trong app desktop. Muốn dùng endpoint này trên web thì phải thêm vào danh sách relay của app, tức là phải sửa code.',
  },
  'ai.model.missing': {
    en: 'No model set. Add a key first, or type a model id.',
    vi: 'Chưa chọn model. Thêm key trước, hoặc tự nhập model id.',
  },
  'ai.free': {
    en: 'No key yet? Ask ChatGPT keeps working without one — it runs on your ChatGPT subscription and costs no tokens.',
    vi: 'Chưa có key? Hỏi ChatGPT vẫn dùng được — nó chạy bằng gói ChatGPT của bạn, không tốn token.',
  },

  // Assistant panel
  'chat.title': { en: 'Assistant', vi: 'Trợ lý' },
  'chat.open': { en: 'Assistant', vi: 'Trợ lý' },
  'chat.close': { en: 'Close', vi: 'Đóng' },
  'chat.new': { en: 'New conversation', vi: 'Cuộc trò chuyện mới' },
  'chat.send': { en: 'Send', vi: 'Gửi' },
  'chat.placeholder': {
    en: 'Ask about your portfolio, plans, the scanner, the news…',
    vi: 'Hỏi về danh mục, kế hoạch, scanner, tin tức…',
  },
  'chat.web': { en: 'Web', vi: 'Web' },
  'chat.web.on': {
    en: 'Web search is ON: the assistant may look up news and web pages (Yahoo Finance news, DuckDuckGo). Results add tokens to each answer. Click to turn off.',
    vi: 'Tìm web đang BẬT: trợ lý có thể tra tin tức và trang web (tin Yahoo Finance, DuckDuckGo). Kết quả sẽ tốn thêm token mỗi câu trả lời. Bấm để tắt.',
  },
  'chat.web.off': {
    en: 'Web search is OFF: the assistant only uses the app\'s own data. Click to turn on.',
    vi: 'Tìm web đang TẮT: trợ lý chỉ dùng dữ liệu trong app. Bấm để bật.',
  },
  'chat.askgpt': { en: 'Ask ChatGPT', vi: 'Hỏi ChatGPT' },
  'chat.askgpt.help': {
    en: 'Open ChatGPT with your question and your numbers already filled in — costs no API tokens.',
    vi: 'Mở ChatGPT với câu hỏi và số liệu của bạn đã điền sẵn — không tốn token API.',
  },
  'chat.meter.help': {
    en: 'Tokens used in this conversation, and the estimated cost when the price is known.',
    vi: 'Số token đã dùng trong cuộc trò chuyện này, kèm chi phí ước tính nếu biết giá.',
  },
  'chat.tokens': { en: 'tokens', vi: 'token' },
  'chat.notconfigured': { en: 'No key', vi: 'Chưa có key' },
  'chat.thinking': { en: 'Thinking…', vi: 'Đang nghĩ…' },
  'chat.error': { en: 'That did not work', vi: 'Chưa thành công' },
  'chat.retry': { en: 'Try again', vi: 'Thử lại' },
  'chat.truncated': { en: 'cut off', vi: 'bị cắt' },
  'chat.local.badge': { en: 'from your data', vi: 'từ dữ liệu của bạn' },
  'chat.disclaimer': {
    en: 'Reads your portfolio, and can fill in a trade for you — nothing is saved until you approve the card it shows you.',
    vi: 'Trợ lý đọc danh mục của bạn và có thể điền sẵn giao dịch — chưa lưu gì cho đến khi bạn duyệt thẻ xác nhận.',
  },
  'chat.needkey': {
    en: 'That one needs a model. Add an API key in settings, or press Ask ChatGPT to send it to your ChatGPT subscription for free.',
    vi: 'Câu này cần model. Thêm API key trong cài đặt, hoặc bấm Hỏi ChatGPT để gửi miễn phí qua gói ChatGPT của bạn.',
  },
  'chat.empty.title': {
    en: 'Ask about your accounts, positions, trades or a price.',
    vi: 'Hỏi về tài khoản, vị thế, giao dịch hoặc giá.',
  },
  'chat.empty.hint': {
    en: 'Everyday lookups are answered straight from your data, for free. Anything needing judgement goes to the model.',
    vi: 'Tra cứu thường ngày được trả lời thẳng từ dữ liệu của bạn, miễn phí. Câu nào cần nhận định thì chuyển sang model.',
  },
  'chat.empty.nokey': {
    en: 'No key yet — the lookups below still work, straight from your data. For anything else, press Ask ChatGPT.',
    vi: 'Chưa có key — các câu tra cứu bên dưới vẫn chạy, lấy thẳng từ dữ liệu của bạn. Câu khác thì bấm Hỏi ChatGPT.',
  },
  'chat.s1': { en: 'What do I own?', vi: 'Tôi đang cầm mã nào?' },
  'chat.s2': { en: 'How much cash do I have?', vi: 'Tôi còn bao nhiêu tiền mặt?' },
  'chat.s3': { en: 'How am I doing?', vi: 'Hiệu suất của tôi thế nào?' },
  'chat.s4': { en: 'My trade history', vi: 'Lịch sử giao dịch' },

  // The approval card. The one screen between a sentence and a stored trade, so it
  // names the account and shows the price twice when a currency was converted — the
  // user has to be able to catch "232.50, read as dollars" before pressing the button.
  'chat.write.title.create_account': { en: 'Create account', vi: 'Tạo tài khoản' },
  'chat.write.title.record_buy': { en: 'Record a buy', vi: 'Ghi lệnh mua' },
  'chat.write.title.record_sell': { en: 'Record a sell', vi: 'Ghi lệnh bán' },
  'chat.write.title.set_stop': { en: 'Move the stop', vi: 'Dời stop' },
  'chat.write.title.record_cash_flow': { en: 'Cash movement', vi: 'Nạp / rút tiền' },
  'chat.write.title.place_order': { en: 'Place an order', vi: 'Đặt lệnh chờ' },
  'chat.write.title.record_balance': { en: 'Record a balance', vi: 'Ghi số dư' },
  'chat.write.wealthAccount': { en: 'Financial Status account', vi: 'Tài khoản Tình trạng tài chính' },
  'chat.write.balance': { en: 'Balance', vi: 'Số dư' },
  'chat.write.lastReading': { en: 'Last reading', vi: 'Số dư ghi gần nhất' },
  'chat.write.replaces': { en: 'replaces the reading on that day', vi: 'ghi đè số dư đã ghi ngày đó' },
  'chat.write.account': { en: 'Account', vi: 'Tài khoản' },
  'chat.write.shares': { en: 'Shares', vi: 'Số lượng' },
  'chat.write.ticker': { en: 'Symbol', vi: 'Mã' },
  'chat.write.price': { en: 'Price', vi: 'Giá' },
  'chat.write.cost': { en: 'Cost', vi: 'Tổng tiền' },
  'chat.write.proceeds': { en: 'Proceeds', vi: 'Tiền thu về' },
  'chat.write.date': { en: 'Date', vi: 'Ngày' },
  'chat.write.stop': { en: 'Stop', vi: 'Stop' },
  'chat.write.previous': { en: 'Now', vi: 'Hiện tại' },
  'chat.write.lots': { en: 'Open lots', vi: 'Lô đang mở' },
  'chat.write.target': { en: 'Target', vi: 'Target' },
  'chat.write.setup': { en: 'Setup', vi: 'Setup' },
  'chat.write.rating': { en: 'Rating', vi: 'Đánh giá' },
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
    vi: 'Kiểm tra lại rồi lưu. Bạn chưa bấm lưu thì chưa có gì được ghi.',
  },
  'chat.write.accept': { en: 'Save it', vi: 'Lưu' },
  'chat.write.decline': { en: 'No', vi: 'Không' },
  'chat.write.accepted': { en: 'Saved to your portfolio.', vi: 'Đã lưu vào danh mục.' },
  'chat.write.acceptedWealth': {
    en: 'Saved to Financial Status.',
    vi: 'Đã lưu vào Tình trạng tài chính.',
  },
  'chat.write.declined': { en: 'Not saved.', vi: 'Không lưu.' },
  'chat.write.recent': {
    en: 'Recorded from chat on this device',
    vi: 'Đã ghi từ chat trên máy này',
  },

  // Assistant answers built from local data
  'chat.local.stale': {
    en: 'No prices fetched yet this session, so last price falls back to cost — press Update on the Portfolio tab.',
    vi: 'Phiên này chưa tải giá nên giá cuối đang lấy tạm giá vốn — bấm Cập nhật ở tab Danh mục.',
  },
  'chat.local.noaccounts': {
    en: 'There are no accounts yet. Create one on the Portfolio tab.',
    vi: 'Chưa có tài khoản nào. Tạo tài khoản ở tab Danh mục.',
  },
  'chat.local.open': { en: 'open', vi: 'đang mở' },
  'chat.local.positions': { en: 'positions', vi: 'vị thế' },
  'chat.local.equity': { en: 'Equity', vi: 'Tài sản ròng' },
  'chat.local.cash': { en: 'cash', vi: 'tiền mặt' },
  'chat.local.totalpnl': { en: 'Total PnL', vi: 'Tổng lãi/lỗ' },
  'chat.local.oncapitalin': { en: 'on capital in', vi: 'trên vốn nạp' },
  'chat.local.twr': { en: 'Time-weighted return', vi: 'Lợi nhuận TWR' },
  'chat.local.pa': { en: 'p.a.', vi: '/năm' },
  'chat.local.unrealized': { en: 'Unrealized', vi: 'Lãi/lỗ tạm tính' },
  'chat.local.realized': { en: 'Realized', vi: 'Lãi/lỗ đã chốt' },
  'chat.local.risk': { en: 'Open risk', vi: 'Rủi ro đang mở' },
  'chat.local.ofequity': { en: 'of equity', vi: 'tài sản ròng' },
  'chat.local.trades': { en: 'Trades', vi: 'Giao dịch' },
  'chat.local.open2': { en: 'open', vi: 'đang mở' },
  'chat.local.closed': { en: 'closed', vi: 'đã đóng' },
  'chat.local.winrate': { en: 'win rate', vi: 'tỷ lệ thắng' },
  'chat.local.nostop': { en: 'Positions with no stop', vi: 'Vị thế chưa có stop' },
  'chat.local.nopositions': {
    en: 'No open positions in this account.',
    vi: 'Tài khoản này không có vị thế mở nào.',
  },
  'chat.local.nostop2': { en: 'no stop', vi: 'chưa có stop' },
  'chat.local.riskfree': { en: 'risk-free', vi: 'đã hết rủi ro' },
  'chat.local.stop': { en: 'stop', vi: 'stop' },
  'chat.local.notrades': {
    en: 'No trades recorded in this account.',
    vi: 'Tài khoản này chưa ghi giao dịch nào.',
  },
  'chat.local.showing': { en: 'showing', vi: 'hiện' },
  'chat.local.noquote': { en: 'no price', vi: 'chưa có giá' },
  'chat.local.day': { en: 'day', vi: 'ngày' },
  'chat.local.belowhigh': { en: 'below high', vi: 'dưới đỉnh' },

  // Scanner tab — read-only view of the Python scanner on the Oracle VM.
  //
  // Column headers ARE translated, under `scan.col.*`. They used to be left in
  // English on the grounds that they name fields in the scanner's own database,
  // which is true of `ADV20` or `RVol` but was not true of `Reason`, `Count` or
  // `Close` — those are ordinary words, and leaving them made the page read as
  // half-finished next to every other tab. Field-name headers stay as they are.
  'scan.title': { en: 'Scanner', vi: 'Scanner' },
  'scan.sub': {
    en: 'Live state of the alert bot: its watch list, why the rest of the market was rejected, and what it alerted today. Read-only — the bot runs on its own machine and pushes these snapshots out.',
    vi: 'Trạng thái trực tiếp của bot cảnh báo: watchlist, vì sao phần còn lại của thị trường bị loại, và hôm nay đã báo những gì. Chỉ xem — bot chạy trên máy riêng và tự đẩy các bản chụp này lên.',
  },
  'scan.needcode': {
    en: 'The scanner reads through the same access code as sync. Set one to see it.',
    vi: 'Scanner dùng chung mã truy cập với sync. Đặt mã để xem.',
  },
  'scan.setcode': { en: 'Set access code', vi: 'Đặt mã truy cập' },
  'scan.refresh': { en: 'Refresh', vi: 'Tải lại' },
  'scan.loading': { en: 'Reading', vi: 'Đang tải' },
  'scan.ok': { en: 'Healthy', vi: 'Bình thường' },
  'scan.issues': { en: 'to check', vi: 'cần kiểm tra' },
  // The two ages in the status strip. Kept as whole sentences with a slot rather than
  // a label plus a bare number: "read 23h" is ambiguous about which direction the
  // time runs in, and these two are the numbers you decide whether to trust the page
  // by. `snapage` is how old the VM's snapshot is, `readago` is when this browser
  // last asked for it — see `statusStrip`.
  'scan.snapage': { en: 'Snapshot {age} old', vi: 'Bản chụp từ {age} trước' },
  'scan.snapwhat': {
    en: 'How long ago the VM last pushed a status snapshot. Everything on this page comes from that moment.',
    vi: 'VM đẩy bản chụp trạng thái gần nhất cách đây bao lâu. Mọi thứ trên trang này đều tính tại thời điểm đó.',
  },
  'scan.readago': { en: 'Read {age} ago', vi: 'Đã đọc {age} trước' },
  'scan.readwhat': {
    en: 'When this browser last read the snapshots. Reading again does not make the VM push.',
    vi: 'Lần gần nhất trình duyệt này đọc các bản chụp. Đọc lại không khiến VM đẩy dữ liệu mới.',
  },
  'scan.top': { en: 'Back to top', vi: 'Lên đầu trang' },
  'scan.nodata': {
    en: 'Nothing pushed yet. Run `python push.py --all` on the VM.',
    vi: 'Chưa có dữ liệu nào. Chạy `python push.py --all` trên VM.',
  },
  'scan.nocand': {
    en: 'No watch list. `setups.py --build` has not run, or nothing qualified.',
    vi: 'Chưa có watchlist. `setups.py --build` chưa chạy, hoặc không mã nào đạt.',
  },
  'scan.norej': {
    en: 'No rejection table. It is only built by `push.py --all`, once a night.',
    vi: 'Chưa có bảng lý do loại. Bảng này chỉ được tạo bởi `push.py --all`, mỗi đêm một lần.',
  },
  'scan.noalerts': { en: 'No alerts on the latest day pushed.', vi: 'Ngày gần nhất được đẩy lên không có cảnh báo nào.' },

  // Table column headers. Short by necessity — a table of 15 columns cannot carry
  // sentences — so the meaning lives in the note under each table.
  'scan.col.sym': { en: 'Sym', vi: 'Mã' },
  'scan.col.score': { en: 'Score', vi: 'Điểm' },
  'scan.col.qual': { en: 'Qual', vi: 'Chất lượng' },
  'scan.col.close': { en: 'Close', vi: 'Giá đóng cửa' },
  'scan.col.pivot': { en: 'Pivot', vi: 'Pivot' },
  'scan.col.topivot': { en: 'To pivot', vi: 'Cách pivot' },
  'scan.col.base': { en: 'Base', vi: 'Base' },
  'scan.col.depth': { en: 'Depth', vi: 'Độ sâu' },
  'scan.col.offhigh': { en: 'Off high', vi: 'Cách đỉnh' },
  'scan.col.sector': { en: 'Sector', vi: 'Ngành' },
  'scan.col.fund': { en: 'Fund', vi: 'Cơ bản' },
  'scan.col.fundok': { en: 'ok', vi: 'đạt' },
  'scan.col.fundno': { en: 'no', vi: 'không' },
  'scan.col.slope': { en: 'Slope', vi: 'Độ dốc' },
  'scan.col.reason': { en: 'Reason', vi: 'Lý do' },
  'scan.col.count': { en: 'Count', vi: 'Số lượng' },
  'scan.col.share': { en: 'Share', vi: 'Tỷ lệ' },
  'scan.col.time': { en: 'Time', vi: 'Giờ' },
  'scan.col.kind': { en: 'Kind', vi: 'Loại' },
  'scan.col.note': { en: 'Note', vi: 'Ghi chú' },
  'scan.col.bars': { en: 'bars', vi: 'nến' },
  'scan.col.regime': { en: 'Regime', vi: 'Regime' },
  'scan.col.volat': { en: 'Vol', vi: 'Biên độ' },
  'scan.col.setups': { en: 'Setups', vi: 'Setup' },
  'scan.col.size': { en: 'Size', vi: 'Size' },
  'scan.sec.playbook': { en: 'Playbook', vi: 'Playbook' },

  // Jump links across the top of the page — the tab is nine sections long, and the
  // one you came to read is rarely the first.
  'scan.jump': { en: 'Jump to', vi: 'Đi tới' },

  // One line under each section title, saying what that section answers. Nine
  // uppercase micro-labels in a column told the reader nothing about which of the
  // nine they wanted; a sentence does, and it costs one line.
  'scan.lead.today': {
    en: 'The market regime measured on last night’s close, and the playbook cell it puts you in.',
    vi: 'Regime thị trường đo trên giá đóng cửa đêm qua, và ô playbook tương ứng với bạn.',
  },
  'scan.lead.sectors': {
    en: 'Which of the 11 sector baskets money is rotating into. Only the top three are looked inside.',
    vi: 'Dòng tiền đang xoay vào rổ nào trong 11 rổ ngành. Chỉ soi bên trong ba rổ dẫn đầu.',
  },
  'scan.lead.watch': {
    en: 'The trade plan set on last night’s closed bar: what to watch, at what price, stop and size.',
    vi: 'Trade plan lập trên nến đã đóng đêm qua: canh mã nào, ở giá nào, stop và size bao nhiêu.',
  },
  'scan.lead.night': {
    en: 'Did the chain actually run? Stage by stage with its exit code. An empty table above means nothing until this says the stage ran.',
    vi: 'Chuỗi có thực sự chạy không? Từng bước kèm mã thoát. Bảng phía trên trống thì chưa nói lên gì cho tới khi mục này báo bước đó đã chạy.',
  },
  'scan.lead.status': {
    en: 'The heartbeat of the VM: session, uptime, how many symbols it scanned, when it last pushed.',
    vi: 'Nhịp tim của VM: phiên, uptime, đã quét bao nhiêu mã, lần đẩy gần nhất lúc nào.',
  },
  'scan.lead.cand': {
    en: 'The raw candidates per setup, before the quality floor cuts them down to a watch list.',
    vi: 'Ứng viên thô theo từng setup, trước khi ngưỡng chất lượng lọc xuống còn watchlist.',
  },
  'scan.lead.rejects': {
    en: 'What the filters threw away, and why. A stage that rejects everything is a threshold set wrong.',
    vi: 'Bộ lọc đã loại gì, và vì sao. Bước nào loại sạch mọi mã thì ngưỡng đang đặt sai.',
  },
  'scan.lead.alerts': {
    en: 'Every alert sent today, with what price did next — 15 minutes, 60 minutes, and the close.',
    vi: 'Toàn bộ cảnh báo đã gửi hôm nay, kèm diễn biến giá sau đó — 15 phút, 60 phút và lúc đóng cửa.',
  },
  'scan.lead.thresholds': {
    en: 'Every number the scanner is currently using, read out of the config.py running on the VM.',
    vi: 'Mọi con số scanner đang dùng, đọc thẳng từ file config.py đang chạy trên VM.',
  },

  // Status tiles
  'scan.sec.status': { en: 'Status', vi: 'Trạng thái' },
  'scan.st.session': { en: 'Session', vi: 'Phiên' },
  'scan.st.uptime': { en: 'Uptime', vi: 'Uptime' },
  'scan.st.scans': { en: 'Scans', vi: 'Số lần quét' },
  'scan.st.errors': { en: 'Errors', vi: 'Lỗi' },
  'scan.st.universe': { en: 'Universe', vi: 'Universe' },
  'scan.st.alerts': { en: 'Alerts today', vi: 'Cảnh báo hôm nay' },
  'scan.st.tracking': { en: 'Tracking', vi: 'Đang theo dõi' },
  'scan.st.pushed': { en: 'Last push', vi: 'Lần đẩy cuối' },
  'scan.st.missing': { en: 'table missing', vi: 'chưa có bảng' },

  // Sections
  'scan.sec.watch': { en: 'Watch list', vi: 'Watchlist' },
  'scan.sec.cand': { en: 'Candidates by setup', vi: 'Ứng viên theo setup' },
  'scan.sec.rejects': { en: 'Why rejected', vi: 'Lý do loại' },
  'scan.sec.alerts': { en: 'Alerts', vi: 'Cảnh báo' },

  // ── Nightly swing funnel (Stage 1–4) ──────────────────────────────────────
  // Today panel: market regime + the playbook cell in force.
  'scan.sec.today': { en: 'Today', vi: 'Hôm nay' },
  'scan.today.none': {
    en: 'No market regime has been measured yet. Run the nightly chain once (nightly.py) — until it does, no stage downstream of it has anything to stand on.',
    vi: 'Chưa đo regime thị trường lần nào. Chạy chuỗi nightly một lần (nightly.py) — chưa chạy thì mọi bước phía sau đều không có gì để dựa vào.',
  },
  'scan.today.trend': { en: 'Regime', vi: 'Regime' },
  'scan.today.vol': { en: 'Volatility', vi: 'Biên độ' },
  'scan.today.setups': { en: 'Playbook', vi: 'Playbook' },
  'scan.today.size': { en: 'Position size', vi: 'Size vị thế' },
  'scan.today.bar': { en: 'Decision bar', vi: 'Nến quyết định' },
  'scan.today.nosize': { en: 'no new entries', vi: 'không mở lệnh mới' },
  'scan.today.nosetup': { en: 'none', vi: 'không có' },
  'scan.today.changed': { en: 'changed from', vi: 'đổi từ' },
  'scan.today.atr': { en: 'ATR vs its own average', vi: 'ATR so với trung bình của chính nó' },

  // Trend / volatility labels. These mirror regime.py's enum, one label per value —
  // the raw value is also shown, because that is what the database holds.
  'scan.trend.UPTREND': { en: 'Uptrend', vi: 'Xu hướng tăng' },
  'scan.trend.UPTREND_UNDER_STRESS': { en: 'Uptrend under stress', vi: 'Xu hướng tăng đang chịu áp lực' },
  'scan.trend.RANGE': { en: 'Range', vi: 'Đi ngang' },
  'scan.trend.DOWNTREND': { en: 'Downtrend', vi: 'Xu hướng giảm' },
  'scan.vol.CONTRACTED': { en: 'Contracted', vi: 'Co hẹp' },
  'scan.vol.NORMAL': { en: 'Normal', vi: 'Bình thường' },
  'scan.vol.EXPANDED': { en: 'Expanded', vi: 'Mở rộng' },

  // Sector ranking + rank history chart.
  'scan.sec.sectors': { en: 'Sector ranking', vi: 'Xếp hạng ngành' },
  'scan.sectors.none': {
    en: 'No sector ranking has been stored yet. It is what picks the three baskets Stage 3 looks inside, so the watch list stays empty until it exists.',
    vi: 'Chưa có bảng xếp hạng ngành. Bảng này chọn ra ba rổ mà Stage 3 soi bên trong, nên chưa có nó thì watchlist vẫn trống.',
  },
  'scan.sectors.defensive': {
    en: 'Defensive sectors are in the top 3 — money is leaving risk. Long setups work worse from here even when the regime still reads as an uptrend.',
    vi: 'Nhóm ngành phòng thủ đã vào top 3 — dòng tiền đang rời tài sản rủi ro. Từ đây setup mua sẽ kém hiệu quả hơn, kể cả khi regime vẫn báo xu hướng tăng.',
  },
  'scan.sec.chart': { en: 'Rank history', vi: 'Lịch sử xếp hạng' },
  'scan.chart.note': {
    en: 'Rank 1 is at the top, so a line RISING means money rotating in. Click a ticker to hide its line. A break in a line is a session with no data — not a flat stretch.',
    vi: 'Hạng 1 nằm trên cùng, nên đường ĐI LÊN là dòng tiền đang xoay vào. Bấm vào mã để ẩn đường của nó. Đường bị đứt là phiên không có dữ liệu — không phải đi ngang.',
  },
  'scan.chart.none': { en: 'not enough history yet', vi: 'chưa đủ lịch sử' },
  'scan.chart.sessions': { en: 'sessions', vi: 'phiên' },

  // Swing watch list (the nightly output, distinct from intraday candidates).
  'scan.watch.none': {
    en: 'No stock cleared the quality floor in the top 3 sectors. That is a normal result, not a fault — on most days nothing is worth a new position.',
    vi: 'Không mã nào vượt ngưỡng chất lượng trong 3 ngành dẫn đầu. Đây là kết quả bình thường, không phải lỗi — phần lớn các ngày chẳng có gì đáng mở vị thế mới.',
  },
  'scan.watch.blocked': {
    en: 'The filter stage did not run, so this table is empty for a reason that has nothing to do with the market. See the run report below.',
    vi: 'Bước lọc không chạy, nên bảng này trống vì lý do chẳng liên quan gì tới thị trường. Xem báo cáo lượt chạy bên dưới.',
  },
  'scan.watch.tv': { en: 'Open in TradingView', vi: 'Mở trong TradingView' },

  // The trade plan computed last night. Column headers stay short on purpose —
  // the note below the table carries the meaning, the header only labels.
  'scan.watch.grp.plan': { en: 'Trade plan (set last night)', vi: 'Trade plan (lập từ đêm qua)' },
  'scan.watch.grp.ctx': { en: 'Why it is on the list', vi: 'Vì sao có trong danh sách' },
  'scan.watch.entry': { en: 'Entry', vi: 'Entry' },
  'scan.watch.togo': { en: 'To entry', vi: 'Cách entry' },
  'scan.watch.stop': { en: 'Stop', vi: 'Stop' },
  'scan.watch.target': { en: 'Target', vi: 'Target' },
  'scan.watch.sizepct': { en: 'Size', vi: 'Size' },
  'scan.watch.noplan': { en: 'no plan', vi: 'chưa có plan' },
  'scan.watch.note': {
    en: 'Entry, stop, target and size were all computed from last night\'s closed bar — they do not move during the session. Size is the final figure (risk 0.75% of capital divided by the stop distance, already scaled by the playbook cell), so do not scale it again. "To entry" is how far price has to travel, in per cent and in ATR.',
    vi: 'Entry, stop, target và size đều tính từ nến đã đóng đêm qua — không thay đổi trong phiên. Size là con số cuối cùng (rủi ro 0,75% vốn chia cho khoảng cách tới stop, đã nhân hệ số của ô playbook), nên đừng nhân thêm lần nữa. "Cách entry" là quãng giá còn phải đi, tính theo % và theo ATR.',
  },

  // Nightly run report.
  'scan.sec.night': { en: 'Nightly run', vi: 'Lượt chạy nightly' },
  'scan.night.none': {
    en: 'The nightly chain has never reported a run. Either it is not in cron yet, or push.py cannot read its table.',
    vi: 'Chuỗi nightly chưa báo về lượt chạy nào. Hoặc nó chưa được đưa vào cron, hoặc push.py không đọc được bảng của nó.',
  },
  'scan.night.last': { en: 'Last run', vi: 'Lần chạy gần nhất' },
  'scan.night.lastok': { en: 'Last success', vi: 'Thành công gần nhất' },
  'scan.night.never': { en: 'never', vi: 'chưa lần nào' },
  'scan.night.took': { en: 'Duration', vi: 'Thời lượng' },
  // Column header, so it has to stay short; the tile above uses the long form.
  'scan.night.sec': { en: 'Took', vi: 'Mất' },
  'scan.night.exit': { en: 'Exit code', vi: 'Mã thoát' },
  'scan.night.stage': { en: 'Stage', vi: 'Bước' },
  'scan.night.detail': { en: 'Result', vi: 'Kết quả' },
  'scan.night.ok': { en: 'ok', vi: 'ok' },
  'scan.night.failed': { en: 'failed', vi: 'lỗi' },
  'scan.night.blocked': { en: 'did not run', vi: 'không chạy' },
  'scan.night.skipped': { en: 'skipped', vi: 'bỏ qua' },
  'scan.night.dry': { en: 'dry run — nothing was written', vi: 'chạy thử — không ghi gì cả' },
  'scan.night.warn': { en: 'Warnings', vi: 'Cảnh báo' },
  'scan.night.source': { en: 'Data source', vi: 'Nguồn dữ liệu' },
  'scan.night.sourceval': {
    en: 'yfinance daily bars, cached on the VM — delayed, not realtime',
    vi: 'nến ngày từ yfinance, cache trên VM — có trễ, không realtime',
  },

  // The nightly runbook. Commands are NEVER translated — a translated command is a
  // command that does not run — so only the prose around them has both languages.
  'scan.sec.guide': { en: 'Re-running the nightly', vi: 'Chạy lại nightly' },
  'scan.lead.guide': {
    en: 'What to type, in what order, and what to check when it says it finished.',
    vi: 'Gõ lệnh gì, theo thứ tự nào, và kiểm tra gì khi nó báo xong.',
  },
  'scan.g.now.none': {
    en: 'No run has ever been reported, so there is nothing to re-run yet — the chain is either not in cron or push.py cannot reach its table. Step 09 below is the cron it belongs in.',
    vi: 'Chưa từng có lượt chạy nào được báo về, nên chưa có gì để chạy lại — hoặc chuỗi chưa vào cron, hoặc push.py không đọc được bảng của nó. Bước 09 bên dưới là dòng cron cần thêm.',
  },
  'scan.g.now.ok': {
    en: 'The last run finished clean. Re-run it only if you want fresher numbers than the ones above.',
    vi: 'Lượt chạy gần nhất đã xong, không lỗi. Chỉ chạy lại nếu bạn muốn số liệu mới hơn những gì ở trên.',
  },
  'scan.g.now.fail': {
    en: 'A REQUIRED stage failed, so this page is showing the previous night’s market with today’s date on it. Fix this, then re-run:',
    vi: 'Một bước BẮT BUỘC đã lỗi, nên trang này đang hiện thị trường của đêm trước nhưng mang ngày hôm nay. Sửa lỗi này rồi chạy lại:',
  },
  'scan.g.now.soft': {
    en: 'An optional stage failed. The night itself ran, so the lists above are good — the run just could not finish reporting:',
    vi: 'Một bước không bắt buộc bị lỗi. Chuỗi vẫn chạy xong nên các danh sách ở trên vẫn dùng được — chỉ là khâu báo cáo chưa hoàn tất:',
  },
  'scan.g.copy': { en: 'Copy', vi: 'Copy' },
  'scan.g.then': {
    en: 'Then press Refresh at the top of this page. The run pushes its new snapshots at the end, and this page only reads them — Refresh cannot start anything on the VM.',
    vi: 'Sau đó bấm Tải lại ở đầu trang. Lượt chạy đẩy bản chụp mới lên ở cuối, còn trang này chỉ đọc — Tải lại không khởi động được gì trên VM.',
  },
  'scan.g.secrets': {
    en: 'The VM’s SCANNER_TOKEN never comes down to the browser, and must never be typed into this page. The only secret you type in the app is the sync code, in the ☁ box. Nothing from .env belongs in a commit.',
    vi: 'SCANNER_TOKEN của VM không bao giờ được gửi xuống trình duyệt, và tuyệt đối không được gõ vào trang này. Bí mật duy nhất bạn nhập trong app là mã sync, ở ô ☁. Không thứ gì trong .env được đưa vào commit.',
  },
  'scan.ops.title': { en: 'Running the VM', vi: 'Vận hành VM' },
  'scan.ops.sub': {
    en: 'Step-by-step guides with a copy button on every command, in Settings & Guides.',
    vi: 'Hướng dẫn từng bước, lệnh nào cũng có nút copy, trong Cài đặt & Hướng dẫn.',
  },
  'scan.ops.connect': { en: 'Connect & update', vi: 'Kết nối & cập nhật' },
  'scan.ops.service': { en: 'Service & logs', vi: 'Dịch vụ & log' },
  'scan.ops.cron': { en: 'Schedule (cron)', vi: 'Lịch chạy (cron)' },
  'scan.ops.trouble': { en: 'Troubleshooting', vi: 'Xử lý sự cố' },
  'scan.ops.config': { en: 'Settings', vi: 'Cài đặt' },
  'scan.g.open': { en: 'The full runbook, step by step', vi: 'Runbook đầy đủ, từng bước' },
  'scan.g.note': {
    en: 'The same steps as error.txt (VM-4, VM-7, LOCK-3), kept here because this is the page you are on when you find out a stage failed. Nothing here runs by itself; you are typing it over SSH as the user ubuntu, in a venv you activated in step 01.',
    vi: 'Giống các bước trong error.txt (VM-4, VM-7, LOCK-3), đặt ở đây vì đây là trang bạn đang xem lúc phát hiện một bước bị lỗi. Không có gì ở đây tự chạy; bạn gõ qua SSH bằng user ubuntu, trong venv đã kích hoạt ở bước 01.',
  },
  'scan.g.crontab': {
    en: 'This is crontab CONTENT, not shell. Paste it inside the editor that `crontab -e` opens. Pasted into a terminal, bash reads the leading 0 as a command name and answers `0: command not found` — that is a paste in the wrong place, not a broken file.',
    vi: 'Đây là NỘI DUNG crontab, không phải lệnh shell. Dán vào trình soạn thảo mà `crontab -e` mở ra. Nếu dán thẳng vào terminal, bash sẽ hiểu số 0 ở đầu là tên lệnh và báo `0: command not found` — đó là dán nhầm chỗ, không phải file bị hỏng.',
  },

  'scan.g.venv.h': {
    en: 'First: activate the venv',
    vi: 'Trước tiên: kích hoạt venv',
  },
  'scan.g.venv.a': {
    en: 'Every `python` in this runbook means the one inside `~/scanner/.venv`. The system python has no yfinance and no pandas, so `python nightly.py` without activating first dies on `ModuleNotFoundError` — which reads like a broken install and is only a missing activation.',
    vi: 'Mọi lệnh `python` trong runbook này đều là python trong `~/scanner/.venv`. Python hệ thống không có yfinance lẫn pandas, nên chạy `python nightly.py` khi chưa kích hoạt sẽ chết với `ModuleNotFoundError` — trông như cài hỏng, thực ra chỉ là quên kích hoạt.',
  },
  'scan.g.venv.b': {
    en: 'Check it took: the prompt gains a `(.venv)` prefix, and `which python` answers `/home/ubuntu/scanner/.venv/bin/python`. It lasts for this SSH session only — a new window starts without it. Cron cannot activate anything, which is why the crontab further down spells out `.venv/bin/python` instead.',
    vi: 'Kiểm tra đã kích hoạt chưa: dấu nhắc có thêm tiền tố `(.venv)`, và `which python` trả về `/home/ubuntu/scanner/.venv/bin/python`. Nó chỉ có hiệu lực trong phiên SSH này — mở cửa sổ mới là mất. Cron không kích hoạt được gì, nên crontab bên dưới ghi thẳng `.venv/bin/python`.',
  },
  'scan.g.s1.h': {
    en: 'Then: make sure nobody is holding the database',
    vi: 'Tiếp theo: đảm bảo không tiến trình nào đang giữ database',
  },
  'scan.g.s1.a': {
    en: 'Two things have to be true in the output: `journal_mode = wal`, and section 4 saying it got the lock in a fraction of a second. If it still says `delete`, a process is holding the file — section 3 of the script prints its pid and command line.',
    vi: 'Kết quả phải thoả cả hai điều: `journal_mode = wal`, và mục 4 báo lấy được khoá trong chưa tới một giây. Nếu vẫn là `delete` thì có tiến trình đang giữ file — mục 3 của script in ra pid và dòng lệnh của nó.',
  },
  'scan.g.s1.b': {
    en: 'Do not set WAL by hand. Once nobody is holding the file, the first connection the scanner opens switches it, and WAL is a property of the FILE — set once, set for every process.',
    vi: 'Đừng tự bật WAL bằng tay. Khi không còn ai giữ file, kết nối đầu tiên scanner mở sẽ tự chuyển, và WAL là thuộc tính của FILE — đặt một lần là áp dụng cho mọi tiến trình.',
  },
  'scan.g.s2.h': {
    en: 'Only ever one main.py',
    vi: 'Chỉ chạy đúng một main.py',
  },
  'scan.g.s2.a': {
    en: 'Two of them both call Telegram getUpdates and the second one gets a 409. So restart, never start a second — and a mid-session restart is safe: the alerts table is re-read, so nothing is sent twice, and the watch list is pruned by age rather than rebuilt.',
    vi: 'Hai tiến trình cùng gọi getUpdates của Telegram thì cái thứ hai dính lỗi 409. Vì vậy hãy restart, đừng bao giờ start thêm cái thứ hai — và restart giữa phiên vẫn an toàn: bảng alerts được đọc lại nên không gửi trùng, còn watchlist được dọn theo tuổi chứ không dựng lại.',
  },
  'scan.g.s3.h': { en: 'The run itself', vi: 'Bản thân lượt chạy' },
  'scan.g.s3.a': {
    en: 'Required stages: bars, sectors, structure, setups. If one of those fails, the night did not happen. Optional: prep, regime, mktcap, push, telegram — a failure there is a run that worked and could not report.',
    vi: 'Các bước bắt buộc: bars, sectors, structure, setups. Chỉ cần một bước lỗi là coi như đêm đó không chạy. Không bắt buộc: prep, regime, mktcap, push, telegram — lỗi ở đây nghĩa là lượt chạy vẫn ổn, chỉ không báo cáo được.',
  },
  'scan.g.s3.b': {
    en: 'It always sends a Telegram message, including when it fails, and it names the stage and the reason. So the phone tells you before this page does.',
    vi: 'Nó luôn gửi tin Telegram, kể cả khi lỗi, kèm tên bước và lý do. Nên điện thoại sẽ báo bạn trước cả trang này.',
  },
  'scan.g.s4.h': { en: 'Trying it without downloading anything', vi: 'Chạy thử mà không tải gì' },
  'scan.g.s4.a': {
    en: '`--dry-run` chains every step with the bars stage making no network call — for checking the wiring after a change. The run record above marks a dry run as one, so it cannot be mistaken for a real night.',
    vi: '`--dry-run` chạy nối đủ các bước nhưng bước bars không gọi mạng — để kiểm tra luồng chạy sau khi sửa. Bản ghi lượt chạy ở trên đánh dấu rõ đây là chạy thử, nên không thể nhầm với một đêm thật.',
  },
  'scan.g.s4.b': {
    en: '`--status` prints the last run from the night table — the same record the section above this one is showing.',
    vi: '`--status` in ra lượt chạy gần nhất từ bảng night — chính là bản ghi mà mục ngay phía trên đang hiển thị.',
  },
  'scan.g.s5.h': {
    en: 'When it says it finished, check these four things',
    vi: 'Khi nó báo xong, kiểm tra bốn điều sau',
  },
  'scan.g.s5.a': {
    en: 'The four required stages read OK in the section above. Exit code 0 is a clean run; 1, 2 and 3 are the failure codes the chain hands out to cron, and the Exit tile shows the last one.',
    vi: 'Bốn bước bắt buộc phải hiện OK ở mục trên. Mã thoát 0 là chạy sạch; 1, 2 và 3 là các mã lỗi mà chuỗi trả về cho cron, và ô Mã thoát hiện mã của lần gần nhất.',
  },
  'scan.g.s5.b': {
    en: '`XONG:` from the bars stage does NOT mean everything downloaded — read the failure count in that same line. A batch that errored prints its error and moves on without printing a progress line.',
    vi: '`XONG:` ở bước bars KHÔNG có nghĩa là đã tải đủ — hãy đọc số lỗi ngay trên dòng đó. Lô nào lỗi sẽ in lỗi rồi chạy tiếp, không in dòng tiến độ.',
  },
  'scan.g.s5.c': {
    en: 'The run refuses to continue when more than 25% of symbols fail to download, and that refusal is correct: percentile ranking across what is left comes out skewed while the list still looks perfectly normal.',
    vi: 'Lượt chạy sẽ từ chối chạy tiếp khi hơn 25% mã tải lỗi, và từ chối như vậy là đúng: xếp hạng percentile trên số còn lại sẽ bị lệch, trong khi danh sách vẫn trông hoàn toàn bình thường.',
  },
  'scan.g.s5.d': {
    en: 'The bar the run decided on must not equal the day it ran — when they match, the bar had not closed yet. The tile above turns red when they do.',
    vi: 'Ngày của nến mà lượt chạy dùng để quyết định không được trùng với ngày chạy — trùng nghĩa là nến chưa đóng. Ô phía trên sẽ chuyển đỏ khi trùng.',
  },
  'scan.g.s6.h': {
    en: 'Never run it on an empty candle store',
    vi: 'Đừng bao giờ chạy khi kho nến còn trống',
  },
  'scan.g.s6.a': {
    en: 'The bars stage pulls one month, not two years, so it cannot bootstrap the store — it fills a store that already exists. Build the store first with the command below.',
    vi: 'Bước bars chỉ tải một tháng, không phải hai năm, nên không thể dựng kho từ đầu — nó chỉ bổ sung vào kho đã có. Hãy dựng kho trước bằng lệnh dưới đây.',
  },
  'scan.g.s6.b': {
    en: 'Re-running the full sync is safe: it commits batch by batch and has no resume, so a second run costs time, never data.',
    vi: 'Chạy lại sync đầy đủ vẫn an toàn: nó commit theo từng lô và không có resume, nên chạy lần hai chỉ tốn thời gian, không bao giờ mất dữ liệu.',
  },
  'scan.g.s7.h': { en: 'If it dies with `database is locked`', vi: 'Nếu chết với lỗi `database is locked`' },
  'scan.g.s7.a': {
    en: 'Do not go and change yfinance or the journal mode. The journal mode is the victim, not the cause: a write transaction left open elsewhere is. Step 02’s script prints the pid holding it.',
    vi: 'Đừng đi sửa yfinance hay journal mode. Journal mode là nạn nhân, không phải thủ phạm: thủ phạm là một transaction ghi bị bỏ ngỏ ở đâu đó. Script ở bước 02 in ra pid đang giữ nó.',
  },
  'scan.g.s7.b': {
    en: 'Do not raise the busy timeout past 30 seconds either. It only makes the run die later, and hides the thing you need to see.',
    vi: 'Cũng đừng tăng busy timeout quá 30 giây. Làm vậy chỉ khiến lượt chạy chết muộn hơn, và che mất đúng thứ bạn cần thấy.',
  },
  'scan.g.s8.h': { en: 'The schedule it normally runs on', vi: 'Lịch chạy thường ngày' },
  'scan.g.s8.a': {
    en: 'Run `crontab -e` as the user ubuntu, NOT `sudo crontab -e`. Root has its own crontab, a different working directory and no access to this venv — the lines would look installed and never run. `crontab -l` afterwards must show the CRON_TZ line too.',
    vi: 'Chạy `crontab -e` bằng user ubuntu, KHÔNG dùng `sudo crontab -e`. Root có crontab riêng, thư mục làm việc khác và không truy cập được venv này — các dòng trông như đã cài nhưng sẽ không bao giờ chạy. Sau đó `crontab -l` phải hiện cả dòng CRON_TZ.',
  },
  'scan.g.s8.b': {
    en: 'Keep the 09:05 restart. The run writes the new baseline at 08:00 ET, but main.py only loads a baseline at startup and at the ET day change (00:00) — eight hours earlier. Without the restart the bot trades the whole session on yesterday’s baseline, and nothing says so.',
    vi: 'Giữ lại lệnh restart lúc 09:05. Lượt chạy ghi baseline mới lúc 08:00 ET, nhưng main.py chỉ nạp baseline khi khởi động và khi sang ngày ET (00:00) — tức sớm hơn tám tiếng. Không restart thì bot giao dịch cả phiên bằng baseline của hôm qua, mà chẳng có gì báo.',
  },
  'scan.g.s8.c': {
    en: 'Pick cron OR a systemd timer, never both. Two schedules calling the same run at 08:00 is two downloads of the same day.',
    vi: 'Chọn cron HOẶC systemd timer, đừng dùng cả hai. Hai lịch cùng gọi một lượt chạy lúc 08:00 là tải cùng một ngày hai lần.',
  },
  'scan.g.s9.h': {
    en: 'What this page can and cannot tell you',
    vi: 'Trang này cho biết được gì và không cho biết được gì',
  },
  'scan.g.s9.a': {
    en: 'Every table here is a snapshot the VM pushed out. The VM accepts no inbound connection, so nothing on this tab can start, stop or fix anything on it — this section is a list of things to type somewhere else.',
    vi: 'Mọi bảng ở đây đều là bản chụp do VM đẩy ra. VM không nhận kết nối từ ngoài vào, nên tab này không thể khởi động, dừng hay sửa bất cứ gì trên đó — mục này chỉ là danh sách những lệnh cần gõ ở chỗ khác.',
  },
  'scan.g.s9.b': {
    en: 'If "last OK run" is days older than "last run", the runs are failing rather than missing — and that is a different problem from cron never firing.',
    vi: 'Nếu "lần chạy OK gần nhất" cũ hơn "lần chạy gần nhất" vài ngày thì các lượt chạy đang bị lỗi chứ không phải bị thiếu — và đó là vấn đề khác với chuyện cron không chạy.',
  },
  'scan.g.s10.h': { en: 'Two schedules that are not this one', vi: 'Hai lịch chạy khác, không phải lịch này' },
  'scan.g.s10.a': {
    en: 'The Saturday 06:30 prep and the 09:00 ETF marking are separate cron lines with separate jobs. Re-running the nightly does not re-run either, and neither of them rebuilds the candle store.',
    vi: 'Lượt prep 06:30 thứ Bảy và lượt đánh dấu ETF lúc 09:00 là hai dòng cron riêng, làm việc riêng. Chạy lại nightly không chạy lại hai lượt đó, và cả hai đều không dựng lại kho nến.',
  },
  'scan.g.s10.b': {
    en: 'To run any cron line by hand, drop the five schedule fields at the front and keep the rest — and drop the `>>` redirect too, so the error lands on your screen instead of in a log you then have to go and open.',
    vi: 'Muốn chạy tay một dòng cron thì bỏ 5 trường lịch ở đầu, giữ phần còn lại — và bỏ luôn phần chuyển hướng `>>`, để lỗi hiện ngay trên màn hình thay vì nằm trong log mà bạn phải đi mở.',
  },

  // Read-only thresholds.
  'scan.sec.thresholds': { en: 'Active thresholds', vi: 'Ngưỡng đang áp dụng' },
  'scan.th.note': {
    en: 'Read straight out of the running config.py on the VM, not a copy kept here. If a number on this page looks wrong, it IS what the scanner used.',
    vi: 'Đọc thẳng từ file config.py đang chạy trên VM, không phải bản sao lưu ở đây. Nếu con số nào trên trang này trông sai, thì đó ĐÚNG là con số scanner đã dùng.',
  },
  'scan.th.none': { en: 'The VM has not pushed its thresholds yet.', vi: 'VM chưa đẩy bảng ngưỡng lên.' },
  'scan.th.show': { en: 'Show thresholds', vi: 'Xem bảng ngưỡng' },
  // Folding. Generic keys, not `scan.*`: the same caret is reused by any page that
  // grows long enough to need it.
  'sec.fold': { en: 'Fold / unfold this section', vi: 'Thu gọn / mở rộng phần này' },
  'sec.foldall': { en: 'Fold or unfold every section', vi: 'Thu gọn / mở rộng tất cả' },
  'scan.rej.passed': { en: 'passed', vi: 'qua lọc' },
  'scan.rej.cut': { en: 'over ceiling', vi: 'vượt trần' },
  // LEAD only, and only when it differs from `passed`: cleared the quality floor
  // before the per-sector and total caps.
  'scan.rej.floor': { en: 'cleared the floor', vi: 'vượt ngưỡng chất lượng' },
  'scan.rej.fund': { en: 'awaiting fundamentals', vi: 'chờ điểm cơ bản' },
  // The two example reasons are quoted with the labels the table now prints, not the
  // scanner's raw keys, so a reader can actually find the row being talked about.
  'scan.rej.note': {
    en: 'Recomputed against the thresholds in force right now, not stored when the list was built. "No base yet" dominating is normal — most of the market is not in a base. "Still far below the pivot" dominating means the market just fell, and the setup should be quiet.',
    vi: 'Tính lại theo ngưỡng đang áp dụng hiện tại, không phải lưu từ lúc dựng danh sách. "Chưa có nền tích lũy" chiếm đa số là bình thường — phần lớn thị trường không nằm trong base. "Còn xa pivot" chiếm đa số nghĩa là thị trường vừa giảm mạnh, và setup lẽ ra phải im ắng.',
  },

  // Health warnings — every one of these is a state that produces SILENCE, not an
  // error, so the wording says what is silently not happening.
  'scan.warn.nopush': {
    en: 'The VM has never pushed a status. Either push.py is not in cron yet, or its token is wrong.',
    vi: 'VM chưa từng đẩy trạng thái lên. Hoặc push.py chưa được đưa vào cron, hoặc token bị sai.',
  },
  'scan.warn.db': { en: 'Cannot read the scanner database', vi: 'Không đọc được database của scanner' },
  'scan.warn.stale': {
    en: 'Status is stale — the push cron has stopped',
    vi: 'Trạng thái đã cũ — cron đẩy dữ liệu đã ngừng',
  },
  // Said in the same breath as the staleness, because the page below it goes on
  // looking perfectly healthy: every date on it is simply frozen at the last push,
  // and a frozen date reads exactly like a nightly run that skipped a session.
  'scan.warn.stale.tail': {
    en: 'everything below is frozen at that moment, so the dates you read are that snapshot’s, not today’s',
    vi: 'mọi thứ bên dưới đều dừng ở thời điểm đó, nên các ngày bạn thấy là của bản chụp đó, không phải hôm nay',
  },
  'scan.warn.silent': {
    en: 'The candidates table is older than the bot will accept, so it is sending nothing at all: no alerts, no errors',
    vi: 'Bảng candidates đã cũ hơn mức bot chấp nhận, nên nó im lặng hoàn toàn: không cảnh báo, không báo lỗi',
  },
  'scan.warn.nobeat': {
    en: 'No heartbeat from the scanner process: it has never started, or it is running a build from before heartbeats existed.',
    vi: 'Không có nhịp tim từ tiến trình scanner: nó chưa từng khởi động, hoặc đang chạy bản cũ từ trước khi có nhịp tim.',
  },
  'scan.warn.beatstale': {
    en: 'The scanner loop has stopped writing its heartbeat',
    vi: 'Vòng quét của scanner đã ngừng ghi nhịp tim',
  },
  'scan.warn.dry': {
    en: 'Running in dry mode: it scans and scores, but sends no messages.',
    vi: 'Đang chạy chế độ thử: vẫn quét và chấm điểm, nhưng không gửi tin nào.',
  },
  'scan.warn.universe': {
    en: 'The universe has not refreshed for a long time — the quote source is down',
    vi: 'Universe đã lâu không được làm mới — nguồn giá đang sập',
  },
  'scan.warn.halts': { en: 'Halt feed error', vi: 'Lỗi nguồn tin tạm ngừng giao dịch' },
  'scan.warn.news': { en: 'News feed error', vi: 'Lỗi nguồn tin tức' },
  'scan.warn.spool': {
    en: 'Messages are queued undelivered — Telegram is rejecting them',
    vi: 'Tin nhắn đang ùn lại chưa gửi được — Telegram đang từ chối',
  },
  'scan.warn.nightstale': {
    en: 'The nightly chain has not completed for more than',
    vi: 'Chuỗi nightly chưa chạy xong đã hơn',
  },
  'scan.warn.nightstale.tail': {
    en: 'working hours — everything below is from an older session',
    vi: 'giờ làm việc — mọi thứ bên dưới là của một phiên cũ hơn',
  },
  'scan.warn.nightnever': {
    en: 'The nightly chain has never completed successfully — nothing below has ever been refreshed',
    vi: 'Chuỗi nightly chưa từng chạy thành công — mọi thứ bên dưới chưa bao giờ được làm mới',
  },
  'scan.warn.nightfail': {
    en: 'Last nightly run failed at',
    vi: 'Lượt nightly gần nhất bị lỗi ở',
  },

  // Sync indicator (top bar)
  'sync.state.off': { en: 'Local only', vi: 'Chỉ lưu trên máy' },
  'sync.state.error': { en: 'Not saved', vi: 'Chưa lưu được' },
  // The pull failed, so nothing is being uploaded at all. Worded as "not syncing"
  // rather than "offline" because a rejected code produces it too.
  'sync.state.stalled': { en: 'Not syncing', vi: 'Không sync được' },
  'sync.state.pending': { en: 'Syncing…', vi: 'Đang sync…' },
  'sync.state.ok': { en: 'Synced', vi: 'Đã sync' },
  'sync.status.hint': {
    en: 'click to open device sync',
    vi: 'bấm để mở sync thiết bị',
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
