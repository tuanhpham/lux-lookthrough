/**
 * One neutral conversation model, serialised into either wire format.
 *
 * ── WHY A NEUTRAL MODEL ─────────────────────────────────────────────────────
 * The chat panel, the tool executor and the audit log all need to reason about
 * "the assistant asked to call record_buy with these arguments". If they held the
 * provider's own JSON instead, every one of them would need a branch per vendor,
 * and switching provider mid-conversation would be impossible. So the transcript
 * is stored in the shape below and translated at the edge, once.
 *
 * ── WHERE THE TWO FORMATS ACTUALLY DIFFER ───────────────────────────────────
 * Not cosmetically. These are the differences this file exists to absorb:
 *
 *                     anthropic                     openai
 *   system            top-level string              a message with role 'system'
 *   tool call         a `tool_use` content block     `message.tool_calls[]`
 *   call arguments    already-parsed JSON object     a STRING that may not parse
 *   tool result       a block in a USER message      its own `role: 'tool'` message
 *   output cap        `max_tokens` (required)        `max_tokens` or, on OpenAI's
 *                                                   own models, the newer field
 *   usage             input/output_tokens, with      prompt/completion_tokens,
 *                     cache reads counted SEPARATELY  cached counted INSIDE prompt
 *
 * That last row is a silent-money bug if ignored, so `readUsage` normalises both
 * into "input total, of which cached" — the shape `estimateCostUsd` documents.
 *
 * Pure functions over plain JSON. Nothing here fetches; the transport is app-side.
 */

import {
  findProvider,
  tokenLimitField,
  usesStreaming,
  type LlmConfig,
  type TokenUsage,
} from './providers.js';
import { schemaFor, type AgentToolDef } from './tools.js';

// ── the neutral transcript ────────────────────────────────────────────────────

export interface TextBlock {
  type: 'text';
  text: string;
}

/** The model asking to run a tool. `id` is what its result must quote back. */
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  toolUseId: string;
  /** Always a string: JSON for data, a sentence for an error. */
  content: string;
  isError?: boolean;
}

export type AgentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

/**
 * Tool RESULTS ride in a `user` message even though no user wrote them — that is
 * the Anthropic convention, and collapsing to two roles keeps the transcript
 * linear. `flattenForOpenai` re-splits them into `role: 'tool'` messages.
 */
export interface AgentMessage {
  role: 'user' | 'assistant';
  content: AgentBlock[];
}

export const text = (s: string): TextBlock => ({ type: 'text', text: s });

export const userText = (s: string): AgentMessage => ({ role: 'user', content: [text(s)] });

export function toolResults(results: readonly ToolResultBlock[]): AgentMessage {
  return { role: 'user', content: [...results] };
}

// ── request building ──────────────────────────────────────────────────────────

export interface ChatRequest {
  path: string;
  body: Record<string, unknown>;
}

export interface ChatTurn {
  system: string;
  messages: readonly AgentMessage[];
  tools?: readonly AgentToolDef[];
  /** Output cap. Enough for a long answer, not enough to run away. */
  maxTokens?: number;
  /**
   * Sent ONLY when set. Reasoning models reject any non-default temperature, and
   * a default this file picked would break them for no benefit — a tool-driven
   * assistant has no use for sampling tweaks.
   */
  temperature?: number;
}

const DEFAULT_MAX_TOKENS = 4096;

function anthropicBlocks(msg: AgentMessage): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const b of msg.content) {
    if (b.type === 'text') {
      if (b.text) out.push({ type: 'text', text: b.text });
    } else if (b.type === 'tool_use') {
      out.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input });
    } else {
      out.push({
        type: 'tool_result',
        tool_use_id: b.toolUseId,
        content: b.content,
        ...(b.isError ? { is_error: true } : {}),
      });
    }
  }
  return out;
}

/**
 * Re-split the transcript into OpenAI's message list.
 *
 * A tool call and its result are one assistant message plus one `role: 'tool'`
 * message per call, and the API requires them ADJACENT AND IN ORDER — a tool
 * message whose `tool_call_id` did not just appear is a 400. Walking the neutral
 * transcript in order is what guarantees that, so this must never be reordered
 * or filtered per-role.
 */
function flattenForOpenai(messages: readonly AgentMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const msg of messages) {
    if (msg.role === 'assistant') {
      const said = msg.content
        .filter((b): b is TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      const calls = msg.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
      if (!said && !calls.length) continue;
      out.push({
        role: 'assistant',
        // Null rather than '' when there is only a tool call: some providers reject
        // an empty string alongside tool_calls.
        content: said || null,
        ...(calls.length
          ? {
              tool_calls: calls.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: JSON.stringify(c.input) },
              })),
            }
          : {}),
      });
      continue;
    }

    for (const b of msg.content) {
      if (b.type === 'tool_result') {
        out.push({ role: 'tool', tool_call_id: b.toolUseId, content: b.content });
      }
    }
    const said = msg.content
      .filter((b): b is TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (said) out.push({ role: 'user', content: said });
  }
  return out;
}

/**
 * Serialise one turn for the configured provider, or null if it is unknown.
 *
 * `tools` is omitted entirely when empty rather than sent as `[]`: several
 * OpenAI-compatible servers reject an empty tool array.
 */
export function buildChatRequest(cfg: LlmConfig, turn: ChatTurn): ChatRequest | null {
  const provider = findProvider(cfg.providerId);
  if (!provider) return null;
  const maxTokens = turn.maxTokens ?? DEFAULT_MAX_TOKENS;
  const tools = turn.tools ?? [];

  if (provider.wire === 'anthropic') {
    const body: Record<string, unknown> = {
      model: cfg.model,
      max_tokens: maxTokens,
      ...(turn.system ? { system: turn.system } : {}),
      messages: turn.messages
        .map((m) => ({ role: m.role, content: anthropicBlocks(m) }))
        .filter((m) => (m.content as unknown[]).length > 0),
      ...(tools.length
        ? {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: schemaFor(t),
            })),
          }
        : {}),
      ...(turn.temperature === undefined ? {} : { temperature: turn.temperature }),
    };
    return { path: provider.chatPath, body };
  }

  const messages: Record<string, unknown>[] = [];
  if (turn.system) messages.push({ role: 'system', content: turn.system });
  messages.push(...flattenForOpenai(turn.messages));

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    [tokenLimitField(cfg.providerId, cfg.tokenLimitField)]: maxTokens,
    // `stream_options` rides along because a streamed response otherwise carries NO
    // usage block at all, and the cost meter would silently read zero for every
    // streamed turn — worse than an unknown price, because it looks like a fact.
    ...(usesStreaming(cfg) ? { stream: true, stream_options: { include_usage: true } } : {}),
    ...(tools.length
      ? {
          tools: tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: schemaFor(t) },
          })),
        }
      : {}),
    ...(turn.temperature === undefined ? {} : { temperature: turn.temperature }),
  };
  return { path: provider.chatPath, body };
}

// ── response parsing ──────────────────────────────────────────────────────────

export type StopReason = 'end' | 'tool_use' | 'max_tokens' | 'refusal' | 'unknown';

export interface ParsedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  /**
   * Set when the model's arguments could not be read at all (truncated or
   * malformed JSON). The caller hands this back as a tool error so the model can
   * retry — the alternative, treating it as `{}`, would run the tool with nothing
   * in it.
   */
  inputError?: string;
}

export interface ChatReply {
  text: string;
  toolCalls: ParsedToolCall[];
  usage: TokenUsage;
  stop: StopReason;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Normalise token usage into "total input, of which cached".
 *
 * The two vendors count differently and it matters for money: Anthropic reports
 * `input_tokens` EXCLUDING cache reads and creations, OpenAI reports
 * `prompt_tokens` INCLUDING cached ones. Passing Anthropic's raw numbers to the
 * cost estimator would under-count every cached call. (Cache CREATION carries a
 * surcharge upstream that this does not model; nothing enables caching yet, and
 * the estimator's own comment owns the "errs high" promise.)
 */
export function readUsage(raw: unknown, wire: 'anthropic' | 'openai'): TokenUsage {
  const u = asRecord(raw);
  if (wire === 'anthropic') {
    const cached = num(u['cache_read_input_tokens']);
    const created = num(u['cache_creation_input_tokens']);
    return {
      inputTokens: num(u['input_tokens']) + cached + created,
      outputTokens: num(u['output_tokens']),
      ...(cached ? { cachedInputTokens: cached } : {}),
    };
  }
  const cached = num(asRecord(u['prompt_tokens_details'])['cached_tokens']);
  return {
    inputTokens: num(u['prompt_tokens']),
    outputTokens: num(u['completion_tokens']),
    ...(cached ? { cachedInputTokens: cached } : {}),
  };
}

function mapStop(raw: unknown, wire: 'anthropic' | 'openai'): StopReason {
  const s = typeof raw === 'string' ? raw : '';
  if (wire === 'anthropic') {
    if (s === 'tool_use') return 'tool_use';
    if (s === 'end_turn' || s === 'stop_sequence') return 'end';
    if (s === 'max_tokens') return 'max_tokens';
    if (s === 'refusal') return 'refusal';
    return 'unknown';
  }
  if (s === 'tool_calls' || s === 'function_call') return 'tool_use';
  if (s === 'stop') return 'end';
  if (s === 'length') return 'max_tokens';
  if (s === 'content_filter') return 'refusal';
  return 'unknown';
}

/** Read a text part out of OpenAI's `content`, which may be a string or parts. */
function openaiText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      const p = asRecord(part);
      return typeof p['text'] === 'string' ? p['text'] : '';
    })
    .join('');
}

function parseArguments(raw: unknown): { input: Record<string, unknown>; inputError?: string } {
  if (raw === undefined || raw === null || raw === '') return { input: {} };
  // Anthropic hands over a parsed object; OpenAI hands over a string.
  if (typeof raw === 'object') return { input: asRecord(raw) };
  if (typeof raw !== 'string') return { input: {}, inputError: 'arguments were not JSON' };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { input: {}, inputError: 'arguments were not a JSON object' };
    }
    return { input: parsed as Record<string, unknown> };
  } catch {
    // Usually a truncated call: the output cap was hit mid-JSON.
    return { input: {}, inputError: 'arguments were not valid JSON (possibly truncated)' };
  }
}

/**
 * Read one non-streaming chat response.
 *
 * Never throws. A shape this does not recognise yields an empty reply with
 * `stop: 'unknown'`, which the caller reports as "no answer" — far better than an
 * exception from inside a chat turn, where the transcript would be left dangling.
 */
export function parseChatReply(json: unknown, wire: 'anthropic' | 'openai'): ChatReply {
  const root = asRecord(json);

  if (wire === 'anthropic') {
    const blocks = Array.isArray(root['content']) ? root['content'] : [];
    let out = '';
    const toolCalls: ParsedToolCall[] = [];
    for (const b of blocks) {
      const blk = asRecord(b);
      if (blk['type'] === 'text' && typeof blk['text'] === 'string') out += blk['text'];
      else if (blk['type'] === 'tool_use') {
        const { input, inputError } = parseArguments(blk['input']);
        toolCalls.push({
          id: typeof blk['id'] === 'string' ? blk['id'] : '',
          name: typeof blk['name'] === 'string' ? blk['name'] : '',
          input,
          ...(inputError ? { inputError } : {}),
        });
      }
      // `thinking` and other block types are intentionally skipped: they are not
      // part of the answer and must not be shown as if they were.
    }
    return {
      text: out.trim(),
      toolCalls,
      usage: readUsage(root['usage'], 'anthropic'),
      stop: toolCalls.length ? 'tool_use' : mapStop(root['stop_reason'], 'anthropic'),
    };
  }

  const choice = asRecord(Array.isArray(root['choices']) ? root['choices'][0] : undefined);
  const message = asRecord(choice['message']);
  const rawCalls = Array.isArray(message['tool_calls']) ? message['tool_calls'] : [];
  const toolCalls: ParsedToolCall[] = rawCalls.map((c) => {
    const call = asRecord(c);
    const fn = asRecord(call['function']);
    const { input, inputError } = parseArguments(fn['arguments']);
    return {
      id: typeof call['id'] === 'string' ? call['id'] : '',
      name: typeof fn['name'] === 'string' ? fn['name'] : '',
      input,
      ...(inputError ? { inputError } : {}),
    };
  });

  return {
    text: openaiText(message['content']).trim(),
    toolCalls,
    usage: readUsage(root['usage'], 'openai'),
    // A tool call present means a tool call happened, whatever `finish_reason`
    // claims: local models and some hosted ones report 'stop' while emitting
    // tool_calls, and believing them would end the turn with the call unrun.
    stop: toolCalls.length ? 'tool_use' : mapStop(choice['finish_reason'], 'openai'),
  };
}

// ── streaming ─────────────────────────────────────────────────────────────────

/**
 * Reads a streamed OpenAI-format reply, incrementally.
 *
 * ── WHY STREAMING EXISTS HERE AT ALL ────────────────────────────────────────
 * Two unrelated reasons, and the first is not cosmetic: many OpenAI-compatible
 * GATEWAYS refuse a non-streamed request outright ("stream must be set to true"),
 * so without this the assistant simply cannot talk to them. The second is that a
 * reply that appears as it is written beats a spinner followed by a wall of text.
 *
 * ── WHAT MAKES IT FIDDLY ────────────────────────────────────────────────────
 * Chunk boundaries are arbitrary — they fall mid-line, mid-JSON, mid-UTF-8 — so
 * nothing may be parsed until a newline is seen, and a tool call's `arguments`
 * arrive as a STRING SPLIT ACROSS FRAMES that is only valid JSON once complete.
 * Hence the accumulate-then-parse-at-the-end shape: `finish()` produces exactly the
 * `ChatReply` a non-streamed call would have produced, so nothing downstream — the
 * tool loop, the cost meter, the pairing invariant — needs to know which path ran.
 */
export interface ChatStream {
  /** Feed decoded response text. Returns only the NEW answer text, for display. */
  push(chunk: string): string;
  /** A provider error delivered inside an HTTP 200 stream, if there was one. */
  error(): string | null;
  /** The finished reply, identical in shape to a non-streamed one. */
  finish(): ChatReply;
}

interface PartialCall {
  id: string;
  name: string;
  /** Raw JSON fragments, concatenated. Only parsed once the stream ends. */
  args: string;
}

export function createOpenaiChatStream(): ChatStream {
  /** The tail of the last chunk, up to the first newline of the next one. */
  let pending = '';
  /** Everything received, kept for the not-actually-a-stream fallback below. */
  let raw = '';
  let answer = '';
  let finish: unknown = '';
  let usageRaw: unknown;
  let errMsg: string | null = null;
  /** Any frame at all was understood — the difference between "empty" and "not SSE". */
  let sawFrame = false;
  const calls: PartialCall[] = [];

  function handleFrame(payload: string): string {
    const body = payload.trim();
    if (!body || body === '[DONE]') return '';
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      // A frame that is not JSON is not fatal: gateways insert keep-alives and
      // status lines, and throwing here would lose an otherwise complete answer.
      return '';
    }
    sawFrame = true;
    const root = asRecord(json);
    // An error can arrive INSIDE a 200 response once the stream has started, since
    // the status line was already sent. Keep the provider's words for the panel.
    const errBlock = asRecord(root['error']);
    if (typeof errBlock['message'] === 'string' && errBlock['message']) errMsg = errBlock['message'];
    if (root['usage']) usageRaw = root['usage'];

    const choice = asRecord(Array.isArray(root['choices']) ? root['choices'][0] : undefined);
    // `delta` normally; `message` for the servers that stream one whole chunk. Also
    // note what is NOT read: `reasoning_content` deltas are the model thinking out
    // loud, not its answer, and showing them as the answer would be a lie.
    const delta = asRecord(choice['delta'] ?? choice['message']);
    if (choice['finish_reason']) finish = choice['finish_reason'];

    const piece = openaiText(delta['content']);
    if (piece) answer += piece;

    const deltaCalls = Array.isArray(delta['tool_calls']) ? delta['tool_calls'] : [];
    for (const c of deltaCalls) {
      const call = asRecord(c);
      const fn = asRecord(call['function']);
      const id = typeof call['id'] === 'string' ? call['id'] : '';
      let i = typeof call['index'] === 'number' ? call['index'] : -1;
      if (i < 0) {
        // No index (some servers omit it). A fresh id opens a new call; anything else
        // continues the one in progress. Getting this wrong CONCATENATES two calls'
        // arguments into one unparseable string, so it is worth the branch.
        const last = calls[calls.length - 1];
        i = id && (!last || last.id !== id) ? calls.length : Math.max(0, calls.length - 1);
      }
      const slot = (calls[i] ??= { id: '', name: '', args: '' });
      if (id) slot.id = id;
      if (typeof fn['name'] === 'string' && fn['name']) slot.name = fn['name'];
      if (typeof fn['arguments'] === 'string') slot.args += fn['arguments'];
    }
    return piece;
  }

  return {
    push(chunk: string): string {
      raw += chunk;
      pending += chunk;
      let added = '';
      // Split on newlines only — a frame is never acted on until it is whole. \r\n is
      // handled by trimming each line, since SSE allows either.
      for (;;) {
        const nl = pending.indexOf('\n');
        if (nl < 0) break;
        const line = pending.slice(0, nl).trim();
        pending = pending.slice(nl + 1);
        // `:` is a comment (keep-alive), and `event:`/`id:` carry nothing this needs.
        // Per the SSE spec multi-line data fields concatenate; no chat provider emits
        // them, so each `data:` line is treated as one complete payload.
        if (!line.startsWith('data:')) continue;
        added += handleFrame(line.slice(5));
      }
      return added;
    },

    error(): string | null {
      return errMsg;
    },

    finish(): ChatReply {
      // Flush a final frame that arrived without a trailing newline.
      if (pending.trim()) {
        const line = pending.trim();
        if (line.startsWith('data:')) handleFrame(line.slice(5));
        pending = '';
      }
      // Not a stream after all: a server that ignored `stream: true` and answered
      // with one ordinary JSON body. Parsing it as such turns that mismatch into a
      // working answer instead of a blank reply the user cannot explain.
      if (!sawFrame && raw.trim().startsWith('{')) {
        try {
          return parseChatReply(JSON.parse(raw), 'openai');
        } catch {
          /* fall through to the empty reply below */
        }
      }
      const toolCalls: ParsedToolCall[] = calls.filter(Boolean).map((c) => {
        const { input, inputError } = parseArguments(c.args);
        return { id: c.id, name: c.name, input, ...(inputError ? { inputError } : {}) };
      });
      return {
        text: answer.trim(),
        toolCalls,
        usage: readUsage(usageRaw, 'openai'),
        stop: toolCalls.length ? 'tool_use' : mapStop(finish, 'openai'),
      };
    },
  };
}

// ── failures ──────────────────────────────────────────────────────────────────

export type FailureKind =
  /** The key is wrong, revoked, or lacks permission. */
  | 'auth'
  /** Slow down, or the free allowance is spent. Retryable. */
  | 'rate-limit'
  /** The conversation no longer fits. Retryable only after trimming it. */
  | 'context-length'
  /** The request itself was rejected — a bug here, not a user problem. */
  | 'bad-request'
  /** The provider broke. Retryable. */
  | 'server'
  | 'unknown';

export interface ApiFailure {
  kind: FailureKind;
  /** The provider's own words where it had any, for the UI to show verbatim. */
  message: string;
  retryable: boolean;
}

/**
 * Classify a non-OK response so the chat panel can act rather than just apologise.
 *
 * The distinction that earns its keep is context-length: it looks like any other
 * 400, but the fix is to drop old turns and retry, which is something the panel
 * can do by itself. It is detected from the message text because neither vendor
 * gives it a stable code.
 */
export function classifyFailure(status: number, body: unknown): ApiFailure {
  const err = asRecord(asRecord(body)['error']);
  const message =
    (typeof err['message'] === 'string' && err['message']) ||
    (typeof asRecord(body)['message'] === 'string' && (asRecord(body)['message'] as string)) ||
    (typeof body === 'string' && body) ||
    `HTTP ${status}`;
  const lower = message.toLowerCase();

  if (status === 401 || status === 403) return { kind: 'auth', message, retryable: false };
  if (status === 429) return { kind: 'rate-limit', message, retryable: true };
  if (status >= 500) return { kind: 'server', message, retryable: true };
  if (
    status === 413 ||
    lower.includes('context length') ||
    lower.includes('context window') ||
    lower.includes('too many tokens') ||
    lower.includes('prompt is too long') ||
    lower.includes('maximum context')
  ) {
    return { kind: 'context-length', message, retryable: true };
  }
  if (status >= 400) return { kind: 'bad-request', message, retryable: false };
  return { kind: 'unknown', message, retryable: false };
}
