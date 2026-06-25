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

// ── Inline SVG illustrations ────────────────────────────────────────────────

// Illus A: Old family house at dusk — single warm window lit, overgrown garden
const illusHouse = `<svg class="story-illo reveal" viewBox="0 0 180 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="winLight" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(255,200,100,.9)"/>
      <stop offset="100%" stop-color="rgba(200,130,40,.3)"/>
    </radialGradient>
    <radialGradient id="winGlow" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="rgba(255,180,60,.35)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
  </defs>
  <!-- Night sky -->
  <rect width="180" height="220" fill="#06080e"/>
  <!-- Stars -->
  <circle cx="22" cy="18" r=".8" fill="rgba(255,255,255,.5)"/>
  <circle cx="55" cy="10" r=".6" fill="rgba(255,255,255,.4)"/>
  <circle cx="140" cy="22" r=".9" fill="rgba(255,255,255,.55)"/>
  <circle cx="162" cy="8" r=".7" fill="rgba(255,255,255,.4)"/>
  <circle cx="98" cy="14" r=".6" fill="rgba(255,255,255,.35)"/>
  <circle cx="12" cy="38" r=".5" fill="rgba(255,255,255,.3)"/>
  <circle cx="170" cy="35" r=".6" fill="rgba(255,255,255,.35)"/>
  <!-- House main body -->
  <rect x="38" y="95" width="104" height="90" fill="#0c0e14" stroke="#1a1e28" stroke-width="1"/>
  <!-- Weathered wall texture streaks -->
  <line x1="52" y1="95" x2="52" y2="185" stroke="#101420" stroke-width=".8" opacity=".6"/>
  <line x1="78" y1="95" x2="78" y2="185" stroke="#101420" stroke-width=".8" opacity=".5"/>
  <line x1="120" y1="95" x2="120" y2="185" stroke="#101420" stroke-width=".8" opacity=".5"/>
  <line x1="58" y1="110" x2="124" y2="110" stroke="#0e1018" stroke-width=".6" opacity=".4"/>
  <!-- Roof -->
  <polygon points="28,97 90,48 152,97" fill="#0a0c12" stroke="#161a24" stroke-width="1"/>
  <!-- Roof ridge details -->
  <line x1="90" y1="48" x2="90" y2="60" stroke="#1c2030" stroke-width="1"/>
  <!-- Chimney -->
  <rect x="108" y="55" width="14" height="28" fill="#0c0e14" stroke="#161a24" stroke-width=".8"/>
  <!-- Chimney smoke -->
  <path d="M112 55 Q110 44 114 36 Q118 28 115 20" stroke="rgba(100,110,130,.25)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M118 52 Q120 42 116 33" stroke="rgba(100,110,130,.18)" stroke-width="2" stroke-linecap="round" fill="none"/>
  <!-- THE lit window — warm amber glow, the heart of the painting -->
  <rect x="60" y="108" width="28" height="22" fill="url(#winGlow)" rx="1"/>
  <rect x="62" y="110" width="24" height="18" fill="url(#winLight)" rx=".5"/>
  <!-- Window pane cross -->
  <line x1="74" y1="110" x2="74" y2="128" stroke="rgba(140,80,20,.7)" stroke-width=".8"/>
  <line x1="62" y1="119" x2="86" y2="119" stroke="rgba(140,80,20,.7)" stroke-width=".8"/>
  <!-- Window light spill onto facade -->
  <ellipse cx="74" cy="130" rx="18" ry="6" fill="rgba(255,180,60,.08)"/>
  <!-- Dark window (upstairs — no one home there) -->
  <rect x="100" y="108" width="24" height="18" fill="#080a10" stroke="#14182200" rx=".5"/>
  <line x1="112" y1="108" x2="112" y2="126" stroke="#0e1016" stroke-width=".8"/>
  <line x1="100" y1="117" x2="124" y2="117" stroke="#0e1016" stroke-width=".8"/>
  <!-- Front door -->
  <rect x="78" y="152" width="24" height="33" fill="#0a0c10" stroke="#161a22" stroke-width=".8" rx="1"/>
  <circle cx="98" cy="168" r="1.5" fill="#2a2e3a"/>
  <!-- Door arch -->
  <path d="M78 154 Q90 146 102 154" fill="#0a0c10" stroke="#161a22" stroke-width=".8"/>
  <!-- Front steps -->
  <rect x="72" y="183" width="36" height="4" fill="#0e1018" stroke="#161a22" stroke-width=".6"/>
  <rect x="68" y="187" width="44" height="3" fill="#0c0e14"/>
  <!-- Overgrown garden / grass -->
  <path d="M38 185 Q42 178 44 185 Q48 176 50 185 Q54 179 55 185" stroke="#0a1408" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M125 185 Q128 177 130 185 Q133 179 136 185 Q138 177 140 185" stroke="#0a1408" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M142 185 Q145 180 147 185 Q149 178 151 185" stroke="#0c1609" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <!-- Ground -->
  <rect x="0" y="185" width="180" height="35" fill="#07090e"/>
  <path d="M0 185 Q45 182 90 185 Q135 188 180 185" stroke="#0c1010" stroke-width=".8" fill="none"/>
  <!-- Ambient night glow around the house -->
  <ellipse cx="90" cy="130" rx="70" ry="55" fill="rgba(255,140,40,.025)"/>
</svg>`;

// Illus B: Open notebook with handwritten lines — repetition, discipline
const illusNotebook = `<svg class="story-illo-left reveal" viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="pageGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f4efe6"/>
      <stop offset="100%" stop-color="#ede6d8"/>
    </linearGradient>
  </defs>
  <!-- Dark desk surface -->
  <rect width="160" height="200" fill="#080a0e"/>
  <!-- Subtle desk grain -->
  <line x1="0" y1="70" x2="160" y2="72" stroke="#0d0f14" stroke-width=".7"/>
  <line x1="0" y1="120" x2="160" y2="118" stroke="#0d0f14" stroke-width=".5"/>
  <!-- Desk light spill from upper right -->
  <ellipse cx="145" cy="30" rx="50" ry="40" fill="rgba(255,210,140,.07)"/>
  <!-- Notebook shadow -->
  <ellipse cx="82" cy="170" rx="60" ry="8" fill="rgba(0,0,0,.45)"/>
  <!-- Notebook left page -->
  <rect x="18" y="28" width="65" height="140" fill="url(#pageGrad)" rx="2"/>
  <!-- Left page lines — written over and over, some darker (more pressure) -->
  <line x1="24" y1="50" x2="77" y2="50" stroke="#8a7a5a" stroke-width=".7" opacity=".6"/>
  <line x1="24" y1="60" x2="77" y2="60" stroke="#8a7a5a" stroke-width=".8" opacity=".7"/>
  <line x1="24" y1="70" x2="77" y2="70" stroke="#8a7a5a" stroke-width=".7" opacity=".6"/>
  <line x1="24" y1="80" x2="73" y2="80" stroke="#8a7a5a" stroke-width=".6" opacity=".5"/>
  <line x1="24" y1="90" x2="77" y2="90" stroke="#6a5a3a" stroke-width="1" opacity=".8"/>
  <line x1="24" y1="100" x2="77" y2="100" stroke="#6a5a3a" stroke-width="1.1" opacity=".9"/>
  <line x1="24" y1="110" x2="75" y2="110" stroke="#8a7a5a" stroke-width=".7" opacity=".6"/>
  <line x1="24" y1="120" x2="77" y2="120" stroke="#6a5a3a" stroke-width="1" opacity=".8"/>
  <line x1="24" y1="130" x2="70" y2="130" stroke="#8a7a5a" stroke-width=".6" opacity=".5"/>
  <line x1="24" y1="140" x2="77" y2="140" stroke="#6a5a3a" stroke-width="1.1" opacity=".9"/>
  <!-- Red margin line -->
  <line x1="32" y1="28" x2="32" y2="168" stroke="#c05050" stroke-width=".6" opacity=".5"/>
  <!-- Page number -->
  <text x="46" y="162" text-anchor="middle" font-size="7" fill="#8a7a5a" font-family="serif" opacity=".7">47</text>
  <!-- Notebook right page (fresh, current) -->
  <rect x="83" y="28" width="65" height="140" fill="#f8f3ea" rx="2"/>
  <!-- Right page: same line written again — the student's current work -->
  <line x1="89" y1="50" x2="142" y2="50" stroke="#9a8a6a" stroke-width=".7" opacity=".5"/>
  <line x1="89" y1="60" x2="142" y2="60" stroke="#9a8a6a" stroke-width=".7" opacity=".5"/>
  <line x1="89" y1="70" x2="142" y2="70" stroke="#5a4a2a" stroke-width="1.2" opacity=".9"/>
  <line x1="89" y1="80" x2="138" y2="80" stroke="#5a4a2a" stroke-width="1.1" opacity=".8"/>
  <line x1="89" y1="90" x2="142" y2="90" stroke="#5a4a2a" stroke-width="1.2" opacity=".9"/>
  <!-- Pen resting on right page -->
  <rect x="128" y="94" width="28" height="3" rx="1.5" fill="#1a1a1a" transform="rotate(-25,128,94)"/>
  <polygon points="127,94 123,97 126,98" fill="#c8a020" transform="rotate(-25,128,94)"/>
  <!-- Spine shadow -->
  <rect x="80" y="28" width="6" height="140" fill="rgba(0,0,0,.25)"/>
  <!-- Binding marks -->
  <line x1="83" y1="45" x2="83" y2="50" stroke="rgba(0,0,0,.3)" stroke-width=".8"/>
  <line x1="83" y1="90" x2="83" y2="95" stroke="rgba(0,0,0,.3)" stroke-width=".8"/>
  <line x1="83" y1="135" x2="83" y2="140" stroke="rgba(0,0,0,.3)" stroke-width=".8"/>
</svg>`;

// Illus C: Two aging silhouettes facing each other — parents, family
const illusFamily = `<svg class="story-illo reveal" viewBox="0 0 180 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="roomLight" cx="50%" cy="30%" r="55%">
      <stop offset="0%" stop-color="rgba(255,200,120,.18)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
  </defs>
  <rect width="180" height="200" fill="#07080c"/>
  <rect width="180" height="200" fill="url(#roomLight)"/>
  <!-- floor line -->
  <line x1="0" y1="168" x2="180" y2="168" stroke="#0e1018" stroke-width=".8"/>
  <!-- Hanging lamp above — warm cone of light -->
  <ellipse cx="90" cy="42" rx="24" ry="4" fill="rgba(255,200,100,.22)"/>
  <path d="M80,42 L68,100 Q90,108 112,100 L100,42 Z" fill="rgba(255,180,70,.06)"/>
  <ellipse cx="90" cy="38" rx="10" ry="4" fill="rgba(255,220,150,.5)" opacity=".7"/>
  <line x1="90" y1="10" x2="90" y2="36" stroke="#1a1c22" stroke-width="1.5"/>
  <!-- Father silhouette (left) — slight forward lean, older posture -->
  <!-- legs -->
  <line x1="52" y1="148" x2="48" y2="168" stroke="rgba(12,10,8,.95)" stroke-width="7" stroke-linecap="round"/>
  <line x1="64" y1="148" x2="67" y2="168" stroke="rgba(12,10,8,.95)" stroke-width="7" stroke-linecap="round"/>
  <!-- torso — slightly bent -->
  <path d="M46,108 Q58,104 68,108 L68,148 Q58,152 48,148 Z" fill="rgba(12,10,8,.95)"/>
  <!-- left arm raised (reaching toward mother) -->
  <path d="M46,118 Q38,128 94,138" stroke="rgba(12,10,8,.9)" stroke-width="5.5" stroke-linecap="round" fill="none"/>
  <!-- right arm down -->
  <path d="M68,118 Q72,132 70,142" stroke="rgba(12,10,8,.9)" stroke-width="5" stroke-linecap="round" fill="none"/>
  <!-- head -->
  <ellipse cx="58" cy="100" rx="11" ry="11.5" fill="rgba(12,10,8,.95)"/>
  <!-- Mother silhouette (right) — reaching back -->
  <!-- legs -->
  <line x1="112" y1="148" x2="108" y2="168" stroke="rgba(14,11,9,.95)" stroke-width="6" stroke-linecap="round"/>
  <line x1="124" y1="148" x2="128" y2="168" stroke="rgba(14,11,9,.95)" stroke-width="6" stroke-linecap="round"/>
  <!-- torso — dress shape -->
  <path d="M108,110 Q118,106 130,110 L132,148 Q118,154 106,148 Z" fill="rgba(14,11,9,.95)"/>
  <!-- arm reaching toward father -->
  <path d="M108,120 Q86,132 94,138" stroke="rgba(14,11,9,.9)" stroke-width="5" stroke-linecap="round" fill="none"/>
  <!-- other arm -->
  <path d="M130,120 Q136,132 134,144" stroke="rgba(14,11,9,.9)" stroke-width="5" stroke-linecap="round" fill="none"/>
  <!-- head -->
  <ellipse cx="119" cy="102" rx="10" ry="10.5" fill="rgba(14,11,9,.95)"/>
  <!-- Joined hands at center (subtle highlight) -->
  <ellipse cx="94" cy="139" rx="5" ry="3.5" fill="rgba(255,180,80,.12)"/>
  <!-- Rim light on both figures from the lamp -->
  <path d="M46,108 Q58,104 68,108 L68,148 Q58,152 48,148 Z" fill="none" stroke="rgba(255,190,80,.10)" stroke-width="1"/>
  <path d="M108,110 Q118,106 130,110 L132,148 Q118,154 106,148 Z" fill="none" stroke="rgba(255,190,80,.10)" stroke-width="1"/>
  <!-- Floor shadow -->
  <ellipse cx="58" cy="170" rx="22" ry="4" fill="rgba(0,0,0,.3)"/>
  <ellipse cx="119" cy="170" rx="20" ry="4" fill="rgba(0,0,0,.3)"/>
</svg>`;

// Illus D: Glowing candlestick chart in darkness — the commitment
const illusChart = `<svg class="story-illo-left reveal" viewBox="0 0 180 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="screenGlow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="rgba(18,216,154,.12)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="1.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="180" height="160" fill="#05060a"/>
  <!-- Monitor/screen shape -->
  <rect x="14" y="12" width="152" height="110" fill="#07090e" stroke="#1a2030" stroke-width="1.2" rx="3"/>
  <!-- Screen glow -->
  <rect x="14" y="12" width="152" height="110" fill="url(#screenGlow)" rx="3"/>
  <!-- Grid lines -->
  <line x1="14" y1="38" x2="166" y2="38" stroke="#0f1520" stroke-width=".6"/>
  <line x1="14" y1="64" x2="166" y2="64" stroke="#0f1520" stroke-width=".6"/>
  <line x1="14" y1="90" x2="166" y2="90" stroke="#0f1520" stroke-width=".6"/>
  <!-- EMA line (green, glowing) -->
  <polyline points="18,88 30,82 44,76 58,72 70,74 82,70 96,62 110,54 124,48 138,42 152,36" fill="none" stroke="#18d89a" stroke-width="1.4" filter="url(#glow)" opacity=".8"/>
  <!-- Candles -->
  <!-- bearish -->
  <line x1="26" y1="78" x2="26" y2="96" stroke="#ff5266" stroke-width=".8"/>
  <rect x="22" y="82" width="8" height="10" fill="#ff5266" opacity=".85" rx=".5"/>
  <!-- bullish -->
  <line x1="40" y1="70" x2="40" y2="84" stroke="#18d89a" stroke-width=".8"/>
  <rect x="36" y="72" width="8" height="8" fill="#18d89a" opacity=".85" rx=".5" filter="url(#glow)"/>
  <!-- bearish -->
  <line x1="54" y1="68" x2="54" y2="80" stroke="#ff5266" stroke-width=".8"/>
  <rect x="50" y="70" width="8" height="7" fill="#ff5266" opacity=".75" rx=".5"/>
  <!-- bullish -->
  <line x1="68" y1="64" x2="68" y2="78" stroke="#18d89a" stroke-width=".8"/>
  <rect x="64" y="66" width="8" height="9" fill="#18d89a" opacity=".8" rx=".5" filter="url(#glow)"/>
  <!-- small doji -->
  <line x1="82" y1="60" x2="82" y2="76" stroke="#ffb648" stroke-width=".8"/>
  <rect x="79" y="65" width="6" height="4" fill="#ffb648" opacity=".7" rx=".5"/>
  <!-- breakout candle — tall, glowing bright -->
  <line x1="96" y1="48" x2="96" y2="70" stroke="#18d89a" stroke-width=".9"/>
  <rect x="92" y="50" width="8" height="16" fill="#18d89a" opacity=".95" rx=".5" filter="url(#glow)"/>
  <!-- bullish continuation -->
  <line x1="110" y1="42" x2="110" y2="58" stroke="#18d89a" stroke-width=".9"/>
  <rect x="106" y="44" width="8" height="11" fill="#18d89a" opacity=".9" rx=".5" filter="url(#glow)"/>
  <line x1="124" y1="36" x2="124" y2="52" stroke="#18d89a" stroke-width=".9"/>
  <rect x="120" y="38" width="8" height="11" fill="#18d89a" opacity=".85" rx=".5" filter="url(#glow)"/>
  <!-- Pivot line -->
  <line x1="14" y1="74" x2="166" y2="74" stroke="#ffb648" stroke-width=".7" stroke-dasharray="4 3" opacity=".5"/>
  <text x="158" y="71" font-size="6" fill="#ffb648" font-family="monospace" opacity=".6">PIVOT</text>
  <!-- Monitor stand -->
  <rect x="82" y="122" width="16" height="8" fill="#0a0c12" stroke="#141820" stroke-width=".8"/>
  <rect x="72" y="129" width="36" height="4" fill="#0c0e14" stroke="#141820" stroke-width=".6" rx="1"/>
  <!-- Keyboard glow on desk -->
  <ellipse cx="90" cy="148" rx="45" ry="8" fill="rgba(18,216,154,.04)"/>
  <rect x="52" y="143" width="76" height="12" fill="#080a0e" stroke="#121820" stroke-width=".7" rx="1"/>
</svg>`;

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
    blockWithIllo(c.s4, illusFamily),           // family silhouette beside the "he looked at his parents" para
    SCENES[2]!,
    quote(c.q2),
    blockWithIllo(c.s5, illusChart, 'left'),    // glowing chart beside "he chose trading"
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

    <!-- Lone figure walking toward light — corridor silhouette -->
    <svg class="sl-hero-figure" viewBox="0 0 120 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <!-- Corridor walls converging to a bright vanishing point -->
      <defs>
        <radialGradient id="corridorLight" cx="50%" cy="42%" r="38%" fx="50%" fy="42%">
          <stop offset="0%" stop-color="rgba(255,220,160,.55)"/>
          <stop offset="40%" stop-color="rgba(220,180,100,.18)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
        </radialGradient>
        <radialGradient id="floorGlow" cx="50%" cy="100%" r="55%">
          <stop offset="0%" stop-color="rgba(200,155,80,.14)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
        </radialGradient>
      </defs>
      <!-- Floor perspective lines -->
      <line x1="60" y1="84" x2="0" y2="200" stroke="rgba(180,140,80,.18)" stroke-width=".8"/>
      <line x1="60" y1="84" x2="120" y2="200" stroke="rgba(180,140,80,.18)" stroke-width=".8"/>
      <line x1="60" y1="84" x2="20" y2="200" stroke="rgba(180,140,80,.08)" stroke-width=".5"/>
      <line x1="60" y1="84" x2="100" y2="200" stroke="rgba(180,140,80,.08)" stroke-width=".5"/>
      <!-- Ceiling perspective lines -->
      <line x1="60" y1="84" x2="0" y2="0" stroke="rgba(180,140,80,.12)" stroke-width=".6"/>
      <line x1="60" y1="84" x2="120" y2="0" stroke="rgba(180,140,80,.12)" stroke-width=".6"/>
      <!-- Bright light source at vanishing point -->
      <ellipse cx="60" cy="84" rx="22" ry="14" fill="url(#corridorLight)"/>
      <ellipse cx="60" cy="84" rx="9" ry="6" fill="rgba(255,230,170,.32)"/>
      <ellipse cx="60" cy="84" rx="4" ry="3" fill="rgba(255,245,210,.55)"/>
      <!-- Floor glow reflection -->
      <rect x="0" y="140" width="120" height="60" fill="url(#floorGlow)" opacity=".6"/>
      <!-- Figure silhouette — small, walking toward the light, mid-distance -->
      <!-- Shadow cast on floor behind figure -->
      <ellipse cx="60" cy="157" rx="7" ry="2.5" fill="rgba(0,0,0,.35)"/>
      <!-- legs walking -->
      <path d="M58 147 Q55 155 53 163" stroke="rgba(8,6,4,.92)" stroke-width="3.2" stroke-linecap="round" fill="none"/>
      <path d="M62 147 Q64 155 66 160" stroke="rgba(8,6,4,.92)" stroke-width="3.2" stroke-linecap="round" fill="none"/>
      <!-- torso -->
      <path d="M55 127 Q60 129 65 127 L67 147 Q60 149 53 147 Z" fill="rgba(8,6,4,.92)"/>
      <!-- arm swinging -->
      <path d="M55 132 Q50 140 49 146" stroke="rgba(8,6,4,.88)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      <path d="M65 132 Q70 138 71 143" stroke="rgba(8,6,4,.88)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      <!-- head -->
      <ellipse cx="60" cy="122" rx="5" ry="5.5" fill="rgba(8,6,4,.92)"/>
      <!-- rim light from corridor source — subtle bright edge -->
      <path d="M55 127 Q60 129 65 127 L67 147 Q60 149 53 147 Z" fill="none" stroke="rgba(220,180,100,.22)" stroke-width=".8"/>
    </svg>

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
