import { describe, it, expect } from 'vitest';
import { qmGradeEvidence, patternFamily } from '../../src/qm/gradeEvidence.js';
import { gradeTrade, gradeByGroup, GRADE_CRITERIA } from '../../src/planning/tradeGrader.js';
import { SETUP_KEYS } from '../../src/planning/setupPlaybook.js';
import type { QmScanResult } from '../../src/qm/types.js';

/**
 * A scan with a real VCP base and a real gap day, so a test can watch the bridge choose
 * between them. Nothing here is generated — the point is which fields cross over.
 */
const SCAN: QmScanResult = {
  symbol: 'TEST',
  price: 100,
  setupType: 'BOTH',
  qualityScore: 88,
  relativeStrength: 93,
  trend: {
    passed: true, reason: '', price: 100, ema50: 95, ema150: 88, ema200: 84,
    aboveEma50: true, ema50AboveEma150: true, ema150AboveEma200: true, ema200Rising: true,
    pctBelow52wHigh: 6, dollarVolume: 90_000_000, avgVolume: 900_000,
  },
  vcp: {
    isVcp: true, pivot: 102, contractions: 3, baseDepthPct: 15, previousAdvancePct: 70,
    volumeContractionPct: 48, atrContractionPct: 35, impulseCount: 2, baseLength: 30,
    aboveEmaFast: true, pullbacks: [12, 7, 4], confidence: 85,
  },
  ep: {
    isEp: true, gapPct: 18, relativeVolume: 6.5, closeLocation: 0.92,
    gapAboveResistance: true, catalyst: 'Earnings gap + EPS surprise', reason: '',
    gapScore: 90, confidence: 88,
  },
  levels: { entryPrice: 102, stopLoss: 96, target1: null, target2: null, riskRewardRatio: null } as QmScanResult['levels'],
  riskPct: 5.9,
};

/** The same scan with no base and no gap: what `detectVcp`/`detectEpisodicPivot` return
 *  when they find nothing — zeros, which must not be read as failing measurements. */
const EMPTY_PATTERNS: QmScanResult = {
  ...SCAN,
  setupType: 'NONE',
  vcp: { ...SCAN.vcp, isVcp: false, pivot: null, contractions: 0, baseDepthPct: 0, previousAdvancePct: 0, volumeContractionPct: 0, atrContractionPct: 0, pullbacks: [] },
  ep: { ...SCAN.ep, isEp: false, gapPct: 0, relativeVolume: 0, closeLocation: 0, gapAboveResistance: false, catalyst: null, reason: 'no gap' },
};

describe('qmGradeEvidence', () => {
  it('always carries the trend template, the strength and the liquidity', () => {
    // These are facts about the STOCK, true whichever pattern the user is trading.
    const ev = qmGradeEvidence(SCAN, { setup: 'Other' });
    expect(ev).toMatchObject({
      aboveMa50: true, ma50AboveMa150: true, ma150AboveMa200: true, ma200Rising: true,
      pctBelow52wHigh: 6, relativeStrength: 93, dollarVolume: 90_000_000,
    });
  });

  it('gives a VCP the base criteria and no gap criteria', () => {
    const ev = qmGradeEvidence(SCAN, { setup: 'VCP' });
    expect(ev.contractions).toBe(3);
    expect(ev.baseDepthPct).toBe(15);
    expect(ev.previousAdvancePct).toBe(70);
    expect(ev.gapPct).toBeUndefined();
    expect(ev.relativeVolume).toBeUndefined();
  });

  it('gives an EP the gap criteria and no base criteria', () => {
    // The whole reason the bridge knows about the setup: grading an episodic pivot on
    // "does it have 2+ contracting pullbacks" marks it down for not being a VCP.
    const ev = qmGradeEvidence(SCAN, { setup: 'EP' });
    expect(ev.gapPct).toBe(18);
    expect(ev.relativeVolume).toBe(6.5);
    expect(ev.closeLocation).toBe(0.92);
    expect(ev.gapAboveResistance).toBe(true);
    expect(ev.hasCatalyst).toBe(true);
    expect(ev.contractions).toBeUndefined();
    expect(ev.volumeContractionPct).toBeUndefined();
  });

  it('reads Breakout and Pullback as base-shaped, Surge as a gap', () => {
    expect(qmGradeEvidence(SCAN, { setup: 'Breakout' }).contractions).toBe(3);
    expect(qmGradeEvidence(SCAN, { setup: 'Pullback' }).contractions).toBe(3);
    expect(qmGradeEvidence(SCAN, { setup: 'Surge' }).gapPct).toBe(18);
    expect(qmGradeEvidence(SCAN, { setup: 'Surge' }).contractions).toBeUndefined();
  });

  it('gives a mean-reversion trade neither family', () => {
    // Not an oversight. This checklist is assembled out of trend-following writers, and
    // none of them would grade a fade at all — so it scores on the stock and the risk
    // mechanics, and stays quiet about the pattern.
    const ev = qmGradeEvidence(SCAN, { setup: 'Mean Reversion' });
    expect(ev.contractions).toBeUndefined();
    expect(ev.gapPct).toBeUndefined();
    expect(ev.relativeStrength).toBe(93);
  });

  it('gives an unchosen setup neither family, rather than guessing one', () => {
    const ev = qmGradeEvidence(SCAN, { setup: '' });
    expect(ev.contractions).toBeUndefined();
    expect(ev.gapPct).toBeUndefined();
  });

  it('passes the FORM levels, not the ones the scan suggested', () => {
    // The user moves the stop. If the grade kept scoring the scanner's R:R, the R:R
    // criterion would describe a trade nobody is placing.
    const ev = qmGradeEvidence(SCAN, { setup: 'VCP', rMultiple: 2.4, stopPct: 7 });
    expect(ev.rMultiple).toBe(2.4);
    expect(ev.stopPct).toBe(7);
    // Absent rather than zero, so an entry the user has not typed yet scores nothing
    // instead of failing.
    expect(qmGradeEvidence(SCAN, { setup: 'VCP' }).rMultiple).toBeNull();
  });

  it('carries the regime through, because the market is the heaviest criterion', () => {
    expect(qmGradeEvidence(SCAN, { setup: 'VCP', regime: 'UPTREND' }).regime).toBe('UPTREND');
    expect(qmGradeEvidence(SCAN, { setup: 'VCP' }).regime).toBeNull();
  });

  it('treats a catalyst-less gap as measured and failing, not as unknown', () => {
    const ev = qmGradeEvidence({ ...SCAN, ep: { ...SCAN.ep, catalyst: null } }, { setup: 'EP' });
    expect(ev.hasCatalyst).toBe(false);
  });
});

describe('the bridge, scored end to end', () => {
  it('grades the scan that passes everything an A, on the right family', () => {
    const vcp = gradeTrade(qmGradeEvidence(SCAN, { setup: 'VCP', regime: 'UPTREND', rMultiple: 3, stopPct: 6 }));
    expect(vcp.grade).toBe('A');
    const g = gradeByGroup(vcp);
    expect(g.find((x) => x.group === 'base')!.possible).toBe(18);
    expect(g.find((x) => x.group === 'pivot')!.possible).toBe(0);

    const ep = gradeTrade(qmGradeEvidence(SCAN, { setup: 'EP', regime: 'UPTREND', rMultiple: 3, stopPct: 6 }));
    expect(ep.grade).toBe('A');
    const ge = gradeByGroup(ep);
    expect(ge.find((x) => x.group === 'pivot')!.possible).toBe(28);
    expect(ge.find((x) => x.group === 'base')!.possible).toBe(0);
  });

  it('does not punish a setup for the pattern it is not', () => {
    // Same stock, same market. If the families leaked into each other, one of these two
    // would collapse — an EP has no contractions and a VCP has no gap day.
    const vcp = gradeTrade(qmGradeEvidence(SCAN, { setup: 'VCP', regime: 'UPTREND', rMultiple: 3, stopPct: 6 })).score;
    const ep = gradeTrade(qmGradeEvidence(SCAN, { setup: 'EP', regime: 'UPTREND', rMultiple: 3, stopPct: 6 })).score;
    expect(vcp).toBe(100);
    expect(ep).toBe(100);
  });

  it('reads a scan that found no base as unmeasured, not as a failed base', () => {
    // `detectVcp` reports zeros for a stock with no base. Read as measurements, those
    // zeros would grade a perfectly good trend-following entry a D on arithmetic about
    // a base that was never there.
    const ev = qmGradeEvidence(EMPTY_PATTERNS, { setup: 'VCP', regime: 'UPTREND', rMultiple: 3, stopPct: 6 });
    const r = gradeTrade(ev);
    const base = gradeByGroup(r).find((x) => x.group === 'base')!;
    // contractions: 0 IS a real reading — there were none. Depth, ATR and volume of 0
    // are not readings at all.
    expect(base.possible).toBe(7);
    expect(base.earned).toBe(0);
    expect(r.outcomes.find((o) => o.key === 'baseTight')!.known).toBe(false);
    expect(r.outcomes.find((o) => o.key === 'atrContracting')!.known).toBe(false);
    expect(r.outcomes.find((o) => o.key === 'volumeDryUp')!.known).toBe(false);
  });

  it('reads a scan that found no gap the same way', () => {
    const r = gradeTrade(qmGradeEvidence(EMPTY_PATTERNS, { setup: 'EP', regime: 'UPTREND' }));
    const pivot = gradeByGroup(r).find((x) => x.group === 'pivot')!;
    // A 0% gap is not a gap that failed to be 10% — there is no gap day to measure.
    // What IS known: no resistance cleared and no catalyst found.
    expect(r.outcomes.find((o) => o.key === 'gapSize')!.known).toBe(false);
    expect(r.outcomes.find((o) => o.key === 'gapVolume')!.known).toBe(false);
    expect(r.outcomes.find((o) => o.key === 'clearedResistance')!.known).toBe(true);
    expect(pivot.earned).toBe(0);
  });

  it('drops the grade when the market turns, with nothing else changed', () => {
    // The user's own words for why this feature exists: the grade has to be something
    // other than how they feel about the chart. Same chart, four markets, four scores.
    const at = (regime: 'UPTREND' | 'UPTREND_UNDER_STRESS' | 'RANGE' | 'DOWNTREND') =>
      gradeTrade(qmGradeEvidence(SCAN, { setup: 'VCP', regime, rMultiple: 3, stopPct: 6 })).score;
    expect(at('UPTREND')).toBe(100);
    expect(at('UPTREND_UNDER_STRESS')).toBeLessThan(100);
    expect(at('DOWNTREND')).toBeLessThan(at('RANGE'));
  });

  // ── The declared scope has to match what the bridge actually routes ──────────
  //
  // `GradeCriterion.scope` exists so the Learn book can tell the user which questions
  // their setup is asked. That makes it a SECOND statement of something the bridge
  // already decides by filling in one family and not the other, and a second statement
  // is a second thing to get wrong — the book would teach a checklist the app does not
  // score. These tests are the only thing keeping the two honest.
  describe('the declared scope matches the bridge', () => {
    for (const setup of SETUP_KEYS) {
      it(`asks a ${setup} exactly the criteria declared for it`, () => {
        const family = patternFamily(setup);
        const r = gradeTrade(qmGradeEvidence(SCAN, { setup, regime: 'UPTREND', rMultiple: 3, stopPct: 6 }));
        for (const c of GRADE_CRITERIA) {
          if (c.source === 'manual') continue; // manual rows are unasked until ticked
          const o = r.outcomes.find((x) => x.key === c.key)!;
          const inScope = c.scope === 'always' || c.scope === family;
          expect(o.known, `${setup} / ${c.key} (scope ${c.scope})`).toBe(inScope);
        }
      });
    }

    it('declares a scope on every criterion, and no pattern scope on a manual one', () => {
      for (const c of GRADE_CRITERIA) {
        expect(['always', 'base', 'pivot']).toContain(c.scope);
        // A manual question is one the user answers from outside the chart, so it cannot
        // depend on which pattern the detectors found. Scoping one to a family would hide
        // the earnings question from an EP — the setup that gaps ON earnings.
        if (c.source === 'manual') expect(c.scope).toBe('always');
      }
    });

    it('gives Mean Reversion neither family, and still asks it the rest', () => {
      expect(patternFamily('Mean Reversion')).toBe('none');
      const r = gradeTrade(qmGradeEvidence(SCAN, { setup: 'Mean Reversion', regime: 'UPTREND', rMultiple: 3, stopPct: 6 }));
      for (const c of GRADE_CRITERIA) {
        if (c.source === 'manual') continue;
        const o = r.outcomes.find((x) => x.key === c.key)!;
        expect(o.known, c.key).toBe(c.scope === 'always');
      }
    });
  });
});
