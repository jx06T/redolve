---
name: pwa-sw-scroll
description: >-
  PWA Service Worker 配置、熱更新機制、四種快取策略，以及 iPad/移動端
  四層防滾動方案的完整指引。適用於以 Vite + 手寫 Service Worker 為基礎的
  SPA PWA 專案。涵蓋：SW 安裝不主動 skipWaiting（防白屏）、前端主動發送
  SKIP_WAITING 的熱更新流程、Network-First / SWR / Cache-First 四種快取策略、
  SHELL_KEY 單一 HTML 快取鍵設計、以及 Viewport meta / CSS overflow /
  canvas.pencil-active / .no-scrollbar 四層防滾動實作。
triggers:
  - 初始化或修改 public/sw.js
  - 設計 PWA 熱更新提示（Toast / 版本切換）
  - 處理 SW 新舊版本 JS hash 白屏問題
  - 設計或調整 SW 快取策略
  - 處理 iPad 頁面意外捲動或系統手勢干擾
  - 新增可捲動區域需要隱藏捲軸（no-scrollbar）
  - index.html PWA meta 設定
---

# PWA Service Worker 配置與防滾動實作指引

---

## 核心設計決策

| 決策 | 說明 |
|------|------|
| SW 安裝不主動 `skipWaiting()` | 避免新 SW + 舊 JS hash 同頁運行造成白屏 |
| 前端發送 `SKIP_WAITING` 才切換 | 可配合 Toast 讓使用者主動確認，或自動觸發 |
| 統一 `SHELL_KEY = '/index.html'` | 無論使用者在任何子路由，Offline fallback 都讀同一份 HTML |
| 手寫 SW，不使用 Workbox | 策略明確、可讀，避免 Workbox 黑箱行為 |

---

## 1. index.html — PWA Meta 設定

```html
<head>
  <meta charset="UTF-8" />

  <!-- PWA 圖示：Apple Touch Icon 必須是 PNG，SVG 在加入主畫面時會黑塊 -->
  <link rel="apple-touch-icon" href="/icon-192x192.png" />
  <link rel="manifest" href="/manifest.json" />

  <!-- Viewport：禁止使用者縮放（書寫/繪圖 App 必要），viewport-fit=cover 填滿瀏海區域 -->
  <meta name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />

  <!-- Apple PWA Meta -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <!-- black-translucent：讓內容延伸至狀態列後方，搭配 safe-area-inset 使用 -->
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="<App Name>" />
  <meta name="application-name" content="<App Name>" />
  <!-- theme-color：決定瀏覽器工具列顏色，使用品牌主色 Token 解析後的色碼 -->
  <meta name="theme-color" content="<primary-500 hex>" />
</head>
```

> `user-scalable=no` + `maximum-scale=1.0` 是防止雙擊縮放的第一道防線（Viewport 層）。  
> 這與 CSS 的 `touch-action: manipulation` 共同作用，缺一可能在某些 iOS 版本失效。

---

## 2. Service Worker 架構

```
public/sw.js
  │
  ├── VERSION 版本常數（每次發版手動更新）
  ├── 快取名稱（帶版本號）
  ├── SHELL_KEY = '/index.html'（統一 fallback key）
  │
  ├── install   → 快取 Shell Assets，不主動 skipWaiting
  ├── activate  → 清除過期版本快取（prefix rdv- 比對），claims clients
  ├── message   → 接收 'SKIP_WAITING' 才執行 self.skipWaiting()
  └── fetch     → 四種策略分發（見下節）
```

### SW 版本常數

```javascript
const VERSION = 'v1.0.0'; // 每次有破壞性改動（JS hash 變更）時遞增

const SHELL_CACHE = `app-shell-${VERSION}`;
const API_CACHE   = `app-api-${VERSION}`;
const IMAGE_CACHE = `app-images-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, API_CACHE, IMAGE_CACHE];

// 統一 HTML fallback key，避免 '/' 與 '/index.html' 存兩份導致 fallback 讀到舊版
const SHELL_KEY = '/index.html';

const SHELL_ASSETS = ['/', '/index.html', '/manifest.json'];
```

---

## 3. SW 生命週期事件

### install：快取 Shell，不主動 skipWaiting

```javascript
self.addEventListener('install', (event) => {
  // 不呼叫 self.skipWaiting()
  // 新 SW 安裝完成後進入 waiting 狀態，等待前端主動確認後才接管
  // 原因：若在使用者仍在瀏覽舊頁面時立刻接管，
  //       新 SW 的快取策略會搭配舊 JS hash，導致靜態資源找不到而白屏
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return Promise.allSettled(
        SHELL_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Cache add failed:', url, err))
        )
      );
      // 使用 Promise.allSettled 而非 Promise.all：
      // 個別資源快取失敗不應中止整個 install 流程
    })
  );
});
```

### activate：清除舊版快取

```javascript
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          // 只清除本 App 的快取（前綴 'app-'），不誤刪其他 App 的快取
          if (key.startsWith('app-') && !CURRENT_CACHES.includes(key)) {
            console.log('[SW] 清除過期快取:', key);
            return caches.delete(key);
          }
        })
      );
      // claim：讓新 SW 立即控制已開啟的頁面，
      // 搭配前端的 controllerchange 監聽器自動 reload
      await self.clients.claim();
    })()
  );
});
```

### message：接收前端發出的 SKIP_WAITING

```javascript
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    // 前端確認後才執行切換，避免白屏
    self.skipWaiting();
  }
});
```

---

## 4. 四種快取策略

```javascript
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 策略 1: API → Network-First（僅 GET）
  // 策略 2: 圖片 → Stale-While-Revalidate
  // 策略 3: HTML 導航 → Network-First + 統一 SHELL_KEY Fallback
  // 策略 4: 靜態資源 → Cache-First（Vite hash 資源永久快取）
});
```

### 策略 1：API — Network-First（GET only）

```javascript
if (url.pathname.startsWith('/api/')) {
  if (event.request.method !== 'GET') return; // POST/PATCH/DELETE 不快取，直接放行

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response?.status === 200) {
          // 網路成功：非同步更新快取，不阻塞回應
          caches.open(API_CACHE).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(async () => {
        // 斷線：回傳快取版本，無快取則回傳結構化 503
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response(
          JSON.stringify({ error: { code: 'OFFLINE', message: '離線且無可用快取' } }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
  );
  return;
}
```

### 策略 2：圖片 — Stale-While-Revalidate（SWR）

```javascript
// 排除 /assets/ 下的 Vite 打包靜態圖片（那些走策略 4）
if (url.pathname.includes('/image') && !url.pathname.startsWith('/assets/')) {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 同步發起網路請求（背景更新快取）
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse?.status === 200) {
            caches.open(IMAGE_CACHE).then(cache =>
              cache.put(event.request, networkResponse.clone())
            );
          }
          return networkResponse;
        })
        .catch(() => cachedResponse); // 網路失敗時仍回傳舊快取

      // 有快取：立即回傳舊版（快），背景更新
      // 無快取：等待網路回應
      return cachedResponse || fetchPromise;
    })
  );
  return;
}
```

**SWR 適用場景：** 圖片、不需即時最新的資料。  
**不適用：** API 資料（可能讀到過時資料造成功能錯誤）。

### 策略 3：HTML 導航 — Network-First + 統一 SHELL_KEY

```javascript
if (event.request.mode === 'navigate') {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response?.status === 200) {
          // 統一寫入 SHELL_KEY（'/index.html'）
          // 不論使用者造訪 /study/math 或 /search，都存同一份
          // 避免 '/' 與 '/index.html' 各存一份、fallback 讀到其中一份舊的
          caches.open(SHELL_CACHE).then(cache => cache.put(SHELL_KEY, response.clone()));
        }
        return response;
      })
      .catch(async () => {
        // 無論使用者當前在哪個子路由，一律回傳同一份 HTML Shell
        // SPA Router 會根據 window.location 渲染正確的頁面
        const cachedShell = await caches.match(SHELL_KEY);
        if (cachedShell) return cachedShell;
        return new Response('離線且無可用頁面快取', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
  return;
}
```

> SHELL_KEY 設計要點：Vite 每次 build 都會更新 JS/CSS hash。
> 成功導航後更新 SHELL_KEY，讓 HTML 中的 `<script>` 和 `<link>` 指向最新 hash，
> 確保 Offline fallback 不會指向已失效的舊 hash 靜態資源。

### 策略 4：靜態資源 — Cache-First（Vite hash 資源）

```javascript
if (event.request.method === 'GET') {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Cache hit：直接回傳，不觸網路（hash 不同代表是新版，直接快取）
      if (cachedResponse) return cachedResponse;

      return fetch(event.request)
        .then((response) => {
          if (response?.status === 200) {
            caches.open(SHELL_CACHE).then(cache => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() =>
          // 返回 504 而非 unhandled rejection，讓瀏覽器自然顯示資源載入失敗
          new Response('', { status: 504, statusText: 'Offline and not cached' })
        );
    })
  );
}
```

---

## 5. 前端 SW 註冊與熱更新流程

```javascript
// index.html（<script> 在 </body> 前）
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then((reg) => {

    // 偵測新版本：updatefound → installing → installed
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // 此時新 SW 已下載完成，正在 waiting
          // 選項 A（自動更新）：
          newWorker.postMessage('SKIP_WAITING');

          // 選項 B（使用者確認，建議用於生產環境）：
          // showUpdateToast(() => newWorker.postMessage('SKIP_WAITING'));
        }
      });
    });
  });

  // 新 SW 接管（activate 後）→ reload 確保 JS/CSS 版本一致
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
    // refreshing flag 防止 controllerchange 因多個 client tab 觸發多次 reload
  });
}
```

**完整熱更新流程時序：**

```
使用者開啟 App（舊 SW 控制中）
  │
  ├── 背景：瀏覽器拉取 /sw.js，發現 VERSION 不同
  ├── 新 SW install：快取新版 Shell Assets，進入 waiting
  ├── reg.updatefound → newWorker.state === 'installed'
  │     └── 前端顯示 Toast 或自動 postMessage('SKIP_WAITING')
  │
  ├── 舊 SW → 新 SW 接管（skipWaiting → activate → clients.claim）
  ├── controllerchange 事件觸發
  └── window.location.reload() → 頁面以新 JS hash 重新載入
```

---

## 6. 四層防滾動實作

### 層 1：Viewport Meta（HTML 層）

```html
<meta name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
```

- `user-scalable=no` + `maximum-scale=1.0`：禁止捏合縮放
- `viewport-fit=cover`：內容延伸至瀏海 / Home Bar 區域（搭配 `safe-area-inset-*` 使用）

> 注意：此設定會讓 iOS 上的輔助功能縮放失效。若有無障礙需求，應評估是否只對特定元素禁用縮放。

### 層 2：CSS Global Base（index.css）

```css
@layer base {
  html, body {
    height: 100%;
    overflow: hidden;          /* 禁止 HTML/Body 層的滾動 */
    overscroll-behavior: none; /* 禁止 iOS rubber-band / bounce 效果 */
  }

  body {
    touch-action: manipulation; /* 禁止雙擊縮放，保留單擊與長按 */
    -webkit-tap-highlight-color: transparent; /* 禁止點擊灰色閃光 */
    user-select: none;
    -webkit-user-select: none;
  }

  #root {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* root 容器也鎖住 */
  }

  /* 例外：表單元素需要可選取文字 */
  input, textarea, select, [contenteditable="true"] {
    user-select: auto;
    -webkit-user-select: auto;
  }
}
```

### 層 3：Canvas 動態 touch-action（Pencil 書寫專用）

```css
/* index.css（@layer base 外，全域套用） */

/* Pencil 開始書寫時，由 JS 動態加上 .pencil-active class */
canvas.pencil-active {
  touch-action: none; /* 完全鎖定 canvas 上的所有觸控行為 */
}
```

```typescript
// DrawCanvas.tsx — pointerdown 時動態切換
const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
  if (e.pointerType === 'pen') {
    // 進入書寫：鎖定 touch-action
    canvasRef.current!.style.touchAction = 'none';
    // 或：canvasRef.current!.classList.add('pencil-active');
  }
};

const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
  // 離開書寫：依狀態恢復
  e.currentTarget.style.touchAction = readOnly
    ? 'pan-y'                               // 唯讀模式：允許垂直捲動以瀏覽
    : (allowTouchDrawing ? 'none' : 'pan-y'); // 書寫模式：依設定決定
};
```

**為何需要動態切換而非靜態 `touch-action: none`：**  
若整個 canvas 永久設 `none`，使用者在唯讀卡片上無法捲動列表。  
動態切換只在 Pencil 按下到放開的窗口鎖定，其餘時間恢復正常。

### 層 4：.no-scrollbar Utility（隱藏捲軸但保留捲動功能）

```css
/* index.css — @layer base 外，作為全域 utility */

.no-scrollbar {
  scrollbar-width: none;      /* Firefox */
  -ms-overflow-style: none;   /* IE / Edge legacy */
}

.no-scrollbar::-webkit-scrollbar {
  display: none; /* Chrome / Safari / Webkit */
}
```

**使用時機：** 某個容器需要可捲動（`overflow-y: auto` / `overflow-x: auto`），但不應顯示捲軸。

```tsx
// 用法
<div className="overflow-y-auto no-scrollbar h-full">
  {/* 可捲動但不顯示捲軸 */}
</div>
```

> 與全域 `::-webkit-scrollbar` 的區別：  
> 全域規則設定捲軸樣式（細、半透明）；  
> `.no-scrollbar` 完全隱藏。兩者可以並存，`.no-scrollbar` 優先覆蓋。

---

## 7. 全域捲軸美化（非必要但建議）

```css
/* index.css @layer base */

/* 全域細捲軸樣式（讓偶爾出現的捲軸看起來更精緻） */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--color-border-subtle); /* 使用 Token，Dark Mode 自動切換 */
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}

* {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-subtle) transparent;
}
```

---

## 8. manifest.json 最小必要欄位

```json
{
  "name": "<App 全名>",
  "short_name": "<短名（主畫面圖示下方顯示）>",
  "description": "<App 描述>",
  "start_url": "/",
  "display": "standalone",          // standalone：隱藏瀏覽器 UI，全螢幕體驗
  "background_color": "<page-bg 色碼>",
  "theme_color": "<primary-500 色碼>",
  "orientation": "any",
  "icons": [
    { "src": "/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512x512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

---

## 9. 實作核對清單

**index.html：**
- `[ ]` `<meta name="viewport" content="... maximum-scale=1.0, user-scalable=no, viewport-fit=cover">`
- `[ ]` `<link rel="apple-touch-icon" href="/icon-192x192.png">` — PNG 格式
- `[ ]` `<meta name="apple-mobile-web-app-capable" content="yes">`
- `[ ]` `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- `[ ]` `<meta name="theme-color" content="<品牌色>">`

**service worker（public/sw.js）：**
- `[ ]` install 不呼叫 `skipWaiting()`
- `[ ]` activate 清除舊版 `app-*` 快取並 `clients.claim()`
- `[ ]` message 事件接收 `'SKIP_WAITING'` 才執行切換
- `[ ]` `/api/*` GET → Network-First，斷線回傳 503 JSON
- `[ ]` 圖片 → SWR（有快取先回，背景更新）
- `[ ]` `navigate` → Network-First，fallback 讀 `SHELL_KEY`
- `[ ]` 靜態資源 → Cache-First，miss 再 fetch

**前端 SW 註冊：**
- `[ ]` `updatefound → statechange === 'installed'` 觸發更新提示或自動 postMessage
- `[ ]` `controllerchange` 事件觸發 `window.location.reload()`（加 `refreshing` flag 防重複）

**CSS 防滾動：**
- `[ ]` `html, body { overflow: hidden; overscroll-behavior: none }`
- `[ ]` `body { touch-action: manipulation }`
- `[ ]` `#root { overflow: hidden }`
- `[ ]` `canvas.pencil-active { touch-action: none }` 靜態 CSS 就緒
- `[ ]` pointerDown(pen) → `touchAction = 'none'`，pointerUp → 依狀態恢復
- `[ ]` `.no-scrollbar` utility 可用
