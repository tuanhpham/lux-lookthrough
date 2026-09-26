/**
 * The Swing Playbook, as it appears at the bottom of the Learn tab.
 *
 * Ported from `cam-nang-swing-trading-playbook.html` at the repo root, which was
 * a standalone dark-only Vietnamese page. Three things changed in the port and
 * all three were the point of doing it:
 *
 *   1. Bilingual. Every string is a `Bi` pair, same as the rest of this tab.
 *   2. Theme-aware. Not one hex literal survives; the source's private palette
 *      maps onto the app's tokens, so light mode is not a separate stylesheet.
 *   3. Scoped. The source used global ids and inline `onclick`. Everything here
 *      is a `data-swp-*` attribute resolved against the root element, so the
 *      page can be rendered twice (a language switch re-renders it) without two
 *      scorecards fighting over the same id.
 *
 * The figures live in `swingPlaybookFigures.ts`; the interactive bits (regime
 * tabs, scorecard, size calculator) are wired by `wireSwingPlaybook`.
 */
import {
  candleAnatomyFigure,
  figure,
  pullbackChart,
  breakoutChart,
  meanRevChart,
  regimeFigure,
  rotationFigure,
  rrFigure,
  shortRallyChart,
  vcpChart,
  volFigure,
  volumeCasesFigure,
} from './swingPlaybookFigures.js';

type Lang = 'en' | 'vi';
type Bi = { en: string; vi: string };
const tx = (b: Bi, lang: Lang) => b[lang] ?? b.en;

// ── markup helpers ──────────────────────────────────────────────────────────

/** A numbered section. `id` gets the `swp-` prefix; the nav chips scroll to it. */
function sec(id: string, num: string, title: string, sub: string, body: string): string {
  return `<section class="swp-sec" id="swp-${id}">
    <div class="swp-head"><span class="swp-num">${num}</span><h3 class="swp-h">${title}</h3></div>
    ${sub ? `<p class="swp-sub">${sub}</p>` : ''}
    ${body}
  </section>`;
}

function h4(t: string): string {
  return `<h4 class="swp-h4">${t}</h4>`;
}

type CalloutKind = 'note' | 'info' | 'good' | 'bad';
function callout(kind: CalloutKind, title: string, ...paras: string[]): string {
  return `<div class="swp-callout swp-c-${kind}">
    <div class="swp-callout-t">${title}</div>
    ${paras.map((p) => `<p>${p}</p>`).join('')}
  </div>`;
}

function card(body: string): string {
  return `<div class="swp-card">${body}</div>`;
}

function grid(cols: 2 | 3, ...cells: string[]): string {
  return `<div class="swp-grid swp-g${cols}">${cells.join('')}</div>`;
}

function table(heads: string[], rows: string[][]): string {
  return `<div class="swp-tw"><table class="playbook-table swp-table">
    <thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
      .join('')}</tbody>
  </table></div>`;
}

/** The pill used in tables. `tone` picks the token, not a colour. */
function pill(tone: 'up' | 'down' | 'gold' | 'blue' | 'violet', t: string): string {
  return `<span class="swp-pill swp-p-${tone}">${t}</span>`;
}

function flow(steps: [string, string][]): string {
  return `<div class="swp-flow">${steps
    .map(
      ([b, s], i) =>
        `<div class="swp-step"><div class="swp-step-n">${i + 1}</div><div class="swp-step-b"><b>${b}</b><span>${s}</span></div></div>`,
    )
    .join('')}</div>`;
}

/** Entry / condition / stop / exit table for one setup. */
function spec(items: [string, string][]): string {
  return `<dl class="swp-spec">${items
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join('')}</dl>`;
}

function vs(goodT: string, good: string[], badT: string, bad: string[]): string {
  const col = (cls: string, t: string, items: string[]) =>
    `<div class="swp-vs-col swp-vs-${cls}"><h5>${t}</h5><ul>${items
      .map((x) => `<li>${x}</li>`)
      .join('')}</ul></div>`;
  return `<div class="swp-vs">${col('good', goodT, good)}${col('bad', badT, bad)}</div>`;
}

function pre(text: string): string {
  return `<pre class="playbook-pre swp-pre">${text}</pre>`;
}

function ul(items: string[]): string {
  return `<ul class="swp-ul">${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
}

// ── 01 · core principles ────────────────────────────────────────────────────

function s01(lang: Lang): string {
  const vi = lang === 'vi';
  const principles: [string, string, string, string][] = vi
    ? [
        [
          'up',
          'NGUYÊN TẮC 1',
          'Entry quyết định rủi ro.<br>Exit quyết định lợi nhuận.',
          'Anh không vào lệnh vì "giá sẽ lên". Anh vào lệnh vì có một mức giá mà <b>nếu thủng thì luận điểm sai ngay lập tức</b>. Entry chỉ có một nhiệm vụ: cho anh một điểm stop gần và rõ ràng.',
        ],
        [
          'gold',
          'NGUYÊN TẮC 2',
          'Vị trí quan trọng hơn<br>hình dạng nến.',
          'Một cây hammer giữa vùng trống không có ý nghĩa gì. Cũng cây hammer đó tại 21 EMA trong uptrend, với volume cạn trước đó, mới là tín hiệu. <b>Đừng quét thị trường tìm mẫu nến.</b>',
        ],
        [
          'blue',
          'NGUYÊN TẮC 3',
          'Regime lọc trước,<br>cổ phiếu chọn sau.',
          'Dùng setup trend-following trong thị trường sideway, hoặc mean-reversion trong xu hướng mạnh — đó là sai lầm phổ biến nhất và tốn kém nhất của swing trader.',
        ],
      ]
    : [
        [
          'up',
          'PRINCIPLE 1',
          'Entry decides risk.<br>Exit decides profit.',
          'You do not take a trade because "price will go up". You take it because there is a level where, <b>if it breaks, the thesis is wrong immediately</b>. The entry has exactly one job: give you a close, unambiguous stop.',
        ],
        [
          'gold',
          'PRINCIPLE 2',
          'Location matters more<br>than candle shape.',
          'A hammer in the middle of nowhere means nothing. That same hammer at the 21 EMA in an uptrend, with volume having dried up beforehand, is a signal. <b>Do not scan the market for candle patterns.</b>',
        ],
        [
          'blue',
          'PRINCIPLE 3',
          'Regime filters first,<br>stock selection second.',
          'Running a trend-following setup in a sideways market, or mean reversion in a strong trend — that is the single most common and most expensive mistake a swing trader makes.',
        ],
      ];

  const steps: [string, string][] = vi
    ? [
        ['Market Regime (chỉ số)', 'Quyết định: được phép chơi kiểu gì, size bao nhiêu, hay đứng ngoài'],
        ['Sector dẫn dắt (nhóm ngành)', 'Thu hẹp vũ trụ cổ phiếu xuống còn 2–3 nhóm đang hút dòng tiền'],
        ['Cổ phiếu In-Play', 'Lọc còn 5–10 mã thực sự có người chơi: RVol, thanh khoản, RS, chất xúc tác'],
        ['Setup & tín hiệu vào lệnh', 'Chờ nến xác nhận tại vùng tham chiếu — chỉ trong số 5–10 mã đó'],
      ]
    : [
        ['Market regime (the index)', 'Decides what you are allowed to play, at what size, or whether to stand aside'],
        ['Leading sector', 'Narrows the universe down to the 2–3 groups money is actually flowing into'],
        ['In-play stocks', 'Down to 5–10 names with real participation: RVol, liquidity, RS, a catalyst'],
        ['Setup & entry trigger', 'Wait for a confirming bar at a reference level — only among those 5–10 names'],
    ];

  return sec(
    'funnel',
    '01',
    vi ? 'Nguyên tắc cốt lõi' : 'Core principles',
    vi
      ? 'Ba câu này quyết định 80% kết quả. Phần còn lại của cẩm nang chỉ là chi tiết triển khai.'
      : 'These three sentences decide 80% of the outcome. The rest of the playbook is implementation detail.',
    grid(
      3,
      ...principles.map(([tone, tag, head, body]) =>
        card(`${pill(tone as 'up', tag)}${h4(head)}<p class="swp-p">${body}</p>`),
      ),
    ) +
      h4(vi ? 'Phễu 3 tầng — thứ tự không được đảo' : 'The three-layer funnel — the order is not negotiable') +
      flow(steps) +
      callout(
        'info',
        vi ? 'Tại sao không được bỏ tầng giữa' : 'Why you cannot skip the middle layer',
        vi
          ? 'Đây là lý do phổ biến khiến một setup nhìn rất đẹp vẫn thất bại: <b>mẫu hình đúng nhưng đặt trên một cổ phiếu không có dòng tiền</b>. Mỗi tầng loại bớt. Nếu tầng trên không rõ ràng thì dừng lại — đứng ngoài cũng là một quyết định.'
          : 'This is the usual reason a beautiful-looking setup still fails: <b>the right pattern on a stock with no money flowing into it</b>. Each layer eliminates. If the layer above is not clear, stop — standing aside is also a decision.',
      ),
  );
}

// ── 02 · market regime ──────────────────────────────────────────────────────

function s02(lang: Lang): string {
  const vi = lang === 'vi';
  const qs: [string, string, string][] = vi
    ? [
        ['up', '1 · HƯỚNG', 'Trend hay range? → cho biết <b>dùng playbook nào</b>'],
        ['blue', '2 · BIẾN ĐỘNG', 'Nở hay co? → cho biết <b>size bao nhiêu</b>'],
        ['gold', '3 · ĐỘ RỘNG', 'Lan tỏa hay hẹp? → cho biết <b>tin xu hướng đến mức nào</b>'],
      ]
    : [
        ['up', '1 · DIRECTION', 'Trend or range? → tells you <b>which playbook</b>'],
        ['blue', '2 · VOLATILITY', 'Expanding or contracting? → tells you <b>what size</b>'],
        ['gold', '3 · BREADTH', 'Broad or narrow? → tells you <b>how much to trust the trend</b>'],
      ];

  const rows: string[][] = vi
    ? [
        ['Giá &gt; 50MA, &gt; 200MA, 50MA dốc lên', pill('up', 'UPTREND'), 'Pullback · Breakout · VCP'],
        ['Giá &lt; 50MA, &lt; 200MA, 50MA dốc xuống', pill('down', 'DOWNTREND'), 'Tiền mặt, hoặc short nhịp hồi vào 21 EMA'],
        ['Giá dao động qua lại quanh 50MA đi ngang', pill('gold', 'RANGE'), 'Chỉ mean reversion'],
        ['50MA &gt; 200MA nhưng giá &lt; 50MA', pill('violet', 'UPTREND UNDER STRESS'), 'Không mở lệnh mới, chỉ quản lý lệnh cũ'],
      ]
    : [
        ['Price &gt; 50MA, &gt; 200MA, 50MA sloping up', pill('up', 'UPTREND'), 'Pullback · Breakout · VCP'],
        ['Price &lt; 50MA, &lt; 200MA, 50MA sloping down', pill('down', 'DOWNTREND'), 'Cash, or short rallies into the 21 EMA'],
        ['Price cutting back and forth across a flat 50MA', pill('gold', 'RANGE'), 'Mean reversion only'],
        ['50MA &gt; 200MA but price &lt; 50MA', pill('violet', 'UPTREND UNDER STRESS'), 'No new positions, manage the open ones'],
      ];

  const code = vi
    ? `# Pseudocode — chạy mỗi tối, in ra 1 dòng
slope50 = (MA50[0] / MA50[-10] - 1) * 100

if   close &gt; MA50 and close &gt; MA200 and slope50 &gt;  0.5: regime = "UPTREND"
elif close &lt; MA50 and close &lt; MA200 and slope50 &lt; -0.5: regime = "DOWNTREND"
elif MA50 &gt; MA200 and close &lt; MA50:              regime = "UPTREND_UNDER_STRESS"
else:                                            regime = "RANGE"`
    : `# Pseudocode — run every evening, print one line
slope50 = (MA50[0] / MA50[-10] - 1) * 100

if   close &gt; MA50 and close &gt; MA200 and slope50 &gt;  0.5: regime = "UPTREND"
elif close &lt; MA50 and close &lt; MA200 and slope50 &lt; -0.5: regime = "DOWNTREND"
elif MA50 &gt; MA200 and close &lt; MA50:              regime = "UPTREND_UNDER_STRESS"
else:                                            regime = "RANGE"`;

  return sec(
    'regime',
    '02',
    vi ? 'Tầng 1 — Xác định Market Regime' : 'Layer 1 — Identify the market regime',
    vi
      ? 'Làm việc này trước khi nhìn bất kỳ cổ phiếu nào. Mục tiêu là biến nó thành <b>phép tính máy móc</b>, không phải cảm nhận.'
      : 'Do this before looking at a single stock. The goal is to make it a <b>mechanical calculation</b>, not a feeling.',
    h4(vi ? 'Ba câu hỏi, theo đúng thứ tự' : 'Three questions, in this order') +
      grid(3, ...qs.map(([tone, t, body]) => card(`<b class="swp-q swp-p-${tone}">${t}</b><p class="swp-p">${body}</p>`))) +
      h4(vi ? 'Bốn trạng thái — định nghĩa khách quan' : 'Four states — objective definitions') +
      table(
        vi
          ? ['Điều kiện trên SPY (khung ngày)', 'Regime', 'Playbook được mở']
          : ['Condition on SPY (daily)', 'Regime', 'Playbook unlocked'],
        rows,
      ) +
      callout(
        'note',
        vi ? 'Độ dốc quan trọng hơn vị trí cắt nhau' : 'Slope matters more than the crossover',
        vi
          ? 'Một đường 50MA đi ngang với giá dao động quanh nó là <b>range</b>, kể cả khi 50MA đang nằm trên 200MA. Lượng hóa độ dốc để không phải phán đoán: so <b>50MA hôm nay với 50MA của 10 phiên trước</b> — trên +0,5% là dốc lên, dưới −0,5% là dốc xuống, ở giữa là đi ngang.'
          : 'A flat 50MA with price oscillating around it is a <b>range</b>, even when the 50MA sits above the 200MA. Quantify the slope so you never have to judge it: compare <b>today\'s 50MA against the 50MA ten sessions ago</b> — above +0.5% is up, below −0.5% is down, anything between is flat.',
      ) +
      regimeFigure(lang) +
      pre(code),
  );
}

// ── 03 · volatility state ───────────────────────────────────────────────────

function s03(lang: Lang): string {
  const vi = lang === 'vi';
  return sec(
    'vol',
    '03',
    vi ? 'Trạng thái biến động — núm chỉnh size' : 'Volatility state — the size dial',
    vi
      ? 'Đây <b>không phải</b> tín hiệu hướng đi. Nó chỉ trả lời một câu: cùng mức rủi ro 1%, hôm nay tôi được mua bao nhiêu cổ phiếu?'
      : 'This is <b>not</b> a directional signal. It answers exactly one question: at the same 1% risk, how many shares do I get today?',
    table(
      vi
        ? ['ATR% so với trung bình 100 phiên của chính nó', 'Trạng thái', 'Hành động']
        : ['ATR% vs its own 100-session average', 'State', 'Action'],
      vi
        ? [
            ['<span class="swp-mono">&lt; 0.8×</span>', pill('blue', 'CO HẸP'), 'Ưu tiên setup breakout, size chuẩn'],
            ['<span class="swp-mono">0.8× – 1.3×</span>', pill('up', 'BÌNH THƯỜNG'), 'Toàn bộ playbook, size chuẩn'],
            ['<span class="swp-mono">&gt; 1.3×</span>', pill('down', 'NỞ RỘNG'), 'Nửa size, stop rộng hơn, ít vị thế hơn'],
          ]
        : [
            ['<span class="swp-mono">&lt; 0.8×</span>', pill('blue', 'CONTRACTED'), 'Favour breakouts, standard size'],
            ['<span class="swp-mono">0.8× – 1.3×</span>', pill('up', 'NORMAL'), 'Whole playbook, standard size'],
            ['<span class="swp-mono">&gt; 1.3×</span>', pill('down', 'EXPANDED'), 'Half size, wider stops, fewer positions'],
          ],
    ) +
      callout(
        'good',
        vi ? 'Hiểu đúng' : 'Read this correctly',
        vi
          ? 'Biến động cao <b>không có nghĩa là "đừng giao dịch"</b>. Nó có nghĩa là cùng 1% rủi ro giờ đòi hỏi số lượng cổ phiếu ít hơn, vì stop của anh phải đặt xa hơn. Người mới thường giữ nguyên số lượng cổ phiếu và vô tình tăng gấp đôi rủi ro thật.'
          : 'High volatility does <b>not</b> mean "do not trade". It means the same 1% of risk now buys fewer shares, because your stop has to sit further away. Beginners keep the share count and accidentally double their real risk.',
      ) +
      volFigure(lang),
  );
}

// ── 04 · breadth ────────────────────────────────────────────────────────────

function s04(lang: Lang): string {
  const vi = lang === 'vi';
  const line = vi
    ? `2026-09-25 | UPTREND | Vol: NORMAL | Breadth: 58% &gt; 200MA | DistDays: 2
→ Playbook: pullback + breakout | Size: FULL | Tối đa 4 vị thế`
    : `2026-09-25 | UPTREND | Vol: NORMAL | Breadth: 58% &gt; 200MA | DistDays: 2
→ Playbook: pullback + breakout | Size: FULL | Max 4 positions`;

  return sec(
    'breadth',
    '04',
    vi ? 'Độ rộng thị trường — cảnh báo sớm' : 'Market breadth — the early warning',
    vi
      ? 'Bước hay bị bỏ qua nhất, nhưng lại là thứ báo động <b>trước khi chỉ số báo động</b>.'
      : 'The most-skipped step, and the one that warns you <b>before the index does</b>.',
    grid(
      2,
      card(
        h4(vi ? '% cổ phiếu trên 200MA' : '% of stocks above their 200MA') +
          (vi
            ? `<p class="swp-p">${pill('up', '&gt; 60%')} độ rộng lành mạnh — breakout có tỷ lệ thành công tốt.</p>
               <p class="swp-p">${pill('down', '&lt; 40%')} chỉ số đang được gánh bởi vài mã lớn. Breakout sẽ thất bại nhiều hơn <b>dù SPY nhìn vẫn đẹp</b>.</p>`
            : `<p class="swp-p">${pill('up', '&gt; 60%')} healthy breadth — breakouts have a decent hit rate.</p>
               <p class="swp-p">${pill('down', '&lt; 40%')} the index is being carried by a handful of megacaps. Breakouts will fail more often <b>even while SPY still looks fine</b>.</p>`),
      ),
      card(
        h4(vi ? 'Ngày phân phối (Distribution Day)' : 'Distribution days') +
          (vi
            ? `<p class="swp-p">Phiên chỉ số <b>giảm</b> với volume <b>cao hơn</b> hôm trước = tổ chức đang bán.</p>
               <p class="swp-p">Đếm trong 4 tuần gần nhất. <b>4–5 ngày trở lên là cảnh báo regime sắp đổi</b> — thường đến sớm hơn tín hiệu thủng 50MA.</p>`
            : `<p class="swp-p">A session where the index <b>falls</b> on <b>higher</b> volume than the day before = institutions selling.</p>
               <p class="swp-p">Count them over the last four weeks. <b>Four to five or more warns that the regime is about to change</b> — usually earlier than a 50MA break does.</p>`),
      ),
    ) +
      callout(
        'info',
        vi ? 'Nên thêm vào script buổi tối' : 'Worth adding to the evening script',
        vi
          ? 'Đếm ngày phân phối là <b>chỉ báo sớm</b>, khác hẳn với đường trung bình vốn luôn trễ. Nó cho anh lý do để thu nhỏ size <i>trước khi</i> biểu đồ SPY xác nhận có vấn đề.'
          : 'Counting distribution days is a <b>leading</b> indicator, unlike a moving average, which is always late. It gives you a reason to cut size <i>before</i> the SPY chart confirms there is a problem.',
      ) +
      h4(vi ? 'Kết quả cuối cùng — một dòng trong nhật ký' : 'The output — one line in the journal') +
      pre(line) +
      callout(
        'bad',
        vi ? 'Luật kỷ luật' : 'The discipline rule',
        vi
          ? 'Nếu anh không viết được dòng này một cách tự tin, <b>anh không giao dịch ngày mai</b>. Đó chính là giá trị thật mà bước xác định regime mang lại.'
          : 'If you cannot write that line with confidence, <b>you do not trade tomorrow</b>. That is the real value the regime step delivers.',
      ) +
      callout(
        'note',
        vi ? 'Cần trung thực' : 'Being honest about it',
        vi
          ? 'Phân loại regime <b>trễ theo thiết kế</b>. Anh sẽ bị whipsaw ở các điểm đảo chiều — đó là cái giá của sự khách quan, và nó rẻ hơn nhiều so với việc đoán đỉnh đoán đáy. <b>Đừng tinh chỉnh tham số để triệt tiêu whipsaw</b>, anh chỉ đang overfit vào hai năm dữ liệu gần nhất.'
          : 'Regime classification is <b>late by design</b>. You will be whipsawed at turning points — that is the price of objectivity, and it is far cheaper than guessing tops and bottoms. <b>Do not tune the parameters until the whipsaws disappear</b>; you are only overfitting the last two years of data.',
      ),
  );
}

// ── 05 · leading sector ─────────────────────────────────────────────────────

function s05(lang: Lang): string {
  const vi = lang === 'vi';
  return sec(
    'sector',
    '05',
    vi ? 'Tầng 2 — Sector dẫn dắt' : 'Layer 2 — The leading sector',
    (vi
      ? 'Dùng 11 sector ETF của Mỹ làm thước đo khách quan: '
      : 'Use the 11 US sector ETFs as an objective yardstick: ') +
      '<span class="swp-mono">XLK XLF XLE XLV XLI XLY XLP XLU XLB XLRE XLC</span>',
    table(
      vi ? ['Tiêu chí', 'Cách đo', 'Ý nghĩa'] : ['Criterion', 'How to measure', 'What it means'],
      vi
        ? [
            ['<strong>Sức mạnh tương đối</strong>', 'Tỷ số ETF/SPY đang tạo đỉnh cao hơn?', 'Tiền chảy vào nhóm này nhanh hơn thị trường chung'],
            ['<strong>Đa khung thời gian</strong>', 'Xếp hạng lợi nhuận 21 / 63 / 126 phiên', 'Mạnh ở cả ba khung = xu hướng thật, không phải nhịp bật'],
            ['<strong>Cấu trúc kỹ thuật</strong>', 'ETF trên 50MA &amp; 21EMA, 50MA dốc lên', 'Xác nhận xu hướng nhóm còn nguyên vẹn'],
          ]
        : [
            ['<strong>Relative strength</strong>', 'Is the ETF/SPY ratio making higher highs?', 'Money is entering this group faster than the broad market'],
            ['<strong>Multi-timeframe</strong>', 'Rank returns over 21 / 63 / 126 sessions', 'Strong on all three = a real trend, not a bounce'],
            ['<strong>Technical structure</strong>', 'ETF above its 50MA &amp; 21EMA, 50MA sloping up', 'Confirms the group trend is still intact'],
          ],
    ) +
      `<p class="swp-p"><b>${vi ? 'Luật thực hành:' : 'The working rule:'}</b> ${
        vi
          ? 'chỉ tìm cổ phiếu trong <b>top 3 sector</b>. Một cổ phiếu mạnh nằm trong sector yếu phải bơi ngược dòng — nó vẫn có thể thắng, nhưng xác suất thấp hơn và anh không cần nó khi đang có hàng trăm lựa chọn ở nhóm dẫn dắt.'
          : 'only hunt for stocks inside the <b>top 3 sectors</b>. A strong stock in a weak sector is swimming upstream — it can still win, but the odds are worse, and you do not need it when there are hundreds of candidates in the leading groups.'
      }</p>` +
      callout(
        'good',
        vi ? 'Điểm tinh tế quan trọng nhất' : 'The most important subtlety',
        vi
          ? 'Phân biệt <i>sector đang mạnh nhất</i> với <i>sector vừa bắt đầu mạnh lên</i>. Nhóm mới lọt vào top (ví dụ từ hạng 8 lên hạng 3 trong 4 tuần) thường cho breakout sạch hơn nhóm đã dẫn dắt 6 tháng — vì ở nhóm dẫn dắt lâu, nhiều mã đã đi quá xa vùng tham chiếu, buộc stop phải đặt rộng. <b>Hãy theo dõi sự thay đổi thứ hạng, không chỉ thứ hạng.</b>'
          : 'Separate <i>the strongest sector</i> from <i>the sector that has just started getting stronger</i>. A group that has newly climbed into the top (say rank 8 to rank 3 in four weeks) usually gives cleaner breakouts than one that has led for six months — in a long-standing leader, many names have run far from any reference level, which forces the stop wide. <b>Track the change in rank, not just the rank.</b>',
      ) +
      rotationFigure(lang) +
      callout(
        'bad',
        vi ? '⚠️ Tín hiệu cảnh báo miễn phí' : '⚠️ A free warning signal',
        vi
          ? 'Khi <b>XLP</b> (hàng tiêu dùng thiết yếu) và <b>XLU</b> (tiện ích) bất ngờ lọt vào top 3, tiền đang tìm chỗ trú ẩn. Chỉ số có thể vẫn đang tạo đỉnh mới, nhưng đó là lúc thu hẹp size — trước khi biểu đồ SPY báo cho anh biết.'
          : 'When <b>XLP</b> (consumer staples) and <b>XLU</b> (utilities) suddenly appear in the top 3, money is looking for shelter. The index may still be printing new highs, but that is the moment to cut size — before the SPY chart tells you to.',
      ),
  );
}

// ── 06 · in-play stocks ─────────────────────────────────────────────────────

function s06(lang: Lang): string {
  const vi = lang === 'vi';
  const m = (s: string) => `<span class="swp-mono">${s}</span>`;
  return sec(
    'inplay',
    '06',
    vi ? 'Tầng 3 — Cổ phiếu In-Play' : 'Layer 3 — In-play stocks',
    vi
      ? '"In-play" nghĩa là <b>có lý do để nó chuyển động hôm nay</b> — không phải cổ phiếu tốt nói chung, mà cổ phiếu đang được thị trường chú ý.'
      : '"In-play" means <b>there is a reason for it to move today</b> — not a good company in general, but a stock the market is currently paying attention to.',
    h4(vi ? 'Bộ lọc định lượng (bắt buộc)' : 'Quantitative filters (mandatory)') +
      table(
        vi ? ['Chỉ số', 'Ngưỡng khởi đầu', 'Tại sao'] : ['Metric', 'Starting threshold', 'Why'],
        vi
          ? [
              ['<strong>Relative Volume</strong>', m('&gt; 1.5× TB 50 phiên'), 'Dòng tiền bất thường = có người quan tâm thật'],
              ['<strong>Thanh khoản</strong>', m('&gt; 20 triệu USD/phiên'), 'Vào/ra được, spread không ăn mòn lợi nhuận'],
              ['<strong>Giá</strong>', m('&gt; 10 USD'), 'Dưới mức này biến động do spread, không do cung cầu'],
              ['<strong>ATR%</strong>', m('2% – 6%'), 'Dưới 2% không đủ biên độ đạt 3R; trên 6% stop phải quá rộng'],
              ['<strong>RS vs SPY</strong>', m('Dương ở cả 21d &amp; 63d'), 'Mạnh hơn thị trường <i>trước</i> khi anh mua, không phải sau'],
              ['<strong>Khoảng cách đỉnh 52 tuần</strong>', m('Trong 15%'), 'Còn là leader, chưa bị bỏ lại'],
            ]
          : [
              ['<strong>Relative volume</strong>', m('&gt; 1.5× the 50-day average'), 'Unusual flow = somebody actually cares'],
              ['<strong>Liquidity</strong>', m('&gt; USD 20M per session'), 'You can get in and out; the spread does not eat the edge'],
              ['<strong>Price</strong>', m('&gt; USD 10'), 'Below this, moves come from the spread, not supply and demand'],
              ['<strong>ATR%</strong>', m('2% – 6%'), 'Under 2% there is no room to reach 3R; over 6% the stop has to be too wide'],
              ['<strong>RS vs SPY</strong>', m('Positive on both 21d &amp; 63d'), 'Stronger than the market <i>before</i> you buy, not after'],
              ['<strong>Distance from the 52-week high</strong>', m('Within 15%'), 'Still a leader, not yet left behind'],
            ],
      ) +
      h4(vi ? 'Chất xúc tác (định tính)' : 'Catalysts (qualitative)') +
      grid(
        2,
        card(
          ul(
            vi
              ? [
                  'Báo cáo lợi nhuận vượt kỳ vọng — đặc biệt là <b>gap tăng rồi giữ được vùng gap</b>',
                  'Nâng hạng khuyến nghị, nâng dự báo (guidance)',
                ]
              : [
                  'An earnings beat — especially a <b>gap up that then holds the gap</b>',
                  'An analyst upgrade or raised guidance',
                ],
          ),
        ),
        card(
          ul(
            vi
              ? ['Tin ngành: giá hàng hóa, chính sách, quy định mới', 'Thuộc nhóm dẫn dắt <b>vừa được dòng tiền xoay vào</b>']
              : ['Industry news: commodity prices, policy, new regulation', 'Membership in a leading group that money has <b>just rotated into</b>'],
          ),
        ),
      ) +
      callout(
        'note',
        vi ? 'Luật lọc nhanh 5 giây' : 'The five-second filter',
        vi
          ? 'Nếu anh không nói được <b>một câu</b> tại sao cổ phiếu này đang chuyển động, thì nó không in-play. <b>"Biểu đồ đẹp" không phải là lý do.</b>'
          : 'If you cannot say in <b>one sentence</b> why this stock is moving, it is not in play. <b>"Nice chart" is not a reason.</b>',
      ) +
      callout(
        'bad',
        vi ? 'Bẫy penny stock' : 'The penny-stock trap',
        vi
          ? 'Nếu anh quét "cổ phiếu tăng mạnh nhất theo %", kết quả sẽ gần như toàn hàng rác giá thấp — vì từ $0,80 lên $0,95 là +19%. Chúng không giao dịch được: spread rộng, không có tổ chức tham gia, rủi ro gap lớn. <b>Sàng lọc phải bắt đầu bằng giá và thanh khoản, không bao giờ bằng % tăng.</b>'
          : 'Scan for "biggest percentage gainers" and the result is almost entirely low-priced junk — $0.80 to $0.95 is +19%. They are untradeable: wide spreads, no institutional participation, large gap risk. <b>Screening starts with price and liquidity, never with percentage gain.</b>',
      ) +
      h4(vi ? 'Ghép loại cổ phiếu với regime' : 'Matching stock type to regime') +
      table(
        vi ? ['Regime', 'Sector nên tìm', 'Loại cổ phiếu', 'Tránh'] : ['Regime', 'Sectors to hunt', 'Stock type', 'Avoid'],
        vi
          ? [
              [pill('up', 'Uptrend · vol thấp'), 'XLK, XLY, XLC (tăng trưởng)', 'Leader gần đỉnh 52T, nền chặt', 'Cổ phiếu phòng thủ (không chạy)'],
              [pill('blue', 'Uptrend · vol cao'), 'Nhóm dẫn dắt, nhưng nửa size', 'Thanh khoản lớn, ATR vừa phải', 'Small-cap, ATR &gt; 6%'],
              [pill('gold', 'Range'), 'Các sector luân phiên nhau', 'Mã dao động trong biên rõ ràng', 'Breakout — tỷ lệ thất bại rất cao'],
              [pill('violet', 'Under stress'), 'XLP, XLU, XLV nổi lên = cảnh báo', 'Không vào mới, quản lý lệnh cũ', 'Mọi thứ'],
              [pill('down', 'Downtrend'), 'Phòng thủ dẫn dắt', 'Tiền mặt, hoặc short nhịp hồi yếu', 'Bắt đáy cổ phiếu tăng trưởng'],
            ]
          : [
              [pill('up', 'Uptrend · low vol'), 'XLK, XLY, XLC (growth)', 'Leaders near 52w highs, tight bases', 'Defensives (they will not move)'],
              [pill('blue', 'Uptrend · high vol'), 'Leading groups, but at half size', 'Large liquidity, moderate ATR', 'Small caps, ATR &gt; 6%'],
              [pill('gold', 'Range'), 'Sectors taking turns', 'Names oscillating in a clear band', 'Breakouts — the failure rate is very high'],
              [pill('violet', 'Under stress'), 'XLP, XLU, XLV rising = a warning', 'Nothing new; manage what is open', 'Everything'],
              [pill('down', 'Downtrend'), 'Defensives leading', 'Cash, or short weak rallies', 'Bottom-fishing broken growth names'],
            ],
      ),
  );
}

// ── 07 · the playbook itself (tabbed) ───────────────────────────────────────

function s07(lang: Lang): string {
  const vi = lang === 'vi';

  const tabs: [string, string][] = vi
    ? [
        ['up', 'Uptrend'],
        ['volatile', 'Uptrend · Vol cao'],
        ['range', 'Range'],
        ['stress', 'Under Stress'],
        ['down', 'Downtrend'],
      ]
    : [
        ['up', 'Uptrend'],
        ['volatile', 'Uptrend · high vol'],
        ['range', 'Range'],
        ['stress', 'Under stress'],
        ['down', 'Downtrend'],
      ];

  const banner = (tone: string, icon: string, title: string, body: string) =>
    `<div class="swp-banner swp-b-${tone}"><div class="swp-banner-i">${icon}</div><div class="swp-banner-b"><b>${title}</b><span>${body}</span></div></div>`;

  const play = (title: string, tag: string, tone: 'up' | 'blue' | 'gold' | 'down', body: string) =>
    `<div class="swp-play"><div class="swp-play-h"><b>${title}</b>${pill(tone, tag)}</div><div class="swp-play-b">${body}</div></div>`;

  // ---- Uptrend --------------------------------------------------------------
  const pUp =
    banner(
      'up',
      '📈',
      vi ? 'UPTREND · Biến động bình thường' : 'UPTREND · normal volatility',
      vi
        ? 'Giá &gt; 50MA &gt; 200MA · 50MA dốc lên · Đây là môi trường kiếm tiền chính. Size đầy đủ, tối đa 4–5 vị thế.'
        : 'Price &gt; 50MA &gt; 200MA · 50MA sloping up · This is the primary money-making environment. Full size, up to 4–5 positions.',
    ) +
    play(
      vi ? 'Setup 1 · Pullback trong xu hướng tăng' : 'Setup 1 · Pullback in an uptrend',
      vi ? 'XÁC SUẤT CAO NHẤT' : 'HIGHEST PROBABILITY',
      'up',
      `<p class="swp-p"><b>${vi ? 'Tại sao setup này tốt nhất:' : 'Why this one is the best:'}</b> ${
        vi
          ? 'anh đứng cùng phía với xu hướng (được xác suất), nhưng mua ở điểm đám đông vừa nản (được giá tốt). Hầu hết setup khác chỉ có một trong hai thứ đó.'
          : 'you are on the same side as the trend (you get the probability) but buying where the crowd has just given up (you get the price). Most other setups give you only one of the two.'
      }</p>` +
        figure({
          title: vi ? 'Cấu trúc điển hình' : 'The typical structure',
          caption: vi
            ? 'Xu hướng tăng → điều chỉnh 3–5 phiên với <b>volume cạn dần</b> (cột xám) → nến đảo chiều tại 21 EMA kèm volume nở → mua khi vượt đỉnh nến tín hiệu ở phiên kế tiếp.'
            : 'Uptrend → a 3–5 session pullback on <b>drying volume</b> (the grey bars) → a reversal bar at the 21 EMA with volume expanding → buy above the signal bar\'s high the next session.',
          body: pullbackChart(lang),
          legend: [
            { color: 'var(--blue)', text: '10 EMA' },
            { color: 'var(--warn)', text: '21 EMA' },
            { color: 'color-mix(in srgb, var(--faint) 32%, transparent)', text: vi ? 'Volume cạn' : 'Volume drying' },
            { color: 'var(--accent)', text: vi ? 'Volume nở' : 'Volume expanding' },
          ],
        }) +
        spec(
          vi
            ? [
                ['Vào lệnh', '<b>Mua khi giá vượt đỉnh của nến đảo chiều</b> tại 10/21 EMA. <i>Tại sao:</i> chờ nến xác nhận = chờ người bán cạn lực; vượt đỉnh nến = người mua đã thực sự giành lại quyền kiểm soát.'],
                ['Điều kiện', 'Volume <b>giảm dần</b> trong lúc điều chỉnh. <i>Tại sao:</i> volume thấp = không có bán tháo thật, chỉ là thiếu người mua tạm thời. Volume cao khi giảm = phân phối, phải tránh dù mẫu hình đẹp.'],
                ['Stop', '<b>Dưới đáy pullback.</b> <i>Tại sao:</i> đáy đó là nơi người mua đã bảo vệ. Thủng = cấu trúc higher-low gãy = lý do vào lệnh biến mất.'],
                ['Chốt 1', 'Bán <b>1/2 tại 2R</b>. <i>Tại sao:</i> đưa lệnh về trạng thái không rủi ro, giảm áp lực tâm lý để giữ phần còn lại.'],
                ['Chốt 2', '<b>Trail dưới 21 EMA</b>, thoát khi <b>đóng cửa</b> dưới. <i>Tại sao:</i> 21 EMA là "nhịp thở" của xu hướng; đóng cửa dưới nó = nhịp đã đổi, không phải nhiễu trong phiên.'],
              ]
            : [
                ['Entry', '<b>Buy above the high of the reversal bar</b> at the 10/21 EMA. <i>Why:</i> waiting for a confirming bar means waiting for sellers to run out; taking out its high means buyers have actually taken control back.'],
                ['Condition', 'Volume <b>declining</b> through the pullback. <i>Why:</i> low volume means there is no real selling, just a temporary absence of buyers. High volume on the way down is distribution — avoid it however pretty the pattern is.'],
                ['Stop', '<b>Below the pullback low.</b> <i>Why:</i> that low is where buyers defended. Break it and the higher-low structure is gone, which is the reason you took the trade.'],
                ['First target', 'Sell <b>half at 2R</b>. <i>Why:</i> it takes the trade to risk-free and removes the psychological pressure that would otherwise make you close the rest early.'],
                ['Second target', '<b>Trail below the 21 EMA</b> and exit on a <b>close</b> below it. <i>Why:</i> the 21 EMA is the trend\'s breathing rhythm; a close below it means the rhythm changed, not that there was intraday noise.'],
              ],
        ),
    ) +
    play(
      vi ? 'Setup 2 · Breakout khỏi nền tích lũy' : 'Setup 2 · Breakout from a base',
      vi ? 'CẦN VOLUME XÁC NHẬN' : 'NEEDS VOLUME CONFIRMATION',
      'blue',
      figure({
        title: vi ? 'Cấu trúc điển hình' : 'The typical structure',
        caption: vi
          ? 'Nền 2–8 tuần, biên độ thu hẹp dần, volume cạn kiệt → phiên phá kháng cự với <b>volume &gt; 1,5× trung bình 50 phiên</b>. Mục tiêu = chiều cao nền cộng từ điểm phá (measured move).'
          : 'A 2–8 week base, range tightening, volume drying up → a session that clears resistance on <b>volume &gt; 1.5× the 50-day average</b>. Target = the base height projected from the breakout (measured move).',
        body: breakoutChart(lang),
      }) +
        spec(
          vi
            ? [
                ['Vào lệnh', 'Mua khi <b>phá kháng cự kèm volume &gt; 1,5× TB50</b>. <i>Tại sao:</i> volume là bằng chứng có dòng tiền tổ chức. Breakout volume thấp = không ai bảo vệ mức giá mới, dễ thất bại.'],
                ['Điều kiện', 'Nền 2–8 tuần, biên độ hẹp dần. <i>Tại sao:</i> biên độ hẹp = người bán đã hết hàng. Nén càng chặt, bung càng mạnh.'],
                ['Stop', 'Dưới mức breakout, hoặc dưới đáy nến breakout. <i>Tại sao:</i> breakout thật thì không quay lại dưới điểm phá. Quay lại = bẫy.'],
                ['Thoát khi sai', '<b>Thoát NGAY nếu giá đóng cửa trở lại trong nền.</b> Đây là tín hiệu rõ nhất của false breakout — đừng "cho nó thêm thời gian".'],
                ['Chốt lời', 'Measured move, hoặc <b>trail 10 EMA</b> (không phải 21). <i>Tại sao:</i> breakout thường chạy nhanh rồi hụt hơi; EMA nhanh hơn giữ được nhiều lợi nhuận hơn trước khi nó trả lại.'],
              ]
            : [
                ['Entry', 'Buy the <b>break of resistance on volume &gt; 1.5× the 50-day average</b>. <i>Why:</i> volume is the evidence of institutional flow. A low-volume breakout means nobody is defending the new level, and it fails easily.'],
                ['Condition', 'A 2–8 week base with a tightening range. <i>Why:</i> a narrow range means sellers are out of stock. The tighter the compression, the stronger the expansion.'],
                ['Stop', 'Below the breakout level, or below the low of the breakout bar. <i>Why:</i> a real breakout does not go back under the pivot. Going back under means it was a trap.'],
                ['Invalidation', '<b>Exit IMMEDIATELY if price closes back inside the base.</b> This is the clearest false-breakout signal there is — do not "give it more time".'],
                ['Profit', 'The measured move, or <b>trail the 10 EMA</b> (not the 21). <i>Why:</i> breakouts tend to run fast and then stall; the faster EMA keeps more of the gain before it is handed back.'],
              ],
        ),
    ) +
    play(
      vi ? 'Setup 3 · VCP — Nén biến động' : 'Setup 3 · VCP — volatility contraction',
      vi ? 'R-MULTIPLE LỚN NHẤT' : 'LARGEST R-MULTIPLE',
      'gold',
      figure({
        title: vi ? 'Cấu trúc điển hình' : 'The typical structure',
        caption: vi
          ? 'Các đợt điều chỉnh <b>thu hẹp dần</b>: 10% → 7% → 5% → 3%. Mỗi đợt nông hơn nghĩa là người bán yếu hơn. Volume cạn kiệt ở đợt nén cuối — dấu vết của việc đổi chủ từ tay yếu sang tay mạnh.'
          : 'Successive contractions <b>getting shallower</b>: 10% → 7% → 5% → 3%. Each shallower leg means weaker sellers. Volume dries up completely in the final contraction — the footprint of stock moving from weak hands to strong.',
        body: vcpChart(lang),
      }) +
        spec(
          vi
            ? [
                ['Vào lệnh', 'Mua tại <b>pivot</b> khi giá phá đỉnh của đợt nén cuối, volume nở.'],
                ['Điều kiện', 'Volume <b>cạn kiệt</b> ở đợt nén cuối. <i>Lưu ý ngược với setup breakout:</i> ở đây luận điểm là "không còn ai muốn bán ở giá này", không phải "có người mua mạnh".'],
                ['Stop', 'Dưới đáy đợt nén cuối cùng — thường <b>rất hẹp, chỉ 3–5%</b>. <i>Tại sao quan trọng:</i> chính vì stop hẹp nên R-multiple của VCP rất lớn. Đó là toàn bộ sức hấp dẫn của mẫu hình này.'],
                ['Thoát khi sai', 'Giá rơi lại vào trong nền = quá trình tích lũy chưa xong, cần thêm thời gian.'],
                ['Chốt lời', 'Trail dưới 10/21 EMA.'],
              ]
            : [
                ['Entry', 'Buy at the <b>pivot</b>, when price clears the high of the final contraction on expanding volume.'],
                ['Condition', 'Volume <b>completely dried up</b> in the last contraction. <i>Note this is the opposite of the breakout setup:</i> here the thesis is "nobody wants to sell at this price any more", not "there is a strong buyer".'],
                ['Stop', 'Below the low of the final contraction — typically <b>very tight, only 3–5%</b>. <i>Why it matters:</i> the tight stop is exactly why a VCP has such a large R-multiple. That is the entire appeal of the pattern.'],
                ['Invalidation', 'Price falling back into the base means the accumulation is not finished and needs more time.'],
                ['Profit', 'Trail below the 10/21 EMA.'],
              ],
        ),
    );

  // ---- Volatile uptrend ----------------------------------------------------
  const pVol =
    banner(
      'vol',
      '⚡',
      vi ? 'UPTREND · Biến động nở rộng (ATR &gt; 1.3×)' : 'UPTREND · expanded volatility (ATR &gt; 1.3×)',
      vi
        ? 'Xu hướng còn nguyên nhưng biên độ dao động lớn. Playbook không đổi — <b>cách thực thi đổi</b>.'
        : 'The trend is intact but the swings are large. The playbook does not change — <b>the execution does</b>.',
    ) +
    grid(
      2,
      card(
        `<h4 class="swp-h4 swp-p-up">${vi ? '✓ Điều chỉnh' : '✓ Adjust'}</h4>` +
          ul(
            vi
              ? [
                  '<b>Nửa size</b> cho mọi lệnh',
                  'Tối đa <b>2–3 vị thế</b> thay vì 4–5',
                  'Stop tính theo <b>bội số ATR</b>, không theo % cố định',
                  'Chỉ chọn mã thanh khoản lớn',
                  'Chốt 1/2 sớm hơn, tại <b>1,5R</b> thay vì 2R',
                ]
              : [
                  '<b>Half size</b> on everything',
                  'At most <b>2–3 positions</b> instead of 4–5',
                  'Stops as a <b>multiple of ATR</b>, not a fixed percentage',
                  'Only large-liquidity names',
                  'Take the first half earlier, at <b>1.5R</b> instead of 2R',
                ],
          ),
      ),
      card(
        `<h4 class="swp-h4 swp-p-down">${vi ? '✗ Tránh' : '✗ Avoid'}</h4>` +
          ul(
            vi
              ? [
                  'Mã có ATR% &gt; 6% — stop sẽ quá xa',
                  'Small-cap, mã thanh khoản mỏng',
                  'Nới stop để "chịu được biến động" — đó là tăng rủi ro trá hình',
                  'Giữ nhiều vị thế cùng một sector',
                ]
              : [
                  'Names with ATR% &gt; 6% — the stop ends up too far away',
                  'Small caps and thin liquidity',
                  'Widening the stop to "survive the volatility" — that is a risk increase in disguise',
                  'Several positions in the same sector',
                ],
          ),
      ),
    ) +
    callout(
      'note',
      vi ? 'Sai lầm kinh điển ở môi trường này' : 'The classic mistake in this environment',
      vi
        ? 'Giữ nguyên số lượng cổ phiếu như lúc biến động thấp, rồi nới stop ra cho "khỏi bị quét". Kết quả: rủi ro thật tăng gấp đôi hoặc gấp ba trong khi anh tưởng mình vẫn rủi ro 1%. <b>Stop rộng hơn bắt buộc phải đi kèm số lượng cổ phiếu ít hơn.</b>'
        : 'Keeping the same share count as in a quiet tape, then widening the stop so it "does not get hit". The result: real risk doubles or triples while you still believe you are risking 1%. <b>A wider stop obliges a smaller share count.</b>',
    );

  // ---- Range --------------------------------------------------------------
  const pRange =
    banner(
      'range',
      '↔️',
      vi ? 'RANGE · Thị trường đi ngang' : 'RANGE · a sideways market',
      vi
        ? '50MA đi ngang, giá cắt qua lại. <b>Breakout có tỷ lệ thất bại rất cao ở đây.</b> Chỉ dùng mean reversion, kỳ vọng thấp, kỳ giữ ngắn.'
        : 'A flat 50MA with price cutting back and forth. <b>Breakouts have a very high failure rate here.</b> Mean reversion only, modest expectations, short holds.',
    ) +
    play(
      vi ? 'Setup 4 · Mean Reversion' : 'Setup 4 · Mean reversion',
      vi ? 'CHỈ DÙNG TRONG RANGE' : 'RANGE ONLY',
      'gold',
      figure({
        title: vi ? 'Cấu trúc điển hình' : 'The typical structure',
        caption: vi
          ? 'Giá chạm <b>biên dưới của range</b>, RSI &lt; 30, xuất hiện nến đảo chiều có bóng dưới dài → mua. Mục tiêu là 20 EMA hoặc giữa biên độ — <b>không phải xu hướng</b>.'
          : 'Price reaches the <b>bottom of the range</b>, RSI &lt; 30, and a reversal bar with a long lower wick appears → buy. The target is the 20 EMA or the middle of the range — <b>not a trend</b>.',
        body: meanRevChart(lang),
      }) +
        spec(
          vi
            ? [
                ['Vào lệnh', 'Cần <b>đủ cả ba</b>: RSI &lt; 30 <b>và</b> nến đảo chiều <b>và</b> giá ở hỗ trợ. <i>Tại sao:</i> RSI đơn lẻ không phải tín hiệu — trong downtrend nó có thể nằm dưới 30 suốt nhiều tuần.'],
                ['Stop', 'Dưới đáy nến tín hiệu. <i>Tại sao:</i> nếu đáy đó thủng thì đây không phải "quá bán", đây là xu hướng giảm.'],
                ['Chốt lời', '<b>20 EMA hoặc giữa biên độ — nhanh, không tham.</b> <i>Tại sao:</i> setup này kiếm tiền từ sự trở lại trung bình, không phải từ xu hướng. Giữ lâu là dùng sai công cụ.'],
                ['Thoát theo thời gian', '<b>Thoát sau 5–7 phiên dù lãi hay lỗ.</b> <i>Tại sao:</i> mean reversion có "hạn sử dụng". Không hồi trong một tuần nghĩa là luận điểm sai.'],
              ]
            : [
                ['Entry', 'You need <b>all three</b>: RSI &lt; 30 <b>and</b> a reversal bar <b>and</b> price at support. <i>Why:</i> RSI alone is not a signal — in a downtrend it can sit below 30 for weeks.'],
                ['Stop', 'Below the low of the signal bar. <i>Why:</i> if that low breaks, this is not "oversold", this is a downtrend.'],
                ['Profit', '<b>The 20 EMA or mid-range — quickly, without getting greedy.</b> <i>Why:</i> this setup makes money from the snap back to the mean, not from a trend. Holding longer is using the wrong tool.'],
                ['Time exit', '<b>Out after 5–7 sessions, win or lose.</b> <i>Why:</i> mean reversion has a shelf life. No bounce within a week means the thesis was wrong.'],
              ],
        ),
    ) +
    callout(
      'bad',
      vi ? 'Tại sao breakout thất bại trong range' : 'Why breakouts fail in a range',
      vi
        ? 'Trong thị trường đi ngang, mỗi lần giá phá biên trên thường là <b>bẫy</b> — không có dòng tiền xu hướng nào đẩy tiếp, và giá quay lại vào nền trong vài phiên. Đây chính là lý do phải xác định regime trước: cùng một mẫu hình breakout cho kết quả hoàn toàn khác nhau ở hai môi trường.'
        : 'In a sideways market, each break of the upper band is usually a <b>trap</b> — there is no trend flow to carry it, and price is back inside within a few sessions. This is exactly why the regime comes first: the identical breakout pattern produces completely different results in the two environments.',
    );

  // ---- Under stress -------------------------------------------------------
  const pStress =
    banner(
      'stress',
      '⚠️',
      'UPTREND UNDER STRESS',
      vi
        ? '50MA vẫn trên 200MA nhưng giá đã thủng 50MA. Đây là vùng xám nguy hiểm nhất — thường bị nhầm là "cơ hội mua giá rẻ".'
        : 'The 50MA is still above the 200MA but price has lost the 50MA. This is the most dangerous grey zone — routinely mistaken for "a chance to buy cheap".',
    ) +
    grid(
      2,
      card(
        `<h4 class="swp-h4 swp-p-gold">${vi ? 'Quy tắc duy nhất' : 'The only rule'}</h4>` +
          ul(
            vi
              ? [
                  '<b>Không mở vị thế mới.</b> Không ngoại lệ.',
                  'Quản lý lệnh đang có: siết stop lên hòa vốn',
                  'Chốt bớt vị thế yếu nhất',
                  'Đếm ngày phân phối mỗi tối',
                  'Theo dõi XLP/XLU có leo vào top 3 không',
                ]
              : [
                  '<b>No new positions.</b> No exceptions.',
                  'Manage what is open: tighten stops to breakeven',
                  'Trim the weakest position',
                  'Count distribution days every evening',
                  'Watch whether XLP/XLU are climbing into the top 3',
                ],
          ),
      ),
      card(
        `<h4 class="swp-h4">${vi ? 'Chờ tín hiệu gì để quay lại' : 'What to wait for before coming back'}</h4>` +
          ul(
            vi
              ? [
                  'Giá lấy lại 50MA và <b>đóng cửa trên</b> 2–3 phiên',
                  'Độ rộng cải thiện (&gt; 50% trên 200MA)',
                  'Sector tăng trưởng quay lại top 3',
                  'Ngày phân phối ngừng tích lũy thêm',
                ]
              : [
                  'Price reclaims the 50MA and <b>closes above it</b> for 2–3 sessions',
                  'Breadth improving (&gt; 50% above their 200MA)',
                  'Growth sectors back in the top 3',
                  'Distribution days stop accumulating',
                ],
          ),
      ),
    ) +
    callout(
      'note',
      vi ? 'Tại sao đây là vùng tốn kém nhất' : 'Why this is the most expensive zone',
      vi
        ? 'Mọi setup vẫn <i>trông</i> giống hệt lúc uptrend: vẫn có pullback về MA, vẫn có nến đảo chiều đẹp. Khác biệt duy nhất nằm ở <b>xác suất nền</b> — tỷ lệ thất bại tăng rõ rệt khi chỉ số mất 50MA. Đó là lý do bộ lọc regime phải nằm <i>trước</i> bộ lọc mẫu hình, chứ không phải ngược lại.'
        : 'Every setup still <i>looks</i> exactly like it did in the uptrend: pullbacks to the MA, handsome reversal bars. The only difference is the <b>base rate</b> — the failure rate rises markedly once the index loses its 50MA. That is why the regime filter sits <i>before</i> the pattern filter, and not the other way round.',
    );

  // ---- Downtrend ----------------------------------------------------------
  const pDown =
    banner(
      'down',
      '📉',
      'DOWNTREND',
      vi
        ? 'Giá &lt; 50MA &lt; 200MA, 50MA dốc xuống. <b>Tiền mặt cũng là một vị thế.</b> Đây là lúc nghiên cứu và backtest, không phải lúc giao dịch.'
        : 'Price &lt; 50MA &lt; 200MA, 50MA sloping down. <b>Cash is a position too.</b> This is time for research and backtests, not for trading.',
    ) +
    grid(
      2,
      card(
        `<h4 class="swp-h4 swp-p-up">${vi ? 'Lựa chọn A — Đứng ngoài' : 'Option A — stand aside'} ${pill('up', vi ? 'KHUYẾN NGHỊ' : 'RECOMMENDED')}</h4>` +
          `<p class="swp-p">${
            vi
              ? 'Với swing trader bán thời gian, đây gần như luôn là lựa chọn đúng.'
              : 'For a part-time swing trader this is almost always the right answer.'
          }</p>` +
          ul(
            vi
              ? [
                  'Vốn được bảo toàn cho môi trường thuận lợi',
                  'Dùng thời gian để backtest và xây danh sách theo dõi',
                  'Chuẩn bị sẵn danh sách leader cho đợt phục hồi',
                ]
              : [
                  'Capital is preserved for a favourable environment',
                  'Spend the time backtesting and building watchlists',
                  'Have the leader list ready for the recovery',
                ],
          ),
      ),
      card(
        `<h4 class="swp-h4 swp-p-down">${vi ? 'Lựa chọn B — Short nhịp hồi' : 'Option B — short the rallies'}</h4>` +
          `<p class="swp-p">${
            vi
              ? 'Chỉ nếu anh đã có kinh nghiệm và tài khoản cho phép.'
              : 'Only if you are experienced and your account permits it.'
          }</p>` +
          ul(
            vi
              ? [
                  'Chờ giá hồi lên <b>21 EMA</b> rồi bị từ chối',
                  'Cần nến đảo chiều giảm + volume nở',
                  'Stop trên đỉnh nhịp hồi',
                  '<b>Nửa size</b> — nhịp hồi trong downtrend rất dữ dội',
                  'Chốt nhanh, mục tiêu 1,5–2R',
                ]
              : [
                  'Wait for a rally into the <b>21 EMA</b> and a rejection there',
                  'You need a bearish reversal bar plus expanding volume',
                  'Stop above the rally high',
                  '<b>Half size</b> — counter-trend rallies in a downtrend are violent',
                  'Take profit quickly, target 1.5–2R',
                ],
          ),
      ),
    ) +
    figure({
      title: vi ? 'Cấu trúc short nhịp hồi' : 'Short-the-rally structure',
      caption: vi
        ? 'Xu hướng giảm → hồi lên chạm 21 EMA → nến đảo chiều giảm (bóng trên dài, đóng cửa yếu) kèm volume → bán khi thủng đáy nến tín hiệu.'
        : 'Downtrend → a rally up to the 21 EMA → a bearish reversal bar (long upper wick, weak close) with volume → sell on a break of the signal bar\'s low.',
      body: shortRallyChart(lang),
    }) +
    callout(
      'bad',
      vi ? 'Sai lầm đắt giá nhất trong downtrend' : 'The most expensive mistake in a downtrend',
      vi
        ? '<b>Bắt đáy cổ phiếu tăng trưởng đã giảm 40%.</b> "Rẻ" không phải là một luận điểm giao dịch — một cổ phiếu giảm 40% có thể giảm tiếp 40% nữa. Mean reversion chỉ hoạt động trong <i>range</i>, không hoạt động trong <i>xu hướng giảm</i>.'
        : '<b>Bottom-fishing a growth stock that is already down 40%.</b> "Cheap" is not a trading thesis — a stock down 40% can fall another 40%. Mean reversion works in a <i>range</i>; it does not work in a <i>downtrend</i>.',
    );

  const panels: [string, string][] = [
    ['up', pUp],
    ['volatile', pVol],
    ['range', pRange],
    ['stress', pStress],
    ['down', pDown],
  ];

  return sec(
    'playbook',
    '07',
    vi ? 'Playbook — Setup theo từng Regime' : 'The playbook — setups by regime',
    vi
      ? 'Chọn regime để xem chính xác những setup nào được phép dùng, vào ở đâu, thoát ở đâu, và <b>tại sao</b>.'
      : 'Pick a regime to see exactly which setups are allowed, where to enter, where to exit, and <b>why</b>.',
    `<div class="swp-tabs" role="tablist">${tabs
      .map(
        ([id, label], i) =>
          `<button type="button" class="swp-tab${i === 0 ? ' active' : ''}" role="tab" aria-selected="${
            i === 0 ? 'true' : 'false'
          }" data-swp-tab="${id}"><span class="swp-tab-dot swp-d-${id}"></span>${label}</button>`,
      )
      .join('')}</div>` +
      panels
        .map(
          ([id, body], i) =>
            `<div class="swp-panel${i === 0 ? ' active' : ''}" role="tabpanel" data-swp-panel="${id}">${body}</div>`,
        )
        .join(''),
  );
}

// ── 08 · reversal candles ───────────────────────────────────────────────────

function s08(lang: Lang): string {
  const vi = lang === 'vi';
  const m = (s: string) => `<span class="swp-mono">${s}</span>`;
  return sec(
    'candles',
    '08',
    vi ? 'Nến đảo chiều — đọc theo cấu trúc, không theo tên' : 'Reversal bars — read the structure, not the name',
    vi
      ? 'Đừng học thuộc 40 mẫu nến. Mọi nến đảo chiều tăng đều nói cùng một câu: <b>người bán đã cố đẩy giá xuống trong phiên và thất bại.</b>'
      : 'Do not memorise forty candle patterns. Every bullish reversal bar says the same thing: <b>sellers tried to push price down during the session and failed.</b>',
    h4(vi ? 'Thứ tự đọc một tín hiệu — không được đảo' : 'The order you read a signal in — never reversed') +
      flow(
        vi
          ? [
              ['VỊ TRÍ', 'Nến xuất hiện ở đâu? Có chạm vùng tham chiếu (MA, hỗ trợ) không? — Quan trọng nhất'],
              ['BỐI CẢNH', 'Volume trước đó hành xử thế nào? Cạn dần hay tăng khi giảm?'],
              ['HÌNH DẠNG', 'Nến là gì? Bóng dưới bao nhiêu, đóng cửa ở đâu trong biên?'],
              ['XÁC NHẬN', 'Phiên sau có vượt đỉnh nến tín hiệu không? — Đây mới là lúc vào lệnh'],
            ]
          : [
              ['LOCATION', 'Where did the bar appear? Did it touch a reference level (MA, support)? — the most important step'],
              ['CONTEXT', 'How did volume behave beforehand? Drying up, or rising into weakness?'],
              ['SHAPE', 'What is the bar? How long is the lower wick, where in the range did it close?'],
              ['CONFIRMATION', 'Did the next session take out the signal bar\'s high? — only now do you enter'],
            ],
      ) +
      callout(
        'bad',
        vi ? 'Lỗi phổ biến nhất' : 'The most common error',
        vi
          ? 'Quét cả thị trường để tìm "bullish engulfing" mà không hỏi nó nằm ở đâu. <b>Nếu bước 1 không đạt, đừng xét bước 3.</b>'
          : 'Scanning the whole market for "bullish engulfing" without asking where it is. <b>If step 1 fails, do not evaluate step 3.</b>',
      ) +
      h4(vi ? 'Ba chỉ số thay cho việc nhận dạng hình ảnh' : 'Three numbers instead of visual pattern recognition') +
      `<p class="swp-p">${
        vi
          ? 'Ba con số này <b>code được</b> — rất hợp với hệ thống tự động của anh, và nhất quán hơn nhiều so với nhận dạng mẫu hình bằng mắt hoặc bằng AI.'
          : 'These three are <b>codeable</b> — a good fit for an automated system, and far more consistent than recognising shapes by eye or with an AI.'
      }</p>` +
      table(
        vi ? ['Thành phần', 'Công thức', 'Ngưỡng', 'Ý nghĩa'] : ['Component', 'Formula', 'Threshold', 'Meaning'],
        vi
          ? [
              ['<strong>Vị trí đóng cửa trong biên</strong>', m('(C − L) / (H − L)'), m('&gt; 0.7'), 'Người mua thắng phiên'],
              ['<strong>Tỷ lệ bóng dưới</strong>', m('(min(O,C) − L) / (H − L)'), m('&gt; 0.5'), 'Bị từ chối mạnh ở vùng giá thấp'],
              ['<strong>Biên độ so với thường</strong>', m('Range / ATR(14)'), m('&gt; 1.0'), 'Có tranh chấp thật, không phải phiên chết'],
            ]
          : [
              ['<strong>Close position in the range</strong>', m('(C − L) / (H − L)'), m('&gt; 0.7'), 'Buyers won the session'],
              ['<strong>Lower-wick ratio</strong>', m('(min(O,C) − L) / (H − L)'), m('&gt; 0.5'), 'Strong rejection at the lows'],
              ['<strong>Range vs normal</strong>', m('Range / ATR(14)'), m('&gt; 1.0'), 'A real fight took place, not a dead session'],
            ],
      ) +
      h4(vi ? 'Ba mẫu thực sự đáng dùng' : 'The three patterns actually worth using') +
      candleAnatomyFigure(lang) +
      vs(
        vi ? '✓ Dùng' : '✓ Use',
        vi
          ? [
              '<b>Hammer</b> / bóng dưới dài tại MA',
              '<b>Bullish engulfing</b> kèm volume',
              '<b>Reversal bar</b> phá đáy giả',
              'Phiên bản giảm của cả ba, cho lệnh short',
            ]
          : [
              '<b>Hammer</b> / long lower wick at an MA',
              '<b>Bullish engulfing</b> with volume',
              '<b>Reversal bar</b> — the false breakdown',
              'The bearish mirror of all three, for shorts',
            ],
        vi ? '✗ Bỏ qua' : '✗ Ignore',
        vi
          ? [
              '<b>Doji đơn lẻ</b> — chỉ là do dự, không phải đảo chiều',
              '<b>Mọi mẫu từ 3 nến trở lên</b> — quá hiếm, quá chậm, khó code nhất quán',
              'Nến có biên độ <b>&gt; 2× ATR</b> — xem giải thích bên dưới',
            ]
          : [
              '<b>A lone doji</b> — that is hesitation, not a reversal',
              '<b>Anything needing three or more bars</b> — too rare, too slow, hardest to code consistently',
              'Bars with a range <b>&gt; 2× ATR</b> — see the explanation below',
            ],
      ) +
      callout(
        'good',
        vi ? 'Chi tiết quyết định thành bại' : 'The detail that decides the outcome',
        vi
          ? '<b>Nến đảo chiều KHÔNG phải điểm vào lệnh. Nó là tín hiệu để đặt lệnh chờ.</b>'
          : '<b>A reversal bar is NOT an entry. It is the signal to place a resting order.</b>',
        vi
          ? 'Anh mua khi giá <b>vượt đỉnh nến tín hiệu</b> ở phiên sau. Lý do: nếu hôm sau không ai chịu mua vượt qua đỉnh đó, nghĩa là người mua hôm qua chỉ là nhất thời. Chờ xác nhận làm <i>giảm</i> win rate trên giấy nhưng <i>tăng mạnh</i> expectancy — vì loại bỏ được nhóm tín hiệu chết yểu.'
          : 'You buy when price <b>takes out the signal bar\'s high</b> the next session. The reason: if nobody will pay above that high the following day, yesterday\'s buyers were transient. Waiting for confirmation <i>lowers</i> the paper win rate but <i>raises</i> expectancy sharply, because it discards the stillborn signals.',
        vi
          ? 'Và stop nằm <b>dưới đáy nến tín hiệu</b> — chính cây nến đó định nghĩa cả điểm vào lẫn điểm sai. Đó là lý do nến biên độ quá rộng lại là tín hiệu <b>tệ</b>: stop quá xa, R-multiple sụp đổ dù mẫu hình nhìn rất đẹp.'
          : 'And the stop goes <b>below the signal bar\'s low</b> — that one bar defines both the entry and the point of being wrong. Which is why an over-wide bar is a <b>bad</b> signal: the stop is too far, and the R-multiple collapses however handsome the pattern looks.',
      ) +
      rrFigure(lang),
  );
}

// ── 09 · volume ─────────────────────────────────────────────────────────────

function s09(lang: Lang): string {
  const vi = lang === 'vi';
  const code = vi
    ? `# RVol điều chỉnh theo thời điểm trong phiên
expected = avg_daily_volume * fraction_expected_by_now
RVol_adj = volume_so_far / expected

# Ví dụ 16:15 CET (15 phút sau khi Mỹ mở cửa):
#   thường ~8% volume ngày đã giao dịch
#   volume hiện tại 1.2M, TB ngày 6M
#   → expected = 6M * 0.08 = 480K
#   → RVol_adj = 1.2M / 480K = 2.5x  ← ĐÁNG CHÚ Ý
#   (nếu tính sai: 1.2M / 6M = 0.2x  ← bỏ lỡ hoàn toàn)`
    : `# RVol adjusted for the time of day
expected = avg_daily_volume * fraction_expected_by_now
RVol_adj = volume_so_far / expected

# Example, 16:15 CET (15 minutes after the US open):
#   typically ~8% of the day's volume has traded
#   current volume 1.2M, daily average 6M
#   → expected = 6M * 0.08 = 480K
#   → RVol_adj = 1.2M / 480K = 2.5x  ← WORTH A LOOK
#   (done wrong: 1.2M / 6M = 0.2x  ← missed entirely)`;

  return sec(
    'volume',
    '09',
    vi ? 'Khối lượng — bốn cách đọc' : 'Volume — four ways to read it',
    vi
      ? 'Volume tuyệt đối vô nghĩa. <b>Luôn so tương đối</b> — với chính nó trong quá khứ, hoặc với các phiên xung quanh.'
      : 'Absolute volume is meaningless. <b>Always compare</b> — with its own history, or with the sessions around it.',
    volumeCasesFigure(lang) +
      h4(vi ? '① Volume trong pullback — phải CẠN' : '① Volume during a pullback — must DRY UP') +
      table(
        vi ? ['Hành vi', 'Ý nghĩa', 'Hành động'] : ['Behaviour', 'Meaning', 'Action'],
        vi
          ? [
              ['Volume giảm dần qua 3–5 phiên điều chỉnh', 'Không ai muốn bán ở giá này', pill('up', 'Chờ mua là đúng')],
              ['Volume tăng khi giá giảm', 'Tổ chức đang thoát hàng', pill('down', 'Tránh xa dù mẫu hình đẹp')],
            ]
          : [
              ['Volume declining through a 3–5 session pullback', 'Nobody wants to sell at this price', pill('up', 'Waiting to buy is correct')],
              ['Volume rising while price falls', 'Institutions are getting out', pill('down', 'Stay away, however pretty')],
            ],
      ) +
      `<p class="swp-p">${
        vi
          ? 'Đây là <b>bộ lọc mạnh nhất</b> của setup pullback. Đo cụ thể: volume trung bình 3 phiên điều chỉnh chia cho volume trung bình 3 phiên tăng trước đó — muốn tỷ số <b>&lt; 0,7</b>.'
          : 'This is the <b>strongest filter</b> the pullback setup has. Measure it concretely: average volume of the three pullback sessions divided by average volume of the three advancing sessions before them — you want the ratio <b>&lt; 0.7</b>.'
      }</p>` +
      h4(vi ? '② Volume tại nến đảo chiều — phải NỞ' : '② Volume on the reversal bar — must EXPAND') +
      `<p class="swp-p">${
        vi
          ? 'Nến hammer với volume gấp <b>1,5–2× trung bình</b> nghĩa là có người thật sự hấp thụ hàng bán. Cũng cây nến đó với volume thấp chỉ nghĩa là thiếu người bán — dễ gãy tiếp.'
          : 'A hammer on <b>1.5–2× average</b> volume means somebody genuinely absorbed the selling. The same bar on low volume only means sellers were absent — it breaks again easily.'
      }</p>` +
      callout(
        'note',
        vi ? 'Ngoại lệ quan trọng: VCP' : 'The important exception: VCP',
        vi
          ? 'Trong mẫu hình VCP, <b>volume cạn kiệt ở đáy lại là tín hiệu tốt nhất</b> — vì luận điểm ở đó là "hết hàng để bán", không phải "có người mua mạnh". Hai logic ngược nhau, tùy setup. Đây là lý do không thể áp một luật volume duy nhất cho toàn bộ hệ thống.'
          : 'In a VCP, <b>volume drying up at the low is the best signal there is</b> — because the thesis there is "there is no stock left to sell", not "there is a strong buyer". Two opposite logics, depending on the setup. This is why you cannot impose one volume rule across the whole system.',
      ) +
      h4(vi ? '③ Volume tại breakout — phải BÙNG' : '③ Volume on the breakout — must ERUPT') +
      `<p class="swp-p">${
        vi
          ? 'Ngưỡng khởi đầu: <b>&gt; 1,5× trung bình 50 phiên</b> tại phiên phá. Dưới mức đó, xác suất false breakout tăng rõ rệt — không có dòng tiền lớn nào bảo vệ mức giá mới.'
          : 'Starting threshold: <b>&gt; 1.5× the 50-day average</b> on the breakout session. Below that, the false-breakout rate rises markedly — no large flow is defending the new level.'
      }</p>` +
      h4(vi ? '④ Dấu vết tổ chức — tinh tế hơn, giá trị cao hơn' : '④ Institutional footprints — subtler, more valuable') +
      grid(
        2,
        card(
          `<h4 class="swp-h4 swp-p-up">Accumulation day</h4>` +
            (vi
              ? `<p class="swp-p">Giá tăng <b>&gt; 1%</b> với volume <b>cao hơn</b> phiên trước.</p>
                 <p class="swp-p">Đếm số ngày này trong 25 phiên. Nhiều = có tổ chức đang gom.</p>`
              : `<p class="swp-p">Price up <b>&gt; 1%</b> on <b>higher</b> volume than the previous session.</p>
                 <p class="swp-p">Count them over 25 sessions. Many of them means institutions are accumulating.</p>`),
        ),
        card(
          `<h4 class="swp-h4 swp-p-down">Distribution day</h4>` +
            (vi
              ? `<p class="swp-p">Giá <b>giảm</b> với volume <b>cao hơn</b> phiên trước.</p>
                 <p class="swp-p">Trên chỉ số: <b>4–5 ngày trong 4 tuần</b> = cảnh báo regime sắp đổi. Thường đến <i>trước</i> khi giá thủng 50MA.</p>`
              : `<p class="swp-p">Price <b>down</b> on <b>higher</b> volume than the previous session.</p>
                 <p class="swp-p">On the index: <b>4–5 in four weeks</b> warns the regime is about to change. It usually arrives <i>before</i> price loses the 50MA.</p>`),
        ),
      ) +
      h4(vi ? 'Relative Volume trong phiên — chi tiết dễ làm sai nhất' : 'Intraday relative volume — the easiest thing to get wrong') +
      callout(
        'bad',
        vi ? 'Đừng so volume tích lũy với trung bình cả ngày' : 'Do not compare cumulative volume with a full-day average',
        vi
          ? 'Nếu làm vậy, <b>mọi cổ phiếu đều trông "ít volume" vào buổi sáng và "nhiều volume" lúc đóng cửa</b> — chỉ số vô dụng. Với anh ở châu Âu, 16h00 CET là lúc thị trường Mỹ vừa mở, và mọi cảnh báo volume sẽ im lặng suốt buổi tối.'
          : 'Do that and <b>every stock looks "low volume" in the morning and "high volume" at the close</b> — a useless metric. From Europe, 16:00 CET is the US open, and every volume alert would stay silent all evening.',
      ) +
      `<p class="swp-p">${
        vi
          ? 'Cách đúng: xây <b>đường cong phân bổ volume trong phiên</b> — tỷ lệ volume thường được giao dịch trong mỗi khung 5 phút, tính trên 20 phiên gần nhất. Sau đó:'
          : 'The right way: build an <b>intraday volume distribution curve</b> — the share of the day\'s volume that normally trades in each 5-minute bucket, over the last 20 sessions. Then:'
      }</p>` +
      pre(code),
  );
}

// ── 10 · other factors ──────────────────────────────────────────────────────

function s10(lang: Lang): string {
  const vi = lang === 'vi';
  const m = (s: string) => `<span class="swp-mono">${s}</span>`;
  return sec(
    'others',
    '10',
    vi ? 'Những yếu tố khác ảnh hưởng đến kết quả' : 'Other factors that move the outcome',
    vi
      ? 'Ngoài nến và volume, đây là các biến số tác động mạnh nhất đến kỳ vọng của một lệnh.'
      : 'Beyond the bar and the volume, these are the variables with the largest effect on a trade\'s expectancy.',
    table(
      vi ? ['Yếu tố', 'Đo thế nào', 'Ngưỡng', 'Tại sao quan trọng'] : ['Factor', 'How to measure', 'Threshold', 'Why it matters'],
      vi
        ? [
            ['<strong>Vị trí so với MA</strong>', 'Nến có chạm 10/21/50 EMA?', m('Bắt buộc'), 'Đây là "vùng tham chiếu" — không có nó thì stop đặt tùy tiện'],
            ['<strong>Cấu trúc higher-low</strong>', 'Đáy pullback &gt; đáy trước?', m('Bắt buộc'), 'Vi phạm = xu hướng gãy, mọi tín hiệu nến vô hiệu'],
            ['<strong>Độ sâu pullback</strong>', '% từ đỉnh gần nhất', m('3–8%'), '&gt; 15% trong uptrend = có vấn đề cơ bản, không phải điều chỉnh'],
            ['<strong>Số phiên điều chỉnh</strong>', 'Đếm phiên', m('3–7'), '&gt; 12 phiên = động lượng đã mất, nền cần xây lại'],
            ['<strong>ATR%</strong>', 'ATR(14) / giá', m('2–6%'), 'Quyết định stop rộng bao nhiêu → quyết định size'],
            ['<strong>Khoảng cách đỉnh 52T</strong>', '% dưới đỉnh', m('Trong 15%'), 'Còn là leader, chưa bị dòng tiền bỏ lại'],
            ['<strong>Ngày công bố lợi nhuận</strong>', 'Lịch earnings', m('&gt; 10 phiên'), 'Giữ lệnh qua earnings = đánh bạc; stop không bảo vệ được vì gap'],
          ]
        : [
            ['<strong>Position vs the MAs</strong>', 'Did the bar touch the 10/21/50 EMA?', m('Mandatory'), 'This is the reference level — without one, the stop is arbitrary'],
            ['<strong>Higher-low structure</strong>', 'Is the pullback low above the previous one?', m('Mandatory'), 'Violated means the trend broke, and every candle signal is void'],
            ['<strong>Pullback depth</strong>', '% from the recent high', m('3–8%'), '&gt; 15% in an uptrend is a fundamental problem, not a pullback'],
            ['<strong>Pullback length</strong>', 'Count the sessions', m('3–7'), '&gt; 12 sessions means momentum is gone and the base must be rebuilt'],
            ['<strong>ATR%</strong>', 'ATR(14) / price', m('2–6%'), 'Decides how wide the stop is → decides the size'],
            ['<strong>Distance from the 52w high</strong>', '% below the high', m('Within 15%'), 'Still a leader, not yet abandoned by the flow'],
            ['<strong>Earnings date</strong>', 'The earnings calendar', m('&gt; 10 sessions'), 'Holding through earnings is gambling; a stop cannot protect you against a gap'],
          ],
    ) +
      callout(
        'bad',
        vi ? 'Luật earnings — đáng nhấn mạnh riêng' : 'The earnings rule — worth its own box',
        vi
          ? 'Swing trade giữ 3–10 phiên, nên earnings gần như <b>luôn nằm trong khung thời gian của anh</b>. Luật đơn giản: <b>không mở lệnh mới nếu earnings rơi vào 10 phiên tới</b>, trừ khi anh cố ý chơi earnings với size nhỏ hơn hẳn. Một cú gap −18% qua đêm sẽ xuyên thủng mọi stop và biến lệnh rủi ro 1% thành lệnh mất 4%.'
          : 'A swing trade is held 3–10 sessions, so earnings are <b>almost always inside your window</b>. The simple rule: <b>no new position if earnings fall within the next 10 sessions</b>, unless you are deliberately playing earnings at a much smaller size. One −18% overnight gap goes straight through any stop and turns a 1%-risk trade into a 4% loss.',
      ),
  );
}

// ── 11 · scorecard ──────────────────────────────────────────────────────────

const MUSTS: [Bi, Bi][] = [
  [
    { en: 'The current regime permits this setup', vi: 'Regime hiện tại cho phép setup này' },
    { en: 'Uptrend → pullback/breakout/VCP · Range → mean reversion only', vi: 'Uptrend → pullback/breakout/VCP · Range → chỉ mean reversion' },
  ],
  [
    { en: 'The stock is in a top-3 sector', vi: 'Cổ phiếu thuộc top 3 sector' },
    { en: 'Prefer a sector that is climbing, not just the one on top', vi: 'Ưu tiên sector đang tăng hạng, không chỉ sector đang đứng đầu' },
  ],
  [
    { en: 'It touched a reference MA (10 / 21 / 50 EMA)', vi: 'Chạm vùng MA tham chiếu (10 / 21 / 50 EMA)' },
    { en: 'No reference level means no sensible place for the stop', vi: 'Không có vùng tham chiếu = không có chỗ đặt stop hợp lý' },
  ],
  [
    { en: 'The higher-low structure is intact', vi: 'Cấu trúc higher-low còn nguyên vẹn' },
    { en: 'This pullback low is above the previous pullback low', vi: 'Đáy pullback này cao hơn đáy pullback trước' },
  ],
  [
    { en: 'No earnings in the next 10 sessions', vi: 'Không có earnings trong 10 phiên tới' },
    { en: 'An overnight gap goes straight through any stop', vi: 'Gap qua đêm xuyên thủng mọi stop' },
  ],
  [
    { en: 'The close is in the top 30% of the bar', vi: 'Đóng cửa nằm ở top 30% biên nến' },
    { en: '(C − L) / (H − L) > 0.7', vi: '(C − L) / (H − L) &gt; 0.7' },
  ],
];

const PLUSES: [Bi, Bi][] = [
  [
    { en: 'Pullback volume / advance volume < 0.7', vi: 'Volume pullback / volume tăng &lt; 0.7' },
    { en: 'Sellers have run out of force', vi: 'Người bán đã cạn lực' },
  ],
  [
    { en: 'Signal-bar volume > 1.3× average', vi: 'Volume nến tín hiệu &gt; 1.3× trung bình' },
    { en: 'Somebody genuinely absorbed the selling', vi: 'Có người thật sự hấp thụ hàng bán' },
  ],
  [
    { en: 'Lower wick is > 50% of the bar', vi: 'Bóng dưới chiếm &gt; 50% biên nến' },
    { en: 'Strong rejection at the lows', vi: 'Bị từ chối mạnh ở vùng giá thấp' },
  ],
  [
    { en: 'RS positive vs SPY on both 21 and 63 sessions', vi: 'RS dương so với SPY ở cả 21 và 63 phiên' },
    { en: 'Stronger than the market before you buy', vi: 'Mạnh hơn thị trường trước khi anh mua' },
  ],
  [
    { en: 'Within 15% of the 52-week high', vi: 'Nằm trong 15% so với đỉnh 52 tuần' },
    { en: 'Still a leading stock', vi: 'Vẫn là cổ phiếu dẫn dắt' },
  ],
  [
    { en: 'Pullback 3–8% deep, lasting 3–7 sessions', vi: 'Pullback sâu 3–8%, kéo dài 3–7 phiên' },
    { en: 'A healthy correction, not a broken trend', vi: 'Điều chỉnh lành mạnh, không phải gãy trend' },
  ],
  [
    { en: 'ATR% between 2% and 6%', vi: 'ATR% nằm trong khoảng 2–6%' },
    { en: 'Room enough for 3R without the stop being far away', vi: 'Đủ biên độ để đạt 3R nhưng stop không quá xa' },
  ],
  [
    { en: 'A clear catalyst (news, earnings beat, upgrade)', vi: 'Có chất xúc tác rõ ràng (tin, earnings beat, nâng hạng)' },
    { en: 'You can say in one sentence why it is moving', vi: 'Nói được một câu tại sao nó đang chuyển động' },
  ],
  [
    { en: 'The nearest target pays at least 2R', vi: 'Mục tiêu gần nhất cho ít nhất 2R' },
    { en: 'Below 2R, skip it — however pretty the pattern', vi: 'Dưới 2R thì bỏ qua, bất kể mẫu hình đẹp đến đâu' },
  ],
];

function s11(lang: Lang): string {
  const vi = lang === 'vi';
  // `data-swp-ck` carries the must/plus split — the wiring reads it, and the
  // group heading above each list says it in words, so no extra class is needed.
  const ck = (kind: 'must' | 'plus', [label, hint]: [Bi, Bi]) =>
    `<label class="swp-ck"><input type="checkbox" data-swp-ck="${kind}"><span class="swp-ck-t">${tx(
      label,
      lang,
    )}<small>${tx(hint, lang)}</small></span></label>`;

  const code = vi
    ? `# Luật vào lệnh cuối cùng
if tat_ca_bat_buoc and diem_cong &gt;= 4:
    vao_lenh(size=size_theo_regime)
else:
    bo_qua()   # luôn còn lệnh khác vào ngày mai`
    : `# The final entry rule
if all_musts and plus_count &gt;= 4:
    enter(size=size_for_regime)
else:
    skip()   # there is always another trade tomorrow`;

  return sec(
    'scorecard',
    '11',
    vi ? 'Bảng chấm điểm — biến trực giác thành luật' : 'The scorecard — turning intuition into rules',
    vi
      ? 'Chuyển toàn bộ phần trên thành checklist tính điểm thay vì nhận dạng hình ảnh. Cấu trúc này <b>code được, log được, và quan trọng nhất là backtest được</b>.'
      : 'Everything above becomes a scored checklist instead of a visual judgement. This structure is <b>codeable, loggable and — most importantly — backtestable</b>.',
    `<div class="swp-tool">
      <div class="swp-tool-h"><span class="swp-tool-i">✅</span><b>${vi ? 'Chấm điểm setup' : 'Score a setup'}</b></div>
      <div class="swp-tool-sub">${
        vi
          ? 'Tick từng mục cho lệnh anh đang cân nhắc. Dùng thử ngay bây giờ với một biểu đồ bất kỳ để làm quen.'
          : 'Tick each item for the trade you are considering. Try it now on any chart to get a feel for it.'
      }</div>
      <div class="swp-ck-grp">
        <div class="swp-ck-lbl swp-p-gold">${
          vi ? 'Điều kiện bắt buộc — thiếu 1 là loại' : 'Mandatory — one missing and it is out'
        }</div>
        ${MUSTS.map((x) => ck('must', x)).join('')}
      </div>
      <div class="swp-ck-grp">
        <div class="swp-ck-lbl swp-p-up">${vi ? 'Điểm cộng — cần ít nhất 4' : 'Bonus points — at least 4 needed'}</div>
        ${PLUSES.map((x) => ck('plus', x)).join('')}
      </div>
      <div class="swp-score-row">
        <div class="swp-score-item"><span>${vi ? 'Bắt buộc' : 'Mandatory'}</span><b data-swp="mScore">0/${
          MUSTS.length
        }</b></div>
        <div class="swp-score-item"><span>${vi ? 'Điểm cộng' : 'Bonus'}</span><b data-swp="pScore">0/${
          PLUSES.length
        }</b></div>
        <div class="swp-score-item swp-score-btn"><button type="button" class="btn" data-swp="reset">${
          vi ? 'Làm lại' : 'Reset'
        }</button></div>
      </div>
      <div class="swp-verdict" data-swp="verdict"><b>—</b><span>—</span></div>
    </div>` +
      pre(code) +
      callout(
        'info',
        vi ? 'Giá trị thật của bảng điểm này' : 'What this scorecard is really for',
        vi
          ? 'Sau 100+ lệnh, anh sẽ <b>biết điểm cộng nào thực sự có giá trị thống kê</b> và điểm nào chỉ là niềm tin phổ biến được truyền tay. Đó là thứ không sách nào dạy được — nó đến từ dữ liệu của chính anh.'
          : 'After 100+ trades you will <b>know which bonus points carry statistical weight</b> and which are folklore passed from hand to hand. No book can teach you that — it comes out of your own data.',
      ),
  );
}

// ── 12 · position sizing ────────────────────────────────────────────────────

function s12(lang: Lang): string {
  const vi = lang === 'vi';
  const m = (s: string) => `<span class="swp-mono">${s}</span>`;
  const field = (key: string, label: string, value: string, step?: string) =>
    `<div class="swp-field"><label>${label}</label><input type="number" data-swp-calc="${key}" value="${value}"${
      step ? ` step="${step}"` : ''
    }></div>`;
  const out = (key: string, label: string) =>
    `<div class="swp-out-box"><span>${label}</span><b data-swp-out="${key}">—</b></div>`;

  return sec(
    'sizing',
    '12',
    vi ? 'Tính size & quản trị rủi ro' : 'Position sizing & risk management',
    vi
      ? 'Đây là phần quyết định anh sống sót hay không — quan trọng hơn mọi kỹ thuật chọn điểm vào ở trên.'
      : 'This is the part that decides whether you survive — more important than every entry technique above.',
    callout(
      'good',
      vi ? 'Thứ tự tính toán không được đảo' : 'The order of calculation is not negotiable',
      vi
        ? 'Hỏi <b>"giá nào chứng minh tôi sai?"</b> trước → rồi mới tính số lượng cổ phiếu. Làm ngược lại (đặt stop ở mức −5% vì đó là mức anh chịu được) là đặt stop vào một chỗ hoàn toàn vô nghĩa với thị trường — và nó sẽ bị quét liên tục.'
        : 'Ask <b>"which price proves me wrong?"</b> first → only then compute the share count. Doing it the other way round (a stop at −5% because that is what you can stomach) puts the stop somewhere completely meaningless to the market — and it will be taken out over and over.',
    ) +
      `<div class="swp-tool">
      <div class="swp-tool-h"><span class="swp-tool-i">🧮</span><b>${
        vi ? 'Máy tính size vị thế' : 'Position size calculator'
      }</b></div>
      <div class="swp-tool-sub">${
        vi
          ? 'Nhập kế hoạch lệnh, công cụ tính số lượng cổ phiếu sao cho rủi ro đúng bằng tỷ lệ anh đặt ra.'
          : 'Enter the trade plan and it returns the share count that makes your risk exactly the percentage you chose.'
      }</div>
      <div class="swp-calc-grid">
        ${field('acc', vi ? 'Tài khoản (€)' : 'Account (€)', '50000')}
        ${field('risk', vi ? 'Rủi ro/lệnh (%)' : 'Risk per trade (%)', '1', '0.25')}
        ${field('entry', vi ? 'Giá vào' : 'Entry price', '142.10', '0.01')}
        ${field('stop', vi ? 'Giá stop' : 'Stop price', '138.40', '0.01')}
        ${field('target', vi ? 'Mục tiêu' : 'Target', '153.30', '0.01')}
      </div>
      <div class="swp-out">
        ${out('risk', vi ? 'Tiền rủi ro' : 'Risk amount')}
        ${out('shares', vi ? 'Số cổ phiếu' : 'Shares')}
        ${out('pos', vi ? 'Giá trị vị thế' : 'Position value')}
        ${out('stopPct', vi ? 'Stop cách' : 'Stop distance')}
        ${out('r', vi ? 'Tỷ lệ R' : 'R multiple')}
      </div>
      <p class="swp-calc-warn" data-swp="calcWarn"></p>
    </div>` +
      h4(vi ? 'Luật rủi ro theo giai đoạn' : 'Risk rules by stage') +
      table(
        vi
          ? ['Giai đoạn', 'Rủi ro/lệnh', 'Số vị thế tối đa', 'Ghi chú']
          : ['Stage', 'Risk per trade', 'Max positions', 'Note'],
        vi
          ? [
              ['50 lệnh đầu tiên (thật)', m('0.25%'), m('2–3'), 'Lợi thế chưa được chứng minh. Đây là học phí, giữ nó rẻ.'],
              ['Sau khi expectancy dương', m('0.5%'), m('3–4'), 'Tăng dần, không nhảy vọt'],
              ['Hệ thống ổn định &gt; 100 lệnh', m('1.0%'), m('4–5'), 'Mức trần. Không có lý do chính đáng để vượt.'],
              ['Uptrend + vol cao', m('Nửa mức thường'), m('2–3'), 'Biến động cao = size nhỏ lại'],
              ['Sau 3 lệnh thua liên tiếp', m('Nửa mức thường'), m('2'), 'Giảm cho đến khi có 2 lệnh thắng'],
            ]
          : [
              ['First 50 live trades', m('0.25%'), m('2–3'), 'The edge is unproven. This is tuition — keep it cheap.'],
              ['Once expectancy is positive', m('0.5%'), m('3–4'), 'Step up gradually, do not jump'],
              ['Stable system, &gt; 100 trades', m('1.0%'), m('4–5'), 'The ceiling. There is no good reason to exceed it.'],
              ['Uptrend + high volatility', m('Half the usual'), m('2–3'), 'High volatility means smaller size'],
              ['After 3 consecutive losses', m('Half the usual'), m('2'), 'Stay reduced until you have two winners'],
            ],
      ) +
      callout(
        'note',
        vi ? 'Rủi ro toàn danh mục' : 'Portfolio-level risk',
        vi
          ? 'Tổng rủi ro của tất cả vị thế đang mở không nên vượt <b>3–4% tài khoản</b>. Và cẩn thận với <b>tương quan</b>: 4 lệnh cùng nằm trong XLK không phải 4 lệnh độc lập — đó thực chất là một lệnh lớn gấp bốn lần.'
          : 'Total risk across all open positions should not exceed <b>3–4% of the account</b>. And beware <b>correlation</b>: four trades all inside XLK are not four independent trades — they are one trade four times the size.',
      ),
  );
}

// ── 13 · exits ──────────────────────────────────────────────────────────────

function s13(lang: Lang): string {
  const vi = lang === 'vi';
  const rules: [string, string][] = vi
    ? [
        [
          'Stop đặt theo cấu trúc,<br>không theo số tiền',
          'Thị trường không biết anh chịu được bao nhiêu. Stop phải nằm ở nơi mà nếu giá tới đó, <b>luận điểm của anh đã sai</b>. Số tiền mất được điều chỉnh bằng số lượng cổ phiếu, không bằng cách dời stop.',
        ],
        [
          'Chốt 1/2 tại 2R là để<br>quản lý tâm lý',
          'Về kỳ vọng toán học thuần túy, giữ full position và trail thường cho kết quả cao hơn. Nhưng điều đó chỉ đúng <b>nếu anh thực sự giữ được</b> — mà phần lớn người không. Chốt một nửa là mua lấy khả năng tuân thủ luật.',
        ],
        [
          'Thoát khi lý do vào lệnh<br>biến mất',
          'Vào vì volume mạnh mà volume cạn dần → thoát. Vào vì dẫn dắt ngành mà ngành quay đầu → thoát. <b>Stop là phòng tuyến cuối cùng, không phải điều kiện thoát duy nhất.</b>',
        ],
      ]
    : [
        [
          'Stops are placed by structure,<br>not by money',
          'The market does not know what you can stomach. The stop belongs where, if price gets there, <b>your thesis is wrong</b>. The money at risk is adjusted with the share count, never by moving the stop.',
        ],
        [
          'Taking half at 2R is<br>psychological management',
          'In pure mathematical expectancy, holding the full position and trailing usually wins. But that only holds <b>if you actually hold</b> — and most people do not. Selling half buys you the ability to follow your own rules.',
        ],
        [
          'Exit when the reason<br>for the trade disappears',
          'In because volume was strong and volume dries up → out. In because the sector led and the sector turns → out. <b>The stop is the last line of defence, not the only exit condition.</b>',
        ],
      ];

  return sec(
    'exit',
    '13',
    vi ? 'Ba nguyên tắc thoát lệnh — áp dụng cho mọi setup' : 'Three exit principles — they apply to every setup',
    '',
    grid(3, ...rules.map(([head, body], i) => card(`${pill('gold', `0${i + 1}`)}${h4(head)}<p class="swp-p">${body}</p>`))) +
      h4(vi ? 'Bảng tra nhanh — thoát lệnh theo setup' : 'Quick reference — exits by setup') +
      table(
        vi
          ? ['Setup', 'Stop ban đầu', 'Chốt một phần', 'Trail', 'Thoát khi sai']
          : ['Setup', 'Initial stop', 'Partial exit', 'Trail', 'Invalidation'],
        vi
          ? [
              ['<strong>Pullback</strong>', 'Dưới đáy pullback', '1/2 tại 2R', 'Đóng cửa dưới 21 EMA', 'Gãy higher-low'],
              ['<strong>Breakout</strong>', 'Dưới điểm phá', '1/2 tại measured move', 'Đóng cửa dưới 10 EMA', 'Đóng cửa lại trong nền'],
              ['<strong>VCP</strong>', 'Dưới đáy nén cuối (3–5%)', '1/2 tại 3R', 'Đóng cửa dưới 10/21 EMA', 'Rơi lại vào nền'],
              ['<strong>Mean reversion</strong>', 'Dưới đáy nến tín hiệu', 'Toàn bộ tại 20 EMA', 'Không trail', 'Quá 5–7 phiên'],
              ['<strong>Short nhịp hồi</strong>', 'Trên đỉnh nhịp hồi', '1/2 tại 1.5R', 'Đóng cửa trên 10 EMA', 'Lấy lại 21 EMA'],
            ]
          : [
              ['<strong>Pullback</strong>', 'Below the pullback low', 'Half at 2R', 'Close below the 21 EMA', 'Higher-low breaks'],
              ['<strong>Breakout</strong>', 'Below the pivot', 'Half at the measured move', 'Close below the 10 EMA', 'Closes back inside the base'],
              ['<strong>VCP</strong>', 'Below the last contraction (3–5%)', 'Half at 3R', 'Close below the 10/21 EMA', 'Falls back into the base'],
              ['<strong>Mean reversion</strong>', 'Below the signal bar low', 'All of it at the 20 EMA', 'No trail', 'Past 5–7 sessions'],
              ['<strong>Short the rally</strong>', 'Above the rally high', 'Half at 1.5R', 'Close above the 10 EMA', 'Reclaims the 21 EMA'],
            ],
      ),
  );
}

// ── 14 · journal & expectancy ───────────────────────────────────────────────

function s14(lang: Lang): string {
  const vi = lang === 'vi';
  const m = (s: string) => `<span class="swp-mono">${s}</span>`;
  const code = vi
    ? `# Tính riêng cho TỪNG setup × TỪNG regime — đây mới là điểm mấu chốt
Win Rate    = so_lenh_thang / tong_so_lenh
Avg Win     = trung_binh(R cua cac lenh thang)
Avg Loss    = trung_binh(|R| cua cac lenh thua)

Expectancy  = (WinRate × AvgWin) - ((1-WinRate) × AvgLoss)
Profit Factor = tong_lai / tong_lo

# Ví dụ kết quả thật anh sẽ thấy sau 100 lệnh:
#   Pullback  × Uptrend  →  +0.62R   ← đây là chén cơm
#   Breakout  × Uptrend  →  +0.41R
#   Breakout  × Range    →  -0.28R   ← BỎ HẲN setup này trong range
#   MeanRev   × Range    →  +0.33R
#   MeanRev   × Downtrend→  -0.71R   ← bắt đáy là cái bẫy`
    : `# Compute per SETUP × per REGIME — this is the whole point
Win Rate    = winners / total_trades
Avg Win     = mean(R of winning trades)
Avg Loss    = mean(|R| of losing trades)

Expectancy  = (WinRate × AvgWin) - ((1-WinRate) × AvgLoss)
Profit Factor = gross_profit / gross_loss

# The kind of real result you will see after 100 trades:
#   Pullback  × Uptrend  →  +0.62R   ← this is the bread and butter
#   Breakout  × Uptrend  →  +0.41R
#   Breakout  × Range    →  -0.28R   ← DROP this setup in a range
#   MeanRev   × Range    →  +0.33R
#   MeanRev   × Downtrend→  -0.71R   ← bottom-fishing is the trap`;

  return sec(
    'journal',
    '14',
    vi ? 'Nhật ký & Expectancy' : 'Journal & expectancy',
    vi
      ? 'Đây là nơi anh khám phá ra hệ thống của <b>chính mình</b>, thay vì tin vào hệ thống của người khác.'
      : 'This is where you discover <b>your own</b> system instead of believing somebody else\'s.',
    h4(vi ? 'Cấu trúc bảng nhật ký' : 'Journal structure') +
      table(
        vi ? ['Nhóm', 'Cột'] : ['Group', 'Columns'],
        vi
          ? [
              ['<strong>Bối cảnh</strong>', m('Ngày · Mã · Market Regime · Trạng thái Vol · Sector · Thứ hạng sector')],
              ['<strong>Setup</strong>', m('Loại setup · Điểm bắt buộc · Điểm cộng · Chất xúc tác')],
              ['<strong>Thực thi</strong>', m('Giá vào · Giá stop · Mục tiêu · Số cp · Rủi ro € · Rủi ro %')],
              ['<strong>Kết quả</strong>', m('Giá ra · Lý do thoát · R-multiple · Số phiên giữ · MAE · MFE')],
              ['<strong>Hành vi</strong>', m('Có tuân thủ kế hoạch? · Vào sớm/muộn? · Thoát sớm/muộn? · Ghi chú')],
            ]
          : [
              ['<strong>Context</strong>', m('Date · Symbol · Market regime · Vol state · Sector · Sector rank')],
              ['<strong>Setup</strong>', m('Setup type · Mandatory score · Bonus score · Catalyst')],
              ['<strong>Execution</strong>', m('Entry · Stop · Target · Shares · Risk € · Risk %')],
              ['<strong>Result</strong>', m('Exit · Exit reason · R-multiple · Sessions held · MAE · MFE')],
              ['<strong>Behaviour</strong>', m('Followed the plan? · Early/late entry? · Early/late exit? · Notes')],
            ],
      ) +
      callout(
        'info',
        vi ? 'Hai cột quan trọng nhất mà ít người ghi' : 'The two most valuable columns almost nobody records',
        vi
          ? '<b>MAE</b> (mức lỗ sâu nhất trong lệnh) cho biết stop của anh có đang quá rộng không. <b>MFE</b> (mức lãi cao nhất đạt được) cho biết anh có đang chốt lời quá sớm không. Không có hai cột này, anh không thể biết vấn đề nằm ở entry hay ở exit.'
          : '<b>MAE</b> (the deepest drawdown inside the trade) tells you whether your stop is too wide. <b>MFE</b> (the best unrealised gain) tells you whether you take profit too early. Without both, you cannot tell whether the problem is the entry or the exit.',
      ) +
      h4(vi ? 'Công thức phải tính' : 'The formulas you must compute') +
      pre(code) +
      callout(
        'good',
        vi ? 'Tại sao phải tách theo regime' : 'Why it has to be split by regime',
        vi
          ? 'Nếu chỉ tính expectancy tổng cho "setup breakout", anh sẽ thấy một con số trung bình vô nghĩa — che giấu sự thật rằng nó kiếm tiền rất tốt trong uptrend và đốt tiền đều đặn trong range. <b>Con số gộp sẽ khiến anh bỏ đi một setup tốt, hoặc giữ lại một setup xấu.</b>'
          : 'Compute a single blended expectancy for "the breakout setup" and you get a meaningless average — one that hides the fact that it earns well in an uptrend and burns money steadily in a range. <b>The blended number makes you drop a good setup, or keep a bad one.</b>',
      ),
  );
}

// ── 15 · daily routine ──────────────────────────────────────────────────────

function s15(lang: Lang): string {
  const vi = lang === 'vi';
  const evening = vi
    ? `1. Viết dòng regime                  5'
   (trend · vol · breadth · dist days)
2. Xếp hạng 11 sector ETF (1M/3M/6M)  5'
3. Ghi thay đổi thứ hạng tuần này     2'
4. Screener CHỈ trong top 3 sector    5'
5. Lọc in-play (RVol, TK, ATR, RS)    3'
6. Chấm điểm 5 biểu đồ               15'
7. Viết kế hoạch: entry/stop/target  10'`
    : `1. Write the regime line             5'
   (trend · vol · breadth · dist days)
2. Rank the 11 sector ETFs (1M/3M/6M) 5'
3. Note this week's rank changes      2'
4. Screen ONLY inside the top 3       5'
5. In-play filter (RVol, liq, ATR, RS) 3'
6. Score 5 charts                    15'
7. Write the plan: entry/stop/target 10'`;

  const weekend = vi
    ? `1. Xem lại toàn bộ lệnh trong tuần
2. Cập nhật expectancy theo setup × regime
3. Đánh dấu lệnh phá luật — tại sao?
4. Xem biểu đồ xoay vòng sector 90 phiên
5. Kiểm tra lịch earnings tuần tới
6. Chuẩn bị danh sách theo dõi
7. Đọc lại 1 mục trong cẩm nang này`
    : `1. Review every trade of the week
2. Update expectancy by setup × regime
3. Flag the rule-breaking trades — why?
4. Look at the 90-session sector rotation
5. Check next week's earnings calendar
6. Prepare the watchlist
7. Re-read one section of this playbook`;

  return sec(
    'routine',
    '15',
    vi ? 'Quy trình hằng ngày' : 'The daily routine',
    vi
      ? 'Thiết kế cho múi giờ châu Âu — chạy sau khi thị trường Mỹ đóng cửa, không cần theo dõi trong phiên.'
      : 'Designed for a European time zone — run after the US close, with no intraday monitoring required.',
    grid(
      2,
      card(h4(vi ? '🌙 Buổi tối · 30–45 phút' : '🌙 Evening · 30–45 minutes') + pre(evening)),
      card(h4(vi ? '📅 Cuối tuần · 1–2 giờ' : '📅 Weekend · 1–2 hours') + pre(weekend)),
    ) +
      h4(vi ? 'Nơi AI thực sự giúp được — và nơi nó gây hại' : 'Where AI genuinely helps — and where it hurts') +
      vs(
        vi ? '✓ AI mạnh' : '✓ AI is strong',
        vi
          ? [
              'Viết code tính regime, xếp hạng sector, screener',
              'Viết và debug script backtest',
              '<b>Phân tích nhật ký</b> tìm lỗi hành vi — giá trị cao nhất',
              'Đóng vai người phản biện <i>sau khi</i> anh đã tự phân tích',
              'Tóm tắt tin tức, báo cáo để tìm chất xúc tác',
            ]
          : [
              'Writing the code for regime, sector ranking, screeners',
              'Writing and debugging backtest scripts',
              '<b>Analysing the journal</b> for behavioural errors — the highest-value use',
              'Playing devil\'s advocate <i>after</i> you have done your own analysis',
              'Summarising news and filings to find a catalyst',
            ],
        vi ? '✗ AI yếu / nguy hiểm' : '✗ AI is weak / dangerous',
        vi
          ? [
              '<b>Hỏi số liệu thị trường</b> — chatbot không có bảng giá, nó sẽ bịa ra con số nghe rất thuyết phục',
              'Chấm điểm mẫu hình trên ảnh chart — không nhất quán',
              'Dự báo hướng đi — không ai làm được',
              'Backtest do AI viết <b>rất dễ có lookahead bias</b> và cho kết quả đẹp giả tạo',
            ]
          : [
              '<b>Asking it for market data</b> — a chatbot has no quote feed and will invent a very convincing number',
              'Scoring patterns off a chart screenshot — not consistent',
              'Forecasting direction — nobody can do this',
              'An AI-written backtest is <b>very prone to lookahead bias</b> and produces fake-beautiful results',
            ],
      ) +
      callout(
        'bad',
        vi ? 'Luật an toàn khi dùng AI' : 'The safety rule for using AI',
        vi
          ? '<b>AI viết công thức · dữ liệu do anh lấy về · máy tính chạy phép tính.</b> AI không bao giờ được là nguồn của một con số thị trường. Một giá trị ATR bịa ra sẽ đi thẳng vào công thức tính size và vào lệnh thật của anh.'
          : '<b>AI writes the formula · you fetch the data · the machine does the arithmetic.</b> An AI must never be the source of a market number. One invented ATR value walks straight into your size formula and into a real order.',
      ),
  );
}

// ── 16 · fatal mistakes ─────────────────────────────────────────────────────

function s16(lang: Lang): string {
  const vi = lang === 'vi';
  const n = (i: number, tone: string) => `<span class="swp-mono swp-p-${tone}">${i}</span>`;
  return sec(
    'mistakes',
    '16',
    vi ? 'Sai lầm chí mạng' : 'Fatal mistakes',
    vi
      ? 'Xếp theo mức độ tốn kém. Phần lớn tài khoản mất tiền vì 1–3, không phải vì chọn sai điểm vào.'
      : 'Ordered by how much they cost. Most accounts lose money to 1–3, not to picking the wrong entry.',
    table(
      vi ? ['#', 'Sai lầm', 'Tại sao chết người', 'Cách sửa'] : ['#', 'Mistake', 'Why it is fatal', 'The fix'],
      vi
        ? [
            [n(1, 'down'), '<strong>Dời stop khi giá sắp chạm</strong>', 'Biến lệnh rủi ro 1% thành lệnh mất 5%. Một lần làm xóa sạch 5 lệnh thắng.', 'Đặt stop ngay khi vào lệnh và không bao giờ nới rộng — chỉ được siết lại'],
            [n(2, 'down'), '<strong>Tăng size sau chuỗi thua</strong>', '"Gỡ lại" là bản năng tự nhiên và là con đường nhanh nhất đến cháy tài khoản', 'Luật ngược lại: thua 3 lệnh liên tiếp → giảm nửa size'],
            [n(3, 'down'), '<strong>Giao dịch sai regime</strong>', 'Breakout trong range, bắt đáy trong downtrend — expectancy âm có hệ thống', 'Viết dòng regime trước khi mở screener. Không có dòng đó thì không giao dịch.'],
            [n(4, 'gold'), '<strong>Đuổi giá sau khi đã chạy</strong>', 'Stop buộc phải rộng ra → cùng mục tiêu giá đó chỉ còn 1R thay vì 3R', 'Bỏ lỡ là chuyện bình thường. Luôn còn lệnh khác vào tuần sau.'],
            [n(5, 'gold'), '<strong>Giữ lệnh qua earnings</strong>', 'Gap qua đêm xuyên thủng stop — rủi ro thật gấp 3–4 lần dự tính', 'Không mở lệnh mới nếu earnings trong 10 phiên tới'],
            [n(6, 'gold'), '<strong>Quá nhiều vị thế cùng sector</strong>', '4 lệnh trong XLK thực chất là một lệnh lớn gấp bốn', 'Tối đa 2 vị thế mỗi sector'],
            [n(7, 'blue'), '<strong>Chốt lời quá sớm, cắt lỗ quá muộn</strong>', 'Đảo ngược tỷ lệ R — thắng 0,8R nhưng thua 1,5R thì không hệ thống nào cứu được', 'Theo dõi MFE trong nhật ký để phát hiện thói quen này'],
            [n(8, 'blue'), '<strong>Đổi hệ thống sau vài lệnh thua</strong>', 'Không bao giờ tích lũy đủ dữ liệu để biết hệ thống nào thật sự hoạt động', 'Cam kết tối thiểu 50 lệnh trước khi đánh giá lại'],
          ]
        : [
            [n(1, 'down'), '<strong>Moving the stop as price approaches it</strong>', 'Turns a 1%-risk trade into a 5% loss. Doing it once wipes out five winners.', 'Place the stop when you enter and never widen it — tightening only'],
            [n(2, 'down'), '<strong>Increasing size after a losing streak</strong>', '"Winning it back" is the natural instinct and the fastest route to a blown account', 'The opposite rule: three losses in a row → half size'],
            [n(3, 'down'), '<strong>Trading the wrong regime</strong>', 'Breakouts in a range, bottom-fishing in a downtrend — systematically negative expectancy', 'Write the regime line before opening the screener. No line, no trading.'],
            [n(4, 'gold'), '<strong>Chasing after the move has already run</strong>', 'The stop is forced wider → the same price target now pays 1R instead of 3R', 'Missing one is normal. There is always another next week.'],
            [n(5, 'gold'), '<strong>Holding through earnings</strong>', 'An overnight gap goes through the stop — real risk is 3–4× what you planned', 'No new position if earnings fall within 10 sessions'],
            [n(6, 'gold'), '<strong>Too many positions in one sector</strong>', 'Four trades in XLK are really one trade four times the size', 'At most two positions per sector'],
            [n(7, 'blue'), '<strong>Taking profit too early, cutting losses too late</strong>', 'It inverts the R ratio — winning 0.8R while losing 1.5R cannot be saved by any system', 'Track MFE in the journal to catch the habit'],
            [n(8, 'blue'), '<strong>Changing systems after a few losses</strong>', 'You never accumulate enough data to know which system actually works', 'Commit to a minimum of 50 trades before re-evaluating'],
          ],
    ) +
      callout(
        'note',
        vi ? 'Một điểm cần trung thực' : 'One thing to be honest about',
        vi
          ? 'Mọi thông số cụ thể trong cẩm nang này — 21 EMA, 2R, 1,5× volume, top 3 sector, 5–7 phiên — là <b>điểm khởi đầu hợp lý để anh kiểm chứng</b>, không phải hằng số thiêng liêng. Chúng phổ biến vì logic đằng sau vững, không phải vì đã được chứng minh là tối ưu.'
          : 'Every specific number in this playbook — 21 EMA, 2R, 1.5× volume, top 3 sectors, 5–7 sessions — is a <b>reasonable starting point for you to verify</b>, not a sacred constant. They are common because the logic behind them is sound, not because they have been proven optimal.',
        vi
          ? 'Riêng về mẫu hình nến: các nghiên cứu về hiệu quả <i>độc lập</i> của chúng khá mâu thuẫn — bản thân hình dạng nến có lợi thế rất mỏng hoặc không có. Thứ tạo ra kết quả là <b>tổ hợp: vị trí + volume + xu hướng nền + xác nhận phiên sau</b>. Đừng đầu tư thời gian học thêm mẫu nến mới; hãy đầu tư vào việc kiểm chứng xem tổ hợp nào thực sự nâng được expectancy trên dữ liệu của chính anh.'
          : 'On candle patterns specifically: the research on their <i>standalone</i> effectiveness is contradictory — the shape on its own has a very thin edge, or none. What produces results is the <b>combination: location + volume + underlying trend + next-session confirmation</b>. Do not invest time in learning more patterns; invest it in verifying which combinations actually lift expectancy on your own data.',
      ) +
      callout(
        'bad',
        vi ? 'Lời cuối' : 'A closing word',
        vi
          ? 'Phần lớn nhà đầu tư cá nhân thua lỗ, và nguyên nhân chính thường là <b>quản lý vốn và tâm lý</b>, chứ không phải chọn sai setup. Thời gian của anh sẽ sinh lời cao hơn nhiều nếu dành cho luật rủi ro và kỷ luật ghi nhật ký, thay vì đi săn một mẫu hình vào lệnh tốt hơn. Tài liệu này là khung tham khảo để nghiên cứu và luyện tập — không phải lời khuyên đầu tư.'
          : 'Most retail traders lose money, and the main cause is usually <b>money management and psychology</b>, not picking the wrong setup. Your time compounds far better spent on risk rules and journal discipline than on hunting for a better entry pattern. This document is a framework for study and practice — it is not investment advice.',
      ),
  );
}

// ── page assembly ───────────────────────────────────────────────────────────

const NAV: [string, Bi][] = [
  ['funnel', { en: 'Principles', vi: 'Nguyên tắc' }],
  ['regime', { en: 'Regime', vi: 'Regime' }],
  ['vol', { en: 'Volatility', vi: 'Biến động' }],
  ['breadth', { en: 'Breadth', vi: 'Độ rộng' }],
  ['sector', { en: 'Sector', vi: 'Sector' }],
  ['inplay', { en: 'In-play', vi: 'In-play' }],
  ['playbook', { en: 'Playbook', vi: 'Playbook' }],
  ['candles', { en: 'Candles', vi: 'Nến' }],
  ['volume', { en: 'Volume', vi: 'Volume' }],
  ['others', { en: 'Other factors', vi: 'Yếu tố khác' }],
  ['scorecard', { en: 'Scorecard', vi: 'Chấm điểm' }],
  ['sizing', { en: 'Sizing', vi: 'Tính size' }],
  ['exit', { en: 'Exits', vi: 'Thoát lệnh' }],
  ['journal', { en: 'Journal', vi: 'Nhật ký' }],
  ['routine', { en: 'Routine', vi: 'Quy trình' }],
  ['mistakes', { en: 'Mistakes', vi: 'Sai lầm' }],
];

/**
 * The whole playbook as one markup string. Call `wireSwingPlaybook` on the
 * inserted element afterwards — without it the tabs, scorecard and calculator
 * are inert (but everything else, including all figures, still reads fine).
 */
export function swingPlaybookHtml(lang: Lang): string {
  const vi = lang === 'vi';
  const stats: [string, string, string][] = vi
    ? [
        ['up', '5', 'Setup chính'],
        ['gold', '4', 'Market regime'],
        ['blue', '3', 'Tầng lọc'],
        ['violet', '1%', 'Rủi ro tối đa/lệnh'],
      ]
    : [
        ['up', '5', 'Core setups'],
        ['gold', '4', 'Market regimes'],
        ['blue', '3', 'Filter layers'],
        ['violet', '1%', 'Max risk per trade'],
      ];

  return `<div class="card analysis-card swp">
    <div class="swp-hero">
      <div class="swp-eyebrow">${vi ? 'Cẩm nang thực chiến · Swing Trading' : 'Field manual · Swing trading'}</div>
      <h2 class="swp-title">${
        vi
          ? 'Playbook theo <span class="accent">Market Regime</span> — từ môi trường thị trường đến điểm vào lệnh'
          : 'A playbook organised by <span class="accent">market regime</span> — from the environment down to the entry'
      }</h2>
      <p class="swp-lede">${
        vi
          ? 'Không có "setup tốt nhất". Chỉ có setup <b>phù hợp với môi trường hiện tại</b>. Phần này đi theo đúng thứ tự mà một lệnh được sinh ra: xác định môi trường → chọn nhóm ngành → lọc cổ phiếu in-play → chờ tín hiệu → vào lệnh → thoát lệnh.'
          : 'There is no "best setup". There is only the setup that <b>fits the current environment</b>. This section follows the exact order in which a trade comes into existence: identify the environment → pick the sector → filter for in-play stocks → wait for the signal → enter → exit.'
      }</p>
      <div class="swp-stats">${stats
        .map(
          ([tone, big, label]) =>
            `<div class="swp-stat"><b class="swp-p-${tone}">${big}</b><span>${label}</span></div>`,
        )
        .join('')}</div>
      <nav class="swp-nav">${NAV.map(
        ([id, label]) =>
          `<button type="button" class="swp-chip" data-swp-goto="swp-${id}">${tx(label, lang)}</button>`,
      ).join('')}</nav>
    </div>
    ${s01(lang)}${s02(lang)}${s03(lang)}${s04(lang)}${s05(lang)}${s06(lang)}${s07(lang)}${s08(lang)}
    ${s09(lang)}${s10(lang)}${s11(lang)}${s12(lang)}${s13(lang)}${s14(lang)}${s15(lang)}${s16(lang)}
    <p class="swp-foot">${
      vi
        ? 'Cẩm nang Swing Trading · Playbook theo Market Regime — tài liệu học tập cá nhân, dùng để nghiên cứu và backtest.'
        : 'Swing-trading field manual · a regime-based playbook — personal study material, for research and backtesting.'
    }</p>
  </div>`;
}

// ── wiring ──────────────────────────────────────────────────────────────────

/**
 * Attach behaviour to an inserted playbook. Everything is scoped to `root` and
 * resolved through `data-swp-*`, so calling this twice on two different roots
 * (e.g. after a language switch re-renders the tab) keeps them independent.
 */
export function wireSwingPlaybook(root: HTMLElement, lang: Lang): void {
  const vi = lang === 'vi';
  const q = <T extends Element>(sel: string) => root.querySelector<T>(sel);
  const qa = <T extends Element>(sel: string) => Array.from(root.querySelectorAll<T>(sel));

  // -- nav chips ------------------------------------------------------------
  for (const chip of qa<HTMLButtonElement>('[data-swp-goto]')) {
    chip.addEventListener('click', () => {
      const id = chip.dataset.swpGoto;
      if (!id) return;
      root.ownerDocument.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // -- regime tabs ----------------------------------------------------------
  const tabs = qa<HTMLButtonElement>('[data-swp-tab]');
  const panels = qa<HTMLElement>('[data-swp-panel]');
  for (const t of tabs) {
    t.addEventListener('click', () => {
      for (const x of tabs) {
        const on = x === t;
        x.classList.toggle('active', on);
        x.setAttribute('aria-selected', on ? 'true' : 'false');
      }
      for (const p of panels) p.classList.toggle('active', p.dataset.swpPanel === t.dataset.swpTab);
    });
  }

  // -- scorecard ------------------------------------------------------------
  const musts = qa<HTMLInputElement>('input[data-swp-ck="must"]');
  const pluses = qa<HTMLInputElement>('input[data-swp-ck="plus"]');
  const mScore = q<HTMLElement>('[data-swp="mScore"]');
  const pScore = q<HTMLElement>('[data-swp="pScore"]');
  const verdict = q<HTMLElement>('[data-swp="verdict"]');

  function updateScore(): void {
    if (!mScore || !pScore || !verdict) return;
    const mOK = musts.filter((i) => i.checked).length;
    const pOK = pluses.filter((i) => i.checked).length;
    const allMust = mOK === musts.length;
    mScore.textContent = `${mOK}/${musts.length}`;
    pScore.textContent = `${pOK}/${pluses.length}`;
    mScore.style.color = allMust ? 'var(--accent)' : 'var(--danger)';
    pScore.style.color = pOK >= 4 ? 'var(--accent)' : 'var(--faint)';

    let title: string;
    let body: string;
    let col: string;
    if (!allMust) {
      title = vi ? '❌ KHÔNG VÀO LỆNH' : '❌ DO NOT TRADE';
      body = vi
        ? `Còn thiếu ${musts.length - mOK} điều kiện bắt buộc. Thiếu một là loại — không có ngoại lệ, không "gần đủ".`
        : `${musts.length - mOK} mandatory condition${
            musts.length - mOK === 1 ? '' : 's'
          } still missing. One missing and it is out — no exceptions, no "close enough".`;
      col = 'var(--danger)';
    } else if (pOK >= 6) {
      title = vi ? '✅ SETUP LOẠI A' : '✅ GRADE-A SETUP';
      body = vi
        ? `Đủ bắt buộc + ${pOK} điểm cộng. Đây là loại lệnh đáng vào full size theo regime.`
        : `All mandatory plus ${pOK} bonus points. This is the kind of trade worth full size for the regime.`;
      col = 'var(--accent)';
    } else if (pOK >= 4) {
      title = vi ? '✅ ĐỦ ĐIỀU KIỆN VÀO' : '✅ TRADEABLE';
      body = vi
        ? `Đủ bắt buộc + ${pOK} điểm cộng. Vào lệnh theo kế hoạch, size chuẩn.`
        : `All mandatory plus ${pOK} bonus points. Take it per the plan, standard size.`;
      col = 'var(--accent)';
    } else {
      title = vi ? '⚠️ CHƯA ĐỦ CHẤT LƯỢNG' : '⚠️ NOT GOOD ENOUGH';
      body = vi
        ? `Đủ bắt buộc nhưng chỉ ${pOK} điểm cộng (cần ≥4). Bỏ qua — luôn còn lệnh khác.`
        : `Mandatory is met but only ${pOK} bonus points (≥4 needed). Skip it — there is always another.`;
      col = 'var(--warn)';
    }
    verdict.style.borderColor = col;
    const b = verdict.querySelector('b');
    const s = verdict.querySelector('span');
    if (b) {
      b.textContent = title;
      (b as HTMLElement).style.color = col;
    }
    if (s) s.textContent = body;
  }

  for (const i of [...musts, ...pluses]) i.addEventListener('change', updateScore);
  q<HTMLButtonElement>('[data-swp="reset"]')?.addEventListener('click', () => {
    for (const i of [...musts, ...pluses]) i.checked = false;
    updateScore();
  });
  updateScore();

  // -- position size calculator --------------------------------------------
  const inputs = qa<HTMLInputElement>('[data-swp-calc]');
  const warn = q<HTMLElement>('[data-swp="calcWarn"]');
  const num = (key: string) => Number(q<HTMLInputElement>(`[data-swp-calc="${key}"]`)?.value ?? '0');
  const setOut = (key: string, text: string) => {
    const el = q<HTMLElement>(`[data-swp-out="${key}"]`);
    if (el) el.textContent = text;
  };
  // de-DE grouping: the account is in euros and the source page used it, so the
  // figures read the way the user's broker statement does.
  const fmt = (v: number, dp = 0) => v.toLocaleString('de-DE', { maximumFractionDigits: dp });

  function calc(): void {
    const acc = num('acc');
    const rk = num('risk');
    const en = num('entry');
    const st = num('stop');
    const tg = num('target');
    const riskAmt = (acc * rk) / 100;
    const perShare = en - st;
    const ok = perShare > 0 && acc > 0 && en > 0;
    const sh = ok ? Math.floor(riskAmt / perShare) : 0;
    const pos = sh * en;
    const stopPct = ok ? (perShare / en) * 100 : 0;
    const R = ok && tg > en ? (tg - en) / perShare : 0;
    const posPct = acc ? (pos / acc) * 100 : 0;

    setOut('risk', ok ? `${fmt(riskAmt)} €` : '—');
    setOut('shares', ok ? fmt(sh) : '—');
    setOut('pos', ok ? `${fmt(pos)} €` : '—');
    setOut('stopPct', ok ? `${stopPct.toFixed(1)}%` : '—');
    setOut('r', R ? `${R.toFixed(2)}R` : '—');
    const rEl = q<HTMLElement>('[data-swp-out="r"]');
    if (rEl) rEl.style.color = R >= 2 ? 'var(--accent)' : R > 0 ? 'var(--warn)' : 'var(--faint)';

    if (!warn) return;
    let msg = '';
    if (ok && stopPct > 12) {
      msg = vi
        ? `⚠️ Stop rộng ${stopPct.toFixed(1)}% — entry quá xa vùng tham chiếu. Chờ giá về gần hơn.`
        : `⚠️ A ${stopPct.toFixed(1)}% stop — the entry is too far from any reference level. Wait for price to come back.`;
    } else if (ok && R > 0 && R < 2) {
      msg = vi
        ? `⚠️ Chỉ ${R.toFixed(2)}R — dưới ngưỡng tối thiểu 2R. Bỏ qua lệnh này.`
        : `⚠️ Only ${R.toFixed(2)}R — below the 2R minimum. Skip this one.`;
    } else if (ok && posPct > 35) {
      msg = vi
        ? `⚠️ Vị thế chiếm ${posPct.toFixed(0)}% tài khoản. Stop hẹp là tốt nhưng đừng để một mã chi phối danh mục.`
        : `⚠️ The position is ${posPct.toFixed(0)}% of the account. A tight stop is good, but do not let one name dominate the portfolio.`;
    } else if (ok) {
      msg = vi
        ? `✅ Rủi ro ${rk}% = ${riskAmt.toFixed(0)}€. Stop ${stopPct.toFixed(1)}%, mục tiêu ${R.toFixed(2)}R.`
        : `✅ Risking ${rk}% = €${riskAmt.toFixed(0)}. Stop ${stopPct.toFixed(1)}%, target ${R.toFixed(2)}R.`;
    }
    warn.textContent = msg;
    warn.style.color = msg.startsWith('⚠️') ? 'var(--warn)' : 'var(--accent)';
  }

  for (const i of inputs) i.addEventListener('input', calc);
  calc();
}
