// Cloudflare Pages Function: same-origin relay to the LLM providers the
// assistant supports.
//
// Route: /api/llm/<providerId>/<upstream path> → <fixed upstream>/<path>
// e.g.  /api/llm/openai/chat/completions → https://api.openai.com/v1/chat/completions
//       /api/llm/anthropic/models        → https://api.anthropic.com/v1/models
//
// ── WHY A RELAY AT ALL ──────────────────────────────────────────────────────
// Browser CORS support differs per vendor and changes without notice: some send
// permissive headers, some require a special opt-in header, some send nothing and
// a direct fetch from the page simply fails. Routing through this same-origin
// path makes every provider behave the same way, and it keeps the browser from
// having to care.
//
// ── THE THREE RULES THIS FILE EXISTS TO ENFORCE ─────────────────────────────
// 1. FIXED HOSTS ONLY. The upstream is looked up from the table below by provider
//    id. A relay that forwarded to a caller-supplied host would be an open proxy
//    — anyone who found the URL could bounce arbitrary traffic through this
//    domain. Self-hosted endpoints (Ollama, LM Studio) are therefore NOT
//    relayable and are called direct from the browser instead; a Worker could not
//    reach the user's localhost anyway.
// 2. THE KEY IS PASSED THROUGH, NEVER KEPT. It arrives in `x-llm-key`, is
//    rewritten into whatever scheme the upstream wants, and is never stored,
//    logged, or echoed. Nothing here writes to D1 and nothing here calls
//    console.log — a proxy log line is exactly how a key leaks.
// 3. THE AUTH SCHEME IS DECIDED HERE, not by the caller. The client sends one
//    neutral header and this file knows that Anthropic wants `x-api-key` while
//    everyone else wants a bearer token, so a client bug cannot send a key to an
//    upstream in a shape that ends up in the wrong field.
//
// ── KEEP IN STEP ────────────────────────────────────────────────────────────
// The table mirrors `LLM_PROVIDERS` in packages/core/src/agent/providers.ts.
// Pages Functions are bundled separately from the app and cannot resolve the
// workspace package, so it is duplicated rather than imported (same reason as the
// collapse guard in api/sync). The core copy is the spec; a provider added there
// does not work through the relay until it is added here too. The core test pins
// `relayUpstreams()` to exactly this map, so that edit shows up as a failing
// assertion rather than a mystery 404 weeks later.

interface Relayed {
  upstream: string;
  auth: 'x-api-key' | 'bearer';
  /** Headers the upstream requires on every request. */
  headers?: Record<string, string>;
  /** False only where the upstream is usable anonymously. */
  keyRequired: boolean;
}

const PROVIDERS: Record<string, Relayed> = {
  openai: { upstream: 'https://api.openai.com/v1', auth: 'bearer', keyRequired: true },
  anthropic: {
    upstream: 'https://api.anthropic.com/v1',
    auth: 'x-api-key',
    headers: { 'anthropic-version': '2023-06-01' },
    keyRequired: true,
  },
  gemini: {
    upstream: 'https://generativelanguage.googleapis.com/v1beta/openai',
    auth: 'bearer',
    keyRequired: true,
  },
  deepseek: { upstream: 'https://api.deepseek.com/v1', auth: 'bearer', keyRequired: true },
  groq: { upstream: 'https://api.groq.com/openai/v1', auth: 'bearer', keyRequired: true },
  openrouter: { upstream: 'https://openrouter.ai/api/v1', auth: 'bearer', keyRequired: true },
};

/** A request body larger than this is refused, so the relay is not a data pump. */
const MAX_BODY_BYTES = 1_000_000;

interface Ctx {
  request: Request;
  params: { path: string[] };
}

const fail = (status: number, error: string): Response =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/**
 * Split `/api/llm/<id>/<rest…>` into the provider and the upstream path.
 *
 * `.` and `..` segments are refused outright. Cloudflare gives the path already
 * split on `/`, so a segment cannot smuggle a slash — but a `..` would still be
 * resolved by the upstream server, and the point of the fixed-host table is that
 * the request cannot be steered anywhere the table did not name.
 */
function route(segments: string[]): { provider: Relayed; path: string } | { error: string } {
  const [id, ...rest] = segments;
  if (!id) return { error: 'missing provider' };
  const provider = PROVIDERS[id];
  if (!provider) return { error: `unknown provider: ${id}` };
  if (rest.some((s) => s === '.' || s === '..' || s === '')) return { error: 'bad path' };
  return { provider, path: rest.join('/') };
}

/**
 * Build the upstream request.
 *
 * Only the headers the upstream actually needs are forwarded. Everything else the
 * browser sent (cookies, referer, sec-* , the caller's own auth) is dropped: this
 * is a relay to a third party, and forwarding a header "just in case" is how
 * unrelated credentials end up at a vendor.
 */
async function forward(ctx: Ctx, method: 'GET' | 'POST'): Promise<Response> {
  const routed = route(ctx.params.path ?? []);
  if ('error' in routed) return fail(404, routed.error);
  const { provider, path } = routed;

  const key = ctx.request.headers.get('x-llm-key') ?? '';
  if (provider.keyRequired && !key) return fail(401, 'missing x-llm-key header');

  const headers: Record<string, string> = { ...(provider.headers ?? {}) };
  if (key) {
    if (provider.auth === 'x-api-key') headers['x-api-key'] = key;
    else headers.authorization = `Bearer ${key}`;
  }

  let body: string | undefined;
  if (method === 'POST') {
    body = await ctx.request.text();
    if (body.length > MAX_BODY_BYTES) return fail(413, 'request too large');
    headers['content-type'] = 'application/json';
  }

  const search = new URL(ctx.request.url).search;
  let upstream: Response;
  try {
    upstream = await fetch(`${provider.upstream}/${path}${search}`, { method, headers, body });
  } catch (e) {
    // A network failure reaching the vendor is a 502 from here, not a 500: the
    // relay worked, the upstream did not answer.
    return fail(502, `upstream unreachable: ${String(e)}`);
  }

  // Stream the body straight through rather than buffering it. Token-by-token
  // streaming is the whole point of a chat UI, and `await upstream.text()` here
  // would silently turn every future streamed answer into one long pause.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      // Same-origin, so no CORS header is needed — and no `*` is granted, which
      // would invite other sites to use this relay.
      'cache-control': 'no-store',
      // Rate-limit state is useful to the client and carries no secret.
      ...(upstream.headers.get('retry-after')
        ? { 'retry-after': upstream.headers.get('retry-after')! }
        : {}),
    },
  });
}

/** Model discovery (GET /models) — how the settings dialog fills its dropdown. */
export const onRequestGet = (ctx: Ctx): Promise<Response> => forward(ctx, 'GET');

/** Every chat/completion call. */
export const onRequestPost = (ctx: Ctx): Promise<Response> => forward(ctx, 'POST');
