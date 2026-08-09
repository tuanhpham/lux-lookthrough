import type { AppContext } from '../context.js';
import { $, el } from '../ui/dom.js';
import { getLang, t } from '../ui/i18n.js';
import {
  askChatGpt,
  copyToClipboard,
  gptBadgeHtml,
  loadGptUrl,
  wireGptBadge,
} from '../ui/askChatGpt.js';

/**
 * Trading System Playbook — a bilingual (EN/VI) reference page adapted to the
 * app's own design system (CSS variables, `.card`, `.prose`, toolbar pills).
 *
 * The original was a standalone dark-theme HTML page; here it is rebuilt with
 * the app's components so it inherits the active theme + language and stays
 * consistent with the rest of the desktop UI. Two small interactive widgets are
 * preserved (market-regime traffic light + a localStorage routine checklist).
 */

type Lang = 'en' | 'vi';
type Bi = { en: string; vi: string };
const tx = (b: Bi, lang: Lang) => b[lang] ?? b.en;

// ── Static content (bilingual) ──────────────────────────────────────────────

const REGIMES: { key: string; color: string; label: Bi; rule: Bi }[] = [
  {
    key: 'green',
    color: 'var(--accent)',
    label: { en: 'Risk-On', vi: 'Chấp nhận rủi ro' },
    rule: {
      en: 'Index above rising 50DMA & 200DMA, breadth expanding. Full position sizing, take valid breakouts.',
      vi: 'Chỉ số trên MA50 & MA200 đang dốc lên, độ rộng mở rộng. Vào lệnh đầy đủ, mua các điểm phá vỡ hợp lệ.',
    },
  },
  {
    key: 'yellow',
    color: 'var(--warn)',
    label: { en: 'Caution', vi: 'Thận trọng' },
    rule: {
      en: 'Index choppy around 50DMA, mixed breadth. Half size, tighten stops, only A+ setups.',
      vi: 'Chỉ số giằng co quanh MA50, độ rộng lẫn lộn. Vào nửa khối lượng, siết stop, chỉ setup A+.',
    },
  },
  {
    key: 'red',
    color: 'var(--danger)',
    label: { en: 'Risk-Off', vi: 'Phòng thủ' },
    rule: {
      en: 'Index below falling 200DMA, distribution days stacking. Mostly cash, no new longs.',
      vi: 'Chỉ số dưới MA200 đang dốc xuống, ngày phân phối chồng chất. Phần lớn tiền mặt, không mở lệnh mua mới.',
    },
  },
];

interface Prompt {
  id: string;
  title: Bi;
  goal: Bi;
  body: Bi;
}

/**
 * Built-in prompt library. Used to seed the editable, persisted library the
 * first time the tab is opened (and restored by "Reset"). The user's own copy
 * lives in storage under `PROMPTS_KEY` — see loadPrompts / savePrompts below.
 */
const DEFAULT_PROMPTS: Prompt[] = [
  {
    id: 'regime',
    title: { en: 'Market Regime Check', vi: 'Kiểm tra trạng thái thị trường' },
    goal: { en: 'Decide risk-on / caution / risk-off before any trade.', vi: 'Quyết định risk-on / thận trọng / risk-off trước khi giao dịch.' },
    body: {
      en: `Act as a market technician. Given SPY & QQQ daily data (last 60 bars), report:
- Price vs 50DMA and 200DMA (above/below, slope)
- Distribution days in the last 25 sessions
- Breadth read (advancers vs decliners if provided)
Return a single regime: GREEN / YELLOW / RED and one-line position-sizing guidance.`,
      vi: `Đóng vai chuyên gia phân tích kỹ thuật. Với dữ liệu ngày của SPY & QQQ (60 phiên gần nhất), báo cáo:
- Giá so với MA50 và MA200 (trên/dưới, độ dốc)
- Số ngày phân phối trong 25 phiên gần nhất
- Độ rộng thị trường (số mã tăng so với giảm nếu có)
Trả về một trạng thái duy nhất: XANH / VÀNG / ĐỎ kèm một dòng hướng dẫn khối lượng vị thế.`,
    },
  },
  {
    id: 'triage',
    title: { en: 'Watchlist Triage', vi: 'Sàng lọc danh sách theo dõi' },
    goal: { en: 'Rank watchlist names by setup quality.', vi: 'Xếp hạng các mã trong watchlist theo chất lượng setup.' },
    body: {
      en: `For each symbol I provide, summarize:
- Weinstein stage (1–4) and trend
- Base type (VCP, flat base, cup) and number of contractions
- Distance to pivot (%) and volume behavior (dry-up?)
Output a table sorted by readiness. Flag anything within 3% of pivot.`,
      vi: `Với mỗi mã tôi cung cấp, tóm tắt:
- Giai đoạn Weinstein (1–4) và xu hướng
- Loại nền giá (VCP, nền phẳng, cốc tay cầm) và số lần co thắt
- Khoảng cách tới pivot (%) và diễn biến khối lượng (cạn kiệt?)
Xuất bảng sắp xếp theo độ sẵn sàng. Đánh dấu mã nào trong vòng 3% quanh pivot.`,
    },
  },
  {
    id: 'entry',
    title: { en: 'Entry Plan', vi: 'Kế hoạch vào lệnh' },
    goal: { en: 'Turn a candidate into a concrete, risk-defined trade.', vi: 'Biến một ứng viên thành lệnh có rủi ro xác định.' },
    body: {
      en: `Given the pivot, recent ATR and my account risk (% per trade):
- Buy point (pivot + small buffer)
- Initial stop (below base / structure)
- Position size for my risk budget
- 1st/2nd profit targets at fixed R multiples
State the R:R and the single invalidation condition.`,
      vi: `Với pivot, ATR gần đây và mức rủi ro tài khoản của tôi (% mỗi lệnh):
- Điểm mua (pivot + đệm nhỏ)
- Stop ban đầu (dưới nền / cấu trúc)
- Khối lượng vị thế theo ngân sách rủi ro
- Mục tiêu chốt lời 1/2 theo bội số R cố định
Nêu rõ tỷ lệ R:R và một điều kiện vô hiệu hóa setup.`,
    },
  },
  {
    id: 'review',
    title: { en: 'Position Review', vi: 'Rà soát vị thế' },
    goal: { en: 'Manage open trades objectively.', vi: 'Quản lý lệnh đang mở một cách khách quan.' },
    body: {
      en: `For each open position (entry, stop, last price, days held):
- Current open R and % from stop
- Is the stop trailing logic triggered? (e.g. above 1.5R → move to breakeven)
- Any sell signal (close below 50DMA on volume, climax run, stage 3)?
Recommend: HOLD / TRIM / EXIT with one reason each.`,
      vi: `Với mỗi vị thế đang mở (giá vào, stop, giá hiện tại, số ngày nắm giữ):
- R hiện tại và % cách stop
- Đã kích hoạt quy tắc dời stop chưa? (vd trên 1.5R → dời về hòa vốn)
- Có tín hiệu bán nào không (đóng dưới MA50 kèm khối lượng, tăng vọt climax, giai đoạn 3)?
Khuyến nghị: GIỮ / GIẢM / THOÁT kèm một lý do mỗi mã.`,
    },
  },
  {
    id: 'postmortem',
    title: { en: 'Post-Mortem Journal', vi: 'Nhật ký tổng kết' },
    goal: { en: 'Extract a repeatable lesson from each closed trade.', vi: 'Rút ra bài học lặp lại được từ mỗi lệnh đã đóng.' },
    body: {
      en: `Given a closed trade (plan vs actual):
- Did I follow my entry, stop and sizing rules? (yes/no each)
- What was the realized R and the main driver?
- One process mistake to avoid and one thing done well.
Write a 3-bullet journal entry I can paste into the Analysis tab.`,
      vi: `Với một lệnh đã đóng (kế hoạch so với thực tế):
- Tôi có tuân thủ quy tắc vào lệnh, stop và khối lượng không? (có/không mỗi mục)
- R thực hiện được là bao nhiêu và động lực chính là gì?
- Một lỗi quy trình cần tránh và một việc đã làm tốt.
Viết một mục nhật ký 3 gạch đầu dòng để tôi dán vào tab Phân tích.`,
    },
  },
  {
    id: 'us-brief',
    title: { en: 'Morning · US Overnight Brief', vi: 'Sáng · Bản tin đêm qua của Mỹ' },
    goal: { en: 'Read the overnight US tape before the VN session.', vi: 'Đọc diễn biến đêm Mỹ trước phiên VN.' },
    body: {
      en: `Summarize last night's US session: (1) how S&P 500, Nasdaq, Dow closed and their volume; (2) 10-year yield, DXY, oil, gold, VIX levels and changes; (3) any major macro/political news; (4) which sectors led, which were sold. Conclude: risk-on or risk-off, and what it implies for today's Vietnam session. Keep it concise and cite sources for key figures.`,
      vi: `Tổng hợp diễn biến phiên Mỹ đêm qua: (1) S&P 500, Nasdaq, Dow đóng cửa thế nào và khối lượng ra sao; (2) lợi suất 10 năm, DXY, dầu, vàng, VIX ở mức nào và thay đổi ra sao; (3) tin vĩ mô/chính trị lớn nào tác động; (4) ngành nào dẫn dắt, ngành nào bị bán. Kết luận: risk-on hay risk-off, hàm ý gì cho phiên Việt Nam hôm nay. Trình bày ngắn gọn, nêu nguồn cho các số liệu chính.`,
    },
  },
  {
    id: 'vn-recap',
    title: { en: 'Evening · Vietnam Session Recap', vi: 'Tối · Tổng kết phiên Việt Nam' },
    goal: { en: 'Recap the VN session and prep for tomorrow.', vi: 'Tổng kết phiên VN và chuẩn bị cho ngày mai.' },
    body: {
      en: `Summarize today's VN-Index session: index level, volume, market breadth; foreign net buy/sell value and which stocks/sectors they focused on; strongest and weakest sectors. Cross-check against the traffic-light status I track and flag any signals worth noting for the week.`,
      vi: `Tổng hợp phiên VN-Index hôm nay: điểm số, khối lượng, độ rộng thị trường; giá trị mua/bán ròng khối ngoại và họ tập trung mã/ngành nào; nhóm ngành mạnh/yếu nhất phiên. Đối chiếu trạng thái đèn giao thông tôi đang theo dõi và nêu nếu có tín hiệu cần chú ý cho tuần.`,
    },
  },
  {
    id: 'weekend-map',
    title: { en: 'Weekend · Battle Map for the Week', vi: 'Cuối tuần · Bản đồ trận địa tuần tới' },
    goal: { en: 'Draw the full battle map for the coming week.', vi: 'Vẽ bản đồ trận địa cho tuần tới.' },
    body: {
      en: `Write a weekend report in 4 ordered parts: (1) Macro — key economic data from the US and VN this past week, how markets reacted, and next week's risk events with dates (CPI, PCE, Fed meeting, derivatives expiry...); (2) Market health — where the main US and VN indices sit vs MA50/MA200, breadth, whether the trend is strengthening or weakening; (3) Sector rotation — which sectors have the strongest RS in each market, where money is flowing in/out; (4) propose priority sectors to hunt stocks in next week. Cite sources at the end.`,
      vi: `Làm báo cáo cuối tuần gồm 4 phần theo thứ tự: (1) Vĩ mô — dữ liệu kinh tế quan trọng tuần qua của Mỹ và VN, thị trường phản ứng thế nào, và lịch sự kiện rủi ro tuần tới kèm ngày (CPI, PCE, họp Fed, đáo hạn phái sinh...); (2) Sức khỏe thị trường — vị thế các chỉ số chính Mỹ và VN so với MA50/MA200, độ rộng, xu hướng mạnh lên hay yếu đi; (3) Luân chuyển ngành — ngành nào RS mạnh nhất mỗi thị trường, tiền chảy vào/ra đâu; (4) đề xuất nhóm ngành ưu tiên săn cổ phiếu tuần tới. Cuối báo cáo nêu rõ nguồn.`,
    },
  },
  {
    id: 'monthly',
    title: { en: 'Monthly · The Big Picture', vi: 'Tháng · Bức tranh lớn' },
    goal: { en: 'Zoom out to cycle and policy once a month.', vi: 'Lùi lại nhìn chu kỳ và chính sách mỗi tháng.' },
    body: {
      en: `Give a monthly overview: which stage of the economic cycle we're in, any shifts in Fed and SBV monetary policy direction, the major macro/geopolitical themes driving global money flows, and the implications for allocating capital between the US and Vietnam markets.`,
      vi: `Đánh giá tổng quan tháng: chu kỳ kinh tế đang ở giai đoạn nào, định hướng chính sách tiền tệ Fed và NHNN có thay đổi gì, chủ đề vĩ mô/địa chính trị lớn đang chi phối dòng tiền toàn cầu, và hàm ý cho việc phân bổ vốn giữa thị trường Mỹ và Việt Nam.`,
    },
  },
  {
    id: 'single-stock',
    title: { en: 'Bonus · Single-Stock Analysis', vi: 'Bổ trợ · Phân tích một cổ phiếu' },
    goal: { en: 'Contextualize one stock — facts, not advice.', vi: 'Bối cảnh hóa một cổ phiếu — dữ kiện, không khuyến nghị.' },
    body: {
      en: `Analyze [TICKER]: (1) does it meet the Trend Template (price vs MA50/150/200, MA direction, RS vs index); (2) is it forming a VCP or near a pivot — describe the base structure and volume; (3) sector context and money flow; (4) key technical levels. Do not give buy/sell recommendations — only describe the facts so I can decide for myself.`,
      vi: `Phân tích [MÃ]: (1) có đạt Trend Template không (giá so với MA50/150/200, hướng MA, RS so với chỉ số); (2) đang hình thành VCP hay gần pivot không, mô tả cấu trúc nền giá và khối lượng; (3) bối cảnh ngành và dòng tiền; (4) các mốc kỹ thuật quan trọng. Không đưa khuyến nghị mua/bán — chỉ mô tả dữ kiện để tôi tự quyết định.`,
    },
  },
];

const PROMPTS_KEY = 'playbook:prompts';

async function loadPrompts(ctx: AppContext): Promise<Prompt[]> {
  const stored = await ctx.storage.get<Prompt[]>(PROMPTS_KEY);
  return stored && stored.length ? stored : DEFAULT_PROMPTS;
}

async function savePrompts(ctx: AppContext, prompts: Prompt[]): Promise<void> {
  await ctx.storage.set(PROMPTS_KEY, prompts);
}

const ROUTINE: { phase: Bi; items: Bi[] }[] = [
  {
    phase: { en: 'Pre-Market (Daily)', vi: 'Trước phiên (Hằng ngày)' },
    items: [
      { en: 'Run market regime check (P1)', vi: 'Chạy kiểm tra trạng thái thị trường (P1)' },
      { en: 'Update watchlist & note names near pivot', vi: 'Cập nhật watchlist & ghi chú mã gần điểm pivot' },
      { en: 'Set alerts at buy points', vi: 'Đặt cảnh báo tại điểm mua' },
    ],
  },
  {
    phase: { en: 'During Session', vi: 'Trong phiên' },
    items: [
      { en: 'Only act on triggered, planned setups', vi: 'Chỉ hành động với setup đã lên kế hoạch và được kích hoạt' },
      { en: 'Size by risk, never by conviction', vi: 'Tính khối lượng theo rủi ro, không theo cảm tính' },
      { en: 'No new buys in RED regime', vi: 'Không mua mới khi thị trường ở trạng thái ĐỎ' },
    ],
  },
  {
    phase: { en: 'Post-Market (Daily)', vi: 'Sau phiên (Hằng ngày)' },
    items: [
      { en: 'Review open positions (P4)', vi: 'Rà soát vị thế đang mở (P4)' },
      { en: 'Move stops per trailing rules', vi: 'Dời stop theo quy tắc trailing' },
      { en: 'Log any closed trade (P5)', vi: 'Ghi nhật ký mọi lệnh đã đóng (P5)' },
    ],
  },
  {
    phase: { en: 'Weekend (Weekly)', vi: 'Cuối tuần (Hằng tuần)' },
    items: [
      { en: 'Sector rotation read (Sectors tab)', vi: 'Đọc luân chuyển ngành (tab Ngành)' },
      { en: 'Refresh full watchlist with the screener', vi: 'Làm mới toàn bộ watchlist bằng bộ lọc' },
      { en: 'Write the weekly post in the Analysis tab', vi: 'Viết bài phân tích tuần ở tab Phân tích' },
    ],
  },
];

const DATA_SOURCES: { source: string; use: Bi; note: Bi }[] = [
  {
    source: 'Yahoo Finance',
    use: { en: 'Primary OHLCV + fundamentals', vi: 'OHLCV chính + dữ liệu cơ bản' },
    note: { en: 'Split/dividend-adjusted; default provider in this app', vi: 'Đã điều chỉnh chia tách/cổ tức; nhà cung cấp mặc định' },
  },
  {
    source: 'Finnhub',
    use: { en: 'Fallback quotes / fundamentals', vi: 'Báo giá / cơ bản dự phòng' },
    note: { en: 'Optional API key (Settings / Cloudflare secret)', vi: 'Khóa API tùy chọn (Cài đặt / secret Cloudflare)' },
  },
  {
    source: 'Wikipedia',
    use: { en: 'S&P 1500 universe membership', vi: 'Thành phần rổ S&P 1500' },
    note: { en: 'Used to build the screenable universe', vi: 'Dùng để dựng rổ cổ phiếu có thể quét' },
  },
];

const RISK_RULES: Bi[] = [
  { en: 'Risk a fixed % of equity per trade (e.g. 0.5–1%).', vi: 'Rủi ro một % cố định trên vốn cho mỗi lệnh (vd 0,5–1%).' },
  { en: 'Never average down a losing trade.', vi: 'Không bao giờ trung bình giá xuống cho lệnh thua.' },
  { en: 'Cut losers at the planned stop — no exceptions.', vi: 'Cắt lỗ tại stop đã định — không ngoại lệ.' },
  { en: 'Let winners run with a trailing stop above breakeven.', vi: 'Để lệnh thắng chạy với trailing stop trên điểm hòa vốn.' },
  { en: 'Max portfolio heat (sum of open risk) capped.', vi: 'Giới hạn tổng rủi ro đang mở của danh mục.' },
];

// ── Render ──────────────────────────────────────────────────────────────────

const ROUTINE_KEY = 'playbook:routine';

export function renderPlaybook(ctx: AppContext): void {
  const lang = getLang() as Lang;
  const root = $('#tab-playbook')!;
  const title = { en: 'Trading System Playbook', vi: 'Sổ tay hệ thống giao dịch' };
  const sub = {
    en: 'A repeatable, rules-based workflow — market regime, watchlist triage, entries, risk and review.',
    vi: 'Quy trình lặp lại theo quy tắc — trạng thái thị trường, sàng lọc watchlist, vào lệnh, quản trị rủi ro và rà soát.',
  };

  root.innerHTML = `<h1>${tx(title, lang)}</h1><p class="subtitle">${tx(sub, lang)}</p>`;

  // 1) Market regime traffic light
  const regimeSection = el(`<div class="playbook-section"></div>`);
  regimeSection.appendChild(sectionHead({ en: '1 · Market Regime', vi: '1 · Trạng thái thị trường' }, lang));
  const regimeGrid = el(`<div class="grid grid-cards"></div>`);
  for (const r of REGIMES) {
    regimeGrid.appendChild(
      el(`<div class="card" style="border-left:4px solid ${r.color}">
        <div class="row" style="gap:8px;align-items:center">
          <span style="width:12px;height:12px;border-radius:50%;background:${r.color};box-shadow:0 0 8px ${r.color}"></span>
          <strong>${tx(r.label, lang)}</strong>
        </div>
        <p class="muted" style="margin:8px 0 0;line-height:1.55">${tx(r.rule, lang)}</p>
      </div>`),
    );
  }
  regimeSection.appendChild(regimeGrid);
  root.appendChild(regimeSection);

  // 2) Agent prompt library — editable + persisted (see renderPromptLibrary)
  const promptSection = el(`<div class="playbook-section"></div>`);
  const promptHead = el(`<div class="row" style="align-items:center;gap:8px;margin-bottom:10px"></div>`);
  promptHead.appendChild(sectionHead({ en: '2 · Agent Prompt Library', vi: '2 · Thư viện prompt cho AI' }, lang));
  const addBtn = el(`<button class="range-btn" style="margin-left:auto">${lang === 'vi' ? '+ Thêm prompt' : '+ Add prompt'}</button>`);
  const resetBtn = el(`<button class="range-btn">${lang === 'vi' ? 'Khôi phục mặc định' : 'Reset to defaults'}</button>`);
  promptHead.appendChild(addBtn);
  promptHead.appendChild(resetBtn);
  promptSection.appendChild(promptHead);
  const promptList = el(`<div></div>`);
  promptSection.appendChild(promptList);
  root.appendChild(promptSection);

  void renderPromptLibrary(ctx, lang, promptList);

  addBtn.addEventListener('click', () => {
    openPromptEditor(ctx, lang, null, () => void renderPromptLibrary(ctx, lang, promptList));
  });
  resetBtn.addEventListener('click', async () => {
    const msg = lang === 'vi' ? 'Khôi phục toàn bộ prompt về mặc định? Mọi chỉnh sửa sẽ mất.' : 'Reset all prompts to defaults? Your edits will be lost.';
    if (!confirm(msg)) return;
    await ctx.storage.delete(PROMPTS_KEY);
    void renderPromptLibrary(ctx, lang, promptList);
  });

  // 3) Routine checklist (persisted)
  const routineSection = el(`<div class="playbook-section"></div>`);
  routineSection.appendChild(sectionHead({ en: '3 · Routine Checklist', vi: '3 · Checklist quy trình' }, lang));
  const routineGrid = el(`<div class="grid grid-cards"></div>`);
  routineSection.appendChild(routineGrid);
  root.appendChild(routineSection);

  void (async () => {
    const checked = (await ctx.storage.get<Record<string, boolean>>(ROUTINE_KEY)) ?? {};
    ROUTINE.forEach((block, bi) => {
      const card = el(`<div class="card"><strong>${tx(block.phase, lang)}</strong><div style="margin-top:8px"></div></div>`);
      const wrap = card.lastElementChild as HTMLElement;
      block.items.forEach((item, ii) => {
        const id = `${bi}-${ii}`;
        const row = el(`<label class="playbook-check">
          <input type="checkbox" ${checked[id] ? 'checked' : ''} />
          <span>${tx(item, lang)}</span>
        </label>`);
        row.querySelector('input')!.addEventListener('change', (e) => {
          checked[id] = (e.target as HTMLInputElement).checked;
          void ctx.storage.set(ROUTINE_KEY, checked);
        });
        wrap.appendChild(row);
      });
      routineGrid.appendChild(card);
    });
  })();

  // 4) Risk rules
  const riskSection = el(`<div class="playbook-section"></div>`);
  riskSection.appendChild(sectionHead({ en: '4 · Risk Rules', vi: '4 · Quy tắc rủi ro' }, lang));
  const riskCard = el(`<div class="card"><ul class="playbook-list"></ul></div>`);
  const ul = riskCard.querySelector('ul')!;
  for (const rule of RISK_RULES) ul.appendChild(el(`<li>${tx(rule, lang)}</li>`));
  riskSection.appendChild(riskCard);
  root.appendChild(riskSection);

  // 5) Data sources
  const dataSection = el(`<div class="playbook-section"></div>`);
  dataSection.appendChild(sectionHead({ en: '5 · Data Sources', vi: '5 · Nguồn dữ liệu' }, lang));
  const table = el(`<div class="card" style="overflow:auto"><table class="playbook-table">
    <thead><tr>
      <th>${lang === 'vi' ? 'Nguồn' : 'Source'}</th>
      <th>${lang === 'vi' ? 'Dùng cho' : 'Used for'}</th>
      <th>${lang === 'vi' ? 'Ghi chú' : 'Note'}</th>
    </tr></thead><tbody></tbody></table></div>`);
  const tbody = table.querySelector('tbody')!;
  for (const d of DATA_SOURCES) {
    tbody.appendChild(
      el(`<tr><td><strong>${String(d.source)}</strong></td><td>${tx(d.use, lang)}</td><td class="muted">${tx(d.note, lang)}</td></tr>`),
    );
  }
  dataSection.appendChild(table);
  root.appendChild(dataSection);
}

/**
 * Render every prompt card into `list`, each with Ask / Copy / Edit / Delete.
 *
 * Ask and Copy both use the body in the active language. Edit/Delete mutate the
 * persisted copy and re-render. Called on first paint and after any change.
 *
 * The GPT badge sits once above the list rather than on each card: it reflects one
 * shared setting, and repeating it per prompt would suggest each has its own.
 */
async function renderPromptLibrary(ctx: AppContext, lang: Lang, list: HTMLElement): Promise<void> {
  const prompts = await loadPrompts(ctx);
  await loadGptUrl(ctx);
  list.innerHTML = '';

  const badge = el(gptBadgeHtml());
  list.appendChild(badge);
  wireGptBadge(list, ctx, () => void renderPromptLibrary(ctx, lang, list));

  prompts.forEach((p, idx) => {
    const body = tx(p.body, lang);
    const card = el(`<div class="card" style="margin-bottom:10px">
      <div class="row" style="gap:8px;align-items:baseline">
        <span class="badge" style="background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)">P${idx + 1}</span>
        <strong>${escapeHtml(tx(p.title, lang))}</strong>
        <span class="row" style="gap:6px;margin-left:auto">
          <button class="btn" data-ask>${t('prompts.ask')}</button>
          <button class="range-btn" data-copy>${lang === 'vi' ? 'Sao chép' : 'Copy'}</button>
          <button class="range-btn" data-edit>${lang === 'vi' ? 'Sửa' : 'Edit'}</button>
          <button class="range-btn" data-del>${lang === 'vi' ? 'Xóa' : 'Delete'}</button>
        </span>
      </div>
      <p class="muted" style="margin:6px 0 8px;line-height:1.5">${escapeHtml(tx(p.goal, lang))}</p>
      <pre class="playbook-pre">${escapeHtml(body)}</pre>
    </div>`);

    card.querySelector('[data-ask]')!.addEventListener('click', (e) => {
      askChatGpt(body, e.currentTarget as HTMLElement);
    });
    // Shared with the stock modal and Case Studies so the feedback — and the
    // "couldn't copy" case, which iOS hits often enough to matter — is identical
    // everywhere.
    card.querySelector('[data-copy]')!.addEventListener('click', (e) => {
      void copyToClipboard(body, e.currentTarget as HTMLElement);
    });
    card.querySelector('[data-edit]')!.addEventListener('click', () => {
      openPromptEditor(ctx, lang, p.id, () => void renderPromptLibrary(ctx, lang, list));
    });
    card.querySelector('[data-del]')!.addEventListener('click', async () => {
      const msg = lang === 'vi' ? `Xóa prompt "${tx(p.title, lang)}"?` : `Delete prompt "${tx(p.title, lang)}"?`;
      if (!confirm(msg)) return;
      const next = (await loadPrompts(ctx)).filter((x) => x.id !== p.id);
      await savePrompts(ctx, next);
      void renderPromptLibrary(ctx, lang, list);
    });
    list.appendChild(card);
  });
}

/**
 * Open the shared `#modal` as a prompt editor. `id === null` creates a new
 * prompt; otherwise it edits the matching one. Both EN and VI fields are
 * editable so the library stays bilingual. `onSaved` re-renders the list.
 */
function openPromptEditor(ctx: AppContext, lang: Lang, id: string | null, onSaved: () => void): void {
  const modal = $('#modal')!;
  void (async () => {
    const prompts = await loadPrompts(ctx);
    const existing = id ? prompts.find((p) => p.id === id) ?? null : null;
    const p: Prompt = existing ?? {
      id: `custom-${Date.now()}`,
      title: { en: '', vi: '' },
      goal: { en: '', vi: '' },
      body: { en: '', vi: '' },
    };

    const L = (en: string, vi: string) => (lang === 'vi' ? vi : en);
    modal.classList.remove('hidden');
    $('#modal-title')!.textContent = existing ? L('Edit prompt', 'Sửa prompt') : L('New prompt', 'Prompt mới');
    $('#modal-body')!.innerHTML = `
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <div><label class="field-label">${L('Title (EN)', 'Tiêu đề (EN)')}</label><input id="p-title-en" class="field" value="${escapeAttr(p.title.en)}" /></div>
        <div><label class="field-label">${L('Title (VI)', 'Tiêu đề (VI)')}</label><input id="p-title-vi" class="field" value="${escapeAttr(p.title.vi)}" /></div>
        <div><label class="field-label">${L('Goal (EN)', 'Mục tiêu (EN)')}</label><input id="p-goal-en" class="field" value="${escapeAttr(p.goal.en)}" /></div>
        <div><label class="field-label">${L('Goal (VI)', 'Mục tiêu (VI)')}</label><input id="p-goal-vi" class="field" value="${escapeAttr(p.goal.vi)}" /></div>
      </div>
      <label class="field-label" style="margin-top:10px">${L('Prompt body (EN)', 'Nội dung prompt (EN)')}</label>
      <textarea id="p-body-en" class="field" style="min-height:140px;font-family:monospace;font-size:12px;line-height:1.5;resize:vertical">${escapeHtml(p.body.en)}</textarea>
      <label class="field-label" style="margin-top:10px">${L('Prompt body (VI)', 'Nội dung prompt (VI)')}</label>
      <textarea id="p-body-vi" class="field" style="min-height:140px;font-family:monospace;font-size:12px;line-height:1.5;resize:vertical">${escapeHtml(p.body.vi)}</textarea>
      <div class="row" style="justify-content:flex-end;margin-top:14px;gap:8px">
        <button id="p-cancel" class="btn-outline">${L('Cancel', 'Hủy')}</button>
        <button id="p-save" class="btn">${existing ? L('Save changes', 'Lưu thay đổi') : L('Create prompt', 'Tạo prompt')}</button>
      </div>`;

    const body = $('#modal-body')!;
    const val = (sel: string) => (body.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement).value;

    body.querySelector('#p-cancel')!.addEventListener('click', () => modal.classList.add('hidden'));
    body.querySelector('#p-save')!.addEventListener('click', async () => {
      const titleEn = val('#p-title-en').trim();
      const titleVi = val('#p-title-vi').trim();
      if (!titleEn && !titleVi) {
        alert(L('Please enter a title.', 'Vui lòng nhập tiêu đề.'));
        return;
      }
      // Mirror a single-language entry so neither view is blank.
      const next: Prompt = {
        id: p.id,
        title: { en: titleEn || titleVi, vi: titleVi || titleEn },
        goal: { en: val('#p-goal-en').trim() || val('#p-goal-vi').trim(), vi: val('#p-goal-vi').trim() || val('#p-goal-en').trim() },
        body: { en: val('#p-body-en') || val('#p-body-vi'), vi: val('#p-body-vi') || val('#p-body-en') },
      };
      const current = await loadPrompts(ctx);
      const i = current.findIndex((x) => x.id === p.id);
      if (i >= 0) current[i] = next;
      else current.push(next);
      await savePrompts(ctx, current);
      modal.classList.add('hidden');
      onSaved();
    });
  })();
}

function sectionHead(b: Bi, lang: Lang): HTMLElement {
  return el(
    `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--accent);margin:0 0 10px">${tx(b, lang)}</h2>`,
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
