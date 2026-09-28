/**
 * What actually leaves the app on `scanner:positions` — the wiring, not the digest.
 *
 * The digest itself is pinned in core (`positionsDigest.test.ts`). What can only be
 * checked here is the part that made a euro stop level unwatchable: the EURUSD rate
 * the Portfolio tab holds has to reach the payload, because the VM has no FX source
 * of its own and will otherwise stand aside on every EUR-denominated position.
 *
 * `fx.ts` keeps the rate table at module scope, so each case loads fresh modules
 * rather than resetting shipping code — same reason as `agentWrites.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
import { createAccount, buy, type AccountState, type Bar } from '@screener/core';

const id = (() => {
  let n = 0;
  return () => `pf${++n}`;
})();

/** EURUSD daily closes as the Portfolio tab caches them; the LAST one is "latest". */
const FX_BARS: Bar[] = [
  { date: '2026-09-24', open: 1.16, high: 1.16, low: 1.16, close: 1.16, volume: 0 },
  { date: '2026-09-25', open: 1.1725, high: 1.1725, low: 1.1725, close: 1.1725, volume: 0 },
];

/** A EUR account holding a US name — the case the whole fix is about. */
function eurAccount(): AccountState {
  const st = createAccount(
    { name: 'TA Trade Republic', initialCapital: 50_000, currency: 'EUR', createdAt: '2026-01-02' },
    id,
  );
  // 232.50 USD at 1.25 = 186 EUR stored, with `priceCurrency` still saying USD.
  const lot = buy(st, { ticker: 'AAPL', buyDate: '2026-09-18', buyPrice: 186, shares: 15, stop: 132 }, id);
  lot.priceCurrency = 'USD';
  lot.fxRateAtBuy = 1.25;
  return st;
}

/**
 * Load the feed with the bridge and the hydration gate stubbed out.
 * `withFx: false` is the state of a session where the Portfolio tab never updated.
 */
async function load({ withFx = true } = {}) {
  vi.resetModules();
  const sent: unknown[] = [];
  vi.doMock('../src/adapters/scannerClient.js', () => ({
    scannerPut: async (_k: string, body: unknown) => {
      sent.push(body);
      return true;
    },
  }));
  vi.doMock('../src/adapters/storage.js', () => ({ isHydrated: () => true }));

  const fx = await import('../src/portfolio/fx.js');
  if (withFx) fx.applyEurUsdBars(FX_BARS);
  const feed = await import('../src/portfolio/positionsFeed.js');
  return { sent, fx, feed };
}

describe('the EURUSD rate reaches the snapshot', () => {
  it('publishes the rate the Portfolio tab uses, with the day it came from', async () => {
    const { sent, feed } = await load();

    expect(await feed.publishPositions([eurAccount()])).toBe('ok');
    const body = sent[0] as { rows: { cur: string; stops: number[] }[]; fx?: unknown };
    expect(body.fx).toEqual({ eurUsd: 1.1725, asOf: '2026-09-25' });
    // The level is still the stored euro one. One side converts, and it is the reader:
    // that is what lets the alert name both numbers and the rate between them.
    expect(body.rows[0]!.cur).toBe('EUR');
    expect(body.rows[0]!.stops).toEqual([132]);
  });

  it('omits it when the tab never loaded a rate, rather than sending 1', async () => {
    const { sent, feed } = await load({ withFx: false });

    expect(await feed.publishPositions([eurAccount()])).toBe('ok');
    const body = sent[0] as { fx?: unknown; warn: string[] };
    expect(body.fx).toBeUndefined();
    // A rate of 1 would say "EUR and USD are the same number" and the reader would
    // believe it. Saying nothing keeps the position in the "not watched" list.
    expect(body.warn.join(' ')).toContain('chưa có tỷ giá');
  });

  it('re-publishes when only the rate changed, because that is new information', async () => {
    const { sent, fx, feed } = await load();
    const list = [eurAccount()];

    expect(await feed.publishPositions(list)).toBe('ok');
    expect(await feed.publishPositions(list)).toBe('skip');   // nothing new

    fx.applyEurUsdBars([
      { date: '2026-09-28', open: 1.2, high: 1.2, low: 1.2, close: 1.2, volume: 0 },
    ]);
    // Throttled rather than skipped: the body differs, which is the point. The
    // trailing send is the throttle's job and is not awaited here.
    expect(await feed.publishPositions(list)).toBe('queued');
    expect((sent[0] as { fx: { eurUsd: number } }).fx.eurUsd).toBe(1.1725);
  });
});
