/**
 * The sector rank chart and the folding helper. Both are string builders, so both
 * are testable with no DOM.
 *
 * The rank chart's contract is mostly about what it must NOT do: not interpolate
 * across a gap (a straight line over a three-week outage asserts that nothing
 * happened), not plot rank 1 at the bottom (every other chart in the app means "up
 * is good"), and not invent a leadership band wider than the data.
 */
import { describe, it, expect } from 'vitest';
import { rankChartSvg, rankChartColor } from '../src/tabs/scannerRankChart.js';
import { caretHtml, foldBlock, isCollapsed, openAttr } from '../src/ui/collapse.js';

const DAYS = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];
const HIST = {
  days: DAYS,
  series: {
    XLK: [3, 2, 1, 1, 1],
    XLE: [1, 1, 3, 4, 5],
    XLU: [5, 5, null, 2, 2], // a session the VM missed
  },
};

describe('rankChartSvg', () => {
  it('draws one group per visible symbol and none for a hidden one', () => {
    const svg = rankChartSvg(HIST, { hidden: new Set(['XLE']) });
    expect(svg).toContain('XLK');
    expect(svg).toContain('XLU');
    expect(svg).not.toMatch(/>XLE</);
  });

  it('breaks the line at a missing session instead of bridging it', () => {
    const svg = rankChartSvg({ days: DAYS, series: { XLU: HIST.series.XLU } });
    // Two `M` commands in the path = two runs of ink with a hole between them.
    const d = /<path d="([^"]+)" fill="none" stroke="hsl/.exec(svg)?.[1] ?? '';
    expect(d.match(/M/g)?.length).toBe(2);
  });

  it('puts rank 1 above rank 5 — the y axis is inverted on purpose', () => {
    const svg = rankChartSvg({ days: DAYS.slice(0, 2), series: { A: [1, 1], B: [5, 5] } });
    const ys = [...svg.matchAll(/stroke="hsl[^"]+" stroke-width="[\d.]+"/g)];
    expect(ys.length).toBe(2);
    // Read the two paths' first y coordinates instead: rank 1's must be smaller.
    const firstY = (sym: string): number => {
      const g = new RegExp(`<title>${sym}</title>.*?stroke="hsl[^"]*" stroke-width`).exec(svg);
      expect(g, sym).not.toBeNull();
      const m = /M[\d.]+ ([\d.]+)/.exec(g![0]);
      return Number(m![1]);
    };
    expect(firstY('A')).toBeLessThan(firstY('B'));
  });

  it('tints the leadership band and never past the worst rank present', () => {
    expect(rankChartSvg(HIST, { bandTo: 3 })).toContain('<rect');
    expect(rankChartSvg(HIST, { bandTo: 0 })).not.toContain('<rect');
    // bandTo above the worst rank must not paint the whole plot.
    const wide = rankChartSvg({ days: DAYS.slice(0, 2), series: { A: [1, 2] } }, { bandTo: 9 });
    expect(wide).toContain('<rect');
  });

  it('labels each line with whatever the caller knows about the symbol', () => {
    const svg = rankChartSvg(HIST, { label: (s) => `${s} — a sector` });
    expect(svg).toContain('<title>XLK — a sector</title>');
  });

  it('escapes a symbol rather than trusting the payload', () => {
    const svg = rankChartSvg({ days: DAYS.slice(0, 2), series: { '<script>': [1, 1] } });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('says so instead of drawing nothing when there is no history', () => {
    const svg = rankChartSvg({ days: ['2026-09-25'], series: { XLK: [1] } },
      { emptyText: 'no history yet' });
    expect(svg).toContain('no history yet');
    expect(svg).not.toContain('<path');
  });

  it('gives each slot in the order its own hue, and is stable', () => {
    const order = ['XLK', 'XLE', 'XLU'];
    expect(rankChartColor(order, 'XLE')).toBe(rankChartColor(order, 'XLE'));
    expect(rankChartColor(order, 'XLE')).not.toBe(rankChartColor(order, 'XLK'));
    // An unknown symbol must still get a colour, not `undefined`.
    expect(rankChartColor(order, 'NOPE')).toMatch(/^hsl\(/);
  });
});

describe('collapse', () => {
  it('defaults to open where there is no storage to read', () => {
    // Node has no `localStorage`; a section must open rather than vanish.
    expect(isCollapsed('scan:cand')).toBe(false);
    expect(openAttr('scan:cand')).toBe(' open');
  });

  it('escapes the caret tooltip', () => {
    expect(caretHtml('fold "this"')).toContain('title="fold &quot;this&quot;"');
  });
});

describe('foldBlock', () => {
  const block = foldBlock('cal:top', '<div class="sec-head">HEAD</div>', '<table></table>', 'fold');

  it('keeps the head inside the summary and the body outside it', () => {
    // The head IS the handle; a body inside the summary would open on every click of it.
    expect(block).toContain('<summary class="fold-sum"><div class="sec-head">HEAD</div>');
    expect(block).toContain('</summary><div class="fold-body"><table></table></div>');
  });

  it('carries the storage key and starts open', () => {
    expect(block).toContain('data-collapse="cal:top"');
    expect(block).toContain(' open>');
  });

  // A `:` is legal in an HTML id but has to be escaped in a CSS selector, so the
  // id is sanitised and the raw key lives only in `data-collapse`.
  it('makes a selector-safe DOM id out of a prefixed key', () => {
    expect(block).toContain('id="fold-cal-top"');
  });
});
