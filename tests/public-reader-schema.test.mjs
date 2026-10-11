import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

test('public readers do not require private source progress migration; visibility and access still apply', async () => {
  await mkdir('.wrangler/qa', { recursive: true });
  const dir = await mkdtemp(resolve('.wrangler/qa/public-reader-'));
  let mf;
  try {
    const bundle = join(dir, 'worker.mjs');
    await build({ entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: bundle, logLevel: 'silent' });
    mf = new Miniflare({ scriptPath: bundle, modules: true, compatibilityDate: '2025-04-01', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['STORAGE'], kvNamespaces: ['KV'] });
    const db = await mf.getD1Database('DB');
    // Reproduce the deployed schema before 0006 without its private progress columns.
    const schema = (await readFile('worker/schema.sql', 'utf8')).split('ALTER TABLE items ADD COLUMN progress_seq')[0];
    let statement = '', trigger = false;
    for (const line of schema.replace(/^\uFEFF/, '').replace(/^\s*--[^\r\n]*$/gm, '').split(/\r?\n/)) {
      const text = line.trim();
      if (!text) continue;
      if (/^CREATE TRIGGER/i.test(text)) trigger = true;
      statement += ' ' + text;
      if (trigger ? /^END;$/i.test(text) : text.endsWith(';')) {
        await db.exec(statement); statement = ''; trigger = false;
      }
    }
    assert.equal(statement, '');
    const columns = await db.prepare("SELECT name FROM pragma_table_info('items') WHERE name IN ('progress_seq','previous_status')").all();
    assert.equal(columns.results.length, 0);
    await db.exec("INSERT INTO users(id,email) VALUES('author','author@example.test');");
    await db.exec("INSERT INTO assets(id,storage_key,mime_type) VALUES('image','image','image/jpeg');");
    const ink = { strokes: [], eraserMasks: [], calcSpaceHeight: 300 };
    await db.prepare("INSERT INTO items(id,user_id,image_url,source,draw_data,typed_notes) VALUES('q','author','image','source',?,'author notes')").bind(JSON.stringify(ink)).run();
    await db.exec("INSERT INTO collections(id,owner_id,title,public_name,visibility,lifecycle,listed) VALUES('co','author','Public','Author','public','active',1);");
    await db.exec("INSERT INTO collection_items(id,collection_id,source_item_id,contributor_id,origin_item_key) VALUES('entry','co','q','author','q');");
    const storage = await mf.getR2Bucket('STORAGE');
    await storage.put('image', new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'image/jpeg' } });
    const path = 'https://redolve.test/api/collections/co/items/entry';
    const get = async suffix => {
      const response = await mf.dispatchFetch(path + suffix);
      return { status: response.status, data: await response.json().catch(() => null) };
    };
    let detail = await get('');
    assert.equal(detail.status, 200, JSON.stringify(detail.data));
    assert.equal(detail.data.progress, undefined);
    assert.deepEqual(detail.data.layers, []);
    assert.deepEqual(detail.data.capabilities, { can_contribute: false, can_save: false });
    assert.equal((await mf.dispatchFetch(path + '/image')).status, 200);
    assert.equal((await get('/layers/source%3Aq/draw')).status, 404);
    await db.exec("UPDATE collections SET show_shared_notes=1 WHERE id='co';");
    detail = await get('');
    assert.equal(detail.status, 200);
    assert.equal(detail.data.layers[0].typed_notes, 'author notes');
    assert.equal(detail.data.layers[0].has_draw, false);
    assert.equal((await get('/layers/source%3Aq/draw')).status, 404);
    await db.exec("UPDATE collections SET show_shared_ink=1,show_shared_notes=0 WHERE id='co';");
    detail = await get('');
    assert.equal(detail.status, 200);
    assert.equal(detail.data.layers[0].typed_notes, null);
    assert.equal(detail.data.layers[0].has_draw, true);
    assert.deepEqual((await get('/layers/source%3Aq/draw')).data, ink);
    await db.exec("UPDATE collections SET visibility='restricted',listed=0 WHERE id='co';");
    assert.equal((await get('')).status, 404);
    assert.equal((await mf.dispatchFetch(path + '/image')).status, 404);
    assert.equal((await get('/layers/source%3Aq/draw')).status, 404);
  } finally {
    await mf?.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
