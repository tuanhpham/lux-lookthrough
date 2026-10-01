/**
 * The button row under every prompt: Ask ChatGPT, Ask Assistant, Copy, Show prompt.
 *
 * Each screen used to build its own row out of whatever class was nearest: a `.btn`, a
 * `.btn-outline` and a `.range-btn`, which are three different heights, so "Show prompt" sat
 * visibly smaller than the two beside it. One builder means one size, and the same order and
 * icons on the stock page, in Case Studies, in the Playbook and in the planner's criteria box.
 *
 * Markup only. The attribute strings are the caller's (`data-prompt-ask="2"`, `id="cs-ask-go"`),
 * so each screen wires its own buttons exactly as before. Labels sit in a `[data-lbl]` span,
 * which is what `copyToClipboard` and the show/hide toggles rewrite — rewriting the button's
 * whole text would delete its icon.
 */
import { t } from './i18n.js';
import { cbIcon, type CbIcon } from './commandBar.js';

export interface PromptActs {
  ask?: string;
  assistant?: string;
  copy?: string;
  show?: string;
}

export function paBtn(cls: string, attr: string, icon: CbIcon, label: string, title = ''): string {
  return `<button type="button" class="pa-btn${cls ? ' ' + cls : ''}" ${attr}${title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''}>${cbIcon(icon, 14)}<span data-lbl>${label}</span></button>`;
}

/** `extra`: further `paBtn`s for the end of the row (the Playbook's Edit / Delete). */
export function promptActsHtml(a: PromptActs, extra = ''): string {
  const parts = [
    a.ask ? paBtn('pa-btn--gpt', a.ask, 'spark', t('prompts.ask')) : '',
    a.assistant ? paBtn('pa-btn--bot', a.assistant, 'bot', t('prompts.assist'), t('prompts.assist.help')) : '',
    a.copy ? paBtn('', a.copy, 'copy', t('prompts.copy')) : '',
    a.show ? paBtn('', a.show, 'eye', t('prompts.show')) : '',
  ];
  return `<div class="pa-row">${parts.join('')}${extra}</div>`;
}

/** The label to rewrite: the `[data-lbl]` span when the button has one, else the button. */
export function lblOf(btn: HTMLElement): HTMLElement {
  return btn.querySelector<HTMLElement>('[data-lbl]') ?? btn;
}
