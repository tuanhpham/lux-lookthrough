import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// Dev-only: forward /api/sync to the DEPLOYED Cloudflare D1 backend so local
// `npm run dev` reads/writes your REAL synced data (watchlists, case studies,
// scans). Plain Vite has no Functions runtime, so without this, sync is a no-op
// locally and anything you add stays in localhost's localStorage only.
//
// Only the tiny sync calls (a few per session) hit the deployed Functions —
// stock fetches still go straight to Yahoo from your machine and never count.
// Override with SYNC_ORIGIN if the Pages URL ever changes.
const SYNC_ORIGIN = process.env.SYNC_ORIGIN ?? 'https://the-professional.pages.dev';

// Corporate networks that do TLS inspection re-sign upstream certs with a root
// CA Node doesn't trust → the dev proxy dies with "unable to get local issuer
// certificate" and sync fails locally with a false "invalid code". Setting
// SYNC_INSECURE=1 (or any truthy value) tells the DEV proxy to skip upstream
// cert validation. Dev-only, never affects the production build. Default keeps
// strict verification on for clean networks.
const SYNC_SECURE = !process.env.SYNC_INSECURE;

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
  // Point @screener/core at its TypeScript SOURCE (not the built dist). Vite
  // compiles TS on the fly, so the app always sees the latest core code with no
  // build step — fixes "does not provide an export named …" when dist is stale
  // or unbuilt on a fresh checkout/another machine.
  resolve: {
    alias: {
      '@screener/core': fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url)),
    },
  },
  // Don't pre-bundle the workspace source package.
  optimizeDeps: { exclude: ['@screener/core'] },
  server: {
    port: 1420,
    strictPort: false,
    // Finnhub + Wikipedia need no crumb; simple same-origin proxies.
    proxy: {
      '/api/finnhub': {
        target: 'https://finnhub.io/api/v1',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/finnhub/, ''),
      },
      '/api/wiki': {
        target: 'https://en.wikipedia.org/wiki',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/wiki/, ''),
      },
      // NASDAQ Trader symbol-directory files (full NASDAQ + NYSE/AMEX universe).
      '/api/nasdaqtrader': {
        target: 'https://www.nasdaqtrader.com/dynamic/SymDir',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/nasdaqtrader/, ''),
      },
      // NASDAQ calendar API (earnings / dividends / splits / IPOs / econ events)
      // for the Calendar tab. Needs a browser UA + Accept or it 403s, and it
      // rejects the default `Origin: localhost` — so both are forced here to
      // match what the Cloudflare function sends.
      '/api/nasdaqcal': {
        target: 'https://api.nasdaq.com/api',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/nasdaqcal/, ''),
        headers: {
          'User-Agent': UA,
          accept: 'application/json, text/plain, */*',
          referer: 'https://www.nasdaq.com/',
          origin: 'https://www.nasdaq.com',
        },
      },
      // VNDirect dchart — Vietnam OHLCV (HOSE + HNX + UPCoM).
      '/api/vndirect': {
        target: 'https://dchart-api.vndirect.com.vn/dchart',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/vndirect/, ''),
      },
      // Cross-device sync → the deployed Cloudflare D1 Functions. Keeps the
      // `/api/sync/...` path intact (no rewrite). This is the ONLY proxy that
      // reaches your deployed site; it carries the X-Sync-Code header through so
      // the same access code unlocks the same data locally.
      '/api/sync': {
        target: SYNC_ORIGIN,
        changeOrigin: true,
        secure: SYNC_SECURE,
      },
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    // Raise the warning threshold so advisory noise is gone, and split the
    // heavy third-party libraries into their own cacheable chunks.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('lightweight-charts')) return 'vendor-charts';
          if (id.includes('technicalindicators')) return 'vendor-indicators';
        },
      },
    },
  },
});
