/**
 * The LLM provider registry — which APIs the assistant can talk to, and how.
 *
 * ── WHY A REGISTRY AND NOT A CLIENT ─────────────────────────────────────────
 * The assistant has to work with whatever key the user owns (GPT today, Claude or
 * DeepSeek tomorrow), so nothing above this file may hardcode a vendor. Two wire
 * formats cover the whole field:
 *
 *   'openai'    → OpenAI, DeepSeek, Groq, OpenRouter, Gemini's compat endpoint,
 *                 and anything self-hosted (Ollama / LM Studio / vLLM)
 *   'anthropic' → Claude
 *
 * So there are two request serialisers to write, not one per vendor. Claude is
 * NEVER routed through an OpenAI-compatible shim: the formats differ on thinking
 * blocks and tool results, and the shim silently drops both.
 *
 * ── WHY NO HARDCODED MODEL IDS ──────────────────────────────────────────────
 * Model ids churn every few months and a stale default 404s on the user's very
 * first message. Both wire formats expose a model-list endpoint, so the model
 * dropdown is POPULATED FROM THE PROVIDER at configuration time and the default
 * is chosen by matching `prefer` patterns against what actually came back. The
 * only thing this file asserts about a vendor is its hostname.
 *
 * ── WHY PRICES ARE MOSTLY UNDEFINED ─────────────────────────────────────────
 * Only Anthropic's are seeded, because they are the only ones this file can state
 * accurately. Everything else is `undefined` and editable in the settings dialog:
 * a cost meter that quietly uses a price from last year is worse than one that
 * says it does not know yet.
 *
 * This module is pure data + pure functions. No fetch, no DOM — the transport
 * lives in the app (and, for the deployed web build, in the /api/llm relay).
 */

export type WireFormat = 'anthropic' | 'openai';

export type LlmProviderId =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'groq'
  | 'openrouter'
  | 'custom'
  | 'local';

/** How much a provider costs to use, before any per-model price is known. */
export type CostTier =
  /** Pay per token, no free allowance. */
  | 'metered'
  /** Has a genuinely free allowance (rate-limited). */
  | 'free-tier'
  /** Runs on the user's own machine — free, private, and offline. */
  | 'local';

export interface LlmModel {
  id: string;
  /** USD per million input tokens. Undefined = unknown; the user can supply it. */
  inputPerMTok?: number;
  /** USD per million output tokens. */
  outputPerMTok?: number;
}

export interface LlmProviderDef {
  id: LlmProviderId;
  label: string;
  wire: WireFormat;
  /** API root, no trailing slash. The relay's allow-list is derived from this. */
  upstream: string;
  /** How the key is presented upstream. The two wire formats disagree. */
  auth: 'x-api-key' | 'bearer';
  /** Headers the upstream requires regardless of the request body. */
  headers?: Record<string, string>;
  /** Path for one chat/completion call, relative to `upstream`. */
  chatPath: string;
  /** Path listing available models, relative to `upstream`. */
  modelsPath: string;
  /** Where the user gets a key (shown in the settings dialog). */
  keysUrl?: string;
  /** Where the user checks prices, since this file mostly does not know them. */
  pricingUrl?: string;
  cost: CostTier;
  /**
   * True when the free allowance is paid for with your data.
   *
   * Surfaced as a warning in the settings dialog, not a block: the assistant is
   * pointed at a portfolio and trade rationale, and that is the user's call to
   * make knowingly rather than discover later.
   */
  trainsOnFreeTier?: boolean;
  /**
   * Must be called straight from the browser, never through the relay.
   *
   * True for self-hosted endpoints: a Cloudflare Function cannot reach a
   * `localhost` upstream, and a relay that forwards to a caller-supplied host
   * would be an open proxy. See `relayableProviders`.
   */
  directOnly?: boolean;
  /** The user supplies the endpoint (only meaningful with `directOnly`). */
  baseUrlRequired?: boolean;
  /**
   * What to show in the endpoint field before the user has typed one.
   *
   * Separate from `upstream` because a truly custom provider has NO default: an
   * `upstream` that looked like a real host would be a URL the app invented, and
   * `resolveBaseUrl` would happily fall back to it and send the key there.
   */
  baseUrlExample?: string;
  /** Whether a key is needed at all (a local model needs none). */
  keyRequired: boolean;
  /**
   * Which field caps the output length. Defaults to `max_tokens`.
   *
   * OpenAI's reasoning-capable models REJECT `max_tokens` outright ("Unsupported
   * parameter … use max_completion_tokens instead"), while DeepSeek, Groq, Gemini's
   * compat surface and Ollama all document `max_tokens` and do not know the newer
   * name. So this is a per-provider fact, not a per-wire one, and it cannot be
   * omitted: Anthropic REQUIRES the cap, and without it OpenAI would answer at
   * whatever length it liked.
   */
  tokenLimitField?: 'max_tokens' | 'max_completion_tokens';
  /**
   * Fraction of the input price charged for a cache HIT, when the provider
   * discounts one. Left undefined = cached tokens are billed at full price by the
   * estimator, which OVER-states the bill rather than under-stating it.
   */
  cacheReadMultiplier?: number;
  /**
   * Ordered preferences used to pick a default from the fetched model list.
   * First pattern with a match wins; ties inside one pattern go to the shortest
   * id, which reliably favours `gpt-5` over `gpt-5-nano-2025-…`-style variants.
   */
  prefer: RegExp[];
  /** Seed prices for models this file can state accurately. */
  models?: LlmModel[];
  /** One line shown under the provider in the settings dialog. */
  note?: { en: string; vi: string };
}

/**
 * Every provider the assistant knows how to talk to.
 *
 * Order matters: it is the order of the dropdown. OpenAI leads because it is the
 * key this project was built and tested against; `local` is last because it is
 * the specialist option.
 */
export const LLM_PROVIDERS: readonly LlmProviderDef[] = [
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    wire: 'openai',
    upstream: 'https://api.openai.com/v1',
    auth: 'bearer',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    keysUrl: 'https://platform.openai.com/api-keys',
    pricingUrl: 'https://openai.com/api/pricing/',
    cost: 'metered',
    keyRequired: true,
    tokenLimitField: 'max_completion_tokens',
    prefer: [/^gpt-5/, /^gpt-4\.1/, /^gpt-4o/, /^gpt-4/, /^o\d/],
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    wire: 'anthropic',
    upstream: 'https://api.anthropic.com/v1',
    auth: 'x-api-key',
    // The version pin is mandatory on every Anthropic request. The browser flag is
    // what makes a direct (non-relay) call from a page possible at all.
    headers: {
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    chatPath: '/messages',
    modelsPath: '/models',
    keysUrl: 'https://console.anthropic.com/settings/keys',
    pricingUrl: 'https://claude.com/pricing#api',
    cost: 'metered',
    keyRequired: true,
    cacheReadMultiplier: 0.1,
    prefer: [/^claude-opus-5/, /^claude-sonnet-5/, /^claude-haiku/, /^claude-opus/],
    models: [
      { id: 'claude-opus-5', inputPerMTok: 5, outputPerMTok: 25 },
      { id: 'claude-sonnet-5', inputPerMTok: 3, outputPerMTok: 15 },
      { id: 'claude-haiku-4-5', inputPerMTok: 1, outputPerMTok: 5 },
    ],
  },
  {
    id: 'gemini',
    label: 'Google Gemini (free tier)',
    wire: 'openai',
    // Gemini's OpenAI-compatible surface, so it needs no adapter of its own.
    upstream: 'https://generativelanguage.googleapis.com/v1beta/openai',
    auth: 'bearer',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    keysUrl: 'https://aistudio.google.com/apikey',
    pricingUrl: 'https://ai.google.dev/pricing',
    cost: 'free-tier',
    trainsOnFreeTier: true,
    keyRequired: true,
    prefer: [/flash/, /pro/],
    note: {
      en: 'Free allowance, rate-limited. Google may train on data sent on the free tier.',
      vi: 'Có hạn mức miễn phí, giới hạn tần suất. Google có thể dùng dữ liệu ở bậc miễn phí để huấn luyện.',
    },
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    wire: 'openai',
    upstream: 'https://api.deepseek.com/v1',
    auth: 'bearer',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    keysUrl: 'https://platform.deepseek.com/api_keys',
    pricingUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
    cost: 'metered',
    keyRequired: true,
    prefer: [/^deepseek-chat/, /^deepseek-reasoner/],
    note: {
      en: 'Very cheap. Requests are processed on servers in China.',
      vi: 'Rất rẻ. Yêu cầu được xử lý trên máy chủ tại Trung Quốc.',
    },
  },
  {
    id: 'groq',
    label: 'Groq (free tier)',
    wire: 'openai',
    upstream: 'https://api.groq.com/openai/v1',
    auth: 'bearer',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    keysUrl: 'https://console.groq.com/keys',
    pricingUrl: 'https://groq.com/pricing/',
    cost: 'free-tier',
    keyRequired: true,
    prefer: [/llama.*70b/, /llama/, /qwen/],
    note: {
      en: 'Free allowance, rate-limited. Hosts open models — fast, weaker at multi-step tool use.',
      vi: 'Có hạn mức miễn phí, giới hạn tần suất. Chạy mô hình mở — nhanh, yếu hơn khi gọi công cụ nhiều bước.',
    },
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (many models, one key)',
    wire: 'openai',
    upstream: 'https://openrouter.ai/api/v1',
    auth: 'bearer',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    keysUrl: 'https://openrouter.ai/keys',
    pricingUrl: 'https://openrouter.ai/models',
    cost: 'metered',
    keyRequired: true,
    // `:free` variants exist and are rate-limited; prefer them when present so a
    // user who picked OpenRouter to spend nothing does not get billed by default.
    prefer: [/:free$/, /^anthropic\//, /^openai\//],
  },
  {
    id: 'custom',
    label: 'Custom endpoint (OpenAI-compatible)',
    wire: 'openai',
    // NO default host. The endpoint is the user's own — a gateway, a proxy, a
    // company deployment — and this file has no business guessing it. Empty means
    // `resolveBaseUrl` returns null until one is supplied, which `isConfigured`
    // reports as "not configured" instead of quietly posting a key somewhere.
    upstream: '',
    baseUrlExample: 'https://gateway.example.com/v1',
    auth: 'bearer',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    cost: 'metered',
    keyRequired: true,
    // Direct, like a local model, for the same two reasons: the relay forwards only
    // to fixed hostnames (forwarding to a caller-supplied one is an open proxy), and
    // this endpoint is not in that list and never can be.
    directOnly: true,
    baseUrlRequired: true,
    // A gateway lists whatever it resells, so the families are ordered newest-first
    // and `/./` catches anything else rather than leaving the default empty.
    prefer: [/^gpt-5/, /^claude/, /^gemini/, /^deepseek/, /^gpt-4/, /./],
    note: {
      en: 'Any OpenAI-compatible endpoint — a gateway, a proxy, or your own server. Called straight from the browser, so the endpoint must allow this origin (CORS). Prices are unknown here; fill them in for the cost meter.',
      vi: 'Bất kỳ endpoint tương thích OpenAI — cổng trung gian, proxy, hoặc máy chủ của bạn. Được gọi trực tiếp từ trình duyệt nên endpoint phải cho phép origin này (CORS). Không biết giá; nhập vào để có đồng hồ chi phí.',
    },
  },
  {
    id: 'local',
    label: 'Local model (Ollama / LM Studio)',
    wire: 'openai',
    // Placeholder: the real endpoint is always the user's own (`baseUrlRequired`).
    upstream: 'http://localhost:11434/v1',
    auth: 'bearer',
    chatPath: '/chat/completions',
    modelsPath: '/models',
    cost: 'local',
    keyRequired: false,
    directOnly: true,
    baseUrlRequired: true,
    prefer: [/instruct/, /./],
    note: {
      en: 'Free and fully private — nothing leaves the machine. Desktop only; small models handle tools poorly.',
      vi: 'Miễn phí và riêng tư hoàn toàn — dữ liệu không rời khỏi máy. Chỉ trên máy tính; mô hình nhỏ gọi công cụ kém.',
    },
  },
];

export function findProvider(id: string): LlmProviderDef | undefined {
  return LLM_PROVIDERS.find((p) => p.id === id);
}

/**
 * Providers the same-origin relay is allowed to forward to.
 *
 * The relay exists because browser CORS support differs per vendor, but it must
 * never become an open proxy — so it forwards only to the fixed hostnames below
 * and a user-supplied base URL is barred from it by construction.
 */
export function relayableProviders(): LlmProviderDef[] {
  return LLM_PROVIDERS.filter((p) => !p.directOnly);
}

/** The `{ id: upstream }` table the relay needs. Keep the relay in step with this. */
export function relayUpstreams(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of relayableProviders()) out[p.id] = p.upstream;
  return out;
}

/** The user's saved choice. Keys live elsewhere — never in this object. */
export interface LlmConfig {
  providerId: LlmProviderId;
  model: string;
  /** Overrides `upstream`. Only honoured for `directOnly` providers. */
  baseUrl?: string;
  /**
   * Overrides the provider's output-cap field name.
   *
   * Exists for one case, and it is not hypothetical: a user-supplied endpoint may
   * be a gateway in front of models that renamed this parameter, and the registry
   * cannot know which. Getting it wrong fails EVERY call with a 400 about an
   * unsupported parameter, so it has to be fixable from the settings dialog rather
   * than by editing this file.
   */
  tokenLimitField?: 'max_tokens' | 'max_completion_tokens';
  /** User-supplied prices (USD per MTok) when this file does not know them. */
  inputPerMTok?: number;
  outputPerMTok?: number;
}

/**
 * Resolve the API root for a config.
 *
 * A base URL is accepted ONLY from a `directOnly` provider. Honouring it for
 * hosted providers would let a stored preference redirect an API key to an
 * arbitrary host — and a synced preference is not a place to trust a hostname.
 */
export function resolveBaseUrl(cfg: LlmConfig): string | null {
  const p = findProvider(cfg.providerId);
  if (!p) return null;
  if (p.directOnly) {
    const raw = (cfg.baseUrl ?? '').trim().replace(/\/+$/, '');
    // `|| null`, not `|| ''`: a provider with no default host and no URL yet has no
    // endpoint at all, and every caller already treats null as "cannot call".
    return raw || p.upstream || null;
  }
  return p.upstream;
}

/**
 * Pick a sensible default model from the ids the provider actually reported.
 *
 * Ties within one preference go to the SHORTEST id: vendors list a base model
 * alongside dated and size-suffixed variants of it, and the base id is both the
 * one that keeps working and the one the user recognises.
 */
export function pickDefaultModel(providerId: string, available: readonly string[]): string | null {
  const p = findProvider(providerId);
  if (!p || available.length === 0) return null;
  for (const pattern of p.prefer) {
    const hits = available.filter((id) => pattern.test(id));
    if (hits.length) {
      return [...hits].sort((a, b) => a.length - b.length || (a < b ? -1 : 1))[0]!;
    }
  }
  return [...available].sort()[0]!;
}

/**
 * Model ids out of a model-list response, for either wire format.
 *
 * Both put the ids in `data[].id`, but a self-hosted server may answer with
 * Ollama's native `models[].name` shape instead, so both are read. Anything
 * unrecognised yields [] — the caller then lets the user type an id by hand,
 * which is strictly better than throwing at configuration time.
 */
export function parseModelList(json: unknown): string[] {
  const root = json as { data?: unknown; models?: unknown };
  const rows = Array.isArray(root?.data) ? root.data : Array.isArray(root?.models) ? root.models : [];
  const ids = rows
    .map((r) => {
      const row = r as { id?: unknown; name?: unknown };
      const id = typeof row?.id === 'string' ? row.id : typeof row?.name === 'string' ? row.name : '';
      // Gemini's compat endpoint returns fully-qualified names ("models/gemini-…");
      // the chat call expects the bare id, so strip the prefix here rather than at
      // every call site.
      return id.startsWith('models/') ? id.slice('models/'.length) : id;
    })
    .filter((id) => id.length > 0);
  return [...new Set(ids)].sort();
}

/** Headers for a request to `providerId`, given a key. Never logs or stores it. */
export function authHeaders(providerId: string, apiKey: string): Record<string, string> {
  const p = findProvider(providerId);
  if (!p) return {};
  const h: Record<string, string> = { ...(p.headers ?? {}) };
  if (!apiKey) return h;
  if (p.auth === 'x-api-key') h['x-api-key'] = apiKey;
  else h.authorization = `Bearer ${apiKey}`;
  return h;
}

export interface ProbeRequest {
  path: string;
  body: Record<string, unknown>;
}

/**
 * The name this provider wants for the output-token cap.
 *
 * `override` is the user's saved choice (see `LlmConfig.tokenLimitField`) and wins
 * when set — the registry's value is a fact about a known vendor, not about the
 * gateway someone put in front of it.
 */
export function tokenLimitField(
  providerId: string,
  override?: string,
): 'max_tokens' | 'max_completion_tokens' {
  if (override === 'max_tokens' || override === 'max_completion_tokens') return override;
  return findProvider(providerId)?.tokenLimitField ?? 'max_tokens';
}

/**
 * The smallest possible real request, used to prove a key works.
 *
 * A cap of 1 because the answer is irrelevant — and it goes in the field this
 * provider actually accepts, so a probe cannot pass while every real call fails
 * on a rejected parameter. Note how the caller must judge the result (see
 * `probeVerdict`): a 400 means the pipe and the key are both fine and only a
 * parameter was disliked, which is not what we are testing.
 */
export function buildProbeRequest(
  providerId: string,
  model: string,
  tokenField?: string,
): ProbeRequest | null {
  const p = findProvider(providerId);
  if (!p) return null;
  const body: Record<string, unknown> = {
    model,
    [tokenLimitField(providerId, tokenField)]: 1,
    messages: [{ role: 'user', content: 'ping' }],
  };
  return { path: p.chatPath, body };
}

export type ProbeVerdict = 'ok' | 'bad-key' | 'no-access' | 'unreachable';

/**
 * Turn a probe's HTTP status into a verdict.
 *
 * Deliberately lenient about 4xx that are not auth failures: newer models rename
 * `max_tokens`, some providers reject `max_tokens: 1` outright, and a probe that
 * reported "broken" for those would send the user hunting a non-problem. Only the
 * auth and routing statuses mean the configuration is actually wrong.
 */
export function probeVerdict(status: number): ProbeVerdict {
  if (status === 401 || status === 403) return 'bad-key';
  if (status === 404) return 'no-access';
  if (status >= 500) return 'unreachable';
  return 'ok';
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the provider's prompt cache, if it reports them. */
  cachedInputTokens?: number;
}

/**
 * Estimated USD for one exchange, or null when the price is unknown.
 *
 * Cached tokens are billed at full price unless the provider documents a
 * discount, so the figure errs high. A cost meter that flatters the bill is
 * worse than no meter.
 */
export function estimateCostUsd(usage: TokenUsage, cfg: LlmConfig): number | null {
  const p = findProvider(cfg.providerId);
  const seeded = p?.models?.find((m) => m.id === cfg.model);
  const inPrice = cfg.inputPerMTok ?? seeded?.inputPerMTok;
  const outPrice = cfg.outputPerMTok ?? seeded?.outputPerMTok;
  if (inPrice === undefined || outPrice === undefined) return null;

  const cached = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  const full = usage.inputTokens - cached;
  const cacheRate = p?.cacheReadMultiplier ?? 1;
  const millions = (n: number): number => n / 1_000_000;
  return (
    millions(full) * inPrice +
    millions(cached) * inPrice * cacheRate +
    millions(usage.outputTokens) * outPrice
  );
}

/** Prices this file knows, for seeding the settings dialog. */
export function seededPrices(cfg: LlmConfig): { input?: number; output?: number } {
  const m = findProvider(cfg.providerId)?.models?.find((x) => x.id === cfg.model);
  return { input: m?.inputPerMTok, output: m?.outputPerMTok };
}
