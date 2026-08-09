/**
 * The "Research prompts" section of the stock modal.
 *
 * Four prompts (market context, dated catalysts, accumulation, fundamentals), each
 * pre-filled with the numbers the modal already measured, plus a Copy button and an
 * "Ask ChatGPT" button.
 *
 * The ask mechanism, the configured GPT link and the clipboard feedback live in
 * `askChatGpt.ts` — shared with Case Studies and the Playbook, since the GPT link
 * is a single setting and must not be duplicated per screen.
 *
 * The prompt text itself is built in core (`buildResearchPrompts`) and is fully
 * tested there. This file is the DOM around it.
 */
import { buildResearchPrompts, type ResearchPrompt, type StockPromptContext } from '@screener/core';
import type { AppContext } from '../context.js';
import { t, getLang } from './i18n.js';
import { askChatGpt, copyToClipboard, gptBadgeHtml, wireGptBadge } from './askChatGpt.js';

export { loadGptUrl } from './askChatGpt.js';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Render the section into `host` and wire its buttons.
 *
 * `ctx` is only needed for the "Set my GPT" dialog; everything else is local.
 */
export function renderPromptSection(
  host: HTMLElement,
  ctx: AppContext,
  context: StockPromptContext,
): void {
  const lang = getLang();
  const prompts = buildResearchPrompts(context, lang);

  const paint = (): void => {
    host.innerHTML = `
      <div class="section-title">${t('prompts.title')}</div>
      <p class="muted" style="margin:-6px 0 10px;font-size:12px;line-height:1.55">${t('prompts.sub')}</p>
      ${gptBadgeHtml()}
      ${prompts.map((p, i) => promptCardHtml(p, i)).join('')}
      <p class="muted" style="font-size:11px;margin:8px 0 0;line-height:1.55">${t('prompts.disclaimer')}</p>`;

    host.querySelectorAll<HTMLElement>('[data-prompt-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const box = host.querySelector<HTMLElement>(`#prompt-text-${btn.dataset.promptToggle}`);
        if (!box) return;
        const hidden = box.classList.toggle('hidden');
        btn.textContent = hidden ? t('prompts.show') : t('prompts.hide');
      });
    });

    host.querySelectorAll<HTMLElement>('[data-prompt-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = prompts[Number(btn.dataset.promptCopy)];
        if (p) void copyToClipboard(p.body, btn);
      });
    });

    host.querySelectorAll<HTMLElement>('[data-prompt-ask]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = prompts[Number(btn.dataset.promptAsk)];
        if (p) askChatGpt(p.body, btn);
      });
    });

    wireGptBadge(host, ctx, paint);
  };

  paint();
}

function promptCardHtml(p: ResearchPrompt, i: number): string {
  return `
    <div class="card" style="margin-bottom:10px;padding:12px">
      <div style="font-weight:600;font-size:13px">${i + 1}. ${esc(p.title)}</div>
      <p class="muted" style="margin:4px 0 8px;font-size:12px;line-height:1.5">${esc(p.goal)}</p>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn" data-prompt-ask="${i}">${t('prompts.ask')}</button>
        <button class="btn-outline" data-prompt-copy="${i}">${t('prompts.copy')}</button>
        <button class="range-btn" data-prompt-toggle="${i}">${t('prompts.show')}</button>
      </div>
      <pre id="prompt-text-${i}" class="hidden" style="white-space:pre-wrap;font-size:11px;line-height:1.5;
        background:var(--surface);border-radius:8px;padding:10px;margin:10px 0 0;max-height:280px;overflow:auto">${esc(p.body)}</pre>
      <p class="muted" style="font-size:10px;margin:8px 0 0;line-height:1.5">${t('prompts.ask.hint')}</p>
    </div>`;
}
