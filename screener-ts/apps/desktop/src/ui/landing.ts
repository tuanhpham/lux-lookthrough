import { getLang, setLang } from './i18n.js';
import { applyTheme } from './theme.js';

const EN = {
  navPrivate: 'Discover',
  heroQuote: 'True mastery is the birthplace of artistry.',
  heroCta: 'Discover →',
  s1: [
    `Some people are born knowing exactly what they want.`,
    `He wasn't.`,
    `And perhaps — that was where everything began.`,
  ],
  s2: [
    `He grew up in a quiet suburb, in an old house that had nothing remarkable about it — except love. Mornings smelled of warm rice. Evenings carried the soft murmur of his parents' voices drifting through thin walls. His childhood held no grand ambitions, no burning passions, no particular calling.`,
    `Just one simple, quietly held wish —`,
    `<em>Study well. Make them proud.</em>`,
    `Nothing more.`,
  ],
  s3: [
    `He noticed early on that he always started slower than everyone else. While others were already running, he was still finding his footing. But something strange kept happening — a quiet pattern that would repeat itself throughout his life — given enough time, he would find himself standing ahead.`,
    `Not because he was more gifted.`,
    `But because he had nothing to distract him. No passion pulling him sideways. Only one thing: <em>repeat, until it becomes part of you.</em>`,
    `He copied math solutions over and over until his hand knew the answer before his mind did. He rewrote essay after essay until language stopped being something he learned — and became something he breathed.`,
  ],
  q1: `"It was never brilliance that made him exceptional. It was the quiet, relentless act of beginning again."`,
  s4: [
    `Then life moved on — gently, steadily, and sometimes with a kind of ache he couldn't quite name.`,
    `No single flame burned long enough to keep him in one place. He was good at everything he touched — but only for a season. Nothing was ever pursued long enough to truly become his.`,
    `Until one evening, he looked at his parents — older now, quieter — and then at the small family he had built of his own. And something became unmistakably clear.`,
    `<em>He owed them a better version of himself.</em>`,
    `Not in money. Not in titles. In becoming — fully, finally — who he was capable of being.`,
  ],
  q2: `"Some of us are not driven by passion. We are driven by love, by duty, by the faces of the people we cannot afford to disappoint. And sometimes — that is the most enduring fire of all."`,
  s5: [
    `And so he chose trading.`,
    `Not because it was glamorous. Not because he fell in love with it at first sight. But because he made a quiet decision — to treat it the way he had once treated those math pages and those handwritten essays.`,
    `<em>Repeat. Be patient. Let it seep in.</em>`,
    `Until it was no longer a skill — but an instinct. Until it was no longer work — but an art.`,
    `Day by day. Chart by chart. Decision by decision. Slowly. Deliberately. In the only way he had ever truly known how.`,
  ],
  q3: `"When you have truly mastered something — you no longer do it. You live it."`,
  s6: [
    `And that is what he is building.`,
    `Not loudly. Not in a hurry.`,
    `But with the same quiet certainty of a man who has always known —`,
    `that those who start slow, and stay long enough, are often the ones who go the furthest.`,
    `He calls it — <em>the professional's art.</em>`,
  ],
  final: `"True mastery is the birthplace of artistry —<br>and I call it the professional's art."<br><span class="story-attr">— T.A.</span>`,
};

const VI = {
  navPrivate: 'Khám phá',
  heroQuote: 'True mastery is the birthplace of artistry.',
  heroCta: 'Khám phá →',
  s1: [
    `Có những người sinh ra đã biết mình muốn gì.`,
    `Còn anh thì không.`,
    `Và có lẽ — đó lại chính là điểm khởi đầu của tất cả.`,
  ],
  s2: [
    `Anh lớn lên ở một vùng ngoại ô yên tĩnh, trong một căn nhà cũ không có gì đặc biệt — ngoại trừ tình yêu thương. Buổi sáng có mùi cơm mới, buổi tối có tiếng bố mẹ trò chuyện khẽ khàng. Tuổi thơ anh không có ước mơ lớn lao, không có ngọn lửa rực cháy nào cả.`,
    `Chỉ có một điều giản dị, trong veo —`,
    `<em>Học thật tốt. Để bố mẹ vui.</em>`,
    `Chỉ vậy thôi.`,
  ],
  s3: [
    `Anh nhận ra từ rất sớm rằng mình luôn bắt đầu chậm hơn người khác. Trong khi bạn bè đã chạy, anh vẫn còn đang tìm đường bước. Nhưng rồi — một điều kỳ lạ cứ lặp đi lặp lại trong cuộc đời anh — sau một thời gian, anh lại là người đứng trước.`,
    `Không phải vì anh thông minh hơn.`,
    `Mà vì anh không có gì để phân tâm. Không có đam mê nào kéo anh đi lạc. Chỉ có một thứ duy nhất: <em>lặp lại, cho đến khi nào thứ đó thấm vào trong người.</em>`,
    `Anh chép đi chép lại những lời giải toán đến mức tay tự biết đường đi. Anh đọc đi đọc lại những bài văn mẫu đến mức ngôn ngữ không còn là thứ anh học — mà trở thành thứ anh thở.`,
  ],
  q1: `"Không phải thiên tài tạo ra sự xuất sắc. Chính sự kiên nhẫn lặp lại mới làm được điều đó."`,
  s4: [
    `Rồi cuộc đời cứ thế trôi — nhẹ nhàng, lặng lẽ, và đôi khi hơi buồn.`,
    `Không có ngọn lửa nào đủ lớn để giữ anh lại mãi ở một chỗ. Anh làm tốt mọi thứ anh chạm vào — nhưng chỉ đủ cho một giai đoạn, rồi thôi.`,
    `Cho đến một ngày, anh nhìn về phía bố mẹ đã già đi từ lúc nào. Nhìn về gia đình nhỏ của mình. Và anh cảm thấy rõ ràng hơn bao giờ hết —`,
    `<em>Mình nợ họ một phiên bản tốt hơn của chính mình.</em>`,
    `Không phải tiền bạc. Không phải danh hiệu. Mà là trở thành — trọn vẹn, cuối cùng — con người anh có thể là.`,
  ],
  q2: `"Có những thứ không thúc đẩy ta bằng đam mê — mà bằng tình yêu thương và trách nhiệm. Và đó đôi khi lại là động lực bền bỉ nhất."`,
  s5: [
    `Và rồi anh chọn trading.`,
    `Không phải vì nó hào nhoáng. Không phải vì anh yêu nó ngay từ cái nhìn đầu tiên. Mà vì anh quyết định sẽ đối xử với nó đúng như cách anh đã từng đối xử với những trang toán, những bài văn năm xưa.`,
    `<em>Lặp lại. Kiên nhẫn. Thấm dần.</em>`,
    `Cho đến khi nào nó không còn là kỹ năng nữa — mà trở thành bản năng. Cho đến khi nào nó không còn là công việc nữa — mà trở thành nghệ thuật.`,
    `Từng ngày, từng nến giá, từng quyết định. Một cách lặng lẽ. Một cách bền bỉ.`,
  ],
  q3: `"Khi bạn thực sự thuần thục một thứ gì đó — bạn không còn làm nó nữa. Bạn sống với nó."`,
  s6: [
    `Và đó là thứ anh đang kiến tạo.`,
    `Không ồn ào. Không vội vàng.`,
    `Mà với sự chắc chắn lặng lẽ của một người luôn biết rằng —`,
    `những ai bắt đầu chậm, và ở lại đủ lâu, thường là những người đi xa nhất.`,
    `Thứ mà anh gọi là — <em>the professional's art.</em>`,
  ],
  final: `"True mastery is the birthplace of artistry —<br>and I call it the professional's art."<br><span class="story-attr">— T.A.</span>`,
};

// ── Inline photo illustrations ───────────────────────────────────────────────

// Illus A: childhood.png — beside the "old house / childhood" section
const illusHouse = `<img class="story-illo reveal" src="/images/childhood.png" alt="" aria-hidden="true" loading="lazy">`;

// Illus B: study.png — beside the repetition/study section
const illusNotebook = `<img class="story-illo-left reveal" src="/images/study.png" alt="" aria-hidden="true" loading="lazy">`;

// Illus C: start.png — beside the "he looked at his parents" section
const illusFamily = `<img class="story-illo reveal" src="/images/start.png" alt="" aria-hidden="true" loading="lazy">`;

// Illus D: trading.png — beside "he chose trading"
const illusTrading = `<img class="story-illo-left reveal" src="/images/trading.png" alt="" aria-hidden="true" loading="lazy">`;


// Full-width scene separators
const SCENES = [
  `<div class="sl-scene sl-scene-a" aria-hidden="true"></div>`,
  `<div class="sl-scene sl-scene-b" aria-hidden="true"></div>`,
  `<div class="sl-scene sl-scene-c" aria-hidden="true"></div>`,
  `<div class="sl-scene sl-scene-d" aria-hidden="true"></div>`,
];

function buildStoryBlocks(c: typeof EN): string {
  const block = (paras: string[], cls = '') =>
    `<div class="story-block${cls ? ' ' + cls : ''}">${paras.map((p) => `<p class="story-p reveal">${p}</p>`).join('')}</div>`;
  const quote = (text: string) =>
    `<div class="story-quote reveal"><span>${text}</span></div>`;
  // block with illustration beside it
  const blockWithIllo = (paras: string[], illo: string, side: 'right' | 'left' = 'right') =>
    `<div class="story-with-illo${side === 'left' ? ' story-with-illo--left' : ''}">
      <div class="story-block">${paras.map((p) => `<p class="story-p reveal">${p}</p>`).join('')}</div>
      ${illo}
    </div>`;

  return [
    block(c.s1, 'story-open'),
    SCENES[0]!,
    blockWithIllo(c.s2, illusHouse),           // childhood home beside the "old house" para
    blockWithIllo(c.s3, illusNotebook, 'left'), // notebook beside the repetition para
    SCENES[1]!,
    quote(c.q1),
    blockWithIllo(c.s4, illusFamily),           // family beside the "he looked at his parents" para
    SCENES[2]!,
    quote(c.q2),
    blockWithIllo(c.s5, illusTrading, 'left'), // trading.png beside "he chose trading"
    SCENES[3]!,
    quote(c.q3),
    block(c.s6),
    `<div class="story-final reveal">${c.final}</div>`,
  ].join('\n');
}

export function renderLanding(host: HTMLElement, onEnterPrivate: () => void): void {
  const isLight = document.documentElement.classList.contains('light');
  const lang = getLang();
  const c = lang === 'vi' ? VI : EN;

  host.innerHTML = `
<div class="sl-wrap">

  <!-- ── Fixed top bar ── -->
  <header class="sl-topbar">
    <div class="sl-brand">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="sl-logo-svg"><path d="M3 17l5-5 4 3 8-8"/><path d="M21 7v5h-5"/></svg>
      <span class="sl-brand-name">The Professional</span>
    </div>
    <div class="sl-topbar-right">
      <div class="lang-toggle" role="group" aria-label="Language">
        <button data-ll="en" class="${lang === 'en' ? 'active' : ''}">EN</button>
        <button data-ll="vi" class="${lang === 'vi' ? 'active' : ''}">VI</button>
      </div>
      <button id="sl-theme" class="theme-toggle" title="Toggle theme">${isLight ? '☀️' : '🌙'}</button>
      <button id="sl-enter-top" class="btn sl-enter-btn">${c.navPrivate}</button>
    </div>
  </header>

  <!-- ── Hero: full viewport, pastoral landscape ── -->
  <section class="sl-hero">
    <div class="sl-hero-bg"></div>
    <div class="sl-hero-overlay"></div>
    <div class="sl-hero-content">
      <p class="sl-hero-quote">${c.heroQuote}</p>
      <button id="sl-enter-hero" class="sl-hero-cta">${c.heroCta}</button>
    </div>
    <div class="sl-scroll-hint">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
  </section>

  <!-- ── Narrative scroll ── -->
  <section class="sl-story">
    ${buildStoryBlocks(c)}
  </section>

  <!-- ── Final CTA ── -->
  <section class="sl-bottom-cta">
    <button id="sl-enter-bottom" class="btn sl-bottom-btn">${c.heroCta}</button>
    <p class="sl-disc muted">Educational use only. Not financial advice.</p>
  </section>

</div>`;

  // wire all enter buttons
  const enter = () => onEnterPrivate();
  host.querySelector('#sl-enter-top')!.addEventListener('click', enter);
  host.querySelector('#sl-enter-hero')!.addEventListener('click', enter);
  host.querySelector('#sl-enter-bottom')!.addEventListener('click', enter);

  // lang
  host.querySelectorAll<HTMLElement>('[data-ll]').forEach((b) =>
    b.addEventListener('click', () => {
      setLang(b.dataset.ll as 'en' | 'vi');
      renderLanding(host, onEnterPrivate);
    }),
  );

  // theme
  host.querySelector('#sl-theme')!.addEventListener('click', () => {
    const light = document.documentElement.classList.contains('light');
    applyTheme(light ? 'dark' : 'light');
    renderLanding(host, onEnterPrivate);
  });

  // scroll-reveal — rAF defers past first paint so CSS transitions fire.
  // rootMargin '0px 0px -40px 0px' ensures element is meaningfully in view.
  requestAnimationFrame(() => {
    const revealEls = Array.from(host.querySelectorAll<HTMLElement>('.reveal'));

    const reveal = (el: HTMLElement) => {
      el.classList.add('revealed');
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            reveal(e.target as HTMLElement);
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0, rootMargin: '0px 0px -60px 0px' },
    );
    revealEls.forEach((el) => observer.observe(el));
  });
}
