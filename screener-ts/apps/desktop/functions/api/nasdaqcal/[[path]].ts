// Cloudflare Pages Function: same-origin proxy to the NASDAQ *calendar* API
// (api.nasdaq.com), used by the Calendar tab for earnings / dividends / splits /
// IPOs / economic events.
//
// Route: /api/nasdaqcal/* → https://api.nasdaq.com/api/*
//   /api/nasdaqcal/calendar/earnings?date=2026-08-10
//   /api/nasdaqcal/calendar/dividends?date=2026-08-10
//   /api/nasdaqcal/calendar/splits?date=2026-08-10
//   /api/nasdaqcal/calendar/economicevents?date=2026-08-10
//   /api/nasdaqcal/ipo/calendar?date=2026-08          ← month, not day
//
// NOTE: this is a DUMB one-day passthrough on purpose. Cloudflare's free plan
// caps a Function at 50 subrequests, and a 30-day window across 4 endpoints is
// ~120 upstream calls — fanning out server-side would blow the cap mid-request.
// The client fans out instead (rate-limited), so each Function invocation makes
// exactly ONE upstream call.
//
// api.nasdaq.com rejects requests without a browser-ish User-Agent + Accept, so
// both are set explicitly. Cached for an hour: the calendars move slowly, and
// this keeps the 30-day sweep off the upstream on repeat opens.

interface Ctx {
  request: Request;
  params: { path: string[] };
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/** Only these upstream paths are reachable — keeps the proxy from becoming an
 * open relay to any api.nasdaq.com endpoint. */
const ALLOWED = [/^calendar\/(earnings|dividends|splits|economicevents)$/, /^ipo\/calendar$/];

export const onRequestGet = async (ctx: Ctx): Promise<Response> => {
  const url = new URL(ctx.request.url);
  const path = (ctx.params.path ?? []).join('/');

  if (!ALLOWED.some((re) => re.test(path))) {
    return new Response(JSON.stringify({ error: 'path not allowed', path }), {
      status: 403,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    });
  }

  const target = `https://api.nasdaq.com/api/${path}${url.search}`;
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        'User-Agent': UA,
        accept: 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.9',
        referer: 'https://www.nasdaq.com/',
        origin: 'https://www.nasdaq.com',
      },
    });
  } catch (e) {
    // Surface upstream refusal explicitly — the client treats this as "no data
    // for this day" rather than "no events on this day".
    return new Response(JSON.stringify({ error: 'upstream fetch failed', detail: String(e) }), {
      status: 502,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    });
  }

  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=3600',
    },
  });
};
