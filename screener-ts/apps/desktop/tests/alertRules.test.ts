/**
 * What crosses to the VM on `scanner:alerts` — the rules per list, flattened per ticker.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  buildAlertsDigest, normalizeConfig, alertMarketOf, MAX_ALERT_SYMS, DEFAULT_RULE,
  type AlertsConfig,
} from '../src/portfolio/alertRules.js';

const NOW = new Date('2026-10-02T14:00:00Z');

function cfg(over: Partial<AlertsConfig> = {}): AlertsConfig {
  return { v: 1, on: true, lists: {}, levels: {}, ...over };
}

describe('buildAlertsDigest', () => {
  it('only lists switched on cross, and only the kinds they ask for', () => {
    const d = buildAlertsDigest(
      cfg({
        lists: {
          a: { ...DEFAULT_RULE, on: true, price: true, volume: false },
          b: { ...DEFAULT_RULE, on: false, volume: true },
        },
        levels: { NVDA: { above: 200 }, AMD: { below: 90 } },
      }),
      [
        { id: 'a', name: 'Semis', items: ['NVDA', 'amd'] },
        { id: 'b', name: 'Off', items: ['TSLA'] },
      ],
      NOW,
    );
    expect(Object.keys(d.syms)).toEqual(['AMD', 'NVDA']);
    expect(d.syms.NVDA).toEqual({ lists: ['Semis'], above: 200 });
    expect(d.syms.AMD).toEqual({ lists: ['Semis'], below: 90 });
    expect(d.n).toBe(2);
  });

  it('a ticker in two lists gets both kinds and the more sensitive threshold', () => {
    const d = buildAlertsDigest(
      cfg({
        lists: {
          a: { ...DEFAULT_RULE, on: true, price: false, volume: true, rvol: 3 },
          b: { ...DEFAULT_RULE, on: true, price: false, volume: true, rvol: 1.8, move: true, movePct: 5 },
        },
      }),
      [
        { id: 'a', name: 'Core', items: ['SAP.DE'] },
        { id: 'b', name: 'Germany', items: ['SAP.DE'] },
      ],
      NOW,
    );
    expect(d.syms['SAP.DE']).toEqual({ lists: ['Core', 'Germany'], rvol: 1.8, move: 5 });
  });

  it('a price-only list without a level is a warning, not a silent row', () => {
    const d = buildAlertsDigest(
      cfg({ lists: { a: { ...DEFAULT_RULE, on: true, price: true, volume: false, move: false } } }),
      [{ id: 'a', name: 'X', items: ['AAPL'] }],
      NOW,
    );
    expect(d.syms).toEqual({});
    expect(d.warn.join(' ')).toContain('AAPL');
  });

  it('the master switch publishes an empty digest', () => {
    const d = buildAlertsDigest(
      cfg({ on: false, lists: { a: { ...DEFAULT_RULE, on: true } }, levels: { AAPL: { above: 1 } } }),
      [{ id: 'a', name: 'X', items: ['AAPL'] }],
      NOW,
    );
    expect(d).toMatchObject({ on: false, n: 0, syms: {} });
  });

  it('tickers with no known market hours are named and left out', () => {
    const d = buildAlertsDigest(
      cfg({ lists: { a: { ...DEFAULT_RULE, on: true, volume: true } } }),
      [{ id: 'a', name: 'X', items: ['VOD.L', 'FPT.VN'] }],
      NOW,
    );
    expect(Object.keys(d.syms)).toEqual(['FPT.VN']);
    expect(d.warn.join(' ')).toContain('VOD.L');
  });

  it('caps the watched set and says so', () => {
    const items = Array.from({ length: MAX_ALERT_SYMS + 5 }, (_, i) => `S${String(i).padStart(3, '0')}`);
    const d = buildAlertsDigest(cfg({ lists: { a: { ...DEFAULT_RULE, on: true, volume: true } } }), [{ id: 'a', name: 'Big', items }], NOW);
    expect(d.n).toBe(MAX_ALERT_SYMS);
    expect(d.warn.some((w) => w.includes(String(MAX_ALERT_SYMS)))).toBe(true);
  });
});

describe('normalizeConfig', () => {
  it('clamps thresholds and drops empty levels', () => {
    const c = normalizeConfig({ lists: { a: { on: true, rvol: 99, movePct: -3 } }, levels: { nvda: { above: 'x' }, amd: { below: 80 } } });
    expect(c.lists.a!.rvol).toBe(10);
    expect(c.lists.a!.movePct).toBe(DEFAULT_RULE.movePct);
    expect(c.levels).toEqual({ AMD: { below: 80 } });
    expect(normalizeConfig(null)).toEqual({ v: 1, on: true, lists: {}, levels: {} });
  });
});

describe('alertMarketOf', () => {
  it('reads the venue from the suffix', () => {
    expect(alertMarketOf('NVDA')).toBe('US');
    expect(alertMarketOf('BRK.B')).toBe('US');
    expect(alertMarketOf('SAP.DE')).toBe('EU');
    expect(alertMarketOf('VCB.VN')).toBe('VN');
    expect(alertMarketOf('7203.T')).toBeNull();
  });
});

describe('publishAlerts', () => {
  it('refuses before hydration, sends once, then skips an unchanged digest', async () => {
    vi.resetModules();
    const sent: unknown[] = [];
    let hydrated = false;
    vi.doMock('../src/adapters/scannerClient.js', () => ({
      scannerPut: async (_k: string, body: unknown) => {
        sent.push(body);
        return true;
      },
      scannerGet: async () => null,
    }));
    vi.doMock('../src/adapters/storage.js', () => ({ isHydrated: () => hydrated }));
    const store = new Map<string, unknown>([
      ['watchlists:index', [{ id: 'a', name: 'Semis' }]],
      ['watchlists:items:a', ['NVDA']],
      ['alerts:config', { on: true, lists: { a: { on: true, price: true } }, levels: { NVDA: { above: 200 } } }],
    ]);
    const ctx = {
      storage: {
        get: async (k: string) => store.get(k) ?? null,
        set: async (k: string, v: unknown) => void store.set(k, v),
        delete: async (k: string) => void store.delete(k),
      },
    } as never;
    const feed = await import('../src/portfolio/alertsFeed.js');
    expect(await feed.publishAlerts(ctx)).toBe('off');
    hydrated = true;
    expect(await feed.publishAlerts(ctx)).toBe('ok');
    expect(await feed.publishAlerts(ctx)).toBe('skip');
    expect(sent).toHaveLength(1);
    expect((sent[0] as { syms: unknown }).syms).toEqual({ NVDA: { lists: ['Semis'], above: 200 } });
    feed._resetAlertsFeed();
  });
});
