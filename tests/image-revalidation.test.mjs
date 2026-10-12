import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { sign } from 'hono/jwt';
import { unstable_splitSqlQuery } from 'wrangler';

test('image revalidation saves bytes without bypassing current access or asset checks', async t => {
  await mkdir('.wrangler/qa', { recursive: true });
  const dir = await mkdtemp(resolve('.wrangler/qa/image-cache-'));
  let mf, server;
  try {
    const bundle = join(dir, 'worker.mjs');
    await build({ entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: bundle, logLevel: 'silent' });
    mf = new Miniflare({ scriptPath: bundle, modules: true, compatibilityDate: '2025-04-01', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['STORAGE'], kvNamespaces: ['KV'], bindings: { JWT_SECRET: 'image-cache-test' } });
    const db = await mf.getD1Database('DB'), storage = await mf.getR2Bucket('STORAGE');
    for (const sql of unstable_splitSqlQuery(await readFile('worker/schema.sql', 'utf8'))) await db.exec(sql.replace(/\r?\n/g, ' '));
    const tokens = {};
    for (const uid of ['a', 'v', 'x']) {
      await db.prepare('INSERT INTO users(id,email) VALUES(?,?)').bind(uid, uid + '@test.example').run();
      await db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(uid, uid, Math.floor(Date.now() / 1000) + 3600).run();
      tokens[uid] = await sign({ sub: uid, sid: uid, exp: Math.floor(Date.now() / 1000) + 3600 }, 'image-cache-test');
    }
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=', 'base64');
    await storage.put('images/source.png', png, { httpMetadata: { contentType: 'image/png' } });
    await db.exec(`INSERT INTO assets(id,storage_key,mime_type) VALUES('asset','images/source.png','image/png');
      INSERT INTO items(id,user_id,image_url,source,status) VALUES('q','a','asset','題目','unsolved');
      INSERT INTO asset_refs(id,asset_id,item_id,role) VALUES('source','asset','q','source_image');
      INSERT INTO collections(id,owner_id,title,public_name,visibility,lifecycle,listed) VALUES('co','a','題目集','作者','public','active',1);
      INSERT INTO collection_items(id,collection_id,source_item_id,contributor_id,origin_item_key) VALUES('entry','co','q','a','q');
      INSERT INTO collection_grants(id,collection_id,kind,role,user_id) VALUES('viewer','co','user','viewer','v');
      INSERT INTO shares(token,item_id,user_id) VALUES('legacy','q','a');`);
    const call = (path, uid = '', etag, method = 'GET', body) => mf.dispatchFetch('https://redolve.test' + path, {
      method, headers: { ...(uid ? { Authorization: 'Bearer ' + tokens[uid] } : {}), ...(etag ? { 'If-None-Match': etag } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    const savedResponse = await call('/api/saved', 'v', undefined, 'POST', { entry_id: 'entry' });
    assert.equal(savedResponse.status, 201); const saved = (await savedResponse.json()).saved_id;
    const shareResponse = await call('/api/problems/q/share', 'a', undefined, 'POST', {});
    assert.equal(shareResponse.status, 201); const token = (await shareResponse.json()).token;
    const collectionPath = '/api/collections/co/items/entry/image';
    const paths = [['/api/problems/q/image', 'a'], [collectionPath, ''], ['/api/saved/' + saved + '/image', 'v'], ['/share/' + token + '/image', ''], ['/share/legacy/image', '']];
    let validator;
    await t.test('all image routes expose private validators; unchanged responses have no body', async () => {
      for (const [path, user] of paths) {
        const first = await call(path, user); assert.equal(first.status, 200, path);
        assert.equal(first.headers.get('cache-control'), 'private, no-cache');
        assert.match(first.headers.get('vary'), /Cookie/); assert.match(first.headers.get('vary'), /Authorization/);
        assert.equal(first.headers.get('content-type'), 'image/png');
        assert.deepEqual(Buffer.from(await first.arrayBuffer()), png);
        const etag = first.headers.get('etag'); assert.match(etag, /^".*"$/); validator = etag;
        for (const condition of [etag, 'W/' + etag, '"other", ' + etag, '*']) {
          const unchanged = await call(path, user, condition);
          assert.equal(unchanged.status, 304, path + ' ' + condition); assert.equal(await unchanged.text(), '');
          assert.equal(unchanged.headers.get('cache-control'), 'private, no-cache'); assert.equal(unchanged.headers.get('etag'), etag);
        }
        const modified = await call(path, user, '"old"'); assert.equal(modified.status, 200); assert.deepEqual(Buffer.from(await modified.arrayBuffer()), png);
      }
      const metadata = await call('/api/collections/co/items/entry');
      assert.equal(metadata.headers.get('cache-control'), 'no-store'); await metadata.text();
    });
    await t.test('switching account, withdrawing public access and revoking a grant never return 304', async () => {
      for (const [path, user, status] of [['/api/problems/q/image', '', 401], ['/api/problems/q/image', 'x', 403], ['/api/saved/' + saved + '/image', 'x', 404]]) {
        const denied = await call(path, user, validator); assert.equal(denied.status, status); assert.equal(denied.headers.get('cache-control'), 'no-store'); await denied.text();
      }
      await db.exec("UPDATE collections SET visibility='restricted',listed=0 WHERE id='co';");
      assert.equal((await call(collectionPath, '', validator)).status, 404);
      assert.equal((await call(collectionPath, 'v', validator)).status, 304);
      await db.exec("UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP WHERE id='viewer';");
      const denied = await call(collectionPath, 'v', validator); assert.equal(denied.status, 404); assert.equal(denied.headers.get('cache-control'), 'no-store');
      assert.equal((await call('/api/saved/' + saved + '/image', 'v', validator)).status, 304, 'downloaded copy remains available');
      await db.exec("UPDATE collections SET visibility='public',lifecycle='draft' WHERE id='co';");
      assert.equal((await call(collectionPath, '', validator)).status, 404);
      await db.exec("UPDATE collections SET lifecycle='active' WHERE id='co'; UPDATE collection_items SET state='removed' WHERE id='entry';");
      assert.equal((await call(collectionPath, '', validator)).status, 404);
      await db.exec("UPDATE collection_items SET state='included' WHERE id='entry';");
    });
    await t.test('quarantined assets, missing objects and expired shares cannot reuse a cached image', async () => {
      await db.exec("UPDATE assets SET state='quarantined' WHERE id='asset';");
      for (const [path, user] of paths) {
        const response = await call(path, user, validator); assert.notEqual(response.status, 304); assert.ok(response.status >= 400, path); assert.equal(response.headers.get('cache-control'), 'no-store'); await response.text();
      }
      await db.exec("UPDATE assets SET state='ready' WHERE id='asset'; UPDATE independent_shares SET expires_at='2000-01-01' WHERE token='" + token + "'; UPDATE shares SET expires_at='2000-01-01' WHERE token='legacy';");
      for (const path of ['/share/' + token + '/image', '/share/legacy/image']) assert.equal((await call(path, '', validator)).status, 410);
      await storage.delete('images/source.png'); const missing = await call(collectionPath, '', validator);
      assert.equal(missing.status, 503); assert.equal(missing.headers.get('cache-control'), 'no-store');
    });
    await t.test('actual R2 content changes invalidate the validator', async () => {
      const updated = Buffer.from('changed-image'); await storage.put('images/source.png', updated, { httpMetadata: { contentType: 'image/png' } });
      const response = await call(collectionPath, '', validator); assert.equal(response.status, 200); assert.notEqual(response.headers.get('etag'), validator); assert.deepEqual(Buffer.from(await response.arrayBuffer()), updated);
    });

    // Optional real-browser harness. No Playwright routing: browser HTTP cache stays enabled.
    if (process.env.IMAGE_CACHE_BROWSER_URL_FILE) {
      await storage.put('images/source.png', png, { httpMetadata: { contentType: 'image/png' } });
      const records = []; let finish;
      const complete = new Promise(resolve => { finish = resolve; });
      server = createServer(async (req, res) => {
        if (req.url === '/cache-test') { res.setHeader('Content-Type', 'text/html'); res.end(`<div id="images"></div><script>async function mount(){images.replaceChildren();const img=new Image();const done=new Promise((resolve,reject)=>{img.onload=()=>resolve(img.naturalWidth);img.onerror=reject});img.src=${JSON.stringify(collectionPath)};images.append(img);return done}</script>`); return; }
        if (req.url === '/metrics') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(records)); return; }
        if (req.url === '/withdraw') { await db.exec("UPDATE collections SET visibility='restricted',listed=0 WHERE id='co';"); res.end('ok'); return; }
        if (req.url === '/finish') { res.end('ok'); finish(); return; }
        try {
          const response = await mf.dispatchFetch('https://redolve.test' + req.url, { headers: req.headers });
          const body = Buffer.from(await response.arrayBuffer());
          if (req.url === collectionPath) records.push({ status: response.status, bytes: body.length, validator: req.headers['if-none-match'] || '' });
          res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(body);
        } catch (error) { res.writeHead(500); res.end(String(error)); }
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      await writeFile(process.env.IMAGE_CACHE_BROWSER_URL_FILE, 'http://127.0.0.1:' + server.address().port);
      await complete; await new Promise(resolve => server.close(resolve)); server = undefined;
    }
  } finally { server?.close(); await mf?.dispose(); await rm(dir, { recursive: true, force: true }); }
});
