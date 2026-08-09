/*
 * Service worker for the Screener PWA.
 *
 * Strategy:
 *  - Navigations: network-first with `cache: 'no-store'`, falling back to the
 *    cached index.html so a cold offline launch still boots the SPA.
 *  - Hashed build assets (JS/CSS): cache-first with background refresh. Safe
 *    because a new build changes the filename, so a new deploy can never be
 *    served an old chunk.
 *  - Icons / manifest: same cache-first path (names are stable, contents rarely
 *    change, and a background refresh picks up edits on the next load).
 *  - API / data proxies (/api/*): NEVER cached — always live. If offline the
 *    request simply fails (the UI already tolerates dropped symbols).
 *
 * Why the navigation fetch passes `cache: 'no-store'`: a plain `fetch(req)`
 * still consults the browser's HTTP cache, so on a fresh deploy it can hand
 * back the PREVIOUS index.html — which this worker would then write into the
 * cache as the current shell. That is how "deployed but I see no change"
 * happened. `no-store` forces a real trip to the origin, which is the whole
 * point of calling this path network-first.
 *
 * Two more rules that exist for the same reason:
 *  - Only `res.ok` HTML is cached. Without the check, a 404/5xx served mid-
 *    deploy would be stored as the app shell and then handed to every offline
 *    launch afterwards.
 *  - '/' is deliberately NOT precached. It used to be, but nothing ever
 *    refreshed that entry (the navigation handler only writes '/index.html'),
 *    so it stayed pinned to whatever the first-ever install saw. Navigations to
 *    '/' fall back to the '/index.html' entry instead.
 *
 * CACHE_VERSION is now only a safety net for changing the cache LAYOUT — the
 * fixes above mean routine deploys no longer need a bump to land.
 */
const CACHE_VERSION = 'screener-v2';
const SHELL_URL = '/index.html';
const APP_SHELL = [
  SHELL_URL,
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

/**
 * Serve a navigation from the network, bypassing the HTTP cache, and keep the
 * shell entry fresh as a side effect. Falls back to the cached shell offline.
 */
async function handleNavigation(request) {
  try {
    const res = await fetch(request.url, { cache: 'no-store', credentials: 'same-origin' });
    const type = res.headers.get('content-type') ?? '';
    if (res.ok && type.includes('text/html')) {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((c) => c.put(SHELL_URL, copy)).catch(() => undefined);
    }
    // A navigation request has redirect mode 'manual'; returning a response that
    // followed a redirect makes the browser treat it as a network error. Rebuild
    // it so the redirected flag is dropped.
    if (res.redirected) {
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
    }
    return res;
  } catch {
    const cached = await caches.match(SHELL_URL);
    if (cached) return cached;
    return new Response('Offline and no cached copy of the app is available.', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    });
  }
}

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

  // 3) SPA navigations → network-first (HTTP cache bypassed).
  if (req.mode === 'navigate') {
    event.respondWith(handleNavigation(req));
    return;
  }

  // 4) Static assets → cache-first, refresh in the background (stale-while-revalidate).
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
