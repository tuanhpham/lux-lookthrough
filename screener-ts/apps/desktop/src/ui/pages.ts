/**
 * Every page of the app, once: its icon, the group it belongs to, and one line on
 * what it is for.
 *
 * Three things read this list — the grouped ☰ menu, the search palette (Ctrl K) and
 * the page name beside the wordmark — so a new tab is added HERE and shows up in all
 * three. The tab ids are main.ts's `TABS`; the names stay in i18n (`nav.<id>`), which
 * the rest of the app already uses for them.
 */

export type PageGroup = 'market' | 'trade' | 'money' | 'know';

export interface Bi {
  en: string;
  vi: string;
}

export interface PageInfo {
  id: string;
  icon: string;
  group: PageGroup;
  /** One line, shown under the name in the menu and the palette. */
  desc: Bi;
  /** Extra words the palette should match, in either language, unaccented is fine. */
  words?: string;
}

/** Order is the menu's order: market first, the reading pages last. */
export const PAGE_GROUPS: readonly { id: PageGroup; title: Bi }[] = [
  { id: 'market', title: { en: 'Market', vi: 'Thị trường' } },
  { id: 'trade', title: { en: 'Trading', vi: 'Giao dịch' } },
  { id: 'money', title: { en: 'Money', vi: 'Tài chính' } },
  { id: 'know', title: { en: 'Learn & system', vi: 'Kiến thức & hệ thống' } },
];

export const PAGES: readonly PageInfo[] = [
  {
    id: 'calendar', icon: '📅', group: 'market',
    desc: { en: 'Earnings, macro and your own events for the next 30 days', vi: 'KQKD, vĩ mô và sự kiện riêng trong 30 ngày tới' },
    words: 'earnings events lich su kien',
  },
  {
    id: 'picks', icon: '🏆', group: 'market',
    desc: { en: 'The best setups across the universe: QM, Momentum, Surge', vi: 'Setup tốt nhất trong rổ: QM, Momentum, Surge' },
    words: 'top picks qullamaggie vcp',
  },
  {
    id: 'screener', icon: '🔎', group: 'market',
    desc: { en: 'Filter the market by your own rules', vi: 'Lọc thị trường theo tiêu chí riêng' },
    words: 'filter loc',
  },
  {
    id: 'sectors', icon: '🧭', group: 'market',
    desc: { en: 'Sector rotation: which groups money is flowing into', vi: 'Xoay vòng ngành: dòng tiền đang vào nhóm nào' },
    words: 'rotation etf nganh',
  },
  {
    id: 'scanner', icon: '🛰', group: 'market',
    desc: { en: 'The nightly VM scan: breakouts, reversals, leaders', vi: 'Kết quả quét mỗi đêm từ VM: breakout, đảo chiều, mã dẫn dắt' },
    words: 'scan vm nightly breakout may quet',
  },
  {
    id: 'station', icon: '⚡', group: 'trade',
    desc: { en: 'Buy and sell on one screen: chart, levels, ticket, case study', vi: 'Mua bán trên một màn hình: chart, mức giá, phiếu lệnh, case study' },
    words: 'trade station buy sell order ticket tram giao dich mua ban lenh',
  },
  {
    id: 'watchlist', icon: '⭐', group: 'trade',
    desc: { en: 'Your watchlists, with live scores', vi: 'Các Watchlist, kèm điểm số trực tiếp' },
    words: 'watch list theo doi',
  },
  {
    id: 'casestudies', icon: '🗂', group: 'trade',
    desc: { en: 'Past setups filed with chart, levels and notes', vi: 'Hồ sơ các setup đã qua: chart, mức giá, ghi chú' },
    words: 'case study journal ho so nhat ky',
  },
  {
    id: 'backtest', icon: '⏱', group: 'trade',
    desc: { en: 'Replay a strategy on history without lookahead', vi: 'Chạy lại chiến lược trên dữ liệu quá khứ, không nhìn trước' },
    words: 'backtest test lich su',
  },
  {
    id: 'portfolio', icon: '💼', group: 'money',
    desc: { en: 'Accounts, positions, trade plans and P&L', vi: 'Tài khoản, vị thế, Trade plan và P&L' },
    words: 'positions pnl danh muc',
  },
  {
    id: 'wealth', icon: '🏦', group: 'money',
    desc: { en: 'Bank, cash and portfolio together, in one currency', vi: 'Ngân hàng, tiền mặt và Danh mục gộp chung, quy về một loại tiền' },
    words: 'wealth bank balance tai chinh so du',
  },
  {
    id: 'learn', icon: '📖', group: 'know',
    desc: { en: 'The handbook: playbook, daily checklist, AI prompts, page guides, glossary', vi: 'Sổ tay: Playbook, checklist hằng ngày, prompt AI, hướng dẫn từng trang, thuật ngữ' },
    words: 'learn handbook guide glossary playbook checklist routine prompt tim hieu thuat ngu cam nang so tay',
  },
  {
    id: 'about', icon: '✨', group: 'know',
    desc: { en: 'The story behind the platform', vi: 'Câu chuyện phía sau nền tảng' },
    words: 'story gioi thieu',
  },
  {
    id: 'settings', icon: '⚙️', group: 'know',
    desc: { en: 'Sync, restore, build, deploy, run the scanner', vi: 'Sync, khôi phục, build, deploy, vận hành Scanner' },
    words: 'settings restore deploy sync cai dat khoi phuc huong dan',
  },
];

export function pageInfo(id: string): PageInfo | undefined {
  return PAGES.find((p) => p.id === id);
}

// ── recently opened ─────────────────────────────────────────────────────────
// Device-local, like the Learn bookmark: what was open on the phone is not what was
// open on the laptop.

const RECENT_KEY = 'nav:recent';
const RECENT_MAX = 5;

export function recentPages(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function noteVisit(id: string): void {
  const next = [id, ...recentPages().filter((x) => x !== id)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode: the palette just has no "recent" group */
  }
}
