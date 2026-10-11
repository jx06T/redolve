import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({ stdin: { contents: `
  export * from './src/services/listCache';
  export {searchProblems, updateProblemStatus} from './src/services/api';
  export {sharingApi} from './src/services/sharingApi';
`, resolveDir: process.cwd() }, bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
const { createListCache, questionListCache, searchProblems, updateProblemStatus, sharingApi } =
  await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('40 seconds starts at successful receipt; reads do not renew it; errors are retried', async () => {
  let time = 100, calls = 0;
  const cache = createListCache({ now: () => time });
  const delayed = gate();
  const first = cache.read('page1', async () => { calls++; await delayed.promise; return { calls }; });
  time = 5_000; delayed.resolve(); const value = await first;
  assert.equal(cache.receivedAt(value), 5_000);
  time = 44_999;
  const cached = await cache.read('page1', async () => { calls++; return { calls }; });
  assert.equal(calls, 1); assert.equal(cache.receivedAt(cached), 5_000); assert.equal(cache.wasCached(cached), true);
  time = 45_000;
  await cache.read('page1', async () => { calls++; return { calls }; });
  assert.equal(calls, 2);
  await assert.rejects(cache.read('bad', async () => { throw Error('offline'); }), /offline/);
  assert.deepEqual(await cache.read('bad', async () => ({ ok: true })), { ok: true });
});

test('same-key requests deduplicate; one abort does not cancel other consumers or the reusable result', async () => {
  const cache = createListCache(); const delayed = gate(); let calls = 0;
  const abort = new AbortController();
  const loader = async signal => { calls++; await delayed.promise; assert.equal(signal.aborted, false); return { value: 1 }; };
  const a = cache.read('same', loader, abort.signal), b = cache.read('same', loader);
  const cancelled = assert.rejects(a, { name: 'AbortError' }); abort.abort(); delayed.resolve();
  await cancelled; assert.deepEqual(await b, { value: 1 });
  await cache.read('same', loader); assert.equal(calls, 1);
});

test('mutation overtaking a GET discards its result and deduplicates the new generation', async () => {
  const cache = createListCache(), delayed = gate(); let calls = 0;
  const loader = async () => { const value = ++calls; if (value === 1) await delayed.promise; return { value }; };
  const old = cache.read('page', loader);
  await Promise.resolve(); cache.invalidate();
  const fresh = await cache.read('page', loader); delayed.resolve();
  assert.deepEqual(await old, fresh); assert.equal(fresh.value, 2);
  assert.deepEqual(await cache.read('page', loader), fresh); assert.equal(calls, 2);
  const version = cache.versionOf(fresh); cache.invalidate();
  assert.equal(cache.versionOf(fresh), version); assert.notEqual(cache.version(), version);
});

test('account switching cancels old requests and clears values even when returning to the same account', async () => {
  const cache = createListCache(), delayed = gate(); cache.setAccount('a');
  await cache.read('ready', async () => ({ account: 'a' }));
  let receivedSignal;
  const old = cache.read('pending', async signal => { receivedSignal = signal; await delayed.promise; return { account: 'a' }; });
  await Promise.resolve(); const cancelled = assert.rejects(old, { name: 'AbortError' });
  cache.setAccount('b'); assert.equal(receivedSignal.aborted, true); delayed.resolve(); await cancelled;
  assert.deepEqual(await cache.read('ready', async () => ({ account: 'b' })), { account: 'b' });
  cache.setAccount('a');
  assert.deepEqual(await cache.read('ready', async () => ({ account: 'a-new' })), { account: 'a-new' });
});

test('manual invalidation and bounded LRU do not renew timestamps', async () => {
  const cache = createListCache({ limit: 2 }); let calls = 0, cleared = 0;
  cache.onInvalidate(() => cleared++);
  const load = () => Promise.resolve({ revision: ++calls });
  await cache.read('a', load); await cache.read('b', load); await cache.read('a', load);
  await cache.read('c', load); await cache.read('b', load); assert.equal(calls, 4);
  cache.invalidate(); await cache.read('b', load); assert.equal(calls, 5); assert.equal(cleared, 1);
});

test('actual API adapters partition scopes/projection/pages and invalidate only successful writes', async t => {
  const calls = []; let failWrite = false;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), method: init?.method || 'GET' });
    return new Response(JSON.stringify(String(url).includes('/search?') ? { items: [], next_offset: null, scope: 'mine' } : {}),
      { status: failWrite && init?.method === 'PATCH' ? 500 : 200, headers: { 'Content-Type': 'application/json' } });
  });
  questionListCache.setAccount('api-a');
  const params = new URLSearchParams({ scope: 'mine', origin: 'owned', browse: '1', projection: 'compact' });
  await searchProblems('', params); await searchProblems('   ', params); assert.equal(calls.length, 1);
  await searchProblems('', new URLSearchParams({ ...Object.fromEntries(params), projection: 'full' }));
  await searchProblems('', new URLSearchParams({ ...Object.fromEntries(params), offset: '30' }));
  await searchProblems('', new URLSearchParams({ ...Object.fromEntries(params), origin: 'saved' }));
  assert.equal(calls.length, 4);
  const shared = new URLSearchParams({ scope: 'shared', collection_id: 'c', browse: '1' });
  await searchProblems('', shared); await searchProblems('', shared); assert.equal(calls.length, 6);
  failWrite = true; await assert.rejects(updateProblemStatus('q', 'resolved'));
  await searchProblems('', params); assert.equal(calls.length, 7);
  failWrite = false; await updateProblemStatus('q', 'resolved'); await searchProblems('', params); assert.equal(calls.length, 9);
  await sharingApi('/collections/c/items/e/save', 'POST'); await searchProblems('', params); assert.equal(calls.length, 11);
  questionListCache.setAccount('api-b'); await searchProblems('', params); assert.equal(calls.length, 12);
  questionListCache.invalidate(); await searchProblems('', params); assert.equal(calls.length, 13);
});
