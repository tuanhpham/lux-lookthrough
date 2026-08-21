import { describe, it, expect } from 'vitest';
import {
  buildChatRequest,
  parseChatReply,
  readUsage,
  classifyFailure,
  userText,
  toolResults,
  text,
  type AgentMessage,
} from '../../src/agent/messages.js';
import { findTool } from '../../src/agent/tools.js';
import type { LlmConfig } from '../../src/agent/providers.js';

const gpt: LlmConfig = { providerId: 'openai', model: 'gpt-5' };
const claude: LlmConfig = { providerId: 'anthropic', model: 'claude-opus-5' };
const deepseek: LlmConfig = { providerId: 'deepseek', model: 'deepseek-chat' };

const TOOLS = [findTool('list_positions')!, findTool('record_buy')!];

/** A full tool round-trip: the model asks, we answer, the user follows up. */
const CONVERSATION: AgentMessage[] = [
  userText('what do I own?'),
  {
    role: 'assistant',
    content: [
      text('Let me look.'),
      { type: 'tool_use', id: 'call_1', name: 'list_positions', input: { account: 'Main' } },
    ],
  },
  toolResults([{ type: 'tool_result', toolUseId: 'call_1', content: '[{"ticker":"AAPL"}]' }]),
  userText('and the cash?'),
];

describe('buildChatRequest — Anthropic wire', () => {
  it('puts the system prompt at the top level and caps the output', () => {
    const req = buildChatRequest(claude, { system: 'You are helpful.', messages: CONVERSATION })!;
    expect(req.path).toBe('/messages');
    expect(req.body['system']).toBe('You are helpful.');
    // Anthropic REQUIRES the cap; a request without it is a 400.
    expect(req.body['max_tokens']).toBe(4096);
  });

  it('keeps tool results as blocks inside a user message', () => {
    const req = buildChatRequest(claude, { system: '', messages: CONVERSATION })!;
    const msgs = req.body['messages'] as Array<{ role: string; content: Array<Record<string, unknown>> }>;
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'user']);
    expect(msgs[2]!.content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'call_1',
      content: '[{"ticker":"AAPL"}]',
    });
    expect(msgs[1]!.content[1]).toMatchObject({ type: 'tool_use', id: 'call_1' });
  });

  it('describes tools with input_schema', () => {
    const req = buildChatRequest(claude, { system: '', messages: CONVERSATION, tools: TOOLS })!;
    const tools = req.body['tools'] as Array<Record<string, unknown>>;
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({ name: 'list_positions' });
    expect(tools[0]!['input_schema']).toMatchObject({ type: 'object' });
    expect(tools[0]!['parameters']).toBeUndefined();
  });

  it('marks a failed tool result as an error, so the model retries rather than trusts it', () => {
    const req = buildChatRequest(claude, {
      system: '',
      messages: [toolResults([{ type: 'tool_result', toolUseId: 'c1', content: 'no such account', isError: true }])],
    })!;
    const msgs = req.body['messages'] as Array<{ content: Array<Record<string, unknown>> }>;
    expect(msgs[0]!.content[0]!['is_error']).toBe(true);
  });
});

describe('buildChatRequest — OpenAI wire', () => {
  it('turns the system prompt into the first message', () => {
    const req = buildChatRequest(gpt, { system: 'You are helpful.', messages: CONVERSATION })!;
    expect(req.path).toBe('/chat/completions');
    const msgs = req.body['messages'] as Array<Record<string, unknown>>;
    expect(msgs[0]).toEqual({ role: 'system', content: 'You are helpful.' });
  });

  it('re-splits a tool round-trip into adjacent assistant and tool messages', () => {
    // The API rejects a `tool` message whose id did not just appear, so order here
    // is correctness, not tidiness.
    const req = buildChatRequest(gpt, { system: '', messages: CONVERSATION })!;
    const msgs = req.body['messages'] as Array<Record<string, unknown>>;
    expect(msgs.map((m) => m['role'])).toEqual(['user', 'assistant', 'tool', 'user']);
    expect(msgs[1]!['tool_calls']).toEqual([
      {
        id: 'call_1',
        type: 'function',
        // Arguments cross the wire as a STRING in this format.
        function: { name: 'list_positions', arguments: '{"account":"Main"}' },
      },
    ]);
    expect(msgs[2]).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '[{"ticker":"AAPL"}]',
    });
  });

  it('sends null content beside a tool call, which some providers require', () => {
    const req = buildChatRequest(gpt, {
      system: '',
      messages: [
        { role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'list_positions', input: {} }] },
      ],
    })!;
    const msgs = req.body['messages'] as Array<Record<string, unknown>>;
    expect(msgs[0]!['content']).toBeNull();
  });

  it('uses the output-cap field each provider actually accepts', () => {
    // OpenAI's reasoning-capable models reject `max_tokens` outright; DeepSeek and
    // the other compatible hosts only know that name. One wire, two spellings.
    expect(buildChatRequest(gpt, { system: '', messages: [] })!.body['max_completion_tokens']).toBe(
      4096,
    );
    expect(buildChatRequest(gpt, { system: '', messages: [] })!.body['max_tokens']).toBeUndefined();
    expect(buildChatRequest(deepseek, { system: '', messages: [] })!.body['max_tokens']).toBe(4096);
  });

  it('describes tools as functions with parameters', () => {
    const req = buildChatRequest(gpt, { system: '', messages: [], tools: TOOLS })!;
    const tools = req.body['tools'] as Array<Record<string, unknown>>;
    expect(tools[1]).toMatchObject({ type: 'function' });
    expect(tools[1]!['function']).toMatchObject({ name: 'record_buy' });
  });
});

describe('buildChatRequest — shared behaviour', () => {
  it('omits tools entirely when there are none', () => {
    // An empty array is rejected by several OpenAI-compatible servers.
    expect(buildChatRequest(gpt, { system: '', messages: [], tools: [] })!.body['tools']).toBeUndefined();
    expect(buildChatRequest(claude, { system: '', messages: [] })!.body['tools']).toBeUndefined();
  });

  it('omits temperature unless the caller asked for one', () => {
    // Reasoning models reject any non-default temperature, and a tool-driven
    // assistant has no use for sampling tweaks.
    expect(buildChatRequest(gpt, { system: '', messages: [] })!.body['temperature']).toBeUndefined();
    expect(buildChatRequest(gpt, { system: '', messages: [], temperature: 0 })!.body['temperature']).toBe(0);
  });

  it('drops an empty message rather than sending a blank turn', () => {
    const req = buildChatRequest(claude, {
      system: '',
      messages: [{ role: 'assistant', content: [text('')] }, userText('hi')],
    })!;
    expect((req.body['messages'] as unknown[]).length).toBe(1);
  });

  it('returns null for a provider it does not know', () => {
    expect(buildChatRequest({ providerId: 'ollama' as never, model: 'x' }, { system: '', messages: [] })).toBeNull();
  });
});

describe('parseChatReply — Anthropic wire', () => {
  it('reads text and tool calls, and skips thinking blocks', () => {
    const reply = parseChatReply(
      {
        content: [
          { type: 'thinking', thinking: 'the user probably means…' },
          { type: 'text', text: 'Buying now.' },
          { type: 'tool_use', id: 'tu_1', name: 'record_buy', input: { ticker: 'AAPL', shares: 10 } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 20 },
      },
      'anthropic',
    );
    // Thinking is not part of the answer and must not be shown as if it were.
    expect(reply.text).toBe('Buying now.');
    expect(reply.toolCalls).toEqual([
      { id: 'tu_1', name: 'record_buy', input: { ticker: 'AAPL', shares: 10 } },
    ]);
    expect(reply.stop).toBe('tool_use');
  });

  it('maps the stop reasons', () => {
    const stop = (r: string): string => parseChatReply({ content: [], stop_reason: r }, 'anthropic').stop;
    expect(stop('end_turn')).toBe('end');
    expect(stop('stop_sequence')).toBe('end');
    expect(stop('max_tokens')).toBe('max_tokens');
    expect(stop('refusal')).toBe('refusal');
    expect(stop('something_new')).toBe('unknown');
  });
});

describe('parseChatReply — OpenAI wire', () => {
  it('parses the arguments string into an object', () => {
    const reply = parseChatReply(
      {
        choices: [
          {
            message: {
              content: 'On it.',
              tool_calls: [
                { id: 'c1', type: 'function', function: { name: 'record_buy', arguments: '{"ticker":"AAPL"}' } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 10 },
      },
      'openai',
    );
    expect(reply.text).toBe('On it.');
    expect(reply.toolCalls[0]!.input).toEqual({ ticker: 'AAPL' });
    expect(reply.toolCalls[0]!.inputError).toBeUndefined();
  });

  it('flags unreadable arguments instead of running the tool with nothing in it', () => {
    // This is what a call truncated by the output cap looks like.
    const reply = parseChatReply(
      {
        choices: [
          {
            message: {
              tool_calls: [{ id: 'c1', function: { name: 'record_buy', arguments: '{"ticker":"AAP' } }],
            },
          },
        ],
      },
      'openai',
    );
    expect(reply.toolCalls[0]!.input).toEqual({});
    expect(reply.toolCalls[0]!.inputError).toMatch(/truncated/);
  });

  it('treats emitted tool calls as a tool turn whatever finish_reason claims', () => {
    // Local models and some hosted ones report 'stop' while emitting tool_calls.
    // Believing them would end the turn with the call unrun.
    const reply = parseChatReply(
      {
        choices: [
          {
            message: { tool_calls: [{ id: 'c1', function: { name: 'list_positions', arguments: '{}' } }] },
            finish_reason: 'stop',
          },
        ],
      },
      'openai',
    );
    expect(reply.stop).toBe('tool_use');
  });

  it('reads content sent as an array of parts', () => {
    const reply = parseChatReply(
      { choices: [{ message: { content: [{ type: 'text', text: 'Hello' }] }, finish_reason: 'stop' }] },
      'openai',
    );
    expect(reply.text).toBe('Hello');
    expect(reply.stop).toBe('end');
  });

  it('maps the finish reasons', () => {
    const stop = (r: string): string =>
      parseChatReply({ choices: [{ message: {}, finish_reason: r }] }, 'openai').stop;
    expect(stop('length')).toBe('max_tokens');
    expect(stop('content_filter')).toBe('refusal');
    expect(stop('function_call')).toBe('tool_use');
    expect(stop('who_knows')).toBe('unknown');
  });
});

describe('parseChatReply — robustness', () => {
  it('never throws on a shape it does not recognise', () => {
    // An exception mid-turn would leave the transcript dangling; an empty reply
    // with stop:'unknown' is reported as "no answer" and can be retried.
    for (const junk of [null, undefined, 'a string', 42, [], {}, { choices: [] }, { content: 'not an array' }]) {
      for (const wire of ['anthropic', 'openai'] as const) {
        const reply = parseChatReply(junk, wire);
        expect(reply.text).toBe('');
        expect(reply.toolCalls).toEqual([]);
        expect(reply.stop).toBe('unknown');
        expect(reply.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
      }
    }
  });
});

describe('readUsage', () => {
  it('adds Anthropic cache counts into the input total', () => {
    // THE MONEY BUG THIS PREVENTS: Anthropic reports input_tokens EXCLUDING cache
    // reads, so passing its raw numbers to the estimator under-counts every cached
    // call. The estimator's contract is "input total, of which cached".
    expect(
      readUsage(
        {
          input_tokens: 100,
          output_tokens: 20,
          cache_read_input_tokens: 900,
          cache_creation_input_tokens: 50,
        },
        'anthropic',
      ),
    ).toEqual({ inputTokens: 1050, outputTokens: 20, cachedInputTokens: 900 });
  });

  it('takes OpenAI cached tokens as already inside prompt_tokens', () => {
    expect(
      readUsage(
        { prompt_tokens: 1000, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 800 } },
        'openai',
      ),
    ).toEqual({ inputTokens: 1000, outputTokens: 20, cachedInputTokens: 800 });
  });

  it('reports zeros for a provider that sends no usage at all', () => {
    expect(readUsage(undefined, 'openai')).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(readUsage({ prompt_tokens: 'lots' }, 'openai')).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('omits the cached count when there was none, rather than sending 0', () => {
    expect(readUsage({ input_tokens: 5, output_tokens: 1 }, 'anthropic').cachedInputTokens).toBeUndefined();
  });
});

describe('classifyFailure', () => {
  it('separates a bad key from a rate limit from a broken provider', () => {
    expect(classifyFailure(401, { error: { message: 'invalid x-api-key' } })).toEqual({
      kind: 'auth',
      message: 'invalid x-api-key',
      retryable: false,
    });
    expect(classifyFailure(429, {}).kind).toBe('rate-limit');
    expect(classifyFailure(429, {}).retryable).toBe(true);
    expect(classifyFailure(503, {}).kind).toBe('server');
    expect(classifyFailure(503, {}).retryable).toBe(true);
  });

  it('recognises a too-long conversation, which the panel can fix by itself', () => {
    // It arrives as an ordinary 400 with no stable code, but the remedy — drop old
    // turns and retry — is the one thing the panel can do without the user.
    expect(classifyFailure(400, { error: { message: 'prompt is too long: 250000 tokens' } })).toMatchObject({
      kind: 'context-length',
      retryable: true,
    });
    expect(
      classifyFailure(400, { error: { message: "This model's maximum context length is 128000 tokens" } }).kind,
    ).toBe('context-length');
  });

  it('keeps an ordinary 400 separate, since retrying it changes nothing', () => {
    expect(classifyFailure(400, { error: { message: 'Unsupported parameter: max_tokens' } })).toEqual({
      kind: 'bad-request',
      message: 'Unsupported parameter: max_tokens',
      retryable: false,
    });
  });

  it('finds the provider message wherever it was put, and invents one when absent', () => {
    expect(classifyFailure(400, { message: 'top-level message' }).message).toBe('top-level message');
    expect(classifyFailure(500, 'Internal Server Error').message).toBe('Internal Server Error');
    expect(classifyFailure(418, {}).message).toBe('HTTP 418');
  });
});
