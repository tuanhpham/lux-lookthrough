/**
 * How much of the account's capital sits behind one ticker.
 *
 * ── WHY THIS IS ITS OWN MODULE ──────────────────────────────────────────────
 * The Calendar's "My event risk" column reported figures like **278% of
 * capital**, which is not a number that can mean anything. The cause was that
 * weights were computed with a PER-ACCOUNT denominator and then summed ACROSS
 * accounts:
 *
 *     for (const acct of accounts) {
 *       const equity = invested + cash;          // this account only
 *       weights.set(sym, prev + costBasis / equity);
 *     }
 *
 * Each account's weights legitimately sum to ~1.0, so four fully-invested
 * accounts sum to ~4.0 — and a day on which holdings from several of them report
 * lands anywhere up to 400%. The percentage silently changed meaning from "share
 * of my money" to "sum of four unrelated fractions".
 *
 * The fix is one shared denominator: every position is measured against the
 * capital of the WHOLE book. That restores the invariant that matters —
 * Σ weights ≤ 1 whenever the book is not over-invested — so the number is
 * comparable across days and readable as a percentage again.
 */
import type { AccountState } from '../types/portfolio.js';
import { computeCash } from './account.js';

export interface CapitalExposure {
  /** SYMBOL (upper-case) → share of total capital, 0–1. */
  weights: Map<string, number>;
  /** SYMBOL (upper-case) → cost basis, in the book's currency. */
  amounts: Map<string, number>;
  /** The single shared denominator every weight was divided by. */
  totalCapital: number;
  /**
   * True when the accounts do not all share one currency.
   *
   * Amounts are then summed across currencies without conversion, so the totals
   * are approximate. Surfaced rather than silently corrected: this module has no
   * FX rates, and quietly adding EUR to USD would be a worse lie than saying so.
   */
  mixedCurrency: boolean;
}

/**
 * Cost-basis exposure per ticker across every account, against ONE denominator.
 *
 * Cost basis (`buyPrice × remainingShares`) rather than market value, so the
 * weight does not drift with the quote — "how much capital did I commit to this"
 * is the question an event-risk table is asking.
 *
 * Capital = open cost basis + cash, summed over all accounts. Cash is included
 * SIGNED: a negative balance (over-invested, or a data-entry slip) shrinks the
 * denominator and pushes weights above 100%, which is the honest answer. The
 * previous code clamped it with `Math.max(0, cash)`, which hid exactly the state
 * a risk table exists to reveal.
 *
 * Weights are NOT clamped to 1 either. A total above 100% means the book really
 * is over-committed; capping it would turn a warning into a shrug.
 */
export function capitalExposure(accounts: readonly AccountState[]): CapitalExposure {
  const amounts = new Map<string, number>();
  let totalCapital = 0;
  const currencies = new Set<string>();

  for (const acct of accounts) {
    currencies.add(acct.account.currency);
    const open = acct.lots.filter((l) => l.remainingShares > 0);
    let invested = 0;
    for (const l of open) {
      const basis = l.buyPrice * l.remainingShares;
      invested += basis;
      const sym = l.ticker.toUpperCase();
      amounts.set(sym, (amounts.get(sym) ?? 0) + basis);
    }
    totalCapital += invested + computeCash(acct);
  }

  // A zero or negative book has no meaningful denominator: every weight would be
  // 0, Infinity or negative. Report the amounts and no weights, and let the UI
  // say "not enough data" rather than print a nonsense percentage.
  const weights = new Map<string, number>();
  if (totalCapital > 0) {
    for (const [sym, basis] of amounts) weights.set(sym, basis / totalCapital);
  }

  return { weights, amounts, totalCapital, mixedCurrency: currencies.size > 1 };
}
