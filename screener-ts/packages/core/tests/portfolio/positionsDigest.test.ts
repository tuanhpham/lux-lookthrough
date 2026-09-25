import { describe, it, expect } from 'vitest';
import { buildPositionsDigest, createAccount, counterIds, buy, sell, setStop, createOrder } from '../../src/portfolio/index.js';
import type { AccountState } from '../../src/types/index.js';

const AT = new Date('2026-09-25T12:00:00Z');

function acct(name: string, currency = 'EUR'): AccountState {
  return createAccount(
    { name, initialCapital: 100_000, currency, createdAt: '2026-01-02' },
    counterIds(name),
  );
}

function row(st: AccountState[], sym: string) {
  return buildPositionsDigest(st, AT).rows.find((r) => r.sym === sym);
}

describe('buildPositionsDigest — what the scanner is allowed to see', () => {
  it('carries no cash, equity, P&L, ids or dates', () => {
    const st = acct('A');
    const ids = counterIds('A');
    buy(st, { ticker: 'AAPL', buyDate: '2026-09-01', buyPrice: 200, shares: 10 }, ids);
    const d = buildPositionsDigest([st], AT);

    // Whoever holds the VM's token can READ this key — the bridge gates writes,
    // not reads. So the test is on the whole serialized blob, not on one row:
    // a field added to any nested object would slip past a per-key assertion.
    const blob = JSON.stringify(d);
    for (const leak of ['cash', 'equity', 'realized', 'unrealized', 'initialCapital',
                        'accountId', 'lotId', 'buyDate', 'id"']) {
      expect(blob, `leaked ${leak}`).not.toContain(leak);
    }
    expect(d.rows[0]).toEqual({
      sym: 'AAPL', shares: 10, avgCost: 200, cur: 'USD',
      stops: [], withStop: 0, noStop: 10, accts: ['A'],
    });
  });

  it('is a snapshot with a timestamp, so a reader can tell stale from empty', () => {
    const d = buildPositionsDigest([], AT);
    expect(d.ts).toBe('2026-09-25T12:00:00.000Z');
    expect(d.n).toBe(0);
    expect(d.rows).toEqual([]);
  });
});

describe('stop levels', () => {
  it('publishes EVERY level, highest first — not the oldest lot\'s stop', () => {
    // THE TRAP. metrics.ts reports `Position.stop` from the OLDEST open lot as a
    // representative number for the table. A falling price breaches the HIGHEST
    // stop first, so alerting on the representative one fires late — or never,
    // if the oldest lot's stop sits far below.
    const st = acct('A');
    const ids = counterIds('A');
    buy(st, { ticker: 'NVDA', buyDate: '2026-08-01', buyPrice: 100, shares: 10, stop: 90 }, ids);
    buy(st, { ticker: 'NVDA', buyDate: '2026-09-01', buyPrice: 120, shares: 5, stop: 112 }, ids);

    const r = row([st], 'NVDA')!;
    expect(r.stops).toEqual([112, 90]);
    expect(r.stops[0]).toBe(112);
    expect(r.shares).toBe(15);
    expect(r.withStop).toBe(15);
    expect(r.noStop).toBe(0);
  });

  it('counts shares with and without a stop separately', () => {
    const st = acct('A');
    const ids = counterIds('A');
    buy(st, { ticker: 'MSFT', buyDate: '2026-08-01', buyPrice: 400, shares: 10, stop: 380 }, ids);
    buy(st, { ticker: 'MSFT', buyDate: '2026-09-01', buyPrice: 420, shares: 4 }, ids);

    const r = row([st], 'MSFT')!;
    expect(r.withStop).toBe(10);
    expect(r.noStop).toBe(4);
    expect(r.stops).toEqual([380]);
  });

  it('includes a stop entered as a pending STOP_LOSS order', () => {
    // A stop placed as an order is invisible to `lot.stop`, and nobody thinks of
    // those as two different things.
    const st = acct('A');
    const ids = counterIds('A');
    buy(st, { ticker: 'TSLA', buyDate: '2026-09-01', buyPrice: 300, shares: 10 }, ids);
    createOrder(st, { ticker: 'TSLA', type: 'STOP_LOSS', threshold: 285, shares: 10 }, ids);

    expect(row([st], 'TSLA')!.stops).toEqual([285]);
  });

  it('ignores filled or cancelled orders, and orders on closed positions', () => {
    const st = acct('A');
    const ids = counterIds('A');
    buy(st, { ticker: 'AMD', buyDate: '2026-09-01', buyPrice: 150, shares: 10 }, ids);
    const o = createOrder(st, { ticker: 'AMD', type: 'STOP_LOSS', threshold: 140, shares: 10 }, ids);
    o.status = 'cancelled';
    // An order on a ticker with nothing open is not a live level.
    createOrder(st, { ticker: 'INTC', type: 'STOP_LOSS', threshold: 20, shares: 100 }, ids);

    expect(row([st], 'AMD')!.stops).toEqual([]);
    expect(row([st], 'INTC')).toBeUndefined();
  });

  it('does not treat a TAKE_PROFIT threshold as a stop', () => {
    const st = acct('A');
    const ids = counterIds('A');
    buy(st, { ticker: 'META', buyDate: '2026-09-01', buyPrice: 500, shares: 10 }, ids);
    createOrder(st, { ticker: 'META', type: 'TAKE_PROFIT', threshold: 600, shares: 10 }, ids);

    // A target above price published as a stop would fire an exit alert instantly.
    expect(row([st], 'META')!.stops).toEqual([]);
  });

  it('follows setStop, because a raised stop is the whole point', () => {
    const st = acct('A');
    const ids = counterIds('A');
    buy(st, { ticker: 'GOOG', buyDate: '2026-08-01', buyPrice: 150, shares: 10, stop: 140 }, ids);
    setStop(st, st.lots[0]!.id, 148);

    expect(row([st], 'GOOG')!.stops).toEqual([148]);
  });
});

describe('open only', () => {
  it('drops a fully sold ticker and shrinks a partly sold one', () => {
    const st = acct('A');
    const ids = counterIds('A');
    buy(st, { ticker: 'AAPL', buyDate: '2026-08-01', buyPrice: 200, shares: 10, stop: 190 }, ids);
    buy(st, { ticker: 'KO', buyDate: '2026-08-01', buyPrice: 60, shares: 100 }, ids);
    sell(st, { ticker: 'AAPL', sellDate: '2026-09-10', sellPrice: 220, shares: 4 }, ids);
    sell(st, { ticker: 'KO', sellDate: '2026-09-10', sellPrice: 62, shares: 100 }, ids);

    const d = buildPositionsDigest([st], AT);
    expect(d.rows.map((r) => r.sym)).toEqual(['AAPL']);
    expect(d.rows[0]!.shares).toBe(6);
    expect(d.n).toBe(1);
  });
});

describe('across accounts', () => {
  it('merges one ticker held in two accounts and names both', () => {
    const a = acct('Chinh');
    const b = acct('Thu nghiem');
    buy(a, { ticker: 'SPY', buyDate: '2026-08-01', buyPrice: 500, shares: 10, stop: 480 }, counterIds('a'));
    buy(b, { ticker: 'spy', buyDate: '2026-09-01', buyPrice: 520, shares: 5, stop: 505 }, counterIds('b'));

    const r = row([a, b], 'SPY')!;
    expect(r.shares).toBe(15);
    expect(r.stops).toEqual([505, 480]);       // 505 is breached first
    expect(r.accts).toEqual(['Chinh', 'Thu nghiem']);
    // Lower-case ticker folded in, not published as a second row.
    expect(buildPositionsDigest([a, b], AT).n).toBe(1);
  });

  it('weights average cost by shares, not by lot count', () => {
    const st = acct('A');
    const ids = counterIds('A');
    buy(st, { ticker: 'X', buyDate: '2026-08-01', buyPrice: 100, shares: 90 }, ids);
    buy(st, { ticker: 'X', buyDate: '2026-09-01', buyPrice: 200, shares: 10 }, ids);

    expect(row([st], 'X')!.avgCost).toBe(110);   // not 150
  });

  it('sorts rows so the same portfolio always produces the same bytes', () => {
    const st = acct('A');
    const ids = counterIds('A');
    for (const t of ['ZM', 'AAPL', 'MSFT']) {
      buy(st, { ticker: t, buyDate: '2026-09-01', buyPrice: 100, shares: 1 }, ids);
    }
    // The publisher skips the write when the body is unchanged; unstable
    // ordering would defeat that and burn a D1 write on every save.
    expect(buildPositionsDigest([st], AT).rows.map((r) => r.sym))
      .toEqual(['AAPL', 'MSFT', 'ZM']);
  });
});

describe('currency — flagged, never silently converted', () => {
  it('defaults to USD when priceCurrency is unset', () => {
    const st = acct('A');
    buy(st, { ticker: 'AAPL', buyDate: '2026-09-01', buyPrice: 200, shares: 10 }, counterIds('A'));
    expect(row([st], 'AAPL')!.cur).toBe('USD');
    // No currency note — the no-stop note is a different (correct) warning.
    expect(buildPositionsDigest([st], AT).warn.join(' ')).not.toContain('EUR');
  });

  it('tags an EUR-entered position and says why it matters', () => {
    const st = acct('A');
    buy(st, { ticker: 'AAPL', buyDate: '2026-09-01', buyPrice: 185, shares: 10,
              stop: 175, priceCurrency: 'EUR' }, counterIds('A'));

    const d = buildPositionsDigest([st], AT);
    expect(d.rows[0]!.cur).toBe('EUR');
    expect(d.warn.join(' ')).toContain('EUR');
    // The number is published as entered. Converting it here with some rate would
    // hide the problem; the reader refuses to fire a confident level instead.
    expect(d.rows[0]!.stops).toEqual([175]);
  });

  it('says MIXED when one ticker has lots in both currencies', () => {
    const st = acct('A');
    const ids = counterIds('A');
    buy(st, { ticker: 'AAPL', buyDate: '2026-08-01', buyPrice: 185, shares: 10, priceCurrency: 'EUR' }, ids);
    buy(st, { ticker: 'AAPL', buyDate: '2026-09-01', buyPrice: 200, shares: 10, priceCurrency: 'USD' }, ids);

    const d = buildPositionsDigest([st], AT);
    expect(d.rows[0]!.cur).toBe('MIXED');
    expect(d.warn.join(' ')).toContain('EUR và USD');
  });

  it('warns about open positions with no stop at all', () => {
    const st = acct('A');
    buy(st, { ticker: 'AAPL', buyDate: '2026-09-01', buyPrice: 200, shares: 10 }, counterIds('A'));
    // Silence here would read as "nothing to warn about" on exactly the position
    // that cannot be protected.
    expect(buildPositionsDigest([st], AT).warn.join(' ')).toContain('không có mức cắt lỗ');
  });
});

describe('junk in, no crash out', () => {
  it('survives an account with missing arrays', () => {
    const d = buildPositionsDigest([{ account: { name: 'A' } } as unknown as AccountState], AT);
    expect(d.n).toBe(0);
  });

  it('skips a lot with a blank ticker and a non-finite stop', () => {
    const st = acct('A');
    const ids = counterIds('A');
    buy(st, { ticker: 'AAPL', buyDate: '2026-09-01', buyPrice: 200, shares: 10 }, ids);
    st.lots[0]!.stop = Number.NaN;
    st.lots.push({ ...st.lots[0]!, id: 'x', ticker: '  ' });

    const d = buildPositionsDigest([st], AT);
    expect(d.rows.map((r) => r.sym)).toEqual(['AAPL']);
    expect(d.rows[0]!.stops).toEqual([]);      // NaN is not a level
    expect(d.rows[0]!.noStop).toBe(10);
  });
});
