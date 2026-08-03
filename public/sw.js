// Redolve PWA Service Worker (v1.3.0)
const SHELL_CACHE = 'rdv-shell-v1';
const API_CACHE = 'rdv-api-v1';
const IMAGE_CACHE = 'rdv-images-v1';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/index.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (![SHELL_CACHE, API_CACHE, IMAGE_CACHE].includes(key)) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Image Proxy Strategy: Stale-While-Revalidate
  if (url.pathname.includes('/image')) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 2. API Strategy: Network-first + Offline Cache Fallback
  if (url.pathname.startsWith('/api/')) {
    if (event.request.method === 'GET') {
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            if (response.status === 200) {
              const resClone = response.clone();
              caches.open(API_CACHE).then((cache) => cache.put(event.request, resClone));
            }
            return response;
          })
          .catch(() => caches.match(event.request))
      );
    }
    return;
  }

  // 3. App Shell Strategy: Cache-first
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((response) => {
        if (response.status === 200 && event.request.method === 'GET') {
          const resClone = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, resClone));
        }
        return response;
      });
    })
  );
});
