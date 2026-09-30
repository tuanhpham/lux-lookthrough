/**
 * Changing a portfolio: the mutations the Portfolio tab and the assistant share.
 *
 * ── WHY A PLAN, AND NOT JUST A FUNCTION CALL ────────────────────────────────
 * A write asked for in chat has to be SHOWN to the user before it happens, and what
 * is shown must be what happens — not a sentence the model wrote about it. So a
 * write is built twice over: first as a `WritePlan`, a plain object with every
 * number already resolved (which account, which rate, what lands in the record),
 * and then applied. The approval card renders the plan, `applyWrite` consumes the
 * same plan, and `describeWrite` turns it into one line for the audit log and for
 * the tool result the model reads back. One object, three readers, no chance of the
 * card promising one thing and the store recording another.
 *
 * The planning itself lives in `ai/toolExec.ts`, next to account resolution and the
 * model-facing error strings. This file is the part that touches the portfolio.
 *
 * ── THE RULES IT HAS TO KEEP ────────────────────────────────────────────────
 * 1. `withAccounts` is the only way in, so a write before hydration is refused
 *    rather than persisted over a portfolio that has not finished syncing.
 * 2. A recorded price is ALWAYS in the account's currency. The plan carries both
 *    the number the user said and the number to store, because the difference is
 *    the FX rate on the trade date and the card has to show it.
 * 3. Everything the Buy button does, a chat buy does too: `priceCurrency` and
 *    `fxRateAtBuy` on the lot, the normalised stop and target, `seedPrice` so the
 *    position is not priced at zero until the next Update, and `snapshotNow` so the
 *    equity curve moves today. Parity with the form is the whole standard here — a
 *    lot booked by the assistant must be indistinguishable from a typed one.
 */
import {
  addCashFlow,
  buy,
  computeCash,
  computeEquity,
  computePositionsValue,
  createAccount,
  createOrder,
  sell,
  setStop,
  type AccountState,
  type OrderType,
  setBalance,
  type WealthCurrency,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { accounts, addAccount, today, uuid, withAccounts } from './store.js';
import { loadBook, saveBook } from '../wealth/store.js';
import { accountPrices, seedPrice } from './prices.js';
import { eurUsdForDate, hasEurUsd } from './fx.js';

export type Rating = 'A' | 'B' | 'C' | 'D';

/**
 * Record an equity snapshot for today from the latest known prices, replacing any
 * existing snapshot for the same day.
 *
 * Called after every trade so the equity curve moves immediately — snapshots are
 * otherwise only appended when the user runs Update. With no prices loaded,
 * `computePositionsValue` falls back to cost, which is the same thing the Buy button
 * produces; a snapshot at cost is wrong by the day's PnL, a snapshot at zero would
 * be wrong by the whole position.
 */
export function snapshotNow(st: AccountState): void {
  const p = accountPrices(st.account.id);
  const snap = {
    date: today(),
    equity: computeEquity(st, p),
    cash: computeCash(st),
    positionsValue: computePositionsValue(st, p),
  };
  const i = st.snapshots.findIndex((s) => s.date === snap.date);
  if (i >= 0) st.snapshots[i] = snap;
  else st.snapshots.push(snap);
}

// ── the plan ─────────────────────────────────────────────────────────────────

/** The account a plan acts on, resolved once so the card and the apply agree. */
export interface AccountRef {
  id: string;
  name: string;
  currency: string;
}

/**
 * A price as the user gave it, and as it will be stored.
 *
 * `stored` differs from `given` exactly when the price was quoted in a currency the
 * account does not keep its books in — a USD fill in a EUR account, which is the
 * normal case for a European trading US momentum names. `fx` is the EURUSD rate used
 * (1 EUR = fx USD) and is present only when a conversion happened, so the card can
 * show the arithmetic instead of asking the user to trust it.
 */
export interface PlannedPrice {
  given: number;
  currency: 'EUR' | 'USD';
  stored: number;
  fx?: number;
}

/**
 * Why a stated price cannot be turned into account money.
 *
 * A code rather than a sentence, because the two callers have to say it differently: the
 * assistant needs prose the model can read out and act on, the Trade Planner needs a
 * translated line under its Buy button. One arithmetic, two phrasings.
 */
export type PriceRefusal = { error: 'no-rate' } | { error: 'not-eur-usd' };

/**
 * Work out what a stated price becomes in the account's own currency.
 *
 * REFUSES rather than falling back to a rate of 1. `eurUsdForDate` has to return something
 * for every display path, so it answers 1 when it knows nothing — and "1.00" silently turns a
 * $232.50 fill into a €232.50 cost basis, an error of a tenth of the position that no later
 * screen would flag. A refusal is recoverable: press Update, or give the price in the
 * account's currency.
 *
 * The rate is the one for the TRADE DATE, not today's, which is why a backdated buy needs the
 * date picker to reach this far.
 */
export function plannedPrice(
  accountCurrency: string,
  given: number,
  ccy: 'EUR' | 'USD',
  date: string,
): PlannedPrice | PriceRefusal {
  const known = hasEurUsd() ? eurUsdForDate(date) : undefined;
  if (ccy === accountCurrency) {
    return known ? { given, currency: ccy, stored: given, fx: known } : { given, currency: ccy, stored: given };
  }
  if (!known || !(known > 0)) return { error: 'no-rate' };
  if (accountCurrency === 'EUR' && ccy === 'USD') return { given, currency: ccy, stored: given / known, fx: known };
  if (accountCurrency === 'USD' && ccy === 'EUR') return { given, currency: ccy, stored: given * known, fx: known };
  return { error: 'not-eur-usd' };
}

export type WritePlan =
  | {
      kind: 'create_account';
      name: string;
      initialCapital: number;
      currency: 'EUR' | 'USD';
      description?: string;
    }
  | {
      kind: 'record_buy';
      account: AccountRef;
      ticker: string;
      shares: number;
      price: PlannedPrice;
      date: string;
      stop?: PlannedPrice;
      target?: PlannedPrice;
      setupType?: string;
      rating?: Rating;
      note?: string;
      /** shares × stored price, in the account currency. Shown, never stored. */
      cost: number;
    }
  | {
      kind: 'record_sell';
      account: AccountRef;
      ticker: string;
      shares: number;
      price: PlannedPrice;
      date: string;
      note?: string;
      /** Open shares before the sale, so the card can say "of 15". */
      held: number;
      proceeds: number;
    }
  | {
      kind: 'set_stop';
      account: AccountRef;
      ticker: string;
      stop: PlannedPrice;
      /** How many open lots the new stop lands on. */
      lots: number;
      /** What those lots have now, in the account currency, when they all agree. */
      previous?: number;
    }
  | {
      kind: 'record_cash_flow';
      account: AccountRef;
      /** Signed, in the account's currency: positive in, negative out. */
      amount: number;
      date: string;
      note?: string;
    }
  | {
      kind: 'place_order';
      account: AccountRef;
      ticker: string;
      type: OrderType;
      threshold: PlannedPrice;
      shares: number;
      date: string;
    }
  | {
      /**
       * A Financial Status reading — NOT a portfolio write. Its account lives in the
       * `wealth` book, so it carries its own ref rather than an `AccountRef`, and
       * `applyWrite` routes it around `withAccounts` entirely.
       */
      kind: 'record_balance';
      wealthAccount: { id: string; name: string; currency: WealthCurrency };
      /** The balance itself, in the account's own currency. Zero and negative are real. */
      amount: number;
      date: string;
      note?: string;
      /** The latest reading before this one, so the card can show old → new. */
      previous?: { date: string; amount: number };
      /** A reading already exists on `date`; accepting overwrites it. */
      replaces?: boolean;
    };

/** The tool name a plan came from — what the audit log and the chips record. */
export function planTool(plan: WritePlan): string {
  return plan.kind;
}

// ── applying ─────────────────────────────────────────────────────────────────

function byId(list: readonly AccountState[], id: string): AccountState {
  const st = list.find((a) => a.account.id === id);
  // The plan was built from the same live array moments ago; a miss means the
  // account was deleted in between, which is a refusal rather than a guess.
  if (!st) throw new Error('that account no longer exists');
  return st;
}

/** What a completed write can tell its caller. Empty for the kinds that create nothing. */
export interface WriteResult {
  /**
   * The lot a `record_buy` created.
   *
   * Threaded out because it is the key a plan snapshot is stored under — the Trade Planner's
   * Buy freezes the plan against the lot it just bought, and the lot's id is the only handle
   * on it. There is no other way to identify it afterwards: two buys of the same ticker on
   * the same day at the same price are two legitimate lots.
   */
  lotId?: string;
}

/**
 * Apply an approved plan and persist it.
 *
 * Throws on refusal (not hydrated, account gone, not enough shares) — the caller
 * turns that into a tool error the model can read out. Nothing is written unless the
 * whole mutation succeeds, because `withAccounts` only saves after `mutate` returns.
 */
export async function applyWrite(ctx: AppContext, plan: WritePlan): Promise<WriteResult> {
  if (plan.kind === 'record_balance') {
    // The wealth book has its own hydration guard: `saveBook` throws before the
    // store is hydrated, the same refusal `withAccounts` gives a portfolio write.
    const book = await loadBook(ctx);
    const next = setBalance(
      book,
      {
        accountId: plan.wealthAccount.id,
        date: plan.date,
        amount: plan.amount,
        ...(plan.note ? { note: plan.note } : {}),
      },
      uuid,
    );
    await saveBook(ctx, next);
    await appendAudit(ctx, plan);
    announce();
    return {};
  }
  const result = await withAccounts(ctx, (list): WriteResult => {
    switch (plan.kind) {
      case 'create_account': {
        addAccount(
          createAccount(
            {
              name: plan.name,
              initialCapital: plan.initialCapital,
              currency: plan.currency,
              createdAt: today(),
              ...(plan.description ? { description: plan.description } : {}),
            },
            uuid,
          ),
        );
        break;
      }
      case 'record_buy': {
        const st = byId(list, plan.account.id);
        const lot = buy(
          st,
          {
            ticker: plan.ticker,
            buyDate: plan.date,
            buyPrice: plan.price.stored,
            shares: plan.shares,
            stop: plan.stop?.stored,
            target: plan.target?.stored,
            reason: plan.note,
            setupType: plan.setupType,
            rating: plan.rating,
            // Kept on the lot the way the Buy button keeps them: the currency the
            // user quoted and the rate used, so the trade can be read back in the
            // terms it was made in rather than only in account euros.
            priceCurrency: plan.price.currency,
            fxRateAtBuy: plan.price.fx ?? 1,
          },
          uuid,
        );
        seedPrice(st.account.id, lot.ticker, plan.price.stored);
        snapshotNow(st);
        return { lotId: lot.id };
      }
      case 'record_sell': {
        const st = byId(list, plan.account.id);
        const recs = sell(
          st,
          {
            ticker: plan.ticker,
            sellDate: plan.date,
            sellPrice: plan.price.stored,
            shares: plan.shares,
          },
          uuid,
        );
        for (const r of recs) {
          r.priceCurrency = plan.price.currency;
          r.fxRateAtSell = plan.price.fx ?? 1;
          if (plan.note) r.note = plan.note;
        }
        seedPrice(st.account.id, plan.ticker, plan.price.stored);
        snapshotNow(st);
        break;
      }
      case 'set_stop': {
        const st = byId(list, plan.account.id);
        for (const lot of st.lots) {
          if (lot.ticker === plan.ticker && lot.remainingShares > 0) {
            setStop(st, lot.id, plan.stop.stored);
          }
        }
        break;
      }
      case 'record_cash_flow': {
        const st = byId(list, plan.account.id);
        addCashFlow(
          st,
          { date: plan.date, amount: plan.amount, ...(plan.note ? { note: plan.note } : {}) },
          uuid,
        );
        snapshotNow(st);
        break;
      }
      case 'place_order': {
        const st = byId(list, plan.account.id);
        createOrder(
          st,
          {
            ticker: plan.ticker,
            type: plan.type,
            threshold: plan.threshold.stored,
            shares: plan.shares,
            createdDate: plan.date,
          },
          uuid,
        );
        break;
      }
    }
    return {};
  });
  await appendAudit(ctx, plan);
  announce();
  return result;
}

// ── telling the rest of the app ──────────────────────────────────────────────
//
// A separate notifier from `onPortfolioChange`, on purpose. That one fires on every
// save, including the Portfolio tab's own ~40 write sites, each of which already
// redraws itself — subscribing the tab there would double every repaint. This fires
// only for a write the tab did not make, which is exactly when it needs telling.

const listeners: Array<() => void> = [];

/** Called after an approved assistant write has been saved. */
export function onAgentWrite(cb: () => void): void {
  listeners.push(cb);
}

function announce(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* a listener must never turn a completed write into a failure */
    }
  }
}

// ── describing ───────────────────────────────────────────────────────────────

const SYM: Record<string, string> = { EUR: '€', USD: '$', CNY: '¥' };
const money = (n: number, ccy: string): string =>
  ccy === 'VND'
    ? // Dong has no minor unit, and a symbol-less prefix would read as dollars.
      `${Math.round(n).toLocaleString('en-US')} ₫`
    : `${SYM[ccy] ?? ''}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * One line describing a plan, for the audit log and for the result the model reads.
 *
 * Deliberately symbol-and-ticker shaped rather than translated: it is stored in the
 * log, so it would otherwise be frozen in whichever language the app happened to be
 * in when the trade was booked. `BUY 15 AAPL @ $232.50` reads the same either way,
 * and the approval card — the thing a user actually has to understand before
 * accepting — is fully translated.
 */
export function describeWrite(plan: WritePlan): string {
  switch (plan.kind) {
    case 'create_account':
      return `ACCOUNT "${plan.name}" · ${money(plan.initialCapital, plan.currency)} ${plan.currency}`;
    case 'record_buy': {
      const p = plan.price;
      const conv = p.stored !== p.given ? ` (${money(p.stored, plan.account.currency)})` : '';
      const extras = [
        plan.stop ? `stop ${money(plan.stop.stored, plan.account.currency)}` : '',
        plan.target ? `target ${money(plan.target.stored, plan.account.currency)}` : '',
        plan.setupType ? plan.setupType : '',
        plan.rating ? `rated ${plan.rating}` : '',
      ].filter(Boolean);
      return [
        `BUY ${plan.shares} ${plan.ticker} @ ${money(p.given, p.currency)}${conv}`,
        plan.date,
        plan.account.name,
        ...extras,
      ].join(' · ');
    }
    case 'record_sell': {
      const p = plan.price;
      const conv = p.stored !== p.given ? ` (${money(p.stored, plan.account.currency)})` : '';
      return `SELL ${plan.shares} ${plan.ticker} @ ${money(p.given, p.currency)}${conv} · ${plan.date} · ${plan.account.name}`;
    }
    case 'set_stop':
      return `STOP ${plan.ticker} → ${money(plan.stop.stored, plan.account.currency)} · ${plan.lots} lot(s) · ${plan.account.name}`;
    case 'record_cash_flow': {
      const verb = plan.amount >= 0 ? 'DEPOSIT' : 'WITHDRAW';
      return `${verb} ${money(Math.abs(plan.amount), plan.account.currency)} · ${plan.date} · ${plan.account.name}`;
    }
    case 'record_balance':
      return `BALANCE ${plan.wealthAccount.name} = ${money(plan.amount, plan.wealthAccount.currency)} ${plan.wealthAccount.currency} · ${plan.date}${plan.replaces ? ' (replaces that day)' : ''}`;
    case 'place_order':
      return `ORDER ${plan.type} ${plan.shares} ${plan.ticker} @ ${money(plan.threshold.stored, plan.account.currency)} · ${plan.account.name}`;
  }
}

// ── the audit log ────────────────────────────────────────────────────────────

/**
 * Every write the assistant has made on THIS DEVICE, newest first.
 *
 * Device-local (see `LOCAL_ONLY_PREFIXES` in `adapters/storage.ts`) because it is an
 * append-only list stored under one key: two devices appending different entries
 * would resolve last-write-wins, and the loser's entries would vanish — a log that
 * silently drops records is worse than one that is honestly per-device. The trades
 * themselves sync normally; this is the record of who asked for them.
 */
export interface AuditEntry {
  /** Epoch ms, so the reader can format it in the user's locale. */
  at: number;
  tool: string;
  /** `describeWrite` of the plan that was applied. */
  line: string;
}

const AUDIT_KEY = 'agent_audit';
/** Enough to answer "what did it do this week"; small enough to never matter. */
const AUDIT_MAX = 60;

export async function readAuditLog(ctx: AppContext): Promise<AuditEntry[]> {
  const raw = (await ctx.storage.get<AuditEntry[]>(AUDIT_KEY)) ?? [];
  return Array.isArray(raw) ? raw : [];
}

async function appendAudit(ctx: AppContext, plan: WritePlan): Promise<void> {
  try {
    const list = await readAuditLog(ctx);
    list.unshift({ at: Date.now(), tool: planTool(plan), line: describeWrite(plan) });
    await ctx.storage.set(AUDIT_KEY, list.slice(0, AUDIT_MAX));
  } catch {
    // A full disk must not undo a trade that is already saved. The log is a
    // convenience; the portfolio is the record.
  }
}

/** Open shares of one ticker — what a sell is checked against before the card. */
export function heldShares(st: AccountState, ticker: string): number {
  return st.lots
    .filter((l) => l.ticker === ticker && l.remainingShares > 0)
    .reduce((s, l) => s + l.remainingShares, 0);
}

/** Open lots of one ticker, for `set_stop`'s count and previous value. */
export function openLots(st: AccountState, ticker: string): AccountState['lots'] {
  return st.lots.filter((l) => l.ticker === ticker && l.remainingShares > 0);
}

/** True when a name is already taken — checked before offering to create it. */
export function accountNameTaken(name: string): boolean {
  const wanted = name.trim().toLowerCase();
  return accounts.some((a) => a.account.name.trim().toLowerCase() === wanted);
}
