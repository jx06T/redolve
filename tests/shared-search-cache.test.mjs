import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { Miniflare } from 'miniflare';

test('shared conditional search validates current access and all result dependencies', async t => {
  await mkdir('.wrangler/qa', { recursive: true });
  const dir = await mkdtemp(resolve('.wrangler/qa/shared-cache-'));
  let mf;
  try {
    const bundle = join(dir, 'router.mjs');
    await build({ entryPoints: ['worker/routes/search.ts'], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'silent' });
    const { searchRouter } = await import(pathToFileURL(bundle));
    const app = new Hono().route('/search', searchRouter);
    mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: '2025-04-01', d1Databases: ['DB'] });
    const db = await mf.getD1Database('DB');
    const schema = await readFile('worker/schema.sql', 'utf8');
    const migration = await readFile('worker/migrations/0005_shared_search_cache.sql', 'utf8');
    assert.ok(schema.replace(/\r/g, '').includes(migration.replace(/\r/g, '').trimEnd()), 'fresh schema must match migration');
    async function sqlFile(sql) {
      let statement = '', trigger = false;
      for (const line of sql.replace(/^\uFEFF/, '').replace(/^\s*--[^\r\n]*$/gm, '').split(/\r?\n/)) {
        const text = line.trim(); if (!text) continue;
        if (/^CREATE TRIGGER/i.test(text)) trigger = true;
        statement += ' ' + text;
        if (trigger ? /^END;$/i.test(text) : text.endsWith(';')) { await db.exec(statement); statement = ''; trigger = false; }
      }
      assert.equal(statement, '');
    }
    await sqlFile(schema);
    const tokens = {};
    for (const user of ['a','b','c']) {
      await db.prepare('INSERT INTO users(id,email) VALUES(?,?)').bind(user, user+'@example.test').run();
      tokens[user] = await sign({ sub: user, sid: user, exp: Math.floor(Date.now()/1000)+3600 }, 'test-secret');
    }
    await db.exec("INSERT INTO taxonomies(id,label,level) VALUES('math','Math',0); INSERT INTO collections(id,owner_id,title,public_name,lifecycle,visibility) VALUES('co','a','Collection','Author','active','restricted'); INSERT INTO collection_grants(id,collection_id,kind,role,user_id) VALUES('gb','co','user','contributor','b'),('gc','co','user','contributor','c');");
    const batches = [];
    for (let i=0;i<219;i++) {
      const id='q'+String(i).padStart(4,'0');
      batches.push(db.prepare("INSERT INTO assets(id,storage_key) VALUES(?,?)").bind(id,id));
      batches.push(db.prepare("INSERT INTO items(id,user_id,image_url,source,topic_id,keywords) VALUES(?,'a',?,'Vector exercise','math','[\"vector\"]')").bind(id,id));
      batches.push(db.prepare("INSERT INTO collection_items(id,collection_id,source_item_id,contributor_id,origin_item_key) VALUES(?,'co',?,'a',?)").bind(id,id,id));
    }
    for(let i=0;i<batches.length;i+=50) await db.batch(batches.slice(i,i+50));
    const profile=[];
    const DB={prepare(sql) {
      let args=[];
      const execute=async()=>{const r=await db.prepare(sql).bind(...args).all();profile.push({sql,...r.meta});return r;};
      return {bind(...values){args=values;return this;},
        async first(){if(sql.includes('auth_sessions'))return{id:'session'};if(sql.startsWith('SELECT email FROM users'))return{email:'test@example.test'};return(await execute()).results[0]||null;},
        all:execute};
    }};
    const params='scope=shared&contributing=yes&collection_id=co&browse=1&projection=compact';
    async function request(tag,user='b',extra='') {
      profile.length=0;
      const r=await app.fetch(new Request('https://test/search?'+params+extra,{headers:{...(user?{Authorization:'Bearer '+tokens[user]}:{}),...(tag?{'If-None-Match':tag}:{})}}),{DB,JWT_SECRET:'test-secret'});
      const data=r.status===304?null:await r.json();
      return {status:r.status,tag:r.headers.get('ETag'),version:r.headers.get('X-Redolve-Collection-Version'),data,queries:[...profile]};
    }
    let current;
    await t.test('repeatable migration, indexed validator and no full list on 304',async()=>{
      const revision=await db.prepare("SELECT revision FROM collection_search_versions WHERE collection_id='co'").first('revision');
      await sqlFile(migration);
      await db.exec('UPDATE collection_search_cache_config SET schema_version=2,ready=1 WHERE id=1;');
      assert.equal(await db.prepare("SELECT revision FROM collection_search_versions WHERE collection_id='co'").first('revision'),revision);
      assert.equal(await db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE 'search_version_%'").first('n'),28);
      current=await request();assert.equal(current.status,200);assert.equal(current.data.items.length,30);assert.ok(current.tag);
      const fullReads=current.queries.reduce((n,q)=>n+q.rows_read,0);
      const reuse=await request(current.tag);assert.equal(reuse.status,304);assert.equal(reuse.queries.length,1);
      assert.ok(!reuse.queries[0].sql.includes('shared_layers'));
      const validatorReads=reuse.queries[0].rows_read;
      assert.ok(validatorReads<30);assert.ok(validatorReads<fullReads);
      console.log('Shared compact first page: '+fullReads+' rows; unchanged validation: '+validatorReads+' rows (auth excluded)');
      assert.equal((await request(current.tag,'c')).status,200,'account-specific');
      for(const extra of ['&tag=vector','&offset=30','&projection=full','&metadata_only=1','&q=Vector'])assert.equal((await request(current.tag,'b',extra)).status,200,'query-specific '+extra);
    });
    async function changed(sql) {
      await db.exec(sql);
      const next=await request(current.tag);
      assert.equal(next.status,200,sql);assert.ok(next.tag);assert.notEqual(next.tag,current.tag,sql);
      current=next;
    }
    await t.test('source metadata, taxonomy, authors, layers, image state and entry generation invalidate',async()=>{
      await changed("UPDATE items SET keywords='[\"changed\"]',content_seq=content_seq+1 WHERE id='q0218';");
      await changed("UPDATE taxonomies SET label='New math' WHERE id='math';");
      await changed("INSERT INTO public_profiles(user_id,display_name) VALUES('a','New author');");
      await changed("UPDATE public_profiles SET display_name='Renamed author' WHERE user_id='a';");
      await changed("INSERT INTO shared_layers(id,entry_id,entry_generation,user_id,author_display,typed_notes) VALUES('layer','q0218',1,'c','C','new notes');");
      await changed("UPDATE shared_layers SET typed_notes='changed notes' WHERE id='layer';");
      await changed("DELETE FROM shared_layers WHERE id='layer';");
      await changed("UPDATE assets SET state='quarantined' WHERE id='q0218';");
      assert.ok(!current.data.items.some(i=>i.id==='q0218'));
      await changed("UPDATE assets SET state='ready' WHERE id='q0218';");
      await changed("UPDATE collection_items SET state='removed' WHERE id='q0218';");
      await changed("UPDATE collection_items SET state='included',generation=generation+1 WHERE id='q0218';");
      await changed("UPDATE collections SET title='Renamed collection' WHERE id='co';");
    });
    await t.test('personal progress and saved presence invalidate only the affected user',async()=>{
      const other=await request(null,'c');
      await changed("INSERT INTO collection_item_progress(user_id,entry_id,status) VALUES('b','q0218','resolved');");
      assert.equal(current.data.items.find(i=>i.id==='q0218').status,'resolved');
      assert.equal((await request(other.tag,'c')).status,304);
      await changed("UPDATE collection_item_progress SET status='archived',review_count=1 WHERE user_id='b' AND entry_id='q0218';");
      const filtered=await request(null,'b','&exclude_archived=yes');
      assert.ok(!filtered.data.items.some(i=>i.id==='q0218'));
      await changed("DELETE FROM collection_item_progress WHERE user_id='b' AND entry_id='q0218';");
      await changed("INSERT INTO saved_refs(id,user_id,entry_id) VALUES('saved','b','q0218');");
      assert.equal(current.data.items.find(i=>i.id==='q0218').saved_id,'saved');
      assert.equal((await request(other.tag,'c')).status,304);
      await changed("DELETE FROM saved_refs WHERE id='saved';");
    });
    await t.test('natural grant expiry changes validation even with no intervening write',async()=>{
      await changed("UPDATE collection_grants SET expires_at=datetime('now','+2 seconds') WHERE id='gc';");
      const before=current.tag;
      await new Promise(r=>setTimeout(r,2100));
      current=await request(before);assert.equal(current.status,200);assert.notEqual(current.tag,before);
      assert.equal((await request(null,'c')).tag,null);
    });
    await t.test('revocation never grants a 304; public/viewer/subscription paths stay uncached',async()=>{
      await changed("UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP WHERE id='gc';");
      await db.exec("UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP WHERE id='gb';");
      const revoked=await request(current.tag);assert.equal(revoked.status,200);assert.equal(revoked.tag,null);assert.deepEqual(revoked.data.items,[]);
      assert.equal((await request(current.tag,null)).status,400);
      await db.exec("UPDATE collection_grants SET revoked_at=NULL WHERE id='gb';");
      current=await request();
      const subscriber=await request(current.tag,'b','&subscribed=yes');assert.equal(subscriber.status,200);assert.equal(subscriber.tag,null);
      const r=await app.fetch(new Request('https://test/search?scope=shared&collection_id=co&browse=1',{headers:{Authorization:'Bearer '+tokens.b,'If-None-Match':current.tag}}),{DB,JWT_SECRET:'test-secret'});
      assert.equal(r.status,200);assert.equal(r.headers.get('ETag'),null);
    });
    await t.test('missing or incomplete migration falls back safely to full queries',async()=>{
      await db.exec("UPDATE collection_search_cache_config SET ready=0 WHERE id=1;");
      const disabled=await request(current.tag);assert.equal(disabled.status,200);assert.equal(disabled.tag,null);assert.equal(disabled.data.items.length,30);
      await db.exec("DROP TABLE collection_search_cache_config;");
      const missing=await request(current.tag);assert.equal(missing.status,200);assert.equal(missing.tag,null);assert.equal(missing.data.items.length,30);
    });
  } finally {if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
