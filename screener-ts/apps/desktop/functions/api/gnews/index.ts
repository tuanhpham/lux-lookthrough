// Cloudflare Pages Function: same-origin relay to Google News RSS search, for the event finder.
//
// Route: GET /api/gnews?q=…&hl=en-US → GET https://news.google.com/rss/search?q=…
//
// Google News is the one free source that honours a DATE RANGE in the query
// (`NVDA after:2026-01-09 before:2026-04-09`), which is what a trade three months
// back needs; Yahoo's search only returns the latest headlines. The XML goes back
// as-is and is parsed in the browser (`parseGoogleNewsRss` in core), like the wiki
// and search relays.

interface Ctx {
  request: Request;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

export const onRequestGet = async (ctx: Ctx): Promise<Response> => {
  const url = new URL(ctx.request.url);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 300);
  if (!q) return new Response('missing q', { status: 400 });
  const hl = url.searchParams.get('hl') === 'vi' ? 'vi' : 'en-US';
  const gl = hl === 'vi' ? 'VN' : 'US';
  const target = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl === 'vi' ? 'vi' : 'en'}`;
  const upstream = await fetch(target, { headers: { 'User-Agent': UA, accept: 'application/rss+xml, text/xml' } });
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=900',
    },
  });
};
