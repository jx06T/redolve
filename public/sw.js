// Redolve PWA Service Worker (v1.3.4)
const VERSION = 'v1.3.4';
const SHELL_CACHE = `rdv-shell-${VERSION}`;
const API_CACHE = `rdv-api-${VERSION}`;
const IMAGE_CACHE = `rdv-images-${VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return Promise.allSettled(
        SHELL_ASSETS.map(url => cache.add(url).catch(err => console.warn('Cache add failed:', url, err)))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith('rdv-') && ![SHELL_CACHE, API_CACHE, IMAGE_CACHE].includes(key)) {
            console.log('[SW] 清除過期快取:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. API 請求 (嚴格限定以 /api/ 開頭) -> Network-First
  if (url.pathname.startsWith('/api/')) {
    if (event.request.method === 'GET') {
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              const resClone = response.clone();
              caches.open(API_CACHE).then((cache) => cache.put(event.request, resClone));
            }
            return response;
          })
          .catch(async () => {
            const cached = await caches.match(event.request);
            if (cached) return cached;
            return new Response(JSON.stringify({ error: { code: 'OFFLINE', message: '離線狀態且無可用快取' } }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          })
      );
    }
    return;
  }

  // 2. 題目圖片代理請求 (排除前端 /assets/ 裡面的靜態圖片) -> SWR
  if (url.pathname.includes('/image') && !url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(IMAGE_CACHE).then(cache => cache.put(event.request, networkResponse.clone()));
            }
            return networkResponse;
          })
          .catch(() => { });
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. SPA 網頁頁面跳轉 (HTML Navigation) -> 💡 關鍵修復！
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const resClone = response.clone();
            caches.open(SHELL_CACHE).then(cache => cache.put('/', resClone));
          }
          return response;
        })
        .catch(async () => {
          // 💡 核心修復：不管使用者在什麼子網址 (/study/math, /search, /share/st_123)，
          // 找不到或斷線時，退回的快取永遠是 '/index.html' 或 '/'！
          const cachedIndex = (await caches.match('/index.html')) || (await caches.match('/'));
          if (cachedIndex) return cachedIndex;
          throw new Error('No offline index.html available');
        })
    );
    return;
  }

  // 4. Vite 打包出的 JS / CSS 靜態資源 -> Cache-First
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const resClone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, resClone));
          }
          return response;
        });
      })
    );
  }
});