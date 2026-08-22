import { describe, it, expect } from 'vitest';
import {
  buildChatRequest,
  createOpenaiChatStream,
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

  it('lets a custom endpoint override that field from its saved config', () => {
    // A gateway can front models that renamed the parameter, and the registry cannot
    // know which — so the user's choice has to reach the request body, not just the
    // connection probe.
    const gw = {
      providerId: 'custom' as const,
      model: 'gpt-5.6-sol',
      baseUrl: 'https://gateway.example.com/v1',
      tokenLimitField: 'max_completion_tokens' as const,
    };
    const body = buildChatRequest(gw, { system: '', messages: [] })!.body;
    expect(body['max_completion_tokens']).toBe(4096);
    expect(body['max_tokens']).toBeUndefined();
  });

  it('asks to stream, with usage, only where streaming is actually in use', () => {
    // `stream_options` is the part that is easy to forget: a streamed reply carries NO
    // usage block without it, so the cost meter would sit at zero all conversation.
    const gw = { providerId: 'custom' as const, model: 'm', baseUrl: 'https://g.example/v1' };
    const on = buildChatRequest(gw, { system: '', messages: [] })!.body;
    expect(on['stream']).toBe(true);
    expect(on['stream_options']).toEqual({ include_usage: true });

    // Turned off in the dialog, and the flag disappears rather than being sent false.
    const off = buildChatRequest({ ...gw, stream: false }, { system: '', messages: [] })!.body;
    expect(off['stream']).toBeUndefined();
    expect(off['stream_options']).toBeUndefined();

    // A vendor addressed directly does not stream: it answers a buffered request fine,
    // and buffered replies are simpler to be right about.
    expect(buildChatRequest(gpt, { system: '', messages: [] })!.body['stream']).toBeUndefined();
  });

  it('never asks the Anthropic wire to stream, whose frames this cannot read', () => {
    // `createOpenaiChatStream` only understands OpenAI frames. Setting the flag on an
    // Anthropic request would produce a response nothing here can parse.
    const req = buildChatRequest({ ...claude, stream: true }, { system: '', messages: [] })!;
    expect(req.body['stream']).toBeUndefined();
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

describe('createOpenaiChatStream', () => {
  /** One SSE frame, as a server would write it. */
  const frame = (o: unknown): string => `data: ${JSON.stringify(o)}\n\n`;
  const delta = (o: unknown): string => frame({ choices: [{ delta: o }] });

  it('returns each piece of text as it arrives, and the whole of it at the end', () => {
    const s = createOpenaiChatStream();
    expect(s.push(delta({ role: 'assistant', content: '' }))).toBe('');
    expect(s.push(delta({ content: 'You own ' }))).toBe('You own ');
    expect(s.push(delta({ content: '3 positions.' }))).toBe('3 positions.');
    s.push(frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }));
    s.push('data: [DONE]\n\n');
    expect(s.finish()).toMatchObject({ text: 'You own 3 positions.', stop: 'end', toolCalls: [] });
  });

  it('waits for the newline before parsing, so a chunk may split anywhere', () => {
    // The actual failure mode this guards: a network packet ends mid-JSON. Parsing
    // early throws away that frame, and the answer silently loses a word.
    const s = createOpenaiChatStream();
    const whole = delta({ content: 'hello' });
    const cut = Math.floor(whole.length / 2);
    expect(s.push(whole.slice(0, cut))).toBe('');
    expect(s.push(whole.slice(cut))).toBe('hello');
    expect(s.finish().text).toBe('hello');
  });

  it('accepts data with or without the space, and ignores comments and events', () => {
    const s = createOpenaiChatStream();
    s.push(': keep-alive\n');
    s.push('event: message\n');
    s.push('id: 42\n');
    s.push(`data:${JSON.stringify({ choices: [{ delta: { content: 'a' } }] })}\n`);
    s.push(`data: ${JSON.stringify({ choices: [{ delta: { content: 'b' } }] })}\n`);
    expect(s.finish().text).toBe('ab');
  });

  it('reassembles a tool call whose arguments were split across frames', () => {
    // `arguments` is a JSON STRING delivered in fragments — no single frame parses.
    const s = createOpenaiChatStream();
    s.push(delta({ tool_calls: [{ index: 0, id: 'call_1', function: { name: 'list_positions', arguments: '' } }] }));
    s.push(delta({ tool_calls: [{ index: 0, function: { arguments: '{"acc' } }] }));
    s.push(delta({ tool_calls: [{ index: 0, function: { arguments: 'ount":"Ma' } }] }));
    s.push(delta({ tool_calls: [{ index: 0, function: { arguments: 'in"}' } }] }));
    s.push(frame({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }));
    const reply = s.finish();
    expect(reply.toolCalls).toEqual([
      { id: 'call_1', name: 'list_positions', input: { account: 'Main' } },
    ]);
    expect(reply.stop).toBe('tool_use');
  });

  it('keeps two parallel calls apart even when the server omits the index', () => {
    // Merging them concatenates both argument strings into one unparseable blob, and
    // the model gets told its own perfectly good call was malformed.
    const s = createOpenaiChatStream();
    s.push(delta({ tool_calls: [{ id: 'c1', function: { name: 'list_positions', arguments: '{"account":' } }] }));
    s.push(delta({ tool_calls: [{ function: { arguments: '"Main"}' } }] }));
    s.push(delta({ tool_calls: [{ id: 'c2', function: { name: 'get_quote', arguments: '{"ticker":"NVDA"}' } }] }));
    const reply = s.finish();
    expect(reply.toolCalls.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(reply.toolCalls[0]!.input).toEqual({ account: 'Main' });
    expect(reply.toolCalls[1]!.input).toEqual({ ticker: 'NVDA' });
  });

  it('reads the usage that only the last frame carries', () => {
    const s = createOpenaiChatStream();
    s.push(delta({ content: 'hi' }));
    s.push(frame({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 8 } }));
    expect(s.finish().usage).toEqual({ inputTokens: 120, outputTokens: 8 });
  });

  it('surfaces an error that arrived inside a 200 response', () => {
    // The status line was already sent, so `res.ok` was true and only the body knows.
    const s = createOpenaiChatStream();
    s.push(delta({ content: 'partial' }));
    s.push(frame({ error: { message: 'insufficient quota' } }));
    expect(s.error()).toBe('insufficient quota');
  });

  it('reports no error for an ordinary stream', () => {
    const s = createOpenaiChatStream();
    s.push(delta({ content: 'fine' }));
    expect(s.error()).toBeNull();
  });

  it('falls back to a plain JSON body from a server that ignored stream: true', () => {
    // Rather than showing a blank answer the user has no way to explain.
    const s = createOpenaiChatStream();
    s.push(
      JSON.stringify({
        choices: [{ message: { content: 'Buffered after all.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 3 },
      }),
    );
    expect(s.finish()).toMatchObject({
      text: 'Buffered after all.',
      stop: 'end',
      usage: { inputTokens: 10, outputTokens: 3 },
    });
  });

  it('flushes a final frame that came without a trailing newline', () => {
    const s = createOpenaiChatStream();
    s.push(`data: ${JSON.stringify({ choices: [{ delta: { content: 'last' } }] })}`);
    expect(s.finish().text).toBe('last');
  });

  it('survives junk without losing the answer around it', () => {
    const s = createOpenaiChatStream();
    s.push(delta({ content: 'before ' }));
    s.push('data: not json at all\n');
    s.push('data: \n');
    s.push(delta({ content: 'after' }));
    expect(s.finish().text).toBe('before after');
  });

  it('returns an empty reply for a stream that said nothing', () => {
    // 'unknown' rather than 'end': nothing said why it stopped, and `nextAction` reads
    // an empty answer with no reason as a halt — which is exactly right here.
    const s = createOpenaiChatStream();
    s.push('data: [DONE]\n\n');
    expect(s.finish()).toEqual({
      text: '',
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      stop: 'unknown',
    });
  });

  it('takes a whole message in one frame, for servers that stream exactly once', () => {
    const s = createOpenaiChatStream();
    s.push(frame({ choices: [{ message: { content: 'all at once' }, finish_reason: 'stop' }] }));
    expect(s.finish().text).toBe('all at once');
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
