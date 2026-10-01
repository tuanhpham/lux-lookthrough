/**
 * Learn, Part II's opening chapter: how to get around, then every page, grouped the
 * way the top bar and the ☰ menu group them.
 *
 * ── WHY IT READS `PAGES` ────────────────────────────────────────────────────
 * The old guide was a hand-written list of eight pages. The app grew to fourteen
 * and then merged one away (Playbook → Learn §15), and the list noticed neither.
 * The order, the icons, the group and the one-line purpose now come from
 * `ui/pages.ts`, the same registry the menu, the palette and the crumb read. So a
 * new page shows up here as soon as it is registered. Only the "how to use it"
 * paragraph is written here, in `HOW`; a page without one still gets its card, just
 * with the one-liner alone.
 */
import { PAGE_GROUPS, PAGES, type Bi, type PageGroup } from '../ui/pages.js';
import { t } from '../ui/i18n.js';

type Lang = 'en' | 'vi';

/** What you do on each page, beyond the one-liner the registry already holds. */
const HOW: Record<string, Bi> = {
  calendar: {
    en: 'The page the app opens on. Earnings dates for the names you hold or watch, macro releases (CPI, Fed, payrolls) and events you add yourself, laid out over the next 30 days. Check it before planning a trade: the book says no new entry into an earnings date.',
    vi: 'Trang đầu tiên khi mở app. Lịch KQKD của các mã đang giữ hoặc đang theo dõi, lịch vĩ mô (CPI, Fed, bảng lương phi nông nghiệp) và sự kiện tự thêm, trong 30 ngày tới. Xem trước khi lên Trade plan: Playbook không cho mở lệnh mới sát ngày KQKD.',
  },
  picks: {
    en: 'Pick a strategy (<b>Qullamaggie</b> VCP & EP, <b>Momentum</b>, <b>Surge</b>) → a market and universe → <b>↻ Run</b>. Results stream in batch by batch. <b>As of date</b> replays a past day (Part II, next chapter).',
    vi: 'Chọn chiến lược (<b>Qullamaggie</b> VCP & EP, <b>Momentum</b>, <b>Surge</b>) → thị trường và rổ mã → <b>↻ Chạy</b>. Kết quả về dần theo từng đợt. <b>Tính đến ngày</b> chạy lại một ngày trong quá khứ (xem chương sau).',
  },
  screener: {
    en: 'Type tickers or click sector chips → set the setup type, minimum quality and momentum tier → <b>Run Screen</b>. Click a row for the full chart, levels and fundamentals.',
    vi: 'Gõ mã hoặc bấm chip ngành → chọn loại setup, điểm tối thiểu, nhóm động lượng → <b>Chạy lọc</b>. Bấm vào một dòng để xem chart đầy đủ, các mức giá và chỉ số cơ bản.',
  },
  sectors: {
    en: 'Ranks the sector ETFs on 1M / 3M / 6M momentum and RS vs SPY. Click a sector to see its stocks, then <b>Screen stocks →</b> sends them to the Screener. This is step 2 of the evening routine.',
    vi: 'Xếp hạng các sector ETF theo động lượng 1M / 3M / 6M và RS so với SPY. Bấm vào một ngành để xem các mã trong ngành, rồi <b>Lọc cổ phiếu →</b> để đẩy sang Screener. Đây là bước 2 trong quy trình mỗi tối.',
  },
  scanner: {
    en: 'What the VM scanned overnight: the market regime on last night’s close, then breakouts (BO), reversals (RV) and leaders (LEAD) with entry, stop and size already computed. Every gate and column is explained in the folds on the page.',
    vi: 'Những gì VM quét được đêm qua: trạng thái thị trường theo giá đóng cửa tối qua, rồi breakout (BO), đảo chiều (RV) và mã dẫn dắt (LEAD), có sẵn entry, stop và size. Từng bộ lọc, từng cột đều được giải thích trong các mục gập ngay trên trang.',
  },
  watchlist: {
    en: 'Lists of names you are stalking, each re-scored live. <b>📋 Trade plan</b> opens the planner: setup, stop, target, size and an A–D grade from the playbook’s checklist, as of any trade date.',
    vi: 'Các danh sách mã đang canh, mỗi mã được chấm điểm lại theo giá trực tiếp. <b>📋 Lập kế hoạch</b> mở trình lập Trade plan: setup, stop, target, size và hạng A–D theo checklist của Playbook, tính tại bất kỳ ngày giao dịch nào.',
  },
  casestudies: {
    en: 'The journal. File a setup with its date, levels, catalysts and lessons; each study draws its own chart around the trade date. A sold lot’s exit lands here too. <b>⬇ HTML</b> exports a printable report.',
    vi: 'Nhật ký giao dịch. Lưu một setup kèm ngày, các mức giá, catalyst và bài học; mỗi Case Study tự vẽ chart quanh ngày giao dịch. Lô đã bán cũng ghi điểm bán vào đây. <b>⬇ HTML</b> xuất báo cáo để in.',
  },
  backtest: {
    en: 'Enter 1–10 symbols, a period and a strategy (VCP breakout or momentum rebalancing) → Run. The last chapter of this part explains the usual reasons for 0 trades.',
    vi: 'Nhập 1–10 mã, chọn giai đoạn và chiến lược (VCP breakout hoặc tái cân bằng theo động lượng) → Chạy. Chương cuối của phần này giải thích các lý do thường gặp khi ra 0 lệnh.',
  },
  portfolio: {
    en: 'Paper accounts with live quotes. Buy and sell with a date (a past date fills that day’s close), and the Buy card suggests stop, target and size from the playbook. The <b>⚙ Playbook</b> button there edits the rules.',
    vi: 'Các tài khoản paper trading với giá trực tiếp. Mua/bán kèm ngày (chọn ngày cũ thì khớp theo giá đóng cửa hôm đó); thẻ Mua gợi ý stop, target và size theo Playbook. Nút <b>⚙ Playbook</b> ở đó dùng để sửa luật.',
  },
  wealth: {
    en: 'Dated balance readings for banks and cash in EUR, USD, VND or CNY, plus the portfolio, all converted at each date’s rate. Sort, edit a reading, switch the display currency.',
    vi: 'Số dư ngân hàng và tiền mặt ghi theo từng ngày, bằng EUR, USD, VND hoặc CNY, cộng cả Danh mục, quy đổi theo tỷ giá đúng ngày đó. Sắp xếp, sửa một lần ghi, đổi tiền tệ hiển thị.',
  },
  learn: {
    en: 'This book. Part I is the playbook: the routine you tick off each evening and the AI prompt library are in §15. The contents rail (or the bar at the top on a phone) follows your reading.',
    vi: 'Chính cuốn sổ này. Phần I là Playbook: checklist tick mỗi tối và thư viện prompt AI nằm ở mục 15. Mục lục bên cạnh (hoặc thanh trên cùng khi dùng điện thoại) chạy theo chỗ đang đọc.',
  },
  about: {
    en: 'Why the platform exists and how it came to be: the story, as a scrolling page.',
    vi: 'Vì sao có nền tảng này và nó ra đời thế nào: câu chuyện kể trên một trang cuộn.',
  },
  settings: {
    en: 'Sync and backups, restore everything to a moment, the playbook’s numbers, running and deploying the site, and the scanner VM runbook, with every command one click from the clipboard.',
    vi: 'Sync và sao lưu, khôi phục toàn bộ về một thời điểm, các thông số của Playbook, chạy và deploy trang, và sổ tay vận hành VM Scanner. Lệnh nào cũng chỉ một cú bấm là vào clipboard.',
  },
};

const GROUP_NOTE: Record<PageGroup, Bi> = {
  market: { en: 'Read the market: what is moving and when', vi: 'Đọc thị trường: cái gì đang chạy, lúc nào' },
  trade: { en: 'Turn a candidate into a plan, and keep the record', vi: 'Từ ứng viên thành Trade plan, rồi lưu hồ sơ' },
  money: { en: 'What you own, in one place', vi: 'Tài sản đang có, gom về một chỗ' },
  know: { en: 'The book, the story and the machine room', vi: 'Sổ tay, câu chuyện và phòng máy' },
};

/** Ways around the app that are not a page. */
const NAV: { k: string; t: Bi; d: Bi }[] = [
  {
    k: '▦',
    t: { en: 'Top bar groups', vi: 'Các nhóm trên thanh trên cùng' },
    d: { en: 'On a wide screen the four groups sit in the top bar; hover or click one for its pages.', vi: 'Trên màn hình rộng, bốn nhóm nằm ngay trên thanh trên cùng; rê chuột hoặc bấm vào để xem các trang.' },
  },
  {
    k: '☰',
    t: { en: 'The menu', vi: 'Menu' },
    d: { en: 'Every page on every screen size, plus theme, language, sync and the assistant.', vi: 'Đủ mọi trang trên mọi cỡ màn hình, kèm giao diện, ngôn ngữ, sync và Trợ lý.' },
  },
  {
    k: 'Ctrl K',
    t: { en: 'Search', vi: 'Tìm kiếm' },
    d: { en: 'Jump to a page, a playbook section or a settings guide by typing a few letters (⌘K on a Mac).', vi: 'Gõ vài chữ để nhảy tới một trang, một mục Playbook hay một hướng dẫn cài đặt (⌘K trên Mac).' },
  },
  {
    k: '☀︎ / ☾',
    t: { en: 'Light and dark', vi: 'Sáng và tối' },
    d: { en: 'The button beside search. Both themes are glass; the choice is remembered on this device.', vi: 'Nút cạnh ô tìm kiếm. Cả hai giao diện đều kiểu kính; thiết bị này sẽ nhớ lựa chọn.' },
  },
  {
    k: '☁️',
    t: { en: 'Sync', vi: 'Đồng bộ' },
    d: { en: 'Type your sync code once per device and everything (accounts, plans, studies, prompts, ticks) follows you.', vi: 'Mỗi thiết bị chỉ cần nhập mã sync một lần, mọi thứ (tài khoản, Trade plan, Case Study, prompt, checklist) sẽ theo bạn.' },
  },
];

const SOURCES: { s: string; use: Bi; note: Bi }[] = [
  {
    s: 'Yahoo Finance',
    use: { en: 'Daily bars, quotes, fundamentals', vi: 'Nến ngày, báo giá, chỉ số cơ bản' },
    note: { en: 'Split- and dividend-adjusted; the default provider', vi: 'Đã điều chỉnh chia tách và cổ tức; nguồn mặc định' },
  },
  {
    s: 'Finnhub',
    use: { en: 'Fallback quotes and fundamentals', vi: 'Báo giá và chỉ số cơ bản dự phòng' },
    note: { en: 'Optional API key, kept as a server secret', vi: 'API key tuỳ chọn, cất dạng secret trên server' },
  },
  {
    s: 'Nasdaq',
    use: { en: 'Earnings dates and surprises', vi: 'Lịch KQKD và mức vượt/hụt kỳ vọng' },
    note: { en: 'The last four quarters plus a 30-day forward sweep', vi: 'Bốn quý gần nhất, cộng quét trước 30 ngày tới' },
  },
  {
    s: 'Wikipedia',
    use: { en: 'S&P 1500 membership', vi: 'Thành phần rổ S&P 1500' },
    note: { en: 'Builds the screenable universe', vi: 'Dùng để dựng rổ mã cho Screener' },
  },
  {
    s: 'Scanner VM',
    use: { en: 'The nightly scan', vi: 'Bản quét nightly' },
    note: { en: 'Pushed to the site after the US close; see Settings & Guides', vi: 'Đẩy lên trang sau phiên Mỹ đóng cửa; xem Cài đặt & Hướng dẫn' },
  },
];

export function platformGuideHtml(lang: Lang): string {
  const vi = lang === 'vi';
  const nav = NAV.map((n) => `<div class="lg-nav-item">
      <kbd class="lg-key">${n.k}</kbd>
      <div><b>${n.t[lang]}</b><span>${n.d[lang]}</span></div>
    </div>`).join('');

  const groups = PAGE_GROUPS.map((g) => {
    const pages = PAGES.filter((p) => p.group === g.id);
    if (!pages.length) return '';
    return `<div class="lg-group lg-g-${g.id}">
      <div class="lg-group-h">
        <span class="lg-group-t">${g.title[lang]}</span>
        <span class="lg-group-s">${GROUP_NOTE[g.id][lang]}</span>
        <span class="lg-group-n">${pages.length}</span>
      </div>
      <div class="lg-pages">
        ${pages.map((p) => `<article class="lg-page">
          <header class="lg-page-h">
            <span class="lg-page-ic" aria-hidden="true">${p.icon}</span>
            <div class="lg-page-tt">
              <b>${t(`nav.${p.id}`)}</b>
              <span>${p.desc[lang]}</span>
            </div>
          </header>
          ${HOW[p.id] ? `<p class="lg-page-how">${HOW[p.id]![lang]}</p>` : ''}
          <button type="button" class="lg-open" data-lg-open="${p.id}">${vi ? 'Mở trang' : 'Open'} →</button>
        </article>`).join('')}
      </div>
    </div>`;
  }).join('');

  const sources = `<div class="lg-sources">
      ${SOURCES.map((s) => `<div class="lg-src"><b>${s.s}</b><span>${s.use[lang]}</span><em>${s.note[lang]}</em></div>`).join('')}
    </div>`;

  return `<div class="card analysis-card lg">
    <h2 class="lg-h">${vi ? '🧭 Cách di chuyển trong app' : '🧭 Getting around'}</h2>
    <p class="lg-lede">${vi
      ? `${PAGES.length} trang, chia làm bốn nhóm. Trang Playbook cũ giờ nằm trong Phần I của cuốn sổ này: checklist và thư viện prompt ở mục 15.`
      : `${PAGES.length} pages in four groups. The old Playbook page is now part of Part I of this book: its checklist and prompt library are in §15.`}</p>
    <div class="lg-nav">${nav}</div>
    <h2 class="lg-h">${vi ? '🗺 Từng trang, theo nhóm' : '🗺 Every page, by group'}</h2>
    ${groups}
    <h2 class="lg-h">${vi ? '🔌 Dữ liệu lấy từ đâu' : '🔌 Where the data comes from'}</h2>
    ${sources}
  </div>`;
}

/** The "Open →" buttons. The hash is the app's tab router, so this needs no import of it. */
export function wirePlatformGuide(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-lg-open]').forEach((b) =>
    b.addEventListener('click', () => { location.hash = `#${b.dataset.lgOpen}`; }),
  );
}
