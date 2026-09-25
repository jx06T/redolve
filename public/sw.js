// Only the application shell and fingerprinted static assets may be stored here.
const VERSION = 'v1.5.0';
const SHELL_CACHE = `rdv-shell-${VERSION}`;
const ASSET_CACHE = `rdv-assets-${VERSION}`;
const SHELL_KEY = '/index.html';
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.add(SHELL_KEY)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('rdv-') && !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_PRIVATE_CACHES') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('rdv-api-') || key.startsWith('rdv-images-')).map((key) => caches.delete(key))
    )));
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;

  // API, private images and bearer-link shares must never enter Cache Storage.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/share/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok && response.headers.get('Content-Type')?.includes('text/html')) {
        event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_KEY, response.clone())));
      }
      return response;
    }).catch(async () => (await caches.match(SHELL_KEY)) || new Response('離線狀態，且尚無可用的快取頁面', { status: 503 })));
    return;
  }

  if (url.pathname.startsWith('/assets/') || ['/manifest.json', '/icon-192x192.png', '/icon-512x512.png'].includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) event.waitUntil(caches.open(ASSET_CACHE).then((cache) => cache.put(event.request, response.clone())));
      return response;
    })));
  }
});
