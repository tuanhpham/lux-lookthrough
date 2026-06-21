// Cloudflare Pages Function: same-origin proxy to the NASDAQ Trader symbol
// directory, used to build the full US common-stock universe (NASDAQ + NYSE/AMEX).
//
// Route: /api/nasdaqtrader/* → https://www.nasdaqtrader.com/dynamic/SymDir/*
// e.g. /api/nasdaqtrader/nasdaqlisted.txt and /api/nasdaqtrader/otherlisted.txt
//
// The files are pipe-delimited text and change ~daily, so we cache for a day.

interface Ctx {
  request: Request;
  params: { path: string[] };
}

export const onRequestGet = async (ctx: Ctx): Promise<Response> => {
  const path = (ctx.params.path ?? []).join('/');
  const upstream = await fetch(`https://www.nasdaqtrader.com/dynamic/SymDir/${path}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (screener-proxy)' },
  });
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=86400',
    },
  });
};
