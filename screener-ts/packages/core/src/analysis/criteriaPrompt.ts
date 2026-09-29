/**
 * The "answer my remaining checklist questions, as of this date" prompt — and the parser
 * that takes the reply back.
 *
 * ── WHY THIS PROMPT EXISTS ──────────────────────────────────────────────────
 * Five of the twenty-six criteria cannot be measured from price data: overhead supply, the
 * earnings date, accelerating earnings, industry-group leadership, institutional accumulation.
 * They are the ones that need reading — filings, the sector, the chart's left edge — and they
 * are therefore the ones that sit unanswered, which the grader correctly treats as unknown and
 * which correctly costs the trade its letter.
 *
 * The user asked for "mot nut button ask chatgpt de chay mot prompt cho tat ca cac criteria con
 * lai (nhung cai yes or no) de user co the nghien cuu tai cai thoi diem trong qua khu do".
 * So this prompt is narrow on purpose: it does not ask for an opinion on the trade, it asks the
 * specific questions the app knows it cannot answer, and it hands over what the app DID measure
 * so the reply is grounded rather than generic.
 *
 * ── THE AS-OF DISCIPLINE ────────────────────────────────────────────────────
 * The date is the whole point, and it is the easiest thing in the world to get wrong: asked
 * about a 2024 setup, a model will happily explain that the group led — using a 2025 move that
 * had not happened yet. That is not a small error, it is the error that makes every case study
 * worthless, because it grades a decision with information the decider did not have. Hence the
 * repeated cut-off instruction and the demand that later information be named as later.
 *
 * ── WHY THE ANSWER IS MACHINE-READABLE ──────────────────────────────────────
 * The reply comes back as `key: YES` lines so `parseCriteriaAnswers` can tick the boxes and
 * paste the summary into the note. The alternative — the user reading a wall of prose and
 * clicking five tri-state buttons from memory — is where answers get transposed. UNKNOWN is a
 * first-class answer: it maps to "leave unanswered", which is exactly what the grader wants and
 * strictly better than a guess that moves the letter.
 *
 * PURE — string building and string parsing only. Bilingual (EN/VI).
 */
import type { PromptLang } from './researchPrompts.js';

/** One question to put, in the words the app puts it in. */
export interface CriterionAsk {
  /** The criterion key — echoed in the reply so the answer can be applied. */
  key: string;
  /** The question as the checklist words it. */
  label: string;
  /**
   * What the app means by a yes — its own written definition of the criterion.
   *
   * Sent because the label alone is not a standard: "no heavy overhead supply" is a phrase two
   * readers score differently, and the definition is what makes the model's answer comparable
   * to the user's own on the next card.
   */
  how?: string | null;
  /** Who asks for it (O'Neil, Minervini, Qullamaggie…) — it frames what counts as a yes. */
  authority?: string | null;
  /** Checklist weight, so the model spends its effort in proportion. */
  weight?: number | null;
}

/** Something the app measured itself, handed over as grounding. */
export interface MeasuredNote {
  label: string;
  met: boolean;
  measured?: string | null;
}

export interface CriteriaPromptContext {
  symbol: string;
  /** The date the research must be AS OF. Nothing after it may be used. */
  date: string;
  setup?: string | null;
  entry?: number | null;
  stop?: number | null;
  target?: number | null;
  /** Currency symbol for the levels, '$' or '€'. Display only. */
  cur?: string;
  /** The letter and score the app has so far, with the unanswered questions still unanswered. */
  grade?: string | null;
  score?: number | null;
  /** How much of the checklist weight is still unknown — why this prompt is worth running. */
  unknownWeight?: number | null;
  /** What the app already measured off the bars. */
  measured?: readonly MeasuredNote[];
  /** The questions. */
  asks: readonly CriterionAsk[];
}

const fin = (v: number | null | undefined): v is number => typeof v === 'number' && isFinite(v);

function levelsLine(c: CriteriaPromptContext, vi: boolean): string {
  const cur = c.cur ?? '';
  const parts: string[] = [];
  if (fin(c.entry)) parts.push(`${vi ? 'vào' : 'entry'} ${cur}${c.entry}`);
  if (fin(c.stop)) parts.push(`${vi ? 'cắt lỗ' : 'stop'} ${cur}${c.stop}`);
  if (fin(c.target)) parts.push(`${vi ? 'mục tiêu' : 'target'} ${cur}${c.target}`);
  return parts.join(' / ');
}

/**
 * What the app already knows, as grounding.
 *
 * Included for the same reason `caseContextBlock` includes the journal's numbers: it lets the
 * model DISAGREE. If the app measured "RS 91" and the model finds the stock was a laggard on
 * that date, that contradiction is worth more than either answer alone — and it can only
 * surface if the measurement is on the page.
 */
function measuredBlock(c: CriteriaPromptContext, vi: boolean): string {
  if (!c.measured?.length) return '';
  const head = vi
    ? 'ỨNG DỤNG ĐÃ TỰ ĐO ĐƯỢC (từ dữ liệu giá đến hết ngày trên — nếu bạn thấy khác, hãy nói rõ)'
    : 'WHAT THE APP MEASURED ITSELF (from price data up to that date — if you find otherwise, say so)';
  const lines = c.measured.map(
    (m) => `  ${m.met ? '[YES]' : '[NO ]'} ${m.label}${m.measured ? ` — ${m.measured}` : ''}`,
  );
  return `\n${head}\n${lines.join('\n')}\n`;
}

function asksBlock(c: CriteriaPromptContext, vi: boolean): string {
  return c.asks
    .map((a, i) => {
      const bits = [`${i + 1}. [${a.key}] ${a.label}`];
      if (a.authority) bits.push(`   ${vi ? 'Theo' : 'Per'}: ${a.authority}${fin(a.weight) ? ` · ${vi ? 'trọng số' : 'weight'} ${a.weight}` : ''}`);
      if (a.how) bits.push(`   ${vi ? 'Thế nào là CÓ' : 'What counts as a yes'}: ${a.how}`);
      return bits.join('\n');
    })
    .join('\n');
}

const EN = (c: CriteriaPromptContext): string => `# ROLE
You are a research assistant working in the O'Neil (CAN SLIM) / Minervini tradition. I am
reconstructing a trade decision as it stood on a specific date, and I need the checklist
questions that cannot be read off a price chart answered FROM REAL SOURCES.

# THE TRADE
${c.symbol.toUpperCase()}${c.setup ? ` · ${c.setup}` : ''} · decision date **${c.date}**
${levelsLine(c, false) ? `Levels I am planning: ${levelsLine(c, false)}\n` : ''}${
  c.grade || fin(c.score)
    ? `Where my checklist stands without these answers: ${c.grade ?? 'ungraded'}${fin(c.score) ? ` (${Math.round(c.score)}/100)` : ''}${fin(c.unknownWeight) && c.unknownWeight > 0 ? `, ${c.unknownWeight} points of weight still unanswered` : ''}\n`
    : ''
}
# THE CUT-OFF — THE MOST IMPORTANT RULE
Answer each question using ONLY information that existed on or before ${c.date}. Quarterly
reports published after that date, later price action, later analyst moves, later news: all
off-limits, however relevant they look. If the only evidence you can find is dated after
${c.date}, do not use it to answer — say "only later evidence found" and answer UNKNOWN.
Hindsight is the one thing that makes this exercise worthless.

# PROCEDURE
1. Look up real sources (filings, earnings releases dated before the cut-off, sector/industry
   performance over the months before it, volume and ownership data). DO NOT INVENT FIGURES.
2. For each question answer YES, NO or UNKNOWN. UNKNOWN is a real and respectable answer —
   it is strictly better than a guess, because a guess moves my position size.
3. Quote the evidence: the figure, the date, and where it came from.

# THE QUESTIONS
${asksBlock(c, false)}
${measuredBlock(c, false)}
# OUTPUT FORMAT — follow it exactly, it is parsed by the app
First, a block of one line per question, the key in square brackets exactly as given:

ANSWERS
[key]: YES|NO|UNKNOWN — one line of evidence with its date

Then, under the heading EXPLANATIONS, one short paragraph per question: what you found, the
figures, the source, and why it does or does not meet the criterion as its author meant it.

Then, under the heading SUMMARY, 3–6 sentences I can paste straight into my trade note: what
these answers say about the setup as of ${c.date}, the strongest point for it, the strongest
point against it, and what would have made the answer clearer. Plain prose, no bullet list.

# PRINCIPLES
- Real figures or nothing. "Data not found" beats a plausible number.
- Be the sceptic: name what argues against the trade, do not write a case for it.
- Educational analysis of a past decision, not investment advice.`;

const VI = (c: CriteriaPromptContext): string => `# VAI TRÒ
Bạn là trợ lý nghiên cứu theo trường phái O'Neil (CAN SLIM) / Minervini. Tôi đang dựng lại một
quyết định giao dịch đúng như nó ở một ngày cụ thể, và tôi cần bạn trả lời những tiêu chí
KHÔNG thể đọc ra từ biểu đồ giá, DỰA TRÊN NGUỒN THẬT.

# GIAO DỊCH
${c.symbol.toUpperCase()}${c.setup ? ` · ${c.setup}` : ''} · ngày quyết định **${c.date}**
${levelsLine(c, true) ? `Các mức tôi dự định: ${levelsLine(c, true)}\n` : ''}${
  c.grade || fin(c.score)
    ? `Bảng tiêu chí của tôi khi chưa có các câu trả lời này: ${c.grade ?? 'chưa xếp hạng'}${fin(c.score) ? ` (${Math.round(c.score)}/100)` : ''}${fin(c.unknownWeight) && c.unknownWeight > 0 ? `, còn ${c.unknownWeight} điểm trọng số chưa trả lời` : ''}\n`
    : ''
}
# MỐC CHẶN THỜI GIAN — QUY TẮC QUAN TRỌNG NHẤT
Chỉ dùng thông tin đã tồn tại VÀO hoặc TRƯỚC ngày ${c.date}. Báo cáo quý công bố sau ngày đó,
diễn biến giá sau đó, khuyến nghị analyst sau đó, tin sau đó: đều không được dùng, dù trông có
liên quan đến mấy. Nếu bằng chứng duy nhất bạn tìm được có ngày sau ${c.date}, đừng dùng nó để
trả lời — hãy ghi "chỉ tìm thấy bằng chứng sau ngày đó" và trả lời UNKNOWN. Nhìn lại bằng kết
quả đã biết là thứ duy nhất làm bài tập này trở nên vô nghĩa.

# QUY TRÌNH
1. Tra nguồn thật (báo cáo tài chính, thông cáo earnings có ngày trước mốc chặn, hiệu suất
   ngành trong các tháng trước đó, dữ liệu khối lượng và sở hữu). KHÔNG bịa số.
2. Mỗi câu trả lời YES, NO hoặc UNKNOWN. UNKNOWN là câu trả lời thật và đáng trọng — nó tốt hơn
   phỏng đoán, vì phỏng đoán sẽ làm thay đổi cỡ vị thế của tôi.
3. Dẫn bằng chứng: con số, ngày, và nguồn.

# CÁC CÂU HỎI
${asksBlock(c, true)}
${measuredBlock(c, true)}
# ĐỊNH DẠNG ĐẦU RA — làm đúng như vậy, ứng dụng sẽ đọc lại tự động
Trước tiên, mỗi câu hỏi một dòng, giữ nguyên key trong ngoặc vuông:

ANSWERS
[key]: YES|NO|UNKNOWN — một dòng bằng chứng kèm ngày

Sau đó, dưới tiêu đề EXPLANATIONS, mỗi câu hỏi một đoạn ngắn: bạn tìm được gì, số liệu, nguồn,
và vì sao nó đạt hay không đạt tiêu chí theo đúng ý tác giả đặt ra tiêu chí đó.

Sau đó, dưới tiêu đề SUMMARY, 3–6 câu để tôi dán thẳng vào ghi chú kế hoạch: các câu trả lời
này nói gì về mẫu hình tại ngày ${c.date}, điểm mạnh nhất, điểm đáng lo nhất, và điều gì sẽ làm
câu trả lời rõ ràng hơn. Viết văn xuôi, không gạch đầu dòng.

# NGUYÊN TẮC
- Số thật hoặc không có gì. "Không tìm thấy dữ liệu" tốt hơn một con số nghe hợp lý.
- Hãy đóng vai người hoài nghi: nêu điều phản đối giao dịch, đừng viết bài bào chữa cho nó.
- Đây là phân tích giáo dục về một quyết định trong quá khứ, không phải khuyến nghị đầu tư.`;

/** Build the prompt for the questions the app cannot answer itself. */
export function buildCriteriaPrompt(
  c: CriteriaPromptContext,
  lang: PromptLang = 'en',
): string {
  return lang === 'vi' ? VI(c) : EN(c);
}

// ---------------------------------------------------------------------------
// Reading the reply back
// ---------------------------------------------------------------------------

export interface ParsedCriteriaReply {
  /** Keys answered yes/no. UNKNOWN is deliberately absent — see `unknown`. */
  answers: Record<string, boolean>;
  /** Keys explicitly answered UNKNOWN, so the caller can CLEAR any previous answer. */
  unknown: string[];
  /** The evidence line that came with each answered key, if any. */
  evidence: Record<string, string>;
  /** Everything under the SUMMARY heading, for pasting into the note. */
  summary: string;
}

/**
 * `[key]: YES — because…`, `1. **key**: yes`, `- [key] : UNKNOWN`, `key = KHÔNG` — all one shape.
 *
 * The leading class eats list markers and bold stars; the trailing lookahead does the job `\b`
 * cannot, because `CÓ` ends in a letter JavaScript's `\w` does not recognise and `\b` would
 * therefore refuse the match at the end of a line.
 */
const LINE =
  /^\s*[-*_\d.)\s]*\[?\s*([A-Za-z][A-Za-z0-9_]{2,40})\s*\]?[*_\s]*[:=]\s*[*_]*(YES|NO|UNKNOWN|KHÔNG RÕ|KHÔNG|CÓ)(?![\p{L}])[\s—–:*_-]*(.*)$/iu;

const YES = new Set(['yes', 'có']);
const NO = new Set(['no', 'không']);

/**
 * Take a ChatGPT reply apart into answers and a summary.
 *
 * ── WHY IT IS FORGIVING ABOUT SHAPE AND STRICT ABOUT KEYS ───────────────────
 * The model will not always obey the format: it may number the lines, bold the keys, or drop
 * the brackets. None of that changes what it meant, so the line pattern tolerates all of it.
 * What is NOT tolerated is a key the caller did not ask about — `allowed` filters those out —
 * because the cost of a wrong match is a criterion silently answered for the user, and this
 * reply is going straight into a score that sizes a position.
 *
 * Unrecognised text is ignored rather than reported: the reply is prose with a block in it,
 * and a parser that complained about the prose would fire every single time.
 */
export function parseCriteriaAnswers(
  text: string,
  allowed?: readonly string[],
): ParsedCriteriaReply {
  const ok = allowed?.length ? new Set(allowed) : null;
  const answers: Record<string, boolean> = {};
  const unknown: string[] = [];
  const evidence: Record<string, string> = {};

  for (const raw of (text ?? '').split(/\r?\n/)) {
    const m = LINE.exec(raw);
    if (!m) continue;
    const key = m[1]!;
    if (ok && !ok.has(key)) continue;
    const verdict = m[2]!.toLowerCase();
    const why = (m[3] ?? '').trim();
    if (YES.has(verdict)) answers[key] = true;
    else if (NO.has(verdict)) answers[key] = false;
    else {
      // UNKNOWN: recorded separately so the caller can clear a previous answer rather than
      // leave a stale yes standing next to an explanation that says nothing is known.
      if (!unknown.includes(key)) unknown.push(key);
      delete answers[key];
    }
    if (why) evidence[key] = why;
  }

  return { answers, unknown, evidence, summary: extractSummary(text ?? '') };
}

/**
 * The summary paragraph, or ''.
 *
 * Takes everything from the SUMMARY heading to the end rather than to the next heading: the
 * format asks for it last, and truncating at a stray "Note:" the model added afterwards would
 * quietly drop the end of the paragraph the user is about to file.
 */
export function extractSummary(text: string): string {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) =>
    /^\s*[#*\s]*(summary|tóm tắt|tom tat|tổng kết|tong ket)\b[\s:*#]*$/i.test(l) ||
    /^\s*[#*\s]*(summary|tóm tắt|tổng kết)\b.{0,40}[:）)]\s*$/i.test(l),
  );
  if (at < 0) return '';
  return lines
    .slice(at + 1)
    .join('\n')
    .replace(/^[\s*_#-]+/, '')
    .trim();
}
