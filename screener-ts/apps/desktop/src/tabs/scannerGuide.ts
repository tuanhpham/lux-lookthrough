/**
 * What the scanner page MEANS — every gate, every column, every number it compares
 * against, in both languages.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The Scanner tab printed the pipeline's output faithfully and explained none of it.
 * The user's report is the honest outcome of that: *"Why rejected: phan reason phai
 * co them doan details nua, nghia la gi, share o day co nghia la gi, count cai gi vay
 * number of stocks ah? … watchlist cung tuong tu, tai sao lai duoc dua vao … voi cac
 * KPIs nhung so sanh voi cai gi"*. Three different questions with one root cause:
 * the page showed a measurement without the threshold it was measured against, so
 * every row was a number the reader had to take on trust.
 *
 * A tooltip does not fix that — it needs a mouse (this app runs on a phone), it needs
 * the reader to suspect there is something to hover, and it holds one sentence. So the
 * explanations are CONTENT here, the same decision `ui/playbookHelp.ts` made for the
 * playbook dialog, and the same file-level pattern: a data table of `{vi, en}` prose
 * that the renderer walks. Nothing here touches the DOM, so it is testable.
 *
 * ── WHERE THE FACTS COME FROM ───────────────────────────────────────────────
 * `Github/scanner` (a local sibling repo), read, never guessed:
 *   · `setups.py`  — `bo_candidate` / `rv_candidate` / `lead_candidate` gate ORDER and
 *     their reject strings, `lead_pick`'s two caps, `_bo_quality` / `_rv_quality` /
 *     `_lead_quality` weightings, `MAX_CAND`.
 *   · `config.py`  — `REGIME`, `SECTORS`, `LEAD`, `PLAN`, `NIGHTLY`, `INTRADAY`,
 *     `HOLDINGS` and the comment above each number saying WHY it is that number. Those
 *     comments are the source of the `note` lines below.
 *   · `plan.py`    — `trigger()` and `make()`, i.e. how trigger/stop/target/size_pct
 *     are actually derived.
 *   · `push.py`    — `watchlist_payload()`, which is why the watch list is documented
 *     as LEAD-only: it reads `WHERE setup='LEAD' ORDER BY quality DESC LIMIT watch_top`.
 *
 * ── LIVE NUMBER vs MIRRORED NUMBER ──────────────────────────────────────────
 * `scanner:thresholds` carries the running `config.snapshot()`, so every LEAD, PLAN,
 * SECTORS, REGIME and NIGHTLY number on this page can be read off the config that the
 * scanner is ACTUALLY using — a `path` on a gate means exactly that. The `BO` and `RV`
 * dicts live in `setups.py` and are NOT in that snapshot, so those gates carry a
 * mirrored `val` and are marked as mirrored in the UI. A mirror can drift; saying which
 * numbers are mirrors is what keeps the drift visible instead of authoritative.
 */
import { getLang } from '../ui/i18n.js';

/** A string in both languages. HTML: `<b>` and `<i>` are used and must not be escaped. */
export interface Bi {
  vi: string;
  en: string;
}

export const say = (b: Bi): string => (getLang() === 'vi' ? b.vi : b.en);

const isVi = (): boolean => getLang() === 'vi';

/* ── reading the pushed config ───────────────────────────────────────────── */

/** `scanner:thresholds`.config, or nothing yet. */
export type Cfg = Record<string, unknown> | null | undefined;

/** `lead.min_px` → 10. `null` when the config has not arrived or the key moved. */
export function cfgNum(cfg: Cfg, path: string): number | null {
  let cur: unknown = cfg;
  for (const k of path.split('.')) {
    if (!cur || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === 'number' ? cur : null;
}

/**
 * How a threshold prints. A ratio shown as `0.15` and a percentage shown as `15%` are
 * the same fact, and only one of them can be compared by eye against a table cell that
 * says `12.4%`.
 */
export type ThrFmt = 'num' | 'int' | 'pct' | 'money' | 'moneyM' | 'x' | 'sess' | 'sh';

/**
 * Trailing zeros dropped: `10.0` reads as a measurement, `10` reads as a rule.
 *
 * Only ever inside a FRACTION. The obvious one-liner (`replace(/\.?0+$/, '')`) also eats
 * the zero off `20`, which printed the 20% base-depth cap as `2%` — a threshold wrong by a
 * factor of ten, in the direction that looks plausible.
 */
function trim(v: number, d: number): string {
  const s = v.toFixed(d);
  if (!s.includes('.')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '') || '0';
}

/** `0.15` → `15%`, `0.005` → `0.5%`. Enough decimals to stay true, never more. */
function pctNice(v: number): string {
  const p = v * 100;
  const d = Math.abs(p) >= 10 ? 0 : Math.abs(p) >= 1 ? 1 : 2;
  return `${trim(p, d)}%`;
}

export function thrText(v: number | null, fmt: ThrFmt = 'num'): string {
  if (v == null) return '—';
  switch (fmt) {
    case 'int': return String(Math.round(v));
    case 'pct': return pctNice(v);
    case 'money': return `$${trim(v, 2)}`;
    case 'moneyM': return v >= 1e9 ? `$${trim(v / 1e9, 1)}B` : `$${trim(v / 1e6, 1)}M`;
    case 'x': return `${trim(v, 2)}×`;
    case 'sess': return isVi() ? `${Math.round(v)} phiên` : `${Math.round(v)} sessions`;
    case 'sh': return v >= 1e6 ? `${trim(v / 1e6, 1)}M` : `${Math.round(v / 1000)}k`;
    default: return trim(v, 4);
  }
}

/* ── gates ───────────────────────────────────────────────────────────────── */

/**
 * One gate, in the order `setups.py` tests it.
 *
 * `{v}` in the text is the threshold. `path` reads it from the pushed config (live);
 * `val` is a mirror of a `setups.py` constant for the two setups whose dicts the VM
 * does not publish. A gate with neither is a yes/no test with nothing to print.
 */
export interface Gate {
  test: Bi;
  /** Dotted path inside the pushed config — a LIVE number. */
  path?: string;
  /** Mirror of a `setups.py` constant. Marked as a mirror in the UI. */
  val?: number;
  fmt?: ThrFmt;
  /** Why the threshold is where it is. From the comment beside it in the source. */
  note?: Bi;
}

/** The gate's sentence with its threshold substituted in, bolded. */
export function gateText(g: Gate, cfg: Cfg): string {
  const v = g.path ? cfgNum(cfg, g.path) : (g.val ?? null);
  const txt = say(g.test);
  if (v == null) return txt.replace(/\{v\}/g, '<b>—</b>');
  return txt.replace(/\{v\}/g, `<b>${thrText(v, g.fmt)}</b>`);
}

export interface SetupDoc {
  /** One line for the section heading: what this setup IS. */
  sub: Bi;
  /** The idea, in a paragraph. */
  what: Bi;
  /** The universe it is drawn from, when that is narrower than "every symbol". */
  universe?: Bi;
  /** Every gate, in the order the scanner tests them. */
  gates: readonly Gate[];
  /** Caps applied AFTER the gates, to the survivors as a group. */
  caps?: readonly Gate[];
  /** What the `quality` column is for this setup — the weights, in words. */
  quality: Bi;
  /** What still has to happen intraday before it becomes an alert. */
  trigger?: Bi;
  /** True when the gate numbers are mirrored from `setups.py`, not pushed by the VM. */
  mirrored?: boolean;
}

/**
 * The three setups, documented from `setups.py`.
 *
 * The gate ORDER matters as much as the gates: `_rej()` records the FIRST failing gate
 * and returns, so a symbol appears exactly once in "Why rejected" and the counts in
 * that table add up to the universe. A reader who does not know the order reads the
 * reject table as "the reasons it failed" instead of "the first reason it failed".
 */
export const SETUP_DOC: Record<string, SetupDoc> = {
  BO: {
    mirrored: true,
    sub: {
      vi: 'Nền tích lũy đã co lại dưới một pivot, đang chờ giá vượt lên.',
      en: 'A base that has tightened under a pivot, waiting for price to clear it.',
    },
    what: {
      vi: 'Sau một nhịp tăng, giá đi ngang và biên độ hẹp dần lại — người bán đã hết, '
        + 'người mua chưa trả thêm. <b>Pivot</b> là đỉnh của nền đó. Cú vượt pivot là chỗ '
        + 'luận điểm được xác nhận, và cũng là chỗ có thể đặt cắt lỗ sát ngay dưới nền. '
        + 'Scanner KHÔNG mua ở đây: nó chỉ lọc ra những nền đã đủ điều kiện và đang '
        + 'ở đủ gần pivot để hôm nay có thể vượt.',
      en: 'After an advance, price goes sideways and its range narrows — the sellers are '
        + 'done and the buyers are not paying more yet. The <b>pivot</b> is the high of that '
        + 'base. Clearing it is where the idea is confirmed, and it is also the one place a '
        + 'stop can sit tight underneath. The scanner does NOT buy here: it only finds bases '
        + 'that qualify and are close enough to the pivot that today could be the day.',
    },
    gates: [
      {
        test: { vi: 'Giá đóng cửa ≥ {v}', en: 'Close ≥ {v}' },
        val: 1.5, fmt: 'money',
        note: {
          vi: 'Cổ phiếu quá rẻ chạy vô cớ và phí giao dịch ăn hết biên lợi nhuận.',
          en: 'Very cheap stocks move on nothing and the costs eat the edge.',
        },
      },
      {
        test: {
          vi: 'Khối lượng bình quân 20 phiên ≥ {v} cổ',
          en: 'Average volume over 20 sessions ≥ {v} shares',
        },
        val: 200_000, fmt: 'sh',
      },
      {
        test: { vi: 'Nền dài ít nhất {v}', en: 'Base at least {v} long' },
        val: 20, fmt: 'sess',
        note: {
          vi: 'Dưới 20 phiên thì đó là một nhịp nghỉ, chưa phải một nền.',
          en: 'Under twenty sessions it is a pause, not a base.',
        },
      },
      {
        test: { vi: 'Có pivot (một đỉnh rõ ràng trong nền)', en: 'A pivot exists (a clear high inside the base)' },
      },
      {
        test: { vi: 'Nền sâu không quá {v}', en: 'Base no deeper than {v}' },
        val: 0.2, fmt: 'pct',
        note: {
          vi: 'Đo từ đỉnh xuống đáy nền. Dưới $10 thì được phép tới 35%: '
            + 'cổ phiếu giá thấp dao động rộng hơn là bình thường.',
          en: 'Measured top to bottom of the base. Under $10 the limit is 35% instead: '
            + 'cheaper stocks swing wider as a matter of course.',
        },
      },
      {
        test: {
          vi: 'Biên độ cuối nền ≤ {v} biên độ 50 phiên trước đó',
          en: 'Range late in the base ≤ {v} of the range 50 sessions earlier',
        },
        val: 0.75, fmt: 'x',
        note: {
          vi: 'Nền càng về cuối càng phải lặng đi. Không co lại thì đó là giằng xé, không phải tích lũy.',
          en: 'A base should go quieter as it matures. No contraction means a fight, not accumulation.',
        },
      },
      {
        test: { vi: 'Cách đỉnh 52 tuần không quá {v}', en: 'No more than {v} below the 52-week high' },
        val: 0.25, fmt: 'pct',
      },
      { test: { vi: 'Giá đóng cửa ở trên SMA50', en: 'Close above the 50-day average' } },
      {
        test: { vi: 'SMA50 không đi xuống', en: 'The 50-day average is not falling' },
        note: {
          vi: 'Hai điều kiện này là tất cả những gì scanner đòi về xu hướng của riêng mã đó.',
          en: 'These two are the whole of what the scanner asks about the symbol’s own trend.',
        },
      },
      {
        test: { vi: 'Còn dưới pivot không quá {v}', en: 'No more than {v} below the pivot' },
        val: 0.12, fmt: 'pct',
        note: {
          vi: 'Xa pivot 30% thì hôm nay không thể vượt — lấy quote của nó trong phiên là lãng phí.',
          en: '30% below the pivot cannot clear it today, so pulling its quote intraday is waste.',
        },
      },
      {
        test: { vi: 'Đã vượt pivot không quá {v}', en: 'No more than {v} above the pivot' },
        val: 0.05, fmt: 'pct',
        note: {
          vi: 'Vượt rồi mà đã chạy xa thì mua bây giờ là cắt lỗ phải rất rộng.',
          en: 'Already well past it means buying now needs a very wide stop.',
        },
      },
    ],
    quality: {
      vi: '0..1, dùng DUY NHẤT để xếp hạng khi danh sách vượt trần: '
        + '25% nền chặt · 20% sức mạnh tương đối · 20% gần pivot · 15% nền dài · '
        + '10% biên độ co lại · 10% khối lượng cạn dần. '
        + 'Đây KHÔNG phải điểm alert trong phiên — điểm đó do scorer.py chấm khi có dữ liệu ngày.',
      en: '0..1, used ONLY to rank the list when it overflows the ceiling: '
        + '25% base tightness · 20% relative strength · 20% nearness to the pivot · '
        + '15% base length · 10% volatility contraction · 10% volume dry-up. '
        + 'It is NOT the intraday alert score — `scorer.py` computes that from live data.',
    },
    trigger: {
      vi: 'Trong phiên còn phải: vượt hẳn pivot ≥0,5% (không chỉ chạm), không quá +15% '
        + 'trên pivot, RVOL ≥1,8, đóng ở nửa trên biên độ ngày, giá trị giao dịch ≥$2M. '
        + 'Gap hơn 8% vẫn kích hoạt nhưng bị ghi cảnh báo "entry xấu".',
      en: 'Intraday it still has to: clear the pivot by ≥0.5% (not merely touch it), stay '
        + 'under +15% above it, show RVOL ≥1.8, hold the upper half of the day’s range, and '
        + 'trade ≥$2M. A gap over 8% still triggers but is flagged as a poor entry.',
    },
  },

  RV: {
    mirrored: true,
    sub: {
      vi: 'Mã đã rơi sâu, đang chờ một phiên bật mạnh — và điểm cơ bản phải đạt trước.',
      en: 'A name that has fallen a long way, waiting for one strong session — and the '
        + 'fundamentals have to pass first.',
    },
    what: {
      vi: 'Đây là setup ngược lại với Bứt phá: không mua sức mạnh mà mua một cú rơi đã kiệt. '
        + 'Rủi ro của nó cũng ngược lại — một mã rơi 60% có thể rơi tiếp 60% nữa — nên nó là '
        + 'setup DUY NHẤT bắt buộc có điểm cơ bản, và "chưa biết" không bao giờ được coi là "tốt".',
      en: 'The mirror image of a breakout: not buying strength but buying a fall that has '
        + 'exhausted itself. Its risk is the mirror image too — a name down 60% can fall 60% '
        + 'again — so it is the ONE setup that requires fundamentals, and unknown never counts '
        + 'as good.',
    },
    gates: [
      { test: { vi: 'Giá đóng cửa ≥ {v}', en: 'Close ≥ {v}' }, val: 3, fmt: 'money' },
      {
        test: {
          vi: 'Khối lượng bình quân 20 phiên ≥ {v} cổ',
          en: 'Average volume over 20 sessions ≥ {v} shares',
        },
        val: 500_000, fmt: 'sh',
        note: {
          vi: 'Cao hơn Bứt phá: bắt đáy trong một mã mỏng là cách chắc chắn để không ra được.',
          en: 'Higher than the breakout floor: bottom-fishing in a thin name is how you cannot get out.',
        },
      },
      {
        test: { vi: 'Đã rời đỉnh 52 tuần ít nhất {v}', en: 'At least {v} below the 52-week high' },
        val: 0.5, fmt: 'pct',
        note: {
          vi: 'Điều kiện NGƯỢC với Bứt phá. Muốn bắt đảo chiều thì phải có một cú rơi thật trước đó.',
          en: 'The OPPOSITE of the breakout gate. A reversal needs a real fall behind it first.',
        },
      },
      {
        test: { vi: 'Đáy 52 tuần được tạo trong {v} gần nhất', en: 'The 52-week low was set within the last {v}' },
        val: 30, fmt: 'sess',
      },
      {
        test: { vi: 'Lợi nhuận 63 phiên ≤ {v}', en: '63-session return ≤ {v}' },
        val: -0.1, fmt: 'pct',
        note: {
          vi: 'Ba tháng vẫn còn âm — cú rơi là một xu hướng, không phải một phiên xấu.',
          en: 'Three months still negative — the fall is a trend, not one bad session.',
        },
      },
      {
        test: { vi: 'Đã bật từ đáy không quá {v}', en: 'No more than {v} up from the low' },
        val: 0.4, fmt: 'pct',
        note: {
          vi: 'Bật 40% rồi thì điểm vào ít rủi ro đã đi qua.',
          en: 'Up 40% off the low and the low-risk entry has already gone.',
        },
      },
      {
        test: { vi: 'Điểm cơ bản không bị đánh dấu "không đạt"', en: 'Fundamentals not marked as failing' },
        note: {
          vi: 'Chưa có số liệu thì vẫn vào danh sách theo dõi, nhưng điểm kích hoạt trong phiên vẫn đóng.',
          en: 'With no data yet it still enters the watch list, but the intraday trigger stays shut.',
        },
      },
    ],
    quality: {
      vi: '0..1: 45% điểm cơ bản · 25% độ sâu của cú rơi · 15% đáy còn mới · 15% thanh khoản. '
        + 'Điểm cơ bản chiếm phần lớn vì với setup này đó là cả vấn đề.',
      en: '0..1: 45% fundamental score · 25% how deep the fall is · 15% how fresh the low is · '
        + '15% liquidity. Fundamentals dominate because with this setup they are the whole question.',
    },
    trigger: {
      vi: 'Trong phiên còn phải: tăng ≥7%, RVOL ≥3,0, đóng ở 1/4 trên biên độ ngày, '
        + 'giá trị giao dịch ≥$2M, và lấy lại SMA20 sau nhiều tuần ở dưới.',
      en: 'Intraday it still has to: be up ≥7%, show RVOL ≥3.0, close in the top quarter of '
        + 'the day’s range, trade ≥$2M, and reclaim the 20-day average after weeks below it.',
    },
  },

  LEAD: {
    sub: {
      vi: 'Không phải mẫu hình mà là một bộ sàn chất lượng bên trong các sector mạnh nhất.',
      en: 'Not a chart pattern but a quality floor, applied inside the strongest sectors.',
    },
    what: {
      vi: 'Ý tưởng: nếu dòng tiền đang chạy vào XLK, thì những mã XLK vừa mạnh hơn SPY, '
        + 'vừa còn gần đỉnh, vừa đủ thanh khoản chính là những mã nó chạy vào. '
        + 'Không có gate nào về nền hay pivot ở đây — một mã dẫn dắt không bắt buộc phải có nền. '
        + 'Đây là setup duy nhất sinh ra <b>danh sách theo dõi</b> ở mục 03.',
      en: 'The idea: if money is flowing into XLK, then the XLK names that are stronger than '
        + 'SPY, still near their highs and liquid enough are the names it is flowing into. There '
        + 'is no base or pivot gate here — a leader does not have to have a base. This is the '
        + 'only setup that produces the <b>watch list</b> in section 03.',
    },
    universe: {
      vi: 'Chỉ những mã nằm trong thành phần của <b>top {v} sector</b> theo bảng xếp hạng ở mục 02. '
        + 'Không biết mã thuộc sector nào = loại; "không biết" không bao giờ được coi là "thuộc top".',
      en: 'Only symbols in the holdings of the <b>top {v} sectors</b> from the ranking in section '
        + '02. An unknown sector is a rejection: unknown never counts as "in the top".',
    },
    gates: [
      { test: { vi: 'Biết mã này thuộc sector nào', en: 'The symbol’s sector is known' } },
      {
        test: { vi: 'Giá ≥ {v}', en: 'Price ≥ {v}' },
        path: 'lead.min_px', fmt: 'money',
      },
      {
        test: {
          vi: 'Giá trị giao dịch bình quân (ADV50 × giá) ≥ {v} mỗi phiên',
          en: 'Average dollar volume (ADV50 × price) ≥ {v} a session',
        },
        path: 'lead.min_dollar_vol', fmt: 'moneyM',
        note: {
          vi: 'Đo bằng TIỀN, không bằng số cổ: 1 triệu cổ giá $3 và 1 triệu cổ giá $300 là hai '
            + 'thế giới khác nhau. Đây là ngưỡng có tổ chức tham gia.',
          en: 'Measured in MONEY, not shares: a million shares at $3 and a million at $300 are two '
            + 'different worlds. This is the floor institutions trade above.',
        },
      },
      {
        test: { vi: 'RVOL ≥ {v}', en: 'RVOL ≥ {v}' },
        path: 'lead.min_rvol', fmt: 'x',
        note: {
          vi: 'Khối lượng phiên gần nhất so với mức bình thường của chính nó.',
          en: 'The latest session’s volume against its own normal level.',
        },
      },
      { test: { vi: 'Đo được biên độ (ATR)', en: 'Volatility (ATR) can be measured' } },
      {
        test: { vi: 'ATR% ≥ {v}', en: 'ATR% ≥ {v}' },
        path: 'lead.min_atr_pct', fmt: 'pct',
        note: {
          vi: 'Quá lặng thì một cú chạy 3 ATR cũng không bù được phí và trượt giá.',
          en: 'Too quiet and even a 3-ATR move does not cover fees and slippage.',
        },
      },
      {
        test: { vi: 'ATR% ≤ {v}', en: 'ATR% ≤ {v}' },
        path: 'lead.max_atr_pct', fmt: 'pct',
        note: {
          vi: 'Quá động thì cắt lỗ hợp lý xa đến mức vị thế phải nhỏ lại tới vô nghĩa.',
          en: 'Too wild and a sensible stop sits so far away the position shrinks to nothing.',
        },
      },
      {
        test: { vi: 'Có số liệu RS (cần nến của mã chuẩn SPY)', en: 'RS data exists (needs the SPY benchmark bars)' },
      },
      {
        test: { vi: 'Mạnh hơn SPY trong 21 phiên: RS21 ≥ {v}', en: 'Stronger than SPY over 21 sessions: RS21 ≥ {v}' },
        path: 'lead.min_rs21', fmt: 'pct',
      },
      {
        test: { vi: 'Mạnh hơn SPY trong 63 phiên: RS63 ≥ {v}', en: 'Stronger than SPY over 63 sessions: RS63 ≥ {v}' },
        path: 'lead.min_rs63', fmt: 'pct',
        note: {
          vi: 'Phải thắng chỉ số ở CẢ HAI cửa sổ. Một cửa sổ dương có thể là may.',
          en: 'It has to beat the index over BOTH windows. One positive window can be luck.',
        },
      },
      {
        test: { vi: 'Cách đỉnh 52 tuần không quá {v}', en: 'No more than {v} below the 52-week high' },
        path: 'lead.max_off_high', fmt: 'pct',
        note: {
          vi: 'Mã dẫn dắt được mua gần đỉnh. Xa đỉnh 40% thì nó không dẫn dắt gì cả.',
          en: 'A leader is bought near its high. 40% below it, it is not leading anything.',
        },
      },
    ],
    caps: [
      {
        test: { vi: 'Tối đa {v} mã mỗi sector', en: 'At most {v} names per sector' },
        path: 'lead.per_sector', fmt: 'int',
        note: {
          vi: 'Không có trần này thì một sector duy nhất chiếm hết chỗ, và "dẫn dắt ở top 3 sector" '
            + 'thành "dẫn dắt ở một sector".',
          en: 'Without this one sector fills every slot, and "leaders across the top 3 sectors" '
            + 'becomes "leaders in one sector".',
        },
      },
      {
        test: { vi: 'Tối đa {v} mã tổng', en: 'At most {v} names in total' },
        path: 'lead.max_total', fmt: 'int',
        note: {
          vi: 'Bị cắt ở đây KHÔNG phải một lỗi của mã đó: nó đạt chuẩn nhưng xếp dưới suất cuối cùng.',
          en: 'Being cut here is NOT a fault of the name: it qualified but ranked below the last slot.',
        },
      },
    ],
    quality: {
      vi: '0..1, CHỈ là điểm RS: 60% RS63 + 40% RS21, mỗi phần chia cho mức trần của nó '
        + '(30% và 15%) rồi kẹp vào 0..1. 63 phiên nặng hơn vì xu hướng ba tháng là cái ta bám theo. '
        + 'Có ý KHÔNG cộng thêm "gần đỉnh" hay "thanh khoản": chúng đã là bộ lọc ở trên, '
        + 'và một tiêu chí vừa dùng để loại vừa dùng để chấm điểm thì tính hai lần.',
      en: '0..1, RS only: 60% RS63 + 40% RS21, each divided by its own cap (30% and 15%) and '
        + 'clipped to 0..1. The 63-session window weighs more because the three-month trend is what '
        + 'is being ridden. "Near the high" and "liquid" are deliberately NOT added in: they are '
        + 'already gates above, and a criterion used both to reject and to score counts twice.',
    },
  },
};

/* ── the rejects table ───────────────────────────────────────────────────── */

/** The three columns of "Why rejected", each said in one sentence. */
export const REJ_LEGEND: readonly { term: Bi; def: Bi }[] = [
  {
    term: { vi: 'Lý do', en: 'Reason' },
    def: {
      vi: 'Điều kiện <b>ĐẦU TIÊN</b> mà mã đó không đạt. Các điều kiện được kiểm tra theo đúng '
        + 'thứ tự trong bảng ở trên và dừng ngay ở cái đầu tiên thất bại, nên mỗi mã chỉ xuất '
        + 'hiện MỘT lần trong bảng này. Một mã bị loại vì "kém thanh khoản" có thể còn sai cả '
        + 'năm điều kiện sau đó — bảng này không nói gì về chúng.',
      en: 'The <b>FIRST</b> condition the symbol failed. The gates are tested in exactly the '
        + 'order listed above and testing stops at the first failure, so each symbol appears '
        + 'ONCE in this table. A name rejected for "liquidity too low" may also fail five later '
        + 'gates — this table says nothing about those.',
    },
  },
  {
    term: { vi: 'Số mã', en: 'Count' },
    def: {
      vi: 'Số <b>cổ phiếu</b> (không phải số phiên, không phải số lần) dừng lại ở đúng điều kiện đó '
        + 'trong lần quét gần nhất.',
      en: 'How many <b>stocks</b> — not sessions, not events — stopped at that exact gate in the '
        + 'latest scan.',
    },
  },
  {
    term: { vi: 'Tỷ lệ', en: 'Share' },
    def: {
      vi: 'Số mã đó chia cho <b>tất cả</b> các mã đã được xét cho setup này, tức là tổng các dòng '
        + 'bị loại cộng với số mã qua được lọc (chip "qua lọc" ở trên). Cộng cả bảng lại là 100%.',
      en: 'That count divided by <b>every</b> symbol examined for this setup — the rejected rows '
        + 'plus the ones that passed (the "passed" chip above). The whole table adds to 100%.',
    },
  },
];

/** What the section as a whole is, above the legend. */
export const REJ_INTRO: Bi = {
  vi: 'Bảng này được <b>tính lại</b> mỗi lần đẩy dữ liệu, từ bảng <code>struct</code> và ngưỡng '
    + '<b>đang chạy</b> — nó không phải bản lưu của lần quét cũ. Nghĩa là sửa một ngưỡng rồi đọc lại '
    + 'ở đây thì con số đã theo ngưỡng mới. Đây cũng là cách nhanh nhất để biết một bộ lọc quá chặt: '
    + 'nếu 80% mã dừng ở một điều kiện duy nhất, thì điều kiện đó đang quyết định tất cả.',
  en: 'This table is <b>recomputed</b> on every push, from the <code>struct</code> table and the '
    + '<b>live</b> thresholds — it is not a saved copy of an old scan. So change a threshold and the '
    + 'numbers here already reflect it. It is also the fastest way to see a filter that is too '
    + 'strict: if 80% of names stop at one gate, that gate is deciding everything.',
};

/**
 * The denominator, said out loud under each setup's heading. Without it the percentages
 * are shares of an unnamed whole, which is the specific thing the user could not read.
 */
export const REJ_TOTAL: Bi = {
  vi: 'mã đã được xét cho setup này (bị loại + qua lọc) = 100% của cột tỷ lệ',
  en: 'symbols examined for this setup (rejected + passed) = the 100% of the share column',
};

/* ── the watch list ──────────────────────────────────────────────────────── */

/** Why a symbol is on the watch list at all — the part that is true of every row. */
export const WATCH_WHY: readonly { h: Bi; p: Bi }[] = [
  {
    h: { vi: '1 · Nó là một ứng viên LEAD', en: '1 · It is a LEAD candidate' },
    p: {
      vi: 'Danh sách này <b>chỉ</b> lấy setup Dẫn dắt ngành (LEAD) — không có Bứt phá, không có '
        + 'Đảo chiều. Nên mọi dòng ở đây đã qua toàn bộ các điều kiện LEAD ở mục 07, theo đúng thứ tự, '
        + 'trên nến <b>đã đóng</b> của phiên gần nhất.',
      en: 'This list takes <b>only</b> the Sector-leader (LEAD) setup — no breakouts, no reversals. '
        + 'So every row here cleared the full LEAD gate list from section 07, in order, on the last '
        + '<b>closed</b> bar.',
    },
  },
  {
    h: { vi: '2 · Nó thuộc một sector đang mạnh', en: '2 · Its sector is one of the strong ones' },
    p: {
      vi: 'Chỉ các mã trong thành phần của top {top} sector mới được xét. Bảng ở mục 02 là nguồn của '
        + 'danh sách đó, nên một sector rơi khỏi top 3 sẽ làm cả nhóm mã của nó rời danh sách này '
        + 'tối hôm sau.',
      en: 'Only names held by the top {top} sectors are examined at all. The table in section 02 is '
        + 'where that list comes from, so a sector dropping out of the top 3 takes its whole group '
        + 'off this list the next night.',
    },
  },
  {
    h: { vi: '3 · Nó xếp cao theo điểm RS', en: '3 · It ranks high on RS' },
    p: {
      vi: 'Các mã đạt chuẩn được xếp theo <b>quality</b> (0,6 × RS63 + 0,4 × RS21, xem mục 07) và '
        + 'chỉ {n} mã đầu vào bảng này. Chip ở tiêu đề cho biết tổng số mã đạt chuẩn — nếu nó lớn hơn '
        + 'số dòng, phần còn lại bị cắt vì trần, không phải vì kém.',
      en: 'Qualifying names are ordered by <b>quality</b> (0.6 × RS63 + 0.4 × RS21, see section 07) '
        + 'and only the top {n} enter this table. The chip in the heading gives the full qualifying '
        + 'count — when it is larger than the row count, the rest were cut by the ceiling, not by quality.',
    },
  },
  {
    h: { vi: '4 · Nó có một kế hoạch lập được', en: '4 · A plan could be built for it' },
    p: {
      vi: 'Cột Vào/Cắt lỗ/Mục tiêu do <code>plan.make()</code> tính <b>tối hôm trước</b> từ nến đã đóng, '
        + 'và chúng KHÔNG đổi trong phiên: quyết định vào lệnh được lập từ đêm trước, trong phiên chỉ '
        + 'thực hiện. Thiếu ATR thì không lập được kế hoạch, và dòng đó ghi rõ là không có kế hoạch '
        + 'thay vì in số gần đúng.',
      en: 'The Entry/Stop/Target columns were computed <b>last night</b> from the closed bar by '
        + '<code>plan.make()</code>, and they do NOT move during the session: the decision is made the '
        + 'night before and only executed intraday. With no ATR no plan can be built, and such a row '
        + 'says so rather than printing an approximation.',
    },
  },
];

/** How the plan's four numbers are derived, with the live PLAN config in them. */
export const PLAN_STEPS: readonly { k: Bi; v: Bi }[] = [
  {
    k: { vi: 'Điểm vào (trigger)', en: 'Entry (trigger)' },
    v: {
      vi: 'max(pivot, đỉnh của nến quyết định) × (1 + {buf}). Lấy max chứ không lấy pivot: nếu giá đã '
        + 'chạy lên trên pivot thì mua ở pivot là mua ở một giá không còn tồn tại.',
      en: 'max(pivot, the decision bar’s high) × (1 + {buf}). The max, not the pivot: if price has '
        + 'already run above the pivot then buying at the pivot is buying at a price that no longer exists.',
    },
  },
  {
    k: { vi: 'Cắt lỗ', en: 'Stop' },
    v: {
      vi: 'Điểm vào − {atr} × ATR(14). Không phải một số tiền chịu được, mà là khoảng cách mà biên độ '
        + 'bình thường của chính mã đó không đi hết.',
      en: 'Entry − {atr} × ATR(14). Not an amount you can stomach but a distance the name’s own '
        + 'normal daily range does not cover.',
    },
  },
  {
    k: { vi: 'Mục tiêu', en: 'Target' },
    v: {
      vi: 'Điểm vào + {rr} × (điểm vào − cắt lỗ), tức {rr}R.',
      en: 'Entry + {rr} × (entry − stop), i.e. {rr}R.',
    },
  },
  {
    k: { vi: 'Cỡ vị thế (size%)', en: 'Position size (size%)' },
    v: {
      vi: 'Ngân sách rủi ro {risk} chia cho khoảng cách cắt lỗ theo %, kẹp trần {cap} vốn, rồi nhân với '
        + 'hệ số của ô playbook hôm nay. Stop rộng hơn → vị thế nhỏ hơn, tự động. '
        + '<b>Đây là con số cuối cùng</b>: nhân lại với hệ số playbook một lần nữa là tự giảm vị thế '
        + 'xuống một nửa mà không ai thấy.',
      en: 'The {risk} risk budget divided by the stop distance in percent, capped at {cap} of capital, '
        + 'then multiplied by today’s playbook coefficient. A wider stop means a smaller position, '
        + 'automatically. <b>This is the final number</b>: multiplying it by the playbook coefficient '
        + 'again quietly halves the position.',
    },
  },
];

/** `plan.*` filled into the four steps above. */
export function planStepText(v: Bi, cfg: Cfg): string {
  return say(v)
    .replace('{buf}', `<b>${thrText(cfgNum(cfg, 'plan.trigger_buf'), 'pct')}</b>`)
    .replace(/\{atr\}/g, `<b>${thrText(cfgNum(cfg, 'plan.stop_atr'), 'num')}</b>`)
    .replace(/\{rr\}/g, `<b>${thrText(cfgNum(cfg, 'plan.rr'), 'num')}</b>`)
    .replace('{risk}', `<b>${thrText(cfgNum(cfg, 'plan.risk_pct'), 'pct')}</b>`)
    .replace('{cap}', `<b>${thrText(cfgNum(cfg, 'plan.max_pos_pct'), 'pct')}</b>`);
}

/* ── per-row checks ──────────────────────────────────────────────────────── */

/**
 * One line of a row's "why it is on the list": the measurement, the threshold it was
 * measured against, and whether it cleared.
 *
 * `unknown` is a real state and not a failure. Two fields the LEAD gates used are not
 * carried in the watch row (the 50-session average volume and RVOL), and printing a red
 * ✕ for a number this snapshot does not contain would accuse a row that passed.
 */
export interface Check {
  state: 'ok' | 'bad' | 'unknown';
  label: string;
  /** What this row measured. */
  value: string;
  /** What it had to clear. */
  vs: string;
  /** Why the threshold is there, or why the state is unknown. */
  note?: string;
}

const CHK: Record<string, Bi> = {
  sector: { vi: 'Sector trong top', en: 'Sector in the top' },
  px: { vi: 'Giá', en: 'Price' },
  dvol: { vi: 'Giá trị giao dịch', en: 'Dollar volume' },
  rvol: { vi: 'RVOL', en: 'RVOL' },
  atrMin: { vi: 'ATR% đủ động', en: 'ATR% lively enough' },
  atrMax: { vi: 'ATR% không quá rộng', en: 'ATR% not too wide' },
  rs21: { vi: 'Mạnh hơn SPY 21 phiên', en: 'Stronger than SPY over 21 sessions' },
  rs63: { vi: 'Mạnh hơn SPY 63 phiên', en: 'Stronger than SPY over 63 sessions' },
  offHigh: { vi: 'Còn gần đỉnh 52 tuần', en: 'Still near the 52-week high' },
  plan: { vi: 'Lập được kế hoạch', en: 'A plan exists' },
  rank: { vi: 'Điểm RS (quality)', en: 'RS score (quality)' },
};

const NOTE_ADV: Bi = {
  vi: 'Bộ lọc đo bằng bình quân 50 phiên; dòng này chỉ mang bình quân 20 phiên, nên con số ở đây là '
    + 'xấp xỉ, không phải đúng con số bộ lọc đã thấy.',
  en: 'The gate measured the 50-session average; this row only carries the 20-session one, so the '
    + 'figure here is close but not the one the gate saw.',
};
const NOTE_RVOL: Bi = {
  vi: 'Đo lúc dựng ứng viên và không được lưu vào dòng này. Mã đã qua được điều kiện đó, '
    + 'nhưng bản chụp này không nói giá trị là bao nhiêu.',
  en: 'Measured when the candidate was built and not stored on this row. The name did clear the gate; '
    + 'this snapshot simply does not carry the value.',
};
const NOTE_TOP: Bi = {
  vi: 'Bảng xếp hạng sector của mục 02, lấy từ bản chụp mới nhất — không phải bản đã dùng tối qua, '
    + 'nên một sector vừa rơi khỏi top vẫn có thể còn mã ở đây tới tối nay.',
  en: 'The sector ranking from section 02 as of the latest snapshot — not necessarily the one used '
    + 'last night, so a sector that has just dropped out can still have names here until tonight.',
};

/** A 0..1 fraction as a percentage, for the check lines. */
const cpct = (v: number | null | undefined, d = 1): string =>
  v == null ? '—' : `${(v * 100).toFixed(d)}%`;

const cmoney = (v: number | null | undefined): string =>
  v == null ? '—' : `$${v.toFixed(2)}`;

export interface WatchLike {
  sector?: string;
  ref_close?: number | null;
  atr_pct?: number | null;
  off_high?: number | null;
  rs21?: number | null;
  rs63?: number | null;
  adv20?: number | null;
  quality?: number | null;
  trigger?: number | null;
  stop?: number | null;
}

/**
 * Every LEAD gate, as this row measures against the live config — in the order the
 * scanner tested them.
 *
 * `top` is the current top-N sector list; empty means the sectors snapshot has not
 * arrived, and then the sector line is `unknown` rather than a failure.
 */
export function watchChecks(r: WatchLike, cfg: Cfg, top: readonly string[]): Check[] {
  const L = (k: string): string => say(CHK[k]!);
  const out: Check[] = [];
  const vi = isVi();

  const inTop = r.sector ? top.includes(r.sector) : false;
  out.push({
    state: !top.length || !r.sector ? 'unknown' : inTop ? 'ok' : 'unknown',
    label: L('sector'),
    value: r.sector || '—',
    vs: top.length ? top.join(' · ') : (vi ? 'chưa có xếp hạng' : 'no ranking yet'),
    note: say(NOTE_TOP),
  });

  const minPx = cfgNum(cfg, 'lead.min_px');
  out.push({
    state: r.ref_close == null || minPx == null ? 'unknown' : r.ref_close >= minPx ? 'ok' : 'bad',
    label: L('px'),
    value: cmoney(r.ref_close),
    vs: `≥ ${thrText(minPx, 'money')}`,
  });

  const minDv = cfgNum(cfg, 'lead.min_dollar_vol');
  const dv = r.adv20 != null && r.ref_close != null ? r.adv20 * r.ref_close : null;
  out.push({
    state: dv == null || minDv == null ? 'unknown' : dv >= minDv ? 'ok' : 'unknown',
    label: L('dvol'),
    value: dv == null ? '—' : `≈ ${thrText(dv, 'moneyM')}`,
    vs: `≥ ${thrText(minDv, 'moneyM')}`,
    note: say(NOTE_ADV),
  });

  out.push({
    state: 'unknown',
    label: L('rvol'),
    value: '—',
    vs: `≥ ${thrText(cfgNum(cfg, 'lead.min_rvol'), 'x')}`,
    note: say(NOTE_RVOL),
  });

  const atrMin = cfgNum(cfg, 'lead.min_atr_pct');
  const atrMax = cfgNum(cfg, 'lead.max_atr_pct');
  out.push({
    state: r.atr_pct == null || atrMin == null ? 'unknown' : r.atr_pct >= atrMin ? 'ok' : 'bad',
    label: L('atrMin'),
    value: cpct(r.atr_pct, 2),
    vs: `≥ ${thrText(atrMin, 'pct')}`,
  });
  out.push({
    state: r.atr_pct == null || atrMax == null ? 'unknown' : r.atr_pct <= atrMax ? 'ok' : 'bad',
    label: L('atrMax'),
    value: cpct(r.atr_pct, 2),
    vs: `≤ ${thrText(atrMax, 'pct')}`,
  });

  const mr21 = cfgNum(cfg, 'lead.min_rs21');
  const mr63 = cfgNum(cfg, 'lead.min_rs63');
  out.push({
    state: r.rs21 == null || mr21 == null ? 'unknown' : r.rs21 >= mr21 ? 'ok' : 'bad',
    label: L('rs21'),
    value: r.rs21 == null ? '—' : `${r.rs21 >= 0 ? '+' : ''}${cpct(r.rs21)}`,
    vs: `≥ ${thrText(mr21, 'pct')}`,
  });
  out.push({
    state: r.rs63 == null || mr63 == null ? 'unknown' : r.rs63 >= mr63 ? 'ok' : 'bad',
    label: L('rs63'),
    value: r.rs63 == null ? '—' : `${r.rs63 >= 0 ? '+' : ''}${cpct(r.rs63)}`,
    vs: `≥ ${thrText(mr63, 'pct')}`,
  });

  const maxOff = cfgNum(cfg, 'lead.max_off_high');
  out.push({
    state: r.off_high == null || maxOff == null ? 'unknown' : r.off_high <= maxOff ? 'ok' : 'bad',
    label: L('offHigh'),
    value: cpct(r.off_high),
    vs: `≤ ${thrText(maxOff, 'pct')}`,
  });

  // Not a gate but the reason this row is above the fold rather than cut by the ceiling.
  const cap21 = cfgNum(cfg, 'lead.rs_cap21');
  const cap63 = cfgNum(cfg, 'lead.rs_cap63');
  out.push({
    state: r.quality == null ? 'unknown' : 'ok',
    label: L('rank'),
    value: r.quality == null ? '—' : r.quality.toFixed(2),
    vs: vi ? 'xếp hạng, không phải ngưỡng' : 'a ranking, not a threshold',
    note: vi
      ? `0,6 × kẹp(RS63 / ${thrText(cap63, 'pct')}) + 0,4 × kẹp(RS21 / ${thrText(cap21, 'pct')}). `
        + 'Điểm cao nghĩa là mạnh hơn SPY nhiều hơn, không có gì khác.'
      : `0.6 × clip(RS63 / ${thrText(cap63, 'pct')}) + 0.4 × clip(RS21 / ${thrText(cap21, 'pct')}). `
        + 'A high score means more strength over SPY, and nothing else.',
  });

  out.push({
    state: r.trigger == null || r.stop == null ? 'bad' : 'ok',
    label: L('plan'),
    value: r.trigger == null || r.stop == null
      ? (vi ? 'không có' : 'none')
      : (vi ? 'có' : 'yes'),
    vs: vi ? 'cần pivot/đỉnh và ATR' : 'needs a pivot/high and an ATR',
    note: r.trigger == null || r.stop == null
      ? (vi ? 'Thiếu ATR hoặc thiếu mốc để tính điểm vào, nên không có lệnh nào để thực hiện.'
            : 'No ATR, or no level to compute an entry from, so there is no order to execute.')
      : undefined,
  });

  return out;
}

/* ── the metric glossary ─────────────────────────────────────────────────── */

/**
 * Every column that is a measurement rather than a name, said in words, with what it
 * is compared against where there is one.
 *
 * Keyed by the payload's own field names so a call site can ask for exactly the columns
 * it printed — a glossary listing fields a table does not show is a glossary nobody
 * finishes reading.
 */
export const METRICS: Record<string, { label: Bi; what: Bi; vs?: Bi }> = {
  quality: {
    label: { vi: 'quality', en: 'quality' },
    what: {
      vi: 'Điểm 0..1 để XẾP HẠNG trong cùng một setup. Công thức khác nhau theo từng setup, '
        + 'nên quality 0,8 của Bứt phá và 0,8 của Dẫn dắt không so sánh được với nhau.',
      en: 'A 0..1 score used to RANK within one setup. The formula differs per setup, so a 0.8 on '
        + 'a breakout and a 0.8 on a leader are not comparable.',
    },
    vs: {
      vi: 'Không có ngưỡng: không ai bị loại vì quality thấp, chỉ bị cắt khi danh sách quá dài.',
      en: 'No threshold: nothing is rejected for a low quality, only cut when the list overflows.',
    },
  },
  ref_close: {
    label: { vi: 'Đóng cửa', en: 'Close' },
    what: {
      vi: 'Giá đóng cửa của phiên <b>đã đóng</b> mà mọi quyết định dưới đây dựa trên — không phải giá lúc này.',
      en: 'The close of the <b>closed</b> session every decision below was made on — not the price now.',
    },
  },
  pivot: {
    label: { vi: 'Pivot', en: 'Pivot' },
    what: {
      vi: 'Đỉnh của nền tích lũy: mức mà giá phải vượt để luận điểm được xác nhận. '
        + 'Mã LEAD có thể không có pivot nào.',
      en: 'The high of the base: the level price has to clear for the idea to be confirmed. A LEAD '
        + 'name may have no pivot at all.',
    },
  },
  dist_pivot: {
    label: { vi: 'Tới pivot', en: 'To pivot' },
    what: {
      vi: 'Còn bao nhiêu % nữa mới tới pivot. <b>Số âm nghĩa là đã vượt</b> pivot rồi.',
      en: 'How far below the pivot price still is, in percent. <b>Negative means it has already '
        + 'cleared</b> the pivot.',
    },
    vs: {
      vi: 'Bứt phá đòi khoảng này nằm giữa −5% và +12%.',
      en: 'A breakout requires this to sit between −5% and +12%.',
    },
  },
  base_len: {
    label: { vi: 'Nền (phiên)', en: 'Base (sessions)' },
    what: {
      vi: 'Nền tích lũy dài bao nhiêu phiên.',
      en: 'How many sessions long the base is.',
    },
    vs: { vi: 'Bứt phá đòi ≥20 phiên.', en: 'A breakout requires ≥20 sessions.' },
  },
  base_depth: {
    label: { vi: 'Độ sâu nền', en: 'Base depth' },
    what: {
      vi: 'Đỉnh xuống đáy của nền, theo %. Nền càng nông càng chặt.',
      en: 'Top to bottom of the base, in percent. Shallower is tighter.',
    },
    vs: {
      vi: 'Bứt phá đòi ≤20% (≤35% nếu giá dưới $10).',
      en: 'A breakout requires ≤20% (≤35% under $10).',
    },
  },
  off_high: {
    label: { vi: 'Cách đỉnh', en: 'Off high' },
    what: {
      vi: 'Còn cách đỉnh 52 tuần bao nhiêu %.',
      en: 'How far below the 52-week high price is, in percent.',
    },
    vs: {
      vi: 'Bứt phá ≤25%, Dẫn dắt ≤15% — nhưng Đảo chiều đòi NGƯỢC LẠI: ≥50%.',
      en: 'Breakout ≤25%, leader ≤15% — but a reversal requires the OPPOSITE: ≥50%.',
    },
  },
  rs_pct: {
    label: { vi: 'RS (thứ hạng)', en: 'RS (percentile)' },
    what: {
      vi: 'Thứ hạng sức mạnh so với toàn bộ số mã được quét, 0..100. 90 = mạnh hơn 90% số mã.',
      en: 'Strength rank against every scanned symbol, 0..100. 90 = stronger than 90% of them.',
    },
  },
  rs21: {
    label: { vi: 'RS21', en: 'RS21' },
    what: {
      vi: 'Lợi nhuận 21 phiên <b>trừ</b> lợi nhuận 21 phiên của SPY, tính bằng điểm phần trăm. '
        + 'Dương = thắng chỉ số.',
      en: 'The 21-session return <b>minus</b> SPY’s, in percentage points. Positive = beating the index.',
    },
    vs: {
      vi: 'Dẫn dắt đòi cả RS21 và RS63 đều ≥0.',
      en: 'A leader requires both RS21 and RS63 to be ≥0.',
    },
  },
  rs63: {
    label: { vi: 'RS63', en: 'RS63' },
    what: {
      vi: 'Như RS21 nhưng ba tháng. Nặng hơn RS21 trong điểm quality vì xu hướng ba tháng là cái được bám theo.',
      en: 'Like RS21 but over three months. It weighs more in the quality score because the '
        + 'three-month trend is what is being ridden.',
    },
  },
  adv20: {
    label: { vi: 'ADV20', en: 'ADV20' },
    what: {
      vi: 'Khối lượng bình quân 20 phiên, tính bằng <b>số cổ phiếu</b>.',
      en: 'Average volume over 20 sessions, in <b>shares</b>.',
    },
    vs: {
      vi: 'Bứt phá ≥200k cổ, Đảo chiều ≥500k cổ. Dẫn dắt không đo bằng cổ mà bằng tiền (ADV50 × giá).',
      en: 'Breakout ≥200k shares, reversal ≥500k. A leader is measured in money instead (ADV50 × price).',
    },
  },
  atr_pct: {
    label: { vi: 'ATR%', en: 'ATR%' },
    what: {
      vi: 'Biên độ trung bình một phiên, theo % giá. Đây là thước đo "một phiên bình thường đi bao xa" '
        + 'và là cái quyết định cắt lỗ rộng hay chặt.',
      en: 'The average size of one session’s move as a percent of price. It is the "how far does a '
        + 'normal day travel" yardstick, and it decides how wide the stop is.',
    },
    vs: {
      vi: 'Dẫn dắt đòi 2%–6%: dưới 2% thì không đủ động để bù phí, trên 6% thì cắt lỗ quá rộng.',
      en: 'A leader requires 2%–6%: under 2% there is not enough movement to cover costs, over 6% the '
        + 'stop is too wide.',
    },
  },
  fund_ok: {
    label: { vi: 'Cơ bản', en: 'Fund' },
    what: {
      vi: 'Điểm cơ bản đã đạt chưa. Dấu — nghĩa là <b>chưa biết</b>, và "chưa biết" không bao giờ '
        + 'được coi là "tốt".',
      en: 'Whether the fundamental screen passed. A dash means <b>unknown</b>, and unknown never '
        + 'counts as good.',
    },
    vs: {
      vi: 'Chỉ Đảo chiều bắt buộc điều kiện này; nó chặn điểm kích hoạt trong phiên.',
      en: 'Only a reversal requires it; it gates the intraday trigger.',
    },
  },
  trigger: {
    label: { vi: 'Vào', en: 'Entry' },
    what: {
      vi: 'Giá đặt lệnh, tính từ đêm trước. Không phải giá hiện tại và không đổi trong phiên.',
      en: 'The order price, computed the night before. Not the current price, and it does not move '
        + 'during the session.',
    },
  },
  togo: {
    label: { vi: 'Còn (togo)', en: 'To go' },
    what: {
      vi: 'Giá còn phải đi bao nhiêu % nữa mới tới điểm vào. Số âm = đã qua điểm vào. '
        + 'Con số nhỏ sau đó là cùng khoảng cách đó tính theo ATR — 2% là gần với một mã lặng '
        + 'và không là gì với một mã động.',
      en: 'How much further price has to travel to reach the entry. Negative = already through it. '
        + 'The small figure after it is the same distance in ATR — 2% is close for a quiet stock and '
        + 'nothing at all for a volatile one.',
    },
  },
  size_pct: {
    label: { vi: 'Cỡ vị thế', en: 'Size%' },
    what: {
      vi: 'Phần trăm vốn của lệnh này, <b>đã</b> nhân hệ số playbook hôm nay. Đây là con số để vào lệnh.',
      en: 'This trade as a percent of capital, with today’s playbook coefficient <b>already</b> '
        + 'folded in. This is the number to trade off.',
    },
  },
  stop: {
    label: { vi: 'Cắt lỗ', en: 'Stop' },
    what: {
      vi: 'Điểm vào trừ 1,5 × ATR(14). Số % bên cạnh là khoảng đó tính theo % điểm vào.',
      en: 'The entry minus 1.5 × ATR(14). The percent beside it is that distance as a percent of the entry.',
    },
  },
  target: {
    label: { vi: 'Mục tiêu', en: 'Target' },
    what: {
      vi: 'Điểm vào + 2 × khoảng cắt lỗ, tức 2R.',
      en: 'The entry plus 2 × the stop distance, i.e. 2R.',
    },
  },

  /* ── the alerts table ──────────────────────────────────────────────────── */
  /* These are the intraday engine's numbers, from `scorer.py` and `outcome.py`, and
     the thresholds in them are mirrors: `scorer.py`'s own constants are module-level
     and are not part of `config.snapshot()`. */
  score: {
    label: { vi: 'Điểm (alert)', en: 'Score (alert)' },
    what: {
      vi: 'Điểm trong phiên, cộng từ bốn phần: RVOL, biên độ tính theo ATR, vòng quay so với '
        + 'lượng cổ phiếu tự do, và giá trị giao dịch — cộng 1,5 nếu chỉ Alpaca thấy nó. '
        + 'Thang điểm này <b>không liên quan</b> tới cột quality của ban đêm.',
      en: 'The intraday score, summed from four parts: RVOL, the size of the move in ATR, volume '
        + 'against the free float, and dollar traded — plus 1.5 when only Alpaca sees it. This '
        + 'scale has <b>nothing to do</b> with the nightly quality column.',
    },
    vs: {
      vi: 'Từ 7,0 trở lên mới gửi Telegram; dưới mức đó chỉ được ghi lại. '
        + 'RVOL nặng nhất (2,2), rồi biên độ (1,6), vòng quay (1,4), giá trị giao dịch (0,5).',
      en: 'At 7.0 and above it is sent to Telegram; below that it is only recorded. RVOL weighs '
        + 'most (2.2), then the ATR move (1.6), rotation (1.4), dollar volume (0.5).',
    },
  },
  px: {
    label: { vi: 'Giá (lúc gửi)', en: 'Price (at alert)' },
    what: {
      vi: 'Giá tại thời điểm cảnh báo. Mọi cột kết quả bên phải được đo từ con số này, '
        + 'nên nó là mốc, không phải giá hiện tại.',
      en: 'The price at the moment of the alert. Every outcome column to the right is measured '
        + 'from this figure, so it is the benchmark, not the price now.',
    },
  },
  chg: {
    label: { vi: 'Thay đổi', en: 'Change' },
    what: {
      vi: 'Thay đổi so với đóng cửa hôm trước, lấy từ chính nguồn báo giá. Nếu số này lệch quá '
        + '25 điểm phần trăm so với số tự tính thì mã bị loại vì nghi gộp/chia cổ phiếu.',
      en: 'The move from yesterday’s close, taken from the quote source itself. If it disagrees '
        + 'with the computed figure by more than 25 percentage points the symbol is dropped as a '
        + 'suspected split.',
    },
    vs: { vi: 'Phải ≥ +5% mới được chấm điểm.', en: 'Must be ≥ +5% to be scored at all.' },
  },
  rvol: {
    label: { vi: 'RVOL (trong phiên)', en: 'RVOL (intraday)' },
    what: {
      vi: 'Khối lượng đã khớp chia cho khối lượng <b>thường có tới giờ này</b> của phiên — '
        + 'không phải chia cho cả ngày, nên 3× lúc 10 giờ sáng là thật.',
      en: 'Volume so far divided by the volume this name <b>normally has by this hour</b> — not by '
        + 'a full day, so 3× at 10am is a real 3×.',
    },
    vs: {
      vi: 'Phải ≥ 3,0×. Trong điểm, nó vào theo log10 và bị chặn ở 100×.',
      en: 'Must be ≥ 3.0×. Inside the score it enters as log10 and is capped at 100×.',
    },
  },
  dollar_vol: {
    label: { vi: 'Giá trị GD', en: 'Dollar volume' },
    what: {
      vi: 'Giá × khối lượng đã khớp hôm nay. Đây là thước đo "có thoát được không", '
        + 'khác với ADV20 đo bằng số cổ phiếu.',
      en: 'Price × volume traded today. This is the "can it be exited" yardstick, unlike ADV20 '
        + 'which counts shares.',
    },
    vs: { vi: 'Phải > $2M mới được chấm điểm.', en: 'Must be > $2M to be scored.' },
  },
  px15: {
    label: { vi: '+15m / +60m', en: '+15m / +60m' },
    what: {
      vi: 'Giá 15 và 60 phút sau cảnh báo, hiển thị dưới dạng % so với giá lúc gửi. Đây là phần '
        + 'kiểm tra lại chính mình: một cảnh báo tốt thì hai cột này xanh.',
      en: 'The price 15 and 60 minutes later, shown as a percent move from the alert price. This '
        + 'is the engine marking its own homework: a good alert is green in both.',
    },
  },
  px_close: {
    label: { vi: 'Đóng cửa', en: 'Close' },
    what: {
      vi: 'Giá đóng phiên so với giá lúc gửi — cảnh báo có giữ được tới hết ngày hay không.',
      en: 'The closing price against the alert price — whether the move held to the bell.',
    },
  },
  hi_after: {
    label: { vi: 'MFE (đỉnh sau đó)', en: 'MFE (best case)' },
    what: {
      vi: 'Đỉnh cao nhất SAU cảnh báo: "nếu bán đúng đỉnh thì được bao nhiêu". Luôn ≥ 0 vì nó '
        + 'được mở bằng chính giá lúc gửi.',
      en: 'The highest price AFTER the alert: "what if you had sold the top". Always ≥ 0, because '
        + 'it is seeded with the alert price itself.',
    },
    vs: {
      vi: 'Trong ngày, con số này chỉ chính xác tới mức các vòng quét chạm được; đêm đó nó được '
        + 'ghi lại từ nến thật.',
      en: 'During the session this is only as accurate as the scan loop sampled; that night it is '
        + 'rewritten from real bars.',
    },
  },
  lo_after: {
    label: { vi: 'MAE (đáy sau đó)', en: 'MAE (worst case)' },
    what: {
      vi: 'Đáy thấp nhất SAU cảnh báo: "phải chịu lỗ bao nhiêu trước khi nó chạy". '
        + 'Luôn ≤ 0, và đây là cột quyết định cắt lỗ đặt ở đâu là sống được.',
      en: 'The lowest price AFTER the alert: "how much heat you had to sit through first". Always '
        + '≤ 0, and it is the column that decides which stop would have survived.',
    },
  },
};

/* ── the Config section ──────────────────────────────────────────────────── */

export interface CfgGroupDoc {
  label: Bi;
  lead: Bi;
  keys: Record<string, { label: Bi; note: Bi }>;
}

/**
 * The pushed `config.snapshot()`, group by group and key by key.
 *
 * Printed raw, this section was a wall of identifiers: `slope_win`, `vol_contract`,
 * `max_off_high`. Every one of them has a comment beside it in `config.py` saying why
 * it is that number, and that comment is the only reason the value is readable — so it
 * travels here. A key with no entry still prints, with its raw name: an undocumented
 * number is better than a hidden one.
 */
export const CFG_DOC: Record<string, CfgGroupDoc> = {
  regime: {
    label: { vi: 'Trạng thái thị trường', en: 'Market regime' },
    lead: {
      vi: 'Phân loại SPY thành xu hướng + mức biên độ. Ô playbook chọn theo cặp đó quyết định '
        + 'hôm nay được đánh setup nào và cỡ bao nhiêu.',
      en: 'Classifies SPY into a trend and a volatility bucket. The playbook cell that pair selects '
        + 'decides which setups are allowed today and at what size.',
    },
    keys: {
      slope_win: {
        label: { vi: 'Cửa sổ độ dốc', en: 'Slope window' },
        note: {
          vi: 'So SMA50 hôm nay với SMA50 của bao nhiêu phiên trước để biết nó đang lên hay xuống.',
          en: 'How many sessions back the 50-day average is compared with to call it rising or falling.',
        },
      },
      slope_up: {
        label: { vi: 'Ngưỡng dốc lên', en: 'Rising threshold' },
        note: {
          vi: 'Trên mức này là đang lên. Có một dải chết quanh 0 để một biến động nhỏ không '
            + 'lật trạng thái thị trường qua lại mỗi ngày.',
          en: 'Above this it is rising. A dead band around zero keeps a small wobble from flipping '
            + 'the regime back and forth daily.',
        },
      },
      slope_dn: {
        label: { vi: 'Ngưỡng dốc xuống', en: 'Falling threshold' },
        note: { vi: 'Dưới mức này là đang xuống. Ở giữa là nằm ngang.', en: 'Below this it is falling. Between the two it is flat.' },
      },
      vol_win: {
        label: { vi: 'Cửa sổ biên độ', en: 'Volatility window' },
        note: {
          vi: 'ATR% hôm nay được so với bình quân của bao nhiêu phiên. Dài vì "bình thường" phải là '
            + 'một mức ổn định, không phải mức của tuần trước.',
          en: 'How many sessions today’s ATR% is compared against. Long, because "normal" has to be a '
            + 'settled level and not last week’s.',
        },
      },
      vol_contract: {
        label: { vi: 'Ngưỡng co lại', en: 'Contracted below' },
        note: {
          vi: 'Dưới tỷ lệ này là biên độ đã co lại — trạng thái tốt nhất cho bứt phá.',
          en: 'Under this ratio volatility has contracted — the best state for a breakout.',
        },
      },
      vol_expand: {
        label: { vi: 'Ngưỡng nở rộng', en: 'Expanded above' },
        note: {
          vi: 'Trên tỷ lệ này là nở rộng: cùng một mức rủi ro giờ mua được ít cổ hơn, nên playbook hạ cỡ vị thế.',
          en: 'Above this ratio it is expanded: the same risk buys fewer shares, so the playbook cuts size.',
        },
      },
      min_bars: {
        label: { vi: 'Số nến tối thiểu', en: 'Minimum bars' },
        note: {
          vi: 'Không đủ lịch sử thì không phân loại, chứ không đoán. Cần hơn 200 nến vì có SMA200.',
          en: 'With too little history it does not classify rather than guess. Over 200 bars, because '
            + 'there is a 200-day average in it.',
        },
      },
      load_n: {
        label: { vi: 'Số nến đọc', en: 'Bars loaded' },
        note: { vi: 'Đọc bao nhiêu nến từ kho để tính. Chỉ là hiệu năng.', en: 'How many bars are read from the store to compute with. Performance only.' },
      },
    },
  },
  sectors: {
    label: { vi: 'Xếp hạng sector', en: 'Sector ranking' },
    lead: {
      vi: 'Xếp 11 ETF sector theo sức mạnh. Chỉ top N mới được chọn mã bên trong, nên bảng này quyết định '
        + 'PHẠM VI của toàn bộ việc chọn cổ phiếu.',
      en: 'Ranks the 11 sector ETFs by strength. Only the top N are picked from, so this table decides '
        + 'the SCOPE of all stock picking.',
    },
    keys: {
      ret_wins: {
        label: { vi: 'Cửa sổ lợi nhuận', en: 'Return windows' },
        note: {
          vi: 'Ba khung thời gian ghép thành điểm tổng hợp: một tháng, ba tháng, sáu tháng.',
          en: 'The three horizons that make the composite score: one month, three months, six months.',
        },
      },
      ema_win: { label: { vi: 'EMA', en: 'EMA' }, note: { vi: 'Đường EMA dùng cho cờ "trên EMA21".', en: 'The EMA behind the "above the 21 EMA" flag.' } },
      sma_win: { label: { vi: 'SMA', en: 'SMA' }, note: { vi: 'Đường SMA dùng cho cờ "trên SMA50".', en: 'The SMA behind the "above the 50 SMA" flag.' } },
      slope_win: { label: { vi: 'Cửa sổ độ dốc', en: 'Slope window' }, note: { vi: 'Cờ độ dốc của sector, cùng cách tính như trạng thái thị trường.', en: 'The sector slope flag, computed the same way as the market regime’s.' } },
      top_n: {
        label: { vi: 'Số sector top', en: 'Top sectors kept' },
        note: {
          vi: 'Con số quan trọng nhất của mục này: chỉ mã thuộc {v} sector đầu bảng được xét cho setup Dẫn dắt.',
          en: 'The most consequential number here: only names inside the leading {v} sectors are '
            + 'examined for the leader setup.',
        },
      },
      change_wins: {
        label: { vi: 'Cửa sổ so thứ hạng', en: 'Rank-change windows' },
        note: {
          vi: 'Thứ hạng hôm nay được so với bao nhiêu phiên trước, cho hai cột Δ.',
          en: 'How far back today’s rank is compared with, for the two Δ columns.',
        },
      },
      min_bars: { label: { vi: 'Số nến tối thiểu', en: 'Minimum bars' }, note: { vi: 'Thiếu lịch sử thì sector đó không được xếp hạng.', en: 'Without enough history a sector is not ranked at all.' } },
      load_n: { label: { vi: 'Số nến đọc', en: 'Bars loaded' }, note: { vi: 'Hiệu năng.', en: 'Performance only.' } },
      hist_days: {
        label: { vi: 'Lịch sử thứ hạng', en: 'Rank history' },
        note: { vi: 'Đồ thị thứ hạng ở mục 02 vẽ bao nhiêu phiên.', en: 'How many sessions the rank chart in section 02 draws.' },
      },
    },
  },
  lead: {
    label: { vi: 'Bộ sàn Dẫn dắt ngành', en: 'Sector-leader floor' },
    lead: {
      vi: 'Bộ điều kiện sinh ra <b>danh sách theo dõi</b>. Đây là nhóm số duy nhất mà đổi một con số '
        + 'là đổi luôn những gì xuất hiện ở mục 03 tối hôm sau.',
      en: 'The gate set that produces the <b>watch list</b>. This is the one group where changing a '
        + 'number changes what appears in section 03 the following night.',
    },
    keys: {
      min_px: { label: { vi: 'Giá tối thiểu', en: 'Minimum price' }, note: { vi: 'Sàn giá: cổ phiếu rẻ chạy vô cớ và tốn phí hơn.', en: 'A price floor: cheap stocks move on nothing and cost more to trade.' } },
      min_dollar_vol: {
        label: { vi: 'Giá trị giao dịch tối thiểu', en: 'Minimum dollar volume' },
        note: {
          vi: 'Tính bằng TIỀN (ADV50 × giá), không bằng số cổ. Đây là chỗ scanner trong phiên từng bị rò cổ phiếu rác.',
          en: 'In MONEY (ADV50 × price), not shares. This is where the intraday scanner used to leak junk.',
        },
      },
      min_rvol: { label: { vi: 'RVOL tối thiểu', en: 'Minimum RVOL' }, note: { vi: 'Khối lượng phiên gần nhất so với mức bình thường của chính mã đó.', en: 'The latest session’s volume against the name’s own normal.' } },
      min_atr_pct: { label: { vi: 'ATR% tối thiểu', en: 'Minimum ATR%' }, note: { vi: 'Quá lặng thì không đủ động để bù phí và trượt giá.', en: 'Too quiet and there is not enough movement to cover fees and slippage.' } },
      max_atr_pct: { label: { vi: 'ATR% tối đa', en: 'Maximum ATR%' }, note: { vi: 'Quá động thì cắt lỗ hợp lý xa tới mức vị thế phải nhỏ lại vô nghĩa.', en: 'Too wild and a sensible stop is so far away the position shrinks to nothing.' } },
      min_rs21: { label: { vi: 'RS21 tối thiểu', en: 'Minimum RS21' }, note: { vi: '0 = chỉ cần không thua SPY. Sức mạnh được chấm điểm ở quality, không siết thêm ở đây.', en: '0 = merely not losing to SPY. Strength is scored in quality, not tightened here.' } },
      min_rs63: { label: { vi: 'RS63 tối thiểu', en: 'Minimum RS63' }, note: { vi: 'Phải thắng chỉ số ở cả hai cửa sổ; một cửa sổ dương có thể là may.', en: 'It has to beat the index over both windows; one positive window can be luck.' } },
      max_off_high: { label: { vi: 'Cách đỉnh tối đa', en: 'Maximum off high' }, note: { vi: 'Mã dẫn dắt được mua gần đỉnh, không phải ở giữa một cú rơi.', en: 'A leader is bought near its high, not halfway down a fall.' } },
      rs_cap21: { label: { vi: 'Trần RS21 khi chấm điểm', en: 'RS21 score cap' }, note: { vi: 'RS21 vượt mức này thì tính là điểm tối đa — không thưởng thêm cho một cú nhảy bất thường.', en: 'RS21 above this scores full marks — no extra credit for one freak move.' } },
      rs_cap63: { label: { vi: 'Trần RS63 khi chấm điểm', en: 'RS63 score cap' }, note: { vi: 'Cao gấp đôi trần 21 phiên: ba tháng thì mức vượt trội lớn hơn là bình thường.', en: 'Twice the 21-session cap: over three months a bigger excess is normal.' } },
      per_sector: { label: { vi: 'Trần mỗi sector', en: 'Per-sector cap' }, note: { vi: 'Không có trần này thì một sector chiếm hết chỗ.', en: 'Without it one sector fills every slot.' } },
      max_total: { label: { vi: 'Trần tổng', en: 'Total cap' }, note: { vi: 'Bị cắt ở đây là đạt chuẩn nhưng xếp dưới suất cuối cùng.', en: 'Cut here means qualified but ranked below the last slot.' } },
    },
  },
  plan: {
    label: { vi: 'Lập kế hoạch lệnh', en: 'Trade plan' },
    lead: {
      vi: 'Bốn con số biến một ứng viên thành một lệnh: vào ở đâu, cắt lỗ ở đâu, chốt ở đâu, và bao nhiêu vốn.',
      en: 'The four numbers that turn a candidate into an order: where to enter, where to stop, where '
        + 'to take profit, and how much capital.',
    },
    keys: {
      trigger_buf: { label: { vi: 'Đệm điểm vào', en: 'Entry buffer' }, note: { vi: 'Đặt lệnh cao hơn mốc một chút để phải vượt hẳn, không phải chỉ chạm vào.', en: 'The order sits slightly above the level, so it has to be cleared and not merely touched.' } },
      stop_atr: { label: { vi: 'Cắt lỗ theo ATR', en: 'Stop in ATR' }, note: { vi: 'Cắt lỗ = điểm vào − {v} × ATR(14). Khoảng mà biên độ bình thường không đi hết.', en: 'Stop = entry − {v} × ATR(14). A distance the normal daily range does not cover.' } },
      risk_pct: { label: { vi: 'Ngân sách rủi ro', en: 'Risk budget' }, note: { vi: 'Phần vốn chịu mất nếu lệnh này chạm cắt lỗ. Đây là con số quyết định số cổ.', en: 'The share of capital lost if this trade hits its stop. This is what decides the share count.' } },
      max_pos_pct: { label: { vi: 'Trần một vị thế', en: 'Position cap' }, note: { vi: 'Một mã stop rất chặt sẽ tính ra vị thế khổng lồ; trần này chặn lại.', en: 'A name with a very tight stop computes an enormous position; this caps it.' } },
      rr: { label: { vi: 'Tỷ lệ mục tiêu', en: 'Reward ratio' }, note: { vi: 'Mục tiêu = {v}R tính từ cắt lỗ.', en: 'The target is {v}R measured from the stop.' } },
    },
  },
  nightly: {
    label: { vi: 'Chuỗi chạy đêm', en: 'The nightly chain' },
    lead: {
      vi: 'Bốn giai đoạn chạy sau khi thị trường đóng, và các hạn mức về độ cũ của nó.',
      en: 'The four stages that run after the close, and the limits on how stale it may get.',
    },
    keys: {
      stale_hours: {
        label: { vi: 'Hạn giờ làm việc', en: 'Stale after' },
        note: {
          vi: 'Tính bằng giờ LÀM VIỆC, không phải giờ đồng hồ: cron chỉ chạy T2–T6, nên đo bằng giờ '
            + 'đồng hồ sẽ báo động mỗi thứ Hai và một cảnh báo kêu mỗi tuần thì không còn ai đọc.',
          en: 'Counted in WORKING hours, not clock hours: cron runs Mon–Fri, so a clock-hour limit would '
            + 'raise the alarm every Monday, and an alarm that cries weekly stops being read.',
        },
      },
      chart_days: { label: { vi: 'Số phiên vẽ đồ thị', en: 'Chart days' }, note: { vi: 'Đồ thị đính vào tin nhắn đêm vẽ bao nhiêu phiên.', en: 'How many sessions the chart attached to the nightly message draws.' } },
      watch_top: {
        label: { vi: 'Trần danh sách theo dõi', en: 'Watch-list ceiling' },
        note: {
          vi: 'Chỉ {v} mã có điểm quality cao nhất vào danh sách ở mục 03. Chip đếm ở đó cho biết tổng số mã đạt chuẩn.',
          en: 'Only the {v} highest-quality names enter the list in section 03. The count chip there gives '
            + 'the full qualifying total.',
        },
      },
    },
  },
  holdings: {
    label: { vi: 'Thành phần sector', en: 'Sector holdings' },
    lead: {
      vi: 'File tĩnh cho biết mã nào thuộc sector nào. Không có nó thì không có setup Dẫn dắt nào cả.',
      en: 'The static file that says which symbol belongs to which sector. Without it there are no '
        + 'leader candidates at all.',
    },
    keys: {
      max_age_days: {
        label: { vi: 'Hạn tuổi file', en: 'Maximum file age' },
        note: {
          vi: 'Quá {v} ngày thì vẫn dùng nhưng có cảnh báo: thành phần ETF thay đổi chậm, '
            + 'nhưng không phải không thay đổi.',
          en: 'Past {v} days it is still used but warned about: ETF holdings change slowly, but they '
            + 'do change.',
        },
      },
    },
  },
  intraday: {
    label: { vi: 'Bộ lọc trong phiên', en: 'Intraday filter' },
    lead: {
      vi: 'Bộ điều kiện của tiến trình chạy trong giờ giao dịch. Nó chỉ được báo trên những mã đã có trong '
        + 'danh sách tối hôm trước, nên đây là lớp lọc THỨ HAI, không phải lớp đầu.',
      en: 'The gates of the process that runs during market hours. It may only alert on names already on '
        + 'last night’s list, so this is the SECOND filter, not the first.',
    },
    keys: {
      min_px: { label: { vi: 'Giá tối thiểu', en: 'Minimum price' }, note: { vi: 'Giống sàn của Dẫn dắt và vì cùng một lý do.', en: 'The same floor as the leader setup’s, for the same reason.' } },
      min_dollar_vol: { label: { vi: 'Giá trị giao dịch tối thiểu', en: 'Minimum dollar volume' }, note: { vi: 'Tính bằng tiền mỗi phiên.', en: 'In money per session.' } },
      min_mktcap: { label: { vi: 'Vốn hóa tối thiểu', en: 'Minimum market cap' }, note: { vi: 'Chặn các mã quá nhỏ mà một lệnh cũng làm giá chạy.', en: 'Keeps out names so small that one order moves the price.' } },
      mktcap_ttl_days: { label: { vi: 'Hạn cache vốn hóa', en: 'Market-cap cache life' }, note: { vi: 'Vốn hóa đọc lại sau bao nhiêu ngày.', en: 'How many days before market cap is re-read.' } },
      exchanges: { label: { vi: 'Sàn được phép', en: 'Allowed exchanges' }, note: { vi: 'Ngoài các sàn này thì không báo, dù dữ liệu có.', en: 'Nothing outside these is alerted on, even when data exists.' } },
      min_listed_days: { label: { vi: 'Số ngày niêm yết tối thiểu', en: 'Minimum days listed' }, note: { vi: 'Mã mới lên sàn chưa có đủ lịch sử để mọi thước đo ở trên có nghĩa.', en: 'A freshly listed name has no history for any measure above to mean anything.' } },
      max_spread_pct: { label: { vi: 'Spread tối đa', en: 'Maximum spread' }, note: { vi: 'Spread rộng thì lợi thế bị ăn ngay lúc vào lệnh.', en: 'A wide spread eats the edge at the moment of entry.' } },
      min_rvol_adj: { label: { vi: 'RVOL tối thiểu (đã hiệu chỉnh)', en: 'Minimum RVOL (adjusted)' }, note: { vi: 'Đã hiệu chỉnh theo thời điểm trong phiên: 10h sáng và 15h không so trực tiếp được.', en: 'Adjusted for the time of day: 10am and 3pm are not directly comparable.' } },
      gap_alert: { label: { vi: 'Ngưỡng gap báo', en: 'Gap alert' }, note: { vi: 'Gap lớn hơn mức này được báo riêng.', en: 'A gap larger than this is called out separately.' } },
      cooldown_sec: { label: { vi: 'Thời gian chờ lại', en: 'Cooldown' }, note: { vi: 'Cùng một mã không được báo lại trong khoảng này.', en: 'The same name may not be alerted again within this window.' } },
      open_mute_min: { label: { vi: 'Tắt tiếng đầu phiên', en: 'Opening mute' }, note: { vi: 'Những phút đầu phiên, giá và khối lượng đều chưa đáng tin.', en: 'In the first minutes of the session neither price nor volume is trustworthy yet.' } },
      tier2_cap: { label: { vi: 'Trần nhóm 2', en: 'Tier-2 cap' }, note: { vi: 'Số mã ngoài nhóm chính được theo dõi cùng lúc.', en: 'How many names outside the main group are watched at once.' } },
      poll_sec: { label: { vi: 'Nhịp quét', en: 'Poll interval' }, note: { vi: 'Bao lâu quét lại một lượt.', en: 'How often a sweep is repeated.' } },
      max_quote_age_sec: { label: { vi: 'Hạn tuổi giá', en: 'Maximum quote age' }, note: { vi: 'Giá cũ hơn mức này bị coi là không có, chứ không dùng tạm.', en: 'A quote older than this is treated as missing rather than used anyway.' } },
      pos_stale_h: { label: { vi: 'Hạn tuổi vị thế', en: 'Position staleness' }, note: { vi: 'Danh sách vị thế đang mở cũ hơn mức này thì cảnh báo.', en: 'The open-position list older than this raises a warning.' } },
      pos_fx_stale_d: { label: { vi: 'Hạn tuổi tỷ giá', en: 'FX staleness' }, note: { vi: 'Tỷ giá dùng để quy đổi vị thế cũ hơn mức này thì cảnh báo.', en: 'The rate used to convert positions raises a warning past this age.' } },
    },
  },
};

/** The scalar entries of the snapshot — a benchmark and two lists. */
export const CFG_SCALAR: Record<string, { label: Bi; note: Bi }> = {
  bench: {
    label: { vi: 'Mã chuẩn', en: 'Benchmark' },
    note: {
      vi: 'Mọi số RS trên trang này là "trừ đi" mã này. Thiếu nến của nó thì không có RS nào tính được.',
      en: 'Every RS figure on this page is measured against this symbol. Without its bars no RS can be computed.',
    },
  },
  sector_etfs: {
    label: { vi: 'ETF sector', en: 'Sector ETFs' },
    note: {
      vi: '11 ETF được xếp hạng ở mục 02 — toàn bộ thị trường, chia thành 11 rổ.',
      en: 'The 11 ETFs ranked in section 02 — the whole market, in eleven baskets.',
    },
  },
  defensive: {
    label: { vi: 'Sector phòng thủ', en: 'Defensive sectors' },
    note: {
      vi: 'Các rổ này vào top 3 là một tín hiệu mà bộ phân loại xu hướng không thấy được: SPY vẫn có thể '
        + 'trên cả hai đường trung bình trong khi tiền bên trong nó đã chạy sang hàng thiết yếu và điện nước.',
      en: 'These baskets reaching the top 3 is a signal the trend classifier cannot see: SPY can still be '
        + 'above both averages while the money inside it has already moved to staples and utilities.',
    },
  },
};

/* ── the words around the words ──────────────────────────────────────────── */

/**
 * Headings and summary lines for the blocks built out of this file.
 *
 * They live here rather than in `ui/i18n.ts` on purpose: every one of them is a label ON
 * a paragraph defined a few hundred lines above, and splitting the two across files is how
 * a heading ends up describing content that has since been rewritten. The i18n table keeps
 * the words shared across the app; this keeps the words that only mean anything next to
 * this file's prose.
 */
export const G: Record<string, Bi> = {
  how: { vi: 'Vì sao một mã vào được danh sách này', en: 'How a name gets onto this list' },
  gates: { vi: 'Các điều kiện, theo đúng thứ tự kiểm tra', en: 'The gates, in the order they are tested' },
  caps: { vi: 'Trần áp dụng sau đó, cho cả nhóm', en: 'Caps applied afterwards, to the group' },
  quality: { vi: 'Cột quality nghĩa là gì', en: 'What the quality column means' },
  trigger: { vi: 'Còn phải xảy ra gì trong phiên', en: 'What still has to happen intraday' },
  universe: { vi: 'Phạm vi xét', en: 'The universe examined' },
  cols: { vi: 'Các cột nghĩa là gì', en: 'What the columns mean' },
  legend: { vi: 'Đọc bảng này thế nào', en: 'How to read this table' },
  why: { vi: 'Vì sao mã này có trong danh sách', en: 'Why this name is on the list' },
  whyOpen: { vi: 'Mở phần giải thích từng KPI của dòng này', en: 'Show this row’s KPIs against their thresholds' },
  planHow: { vi: 'Bốn con số của kế hoạch được tính thế nào', en: 'How the plan’s four numbers are derived' },
  measured: { vi: 'Đo được', en: 'Measured' },
  required: { vi: 'Phải đạt', en: 'Required' },

  /* Column headers for the explanation TABLES. A list of sentences reads as an
     undifferentiated wall; the same content in a table with named columns tells the
     reader before they start reading that there is a rule on the left and a reason it
     is that number on the right. */
  thNo: { vi: '#', en: '#' },
  thCrit: { vi: 'Điều kiện và ngưỡng', en: 'Criterion and threshold' },
  thWhy: { vi: 'Vì sao lại là con số đó', en: 'Why that number' },
  thCol: { vi: 'Cột', en: 'Column' },
  thWhat: { vi: 'Nghĩa là gì', en: 'What it is' },
  thVs: { vi: 'So với ngưỡng nào', en: 'Compared against' },
  thStep: { vi: 'Con số', en: 'Figure' },
  thHow: { vi: 'Tính thế nào', en: 'How it is derived' },
  thTerm: { vi: 'Từ trong bảng', en: 'Term' },
  thMeaning: { vi: 'Nghĩa chính xác', en: 'What it means exactly' },
  thCheck: { vi: 'Điều kiện', en: 'Check' },
  thNote: { vi: 'Ghi chú', en: 'Note' },
  thKey: { vi: 'Thông số', en: 'Setting' },
  thVal: { vi: 'Đang dùng', en: 'In use' },
  mirror: {
    vi: 'Các ngưỡng của setup này được <b>chép tay</b> từ <code>setups.py</code>: VM không đẩy '
      + 'chúng lên, nên chúng có thể lệch với ngưỡng thật. Các ngưỡng còn lại trên trang này đọc '
      + 'trực tiếp từ cấu hình đang chạy.',
    en: 'This setup’s thresholds are <b>mirrored by hand</b> from <code>setups.py</code>: the VM '
      + 'does not publish them, so they can drift from the real ones. Every other threshold on '
      + 'this page is read from the running config.',
  },
  live: {
    vi: 'Các con số in đậm dưới đây đọc từ cấu hình <b>đang chạy</b> trên VM, không phải bản chép '
      + 'trong app — nên đây đúng là những ngưỡng scanner đã dùng.',
    en: 'The bold figures below are read from the config <b>running on the VM</b>, not a copy kept '
      + 'in the app — so these are the thresholds the scanner actually used.',
  },
  noCfg: {
    vi: 'Chưa nhận được cấu hình từ VM, nên các ngưỡng hiện là dấu — thay vì một con số đoán.',
    en: 'No config has arrived from the VM yet, so the thresholds show as — rather than a guess.',
  },
};

/** `{v}` in a config note is that key's own value. */
export function cfgNote(note: Bi, v: unknown): string {
  const txt = say(note);
  if (!txt.includes('{v}')) return txt;
  const s = typeof v === 'number' ? trim(v, 4) : String(v ?? '—');
  return txt.replace(/\{v\}/g, `<b>${s}</b>`);
}
