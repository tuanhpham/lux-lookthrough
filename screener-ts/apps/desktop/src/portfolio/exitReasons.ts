/**
 * Why a position was closed — the vocabulary, and the part of it the user writes themselves.
 *
 * ── WHY THERE IS A FIXED LIST AT ALL ────────────────────────────────────────
 * A journal is only worth keeping if it can be read back in aggregate. "How did I do on the
 * trades I sold out of fear", or "does getting out on the first touch of the 10-EMA actually
 * save me money", are questions you can only ask of a fixed vocabulary — never of ten
 * differently worded sentences. The free-text box beside the list is where the lesson lives;
 * the key beside it is what makes the lesson countable.
 *
 * ── WHY THE LIST IS THE USER'S TO EXTEND ────────────────────────────────────
 * The user's "cho nhung cai ly do exit do vao configurable table, de … user … co the create
 * them nhung ly do moi de co the xuat hien trong viec exit dropdown do". The shipped rows are
 * the ones from the swing-trading literature the rest of this app is built on — the moving
 * averages, the named bearish reversal candles, the climax top. But an exit reason is a
 * description of the user's OWN behaviour, and no author can enumerate that. So the defaults
 * ship read-only (renaming "Stop hit" would silently rewrite the meaning of every trade already
 * filed under it) and anything else is added by hand, under a `my:` key that can never collide
 * with a row shipped later.
 *
 * ── WHY IT LIVES IN `pf_playbook_cfg` ───────────────────────────────────────
 * It is rules the user typed, which is exactly what that blob is for, and it already syncs and
 * already has a loader every screen that needs this calls. A second storage key would be a
 * second thing to forget to load — and an empty dropdown on the phone with nothing on screen
 * saying why.
 *
 * ── WHY GROUPED ─────────────────────────────────────────────────────────────
 * Twenty-six reasons in one flat dropdown is a list nobody reads to the bottom. The groups are
 * also the honest distinction: "the stop was hit" and "I panicked" are both exits, but only one
 * of them is the plan working.
 */
import type { AppContext } from '../context.js';
import { playbookConfig, savePlaybookConfig } from './playbook.js';

/**
 * A reason's key.
 *
 * `string`, not a union of the shipped keys, BECAUSE the user can add rows — a union would be a
 * compile-time promise this module deliberately does not make. Unknown keys are therefore
 * possible at runtime (a reason deleted after it was used, or a blob synced from a newer
 * version), and every reader must cope: `exitReasonLabel` returns the key itself rather than
 * empty, so a trade never loses its reason to a vocabulary change.
 */
export type ExitReasonKey = string;

export type ExitGroup = 'plan' | 'ma' | 'candle' | 'volume' | 'context' | 'discipline' | 'mine';

export const EXIT_GROUPS: readonly { key: ExitGroup; en: string; vi: string }[] = [
  { key: 'plan', en: 'The plan worked', vi: 'Đúng kế hoạch' },
  { key: 'ma', en: 'Moving averages', vi: 'Đường trung bình' },
  { key: 'candle', en: 'Bearish reversal candles', vi: 'Nến đảo chiều giảm' },
  { key: 'volume', en: 'Volume', vi: 'Khối lượng' },
  { key: 'context', en: 'The story changed', vi: 'Bối cảnh đã đổi' },
  { key: 'discipline', en: 'Me, not the chart', vi: 'Do mình, không phải do chart' },
  { key: 'mine', en: 'My own reasons', vi: 'Lý do tự thêm' },
];

export interface ExitReason {
  key: ExitReasonKey;
  en: string;
  vi: string;
  group: ExitGroup;
  /** False for rows the user added, which can be deleted again. */
  builtin: boolean;
}

/**
 * The shipped vocabulary.
 *
 * The nine oldest keys (`stop`, `target`, `trail`, `time`, `thesis`, `market`, `better`,
 * `scaled`, `panic`, `other`) keep their spelling from the first version of this feature: they
 * are already stored on filed case studies, and renaming a key is the one edit that would make
 * old records unreadable while looking like a tidy-up.
 */
export const DEFAULT_EXIT_REASONS: readonly ExitReason[] = ([
  // The plan working is its own group, because this is the only group a disciplined year is
  // mostly made of — and seeing that at a glance is the point of grouping at all.
  { key: 'stop', en: 'Stop hit', vi: 'Chạm cắt lỗ', group: 'plan' },
  { key: 'target', en: 'Target reached', vi: 'Đạt mục tiêu', group: 'plan' },
  { key: 'trail', en: 'Trailing stop moved up under it', vi: 'Chạm trailing stop', group: 'plan' },
  { key: 'scaled', en: 'Took part of it off', vi: 'Bán một phần', group: 'plan' },

  { key: 'ema10', en: 'Price fell back and touched the 10-EMA', vi: 'Giá về chạm EMA10', group: 'ma' },
  { key: 'ema21', en: 'Price fell back and touched the 21-EMA', vi: 'Giá về chạm EMA21', group: 'ma' },
  { key: 'ema50', en: 'Lost the 50-day moving average', vi: 'Thủng đường MA50', group: 'ma' },
  { key: 'marolls', en: 'The moving averages rolled over', vi: 'Các đường MA quay đầu giảm', group: 'ma' },

  // The user asked for the generic term AND the named patterns, which is right: on the day you
  // are usually sure it reversed and unsure which name it has, and a journal that forces the
  // name would get a guessed one.
  { key: 'revcandle', en: 'Bearish reversal candle (unspecified)', vi: 'Nến đảo chiều giảm (chưa rõ mẫu)', group: 'candle' },
  { key: 'engulf', en: 'Bearish Engulfing', vi: 'Nến nhấn chìm giảm', group: 'candle' },
  { key: 'shooting', en: 'Shooting Star', vi: 'Sao băng', group: 'candle' },
  { key: 'evening', en: 'Evening Star', vi: 'Sao hôm', group: 'candle' },
  { key: 'hanging', en: 'Hanging Man', vi: 'Người treo cổ', group: 'candle' },
  { key: 'darkcloud', en: 'Dark Cloud Cover', vi: 'Mây đen che phủ', group: 'candle' },
  { key: 'gravestone', en: 'Gravestone Doji', vi: 'Doji bia mộ', group: 'candle' },
  { key: 'threecrows', en: 'Three Black Crows', vi: 'Ba con quạ đen', group: 'candle' },
  { key: 'harami', en: 'Bearish Harami', vi: 'Harami giảm', group: 'candle' },

  { key: 'climax', en: 'Climax top on huge volume', vi: 'Đỉnh climax, khối lượng đột biến', group: 'volume' },
  { key: 'churn', en: 'Churning — heavy volume, no progress', vi: 'Churning — khối lượng lớn mà giá không đi', group: 'volume' },
  { key: 'distribution', en: 'Distribution days piling up', vi: 'Phiên phân phối dồn dập', group: 'volume' },
  { key: 'gapfail', en: 'Gapped up and failed on the day', vi: 'Gap tăng rồi gãy ngay trong phiên', group: 'volume' },

  { key: 'thesis', en: 'The reason for the trade broke', vi: 'Lý do vào lệnh đã sai', group: 'context' },
  { key: 'market', en: 'The market turned', vi: 'Thị trường chung xấu đi', group: 'context' },
  { key: 'earnings', en: 'Earnings due — would not hold through it', vi: 'Sắp ra KQKD — không ôm qua', group: 'context' },
  { key: 'news', en: 'Bad news on the company', vi: 'Tin xấu về công ty', group: 'context' },
  { key: 'better', en: 'Moved the money to a better setup', vi: 'Chuyển vốn sang setup tốt hơn', group: 'context' },

  { key: 'time', en: 'Time stop — it went nowhere', vi: 'Time stop — giá cứ đứng yên', group: 'discipline' },
  { key: 'panic', en: 'Sold out of fear — not the plan', vi: 'Bán vì sợ — không theo kế hoạch', group: 'discipline' },
  { key: 'rule', en: 'Broke my own rule', vi: 'Phá luật của chính mình', group: 'discipline' },
  { key: 'other', en: 'Something else', vi: 'Lý do khác', group: 'discipline' },
] as const).map((r) => ({ ...r, builtin: true }));

/**
 * A row the user added. One `label`, not an en/vi pair: asking somebody to translate their own
 * note before it can be saved is how a feature stops being used.
 */
export interface CustomExitReason {
  key: ExitReasonKey;
  label: string;
  group: ExitGroup;
}

/** The prefix that keeps a user's key from ever colliding with one shipped later. */
export const CUSTOM_PREFIX = 'my:';

/**
 * A storage key for a label the user typed.
 *
 * Slugged rather than numbered so the stored blob stays readable, and suffixed only on a real
 * collision — re-adding a label that already exists should return the SAME key, or the journal
 * would end up with two keys meaning one thing and neither of them countable.
 */
export function exitReasonKeyFor(label: string, taken: readonly ExitReasonKey[]): ExitReasonKey {
  const slug = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const base = CUSTOM_PREFIX + (slug || 'reason');
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/**
 * The whole vocabulary: the shipped rows plus the user's, in group order.
 *
 * Pure, and takes the custom rows as an argument, so the ordering and the de-duplication can be
 * tested without any storage. A custom row whose key matches a shipped one is DROPPED rather
 * than allowed to shadow it: a user who somehow acquires a `stop` override would otherwise
 * rename a reason that hundreds of old records already point at.
 */
export function exitReasonsFrom(custom: readonly CustomExitReason[]): ExitReason[] {
  const seen = new Set(DEFAULT_EXIT_REASONS.map((r) => r.key));
  const mine: ExitReason[] = [];
  for (const c of custom) {
    const label = (c.label ?? '').trim();
    if (!c.key || !label || seen.has(c.key)) continue;
    seen.add(c.key);
    mine.push({ key: c.key, en: label, vi: label, group: c.group ?? 'mine', builtin: false });
  }
  const order = new Map(EXIT_GROUPS.map((g, i) => [g.key, i]));
  return [...DEFAULT_EXIT_REASONS, ...mine].sort(
    (a, b) => (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99),
  );
}

/** A stored group name, or 'mine' — the bucket a row with no recognisable home belongs in. */
export function asExitGroup(v: unknown): ExitGroup {
  return EXIT_GROUPS.some((g) => g.key === v) ? (v as ExitGroup) : 'mine';
}

/** The user's rows as stored. Empty until they add one. */
export function customExitReasons(): CustomExitReason[] {
  return (playbookConfig().exitReasons ?? []).map((r) => ({
    key: r.key,
    label: r.label,
    group: asExitGroup(r.group),
  }));
}

/** Shipped reasons the user took off the list. */
export function hiddenExitReasons(): string[] {
  return [...(playbookConfig().hiddenExitReasons ?? [])];
}

/** Every reason there is, hidden ones included — what a stored key is read back with. */
export function exitReasonListAll(): ExitReason[] {
  return exitReasonsFrom(customExitReasons());
}

/** The reasons offered in a dropdown: the vocabulary minus what the user hid. */
export function exitReasonList(): ExitReason[] {
  const hidden = new Set(hiddenExitReasons());
  return exitReasonListAll().filter((r) => !hidden.has(r.key));
}

export async function saveCustomExitReasons(ctx: AppContext, rows: readonly CustomExitReason[], hidden?: readonly string[]): Promise<void> {
  await savePlaybookConfig(ctx, {
    ...playbookConfig(), exitReasons: [...rows], hiddenExitReasons: [...(hidden ?? hiddenExitReasons())],
  });
}

/**
 * One reason's label, or the raw key when the vocabulary no longer has it.
 *
 * The key rather than '' on a miss: a reason the user deleted last month must not erase itself
 * from a trade filed under it in January. An ugly `my:sold-too-early` on screen is a record;
 * a blank is a loss.
 */
export function exitReasonLabel(key: ExitReasonKey | '', vi: boolean, list = exitReasonListAll()): string {
  if (!key) return '';
  const r = list.find((x) => x.key === key);
  return r ? (vi ? r.vi : r.en) : key;
}

/**
 * The reverse lookup: a written reason back to a key, when the words ARE one of the labels.
 *
 * ── WHY A FREE-TEXT FIELD STILL PRODUCES A KEY ──────────────────────────────
 * The Case Studies editor's reason box is free text with the vocabulary behind a `<datalist>` —
 * the right shape for a field whose job is to carry the lesson. But picking a suggestion there
 * produces exactly a label, and a journal that could not count those would be throwing away the
 * countable half of every entry the user filed from that tab rather than from the planner.
 *
 * Matches the whole string, or the part before the em dash — that is the shape `exitReasonText`
 * writes ("Stop hit — gapped through it"), so a study filed by the planner and then edited by
 * hand keeps its key. Both languages are tried whatever the app is set to: the same record can be
 * written in one and edited in the other.
 *
 * Returns undefined rather than '' so it can be assigned straight to the optional field.
 */
/**
 * The Vietnamese labels before request 71's rewrite. A case study filed back then may hold one
 * as free text, so it still has to map back to its key.
 */
const OLD_VI: Record<string, string> = {
  plan: 'Kế hoạch chạy đúng',
  context: 'Câu chuyện đã đổi',
  discipline: 'Do tôi, không do đồ thị',
  mine: 'Lý do tôi tự thêm',
  trail: 'Cắt lỗ dời theo đã chạm',
  ema10: 'Giá rơi xuống chạm EMA10',
  ema21: 'Giá rơi xuống chạm EMA21',
  ema50: 'Mất đường trung bình 50 ngày',
  marolls: 'Các đường trung bình quay đầu xuống',
  climax: 'Đỉnh climax với khối lượng rất lớn',
  churn: 'Giằng co — khối lượng lớn mà giá không đi',
  distribution: 'Các phiên phân phối dồn lại',
  gapfail: 'Gap tăng rồi thất bại ngay trong ngày',
  thesis: 'Lý do vào lệnh không còn đúng',
  earnings: 'Sắp báo lợi nhuận — không giữ qua tin',
  better: 'Chuyển tiền sang cơ hội tốt hơn',
  time: 'Hết kiên nhẫn — giá không đi đâu',
  rule: 'Làm sai chính quy tắc của mình',
};

export function exitReasonKeyOfText(text: string, list = exitReasonList()): ExitReasonKey | undefined {
  const whole = text.trim().toLowerCase();
  if (!whole) return undefined;
  const head = whole.split('—')[0]!.trim();
  const hit = list.find((r) => {
    const en = r.en.toLowerCase();
    const vi = r.vi.toLowerCase();
    const was = OLD_VI[r.key]?.toLowerCase();
    return en === whole || vi === whole || en === head || vi === head || (!!was && (was === whole || was === head));
  });
  return hit?.key;
}

/** `<optgroup>`-ed options for a native `<select>`. Empty groups are omitted. */
export function exitReasonOptgroupsHtml(
  selected: ExitReasonKey | '',
  vi: boolean,
  esc: (s: string) => string,
  list = exitReasonList(),
): string {
  return EXIT_GROUPS.map((g) => {
    const rows = list.filter((r) => r.group === g.key);
    if (!rows.length) return '';
    const opts = rows.map(
      (r) => `<option value="${esc(r.key)}"${r.key === selected ? ' selected' : ''}>${esc(vi ? r.vi : r.en)}</option>`,
    ).join('');
    return `<optgroup label="${esc(vi ? g.vi : g.en)}">${opts}</optgroup>`;
  }).join('');
}

/** The same vocabulary flattened for `formDialog`, which groups by the `group` field. */
export function exitReasonFieldOptions(vi: boolean, noneLabel: string): { value: string; label: string; group?: string }[] {
  const list = exitReasonList();
  const out: { value: string; label: string; group?: string }[] = [{ value: '', label: noneLabel }];
  for (const g of EXIT_GROUPS) {
    for (const r of list.filter((x) => x.group === g.key)) {
      out.push({ value: r.key, label: vi ? r.vi : r.en, group: vi ? g.vi : g.en });
    }
  }
  return out;
}
