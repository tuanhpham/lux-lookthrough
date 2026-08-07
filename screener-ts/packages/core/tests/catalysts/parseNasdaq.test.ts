import { describe, it, expect } from 'vitest';
import {
  parseEarnings,
  parseDividends,
  parseSplits,
  parseIpos,
  parseEconEvents,
  parseMoney,
  parseUsDate,
  unescapeHtml,
  addDays,
} from '../../src/catalysts/parseNasdaq.js';

/* Fixtures are TRIMMED COPIES OF REAL api.nasdaq.com responses (probed
 * 2026-08-07). The nesting differences between endpoints are the whole point —
 * each one was a live bug waiting to happen. */

describe('field helpers', () => {
  it('parses money with $ and thousands separators', () => {
    expect(parseMoney('$71,937,231,179')).toBe(71_937_231_179);
    expect(parseMoney('$382,500,000.00')).toBe(382_500_000);
    expect(parseMoney(0.95)).toBe(0.95);
  });

  it('treats N/A and empty as null, not zero', () => {
    expect(parseMoney('N/A')).toBeNull();
    expect(parseMoney('')).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });

  it('reads accounting negatives', () => {
    expect(parseMoney('($0.13)')).toBeCloseTo(-0.13, 10);
  });

  it('converts single-digit US dates', () => {
    expect(parseUsDate('8/06/2026')).toBe('2026-08-06');
    expect(parseUsDate('12/1/2026')).toBe('2026-12-01');
  });

  it('rejects junk dates rather than guessing', () => {
    expect(parseUsDate('N/A')).toBeNull();
    expect(parseUsDate('')).toBeNull();
    expect(parseUsDate('2026-08-06')).toBeNull();
  });

  it('unescapes the entities Nasdaq leaks into text', () => {
    expect(unescapeHtml('&nbsp;')).toBe('');
    expect(unescapeHtml('AT&amp;T Inc.')).toBe('AT&T Inc.');
  });

  it('adds days across a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01'); // 2026 is not a leap year
    expect(addDays('2026-08-06', 180)).toBe('2027-02-02');
  });
});

describe('parseEarnings', () => {
  const json = {
    data: {
      asOf: 'Mon, Aug 10, 2026',
      rows: [
        {
          lastYearRptDt: '8/04/2025', lastYearEPS: '$3.05', time: 'time-after-hours',
          symbol: 'SPG', name: 'Simon Property Group, Inc.', marketCap: '$71,937,231,179',
          fiscalQuarterEnding: 'Jun/2026', epsForecast: '$3.18', noOfEsts: '7',
        },
        {
          lastYearRptDt: 'N/A', lastYearEPS: '$3.48', time: 'time-pre-market',
          symbol: 'FERG', name: 'Ferguson Enterprises Inc.', marketCap: '$49,545,479,125',
          fiscalQuarterEnding: 'Jun/2026', epsForecast: '$3.23', noOfEsts: 'N/A',
        },
        {
          time: 'time-not-supplied', symbol: 'TINY', name: 'Tiny Co',
          marketCap: '$120,000,000', fiscalQuarterEnding: 'Jun/2026',
          epsForecast: '$0.01', noOfEsts: '1',
        },
      ],
    },
  };

  it('maps Nasdaq time codes to session timing', () => {
    const [spg, ferg, tiny] = parseEarnings(json, '2026-08-10');
    expect(spg!.timing).toBe('amc');
    expect(ferg!.timing).toBe('bmo');
    // "not supplied" must stay unknown — guessing which session gaps is the bug.
    expect(tiny!.timing).toBe('unknown');
  });

  it('dates rows from the requested day (rows carry no date)', () => {
    expect(parseEarnings(json, '2026-08-10').every((e) => e.date === '2026-08-10')).toBe(true);
  });

  it('never claims a scheduled date is confirmed', () => {
    expect(parseEarnings(json, '2026-08-10').every((e) => e.confidence === 'estimated')).toBe(true);
  });

  it('scores mega caps above micro caps', () => {
    const [spg, , tiny] = parseEarnings(json, '2026-08-10');
    expect(spg!.impact).toBeGreaterThan(tiny!.impact);
  });

  it('builds a detail line and tolerates N/A estimate counts', () => {
    const [spg, ferg] = parseEarnings(json, '2026-08-10');
    expect(spg!.detail).toContain('EPS est. $3.18');
    expect(spg!.detail).toContain('7 analysts');
    expect(ferg!.detail).toContain('EPS est. $3.23');
    expect(ferg!.detail).not.toContain('analyst');
  });

  it('returns nothing for a day with null rows', () => {
    expect(parseEarnings({ data: { asOf: 'x', headers: null, rows: null } }, '2026-08-31')).toEqual([]);
  });
});

describe('parseDividends', () => {
  // Note the EXTRA `calendar` level — earnings does not have this.
  const json = {
    data: {
      calendar: {
        asOf: 'Mon, Aug 10, 2026',
        rows: [
          {
            companyName: 'American Electric Power Company, Inc. Common Stock', symbol: 'AEP',
            dividend_Ex_Date: '8/10/2026', payment_Date: '9/10/2026', record_Date: '8/10/2026',
            dividend_Rate: 0.95, indicated_Annual_Dividend: 3.8, announcement_Date: '7/20/2026',
          },
        ],
      },
    },
  };

  it('reads rows from data.calendar.rows', () => {
    const out = parseDividends(json, '2026-08-10');
    expect(out).toHaveLength(1);
    expect(out[0]!.symbol).toBe('AEP');
  });

  it('dates from the row ex-date, not the query day', () => {
    const shifted = { data: { calendar: { rows: [{ symbol: 'X', dividend_Ex_Date: '8/12/2026' }] } } };
    expect(parseDividends(shifted, '2026-08-10')[0]!.date).toBe('2026-08-12');
  });

  it('would find nothing at the earnings path (guards the nesting)', () => {
    expect(parseEarnings(json, '2026-08-10')).toEqual([]);
  });
});

describe('parseSplits', () => {
  // ONE request returns every upcoming split, each with its own executionDate.
  const json = {
    data: {
      asOf: 'Fri, Aug 7, 2026',
      rows: [
        { symbol: 'AXTU', name: 'T-REX 2X Long AXTI Daily Target ETF', ratio: '1 : 10', executionDate: '8/24/2026' },
        { symbol: 'FWD', name: 'Forward Co', ratio: '10 : 1', executionDate: '8/11/2026' },
        { symbol: 'BAD', name: 'No Date Co', ratio: '2 : 1', executionDate: 'N/A' },
      ],
    },
  };

  it('dates each split by its own executionDate', () => {
    const out = parseSplits(json);
    expect(out.find((e) => e.symbol === 'AXTU')!.date).toBe('2026-08-24');
    expect(out.find((e) => e.symbol === 'FWD')!.date).toBe('2026-08-11');
  });

  it('distinguishes reverse from forward splits', () => {
    const out = parseSplits(json);
    expect(out.find((e) => e.symbol === 'AXTU')!.detail).toContain('Reverse split');
    expect(out.find((e) => e.symbol === 'FWD')!.detail).toBe('Split 10 : 1');
  });

  it('drops rows with an unusable date instead of defaulting', () => {
    expect(parseSplits(json).some((e) => e.symbol === 'BAD')).toBe(false);
  });
});

describe('parseIpos', () => {
  const json = {
    data: {
      priced: {
        rows: [
          {
            dealID: '1394288-118704', proposedTickerSymbol: 'BRVE', companyName: 'Braveheart Bio, Inc.',
            proposedExchange: 'NASDAQ Global', proposedSharePrice: '18.00', sharesOffered: '21,250,000',
            pricedDate: '8/06/2026', dollarValueOfSharesOffered: '$382,500,000', dealStatus: 'Priced',
          },
        ],
      },
      // Upcoming is nested one level deeper than priced/filed.
      upcoming: {
        upcomingTable: {
          rows: [
            {
              proposedTickerSymbol: 'PTT', companyName: 'SIYATA PTT', proposedExchange: 'NASDAQ Capital',
              proposedSharePrice: null, sharesOffered: '6,112,327', expectedPriceDate: '9/08/2026',
              dollarValueOfSharesOffered: '',
            },
          ],
        },
      },
      filed: { rows: [] },
    },
  };
  const win = { from: '2026-08-07', to: '2026-09-07' };

  it('reads upcoming IPOs from the nested upcomingTable', () => {
    const wide = parseIpos(json, { from: '2026-08-07', to: '2026-09-30' });
    const ipo = wide.find((e) => e.kind === 'ipo');
    expect(ipo?.symbol).toBe('PTT');
    expect(ipo?.date).toBe('2026-09-08');
    expect(ipo?.confidence).toBe('estimated'); // "expected" date slips
  });

  it('derives lockup expiry as priced + 180 days', () => {
    const wide = parseIpos(json, { from: '2026-08-07', to: '2027-12-31' });
    const lockup = wide.find((e) => e.kind === 'lockup');
    expect(lockup?.symbol).toBe('BRVE');
    expect(lockup?.date).toBe('2027-02-02');
    expect(lockup?.confidence).toBe('derived');
  });

  it('clips events outside the requested window', () => {
    // Lockup (2027-02-02) and the 2026-09-08 IPO both fall outside this window.
    expect(parseIpos(json, win).map((e) => e.kind)).toEqual([]);
  });
});

describe('parseEconEvents', () => {
  const json = {
    data: {
      rows: [
        { gmt: '06:00', country: 'United States', eventName: 'NFIB Small Business Optimism', actual: '&nbsp;', consensus: '97.1', previous: '97.4' },
        { gmt: '08:30', country: 'United States', eventName: 'CPI', actual: '&nbsp;', consensus: '0.2%', previous: '0.3%' },
        { gmt: '08:30', country: 'United States', eventName: 'CPI', actual: '&nbsp;', consensus: '0.2%', previous: '0.3%' },
        { gmt: '10:00', country: 'United States', eventName: 'CB Consumer Confidence', actual: '', consensus: '97.5', previous: '96.1' },
        { gmt: '10:00', country: 'United States', eventName: 'Existing Home Sales', actual: '', consensus: '4.1M', previous: '4.0M' },
        { gmt: '13:00', country: 'United States', eventName: '3-Year Note Auction', actual: '', consensus: '', previous: '' },
        { gmt: '19:50', country: 'Japan', eventName: 'Adjusted Current Account', actual: '&nbsp;', consensus: '2.51T', previous: '3.06T' },
      ],
    },
  };

  it('keeps only US events', () => {
    expect(parseEconEvents(json, '2026-08-12').every((e) => !/Japan|Current Account/.test(e.title))).toBe(true);
  });

  it('drops low-signal noise like note auctions and housing prints', () => {
    const titles = parseEconEvents(json, '2026-08-12').map((e) => e.title);
    expect(titles).not.toContain('3-Year Note Auction');
    expect(titles).not.toContain('NFIB Small Business Optimism');
    expect(titles).not.toContain('Existing Home Sales');
    expect(titles).toContain('CPI');
  });

  it('dedupes the repeated vintages of one print', () => {
    expect(parseEconEvents(json, '2026-08-12').filter((e) => e.title === 'CPI')).toHaveLength(1);
  });

  it('marks pre-open prints as bmo and later ones intraday', () => {
    const out = parseEconEvents(json, '2026-08-12');
    expect(out.find((e) => e.title === 'CPI')!.timing).toBe('bmo');
    expect(out.find((e) => e.title === 'CB Consumer Confidence')!.timing).toBe('intraday');
  });

  it('returns nothing when the endpoint has run dry', () => {
    const dry = { data: null, status: { rCode: 200, bCodeMessage: [{ code: 1002, errorMessage: 'No record found.' }] } };
    expect(parseEconEvents(dry, '2026-09-10')).toEqual([]);
  });

  /* The real 2026-08-13 response: one 08:30 CPI release published as eight rows,
   * plus a Cleveland Fed nowcast that is NOT the BLS print. Deduping on name+time
   * kept all eight, so the calendar read as eight separate catalysts. */
  const cpiDay = {
    data: {
      rows: [
        { gmt: '08:30', country: 'United States', eventName: 'Core CPI', consensus: '0.3%', previous: '0.2%' },
        { gmt: '08:30', country: 'United States', eventName: 'Core CPI', consensus: '0.3%', previous: '0.2%' },
        { gmt: '08:30', country: 'United States', eventName: 'Core CPI Index', consensus: '', previous: '328.5' },
        { gmt: '08:30', country: 'United States', eventName: 'CPI', consensus: '0.2%', previous: '0.3%' },
        { gmt: '08:30', country: 'United States', eventName: 'CPI', consensus: '0.2%', previous: '0.3%' },
        { gmt: '08:30', country: 'United States', eventName: 'CPI Index, n.s.a.', consensus: '', previous: '323.0' },
        { gmt: '08:30', country: 'United States', eventName: 'CPI Index, s.a', consensus: '', previous: '324.1' },
        { gmt: '08:30', country: 'United States', eventName: 'CPI, n.s.a', consensus: '', previous: '0.1%' },
        { gmt: '11:00', country: 'United States', eventName: 'Cleveland CPI', consensus: '', previous: '0.3%' },
        { gmt: '08:30', country: 'United States', eventName: 'PPI', consensus: '0.2%', previous: '0.1%' },
        { gmt: '08:30', country: 'United States', eventName: 'PPI ex. Food/Energy/Transport', consensus: '', previous: '0.2%' },
      ],
    },
  };

  it('collapses one release published under many series names into a single row', () => {
    const out = parseEconEvents(cpiDay, '2026-08-13');
    // 8 CPI variants → 1, 2 PPI variants → 1.
    expect(out.filter((e) => e.id.includes(':cpi:'))).toHaveLength(1);
    expect(out.filter((e) => e.id.includes(':ppi:'))).toHaveLength(1);
    // Headline (shortest) name wins over the index/seasonal variants.
    expect(out.find((e) => e.id.includes(':cpi:'))!.title).toBe('CPI');
    expect(out.find((e) => e.id.includes(':ppi:'))!.title).toBe('PPI');
  });

  it('drops regional nowcasts that merely predict the official print', () => {
    // Cleveland CPI is a Fed estimate of CPI, not CPI. Scoring it 85 put a
    // nowcast level with the release it forecasts.
    expect(parseEconEvents(cpiDay, '2026-08-13').map((e) => e.title)).not.toContain('Cleveland CPI');
  });

  it('does not score a Fed speech like a rate decision', () => {
    // Verified live: /\bFOMC\b/ alone rated "FOMC Member Barkin Speaks" at 95,
    // the same as the statement itself, making it the top event of its week.
    const speech = {
      data: { rows: [
        { gmt: '08:40', country: 'United States', eventName: 'FOMC Member Barkin Speaks', consensus: '', previous: '' },
        { gmt: '14:00', country: 'United States', eventName: 'FOMC Interest Rate Decision', consensus: '3.75%', previous: '4.00%' },
      ] },
    };
    const out = parseEconEvents(speech, '2026-08-14');
    expect(out.find((e) => /Barkin/.test(e.title))!.impact).toBe(45);
    expect(out.find((e) => /Decision/.test(e.title))!.impact).toBe(95);
  });
});
