/**
 * Financial Status: the portfolio plus everything that is not traded — bank accounts,
 * savings, cash, a loan — added up in one currency.
 *
 * ── A BALANCE IS A DATED READING, NOT A TRANSACTION ─────────────────────────
 * These accounts are updated when the user looks at a statement: monthly, quarterly,
 * whenever. So what is stored is "on 2026-06-30 the account held X", and nothing about
 * the deposits in between. Between two readings the value is CARRIED FORWARD as a step:
 * a straight line from one statement to the next would draw a gradual change that never
 * happened, and on a 3-month gap it would put a salary in the chart weeks early. Before an
 * account's first reading it counts as nothing — the tracker did not know about it — which
 * is why the page offers the portfolio's start date as the date of the opening balance.
 *
 * ── EVERY DATE IS CONVERTED AT THAT DATE'S RATE ─────────────────────────────
 * 250,000,000 VND is a different number of euros in March than in September, and the
 * EUR total is supposed to say what the user was worth in euros on each day. So a
 * carried-forward balance is converted again on every date, and a VND account's line moves
 * with EURVND even when the balance did not. The rate on a date is the last known close on
 * or before it (a weekend uses Friday), not the latest rate: the latest would restate the
 * whole history at today's exchange rate.
 *
 * A currency with NO rate at all is not converted at 1. 1 VND = 1 EUR is off by a factor of
 * ~30,000, and 1 USD = 1 EUR by a few percent nobody would notice — both are worse than a
 * total that says an account is missing. `wealthSeries` reports which ones it left out.
 *
 * ── TRANSACTIONS RIDE ON THE LAST READING ───────────────────────────────────
 * A deposit or a withdrawal (CHAT-99: "add cac transaction … deposit, withdrawal … hien tai chi
 * co the update account balance") is stored as a FLOW, not as a reading. The value on a date is
 * the last reading on or before it PLUS every flow after that reading up to the date. A reading
 * is a statement, and a statement already contains whatever moved before it, so a newer reading
 * supersedes the flows it covers instead of being added to them: entering last month's deposit
 * after this month's statement counts it once, not twice. A reading and a flow on the same day:
 * the reading is the end-of-day statement, so it already includes that day's flow.
 *
 * Pure: no clock (today is passed in), no fetch, no storage.
 */

import type { Bar } from '../types/index.js';

export const WEALTH_CURRENCIES = ['EUR', 'USD', 'VND', 'CNY'] as const;
export type WealthCurrency = (typeof WEALTH_CURRENCIES)[number];

/**
 * What kind of holding it is. Only used to group and label, never to value: a "loan" is
 * negative because the user types a negative balance, not because of its kind.
 */
export const WEALTH_KINDS = [
  'bank',
  'savings',
  'cash',
  'broker',
  'crypto',
  'gold',
  'property',
  'pension',
  'loan',
  'other',
] as const;
export type WealthKind = (typeof WEALTH_KINDS)[number];

export interface WealthAccount {
  id: string;
  name: string;
  kind: WealthKind;
  currency: WealthCurrency;
  /** YYYY-MM-DD. When it was added to the tracker, not when the bank opened it. */
  createdAt: string;
  note?: string;
}

export interface WealthBalance {
  id: string;
  accountId: string;
  /** YYYY-MM-DD — the statement date. At most one reading per account per date. */
  date: string;
  /** In the account's own currency. Negative for a debt. */
  amount: number;
  note?: string;
}

/** Money moved in (+) or out (−) of an account on a date, in the account's own currency. */
export interface WealthFlow {
  id: string;
  accountId: string;
  date: string;
  /** Signed: + deposit, − withdrawal. Never 0. */
  amount: number;
  note?: string;
}

export interface WealthBook {
  accounts: WealthAccount[];
  balances: WealthBalance[];
  flows: WealthFlow[];
}

export function emptyBook(): WealthBook {
  return { accounts: [], balances: [], flows: [] };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read a stored book defensively.
 *
 * The value comes from storage that syncs between devices and may have been written by an
 * older build, so every row is checked rather than cast: one malformed balance must cost that
 * row, not the page.
 */
export function normalizeBook(raw: unknown): WealthBook {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const accounts: WealthAccount[] = [];
  for (const a of Array.isArray(src.accounts) ? src.accounts : []) {
    const r = a as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.name !== 'string') continue;
    const currency = (WEALTH_CURRENCIES as readonly string[]).includes(r.currency as string)
      ? (r.currency as WealthCurrency)
      : 'EUR';
    const kind = (WEALTH_KINDS as readonly string[]).includes(r.kind as string)
      ? (r.kind as WealthKind)
      : 'other';
    accounts.push({
      id: r.id,
      name: r.name,
      kind,
      currency,
      createdAt: typeof r.createdAt === 'string' && ISO.test(r.createdAt) ? r.createdAt : '1970-01-01',
      ...(typeof r.note === 'string' && r.note ? { note: r.note } : {}),
    });
  }
  const known = new Set(accounts.map((a) => a.id));
  const balances: WealthBalance[] = [];
  for (const b of Array.isArray(src.balances) ? src.balances : []) {
    const r = b as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.accountId !== 'string' || !known.has(r.accountId)) continue;
    if (typeof r.date !== 'string' || !ISO.test(r.date)) continue;
    if (typeof r.amount !== 'number' || !Number.isFinite(r.amount)) continue;
    balances.push({
      id: r.id,
      accountId: r.accountId,
      date: r.date,
      amount: r.amount,
      ...(typeof r.note === 'string' && r.note ? { note: r.note } : {}),
    });
  }
  const flows: WealthFlow[] = [];
  for (const f of Array.isArray(src.flows) ? src.flows : []) {
    const r = f as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.accountId !== 'string' || !known.has(r.accountId)) continue;
    if (typeof r.date !== 'string' || !ISO.test(r.date)) continue;
    if (typeof r.amount !== 'number' || !Number.isFinite(r.amount) || r.amount === 0) continue;
    flows.push({
      id: r.id,
      accountId: r.accountId,
      date: r.date,
      amount: r.amount,
      ...(typeof r.note === 'string' && r.note ? { note: r.note } : {}),
    });
  }
  return { accounts, balances, flows };
}

/**
 * Record a reading. A second reading for the same account and date REPLACES the first:
 * correcting a typo in last month's statement must not leave two values on one day, where
 * which one the chart used would depend on array order.
 */
export function setBalance(
  book: WealthBook,
  input: { accountId: string; date: string; amount: number; note?: string },
  newId: () => string,
): WealthBook {
  if (!book.accounts.some((a) => a.id === input.accountId)) throw new Error('unknown account');
  if (!ISO.test(input.date)) throw new Error('date must be YYYY-MM-DD');
  if (!Number.isFinite(input.amount)) throw new Error('amount must be a number');
  const prior = book.balances.find((b) => b.accountId === input.accountId && b.date === input.date);
  const row: WealthBalance = {
    id: prior?.id ?? newId(),
    accountId: input.accountId,
    date: input.date,
    amount: input.amount,
    ...(input.note ? { note: input.note } : {}),
  };
  return {
    ...book,
    balances: [...book.balances.filter((b) => b !== prior), row],
  };
}

/**
 * Correct a reading already recorded: its date, amount or note.
 *
 * Moving it onto a date where the same account already has a reading REPLACES that one, for
 * the reason `setBalance` does: two values on one day would leave the chart to pick by array
 * order. The page asks before doing it; this function only keeps the book consistent. The
 * reading keeps its id, so an open history row still points at it.
 */
export function editBalance(
  book: WealthBook,
  balanceId: string,
  patch: { date: string; amount: number; note?: string },
): WealthBook {
  const row = book.balances.find((b) => b.id === balanceId);
  if (!row) throw new Error('unknown reading');
  if (!ISO.test(patch.date)) throw new Error('date must be YYYY-MM-DD');
  if (!Number.isFinite(patch.amount)) throw new Error('amount must be a number');
  const edited: WealthBalance = {
    id: row.id,
    accountId: row.accountId,
    date: patch.date,
    amount: patch.amount,
    ...(patch.note ? { note: patch.note } : {}),
  };
  return {
    ...book,
    balances: book.balances
      .filter((b) => b.id === row.id || b.accountId !== row.accountId || b.date !== patch.date)
      .map((b) => (b.id === row.id ? edited : b)),
  };
}

export function removeBalance(book: WealthBook, balanceId: string): WealthBook {
  return { ...book, balances: book.balances.filter((b) => b.id !== balanceId) };
}

/** Drop an account AND its readings and flows — an orphan would still be summed by nobody. */
export function removeWealthAccount(book: WealthBook, accountId: string): WealthBook {
  return {
    accounts: book.accounts.filter((a) => a.id !== accountId),
    balances: book.balances.filter((b) => b.accountId !== accountId),
    flows: (book.flows ?? []).filter((f) => f.accountId !== accountId),
  };
}

/** Record a deposit (amount > 0) or a withdrawal (amount < 0). Several on one day are fine. */
export function addFlow(
  book: WealthBook,
  input: { accountId: string; date: string; amount: number; note?: string },
  newId: () => string,
): WealthBook {
  if (!book.accounts.some((a) => a.id === input.accountId)) throw new Error('unknown account');
  if (!ISO.test(input.date)) throw new Error('date must be YYYY-MM-DD');
  if (!Number.isFinite(input.amount) || input.amount === 0) throw new Error('amount must be a non-zero number');
  const row: WealthFlow = {
    id: newId(),
    accountId: input.accountId,
    date: input.date,
    amount: input.amount,
    ...(input.note ? { note: input.note } : {}),
  };
  return { ...book, flows: [...(book.flows ?? []), row] };
}

export function removeFlow(book: WealthBook, flowId: string): WealthBook {
  return { ...book, flows: (book.flows ?? []).filter((f) => f.id !== flowId) };
}

/** One account's flows, oldest first (same-day ones in the order they were entered). */
export function flowsOf(book: WealthBook, accountId: string): WealthFlow[] {
  // `?? []`: a book built by an older caller (or a test) may not carry the list at all.
  return (book.flows ?? [])
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.accountId === accountId)
    .sort((a, b) => (a.f.date < b.f.date ? -1 : a.f.date > b.f.date ? 1 : a.i - b.i))
    .map(({ f }) => f);
}

/**
 * What the account holds at the end of `date`: the reading in force plus the flows after it.
 * Null when nothing at all is known by then (no reading, no flow) — before the account existed
 * in the tracker, which `wealthSeries` counts as nothing.
 */
export function valueOn(
  sortedReadings: readonly WealthBalance[],
  sortedFlows: readonly WealthFlow[],
  date: string,
): number | null {
  const r = balanceOn(sortedReadings, date);
  let v = r ? r.amount : 0;
  let any = !!r;
  for (const f of sortedFlows) {
    if (f.date > date) break;
    if (r && f.date <= r.date) continue;
    v += f.amount;
    any = true;
  }
  return any ? v : null;
}

/** One account's readings, oldest first. */
export function balancesOf(book: WealthBook, accountId: string): WealthBalance[] {
  return book.balances
    .filter((b) => b.accountId === accountId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The reading in force on `date`: the last one on or before it, or null before the first. */
export function balanceOn(sorted: readonly WealthBalance[], date: string): WealthBalance | null {
  let lo = 0;
  let hi = sorted.length - 1;
  let hit: WealthBalance | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = sorted[mid]!;
    if (b.date <= date) {
      hit = b;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return hit;
}

// ── Amounts as typed ──────────────────────────────────────────────────────────

/**
 * A money amount as a person types it, in any of the three conventions this user meets:
 * `250,000,000` (a VND statement), `12.500,50` (a German bank), `1234.56`.
 *
 * The rule, in order:
 *  - Both `.` and `,` present: whichever comes LAST is the decimal point.
 *  - One of them, more than once: it groups thousands (`250,000,000`, `1.234.567`).
 *  - One of them, once, followed by exactly three digits after a 1–3 digit head that is not
 *    `0`: thousands (`12.500`, `1,234`). Otherwise it is the decimal point (`1.5`, `0.125`,
 *    `1234.567`).
 * Spaces, apostrophes, currency signs and codes are ignored. Returns null for anything that
 * is not a number, rather than a 0 that would be saved as a real balance.
 */
export function parseAmount(input: string): number | null {
  let s = input.trim().replace(/[\s  '’]/g, '').replace(/(EUR|USD|VND|CNY|RMB|€|\$|₫|đ|¥|元)/gi, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-') || s.startsWith('−')) {
    neg = !neg;
    s = s.slice(1);
  }
  if (!s || !/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let norm: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    const grp = dec === '.' ? ',' : '.';
    if (s.split(dec).length > 2) return null;
    norm = s.split(grp).join('').replace(dec, '.');
  } else {
    const sep = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : '';
    if (!sep) {
      norm = s;
    } else {
      const parts = s.split(sep);
      if (parts.length > 2) {
        // Thousands groups must be exactly three digits, or this is not a number at all.
        if (parts.slice(1).some((p) => p.length !== 3) || !parts[0]) return null;
        norm = parts.join('');
      } else {
        const [head, tail] = parts as [string, string];
        const grouping = tail.length === 3 && head.length >= 1 && head.length <= 3 && head !== '0';
        norm = grouping ? head + tail : `${head || '0'}.${tail}`;
      }
    }
  }
  const v = Number(norm);
  if (!Number.isFinite(v)) return null;
  return neg ? -v : v;
}

// ── Exchange rates ────────────────────────────────────────────────────────────

/**
 * Units of a currency per ONE euro, by date — the way Yahoo quotes EURUSD=X and EURVND=X.
 * Built from daily bars; EUR itself is always 1.
 */
export interface FxTable {
  /** Units per EUR on `date` — the last close on or before it; before the history starts,
   *  the first close. Null when there is no history for that currency at all. */
  perEur(ccy: WealthCurrency, date: string): number | null;
}

export function makeFxTable(bars: Partial<Record<Exclude<WealthCurrency, 'EUR'>, readonly Bar[]>>): FxTable {
  const tables = new Map<string, { dates: string[]; closes: number[] }>();
  for (const [ccy, list] of Object.entries(bars)) {
    const clean = [...(list ?? [])]
      .filter((b) => b && ISO.test(b.date) && Number.isFinite(b.close) && b.close > 0)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (clean.length) tables.set(ccy, { dates: clean.map((b) => b.date), closes: clean.map((b) => b.close) });
  }
  return {
    perEur(ccy, date) {
      if (ccy === 'EUR') return 1;
      const t = tables.get(ccy);
      if (!t) return null;
      let lo = 0;
      let hi = t.dates.length - 1;
      let hit = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (t.dates[mid]! <= date) {
          hit = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return t.closes[hit < 0 ? 0 : hit]!;
    },
  };
}

/** An amount in euros on `date`, or null when that currency has no rate. */
export function toEur(amount: number, ccy: WealthCurrency, date: string, fx: FxTable): number | null {
  const r = fx.perEur(ccy, date);
  return r == null ? null : amount / r;
}

// ── The series ────────────────────────────────────────────────────────────────

/** One portfolio account's daily equity, in its own currency. */
export interface PortfolioLine {
  currency: WealthCurrency;
  points: readonly { date: string; equity: number }[];
}

export interface WealthPoint {
  date: string;
  /** All portfolio accounts, in EUR. */
  portfolio: number;
  /** Each wealth account's value in EUR on this date (0 before its first reading). */
  byAccount: Record<string, number>;
  /** Everything that is not the portfolio, in EUR. */
  others: number;
  total: number;
}

export interface WealthSeries {
  /** The first date of the chart, or null when there is nothing to draw. */
  start: string | null;
  points: WealthPoint[];
  /** Currencies that were needed and had no rate: their accounts are NOT in the totals. */
  missingFx: WealthCurrency[];
}

/**
 * The wealth curve, one point per date from the start to `today`.
 *
 * The START is the portfolio's first day — the user's rule: the portfolio is what this page
 * grew out of, and the bank accounts join it. With no portfolio history it falls back to the
 * first balance reading. A reading dated before the start is not lost: it is what the
 * account holds on the start date.
 *
 * The dates are the union of the portfolio's days, every reading's date and today, so a
 * statement dated on a Sunday still shows up as a step on that Sunday.
 */
export function wealthSeries(input: {
  book: WealthBook;
  portfolio: readonly PortfolioLine[];
  fx: FxTable;
  today: string;
}): WealthSeries {
  const { book, portfolio, fx, today } = input;
  const pfDates = portfolio.flatMap((l) => l.points.map((p) => p.date)).filter((d) => ISO.test(d));
  const balDates = [...book.balances.map((b) => b.date), ...(book.flows ?? []).map((f) => f.date)];
  const firstOf = (ds: string[]): string | null => (ds.length ? ds.reduce((a, b) => (b < a ? b : a)) : null);
  const start = firstOf(pfDates) ?? firstOf(balDates);
  if (!start) return { start: null, points: [], missingFx: [] };

  const dates = [...new Set([...pfDates, ...balDates, today].filter((d) => d >= start && d <= today))].sort();
  const lines = portfolio.map((l) => {
    const m = new Map<string, number>();
    for (const p of l.points) if (Number.isFinite(p.equity)) m.set(p.date, p.equity);
    return { currency: l.currency, byDate: m, carried: 0 };
  });
  const accounts = book.accounts.map((a) => ({ acct: a, sorted: balancesOf(book, a.id), flows: flowsOf(book, a.id) }));
  const missing = new Set<WealthCurrency>();

  const points = dates.map((date): WealthPoint => {
    let pf = 0;
    for (const l of lines) {
      const v = l.byDate.get(date);
      if (v !== undefined) l.carried = v;
      if (!l.carried) continue;
      const eur = toEur(l.carried, l.currency, date, fx);
      if (eur == null) missing.add(l.currency);
      else pf += eur;
    }
    const byAccount: Record<string, number> = {};
    let others = 0;
    for (const { acct, sorted, flows } of accounts) {
      const v = valueOn(sorted, flows, date);
      if (v === null) {
        byAccount[acct.id] = 0;
        continue;
      }
      const eur = toEur(v, acct.currency, date, fx);
      if (eur == null) {
        missing.add(acct.currency);
        byAccount[acct.id] = 0;
        continue;
      }
      byAccount[acct.id] = eur;
      others += eur;
    }
    return { date, portfolio: pf, byAccount, others, total: pf + others };
  });
  return { start, points, missingFx: [...missing] };
}

/** The point in force on `date` (last on or before), for "change since …" figures. */
export function pointOn(points: readonly WealthPoint[], date: string): WealthPoint | null {
  let hit: WealthPoint | null = null;
  for (const p of points) {
    if (p.date > date) break;
    hit = p;
  }
  return hit;
}

/** A value the account held, as of the event (a reading or a flow) that set it. */
export interface AccountValue {
  date: string;
  amount: number;
}

/**
 * One account now and one step back.
 *
 * `latest` is the value after the most recent EVENT up to today — a reading or a flow — and
 * `previous` the value after the event before it, so "change" is what the last statement or the
 * last deposit moved. `ageDays` is counted from the last READING: a deposit says money moved,
 * not that someone checked the balance, so it must not hide a statement that is months old.
 */
export interface AccountStatus {
  latest: AccountValue | null;
  previous: AccountValue | null;
  /** latest − previous, in the account currency; null with fewer than two events. */
  change: number | null;
  /** Whole days from the latest READING to `today`; null with no reading. */
  ageDays: number | null;
}

export function accountStatus(book: WealthBook, accountId: string, today: string): AccountStatus {
  const readings = balancesOf(book, accountId).filter((b) => b.date <= today);
  const flows = flowsOf(book, accountId).filter((f) => f.date <= today);
  const days = [...new Set([...readings.map((b) => b.date), ...flows.map((f) => f.date)])].sort();
  const at = (d: string | undefined): AccountValue | null => {
    if (!d) return null;
    const v = valueOn(readings, flows, d);
    return v === null ? null : { date: d, amount: v };
  };
  const latest = at(days[days.length - 1]);
  const previous = at(days[days.length - 2]);
  const lastReading = readings[readings.length - 1];
  return {
    latest,
    previous,
    change: latest && previous ? latest.amount - previous.amount : null,
    ageDays: lastReading ? Math.round((Date.parse(today) - Date.parse(lastReading.date)) / 86_400_000) : null,
  };
}
