import { defineConfig } from 'vite';

// Tauri expects a fixed port in dev; also fine for plain web preview.
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: false,
    // Local dev proxy so the web build can fetch real data WITHOUT the
    // Cloudflare Pages functions or the Tauri Rust HTTP layer. Mirrors the
    // production routes: /api/yahoo/* and /api/finnhub/*. The adapters call
    // these same-origin paths when not running inside Tauri.
    proxy: {
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/yahoo/, ''),
        headers: { 'User-Agent': 'Mozilla/5.0 (screener-dev)' },
      },
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
