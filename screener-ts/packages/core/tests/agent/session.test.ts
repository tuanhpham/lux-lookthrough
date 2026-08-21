import { describe, it, expect } from 'vitest';
import {
  MAX_TOOL_ROUNDS,
  assistantMessage,
  firstDanglingToolResult,
  nextAction,
  sumUsage,
  trimForRetry,
} from '../../src/agent/session.js';
import { text, toolResults, userText, type AgentMessage, type ChatReply } from '../../src/agent/messages.js';

const reply = (over: Partial<ChatReply> = {}): ChatReply => ({
  text: '',
  toolCalls: [],
  usage: { inputTokens: 0, outputTokens: 0 },
  stop: 'end',
  ...over,
});

const call = (id: string, name = 'list_positions') => ({ id, name, input: {} });

describe('what to do with a reply', () => {
  it('runs the tools the model asked for', () => {
    const a = nextAction(reply({ toolCalls: [call('t1')], stop: 'tool_use' }), 0);
    expect(a.kind).toBe('run-tools');
    expect(a.kind === 'run-tools' && a.calls[0]!.id).toBe('t1');
  });

  it('answers when there are words and no tools', () => {
    expect(nextAction(reply({ text: 'You hold 3 positions.' }), 2)).toEqual({
      kind: 'answer',
      truncated: false,
    });
  });

  it('flags an answer the output cap cut off', () => {
    // The panel says so, rather than presenting half a sentence as the whole answer.
    expect(nextAction(reply({ text: 'You hold', stop: 'max_tokens' }), 0)).toEqual({
      kind: 'answer',
      truncated: true,
    });
  });

  it('stops after the round limit even though the model wants more tools', () => {
    // Every round re-sends the whole conversation, so a loop costs real money.
    const a = nextAction(reply({ toolCalls: [call('t9')] }), MAX_TOOL_ROUNDS);
    expect(a).toEqual({ kind: 'halt', reason: 'round-limit' });
  });

  it('halts on a refusal and on a silent reply', () => {
    expect(nextAction(reply({ stop: 'refusal' }), 0)).toEqual({ kind: 'halt', reason: 'refused' });
    expect(nextAction(reply({ text: '' }), 0)).toEqual({ kind: 'halt', reason: 'empty' });
  });

  it('prefers running tools over reporting a refusal', () => {
    // A reply with both is a model that asked for a tool; the stop reason is noise.
    expect(nextAction(reply({ toolCalls: [call('t1')], stop: 'refusal' }), 0).kind).toBe(
      'run-tools',
    );
  });
});

describe('recording the assistant turn', () => {
  it('keeps the tool calls, not just the words', () => {
    // Without the calls in the transcript, the results sent next answer nothing.
    const msg = assistantMessage(reply({ text: 'Let me look.', toolCalls: [call('t1')] }));
    expect(msg.role).toBe('assistant');
    expect(msg.content.map((b) => b.type)).toEqual(['text', 'tool_use']);
  });

  it('records a call whose arguments could not be parsed', () => {
    // It still needs to exist, or the error handed back has nothing to attach to.
    const msg = assistantMessage(
      reply({ toolCalls: [{ ...call('t1'), inputError: 'truncated JSON' }] }),
    );
    expect(msg.content).toHaveLength(1);
    expect(msg.content[0]!.type).toBe('tool_use');
  });

  it('emits no empty text block when the model only called a tool', () => {
    const msg = assistantMessage(reply({ text: '', toolCalls: [call('t1')] }));
    expect(msg.content.every((b) => b.type === 'tool_use')).toBe(true);
  });
});

describe('trimming a conversation that no longer fits', () => {
  // Two complete exchanges, each with a tool call and its result.
  const exchange = (n: number): AgentMessage[] => [
    userText(`question ${n}`),
    { role: 'assistant', content: [text('checking'), { type: 'tool_use', id: `t${n}`, name: 'list_positions', input: {} }] },
    toolResults([{ type: 'tool_result', toolUseId: `t${n}`, content: '[]' }]),
    { role: 'assistant', content: [text(`answer ${n}`)] },
  ];
  const full = [...exchange(1), ...exchange(2), userText('question 3')];

  it('drops the oldest exchange whole', () => {
    const out = trimForRetry(full)!;
    expect(out[0]).toEqual(userText('question 2'));
    expect(out).toHaveLength(5);
  });

  it('NEVER leaves a tool result without its call', () => {
    // THE INVARIANT: both APIs reject a split pair with a 400, so a retry built on
    // a bad trim fails on top of the failure it was trying to recover from.
    expect(firstDanglingToolResult(full)).toBeNull();
    let cur: AgentMessage[] | null = full;
    while (cur) {
      expect(firstDanglingToolResult(cur)).toBeNull();
      cur = trimForRetry(cur);
    }
  });

  it('gives up rather than cut into the live question', () => {
    // One question left means everything present belongs to it. Half of it is worse
    // than none: the honest move is to tell the user to start a new conversation.
    expect(trimForRetry(exchange(1))).toBeNull();
    expect(trimForRetry([])).toBeNull();
  });

  it('does not count a tool result as a user turn', () => {
    // Tool results ride in a `user` message. Cutting at one would orphan its call.
    const withResults: AgentMessage[] = [
      userText('only question'),
      { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'get_quote', input: {} }] },
      toolResults([{ type: 'tool_result', toolUseId: 'a', content: '{}' }]),
    ];
    expect(trimForRetry(withResults)).toBeNull();
  });
});

describe('adding up what the turn cost', () => {
  it('sums input and output across every request', () => {
    expect(
      sumUsage([
        { inputTokens: 100, outputTokens: 20 },
        { inputTokens: 340, outputTokens: 55 },
      ]),
    ).toEqual({ inputTokens: 440, outputTokens: 75 });
  });

  it('omits cached tokens rather than reporting zero', () => {
    // "None cached" and "this provider does not say" are different facts.
    const none = sumUsage([{ inputTokens: 10, outputTokens: 1 }]);
    expect('cachedInputTokens' in none).toBe(false);
    expect(
      sumUsage([
        { inputTokens: 10, outputTokens: 1, cachedInputTokens: 8 },
        { inputTokens: 10, outputTokens: 1 },
      ]).cachedInputTokens,
    ).toBe(8);
  });

  it('is zero for a turn that never reached the API', () => {
    expect(sumUsage([])).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
