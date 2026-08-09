/**
 * The "Research prompts" section of the stock modal.
 *
 * Four prompts (market context, dated catalysts, accumulation, fundamentals),
 * each pre-filled with the numbers the modal already measured, plus a Copy button
 * and an "Ask ChatGPT" button that opens the user's own custom GPT with the
 * question already in the composer.
 *
 * ── HOW FAR AUTOMATION CAN GO HERE, AND WHY ─────────────────────────────────
 * There is NO API for a custom GPT on chatgpt.com. OpenAI does not expose one, so
 * nothing can drive your GPT programmatically; the only mechanism available is the
 * `?q=` URL parameter, which pre-fills the composer (and on the plain chat URL
 * also submits). Whether the custom-GPT page consumes it is OpenAI's behaviour to
 * decide and has changed before.
 *
 * So the button does both: it puts the prompt in the URL AND copies it. The copy
 * is not redundancy for its own sake — it is what keeps the feature honest on the
 * day the parameter stops working. Relying on `?q=` alone would fail silently, on
 * someone else's deploy schedule, leaving an empty composer and nothing to paste.
 * The UI states which of the two happened rather than implying the question was
 * definitely sent.
 *
 * The prompt text itself is built in core (`buildResearchPrompts`) and is fully
 * tested there. This file is the DOM and the storage around it.
 */
import {
  buildResearchPrompts,
  chatGptAskUrl,
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
    // Only for the badge — the per-prompt URL is built at click time by
    // chatGptAskUrl, which appends the question to this same validated base.
    const custom = isCustomGptUrl(chatGptUrl(gptUrl));
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
        const ask = chatGptAskUrl(p.body, gptUrl);
        // Copy FIRST, then open — and copy even when the prompt IS in the URL. If
        // ChatGPT ignores `?q=` on a custom GPT, the clipboard is the only thing
        // standing between the user and an empty composer. Opening in a popup that
        // the copy failure could pre-empt is the one ordering to avoid, hence
        // `finally`.
        void copyToClipboard(p.body, btn, ask.embedded).finally(() => {
          window.open(ask.url, '_blank', 'noopener,noreferrer');
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
 * like the button doing nothing.
 *
 * `sent` distinguishes the two Ask outcomes. When the prompt travelled in the URL
 * the button says so; when it was too long to carry, it must say the prompt is on
 * the clipboard instead — telling the user "sent" in that case would have them
 * waiting for an answer to a question that was never asked.
 */
async function copyToClipboard(text: string, btn: HTMLElement, sent?: boolean): Promise<void> {
  const old = btn.textContent ?? '';
  const vi = getLang() === 'vi';
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent =
      sent === undefined
        ? t('prompts.copied')
        : sent
          ? t('prompts.sent')
          : t('prompts.toolong');
  } catch {
    // The URL still carries the prompt when `sent`, so a copy failure is harmless
    // there; when it doesn't, this is the path where the user is left with nothing
    // and has to be told to open the prompt and select it by hand.
    btn.textContent = sent ? t('prompts.sent') : vi ? 'Không chép được' : 'Copy failed';
  }
  setTimeout(() => {
    btn.textContent = old;
  }, 1800);
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
