import type { AppContext } from '../context.js';
import { $, el } from '../ui/dom.js';
import { getLang } from '../ui/i18n.js';

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

const PROMPTS: { id: string; title: Bi; goal: Bi; body: string }[] = [
  {
    id: 'P1',
    title: { en: 'Market Regime Check', vi: 'Kiểm tra trạng thái thị trường' },
    goal: { en: 'Decide risk-on / caution / risk-off before any trade.', vi: 'Quyết định risk-on / thận trọng / risk-off trước khi giao dịch.' },
    body: `Act as a market technician. Given SPY & QQQ daily data (last 60 bars), report:
- Price vs 50DMA and 200DMA (above/below, slope)
- Distribution days in the last 25 sessions
- Breadth read (advancers vs decliners if provided)
Return a single regime: GREEN / YELLOW / RED and one-line position-sizing guidance.`,
  },
  {
    id: 'P2',
    title: { en: 'Watchlist Triage', vi: 'Sàng lọc danh sách theo dõi' },
    goal: { en: 'Rank watchlist names by setup quality.', vi: 'Xếp hạng các mã trong watchlist theo chất lượng setup.' },
    body: `For each symbol I provide, summarize:
- Weinstein stage (1–4) and trend
- Base type (VCP, flat base, cup) and number of contractions
- Distance to pivot (%) and volume behavior (dry-up?)
Output a table sorted by readiness. Flag anything within 3% of pivot.`,
  },
  {
    id: 'P3',
    title: { en: 'Entry Plan', vi: 'Kế hoạch vào lệnh' },
    goal: { en: 'Turn a candidate into a concrete, risk-defined trade.', vi: 'Biến một ứng viên thành lệnh có rủi ro xác định.' },
    body: `Given the pivot, recent ATR and my account risk (% per trade):
- Buy point (pivot + small buffer)
- Initial stop (below base / structure)
- Position size for my risk budget
- 1st/2nd profit targets at fixed R multiples
State the R:R and the single invalidation condition.`,
  },
  {
    id: 'P4',
    title: { en: 'Position Review', vi: 'Rà soát vị thế' },
    goal: { en: 'Manage open trades objectively.', vi: 'Quản lý lệnh đang mở một cách khách quan.' },
    body: `For each open position (entry, stop, last price, days held):
- Current open R and % from stop
- Is the stop trailing logic triggered? (e.g. above 1.5R → move to breakeven)
- Any sell signal (close below 50DMA on volume, climax run, stage 3)?
Recommend: HOLD / TRIM / EXIT with one reason each.`,
  },
  {
    id: 'P5',
    title: { en: 'Post-Mortem Journal', vi: 'Nhật ký tổng kết' },
    goal: { en: 'Extract a repeatable lesson from each closed trade.', vi: 'Rút ra bài học lặp lại được từ mỗi lệnh đã đóng.' },
    body: `Given a closed trade (plan vs actual):
- Did I follow my entry, stop and sizing rules? (yes/no each)
- What was the realized R and the main driver?
- One process mistake to avoid and one thing done well.
Write a 3-bullet journal entry I can paste into the Analysis tab.`,
  },
];

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

  // 2) Agent prompt library (P1–P5)
  const promptSection = el(`<div class="playbook-section"></div>`);
  promptSection.appendChild(sectionHead({ en: '2 · Agent Prompt Library', vi: '2 · Thư viện prompt cho AI' }, lang));
  for (const p of PROMPTS) {
    const card = el(`<div class="card" style="margin-bottom:10px">
      <div class="row" style="gap:8px;align-items:baseline">
        <span class="badge" style="background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)">${p.id}</span>
        <strong>${tx(p.title, lang)}</strong>
        <button class="range-btn" data-copy style="margin-left:auto">${lang === 'vi' ? 'Sao chép' : 'Copy'}</button>
      </div>
      <p class="muted" style="margin:6px 0 8px;line-height:1.5">${tx(p.goal, lang)}</p>
      <pre class="playbook-pre">${escapeHtml(p.body)}</pre>
    </div>`);
    card.querySelector('[data-copy]')!.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      void navigator.clipboard.writeText(p.body).then(() => {
        const old = btn.textContent;
        btn.textContent = lang === 'vi' ? 'Đã chép ✓' : 'Copied ✓';
        setTimeout(() => (btn.textContent = old), 1200);
      });
    });
    promptSection.appendChild(card);
  }
  root.appendChild(promptSection);

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

function sectionHead(b: Bi, lang: Lang): HTMLElement {
  return el(
    `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--accent);margin:0 0 10px">${tx(b, lang)}</h2>`,
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
