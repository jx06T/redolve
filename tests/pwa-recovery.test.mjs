import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/pwa-recover.js', import.meta.url), 'utf8');
function bootstrap(online = true, storage = new Map()) {
  const handlers = new Map(), navigations = [], notices = [];
  const location = { href: 'https://redolve.test/study?source=saved#notes', replace: url => navigations.push(url) };
  const document = {
    body: { append: element => notices.push(element) },
    getElementById: id => notices.find(notice => notice.id === id),
    createElement: () => ({ setAttribute() {}, style: {} }),
  };
  vm.runInNewContext(source, {
    window: { addEventListener: (name, handler) => handlers.set(name, handler) },
    document, location, navigator: { onLine: online }, URL,
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    history: { replaceState() {} }, Date,
  });
  return { emit: (name, event = {}) => handlers.get(name)?.(event), navigations, notices };
}

test('a Vite import failure caught by React still triggers one bounded recovery', () => {
  const app = bootstrap();
  app.emit('vite:preloadError', { payload: new TypeError('Failed to fetch dynamically imported module') });
  assert.equal(app.navigations.length, 1);
  const destination = new URL(app.navigations[0]);
  assert.equal(destination.pathname, '/study');
  assert.equal(destination.searchParams.get('source'), 'saved');
  assert.equal(destination.hash, '#notes');
  assert.ok(destination.searchParams.has('rdv_reload'));
  app.emit('unhandledrejection', { reason: new TypeError('Failed to fetch dynamically imported module') });
  app.emit('error', { target: { src: '/assets/missing.js' } });
  assert.equal(app.navigations.length, 1);
});

test('offline import failures display recovery help without reloading', () => {
  const app = bootstrap(false);
  app.emit('vite:preloadError');
  assert.equal(app.navigations.length, 0);
  assert.equal(app.notices.length, 1);
  assert.match(app.notices[0].textContent, /連上網路/);
});

test('a second page load with the same unavailable release cannot reload in a loop', () => {
  const storage = new Map();
  const first = bootstrap(true, storage);
  first.emit('vite:preloadError');
  assert.equal(first.navigations.length, 1);
  const second = bootstrap(true, storage);
  second.emit('vite:preloadError');
  assert.equal(second.navigations.length, 0);
  assert.equal(second.notices.length, 1);
});

test('API failures and unrelated inspector errors do not reload the application', () => {
  const app = bootstrap();
  app.emit('unhandledrejection', { reason: new Error('GET /api/search 500') });
  app.emit('error', { target: { src: 'https://extension.test/inspector.js' } });
  assert.equal(app.navigations.length, 0);
  assert.equal(app.notices.length, 0);
});
