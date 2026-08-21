/**
 * Tier 0: answer the everyday questions without calling a model at all.
 *
 * "What do I own", "how much cash do I have", "price of NVDA" are most of what
 * gets asked, they have exactly one right answer, and that answer is already in
 * the app. Sending them to an API would cost tokens and a second of latency to
 * arrive at the same table — so a match here runs the read tool directly and the
 * panel labels the reply as answered locally.
 *
 * ── THE RULE THAT GOVERNS THIS WHOLE FILE ───────────────────────────────────
 * RETURN NULL GENEROUSLY. A missed match costs a few tenths of a cent. A WRONG
 * match answers a question nobody asked and looks like the app is broken — or
 * worse, silently ignores half of what the user said. Every rule below is
 * therefore narrow, and anything with a hint of judgement, comparison or
 * hypothesis is handed to the model.
 *
 * ── WHY TIER 0 NEVER MATCHES A WRITE ────────────────────────────────────────
 * Not because writes are confirmed anyway (they are, in the approval card), but
 * because a regex cannot tell "sell 100 AAPL" from "should I sell 100 AAPL" from
 * "I nearly sold AAPL". A pattern that half-understands a trade instruction is
 * the worst component in this codebase, so any write verb ANYWHERE in the
 * utterance abandons Tier 0 entirely — including for read patterns, since
 * "sell my winners" must not be answered with a positions table.
 *
 * Matches are validated through `validateToolArgs`, so a Tier-0 call and a model
 * call reach the executor in exactly the same shape.
 */

import { findTool, validateToolArgs, type ToolArgs } from './tools.js';

export interface IntentContext {
  /** Account names, so "cash in Growth" scopes to the right one. */
  accountNames?: readonly string[];
  /**
   * Symbols the user holds or watches. A bare lowercase word only resolves to a
   * ticker if it is one of these — otherwise "cash" would quote CASH.
   */
  knownTickers?: readonly string[];
}

export interface IntentMatch {
  tool: string;
  args: ToolArgs;
  /** Which rule fired. Shown in no UI; invaluable when one misfires. */
  rule: string;
}

/**
 * Fold an utterance to something matchable: lowercase, no diacritics, no
 * punctuation. Vietnamese is typed both with and without tone marks, and a rule
 * per spelling would double this file for no gain.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9$.\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Anything that changes state, in either language. Present → Tier 0 stands down.
 * Deliberately over-broad: "add", "set" and "record" catch phrasings that are
 * often harmless, and losing those to the model costs almost nothing.
 */
const WRITE_VERBS =
  /\b(buy|bought|buying|sell|sold|selling|add|added|record|log|create|open a|delete|remove|deposit|withdraw|set|move|raise|lower|trim|close|exit|mua|ban|them|tao|ghi|nap|rut|dat|xoa|chot)\b/;

/**
 * Judgement, comparison, causation, hypotheticals. These need a model even when
 * the sentence also contains a data word — "is my portfolio too concentrated"
 * names the portfolio but is not answered by a table of it.
 *
 * `too` and `enough` are in here because they are how a quantity becomes an
 * opinion, and they almost never appear in a plain lookup.
 */
const NEEDS_THINKING =
  /\b(should|shall|why|how come|do you|what if|would|could|recommend|suggest|advice|advise|opinion|think|too|enough|better|worse|worth (it|buying|holding|selling|the risk)|risky|safe|good|bad|concentrated|diversified|overweight|underweight|overexposed|hedge|compare|vs|versus|explain|analyse|analyze|nen|tai sao|vi sao|nghi|khuyen|danh gia|so sanh|giai thich|co nen|lieu)\b/;

/** Above this, it is a paragraph with several asks in it, not a lookup. */
const MAX_WORDS = 14;

/** All-caps words that are also tickers. Left unquoted unless actually held. */
const NOT_TICKERS = new Set([
  'OK',
  'NO',
  'YES',
  'HI',
  'ALL',
  'IT',
  'ON',
  'AT',
  'BY',
  'SO',
  'AN',
  'BE',
  'DO',
  'GO',
  'IF',
  'IN',
  'IS',
  'ME',
  'MY',
  'OR',
  'PNL',
  'USD',
  'EUR',
  'CASH',
  'NOW',
  'NEW',
  'ONE',
  'TWO',
  'FOR',
  'AND',
  'THE',
  'YOU',
  'API',
  'ETF',
  'IPO',
  'CEO',
  'GDP',
  'CPI',
  'FED',
]);

const TICKER_RE = /^[A-Za-z][A-Za-z0-9.-]{0,11}$/;

/** Resolve a word to a symbol. `explicit` = the phrasing named it as a symbol. */
function resolveTicker(
  word: string,
  ctx: IntentContext,
  explicit: boolean,
): string | null {
  const raw = word.replace(/^\$/, '').replace(/[.,?!]+$/, '');
  if (!TICKER_RE.test(raw)) return null;
  const upper = raw.toUpperCase();
  const known = (ctx.knownTickers ?? []).some((t) => t.toUpperCase() === upper);
  if (known) return upper;
  if (NOT_TICKERS.has(upper)) return null;
  // Unknown symbol: accept it only when the sentence said it was one ("price of
  // ryvyl"), or when the user typed it in caps, which is how people write tickers.
  if (explicit) return upper;
  return raw === upper && upper.length >= 2 && upper.length <= 5 && /^[A-Z]+$/.test(upper)
    ? upper
    : null;
}

/** The account named in the utterance, longest name first so "Main" ⊂ "Main II". */
function resolveAccount(normalized: string, ctx: IntentContext): string | undefined {
  const named = [...(ctx.accountNames ?? [])]
    .filter((n) => n.trim())
    .sort((a, b) => b.length - a.length)
    .find((n) => normalized.includes(normalize(n)));
  return named;
}

function build(tool: string, raw: Record<string, unknown>, rule: string): IntentMatch | null {
  // A rule that produces arguments its own tool rejects is a bug in the rule; fall
  // through to the model rather than send the executor something invalid.
  const v = validateToolArgs(tool, raw);
  if (!v.ok) return null;
  if (findTool(tool)?.kind !== 'read') return null;
  return { tool, args: v.value, rule };
}

const POSITIONS = /\b(what do i own|what i own|positions|holdings|portfolio|danh muc|dang giu|dang nam|co phieu toi|vi the)\b/;

const SUMMARY = /\b(how much cash|cash balance|my cash|free cash|buying power|my equity|account value|portfolio value|portfolio worth|total value|net worth|how am i doing|my performance|my pnl|my p l|total return|my returns|open risk|total risk|drawdown|win rate|tien mat|bao nhieu tien|von|hieu suat|tong lai|tong lo|loi nhuan|rui ro|ty le thang|tong gia tri)\b/;

const ACCOUNTS = /\b(my accounts|list accounts|which accounts|all accounts|how many accounts|cac tai khoan|danh sach tai khoan|tai khoan cua toi)\b/;

const TRANSACTIONS = /\b(my trades|trade history|transaction history|my transactions|recent trades|recent buys|recent sells|closed trades|lich su giao dich|giao dich gan day|cac giao dich|lich su)\b/;

const PRICE_OF = /\b(?:price|quote|last price|how much is|trading at|gia|bao nhieu)\s+(?:of|for|is|cua)?\s*\$?([a-z0-9.-]{1,12})\b/;
// "aapl price" / "aapl quote". Apostrophes are already gone by normalize().
const OF_PRICE = /\b([a-z0-9.-]{1,12})\s+(?:price|quote|gia)\b/;

/**
 * Match an utterance to one read tool, or null to let the model handle it.
 *
 * Order is deliberate in two places. Summary before positions, because "portfolio
 * value" matches both rules and a value question wants one number rather than a
 * table. Price rules last, because a sentence with both a symbol and an
 * account-level question is an account-level question.
 */
export function matchIntent(utterance: string, ctx: IntentContext = {}): IntentMatch | null {
  const norm = normalize(utterance);
  if (!norm) return null;
  if (norm.split(' ').length > MAX_WORDS) return null;
  if (WRITE_VERBS.test(norm)) return null;
  if (NEEDS_THINKING.test(norm)) return null;

  const account = resolveAccount(norm, ctx);
  const scoped = account ? { account } : {};

  if (ACCOUNTS.test(norm)) return build('list_accounts', {}, 'accounts');
  if (TRANSACTIONS.test(norm)) return build('list_transactions', { ...scoped }, 'transactions');
  if (SUMMARY.test(norm)) return build('get_account_summary', { ...scoped }, 'summary');
  if (POSITIONS.test(norm)) return build('list_positions', { ...scoped }, 'positions');

  const explicit = PRICE_OF.exec(norm) ?? OF_PRICE.exec(norm);
  if (explicit?.[1]) {
    const t = resolveTicker(explicit[1], ctx, true);
    if (t) return build('get_quote', { tickers: [t] }, 'price-of');
  }

  // A bare symbol on its own — "NVDA", "$NVDA?", or any symbol already held — is
  // a price question. Lower-case and unheld stays with the model, since "cash" and
  // "risk" are also four-letter words.
  const words = norm.split(' ');
  if (words.length === 1 && words[0]) {
    const t = resolveTicker(utterance.trim(), ctx, false);
    if (t) return build('get_quote', { tickers: [t] }, 'bare-ticker');
  }

  return null;
}
