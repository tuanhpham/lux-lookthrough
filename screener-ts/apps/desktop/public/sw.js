/*
 * Service worker for the Screener PWA.
 *
 * Strategy:
 *  - App shell (HTML/JS/CSS/icons): cache-first with background refresh, so the
 *    app opens instantly and even works offline (shows the last-built UI).
 *  - API / data proxies (/api/*): NEVER cached — always go to the network so
 *    stock quotes, fundamentals and screens are always live. If offline, the
 *    request simply fails (the UI already tolerates dropped symbols).
 *  - Navigations: network-first, falling back to the cached index.html so a
 *    cold offline launch still boots the SPA.
 *
 * Bump CACHE_VERSION to invalidate old caches on the next deploy.
 */
const CACHE_VERSION = 'screener-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Never cache the data proxies — always live.
  if (url.pathname.startsWith('/api/')) {
    return; // default: let the browser do a normal network fetch
  }

  // 2) Cross-origin (e.g. direct Yahoo on desktop) — don't intercept.
  if (url.origin !== self.location.origin) return;

  // 3) SPA navigations → network-first, fall back to cached index.html.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }

  // 4) Static assets → cache-first, refresh in the background (stale-while-revalidate).
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
