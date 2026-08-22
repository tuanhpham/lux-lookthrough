/**
 * The assistant panel: a slide-over column with a transcript and a composer.
 *
 * ── WHY A PANEL AND NOT A TAB ───────────────────────────────────────────────
 * Every question the assistant gets is about something on screen — this position,
 * this screener row, this account. A tab would replace the thing being asked about
 * with a chat window, so the answer arrives once the context is gone. The panel
 * sits beside the app and the tab underneath keeps working.
 *
 * ── WHAT THE PANEL IS HONEST ABOUT ──────────────────────────────────────────
 * Three things, each of which a chat UI usually hides:
 *   • WHICH TOOL RAN. A chip per call, so an answer about "your positions" can be
 *     traced to `list_positions` rather than taken on faith.
 *   • WHAT IT COST. Tokens and, when prices are configured, dollars — per turn and
 *     for the conversation. A metered API with an invisible meter is how a user
 *     ends up surprised by a bill.
 *   • WHEN NO MODEL WAS INVOLVED. Tier-0 answers carry a badge. They are the app's
 *     own numbers, and pretending a model produced them would misplace both the
 *     credit and the blame.
 * Provider errors are shown VERBATIM. "Something went wrong" is useless; "your
 * credit balance is too low" tells the user exactly what to do.
 *
 * ── AND WHAT IT OFFERS WHEN THERE IS NO KEY ─────────────────────────────────
 * The panel still opens and Tier 0 still answers, because those questions never
 * needed an API. Everything else offers the Ask ChatGPT handoff — the app packs the
 * numbers into a prompt and the user's own subscription does the thinking, for no
 * tokens. That is the cheapest rung on the ladder and the reason Ask ChatGPT stays.
 */
import {
  buildHandoffPrompt,
  renderAssistantMarkdown,
  type LlmConfig,
  type TokenUsage,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { AssistantSession, type AskResult, type ToolTrace } from '../ai/agent.js';
import { execRead } from '../ai/toolExec.js';
import { renderLocalAnswer } from '../ai/localAnswer.js';
import { getApiKey, loadLlmConfig, isConfigured } from '../ai/llmClient.js';
import { openLlmSettings, onLlmConfigChange } from './llmSettings.js';
import { askChatGpt } from './askChatGpt.js';
import { t, onLangChange } from './i18n.js';
import { accounts } from '../portfolio/store.js';

let host: HTMLElement | null = null;
let session: AssistantSession | null = null;
let cfg: LlmConfig | null = null;
let ready = false;
let inFlight: AbortController | null = null;
/**
 * One question at a time — including the no-key path.
 *
 * `inFlight` is not enough on its own: a Tier-0 price lookup calls the data
 * provider, so it takes real time while never creating an AbortController. Without
 * this flag a second Enter would queue a second "Thinking…" row and only one of
 * them would ever be removed.
 */
let busy = false;
/** Page-lifetime listeners are registered once, not once per open. */
let globalsWired = false;
/** The last question, so a failed turn can be retried without retyping it. */
let lastAsked = '';

// ── shell ────────────────────────────────────────────────────────────────────

function icon(path: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">${path}</svg>`;
}
const GEAR = icon('<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2m0 14v2m-9-9h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4"/>');
const NEW = icon('<path d="M12 5v14M5 12h14"/>');

function build(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'chat-panel';
  el.innerHTML = `
    <div class="chat-backdrop" data-act="close"></div>
    <aside class="chat-shell" role="dialog" aria-label="${t('chat.title')}">
      <header class="chat-head">
        <div class="chat-head-main">
          <span class="chat-title">${t('chat.title')}</span>
          <span class="chat-model" data-role="model"></span>
        </div>
        <div class="chat-head-actions">
          <span class="chat-meter" data-role="meter" title="${t('chat.meter.help')}"></span>
          <button class="chat-icon" data-act="new" title="${t('chat.new')}">${NEW}</button>
          <button class="chat-icon" data-act="settings" title="${t('ai.settings.title')}">${GEAR}</button>
          <button class="chat-icon" data-act="close" aria-label="${t('chat.close')}">✕</button>
        </div>
      </header>
      <div class="chat-log" data-role="log"></div>
      <div class="chat-composer">
        <textarea class="chat-input" data-role="input" rows="1"
          placeholder="${t('chat.placeholder')}"></textarea>
        <div class="chat-composer-actions">
          <button class="chat-gpt" data-act="askgpt" title="${t('chat.askgpt.help')}">${t('chat.askgpt')}</button>
          <button class="chat-send" data-act="send">${t('chat.send')}</button>
        </div>
      </div>
      <div class="chat-foot">${t('chat.disclaimer')}</div>
    </aside>`;
  document.body.appendChild(el);
  wire(el);
  return el;
}

function wire(el: HTMLElement): void {
  el.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset['act'];
    if (act === 'close') closeChatPanel();
    else if (act === 'send') void submit();
    else if (act === 'new') startNew();
    else if (act === 'settings') void openLlmSettings(ctxRef!);
    else if (act === 'askgpt') void handoff(e.target as HTMLElement);
    else if (act === 'suggest') {
      const q = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')!.dataset['q'] ?? '';
      const input = field();
      input.value = q;
      void submit();
    }
    else if (act === 'retry') {
      const input = field();
      input.value = lastAsked;
      void submit();
    }
  });

  const input = el.querySelector<HTMLTextAreaElement>('[data-role="input"]')!;
  input.addEventListener('keydown', (e) => {
    // Enter sends, Shift+Enter is a newline: the convention every chat UI uses, and
    // getting it backwards is the most annoying possible bug in a composer.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
      return;
    }
    if (e.key === 'Escape') closeChatPanel();
  });
  // Grow with the text, to a point — a composer that eats the transcript is worse
  // than one that scrolls.
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  });
}

const field = (): HTMLTextAreaElement =>
  host!.querySelector<HTMLTextAreaElement>('[data-role="input"]')!;
const log = (): HTMLElement => host!.querySelector<HTMLElement>('[data-role="log"]')!;

let ctxRef: AppContext | null = null;

// ── open / close ─────────────────────────────────────────────────────────────

export function isChatOpen(): boolean {
  return !!host?.classList.contains('chat--open');
}

export async function openChatPanel(ctx: AppContext): Promise<void> {
  ctxRef = ctx;
  if (!host) host = build();
  // Registered once per page, not per open: `onLlmConfigChange`/`onLangChange` have
  // no unsubscribe, so re-registering on every open would run the same rebuild
  // several times over and leak a listener per visit.
  if (!globalsWired) {
    globalsWired = true;
    // The connection can change while the panel is open; the next question must use
    // the new provider, not the one the session was built against.
    onLlmConfigChange(() => void refreshConfig());
    // A language switch rebuilds the shell. The transcript goes with it — half a
    // conversation in each language reads like a bug.
    onLangChange(() => {
      const wasOpen = isChatOpen();
      host?.remove();
      host = null;
      startNewState();
      if (wasOpen && ctxRef) void openChatPanel(ctxRef);
    });
  }
  await refreshConfig();
  host.classList.add('chat--open');
  render();
  setTimeout(() => field().focus(), 60);
}

export function closeChatPanel(): void {
  // An in-flight request is abandoned rather than left running: the user closed the
  // panel, and a reply landing into a hidden transcript still costs money.
  inFlight?.abort();
  inFlight = null;
  host?.classList.remove('chat--open');
}

function startNewState(): void {
  session?.reset();
  session = null;
  entries.length = 0;
  lastAsked = '';
}

function startNew(): void {
  startNewState();
  render();
}

/** Identifies the connection a transcript was produced against. */
const keyOf = (c: LlmConfig | null): string => (c ? `${c.providerId}/${c.model}` : '');

async function refreshConfig(): Promise<void> {
  const next = await loadLlmConfig(ctxRef!);
  const changed = keyOf(next) !== keyOf(cfg);
  cfg = next;
  const key = cfg ? await getApiKey(ctxRef!, cfg.providerId) : '';
  ready = isConfigured(cfg, !!key);
  // A CHANGED connection means a new session: the transcript belongs to the model
  // that produced it, and replaying it at a different one would bill the new
  // provider for the old one's output. An unchanged one keeps the conversation, so
  // closing and reopening the panel does not silently discard it.
  if (changed) startNewState();
  // Not configured: drop the session but KEEP the visible transcript. Any answer in
  // it came from Tier 0, which never needed a key and is still true.
  if (!ready) session = null;
  else if (cfg && !session) session = new AssistantSession(ctxRef!, cfg);
  if (host) {
    const badge = host.querySelector<HTMLElement>('[data-role="model"]')!;
    badge.textContent = ready ? (cfg?.model ?? '') : t('chat.notconfigured');
    badge.classList.toggle('chat-model--off', !ready);
  }
}

// ── transcript ───────────────────────────────────────────────────────────────

type Entry =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; local: boolean; truncated: boolean; tools: ToolTrace[]; usage?: TokenUsage; costUsd?: number | null }
  | { role: 'error'; text: string; canRetry: boolean }
  /** The row that is being written into: the placeholder, then the streamed text. */
  | { role: 'pending'; text: string };

const entries: Entry[] = [];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toolChips(tools: readonly ToolTrace[]): string {
  if (!tools.length) return '';
  return `<div class="chat-chips">${tools
    .map((tr) => {
      const args = Object.entries(tr.args)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      return `<span class="chat-chip${tr.ok ? '' : ' chat-chip--bad'}" title="${esc(args)}">${esc(tr.name)}</span>`;
    })
    .join('')}</div>`;
}

/** Tokens, and dollars only when the price is known — never a guessed figure. */
function costLine(usage?: TokenUsage, costUsd?: number | null): string {
  if (!usage) return '';
  const tok = `${usage.inputTokens + usage.outputTokens} ${t('chat.tokens')}`;
  const usd = costUsd === null || costUsd === undefined ? '' : ` · $${costUsd.toFixed(costUsd < 0.01 ? 4 : 3)}`;
  return `<div class="chat-cost">${tok}${usd}</div>`;
}

const SUGGESTIONS = ['chat.s1', 'chat.s2', 'chat.s3', 'chat.s4'];

function emptyState(): string {
  return `
    <div class="chat-empty">
      <p class="chat-empty-title">${t('chat.empty.title')}</p>
      <p class="chat-empty-hint">${t(ready ? 'chat.empty.hint' : 'chat.empty.nokey')}</p>
      <div class="chat-suggests">
        ${SUGGESTIONS.map((k) => {
          const q = t(k);
          return `<button class="chat-suggest" data-act="suggest" data-q="${esc(q)}">${esc(q)}</button>`;
        }).join('')}
      </div>
    </div>`;
}

function render(): void {
  if (!host) return;
  const box = log();
  if (!entries.length) {
    box.innerHTML = emptyState();
    updateMeter();
    return;
  }
  box.innerHTML = entries
    .map((e) => {
      if (e.role === 'user') return `<div class="chat-msg chat-msg--user">${esc(e.text)}</div>`;
      if (e.role === 'pending') {
        // Escaped and NOT run through the markdown renderer while it streams: half a
        // table or an unclosed `**` renders as garbage that reflows on every token.
        // The finished answer is re-rendered as markdown the moment it lands.
        return e.text
          ? `<div class="chat-msg chat-msg--bot chat-stream" data-role="pending">${esc(e.text)}</div>`
          : `<div class="chat-msg chat-msg--bot chat-pending" data-role="pending">${t('chat.thinking')}</div>`;
      }
      if (e.role === 'error') {
        return `<div class="chat-msg chat-msg--err">
          <div class="chat-err-title">${t('chat.error')}</div>
          <div class="chat-err-body">${esc(e.text)}</div>
          ${e.canRetry ? `<button class="chat-suggest" data-act="retry">${t('chat.retry')}</button>` : ''}
        </div>`;
      }
      const badges = [
        e.local ? `<span class="chat-badge chat-badge--local">${t('chat.local.badge')}</span>` : '',
        e.truncated ? `<span class="chat-badge chat-badge--cut">${t('chat.truncated')}</span>` : '',
      ].join('');
      return `<div class="chat-msg chat-msg--bot">
        ${badges}
        ${renderAssistantMarkdown(e.text)}
        ${toolChips(e.tools)}
        ${e.local ? '' : costLine(e.usage, e.costUsd)}
      </div>`;
    })
    .join('');
  box.scrollTop = box.scrollHeight;
  updateMeter();
}

function updateMeter(): void {
  const meter = host?.querySelector<HTMLElement>('[data-role="meter"]');
  if (!meter) return;
  const usage = session?.totalUsage();
  if (!usage || !(usage.inputTokens + usage.outputTokens)) {
    meter.textContent = '';
    return;
  }
  const usd = session?.totalCostUsd();
  const tokens = `${usage.inputTokens + usage.outputTokens} ${t('chat.tokens')}`;
  meter.textContent = usd === null || usd === undefined ? tokens : `${tokens} · $${usd.toFixed(3)}`;
}

// ── asking ───────────────────────────────────────────────────────────────────

/**
 * Show a piece of a streamed answer.
 *
 * Patches the one node rather than calling `render()`: a full re-render per token
 * would fight the user's scroll position and destroy any selection they had. And
 * autoscroll only happens if they are ALREADY at the bottom — dragging someone back
 * down while they are reading something further up is the worst habit a chat UI has.
 */
function appendDelta(chunk: string): void {
  const entry = entries.find((e) => e.role === 'pending');
  if (!entry || entry.role !== 'pending') return;
  entry.text += chunk;
  const node = host?.querySelector<HTMLElement>('[data-role="pending"]');
  if (!node) return;
  const box = log();
  const wasAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
  node.classList.remove('chat-pending');
  node.classList.add('chat-stream');
  node.textContent = entry.text;
  if (wasAtBottom) box.scrollTop = box.scrollHeight;
}

async function submit(): Promise<void> {
  const input = field();
  const question = input.value.trim();
  if (!question || busy) return;
  busy = true;
  input.value = '';
  input.style.height = 'auto';
  lastAsked = question;
  entries.push({ role: 'user', text: question });

  // Without a key, Tier 0 is still worth trying — those questions never needed one.
  const active =
    session ?? new AssistantSession(ctxRef!, cfg ?? { providerId: 'openai', model: '' });
  entries.push({ role: 'pending', text: '' });
  render();

  let result: AskResult;
  try {
    if (ready) {
      const ctrl = new AbortController();
      inFlight = ctrl;
      result = await active.ask(question, ctrl.signal, appendDelta);
      inFlight = null;
      // Keep the session that holds the transcript, so a follow-up continues it.
      session = active;
    } else {
      // No key: answer it locally or say so. There is nothing to abort — the local
      // path calls no API — and nothing to charge for.
      result = (await active.askLocal(question)) ?? {
        kind: 'error',
        message: t('chat.needkey'),
        tools: [],
      };
    }
  } catch (e) {
    // Neither `ask` nor `askLocal` is meant to throw — both classify their own
    // failures. If one ever does, it surfaces as an error message rather than an
    // unhandled rejection with a "Thinking…" row stuck on screen forever.
    result = { kind: 'error', message: String(e).slice(0, 300), tools: [] };
  } finally {
    // The pending row and the lock come off together, whatever happened. Leaving
    // either behind wedges the composer for the rest of the session.
    inFlight = null;
    busy = false;
    const idx = entries.findIndex((e) => e.role === 'pending');
    if (idx >= 0) entries.splice(idx, 1);
  }

  if (result.kind === 'answer') {
    entries.push({
      role: 'assistant',
      text: result.text,
      local: result.local,
      truncated: result.truncated,
      tools: result.tools,
      usage: result.usage,
      costUsd: result.costUsd,
    });
  } else {
    entries.push({
      role: 'error',
      text: result.message,
      canRetry: result.failure?.retryable ?? false,
    });
  }
  render();
}

// ── Ask ChatGPT handoff ──────────────────────────────────────────────────────

/**
 * Send the question and the portfolio to ChatGPT instead of the API.
 *
 * The data is gathered with the SAME read executors the assistant uses, so the
 * figures pasted into ChatGPT are the ones the app is showing. `buildHandoffPrompt`
 * truncates the data if it must and never the question.
 */
async function handoff(btn: HTMLElement): Promise<void> {
  const input = field();
  const question = input.value.trim() || lastAsked;
  if (!question) {
    input.focus();
    return;
  }
  const context: string[] = [];
  if (accounts.length) {
    for (const tool of ['get_account_summary', 'list_positions'] as const) {
      const out = await execRead(ctxRef!, tool, {});
      if (out.isError) continue;
      const prose = renderLocalAnswer(tool, out.data);
      if (prose) context.push(...prose.split('\n'));
    }
  }
  const prompt = buildHandoffPrompt({ question, context });
  askChatGpt(prompt, btn);
  // The question stays in the composer: the user may well want to ask the API the
  // same thing afterwards, and clearing it would make them retype it.
  lastAsked = question;
}
