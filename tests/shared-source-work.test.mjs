import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { Hono } from 'hono';
import { pathToFileURL } from 'node:url';
import { Miniflare } from 'miniflare';
import { sign } from 'hono/jwt';

test('source authors share canonical work and progress; peers and saved work remain independent',async t=>{
 await mkdir('.wrangler/qa',{recursive:true});const dir=await mkdtemp(resolve('.wrangler/qa/source-sync-'));let mf;
 try{
  const bundle=join(dir,'worker.mjs');await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:bundle,logLevel:'silent'});
  mf=new Miniflare({scriptPath:bundle,modules:true,compatibilityDate:'2025-04-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['STORAGE'],kvNamespaces:['KV'],bindings:{JWT_SECRET:'test-secret'}});
  const db=await mf.getD1Database('DB'),storage=await mf.getR2Bucket('STORAGE');
  async function sqlFile(sql){let statement='',trigger=false;for(const line of sql.replace(/^\s*--[^\r\n]*$/gm,'').split(/\r?\n/)){const text=line.trim();if(!text)continue;if(/^CREATE TRIGGER/i.test(text))trigger=true;statement+=' '+text;if(trigger?/^END;$/i.test(text):text.endsWith(';')){await db.exec(statement);statement='';trigger=false;}}assert.equal(statement,'');}
  const schema=await readFile('worker/schema.sql','utf8');await sqlFile(schema);
  const migration=await readFile('worker/migrations/0006_shared_source_work.sql','utf8');assert.ok(schema.replace(/\r/g,'').includes(migration.replace(/\r/g,'')));
  const tokens={};for(const uid of ['a','b','v']){await db.prepare('INSERT INTO users(id,email) VALUES(?,?)').bind(uid,uid+'@test.example').run();await db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(uid,uid,Math.floor(Date.now()/1000)+3600).run();tokens[uid]=await sign({sub:uid,sid:uid,exp:Math.floor(Date.now()/1000)+3600},'test-secret');await db.prepare('INSERT INTO public_profiles(user_id,display_name) VALUES(?,?)').bind(uid,uid).run();}
  async function call(path,user='a',method='GET',body,etag){if(body&&user==='a'&&path.includes('/collections/')&&/\/layers\/(notes|draw)$/.test(path)&&body.source_item_id===undefined){body={...body,source_item_id:'q',expected_generation:body.expected_generation??1};}
   const r=await mf.dispatchFetch('https://redolve.test/api'+path,{method,headers:{Authorization:'Bearer '+tokens[user],...(body?{'Content-Type':'application/json'}:{}),...(etag?{'If-None-Match':etag}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json().catch(()=>null),etag:r.headers.get('ETag')};}
  const ink=n=>({strokes:[{id:'s'+n,points:[{x:n,y:n}],color:'#000',size:2}],eraserMasks:[],calcSpaceHeight:300});
  for(const [id,uid] of [['q','a'],['peer','b']]){await storage.put(id,new Uint8Array([1,2,3]),{httpMetadata:{contentType:'image/jpeg'}});await db.prepare('INSERT INTO assets(id,storage_key,mime_type) VALUES(?,?,?)').bind(id,id,'image/jpeg').run();await db.prepare("INSERT INTO items(id,user_id,image_url,source,draw_data,typed_notes,status,review_count,draw_seq,notes_seq) VALUES(?,?,?,? ,?,?,'unsolved',2,4,3)").bind(id,uid,id,id,JSON.stringify(ink(1)),'original notes').run();await db.prepare("INSERT INTO asset_refs(id,asset_id,item_id,role) VALUES(?,?,?,'source_image')").bind('source:'+id,id,id).run();}
  for(const id of ['co','second']){await db.prepare("INSERT INTO collections(id,owner_id,title,public_name,visibility,lifecycle,listed) VALUES(?,'a',?,'a','public','active',1)").bind(id,id).run();await db.prepare("INSERT INTO collection_grants(id,collection_id,kind,role,user_id) VALUES(?,?,'user','contributor','b')").bind('grant:'+id,id).run();}
  const joined=await call('/collections/co/items','a','POST',{item_id:'q'});assert.equal(joined.status,201,JSON.stringify(joined.data));const entry=joined.data.entry_id;
  const second=(await call('/collections/second/items','a','POST',{item_id:'q'})).data.entry_id;
  const peer=(await call('/collections/co/items','b','POST',{item_id:'peer'})).data.entry_id;
  const path='/collections/co/items/'+entry,path2='/collections/second/items/'+second;
  const search='/search?scope=shared&contributing=yes&collection_id=co&browse=1&projection=compact';
  await t.test('joining old originals imports live work without copying; viewer switches are independent',async()=>{
   const own=(await call(path)).data;assert.equal(own.layers[0].id,'source:q');assert.equal(own.layers[0].is_source,true);assert.equal(own.layers[0].typed_notes,'original notes');assert.equal(own.layers[0].draw_seq,4);assert.equal(own.progress.review_count,2);assert.deepEqual((await call(path+'/layers/source%3Aq/draw')).data,ink(1));
   assert.equal((await call(path,'b')).data.layers[0].typed_notes,'original notes');assert.equal((await call(path,'v')).data.layers.length,0);assert.equal((await call(path+'/layers/source%3Aq/draw','v')).status,404);
   await db.exec("UPDATE collections SET show_shared_notes=1 WHERE id='co';");const viewer=(await call(path,'v')).data;assert.equal(viewer.layers[0].typed_notes,'original notes');assert.equal(viewer.layers[0].has_draw,false);assert.equal((await call(path+'/layers/source%3Aq/draw','v')).status,404);
   await db.exec("UPDATE collections SET show_shared_ink=1,show_shared_notes=0 WHERE id='co';");assert.equal((await call(path,'v')).data.layers[0].typed_notes,null);assert.deepEqual((await call(path+'/layers/source%3Aq/draw','v')).data,ink(1));
  });
  await t.test('both collection and original writes converge across collections and invalidate conditional cache',async()=>{
   const cached=await call(search);assert.ok(cached.etag);assert.equal((await call(search,'a','GET',undefined,cached.etag)).status,304);
   assert.equal((await call(path+'/layers/notes','a','PUT',{typed_notes:'canonical updated',expected_seq:3,expected_generation:1})).status,200);
   assert.equal((await db.prepare("SELECT typed_notes FROM items WHERE id='q'").first()).typed_notes,'canonical updated');assert.equal((await call(path2)).data.layers[0].typed_notes,'canonical updated');assert.equal((await call(search,'a','GET',undefined,cached.etag)).status,200);
   assert.equal((await call(path+'/layers/draw','a','PUT',{draw_data:ink(2),expected_seq:4,expected_generation:1})).status,200);assert.deepEqual((await call(path2+'/layers/source%3Aq/draw')).data,ink(2));
   assert.equal((await call('/problems/q','a','PUT',{typed_notes:'original updated',expected_notes_seq:4})).status,200);assert.equal((await call(path)).data.layers[0].typed_notes,'original updated');
   assert.equal((await call('/problems/q/draw','a','PATCH',{draw_data:ink(3),vector_clock:{clientId:'original',seq:6}})).status,200);assert.deepEqual((await call(path+'/layers/source%3Aq/draw')).data,ink(3));
   assert.equal((await call(path+'/layers/draw','a','PUT',{draw_data:ink(9),expected_seq:5})).status,409);assert.equal((await call(path+'/layers/notes','a','PUT',{typed_notes:'old client',expected_seq:5,source_item_id:null})).data.error.code,'SOURCE_TARGET_CHANGED');assert.equal((await call(path+'/layers/notes','a','PUT',{typed_notes:'stale',expected_seq:5,expected_generation:99})).status,409);
  });
  await t.test('own progress shares original state; other contributor progress is private',async()=>{
   const ownerTag=(await call(search)).etag,peerTag=(await call(search,'b')).etag;const before=(await call(path)).data.progress;const done=await call(path+'/progress','a','PUT',{action:'resolve',expected_version:before.row_version,expected_generation:1});assert.equal(done.status,200);assert.equal((await call(search,'a','GET',undefined,ownerTag)).status,200);assert.equal((await call(search,'b','GET',undefined,peerTag)).status,304,'author progress does not invalidate peers');assert.equal(done.data.progress.review_count,3);assert.equal((await call(path2)).data.progress.status,'resolved');assert.equal((await db.prepare("SELECT status FROM items WHERE id='q'").first()).status,'resolved');
   const other=await call(path+'/progress','b','PUT',{action:'archive',expected_version:0,expected_generation:1});assert.equal(other.status,200);assert.equal((await call(path,'b')).data.progress.status,'archived');assert.equal((await call(path)).data.progress.status,'resolved');assert.equal((await call(path,'v')).data.progress,undefined);
   assert.equal((await call('/problems/q/status','a','PATCH',{status:'unsolved'})).status,200);assert.equal((await call(path)).data.progress.status,'unsolved');assert.equal((await call(path+'/progress','a','PUT',{action:'archive',expected_version:done.data.progress.row_version,expected_generation:1})).status,409);
   assert.equal((await call(search+'&status=unsolved')).data.items.find(x=>x.id===entry).status,'unsolved');assert.equal((await call(search+'&status=archived','b')).data.items.find(x=>x.id===entry).status,'archived');
   const archived=await call(path+'/progress','a','PUT',{action:'archive',expected_version:(await call(path)).data.progress.row_version,expected_generation:1});assert.equal(archived.data.progress.status,'archived');const restored=await call(path+'/progress','a','PUT',{action:'archive',expected_version:archived.data.progress.row_version,expected_generation:1});assert.equal(restored.data.progress.status,'unsolved');
  });
  await t.test('exclude_self filters both cards and metadata without changing access',async()=>{
   assert.deepEqual((await call(search+'&exclude_self=yes')).data.items.map(x=>x.id),[peer]);assert.deepEqual((await call(search+'&exclude_self=yes&metadata_only=1')).data.items.map(x=>x.id),[peer]);assert.deepEqual((await call(search+'&exclude_self=yes&exclude_archived=yes','b')).data.items.map(x=>x.id),[],'b has archived the only other-author question');
   assert.equal((await call('/search?scope=mine&browse=1&exclude_self=yes')).status,400);assert.equal((await call('/search?scope=public&browse=1&exclude_self=yes')).status,400);
  });
  await t.test('legacy work is preserved; peer writing never overwrites the source',async()=>{
   await db.prepare("INSERT INTO shared_layers(id,entry_id,entry_generation,user_id,author_display,typed_notes) VALUES('legacy',?,1,'a','a','legacy notes')").bind(entry).run();const detail=(await call(path)).data;assert.equal(detail.layers.find(l=>l.id==='legacy').legacy_source,true);assert.equal(detail.layers.find(l=>l.is_source).typed_notes,'original updated');
   assert.equal((await call(path+'/layers/notes','b','PUT',{typed_notes:'peer notes',expected_seq:0})).status,200);assert.equal((await db.prepare("SELECT typed_notes FROM items WHERE id='q'").first()).typed_notes,'original updated');assert.equal((await db.prepare("SELECT typed_notes FROM shared_layers WHERE id='legacy'").first()).typed_notes,'legacy notes');
  });
  await t.test('source change during ink capture leaves no half-saved record or new asset',async()=>{
   const routeBundle=join(dir,'saved.mjs');await build({entryPoints:['worker/routes/saved.ts'],bundle:true,format:'esm',platform:'node',packages:'external',outfile:routeBundle,logLevel:'silent'});
   const {savedRouter}=await import(pathToFileURL(routeBundle));const app=new Hono().route('/api',savedRouter);
   const wrappedStorage={put:async(...args)=>{await storage.put(...args);await db.exec("UPDATE items SET draw_seq=draw_seq+1 WHERE id='q';");},delete:(...args)=>storage.delete(...args)};
   await db.exec("UPDATE collections SET show_shared_ink=1,show_shared_notes=1 WHERE id='co';");
   const res=await app.fetch(new Request('https://redolve.test/api/saved',{method:'POST',headers:{Authorization:'Bearer '+tokens.v,'Content-Type':'application/json'},body:JSON.stringify({entry_id:entry})}),{DB:db,STORAGE:wrappedStorage,JWT_SECRET:'test-secret'},{waitUntil(){}});
   assert.equal(res.status,409,await res.text());assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM saved_refs WHERE user_id='v'").first()).n,0);assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM assets WHERE storage_key LIKE 'saved-source-draw/%'").first()).n,0);assert.equal((await storage.list({prefix:'saved-source-draw/'})).objects.length,0);
  });
  await t.test('saving creates a fixed authorized source layer; refresh preserves personal work and has no false update',async()=>{
   await db.exec("UPDATE collections SET show_shared_ink=1,show_shared_notes=1 WHERE id='co';");const save=await call('/saved','v','POST',{entry_id:entry});assert.equal(save.status,201,JSON.stringify(save.data));const id=save.data.saved_id;
   const saved=(await call('/saved/'+id,'v')).data;assert.equal(saved.layers.find(l=>l.layer_origin_key==='source:q').typed_notes,'original updated');assert.deepEqual((await call('/saved/'+id+'/layers/source%3Aq/draw','v')).data,ink(3));assert.equal((await call('/saved/'+id+'/source-update','v')).data.changed,false);
   assert.equal((await call('/saved/'+id+'/workspace/notes','v','PUT',{typed_notes:'my private work',expected_seq:0})).status,200);
   await call(path+'/layers/notes','a','PUT',{typed_notes:'new live notes',expected_seq:5});assert.equal((await call('/saved/'+id,'v')).data.layers.find(l=>l.layer_origin_key==='source:q').typed_notes,'original updated');assert.equal((await call('/saved/'+id+'/source-update','v')).data.changed,true);
   assert.equal((await call('/saved/'+id+'/refresh-source','v','POST',{})).status,200);assert.equal((await call('/saved/'+id+'/source-update','v')).data.changed,false);assert.equal((await call('/saved/'+id,'v')).data.workspace.typed_notes,'my private work');
   await db.exec("UPDATE collections SET show_shared_notes=0 WHERE id='co';");assert.equal((await call('/saved/'+id+'/source-update','v')).data.changed,true);assert.equal((await call('/saved/'+id+'/refresh-source','v','POST',{})).status,200);assert.equal((await call('/saved/'+id+'/source-update','v')).data.changed,false);assert.equal((await call('/saved/'+id,'v')).data.layers.find(l=>l.layer_origin_key==='source:q').typed_notes,null);
   await db.exec("UPDATE collections SET lifecycle='deleted' WHERE id='co';");assert.equal((await call(path,'v')).status,404);assert.deepEqual((await call('/saved/'+id+'/layers/source%3Aq/draw','v')).data,ink(3));assert.equal((await call('/saved/'+id,'v')).data.workspace.typed_notes,'my private work');
  });
  await t.test('0006 trigger installation is repeatable without altering original work',async()=>{
   const before=await db.prepare("SELECT draw_data,typed_notes,status FROM items WHERE id='q'").first();await sqlFile(migration.replace(/^ALTER TABLE[^;]+;/gm,''));assert.deepEqual(await db.prepare("SELECT draw_data,typed_notes,status FROM items WHERE id='q'").first(),before);assert.equal((await db.prepare('SELECT schema_version FROM collection_search_cache_config').first()).schema_version,2);
  });
 }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});
