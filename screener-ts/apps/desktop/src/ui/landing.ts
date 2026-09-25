import { t, getLang, setLang } from './i18n.js';
import { applyTheme } from './theme.js';
import { pageTransition } from './transition.js';

/**
 * The front door — a broker-style product page (hero, proof strip, capability
 * grid, three steps, closing call to action, thick footer).
 *
 * It replaced the cinematic story that used to live here; the story itself was not
 * deleted, it moved into the About tab (`ui/story.ts`). Two consequences worth
 * knowing before editing:
 *   - this page is reached AFTER the access code, so it may name what is inside;
 *   - it is a plain scrolling document, no snap engine, no veil.
 *
 * Nothing here quotes a price or a return. Every number on the page counts
 * something about the app itself, which is the only thing this page can state
 * without a data feed behind it.
 */

const EN = {
  navPlatform: 'Platform',
  navStory: 'Story',
  eyebrow: 'Private research terminal',
  h1a: 'Every setup on the list,',
  h1b: 'with the reason it is there.',
  sub: 'A screener, a journal and a paper-trading desk in one place — built for one trader who wanted to stop guessing which chart deserved the next hour.',
  ctaPrimary: 'Enter the platform',
  ctaSecondary: 'Read the story',
  note: 'No sign-up, nothing to install.',
  statModules: 'Workspaces',
  statScore: 'Quality score',
  statMarkets: 'Markets',
  statCost: 'Free',
  statCostL: 'No sign-up',
  stripLabel: 'What runs inside',
  featTitle: 'Built around one loop',
  featSub: 'Find a candidate, size the risk, write down why, then check the tape against what you wrote.',
  f1t: 'Screener',
  f1d: 'Base-and-breakout, momentum and volume-surge scans over the whole US list, scored 0–100 with the reason shown.',
  f2t: 'Market regime',
  f2d: 'Breadth and index trend first, so a good setup in a bad tape is treated as what it is.',
  f3t: 'Paper trading',
  f3d: 'Positions, cash, stops and an equity curve — the same bookkeeping as a real account, none of the money.',
  f4t: 'Journal & case studies',
  f4d: 'Every entry keeps its thesis, so a review compares the decision against the outcome instead of memory.',
  stepsTitle: 'Three steps from here',
  s1t: 'Open the list',
  s1d: 'Today\'s candidates, already filtered by liquidity, trend and regime.',
  s2t: 'Plan the trade',
  s2d: 'Entry, stop and size come out of the setup, not out of a feeling.',
  s3t: 'Keep the record',
  s3d: 'Log it, watch it, review it. That record is the whole point.',
  closeTitle: 'The list is waiting.',
  closeSub: 'Everything is already unlocked on this device.',
  footAbout: 'The story behind it',
  footPlatform: 'The platform',
  riskLabel: 'Risk warning',
};

const VI: typeof EN = {
  navPlatform: 'Nền tảng',
  navStory: 'Câu chuyện',
  eyebrow: 'Bàn nghiên cứu riêng',
  h1a: 'Mỗi mã trong danh sách,',
  h1b: 'kèm lý do nó có mặt ở đó.',
  sub: 'Một bộ lọc, một cuốn nhật ký và một bàn giao dịch giấy trong cùng một chỗ — dựng cho đúng một người, để thôi phải đoán xem biểu đồ nào đáng dành một giờ tiếp theo.',
  ctaPrimary: 'Vào nền tảng',
  ctaSecondary: 'Đọc câu chuyện',
  note: 'Không cần đăng ký, không cần cài gì.',
  statModules: 'Không gian làm việc',
  statScore: 'Điểm chất lượng',
  statMarkets: 'Thị trường',
  statCost: 'Miễn phí',
  statCostL: 'Không đăng ký',
  stripLabel: 'Bên trong có gì',
  featTitle: 'Xoay quanh một vòng lặp',
  featSub: 'Tìm ứng viên, tính rủi ro, viết lại lý do, rồi đối chiếu thị trường với đúng điều đã viết.',
  f1t: 'Bộ lọc',
  f1d: 'Quét nền–bứt phá, đà tăng và bùng nổ khối lượng trên toàn bộ danh sách Mỹ, cho điểm 0–100 và in ra lý do.',
  f2t: 'Trạng thái thị trường',
  f2d: 'Xem độ rộng và xu hướng chỉ số trước, để một mẫu hình đẹp trong phiên xấu được nhìn đúng bản chất.',
  f3t: 'Giao dịch giấy',
  f3d: 'Vị thế, tiền, cắt lỗ và đường vốn — sổ sách y như tài khoản thật, chỉ không có tiền thật.',
  f4t: 'Nhật ký & case study',
  f4d: 'Mỗi lệnh giữ lại luận điểm của nó, nên lúc xem lại là so quyết định với kết quả, không phải so với ký ức.',
  stepsTitle: 'Từ đây, ba bước',
  s1t: 'Mở danh sách',
  s1d: 'Ứng viên hôm nay, đã lọc theo thanh khoản, xu hướng và trạng thái thị trường.',
  s2t: 'Lập kế hoạch',
  s2d: 'Điểm vào, cắt lỗ và khối lượng suy ra từ mẫu hình, không từ cảm giác.',
  s3t: 'Giữ lại hồ sơ',
  s3d: 'Ghi lại, theo dõi, xem lại. Cuốn hồ sơ đó chính là mục đích.',
  closeTitle: 'Danh sách đang đợi.',
  closeSub: 'Máy này đã mở khoá sẵn.',
  footAbout: 'Câu chuyện phía sau',
  footPlatform: 'Nền tảng',
  riskLabel: 'Cảnh báo rủi ro',
};

export function renderLanding(
  host: HTMLElement,
  onEnterPrivate: (trigger?: Element) => void,
  onOpenStory?: (trigger?: Element) => void,
): void {
  const isLight = document.documentElement.classList.contains('light');
  const lang = getLang();
  const c = lang === 'vi' ? VI : EN;
  const story = onOpenStory ?? onEnterPrivate;

  const chips = lang === 'vi'
    ? ['Bộ lọc', 'Nền–bứt phá', 'Đà tăng', 'Bùng nổ khối lượng', 'Trạng thái thị trường',
       'Xếp hạng ngành', 'Danh mục giấy', 'Kiểm định lịch sử', 'Sổ tay', 'Case study',
       'Lịch kinh tế', 'Nhật ký']
    : ['Screener', 'Base & breakout', 'Momentum', 'Volume surge', 'Market regime',
       'Sector ranking', 'Paper portfolio', 'Backtest', 'Playbook', 'Case studies',
       'Calendar', 'Journal'];
  // Duplicated once so the marquee can loop without a visible seam.
  const chipRow = chips.map((s) => `<span class="cl-chip">${s}</span>`).join('');

  const feat = (n: string, title: string, desc: string, icon: string) => `
    <article class="cl-feat">
      <div class="cl-feat-icon">${icon}</div>
      <div class="cl-feat-n">${n}</div>
      <h3>${title}</h3>
      <p class="muted">${desc}</p>
    </article>`;

  const step = (n: string, title: string, desc: string) => `
    <li class="cl-step">
      <span class="cl-step-n">${n}</span>
      <div>
        <strong>${title}</strong>
        <p class="muted">${desc}</p>
      </div>
    </li>`;

  host.innerHTML = `
<div class="cl-wrap">

  <header class="cl-nav">
    <div class="cl-nav-brand">
      <span class="app-brand-name">${t('brand.name')}</span>
    </div>
    <nav class="cl-nav-links">
      <button class="cl-nav-link" id="cl-nav-platform">${c.navPlatform}</button>
      <button class="cl-nav-link" id="cl-nav-story">${c.navStory}</button>
    </nav>
    <div class="cl-nav-right">
      <div class="cl-lang">
        <button class="cl-lang-btn${lang === 'en' ? ' active' : ''}" data-ml="en">EN</button>
        <button class="cl-lang-btn${lang === 'vi' ? ' active' : ''}" data-ml="vi">VI</button>
      </div>
      <button class="cl-nav-cta" id="cl-enter-top">${c.ctaPrimary}</button>
      <button id="sl-menu-btn" aria-label="Open menu">
        <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="22" height="22">
          <line x1="3" y1="6" x2="19" y2="6"/>
          <line x1="3" y1="11" x2="19" y2="11"/>
          <line x1="3" y1="16" x2="19" y2="16"/>
        </svg>
      </button>
    </div>
  </header>

  <section class="cl-hero">
    <div class="cl-hero-text">
      <div class="cl-eyebrow">${c.eyebrow}</div>
      <h1 class="cl-h1">${c.h1a}<br/><span class="accent">${c.h1b}</span></h1>
      <p class="cl-sub">${c.sub}</p>
      <div class="cl-cta-row">
        <button class="cl-btn cl-btn--primary" id="cl-enter">${c.ctaPrimary} →</button>
        <button class="cl-btn cl-btn--ghost" id="cl-story">${c.ctaSecondary}</button>
      </div>
      <p class="cl-note">${c.note}</p>
    </div>
    <div class="cl-hero-visual" aria-hidden="true">${signalCard(lang)}</div>
  </section>

  <div class="cl-stats">
    <div class="cl-stat"><span class="cl-stat-v">12</span><span class="cl-stat-l">${c.statModules}</span></div>
    <div class="cl-stat"><span class="cl-stat-v">0–100</span><span class="cl-stat-l">${c.statScore}</span></div>
    <div class="cl-stat"><span class="cl-stat-v">US + VN</span><span class="cl-stat-l">${c.statMarkets}</span></div>
    <div class="cl-stat"><span class="cl-stat-v">${c.statCost}</span><span class="cl-stat-l">${c.statCostL}</span></div>
  </div>

  <section class="cl-strip" aria-label="${c.stripLabel}">
    <span class="cl-strip-label">${c.stripLabel}</span>
    <div class="cl-marquee"><div class="cl-marquee-track">${chipRow}${chipRow}</div></div>
  </section>

  <section class="cl-section">
    <h2 class="cl-h2">${c.featTitle}</h2>
    <p class="cl-section-sub muted">${c.featSub}</p>
    <div class="cl-feat-grid">
      ${feat('01', c.f1t, c.f1d, icoScan())}
      ${feat('02', c.f2t, c.f2d, icoRegime())}
      ${feat('03', c.f3t, c.f3d, icoDesk())}
      ${feat('04', c.f4t, c.f4d, icoJournal())}
    </div>
  </section>

  <section class="cl-section cl-steps-section">
    <h2 class="cl-h2">${c.stepsTitle}</h2>
    <ol class="cl-steps">
      ${step('1', c.s1t, c.s1d)}
      ${step('2', c.s2t, c.s2d)}
      ${step('3', c.s3t, c.s3d)}
    </ol>
  </section>

  <section class="cl-close">
    <h2 class="cl-close-h">${c.closeTitle}</h2>
    <p class="muted">${c.closeSub}</p>
    <button class="cl-btn cl-btn--primary cl-btn--lg" id="cl-enter-bottom">${c.ctaPrimary} →</button>
  </section>

  <footer class="cl-footer">
    <div class="cl-footer-top">
      <div class="cl-footer-brand">
        <span class="app-brand-name">${t('brand.name')}</span>
        <p class="muted">${c.eyebrow}</p>
      </div>
      <div class="cl-footer-links">
        <button class="cl-foot-link" id="cl-foot-platform">${c.footPlatform}</button>
        <button class="cl-foot-link" id="cl-foot-story">${c.footAbout}</button>
      </div>
    </div>
    <p class="cl-risk"><span class="cl-risk-label">${c.riskLabel}:</span> ${t('foot.disclaimer')}</p>
  </footer>

</div>

<!-- Full-screen menu overlay (shared styling with the tool landing) -->
<div id="sl-menu">
  <header class="sl-menu-header">
    <span class="sl-menu-brand">${t('brand.name')}</span>
    <button id="sl-menu-close" aria-label="Close menu">✕</button>
  </header>
  <div class="sl-menu-items">
    <button class="sl-menu-item" id="sl-menu-discover">${c.navPlatform}</button>
    <button class="sl-menu-item" id="sl-menu-story">${c.navStory}</button>
    <div class="sl-menu-controls">
      <button class="sl-menu-ctrl${lang === 'en' ? ' active' : ''}" data-ml="en">EN</button>
      <button class="sl-menu-ctrl${lang === 'vi' ? ' active' : ''}" data-ml="vi">VI</button>
    </div>
    <button class="sl-menu-ctrl" id="sl-menu-theme">${isLight ? '☀️' : '🌙'}</button>
  </div>
</div>`;

  const menu = host.querySelector<HTMLElement>('#sl-menu')!;
  const closeMenu = () => {
    menu.classList.remove('sl-menu--open');
    document.body.style.overflow = '';
  };

  // Pass the element through so the page-transition ripple starts from it.
  const wire = (sel: string, fn: (trigger?: Element) => void, viaMenu = false) =>
    host.querySelector(sel)?.addEventListener('click', (e) => {
      const btn = e.currentTarget as Element;
      if (!viaMenu) { fn(btn); return; }
      pageTransition(btn, () => { closeMenu(); fn(btn); });
    });

  wire('#cl-enter', onEnterPrivate);
  wire('#cl-enter-top', onEnterPrivate);
  wire('#cl-enter-bottom', onEnterPrivate);
  wire('#cl-nav-platform', onEnterPrivate);
  wire('#cl-foot-platform', onEnterPrivate);
  wire('#cl-story', story);
  wire('#cl-nav-story', story);
  wire('#cl-foot-story', story);
  wire('#sl-menu-discover', onEnterPrivate, true);
  wire('#sl-menu-story', story, true);

  host.querySelector('#sl-menu-btn')!.addEventListener('click', () => {
    menu.classList.add('sl-menu--open');
    document.body.style.overflow = 'hidden';
  });
  host.querySelector('#sl-menu-close')!.addEventListener('click', closeMenu);

  host.querySelectorAll<HTMLElement>('[data-ml]').forEach((b) =>
    b.addEventListener('click', () => {
      pageTransition(b, () => {
        closeMenu();
        setLang(b.dataset.ml as 'en' | 'vi');
      });
    }),
  );

  host.querySelector('#sl-menu-theme')!.addEventListener('click', (e) => {
    const btn = e.currentTarget as Element;
    const light = document.documentElement.classList.contains('light');
    pageTransition(btn, () => {
      closeMenu();
      applyTheme(light ? 'dark' : 'light');
      renderLanding(host, onEnterPrivate, onOpenStory);
    });
  });

  // Reveal each section as it comes up. Cheap, and it keeps the long page from
  // arriving all at once the way a static document would.
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries, obs) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          en.target.classList.add('cl-in');
          obs.unobserve(en.target);
        });
      }, { threshold: 0.15 })
    : null;
  host.querySelectorAll<HTMLElement>('.cl-section, .cl-stats, .cl-close').forEach((el) => {
    if (io) { el.classList.add('cl-rise'); io.observe(el); }
  });
}

/**
 * The hero illustration: a base, a pivot, a breakout — the shape the screener is
 * looking for, drawn rather than fetched. Marked DEMO, and carrying no ticker, so
 * it cannot be mistaken for a live quote or a recommendation.
 */
function signalCard(lang: 'en' | 'vi'): string {
  const pts = [
    46, 52, 49, 55, 51, 57, 54, 53, 56, 55, 57, 56, 58, 57, 57, 58,
    58, 57, 59, 58, 58, 59, 61, 66, 70, 73, 78, 83,
  ];
  const W = 320, H = 168, padL = 10, padR = 10, padT = 14, padB = 22;
  const min = Math.min(...pts) - 3, max = Math.max(...pts) + 4;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const x = (i: number) => padL + (i / (pts.length - 1)) * plotW;
  const y = (v: number) => padT + plotH - ((v - min) / (max - min)) * plotH;
  const line = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${padL},${padT + plotH} ${line} ${(padL + plotW).toFixed(1)},${padT + plotH}`;
  const pivot = y(59);
  const baseFrom = x(6), baseTo = x(21);

  const label = lang === 'vi'
    ? { base: 'NỀN', pivot: 'PIVOT', q: 'Điểm', rs: 'Sức mạnh', rv: 'Khối lượng' }
    : { base: 'BASE', pivot: 'PIVOT', q: 'Score', rs: 'RS', rv: 'RVOL' };

  return `<div class="cl-card">
    <div class="cl-card-head">
      <span class="cl-card-tag">DEMO</span>
      <span class="cl-card-title">${label.base} → ${label.pivot}</span>
    </div>
    <svg class="cl-card-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <rect x="${baseFrom.toFixed(1)}" y="${(pivot - 22).toFixed(1)}" width="${(baseTo - baseFrom).toFixed(1)}" height="26"
            fill="var(--accent)" opacity=".07" rx="2"/>
      <line x1="${padL}" y1="${pivot.toFixed(1)}" x2="${W - padR}" y2="${pivot.toFixed(1)}"
            stroke="var(--warn)" stroke-width="1" stroke-dasharray="4 3"/>
      <text x="${(baseFrom + 3).toFixed(1)}" y="${(pivot - 26).toFixed(1)}" font-size="8"
            fill="var(--faint)" font-family="monospace">${label.base}</text>
      <text x="${W - padR - 2}" y="${(pivot - 4).toFixed(1)}" text-anchor="end" font-size="8"
            fill="var(--warn)" font-family="monospace">${label.pivot}</text>
      <polygon points="${area}" fill="url(#clFade)"/>
      <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="1.8"
                stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(pts[pts.length - 1]!).toFixed(1)}" r="3.5" fill="var(--accent)"/>
      <defs>
        <linearGradient id="clFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity=".22"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient>
      </defs>
    </svg>
    <div class="cl-card-foot">
      <span><i>${label.q}</i><b>87</b></span>
      <span><i>${label.rs}</i><b>94</b></span>
      <span><i>${label.rv}</i><b>2.4×</b></span>
    </div>
  </div>`;
}

// ── Icons ────────────────────────────────────────────────────────────────────
const SVG = (inner: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const icoScan = () => SVG(`<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.2" y2="16.2"/><path d="M8 12l2-3 2 4 2-2"/>`);
const icoRegime = () => SVG(`<path d="M3 17l5-6 4 3 4-6 5 5"/><line x1="3" y1="21" x2="21" y2="21"/>`);
const icoDesk = () => SVG(`<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M8 6V4h8v2"/><line x1="2" y1="12" x2="22" y2="12"/>`);
const icoJournal = () => SVG(`<path d="M5 3h12a2 2 0 0 1 2 2v16l-7-3-7 3V5a2 2 0 0 1 2-2z"/><path d="M9 8h6M9 12h4"/>`);
