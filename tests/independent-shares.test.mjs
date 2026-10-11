import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,mkdir,mkdtemp,rm } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { sign } from 'hono/jwt';
import { unstable_splitSqlQuery } from 'wrangler';

test('independent shares retain authorized versions without granting collection access',async t=>{
 await mkdir('.wrangler/qa',{recursive:true});const dir=await mkdtemp(resolve('.wrangler/qa/shares-'));let mf;
 try{
  const bundle=join(dir,'worker.mjs');await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:bundle,logLevel:'silent'});
  mf=new Miniflare({scriptPath:bundle,modules:true,compatibilityDate:'2025-04-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['STORAGE'],kvNamespaces:['KV'],bindings:{JWT_SECRET:'share-test',GOOGLE_CLIENT_ID:'test-client'}});
  const db=await mf.getD1Database('DB'),storage=await mf.getR2Bucket('STORAGE');
  const schema=await readFile('worker/schema.sql','utf8'),migration=await readFile('worker/migrations/0007_independent_question_shares.sql','utf8');
  const sql=async text=>{for(const query of unstable_splitSqlQuery(text))await db.exec(query.replace(/\r?\n/g,' '));};
  // Verify existing collections/downloads preserve their previous distribution rights.
  await sql(schema.slice(0,schema.indexOf('-- Existing collections/downloads')));
  const tokens={};for(const uid of ['a','b','v','x']){
   await db.prepare('INSERT INTO users(id,email) VALUES(?,?)').bind(uid,uid+'@example.test').run();
   await db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(uid,uid,Math.floor(Date.now()/1000)+3600).run();
   tokens[uid]=await sign({sub:uid,sid:uid,exp:Math.floor(Date.now()/1000)+3600},'share-test');
   await db.prepare('INSERT INTO public_profiles(user_id,display_name) VALUES(?,?)').bind(uid,'Name '+uid).run();
  }
  const ink=n=>JSON.stringify({strokes:[{id:'s',points:[{x:n,y:n}],color:'#000',size:2}],eraserMasks:[],calcSpaceHeight:300});
  await storage.put('images/source',new Uint8Array([1,2,3]),{httpMetadata:{contentType:'image/jpeg'}});
  await db.exec("INSERT INTO assets(id,storage_key,mime_type) VALUES('image','images/source','image/jpeg');");
  await db.prepare("INSERT INTO items(id,user_id,image_url,source,draw_data,typed_notes,status) VALUES('q','a','image','Original',?,'AUTHOR PRIVATE NOTES','unsolved')").bind(ink(1)).run();
  await db.exec("INSERT INTO asset_refs(id,asset_id,item_id,role) VALUES('root','image','q','source_image');");
  await db.exec("INSERT INTO collections(id,owner_id,title,public_name,visibility,lifecycle) VALUES('legacy','a','Hidden collection','Name a','restricted','active');");
  await db.exec("INSERT INTO collection_items(id,collection_id,source_item_id,contributor_id,origin_item_key) VALUES('old-entry','legacy','q','a','q');");
  await db.exec("INSERT INTO saved_refs(id,user_id,entry_id) VALUES('old-save','v','old-entry');");
  await db.exec("INSERT INTO saved_snapshots(id,saved_ref_id,image_asset_id,source_title,collection_title,provider_public_name,source_content_seq,source_shared_seq) VALUES('old-snapshot','old-save','image','Original','Hidden collection','Name a',1,0);");
  await sql(migration);
  assert.equal((await db.prepare("SELECT allow_reshare FROM collections WHERE id='legacy'").first()).allow_reshare,0);
  assert.equal((await db.prepare("SELECT reshare_allowed FROM saved_snapshots WHERE id='old-snapshot'").first()).reshare_allowed,0);
  assert.ok(schema.replace(/\r/g,'').endsWith(migration.replace(/\r/g,'')));
  const call=async(path,uid='',method='GET',body)=>{
   const response=await mf.dispatchFetch('https://redolve.test'+path,{method,headers:{...(uid?{Authorization:'Bearer '+tokens[uid]}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
   return {status:response.status,data:await response.json().catch(()=>null),headers:response.headers};
  };
  let co,entry,saved,retainedSaved,ownedToken,savedToken,sharedToken;
  await t.test('new public and private collections default on; creators can turn it off',async()=>{
   for(const visibility of ['public','restricted','link']){
    const result=await call('/api/my/collections','a','POST',{title:visibility,public_name:'Name a',visibility,activate:true});assert.equal(result.status,201,JSON.stringify(result.data));
    assert.equal((await call('/api/collections/'+result.data.id,'a')).data.collection.allow_reshare,1);
    if(visibility==='restricted')co=result.data.id;
   }
   const off=await call('/api/my/collections','a','POST',{title:'off',public_name:'Name a',visibility:'restricted',activate:true,allow_reshare:false});assert.equal((await call('/api/collections/'+off.data.id,'a')).data.collection.allow_reshare,0);
   for(const [uid,role] of [['b','contributor'],['v','viewer']])await db.prepare("INSERT INTO collection_grants(id,collection_id,kind,role,user_id) VALUES(?,?,'user',?,?)").bind(uid,co,role,uid).run();
   entry=(await call('/api/collections/'+co+'/items','a','POST',{item_id:'q'})).data.entry_id;
  });
  await t.test('all three sources use fixed single-question links and own work only',async()=>{
   const own=await call('/api/problems/q/share','a','POST',{allow_ink:true,allow_notes:true});assert.equal(own.status,201,JSON.stringify(own.data));ownedToken=own.data.token;
   const shared=await call(`/api/collections/${co}/items/${entry}/share`,'b','POST',{});assert.equal(shared.status,201,JSON.stringify(shared.data));sharedToken=shared.data.token;
   const peer=await call('/share/'+sharedToken);assert.equal(peer.status,200);assert.equal(peer.data.item.typed_notes,null);assert.equal(peer.data.item.draw_data,null,'author ink never automatically redistributed by a peer');
   await call(`/api/collections/${co}/items/${entry}/layers/notes`,'b','PUT',{typed_notes:'MY SHARED NOTES',expected_seq:0});
   const withNotes=await call(`/api/collections/${co}/items/${entry}/share`,'b','POST',{});assert.equal((await call('/share/'+withNotes.data.token)).data.item.typed_notes,'MY SHARED NOTES');
   saved=(await call('/api/saved','v','POST',{entry_id:entry})).data.saved_id;assert.ok(saved);
   assert.equal((await call('/api/saved/'+saved,'v')).data.capabilities.can_create_share,true);
   await call(`/api/saved/${saved}/workspace/notes`,'v','PUT',{typed_notes:'MY PRIVATE NOTES',expected_seq:0});
   const mine=await call(`/api/saved/${saved}/share`,'v','POST',{});assert.equal(mine.status,201,JSON.stringify(mine.data));savedToken=mine.data.token;
   const view=await call('/share/'+savedToken);assert.equal(view.status,200);assert.equal(view.data.item.typed_notes,'MY PRIVATE NOTES');assert.equal(view.data.item.draw_data,null);
   assert.deepEqual(Object.keys(view.data.origin).sort(),['access_hint','can_visit','kind','provider_name']);assert.equal(view.data.origin.can_visit,false);
   assert.ok(!JSON.stringify(view.data).includes(co),'private collection ID must not leak');
   assert.equal(view.headers.get('Referrer-Policy'),'no-referrer');assert.equal(view.headers.get('Cache-Control'),'no-store');
   assert.equal((await mf.dispatchFetch('https://redolve.test/share/'+savedToken+'/image')).status,200);
   const access=(await call('/share/'+savedToken,'v')).data.origin;assert.equal(access.can_visit,true);assert.ok(access.url.includes(co));
   assert.equal((await call('/api/subscriptions','v')).data.subscriptions.length,0,'independent sharing does not subscribe');
   assert.equal((await call('/api/collections/'+co,'x')).status,404);
   assert.equal((await call(`/api/saved/${saved}/share`,'x','POST',{})).status,404);
   assert.equal((await call('/api/problems/q/share','x','POST',{})).status,404);
   assert.equal((await call(`/api/collections/${co}/items/${entry}/share`,'x','POST',{})).status,404);
   await db.prepare("INSERT INTO collection_grants(id,collection_id,kind,role,user_id) VALUES('temporary',?,'user','viewer','x')").bind(co).run();
   retainedSaved=(await call('/api/saved','x','POST',{entry_id:entry})).data.saved_id;assert.ok(retainedSaved);
   await db.exec("UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP WHERE id='temporary';");
   assert.equal((await call(`/api/saved/${retainedSaved}/share`,'x','POST',{})).status,201,'already acquired version can share after source revocation');
   assert.equal((await call('/api/problems/q/share','a','POST',{allow_ink:'false'})).status,400);
   const omitted=await call('/api/problems/q/share','a','POST',{allow_ink:false,allow_notes:false});const om=(await call('/share/'+omitted.data.token)).data.item;assert.equal(om.draw_data,null);assert.equal(om.typed_notes,null);
   assert.equal((await call('/api/problems/q/share','a','POST',{allow_ink:true,allow_notes:true})).data.token,ownedToken,'same fixed content reuses token');
  });
  await t.test('permission is acquired at save/refresh; source changes never alter old links',async()=>{
   const detail=(await call('/api/collections/'+co,'a')).data.collection;
   assert.equal((await call('/api/collections/'+co,'a','PATCH',{expected_version:detail.row_version,allow_reshare:false})).status,200);
   assert.equal((await call(`/api/collections/${co}/items/${entry}/share`,'b','POST',{})).status,403);
   assert.equal((await call(`/api/saved/${saved}/share`,'v','POST',{})).status,201,'acquired permission remains');
   const update=await call(`/api/saved/${saved}/source-update`,'v');assert.equal(update.data.changed,true);assert.ok(update.data.changes.includes('再分享授權已變更'));
   assert.equal((await call(`/api/saved/${saved}/refresh-source`,'v','POST',{})).status,200);
   assert.equal((await call(`/api/saved/${saved}/share`,'v','POST',{})).status,403,'newly acquired version follows current permission');
   assert.equal((await call('/share/'+savedToken)).status,200,'previously created link survives new permission');
   await db.exec("UPDATE items SET typed_notes='UPDATED',draw_data=NULL,notes_seq=notes_seq+1,draw_seq=draw_seq+1 WHERE id='q';");
   assert.equal((await call('/share/'+ownedToken)).data.item.typed_notes,'AUTHOR PRIVATE NOTES');assert.deepEqual(JSON.parse((await call('/share/'+ownedToken)).data.item.draw_data),JSON.parse(ink(1)));
   await db.prepare("UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP WHERE collection_id=? AND user_id='v'").bind(co).run();
   assert.equal((await call(`/api/collections/${co}/items/${entry}/share`,'v','POST',{})).status,404);
   assert.equal((await call('/share/'+savedToken,'v')).data.origin.can_visit,false);
   await db.prepare("UPDATE collections SET lifecycle='deleted' WHERE id=?").bind(co).run();
   assert.equal((await call('/share/'+savedToken)).data.origin.access_hint,'source_unavailable');
   assert.equal((await call('/api/saved/'+saved,'v','DELETE')).status,200);
   assert.equal((await call('/api/problems/q','a','DELETE')).status,200);
   for(const token of [ownedToken,savedToken,sharedToken])assert.equal((await call('/share/'+token)).status,200);
   assert.ok((await call('/api/me/question-shares','v')).data.shares.some(row=>row.token===savedToken),'deleted source remains revocable');
   assert.equal((await call(`/api/saved/${retainedSaved}/share`,'x','POST',{})).status,201,'acquired version survives deleted source');
   assert.ok((await db.prepare("SELECT COUNT(*) AS n FROM asset_reference_inventory WHERE asset_id='image'").first()).n>0);
   await assert.rejects(db.exec("DELETE FROM assets WHERE id='image';"),/FOREIGN KEY/);
  });
  await t.test('only the sharer can revoke; expiry, quarantine, and refs fail closed',async()=>{
   await call('/api/me/question-shares/'+savedToken,'x','DELETE');assert.equal((await call('/share/'+savedToken)).status,200);
   await call('/api/me/question-shares/'+savedToken,'v','DELETE');assert.equal((await call('/share/'+savedToken)).status,404);assert.equal((await mf.dispatchFetch('https://redolve.test/share/'+savedToken+'/image')).status,404);
   assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM share_asset_refs WHERE token=?').bind(savedToken).first()).n,0);
   await db.prepare("UPDATE independent_shares SET expires_at='2000-01-01' WHERE token=?").bind(sharedToken).run();
   assert.equal((await call('/share/'+sharedToken)).status,410);assert.equal((await mf.dispatchFetch('https://redolve.test/share/'+sharedToken+'/image')).status,410);
   assert.equal((await call('/api/me/question-shares/expired','b','DELETE')).data.removed,1);
   await db.exec("UPDATE assets SET state='quarantined' WHERE id='image';");assert.equal((await call('/share/'+ownedToken)).status,410);assert.equal((await mf.dispatchFetch('https://redolve.test/share/'+ownedToken+'/image')).status,410);
   await db.exec("UPDATE assets SET state='ready' WHERE id='image';");
   assert.equal((await call('/api/me/question-shares?cursor=invalid','a')).status,400);
  });
  await t.test('legacy link compatibility and OAuth safe return paths',async()=>{
   await db.exec("INSERT INTO items(id,user_id,image_url,source) VALUES('legacyq','a','image','Legacy'); INSERT INTO shares(token,item_id,user_id,allow_ink,allow_notes) VALUES('oldtoken','legacyq','a',0,0);");
   assert.equal((await call('/share/oldtoken')).status,200);assert.equal((await mf.dispatchFetch('https://redolve.test/share/oldtoken/image')).status,200,'legacy asset ids resolve to storage keys');
   const oauth=await call('/api/auth/google/url?return_to='+encodeURIComponent('/share/'+ownedToken));
   assert.ok(oauth.headers.get('Set-Cookie').includes('rdv_oauth_path=%2Fshare%2F'));
   const cookies=oauth.headers.getSetCookie().map(s=>s.split(';')[0]).join('; '),state=new URL(oauth.data.url).searchParams.get('state');
   const callback=await mf.dispatchFetch('https://redolve.test/api/auth/callback/google?error=access_denied&state='+state,{headers:{Cookie:cookies},redirect:'manual'});
   assert.ok(callback.headers.get('Location').startsWith('https://redolve.test/share/'+ownedToken+'?'));
   const bad=await call('/api/auth/google/url?return_to='+encodeURIComponent('//attacker.example/share/token'));assert.match(bad.headers.get('Set-Cookie'),/rdv_oauth_path=%2F;/);
  });
  await t.test('capture races leave no half share; owner lists use stable pagination',async()=>{
   await db.prepare("UPDATE items SET draw_data=?,typed_notes='race',draw_seq=draw_seq+1 WHERE id='legacyq'").bind(ink(3)).run();
   const routeBundle=join(dir,'sharing.mjs');await build({entryPoints:['worker/services/questionSharing.ts'],bundle:true,format:'esm',platform:'node',packages:'external',outfile:routeBundle,logLevel:'silent'});
   const {createQuestionShare}=await import(pathToFileURL(routeBundle));
   const wrapped={prepare(query){return db.prepare(query);},batch:async statements=>{await db.exec("UPDATE items SET notes_seq=notes_seq+1 WHERE id='legacyq';");return db.batch(statements);}};
   const before=(await db.prepare('SELECT COUNT(*) AS n FROM independent_shares').first()).n;
   await assert.rejects(createQuestionShare({DB:wrapped,STORAGE:storage},'a',{kind:'owned',id:'legacyq'},{allow_ink:false}),e=>e.code==='SOURCE_CHANGED');
   assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM independent_shares').first()).n,before);
   assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM independent_shares s LEFT JOIN share_asset_refs r ON r.token=s.token WHERE r.token IS NULL').first()).n,0);
   assert.equal((await call('/api/problems/legacyq/share','a','POST',{expires_at:'bad'})).status,400);
   const template=await db.prepare('SELECT * FROM independent_shares WHERE token=?').bind(ownedToken).first();
   for(let n=0;n<55;n++){await db.prepare(`INSERT INTO independent_shares(token,user_id,origin_kind,origin_key,image_asset_id,source,content_hash,allow_ink,allow_notes) VALUES(?,'a','owned','history','image','Test','test',0,0)`).bind('page'+String(n).padStart(2,'0')).run();}
   const first=(await call('/api/me/question-shares','a')).data;assert.equal(first.shares.length,50);assert.ok(first.next_cursor);
   const next=(await call('/api/me/question-shares?cursor='+encodeURIComponent(first.next_cursor),'a')).data;
   assert.equal(new Set([...first.shares,...next.shares].map(row=>row.token)).size,first.shares.length+next.shares.length);
   assert.equal(template.image_asset_id,'image');
  });
 }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});
