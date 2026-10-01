import type { AppContext } from '../context.js';
import { $, el } from '../ui/dom.js';
import { t } from '../ui/i18n.js';
import { askInChat } from '../ui/chatPanel.js';
import { paBtn, promptActsHtml } from '../ui/promptActions.js';
import {
  askChatGpt,
  copyToClipboard,
  gptBadgeHtml,
  loadGptUrl,
  wireGptBadge,
} from '../ui/askChatGpt.js';

/**
 * The working half of the swing-trading playbook: the routine you tick off and the
 * prompt library you send to an AI. Both live inside §15 "The daily routine" in Learn.
 *
 * ── WHY THIS IS NOT A PAGE ANY MORE ─────────────────────────────────────────
 * There used to be a separate Playbook tab with a regime traffic light, risk rules,
 * a routine and these prompts. The playbook in Learn already covers the regime
 * (§3) and the risk rules (§9–10), and covers them better. So the two pages said the
 * same things twice with different numbers. What only the old tab had were the
 * interactive parts, so they moved into the section they belong to, and the tab was
 * removed. `#playbook` still works: main.ts maps it to Learn, §15.
 *
 * ── STORAGE ─────────────────────────────────────────────────────────────────
 * The keys did not move (`playbook:prompts`, `playbook:routine`), so a user's
 * edited prompts survived the merge. Ticks are keyed by step (`ev-0`, `wk-3`).
 * Ticks from the old four-phase list never match a new key, so they are ignored,
 * which is harmless for a checklist that is meant to be cleared every day anyway.
 *
 * `routineHtml` and `promptsHtml` are static and are drawn by swingPlaybook.ts with
 * the rest of the section. `wirePlaybookTools` then restores the ticks and fills the
 * prompt library, which needs storage.
 */

type Lang = 'en' | 'vi';
type Bi = { en: string; vi: string };
const tx = (b: Bi, lang: Lang) => b[lang] ?? b.en;

interface Prompt {
  id: string;
  title: Bi;
  goal: Bi;
  body: Bi;
}

/**
 * Built-in prompt library. Used to seed the editable, persisted library the
 * first time it is shown (and restored by "Reset"). The user's own copy
 * lives in storage under `PROMPTS_KEY` — see loadPrompts / savePrompts below.
 */
const DEFAULT_PROMPTS: Prompt[] = [
  {
    id: 'regime',
    title: { en: 'Market Regime Check', vi: 'Kiểm tra trạng thái thị trường' },
    goal: { en: 'Decide risk-on / caution / risk-off before any trade.', vi: 'Chốt risk-on / thận trọng / risk-off trước khi vào lệnh.' },
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
Trả về một trạng thái duy nhất: XANH / VÀNG / ĐỎ kèm một dòng gợi ý size vị thế.`,
    },
  },
  {
    id: 'triage',
    title: { en: 'Watchlist Triage', vi: 'Sàng lọc Watchlist' },
    goal: { en: 'Rank watchlist names by setup quality.', vi: 'Xếp hạng các mã trong watchlist theo chất lượng setup.' },
    body: {
      en: `For each symbol I provide, summarize:
- Weinstein stage (1–4) and trend
- Base type (VCP, flat base, cup) and number of contractions
- Distance to pivot (%) and volume behavior (dry-up?)
Output a table sorted by readiness. Flag anything within 3% of pivot.`,
      vi: `Với mỗi mã tôi gửi, tóm tắt:
- Giai đoạn Weinstein (1–4) và xu hướng
- Loại nền giá (VCP, nền phẳng, cốc tay cầm) và số lần co thắt
- Khoảng cách tới pivot (%) và diễn biến khối lượng (cạn kiệt?)
Trả về bảng xếp theo mức độ sẵn sàng. Đánh dấu các mã đang cách pivot trong vòng 3%.`,
    },
  },
  {
    id: 'entry',
    title: { en: 'Entry Plan', vi: 'Kế hoạch vào lệnh' },
    goal: { en: 'Turn a candidate into a concrete, risk-defined trade.', vi: 'Biến một mã ứng viên thành lệnh cụ thể, rủi ro rõ ràng.' },
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
- Size vị thế theo ngân sách rủi ro
- Mục tiêu chốt lời 1/2 theo bội số R cố định
Nêu rõ R:R và một điều kiện khiến setup mất hiệu lực.`,
    },
  },
  {
    id: 'review',
    title: { en: 'Position Review', vi: 'Rà soát vị thế' },
    goal: { en: 'Manage open trades objectively.', vi: 'Quản lý lệnh đang mở thật khách quan.' },
    body: {
      en: `For each open position (entry, stop, last price, days held):
- Current open R and % from stop
- Is the stop trailing logic triggered? (e.g. above 1.5R → move to breakeven)
- Any sell signal (close below 50DMA on volume, climax run, stage 3)?
Recommend: HOLD / TRIM / EXIT with one reason each.`,
      vi: `Với mỗi vị thế đang mở (giá vào, stop, giá hiện tại, số ngày nắm giữ):
- R hiện tại và % cách stop
- Đã tới lúc dời stop theo quy tắc chưa? (vd trên 1.5R → dời về hòa vốn)
- Có tín hiệu bán nào không (đóng dưới MA50 kèm khối lượng, tăng vọt climax, giai đoạn 3)?
Khuyến nghị: GIỮ / GIẢM / THOÁT kèm một lý do cho từng mã.`,
    },
  },
  {
    id: 'postmortem',
    title: { en: 'Post-Mortem Journal', vi: 'Nhật ký rút kinh nghiệm' },
    goal: { en: 'Extract a repeatable lesson from each closed trade.', vi: 'Rút ra một bài học dùng lại được từ mỗi lệnh đã đóng.' },
    body: {
      en: `Given a closed trade (plan vs actual):
- Did I follow my entry, stop and sizing rules? (yes/no each)
- What was the realized R and the main driver?
- One process mistake to avoid and one thing done well.
Write a 3-bullet journal entry I can paste into a Case Study's notes.`,
      vi: `Với một lệnh đã đóng (kế hoạch so với thực tế):
- Tôi có tuân thủ quy tắc entry, stop và size không? (có/không mỗi mục)
- Thực tế đạt bao nhiêu R và yếu tố quyết định là gì?
- Một lỗi quy trình cần tránh và một việc đã làm tốt.
Viết một đoạn nhật ký 3 gạch đầu dòng để tôi dán vào ghi chú của một Case Study.`,
    },
  },
  {
    id: 'us-brief',
    title: { en: 'Morning · US Overnight Brief', vi: 'Sáng · Điểm tin Mỹ đêm qua' },
    goal: { en: 'Read the overnight US tape before the VN session.', vi: 'Nắm diễn biến phiên Mỹ đêm qua trước giờ mở cửa VN.' },
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
      vi: `Tổng hợp phiên VN-Index hôm nay: điểm số, khối lượng, độ rộng thị trường; giá trị mua/bán ròng khối ngoại và họ tập trung mã/ngành nào; nhóm ngành mạnh/yếu nhất phiên. Đối chiếu với trạng thái đèn giao thông tôi đang theo dõi và chỉ ra tín hiệu nào cần chú ý trong tuần.`,
    },
  },
  {
    id: 'weekend-map',
    title: { en: 'Weekend · Battle Map for the Week', vi: 'Cuối tuần · Bản đồ trận địa tuần tới' },
    goal: { en: 'Draw the full battle map for the coming week.', vi: 'Vẽ toàn bộ bản đồ trận địa cho tuần tới.' },
    body: {
      en: `Write a weekend report in 4 ordered parts: (1) Macro — key economic data from the US and VN this past week, how markets reacted, and next week's risk events with dates (CPI, PCE, Fed meeting, derivatives expiry...); (2) Market health — where the main US and VN indices sit vs MA50/MA200, breadth, whether the trend is strengthening or weakening; (3) Sector rotation — which sectors have the strongest RS in each market, where money is flowing in/out; (4) propose priority sectors to hunt stocks in next week. Cite sources at the end.`,
      vi: `Làm báo cáo cuối tuần gồm 4 phần theo thứ tự: (1) Vĩ mô — dữ liệu kinh tế quan trọng tuần qua của Mỹ và VN, thị trường phản ứng thế nào, và lịch sự kiện rủi ro tuần tới kèm ngày (CPI, PCE, họp Fed, đáo hạn phái sinh...); (2) Sức khỏe thị trường — vị thế các chỉ số chính Mỹ và VN so với MA50/MA200, độ rộng, xu hướng mạnh lên hay yếu đi; (3) Luân chuyển ngành — ngành nào RS mạnh nhất mỗi thị trường, tiền chảy vào/ra đâu; (4) đề xuất nhóm ngành ưu tiên săn cổ phiếu tuần tới. Cuối báo cáo nêu rõ nguồn.`,
    },
  },
  {
    id: 'monthly',
    title: { en: 'Monthly · The Big Picture', vi: 'Tháng · Bức tranh lớn' },
    goal: { en: 'Zoom out to cycle and policy once a month.', vi: 'Mỗi tháng một lần, lùi lại nhìn chu kỳ và chính sách.' },
    body: {
      en: `Give a monthly overview: which stage of the economic cycle we're in, any shifts in Fed and SBV monetary policy direction, the major macro/geopolitical themes driving global money flows, and the implications for allocating capital between the US and Vietnam markets.`,
      vi: `Đánh giá tổng quan tháng: chu kỳ kinh tế đang ở giai đoạn nào, định hướng chính sách tiền tệ Fed và NHNN có thay đổi gì, chủ đề vĩ mô/địa chính trị lớn đang chi phối dòng tiền toàn cầu, và hàm ý cho việc phân bổ vốn giữa thị trường Mỹ và Việt Nam.`,
    },
  },
  {
    id: 'single-stock',
    title: { en: 'Bonus · Single-Stock Analysis', vi: 'Thêm · Phân tích một mã' },
    goal: { en: 'Contextualize one stock — facts, not advice.', vi: 'Đặt một mã vào bối cảnh — chỉ dữ kiện, không khuyến nghị.' },
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

/** When in the week a prompt is meant to be run. Drives its tag and the filter chips.
 * A prompt the user wrote has no cadence, so it is filed under "yours". */
type Cadence = 'morning' | 'evening' | 'weekend' | 'monthly' | 'any' | 'custom';
const CADENCE_OF: Record<string, Cadence> = {
  'us-brief': 'morning',
  regime: 'evening', triage: 'evening', entry: 'evening', review: 'evening', 'vn-recap': 'evening',
  postmortem: 'weekend', 'weekend-map': 'weekend',
  monthly: 'monthly',
  'single-stock': 'any',
};
const CADENCE: Record<Cadence, Bi> = {
  morning: { en: 'Morning', vi: 'Buổi sáng' },
  evening: { en: 'Evening', vi: 'Buổi tối' },
  weekend: { en: 'Weekend', vi: 'Cuối tuần' },
  monthly: { en: 'Monthly', vi: 'Hằng tháng' },
  any: { en: 'Any time', vi: 'Lúc nào cũng được' },
  custom: { en: 'Yours', vi: 'Tự tạo' },
};
const cadenceOf = (p: Prompt): Cadence => CADENCE_OF[p.id] ?? 'custom';

// ── The routine ─────────────────────────────────────────────────────────────

interface RoutineStep {
  t: Bi;
  /** Minutes, as the book budgets them. */
  min?: number;
  /** The page in this app where the step is done. */
  go?: string;
}
interface RoutinePhase {
  id: 'ev' | 'wk';
  icon: string;
  title: Bi;
  when: Bi;
  steps: RoutineStep[];
}

/** The book's own evening and weekend lists, each step tied to the page it is done on. */
const ROUTINE: RoutinePhase[] = [
  {
    id: 'ev', icon: '🌙',
    title: { en: 'Evening', vi: 'Buổi tối' },
    when: { en: 'after the US close · 30–45 min', vi: 'sau khi Mỹ đóng cửa · 30–45 phút' },
    steps: [
      { t: { en: 'Write the regime line: trend · volatility · breadth · distribution days', vi: 'Viết dòng regime: xu hướng · biến động · độ rộng · ngày phân phối' }, min: 5, go: 'scanner' },
      { t: { en: 'Rank the 11 sector ETFs on 1M / 3M / 6M', vi: 'Xếp hạng 11 sector ETF theo 1M / 3M / 6M' }, min: 5, go: 'sectors' },
      { t: { en: 'Note this week’s rank changes', vi: 'Ghi lại thay đổi thứ hạng tuần này' }, min: 2, go: 'sectors' },
      { t: { en: 'Screen ONLY inside the top 3 sectors', vi: 'CHỈ chạy Screener trong top 3 sector' }, min: 5, go: 'screener' },
      { t: { en: 'In-play filter: RVol, liquidity, ATR, RS', vi: 'Lọc in-play: RVol, thanh khoản, ATR, RS' }, min: 3, go: 'screener' },
      { t: { en: 'Score 5 charts', vi: 'Chấm điểm 5 chart' }, min: 15, go: 'watchlist' },
      { t: { en: 'Write the plan: entry / stop / target', vi: 'Viết kế hoạch: entry / stop / target' }, min: 10, go: 'watchlist' },
    ],
  },
  {
    id: 'wk', icon: '📅',
    title: { en: 'Weekend', vi: 'Cuối tuần' },
    when: { en: 'once a week · 1–2 hours', vi: 'mỗi tuần một lần · 1–2 giờ' },
    steps: [
      { t: { en: 'Review every trade of the week', vi: 'Xem lại toàn bộ lệnh trong tuần' }, go: 'portfolio' },
      { t: { en: 'Update expectancy by setup × regime', vi: 'Cập nhật expectancy theo setup × regime' }, go: 'casestudies' },
      { t: { en: 'Flag the rule-breaking trades, and write down why', vi: 'Đánh dấu lệnh phá luật, và ghi lại vì sao' }, go: 'casestudies' },
      { t: { en: 'Look at the 90-session sector rotation', vi: 'Xem vòng xoay sector 90 phiên' }, go: 'sectors' },
      { t: { en: 'Check next week’s earnings calendar', vi: 'Xem lịch KQKD tuần tới' }, go: 'calendar' },
      { t: { en: 'Prepare the watchlist', vi: 'Chuẩn bị Watchlist' }, go: 'watchlist' },
      { t: { en: 'Re-read one section of this playbook', vi: 'Đọc lại một mục trong Playbook này' } },
    ],
  },
];

const ROUTINE_KEY = 'playbook:routine';

const PAGE_NAME: Record<string, Bi> = {
  scanner: { en: 'Scanner', vi: 'Scanner' },
  sectors: { en: 'Sectors', vi: 'Ngành' },
  screener: { en: 'Screener', vi: 'Screener' },
  watchlist: { en: 'Watchlist', vi: 'Theo dõi' },
  portfolio: { en: 'Portfolio', vi: 'Danh mục' },
  casestudies: { en: 'Case Studies', vi: 'Case Studies' },
  calendar: { en: 'Calendar', vi: 'Lịch' },
};

/** The two tickable routine cards. Static; `wirePlaybookTools` restores the ticks. */
export function routineHtml(lang: Lang): string {
  const vi = lang === 'vi';
  const phase = (p: RoutinePhase): string => {
    const total = p.steps.reduce((s, x) => s + (x.min ?? 0), 0);
    return `<div class="pt-phase" data-pt-phase="${p.id}">
      <header class="pt-phase-h">
        <span class="pt-phase-ic" aria-hidden="true">${p.icon}</span>
        <div class="pt-phase-t">
          <b>${tx(p.title, lang)}</b>
          <span>${tx(p.when, lang)}</span>
        </div>
        <span class="pt-prog" data-pt-prog>0/${p.steps.length}</span>
      </header>
      <div class="pt-bar"><i data-pt-bar style="width:0%"></i></div>
      <ol class="pt-steps">
        ${p.steps.map((s, i) => `<li>
          <label class="pt-step">
            <input type="checkbox" data-pt-tick="${p.id}-${i}" />
            <span class="pt-step-n">${i + 1}</span>
            <span class="pt-step-t">${tx(s.t, lang)}</span>
            ${s.min ? `<span class="pt-min">${s.min}′</span>` : ''}
          </label>
          ${s.go ? `<button type="button" class="pt-go" data-pt-go="${s.go}" title="${vi ? 'Mở trang' : 'Open'} ${tx(PAGE_NAME[s.go]!, lang)}">${tx(PAGE_NAME[s.go]!, lang)} →</button>` : ''}
        </li>`).join('')}
      </ol>
      <footer class="pt-phase-f">
        <span>${total ? `${vi ? 'Tổng' : 'Total'} ≈ ${total}′` : vi ? 'Không bấm giờ — cứ làm cho kỹ' : 'Untimed: do it properly'}</span>
        <button type="button" class="pt-clear" data-pt-clear="${p.id}">${vi ? 'Bỏ tick' : 'Clear ticks'}</button>
      </footer>
    </div>`;
  };
  return `<div class="pt-routine">${ROUTINE.map(phase).join('')}</div>`;
}

/** The prompt library's frame. The cards arrive from storage in `wirePlaybookTools`. */
export function promptsHtml(lang: Lang): string {
  const vi = lang === 'vi';
  const chips = (['all', 'morning', 'evening', 'weekend', 'monthly', 'any', 'custom'] as const)
    .map((c) => `<button type="button" class="pt-chip${c === 'all' ? ' on' : ''}" data-pt-cad="${c}">${
      c === 'all' ? (vi ? 'Tất cả' : 'All') : tx(CADENCE[c], lang)}</button>`).join('');
  return `<div class="pt-lib" data-pt-lib>
    <div class="pt-lib-bar">
      <div class="pt-chips" role="group" aria-label="${vi ? 'Lọc theo thời điểm' : 'Filter by cadence'}">${chips}</div>
      <div class="pt-lib-acts">
        <button type="button" class="range-btn" data-pt-add>${vi ? '+ Thêm prompt' : '+ Add prompt'}</button>
        <button type="button" class="range-btn" data-pt-reset>${vi ? 'Khôi phục mặc định' : 'Reset to defaults'}</button>
      </div>
    </div>
    <div data-pt-gpt></div>
    <div class="pt-grid" data-pt-list><div class="muted">${vi ? 'Đang tải…' : 'Loading…'}</div></div>
  </div>`;
}

/** Restore the ticks, fill the prompt library, wire the buttons. Call once per render. */
export function wirePlaybookTools(root: HTMLElement, ctx: AppContext, lang: Lang): void {
  const routine = root.querySelector<HTMLElement>('.pt-routine');
  if (routine) void wireRoutine(routine, ctx);
  root.querySelectorAll<HTMLElement>('[data-pt-go]').forEach((b) =>
    b.addEventListener('click', () => { location.hash = `#${b.dataset.ptGo}`; }),
  );

  const lib = root.querySelector<HTMLElement>('[data-pt-lib]');
  if (!lib) return;
  const list = lib.querySelector<HTMLElement>('[data-pt-list]')!;
  const repaint = (): void => void renderPromptLibrary(ctx, lang, lib, list);
  repaint();
  lib.querySelector('[data-pt-add]')!.addEventListener('click', () => openPromptEditor(ctx, lang, null, repaint));
  lib.querySelector('[data-pt-reset]')!.addEventListener('click', async () => {
    const msg = lang === 'vi' ? 'Khôi phục toàn bộ prompt về mặc định? Mọi chỉnh sửa sẽ mất.' : 'Reset all prompts to defaults? Your edits will be lost.';
    if (!confirm(msg)) return;
    await ctx.storage.delete(PROMPTS_KEY);
    repaint();
  });
  lib.querySelectorAll<HTMLElement>('[data-pt-cad]').forEach((c) =>
    c.addEventListener('click', () => {
      lib.querySelectorAll('[data-pt-cad]').forEach((x) => x.classList.toggle('on', x === c));
      lib.dataset.cad = c.dataset.ptCad;
      applyCadence(lib);
    }),
  );
}

function applyCadence(lib: HTMLElement): void {
  const want = lib.dataset.cad ?? 'all';
  lib.querySelectorAll<HTMLElement>('.pt-card').forEach((c) => {
    c.hidden = want !== 'all' && c.dataset.cad !== want;
  });
}

async function wireRoutine(routine: HTMLElement, ctx: AppContext): Promise<void> {
  const checked = (await ctx.storage.get<Record<string, boolean>>(ROUTINE_KEY)) ?? {};
  const paint = (): void => {
    routine.querySelectorAll<HTMLElement>('[data-pt-phase]').forEach((ph) => {
      const boxes = [...ph.querySelectorAll<HTMLInputElement>('[data-pt-tick]')];
      const done = boxes.filter((b) => b.checked).length;
      ph.querySelector('[data-pt-prog]')!.textContent = `${done}/${boxes.length}`;
      (ph.querySelector('[data-pt-bar]') as HTMLElement).style.width = `${Math.round((done / boxes.length) * 100)}%`;
      ph.classList.toggle('done', done === boxes.length);
    });
  };
  routine.querySelectorAll<HTMLInputElement>('[data-pt-tick]').forEach((b) => {
    b.checked = !!checked[b.dataset.ptTick!];
    b.addEventListener('change', () => {
      checked[b.dataset.ptTick!] = b.checked;
      void ctx.storage.set(ROUTINE_KEY, checked);
      paint();
    });
  });
  routine.querySelectorAll<HTMLElement>('[data-pt-clear]').forEach((btn) =>
    btn.addEventListener('click', () => {
      btn.closest('[data-pt-phase]')!.querySelectorAll<HTMLInputElement>('[data-pt-tick]').forEach((b) => {
        b.checked = false;
        delete checked[b.dataset.ptTick!];
      });
      void ctx.storage.set(ROUTINE_KEY, checked);
      paint();
    }),
  );
  paint();
}

/**
 * Render every prompt card into `list`, each with Ask / Copy / Edit / Delete.
 *
 * Ask and Copy both use the body in the active language. Edit/Delete mutate the
 * persisted copy and re-render. The body is folded: ten open prompts made the
 * section a wall of monospace, and the title + goal are enough to choose one.
 *
 * The GPT badge sits once above the list rather than on each card: it reflects one
 * shared setting, and repeating it per prompt would suggest each has its own.
 */
async function renderPromptLibrary(ctx: AppContext, lang: Lang, lib: HTMLElement, list: HTMLElement): Promise<void> {
  const prompts = await loadPrompts(ctx);
  await loadGptUrl(ctx);
  const repaint = (): void => void renderPromptLibrary(ctx, lang, lib, list);
  const gpt = lib.querySelector<HTMLElement>('[data-pt-gpt]')!;
  gpt.innerHTML = gptBadgeHtml();
  wireGptBadge(gpt, ctx, repaint);
  list.innerHTML = '';
  const vi = lang === 'vi';

  prompts.forEach((p, idx) => {
    const body = tx(p.body, lang);
    const cad = cadenceOf(p);
    const card = el(`<article class="pt-card" data-cad="${cad}">
      <header class="pt-card-h">
        <span class="pt-n">P${idx + 1}</span>
        <span class="pt-cad pt-cad-${cad}">${tx(CADENCE[cad], lang)}</span>
      </header>
      <h5 class="pt-title">${escapeHtml(tx(p.title, lang))}</h5>
      <p class="pt-goal">${escapeHtml(tx(p.goal, lang))}</p>
      <details class="pt-body"><summary>${vi ? 'Xem nội dung prompt' : 'Show the prompt'}</summary><pre class="playbook-pre">${escapeHtml(body)}</pre></details>
      <div class="pt-acts">${promptActsHtml(
        { ask: 'data-ask', assistant: 'data-assist', copy: 'data-copy' },
        paBtn('pa-btn--quiet', 'data-edit', 'edit', vi ? 'Sửa' : 'Edit') + paBtn('pa-btn--quiet', 'data-del', 'trash', vi ? 'Xóa' : 'Delete'),
      )}</div>
    </article>`);

    card.querySelector('[data-ask]')!.addEventListener('click', (e) => {
      askChatGpt(body, e.currentTarget as HTMLElement);
    });
    card.querySelector('[data-assist]')!.addEventListener('click', () => {
      void askInChat(ctx, body, tx(p.title, lang));
    });
    // Shared with the stock modal and Case Studies so the feedback — and the
    // "couldn't copy" case, which iOS hits often enough to matter — is identical
    // everywhere.
    card.querySelector('[data-copy]')!.addEventListener('click', (e) => {
      void copyToClipboard(body, e.currentTarget as HTMLElement);
    });
    card.querySelector('[data-edit]')!.addEventListener('click', () => {
      openPromptEditor(ctx, lang, p.id, repaint);
    });
    card.querySelector('[data-del]')!.addEventListener('click', async () => {
      const msg = vi ? `Xóa prompt "${tx(p.title, lang)}"?` : `Delete prompt "${tx(p.title, lang)}"?`;
      if (!confirm(msg)) return;
      const next = (await loadPrompts(ctx)).filter((x) => x.id !== p.id);
      await savePrompts(ctx, next);
      repaint();
    });
    list.appendChild(card);
  });
  applyCadence(lib);
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
        alert(L('Please enter a title.', 'Nhập tiêu đề trước đã.'));
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
