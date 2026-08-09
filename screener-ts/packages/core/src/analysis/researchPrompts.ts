/**
 * Research prompts for a single stock — four questions worth asking an LLM about
 * a name you are considering, each pre-filled with the numbers this app already
 * computed.
 *
 * Why pre-fill at all: an LLM asked "is NVDA a good buy" answers from whatever
 * it half-remembers about the ticker, and the reply reads plausible regardless of
 * whether the stock is at a pivot or 30% below one. Handing it the measured state
 * — price, pivot, distance, prior advance, contractions, RS, the next dated
 * catalyst — moves the question from recall to reasoning about a specific
 * situation, and makes a wrong answer visibly wrong instead of vaguely wrong.
 *
 * Every prompt therefore ends by asking what would DISPROVE its own conclusion.
 * The failure mode of this feature is a confident narrative that agrees with
 * whatever the user already wanted to do; naming the falsifier is the cheapest
 * available guard against it.
 *
 * Two things this module deliberately does NOT do:
 *  - invent numbers. A field the app doesn't have is omitted from the context
 *    block, never guessed or zero-filled, because a fabricated pivot is worse
 *    than a missing one.
 *  - claim recency. The model's knowledge cutoff is unknown here, so prompts ask
 *    it to state the as-of date of anything it asserts and to flag what it cannot
 *    verify, rather than being told to "use the latest data".
 *
 * PURE — string building only, no fetching, no DOM. Bilingual (EN/VI).
 */

export type PromptLang = 'en' | 'vi';

/** The measured state of one stock, as far as the app knows it. All optional. */
export interface StockPromptContext {
  symbol: string;
  name?: string | null;
  sector?: string | null;
  industry?: string | null;
  price?: number | null;
  currency?: string | null;
  marketCap?: number | null;
  /** QM setup label ('VCP', 'EPISODIC_PIVOT', 'BOTH', 'NONE'). */
  setupType?: string | null;
  qualityScore?: number | null;
  pivot?: number | null;
  entryPrice?: number | null;
  stopLoss?: number | null;
  targetPrice?: number | null;
  /** Distance to the pivot as a % of price (negative = above the pivot). */
  distanceToPivotPct?: number | null;
  previousAdvancePct?: number | null;
  vcpContractions?: number | null;
  volumeContractionPct?: number | null;
  atrContractionPct?: number | null;
  baseDepthPct?: number | null;
  momentumScore?: number | null;
  relativeStrength?: number | null;
  return1mPct?: number | null;
  return3mPct?: number | null;
  return6mPct?: number | null;
  atrPct?: number | null;
  distanceFrom52wHighPct?: number | null;
  peRatio?: number | null;
  eps?: number | null;
  roe?: number | null;
  profitMargin?: number | null;
  revenueGrowthPct?: number | null;
  /** Trend gate verdict from the QM scan. */
  trendPassed?: boolean | null;
  /** The soonest dated catalyst, when the calendar has one. */
  nextEventDate?: string | null;
  nextEventTitle?: string | null;
  nextEventKind?: string | null;
  /** True when that date is an estimate rather than a confirmed one. */
  nextEventEstimated?: boolean | null;
  /** Market regime label ('BULL' | 'TRANSITION' | 'BEAR'), when known. */
  marketRegime?: string | null;
  /** Today, `YYYY-MM-DD` — so the model can reason about "soon". */
  today?: string | null;
}

export type ResearchPromptId = 'market' | 'events' | 'accumulation' | 'fundamentals';

export interface ResearchPrompt {
  id: ResearchPromptId;
  title: string;
  /** One line on what the answer is for. */
  goal: string;
  /** The full prompt text, context block included. */
  body: string;
}

const TITLES: Record<ResearchPromptId, Record<PromptLang, string>> = {
  market: {
    en: 'Market context & impact',
    vi: 'Bối cảnh thị trường & mức ảnh hưởng',
  },
  events: {
    en: 'Major events & catalysts',
    vi: 'Sự kiện lớn & chất xúc tác',
  },
  accumulation: {
    en: 'Accumulation & institutional participation',
    vi: 'Dấu hiệu tích lũy & tổ chức lớn tham gia',
  },
  fundamentals: {
    en: 'Fundamental analysis',
    vi: 'Phân tích cơ bản',
  },
};

const GOALS: Record<ResearchPromptId, Record<PromptLang, string>> = {
  market: {
    en: 'Decide whether the current market lets you take this trade at all.',
    vi: 'Quyết định xem thị trường hiện tại có cho phép vào lệnh này hay không.',
  },
  events: {
    en: 'Find the dated events that could move it before your thesis plays out.',
    vi: 'Tìm các sự kiện có ngày cụ thể có thể tác động trước khi luận điểm kịp diễn ra.',
  },
  accumulation: {
    en: 'Judge whether large money is building a position or leaving.',
    vi: 'Đánh giá xem dòng tiền lớn đang gom vào hay đang rút ra.',
  },
  fundamentals: {
    en: 'Check the business actually justifies the technical setup.',
    vi: 'Kiểm tra doanh nghiệp có thực sự xứng với thiết lập kỹ thuật hay không.',
  },
};

const num = (v: number, d = 2): string => {
  const r = Number(v.toFixed(d));
  return String(r);
};

/** Compact human money formatting for the context block ($1.2B, $940M). */
function bigMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${num(v / 1e12, 2)}T`;
  if (abs >= 1e9) return `$${num(v / 1e9, 2)}B`;
  if (abs >= 1e6) return `$${num(v / 1e6, 1)}M`;
  return `$${num(v, 0)}`;
}

/**
 * The shared "here is what I measured" block.
 *
 * Only fields that are actually present are emitted. An absent line means the
 * app does not know that number — which the prompt then tells the model to treat
 * as unknown rather than assume. Emitting `pivot: null` instead would invite the
 * model to fill the gap, and a hallucinated pivot silently corrupts every trade
 * level derived from it.
 */
export function contextBlock(c: StockPromptContext, lang: PromptLang = 'en'): string {
  const vi = lang === 'vi';
  const L: string[] = [];
  const add = (label: string, value: string | null): void => {
    if (value !== null) L.push(`- ${label}: ${value}`);
  };
  const n = (v: number | null | undefined, d = 2): string | null =>
    v == null || !Number.isFinite(v) ? null : num(v, d);
  const p = (v: number | null | undefined, d = 1): string | null => {
    const s = n(v, d);
    return s === null ? null : `${s}%`;
  };

  const ccy = c.currency && c.currency !== 'USD' ? ` ${c.currency}` : '';

  add(vi ? 'Mã' : 'Symbol', c.symbol.toUpperCase());
  add(vi ? 'Tên' : 'Company', c.name ?? null);
  add(
    vi ? 'Ngành' : 'Sector / industry',
    c.sector || c.industry ? [c.sector, c.industry].filter(Boolean).join(' / ') : null,
  );
  add(vi ? 'Hôm nay' : 'Today', c.today ?? null);
  const price = n(c.price);
  add(vi ? 'Giá' : 'Price', price === null ? null : `${price}${ccy}`);
  add(vi ? 'Vốn hóa' : 'Market cap', c.marketCap != null ? bigMoney(c.marketCap) : null);
  add(vi ? 'Trạng thái thị trường' : 'Market regime', c.marketRegime ?? null);

  // ── Technical state (from this app's own scan). ──
  add(vi ? 'Thiết lập (QM)' : 'Setup (QM)', c.setupType ?? null);
  add(vi ? 'Điểm chất lượng' : 'Quality score', n(c.qualityScore, 0) === null ? null : `${n(c.qualityScore, 0)}/100`);
  add(
    vi ? 'Bộ lọc xu hướng' : 'Trend filter',
    c.trendPassed == null ? null : c.trendPassed ? (vi ? 'đạt' : 'passed') : vi ? 'chưa đạt' : 'failed',
  );
  add('Pivot', n(c.pivot));
  add(vi ? 'Khoảng cách tới pivot' : 'Distance to pivot', p(c.distanceToPivotPct));
  add(vi ? 'Điểm mua / cắt lỗ / mục tiêu' : 'Entry / stop / target',
    c.entryPrice != null || c.stopLoss != null || c.targetPrice != null
      ? [n(c.entryPrice), n(c.stopLoss), n(c.targetPrice)].map((x) => x ?? '?').join(' / ')
      : null);
  add(vi ? 'Nhịp tăng trước nền' : 'Prior advance', p(c.previousAdvancePct));
  add(vi ? 'Số lần co thắt' : 'VCP contractions', c.vcpContractions == null ? null : String(c.vcpContractions));
  add(vi ? 'Độ sâu nền' : 'Base depth', p(c.baseDepthPct));
  add(vi ? 'Khối lượng cạn' : 'Volume contraction', p(c.volumeContractionPct));
  add(vi ? 'ATR co lại' : 'ATR contraction', p(c.atrContractionPct));
  add(vi ? 'Điểm động lượng' : 'Momentum score', n(c.momentumScore, 0) === null ? null : `${n(c.momentumScore, 0)}/100`);
  add(vi ? 'Sức mạnh tương đối' : 'Relative strength', n(c.relativeStrength, 1));
  const rets = [c.return1mPct, c.return3mPct, c.return6mPct];
  add(
    vi ? 'Lợi nhuận 1M / 3M / 6M' : 'Returns 1M / 3M / 6M',
    rets.some((r) => r != null) ? rets.map((r) => (r == null ? '?' : `${num(r, 1)}%`)).join(' / ') : null,
  );
  add('ATR %', p(c.atrPct));
  add(vi ? 'Cách đỉnh 52 tuần' : 'Below 52w high', p(c.distanceFrom52wHighPct));

  // ── Fundamentals the app has. ──
  add('P/E (TTM)', n(c.peRatio, 1));
  add('EPS (TTM)', n(c.eps));
  add('ROE', p(c.roe));
  add(vi ? 'Biên lợi nhuận' : 'Profit margin', p(c.profitMargin));
  add(vi ? 'Tăng trưởng doanh thu (YoY)' : 'Revenue growth (YoY)', p(c.revenueGrowthPct));

  // ── The next dated catalyst. Estimated dates are labelled, always. ──
  if (c.nextEventDate) {
    const est = c.nextEventEstimated
      ? vi ? ' (ngày DỰ KIẾN, có thể thay đổi)' : ' (ESTIMATED date, may shift)'
      : '';
    const what = c.nextEventTitle ?? c.nextEventKind ?? (vi ? 'sự kiện' : 'event');
    add(vi ? 'Sự kiện gần nhất' : 'Next catalyst', `${c.nextEventDate} — ${what}${est}`);
  }

  const header = vi
    ? 'DỮ LIỆU ĐO ĐƯỢC (từ hệ thống của tôi — hãy dùng đúng những số này, đừng tự thay):'
    : 'MEASURED DATA (from my own system — use these exact numbers, do not substitute your own):';
  const footer = vi
    ? 'Bất kỳ chỉ số nào không có trong danh sách trên là KHÔNG BIẾT. Đừng suy đoán — hãy nói rõ là bạn cần nó.'
    : 'Any metric not listed above is UNKNOWN. Do not invent it — say you need it.';

  return `${header}\n${L.join('\n')}\n${footer}`;
}

/** The shared discipline every prompt ends with. */
function tail(lang: PromptLang): string {
  return lang === 'vi'
    ? `\nYêu cầu về cách trả lời:
- Nêu rõ điều gì bạn KHÔNG kiểm chứng được, và mốc thời gian của thông tin bạn dùng.
- Kết thúc bằng một dòng: "Điều sẽ chứng minh tôi sai:" — nêu bằng chứng cụ thể sẽ phủ định kết luận của bạn.
- Không đưa lời khuyên mua/bán. Tôi tự ra quyết định; bạn cung cấp bằng chứng và rủi ro.`
    : `\nHow to answer:
- State explicitly what you could NOT verify, and the as-of date of anything you assert.
- End with one line: "What would prove me wrong:" — the specific evidence that would overturn your conclusion.
- Do not give a buy/sell recommendation. I make the decision; you supply evidence and risks.`;
}

const BODIES: Record<ResearchPromptId, Record<PromptLang, string>> = {
  market: {
    en: `You are a market strategist. I am evaluating one long candidate and need to know whether the CURRENT market environment supports taking it at all.

1. Describe the present regime for US equities: index trend vs the 50/200-day averages, breadth, volatility, and where we are in the rate/inflation cycle. Give the as-of date of your information.
2. How does that regime specifically affect THIS stock's sector and this kind of setup (a breakout/continuation long)? Say whether breakouts in this tape have been working or failing.
3. Name the two or three macro events in the next month most likely to override anything stock-specific here.
4. Conclude with a position-sizing implication: full size, half size, or stand aside — and the single market condition that would change that answer.`,
    vi: `Bạn là chuyên gia chiến lược thị trường. Tôi đang đánh giá một ứng viên mua (long) và cần biết bối cảnh thị trường HIỆN TẠI có cho phép vào lệnh hay không.

1. Mô tả trạng thái hiện tại của thị trường chứng khoán Mỹ: xu hướng chỉ số so với MA50/MA200, độ rộng, biến động, và vị trí trong chu kỳ lãi suất/lạm phát. Nêu rõ thông tin của bạn cập nhật đến thời điểm nào.
2. Trạng thái đó ảnh hưởng cụ thể thế nào tới NGÀNH của cổ phiếu này và tới dạng thiết lập này (mua phá vỡ / tiếp diễn xu hướng)? Nói rõ các điểm phá vỡ trong giai đoạn này đang hiệu quả hay đang thất bại.
3. Nêu hai đến ba sự kiện vĩ mô trong tháng tới có khả năng lấn át mọi yếu tố riêng của cổ phiếu này.
4. Kết luận bằng hàm ý về khối lượng vị thế: vào đủ, vào một nửa, hay đứng ngoài — và một điều kiện thị trường duy nhất sẽ làm thay đổi câu trả lời đó.`,
  },
  events: {
    en: `You are an event-driven analyst. For the stock below, map the dated catalysts that could move it over the next one to three months.

1. List each known or expected event with its date and whether that date is confirmed or estimated: earnings, guidance updates, investor days, product launches, regulatory or clinical dates, lockup expiries, index changes, contract or legal decisions.
2. For each, state the plausible direction and the typical size of the move, and whether it resolves or merely postpones the uncertainty.
3. Flag any event that falls BEFORE my planned entry has time to work — those are the ones that turn a technical setup into a coin flip.
4. Note anything already priced in versus genuinely unexpected, and how you can tell the difference.
5. If my measured "next catalyst" below is missing, wrong, or stale, say so plainly.`,
    vi: `Bạn là chuyên gia phân tích theo sự kiện. Với cổ phiếu dưới đây, hãy lập bản đồ các chất xúc tác có ngày cụ thể có thể tác động trong một đến ba tháng tới.

1. Liệt kê từng sự kiện đã biết hoặc dự kiến kèm ngày, và nói rõ ngày đó đã xác nhận hay chỉ là dự kiến: báo cáo lợi nhuận, cập nhật hướng dẫn kinh doanh, ngày dành cho nhà đầu tư, ra mắt sản phẩm, các mốc pháp lý hoặc thử nghiệm, hết hạn khóa cổ phiếu, thay đổi rổ chỉ số, phán quyết hợp đồng hoặc pháp lý.
2. Với mỗi sự kiện, nêu hướng tác động khả dĩ và biên độ dao động thường thấy, và cho biết sự kiện đó giải tỏa hay chỉ trì hoãn sự bất định.
3. Đánh dấu những sự kiện rơi vào TRƯỚC khi kế hoạch vào lệnh của tôi kịp phát huy — đó chính là những sự kiện biến một thiết lập kỹ thuật thành trò tung đồng xu.
4. Chỉ ra điều gì đã được phản ánh vào giá và điều gì thực sự bất ngờ, cùng cách bạn phân biệt hai loại đó.
5. Nếu "sự kiện gần nhất" tôi đo được ở dưới bị thiếu, sai hoặc đã cũ, hãy nói thẳng.`,
  },
  accumulation: {
    en: `You are a market-structure analyst. Judge whether large, patient money is BUILDING a position in this stock or exiting it.

1. Read the supply/demand evidence: volume behaviour on up days versus down days, whether volume dried up as the base tightened, any high-volume pocket-pivot or breakout-attempt days, and whether pullbacks came on falling volume (constructive) or rising volume (distribution).
2. Interpret my measured contraction figures below. State whether they are consistent with accumulation or merely with a lack of interest — a quiet stock and an accumulated stock look similar on a price chart and differ on volume.
3. Cover institutional evidence you can speak to: ownership trends, notable holders adding or trimming, index or fund inclusion, insider transactions, short interest and days-to-cover, and what each would look like if the thesis were wrong.
4. Distinguish accumulation from a bear-market rally trap or a stock being marked up ahead of supply hitting.
5. Give a single verdict — accumulation / neutral / distribution — plus the one piece of tape evidence you would watch next to confirm it.`,
    vi: `Bạn là chuyên gia phân tích cấu trúc thị trường. Hãy đánh giá xem dòng tiền lớn, kiên nhẫn đang GOM cổ phiếu này hay đang rút ra.

1. Đọc bằng chứng cung/cầu: hành vi khối lượng trong ngày tăng so với ngày giảm, khối lượng có cạn dần khi nền giá siết lại hay không, các ngày pocket pivot hoặc thử phá vỡ với khối lượng lớn, và các nhịp điều chỉnh diễn ra với khối lượng giảm (lành mạnh) hay khối lượng tăng (phân phối).
2. Diễn giải các số liệu co thắt tôi đo được ở dưới. Nói rõ chúng phù hợp với tích lũy hay chỉ đơn thuần là thiếu quan tâm — một cổ phiếu ít giao dịch và một cổ phiếu đang được gom trông rất giống nhau trên đồ thị giá, và khác nhau ở khối lượng.
3. Trình bày các bằng chứng về tổ chức mà bạn nắm được: xu hướng sở hữu, các quỹ lớn mua thêm hay giảm tỷ trọng, việc được thêm vào chỉ số hoặc quỹ, giao dịch nội bộ, tỷ lệ bán khống và số ngày để mua lại, và mỗi yếu tố sẽ trông thế nào nếu luận điểm là sai.
4. Phân biệt tích lũy thật với bẫy hồi phục trong thị trường giảm, hoặc với việc giá bị đẩy lên trước khi lượng cung lớn được xả ra.
5. Đưa ra một kết luận duy nhất — tích lũy / trung tính / phân phối — kèm một bằng chứng trên bảng giá bạn sẽ theo dõi tiếp để xác nhận.`,
  },
  fundamentals: {
    en: `You are an equity analyst. Check whether the underlying business justifies the technical setup below — a chart can look perfect on a deteriorating company, and that is how a breakout becomes a failed breakout.

1. Summarize the business: what it sells, to whom, and where the money actually comes from.
2. Growth and profitability: revenue and EPS trend over the last several quarters, whether growth is accelerating or decelerating, margin direction, and cash generation versus reported earnings.
3. Valuation in context: how the multiple compares with the company's own history and its peers, and what growth rate the current price implies. Say whether the price already assumes success.
4. Balance sheet and durability: debt, interest cover, dilution, customer or supplier concentration, and competitive position.
5. The bear case, argued properly — the three most credible reasons this falls 30%, not strawmen.
6. Reconcile the two views: does the fundamental picture SUPPORT the measured setup, merely tolerate it, or contradict it?`,
    vi: `Bạn là chuyên viên phân tích cổ phiếu. Hãy kiểm tra xem doanh nghiệp phía sau có xứng với thiết lập kỹ thuật dưới đây hay không — đồ thị có thể rất đẹp trên một công ty đang xấu đi, và đó chính là cách một điểm phá vỡ trở thành phá vỡ thất bại.

1. Tóm tắt doanh nghiệp: bán gì, cho ai, và tiền thực sự đến từ đâu.
2. Tăng trưởng và khả năng sinh lời: xu hướng doanh thu và EPS trong các quý gần nhất, tăng trưởng đang tăng tốc hay chậm lại, hướng đi của biên lợi nhuận, và dòng tiền thực so với lợi nhuận báo cáo.
3. Định giá trong bối cảnh: hệ số định giá so với chính lịch sử công ty và so với các đối thủ, và mức giá hiện tại đang hàm ý tốc độ tăng trưởng nào. Nói rõ giá đã phản ánh sẵn thành công hay chưa.
4. Bảng cân đối và độ bền: nợ, khả năng trả lãi, pha loãng cổ phiếu, mức độ tập trung khách hàng hoặc nhà cung cấp, và vị thế cạnh tranh.
5. Luận điểm ngược (bear case) một cách nghiêm túc — ba lý do đáng tin nhất khiến cổ phiếu này giảm 30%, không phải những lý do dựng lên cho dễ bác bỏ.
6. Đối chiếu hai góc nhìn: bức tranh cơ bản CỦNG CỐ thiết lập đã đo được, chỉ tạm chấp nhận được, hay đi ngược lại nó?`,
  },
};

export const RESEARCH_PROMPT_IDS: ResearchPromptId[] = [
  'market',
  'events',
  'accumulation',
  'fundamentals',
];

/** Build one prompt (context block appended) for a symbol. */
export function buildResearchPrompt(
  id: ResearchPromptId,
  c: StockPromptContext,
  lang: PromptLang = 'en',
): ResearchPrompt {
  const label = c.name ? `${c.symbol.toUpperCase()} (${c.name})` : c.symbol.toUpperCase();
  const intro =
    lang === 'vi'
      ? `Cổ phiếu đang xem xét: ${label}.`
      : `Stock under review: ${label}.`;
  const body = `${intro}\n\n${BODIES[id][lang]}\n\n${contextBlock(c, lang)}\n${tail(lang)}`;
  return {
    id,
    title: TITLES[id][lang],
    goal: GOALS[id][lang],
    body,
  };
}

/** All four prompts for a symbol, in display order. */
export function buildResearchPrompts(
  c: StockPromptContext,
  lang: PromptLang = 'en',
): ResearchPrompt[] {
  return RESEARCH_PROMPT_IDS.map((id) => buildResearchPrompt(id, c, lang));
}

/**
 * Where "Ask ChatGPT" sends the user.
 *
 * `custom` is whatever the user configured. It is validated rather than trusted:
 * a stored value from a synced device could be any string, and building an
 * `href` from it unchecked is how a stored-XSS `javascript:` URL gets shipped.
 * Only https URLs on ChatGPT's own hosts are accepted; anything else falls back
 * to the default chat page.
 */
const CHATGPT_HOSTS = new Set(['chatgpt.com', 'chat.openai.com', 'www.chatgpt.com']);

export const DEFAULT_CHATGPT_URL = 'https://chatgpt.com/';

/**
 * Split an absolute URL into scheme / authority / path.
 *
 * Hand-rolled rather than using `new URL()`: this package compiles with no DOM or
 * Node type libs on purpose, so it stays pure logic that runs anywhere. A regex is
 * also the stricter option here — it rejects anything that is not plainly
 * `scheme://authority/path`, where the WHATWG parser would happily normalise some
 * hostile inputs into something that looks fine.
 */
function splitUrl(raw: string): { scheme: string; authority: string; path: string } | null {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#\s\\]+)([^\s]*)$/i.exec(raw);
  if (!m) return null;
  const authority = m[2]!;
  // `https://chatgpt.com@evil.io/` reads as host `evil.io` with `chatgpt.com` as
  // userinfo. Rejecting userinfo outright is safer than trying to strip it.
  if (authority.includes('@')) return null;
  return {
    scheme: m[1]!.toLowerCase(),
    authority: authority.toLowerCase(),
    path: m[3] || '/',
  };
}

export function chatGptUrl(custom?: string | null): string {
  if (!custom) return DEFAULT_CHATGPT_URL;
  const u = splitUrl(custom.trim());
  if (!u) return DEFAULT_CHATGPT_URL;
  if (u.scheme !== 'https') return DEFAULT_CHATGPT_URL;
  // Compared against a whitelist of exact hostnames, not a substring or suffix
  // match: `chatgpt.com.evil.io` and `evil-chatgpt.com` both pass those.
  const host = u.authority.replace(/:\d+$/, '');
  if (!CHATGPT_HOSTS.has(host)) return DEFAULT_CHATGPT_URL;
  return `https://${u.authority}${u.path}`;
}

/** True when the configured URL is a custom GPT (`/g/...`) rather than plain chat. */
export function isCustomGptUrl(url: string): boolean {
  return splitUrl(url.trim())?.path.startsWith('/g/') ?? false;
}

/**
 * Longest prompt we will put in a URL.
 *
 * Browsers handle far more, but intermediaries do not: some proxies and server
 * stacks cut request lines around 8 KB, and a TRUNCATED prompt is the worst
 * outcome available here — the model would answer a question that silently lost
 * its last paragraph, which is exactly where the "state what would disprove this"
 * instruction lives. Over the cap we send the user to a clean composer with the
 * prompt on the clipboard instead of shipping a mutilated one.
 *
 * For reference, the four prompts encode to ~2.9–3.4 KB in English and
 * ~5.7–6.8 KB in Vietnamese (percent-encoding inflates diacritics ~3x), so
 * Vietnamese is the case that actually approaches this.
 *
 * This applies to the QUERY path only — see `MAX_FRAGMENT_PROMPT_LENGTH`.
 */
export const MAX_URL_PROMPT_LENGTH = 7500;

/**
 * Longest prompt we will put in a URL FRAGMENT.
 *
 * Much larger than the query cap for a structural reason, not a hopeful one: a
 * fragment is never part of the HTTP request line, so none of the proxy and server
 * limits that force `MAX_URL_PROMPT_LENGTH` apply to it. What is left is the
 * browser's own address limit, which is in the megabytes.
 *
 * The bound is kept anyway so a pathological input cannot produce an address no
 * browser will open. The case-study prompt — the longest in the app — encodes to
 * ~8.5 KB in Vietnamese, well inside this and well OUTSIDE the query cap, which is
 * precisely why the fragment path exists.
 */
export const MAX_FRAGMENT_PROMPT_LENGTH = 60000;

/**
 * Fragment marker that opts a URL in to the companion browser extension.
 *
 * A FRAGMENT, deliberately: fragments are not part of the HTTP request line, so
 * this never reaches OpenAI's servers or their logs. It is a signal between this
 * app and an extension running in the same browser, and it stays that way.
 *
 * It appears in two forms. Bare (`#tp-autorun`) means "the prompt is in `?q=`, run
 * it". With a value (`#tp-autorun=<encoded>`) it CARRIES the prompt, for prompts too
 * long to travel in a query string.
 *
 * The extension MUST require this marker before touching a page. Acting on any
 * chatgpt.com URL that happens to carry `?q=` would mean hijacking the user's own
 * navigation — including submitting a message they were still editing.
 */
export const AUTORUN_MARKER = 'tp-autorun';

/**
 * The URL that opens ChatGPT with `prompt` already in the composer.
 *
 * ── WHAT THIS CAN AND CANNOT DO ─────────────────────────────────────────────
 * `?q=` pre-fills, and on the plain chat URL ChatGPT also auto-submits it. On a
 * custom GPT (`/g/g-…`) the parameter is appended the same way, but the page does
 * NOT act on it — verified against the live site, which is why the companion
 * extension exists. There is no API for custom GPTs, so `?q=` plus a content
 * script is the whole of what is available.
 *
 * `autorun: true` appends `AUTORUN_MARKER` as a fragment, which is what tells the
 * extension it may fill and submit. Without the extension the marker is inert and
 * the URL behaves exactly as before, which is the point: this degrades to
 * "pre-filled if OpenAI honours it, pasted by hand otherwise" rather than
 * breaking.
 *
 * ── TWO WAYS TO CARRY THE PROMPT ────────────────────────────────────────────
 * By default the prompt rides in `?q=`, because that is the only form the plain
 * chat page acts on by itself. Over `MAX_URL_PROMPT_LENGTH` that is unsafe (a
 * truncating proxy would silently amputate the prompt), so with `autorun` the
 * prompt moves into the marker's own fragment instead — `#tp-autorun=<encoded>` —
 * which no proxy sees and no server length limit applies to.
 *
 * That fallback needs the extension, which is why it is only taken when `autorun`
 * was asked for. Without `autorun` a long prompt still returns a bare composer:
 * putting it in a fragment nothing will read would report `embedded: true` for a
 * prompt that never arrives, and the UI would tell the user it was sent.
 *
 * The CALLER MUST STILL COPY the prompt to the clipboard before opening this URL.
 * The extension may be absent, disabled, or broken by a ChatGPT markup change; the
 * clipboard is what keeps the button useful in all three cases.
 *
 * Returns `{ url, embedded }`. `embedded: false` means the prompt was too long to
 * carry and the URL is a bare composer — the UI should say so rather than let the
 * user believe the question was sent.
 */
export function chatGptAskUrl(
  prompt: string,
  custom?: string | null,
  opts?: { autorun?: boolean },
): { url: string; embedded: boolean } {
  const base = chatGptUrl(custom);
  const encoded = encodeURIComponent(prompt);
  // Split any fragment off `base` before appending anything. A configured link is
  // normally a bare path, but if one arrives with a fragment then `base + '?q='`
  // would bury the parameter inside that fragment, where the server never sees it.
  const hash = base.indexOf('#');
  const head = hash === -1 ? base : base.slice(0, hash);

  if (encoded.length > MAX_URL_PROMPT_LENGTH) {
    if (opts?.autorun && encoded.length <= MAX_FRAGMENT_PROMPT_LENGTH) {
      return { url: `${head}#${AUTORUN_MARKER}=${encoded}`, embedded: true };
    }
    // No prompt to run, so no marker: the extension must not fill a composer from
    // a URL that carries nothing, and the user is being told to paste instead.
    return { url: base, embedded: false };
  }
  // The `?`/`&` choice matters for a pasted link that already has a query: a second
  // `?` would make the whole query string unparseable.
  const sep = head.includes('?') ? '&' : '?';
  const frag = opts?.autorun ? `#${AUTORUN_MARKER}` : '';
  return { url: `${head}${sep}q=${encoded}${frag}`, embedded: true };
}
