/**
 * The exported case study — the other half of the pair `planReport.test.ts` describes.
 *
 * ── WHAT IS WORTH TESTING HERE ──────────────────────────────────────────────
 * The user's "case study nen giong trade plan mot chut, chua tat ca cac criteria … de sau nay
 * doc lai tot hon". This document is the one read a year later, when nothing about the trade is
 * remembered, and the app that could re-render it may have moved on. So:
 *
 *   · the frozen checklist has to reach the FILE, not just the tab's on-screen plan button;
 *   · the section has to vanish whole on a study that never had a plan — a heading over an
 *     empty grid reads as data loss rather than as a hand-written study;
 *   · a `plan` that came back off the sync wire half-formed must not take the document with it.
 *     `loadCase` casts rather than normalises, unlike `loadPlanSnapshot`, so this blob can be
 *     any shape at all and it is the renderer's job to survive it.
 */
import { describe, it, expect } from 'vitest';
import { criteriaForFamily, gradeByHand, type Bar } from '@screener/core';
import { caseStudyHtml } from '../src/caseStudies/report.js';
import type { CasePlan, CaseStudy } from '../src/caseStudies/store.js';
import { emptyPlan } from '../src/portfolio/planStore.js';
import { criterionLabel } from '../src/portfolio/gradeWords.js';
import { esc } from '../src/portfolio/gradeView.js';

const grade = gradeByHand(criteriaForFamily('base').map((c) => c.key), 'base');

const bars: Bar[] = Array.from({ length: 200 }, (_, i) => {
  const d = new Date('2026-01-01T00:00:00');
  d.setDate(d.getDate() + i);
  const close = 80 + i * 0.1;
  return {
    date: d.toISOString().slice(0, 10),
    open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1_000_000,
  };
});

function casePlan(over: Partial<CasePlan> = {}): CasePlan {
  return {
    symbol: 'NVDA',
    savedAt: '2026-07-16T09:00:00.000Z',
    date: '2026-07-15',
    plan: {
      ...emptyPlan('NVDA'),
      setup: 'VCP',
      note: '<p>Tight three-week base, volume dried up.</p>',
      noteEdited: true,
      reviewedAt: '2026-07-15T10:30:00.000Z',
      levels: { entry: 100, stop: 95, target: 130 },
      updatedAt: '2026-07-15T10:31:00.000Z',
    },
    grade,
    effective: grade.grade,
    levels: { entry: 100, stop: 95, target: 130 },
    shares: 200,
    currency: 'USD',
    pctOfFull: 100,
    ...over,
  };
}

function study(over: Partial<CaseStudy> = {}): CaseStudy {
  return {
    id: 'cs1',
    symbol: 'NVDA',
    title: 'Textbook VCP out of a flat base',
    keyDate: '2026-07-15',
    windowMonths: 3,
    setupType: 'VCP',
    outcome: 'win',
    rating: 'A',
    entry: 100, stop: 95, target: 130,
    exitDate: '2026-08-20', exitPrice: 128, rMultiple: 5.6,
    exitReason: 'Target hit',
    catalysts: [],
    notes: '<p>Held through one shakeout.</p>',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    ...over,
  };
}

describe('caseStudyHtml', () => {
  it('carries the whole frozen checklist into the file', () => {
    const html = caseStudyHtml(study({ plan: casePlan() }), bars);
    const shown = grade.outcomes.filter((c) => c.known || c.source !== 'auto');
    expect(shown.length).toBeGreaterThan(5);
    for (const c of shown) {
      expect(html, c.key).toContain(esc(criterionLabel(c.key, false)));
      expect(html, c.key).toContain(`<td class="mono">${c.weight}</td>`);
    }
    // The styles have to travel with the markup: this file has no stylesheet to fall back on.
    expect(html).toContain('.gbar-fill');
  });

  it('prints the plan as it was, alongside what happened', () => {
    const html = caseStudyHtml(study({ plan: casePlan() }), bars);
    expect(html).toContain('Trade plan it was filed from');
    expect(html).toContain('trade date <b>2026-07-15</b>');
    expect(html).toContain('Stop (planned)');
    expect(html).toContain('Plan acknowledged');
    expect(html).toContain('ack ok');
    // The outcome is still the headline — the plan is context, not a replacement.
    expect(html).toContain('Target hit');
    expect(html).toContain('5.60R');
  });

  it('says loudly when the plan behind a filed trade was never acknowledged', () => {
    const html = caseStudyHtml(
      study({ plan: casePlan({ plan: { ...casePlan().plan, reviewedAt: null, levels: null } }) }),
      bars,
    );
    expect(html).toContain('ack bad');
    expect(html).toMatch(/NOT acknowledged/);
  });

  it('leaves the section out entirely on a study written by hand', () => {
    // Most studies have no plan: they were typed into this tab from a chart, or filed before
    // the planner could freeze one. An empty "Trade plan" heading would read as lost data.
    const html = caseStudyHtml(study(), bars);
    expect(html).not.toContain('Trade plan it was filed from');
    expect(html).not.toContain('Scorecard');
    expect(html).not.toContain('class="ack');
    expect(html).not.toMatch(/acknowledged/i);
    // And the rest of the document is untouched.
    expect(html).toContain('Held through one shakeout');
    expect(html).toContain('<svg');
  });

  it('says a plan was never graded rather than printing an empty scorecard', () => {
    const html = caseStudyHtml(study({ plan: casePlan({ grade: null, effective: null }) }), bars);
    expect(html).toContain('Trade plan it was filed from');
    expect(html).toMatch(/never graded/i);
    expect(html).not.toContain('Scorecard');
  });

  it('survives a plan that came off the sync wire half-formed', () => {
    /*
     * `loadCase` casts the stored blob; it does not normalise it the way `loadPlanSnapshot`
     * does. So a grade with no `outcomes`, or a plan with no `levels`, is reachable — and a
     * journal that throws while opening is a journal the user has lost.
     */
    const broken = { ...casePlan(), grade: { grade: 'A' }, levels: undefined } as unknown as CasePlan;
    const html = caseStudyHtml(study({ plan: broken }), bars);
    expect(html).toContain('Trade plan it was filed from');
    expect(html).toMatch(/never graded/i);   // an unusable grade is treated as no grade
    expect(html).toContain('—');             // and the missing levels print as dashes
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });

  it('prints the filed note only when the editable notes have since diverged', () => {
    // The planner copies the plan note into `notes` at filing, so printing both would usually
    // be the same paragraph twice. Where they disagree, the difference is the point.
    const same = caseStudyHtml(
      study({ notes: '<p>Tight three-week base, volume dried up.</p>', plan: casePlan() }),
      bars,
    );
    expect(same).not.toContain('Plan note, as filed');

    const diverged = caseStudyHtml(study({ plan: casePlan() }), bars);
    expect(diverged).toContain('Plan note, as filed');
    expect(diverged).toContain('Tight three-week base');
  });

  it('shows a euro plan’s levels in euros', () => {
    const html = caseStudyHtml(study({ plan: casePlan({ currency: 'EUR' }) }), bars);
    expect(html).toContain('€100.00');
    expect(html).toContain('in EUR');
  });

  it('is still a complete standalone document with the plan in it', () => {
    const html = caseStudyHtml(study({ plan: casePlan() }), bars);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
    expect(html).not.toMatch(/<link[^>]+href/);
    expect(html).not.toMatch(/<script\b/);
  });
});
