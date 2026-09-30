/**
 * The tools the assistant is allowed to call, and the validation of what comes
 * back from the model.
 *
 * ── ONE SPEC, TWO USES ──────────────────────────────────────────────────────
 * Each argument is declared once as a `FieldSpec`. The JSON Schema shown to the
 * model is DERIVED from it, and so is the coercion applied to the model's reply.
 * Two hand-maintained copies would drift, and the drift would be invisible: the
 * model would keep sending what the schema promised while the validator quietly
 * rejected it (or worse, accepted something the schema never allowed).
 *
 * ── WHY VALIDATE AT ALL, GIVEN A SCHEMA ─────────────────────────────────────
 * A JSON Schema is a request, not a guarantee. Models send `"10"` for a number,
 * `"$195.50"` for a price, `"aapl"` for a ticker, `"today"` for a date, and extra
 * fields nobody asked for. Every one of those reaches a real portfolio here, so
 * each is either coerced by an explicit rule or REFUSED with a message the model
 * can act on. Nothing is guessed.
 *
 * ── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────────
 * • No delete tool of any kind. Deletions run against a last-write-wins synced
 *   blob, so a wrong one propagates to every device and there is no undo. The UI
 *   has them; the model does not.
 * • No tool takes a derived money figure. The model supplies shares, a price and
 *   a date — never proceeds, realized PnL, cash, or a total. Those are computed
 *   by core from the recorded facts, so a model's arithmetic error can never
 *   become a stored number. A test pins the argument lists to keep it that way.
 * • No date defaulting. Core has no clock and a model that guesses one silently
 *   back-dates a trade; an omitted date is filled in by the app, which does.
 *
 * Pure data + pure functions: no fetch, no DOM, no clock. Execution lives in the
 * app, where the portfolio store and the market data are.
 */

/** A single tool argument, in the terms this domain actually has. */
export type FieldSpec =
  /** A stock symbol. Upper-cased; a leading `$` is stripped. */
  | { kind: 'ticker'; description: string }
  /** A list of stock symbols. */
  | { kind: 'tickerList'; description: string; maxItems: number }
  /** A share count. Strictly positive; fractional is allowed. */
  | { kind: 'shares'; description: string }
  /** A price or amount that cannot be negative. */
  | { kind: 'money'; description: string }
  /** An amount whose sign carries meaning (deposit vs withdrawal). Non-zero. */
  | { kind: 'signedMoney'; description: string }
  /** A balance reading: zero (a closed account) and negative (a loan) are both real. */
  | { kind: 'balance'; description: string }
  /** A calendar date, `YYYY-MM-DD` only. */
  | { kind: 'date'; description: string }
  /**
   * Short plain text: an account name, a setup label. Markup CHARACTERS ARE
   * REFUSED rather than escaped, because these are interpolated into HTML raw in
   * places (the account `<option>` list) and matched against stored names in
   * others — escaping would fix the first and break the second.
   */
  | { kind: 'text'; description: string; maxLength: number }
  /**
   * A note. Escaped, because notes ARE rendered as HTML: the model's output is
   * untrusted markup (it may be echoing a web page or a pasted prompt), and
   * escaping means the note shows the characters the model wrote and cannot
   * become script regardless of what the renderer does with it later.
   */
  | { kind: 'richText'; description: string; maxLength: number }
  /** One of a fixed set of values. Matched case-insensitively. */
  | { kind: 'enum'; description: string; values: readonly string[] }
  /** A whole number in a range. */
  | { kind: 'int'; description: string; min: number; max: number };

export interface ToolArg {
  name: string;
  spec: FieldSpec;
  required: boolean;
}

/**
 * `read` tools only compute and report. `write` tools change stored state and so
 * must pass through an approval step and the audit log before they run — the
 * distinction is what the UI keys that behaviour off, which is why it lives on
 * the definition rather than in a list somewhere else.
 */
export type ToolKind = 'read' | 'write';

export interface AgentToolDef {
  name: string;
  kind: ToolKind;
  /** Written for the model: what it does, and when NOT to reach for it. */
  description: string;
  args: readonly ToolArg[];
}

const req = (name: string, spec: FieldSpec): ToolArg => ({ name, spec, required: true });
const opt = (name: string, spec: FieldSpec): ToolArg => ({ name, spec, required: false });

/** Present on every account-scoped tool, so "in my Growth account" works. */
const ACCOUNT: ToolArg = opt('account', {
  kind: 'text',
  description:
    'Which account, by name. Omit to use the one currently open in the app — which is what the user means unless they name another.',
  maxLength: 60,
});

const DATE: ToolArg = opt('date', {
  kind: 'date',
  description:
    'Trade date as YYYY-MM-DD. Omit for today rather than guessing a date — the app fills it in. Only supply one if the user stated it.',
});

/**
 * The currency a stated price is in — NOT the account's currency.
 *
 * A European trading US momentum names quotes fills in dollars while the account is
 * kept in euros, so "I bought at 232.50" and "my cost basis is €209" are the same
 * trade. Guessing wrong is a ~10% error in the cost basis that nothing downstream
 * can detect, so the app converts at the EURUSD rate for the trade date and prints
 * both numbers on the approval card, where the user can see which reading it took.
 */
const PRICE_CCY: ToolArg = opt('priceCurrency', {
  kind: 'enum',
  description:
    'Currency the prices in this call are quoted in — the fill price and any stop or target with it. Defaults to the symbol’s own quote currency: USD for a US listing, EUR for a euro-area one (ALV.DE, SAP.DE, AIR.PA). Pass the other one only when the user gave the price in it.',
  values: ['EUR', 'USD'],
});

export const AGENT_TOOLS: readonly AgentToolDef[] = [
  // ── read ────────────────────────────────────────────────────────────────
  {
    name: 'list_accounts',
    kind: 'read',
    description:
      'List the paper-trading accounts: name, currency, opening capital, and which one is currently open. Call this first when the user names an account you have not seen.',
    args: [],
  },
  {
    name: 'get_account_summary',
    kind: 'read',
    description:
      'Cash, equity, total and realized PnL, open risk, win rate and drawdown for one account. This is the tool for "how am I doing", "how much cash do I have", and any whole-portfolio number.',
    args: [ACCOUNT],
  },
  {
    name: 'list_positions',
    kind: 'read',
    description:
      'Every open position with shares, average cost, last price, unrealized PnL, stop, risk, and weight. Use it for "what do I own" and before advising on any position.',
    args: [ACCOUNT],
  },
  {
    name: 'list_transactions',
    kind: 'read',
    description:
      'Recorded buys and sells, newest first, with realized PnL on the sells. Use it for trade history and closed-trade questions.',
    args: [
      ACCOUNT,
      opt('ticker', { kind: 'ticker', description: 'Only this symbol.' }),
      opt('limit', { kind: 'int', description: 'How many to return.', min: 1, max: 200 }),
    ],
  },
  {
    name: 'get_quote',
    kind: 'read',
    description:
      'Latest price and recent trend for one or more symbols, held or not. Always call this instead of stating a price from memory — your training data has no idea what anything costs today.',
    args: [
      req('tickers', {
        kind: 'tickerList',
        description: 'Symbols to quote, e.g. ["AAPL","MSFT"].',
        maxItems: 20,
      }),
    ],
  },

  // ── read: the rest of the app ───────────────────────────────────────────
  // Every tab's data, reachable whichever page is open. Each is a read of what the
  // app has already stored or fetched; none of them starts a scan or a sweep.
  {
    name: 'get_scanner',
    kind: 'read',
    description:
      "The nightly market scanner's latest output (it runs on a server after the US close). overview = market regime, sector leadership, pipeline status and counts; watchlist = the ranked names with trigger, stop, target and size; candidates = today's setups by type (BO breakout, RV reversal, LEAD leader) with pivot and base; rejects = names dropped and why; alerts = today's intraday alerts. Optionally one ticker only.",
    args: [
      opt('section', {
        kind: 'enum',
        description: 'Which part. Defaults to overview.',
        values: ['overview', 'watchlist', 'candidates', 'rejects', 'alerts', 'sectors'],
      }),
      opt('ticker', { kind: 'ticker', description: 'Only rows for this symbol.' }),
    ],
  },
  {
    name: 'list_trade_plans',
    kind: 'read',
    description:
      'Trade plans from the Trade Planner: per symbol the setup, entry/stop/target levels, the checklist grade and the note. These are ideas not yet bought — bought lots are in list_positions.',
    args: [opt('ticker', { kind: 'ticker', description: 'Only the plan for this symbol.' })],
  },
  {
    name: 'list_case_studies',
    kind: 'read',
    description:
      'The Case Studies journal: filed trades and examples with setup, entry, stop, target, exit, R multiple, exit reason and lessons. Without id it lists them; with id it returns one in full.',
    args: [
      opt('ticker', { kind: 'ticker', description: 'Only studies of this symbol.' }),
      opt('id', { kind: 'text', description: 'One study, by the id from the list.', maxLength: 80 }),
    ],
  },
  {
    name: 'get_playbook',
    kind: 'read',
    description:
      "The user's playbook rules: market regime (from SPY), risk per trade and its ladder, the A/B/C grade thresholds, per-setup stop/target overrides and custom exit reasons. Use it for sizing and 'what do my rules say' questions.",
    args: [],
  },
  {
    name: 'list_watchlists',
    kind: 'read',
    description: "The user's own watch lists (the Watchlist tab) and the symbols in each.",
    args: [opt('name', { kind: 'text', description: 'Only this list, by name.', maxLength: 60 })],
  },
  {
    name: 'get_calendar',
    kind: 'read',
    description:
      'Upcoming dated events from the Calendar tab (earnings, dividends, splits, IPOs, macro), from its latest snapshot. With a ticker, also that company\'s last four reported quarters (EPS vs consensus).',
    args: [
      opt('ticker', { kind: 'ticker', description: 'Only this symbol.' }),
      opt('days', { kind: 'int', description: 'How many days ahead. Defaults to 14.', min: 1, max: 60 }),
    ],
  },
  {
    name: 'get_wealth',
    kind: 'read',
    description:
      "The Financial Status tab: total net worth in EUR — the Portfolio plus the user's bank, savings, cash, crypto, property and loan accounts, each with its last recorded balance in its own currency (EUR, USD, VND or CNY), its EUR value, and the date it was recorded, plus the month-end total since the start (last 60 months).",
    args: [],
  },
  {
    name: 'web_search',
    kind: 'read',
    description:
      'Search the internet. kind=news returns dated Yahoo Finance headlines (best for "why is X moving", catalysts, recent events); kind=web returns general web pages (company background, FDA dates, anything else). Results are titles, links and snippets written by third parties. Never use this for a price — call get_quote.',
    args: [
      req('query', { kind: 'text', description: 'What to search for. A ticker plus a few words works best.', maxLength: 200 }),
      opt('kind', { kind: 'enum', description: 'news or web. Defaults to news.', values: ['news', 'web'] }),
      opt('limit', { kind: 'int', description: 'How many results. Defaults to 6.', min: 1, max: 10 }),
    ],
  },

  // ── write ───────────────────────────────────────────────────────────────
  {
    name: 'create_account',
    kind: 'write',
    description: 'Open a new, empty paper-trading account.',
    args: [
      req('name', { kind: 'text', description: 'Account name.', maxLength: 60 }),
      req('initialCapital', {
        kind: 'money',
        description: 'Opening capital, in the account currency.',
      }),
      opt('currency', {
        kind: 'enum',
        description: 'Account currency. Defaults to EUR.',
        values: ['EUR', 'USD'],
      }),
      opt('description', { kind: 'text', description: 'What this account is for.', maxLength: 240 }),
    ],
  },
  {
    name: 'record_buy',
    kind: 'write',
    description:
      'Record a purchase the user has already made or decided on. This books a real lot in their portfolio — it is not a suggestion or a simulation. Ask for the price if they did not give one; do not infer it from a quote.',
    args: [
      ACCOUNT,
      req('ticker', { kind: 'ticker', description: 'Symbol bought.' }),
      req('shares', { kind: 'shares', description: 'Number of shares.' }),
      req('price', { kind: 'money', description: 'Price paid per share.' }),
      PRICE_CCY,
      DATE,
      opt('stop', { kind: 'money', description: 'Initial stop-loss price, if they set one.' }),
      opt('target', { kind: 'money', description: 'Price target, if they set one.' }),
      opt('setupType', {
        kind: 'text',
        description: 'Setup taken, e.g. "VCP" or "Episodic Pivot".',
        maxLength: 40,
      }),
      opt('rating', {
        kind: 'enum',
        description: 'Their own A–D grade of the setup.',
        values: ['A', 'B', 'C', 'D'],
      }),
      opt('note', {
        kind: 'richText',
        description: 'Why they took it, in their words.',
        maxLength: 2000,
      }),
    ],
  },
  {
    name: 'record_sell',
    kind: 'write',
    description:
      'Record a sale. Shares are matched against open lots oldest-first and the realized PnL is computed from the recorded lots — never state or pass a PnL figure yourself.',
    args: [
      ACCOUNT,
      req('ticker', { kind: 'ticker', description: 'Symbol sold.' }),
      req('shares', { kind: 'shares', description: 'Number of shares sold.' }),
      req('price', { kind: 'money', description: 'Price received per share.' }),
      PRICE_CCY,
      DATE,
      opt('note', { kind: 'richText', description: 'Why they sold.', maxLength: 2000 }),
    ],
  },
  {
    name: 'set_stop',
    kind: 'write',
    description:
      'Move the stop-loss on every open lot of one symbol. Use it for "raise my stop on AAPL to 190". It cannot remove a stop — that is done in the app.',
    args: [
      ACCOUNT,
      req('ticker', { kind: 'ticker', description: 'Symbol whose stop moves.' }),
      req('stop', { kind: 'money', description: 'New stop price.' }),
      PRICE_CCY,
    ],
  },
  {
    name: 'record_cash_flow',
    kind: 'write',
    description:
      'Record a dated cash deposit or withdrawal. Positive deposits, negative withdrawals. This changes the capital base every return figure is measured against.',
    args: [
      ACCOUNT,
      req('amount', {
        kind: 'signedMoney',
        description:
          "Positive to deposit, negative to withdraw, in the ACCOUNT's own currency. A transfer is money moving into the account, so it is already in that currency — do not convert it.",
      }),
      DATE,
      opt('note', { kind: 'richText', description: 'What the transfer was.', maxLength: 240 }),
    ],
  },
  {
    // Financial Status, not the portfolio: these accounts are bank / savings / cash /
    // loan books whose history is a list of dated balance readings. "N26 4K" is the
    // user saying what the N26 balance IS today — a new reading, never a deposit.
    name: 'record_balance',
    kind: 'write',
    description:
      "Record a balance reading on a Financial Status account (bank, savings, cash, crypto, loan…). Shorthand like 'N26 4K' means: account N26, balance 4000, dated today. It is what the balance IS now, not money added — never add it to the last reading. If the account name or the number is unclear, ask the user instead of guessing. It cannot create accounts; new ones are added on the Financial Status page.",
    args: [
      req('account', {
        kind: 'text',
        description: 'Financial Status account name, as the user said it (e.g. N26). Not a portfolio account.',
        maxLength: 60,
      }),
      req('amount', {
        kind: 'balance',
        description:
          "The balance, in the ACCOUNT's own currency (a VND account takes VND). Do not convert. Negative for a loan or credit card that is owed.",
      }),
      DATE,
      opt('note', { kind: 'richText', description: 'Optional note for this reading.', maxLength: 240 }),
    ],
  },
  {
    name: 'place_order',
    kind: 'write',
    description:
      'Queue a pending order that fills automatically when price crosses the threshold on a later daily bar. BUY_STOP buys on strength above the threshold; STOP_LOSS and TAKE_PROFIT exit an existing position.',
    args: [
      ACCOUNT,
      req('ticker', { kind: 'ticker', description: 'Symbol.' }),
      req('type', {
        kind: 'enum',
        description: 'Order type.',
        values: ['BUY_STOP', 'STOP_LOSS', 'TAKE_PROFIT'],
      }),
      req('threshold', { kind: 'money', description: 'Trigger price.' }),
      PRICE_CCY,
      req('shares', { kind: 'shares', description: 'Number of shares.' }),
      DATE,
    ],
  },
];

export function findTool(name: string): AgentToolDef | undefined {
  return AGENT_TOOLS.find((t) => t.name === name);
}

export function readTools(): AgentToolDef[] {
  return AGENT_TOOLS.filter((t) => t.kind === 'read');
}

export function writeTools(): AgentToolDef[] {
  return AGENT_TOOLS.filter((t) => t.kind === 'write');
}

// ── JSON Schema ───────────────────────────────────────────────────────────────

export interface JsonSchemaProp {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array';
  description: string;
  enum?: readonly string[];
  items?: { type: 'string' };
  minimum?: number;
  maximum?: number;
  maxItems?: number;
}

export interface ToolSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProp>;
  required: string[];
  /**
   * Refused rather than ignored at the schema level, because a model that invents
   * a field is usually a model that has misunderstood the tool, and the error
   * teaches it more than a silent drop.
   */
  additionalProperties: false;
}

function propFor(spec: FieldSpec): JsonSchemaProp {
  switch (spec.kind) {
    case 'ticker':
    case 'date':
    case 'text':
    case 'richText':
      return { type: 'string', description: spec.description };
    case 'enum':
      return { type: 'string', description: spec.description, enum: spec.values };
    case 'tickerList':
      return {
        type: 'array',
        description: spec.description,
        items: { type: 'string' },
        maxItems: spec.maxItems,
      };
    case 'shares':
      return { type: 'number', description: spec.description, minimum: 0 };
    case 'money':
      return { type: 'number', description: spec.description, minimum: 0 };
    case 'signedMoney':
    case 'balance':
      return { type: 'number', description: spec.description };
    case 'int':
      return {
        type: 'integer',
        description: spec.description,
        minimum: spec.min,
        maximum: spec.max,
      };
  }
}

/** The parameter schema for one tool, in the shape both wire formats want. */
export function schemaFor(tool: AgentToolDef): ToolSchema {
  const properties: Record<string, JsonSchemaProp> = {};
  for (const a of tool.args) properties[a.name] = propFor(a.spec);
  return {
    type: 'object',
    properties,
    required: tool.args.filter((a) => a.required).map((a) => a.name),
    additionalProperties: false,
  };
}

// ── validation ────────────────────────────────────────────────────────────────

export interface ArgIssue {
  field: string;
  /** Phrased for the model to read and retry against, not for a user. */
  problem: string;
}

export type ToolArgs = Record<string, string | number>;

export type Validation =
  | { ok: true; value: ToolArgs; ignored: string[] }
  | { ok: false; issues: ArgIssue[] };

/**
 * Read a number out of whatever the model sent.
 *
 * Models quote prices the way people write them — `"$195.50"`, `"1,234.56"`,
 * `"1.234,56"`, `"12 000"` — and a portfolio in a European locale sees both
 * separator conventions. So the rule is the one a reader uses: when both
 * separators appear, the LAST one is the decimal point; a lone comma is a
 * thousands separator only in the exact `1,234` shape and is otherwise a decimal
 * comma. Anything still ambiguous is refused rather than rounded to something
 * plausible — this number ends up in a trade record.
 */
export function parseLooseNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;

  let s = raw.trim().replace(/[\s ]/g, '');
  // Currency symbols and codes, wherever the model put them.
  s = s.replace(/^[$€£]|[$€£]$/g, '').replace(/\s*(EUR|USD|eur|usd)$/, '');
  if (!s) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: the rightmost is the decimal separator, the other is grouping.
    const decimal = lastDot > lastComma ? '.' : ',';
    const grouping = decimal === '.' ? ',' : '.';
    s = s.split(grouping).join('');
    if (decimal === ',') s = s.replace(',', '.');
  } else if (lastComma >= 0) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.split(',').join('') : s.replace(',', '.');
  }

  // Only a plain decimal number survives. No exponents: a model writing `1e3`
  // shares is confused, and reading it as 1000 would hide that.
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** True for a real calendar date in `YYYY-MM-DD`. Rejects 2025-02-30. */
function isCalendarDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Escape a note so it renders as the characters written, never as markup. */
function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Collapse a plain single-line field: no control characters, no runs of space. */
function cleanLine(s: string): string {
  return s
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;

function cleanTicker(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().replace(/^\$/, '').toUpperCase();
  return TICKER_RE.test(t) ? t : null;
}

function coerce(spec: FieldSpec, raw: unknown): { value: string | number } | { problem: string } {
  switch (spec.kind) {
    case 'ticker': {
      const t = cleanTicker(raw);
      return t ? { value: t } : { problem: `not a stock symbol: ${JSON.stringify(raw)}` };
    }
    case 'tickerList': {
      const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\s]+/) : null;
      if (!list) return { problem: 'expected an array of stock symbols' };
      const cleaned = list.map(cleanTicker).filter((t): t is string => t !== null);
      if (!cleaned.length) return { problem: 'no valid stock symbols in the list' };
      if (cleaned.length > spec.maxItems) {
        return { problem: `too many symbols (max ${spec.maxItems}) — ask in smaller batches` };
      }
      // Joined rather than kept as an array so the validated bag stays flat and
      // trivially loggable; the executor splits on the comma.
      return { value: [...new Set(cleaned)].join(',') };
    }
    case 'shares': {
      const n = parseLooseNumber(raw);
      if (n === null) return { problem: `not a number: ${JSON.stringify(raw)}` };
      if (!(n > 0)) return { problem: 'share count must be greater than zero' };
      if (n > 1e9) return { problem: 'share count is implausibly large' };
      return { value: n };
    }
    case 'money': {
      const n = parseLooseNumber(raw);
      if (n === null) return { problem: `not an amount: ${JSON.stringify(raw)}` };
      if (n < 0) return { problem: 'amount cannot be negative' };
      if (n > 1e12) return { problem: 'amount is implausibly large' };
      return { value: n };
    }
    case 'signedMoney': {
      const n = parseLooseNumber(raw);
      if (n === null) return { problem: `not an amount: ${JSON.stringify(raw)}` };
      if (n === 0) return { problem: 'amount must be non-zero' };
      if (Math.abs(n) > 1e12) return { problem: 'amount is implausibly large' };
      return { value: n };
    }
    case 'balance': {
      const n = parseLooseNumber(raw);
      if (n === null) {
        return {
          problem: `not an amount: ${JSON.stringify(raw)}. Expand shorthand yourself (4K = 4000, 1.2M = 1200000) and pass a plain number.`,
        };
      }
      // 1e13 rather than 1e12: a VND savings account legitimately runs to billions.
      if (Math.abs(n) > 1e13) return { problem: 'amount is implausibly large' };
      return { value: n };
    }
    case 'date': {
      if (typeof raw !== 'string') return { problem: 'expected a date string' };
      const s = raw.trim();
      if (!isCalendarDate(s)) {
        return {
          problem: `not a YYYY-MM-DD date: ${JSON.stringify(raw)}. Omit the field to use today rather than guessing.`,
        };
      }
      return { value: s };
    }
    case 'text': {
      if (typeof raw !== 'string' && typeof raw !== 'number') return { problem: 'expected text' };
      const s = cleanLine(String(raw));
      if (!s) return { problem: 'must not be empty' };
      if (s.length > spec.maxLength) return { problem: `longer than ${spec.maxLength} characters` };
      if (/[<>]/.test(s)) return { problem: 'must not contain < or >' };
      return { value: s };
    }
    case 'richText': {
      if (typeof raw !== 'string' && typeof raw !== 'number') return { problem: 'expected text' };
      const trimmed = String(raw).trim();
      if (!trimmed) return { problem: 'must not be empty' };
      // Length is checked BEFORE escaping, so the limit means what the model was
      // told it means rather than shrinking whenever the text contains an `&`.
      if (trimmed.length > spec.maxLength) {
        return { problem: `longer than ${spec.maxLength} characters` };
      }
      return { value: escapeText(trimmed) };
    }
    case 'enum': {
      if (typeof raw !== 'string') return { problem: 'expected one of the allowed values' };
      const hit = spec.values.find((v) => v.toLowerCase() === raw.trim().toLowerCase());
      return hit ? { value: hit } : { problem: `must be one of: ${spec.values.join(', ')}` };
    }
    case 'int': {
      const n = parseLooseNumber(raw);
      if (n === null || !Number.isInteger(n)) {
        return { problem: `not a whole number: ${JSON.stringify(raw)}` };
      }
      if (n < spec.min || n > spec.max) {
        return { problem: `must be between ${spec.min} and ${spec.max}` };
      }
      return { value: n };
    }
  }
}

/**
 * Validate and coerce one tool call's arguments.
 *
 * On failure the issues go BACK TO THE MODEL as a tool error, which is why each
 * problem names the field and says what would be acceptable — a model given
 * "invalid input" retries with the same mistake, one given "not a YYYY-MM-DD
 * date; omit to use today" fixes it in one turn.
 *
 * Unknown fields are dropped and reported in `ignored` rather than failing the
 * call: a stray `currency` on a buy is not a reason to refuse a trade the user
 * asked for, but it IS worth surfacing on the approval card so nobody assumes it
 * was honoured.
 */
export function validateToolArgs(toolName: string, raw: unknown): Validation {
  const tool = findTool(toolName);
  if (!tool) return { ok: false, issues: [{ field: '', problem: `unknown tool: ${toolName}` }] };
  if (raw !== null && raw !== undefined && (typeof raw !== 'object' || Array.isArray(raw))) {
    return { ok: false, issues: [{ field: '', problem: 'arguments must be a JSON object' }] };
  }

  const input = (raw ?? {}) as Record<string, unknown>;
  const value: ToolArgs = {};
  const issues: ArgIssue[] = [];

  for (const arg of tool.args) {
    const got = input[arg.name];
    // An explicit null or "" means the model had nothing to say, which for an
    // optional field is the same as leaving it out.
    const missing = got === undefined || got === null || got === '';
    if (missing) {
      if (arg.required) issues.push({ field: arg.name, problem: 'required, but missing' });
      continue;
    }
    const res = coerce(arg.spec, got);
    if ('problem' in res) issues.push({ field: arg.name, problem: res.problem });
    else value[arg.name] = res.value;
  }

  const known = new Set(tool.args.map((a) => a.name));
  const ignored = Object.keys(input).filter((k) => !known.has(k));

  return issues.length ? { ok: false, issues } : { ok: true, value, ignored };
}

/** The issues as one line, ready to hand back as a tool error. */
export function formatIssues(issues: readonly ArgIssue[]): string {
  return issues.map((i) => (i.field ? `${i.field}: ${i.problem}` : i.problem)).join('; ');
}
