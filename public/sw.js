// The build script injects a content-derived ID and every file from the same Vite build.
const BUILD_ID = '__REDOLVE_BUILD_ID__';
const PRECACHE_URLS = /* __REDOLVE_PRECACHE__ */ [];
const STATIC_CACHE = `rdv-static-${BUILD_ID}`;
const RUNTIME_ASSETS = 'rdv-runtime-assets';
const LEGACY_ASSETS = 'rdv-legacy-assets';
const SHELL_KEY = '/index.html';
const precached = new Set(PRECACHE_URLS);

function validAsset(response, pathname) {
  if (!response?.ok) return false;
  const type = response.headers.get('Content-Type') || '';
  if (pathname.endsWith('.css')) return /^text\/css\b/i.test(type);
  if (pathname.endsWith('.js')) return /(?:java|ecma)script/i.test(type);
  if (pathname.endsWith('.html')) return /^text\/html\b/i.test(type);
  if (pathname.endsWith('.json')) return /\bjson\b/i.test(type);
  return !/^text\/html\b/i.test(type);
}

async function fetchStatic(request) {
  const pathname = new URL(request.url).pathname;
  const cached = pathname.startsWith('/assets/')
    ? await caches.match(request)
    : await (await caches.open(STATIC_CACHE)).match(request);
  if (cached && validAsset(cached, pathname)) return cached;

  try {
    const response = await fetch(request);
    // Cloudflare's SPA fallback can return index.html with HTTP 200 for an old
    // hashed CSS/JS URL. Never hand that HTML to a stylesheet or script loader.
    if (!validAsset(response, pathname)) {
      return new Response('Static asset unavailable', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    if (pathname.startsWith('/assets/')) {
      try {
        const copy = response.clone();
        await caches.open(RUNTIME_ASSETS).then((cache) => cache.put(request, copy));
      } catch {
        // A full or unavailable cache must not hide a valid network response.
      }
    }
    return response;
  } catch {
    return new Response('Static asset unavailable offline', {
      status: 504,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    try {
      // Installation succeeds only if the HTML and all of its hashed assets
      // came from one build. A partial cache must never become the offline shell.
      for (const pathname of PRECACHE_URLS) {
        const response = await fetch(new Request(pathname, { cache: 'reload' }));
        if (!validAsset(response, pathname)) throw new Error(`Invalid precache response: ${pathname}`);
        await cache.put(pathname, response);
      }
    } catch (error) {
      await caches.delete(STATIC_CACHE);
      throw error;
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Old SW releases mixed static files with HTML and sometimes private data.
    // Keep only valid hashed assets, then remove those legacy caches entirely.
    const legacy = await caches.open(LEGACY_ASSETS);
    for (const name of await caches.keys()) {
      if (/^rdv-(?:api|images)-/.test(name)) {
        await caches.delete(name);
      } else if (/^rdv-(?:shell|assets)-/.test(name)) {
        const oldCache = await caches.open(name);
        for (const request of await oldCache.keys()) {
          const pathname = new URL(request.url).pathname;
          if (!pathname.startsWith('/assets/')) continue;
          const response = await oldCache.match(request);
          if (validAsset(response, pathname) && !(await legacy.match(request))) {
            await legacy.put(request, response);
          }
        }
        await caches.delete(name);
      }
    }
    // Revisioned static caches are retained for tabs opened before this build.
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_PRIVATE_CACHES') {
    event.waitUntil(caches.keys().then((names) => Promise.all(names
      .filter((name) => /^rdv-(?:api|images)-/.test(name))
      .map((name) => caches.delete(name)))));
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/share/') || url.pathname === '/sw.js') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'reload' }).catch(async () => {
      const cache = await caches.open(STATIC_CACHE);
      return (await cache.match(SHELL_KEY)) || new Response('離線狀態，且尚無完整的應用程式快取', { status: 503 });
    }));
    return;
  }

  if (url.pathname.startsWith('/assets/') || precached.has(url.pathname)) {
    event.respondWith(fetchStatic(event.request));
  }
});
