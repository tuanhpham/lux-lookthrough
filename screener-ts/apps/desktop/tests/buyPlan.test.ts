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

describe('the conviction grade', () => {
  /** €50,000 at a pinned 1% is €500 of risk; €8 per share is 62 shares at full size. */
  async function graded(rating: 'A' | 'B' | 'C' | 'D' | null, ladder = {}) {
    const { ctx, pb } = await load();
    await pb.savePlaybookConfig(ctx, {
      setups: { Pullback: { padPct: 0 } }, ladder, pinnedRiskPct: 1,
    });
    await pb.ensureRegime(ctx, { refresh: true });
    return pb.buildBuyPlan({
      state: eurAccount(), prices: {}, bars: TICKER_BARS,
      entry: 100, entryCurrency: 'USD', setup: 'Pullback', date: '2026-09-25', rating,
    })!;
  }

  it('takes a share of the size per grade, and full size for A', async () => {
    expect((await graded('A')).shares).toBe(62);   // €500 ÷ €8
    expect((await graded('B')).shares).toBe(46);   // 75% of 62
    expect((await graded('C')).shares).toBe(31);   // 50% of 62
    expect((await graded('D')).shares).toBe(15);   // 25% of 62
  });

  it('SCALES A SIZE THAT A NON-RISK LIMIT DECIDED — the bug that reached the user', async () => {
    // THE REGRESSION. The grade used to scale `budget.pct`, which only moves `byRisk`.
    // With a tight stop the 25% concentration cap is what decides the size, so every
    // grade came back with the SAME share count: the dropdown moved and the position did
    // not. Reported as "toi chua thay shares, hay position thay doi".
    //
    // €50,000 at a pinned 1% is €500 of risk. A $0.50 stop distance is €0.40 per share →
    // 1,250 shares by risk, which is €50,000 of stock on a €50,000 account. The 25% cap
    // cuts that to €12,500 → 156 shares. The grade has to bite on the 156.
    const { ctx, pb } = await load();
    await pb.savePlaybookConfig(ctx, {
      setups: { Pullback: { padPct: 0 } }, ladder: {}, pinnedRiskPct: 1,
    });
    await pb.ensureRegime(ctx, { refresh: true });
    const tight: Bar[] = Array.from({ length: 60 }, (_, i) => bar(isoDate(i), 100, 99.5, 101));
    const at = (rating: 'A' | 'B' | 'C' | 'D') => pb.buildBuyPlan({
      state: eurAccount(), prices: {}, bars: tight,
      entry: 100, entryCurrency: 'USD', setup: 'Pullback', date: '2026-09-25', rating,
    })!;

    const a = at('A');
    expect(a.size.limitedBy).toBe('concentration'); // the cap, not the risk budget
    expect(a.shares).toBe(156);                     // €12,500 ÷ €80

    // Each grade is now a real fraction of that capped full size.
    expect(at('B').shares).toBe(117);               // 75% of 156
    expect(at('C').shares).toBe(78);                // 50%
    expect(at('D').shares).toBe(39);                // 25%
    // And the full size is reported alongside, so the card can show the subtraction.
    expect(at('B').size.fullShares).toBe(156);
    expect(at('B').size.gradeScale).toBe(0.75);
  });

  it('reports the full position value the grade took a share of', async () => {
    // The user's own framing: "full position size could be max 2000 euro, grade B should
    // be only max 1500 euro". Both numbers have to be on the plan for the card to say it.
    const b = await graded('B');
    expect(b.size.fullPositionValue).toBeCloseTo(62 * 80, 0);
    expect(b.size.positionValue).toBeCloseTo(46 * 80, 0);
    // 46/62 = 0.742, not 0.75 — whole shares cannot hit the fraction exactly, and the
    // rounding goes DOWN on purpose: a C that came back bigger than 50% would defeat
    // the point of choosing it.
    const share = b.size.positionValue / b.size.fullPositionValue;
    expect(share).toBeLessThanOrEqual(0.75);
    expect(share).toBeGreaterThan(0.73);
  });

  it('leaves the risk budget itself alone, so the ladder still reads true', async () => {
    // The budget is the FULL-size percent now. A card that showed 1% while risking 0.25%
    // would overstate the trade by exactly what the user had just taken off it, so the
    // wording reads `riskPctOfEquity` — but the budget must still say what it was.
    const d = await graded('D');
    expect(d.budget.pct).toBe(1);
    // 15 shares × €8 = €120 on €50,000 → 0.24%, a whole share short of a clean 0.25.
    expect(d.size.riskPctOfEquity).toBeCloseTo(0.25, 1);
  });

  it('plans an ungraded trade at full size rather than refusing it', async () => {
    // A blank dropdown that silently quartered the position would teach the wrong
    // lesson: grading is a discipline the user is invited into, not a gate.
    const blank = await graded(null);
    expect(blank.shares).toBe(62);
    expect(blank.shares).toBe(blank.size.fullShares);
    expect(blank.rating).toBeNull();
    expect(blank.size.gradeScale).toBe(1);
  });

  it('echoes the grade back so the explanation can name it', async () => {
    const c = await graded('C');
    expect(c.rating).toBe('C');
    expect(c.size.gradeScale).toBe(0.5);
  });

  it('still scales a PINNED percent, so the dropdown is not decorative', async () => {
    // What the user pinned is the size of the trade they actually wanted — which is
    // what an A means. A pin that ignored the grade would make A–D do nothing at all
    // for everyone who had pinned a number.
    expect((await graded('C')).shares).toBe(31);
    expect((await graded('A')).shares).toBe(62);
  });

  it('is configurable', async () => {
    const half = await graded('B', { ratingPct: { A: 100, B: 50, C: 25, D: 10 } });
    expect(half.size.gradeScale).toBe(0.5);
    expect(half.shares).toBe(31);
  });

  it('is NOT floored, because the floor guards against the app — not against the user', async () => {
    // The grade used to sit inside `riskBudget`, under `minRiskPct`. On the learning rung
    // (0.25%) that floored a D at 0.1% — 40% of an A's size wearing a label saying 25%.
    // `minRiskPct` exists to stop the REGIME and the RECORD whittling a position to
    // nothing on the user's behalf; a grade is the user choosing smaller on purpose, and
    // overruling that is the app arguing with a deliberate decision.
    const { ctx, pb } = await load();
    await pb.savePlaybookConfig(ctx, { setups: { Pullback: { padPct: 0 } }, ladder: {}, pinnedRiskPct: null });
    await pb.ensureRegime(ctx, { refresh: true });
    const at = (rating: 'A' | 'D') => pb.buildBuyPlan({
      state: eurAccount(), prices: {}, bars: TICKER_BARS,
      entry: 100, entryCurrency: 'USD', setup: 'Pullback', date: '2026-09-25', rating,
    })!;
    const a = at('A');
    const d = at('D');
    // The budget is the ungraded one either way — the ladder did not change its mind.
    expect(a.budget.pct).toBe(0.25);
    expect(d.budget.pct).toBe(0.25);
    expect(d.budget.cuts).not.toContain('flooredAtMin');
    // And a D really is a quarter of an A, not 40% of it.
    expect(d.shares / a.shares).toBeCloseTo(0.25, 1);
    expect(d.shares).toBeGreaterThan(0); // a plan of nought shares must be a decision
  });

  it('never grades a position down to nothing', async () => {
    // A small account where full size is 2 shares: a D at 25% floors to 0. "Bet smaller"
    // must not silently become "do not bet" — that is a refusal, and the grade has no
    // business making one.
    //
    // €8,000 on the learning rung risks 0.25% = €20, and €8 per share is 2 shares full.
    // (Going smaller still would make FULL size zero, which is a different answer —
    // "you cannot take this trade at all" — and not the one under test.)
    const { ctx, pb } = await load();
    await pb.savePlaybookConfig(ctx, { setups: { Pullback: { padPct: 0 } }, ladder: {}, pinnedRiskPct: null });
    await pb.ensureRegime(ctx, { refresh: true });
    const tiny = createAccount(
      { name: 'small', initialCapital: 8_000, currency: 'EUR', createdAt: '2026-01-02' },
      id,
    );
    const d = pb.buildBuyPlan({
      state: tiny, prices: {}, bars: TICKER_BARS,
      entry: 100, entryCurrency: 'USD', setup: 'Pullback', date: '2026-09-25', rating: 'D',
    })!;
    expect(d.size.fullShares).toBeGreaterThan(0);
    expect(d.shares).toBeGreaterThanOrEqual(1);
  });

  it('does not override the downtrend veto', async () => {
    // The grade is about how big. Whether to be long at all is a different rule, and an
    // A on a downtrend day must not talk the app into the trade.
    const { ctx, pb } = await load({ rising: false });
    await pb.savePlaybookConfig(ctx, { setups: {}, ladder: {}, pinnedRiskPct: 1 });
    await pb.ensureRegime(ctx, { refresh: true });
    const plan = pb.buildBuyPlan({
      state: eurAccount(), prices: {}, bars: TICKER_BARS,
      entry: 100, entryCurrency: 'USD', setup: 'VCP', date: '2026-09-25', rating: 'A',
    })!;
    expect(plan.budget.pct).toBe(0);
    expect(plan.shares).toBe(0);
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
