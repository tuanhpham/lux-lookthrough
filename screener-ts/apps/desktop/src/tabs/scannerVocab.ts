/**
 * The scanner's own words, turned into the reader's words.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The scanner is a separate Python repo (`Github/scanner`, a sibling of this one,
 * deployed to a VM). Its payload speaks ITS vocabulary: setups are short codes
 * (`BO`, `RV`, `LEAD`) and reject reasons are unaccented Vietnamese PHRASES, some
 * with a threshold interpolated into them. Both were being printed raw:
 *
 *   · `BO` is a heading on a table of candidates. Nobody has to guess what a
 *     BREAKOUT is; everybody has to guess what BO is.
 *   · "Why rejected" printed unaccented Vietnamese even with the app in English.
 *     Not a translation bug — those strings had never been translated at all,
 *     they were pipeline internals rendered straight into a table.
 *
 * ── WHERE THE KEYS COME FROM ────────────────────────────────────────────────
 * `scanner/setups.py`, every `_rej(rej, "…")` call site. `push.py:rejects_payload()`
 * re-runs `setups.scan()` and publishes `scanner:rejects` as
 * `{ts, struct, cho_fund, by_setup}`, so what can arrive here is exactly: the
 * candidate gates of `bo_candidate` / `rv_candidate` / `lead_candidate`, the
 * per-sector and total caps of `lead_pick`, `khong co danh sach sector` (set by
 * `scan()` when the sector ranking is empty), and the `_`-prefixed COUNTERS
 * (`_qua_loc`, `_bi_cat_tran`, `_qua_san`, …) which are tallies, not reasons —
 * `scannerTab` filters those out of the table and shows them as chips instead.
 * The intraday trigger reasons (`chua vuot pivot`, `chua lay lai sma20`, …) come
 * from `trig_bo`/`trig_rv` and are NOT in that payload today; they are mapped
 * anyway, because they are real strings from the same file and cost nothing.
 *
 * ── THE SHAPE OF THE FIX ────────────────────────────────────────────────────
 * Two lookups and an honest fallback:
 *   1. EXACT, on a normalised key (lowercased, runs of non-alphanumerics → `_`),
 *      so `kem thanh khoan`, `Kem_thanh_khoan` and `KEM-THANH-KHOAN` are one entry.
 *   2. PATTERNS, for the keys that carry a number — `gia < $10.0`, `rvol < 1.5`,
 *      `da du 2 ma cua XLK`. The threshold IS the information in those rows, so it
 *      is captured and substituted into the translation instead of being erased.
 *   3. A miss is not a failure: the raw string is prettified into something
 *      readable and the caller is told it was a miss, so the UI can mark it.
 *
 * ── EXTENDING IT ────────────────────────────────────────────────────────────
 * When the scanner grows a gate, its new phrase shows up in the table in italics
 * with the raw key in its tooltip. Add it to `REASONS` (or to `PATTERNS` if it has
 * a threshold in it). That is the whole maintenance story.
 */
import { getLang } from '../ui/i18n.js';
import { sectorTip } from '../ui/sectorNames.js';

interface Term {
  en: string;
  vi: string;
  /** One sentence for the tooltip, when the label alone leaves a question. */
  tipEn?: string;
  tipVi?: string;
}

/** Lowercase, and every run of non-alphanumerics becomes one `_`. */
export function normKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/* ── Setups ──────────────────────────────────────────────────────────────── */

/**
 * The three setups `setups.py` produces. An unknown code passes through
 * unchanged: inventing a name for a setup this app has never heard of would be
 * worse than showing the code.
 */
const SETUPS: Record<string, Term> = {
  bo: {
    en: 'Breakout', vi: 'Bứt phá',
    tipEn: 'A base that has tightened under a pivot, waiting for price to clear it.',
    tipVi: 'Nền tích lũy đã co lại dưới một điểm pivot, đang chờ giá vượt lên.',
  },
  rv: {
    en: 'Reversal', vi: 'Đảo chiều',
    tipEn: 'A name that has fallen a long way, waiting for one strong session. '
      + 'The trigger needs fundamentals to pass first.',
    tipVi: 'Mã đã rơi sâu, đang chờ một phiên bật mạnh. '
      + 'Điểm kích hoạt chỉ mở khi điểm cơ bản đạt.',
  },
  lead: {
    en: 'Sector leader', vi: 'Dẫn dắt ngành',
    tipEn: 'Not a chart pattern but a quality floor: a liquid name inside a top-3 '
      + 'sector, stronger than SPY and still near its high.',
    tipVi: 'Không phải mẫu hình kỹ thuật mà là một bộ sàn chất lượng: mã đủ thanh khoản '
      + 'thuộc top 3 sector, mạnh hơn SPY và còn gần đỉnh.',
  },
};

/* ── Reject reasons, exact ───────────────────────────────────────────────── */

/**
 * Why a symbol did not become a candidate. Ordered the way `setups.py` is:
 * BO gates, then RV, then LEAD, then the bookkeeping counters.
 */
const REASONS: Record<string, Term> = {
  // ── BO: bo_candidate() ──
  kem_thanh_khoan: {
    en: 'Liquidity too low', vi: 'Thanh khoản quá thấp',
    tipEn: 'Average volume over the last 20 sessions is below the floor.',
    tipVi: 'Khối lượng bình quân 20 phiên dưới ngưỡng.',
  },
  khong_co_nen_tich_luy: {
    en: 'No base yet', vi: 'Chưa có nền tích lũy',
    tipEn: 'The sideways stretch is shorter than a base has to be.',
    tipVi: 'Đoạn đi ngang ngắn hơn độ dài tối thiểu của một nền.',
  },
  khong_co_pivot: {
    en: 'No pivot', vi: 'Không có điểm pivot',
    tipEn: 'No clear high inside the base for price to break out over.',
    tipVi: 'Không có đỉnh rõ ràng trong nền để giá bứt phá qua.',
  },
  bien_do_khong_co_lai: {
    en: 'Volatility did not contract', vi: 'Biên độ không co lại',
    tipEn: 'A base should go quieter as it matures. This one is still as wide as before.',
    tipVi: 'Nền càng về cuối càng phải lặng đi. Nền này vẫn rộng như lúc đầu.',
  },
  duoi_sma50: {
    en: 'Below the 50-day average', vi: 'Dưới SMA50',
    tipEn: 'Price is under its 50-day moving average.',
    tipVi: 'Giá nằm dưới đường trung bình 50 ngày.',
  },
  sma50_dang_di_xuong: {
    en: 'The 50-day average is falling', vi: 'SMA50 đang đi xuống',
    tipEn: 'The 50-day moving average is sloping down, so the trend is not up yet.',
    tipVi: 'Đường trung bình 50 ngày đang dốc xuống, xu hướng chưa phải tăng.',
  },
  con_xa_pivot: {
    en: 'Still far below the pivot', vi: 'Còn xa pivot',
    tipEn: 'Too far under the breakout level for the trade to be close.',
    tipVi: 'Còn quá xa điểm bứt phá nên chưa tới lúc vào.',
  },
  da_vuot_pivot_qua_xa: {
    en: 'Already well past the pivot', vi: 'Đã vượt pivot quá xa',
    tipEn: 'The breakout happened without the scanner; buying here means a wide stop.',
    tipVi: 'Cú bứt phá đã xảy ra; mua lúc này thì cắt lỗ phải rất rộng.',
  },

  // ── RV: rv_candidate() ──
  day_52_tuan_qua_cu: {
    en: 'The 52-week low is too old', vi: 'Đáy 52 tuần quá cũ',
    tipEn: 'The low was set too long ago for this to be a fresh reversal.',
    tipVi: 'Đáy được tạo quá lâu rồi, không còn là một cú đảo chiều mới.',
  },
  chua_giam_du_3_thang: {
    en: 'Has not fallen enough over 3 months', vi: 'Chưa giảm đủ trong 3 tháng',
    tipEn: 'The 63-session return is not negative enough to call this beaten down.',
    tipVi: 'Lợi nhuận 63 phiên chưa âm đủ để coi là đã rơi sâu.',
  },
  da_bat_len_qua_nhieu: {
    en: 'Already bounced too much', vi: 'Đã bật lên quá nhiều',
    tipEn: 'Price has run too far off the low; the low-risk entry is gone.',
    tipVi: 'Giá đã chạy quá xa khỏi đáy, điểm vào ít rủi ro không còn.',
  },
  co_ban_khong_dat: {
    en: 'Fundamentals failed', vi: 'Cơ bản không đạt',
    tipEn: 'A reversal is only taken when the fundamentals pass. Unknown never counts as good.',
    tipVi: 'Chỉ bắt đảo chiều khi điểm cơ bản đạt. "Chưa biết" không bao giờ được coi là "tốt".',
  },

  // ── LEAD: lead_candidate(), lead_pick(), scan() ──
  khong_biet_sector: {
    en: 'Sector unknown', vi: 'Không biết sector',
    tipEn: 'The holdings file does not say which sector this belongs to, so it cannot be '
      + 'called a leader of one.',
    tipVi: 'Dữ liệu thành phần không cho biết mã này thuộc sector nào, nên không thể gọi là '
      + 'dẫn dắt sector.',
  },
  khong_do_duoc_bien_do: {
    en: 'Volatility could not be measured', vi: 'Không đo được biên độ',
    tipEn: 'No ATR, so neither the stop nor the position size can be computed.',
    tipVi: 'Không có ATR nên không tính được cắt lỗ lẫn khối lượng vào.',
  },
  khong_co_so_lieu_rs_thieu_ma_chuan: {
    en: 'No relative-strength data (benchmark missing?)',
    vi: 'Không có số liệu RS (thiếu mã chuẩn?)',
    tipEn: 'Strength is measured against SPY. Without the benchmark bars there is nothing '
      + 'to compare to.',
    tipVi: 'Sức mạnh được đo so với SPY. Thiếu nến của mã chuẩn thì không có gì để so.',
  },
  yeu_hon_spy_trong_21_phien: {
    en: 'Weaker than SPY over 21 sessions', vi: 'Yếu hơn SPY trong 21 phiên',
    tipEn: 'A leader has to beat the index over both windows, 21 and 63 sessions.',
    tipVi: 'Mã dẫn dắt phải thắng chỉ số ở cả hai cửa sổ, 21 và 63 phiên.',
  },
  yeu_hon_spy_trong_63_phien: {
    en: 'Weaker than SPY over 63 sessions', vi: 'Yếu hơn SPY trong 63 phiên',
    tipEn: 'A leader has to beat the index over both windows, 21 and 63 sessions.',
    tipVi: 'Mã dẫn dắt phải thắng chỉ số ở cả hai cửa sổ, 21 và 63 phiên.',
  },
  khong_co_danh_sach_sector: {
    en: 'No sector ranking available', vi: 'Không có danh sách sector',
    tipEn: 'Sector leaders are picked from the top sectors. With no ranking there are no '
      + 'top sectors, so the whole setup is skipped — this row says so out loud rather than '
      + 'leaving the table silently empty.',
    tipVi: 'Mã dẫn dắt được chọn từ các sector mạnh nhất. Không có bảng xếp hạng thì không có '
      + 'sector nào ở top, nên cả setup bị bỏ qua — dòng này nói rõ ra thay vì để bảng trống.',
  },

  // ── Intraday triggers: trig_bo() / trig_rv(). Not in `scanner:rejects` today. ──
  thieu_gia_pivot: {
    en: 'Price or pivot missing', vi: 'Thiếu giá hoặc pivot',
  },
  thieu_gia: { en: 'Price missing', vi: 'Thiếu giá' },
  chua_vuot_pivot: {
    en: 'Has not cleared the pivot', vi: 'Chưa vượt pivot',
    tipEn: 'Still below the breakout level. Nothing to do yet.',
    tipVi: 'Vẫn dưới điểm bứt phá. Chưa có gì để làm.',
  },
  da_chay_qua_xa_pivot: {
    en: 'Run too far past the pivot', vi: 'Đã chạy quá xa pivot',
    tipEn: 'Chasing from here puts the stop too far away.',
    tipVi: 'Đuổi giá từ đây thì cắt lỗ quá xa.',
  },
  thanh_khoan_trong_ngay_thap: {
    en: 'Intraday volume too light', vi: 'Thanh khoản trong ngày thấp',
    tipEn: 'Today is not trading enough for the move to mean anything.',
    tipVi: 'Hôm nay giao dịch chưa đủ để cú chạy có ý nghĩa.',
  },
  dang_o_nua_duoi_bien_do_ngay: {
    en: 'Sitting in the lower half of the day', vi: 'Đang ở nửa dưới biên độ ngày',
    tipEn: 'A breakout should hold the upper half of its range.',
    tipVi: 'Một cú bứt phá thật phải giữ được nửa trên biên độ ngày.',
  },
  khong_dong_o_vung_dinh_ngay: {
    en: 'Not closing near the high of the day', vi: 'Không đóng ở vùng đỉnh ngày',
  },
  chua_co_so_lieu_co_ban: {
    en: 'No fundamentals yet', vi: 'Chưa có số liệu cơ bản',
    tipEn: 'Unknown is not treated as good, so the trigger stays shut.',
    tipVi: '"Chưa biết" không được coi là "tốt", nên điểm kích hoạt vẫn đóng.',
  },
  chua_lay_lai_sma20: {
    en: 'Has not reclaimed the 20-day average', vi: 'Chưa lấy lại SMA20',
    tipEn: 'The bounce is only confirmed once price closes back above its 20-day average.',
    tipVi: 'Cú bật chỉ được xác nhận khi giá đóng lại trên đường trung bình 20 ngày.',
  },
  gap_to_entry_xau: {
    en: 'Large gap — poor entry', vi: 'Gap to, entry xấu',
  },

  // ── Counters. `scannerTab` hides `_`-prefixed keys from the table and prints
  //    them as chips; these entries exist so a stray one still reads as words. ──
  qua_loc: {
    en: 'Passed the filter', vi: 'Qua lọc',
    tipEn: 'How many names made it all the way through — not a rejection.',
    tipVi: 'Số mã đi hết được bộ lọc — không phải lý do loại.',
  },
  qua_san: {
    en: 'Cleared the quality floor', vi: 'Qua sàn chất lượng',
    tipEn: 'Passed every LEAD gate, before the per-sector and total caps were applied.',
    tipVi: 'Đạt mọi tiêu chí LEAD, trước khi áp trần theo sector và trần tổng.',
  },
  bi_cat_tran: {
    en: 'Cut by the candidate ceiling', vi: 'Bị cắt bởi trần ứng viên',
    tipEn: 'Qualified, but ranked below the last slot the scanner keeps.',
    tipVi: 'Đạt chuẩn nhưng xếp dưới suất cuối cùng mà scanner giữ lại.',
  },
  cho_fund: {
    en: 'Awaiting fundamentals', vi: 'Chờ điểm cơ bản',
    tipEn: 'On the watch list, but the trigger stays shut until the fundamentals arrive.',
    tipVi: 'Vẫn vào danh sách theo dõi, nhưng điểm kích hoạt đóng tới khi có điểm cơ bản.',
  },
  khong_lap_duoc_ke_hoach: {
    en: 'No trade plan could be built', vi: 'Không lập được kế hoạch',
    tipEn: 'A candidate with no entry, stop and size is not a trade.',
    tipVi: 'Một ứng viên không có điểm vào, cắt lỗ và khối lượng thì không phải một lệnh.',
  },
};

/* ── Reject reasons that carry a threshold ───────────────────────────────── */

/**
 * The scanner interpolates its own configured limits into some reasons
 * (`f"rvol < {g['min_rvol']}"`), so the key is different for every threshold and
 * an exact map can never hit it. The number is the whole point of those rows —
 * "RVOL too low" tells the reader nothing, "RVOL below 1.5" tells them where the
 * bar is — so it is captured and put back into the translation.
 *
 * Matched in order, against the raw string, case-insensitively. `{1}`, `{2}` in
 * the text are the capture groups.
 */
interface Pattern extends Term {
  re: RegExp;
  /** Capture group holding a sector ETF ticker, if any: its name goes in the tip. */
  sectorArg?: number;
}

const PATTERNS: Pattern[] = [
  {
    re: /^gia\s*<\s*\$(.+)$/i,
    en: 'Price below ${1}', vi: 'Giá dưới ${1}',
    tipEn: 'Cheap stocks move on nothing and cost more to trade, so there is a price floor.',
    tipVi: 'Cổ phiếu giá thấp chạy vô cớ và tốn phí hơn khi giao dịch, nên có một sàn giá.',
  },
  {
    re: /^nen rong hon\s*(.+)$/i,
    en: 'Base wider than {1}', vi: 'Nền rộng hơn {1}',
    tipEn: 'Measured top to bottom of the base. A deep base is a fight, not a rest.',
    tipVi: 'Đo từ đỉnh xuống đáy nền. Nền quá sâu là một cuộc giằng xé, không phải nhịp nghỉ.',
  },
  {
    re: /^cach dinh 52 tuan\s*>\s*(.+)$/i,
    en: 'More than {1} below the 52-week high', vi: 'Cách đỉnh 52 tuần hơn {1}',
    tipEn: 'Breakouts and leaders are taken near the highs, not far under them.',
    tipVi: 'Bứt phá và mã dẫn dắt được mua gần đỉnh, không phải ở xa dưới đỉnh.',
  },
  {
    re: /^chua roi du\s*(.+)$/i,
    en: 'Less than {1} off its high', vi: 'Chưa rời đỉnh đủ {1}',
    tipEn: 'The opposite gate: a reversal needs a real fall behind it first.',
    tipVi: 'Điều kiện ngược lại: muốn bắt đảo chiều thì phải có một cú rơi thật trước đó.',
  },
  {
    re: /^thanh khoan\s*<\s*\$(.+)\/phien$/i,
    en: 'Dollar volume below ${1} a session', vi: 'Thanh khoản dưới ${1} mỗi phiên',
    tipEn: 'Measured in money, not shares: a million shares at $3 and a million at $300 are '
      + 'two different worlds. This is the floor institutions trade above.',
    tipVi: 'Đo bằng tiền, không bằng số cổ phiếu: một triệu cổ giá $3 và một triệu cổ giá $300 '
      + 'là hai thế giới khác nhau. Đây là ngưỡng có tổ chức tham gia.',
  },
  {
    re: /^rvol\s*<\s*(.+)$/i,
    en: 'RVOL below {1}', vi: 'RVOL dưới {1}',
    tipEn: "Today's volume against its normal level. Above 1 means people are paying attention.",
    tipVi: 'Khối lượng hôm nay so với mức bình thường. Trên 1 là đang có người để ý đến nó.',
  },
  {
    re: /^bien do\s*<\s*(.+?)\s*\(khong du dong\)$/i,
    en: 'Volatility below {1} — too quiet', vi: 'Biên độ dưới {1} — không đủ động',
    tipEn: 'Daily range this small means even a 3-ATR move barely covers fees and slippage.',
    tipVi: 'Biên độ ngày nhỏ như vậy thì một cú chạy 3 ATR cũng không đủ bù phí và trượt giá.',
  },
  {
    re: /^bien do\s*>\s*(.+?)\s*\(stop qua rong\)$/i,
    en: 'Volatility above {1} — the stop would be too wide',
    vi: 'Biên độ trên {1} — cắt lỗ quá rộng',
    tipEn: 'A sensible stop would sit so far away that the position has to shrink to nothing.',
    tipVi: 'Cắt lỗ hợp lý sẽ xa đến mức vị thế phải nhỏ lại tới vô nghĩa.',
  },
  {
    re: /^da du\s*(\d+)\s*ma cua\s*(.+)$/i,
    sectorArg: 2,
    en: 'Already {1} names from {2}', vi: 'Đã đủ {1} mã của {2}',
    tipEn: 'Nothing wrong with this name — the scanner caps how many it takes from one '
      + 'sector, and the slots were filled by stronger ones.',
    tipVi: 'Mã này không có gì sai — scanner giới hạn số mã lấy từ một sector, và các suất đã '
      + 'bị những mã mạnh hơn lấy trước.',
  },
  {
    re: /^qua tran\s*(\d+)\s*ma tong$/i,
    en: 'Over the {1}-name total cap', vi: 'Quá trần {1} mã tổng',
    tipEn: 'Qualified, but the list was already full.',
    tipVi: 'Đạt chuẩn, nhưng danh sách đã đầy.',
  },
  {
    re: /^tang\s*<\s*(.+)$/i,
    en: 'Up less than {1} today', vi: 'Tăng dưới {1} trong ngày',
    tipEn: 'The bounce session has to be a strong one to count.',
    tipVi: 'Phiên bật lên phải thật mạnh mới được tính.',
  },
];

/**
 * `{1}` → the first capture. A REPLACER FUNCTION, not a `$1` string: the captured
 * text is a number that often carries a `$` (`gia < $10.0`), and `$` in a
 * replacement string is a substitution token — `String.replace` would eat it.
 */
function fill(tpl: string, m: RegExpMatchArray): string {
  return tpl.replace(/\{(\d)\}/g, (_all, i: string) => m[Number(i)] ?? '');
}

/**
 * `khong_du_thanh_khoan` → `Khong du thanh khoan`. Not a translation and not
 * pretending to be one — it only removes the punctuation that marks a string as a
 * machine identifier, so an unmapped reason still reads as words.
 */
function prettify(raw: string): string {
  const s = raw.replace(/^_+/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  // A key that is nothing but separators leaves nothing to print. An em dash, not
  // the raw string: a cell containing `_` or three spaces reads as a rendering bug,
  // and the tooltip still carries exactly what arrived.
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
}

export interface Label {
  /** What to print. */
  text: string;
  /** The tooltip: an explanation when known, the raw key when not. */
  tip: string;
  /** False when neither dictionary had an entry — the UI marks these. */
  known: boolean;
}

function pick(t: Term, vi: boolean): { text: string; tip: string } {
  return {
    text: vi ? t.vi : t.en,
    tip: (vi ? t.tipVi : t.tipEn) ?? (vi ? t.tipEn : t.tipVi) ?? '',
  };
}

function look(table: Record<string, Term>, raw: string): Label {
  const hit = table[normKey(raw)];
  if (!hit) return { text: prettify(raw), tip: raw, known: false };
  const { text, tip } = pick(hit, getLang() === 'vi');
  return { text, tip: tip || raw, known: true };
}

/**
 * A setup code as one word: `Breakout`. For the places where the code cannot fit
 * alongside it — a stat tile, a comma list — while the heading above still carries
 * the code.
 */
export function setupWord(code: string): Label {
  return look(SETUPS, code);
}

/**
 * A setup code as words, with the code kept as a suffix rather than replaced:
 * everything else about the scanner — its logs, its Telegram messages, the VM's
 * own output — still says `BO`, so dropping the code everywhere would break the
 * link between this page and the thing that produced it.
 */
export function setupLabel(code: string): Label {
  const l = look(SETUPS, code);
  if (!l.known) return l;
  const short = code.trim().toUpperCase();
  // Don't print "VCP (VCP)".
  const text = normKey(l.text) === normKey(short) ? l.text : `${l.text} (${short})`;
  return { ...l, text };
}

/** A reject reason as a sentence fragment a reader can act on. */
export function reasonLabel(raw: string): Label {
  const exact = look(REASONS, raw);
  if (exact.known) return exact;

  const s = raw.trim();
  for (const p of PATTERNS) {
    const m = s.match(p.re);
    if (!m) continue;
    const vi = getLang() === 'vi';
    const { text, tip } = pick(p, vi);
    // The sector's name belongs in the tip, not the cell: the cell is one column of
    // a narrow table, and `XLK` is what the rest of the page calls it.
    const extra = p.sectorArg ? sectorTip(m[p.sectorArg]) : '';
    const full = [fill(tip, m), extra].filter(Boolean).join(' · ');
    return { text: fill(text, m), tip: full || s, known: true };
  }
  return exact;
}
