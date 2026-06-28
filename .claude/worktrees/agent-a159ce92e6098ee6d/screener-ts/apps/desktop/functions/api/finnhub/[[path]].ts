// Cloudflare Pages Function: same-origin proxy to Finnhub that INJECTS the API
// key server-side, so the key never reaches the browser. Set the secret with:
//   wrangler pages secret put FINNHUB_API_KEY
//
// Route: /api/finnhub/* → https://finnhub.io/api/v1/*?...&token=<secret>

interface Env {
  FINNHUB_API_KEY: string;
}
interface Ctx {
  request: Request;
  params: { path: string[] };
  env: Env;
}

const FINNHUB = 'https://finnhub.io/api/v1';

export const onRequestGet = async (ctx: Ctx): Promise<Response> => {
  const url = new URL(ctx.request.url);
  const path = (ctx.params.path ?? []).join('/');
  const params = new URLSearchParams(url.search);
  params.set('token', ctx.env.FINNHUB_API_KEY); // injected, never exposed to client
  const target = `${FINNHUB}/${path}?${params.toString()}`;

  const upstream = await fetch(target);
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
