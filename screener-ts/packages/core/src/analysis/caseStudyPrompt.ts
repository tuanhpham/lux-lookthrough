/**
 * The Case Study research prompt — a breakout post-mortem in the Minervini (VCP) /
 * O'Neil (CAN SLIM) idiom.
 *
 * Unlike the stock-modal prompts, this one is deliberately a PROCEDURE rather than
 * a question. A case study is written after the fact, which is exactly when
 * hindsight is most convincing and least reliable: the outcome is known, so any
 * narrative that explains it feels correct. So the prompt forces the order of work
 * — look up real OHLCV first, verify the breakout date, compute the volume ratios,
 * and only then interpret — and it demands the red flags be listed alongside the
 * strengths.
 *
 * Two instructions carry most of the weight and must not be softened:
 *
 *  - "say you could not find the data instead of guessing". A fabricated volume
 *    ratio is worse than a missing one, because the whole case study is then filed
 *    as evidence and cited later.
 *  - the date-verification step. The user's key date is a memory; if the real
 *    breakout was two sessions later, every ratio computed around the stated date
 *    describes the wrong session. Letting the model silently accept the given date
 *    produces a confident analysis of a day that did not matter.
 *
 * PURE — string building only. Bilingual (EN/VI).
 */
import type { PromptLang } from './researchPrompts.js';

/** What the app knows about a case study, as far as the journal was filled in. */
export interface CaseStudyPromptContext {
  symbol: string;
  /** The pivotal date the study is centred on (breakout / entry day). */
  keyDate: string;
  /** Free text: 'VCP', 'Episodic Pivot', 'Mean Reversion', … */
  setupType?: string | null;
  title?: string | null;
  entry?: number | null;
  stop?: number | null;
  target?: number | null;
  exitDate?: string | null;
  exitPrice?: number | null;
  rMultiple?: number | null;
  /** 'win' | 'loss' | 'open' | 'scratch' — the journal's own verdict. */
  outcome?: string | null;
  /** Subjective A–D grade, '' or absent when ungraded. */
  rating?: string | null;
  /** Dated catalysts already recorded in the journal. */
  catalysts?: readonly { date: string; text: string }[];
  /** Titles of other case studies, for the comparison table. */
  otherCases?: readonly string[];
}

const fin = (v: number | null | undefined): v is number => typeof v === 'number' && isFinite(v);

/** Strip HTML so a rich-text catalyst note arrives as plain prose. */
function plain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The "what I already recorded" block.
 *
 * Handing over the journal's own numbers matters for a reason specific to case
 * studies: it lets the model CONTRADICT them. If the user recorded an entry at
 * 145.5 but the real breakout closed at 151, that discrepancy is the finding — and
 * it is only reachable if the model can see what was claimed.
 */
export function caseContextBlock(
  c: CaseStudyPromptContext,
  lang: PromptLang = 'en',
): string {
  const vi = lang === 'vi';
  const L: string[] = [];
  const add = (k: string, v: string): void => {
    L.push(`${k}: ${v}`);
  };

  add(vi ? 'Mã' : 'Symbol', c.symbol.toUpperCase());
  add(vi ? 'Ngày then chốt tôi đã ghi' : 'Key date I recorded', c.keyDate);
  if (c.setupType) add(vi ? 'Loại mẫu hình' : 'Pattern type', c.setupType);
  if (c.title) add(vi ? 'Tiêu đề hồ sơ' : 'Case title', c.title);

  const lv: string[] = [];
  if (fin(c.entry)) lv.push(`${vi ? 'mua' : 'entry'} ${c.entry}`);
  if (fin(c.stop)) lv.push(`${vi ? 'cắt lỗ' : 'stop'} ${c.stop}`);
  if (fin(c.target)) lv.push(`${vi ? 'mục tiêu' : 'target'} ${c.target}`);
  if (lv.length) add(vi ? 'Mức tôi đã ghi' : 'Levels I recorded', lv.join(' / '));

  if (c.exitDate || fin(c.exitPrice)) {
    add(
      vi ? 'Thoát lệnh' : 'Exit',
      `${c.exitDate ?? '?'} @ ${fin(c.exitPrice) ? c.exitPrice : '?'}`,
    );
  }
  if (fin(c.rMultiple)) add(vi ? 'Kết quả R' : 'Realized R', `${c.rMultiple}R`);
  if (c.outcome) add(vi ? 'Kết quả' : 'Outcome', c.outcome);
  if (c.rating) add(vi ? 'Tôi tự xếp hạng' : 'My own grade', c.rating);

  if (c.catalysts?.length) {
    // Filter on the STRIPPED text, not on the assembled line: an editor that saved
    // `<p><br></p>` for an empty note yields a line that is long enough to look
    // real, and "2026-01-07:" with nothing after it reads as a catalyst the model
    // must account for.
    const lines = c.catalysts
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((k) => ({ date: k.date, text: plain(k.text) }))
      .filter((k) => k.text.length > 0)
      .map((k) => `  - ${k.date}: ${k.text}`);
    if (lines.length) {
      L.push(`${vi ? 'Chất xúc tác tôi đã ghi' : 'Catalysts I recorded'}:`);
      L.push(...lines);
    }
  }

  if (c.otherCases?.length) {
    add(
      vi ? 'Các hồ sơ khác của tôi' : 'My other case studies',
      c.otherCases.join('; '),
    );
  }

  const head = vi
    ? 'DỮ LIỆU TÔI ĐÃ GHI TRONG HỒ SƠ (hãy kiểm chứng, đừng tin ngay — nếu số liệu thực tế khác, hãy nói rõ)'
    : 'WHAT MY JOURNAL RECORDS (verify it, do not take it on trust — if the real data differs, say so)';
  return `${head}\n${L.join('\n')}`;
}

const EN = (c: CaseStudyPromptContext): string => `# ROLE
You are a technical analyst specializing in breakout patterns in the Minervini
(VCP) and O'Neil (CAN SLIM) tradition. Analyse the case study below objectively,
from REAL LOOKED-UP DATA. Do not speculate.

# INPUT
${c.symbol.toUpperCase()} · ${c.setupType || 'breakout'} · key date ${c.keyDate}

# REQUIRED PROCEDURE (in this order)
1. LOOK UP REAL DATA. Use web search / browsing to get actual data around the key
   date. DO NOT INVENT NUMBERS. If the key date is past your knowledge cutoff,
   looking it up is mandatory, not optional.
   - Daily price & volume from ~10 sessions BEFORE the key date to ~5 sessions
     AFTER it. Prefer sources with a real daily OHLCV table (StatMuse,
     Macrotrends, Stockanalysis).
   - Catalysts: company news, earnings, deals/contracts, industry events (CES,
     GTC…), management changes, analyst target changes — each with its EXACT date.
2. VERIFY AND CORRECT. If the actual breakout date differs from the key date I
   gave, say so plainly and explain why (breakout spread over several sessions, or
   the catalyst landed later). Check for anything that distorts the data: stock
   split, reverse split, spin-off.

# METRICS YOU MUST COMPUTE
- Breakout-session price gain (close-to-close %).
- Breakout volume vs (a) the prior session, (b) the ~5–7 session average before it
  — expressed as "Nx".
- The lowest volume dry-up session inside the base (the pivot).
- Follow-through quality: does volume in the following sessions build, taper
  evenly, or collapse?

# QUALITY ASSESSMENT (state each)
- Structure: single-session pop / gradual momentum / breakout spread over days.
- Base quality: growing sector leader vs turnaround or event-driven.
- Catalyst timing: same day as the breakout / catalyst arrived after / already-known theme.
- Front-runnable: could this have been on a watchlist beforehand, or only chased?
- RED FLAGS if present: reverse split, thin liquidity, analysts still sceptical, no
  institutional accumulation, price too extended above the pivot (high entry risk).

# OUTPUT FORMAT
1. Daily price & volume table (columns: Date | Close | Volume | Note), with the
   pivot session and the breakout session clearly marked.
2. VCP quality assessment (volume dry-up, volume ratio, price thrust, follow-through).
3. Catalyst sequence — ONE catalyst per line, each with its specific date.
4. Key lessons (2–4 points), covering both strengths and warnings.
5. A short comparison table against my other cases, if any are listed below.

# PRINCIPLES
- Always work from real figures. If you cannot find them, say "data not found"
  rather than guessing.
- Be objective: name the weaknesses and red flags, do not flatter a successful
  case (avoid survivorship bias).
- Note briefly: this is educational pattern analysis, NOT investment advice; you
  are not a financial adviser; stress risk management (stop-loss, position sizing).
- If I ask, also produce an English summary I can file with the case study.

${caseContextBlock(c, 'en')}`;

const VI = (c: CaseStudyPromptContext): string => `# ROLE
Bạn là một trợ lý phân tích kỹ thuật chuyên sâu về mẫu hình breakout theo trường
phái Minervini (VCP) và O'Neil (CAN SLIM). Nhiệm vụ của bạn là phân tích một case
study cổ phiếu cụ thể một cách khách quan, dựa trên DỮ LIỆU THỰC TẾ tra cứu được,
không suy đoán.

# INPUT
${c.symbol.toUpperCase()} · ${c.setupType || 'breakout'} · key date ${c.keyDate}

# QUY TRÌNH BẮT BUỘC (thực hiện tuần tự)
1. TRA CỨU DỮ LIỆU THỰC: Luôn dùng công cụ tìm kiếm/truy cập web để lấy dữ liệu
   thật quanh key date. KHÔNG được bịa số liệu. Nếu key date nằm sau mốc kiến thức
   của bạn, phải tra cứu bắt buộc.
   - Lấy dữ liệu giá & khối lượng theo ngày cho khoảng: từ ~10 phiên TRƯỚC key date
     đến ~5 phiên SAU key date (ưu tiên nguồn có bảng OHLCV theo ngày như StatMuse,
     Macrotrends, Stockanalysis).
   - Tra cứu catalyst: tin tức công ty, earnings, deal/hợp đồng, sự kiện ngành
     (CES, GTC...), thay đổi lãnh đạo, nâng/hạ giá mục tiêu của analyst — kèm NGÀY
     chính xác của từng tin.
2. XÁC MINH & HIỆU CHỈNH: Nếu ngày breakout thực tế lệch với key date tôi đưa, hãy
   nói rõ và giải thích (ví dụ breakout kéo dài nhiều phiên, hoặc catalyst đến
   sau). Kiểm tra các yếu tố gây méo dữ liệu: stock split, reverse split, spin-off.

# CÁC CHỈ SỐ PHẢI TÍNH
- Mức tăng giá phiên breakout (close-to-close %).
- Khối lượng phiên breakout so với: (a) phiên liền trước, (b) trung bình ~5–7 phiên
  trước đó → ghi thành tỷ lệ "Nx".
- Nhận diện phiên volume dry-up thấp nhất trong nền (pivot).
- Chất lượng follow-through: volume các phiên sau tăng dần, giảm đều, hay sụp mạnh?

# ĐÁNH GIÁ CHẤT LƯỢNG (bắt buộc nêu)
Phân loại case theo các trục:
- Cấu trúc: nổ 1 phiên / momentum dần / breakout kéo dài nhiều phiên.
- Chất lượng nền tảng: leader ngành đang tăng trưởng vs turnaround/event-driven.
- Timing catalyst: trùng ngày breakout / catalyst đến sau / thematic đã biết trước.
- Tính "đón đầu được" (front-runnable): có thể vào watchlist trước không, hay chỉ
  theo sau được?
- Nêu rõ CỜ ĐỎ nếu có: reverse split, thanh khoản mỏng, analyst vẫn hoài nghi,
  thiếu institutional accumulation, giá quá extended so với pivot (rủi ro entry cao).

# ĐỊNH DẠNG ĐẦU RA
Trình bày gồm:
1. Bảng dữ liệu giá & khối lượng theo ngày (cột: Ngày | Đóng cửa | Khối lượng |
   Ghi chú), đánh dấu rõ phiên pivot và phiên breakout.
2. Đánh giá chất lượng VCP (volume dry-up, tỷ lệ volume, price thrust,
   follow-through).
3. Chuỗi catalyst — MỖI catalyst một dòng, kèm ngày cụ thể.
4. Bài học mấu chốt (2–4 điểm), nêu cả điểm mạnh và cảnh báo.
5. Nếu tôi đã có các case trước (liệt kê bên dưới), thêm 1 bảng so sánh ngắn với
   các case đó.

# NGUYÊN TẮC
- Luôn dựa trên số liệu thật; nếu không tra được, nói thẳng
  "không tìm thấy dữ liệu" thay vì đoán.
- Khách quan: nêu cả điểm yếu/cờ đỏ, không chỉ tô hồng case thành công (tránh
  survivorship bias).
- Nhắc ngắn gọn: đây là phân tích giáo dục về mẫu hình,
  KHÔNG phải khuyến nghị đầu tư; AI không phải cố vấn tài chính; nhấn mạnh quản trị
  rủi ro (stop-loss, position sizing).
- Nếu tôi yêu cầu, xuất thêm bản tóm tắt tiếng Anh để lưu case study.

${caseContextBlock(c, 'vi')}`;

/**
 * Build the case-study analysis prompt.
 *
 * The journal's own numbers are appended so the model can check them — see
 * `caseContextBlock`. The user's recorded key date is passed through as INPUT but
 * the procedure explicitly asks for it to be verified, because a case study built
 * around the wrong session is worse than none.
 */
export function buildCaseStudyPrompt(
  c: CaseStudyPromptContext,
  lang: PromptLang = 'en',
): string {
  return lang === 'vi' ? VI(c) : EN(c);
}
