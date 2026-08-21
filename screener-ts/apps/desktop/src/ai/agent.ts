/**
 * One question in, one answer out — the loop that turns a typed question into a
 * reply, and the only place that decides how a question gets answered.
 *
 * ── THE LADDER, CHEAPEST RUNG FIRST ─────────────────────────────────────────
 * 1. Tier 0 (`matchIntent`): "what do I own", "price of NVDA" and the rest of the
 *    everyday lookups run the read tool directly. NO API CALL, no key needed, no
 *    cents spent, and the answer is the app's own data rather than a model's
 *    paraphrase of it. The panel labels these so nobody wonders why it was instant.
 * 2. The model, with tools. Everything with judgement in it.
 *
 * Ask ChatGPT is a third rung the USER chooses, not this file — see `chatPanel.ts`.
 *
 * ── WHY THE TRANSCRIPT LIVES IN A SESSION OBJECT ────────────────────────────
 * Because the pairing invariant is a property of the whole conversation, not of one
 * request: a tool result is only legal while its call is still present. Keeping the
 * messages in one place, appended only through this file, is what lets
 * `trimForRetry` be the single scissors — and what keeps a Tier-0 answer out of the
 * transcript entirely, since replaying a locally-produced table as if the model had
 * said it would teach it to invent the next one.
 *
 * ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────
 * Retry a failed request more than once, and then only after trimming for a
 * context-length error. An auth error retried is an auth error twice; a rate limit
 * retried immediately is a longer rate limit. Every other failure is reported in
 * the provider's own words, because the provider is the only one who knows.
 */
import {
  MAX_TOOL_ROUNDS,
  assistantMessage,
  buildChatRequest,
  buildSystemPrompt,
  classifyFailure,
  estimateCostUsd,
  matchIntent,
  nextAction,
  parseChatReply,
  readTools,
  sumUsage,
  trimForRetry,
  userText,
  validateToolArgs,
  formatIssues,
  findProvider,
  type AccountFact,
  type AgentMessage,
  type ApiFailure,
  type LlmConfig,
  type ToolResultBlock,
  type TokenUsage,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { accounts, activeId, OVERVIEW_ID } from '../portfolio/store.js';
import { today } from '../portfolio/store.js';
import { getApiKey, llmFetch } from './llmClient.js';
import { execRead, type ToolOutcome } from './toolExec.js';
import { renderLocalAnswer } from './localAnswer.js';
import { getLang } from '../ui/i18n.js';

/** A tool run, as the panel shows it: one chip per call. */
export interface ToolTrace {
  name: string;
  args: Record<string, string | number>;
  ok: boolean;
}

export type AskResult =
  | {
      kind: 'answer';
      text: string;
      /** Answered from local data with no API call — the panel says so. */
      local: boolean;
      /** The model's output cap cut the reply off. */
      truncated: boolean;
      tools: ToolTrace[];
      usage: TokenUsage;
      costUsd: number | null;
    }
  | {
      kind: 'error';
      /** Shown verbatim: the provider's message is the only real diagnostic. */
      message: string;
      failure?: ApiFailure;
      tools: ToolTrace[];
    };

/** Enough room for a long answer with a table in it; not enough to run away. */
const MAX_OUTPUT_TOKENS = 1500;

function accountFacts(): AccountFact[] {
  const openId = activeId();
  return accounts.map((a, i) => ({
    name: a.account.name,
    currency: a.account.currency,
    // Overview is a view, not an account, and the executors fall back to the first
    // account there — so the prompt must name the same one, or the model would be
    // told about a default the tools do not use.
    isOpen: openId === OVERVIEW_ID ? i === 0 : a.account.id === openId,
  }));
}

/** Symbols the user actually holds — what lets Tier 0 read a bare lowercase ticker. */
function knownTickers(): string[] {
  const set = new Set<string>();
  for (const a of accounts) for (const l of a.lots) if (l.remainingShares > 0) set.add(l.ticker);
  return [...set];
}

export class AssistantSession {
  /** The neutral transcript. Appended only by `ask`, so pairing stays provable. */
  private messages: AgentMessage[] = [];
  private usages: TokenUsage[] = [];

  constructor(
    private readonly ctx: AppContext,
    private readonly cfg: LlmConfig,
  ) {}

  /** Everything spent in this conversation, for the panel's meter. */
  totalUsage(): TokenUsage {
    return sumUsage(this.usages);
  }

  totalCostUsd(): number | null {
    return estimateCostUsd(this.totalUsage(), this.cfg);
  }

  /** Start over. The cheapest fix for a conversation that has grown too long. */
  reset(): void {
    this.messages = [];
    this.usages = [];
  }

  /** How many exchanges are in play — the panel warns before it gets silly. */
  get length(): number {
    return this.messages.length;
  }

  /**
   * Answer a question WITHOUT ever calling an API — Tier 0 or nothing.
   *
   * The path taken when no key is configured. It is the same `tryLocal` the keyed
   * path runs first, so "what do I own" behaves identically with and without a key;
   * null means this question genuinely needs a model (or the ChatGPT handoff).
   */
  async askLocal(question: string): Promise<AskResult | null> {
    const asked = question.trim();
    return asked ? this.tryLocal(asked) : null;
  }

  /**
   * Answer one question.
   *
   * `signal` aborts the in-flight request. An aborted turn drops the messages it
   * added, because a half-written exchange is exactly the dangling-tool-result
   * shape the next request would be rejected for.
   */
  async ask(question: string, signal?: AbortSignal): Promise<AskResult> {
    const asked = question.trim();
    if (!asked) return { kind: 'error', message: 'Nothing to ask.', tools: [] };

    const local = await this.tryLocal(asked);
    if (local) return local;

    const before = this.messages.length;
    this.messages.push(userText(asked));
    try {
      return await this.runModel(signal);
    } catch (e) {
      this.messages.length = before;
      return {
        kind: 'error',
        message: signal?.aborted ? 'Stopped.' : String(e).slice(0, 300),
        tools: [],
      };
    }
  }

  /**
   * Tier 0. Returns null when the question needs a model.
   *
   * The result is NOT recorded in the transcript: the model never saw this
   * exchange, and pretending it authored a table it did not produce is how you
   * teach it to fabricate the next one. The cost of that choice is that a follow-up
   * ("and the second one?") goes to the model without this context — which the
   * model then fetches for itself, correctly.
   */
  private async tryLocal(asked: string): Promise<AskResult | null> {
    const hit = matchIntent(asked, {
      accountNames: accounts.map((a) => a.account.name),
      knownTickers: knownTickers(),
    });
    if (!hit) return null;
    const out = await execRead(this.ctx, hit.tool, hit.args);
    if (out.isError) return null; // let the model try; it can ask a better question
    const prose = renderLocalAnswer(hit.tool, out.data);
    // No local prose for this tool means no local answer: showing the user raw JSON
    // would be worse than paying for a model to read it.
    if (!prose) return null;
    return {
      kind: 'answer',
      text: prose,
      local: true,
      truncated: false,
      tools: [{ name: hit.tool, args: hit.args, ok: true }],
      usage: { inputTokens: 0, outputTokens: 0 },
      costUsd: 0,
    };
  }

  /** The model loop: request → maybe run tools → request again → answer. */
  private async runModel(signal?: AbortSignal): Promise<AskResult> {
    const tools = readTools();
    const system = buildSystemPrompt(
      { today: today(), accounts: accountFacts(), lang: getLang() === 'vi' ? 'vi' : 'en' },
      tools,
    );
    const apiKey = await getApiKey(this.ctx, this.cfg.providerId);
    const traces: ToolTrace[] = [];
    const turnUsages: TokenUsage[] = [];
    let rounds = 0;
    let trimmed = false;

    for (;;) {
      const sent = await this.send(system, tools, apiKey, signal);
      if ('failure' in sent) {
        // The one retry worth making: the conversation no longer fits, and dropping
        // the oldest exchange is something this side can do by itself. Anything else
        // retried is the same failure again.
        if (sent.failure.kind === 'context-length' && !trimmed) {
          const shorter = trimForRetry(this.messages);
          if (shorter) {
            this.messages = shorter;
            trimmed = true;
            continue;
          }
        }
        return { kind: 'error', message: sent.failure.message, failure: sent.failure, tools: traces };
      }

      const { reply } = sent;
      turnUsages.push(reply.usage);
      this.usages.push(reply.usage);
      this.messages.push(assistantMessage(reply));

      const action = nextAction(reply, rounds);
      if (action.kind === 'answer') {
        return this.answered(reply.text, action.truncated, traces, turnUsages);
      }
      if (action.kind === 'halt') {
        // A halt still carries whatever the model managed to say — the round limit
        // in particular usually leaves a partial but useful answer behind.
        const said = reply.text.trim();
        const reason =
          action.reason === 'round-limit'
            ? `Stopped after ${MAX_TOOL_ROUNDS} tool calls without reaching an answer.`
            : action.reason === 'refused'
              ? 'The provider declined to answer that.'
              : 'The model returned nothing.';
        if (said) return this.answered(said, true, traces, turnUsages);
        return { kind: 'error', message: reason, tools: traces };
      }

      rounds += 1;
      const results: ToolResultBlock[] = [];
      for (const call of action.calls) {
        const outcome = await this.runOne(call.name, call.input, call.inputError);
        traces.push({
          name: call.name,
          args: outcome.args,
          ok: !outcome.result.isError,
        });
        results.push({
          type: 'tool_result',
          toolUseId: call.id,
          content: outcome.result.content,
          ...(outcome.result.isError ? { isError: true } : {}),
        });
      }
      // One message carrying every result, in call order — the shape both wire
      // formats expect, and the reason a partial failure cannot orphan a call.
      this.messages.push({ role: 'user', content: [...results] });
    }
  }

  /**
   * Validate and run one call.
   *
   * A bad argument is handed BACK to the model as an error result rather than
   * failing the turn: `formatIssues` names the field and what would be acceptable,
   * which a model fixes on the next round. Silently defaulting it would run a trade
   * or a query the user never described.
   */
  private async runOne(
    name: string,
    input: Record<string, unknown>,
    inputError?: string,
  ): Promise<{ args: Record<string, string | number>; result: ToolOutcome }> {
    if (inputError) {
      return {
        args: {},
        result: { content: `Could not read the arguments: ${inputError}`, isError: true },
      };
    }
    const v = validateToolArgs(name, input);
    if (!v.ok) {
      return { args: {}, result: { content: formatIssues(v.issues), isError: true } };
    }
    const result = await execRead(this.ctx, name, v.value);
    // Unknown fields are reported, not swallowed: a model that passed `currency` to
    // a read tool has misread it, and the note is how it finds out.
    if (v.ignored.length && !result.isError) {
      result.content = `${result.content}\n(ignored unknown argument(s): ${v.ignored.join(', ')})`;
    }
    return { args: v.value, result };
  }

  private answered(
    text: string,
    truncated: boolean,
    tools: ToolTrace[],
    turnUsages: TokenUsage[],
  ): AskResult {
    const usage = sumUsage(turnUsages);
    return {
      kind: 'answer',
      text,
      local: false,
      truncated,
      tools,
      usage,
      costUsd: estimateCostUsd(usage, this.cfg),
    };
  }

  /** One HTTP round trip, parsed. Failures are classified, never thrown. */
  private async send(
    system: string,
    tools: ReturnType<typeof readTools>,
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<{ reply: ReturnType<typeof parseChatReply> } | { failure: ApiFailure }> {
    const request = buildChatRequest(this.cfg, {
      system,
      messages: this.messages,
      tools,
      maxTokens: MAX_OUTPUT_TOKENS,
    });
    if (!request) {
      return {
        failure: {
          kind: 'bad-request',
          message: `Unknown provider: ${this.cfg.providerId}`,
          retryable: false,
        },
      };
    }

    const res = await llmFetch(this.cfg, apiKey, {
      path: request.path,
      method: 'POST',
      body: request.body,
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) {
      // Read the body as text first: an error body is not always JSON, and losing the
      // provider's sentence to a parse error would leave the user with a bare status.
      const raw = await res.text().catch(() => '');
      let parsed: unknown = raw;
      try {
        parsed = JSON.parse(raw);
      } catch {
        /* keep the text */
      }
      return { failure: classifyFailure(res.status, parsed) };
    }

    const wire = findProvider(this.cfg.providerId)?.wire ?? 'openai';
    return { reply: parseChatReply(await res.json(), wire) };
  }
}
