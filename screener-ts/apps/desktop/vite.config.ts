import { defineConfig, type Plugin } from 'vite';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/**
 * Yahoo's quoteSummary endpoint (sector, beta, dividend yield, ROE, company
 * summary) requires a cookie + rotating "crumb". We do that handshake here in
 * the dev server (a browser can't, cross-origin). chart/timeseries need no auth
 * and are forwarded as-is. This mirrors what the Tauri Rust layer and the
 * Cloudflare Pages function do in the packaged/deployed builds.
 */
function yahooProxy(): Plugin {
  let cookie = '';
  let crumb = '';

  async function refreshAuth(): Promise<void> {
    // 1) cookie — try a few hosts; fc.yahoo.com is the canonical source.
    for (const src of ['https://fc.yahoo.com', 'https://finance.yahoo.com']) {
      try {
        const c = await fetch(src, { headers: { 'User-Agent': UA } });
        const set = (c.headers.getSetCookie?.() ?? []).map((s) => s.split(';')[0]);
        if (set.length) {
          cookie = set.join('; ');
          break;
        }
      } catch {
        /* try next */
      }
    }
    // 2) crumb from query2 using that cookie
    const r = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, cookie },
    });
    const text = (await r.text()).trim();
    // A valid crumb is a short token; an error comes back as JSON.
    crumb = text.startsWith('{') ? '' : text;
  }

  return {
    name: 'yahoo-proxy',
    configureServer(server) {
      server.middlewares.use('/api/yahoo', async (req, res) => {
        try {
          const path = (req.url ?? '').replace(/^\//, '');
          const needsAuth = path.includes('quoteSummary');
          let host = needsAuth ? 'query2.finance.yahoo.com' : 'query1.finance.yahoo.com';

          const attempt = async (): Promise<Response> => {
            let url = `https://${host}/${path}`;
            const headers: Record<string, string> = { 'User-Agent': UA };
            if (needsAuth) {
              if (!crumb) await refreshAuth();
              url += (url.includes('?') ? '&' : '?') + 'crumb=' + encodeURIComponent(crumb);
              headers.cookie = cookie;
            }
            return fetch(url, { headers });
          };

          let upstream = await attempt();
          // Crumb rotates / expires → refresh once and retry.
          if (needsAuth && (upstream.status === 401 || upstream.status === 403)) {
            await refreshAuth();
            upstream = await attempt();
          }
          const body = Buffer.from(await upstream.arrayBuffer());
          res.statusCode = upstream.status;
          res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
          res.end(body);
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}

export default defineConfig({
  clearScreen: false,
  plugins: [yahooProxy()],
  server: {
    port: 1420,
    strictPort: false,
    // Finnhub is optional and needs no crumb; keep the simple proxy for it.
    proxy: {
      '/api/finnhub': {
        target: 'https://finnhub.io/api/v1',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/finnhub/, ''),
      },
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
