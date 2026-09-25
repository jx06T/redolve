import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const script = await readFile(join(dist, 'sw.js'), 'utf8');
const template = await readFile(join(root, 'public', 'sw.js'), 'utf8');
const html = await readFile(join(dist, 'index.html'), 'utf8');
const buildId = script.match(/const BUILD_ID = "([a-f0-9]+)";/)?.[1];
const manifest = JSON.parse(script.match(/const PRECACHE_URLS = (\[[^;]+\]);/)?.[1] || 'null');

test('the SW build ID and manifest match every published file', async () => {
  assert.ok(buildId);
  assert.ok(Array.isArray(manifest));
  const digest = createHash('sha256').update(template);
  for (const url of manifest) {
    digest.update(url);
    digest.update(await readFile(join(dist, url.slice(1))));
  }
  assert.equal(buildId, digest.digest('hex').slice(0, 16));
  assert.ok(manifest.includes('/index.html'));
  for (const [, url] of html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)(?:\?[^\"]*)?"/g)) {
    assert.ok(manifest.includes(url), `${url} is absent from the SW manifest`);
  }
});

function makeWorker(badAsset) {
  const stores = new Map();
  const listeners = new Map();
  let skipped = false;
  class LocalRequest {
    constructor(url) { this.url = new URL(url, 'https://redolve.test').href; }
  }
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(url, response) { store.set(new LocalRequest(url.url || url).url, response); },
        async match(url) { return store.get(new LocalRequest(url.url || url).url); },
        async keys() { return [...store.keys()].map((url) => new LocalRequest(url)); },
      };
    },
    async delete(name) { return stores.delete(name); },
    async keys() { return [...stores.keys()]; },
    async match(url) {
      for (const store of stores.values()) {
        const found = store.get(new LocalRequest(url.url || url).url);
        if (found) return found;
      }
    },
  };
  const self = {
    location: { origin: 'https://redolve.test' },
    clients: { async claim() {} },
    addEventListener(type, handler) { listeners.set(type, handler); },
    skipWaiting() { skipped = true; },
  };
  const fetch = async (request) => {
    const path = new URL(request.url).pathname;
    const contentType = path.endsWith('.css') && path !== badAsset
      ? 'text/css'
      : path.endsWith('.js') && path !== badAsset
        ? 'text/javascript'
        : path.endsWith('.html') || path === badAsset
          ? 'text/html'
          : path.endsWith('.json')
            ? 'application/json'
            : 'image/png';
    return new Response('test', { headers: { 'Content-Type': contentType } });
  };
  vm.runInNewContext(script, { self, caches, fetch, Request: LocalRequest, Response, URL, Set });
  return { caches, listeners, stores, get skipped() { return skipped; } };
}

test('SW install waits and rejects an HTML fallback for a CSS hash', async () => {
  const css = manifest.find((url) => url.endsWith('.css'));
  assert.ok(css);
  const broken = makeWorker(css);
  let installation;
  broken.listeners.get('install')({ waitUntil(value) { installation = value; } });
  await assert.rejects(installation, /Invalid precache response/);
  assert.ok(!broken.stores.has(`rdv-static-${buildId}`));
  assert.equal(broken.skipped, false);

  const valid = makeWorker();
  valid.listeners.get('install')({ waitUntil(value) { installation = value; } });
  await installation;
  assert.equal(valid.stores.get(`rdv-static-${buildId}`).size, manifest.length);
  assert.equal(valid.skipped, false);
});

test('activation preserves valid old CSS and removes private or invalid legacy entries', async () => {
  const worker = makeWorker();
  const old = await worker.caches.open('rdv-assets-v1.5.0');
  await old.put('/assets/old.css', new Response('body{}', { headers: { 'Content-Type': 'text/css' } }));
  await old.put('/assets/bad.css', new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }));
  await worker.caches.open('rdv-api-v1.5.0');

  let activation;
  worker.listeners.get('activate')({ waitUntil(value) { activation = value; } });
  await activation;

  assert.ok(!worker.stores.has('rdv-assets-v1.5.0'));
  assert.ok(!worker.stores.has('rdv-api-v1.5.0'));
  const retained = await worker.caches.open('rdv-legacy-assets');
  assert.equal((await retained.match('/assets/old.css')).headers.get('Content-Type'), 'text/css');
  assert.equal(await retained.match('/assets/bad.css'), undefined);

  let response;
  worker.listeners.get('fetch')({
    request: { url: 'https://redolve.test/assets/old.css', method: 'GET', mode: 'no-cors' },
    respondWith(value) { response = value; },
  });
  assert.equal(await (await response).text(), 'body{}');
});

test('stable bootstrap files come from the current build cache', async () => {
  const worker = makeWorker();
  const old = await worker.caches.open('rdv-static-old');
  await old.put('/pwa-recover.js', new Response('old', { headers: { 'Content-Type': 'text/javascript' } }));
  const current = await worker.caches.open(`rdv-static-${buildId}`);
  await current.put('/pwa-recover.js', new Response('new', { headers: { 'Content-Type': 'text/javascript' } }));

  let response;
  worker.listeners.get('fetch')({
    request: { url: 'https://redolve.test/pwa-recover.js', method: 'GET', mode: 'no-cors' },
    respondWith(value) { response = value; },
  });
  assert.equal(await (await response).text(), 'new');
});
