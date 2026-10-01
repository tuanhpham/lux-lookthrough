/**
 * "Ask ChatGPT" for the checklist questions the app cannot measure — the prompt, the
 * dialog, and the answer coming back in.
 *
 * ── WHY THIS IS A SCREEN AND NOT JUST ANOTHER PROMPT BUTTON ─────────────────
 * The user's request was specific: "them mot nut button ask chatgpt de chay mot prompt cho
 * tat ca cac criteria con lai (nhung cai yes or no) de user co the nghien cuu tai cai thoi
 * diem trong qua khu do de danh dau va yes or no .... de chatgpt generate explanation va mot
 * doan summary cuoi cung de user co the copy va paste vao note."
 *
 * So the answer has to come BACK. Every other prompt in this app is one-way — it opens a tab
 * and the user reads prose. Here the reply decides five criteria that move the letter, and the
 * letter multiplies the share count. A one-way prompt would leave the user re-entering five
 * tri-state answers from another window by hand, which is precisely where an answer gets
 * transposed onto the wrong row. Hence one dialog that asks, waits, takes the reply back, and
 * ticks the boxes itself — with the evidence line beside each tick so a month later the note
 * says why.
 *
 * ── WHY THE PARSING LIVES IN CORE AND THE DIALOG LIVES HERE ─────────────────
 * `buildCriteriaPrompt` / `parseCriteriaAnswers` are string in, string out, and they carry the
 * part that must be right: the as-of cut-off, and refusing to answer a criterion the caller
 * did not ask about. Those are tested (`packages/core/tests/analysis/criteriaPrompt.test.ts`).
 * What is left here is the DOM, which the app's vitest cannot run at all — so everything that
 * could hold a bug was deliberately pushed out of this file, and `criteriaNoteHtml` is a pure
 * function for the same reason.
 */
import {
  buildCriteriaPrompt, parseCriteriaAnswers, GRADE_CRITERIA,
  type CriteriaPromptContext, type CriterionAsk, type CriterionOutcome,
  type ConvictionRating, type GradeResult, type MeasuredNote, type ParsedCriteriaReply,
} from '@screener/core';
import { criterionLabel, criterionWhy } from './gradeWords.js';
import { esc } from './gradeView.js';
import { askChatGpt, copyToClipboard } from '../ui/askChatGpt.js';
import { askAssistantText } from '../ui/chatPanel.js';
import { lblOf, promptActsHtml } from '../ui/promptActions.js';
import type { AppContext } from '../context.js';
import { t } from '../ui/i18n.js';

/** One planner card, as much of it as the prompt needs. */
export interface CriteriaAskCard {
  symbol: string;
  /** The trade date — the cut-off the whole prompt is built around. */
  date: string;
  /** The setup's own name, in the user's language. Null when none is chosen. */
  setupLabel?: string | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  /** '$' or '€' — whichever the boxes are in. */
  cur: string;
  /** The checklist as it stands, which is what says WHICH questions are still open. */
  grade: GradeResult | null;
  /** The letter in force (override included), for the "where I stand" line. */
  effective: ConvictionRating | null;
  vi: boolean;
}

/**
 * The questions to put: the manual criteria still unanswered.
 *
 * ── WHY IT FALLS BACK TO ALL OF THEM ────────────────────────────────────────
 * A user who has answered all five and presses the button again has not made a mistake — they
 * are re-researching, which is the whole point of reconstructing a past date. An empty prompt
 * would read as the button being broken. So the fallback asks the full manual set, and the
 * reply overwrites: a NO that becomes a YES is new information, and refusing to take it would
 * make the first answer permanent.
 */
export function unansweredManual(grade: GradeResult | null): CriterionOutcome[] {
  if (!grade) return [];
  const open = grade.outcomes.filter((o) => o.source === 'manual' && !o.known);
  return open.length ? open : grade.outcomes.filter((o) => o.source === 'manual');
}

/** The manual criteria, as questions, when there is no grade to read them off. */
function manualFromTable(vi: boolean): CriterionAsk[] {
  return GRADE_CRITERIA.filter((c) => c.source === 'manual').map((c) => ask(c.key, c.authority, c.weight, vi));
}

/**
 * One question.
 *
 * `how` is the FULL explanation from `gradeWords`, not a trimmed sentence. It is the longest
 * thing in the prompt and it is the reason the prompt works: "no heavy overhead supply" is a
 * phrase two readers score differently, and the paragraph is what this app means by it —
 * which is also what the Learn book shows the user, so the model and the user are held to one
 * definition. Five questions is the ceiling, and five paragraphs still leaves the prompt
 * inside the URL budget `chatGptAskUrl` works with.
 */
function ask(key: string, authority: string, weight: number, vi: boolean): CriterionAsk {
  const why = criterionWhy(key, vi);
  return {
    key,
    label: criterionLabel(key, vi),
    authority,
    weight,
    ...(why ? { how: why } : {}),
  };
}

/** What the app measured itself, handed over so the model can contradict it. */
function measuredNotes(grade: GradeResult | null, vi: boolean): MeasuredNote[] {
  if (!grade) return [];
  return grade.outcomes
    .filter((o) => o.source === 'auto' && o.known)
    .map((o) => ({ label: criterionLabel(o.key, vi), met: o.met, measured: o.measured }));
}

/** The card as the prompt's input. Exported for the dialog and for tests. */
export function criteriaAskContext(card: CriteriaAskCard): CriteriaPromptContext {
  const open = unansweredManual(card.grade);
  const asks = open.length
    ? open.map((o) => ask(o.key, o.authority, o.weight, card.vi))
    : manualFromTable(card.vi);
  return {
    symbol: card.symbol,
    date: card.date,
    setup: card.setupLabel ?? null,
    entry: card.entry,
    stop: card.stop,
    target: card.target,
    cur: card.cur,
    grade: card.effective,
    score: card.grade?.score ?? null,
    unknownWeight: card.grade?.unknownWeight ?? null,
    measured: measuredNotes(card.grade, card.vi),
    asks,
  };
}

/**
 * The research, as HTML to append to the plan's note.
 *
 * ── WHY THE EVIDENCE LINES GO IN TOO, NOT ONLY THE SUMMARY ──────────────────
 * The user asked for the summary ("mot doan summary cuoi cung de user co the copy va paste
 * vao note"), and the summary alone would be the prettier note. But this reply has just
 * changed five ticks, and a tick with no provenance is indistinguishable from a guess when the
 * card is reopened next month — especially on a case study, where the entire value is being
 * able to say what was known ON that date. So each answer is written down with the one line of
 * evidence it came with, above the paragraph.
 *
 * Pure, and therefore the one part of this module that can be tested.
 */
export function criteriaNoteHtml(
  reply: ParsedCriteriaReply,
  asks: readonly CriterionAsk[],
  date: string,
  vi: boolean,
): string {
  const label = (key: string): string => asks.find((a) => a.key === key)?.label ?? criterionLabel(key, vi);
  const rows: string[] = [];
  for (const [key, val] of Object.entries(reply.answers)) {
    const why = reply.evidence[key];
    rows.push(`<li><b>${val ? t('wl.plan.yes') : t('wl.plan.no')}</b> — ${esc(label(key))}${why ? `: ${esc(why)}` : ''}</li>`);
  }
  for (const key of reply.unknown) {
    const why = reply.evidence[key];
    rows.push(`<li><b>?</b> — ${esc(label(key))}${why ? `: ${esc(why)}` : ''}</li>`);
  }
  // Blank lines separate paragraphs; a single newline inside one is a wrap, not a break.
  const paras = reply.summary
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, ' ')}</p>`)
    .join('');
  if (!rows.length && !paras) return '';
  return `<h3>${esc(t('wl.plan.ask.notehead').replace('{date}', date))}</h3>`
    + (rows.length ? `<ul>${rows.join('')}</ul>` : '')
    + paras;
}

/**
 * What came back, together with the questions it answers.
 *
 * The `asks` travel with the reply on purpose: the note is written from BOTH, and rebuilding
 * the question list at the call site would rebuild it from a checklist the answers have by
 * then already changed — so a criterion that has just been answered would be labelled from a
 * list it is no longer on.
 */
export interface CriteriaAskResult {
  reply: ParsedCriteriaReply;
  asks: readonly CriterionAsk[];
}

/**
 * Ask, wait, and hand back what came home — or null if the user closed it.
 *
 * ── WHY ONE DIALOG AND NOT TWO BUTTONS ─────────────────────────────────────
 * The ask and the paste are one errand with a gap in the middle: the user presses Ask, reads
 * in another tab, comes back and pastes. Two separate buttons on the card would make the
 * second one look like it does nothing until the first has been used, and would lose the list
 * of what was actually asked — which is what the pasted reply has to be checked against. So
 * the dialog stays open across the gap and holds both halves.
 *
 * ── WHY A BAD PASTE DOES NOT CLOSE IT ──────────────────────────────────────
 * If nothing parses, the dialog says so and keeps the text. Closing on an unrecognised reply
 * would throw away a wall of research the user cannot get back without asking again.
 */
export function openCriteriaAsk(
  card: CriteriaAskCard,
  /**
   * `ctx` lets "Ask Assistant" run the app's own model and stream its answer straight into the
   * paste box — the same errand without the other tab. `auto` presses it on open (the planner's
   * own Ask Assistant button).
   */
  opts: { ctx: AppContext; auto?: boolean },
): Promise<CriteriaAskResult | null> {
  const ctx = criteriaAskContext(card);
  const prompt = buildCriteriaPrompt(ctx, card.vi ? 'vi' : 'en');
  const keys = ctx.asks.map((a) => a.key);
  const items = ctx.asks
    .map((a) => `<li>${esc(a.label)} <span class="muted">· ${a.weight ?? 0}</span></li>`)
    .join('');

  return new Promise<CriteriaAskResult | null>((resolve) => {
    const host = document.createElement('div');
    host.className = 'dialog-host';
    host.innerHTML = `
      <div class="dialog-backdrop"></div>
      <div class="dialog ask-crit" style="width:min(680px,96vw)">
        <div class="dialog-title">🤖 ${esc(card.symbol)} · ${t('wl.plan.ask.ttl')}</div>
        <div class="dialog-body">
          <p class="ask-crit-lead">${t('wl.plan.ask.lead').replace('{date}', esc(card.date))}</p>
          <ul class="ask-crit-qs">${items}</ul>
          <div style="margin:10px 0 12px">${promptActsHtml({ ask: 'data-act="ask"', assistant: 'data-act="assist"', copy: 'data-act="copy"' })}</div>
          <label class="field-label">${t('wl.plan.ask.paste')}</label>
          <textarea class="field ask-crit-reply" data-reply rows="8"
            placeholder="${t('wl.plan.ask.pasteph')}"></textarea>
          <div class="ask-crit-msg muted" data-msg></div>
        </div>
        <div class="dialog-actions">
          <button class="btn-outline" data-act="cancel">${t('wl.plan.ask.cancel')}</button>
          <button class="btn" data-act="apply">${t('wl.plan.ask.apply')}</button>
        </div>
      </div>`;
    document.body.appendChild(host);

    const box = host.querySelector<HTMLTextAreaElement>('[data-reply]')!;
    const msg = host.querySelector<HTMLElement>('[data-msg]')!;
    let run: AbortController | null = null;
    const done = (r: CriteriaAskResult | null): void => {
      run?.abort();
      host.remove();
      document.removeEventListener('keydown', onKey);
      resolve(r);
    };
    // No Enter-to-submit: the one control here is a textarea full of newlines.
    const onKey = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') done(null); };

    host.querySelector('[data-act="ask"]')!.addEventListener('click', (ev) => {
      askChatGpt(prompt, ev.currentTarget as HTMLElement);
    });
    // A second press stops it. The reply streams into the box as it is written, so what came
    // back before a stop is still there to read, edit or apply.
    const assist = host.querySelector<HTMLElement>('[data-act="assist"]')!;
    const runAssistant = async (): Promise<void> => {
      if (run) {
        run.abort();
        return;
      }
      const ctrl = (run = new AbortController());
      const lbl = lblOf(assist);
      const old = lbl.textContent ?? '';
      lbl.textContent = t('prompts.assist.stop');
      msg.classList.remove('bad');
      msg.textContent = t('prompts.assist.running');
      box.value = '';
      const res = await askAssistantText(opts.ctx, prompt, (c) => {
        box.value += c;
        box.scrollTop = box.scrollHeight;
      }, ctrl.signal).catch((e: unknown) => ({ kind: 'error' as const, message: String(e).slice(0, 300), tools: [] }));
      run = null;
      lbl.textContent = old;
      if (!host.isConnected) return;
      if (!res) {
        msg.textContent = t('prompts.assist.nokey');
        msg.classList.add('bad');
      } else if (res.kind === 'answer') {
        box.value = res.text;
        msg.textContent = t('prompts.assist.done');
      } else {
        msg.textContent = res.message;
        msg.classList.add('bad');
      }
    };
    assist.addEventListener('click', () => void runAssistant());
    host.querySelector('[data-act="copy"]')!.addEventListener('click', (ev) => {
      void copyToClipboard(prompt, ev.currentTarget as HTMLElement);
    });
    host.querySelector('[data-act="apply"]')!.addEventListener('click', () => {
      const reply = parseCriteriaAnswers(box.value, keys);
      const found = Object.keys(reply.answers).length + reply.unknown.length;
      if (!found && !reply.summary) {
        msg.textContent = t('wl.plan.ask.none');
        msg.classList.add('bad');
        return;
      }
      done({ reply, asks: ctx.asks });
    });
    host.querySelector('[data-act="cancel"]')!.addEventListener('click', () => done(null));
    host.querySelector('.dialog-backdrop')!.addEventListener('click', () => done(null));
    document.addEventListener('keydown', onKey);
    box.focus();
    if (opts.auto) void runAssistant();
  });
}
