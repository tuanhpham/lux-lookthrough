/**
 * HTTP abstraction. In the Tauri desktop shell, requests MUST go through the
 * Rust HTTP layer (tauri-plugin-http) to bypass browser CORS on Yahoo/Finnhub.
 * On the static web build, we fall back to `fetch` (hitting same-origin
 * serverless proxies that add CORS headers / hide the API key).
 */

export interface HttpClient {
  getJson<T>(url: string, headers?: Record<string, string>): Promise<T>;
  getText(url: string, headers?: Record<string, string>): Promise<string>;
}

declare global {
  interface Window {
    __TAURI__?: unknown;
  }
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined;
}

/** Tauri HTTP client — dynamically imported so the web build doesn't need it. */
class TauriHttp implements HttpClient {
  async getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    const res = await tauriFetch(url, { method: 'GET', headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  }
  async getText(url: string, headers: Record<string, string> = {}): Promise<string> {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    const res = await tauriFetch(url, { method: 'GET', headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  }
}

/** Browser fetch client (static web build, talking to same-origin proxies). */
class WebHttp implements HttpClient {
  async getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  }
  async getText(url: string, headers: Record<string, string> = {}): Promise<string> {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  }
}

let client: HttpClient | null = null;
export function http(): HttpClient {
  if (client) return client;
  client = isTauri() ? new TauriHttp() : new WebHttp();
  return client;
}
