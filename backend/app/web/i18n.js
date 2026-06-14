// Bilingual (English / Vietnamese) string table + helpers.
// Loaded before app.js. Exposes window.I18N.
(function () {
  const STRINGS = {
    // ── Brand / nav ──────────────────────────────────────────────────────────
    "brand.name": { en: "Customized", vi: "Tùy chỉnh" },
    "brand.tagline": { en: "STOCK Screener", vi: "BỘ LỌC Cổ phiếu" },
    "nav.picks": { en: "Top Picks", vi: "Lựa chọn hàng đầu" },
    "nav.screener": { en: "Screener", vi: "Bộ lọc" },
    "nav.watchlist": { en: "Watchlists", vi: "Danh sách theo dõi" },
    "nav.sectors": { en: "Sectors", vi: "Ngành" },
    "nav.learn": { en: "Learn", vi: "Tìm hiểu" },
    "nav.picks.short": { en: "Picks", vi: "Chọn" },
    "nav.watchlist.short": { en: "Lists", vi: "D.sách" },
    "edu.note": { en: "Educational use only.<br />Not financial advice.", vi: "Chỉ dùng cho mục đích học tập.<br />Không phải lời khuyên đầu tư." },
    "lang.toggle": { en: "Language", vi: "Ngôn ngữ" },

    // ── Landing ──────────────────────────────────────────────────────────────
    "landing.badge": { en: "Pattern-based US equity screener", vi: "Bộ lọc cổ phiếu Mỹ theo mẫu hình" },
    "landing.h1a": { en: "Find tomorrow's breakouts,", vi: "Tìm cú bứt phá của ngày mai," },
    "landing.h1b": { en: "before they break out.", vi: "trước khi chúng bứt phá." },
    "landing.subtitle": {
      en: "Scan any stock or sector for tight consolidations, VCP setups and Stage-2 momentum — ranked by a 0–100 conviction score, with interactive charts, EMAs, and fundamentals trends.",
      vi: "Quét bất kỳ cổ phiếu hay ngành nào để tìm nền giá chặt, mẫu hình VCP và đà tăng Giai đoạn 2 — xếp hạng theo điểm tin cậy 0–100, kèm biểu đồ tương tác, EMA và xu hướng cơ bản.",
    },
    "landing.cta": { en: "Launch the Screener →", vi: "Mở bộ lọc →" },
    "landing.nosignup": { en: "No sign-up · runs in your browser", vi: "Không cần đăng ký · chạy ngay trên trình duyệt" },
    "landing.f1.title": { en: "Custom Screener", vi: "Bộ lọc tùy chỉnh" },
    "landing.f1.desc": { en: "Type tickers or pick sectors. Filter by score, signal and stage across the broad market.", vi: "Nhập mã hoặc chọn ngành. Lọc theo điểm, tín hiệu và giai đoạn trên toàn thị trường." },
    "landing.f2.title": { en: "Pro Charts", vi: "Biểu đồ chuyên nghiệp" },
    "landing.f2.desc": { en: "Candles with EMA 5/10/21/50/150/200, volume, and trade levels drawn right on the chart.", vi: "Nến với EMA 5/10/21/50/150/200, khối lượng và các mức giao dịch vẽ ngay trên biểu đồ." },
    "landing.f3.title": { en: "Top Picks", vi: "Lựa chọn hàng đầu" },
    "landing.f3.desc": { en: "Auto-ranked best setups across the market by the built-in breakout strategy.", vi: "Tự động xếp hạng các thiết lập tốt nhất theo chiến lược bứt phá tích hợp." },
    "landing.f4.title": { en: "Watchlists", vi: "Danh sách theo dõi" },
    "landing.f4.desc": { en: "Organize ideas into multiple named lists and screen each in one click.", vi: "Sắp xếp ý tưởng vào nhiều danh sách và lọc từng danh sách chỉ với một cú nhấp." },
    "landing.disclaimer": { en: "Educational use only. Not financial advice.", vi: "Chỉ dùng cho mục đích học tập. Không phải lời khuyên đầu tư." },

    // ── Top Picks tab ──────────────────────────────────────────────────────────
    "picks.title": { en: "Top Picks", vi: "Lựa chọn hàng đầu" },
    "picks.subtitle": { en: "Highest-conviction breakout & VCP setups, auto-ranked across the market by the built-in strategy.", vi: "Các thiết lập bứt phá & VCP có độ tin cậy cao nhất, tự động xếp hạng trên toàn thị trường." },
    "picks.refresh": { en: "↻ Refresh", vi: "↻ Làm mới" },
    "picks.strategy": { en: "Strategy", vi: "Chiến lược" },
    "picks.strategy.breakout": { en: "Breakout-ready", vi: "Sẵn sàng bứt phá" },
    "picks.strategy.momentum": { en: "Stage-2 momentum", vi: "Đà tăng Giai đoạn 2" },
    "picks.strategy.vcp": { en: "Tight VCP near pivot", vi: "VCP chặt gần pivot" },
    "picks.broad": { en: "Broad universe", vi: "Toàn thị trường" },
    "common.slower": { en: "(slower)", vi: "(chậm hơn)" },

    // ── Screener tab ───────────────────────────────────────────────────────────
    "screener.title": { en: "Custom Screener", vi: "Bộ lọc tùy chỉnh" },
    "screener.subtitle": { en: "Find consolidation & breakout setups across any stocks or sectors.", vi: "Tìm thiết lập tích lũy & bứt phá trên bất kỳ cổ phiếu hay ngành nào." },
    "screener.symbols": { en: "Symbols", vi: "Mã cổ phiếu" },
    "screener.symbols.hint": { en: "(comma separated)", vi: "(cách nhau bằng dấu phẩy)" },
    "screener.orsectors": { en: "Or pick sectors", vi: "Hoặc chọn ngành" },
    "screener.clear": { en: "Clear", vi: "Xóa" },
    "screener.broaduniverse.pre": { en: "Scan the", vi: "Quét" },
    "screener.broaduniverse.bold": { en: "broad universe", vi: "toàn thị trường" },
    "screener.broaduniverse.post": { en: "(S&P 1500+ — slower, far more stocks)", vi: "(S&P 1500+ — chậm hơn, nhiều cổ phiếu hơn)" },
    "screener.minscore": { en: "Min score", vi: "Điểm tối thiểu" },
    "screener.signal": { en: "Signal", vi: "Tín hiệu" },
    "screener.stage": { en: "Stage", vi: "Giai đoạn" },
    "screener.sortby": { en: "Sort by", vi: "Sắp xếp theo" },
    "screener.any": { en: "Any", vi: "Tất cả" },
    "opt.breakout": { en: "Breakout imminent", vi: "Bứt phá sắp xảy ra" },
    "opt.consolidating": { en: "Consolidating", vi: "Đang tích lũy" },
    "opt.stage2": { en: "Stage 2 · Advancing", vi: "Giai đoạn 2 · Tăng giá" },
    "opt.stage1": { en: "Stage 1 · Basing", vi: "Giai đoạn 1 · Tạo nền" },
    "opt.stage3": { en: "Stage 3 · Topping", vi: "Giai đoạn 3 · Tạo đỉnh" },
    "opt.stage4": { en: "Stage 4 · Declining", vi: "Giai đoạn 4 · Giảm giá" },
    "sort.score": { en: "Score", vi: "Điểm" },
    "sort.distance": { en: "Distance to pivot", vi: "Khoảng cách tới pivot" },
    "sort.range": { en: "Price range", vi: "Biên độ giá" },
    "sort.volume_dryup": { en: "Volume dry-up", vi: "Cạn thanh khoản" },
    "screener.run": { en: "Run Screen", vi: "Chạy lọc" },

    // ── Watchlist tab ──────────────────────────────────────────────────────────
    "wl.title": { en: "My Watchlists", vi: "Danh sách theo dõi của tôi" },
    "wl.subtitle": { en: "Organize favorites into multiple lists, screen each in one click, expand for charts & fundamentals.", vi: "Sắp xếp cổ phiếu yêu thích vào nhiều danh sách, lọc từng cái chỉ một cú nhấp, mở rộng để xem biểu đồ & cơ bản." },
    "wl.new": { en: "＋ New list", vi: "＋ Danh sách mới" },
    "wl.addplaceholder": { en: "Add symbol e.g. AMD", vi: "Thêm mã, ví dụ AMD" },
    "wl.add": { en: "Add", vi: "Thêm" },
    "wl.screenall": { en: "Screen All", vi: "Lọc tất cả" },

    // ── Sectors tab ────────────────────────────────────────────────────────────
    "sectors.title": { en: "Industry Volume Scanner", vi: "Máy quét khối lượng theo ngành" },
    "sectors.subtitle": { en: "Sectors ranked by volume change (3m vs 6m). Click one to see its volume trend.", vi: "Các ngành xếp hạng theo thay đổi khối lượng (3 tháng so với 6 tháng). Nhấp để xem xu hướng khối lượng." },
    "sectors.refresh": { en: "↻ Refresh", vi: "↻ Làm mới" },

    // ── Learn tab ──────────────────────────────────────────────────────────────
    "learn.title": { en: "Learn the Terminology", vi: "Tìm hiểu thuật ngữ" },
    "learn.subtitle": { en: "Every metric in this app, explained in plain English.", vi: "Mọi chỉ số trong ứng dụng, giải thích dễ hiểu." },
    "learn.group.metrics": { en: "Screener Metrics", vi: "Chỉ số bộ lọc" },
    "learn.group.levels": { en: "Pivots & Trade Levels", vi: "Pivot & các mức giao dịch" },
    "learn.group.fundamentals": { en: "Fundamentals", vi: "Chỉ số cơ bản" },
    "learn.group.sector": { en: "Sector Scanner", vi: "Máy quét ngành" },

    // ── Stock detail modal ──────────────────────────────────────────────────────
    "detail.onwatch": { en: "★ On Watchlist", vi: "★ Đang theo dõi" },
    "detail.addwatch": { en: "☆ Add to Watchlist", vi: "☆ Thêm vào theo dõi" },
    "detail.analysis": { en: "Analysis", vi: "Phân tích" },
    "detail.pricehistory": { en: "Price History", vi: "Lịch sử giá" },
    "detail.fundtrend": { en: "Fundamentals Trend", vi: "Xu hướng cơ bản" },
    "detail.fundamentals": { en: "Fundamentals", vi: "Chỉ số cơ bản" },
    "detail.about": { en: "About", vi: "Giới thiệu" },
    "detail.revenue": { en: "Revenue", vi: "Doanh thu" },
    "detail.profit": { en: "Profit", vi: "Lợi nhuận" },
    "detail.eps": { en: "EPS", vi: "EPS" },
    "detail.annual": { en: "Annual", vi: "Theo năm" },
    "detail.quarterly": { en: "Quarterly", vi: "Theo quý" },
    "stat.entry": { en: "Entry", vi: "Điểm mua" },
    "stat.stop": { en: "Stop", vi: "Cắt lỗ" },
    "stat.target": { en: "Target", vi: "Mục tiêu" },
    "stat.rr": { en: "R:R", vi: "R:R" },
    "stat.pivot": { en: "Pivot", vi: "Pivot" },
    "stat.range": { en: "Range", vi: "Biên độ" },
    "stat.voldryup": { en: "Vol dry-up", vi: "Cạn KL" },
    "stat.vcp": { en: "VCP", vi: "VCP" },
    "stat.marketcap": { en: "Market Cap", vi: "Vốn hóa" },
    "stat.pe": { en: "P/E", vi: "P/E" },
    "stat.roe": { en: "ROE", vi: "ROE" },
    "stat.profitmargin": { en: "Profit Margin", vi: "Biên lợi nhuận" },
    "stat.revgrowth": { en: "Rev Growth", vi: "Tăng trưởng DT" },
    "stat.beta": { en: "Beta", vi: "Beta" },
    "stat.divyield": { en: "Div Yield", vi: "Tỷ suất cổ tức" },
    "stat.week52": { en: "52w Range", vi: "Biên độ 52 tuần" },

    // ── Results table ───────────────────────────────────────────────────────────
    "table.symbol": { en: "Symbol", vi: "Mã" },
    "table.score": { en: "Score", vi: "Điểm" },
    "table.signal": { en: "Signal", vi: "Tín hiệu" },
    "table.stage": { en: "Stage", vi: "Giai đoạn" },
    "table.price": { en: "Price", vi: "Giá" },
    "table.entry": { en: "Entry", vi: "Mua" },
    "table.stop": { en: "Stop", vi: "Cắt lỗ" },
    "table.target": { en: "Target", vi: "Mục tiêu" },
    "table.rr": { en: "R:R", vi: "R:R" },
    "table.dist": { en: "Dist", vi: "K.cách" },
    "table.vcp": { en: "VCP", vi: "VCP" },
    "table.empty": { en: "No matches. Try lowering the min score or widening filters.", vi: "Không có kết quả. Hãy hạ điểm tối thiểu hoặc nới lỏng bộ lọc." },
    "table.tip": { en: 'Tip: click any row for charts & fundamentals. Hover the "i" icons for definitions.', vi: 'Mẹo: nhấp vào một dòng để xem biểu đồ & cơ bản. Di chuột lên biểu tượng "i" để xem định nghĩa.' },

    // ── Signal / stage badges ────────────────────────────────────────────────────
    "signal.BREAKOUT_IMMINENT": { en: "BREAKOUT", vi: "BỨT PHÁ" },
    "signal.CONSOLIDATING": { en: "CONSOLIDATING", vi: "TÍCH LŨY" },
    "signal.NO_SIGNAL": { en: "NO SIGNAL", vi: "KHÔNG TÍN HIỆU" },

    // ── Dynamic status / messages ────────────────────────────────────────────────
    "msg.enterSymbols": { en: "Enter symbols or pick a sector.", vi: "Nhập mã hoặc chọn một ngành." },
    "msg.scanning": { en: "Scanning…", vi: "Đang quét…" },
    "msg.scanningBroad": { en: "Scanning the broad universe — this can take a minute…", vi: "Đang quét toàn thị trường — có thể mất một phút…" },
    "msg.screeningWl": { en: "Screening watchlist…", vi: "Đang lọc danh sách theo dõi…" },
    "msg.scanningSectors": { en: "Scanning all 11 sectors…", vi: "Đang quét cả 11 ngành…" },
    "msg.rankingMarket": { en: "Ranking the market…", vi: "Đang xếp hạng thị trường…" },
    "msg.rankingBroad": { en: "Ranking the broad universe — this can take a minute on first run…", vi: "Đang xếp hạng toàn thị trường — lần đầu có thể mất một phút…" },
    "msg.loading": { en: "Loading", vi: "Đang tải" },
    "msg.noVolume": { en: "No volume data.", vi: "Không có dữ liệu khối lượng." },
    "msg.noChart": { en: "No chart data.", vi: "Không có dữ liệu biểu đồ." },
    "msg.noPicks": { en: "No setups matched this strategy right now. Try another strategy.", vi: "Hiện chưa có thiết lập nào khớp chiến lược này. Hãy thử chiến lược khác." },
    "msg.error": { en: "Error", vi: "Lỗi" },
    "prompt.renameWl": { en: "Rename watchlist:", vi: "Đổi tên danh sách:" },
    "prompt.newWl": { en: "Name your new watchlist:", vi: "Đặt tên danh sách mới:" },
    "prompt.deleteWl": { en: "Delete watchlist and its symbols?", vi: "Xóa danh sách và các mã trong đó?" },
    "wl.nosymbols": { en: "No symbols yet — add some above.", vi: "Chưa có mã nào — hãy thêm ở trên." },
    "sectors.clickhint": { en: "Click a sector to expand its volume trend, or screen its stocks.", vi: "Nhấp vào một ngành để xem xu hướng khối lượng, hoặc lọc cổ phiếu trong ngành." },
  };

  let lang = localStorage.getItem("lang") || "en";

  function getLang() { return lang; }

  function t(key, lng) {
    const e = STRINGS[key];
    if (!e) return key;
    return e[lng || lang] ?? e.en ?? key;
  }

  // Swap text/HTML of every [data-i18n] node. data-i18n-html opts into innerHTML.
  function applyStatic(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      const val = t(key);
      if (el.hasAttribute("data-i18n-html")) el.innerHTML = val;
      else el.textContent = val;
    });
    root.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      el.setAttribute("placeholder", t(el.dataset.i18nPh));
    });
  }

  // Listeners that re-render dynamic content when the language flips.
  const subscribers = [];
  function onChange(fn) { subscribers.push(fn); }

  function setLang(next) {
    lang = next === "vi" ? "vi" : "en";
    localStorage.setItem("lang", lang);
    document.documentElement.lang = lang;
    applyStatic();
    syncToggles();
    subscribers.forEach((fn) => { try { fn(lang); } catch (_) {} });
  }

  function syncToggles() {
    document.querySelectorAll("[data-lang-btn]").forEach((b) => {
      b.classList.toggle("active", b.dataset.langBtn === lang);
    });
  }

  function init() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-lang-btn]").forEach((b) => {
      b.addEventListener("click", () => setLang(b.dataset.langBtn));
    });
    applyStatic();
    syncToggles();
  }

  window.I18N = { t, getLang, setLang, applyStatic, onChange, init };
})();
