/**
 * The printable trade plan.
 *
 * ── WHAT THIS DOCUMENT IS FOR, AND WHAT THAT MAKES TESTABLE ─────────────────
 * The plan report and the case-study report are the same document at two different times:
 * one is what the trade was supposed to be, the other what it turned out to be. The first is
 * only worth anything if it cannot be quietly improved after the fact — so the facts that
 * would be embarrassing in hindsight are the ones that have to survive into the file, and
 * they are exactly what a test can hold onto:
 *
 *   · whether the plan was ever ACKNOWLEDGED, and against which levels;
 *   · whether the grade was the score's or the user's own;
 *   · every criterion, with its tick or cross.
 *
 * A report that silently dropped the "never acknowledged" warning, or printed an overridden
 * D as though the checklist had produced it, would look perfectly fine on screen.
 *
 * It also has to be SELF-CONTAINED — no external CSS, no script tags beyond the print
 * button — because the whole point of saving it is that it opens years later, offline.
 */
import { describe, it, expect } from 'vitest';
import { criteriaForFamily, gradeByHand, gradeTrade, type Bar } from '@screener/core';
import { planReportHtml, type PlanReportInput } from '../src/portfolio/planReport.js';
import { emptyPlan } from '../src/portfolio/planStore.js';
import { criterionLabel } from '../src/portfolio/gradeWords.js';
import { esc } from '../src/portfolio/gradeView.js';

/** Everything answered, so every row renders. */
const grade = gradeByHand(criteriaForFamily('base').map((c) => c.key), 'base');

/**
 * What the Buy form actually hands over: a few criteria the app could measure, a few the user
 * answered, and the rest unknown because the price history did not reach back far enough.
 */
const sparse = gradeTrade(
  { aboveMa50: true, ma50AboveMa150: true, relativeStrength: 92, avgDollarVolume: 50e6 },
  { earningsRisk: true, sectorLeader: true, earningsAccel: true, institutional: true },
);

/** Enough synthetic bars for the chart to have something to draw. */
const bars: Bar[] = Array.from({ length: 200 }, (_, i) => {
  const d = new Date('2026-01-01T00:00:00');
  d.setDate(d.getDate() + i);
  const close = 80 + i * 0.1;
  return {
    date: d.toISOString().slice(0, 10),
    open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1_000_000,
  };
});

function input(over: Partial<PlanReportInput> = {}): PlanReportInput {
  return {
    plan: {
      ...emptyPlan('NVDA'),
      setup: 'VCP',
      note: '<p>Tight three-week base, volume dried up.</p>',
      noteEdited: true,
      reviewedAt: '2026-09-28T10:30:00.000Z',
      levels: { entry: 100, stop: 95, target: 130 },
      updatedAt: '2026-09-28T10:31:00.000Z',
    },
    grade,
    effective: grade.grade,
    levels: { entry: 100, stop: 95, target: 130 },
    shares: 200,
    currency: 'USD',
    date: '2026-07-15',
    bars,
    pctOfFull: 100,
    vi: false,
    ...over,
  };
}

describe('planReportHtml', () => {
  it('is a complete standalone document', () => {
    const html = planReportHtml(input());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
    expect(html).toContain('<style>');
    // Nothing fetched from anywhere: this file has to open offline, years later.
    expect(html).not.toMatch(/<link[^>]+href/);
    expect(html).not.toMatch(/<script\b/);
    expect(html).toContain('window.print()');
  });

  it('names the stock, the setup and the intended date', () => {
    const html = planReportHtml(input());
    expect(html).toContain('NVDA');
    expect(html).toContain('VCP');
    expect(html).toContain('2026-07-15');
  });

  it('prints the levels, the size and the arithmetic between them', () => {
    const html = planReportHtml(input());
    expect(html).toContain('$100.00'); // entry
    expect(html).toContain('$95.00'); // stop
    expect(html).toContain('$130.00'); // target
    expect(html).toContain('200'); // shares
    expect(html).toContain('6.00:1'); // (130-100)/(100-95)
    expect(html).toContain('$1000'); // risk: 5 × 200
  });

  it('records that the plan was acknowledged, and against which levels', () => {
    // The levels go in the sentence on purpose. "Acknowledged" alone is unfalsifiable once
    // the entry has moved; "acknowledged against entry $100 / stop $95" is not.
    const html = planReportHtml(input());
    expect(html).toContain('Plan acknowledged');
    expect(html).toContain('2026-09-28 10:30');
    expect(html).toContain('ack ok');
  });

  it('warns loudly when the plan was never acknowledged', () => {
    // The failure that matters: a plan printed as a record of due diligence that was never
    // actually read. It must not be possible to miss this.
    const html = planReportHtml(input({
      plan: { ...input().plan, reviewedAt: null, levels: null },
    }));
    expect(html).toContain('ack bad');
    expect(html).toMatch(/NOT acknowledged/);
    expect(html).not.toContain('ack ok');
  });

  it('says when the letter was the user’s rather than the score’s', () => {
    const html = planReportHtml(input({
      plan: { ...input().plan, gradeOverride: 'D' },
      effective: 'D',
    }));
    expect(html).toMatch(/overridden by hand/i);
    expect(html).toContain(grade.grade!);
  });

  it('does not claim an override when the user agreed with the score', () => {
    const html = planReportHtml(input({
      plan: { ...input().plan, gradeOverride: grade.grade },
    }));
    expect(html).not.toMatch(/overridden/i);
  });

  it('lists every criterion that was actually answered, with its weight', () => {
    // Labels are escaped on the way in — one of them is literally "MA50 > MA150 > MA200".
    const html = planReportHtml(input());
    const shown = grade.outcomes.filter((c) => c.known || c.source !== 'auto');
    expect(shown.length).toBeGreaterThan(5);
    for (const c of shown) {
      expect(html, c.key).toContain(esc(criterionLabel(c.key, false)));
      expect(html, c.key).toContain(`<td class="mono">${c.weight}</td>`);
    }
  });

  it('leaves out the automatic criteria it could not measure', () => {
    // Same reason the on-screen panel drops them: a scorecard printed with five greyed-out
    // gap questions under a VCP teaches its reader that the checklist is mostly blanks.
    const html = planReportHtml(input({ grade: sparse, effective: sparse.grade }));
    const unmeasured = sparse.outcomes.filter((c) => !c.known && c.source === 'auto');
    expect(unmeasured.length).toBeGreaterThan(0);
    for (const c of unmeasured) {
      expect(html, c.key).not.toContain(esc(criterionLabel(c.key, false)));
    }
    // And the ones it did measure carry the measurement, not just a tick — a printed "✓" with
    // no number beside it is not something the reader can argue with later.
    expect(html).toContain('92');
  });

  it('says plainly when the trade was never graded, instead of printing a blank scorecard', () => {
    const html = planReportHtml(input({ grade: null, effective: null }));
    expect(html).toMatch(/never graded/i);
    expect(html).toContain('Grade —');
    expect(html).not.toContain('Scorecard');
  });

  it('draws the chart from the bars, and omits it rather than breaking without them', () => {
    expect(planReportHtml(input())).toContain('<svg');
    expect(planReportHtml(input({ bars: [] }))).not.toContain('<svg');
  });

  it('carries the plan note through whole', () => {
    expect(planReportHtml(input())).toContain('Tight three-week base');
  });

  it('says so rather than printing an empty box when there is no note', () => {
    const html = planReportHtml(input({ plan: { ...input().plan, note: '' } }));
    expect(html).toMatch(/No note yet/);
  });

  it('escapes a symbol that would otherwise break out of the markup', () => {
    // The ticker box is free text and the plan is keyed by whatever was typed in it.
    const html = planReportHtml(input({
      plan: { ...input().plan, symbol: '<script>x</script>' },
    }));
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders in Vietnamese without leaking the English labels', () => {
    const vi = planReportHtml(input({ vi: true }));
    expect(vi).toContain('lang="vi"');
    expect(vi).toContain('Kế hoạch giao dịch');
    expect(vi).not.toContain('Trade plan');
    expect(vi).not.toMatch(/NOT acknowledged/);
  });

  it('uses the currency the price was entered in', () => {
    const eur = planReportHtml(input({ currency: 'EUR' }));
    expect(eur).toContain('€100.00');
    expect(eur).not.toContain('$100.00');
  });

  it('prints a dash rather than a wrong number when a level is missing', () => {
    // Half-finished plans get printed too. A blank target must not become a 0:1 R:R.
    const html = planReportHtml(input({
      levels: { entry: 100, stop: 95, target: null }, shares: 0,
    }));
    expect(html).toContain('—');
    expect(html).not.toContain('0.00:1');
  });
});
