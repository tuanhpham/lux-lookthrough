import { $} from '../ui/dom.js';
import { t, getLang } from '../ui/i18n.js';

export function renderAbout(): void {
  const root = $('#tab-about')!;
  const lang = getLang();

  const enContent = {
    badge: 'About this project',
    h1: 'Dr. Tu Anh Pham',
    tagline: 'Data analytics & automation specialist · PhD in Economics · Allianz Investment Management',
    launched: 'First published: 22 June 2026',
    p1: `This website marks a small but meaningful turning point in my life — the day I decided to seriously pursue my dream of becoming a professional trader, and to take a more active role in shaping my own future.`,
    p2: `I'm Dr. Tu Anh Pham. Over the years, I've been fortunate to work with data and finance — most recently as a data analytics and automation specialist at Allianz Investment Management, after completing a PhD in Economics. I've spent a lot of my career analyzing markets and building tools to help others make better decisions. Along the way, I've learned how much I still have to learn.`,
    p3: `This site isn't a résumé, and I don't claim to have it all figured out. It's simply an honest record of a new journey — one I'm starting with humility and a lot of curiosity.`,
    p4: `After years of looking at markets from the outside, I want to try walking the path myself. To me, trading isn't really about quick wins; it's a long, patient process of building discipline, learning from mistakes, and growing as a person. This is where I'll document that journey — the lessons, the setbacks, the small victories — as I slowly work toward becoming a better trader and, hopefully, a better version of myself.`,
    p5: `If you've found your way here, thank you for being part of the story. I hope my journey might offer a little encouragement for yours, too.`,
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
    p1: `Website này đánh dấu một bước ngoặt nhỏ nhưng ý nghĩa trong cuộc đời mình — ngày mình quyết định nghiêm túc theo đuổi ước mơ trở thành một trader chuyên nghiệp, và chủ động hơn trong việc định hình tương lai của chính mình.`,
    p2: `Mình là TS. Phạm Tú Anh. Trong những năm qua, mình may mắn được làm việc với dữ liệu và tài chính — gần đây nhất là vị trí chuyên gia phân tích dữ liệu và tự động hóa tại Allianz Investment Management, sau khi hoàn thành chương trình Tiến sĩ Kinh tế. Phần lớn sự nghiệp của mình là phân tích thị trường và xây dựng công cụ giúp người khác ra quyết định tốt hơn. Và trên hành trình ấy, mình nhận ra bản thân vẫn còn rất nhiều điều phải học.`,
    p3: `Đây không phải là một bản CV, và mình cũng không dám nói rằng mình đã hiểu hết mọi thứ. Nó đơn giản là một cuốn nhật ký chân thật cho một hành trình mới — hành trình mình bắt đầu với sự khiêm tốn và rất nhiều tò mò.`,
    p4: `Sau nhiều năm nhìn thị trường từ bên ngoài, mình muốn thử tự mình bước đi trên con đường đó. Với mình, trading không phải là chuyện thắng nhanh; đó là một quá trình dài và kiên nhẫn để rèn luyện kỷ luật, học từ những sai lầm, và trưởng thành hơn như một con người. Đây là nơi mình ghi lại hành trình ấy — những bài học, những vấp ngã, và cả những niềm vui nhỏ — khi mình từng bước cố gắng trở thành một trader tốt hơn, và hy vọng cũng là một phiên bản tốt hơn của chính mình.`,
    p5: `Nếu bạn tình cờ ghé qua đây, cảm ơn bạn đã là một phần của câu chuyện. Mong rằng hành trình của mình có thể mang lại một chút động lực cho hành trình của bạn.`,
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

      <!-- Narrative -->
      <div class="about-narrative card">
        <p>${c.p1}</p>
        <p>${c.p2}</p>
        <p>${c.p3}</p>
        <p>${c.p4}</p>
        <p>${c.p5}</p>
      </div>

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
}
