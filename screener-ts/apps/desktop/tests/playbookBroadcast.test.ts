/**
 * "The rules changed — anything unfinished has to follow."
 *
 * The user's "khi user thay doi trong playbook, khi save, thi tat ca moi thu phai (vi du nhu dang
 * setup trade plan, va vao thay doi playbook, thi sau khi save, cai trade plan do phai thay doi
 * chu, chi khi ma da buy, da save plan, save case study thi moi khong thay doi thoi)".
 *
 * ── WHAT IS WORTH TESTING HERE ──────────────────────────────────────────────
 * The subscription registry, not the surfaces. Whether the Buy form re-plans needs a DOM these
 * tests do not have; what is checkable — and what actually broke before — is the contract the
 * surfaces rely on:
 *
 *   · every listener hears one save, not just the one that opened the dialog;
 *   · a listener that throws does not silence the ones after it, because one of them is the only
 *     thing keeping a half-filled Buy form honest;
 *   · unsubscribing works, since the Buy form re-wires on every `draw()` and a leaked listener
 *     would re-plan a form that is no longer in the document;
 *   · `savePlaybookConfig` does NOT broadcast. The exit-reason editor writes the same blob, and a
 *     planner listener re-fetches bars — renaming a reason must not cost a round of network calls.
 *
 * Module state, so each case loads a fresh module — same reason as `buyPlan.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';

async function load() {
  vi.resetModules();
  return import('../src/portfolio/playbook.js');
}

function fakeCtx(sets: string[]) {
  return {
    storage: {
      get: async () => null,
      set: async (k: string) => { sets.push(k); },
      delete: async () => {},
    },
  } as unknown as import('../src/context.js').AppContext;
}

describe('onPlaybookChange', () => {
  it('tells every listener, from whichever ⚙ the save came from', async () => {
    const pb = await load();
    const heard: string[] = [];
    pb.onPlaybookChange(() => heard.push('buy form'));
    pb.onPlaybookChange(() => heard.push('planner'));
    pb.notifyPlaybookChanged();
    expect(heard).toEqual(['buy form', 'planner']);
  });

  it('keeps going when a listener throws', async () => {
    const pb = await load();
    const heard: string[] = [];
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    pb.onPlaybookChange(() => { throw new Error('a detached form'); });
    pb.onPlaybookChange(() => heard.push('planner'));
    pb.notifyPlaybookChanged();
    expect(heard).toEqual(['planner']);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('forgets a listener that unsubscribes, however many times it is asked to', async () => {
    const pb = await load();
    let n = 0;
    const off = pb.onPlaybookChange(() => { n += 1; });
    pb.notifyPlaybookChanged();
    off();
    off(); // the Buy form re-wires more often than it is destroyed
    pb.notifyPlaybookChanged();
    expect(n).toBe(1);
  });

  it('is not fired by savePlaybookConfig itself', async () => {
    const pb = await load();
    const sets: string[] = [];
    let n = 0;
    pb.onPlaybookChange(() => { n += 1; });
    await pb.savePlaybookConfig(fakeCtx(sets), { ...pb.EMPTY_PLAYBOOK_CONFIG });
    // The write happened; the broadcast did not. The settings dialog fires it, and the
    // exit-reason editor — which writes this same blob for a label change — does not.
    expect(sets).toEqual(['pf_playbook_cfg']);
    expect(n).toBe(0);
  });
});
