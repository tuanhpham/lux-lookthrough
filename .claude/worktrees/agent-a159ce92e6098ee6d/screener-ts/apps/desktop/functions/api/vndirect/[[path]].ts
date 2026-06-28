// Cloudflare Pages Function: same-origin proxy to VNDirect's dchart API
// (the TradingView UDF feed) used for Vietnam OHLCV — HOSE, HNX and UPCoM.
//
// Route: /api/vndirect/* → https://dchart-api.vndirect.com.vn/dchart/*
// e.g. /api/vndirect/history?symbol=FPT&resolution=D&from=...&to=...
//
// The upstream already sends permissive CORS, but routing through the proxy
// keeps the web build resilient (no third-party CORS dependency) and mirrors
// the Yahoo/Finnhub pattern. Short cache since quotes move intraday.

interface Ctx {
  request: Request;
  params: { path: string[] };
}

export const onRequestGet = async (ctx: Ctx): Promise<Response> => {
  const url = new URL(ctx.request.url);
  const path = (ctx.params.path ?? []).join('/');
  const upstream = await fetch(`https://dchart-api.vndirect.com.vn/dchart/${path}${url.search}`, {
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
