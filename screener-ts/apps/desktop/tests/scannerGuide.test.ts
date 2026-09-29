/**
 * The scanner's explanations. DOM-free, so it runs under `environment: 'node'`; the
 * language stays English throughout because `setLang` touches `document`.
 *
 * What is worth locking here is not the prose — that is meant to be edited — but the
 * three properties that make the prose TRUE:
 *
 *   1. Every threshold a gate claims is read from the pushed config at the path it
 *      names. A typo in `lead.min_dolar_vol` would print a silent `—` where a number
 *      belongs, and `—` looks like "the VM has not pushed yet" rather than "this page
 *      is lying about which gate ran".
 *   2. A ratio prints as a percentage. `0.15` and `15%` are the same fact and only one
 *      of them can be compared by eye with a table cell that reads `12.4%`.
 *   3. `watchChecks` never claims a row FAILED a gate it cannot re-check. The watch
 *      payload carries `adv20` where the gate used the 50-session average, and carries
 *      no RVOL at all; a red ✕ there would accuse a row that passed.
 *
 * The config fixture below is a real `config.snapshot()` from the scanner repo, trimmed
 * to the groups this page reads.
 */
import { describe, it, expect } from 'vitest';
import {
  CFG_DOC, METRICS, PLAN_STEPS, REJ_LEGEND, SETUP_DOC, WATCH_WHY,
  cfgNote, cfgNum, gateText, planStepText, say, thrText, watchChecks, type Cfg,
} from '../src/tabs/scannerGuide.js';

const CFG: Cfg = {
  bench: 'SPY',
  defensive: ['XLP', 'XLU'],
  regime: {
    slope_win: 10, slope_up: 0.005, slope_dn: -0.005,
    vol_win: 100, vol_contract: 0.8, vol_expand: 1.3, min_bars: 210, load_n: 400,
  },
  sectors: {
    ret_wins: [21, 63, 126], ema_win: 21, sma_win: 50, slope_win: 10, top_n: 3,
    change_wins: [5, 21], min_bars: 140, load_n: 400, hist_days: 90,
  },
  lead: {
    min_px: 10.0, min_dollar_vol: 20000000.0, min_rvol: 1.5,
    min_atr_pct: 0.02, max_atr_pct: 0.06, min_rs21: 0.0, min_rs63: 0.0,
    max_off_high: 0.15, rs_cap21: 0.15, rs_cap63: 0.3, per_sector: 5, max_total: 10,
  },
  holdings: { max_age_days: 180 },
  nightly: { stale_hours: 36, chart_days: 90, watch_top: 40 },
  plan: {
    trigger_buf: 0.001, stop_atr: 1.5, risk_pct: 0.0075, max_pos_pct: 0.2, rr: 2.0,
  },
};

describe('cfgNum', () => {
  it('walks a dotted path into the pushed config', () => {
    expect(cfgNum(CFG, 'lead.min_px')).toBe(10);
    expect(cfgNum(CFG, 'plan.rr')).toBe(2);
    expect(cfgNum(CFG, 'sectors.top_n')).toBe(3);
  });

  it('returns null rather than guessing when the config has not arrived', () => {
    expect(cfgNum(null, 'lead.min_px')).toBeNull();
    expect(cfgNum(undefined, 'lead.min_px')).toBeNull();
    expect(cfgNum({}, 'lead.min_px')).toBeNull();
  });

  it('returns null for a path that is not a number, including a whole group', () => {
    // A group object rendered into a sentence would print `[object Object]` as a
    // threshold, which reads as a number nobody can check.
    expect(cfgNum(CFG, 'lead')).toBeNull();
    expect(cfgNum(CFG, 'bench')).toBeNull();
    expect(cfgNum(CFG, 'sectors.ret_wins')).toBeNull();
    expect(cfgNum(CFG, 'lead.min_px.nope')).toBeNull();
  });
});

describe('thrText', () => {
  it('prints a ratio as the percentage the tables print', () => {
    expect(thrText(0.15, 'pct')).toBe('15%');
    expect(thrText(0.2, 'pct')).toBe('20%');
    // Enough decimals to stay true, never more: 0.5% and 0.1% are different rules.
    expect(thrText(0.005, 'pct')).toBe('0.5%');
    expect(thrText(0.001, 'pct')).toBe('0.1%');
    expect(thrText(-0.1, 'pct')).toBe('-10%');
  });

  it('drops the trailing zero that makes a rule look like a measurement', () => {
    expect(thrText(10.0, 'money')).toBe('$10');
    expect(thrText(1.5, 'money')).toBe('$1.5');
    expect(thrText(1.5, 'x')).toBe('1.5×');
  });

  it('scales dollar volume and share counts into readable units', () => {
    expect(thrText(20000000, 'moneyM')).toBe('$20M');
    expect(thrText(2000000000, 'moneyM')).toBe('$2B');
    expect(thrText(200000, 'sh')).toBe('200k');
    expect(thrText(500000, 'sh')).toBe('500k');
    expect(thrText(1500000, 'sh')).toBe('1.5M');
  });

  it('prints an em dash for a threshold it does not have', () => {
    expect(thrText(null)).toBe('—');
    expect(thrText(null, 'pct')).toBe('—');
  });
});

describe('SETUP_DOC gates', () => {
  it('resolves every live path against a real config snapshot', () => {
    // The whole point of a `path` is that the page shows the threshold the scanner is
    // RUNNING. A path that misses resolves to `—`, which is indistinguishable from "no
    // push yet" — so a typo here would hide itself.
    const paths: string[] = [];
    for (const doc of Object.values(SETUP_DOC)) {
      for (const g of [...doc.gates, ...(doc.caps ?? [])]) {
        if (g.path) paths.push(g.path);
      }
    }
    expect(paths.length).toBeGreaterThan(8);
    for (const p of paths) expect(cfgNum(CFG, p), p).not.toBeNull();
  });

  it('gives every gate exactly one source of truth', () => {
    for (const [code, doc] of Object.entries(SETUP_DOC)) {
      for (const g of [...doc.gates, ...(doc.caps ?? [])]) {
        // Both would be a live number and a mirror of it disagreeing in the same row.
        expect(!(g.path && g.val !== undefined), `${code}: ${g.test.en}`).toBe(true);
      }
    }
  });

  it('substitutes the live threshold into the gate sentence', () => {
    const lead = SETUP_DOC.LEAD!;
    const px = lead.gates.find((g) => g.path === 'lead.min_px')!;
    expect(gateText(px, CFG)).toBe('Price ≥ <b>$10</b>');
    const dv = lead.gates.find((g) => g.path === 'lead.min_dollar_vol')!;
    expect(gateText(dv, CFG)).toContain('<b>$20M</b>');
  });

  it('substitutes a mirrored setups.py constant for the two setups the VM does not publish', () => {
    // BO and RV thresholds are NOT in `config.snapshot()`, so they are mirrored — and
    // both setups are marked as such, which is what keeps the drift visible.
    expect(SETUP_DOC.BO!.mirrored).toBe(true);
    expect(SETUP_DOC.RV!.mirrored).toBe(true);
    expect(SETUP_DOC.LEAD!.mirrored).toBeUndefined();
    const depth = SETUP_DOC.BO!.gates.find((g) => g.val === 0.2)!;
    expect(gateText(depth, CFG)).toContain('<b>20%</b>');
  });

  it('leaves no {v} unfilled, with or without a config', () => {
    for (const doc of Object.values(SETUP_DOC)) {
      for (const g of [...doc.gates, ...(doc.caps ?? [])]) {
        expect(gateText(g, CFG)).not.toContain('{v}');
        expect(gateText(g, null)).not.toContain('{v}');
        // No config = an em dash, never a stale number carried in the app.
        if (g.path) expect(gateText(g, null)).toContain('<b>—</b>');
      }
    }
  });

  it('documents all three setups end to end', () => {
    for (const code of ['BO', 'RV', 'LEAD']) {
      const doc = SETUP_DOC[code]!;
      expect(doc.gates.length, code).toBeGreaterThan(5);
      for (const b of [doc.sub, doc.what, doc.quality]) {
        expect(b.en.length, code).toBeGreaterThan(20);
        expect(b.vi.length, code).toBeGreaterThan(20);
      }
    }
    // LEAD is the only one with caps, because it is the only one `lead_pick` post-filters.
    expect(SETUP_DOC.LEAD!.caps).toHaveLength(2);
    expect(SETUP_DOC.BO!.caps).toBeUndefined();
  });
});

describe('planStepText', () => {
  it('states the plan formula with the running numbers, not hardcoded ones', () => {
    const entry = planStepText(PLAN_STEPS[0]!.v, CFG);
    expect(entry).toContain('<b>0.1%</b>');
    const stop = planStepText(PLAN_STEPS[1]!.v, CFG);
    expect(stop).toContain('<b>1.5</b>');
    const size = planStepText(PLAN_STEPS[3]!.v, CFG);
    expect(size).toContain('<b>0.75%</b>');
    expect(size).toContain('<b>20%</b>');
    for (const s of PLAN_STEPS) {
      const txt = planStepText(s.v, CFG);
      expect(txt).not.toMatch(/\{\w+\}/);
      expect(planStepText(s.v, null)).not.toMatch(/\{\w+\}/);
    }
  });
});

describe('watchChecks', () => {
  const ROW = {
    sym: 'AVGO', sector: 'XLK', ref_close: 143.2, atr_pct: 0.031, off_high: 0.042,
    rs21: 0.061, rs63: 0.14, adv20: 4_000_000, quality: 0.72,
    trigger: 145.1, stop: 138.4,
  };
  const TOP = ['XLK', 'XLV', 'XLF'];

  it('checks every LEAD gate and passes a row that qualified', () => {
    const cs = watchChecks(ROW, CFG, TOP);
    const by = (label: string) => cs.find((c) => c.label.startsWith(label))!;
    expect(by('Price').state).toBe('ok');
    expect(by('Price').value).toBe('$143.20');
    expect(by('Price').vs).toBe('≥ $10');
    expect(by('ATR% lively').state).toBe('ok');
    expect(by('ATR% not').state).toBe('ok');
    expect(by('Stronger than SPY over 21').state).toBe('ok');
    expect(by('Stronger than SPY over 63').value).toBe('+14.0%');
    expect(by('Still near').state).toBe('ok');
    expect(by('A plan exists').state).toBe('ok');
    expect(cs.every((c) => c.state !== 'bad')).toBe(true);
  });

  it('marks a gate it cannot re-check as unknown, never as failed', () => {
    const cs = watchChecks(ROW, CFG, TOP);
    // The gate measured ADV50 × price; the row carries ADV20. 4M × $143.20 clears $20M
    // here, but the figure is not the one the gate saw and the note has to say so.
    const dv = cs.find((c) => c.label === 'Dollar volume')!;
    expect(dv.note).toMatch(/50-session/);
    expect(dv.value.startsWith('≈')).toBe(true);
    // RVOL is not in the payload at all.
    const rv = cs.find((c) => c.label === 'RVOL')!;
    expect(rv.state).toBe('unknown');
    expect(rv.value).toBe('—');
    expect(rv.vs).toBe('≥ 1.5×');
  });

  it('does not accuse a thin row of failing the dollar-volume gate', () => {
    // Below the floor on the 20-session average — which is exactly the case where the
    // 50-session average may well have cleared it. So: unknown, not a red cross.
    const thin = { ...ROW, adv20: 50_000 };
    const dv = watchChecks(thin, CFG, TOP).find((c) => c.label === 'Dollar volume')!;
    expect(dv.state).toBe('unknown');
  });

  it('flags a real failure when the row itself contradicts the gate', () => {
    const wide = { ...ROW, atr_pct: 0.12, off_high: 0.4, rs63: -0.05 };
    const cs = watchChecks(wide, CFG, TOP);
    expect(cs.find((c) => c.label === 'ATR% not too wide')!.state).toBe('bad');
    expect(cs.find((c) => c.label!.startsWith('Still near'))!.state).toBe('bad');
    expect(cs.find((c) => c.label!.endsWith('63 sessions'))!.state).toBe('bad');
  });

  it('says a row has no plan rather than printing an approximate one', () => {
    const noPlan = { ...ROW, trigger: null, stop: null };
    const plan = watchChecks(noPlan, CFG, TOP).find((c) => c.label === 'A plan exists')!;
    expect(plan.state).toBe('bad');
    expect(plan.value).toBe('none');
    expect(plan.note).toMatch(/ATR/);
  });

  it('holds the sector check at unknown until the ranking has arrived', () => {
    const c = watchChecks(ROW, CFG, [])[0]!;
    expect(c.state).toBe('unknown');
    expect(c.vs).toBe('no ranking yet');
  });

  it('never invents a threshold when no config has been pushed', () => {
    for (const c of watchChecks(ROW, null, TOP)) {
      expect(c.vs).not.toMatch(/\d/);
      expect(c.state).not.toBe('bad');
    }
  });
});

describe('CFG_DOC', () => {
  it('documents every group and key the VM actually pushes', () => {
    for (const [group, val] of Object.entries(CFG as Record<string, unknown>)) {
      if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
      const doc = CFG_DOC[group];
      expect(doc, group).toBeDefined();
      for (const k of Object.keys(val as Record<string, unknown>)) {
        // An undocumented key still renders under its raw name, so this is not a
        // crash — it is a number on the page with nothing saying what it does.
        expect(doc!.keys[k], `${group}.${k}`).toBeDefined();
      }
    }
  });

  it('fills a key note with that key own value', () => {
    const topN = CFG_DOC.sectors!.keys.top_n!;
    expect(cfgNote(topN.note, 3)).toContain('<b>3</b>');
    expect(cfgNote(topN.note, 3)).not.toContain('{v}');
    // A note with no placeholder is returned untouched rather than padded with a number.
    const slope = CFG_DOC.regime!.keys.slope_win!;
    expect(cfgNote(slope.note, 10)).toBe(say(slope.note));
  });

  it('leaves no placeholder behind for a value it cannot read', () => {
    for (const doc of Object.values(CFG_DOC)) {
      for (const k of Object.values(doc.keys)) {
        expect(cfgNote(k.note, undefined)).not.toContain('{v}');
      }
    }
  });
});

describe('the legends', () => {
  it('answers the two questions the rejects table was asked', () => {
    const count = REJ_LEGEND.find((r) => r.term.en === 'Count')!;
    // "count cai gi vay number of stocks ah?" — yes, and it has to say so.
    expect(count.def.en).toMatch(/stocks/);
    const share = REJ_LEGEND.find((r) => r.term.en === 'Share')!;
    expect(share.def.en).toMatch(/every/);
    const reason = REJ_LEGEND.find((r) => r.term.en === 'Reason')!;
    expect(reason.def.en).toMatch(/FIRST/);
  });

  it('carries both languages everywhere, with no empty half', () => {
    const bis = [
      ...REJ_LEGEND.flatMap((r) => [r.term, r.def]),
      ...WATCH_WHY.flatMap((w) => [w.h, w.p]),
      ...PLAN_STEPS.flatMap((s) => [s.k, s.v]),
      ...Object.values(METRICS).flatMap((m) => [m.label, m.what, m.vs].filter(Boolean)),
      ...Object.values(CFG_DOC).flatMap((d) => [d.label, d.lead,
        ...Object.values(d.keys).flatMap((k) => [k.label, k.note])]),
    ];
    expect(bis.length).toBeGreaterThan(100);
    for (const b of bis) {
      expect(b!.en.trim().length, b!.en).toBeGreaterThan(0);
      expect(b!.vi.trim().length, b!.en).toBeGreaterThan(0);
      // A Vietnamese string identical to the English one is an untranslated entry
      // wearing a translation's clothes. Codes and units are the exception.
      if (b!.en.length > 24) expect(b!.vi, b!.en).not.toBe(b!.en);
    }
  });

  it('defines every column the watch list and the candidate tables print', () => {
    for (const k of ['quality', 'ref_close', 'pivot', 'dist_pivot', 'base_len',
      'base_depth', 'off_high', 'rs_pct', 'adv20', 'atr_pct', 'fund_ok',
      'trigger', 'togo', 'stop', 'target', 'size_pct', 'rs21', 'rs63']) {
      expect(METRICS[k], k).toBeDefined();
    }
  });

  it('defines the alert columns, including the three that are pure jargon', () => {
    for (const k of ['score', 'px', 'chg', 'rvol', 'dollar_vol',
      'px15', 'px_close', 'hi_after', 'lo_after']) {
      expect(METRICS[k], k).toBeDefined();
    }
    // The two the table heads as MFE and MAE: the words have to appear, because the
    // heading is an acronym in both languages and explains itself in neither.
    expect(METRICS.hi_after!.label.en).toContain('MFE');
    expect(METRICS.hi_after!.label.vi).toContain('MFE');
    expect(METRICS.lo_after!.label.en).toContain('MAE');
    // `score` here is the intraday score and must not be confused with nightly quality.
    expect(METRICS.score!.what.en).toMatch(/quality/);
  });
});
