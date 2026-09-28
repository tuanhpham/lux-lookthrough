/**
 * The Buy form's plan — specifically the boundary core cannot check.
 *
 * `setupPlaybook.test.ts` pins the arithmetic in one currency. What can only be
 * checked here is the seam: bars come back in USD, equity and cash are in the
 * account's currency, and the form's price is in whichever currency its dropdown
 * says. Get that wrong and the share count is off by the EURUSD rate — 25% at 1.25,
 * silently, on every trade, with a plausible-looking number on screen.
 *
 * Module state (the config, the regime, the FX table) lives at module scope, so each
 * case loads fresh modules rather than resetting shipping code — same reason as
 * `positionsFeed.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
import { createAccount, buy, type AccountState, type Bar } from '@screener/core';

const id = (() => {
  let n = 0;
  return () => `pl${++n}`;
})();

function bar(date: string, close: number, low: number, high: number): Bar {
  return { date, open: close, high, low, close, volume: 1_000_000 };
}

function isoDate(i: number): string {
  const d = new Date(Date.UTC(2025, 0, 1));
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
}

/** 60 quiet sessions at $100 whose lows all sit at exactly $90. */
const TICKER_BARS: Bar[] = Array.from({ length: 60 }, (_, i) => bar(isoDate(i), 100, 90, 101));

/** SPY in a steady advance: UPTREND with ordinary volatility. */
function spyBars(rising: boolean): Bar[] {
  return Array.from({ length: 320 }, (_, i) => {
    const c = rising ? 100 + i * 0.5 : 400 - i * 0.5;
    return bar(isoDate(i), c, c * 0.995, c * 1.005);
  });
}

/** EURUSD at a flat 1.25, so the conversion arithmetic is checkable by hand. */
const FX_BARS: Bar[] = [bar('2026-09-25', 1.25, 1.25, 1.25)];

function eurAccount(): AccountState {
  return createAccount(
    { name: 'TA', initialCapital: 50_000, currency: 'EUR', createdAt: '2026-01-02' },
    id,
  );
}

async function load({ rising = true }: { rising?: boolean } = {}) {
  vi.resetModules();
  const store = new Map<string, unknown>();
  const asked: string[] = [];
  const ctx = {
    storage: {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: unknown) => void store.set(k, v),
    },
    data: {
      getOHLCV: async (sym: string) => {
        asked.push(sym);
        return { bars: sym === 'SPY' ? spyBars(rising) : TICKER_BARS };
      },
    },
  } as unknown as import('../src/context.js').AppContext;

  const fx = await import('../src/portfolio/fx.js');
  fx.applyEurUsdBars(FX_BARS);
  const pb = await import('../src/portfolio/playbook.js');
  return { ctx, pb, store, asked };
}

describe('the currency seam', () => {
  it('sizes the same trade identically whether the price is typed in EUR or USD', () => {
    // THE BUG THIS EXISTS TO CATCH. $100 with a $90 stop is $10 of risk per share. On
    // a €50,000 account risking 0.25% (€125) that is €8 per share → 15 shares. Typed
    // as €80 with the same underlying trade it must still be 15. Divide in the wrong
    // direction and one of the two comes out 23 or 24, which looks perfectly normal.
    return (async () => {
      const { ctx, pb } = await load();
      await pb.savePlaybookConfig(ctx, {
        setups: { Pullback: { padPct: 0 } }, // stop exactly on the low, for clean arithmetic
        ladder: {},
        pinnedRiskPct: null,
      });
      await pb.ensureRegime(ctx, { refresh: true });
      const st = eurAccount();

      const usd = pb.buildBuyPlan({
        state: st, prices: {}, bars: TICKER_BARS,
        entry: 100, entryCurrency: 'USD', setup: 'Pullback', date: '2026-09-25',
      })!;
      const eur = pb.buildBuyPlan({
        state: st, prices: {}, bars: TICKER_BARS,
        entry: 80, entryCurrency: 'EUR', setup: 'Pullback', date: '2026-09-25',
      })!;

      expect(usd.shares).toBe(15);
      expect(eur.shares).toBe(usd.shares);
      // And the stop comes back in the currency the form is showing, both times.
      expect(usd.stop).toBeCloseTo(90, 2);
      expect(eur.stop).toBeCloseTo(72, 2);
    })();
  });

  it('reports the stop percentage off the entry, so it reads the same in either currency', async () => {
    const { ctx, pb } = await load();
    await pb.ensureRegime(ctx, { refresh: true });
    const st = eurAccount();
    const a = pb.buildBuyPlan({
      state: st, prices: {}, bars: TICKER_BARS,
      entry: 100, entryCurrency: 'USD', setup: 'VCP', date: '2026-09-25',
    })!;
    const b = pb.buildBuyPlan({
      state: st, prices: {}, bars: TICKER_BARS,
      entry: 80, entryCurrency: 'EUR', setup: 'VCP', date: '2026-09-25',
    })!;
    expect(a.stopPct).toBeCloseTo(b.stopPct, 2);
  });
});

describe('the regime', () => {
  it('does not go to the network unless asked', async () => {
    // Drawing the Portfolio tab calls this. A fetch here would mean opening a tab
    // starts a market-data download — the rule `ensureEurUsd` follows.
    const { ctx, pb, asked } = await load();
    await pb.ensureRegime(ctx);
    expect(asked).toEqual([]);
    expect(pb.currentRegime()).toBeNull();
  });

  it('caches SPY under a device-local key so it is not synced', async () => {
    const { ctx, pb, store } = await load();
    await pb.ensureRegime(ctx, { refresh: true });
    expect(store.has('pf_spy_bars')).toBe(true);
    expect(pb.currentRegime()?.regime).toBe('UPTREND');
  });

  it('survives a failed fetch rather than losing the plan', async () => {
    vi.resetModules();
    const fx = await import('../src/portfolio/fx.js');
    fx.applyEurUsdBars(FX_BARS);
    const pb = await import('../src/portfolio/playbook.js');
    const ctx = {
      storage: { get: async () => null, set: async () => undefined },
      data: { getOHLCV: async () => { throw new Error('offline'); } },
    } as unknown as import('../src/context.js').AppContext;

    await expect(pb.ensureRegime(ctx, { refresh: true })).resolves.toBeNull();
    // And a plan is still produced — just without a regime to size against.
    const plan = pb.buildBuyPlan({
      state: eurAccount(), prices: {}, bars: TICKER_BARS,
      entry: 100, entryCurrency: 'USD', setup: 'VCP', date: '2026-09-25',
    });
    expect(plan).not.toBeNull();
    expect(plan!.regime).toBeNull();
    expect(plan!.shares).toBeGreaterThan(0);
  });
});

describe('the risk budget the form uses', () => {
  it('refuses new longs in a downtrend even when a percent is pinned', async () => {
    // Pinning size is about HOW BIG. Whether to open a long at all is a different
    // rule, and a pin that quietly switched it off would be the one place this
    // feature could make the user's trading worse rather than better.
    const { ctx, pb } = await load({ rising: false });
    await pb.savePlaybookConfig(ctx, { setups: {}, ladder: {}, pinnedRiskPct: 1 });
    await pb.ensureRegime(ctx, { refresh: true });
    expect(pb.currentRegime()?.regime).toBe('DOWNTREND');

    const plan = pb.buildBuyPlan({
      state: eurAccount(), prices: {}, bars: TICKER_BARS,
      entry: 100, entryCurrency: 'USD', setup: 'VCP', date: '2026-09-25',
    })!;
    expect(plan.budget.pct).toBe(0);
    expect(plan.shares).toBe(0);
    expect(plan.size.warnings).toContain('noNewLongs');
  });

  it('uses a pinned percent in a tradeable tape', async () => {
    const { ctx, pb } = await load();
    await pb.savePlaybookConfig(ctx, {
      setups: { Pullback: { padPct: 0 } }, ladder: {}, pinnedRiskPct: 1,
    });
    await pb.ensureRegime(ctx, { refresh: true });
    const plan = pb.buildBuyPlan({
      state: eurAccount(), prices: {}, bars: TICKER_BARS,
      entry: 100, entryCurrency: 'USD', setup: 'Pullback', date: '2026-09-25',
    })!;
    expect(plan.budget.pct).toBe(1);
    expect(plan.shares).toBe(62); // €500 ÷ €8
  });

  it('counts open risk from the lots already held, so the heat limit is real', async () => {
    const { ctx, pb } = await load();
    await pb.savePlaybookConfig(ctx, {
      setups: { Pullback: { padPct: 0 } }, ladder: {}, pinnedRiskPct: 1,
    });
    await pb.ensureRegime(ctx, { refresh: true });

    const st = eurAccount();
    // €1,900 of open risk against a €2,000 (4%) ceiling leaves €100 → 12 shares.
    buy(st, { ticker: 'AAPL', buyDate: '2026-09-01', buyPrice: 200, shares: 95, stop: 180 }, id);
    const plan = pb.buildBuyPlan({
      state: st, prices: {}, bars: TICKER_BARS,
      entry: 100, entryCurrency: 'USD', setup: 'Pullback', date: '2026-09-25',
    })!;
    expect(plan.size.limitedBy).toBe('heat');
    expect(plan.shares).toBe(12);
  });

  it('holds the config across a reload of the module’s caller', async () => {
    const { ctx, pb } = await load();
    await pb.savePlaybookConfig(ctx, {
      setups: { VCP: { firstTargetR: 5 } }, ladder: { minRR: 3 }, pinnedRiskPct: 0.75,
    });
    expect(pb.ladderConfig().minRR).toBe(3);
    expect(pb.playbookConfig().pinnedRiskPct).toBe(0.75);
    // And a fresh load reads it back from storage rather than the defaults.
    const again = await pb.loadPlaybookConfig(ctx);
    expect(again.setups.VCP?.firstTargetR).toBe(5);
  });
});

describe('the pointer from the playbook chapter', () => {
  it('hands the request over exactly once', async () => {
    // The book asks, the Portfolio tab answers. If the flag stayed set, the dialog
    // would re-open every time the user came back to Portfolio for the rest of the
    // session, with nothing on screen saying why.
    const { pb } = await load();
    expect(pb.takePlaybookSettingsRequest()).toBe(false);
    pb.requestPlaybookSettings();
    expect(pb.takePlaybookSettingsRequest()).toBe(true);
    expect(pb.takePlaybookSettingsRequest()).toBe(false);
  });
});

describe('what the plan refuses to answer', () => {
  it('returns null rather than a made-up level when there are no bars', async () => {
    const { ctx, pb } = await load();
    await pb.ensureRegime(ctx, { refresh: true });
    expect(pb.buildBuyPlan({
      state: eurAccount(), prices: {}, bars: [],
      entry: 100, entryCurrency: 'USD', setup: 'VCP', date: '2026-09-25',
    })).toBeNull();
  });

  it('fetches a symbol the account does not hold, and caches it for the session', async () => {
    const { ctx, pb, asked } = await load();
    const first = await pb.barsFor(ctx, 'nvda');
    const second = await pb.barsFor(ctx, 'NVDA');
    expect(first.length).toBeGreaterThan(0);
    expect(second).toBe(first);
    expect(asked.filter((s) => s === 'NVDA')).toHaveLength(1);
  });

  it('asks for nothing when the ticker box is empty', async () => {
    const { ctx, pb, asked } = await load();
    expect(await pb.barsFor(ctx, '   ')).toEqual([]);
    expect(asked).toEqual([]);
  });
});
