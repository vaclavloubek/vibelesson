const CACHE_NAME = 'syllonaut-live-shell-v1';

function isCacheableLiveNavigation(requestUrl, response) {
  if (!response.ok || response.redirected || !response.url) return false;
  try {
    const responseUrl = new URL(response.url);
    return responseUrl.origin === requestUrl.origin && responseUrl.pathname === requestUrl.pathname;
  } catch {
    return false;
  }
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('syllonaut-live-shell-') && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' && (url.pathname.startsWith('/student/') || url.pathname.startsWith('/sessions/'))) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) {
          try {
            await cache.put(request, response.clone());
          } catch {
            // Caching must never turn a successful navigation into a failed one.
          }
          return response;
        }
        if (response.status >= 500) {
          const cached = await cache.match(request);
          if (cached) return cached;
        }
        return response;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw new Error('Live page is not available offline yet.');
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        try {
          await cache.put(request, response.clone());
        } catch {
          // Static cache failure must never block a successful network response.
        }
      }
      return response;
    })());
  }
});
