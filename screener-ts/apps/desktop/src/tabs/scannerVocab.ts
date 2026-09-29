/**
 * The scanner's own words, turned into the reader's words.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The scanner is a separate Python repo running on a VM. Its payload uses ITS
 * vocabulary: setups are two-letter codes (`BO`, `EP`, `MR`) and reject reasons are
 * unaccented Vietnamese identifiers (`_qua_loc`, `_bi_cat_tran` are the two we can
 * see from here, and they show the house style). Both were being printed raw:
 *
 *   · `BO` is a heading on a table of candidates. Nobody has to guess what a
 *     BREAKOUT is; everybody has to guess what BO is.
 *   · "Why rejected" printed unaccented Vietnamese even with the app in English.
 *     Not a translation bug — those strings had never been translated at all,
 *     they were pipeline internals rendered straight into a table.
 *
 * ── THE SHAPE OF THE FIX ────────────────────────────────────────────────────
 * A lookup with an HONEST FALLBACK. Keys are normalised first (lowercased, every
 * run of non-alphanumerics collapsed to `_`), so `khong_du_thanh_khoan`,
 * `Khong du thanh khoan` and `KHONG-DU-THANH-KHOAN` all land on one entry. A miss
 * is not a failure: the raw string is prettified into something readable and the
 * caller is told it was a miss, so the UI can mark it rather than pretend.
 *
 * ── EXTENDING IT ────────────────────────────────────────────────────────────
 * This dictionary is seeded from the reason keys the scanner is known to emit plus
 * the standard gates of a Qullamaggie-style pipeline. It is NOT generated from the
 * scanner source, which lives in another repo — so when an unmapped reason shows up
 * in the table (it renders in italics, with the raw key in its tooltip), add it
 * here. That is the whole maintenance story; nothing else needs touching.
 */
import { getLang } from '../ui/i18n.js';

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
 * The codes the scanner groups candidates by. `Other` is deliberately absent: an
 * unknown code passes through unchanged, because inventing a name for a setup this
 * app has never heard of would be worse than showing the code.
 */
const SETUPS: Record<string, Term> = {
  bo: {
    en: 'Breakout', vi: 'Bứt phá',
    tipEn: 'Price clearing the top of a base on expanding volume.',
    tipVi: 'Giá vượt đỉnh nền với khối lượng tăng.',
  },
  ep: {
    en: 'Episodic Pivot', vi: 'Điểm xoay đột biến',
    tipEn: 'A news or earnings gap on heavy volume, closing near the high.',
    tipVi: 'Cú gap theo tin tức hoặc lợi nhuận, khối lượng lớn, đóng cửa gần đỉnh.',
  },
  mr: {
    en: 'Mean Reversion', vi: 'Hồi về trung bình',
    tipEn: 'Stretched too far from its moving average, and starting to stabilise.',
    tipVi: 'Giãn quá xa đường trung bình và bắt đầu ổn định lại.',
  },
  vcp: {
    en: 'VCP', vi: 'VCP',
    tipEn: 'Volatility Contraction Pattern — tighter and tighter pullbacks inside a base.',
    tipVi: 'Mẫu hình co thắt biến động — các nhịp điều chỉnh trong nền hẹp dần.',
  },
  pb: {
    en: 'Pullback', vi: 'Nhịp điều chỉnh',
    tipEn: 'A rest back to a moving average inside an intact uptrend.',
    tipVi: 'Nhịp nghỉ về đường trung bình trong xu hướng tăng còn nguyên.',
  },
  flag: {
    en: 'Flag', vi: 'Mẫu hình cờ',
    tipEn: 'A short sideways drift after a sharp advance.',
    tipVi: 'Đoạn đi ngang ngắn sau một nhịp tăng dốc.',
  },
  htf: {
    en: 'High Tight Flag', vi: 'Cờ cao và hẹp',
    tipEn: 'A very shallow flag straight after a large, fast move.',
    tipVi: 'Cờ rất nông ngay sau một cú chạy lớn và nhanh.',
  },
  cwh: { en: 'Cup with Handle', vi: 'Cốc tay cầm' },
  ipo: {
    en: 'IPO base', vi: 'Nền sau IPO',
    tipEn: 'A first base built by a recently listed stock.',
    tipVi: 'Nền đầu tiên của một mã mới lên sàn.',
  },
  surge: {
    en: 'Surge', vi: 'Bùng nổ',
    tipEn: 'A momentum thrust — price and volume both far above their normal range.',
    tipVi: 'Cú đẩy động lượng — giá và khối lượng đều vượt xa mức bình thường.',
  },
  para: {
    en: 'Parabolic', vi: 'Tăng dốc đứng',
    tipEn: 'An accelerating, near-vertical advance. Usually a place to sell, not buy.',
    tipVi: 'Nhịp tăng gia tốc, gần như thẳng đứng. Thường là chỗ bán, không phải chỗ mua.',
  },
  gap: { en: 'Gap up', vi: 'Gap tăng' },
  sq: {
    en: 'Squeeze', vi: 'Nén biến động',
    tipEn: 'Volatility compressed to an extreme — direction still unknown.',
    tipVi: 'Biến động nén tới mức cực đoan — chưa rõ hướng.',
  },
  rs: {
    en: 'RS leader', vi: 'Dẫn dắt sức mạnh',
    tipEn: 'Outperforming the index by a wide margin.',
    tipVi: 'Vượt trội so với chỉ số với khoảng cách lớn.',
  },
  '52w': { en: '52-week high', vi: 'Đỉnh 52 tuần' },
};

/* ── Reject reasons ──────────────────────────────────────────────────────── */

/**
 * Why a symbol did not become a candidate. Grouped the way the pipeline is:
 * data → liquidity/price → trend → base → entry arithmetic → bookkeeping.
 */
const REASONS: Record<string, Term> = {
  // Data
  thieu_du_lieu: { en: 'Not enough data', vi: 'Thiếu dữ liệu' },
  khong_du_bar: { en: 'Not enough bars', vi: 'Không đủ số nến' },
  khong_co_gia: { en: 'No price', vi: 'Không có giá' },
  loi_du_lieu: { en: 'Data error', vi: 'Lỗi dữ liệu' },
  chua_du_lich_su: { en: 'History too short', vi: 'Lịch sử quá ngắn' },
  // Liquidity and price
  thanh_khoan_thap: { en: 'Liquidity too low', vi: 'Thanh khoản quá thấp' },
  khong_du_thanh_khoan: { en: 'Liquidity too low', vi: 'Thanh khoản quá thấp' },
  gia_thap: { en: 'Price below the floor', vi: 'Giá dưới ngưỡng' },
  gia_qua_thap: { en: 'Price below the floor', vi: 'Giá dưới ngưỡng' },
  gia_cao: { en: 'Price above the ceiling', vi: 'Giá trên ngưỡng' },
  von_hoa_nho: { en: 'Market cap too small', vi: 'Vốn hóa quá nhỏ' },
  khoi_luong_thap: { en: 'Volume too low', vi: 'Khối lượng quá thấp' },
  // Trend gate
  xu_huong_yeu: { en: 'Trend filter failed', vi: 'Không qua bộ lọc xu hướng' },
  khong_qua_xu_huong: { en: 'Trend filter failed', vi: 'Không qua bộ lọc xu hướng' },
  duoi_ema50: { en: 'Below EMA50', vi: 'Dưới EMA50' },
  duoi_ma: { en: 'Below the moving average', vi: 'Dưới đường trung bình' },
  ema_sai_thu_tu: { en: 'Moving averages out of order', vi: 'Các đường trung bình sai thứ tự' },
  xa_dinh_52w: { en: 'Too far below the 52-week high', vi: 'Quá xa đỉnh 52 tuần' },
  rs_yeu: { en: 'Relative strength too weak', vi: 'Sức mạnh tương đối quá yếu' },
  khong_tang_truoc: { en: 'No prior advance', vi: 'Không có nhịp tăng trước' },
  // The base
  chua_co_nen: { en: 'No base yet', vi: 'Chưa hình thành nền' },
  khong_co_nen: { en: 'No base', vi: 'Không có nền' },
  nen_qua_sau: { en: 'Base too deep', vi: 'Nền quá sâu' },
  nen_qua_ngan: { en: 'Base too short', vi: 'Nền quá ngắn' },
  nen_qua_rong: { en: 'Base too wide', vi: 'Nền quá rộng' },
  khong_co_pivot: { en: 'No pivot', vi: 'Không có điểm pivot' },
  xa_pivot: { en: 'Too far from the pivot', vi: 'Quá xa điểm pivot' },
  chua_co_vcp: { en: 'No contraction', vi: 'Chưa co thắt' },
  khong_can_khoi_luong: { en: 'Volume did not dry up', vi: 'Khối lượng chưa cạn' },
  // Entry arithmetic
  stop_qua_rong: { en: 'Stop too wide', vi: 'Cắt lỗ quá rộng' },
  stop_qua_xa: { en: 'Stop too wide', vi: 'Cắt lỗ quá rộng' },
  rr_thap: { en: 'Reward-to-risk too low', vi: 'Tỷ lệ lời/lỗ quá thấp' },
  atr_qua_lon: { en: 'Too volatile (ATR)', vi: 'Biến động quá lớn (ATR)' },
  da_chay_qua: { en: 'Already extended', vi: 'Đã chạy quá xa' },
  qua_xa_diem_mua: { en: 'Too far past the entry', vi: 'Quá xa điểm mua' },
  // Scoring and bookkeeping
  diem_thap: { en: 'Score below the cut', vi: 'Điểm dưới ngưỡng' },
  chat_luong_thap: { en: 'Quality too low', vi: 'Chất lượng quá thấp' },
  khong_co_catalyst: { en: 'No catalyst', vi: 'Không có chất xúc tác' },
  cho_fund: { en: 'Awaiting fundamentals', vi: 'Chờ điểm cơ bản' },
  co_earnings: { en: 'Earnings too close', vi: 'Sát ngày công bố' },
  trong_danh_muc: { en: 'Already held', vi: 'Đã có trong danh mục' },
  bi_loai_tay: { en: 'Excluded by hand', vi: 'Loại thủ công' },
  khong_thuoc_nganh_top: { en: 'Not in a top sector', vi: 'Không thuộc ngành dẫn dắt' },
  qua_loc: { en: 'Passed the filter', vi: 'Qua lọc' },
  bi_cat_tran: { en: 'Cut by the candidate ceiling', vi: 'Bị cắt bởi trần ứng viên' },
};

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
  /** False when the dictionary had no entry — the UI marks these. */
  known: boolean;
}

function look(table: Record<string, Term>, raw: string): Label {
  const hit = table[normKey(raw)];
  const vi = getLang() === 'vi';
  if (!hit) return { text: prettify(raw), tip: raw, known: false };
  const tip = (vi ? hit.tipVi : hit.tipEn) ?? (vi ? hit.tipEn : hit.tipVi) ?? '';
  return { text: vi ? hit.vi : hit.en, tip: tip || raw, known: true };
}

/**
 * A setup code as words. The code is kept as a suffix rather than replaced:
 * everything else about the scanner — its logs, its Telegram messages, the VM's
 * own output — still says `BO`, so dropping the code would break the link between
 * this table and the thing that produced it.
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
  return look(REASONS, raw);
}
