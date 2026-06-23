import { describe, it, expect } from 'vitest';
import { toCsv, toHtmlTable, type ReportColumn } from '../../src/reports/serialize.js';

interface Row { symbol: string; score: number; note: string | null; }
const COLS: ReportColumn<Row>[] = [
  { key: 'symbol', label: 'Symbol' },
  { key: 'score', label: 'Score', format: (v) => (v as number).toFixed(1) },
  { key: 'note', label: 'Note' },
];
const rows: Row[] = [
  { symbol: 'AAPL', score: 92.5, note: 'tight base' },
  { symbol: 'BRK,B', score: 60, note: null }, // comma forces quoting
];

describe('toCsv', () => {
  it('writes a header + one row per item with CRLF line endings', () => {
    const csv = toCsv(rows, COLS);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Symbol,Score,Note');
    expect(lines[1]).toBe('AAPL,92.5,tight base');
    expect(lines.length).toBe(3);
  });

  it('quotes values containing commas and renders null as empty', () => {
    const csv = toCsv(rows, COLS);
    expect(csv).toContain('"BRK,B"');
    expect(csv.endsWith(',')).toBe(true); // trailing empty Note cell
  });
});

describe('toHtmlTable', () => {
  it('produces a full HTML doc with the title and one row per item', () => {
    const html = toHtmlTable(rows, COLS, { title: 'Daily Report' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Daily Report</title>');
    expect(html).toContain('AAPL');
    expect((html.match(/<tr>/g) ?? []).length).toBe(3); // header + 2 rows
  });

  it('escapes HTML-special characters in values', () => {
    const html = toHtmlTable([{ symbol: '<x>', score: 1, note: 'a & b' }], COLS);
    expect(html).toContain('&lt;x&gt;');
    expect(html).toContain('a &amp; b');
  });
});
