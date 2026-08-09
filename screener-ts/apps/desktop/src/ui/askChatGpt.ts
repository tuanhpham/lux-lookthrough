/**
 * The shared "Ask ChatGPT" mechanism — the configured GPT link, the click
 * behaviour, and the clipboard feedback.
 *
 * Extracted from `promptSection.ts` once three places needed it: the stock modal's
 * research prompts, a Case Study, and the Playbook's prompt library. The GPT link
 * is one setting, so it has to live in one module; duplicating the storage key
 * would let two copies drift and leave the user wondering which screen honours
 * their configuration.
 *
 * ── WHAT THIS CAN AND CANNOT DO ─────────────────────────────────────────────
 * There is NO API for a custom GPT on chatgpt.com. `?q=` pre-fills and submits on
 * the PLAIN chat page; a custom GPT ignores it. Actually running a prompt inside
 * your own GPT therefore needs code on the ChatGPT tab, which is what
 * `screener-ts/extension/` is — the app opts in per click via the `#tp-autorun`
 * fragment that `chatGptAskUrl` appends.
 *
 * So every ask does BOTH: prompt in the URL, and prompt on the clipboard. The copy
 * is not belt-and-braces — the extension is optional and depends on ChatGPT's
 * markup, which OpenAI can change without notice. The button says "Opening", never
 * "Sent", because this code cannot observe whether the extension ran.
 */
import {
  chatGptAskUrl,
  chatGptUrl,
  isCustomGptUrl,
  DEFAULT_CHATGPT_URL,
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

/** Cached across renders so the first paint doesn't wait on storage. */
let gptUrl: string | null = null;

export async function loadGptUrl(ctx: AppContext): Promise<void> {
  gptUrl = await ctx.storage.get<string>(GPT_URL_KEY).catch(() => null);
}

/** The configured link, or null when the plain chat page is in use. */
export function currentGptUrl(): string | null {
  return gptUrl;
}

/** True when the user pointed this at their own GPT rather than plain chat. */
export function hasCustomGpt(): boolean {
  return isCustomGptUrl(chatGptUrl(gptUrl));
}

/**
 * Open ChatGPT with `prompt`, and copy it either way.
 *
 * `btn` gets a transient confirmation label. Copy runs FIRST and the window opens
 * in `finally`: if the extension isn't installed, or ChatGPT ignores the
 * parameter, the clipboard is the only thing standing between the user and an
 * empty composer — and a popup opening first can steal focus and make the
 * clipboard write fail.
 */
export function askChatGpt(prompt: string, btn: HTMLElement): void {
  const ask = chatGptAskUrl(prompt, gptUrl, { autorun: true });
  void copyToClipboard(prompt, btn, ask.embedded).finally(() => {
    window.open(ask.url, '_blank', 'noopener,noreferrer');
  });
}

/**
 * Copy with a confirmation on the button itself.
 *
 * The clipboard API rejects when the document isn't focused or permission is
 * refused, which happens often enough on iOS that failing silently would look like
 * the button doing nothing.
 *
 * `sent` distinguishes the two ask outcomes. When the prompt travelled in the URL
 * the button says the tab is opening; when it was too long to carry, it must say
 * the prompt is on the clipboard instead — implying it was sent would have the user
 * waiting for an answer to a question that was never asked.
 */
export async function copyToClipboard(
  text: string,
  btn: HTMLElement,
  sent?: boolean,
): Promise<void> {
  const old = btn.textContent ?? '';
  const vi = getLang() === 'vi';
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent =
      sent === undefined ? t('prompts.copied') : sent ? t('prompts.sent') : t('prompts.toolong');
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
export async function configureGpt(ctx: AppContext, repaint: () => void): Promise<void> {
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

/**
 * The `★ My GPT` / `ChatGPT` badge plus a "Set my GPT" button, as one row.
 *
 * Shared so all three call sites show the same state — a user who configured a GPT
 * in the stock modal should see it reflected in Case Studies without wondering
 * whether each screen has its own setting. Wire the button with
 * `wireGptBadge(host, ctx, repaint)`.
 */
export function gptBadgeHtml(): string {
  return `
    <div class="row" style="margin-bottom:10px;gap:8px;flex-wrap:wrap">
      <span class="badge">${hasCustomGpt() ? `★ ${t('prompts.gpt.custom')}` : 'ChatGPT'}</span>
      <button data-gpt-config class="range-btn">${t('prompts.gpt.set')}</button>
    </div>`;
}

/** Wire every `[data-gpt-config]` inside `host` to the configure dialog. */
export function wireGptBadge(host: HTMLElement, ctx: AppContext, repaint: () => void): void {
  host.querySelectorAll<HTMLElement>('[data-gpt-config]').forEach((b) =>
    b.addEventListener('click', () => void configureGpt(ctx, repaint)),
  );
}
