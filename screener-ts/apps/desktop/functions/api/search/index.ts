// Cloudflare Pages Function: same-origin relay to DuckDuckGo's HTML results page,
// for the assistant's `web_search` tool.
//
// Route: POST /api/search  (form body `q=…`) → POST https://html.duckduckgo.com/html/
//
// POST, not GET, because DuckDuckGo answers a GET from a script with its bot
// challenge ("anomaly") and answers the same query as a form POST with results —
// verified from a desktop, not from Cloudflare. A datacenter IP may be challenged
// either way; the client detects the challenge page and tells the model search is
// unavailable rather than reporting "no results".
//
// The raw HTML goes back and is parsed in the browser (`parseDdgHtml` in core), so
// the parser is unit-tested and this relay stays a pipe, like the wiki one.

interface Ctx {
  request: Request;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

export const onRequestPost = async (ctx: Ctx): Promise<Response> => {
  const form = new URLSearchParams(await ctx.request.text());
  const q = (form.get('q') ?? '').trim().slice(0, 300);
  if (!q) return new Response('missing q', { status: 400 });

  const upstream = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'text/html',
      referer: 'https://html.duckduckgo.com/',
    },
    body: new URLSearchParams({ q }).toString(),
  });
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};
