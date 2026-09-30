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
 * ── HOW A TRADE GETS RECORDED FROM A SENTENCE ───────────────────────────────
 * The model does not write anything. It proposes, by calling a write tool, and this
 * panel turns the resolved plan into an APPROVAL CARD: which account, the price as
 * the user said it and as it will be stored, the rate in between, the cost. Nothing
 * reaches the portfolio until the user presses the button — and the callback that
 * waits for that press is the only route a write has, so there is no code path where
 * one happens silently.
 *
 * The promise MUST settle. Closing the panel, starting a new conversation and
 * aborting all count as a decline, because a tool call left without a result makes
 * every later request in the conversation illegal.
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
import { ORB_MARK } from './emblem.js';
import { t, onLangChange } from './i18n.js';
import { accounts } from '../portfolio/store.js';
import {
  readAuditLog,
  type AuditEntry,
  type PlannedPrice,
  type WritePlan,
} from '../portfolio/writes.js';
import { money } from './dom.js';

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
const CLOSE = icon('<path d="M6 6l12 12M18 6 6 18"/>');
const GLOBE = icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>');
/** An arrow, not the word "Send": the composer is already full of words. */
const SEND = icon('<path d="M12 19V5M5 12l7-7 7 7"/>');

function build(): HTMLElement {
  const el = document.createElement('div');
  el.id = 'chat-panel';
  el.innerHTML = `
    <div class="chat-backdrop" data-act="close"></div>
    <aside class="chat-shell" role="dialog" aria-label="${t('chat.title')}">
      <header class="chat-head">
        <span class="chat-mark">${ORB_MARK}</span>
        <div class="chat-head-main">
          <span class="chat-title">${t('chat.title')}</span>
          <span class="chat-model" data-role="model"></span>
        </div>
        <div class="chat-head-actions">
          <span class="chat-meter" data-role="meter" title="${t('chat.meter.help')}"></span>
          <button class="chat-icon" data-act="new" title="${t('chat.new')}">${NEW}</button>
          <button class="chat-icon" data-act="settings" title="${t('ai.settings.title')}">${GEAR}</button>
          <button class="chat-icon" data-act="close" aria-label="${t('chat.close')}">${CLOSE}</button>
        </div>
      </header>
      <div class="chat-log" data-role="log"></div>
      <div class="chat-composer">
        <!-- One field, with the buttons INSIDE it: a textarea in its own box above a
             row of buttons is the shape every chatbot had in 2016, and it spends two
             borders and a gap saying nothing. -->
        <div class="chat-field">
          <textarea class="chat-input" data-role="input" rows="1"
            placeholder="${t('chat.placeholder')}"></textarea>
          <div class="chat-field-actions">
            <button class="chat-gpt chat-web" data-act="web" data-role="web">${GLOBE}${t('chat.web')}</button>
            <button class="chat-gpt" data-act="askgpt" title="${t('chat.askgpt.help')}">${t('chat.askgpt')}</button>
            <button class="chat-send" data-act="send" title="${t('chat.send')}"
              aria-label="${t('chat.send')}">${SEND}</button>
          </div>
        </div>
        <div class="chat-foot">${t('chat.disclaimer')}</div>
      </div>
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
    else if (act === 'web') {
      setWebSearch(!webSearchOn());
      paintWebToggle();
    }
    else if (act === 'suggest') {
      const q = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')!.dataset['q'] ?? '';
      const input = field();
      input.value = q;
      void submit();
    }
    else if (act === 'approve') settleWrite('accept');
    else if (act === 'decline') settleWrite('decline');
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

// ── web search switch ────────────────────────────────────────────────────────
//
// Device-local, like the sync code: it is a preference about THIS screen's spending
// and trust, not portfolio data, so it has no business in the synced blob. On by
// default — the user asked for search — and read per question, so flipping it
// mid-conversation applies to the very next turn: the session builds its tool list
// from it each time, and a model that was never handed `web_search` cannot call it.
const WEB_KEY = 'chat_web_search';

/** Holds the choice when localStorage refuses the write. */
let webOverride: boolean | null = null;

function webSearchOn(): boolean {
  if (webOverride !== null) return webOverride;
  try {
    return localStorage.getItem(WEB_KEY) !== '0';
  } catch {
    return true;
  }
}

function setWebSearch(on: boolean): void {
  try {
    localStorage.setItem(WEB_KEY, on ? '1' : '0');
  } catch {
    /* private mode: the switch still works for this page */
  }
  webOverride = on;
}

function paintWebToggle(): void {
  const b = host?.querySelector<HTMLElement>('[data-role="web"]');
  if (!b) return;
  const on = webSearchOn();
  b.setAttribute('aria-pressed', String(on));
  b.title = t(on ? 'chat.web.on' : 'chat.web.off');
}

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
  // Read on open rather than kept in sync: the only place it shows is the empty
  // transcript, so it is already stale by the time anything could change it. Failing
  // to read the log is not a reason to refuse to open the panel.
  recentWrites = (await readAuditLog(ctx).catch(() => [])).slice(0, 3);
  host.classList.add('chat--open');
  paintWebToggle();
  render();
  setTimeout(() => field().focus(), 60);
}

export function closeChatPanel(): void {
  // A card the user walked away from is a NO. Settled before the abort, because the
  // agent is parked on that promise and would never reach the aborted request: an
  // unsettled call leaves a tool_use with no tool_result, which makes every later
  // request in the conversation illegal on both wire formats.
  settleWrite('decline');
  // An in-flight request is abandoned rather than left running: the user closed the
  // panel, and a reply landing into a hidden transcript still costs money.
  inFlight?.abort();
  inFlight = null;
  host?.classList.remove('chat--open');
}

function startNewState(): void {
  // Same reason as in `closeChatPanel`, and before `entries` is emptied: the card is
  // about to stop existing, so it has to answer first.
  settleWrite('decline');
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
  else if (cfg && !session) session = new AssistantSession(ctxRef!, cfg, webSearchOn);
  if (host) {
    const badge = host.querySelector<HTMLElement>('[data-role="model"]')!;
    badge.textContent = ready ? (cfg?.model ?? '') : t('chat.notconfigured');
    badge.classList.toggle('chat-model--off', !ready);
  }
}

// ── transcript ───────────────────────────────────────────────────────────────

type Entry =
  | { role: 'user'; text: string }
  /** A proposed write, waiting on the user or already settled. */
  | { role: 'approval'; plan: WritePlan; state: 'pending' | 'accepted' | 'declined' }
  | { role: 'assistant'; text: string; local: boolean; truncated: boolean; tools: ToolTrace[]; usage?: TokenUsage; costUsd?: number | null }
  | { role: 'error'; text: string; canRetry: boolean }
  /** The row that is being written into: the placeholder, then the streamed text. */
  | { role: 'pending'; text: string };

const entries: Entry[] = [];

/**
 * The card the panel is currently waiting on.
 *
 * One at a time by construction: the agent loop awaits `onApprove` before it runs the
 * next call, so a second card cannot appear while this one is open. `resolve` is the
 * agent's promise — every exit path from the panel has to call it.
 */
let pendingWrite: {
  entry: Extract<Entry, { role: 'approval' }>;
  resolve: (v: 'accept' | 'decline') => void;
} | null = null;

/** The last few writes recorded on this device, shown on the empty transcript. */
let recentWrites: AuditEntry[] = [];

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

/**
 * Greeting, hint, four things to tap. No artwork of its own.
 *
 * It used to hang the full painted plate at 184px right here, because an empty
 * transcript is the only moment in the panel's life with room to spare. The panel's
 * top is a picture now (`.chat-shell::before`, a taijitu ring around a tree), and
 * the plate landed in the middle of that ring — one taijitu inside another, at 440px
 * wide. The background won: it is bigger, it holds the whole header as well, and it
 * does not push the greeting down the column.
 */
function emptyState(): string {
  return `
    <div class="chat-empty">
      <p class="chat-empty-title">${t('chat.empty.title')}</p>
      <p class="chat-empty-hint">${t(ready ? 'chat.empty.hint' : 'chat.empty.nokey')}</p>
      <div class="chat-suggests">
        ${SUGGESTIONS.map((k) => {
          const q = t(k);
          return `<button class="chat-suggest" data-act="suggest" data-q="${esc(q)}">
            <span>${esc(q)}</span>${icon('<path d="M5 12h14M13 6l6 6-6 6"/>')}</button>`;
        }).join('')}
      </div>
      ${recentStrip()}
    </div>`;
}

/**
 * The last few things the assistant actually changed, on this device.
 *
 * A new conversation has no memory of the previous one, so without this the user has
 * no way to tell whether the trade they dictated ten minutes ago went in. The lines
 * come from the audit log and are shown as stored — symbol-shaped, not translated,
 * because a stored sentence would otherwise freeze in whichever language was on when
 * it was written.
 */
function recentStrip(): string {
  if (!recentWrites.length) return '';
  const rows = recentWrites
    .map(
      (w) =>
        `<li><span>${esc(w.line)}</span><time>${new Date(w.at).toLocaleDateString()}</time></li>`,
    )
    .join('');
  return `<div class="chat-recent">
    <p class="chat-recent-head">${t('chat.write.recent')}</p>
    <ul>${rows}</ul>
  </div>`;
}

/** An assistant turn: the mark in the gutter, the words beside it. */
function botTurn(body: string, live = false): string {
  return `<div class="chat-turn chat-turn--bot">
    <span class="chat-avatar${live ? ' chat-avatar--live' : ''}">${ORB_MARK}</span>
    ${body}
  </div>`;
}

// ── the approval card ────────────────────────────────────────────────────────

const CCY_SYM: Record<string, string> = { EUR: '€', USD: '$' };
const sym = (c: string): string => CCY_SYM[c] ?? '';

/**
 * A price as the user said it, and — when the account keeps its books in another
 * currency — what will actually be stored, with the rate in between.
 *
 * The arithmetic is shown rather than summarised on purpose. This is the one number
 * the app has to INTERPRET rather than record, and "232.50, read as dollars" is a
 * mistake the user can catch in a second if they can see it. Hiding the conversion
 * would make the most error-prone part of a chat-recorded trade the only invisible
 * one — and a cost basis that is 10% wrong is not detectable anywhere downstream.
 */
function priceCell(p: PlannedPrice, acctCcy: string): string {
  const given = esc(money(p.given, sym(p.currency)));
  if (p.stored === p.given) return given;
  const rate = p.fx ? ` · EURUSD ${p.fx.toFixed(4)}` : '';
  return `${given} <span class="chat-card-conv">→ ${esc(money(p.stored, sym(acctCcy)))}${rate}</span>`;
}

/** A Financial Status amount: dong has no minor unit and no symbol in `CCY_SYM`. */
const balanceCell = (n: number, ccy: string): string =>
  esc(ccy === 'VND' ? `${Math.round(n).toLocaleString('en-US')} ₫` : `${money(n, sym(ccy))} ${ccy}`);

/** The rows for one plan: an i18n key for the label, ready HTML for the value. */
function planRows(plan: WritePlan): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const add = (key: string, value: string | undefined): void => {
    if (value) rows.push([key, value]);
  };
  if (plan.kind === 'record_balance') {
    const ccy = plan.wealthAccount.currency;
    add('chat.write.wealthAccount', esc(plan.wealthAccount.name));
    add('chat.write.balance', balanceCell(plan.amount, ccy));
    add('chat.write.date', esc(plan.date) + (plan.replaces ? ` · ${t('chat.write.replaces')}` : ''));
    // Old → new is the check that catches "4K" read as 4: a balance that moved a
    // thousandfold overnight is visible here before anything is saved.
    add(
      'chat.write.lastReading',
      plan.previous ? `${balanceCell(plan.previous.amount, ccy)} · ${esc(plan.previous.date)}` : undefined,
    );
    add('chat.write.note', plan.note);
    return rows;
  }
  if (plan.kind === 'create_account') {
    add('chat.write.capital', esc(money(plan.initialCapital, sym(plan.currency))));
    add('chat.write.currency', esc(plan.currency));
    // Notes arrive from the model already escaped — core's `richText` coercion does it,
    // because notes are rendered as HTML wherever they are shown. Escaping again here
    // would display the entities.
    add('chat.write.note', plan.description);
    return rows;
  }
  const ccy = plan.account.currency;
  add('chat.write.account', esc(plan.account.name));
  switch (plan.kind) {
    case 'record_buy':
      add('chat.write.shares', `${plan.shares} ${esc(plan.ticker)}`);
      add('chat.write.price', priceCell(plan.price, ccy));
      add('chat.write.cost', esc(money(plan.cost, sym(ccy))));
      add('chat.write.date', esc(plan.date));
      add('chat.write.stop', plan.stop ? priceCell(plan.stop, ccy) : undefined);
      add('chat.write.target', plan.target ? priceCell(plan.target, ccy) : undefined);
      add('chat.write.setup', plan.setupType ? esc(plan.setupType) : undefined);
      add('chat.write.rating', plan.rating);
      add('chat.write.note', plan.note);
      break;
    case 'record_sell':
      add('chat.write.shares', `${plan.shares} ${esc(plan.ticker)} · ${t('chat.write.of')} ${plan.held}`);
      add('chat.write.price', priceCell(plan.price, ccy));
      add('chat.write.proceeds', esc(money(plan.proceeds, sym(ccy))));
      add('chat.write.date', esc(plan.date));
      add('chat.write.note', plan.note);
      break;
    case 'set_stop':
      add('chat.write.ticker', esc(plan.ticker));
      add('chat.write.stop', priceCell(plan.stop, ccy));
      add(
        'chat.write.previous',
        plan.previous === undefined ? undefined : esc(money(plan.previous, sym(ccy))),
      );
      add('chat.write.lots', String(plan.lots));
      break;
    case 'record_cash_flow':
      add(
        plan.amount >= 0 ? 'chat.write.deposit' : 'chat.write.withdraw',
        esc(money(Math.abs(plan.amount), sym(ccy))),
      );
      add('chat.write.date', esc(plan.date));
      add('chat.write.note', plan.note);
      break;
    case 'place_order':
      add('chat.write.type', esc(plan.type.replace('_', ' ')));
      add('chat.write.shares', `${plan.shares} ${esc(plan.ticker)}`);
      add('chat.write.threshold', priceCell(plan.threshold, ccy));
      add('chat.write.date', esc(plan.date));
      break;
  }
  return rows;
}

/**
 * The card: what would happen, then two buttons.
 *
 * Full width and no avatar, like an error — this is the app asking, not the assistant
 * talking. Once settled it keeps showing the same numbers with a status line where the
 * buttons were, so the transcript stays a record of what was actually agreed to.
 */
function approvalCard(e: Extract<Entry, { role: 'approval' }>): string {
  const rows = planRows(e.plan)
    .map(
      ([key, value]) =>
        `<div class="chat-card-row"><span>${t(key)}</span><span>${value}</span></div>`,
    )
    .join('');
  const head =
    e.plan.kind === 'create_account'
      ? `${t('chat.write.title.create_account')} · <b>${esc(e.plan.name)}</b>`
      : t(`chat.write.title.${e.plan.kind}`);
  const foot =
    e.state === 'pending'
      ? `<div class="chat-card-hint">${t('chat.write.hint')}</div>
         <div class="chat-card-actions">
           <button class="chat-card-no" data-act="decline">${t('chat.write.decline')}</button>
           <button class="chat-card-yes" data-act="approve">${t('chat.write.accept')}</button>
         </div>`
      : `<div class="chat-card-state chat-card-state--${e.state}">${t(
          e.state !== 'accepted'
            ? 'chat.write.declined'
            : e.plan.kind === 'record_balance'
              ? 'chat.write.acceptedWealth'
              : 'chat.write.accepted',
        )}</div>`;
  return `<div class="chat-turn chat-turn--sys">
    <div class="chat-card${e.state === 'pending' ? ' chat-card--live' : ''}">
      <div class="chat-card-head">${head}</div>
      ${rows}
      ${foot}
    </div></div>`;
}

/**
 * Show a plan and wait for an answer. This is the `onApprove` the agent is handed, and
 * the ONLY route a write has — the agent loop is parked on this promise until one of
 * the buttons, or one of the exits in `settleWrite`'s callers, settles it.
 */
function requestApproval(plan: WritePlan): Promise<'accept' | 'decline'> {
  return new Promise((resolve) => {
    const entry: Extract<Entry, { role: 'approval' }> = {
      role: 'approval',
      plan,
      state: 'pending',
    };
    // Inserted ABOVE the pending row, so the dots stay at the bottom where the answer
    // will land — the card is part of this turn, not the end of it.
    const idx = entries.findIndex((x) => x.role === 'pending');
    if (idx >= 0) entries.splice(idx, 0, entry);
    else entries.push(entry);
    pendingWrite = { entry, resolve };
    render();
  });
}

/**
 * Answer the open card, if there is one. Safe to call when there is not, which is why
 * every exit path can call it unconditionally.
 */
function settleWrite(verdict: 'accept' | 'decline'): void {
  const open = pendingWrite;
  if (!open) return;
  pendingWrite = null;
  open.entry.state = verdict === 'accept' ? 'accepted' : 'declined';
  render();
  open.resolve(verdict);
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
      if (e.role === 'user') {
        return `<div class="chat-turn chat-turn--user">
          <div class="chat-msg chat-msg--user">${esc(e.text)}</div></div>`;
      }
      if (e.role === 'pending') {
        // Escaped and NOT run through the markdown renderer while it streams: half a
        // table or an unclosed `**` renders as garbage that reflows on every token.
        // The finished answer is re-rendered as markdown the moment it lands.
        // Three dots rather than the word "Thinking…": `appendDelta` replaces the
        // node's text content wholesale, so the animation removes itself the instant
        // the first token lands, with no extra bookkeeping.
        return botTurn(
          e.text
            ? `<div class="chat-msg chat-msg--bot chat-stream" data-role="pending">${esc(e.text)}</div>`
            : `<div class="chat-msg chat-msg--bot chat-pending" data-role="pending"
                 aria-label="${t('chat.thinking')}"><i></i><i></i><i></i></div>`,
          true,
        );
      }
      if (e.role === 'approval') return approvalCard(e);
      if (e.role === 'error') {
        // Full width and no avatar: a failure is the app speaking about the
        // assistant, not the assistant speaking.
        return `<div class="chat-turn chat-turn--sys"><div class="chat-msg chat-msg--err">
          <div class="chat-err-title">${t('chat.error')}</div>
          <div class="chat-err-body">${esc(e.text)}</div>
          ${e.canRetry ? `<button class="chat-suggest" data-act="retry">${t('chat.retry')}</button>` : ''}
        </div></div>`;
      }
      const badges = [
        e.local ? `<span class="chat-badge chat-badge--local">${t('chat.local.badge')}</span>` : '',
        e.truncated ? `<span class="chat-badge chat-badge--cut">${t('chat.truncated')}</span>` : '',
      ].join('');
      return botTurn(`<div class="chat-msg chat-msg--bot">
        ${badges}
        ${renderAssistantMarkdown(e.text)}
        ${toolChips(e.tools)}
        ${e.local ? '' : costLine(e.usage, e.costUsd)}
      </div>`);
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
    session ?? new AssistantSession(ctxRef!, cfg ?? { providerId: 'openai', model: '' }, webSearchOn);
  entries.push({ role: 'pending', text: '' });
  render();

  let result: AskResult;
  try {
    if (ready) {
      const ctrl = new AbortController();
      inFlight = ctrl;
      // The fourth argument is what turns the write tools on: `runModel` only sends
      // them when it has somewhere to ask, and the system prompt is built from the
      // same array — so the assistant can offer to record a trade exactly when this
      // panel can show a card for it.
      result = await active.ask(question, ctrl.signal, appendDelta, requestApproval);
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
    // A no-op in the normal case — the loop cannot finish while parked on a card. It
    // matters when the turn ended some other way: a card left with live buttons that
    // resolve a promise nobody is waiting on any more is a dead end on screen.
    settleWrite('decline');
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
