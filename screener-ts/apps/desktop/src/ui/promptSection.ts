/**
 * The "Research prompts" section of the stock modal.
 *
 * Four prompts (market context, dated catalysts, accumulation, fundamentals),
 * each pre-filled with the numbers the modal already measured, plus a Copy button
 * and an "Ask ChatGPT" button that opens the user's own custom GPT.
 *
 * ── WHY "ASK CHATGPT" COPIES INSTEAD OF PRE-FILLING ─────────────────────────
 * ChatGPT's `?q=` parameter pre-fills the composer on the PLAIN chat URL only; on
 * a custom GPT link (`/g/g-…`) it is ignored. So a link-only implementation would
 * silently drop the prompt for exactly the user who configured a custom GPT and
 * leave them staring at an empty box. Copy-then-open always works, on every host,
 * and the hint text says so rather than leaving the paste step to be guessed.
 *
 * The prompt text itself is built in core (`buildResearchPrompts`) and is fully
 * tested there. This file is the DOM and the storage around it.
 */
import {
  buildResearchPrompts,
  chatGptUrl,
  isCustomGptUrl,
  DEFAULT_CHATGPT_URL,
  type ResearchPrompt,
  type StockPromptContext,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { t, getLang } from './i18n.js';
import { formDialog } from './forms.js';

/**
 * Where the configured GPT link lives.
 *
 * A plain (syncable) key, so setting it once on the phone applies on the laptop —
 * it is a preference, not a device cache. It is NOT under `sync:`; that prefix is
 * reserved for the access code, which must never leave the device.
 */
const GPT_URL_KEY = 'chatgpt_url';

/** Cached across modal opens so the first paint doesn't wait on storage. */
let gptUrl: string | null = null;

export async function loadGptUrl(ctx: AppContext): Promise<void> {
  gptUrl = await ctx.storage.get<string>(GPT_URL_KEY).catch(() => null);
}

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
    const target = chatGptUrl(gptUrl);
    const custom = isCustomGptUrl(target);
    host.innerHTML = `
      <div class="section-title">${t('prompts.title')}</div>
      <p class="muted" style="margin:-6px 0 10px;font-size:12px;line-height:1.55">${t('prompts.sub')}</p>
      <div class="row" style="margin-bottom:10px;gap:8px;flex-wrap:wrap">
        <span class="badge">${custom ? `★ ${t('prompts.gpt.custom')}` : 'ChatGPT'}</span>
        <button id="gpt-config" class="range-btn">${t('prompts.gpt.set')}</button>
      </div>
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
        if (!p) return;
        // Copy FIRST, then open. If the copy fails the user still gets the tab and
        // a visible "copy failed" state, rather than an opened tab and nothing to
        // paste with no explanation.
        void copyToClipboard(p.body, btn).finally(() => {
          window.open(target, '_blank', 'noopener,noreferrer');
        });
      });
    });

    host.querySelector('#gpt-config')!.addEventListener('click', () => void configureGpt(ctx, paint));
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

/**
 * Copy with a confirmation on the button itself.
 *
 * The clipboard API rejects when the document isn't focused or permission is
 * refused, which happens often enough on iOS that failing silently would look
 * like the button doing nothing. The prompt panel is then expanded so the text is
 * at least selectable by hand.
 */
async function copyToClipboard(text: string, btn: HTMLElement): Promise<void> {
  const old = btn.textContent ?? '';
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = t('prompts.copied');
  } catch {
    btn.textContent = getLang() === 'vi' ? 'Không chép được' : 'Copy failed';
  }
  setTimeout(() => {
    btn.textContent = old;
  }, 1400);
}

/**
 * The "Set my GPT" dialog.
 *
 * An empty value clears the setting (back to plain ChatGPT) — that is a real
 * intent, not a no-op. A non-empty value is run through `chatGptUrl`, which only
 * accepts https URLs on ChatGPT's own hosts; anything else is REFUSED with a
 * message rather than quietly falling back, because silently ignoring what the
 * user pasted is how they end up wondering why the button opens the wrong page.
 */
async function configureGpt(ctx: AppContext, repaint: () => void): Promise<void> {
  const res = await formDialog(t('prompts.gpt.title'), [
    {
      key: 'url',
      label: t('prompts.gpt.label'),
      value: gptUrl ?? '',
      placeholder: 'https://chatgpt.com/g/g-…',
    },
    { key: 'help', type: 'info', label: '', value: t('prompts.gpt.help') },
  ]);
  if (!res) return;

  const raw = (res.url ?? '').trim();
  if (!raw) {
    gptUrl = null;
    await ctx.storage.delete(GPT_URL_KEY).catch(() => {});
    repaint();
    return;
  }
  const accepted = chatGptUrl(raw);
  // `chatGptUrl` signals refusal by returning the default, which is ambiguous when
  // the user genuinely typed the default — hence the second test. Without it,
  // pasting `https://chatgpt.com/` would draw a "not accepted" warning for a link
  // that was, in fact, accepted.
  if (accepted === DEFAULT_CHATGPT_URL && !/^https:\/\/(www\.)?chatgpt\.com\/?$/i.test(raw)) {
    alert(t('prompts.gpt.rejected'));
    return;
  }
  gptUrl = accepted;
  await ctx.storage.set(GPT_URL_KEY, accepted).catch(() => {});
  repaint();
}
