const VERSION = 'v1.3.2';
const SHELL_CACHE = `rdv-shell-${VERSION}`;
const API_CACHE = `rdv-api-${VERSION}`;
const IMAGE_CACHE = `rdv-images-${VERSION}`;

// 部署後 Vite 產生的入口是 index.html，不需要手寫 src 路徑
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // 強制新的 SW 立即安裝
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      // 忽略單一檔案找不到的錯誤，盡力快取
      return Promise.allSettled(
        SHELL_ASSETS.map(url => cache.add(url).catch(err => console.warn('Cache add failed:', url, err)))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  self.clients.claim(); // 強制新的 SW 立即控制所有開啟的分頁
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          // 清除不屬於當前 VERSION 的舊快取
          if (key.startsWith('rdv-') && ![SHELL_CACHE, API_CACHE, IMAGE_CACHE].includes(key)) {
            console.log('[SW] 清除過期快取:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// 攔截網路請求
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Image Proxy Strategy: Stale-While-Revalidate (SWR)
  if (url.pathname.includes('/image')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(IMAGE_CACHE).then(cache => cache.put(event.request, networkResponse.clone()));
            }
            return networkResponse;
          })
          .catch(() => {
            // 圖片網路失敗不報錯，交給 cachedResponse 處理
          });
        // 優先回傳快取，背景靜默拉取新圖片
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 2. API Strategy: Network-first + Offline Cache Fallback
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/share/')) {
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
            // 如果斷線且沒快取，回傳標準 JSON 錯誤避免前端崩潰
            return new Response(JSON.stringify({ error: { code: 'OFFLINE', message: '目前處於離線狀態，且無可用快取' } }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          })
      );
    }
    return;
  }

  // 3. App Shell Strategy: Network-First (針對 HTML) + Cache-First (針對 Hash 靜態檔)
  if (event.request.method === 'GET') {
    // 【關鍵修正】: 對於導航請求 (index.html)，必須走 Network-First，否則 PWA 永遠無法更新！
    if (event.request.mode === 'navigate' || url.pathname === '/') {
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            if (response.status === 200) {
              const resClone = response.clone();
              caches.open(SHELL_CACHE).then(cache => cache.put(event.request, resClone));
            }
            return response;
          })
          .catch(() => caches.match(event.request)) // 斷線時才退回快取的 HTML
      );
      return;
    }

    // 對於 Vite 打包出來的 JS/CSS/圖片 (通常帶有 Hash 或放在 /assets/)，走 Cache-First
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