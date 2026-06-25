import { getLang, setLang } from './i18n.js';
import { applyTheme } from './theme.js';
import { renderPublicBlog } from './publicBlog.js';
import { makeStorage } from '../adapters/storage.js';

/** Full-screen editorial landing. `onEnterPublic` scrolls to blog; `onEnterPrivate` triggers the gate. */
export function renderLanding(
  host: HTMLElement,
  onEnterPrivate: () => void,
): void {
  const isLight = document.documentElement.classList.contains('light');
  const lang = getLang();
  const vi = lang === 'vi';

  const logoSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 3 8-8"/><path d="M21 7v5h-5"/></svg>`;

  host.innerHTML = `
  <div class="landing">

    <!-- top bar -->
    <div class="landing-topbar">
      <div class="landing-brand">
        <div class="logo logo-svg">${logoSvg}</div>
        <span class="brand-name">${vi ? 'Nhà Chuyên Nghiệp' : 'The Professional'}</span>
      </div>
      <div class="landing-topbar-right">
        <a class="landing-nav-link" href="#pub-blog-section">${vi ? 'Phân tích' : 'Analysis'}</a>
        <a class="landing-nav-link" href="#pub-about-section">${vi ? 'Giới thiệu' : 'About'}</a>
        <button id="landing-private-btn" class="btn landing-private-cta">${vi ? 'Công cụ riêng →' : 'Private tools →'}</button>
        <div class="lang-toggle" role="group" aria-label="Language">
          <button data-ll="en" class="${lang === 'en' ? 'active' : ''}">EN</button>
          <button data-ll="vi" class="${lang === 'vi' ? 'active' : ''}">VI</button>
        </div>
        <button id="landing-theme" class="theme-toggle" title="Toggle theme">${isLight ? '☀️' : '🌙'}</button>
      </div>
    </div>

    <!-- ambient glow -->
    <div class="landing-glow"></div>

    <!-- ── Hero ─────────────────────────────────────────────────── -->
    <div class="landing-inner">
      <section class="pub-hero">
        <div class="pub-hero-eyebrow">${vi ? 'Nhật ký giao dịch' : 'A trading journal'}</div>
        <h1 class="pub-hero-h1">${vi
          ? 'Hành trình trở thành<br/><span class="accent">Trader chuyên nghiệp</span>'
          : 'The journey to becoming<br/><span class="accent">a professional trader</span>'}</h1>
        <p class="pub-hero-sub">${vi
          ? 'Phân tích thị trường trung thực · Bài học từ từng giao dịch · Kỷ luật trên từng biểu đồ'
          : 'Honest market analysis · Lessons from every trade · Discipline across every chart'}</p>
        <div class="pub-hero-actions">
          <a class="btn pub-hero-cta" href="#pub-blog-section">${vi ? 'Đọc phân tích' : 'Read analysis'}</a>
          <button id="landing-private-btn2" class="btn-outline pub-hero-cta-sec">${vi ? 'Truy cập công cụ →' : 'Access tools →'}</button>
        </div>
      </section>

      <!-- ── 01 Analysis ──────────────────────────────────────── -->
      <section id="pub-blog-section" class="pub-section">
        <div class="pub-section-number">01</div>
        <div class="pub-section-head">
          <h2 class="pub-section-title">${vi ? 'Phân tích' : 'Analysis'}</h2>
          <p class="pub-section-desc">${vi
            ? 'Báo cáo thị trường hàng tuần, nhật ký giao dịch, và những suy nghĩ về biểu đồ.'
            : 'Weekly market reports, trade journals, and chart thoughts.'}</p>
        </div>
        <div id="pub-blog-grid" class="pub-blog-grid"></div>
      </section>

      <!-- ── 02 About ─────────────────────────────────────────── -->
      <section id="pub-about-section" class="pub-section">
        <div class="pub-section-number">02</div>
        <div class="pub-section-head">
          <h2 class="pub-section-title">${vi ? 'Giới thiệu' : 'About'}</h2>
        </div>
        <div class="pub-about-block">
          <p class="pub-about-p">${vi
            ? 'Tôi là TS. Phạm Tú Anh — chuyên gia phân tích dữ liệu tại Allianz Investment Management. Sau nhiều năm nhìn thị trường từ bên ngoài, tôi quyết định tự mình bước đi trên con đường đó.'
            : `I'm Dr. Tu Anh Pham — a data analytics specialist at Allianz Investment Management. After years of watching markets from the outside, I decided to walk the path myself.`}</p>
          <p class="pub-about-p">${vi
            ? 'Với tôi, trading không phải là chuyện thắng nhanh. Đó là một quá trình dài và kiên nhẫn để rèn luyện kỷ luật, học từ những sai lầm, và trưởng thành hơn như một con người. Đây là nơi tôi ghi lại hành trình ấy.'
            : `Trading isn't about quick wins. It's a long, patient process of building discipline, learning from mistakes, and growing as a person. This is where I document that journey.`}</p>
          <blockquote class="pub-about-quote">${vi
            ? '"Trading không phải là chuyện thắng nhanh; đó là một quá trình dài và kiên nhẫn để rèn luyện kỷ luật."'
            : `"Trading isn't really about quick wins; it's a long, patient process of building discipline, learning from mistakes."`}</blockquote>
        </div>
      </section>

      <!-- ── 03 Private access ─────────────────────────────────── -->
      <section class="pub-section pub-gate-section">
        <div class="pub-section-number">03</div>
        <div class="pub-section-head">
          <h2 class="pub-section-title">${vi ? 'Công cụ riêng' : 'Private tools'}</h2>
          <p class="pub-section-desc">${vi
            ? 'Bộ công cụ đầy đủ — máy quét Qullamaggie & momentum, giao dịch giấy, backtest, watchlist — dành riêng cho tôi và những người được mời.'
            : 'The full toolkit — Qullamaggie & momentum screeners, paper trading, backtest, watchlists — for me and invited collaborators.'}</p>
        </div>
        <button id="landing-gate-open" class="btn landing-gate-btn">${vi ? 'Nhập mã truy cập →' : 'Enter access code →'}</button>
      </section>

      <p class="muted landing-foot pub-footer-disc">${vi
        ? 'Chỉ dành cho mục đích học tập. Không phải lời khuyên tài chính.'
        : 'For educational and journaling purposes only. Not financial advice.'}</p>
    </div>
  </div>`;

  // wire private-access buttons
  const doPrivate = () => onEnterPrivate();
  host.querySelector('#landing-private-btn')!.addEventListener('click', doPrivate);
  host.querySelector('#landing-private-btn2')!.addEventListener('click', doPrivate);
  host.querySelector('#landing-gate-open')!.addEventListener('click', doPrivate);

  // lang
  host.querySelectorAll<HTMLElement>('[data-ll]').forEach((b) =>
    b.addEventListener('click', () => {
      setLang(b.dataset.ll as 'en' | 'vi');
      renderLanding(host, onEnterPrivate);
    }),
  );

  // theme
  host.querySelector('#landing-theme')!.addEventListener('click', () => {
    const light = document.documentElement.classList.contains('light');
    applyTheme(light ? 'dark' : 'light');
    renderLanding(host, onEnterPrivate);
  });

  // render public blog grid
  const grid = host.querySelector<HTMLElement>('#pub-blog-grid')!;
  void renderPublicBlog(grid, makeStorage());
}
