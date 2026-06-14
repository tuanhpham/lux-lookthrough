// Cloudflare Pages Function: same-origin proxy to Yahoo Finance.
//
// chart/timeseries need no auth. quoteSummary (sector, beta, dividend yield,
// ROE, profit margin, company summary) requires a cookie + rotating "crumb",
// so for those we perform the handshake server-side (a browser can't,
// cross-origin). Mirrors the Vite dev proxy and the Tauri Rust layer.
//
// Route: /api/yahoo/* → https://query{1,2}.finance.yahoo.com/*

interface Ctx {
  request: Request;
  params: { path: string[] };
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

async function getAuth(): Promise<{ cookie: string; crumb: string }> {
  let cookie = '';
  for (const src of ['https://fc.yahoo.com', 'https://finance.yahoo.com']) {
    try {
      const c = await fetch(src, { headers: { 'User-Agent': UA } });
      const set = (c.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      const parts = set.map((s) => s.split(';')[0]);
      if (parts.length) {
        cookie = parts.join('; ');
        break;
      }
    } catch {
      /* try next */
    }
  }
  const r = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, cookie },
  });
  const text = (await r.text()).trim();
  return { cookie, crumb: text.startsWith('{') ? '' : text };
}

export const onRequestGet = async (ctx: Ctx): Promise<Response> => {
  const url = new URL(ctx.request.url);
  const path = (ctx.params.path ?? []).join('/');
  const needsAuth = path.includes('quoteSummary');
  const host = needsAuth ? 'query2.finance.yahoo.com' : 'query1.finance.yahoo.com';

  const call = async (auth?: { cookie: string; crumb: string }): Promise<Response> => {
    let target = `https://${host}/${path}${url.search}`;
    const headers: Record<string, string> = { 'User-Agent': UA };
    if (auth) {
      target += (target.includes('?') ? '&' : '?') + 'crumb=' + encodeURIComponent(auth.crumb);
      headers.cookie = auth.cookie;
    }
    return fetch(target, { headers });
  };

  let upstream: Response;
  if (needsAuth) {
    const auth = await getAuth();
    upstream = await call(auth);
    if (upstream.status === 401 || upstream.status === 403) upstream = await call(await getAuth());
  } else {
    upstream = await call();
  }

  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=300',
    },
  });
};
