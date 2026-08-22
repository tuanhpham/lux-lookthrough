import { describe, it, expect } from 'vitest';
import {
  LLM_PROVIDERS,
  findProvider,
  relayableProviders,
  relayUpstreams,
  resolveBaseUrl,
  pickDefaultModel,
  parseModelList,
  authHeaders,
  buildProbeRequest,
  tokenLimitField,
  probeVerdict,
  estimateCostUsd,
  seededPrices,
} from '../../src/agent/providers.js';
import type { LlmConfig } from '../../src/agent/providers.js';

const cfg = (over: Partial<LlmConfig> = {}): LlmConfig => ({
  providerId: 'openai',
  model: 'gpt-x',
  ...over,
});

describe('the registry itself', () => {
  it('gives every provider a unique id and one of the two wire formats', () => {
    const ids = LLM_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of LLM_PROVIDERS) expect(['openai', 'anthropic']).toContain(p.wire);
  });

  it('routes Claude through the Anthropic wire, never an OpenAI-compatible shim', () => {
    // The formats disagree about thinking blocks and tool results, and a shim drops
    // both silently. This assertion is here to fail loudly if someone ever
    // "simplifies" the registry down to a single format.
    expect(findProvider('anthropic')!.wire).toBe('anthropic');
    expect(findProvider('anthropic')!.headers?.['anthropic-version']).toBeTruthy();
  });

  it('uses https for every hosted provider, and a full URL with no trailing slash', () => {
    for (const p of relayableProviders()) {
      expect(p.upstream.startsWith('https://')).toBe(true);
      expect(p.upstream.endsWith('/')).toBe(false);
    }
  });

  it('asks for a key wherever one is actually needed', () => {
    // Only a local model may skip the key; a hosted provider without one would
    // fail at the first call with an opaque 401. The link to go get that key is
    // required too — EXCEPT where the user brings the endpoint, since there is no
    // vendor page to send them to and inventing one would be a lie.
    for (const p of LLM_PROVIDERS) {
      if (!p.keyRequired) expect(p.directOnly).toBe(true);
      else if (!p.baseUrlRequired) expect(p.keysUrl).toBeTruthy();
    }
  });

  it('gives a user-supplied endpoint no default host to fall back to', () => {
    // The whole point of `baseUrlExample`: a placeholder is a hint, an `upstream` is
    // somewhere the app will actually POST the key. `local` is the one exception —
    // Ollama's port is a real, universal default, not a guess.
    const custom = findProvider('custom')!;
    expect(custom.upstream).toBe('');
    expect(custom.baseUrlExample).toBeTruthy();
    expect(custom.baseUrlRequired).toBe(true);
    expect(custom.directOnly).toBe(true);
  });
});

describe('relay allow-list', () => {
  it('excludes self-hosted endpoints', () => {
    // A relay that forwarded to a caller-supplied host would be an open proxy, and
    // a Cloudflare Function cannot reach the user's localhost anyway.
    for (const id of ['local', 'custom']) {
      expect(relayableProviders().map((p) => p.id)).not.toContain(id);
      expect(Object.keys(relayUpstreams())).not.toContain(id);
    }
  });

  it('maps each relayable id to its fixed upstream', () => {
    // Pinned in full ON PURPOSE. The relay (apps/desktop/functions/api/llm) carries
    // a duplicate of this map because Pages Functions cannot resolve the workspace
    // package, so adding a provider here must be a visible diff in this test — the
    // reminder that the relay copy needs the same edit or the provider 404s.
    expect(relayUpstreams()).toEqual({
      openai: 'https://api.openai.com/v1',
      anthropic: 'https://api.anthropic.com/v1',
      gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
      deepseek: 'https://api.deepseek.com/v1',
      groq: 'https://api.groq.com/openai/v1',
      openrouter: 'https://openrouter.ai/api/v1',
    });
  });
});

describe('resolveBaseUrl', () => {
  it('ignores a base URL on a hosted provider', () => {
    // THE POINT: a stored preference must never be able to redirect the user's API
    // key to an attacker-chosen host.
    expect(resolveBaseUrl(cfg({ baseUrl: 'https://evil.example/v1' }))).toBe(
      'https://api.openai.com/v1',
    );
  });

  it('honours it for a local provider, trimming trailing slashes', () => {
    expect(resolveBaseUrl(cfg({ providerId: 'local', baseUrl: 'http://127.0.0.1:1234/v1//' }))).toBe(
      'http://127.0.0.1:1234/v1',
    );
  });

  it('falls back to the default endpoint when the local URL is blank', () => {
    expect(resolveBaseUrl(cfg({ providerId: 'local', baseUrl: '   ' }))).toBe(
      'http://localhost:11434/v1',
    );
  });

  it('honours it for a custom endpoint, and reports none until one is given', () => {
    expect(
      resolveBaseUrl(cfg({ providerId: 'custom', baseUrl: ' https://api.example.dev/v1/ ' })),
    ).toBe('https://api.example.dev/v1');
    // Null, not the example URL: nothing may be POSTed anywhere until the user says
    // where. `isConfigured` in the app turns this into "not configured yet".
    expect(resolveBaseUrl(cfg({ providerId: 'custom' }))).toBeNull();
    expect(resolveBaseUrl(cfg({ providerId: 'custom', baseUrl: '  ' }))).toBeNull();
  });

  it('returns null for an unknown provider', () => {
    expect(resolveBaseUrl(cfg({ providerId: 'nope' as never }))).toBeNull();
  });
});

describe('pickDefaultModel', () => {
  it('prefers the newest family the provider actually offers', () => {
    expect(pickDefaultModel('openai', ['gpt-4o', 'gpt-5', 'gpt-3.5-turbo'])).toBe('gpt-5');
  });

  it('prefers the base id over dated and size-suffixed variants', () => {
    // Vendors list `gpt-5` next to `gpt-5-nano-2025-…`. The short id is the one
    // that keeps working and the one the user recognises.
    expect(pickDefaultModel('openai', ['gpt-5-nano-2025-08-07', 'gpt-5-mini', 'gpt-5'])).toBe(
      'gpt-5',
    );
  });

  it('falls back to a lower preference when the top family is absent', () => {
    expect(pickDefaultModel('openai', ['gpt-4o-mini', 'gpt-4o'])).toBe('gpt-4o');
  });

  it('picks Opus 5 for Claude when it is on the list', () => {
    expect(
      pickDefaultModel('anthropic', ['claude-haiku-4-5', 'claude-opus-5', 'claude-sonnet-5']),
    ).toBe('claude-opus-5');
  });

  it('prefers a free OpenRouter variant, so a cost-averse choice stays free', () => {
    expect(pickDefaultModel('openrouter', ['openai/gpt-5', 'qwen/qwen3-8b:free'])).toBe(
      'qwen/qwen3-8b:free',
    );
  });

  it('still returns something when nothing matches a preference', () => {
    expect(pickDefaultModel('anthropic', ['zzz', 'aaa'])).toBe('aaa');
  });

  it('returns null when the provider reported no models at all', () => {
    expect(pickDefaultModel('openai', [])).toBeNull();
  });
});

describe('parseModelList', () => {
  it('reads the OpenAI/Anthropic `data[].id` shape', () => {
    expect(parseModelList({ data: [{ id: 'b' }, { id: 'a' }] })).toEqual(['a', 'b']);
  });

  it("reads Ollama's native `models[].name` shape", () => {
    expect(parseModelList({ models: [{ name: 'llama3:8b' }] })).toEqual(['llama3:8b']);
  });

  it('strips the "models/" prefix Gemini returns, since the chat call rejects it', () => {
    expect(parseModelList({ data: [{ id: 'models/gemini-2.5-flash' }] })).toEqual([
      'gemini-2.5-flash',
    ]);
  });

  it('de-duplicates', () => {
    expect(parseModelList({ data: [{ id: 'x' }, { id: 'x' }] })).toEqual(['x']);
  });

  it('yields [] rather than throwing on a shape it does not know', () => {
    // The caller then lets the user type an id by hand — far better than failing
    // the whole configuration dialog.
    expect(parseModelList({ oops: true })).toEqual([]);
    expect(parseModelList(null)).toEqual([]);
    expect(parseModelList('nonsense')).toEqual([]);
    expect(parseModelList({ data: [{}, { id: 42 }] })).toEqual([]);
  });
});

describe('authHeaders', () => {
  it('uses x-api-key for Anthropic and keeps the version pin', () => {
    const h = authHeaders('anthropic', 'sk-ant-123');
    expect(h['x-api-key']).toBe('sk-ant-123');
    expect(h.authorization).toBeUndefined();
    expect(h['anthropic-version']).toBe('2023-06-01');
  });

  it('uses a bearer token for OpenAI-format providers', () => {
    expect(authHeaders('openai', 'sk-123').authorization).toBe('Bearer sk-123');
  });

  it('omits auth entirely when there is no key, so a local model still works', () => {
    expect(authHeaders('local', '')).toEqual({});
  });
});

describe('the connection probe', () => {
  it('targets the provider chat path with a one-token request', () => {
    const p = buildProbeRequest('anthropic', 'claude-opus-5')!;
    expect(p.path).toBe('/messages');
    expect(p.body.max_tokens).toBe(1);
    expect(p.body.model).toBe('claude-opus-5');
  });

  it('caps the output with the field the provider actually accepts', () => {
    // A probe that passed on `max_tokens` while every real call was rejected for
    // using it would be worse than no probe at all.
    const openai = buildProbeRequest('openai', 'gpt-5')!;
    expect(openai.body.max_completion_tokens).toBe(1);
    expect(openai.body.max_tokens).toBeUndefined();
    expect(buildProbeRequest('deepseek', 'deepseek-chat')!.body.max_tokens).toBe(1);
    expect(tokenLimitField('groq')).toBe('max_tokens');
  });

  it('lets a saved override win, and ignores a nonsense one', () => {
    // The override exists for gateways: the registry knows what OpenAI accepts, not
    // what someone's proxy in front of it accepts. A junk value falls back to the
    // provider's own field rather than being sent as a parameter name.
    expect(tokenLimitField('custom', 'max_completion_tokens')).toBe('max_completion_tokens');
    expect(tokenLimitField('openai', 'max_tokens')).toBe('max_tokens');
    expect(tokenLimitField('custom', 'nonsense')).toBe('max_tokens');
    expect(tokenLimitField('openai', '')).toBe('max_completion_tokens');
    const probe = buildProbeRequest('custom', 'gpt-5.6', 'max_completion_tokens')!;
    expect(probe.body.max_completion_tokens).toBe(1);
    expect(probe.body.max_tokens).toBeUndefined();
  });

  it('treats a 400 as reachable, because the probe tests the key and not the params', () => {
    // Newer models rename max_tokens and some providers reject max_tokens: 1
    // outright. Reporting "broken" for those sends the user hunting a non-problem.
    expect(probeVerdict(400)).toBe('ok');
    expect(probeVerdict(200)).toBe('ok');
    expect(probeVerdict(429)).toBe('ok');
  });

  it('reports the statuses that really do mean a wrong configuration', () => {
    expect(probeVerdict(401)).toBe('bad-key');
    expect(probeVerdict(403)).toBe('bad-key');
    expect(probeVerdict(404)).toBe('no-access');
    expect(probeVerdict(503)).toBe('unreachable');
  });
});

describe('estimateCostUsd', () => {
  it('prices a Claude exchange from the seeded numbers', () => {
    // 1M in @ $5 + 1M out @ $25.
    const usd = estimateCostUsd(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      cfg({ providerId: 'anthropic', model: 'claude-opus-5' }),
    );
    expect(usd).toBeCloseTo(30, 6);
  });

  it('applies the cache discount where the provider documents one', () => {
    // 1M cached input at 0.1x = $0.50, no output.
    const usd = estimateCostUsd(
      { inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 1_000_000 },
      cfg({ providerId: 'anthropic', model: 'claude-opus-5' }),
    );
    expect(usd).toBeCloseTo(0.5, 6);
  });

  it('bills cached tokens at full price when no discount is known, erring high', () => {
    const usd = estimateCostUsd(
      { inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 1_000_000 },
      cfg({ inputPerMTok: 2, outputPerMTok: 8 }),
    );
    expect(usd).toBeCloseTo(2, 6);
  });

  it('ignores a cached count larger than the input count', () => {
    const usd = estimateCostUsd(
      { inputTokens: 100, outputTokens: 0, cachedInputTokens: 999_999 },
      cfg({ inputPerMTok: 1_000_000, outputPerMTok: 0 }),
    );
    expect(usd).toBeCloseTo(100, 6);
  });

  it('uses the user-supplied price over the seeded one', () => {
    const usd = estimateCostUsd(
      { inputTokens: 1_000_000, outputTokens: 0 },
      cfg({ providerId: 'anthropic', model: 'claude-opus-5', inputPerMTok: 1, outputPerMTok: 1 }),
    );
    expect(usd).toBeCloseTo(1, 6);
  });

  it('returns null when the price is unknown, instead of guessing zero', () => {
    // A meter that reads $0.00 because it has no price is worse than one that
    // admits it does not know.
    expect(estimateCostUsd({ inputTokens: 5_000, outputTokens: 500 }, cfg())).toBeNull();
  });
});

describe('seededPrices', () => {
  it('reports what the registry knows', () => {
    expect(seededPrices(cfg({ providerId: 'anthropic', model: 'claude-sonnet-5' }))).toEqual({
      input: 3,
      output: 15,
    });
  });

  it('reports nothing for a model whose price would be a guess', () => {
    expect(seededPrices(cfg())).toEqual({ input: undefined, output: undefined });
  });
});
