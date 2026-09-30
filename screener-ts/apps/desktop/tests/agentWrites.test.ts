/**
 * Recording a trade from a chat message: the PLAN, and what applying one stores.
 *
 * The rules being pinned here are the ones where a silent mistake is expensive and
 * invisible afterwards:
 *   • A dollar price going into a euro account must be divided by the rate ON THE
 *     TRADE DATE, and must be REFUSED when no rate is loaded. A rate of 1 turns a
 *     $232.50 fill into a €232.50 cost basis — a tenth of the position, wrong forever,
 *     and no screen downstream can tell.
 *   • Planning writes nothing. The approval card is shown from a plan, and a user who
 *     declines must leave the portfolio exactly as it was.
 *   • An approved buy has to land the way the Buy FORM lands it, field for field:
 *     `buyPrice` already converted, `priceCurrency` saying what was quoted and
 *     `fxRateAtBuy` saying what it was converted at. Store the price in dollars with
 *     the currency flag set and the app divides a second time on every render.
 *   • An impossible change (sell 40 of 15, stop above entry) is refused BEFORE the
 *     card, so the user is never asked to approve something that cannot happen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAccount, buy, validateToolArgs, type AccountState, type Bar, type Storage, type ToolArgs } from '@screener/core';

// Both `storage.ts` and `syncClient.ts` reach for localStorage at import time, and a
// node run has none. Nothing here needs a real one.
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  key: () => null,
  length: 0,
};

/** Storage enough for these modules: get, set, list, delete. */
class Mem implements Storage {
  map = new Map<string, unknown>();
  writes: string[] = [];
  async get<T>(k: string): Promise<T | null> {
    return (this.map.get(k) as T) ?? null;
  }
  async set<T>(k: string, v: T): Promise<void> {
    this.writes.push(k);
    this.map.set(k, JSON.parse(JSON.stringify(v)));
  }
  async list(prefix = ''): Promise<string[]> {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }
  async delete(k: string): Promise<void> {
    this.map.delete(k);
  }
}

const id = (() => {
  let n = 0;
  return () => `id${++n}`;
})();

/** EURUSD daily closes, as the Portfolio tab caches them. */
const FX_BARS: Bar[] = [
  { date: '2026-09-17', open: 1.1, high: 1.1, low: 1.1, close: 1.1, volume: 0 },
  { date: '2026-09-18', open: 1.25, high: 1.25, low: 1.25, close: 1.25, volume: 0 },
];

/**
 * A EUR account holding 15 AAPL, and a second USD account.
 *
 * Two accounts on purpose: a plan has to name the one it resolved, and a single-account
 * fixture would pass whether or not the name was ever read.
 */
function seedAccounts(): AccountState[] {
  const eur = createAccount(
    { name: 'TA Trade Republic', initialCapital: 50000, currency: 'EUR', createdAt: '2026-01-02' },
    id,
  );
  buy(eur, { ticker: 'AAPL', buyDate: '2026-03-02', buyPrice: 180, shares: 15, stop: 165 }, id);
  const usd = createAccount(
    { name: 'TA IBKR', initialCapital: 20000, currency: 'USD', createdAt: '2026-01-02' },
    id,
  );
  return [eur, usd];
}

/**
 * A fresh copy of every module involved.
 *
 * `store.ts`, `fx.ts` and `storage.ts` all keep session state at module scope — the
 * account list, the rate table, the hydration gate. That is right for an app with one
 * portfolio and one device, and it means a test needs new modules rather than a reset
 * hook wired into shipping code. `withFx: false` leaves the rate table empty, which is
 * the state a session has when the Portfolio tab was never opened.
 */
async function load({ withFx = true, hydrate = true } = {}) {
  vi.resetModules();
  const mem = new Mem();
  mem.map.set('accounts', JSON.parse(JSON.stringify(seedAccounts())));
  if (withFx) mem.map.set('pf_eurusd_bars', FX_BARS);
  const ctx = { storage: mem } as unknown as import('../src/context.js').AppContext;

  const storage = await import('../src/adapters/storage.js');
  if (hydrate) storage.openSyncGate();
  const toolExec = await import('../src/ai/toolExec.js');
  const writes = await import('../src/portfolio/writes.js');
  const store = await import('../src/portfolio/store.js');
  return { ctx, mem, ...toolExec, readAuditLog: writes.readAuditLog, store };
}

/** Validate a call the way the agent does, then hand the plan the same bag. */
const args = (tool: string, bag: Record<string, unknown>): ToolArgs => {
  const v = validateToolArgs(tool, bag);
  if (!v.ok) throw new Error(`fixture is not a valid call: ${JSON.stringify(v.issues)}`);
  return v.value;
};

const buyBag = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  account: 'TA Trade Republic',
  ticker: 'AAPL',
  shares: 10,
  price: 232.5,
  date: '2026-09-18',
  ...over,
});

describe('planWrite — the currency of a dictated price', () => {
  it('divides a dollar price by the rate on the trade date, keeping both numbers', async () => {
    const { ctx, planWrite } = await load();
    const res = await planWrite(ctx, 'record_buy', args('record_buy', buyBag()));
    expect('plan' in res).toBe(true);
    if (!('plan' in res) || res.plan.kind !== 'record_buy') throw new Error('not a buy plan');
    const { plan } = res;
    expect(plan.account.name).toBe('TA Trade Republic');
    // 1.25 is the 18th's close, NOT the latest-known 1.1: a trade booked on a past
    // date is converted at that day's rate, exactly as the Buy form does it.
    expect(plan.price).toEqual({ given: 232.5, currency: 'USD', stored: 232.5 / 1.25, fx: 1.25 });
    expect(plan.cost).toBeCloseTo(1860, 6);
  });

  it('takes a price already in the account currency as it stands', async () => {
    const { ctx, planWrite } = await load();
    const res = await planWrite(
      ctx,
      'record_buy',
      args('record_buy', buyBag({ price: 200, priceCurrency: 'EUR' })),
    );
    if (!('plan' in res) || res.plan.kind !== 'record_buy') throw new Error('not a buy plan');
    expect(res.plan.price.stored).toBe(200);
    expect(res.plan.price.given).toBe(200);
  });

  it('carries the stop and the target in the same currency as the fill', async () => {
    const { ctx, planWrite } = await load();
    const res = await planWrite(
      ctx,
      'record_buy',
      args('record_buy', buyBag({ stop: 212.5, target: 275 })),
    );
    if (!('plan' in res) || res.plan.kind !== 'record_buy') throw new Error('not a buy plan');
    expect(res.plan.stop?.stored).toBe(212.5 / 1.25);
    expect(res.plan.target?.stored).toBe(275 / 1.25);
  });

  it('REFUSES a dollar price when no rate is loaded, rather than using 1', async () => {
    // The whole reason `hasEurUsd` exists. A plan built at a rate of 1 would show the
    // user "€232.50" on the card, look right, and be 10% wrong for the life of the lot.
    const { ctx, planWrite } = await load({ withFx: false });
    const res = await planWrite(ctx, 'record_buy', args('record_buy', buyBag()));
    if (!('error' in res)) throw new Error('should have refused');
    expect(res.error).toMatch(/No EUR\/USD rate is loaded/);
    expect(res.error).toMatch(/press Update/);
  });

  it('still records a euro price into a euro account with no rate at all', async () => {
    const { ctx, planWrite } = await load({ withFx: false });
    const res = await planWrite(
      ctx,
      'record_buy',
      args('record_buy', buyBag({ price: 200, priceCurrency: 'EUR' })),
    );
    if (!('plan' in res) || res.plan.kind !== 'record_buy') throw new Error('not a buy plan');
    expect(res.plan.price.stored).toBe(200);
    // No rate was involved, so the card must not print one.
    expect(res.plan.price.fx).toBeUndefined();
  });

  it('multiplies the other way round for a euro price in a dollar account', async () => {
    const { ctx, planWrite } = await load();
    const res = await planWrite(
      ctx,
      'record_buy',
      args('record_buy', buyBag({ account: 'TA IBKR', price: 100, priceCurrency: 'EUR' })),
    );
    if (!('plan' in res) || res.plan.kind !== 'record_buy') throw new Error('not a buy plan');
    expect(res.plan.account.currency).toBe('USD');
    expect(res.plan.price.stored).toBe(125);
  });
});

describe('planWrite — what it refuses before showing a card', () => {
  it('refuses a stop at or above the entry', async () => {
    const { ctx, planWrite } = await load();
    const res = await planWrite(ctx, 'record_buy', args('record_buy', buyBag({ stop: 240 })));
    if (!('error' in res)) throw new Error('should have refused');
    expect(res.error).toMatch(/at or above the entry/);
  });

  it('refuses to sell more than is open, and says how many there are', async () => {
    const { ctx, planWrite } = await load();
    const res = await planWrite(
      ctx,
      'record_sell',
      args('record_sell', { account: 'TA Trade Republic', ticker: 'AAPL', shares: 40, price: 250 }),
    );
    if (!('error' in res)) throw new Error('should have refused');
    expect(res.error).toMatch(/Only 15 share/);
  });

  it('refuses a sell in an account that holds none of it', async () => {
    const { ctx, planWrite } = await load();
    const res = await planWrite(
      ctx,
      'record_sell',
      args('record_sell', { account: 'TA IBKR', ticker: 'AAPL', shares: 1, price: 250 }),
    );
    if (!('error' in res)) throw new Error('should have refused');
    expect(res.error).toMatch(/no open position/);
  });

  it('names the accounts back when the one asked for does not exist', async () => {
    const { ctx, planWrite } = await load();
    const res = await planWrite(ctx, 'record_buy', args('record_buy', buyBag({ account: 'Fidelity' })));
    if (!('error' in res)) throw new Error('should have refused');
    expect(res.error).toMatch(/TA Trade Republic, TA IBKR/);
  });

  it('refuses an account name that is already taken', async () => {
    const { ctx, planWrite } = await load();
    const res = await planWrite(
      ctx,
      'create_account',
      args('create_account', { name: 'TA IBKR', initialCapital: 1000 }),
    );
    if (!('error' in res)) throw new Error('should have refused');
    expect(res.error).toMatch(/already exists/);
  });

  it('refuses everything before the first sync pull has landed', async () => {
    // A write now would be built on this device's defaults and could overwrite the
    // real portfolio on every other device. Refused BEFORE the card, so nobody is
    // told "still syncing" after approving a trade.
    const { ctx, planWrite } = await load({ hydrate: false });
    const res = await planWrite(ctx, 'record_buy', args('record_buy', buyBag()));
    if (!('error' in res)) throw new Error('should have refused');
    expect(res.error).toMatch(/has not finished syncing/);
  });

  it('reports the stop those lots have now, so the card can show the move', async () => {
    const { ctx, planWrite } = await load();
    const res = await planWrite(
      ctx,
      'set_stop',
      args('set_stop', { account: 'TA Trade Republic', ticker: 'AAPL', stop: 200 }),
    );
    if (!('plan' in res) || res.plan.kind !== 'set_stop') throw new Error('not a stop plan');
    expect(res.plan.lots).toBe(1);
    expect(res.plan.previous).toBe(165);
    expect(res.plan.stop.stored).toBe(200 / 1.25);
  });
});

describe('planning touches nothing; approving is what writes', () => {
  it('leaves storage completely alone while a card is on screen', async () => {
    const { ctx, mem, planWrite } = await load();
    mem.writes.length = 0;
    await planWrite(ctx, 'record_buy', args('record_buy', buyBag()));
    await planWrite(
      ctx,
      'record_sell',
      args('record_sell', { account: 'TA Trade Republic', ticker: 'AAPL', shares: 5, price: 250 }),
    );
    expect(mem.writes).toEqual([]);
  });

  it('a declined plan writes nothing and tells the model not to re-send it', async () => {
    const { ctx, mem, planWrite, declinedWrite } = await load();
    const res = await planWrite(ctx, 'record_buy', args('record_buy', buyBag()));
    if (!('plan' in res)) throw new Error('expected a plan');
    mem.writes.length = 0;
    const out = declinedWrite(res.plan);
    expect(out.isError).toBe(true);
    expect(out.content).toMatch(/DECLINED/);
    expect(out.content).toMatch(/Do not call the same tool again/);
    expect(mem.writes).toEqual([]);
  });

  it('stores an approved buy the way the Buy form stores it', async () => {
    const { ctx, planWrite, applyApprovedWrite, store } = await load();
    const res = await planWrite(ctx, 'record_buy', args('record_buy', buyBag({ rating: 'B', setupType: 'VCP' })));
    if (!('plan' in res)) throw new Error('expected a plan');
    const out = await applyApprovedWrite(ctx, res.plan);
    expect(out.isError).toBeUndefined();

    const acct = store.accounts.find((a) => a.account.name === 'TA Trade Republic')!;
    const lot = acct.lots.find((l) => l.buyDate === '2026-09-18')!;
    // THE INVARIANT: the price is stored converted, and the currency flag plus the
    // rate record what it was converted FROM. `normalizeLotPrice` has one call site
    // (the form), so a lot carrying dollars here would be divided a second time on
    // every render.
    expect(lot.buyPrice).toBeCloseTo(232.5 / 1.25, 10);
    expect(lot.priceCurrency).toBe('USD');
    expect(lot.fxRateAtBuy).toBe(1.25);
    expect(lot.shares).toBe(10);
    expect(lot.rating).toBe('B');
    expect(lot.setupType).toBe('VCP');
  });

  it('records what it did, in the account currency, for the audit log', async () => {
    const { ctx, planWrite, applyApprovedWrite, readAuditLog } = await load();
    const res = await planWrite(ctx, 'record_buy', args('record_buy', buyBag()));
    if (!('plan' in res)) throw new Error('expected a plan');
    await applyApprovedWrite(ctx, res.plan);
    const log = await readAuditLog(ctx);
    expect(log).toHaveLength(1);
    expect(log[0]!.tool).toBe('record_buy');
    expect(log[0]!.line).toMatch(/AAPL/);
  });

  it('closes the position when the whole holding is sold', async () => {
    const { ctx, planWrite, applyApprovedWrite, store } = await load();
    const res = await planWrite(
      ctx,
      'record_sell',
      args('record_sell', {
        account: 'TA Trade Republic',
        ticker: 'AAPL',
        shares: 15,
        price: 250,
        date: '2026-09-18',
      }),
    );
    if (!('plan' in res) || res.plan.kind !== 'record_sell') throw new Error('not a sell plan');
    expect(res.plan.held).toBe(15);
    await applyApprovedWrite(ctx, res.plan);
    const acct = store.accounts.find((a) => a.account.name === 'TA Trade Republic')!;
    expect(acct.lots.every((l) => l.remainingShares === 0)).toBe(true);
    const rec = acct.sells.at(-1)!;
    expect(rec.sellPrice).toBeCloseTo(250 / 1.25, 10);
    expect(rec.priceCurrency).toBe('USD');
    expect(rec.fxRateAtSell).toBe(1.25);
  });

  it('moves the stop on every open lot of the symbol', async () => {
    const { ctx, planWrite, applyApprovedWrite, store } = await load();
    const res = await planWrite(
      ctx,
      'set_stop',
      args('set_stop', { account: 'TA Trade Republic', ticker: 'AAPL', stop: 200, priceCurrency: 'EUR' }),
    );
    if (!('plan' in res)) throw new Error('expected a plan');
    await applyApprovedWrite(ctx, res.plan);
    const acct = store.accounts.find((a) => a.account.name === 'TA Trade Republic')!;
    expect(acct.lots.filter((l) => l.remainingShares > 0).every((l) => l.stop === 200)).toBe(true);
  });
});

/**
 * "N26 4K" from chat: a Financial Status reading, not a portfolio write.
 *
 * Two N26 accounts on purpose, so a bare prefix is ambiguous while the exact name is not —
 * the planner must pick the exact match, and refuse "n2" rather than choose one.
 */
function seedBook(mem: Mem): void {
  mem.map.set('wealth', {
    accounts: [
      { id: 'w1', name: 'N26', kind: 'other', currency: 'EUR', createdAt: '2026-01-01' },
      { id: 'w2', name: 'N26 Savings', kind: 'other', currency: 'EUR', createdAt: '2026-01-01' },
      { id: 'w3', name: 'Vietcombank', kind: 'other', currency: 'VND', createdAt: '2026-01-01' },
    ],
    balances: [{ id: 'b1', accountId: 'w1', date: '2026-06-30', amount: 3500 }],
  });
}

describe('record_balance — a dated reading on a Financial Status account', () => {
  it('plans today\'s reading on the exact account, with the last one for the card', async () => {
    const { ctx, mem, planWrite } = await load();
    seedBook(mem);
    const res = await planWrite(ctx, 'record_balance', args('record_balance', { account: 'n26', amount: 4000 }));
    if (!('plan' in res) || res.plan.kind !== 'record_balance') throw new Error('expected a balance plan');
    expect(res.plan.wealthAccount).toEqual({ id: 'w1', name: 'N26', currency: 'EUR' });
    expect(res.plan.amount).toBe(4000);
    expect(res.plan.previous).toEqual({ date: '2026-06-30', amount: 3500 });
    expect(res.plan.replaces).toBeUndefined();
    expect(mem.writes).toEqual([]);
  });

  it('asks rather than guesses when the name fits two accounts, or none', async () => {
    const { ctx, mem, planWrite } = await load();
    seedBook(mem);
    const two = await planWrite(ctx, 'record_balance', args('record_balance', { account: 'n2', amount: 4000 }));
    expect('error' in two && two.error).toMatch(/more than one.*Ask which one/);
    const none = await planWrite(ctx, 'record_balance', args('record_balance', { account: 'Revolut', amount: 4000 }));
    expect('error' in none && none.error).toMatch(/No Financial Status account.*N26 \(EUR\).*cannot create/);
  });

  it('refuses a future date', async () => {
    const { ctx, mem, planWrite, store } = await load();
    const soon = new Date(Date.parse(store.today() + 'T12:00:00Z') + 3 * 86_400_000).toISOString().slice(0, 10);
    seedBook(mem);
    const res = await planWrite(
      ctx,
      'record_balance',
      // A few days ahead: core's date check already turns away the far future.
      args('record_balance', { account: 'N26', amount: 4000, date: soon }),
    );
    expect('error' in res && res.error).toMatch(/in the future/);
  });

  it('stores an approved reading in the wealth book and leaves the portfolio alone', async () => {
    const { ctx, mem, planWrite, applyApprovedWrite, readAuditLog } = await load();
    seedBook(mem);
    const res = await planWrite(
      ctx,
      'record_balance',
      args('record_balance', { account: 'Vietcombank', amount: 250000000, date: '2026-09-01' }),
    );
    if (!('plan' in res)) throw new Error('expected a plan');
    await applyApprovedWrite(ctx, res.plan);
    const book = mem.map.get('wealth') as { balances: { accountId: string; date: string; amount: number }[] };
    expect(book.balances.find((b) => b.accountId === 'w3')).toMatchObject({ date: '2026-09-01', amount: 250000000 });
    expect(mem.writes).not.toContain('accounts');
    expect((await readAuditLog(ctx))[0]!.line).toBe('BALANCE Vietcombank = 250,000,000 ₫ VND · 2026-09-01');
  });
});

describe('the write tools are not reachable through the read path', () => {
  it('refuses a write tool sent to execRead and says where to make the change', async () => {
    // `runModel` only sends write tools when there is an approval callback, so this is
    // the belt to that braces: a write name arriving here is a bug, not a trade.
    const { ctx, execRead } = await load();
    const out = await execRead(ctx, 'record_buy', args('record_buy', buyBag()));
    expect(out.isError).toBe(true);
    expect(out.content).toMatch(/is a write tool/);
  });
});
