/**
 * The rules of one assistant turn: when to run tools, when to stop, and what to
 * throw away when the conversation stops fitting.
 *
 * All of this could live in the app's loop, and it is here instead because each
 * rule is a decision with a wrong answer that costs money or breaks the next
 * request — exactly the kind of thing worth testing without a browser.
 *
 * ── THE PAIRING INVARIANT ───────────────────────────────────────────────────
 * A tool result is only legal when the call it answers is still in the transcript.
 * Both APIs reject the pair being split — Anthropic with "tool_result without
 * tool_use", OpenAI with a 400 on the orphaned `tool_call_id`. So the trimming
 * below cuts only at conversation boundaries, never between a call and its result,
 * and `firstDanglingToolResult` states that invariant so a test can hold it.
 *
 * Pure functions over the neutral transcript. No fetch, no clock, no DOM.
 */

import type { AgentMessage, ChatReply, ParsedToolCall, ToolUseBlock } from './messages.js';
import { text } from './messages.js';
import type { TokenUsage } from './providers.js';

/**
 * How many times the model may call tools before the turn is cut off.
 *
 * Six covers the longest legitimate chain — find the account, list positions,
 * quote what it found, check the summary, look at history, answer — with room for
 * one retry after a bad argument. Past that a model is looping, and every round is
 * a full request whose input includes every previous round.
 */
export const MAX_TOOL_ROUNDS = 6;

export type HaltReason =
  /** Hit `MAX_TOOL_ROUNDS` still asking for tools. */
  | 'round-limit'
  /** The provider's safety layer declined. */
  | 'refused'
  /** No text and no tool call: nothing to show and nothing to run. */
  | 'empty';

export type AgentAction =
  | { kind: 'run-tools'; calls: readonly ParsedToolCall[] }
  /** `truncated` when the output cap cut the answer off mid-sentence. */
  | { kind: 'answer'; truncated: boolean }
  | { kind: 'halt'; reason: HaltReason };

/**
 * What to do with a reply.
 *
 * `roundsUsed` counts tool rounds already run in THIS turn, not messages.
 */
export function nextAction(reply: ChatReply, roundsUsed: number): AgentAction {
  if (reply.toolCalls.length) {
    if (roundsUsed >= MAX_TOOL_ROUNDS) return { kind: 'halt', reason: 'round-limit' };
    return { kind: 'run-tools', calls: reply.toolCalls };
  }
  if (reply.stop === 'refusal') return { kind: 'halt', reason: 'refused' };
  if (!reply.text) return { kind: 'halt', reason: 'empty' };
  return { kind: 'answer', truncated: reply.stop === 'max_tokens' };
}

/**
 * The assistant message to record for a reply — its words AND its tool calls.
 *
 * Recording the calls is not optional bookkeeping: the next request must contain
 * them, or the tool results sent with it answer nothing. A call whose arguments
 * could not be parsed is still recorded, with the input the parser salvaged, so
 * that the error handed back has a call to attach to.
 */
export function assistantMessage(reply: ChatReply): AgentMessage {
  const blocks = reply.text ? [text(reply.text)] : [];
  const calls: ToolUseBlock[] = reply.toolCalls.map((c) => ({
    type: 'tool_use',
    id: c.id,
    name: c.name,
    input: c.input,
  }));
  return { role: 'assistant', content: [...blocks, ...calls] };
}

/** True for a message the USER actually wrote, as opposed to tool output. */
function isUserText(msg: AgentMessage): boolean {
  return msg.role === 'user' && msg.content.some((b) => b.type === 'text');
}

/**
 * Drop the oldest exchange so a too-long conversation can be retried.
 *
 * Returns null when there is nothing safe left to drop — the current question and
 * its own tool traffic, which the caller must not send half of. At that point the
 * honest move is to tell the user to start a new conversation.
 *
 * An "exchange" runs from one user-written message up to the next, so the assistant
 * turns and tool results in between go with it. That boundary is what keeps every
 * surviving tool result next to its call.
 */
export function trimForRetry(messages: readonly AgentMessage[]): AgentMessage[] | null {
  const starts: number[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    if (isUserText(messages[i]!)) starts.push(i);
  }
  // Fewer than two questions means everything present belongs to the live one.
  if (starts.length < 2) return null;
  return messages.slice(starts[1]!);
}

/**
 * The first tool result with no matching call, or null when the transcript is
 * legal. Exists to state the pairing invariant as something checkable — the
 * trimming above is written to satisfy it, and a test holds it to that.
 */
export function firstDanglingToolResult(messages: readonly AgentMessage[]): string | null {
  const seen = new Set<string>();
  for (const msg of messages) {
    for (const b of msg.content) {
      if (b.type === 'tool_use') seen.add(b.id);
      else if (b.type === 'tool_result' && !seen.has(b.toolUseId)) return b.toolUseId;
    }
  }
  return null;
}

/** Add up the usage of every request in a turn, for one cost figure. */
export function sumUsage(usages: readonly TokenUsage[]): TokenUsage {
  let input = 0;
  let output = 0;
  let cached = 0;
  for (const u of usages) {
    input += u.inputTokens;
    output += u.outputTokens;
    cached += u.cachedInputTokens ?? 0;
  }
  return {
    inputTokens: input,
    outputTokens: output,
    // Omitted rather than zero, matching `readUsage`: "no cached tokens" and "this
    // provider does not report them" are different facts and the estimator treats
    // them the same only by accident.
    ...(cached ? { cachedInputTokens: cached } : {}),
  };
}
