/**
 * Transport and settings storage for the assistant's LLM connection.
 *
 * One place decides three things, so no caller has to think about them:
 *   • WHERE the request goes (the relay, or straight at the provider)
 *   • HOW the key is attached (bearer vs x-api-key, per the core registry)
 *   • WHERE the key lives (on this device, and only on this device)
 *
 * ── ROUTING ─────────────────────────────────────────────────────────────────
 * Web build → the same-origin `/api/llm/<provider>` relay, because browser CORS
 * support differs per vendor and a direct call fails on some of them today and on
 * others next month.
 *
 * Tauri shell → straight at the provider through the Rust HTTP layer. It is not
 * a browser, so CORS does not apply, and a packaged app has no server behind a
 * relative `/api/...` path to relay through. This is also the only build that can
 * reach a local model on `localhost`.
 *
 * ── WHERE THE KEY LIVES ─────────────────────────────────────────────────────
 * Under the `sync:` prefix, which `adapters/storage.ts` excludes from the D1 sync
 * (`syncable()`). An API key is a credential, not a preference: it must not ride
 * the sync channel to another device or sit in a server row. The consequence is
 * deliberate — add the key once per device, exactly like the access code.
 *
 * It is still stored in the clear (localStorage on the web, a JSON file in the
 * Tauri app data dir). There is no secure keystore available to a static web app,
 * and pretending otherwise with reversible obfuscation would be worse than saying
 * so plainly: anything with access to this browser profile can read the key, so
 * scope it and rotate it like any other key you paste into a web tool.
 */
import {
  findProvider,
  authHeaders,
  resolveBaseUrl,
  parseModelList,
  buildProbeRequest,
  probeVerdict,
  pickDefaultModel,
  type LlmConfig,
  type ProbeVerdict,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { isTauri } from '../adapters/http.js';

/** The chosen provider/model/prices. Syncable — it is a preference, not a secret. */
const CONFIG_KEY = 'llm_config';

/** Per-provider key. The `sync:` prefix is what keeps it on this device. */
export function keyStorageKey(providerId: string): string {
  return `sync:llm_key:${providerId}`;
}

export async function loadLlmConfig(ctx: AppContext): Promise<LlmConfig | null> {
  return ctx.storage.get<LlmConfig>(CONFIG_KEY).catch(() => null);
}

export async function saveLlmConfig(ctx: AppContext, cfg: LlmConfig): Promise<void> {
  await ctx.storage.set(CONFIG_KEY, cfg).catch(() => {});
}

export async function getApiKey(ctx: AppContext, providerId: string): Promise<string> {
  const k = await ctx.storage.get<string>(keyStorageKey(providerId)).catch(() => null);
  return (k ?? '').trim();
}

/** An empty value CLEARS the key — "remove my key" is a real intent, not a no-op. */
export async function setApiKey(ctx: AppContext, providerId: string, key: string): Promise<void> {
  const trimmed = key.trim();
  if (trimmed) await ctx.storage.set(keyStorageKey(providerId), trimmed).catch(() => {});
  else await ctx.storage.delete(keyStorageKey(providerId)).catch(() => {});
}

/** Which providers already have a key here — drives the badges in the dialog. */
export async function keyedProviders(ctx: AppContext): Promise<Set<string>> {
  const keys = await ctx.storage.list('sync:llm_key:').catch(() => []);
  return new Set(keys.map((k) => k.slice('sync:llm_key:'.length)));
}

export interface LlmCall {
  /** Provider-relative path, e.g. `/chat/completions`. */
  path: string;
  method: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * One request to the configured provider.
 *
 * Returns the raw `Response` — including error statuses, which the caller must
 * handle. Rate limits, quota exhaustion and model-access errors all arrive as
 * ordinary HTTP failures with a body worth showing the user, so swallowing them
 * into a thrown Error here would destroy the only useful diagnostic.
 *
 * The body is NOT consumed, so a streamed response stays streamable.
 */
export async function llmFetch(cfg: LlmConfig, apiKey: string, call: LlmCall): Promise<Response> {
  const provider = findProvider(cfg.providerId);
  if (!provider) throw new Error(`unknown LLM provider: ${cfg.providerId}`);

  const direct = isTauri() || provider.directOnly;
  const init: RequestInit = {
    method: call.method,
    signal: call.signal,
    headers: direct
      ? // The provider's own scheme, from the registry.
        { 'content-type': 'application/json', ...authHeaders(cfg.providerId, apiKey) }
      : // Through the relay: ONE neutral header. The relay owns the mapping to the
        // upstream's scheme, so a bug here cannot put the key in the wrong field.
        { 'content-type': 'application/json', ...(apiKey ? { 'x-llm-key': apiKey } : {}) },
    ...(call.body !== undefined ? { body: JSON.stringify(call.body) } : {}),
  };

  const base = direct ? resolveBaseUrl(cfg) : `/api/llm/${cfg.providerId}`;
  if (!base) throw new Error(`no endpoint for provider: ${cfg.providerId}`);
  const url = `${base}${call.path}`;

  if (isTauri()) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    return tauriFetch(url, init);
  }
  return fetch(url, init);
}

/** Whatever the provider says it can run — the source for the model dropdown. */
export async function listModels(cfg: LlmConfig, apiKey: string): Promise<string[]> {
  const provider = findProvider(cfg.providerId);
  if (!provider) return [];
  try {
    const res = await llmFetch(cfg, apiKey, { path: provider.modelsPath, method: 'GET' });
    if (!res.ok) return [];
    return parseModelList(await res.json());
  } catch {
    // Offline, blocked, or a provider that does not expose a model list. The dialog
    // falls back to a typed model id, which still works.
    return [];
  }
}

export interface ProbeResult {
  verdict: ProbeVerdict;
  status: number;
  /** The upstream's own error text, when there was one. Never contains the key. */
  detail?: string;
}

/**
 * Prove the key and the route work, with the smallest real request.
 *
 * See `probeVerdict` in core for why a 400 counts as success: this is testing the
 * pipe and the credential, not whether one particular model likes `max_tokens`.
 */
export async function testConnection(cfg: LlmConfig, apiKey: string): Promise<ProbeResult> {
  const probe = buildProbeRequest(cfg.providerId, cfg.model, cfg.tokenLimitField);
  if (!probe) return { verdict: 'unreachable', status: 0, detail: 'unknown provider' };
  try {
    const res = await llmFetch(cfg, apiKey, {
      path: probe.path,
      method: 'POST',
      body: probe.body,
    });
    const verdict = probeVerdict(res.status);
    if (verdict === 'ok') return { verdict, status: res.status };
    const text = await res.text().catch(() => '');
    return { verdict, status: res.status, detail: text.slice(0, 300) };
  } catch (e) {
    return { verdict: 'unreachable', status: 0, detail: String(e).slice(0, 300) };
  }
}

/**
 * Fetch the model list and pick a default from it.
 *
 * Used when the user switches provider: the id they need is whatever that account
 * actually has access to, which only the provider can say.
 */
export async function suggestModel(cfg: LlmConfig, apiKey: string): Promise<{
  models: string[];
  model: string | null;
}> {
  const models = await listModels(cfg, apiKey);
  return { models, model: pickDefaultModel(cfg.providerId, models) };
}

/** True when the assistant has everything it needs to make a call. */
export function isConfigured(cfg: LlmConfig | null, hasKey: boolean): boolean {
  if (!cfg?.model) return false;
  const provider = findProvider(cfg.providerId);
  if (!provider) return false;
  // A provider whose endpoint the user supplies is not configured until they have.
  // Without this, a custom provider with a key and a model would look ready and then
  // throw "no endpoint" on the first question, with the panel already open.
  if (!resolveBaseUrl(cfg)) return false;
  return hasKey || !provider.keyRequired;
}
