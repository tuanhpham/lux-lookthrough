import { describe, it, expect } from 'vitest';
import {
  AGENT_TOOLS,
  findTool,
  readTools,
  writeTools,
  schemaFor,
  validateToolArgs,
  parseLooseNumber,
  formatIssues,
} from '../../src/agent/tools.js';

/** The coerced value of one field, for the happy-path assertions. */
const val = (tool: string, args: Record<string, unknown>, field: string): unknown => {
  const r = validateToolArgs(tool, args);
  return r.ok ? r.value[field] : { issues: formatIssues(r.issues) };
};

/** The issue text for a field, for the rejection assertions. */
const issue = (tool: string, args: Record<string, unknown>, field: string): string => {
  const r = validateToolArgs(tool, args);
  if (r.ok) return '';
  return r.issues.filter((i) => i.field === field).map((i) => i.problem).join('; ');
};

const buy = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ticker: 'AAPL',
  shares: 10,
  price: 195.5,
  ...over,
});

describe('the catalogue', () => {
  it('gives every tool a unique snake_case name and a description', () => {
    const names = AGENT_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of AGENT_TOOLS) {
      expect(t.name).toMatch(/^[a-z][a-z_]*$/);
      expect(t.description.length).toBeGreaterThan(20);
      for (const a of t.args) expect(a.spec.description.length).toBeGreaterThan(3);
    }
  });

  it('partitions cleanly into read and write', () => {
    expect(readTools().length + writeTools().length).toBe(AGENT_TOOLS.length);
    expect(readTools().some((t) => writeTools().includes(t))).toBe(false);
  });

  it('exposes no tool that deletes anything', () => {
    // Deletions run against a last-write-wins synced blob: a wrong one reaches
    // every device and there is no undo. The UI has them; the model must not.
    for (const t of AGENT_TOOLS) {
      expect(t.name).not.toMatch(/delete|remove|clear|reset|wipe/);
    }
  });

  it('pins the write tools and their arguments', () => {
    // Pinned in full ON PURPOSE, for two reasons:
    //  1. Every write tool needs an approval card and an audit entry (phase 4), so
    //     adding one must be a visible diff here rather than a silent new power.
    //  2. NO ARGUMENT MAY BE A DERIVED MONEY FIGURE. The model supplies shares, a
    //     price and a date; proceeds, realized PnL, cash and totals are computed by
    //     core. If `realizedPnL` or `proceeds` ever appears below, a model's
    //     arithmetic has become a stored number and this test has done its job.
    const shape: Record<string, string[]> = {};
    for (const t of writeTools()) shape[t.name] = t.args.map((a) => a.name);
    expect(shape).toEqual({
      create_account: ['name', 'initialCapital', 'currency', 'description'],
      record_buy: [
        'account',
        'ticker',
        'shares',
        'price',
        'date',
        'stop',
        'target',
        'setupType',
        'rating',
        'note',
      ],
      record_sell: ['account', 'ticker', 'shares', 'price', 'date', 'note'],
      set_stop: ['account', 'ticker', 'stop'],
      record_cash_flow: ['account', 'amount', 'date', 'note'],
      place_order: ['account', 'ticker', 'type', 'threshold', 'shares', 'date'],
    });
  });

  it('never makes a date required, so no trade can be silently back-dated', () => {
    // Core has no clock. A model asked for a required date would invent one.
    for (const t of AGENT_TOOLS) {
      const date = t.args.find((a) => a.name === 'date');
      if (date) expect(date.required).toBe(false);
    }
  });
});

describe('schemaFor', () => {
  it('derives a closed object schema whose required list is real', () => {
    const s = schemaFor(findTool('record_buy')!);
    expect(s.type).toBe('object');
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(['ticker', 'shares', 'price']);
    for (const name of s.required) expect(s.properties[name]).toBeTruthy();
    expect(Object.keys(s.properties)).toHaveLength(findTool('record_buy')!.args.length);
  });

  it('types the fields the way each wire format expects', () => {
    const s = schemaFor(findTool('record_buy')!);
    expect(s.properties['shares']).toMatchObject({ type: 'number', minimum: 0 });
    expect(s.properties['ticker']).toMatchObject({ type: 'string' });
    expect(s.properties['rating']).toMatchObject({ type: 'string', enum: ['A', 'B', 'C', 'D'] });
    expect(schemaFor(findTool('list_transactions')!).properties['limit']).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 200,
    });
    expect(schemaFor(findTool('get_quote')!).properties['tickers']).toMatchObject({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('gives a no-argument tool an empty schema rather than nothing', () => {
    expect(schemaFor(findTool('list_accounts')!)).toEqual({
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    });
  });
});

describe('parseLooseNumber', () => {
  it('reads the ways a price is actually written', () => {
    expect(parseLooseNumber('195.50')).toBe(195.5);
    expect(parseLooseNumber('$195.50')).toBe(195.5);
    expect(parseLooseNumber('1,234.56')).toBe(1234.56);
    expect(parseLooseNumber('12 000')).toBe(12000);
    expect(parseLooseNumber(42)).toBe(42);
    expect(parseLooseNumber('-500')).toBe(-500);
  });

  it('handles the European convention, where the comma is the decimal point', () => {
    // A portfolio kept in EUR sees both conventions, sometimes in one session.
    expect(parseLooseNumber('1.234,56')).toBe(1234.56);
    expect(parseLooseNumber('195,50')).toBe(195.5);
    // …but the unambiguous grouping shape is still grouping.
    expect(parseLooseNumber('1,234')).toBe(1234);
  });

  it('refuses what it cannot read instead of returning something plausible', () => {
    expect(parseLooseNumber('about 200')).toBeNull();
    expect(parseLooseNumber('')).toBeNull();
    expect(parseLooseNumber('two hundred')).toBeNull();
    expect(parseLooseNumber(null)).toBeNull();
    expect(parseLooseNumber(Number.NaN)).toBeNull();
    expect(parseLooseNumber(Number.POSITIVE_INFINITY)).toBeNull();
    // No exponent notation: a model writing `1e3` shares is confused, and reading
    // it as 1000 would hide that.
    expect(parseLooseNumber('1e3')).toBeNull();
  });
});

describe('validateToolArgs — coercion', () => {
  it('cleans up a ticker the way models write them', () => {
    expect(val('record_buy', buy({ ticker: ' aapl ' }), 'ticker')).toBe('AAPL');
    expect(val('record_buy', buy({ ticker: '$AAPL' }), 'ticker')).toBe('AAPL');
    expect(val('record_buy', buy({ ticker: 'brk.b' }), 'ticker')).toBe('BRK.B');
  });

  it('accepts numbers sent as strings, which every provider does sometimes', () => {
    expect(val('record_buy', buy({ shares: '10' }), 'shares')).toBe(10);
    expect(val('record_buy', buy({ price: '$1,195.50' }), 'price')).toBe(1195.5);
    expect(val('list_transactions', { limit: '25' }, 'limit')).toBe(25);
  });

  it('keeps fractional shares, which the app supports', () => {
    expect(val('record_buy', buy({ shares: 2.5 }), 'shares')).toBe(2.5);
  });

  it('normalises an enum case-insensitively', () => {
    expect(val('record_buy', buy({ rating: 'a' }), 'rating')).toBe('A');
    expect(
      val('place_order', { ticker: 'AAPL', type: 'buy_stop', threshold: 200, shares: 5 }, 'type'),
    ).toBe('BUY_STOP');
  });

  it('escapes a note, because notes are rendered as HTML', () => {
    // The model's text is untrusted markup — it may be echoing a web page or a
    // pasted prompt. Escaped, it displays as written and cannot become script.
    expect(val('record_buy', buy({ note: '<b>breakout</b>' }), 'note')).toBe(
      '&lt;b&gt;breakout&lt;/b&gt;',
    );
    expect(val('record_sell', { ticker: 'A', shares: 1, price: 1, note: 'P&L > 5%' }, 'note')).toBe(
      'P&amp;L &gt; 5%',
    );
  });

  it('leaves a plain name alone but refuses markup characters in it', () => {
    // Account names are interpolated into HTML raw elsewhere in the app, and are
    // also matched against stored names — so escaping would fix one and break the
    // other. Refusing the two characters that matter does neither.
    expect(val('create_account', { name: 'Growth & Co', initialCapital: 1000 }, 'name')).toBe(
      'Growth & Co',
    );
    expect(issue('create_account', { name: '<img src=x>', initialCapital: 1 }, 'name')).toMatch(
      /must not contain/,
    );
  });

  it('flattens a symbol list to a comma string, de-duplicated', () => {
    expect(val('get_quote', { tickers: ['aapl', '$msft', 'AAPL'] }, 'tickers')).toBe('AAPL,MSFT');
    // Models sometimes send a string where an array was asked for.
    expect(val('get_quote', { tickers: 'aapl, msft' }, 'tickers')).toBe('AAPL,MSFT');
  });
});

describe('validateToolArgs — refusal', () => {
  it('names the missing required field', () => {
    const r = validateToolArgs('record_buy', { ticker: 'AAPL' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.map((i) => i.field).sort()).toEqual(['price', 'shares']);
      expect(formatIssues(r.issues)).toContain('shares: required');
    }
  });

  it('refuses a share count that is not a positive number', () => {
    expect(issue('record_buy', buy({ shares: 0 }), 'shares')).toMatch(/greater than zero/);
    expect(issue('record_buy', buy({ shares: -5 }), 'shares')).toMatch(/greater than zero/);
    expect(issue('record_buy', buy({ shares: 'a few' }), 'shares')).toMatch(/not a number/);
    expect(issue('record_buy', buy({ shares: 5e9 }), 'shares')).toMatch(/implausibly large/);
  });

  it('refuses a negative price and a zero cash flow', () => {
    expect(issue('record_buy', buy({ price: -1 }), 'price')).toMatch(/cannot be negative/);
    expect(issue('record_cash_flow', { amount: 0 }, 'amount')).toMatch(/non-zero/);
    expect(val('record_cash_flow', { amount: '-2 500' }, 'amount')).toBe(-2500);
  });

  it('refuses a date it cannot verify, and says to omit it instead', () => {
    // THE POINT: a model that guesses a date silently back-dates a trade, which
    // changes every return figure measured from that day.
    expect(val('record_buy', buy({ date: '2026-08-21' }), 'date')).toBe('2026-08-21');
    expect(issue('record_buy', buy({ date: 'today' }), 'date')).toMatch(/Omit the field/);
    expect(issue('record_buy', buy({ date: 'yesterday' }), 'date')).toMatch(/YYYY-MM-DD/);
    expect(issue('record_buy', buy({ date: '21/08/2026' }), 'date')).toMatch(/YYYY-MM-DD/);
    expect(issue('record_buy', buy({ date: '2026-02-30' }), 'date')).toMatch(/YYYY-MM-DD/);
    expect(issue('record_buy', buy({ date: '1975-01-01' }), 'date')).toMatch(/YYYY-MM-DD/);
  });

  it('refuses a value outside an enum or an integer range', () => {
    expect(issue('record_buy', buy({ rating: 'A+' }), 'rating')).toMatch(/must be one of: A, B/);
    expect(issue('list_transactions', { limit: 500 }, 'limit')).toMatch(/between 1 and 200/);
    expect(issue('list_transactions', { limit: 2.5 }, 'limit')).toMatch(/whole number/);
  });

  it('refuses a symbol list that is empty or absurd', () => {
    expect(issue('get_quote', { tickers: [] }, 'tickers')).toMatch(/no valid stock symbols/);
    expect(issue('get_quote', { tickers: ['!!', '??'] }, 'tickers')).toMatch(/no valid stock/);
    expect(
      issue('get_quote', { tickers: Array.from({ length: 25 }, (_, i) => `AB${i}`) }, 'tickers'),
    ).toMatch(/too many symbols/);
  });

  it('rejects an unknown tool and a non-object argument bag', () => {
    expect(validateToolArgs('drop_database', {}).ok).toBe(false);
    expect(validateToolArgs('record_buy', 'AAPL 10 shares').ok).toBe(false);
    expect(validateToolArgs('record_buy', ['AAPL']).ok).toBe(false);
  });
});

describe('validateToolArgs — the in-between cases', () => {
  it('treats an explicit null or empty string on an optional field as absent', () => {
    // Models fill in every field of a schema, blanks included.
    const r = validateToolArgs('record_buy', buy({ stop: null, note: '', setupType: undefined }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.value).sort()).toEqual(['price', 'shares', 'ticker']);
  });

  it('still refuses a required field sent as an empty string', () => {
    expect(issue('record_buy', buy({ ticker: '' }), 'ticker')).toMatch(/required/);
  });

  it('drops an unknown field but reports it, rather than refusing the call', () => {
    // A stray field is not a reason to refuse a trade the user asked for — but it
    // belongs on the approval card, so nobody assumes it was honoured.
    const r = validateToolArgs('record_buy', buy({ currency: 'USD', commission: 1 }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.ignored.sort()).toEqual(['commission', 'currency']);
      expect(r.value['currency']).toBeUndefined();
    }
  });

  it('accepts an empty bag for a tool that takes no arguments', () => {
    expect(validateToolArgs('list_accounts', {})).toEqual({ ok: true, value: {}, ignored: [] });
    expect(validateToolArgs('list_accounts', null).ok).toBe(true);
  });
});
