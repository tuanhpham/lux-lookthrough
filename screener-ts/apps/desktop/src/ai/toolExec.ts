/**
 * Running a tool the assistant asked for, and turning the answer into something a
 * model can read.
 *
 * ── THE ONE RULE ────────────────────────────────────────────────────────────
 * EVERY NUMBER HERE COMES FROM THE SAME PLACE THE PORTFOLIO TABLE READS. Same
 * `store.ts` accounts, same `prices.ts` map, same `computeAccountMetrics` and
 * `buildPositions` from core. Nothing in this file computes a PnL, a weight or a
 * total of its own. If the chat and the table ever disagree, that is a bug in one
 * of those shared pieces and gets fixed once — which is the entire reason the
 * store and the price map were extracted before this file was written.
 *
 * ── WHY THE OUTPUT IS SHAPED THE WAY IT IS ──────────────────────────────────
 * Compact JSON, keys abbreviated, money rounded to 2dp and percentages to 1dp.
 * Every character is an input token on this request AND on every later round of
 * the same turn, so a full-precision dump of 20 positions costs real money for
 * digits no one reads. Rounding happens at the boundary, never in the store.
 *
 * A `PRICES_STALE` note rides along when nothing has been fetched this session,
 * because `buildPositions` falls back to the buy price when it has no quote. The
 * model must know the difference between "flat" and "unpriced" — reporting an
 * unpriced portfolio as break-even is a lie the user would act on.
 *
 * ── WRITES ARE TWO STEPS, NEVER ONE ────────────────────────────────────────
 * `planWrite` resolves everything — which account, which FX rate, what would
 * actually be stored — and returns a plan WITHOUT touching the portfolio. The panel
 * shows that plan as an approval card, and only an accepted plan reaches
 * `applyApprovedWrite`. So a refusal the app can work out for itself (no such
 * account, not enough shares, no exchange rate loaded) comes back to the model as a
 * tool error before the user is ever interrupted, and what the card promises is
 * exactly the object that gets applied.
 *
 * The plan type and the mutations live in `portfolio/writes.ts`; what lives here is
 * account resolution, the currency reading, and the sentences the model reads back.
 */
import {
  buildPositions,
  computeAccountMetrics,
  findTool,
  type AccountState,
  type OrderType,
  type ToolArgs,
} from '@screener/core';
import type { AppContext } from '../context.js';
import {
  accounts,
  activeId,
  active,
  ensureAccountsLoaded,
  OVERVIEW_ID,
  today,
} from '../portfolio/store.js';
import { accountPrices, hasPrices } from '../portfolio/prices.js';
import { ensureEurUsd } from '../portfolio/fx.js';
import { isHydrated } from '../adapters/storage.js';
import {
  accountNameTaken,
  applyWrite,
  describeWrite,
  heldShares,
  openLots,
  plannedPrice,
  type AccountRef,
  type PlannedPrice,
  type Rating,
  type WritePlan,
} from '../portfolio/writes.js';

/** What a tool run produces. `isError` becomes the wire flag on the result block. */
export interface ToolOutcome {
  content: string;
  isError?: boolean;
  /**
   * The same payload before serialisation, for the Tier-0 path only.
   *
   * A locally-answered question never reaches a model, so something has to turn the
   * payload into a sentence — `localAnswer.ts` does, from this. The model always
   * gets `content`, so there is exactly one set of numbers either way.
   */
  data?: unknown;
}

const ok = (data: unknown): ToolOutcome => ({ content: JSON.stringify(data), data });
const fail = (message: string): ToolOutcome => ({ content: message, isError: true });

/** 2dp for money, 1dp for percentages — the precision the app itself displays. */
const m2 = (n: number): number => Math.round(n * 100) / 100;
const p1 = (n: number): number => Math.round(n * 10) / 10;

// ── account resolution ───────────────────────────────────────────────────────

/**
 * Which account a tool call means.
 *
 * No `account` argument means the one open in the app — the prompt tells the model
 * to omit it, so this is the common path. A name is matched exact-first, then
 * prefix, then substring, all case-insensitively, because a model retyping
 * "Main Growth" as "main growth" should not fail.
 *
 * AMBIGUITY IS AN ERROR, NOT A GUESS. Two accounts matching "main" means picking
 * one would silently answer about the wrong portfolio; the message lists the
 * candidates so the model's next call can be exact.
 */
function resolveAccount(name: string | undefined): AccountState | { error: string } {
  if (!accounts.length) return { error: 'There are no accounts yet.' };
  if (!name) {
    // Overview is a view, not an account: metrics are per-account, so the first one
    // is the only defensible default and `active()` already implements that choice.
    return active();
  }
  const wanted = name.trim().toLowerCase();
  const exact = accounts.filter((a) => a.account.name.toLowerCase() === wanted);
  const starts = accounts.filter((a) => a.account.name.toLowerCase().startsWith(wanted));
  const has = accounts.filter((a) => a.account.name.toLowerCase().includes(wanted));
  const hits = exact.length ? exact : starts.length ? starts : has;

  if (!hits.length) {
    return {
      error: `No account named "${name}". Existing accounts: ${accounts
        .map((a) => a.account.name)
        .join(', ')}.`,
    };
  }
  if (hits.length > 1) {
    return {
      error: `"${name}" matches more than one account: ${hits
        .map((a) => a.account.name)
        .join(', ')}. Ask which one, or pass the full name.`,
    };
  }
  return hits[0]!;
}

/** Read a validated argument as a string, since the bag is flat. */
const str = (args: ToolArgs, key: string): string | undefined => {
  const v = args[key];
  return v === undefined ? undefined : String(v);
};

// ── the read tools ───────────────────────────────────────────────────────────

function listAccounts(): ToolOutcome {
  if (!accounts.length) return ok({ accounts: [] });
  return ok({
    accounts: accounts.map((a) => ({
      name: a.account.name,
      currency: a.account.currency,
      initialCapital: m2(a.account.initialCapital),
      openInApp: a.account.id === activeId() || (activeId() === OVERVIEW_ID && a === accounts[0]),
      openPositions: new Set(a.lots.filter((l) => l.remainingShares > 0).map((l) => l.ticker)).size,
      since: a.account.createdAt,
    })),
    // Said explicitly: a model that sees several accounts and no marker starts
    // asking which one, every turn.
    viewingOverview: activeId() === OVERVIEW_ID,
  });
}

function accountSummary(args: ToolArgs): ToolOutcome {
  const found = resolveAccount(str(args, 'account'));
  if ('error' in found) return fail(found.error);
  const st = found;
  const prices = accountPrices(st.account.id);
  const met = computeAccountMetrics(st, prices);
  return ok({
    account: st.account.name,
    currency: st.account.currency,
    cash: m2(met.cash),
    equity: m2(met.equity),
    positionsValue: m2(met.positionsValue),
    initialCapital: m2(met.initialCapital),
    netCashFlow: m2(met.netCashFlow),
    contributedCapital: m2(met.contributedCapital),
    totalPnL: m2(met.totalPnL),
    totalPnLPct: p1(met.totalPnLPct),
    twrPct: p1(met.twrPct),
    twrAnnualizedPct: p1(met.twrAnnualizedPct),
    unrealizedPnL: m2(met.unrealizedPnL),
    realizedPnL: m2(met.realizedPnL),
    openRisk: m2(met.totalOpenRiskEur),
    openRiskPctOfEquity: p1(met.totalOpenRiskPct),
    positionsWithoutStop: met.openPositionsWithoutStop,
    maxDrawdownPct: p1(met.maxDrawdownPct),
    winRate: p1(met.winRate * 100),
    avgRMultiple: Math.round(met.avgRMultiple * 100) / 100,
    expectancy: m2(met.expectancy),
    openTrades: met.openTradeCount,
    closedTrades: met.closedTradeCount,
    ...staleNote(st),
  });
}

function listPositions(args: ToolArgs): ToolOutcome {
  const found = resolveAccount(str(args, 'account'));
  if ('error' in found) return fail(found.error);
  const st = found;
  const prices = accountPrices(st.account.id);
  const rows = buildPositions(st, prices, today());
  if (!rows.length) {
    return ok({ account: st.account.name, positions: [], note: 'No open positions.' });
  }
  return ok({
    account: st.account.name,
    currency: st.account.currency,
    positions: rows.map((p) => ({
      ticker: p.ticker,
      shares: p.shares,
      avgCost: m2(p.avgCost),
      lastPrice: m2(p.lastPrice),
      marketValue: m2(p.marketValue),
      unrealizedPnL: m2(p.unrealizedPnL),
      unrealizedPnLPct: p1(p.unrealizedPnLPct),
      ...(p.stop === undefined ? { stop: null } : { stop: m2(p.stop) }),
      ...(p.target === undefined ? {} : { target: m2(p.target) }),
      // Distinct from "no stop": the stop is above entry, so this position can no
      // longer lose money. Collapsing both to 0 risk would hide the difference.
      ...(p.riskFree ? { riskFree: true, lockedInProfit: m2(p.lockedInProfit ?? 0) } : {}),
      ...(p.riskEur === undefined ? {} : { risk: m2(p.riskEur) }),
      ...(p.rMultiple === undefined ? {} : { rMultiple: Math.round(p.rMultiple * 100) / 100 }),
      ...(p.distanceToStopPct === undefined ? {} : { pctAboveStop: p1(p.distanceToStopPct) }),
      weightPct: p1(p.concentrationPct),
      daysHeld: p.daysHeld,
    })),
    ...staleNote(st),
  });
}

/** Newest first, capped — a full history would swamp the context on old accounts. */
function listTransactions(args: ToolArgs): ToolOutcome {
  const found = resolveAccount(str(args, 'account'));
  if ('error' in found) return fail(found.error);
  const st = found;
  const wantTicker = str(args, 'ticker')?.toUpperCase();
  const limit = Math.min(Number(args['limit'] ?? 25) || 25, 200);

  const buys = st.lots.map((l) => ({
    kind: 'BUY' as const,
    date: l.buyDate,
    ticker: l.ticker,
    shares: l.shares,
    price: m2(l.buyPrice),
    ...(l.remainingShares !== l.shares ? { remaining: l.remainingShares } : {}),
    ...(l.stop === undefined ? {} : { stop: m2(l.stop) }),
    ...(l.setupType ? { setup: l.setupType } : {}),
  }));
  const sells = st.sells.map((s) => ({
    kind: 'SELL' as const,
    date: s.sellDate,
    ticker: s.ticker,
    shares: s.shares,
    price: m2(s.sellPrice),
    realizedPnL: m2(s.realizedPnL),
  }));
  const all = [...buys, ...sells]
    .filter((t) => !wantTicker || t.ticker === wantTicker)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return ok({
    account: st.account.name,
    currency: st.account.currency,
    // Reported so the model can say "your 25 most recent" instead of implying the
    // account only ever had 25 trades.
    total: all.length,
    returned: Math.min(all.length, limit),
    transactions: all.slice(0, limit),
    ...(st.cashFlows?.length
      ? {
          cashFlows: st.cashFlows
            .slice()
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .slice(0, 20)
            .map((c) => ({ date: c.date, amount: m2(c.amount) })),
        }
      : {}),
  });
}

/**
 * Live quotes. The only tool that touches the network, and the reason the prompt
 * can forbid quoting a price from memory.
 *
 * One symbol failing does not fail the call — a wrong ticker in a list of five
 * should still answer for the other four, and the model needs to see WHICH one it
 * got wrong to correct itself.
 */
async function getQuote(ctx: AppContext, args: ToolArgs): Promise<ToolOutcome> {
  const tickers = String(args['tickers'] ?? '')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  if (!tickers.length) return fail('No symbols to quote.');

  const quotes = await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const { bars } = await ctx.data.getOHLCV(ticker, '6mo');
        const last = bars[bars.length - 1];
        if (!last) return { ticker, error: 'no price data' };
        const back = (n: number): number | undefined => bars[bars.length - 1 - n]?.close;
        const chg = (from: number | undefined): number | undefined =>
          from && from > 0 ? p1(((last.close - from) / from) * 100) : undefined;
        const highs = bars.slice(-252).map((b) => b.high);
        const high = Math.max(...highs);
        return {
          ticker,
          price: m2(last.close),
          asOf: last.date,
          dayChangePct: chg(back(1)),
          pctChange1w: chg(back(5)),
          pctChange1m: chg(back(21)),
          pctChange3m: chg(back(63)),
          // How a momentum trader locates a price: distance from the recent high,
          // not the raw number. Saves the model a follow-up call.
          pctBelowHigh: high > 0 ? p1(((high - last.close) / high) * 100) : undefined,
          rangeHigh: m2(high),
        };
      } catch (e) {
        return { ticker, error: String(e).slice(0, 120) };
      }
    }),
  );
  return ok({ quotes, note: 'Prices are daily closes from the app data provider.' });
}

/** The warning that keeps "unpriced" from being reported as "flat". */
function staleNote(st: AccountState): Record<string, string> {
  return hasPrices(st.account.id)
    ? {}
    : {
        PRICES_STALE:
          'No prices have been fetched this session, so last price falls back to cost and PnL reads as 0. Say this instead of reporting break-even; the user can press Update on the Portfolio tab.',
      };
}

// ── the write tools: planning ────────────────────────────────────────────────

/** A plan ready for the approval card, or the reason there is none. */
export type PlanResult = { plan: WritePlan } | { error: string };

const accRef = (st: AccountState): AccountRef => ({
  id: st.account.id,
  name: st.account.name,
  currency: st.account.currency,
});

/** Read a validated argument as a number. */
const numArg = (args: ToolArgs, key: string): number | undefined => {
  const v = args[key];
  return typeof v === 'number' ? v : undefined;
};

/**
 * What a stated price becomes in the account's own currency, with the refusal in prose.
 *
 * The arithmetic — and the refusal to convert at a fallback rate of 1, which would silently
 * turn a $232.50 fill into a €232.50 cost basis — lives in `plannedPrice`, shared with the
 * Trade Planner's Buy button so there is one conversion in the app rather than one per screen.
 * What stays here is the wording: the model needs a sentence it can act on, and "press Update
 * on the Portfolio tab first, or give the price in EUR" is the recoverable half of a refusal.
 */
function planPrice(
  acc: AccountRef,
  given: number,
  ccy: 'EUR' | 'USD',
  date: string,
): PlannedPrice | { error: string } {
  const p = plannedPrice(acc.currency, given, ccy, date);
  if (!('error' in p)) return p;
  return {
    error: p.error === 'no-rate'
      ? `No EUR/USD rate is loaded, so a ${ccy} price cannot be recorded in this ${acc.currency} account. Ask the user to press Update on the Portfolio tab first, or to give the price in ${acc.currency}.`
      : `This account is kept in ${acc.currency}, and the app can only convert between EUR and USD. Ask the user for the price in ${acc.currency}.`,
  };
}

/**
 * Turn a validated write call into a plan, or into the reason it cannot be one.
 *
 * Nothing here mutates anything. The two `ensure…` calls only fill in state this
 * session may not have loaded yet: the accounts themselves (the Portfolio tab may
 * never have been opened) and the cached EUR/USD bars. Neither fetches — a chat
 * message must not start a market-data download.
 */
export async function planWrite(
  ctx: AppContext,
  toolName: string,
  args: ToolArgs,
): Promise<PlanResult> {
  await ensureAccountsLoaded(ctx);
  await ensureEurUsd(ctx);

  // Checked before the card rather than at apply time: being told "still syncing"
  // after approving a trade is a worse experience than being told before.
  if (!isHydrated()) {
    return {
      error:
        'The portfolio has not finished syncing on this device, so nothing can be written yet. Tell the user to try again in a few seconds.',
    };
  }

  const date = str(args, 'date') ?? today();
  const ccy = ((str(args, 'priceCurrency') ?? 'USD') as 'EUR' | 'USD');

  if (toolName === 'create_account') {
    const name = str(args, 'name')!;
    if (accountNameTaken(name)) {
      return {
        error: `An account named "${name}" already exists. Ask the user whether they meant that one, or a different name.`,
      };
    }
    return {
      plan: {
        kind: 'create_account',
        name,
        initialCapital: numArg(args, 'initialCapital') ?? 0,
        currency: (str(args, 'currency') ?? 'EUR') as 'EUR' | 'USD',
        ...(str(args, 'description') ? { description: str(args, 'description')! } : {}),
      },
    };
  }

  const found = resolveAccount(str(args, 'account'));
  if ('error' in found) return { error: found.error };
  const st = found;
  const acc = accRef(st);

  switch (toolName) {
    case 'record_buy': {
      const price = planPrice(acc, numArg(args, 'price')!, ccy, date);
      if ('error' in price) return price;
      const shares = numArg(args, 'shares')!;
      const stopRaw = numArg(args, 'stop');
      const targetRaw = numArg(args, 'target');
      // Stop and target ride on the same currency flag as the fill, exactly as they
      // do in the Buy form where one selector governs all three fields.
      const stop = stopRaw === undefined ? undefined : planPrice(acc, stopRaw, ccy, date);
      const target = targetRaw === undefined ? undefined : planPrice(acc, targetRaw, ccy, date);
      if (stop && 'error' in stop) return stop;
      if (target && 'error' in target) return target;
      if (stopRaw !== undefined && stopRaw >= numArg(args, 'price')!) {
        return {
          error: `A stop at ${stopRaw} is at or above the entry at ${numArg(args, 'price')}. Ask the user to confirm the stop — a buy stop belongs below the entry.`,
        };
      }
      return {
        plan: {
          kind: 'record_buy',
          account: acc,
          ticker: str(args, 'ticker')!,
          shares,
          price,
          date,
          ...(stop ? { stop } : {}),
          ...(target ? { target } : {}),
          ...(str(args, 'setupType') ? { setupType: str(args, 'setupType')! } : {}),
          ...(str(args, 'rating') ? { rating: str(args, 'rating') as Rating } : {}),
          ...(str(args, 'note') ? { note: str(args, 'note')! } : {}),
          cost: shares * price.stored,
        },
      };
    }
    case 'record_sell': {
      const price = planPrice(acc, numArg(args, 'price')!, ccy, date);
      if ('error' in price) return price;
      const ticker = str(args, 'ticker')!;
      const shares = numArg(args, 'shares')!;
      const held = heldShares(st, ticker);
      // Checked here so an impossible sell never becomes a card the user has to
      // decline. `sell()` would throw the same thing at apply time.
      if (held <= 0) {
        return {
          error: `There is no open position in ${ticker} in "${acc.name}", so there is nothing to sell.`,
        };
      }
      if (shares > held) {
        return {
          error: `Only ${held} share(s) of ${ticker} are open in "${acc.name}", and the call asked to sell ${shares}. Ask the user which number is right.`,
        };
      }
      return {
        plan: {
          kind: 'record_sell',
          account: acc,
          ticker,
          shares,
          price,
          date,
          ...(str(args, 'note') ? { note: str(args, 'note')! } : {}),
          held,
          proceeds: shares * price.stored,
        },
      };
    }
    case 'set_stop': {
      const ticker = str(args, 'ticker')!;
      const lots = openLots(st, ticker);
      if (!lots.length) {
        return {
          error: `There is no open position in ${ticker} in "${acc.name}", so there is no stop to move.`,
        };
      }
      const stop = planPrice(acc, numArg(args, 'stop')!, ccy, date);
      if ('error' in stop) return stop;
      const stops = new Set(lots.map((l) => l.stop));
      const previous = stops.size === 1 ? [...stops][0] : undefined;
      return {
        plan: {
          kind: 'set_stop',
          account: acc,
          ticker,
          stop,
          lots: lots.length,
          ...(previous === undefined ? {} : { previous }),
        },
      };
    }
    case 'record_cash_flow': {
      return {
        plan: {
          kind: 'record_cash_flow',
          account: acc,
          amount: numArg(args, 'amount')!,
          date,
          ...(str(args, 'note') ? { note: str(args, 'note')! } : {}),
        },
      };
    }
    case 'place_order': {
      const ticker = str(args, 'ticker')!;
      const type = str(args, 'type') as OrderType;
      const shares = numArg(args, 'shares')!;
      const threshold = planPrice(acc, numArg(args, 'threshold')!, ccy, date);
      if ('error' in threshold) return threshold;
      if (type !== 'BUY_STOP') {
        const held = heldShares(st, ticker);
        if (shares > held) {
          return {
            error: `A ${type} order exits a position, and only ${held} share(s) of ${ticker} are open in "${acc.name}". Ask the user what they meant.`,
          };
        }
      }
      return {
        plan: { kind: 'place_order', account: acc, ticker, type, threshold, shares, date },
      };
    }
    default:
      return { error: `No executor for ${toolName}.` };
  }
}

/**
 * Apply a plan the user accepted, and tell the model what happened.
 *
 * `describeWrite` is the same line the audit log stores and the same numbers the card
 * showed, so the model reports what was recorded rather than what it proposed.
 */
export async function applyApprovedWrite(ctx: AppContext, plan: WritePlan): Promise<ToolOutcome> {
  try {
    await applyWrite(ctx, plan);
  } catch (e) {
    return fail(`Nothing was recorded: ${String((e as Error).message ?? e).slice(0, 200)}`);
  }
  const extra =
    plan.kind === 'create_account'
      ? ' It is not the account currently open in the app, so pass its name explicitly when acting on it.'
      : '';
  return {
    content: `Done — the user accepted and this is now saved: ${describeWrite(plan)}.${extra}`,
  };
}

/** The result for a plan the user turned down. */
export function declinedWrite(plan: WritePlan): ToolOutcome {
  return {
    content: `The user DECLINED this change, so nothing was recorded: ${describeWrite(plan)}. Do not call the same tool again with the same arguments — ask them what to change.`,
    isError: true,
  };
}

// ── dispatch ─────────────────────────────────────────────────────────────────

/**
 * Run one read tool. Never throws: a rejected promise here would abandon a turn
 * mid-transcript, leaving a tool call with no result — which both APIs reject on
 * the next request. Every failure comes back as an error RESULT instead.
 */
export async function execRead(
  ctx: AppContext,
  toolName: string,
  args: ToolArgs,
): Promise<ToolOutcome> {
  const def = findTool(toolName);
  if (!def) return fail(`Unknown tool: ${toolName}`);
  if (def.kind !== 'read') {
    return fail(
      `${toolName} is a write tool and was not offered on this turn — this panel only records changes it can show the user an approval card for. Tell the user to make this change on the Portfolio tab.`,
    );
  }
  // The portfolio is loaded by the Portfolio TAB, which the user may not have opened
  // in this session. Without this, every read here answered "there are no accounts"
  // to someone with four of them.
  await ensureAccountsLoaded(ctx);
  try {
    switch (toolName) {
      case 'list_accounts':
        return listAccounts();
      case 'get_account_summary':
        return accountSummary(args);
      case 'list_positions':
        return listPositions(args);
      case 'list_transactions':
        return listTransactions(args);
      case 'get_quote':
        return await getQuote(ctx, args);
      default:
        return fail(`No executor for ${toolName}.`);
    }
  } catch (e) {
    return fail(`${toolName} failed: ${String(e).slice(0, 200)}`);
  }
}
