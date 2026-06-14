// Cloudflare Pages Function: same-origin proxy to Yahoo Finance.
// The static web build calls `/api/yahoo/...`; this forwards to Yahoo and adds
// permissive CORS so the browser is happy (desktop hits Yahoo directly via Rust).
//
// Route: /api/yahoo/* → https://query1.finance.yahoo.com/*

interface Ctx {
  request: Request;
  params: { path: string[] };
}

const YAHOO = 'https://query1.finance.yahoo.com';

export const onRequestGet = async (ctx: Ctx): Promise<Response> => {
  const url = new URL(ctx.request.url);
  const path = (ctx.params.path ?? []).join('/');
  const target = `${YAHOO}/${path}${url.search}`;

  const upstream = await fetch(target, {
    headers: { 'User-Agent': 'Mozilla/5.0 (screener-proxy)' },
  });

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
