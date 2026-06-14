// Cloudflare Pages Function: same-origin proxy to Wikipedia, used to fetch the
// S&P 500/400/600 constituent tables for the broad universe.
//
// Route: /api/wiki/* → https://en.wikipedia.org/wiki/*

interface Ctx {
  request: Request;
  params: { path: string[] };
}

export const onRequestGet = async (ctx: Ctx): Promise<Response> => {
  const path = (ctx.params.path ?? []).join('/');
  const upstream = await fetch(`https://en.wikipedia.org/wiki/${path}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (screener-proxy)' },
  });
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=86400',
    },
  });
};
