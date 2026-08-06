// Redolve PWA Service Worker
const VERSION = 'v1.4.0';
const SHELL_CACHE = `rdv-shell-${VERSION}`;
const API_CACHE = `rdv-api-${VERSION}`;
const IMAGE_CACHE = `rdv-images-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, API_CACHE, IMAGE_CACHE];

// 統一只用這一個 key 存放「最新的」HTML shell，
// 避免同時存在 '/' 與 '/index.html' 兩份、導致 fallback 讀到舊版本
const SHELL_KEY = '/index.html';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  // 不再無條件 skipWaiting()。
  // 新 SW 先安裝好、進入 waiting 狀態，等前端主動確認後才接管，
  // 避免「舊頁面 + 新 SW」造成 JS/CSS hash 對不上的白屏問題。
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return Promise.allSettled(
        SHELL_ASSETS.map(url => cache.add(url).catch(err => console.warn('Cache add failed:', url, err)))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key.startsWith('rdv-') && !CURRENT_CACHES.includes(key)) {
            console.log('[SW] 清除過期快取:', key);
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// 讓前端可以主動要求這個 waiting 中的 SW 立刻接管
// （通常在使用者按下「有新版本，點此更新」之後呼叫）
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
          .catch(() => cachedResponse); // network 失敗時仍回舊快取，避免 unhandled rejection
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. SPA 網頁頁面跳轉 (HTML Navigation) -> Network-First，並統一寫入單一 SHELL_KEY
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const resClone = response.clone();
            caches.open(SHELL_CACHE).then(cache => cache.put(SHELL_KEY, resClone));
          }
          return response;
        })
        .catch(async () => {
          // 不管使用者在什麼子網址 (/study/math, /search, /share/st_123)，
          // 找不到或斷線時，一律退回同一份、且會持續被更新的 SHELL_KEY
          const cachedIndex = await caches.match(SHELL_KEY);
          if (cachedIndex) return cachedIndex;
          return new Response('離線狀態，且尚無可用的快取頁面', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  // 4. Vite 打包出的 JS / CSS 靜態資源 -> Cache-First，並加上失敗保護
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              const resClone = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, resClone));
            }
            return response;
          })
          .catch(() => {
            // 避免 unhandled rejection；沒有快取也沒有網路時，
            // 讓瀏覽器自然顯示該資源載入失敗，而不是整個 SW 拋錯
            return new Response('', { status: 504, statusText: 'Offline and not cached' });
          });
      })
    );
  }
});