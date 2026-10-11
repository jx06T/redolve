import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['src/services/readerPreferences.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { rememberReaderPreferences: remember, readReaderPreferences: read, resolveReaderPreferences: resolve } =
  await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const params = value => new URLSearchParams(value);

test('reader scopes and accounts remain independent; focus and unrelated URL fields are never remembered', () => {
  remember('extended', 'alice', params('collection_id=c1&q=math&state=starred&saved=no&sort=viewed&list_q=teacher&focus=e1&auth_token=secret'));
  remember('explore', 'alice', params('collection_id=p1&q=physics'));
  assert.equal(read('extended', 'alice').toString(), 'collection_id=c1&q=math&state=starred&saved=no&sort=viewed&list_q=teacher');
  assert.equal(read('explore', 'alice').get('q'), 'physics');
  assert.equal(read('extended', 'bob').size, 0);
});

test('bare reader entry restores filters, but an explicit collection/share link takes precedence', () => {
  const restored = resolve('extended', 'alice', params(''));
  assert.equal(restored.get('collection_id'), 'c1');
  assert.equal(restored.get('saved'), 'no');
  const incoming = resolve('extended', 'alice', params('collection_id=c2&focus=e2'));
  assert.equal(incoming.toString(), 'collection_id=c2&focus=e2');
  assert.equal(incoming.has('state'), false);
  assert.equal(incoming.has('saved'), false);
});

test('clearing filters or choosing all collections remains cleared on reentry', () => {
  remember('explore', 'alice', params(''));
  assert.equal(resolve('explore', 'alice', params('')).size, 0);
  remember('extended', 'alice', params('collection_id=c1&sort=alphabet'));
  assert.equal(resolve('extended', 'alice', params('')).has('q'), false);
  assert.equal(resolve('extended', 'alice', params('')).has('state'), false);
  assert.equal(resolve('extended', 'alice', params('')).has('saved'), false);
});

test('contributing selection restores without losing current filters and honors explicit selection or clearing', () => {
  remember('contributing', 'alice', params('collection_id=shared&topic_id=math'));
  assert.equal(resolve('contributing', 'alice', params('source=contributing&status=unsolved')).toString(),
    'source=contributing&status=unsolved&collection_id=shared');
  assert.equal(resolve('contributing', 'alice', params('collection_id=other')).get('collection_id'), 'other');
  assert.equal(resolve('contributing', 'alice', params('collection_id=')).get('collection_id'), '');
  remember('contributing', 'alice', params('source=contributing'));
  assert.equal(resolve('contributing', 'alice', params('source=contributing')).has('collection_id'), false);
});

test('blocked local storage still supports preference updates and intentional clearing', () => {
  globalThis.localStorage = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
  remember('extended', 'blocked', params('collection_id=c1&q=vector'));
  assert.equal(resolve('extended', 'blocked', params('')).get('q'), 'vector');
  remember('extended', 'blocked', params(''));
  assert.equal(resolve('extended', 'blocked', params('')).size, 0);
});
