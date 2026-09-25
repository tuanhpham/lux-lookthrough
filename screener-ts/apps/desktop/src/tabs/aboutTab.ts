import { $} from '../ui/dom.js';
import { t, getLang } from '../ui/i18n.js';
import { buildStoryChapters, storyCopy, wireCinematic } from '../ui/story.js';

/**
 * About = who is behind this, then the story itself.
 *
 * The story used to BE the landing page, and it is still the same five cinematic
 * chapters — moved in here, where someone who already knows the tools can read it,
 * instead of standing between a visitor and the door.
 */
export function renderAbout(): void {
  const root = $('#tab-about')!;
  const lang = getLang();

  const enContent = {
    badge: 'About this project',
    h1: 'Dr. Tu Anh Pham',
    tagline: 'Data analytics & automation specialist · PhD in Economics · Allianz Investment Management',
    launched: 'First published: 22 June 2026',
    storyLabel: 'The story',
    storyLead: `Not a résumé, and no claim to have it all figured out — an honest record of a new journey, started with humility and a lot of curiosity.`,
    quote: `"Trading isn't really about quick wins; it's a long, patient process of building discipline, learning from mistakes, and growing as a person."`,
    pilarTitle: 'This project is built on three pillars',
    pillar1h: 'Discipline',
    pillar1d: 'Following rules strictly — cutting losses fast, letting winners run, and never overriding the system on a whim.',
    pillar2h: 'Learning',
    pillar2d: 'Documenting every trade, every mistake, and every lesson. Progress comes from honest self-review.',
    pillar3h: 'Humility',
    pillar3d: 'Accepting that the market is bigger than any edge, and staying curious about what I don\'t yet understand.',
    builtLabel: 'Built with',
    builtWith: 'TypeScript · Vite · Yahoo Finance · Tauri',
    discLabel: 'Disclaimer',
    disc: 'This site is for educational and journaling purposes only. Nothing here constitutes financial advice. All results are simulated or paper trades.',
  };

  const viContent = {
    badge: 'Giới thiệu dự án',
    h1: 'TS. Phạm Tú Anh',
    tagline: 'Chuyên gia phân tích dữ liệu & tự động hóa · Tiến sĩ Kinh tế · Allianz Investment Management',
    launched: 'Ngày ra mắt: 22 tháng 6 năm 2026',
    storyLabel: 'Câu chuyện',
    storyLead: `Đây không phải một bản CV, và mình cũng không dám nói rằng mình đã hiểu hết mọi thứ — chỉ là một cuốn nhật ký chân thật cho một hành trình mới, bắt đầu với sự khiêm tốn và rất nhiều tò mò.`,
    quote: `"Trading không phải là chuyện thắng nhanh; đó là một quá trình dài và kiên nhẫn để rèn luyện kỷ luật, học từ những sai lầm, và trưởng thành hơn như một con người."`,
    pilarTitle: 'Dự án này xây dựng trên ba nền tảng',
    pillar1h: 'Kỷ luật',
    pillar1d: 'Tuân theo quy tắc nghiêm ngặt — cắt lỗ nhanh, để lãi chạy xa, và không bao giờ phá vỡ hệ thống vì cảm tính.',
    pillar2h: 'Học hỏi',
    pillar2d: 'Ghi chép mọi lệnh giao dịch, mọi sai lầm, và mọi bài học. Tiến bộ đến từ sự tự đánh giá trung thực.',
    pillar3h: 'Khiêm tốn',
    pillar3d: 'Chấp nhận rằng thị trường luôn lớn hơn bất kỳ lợi thế nào, và luôn tò mò về những điều chưa hiểu.',
    builtLabel: 'Công nghệ',
    builtWith: 'TypeScript · Vite · Yahoo Finance · Tauri',
    discLabel: 'Tuyên bố miễn trách',
    disc: 'Trang này chỉ dùng cho mục đích học tập và ghi nhật ký. Không có nội dung nào ở đây là lời khuyên tài chính. Mọi kết quả đều là mô phỏng hoặc giao dịch giấy.',
  };

  const c = lang === 'vi' ? viContent : enContent;

  const avatarSvg = `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" class="about-avatar-svg">
    <circle cx="40" cy="40" r="40" fill="var(--accent-wash)"/>
    <circle cx="40" cy="32" r="14" fill="var(--accent)" opacity="0.25"/>
    <ellipse cx="40" cy="62" rx="22" ry="14" fill="var(--accent)" opacity="0.18"/>
    <circle cx="40" cy="32" r="10" fill="var(--accent)" opacity="0.45"/>
    <ellipse cx="40" cy="60" rx="17" ry="10" fill="var(--accent)" opacity="0.3"/>
  </svg>`;

  root.innerHTML = `
    <div class="about-page">

      <!-- Hero / identity block -->
      <div class="about-hero">
        <div class="about-hero-inner">
          <div class="about-avatar">${avatarSvg}</div>
          <div class="about-hero-text">
            <div class="about-badge">${c.badge}</div>
            <h1 class="about-h1">${c.h1}</h1>
            <p class="about-tagline">${c.tagline}</p>
            <p class="muted" style="font-size:11px;margin-top:6px">${c.launched}</p>
          </div>
        </div>
      </div>

      <!-- Pull quote -->
      <blockquote class="about-quote">
        ${c.quote}
      </blockquote>

      <!-- The story: five full-viewport chapters, full-bleed out of this column -->
      <div class="about-story-head">
        <div class="about-pillars-title">${c.storyLabel}</div>
        <p class="muted about-story-lead">${c.storyLead}</p>
      </div>
      <section class="about-story sl-wrap">
        <div class="sl-snap about-snap">
          <div class="sl-story">${buildStoryChapters(storyCopy(lang))}</div>
        </div>
        <div class="sl-veil about-veil"></div>
      </section>

      <!-- Three pillars -->
      <div class="about-pillars-title">${c.pilarTitle}</div>
      <div class="about-pillars">
        <div class="about-pillar card">
          <div class="about-pillar-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <strong>${c.pillar1h}</strong>
          <p class="muted">${c.pillar1d}</p>
        </div>
        <div class="about-pillar card">
          <div class="about-pillar-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          </div>
          <strong>${c.pillar2h}</strong>
          <p class="muted">${c.pillar2d}</p>
        </div>
        <div class="about-pillar card">
          <div class="about-pillar-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
          </div>
          <strong>${c.pillar3h}</strong>
          <p class="muted">${c.pillar3d}</p>
        </div>
      </div>

      <!-- Footer meta strip -->
      <div class="about-footer-strip">
        <span class="muted"><span class="about-meta-label">${c.builtLabel}:</span> ${c.builtWith}</span>
        <span class="about-divider">·</span>
        <span class="muted"><span class="about-meta-label">${c.discLabel}:</span> ${c.disc}</span>
      </div>

    </div>`;

  // `release` so the two boundaries hand the wheel back to the page: the reader
  // scrolls into chapter 0 from the pull quote and out of chapter 4 into the
  // pillars, with no gesture landing in a dead zone.
  wireCinematic({
    snap: root.querySelector<HTMLElement>('.about-snap')!,
    veil: root.querySelector<HTMLElement>('.about-veil')!,
    edge: 'release',
    initialReveal: 'onVisible',
  });
}
