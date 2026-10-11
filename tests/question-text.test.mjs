import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {sign} from 'hono/jwt';
import {unstable_splitSqlQuery} from 'wrangler';

test('copy uses full authorized OCR and retains downloaded text',async t=>{
 await mkdir('.wrangler/qa',{recursive:true});const dir=await mkdtemp(resolve('.wrangler/qa/question-text-'));let mf;
 try{
  const bundle=join(dir,'worker.mjs');await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:bundle,logLevel:'silent'});
  mf=new Miniflare({scriptPath:bundle,modules:true,compatibilityDate:'2025-04-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['STORAGE'],kvNamespaces:['KV'],bindings:{JWT_SECRET:'text-test'}});
  const db=await mf.getD1Database('DB');
  const sql=async text=>{for(const query of unstable_splitSqlQuery(text.replace(/^\s*--[^\r\n]*$/gm,'')))await db.exec(query.replace(/\r?\n/g,' '));};
  const schema=await readFile('worker/schema.sql','utf8'),migration=await readFile('worker/migrations/0008_saved_question_text.sql','utf8');
  assert.ok(schema.replace(/\r/g,'').endsWith(migration.replace(/\r/g,'')));
  await sql(schema.slice(0,schema.indexOf('-- Retain full OCR')));
  const tokens={};for(const uid of ['author','viewer','other']){
   await db.prepare('INSERT INTO users(id,email) VALUES(?,?)').bind(uid,uid+'@example.test').run();
   await db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(uid,uid,Math.floor(Date.now()/1000)+3600).run();
   tokens[uid]=await sign({sub:uid,sid:uid,exp:Math.floor(Date.now()/1000)+3600},'text-test');
   await db.prepare('INSERT INTO public_profiles(user_id,display_name) VALUES(?,?)').bind(uid,uid).run();
  }
  await db.exec("INSERT INTO taxonomies(id,label,level) VALUES('math','數學',0); INSERT INTO collections(id,owner_id,title,public_name,visibility,lifecycle) VALUES('co','author','資訊不是內文','author','public','active');");
  const full='計算題目內文\n'+('α + β = 42\n'.repeat(400));
  for(const id of ['q','empty','changed','deleted']){
   await db.prepare("INSERT INTO assets(id,storage_key,mime_type) VALUES(?,?,'image/jpeg')").bind(id,id).run();
   await db.prepare("INSERT INTO items(id,user_id,image_url,source,topic_id,status,typed_notes) VALUES(?,'author',?,'資訊標籤','math','unsolved','私人筆記不是內文')").bind(id,id).run();
   await db.prepare("INSERT INTO collection_items(id,collection_id,source_item_id,contributor_id,origin_item_key) VALUES(?,'co',?,'author',?)").bind(id,id,id).run();
   if(id!=='empty')await db.prepare("INSERT INTO items_fts(id,user_id,problem_text) VALUES(?,'author',?)").bind(id,full).run();
   if(id!=='empty'){
    await db.prepare("INSERT INTO saved_refs(id,user_id,entry_id) VALUES(?,'viewer',?)").bind('old-'+id,id).run();
    await db.prepare("INSERT INTO saved_snapshots(id,saved_ref_id,image_asset_id,source_title,collection_title,provider_public_name,source_content_seq,source_shared_seq) VALUES(?,?,?,'資訊標籤','資訊不是內文','author',1,0)").bind('snap-'+id,'old-'+id,id).run();
    await db.prepare('UPDATE saved_refs SET current_snapshot_id=? WHERE id=?').bind('snap-'+id,'old-'+id).run();
    await db.prepare("INSERT INTO asset_refs(id,asset_id,snapshot_id,role) VALUES(?,?,?,'saved_image')").bind('ref-'+id,id,'snap-'+id).run();
   }
  }
  await db.exec("UPDATE items SET content_seq=2 WHERE id='changed'; DELETE FROM items WHERE id='deleted';");
  // An incorrect legacy FTS row from another user must never win the lookup.
  await db.prepare("INSERT INTO items_fts(id,user_id,problem_text) VALUES('q','other','OTHER USER SECRET')").run();
  await sql(migration);
  const call=async(path,uid='',method='GET',body)=>{
   const res=await mf.dispatchFetch('https://redolve.test/api'+path,{method,headers:{...(uid?{Authorization:'Bearer '+tokens[uid]}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
   return{status:res.status,data:await res.json(),cache:res.headers.get('Cache-Control')};
  };
  await t.test('migration recovers matching full text only, and backfill is repeatable',async()=>{
   assert.equal((await call('/saved/old-q/text','viewer')).data.text,full);
   assert.equal((await db.prepare("SELECT source_text FROM saved_snapshots WHERE id='snap-changed'").first()).source_text,null);
   assert.equal((await db.prepare("SELECT source_text FROM saved_snapshots WHERE id='snap-deleted'").first()).source_text,null);
   await sql(migration.slice(migration.indexOf('-- Recover legacy')));
   assert.equal((await call('/saved/old-q/text','viewer')).data.text,full);
  });
  await t.test('public text is full OCR, private text requires current access',async()=>{
   assert.equal((await call('/collections/co/items/q/text')).data.text,full);
   assert.equal((await call('/collections/co/items/empty/text')).data.text,'');
   assert.match((await call('/collections/co/items/q/text')).cache,/no-store/);
   await db.exec("UPDATE collections SET visibility='restricted' WHERE id='co'; INSERT INTO collection_grants(id,collection_id,kind,role,user_id) VALUES('view','co','user','viewer','viewer');");
   assert.equal((await call('/collections/co/items/q/text')).status,404);
   assert.equal((await call('/collections/co/items/q/text','other')).status,404);
   assert.equal((await call('/collections/co/items/q/text','viewer')).data.text,full);
   assert.equal((await call('/collections/co/items/q/text','author')).data.text,full);
   assert.equal((await call('/collections/other/items/q/text','author')).status,404);
  });
  let saved;
  await t.test('new downloads and explicit refresh retain OCR without copying private notes',async()=>{
   // Remove the legacy save shell so this request creates a new download.
   await db.exec("DELETE FROM saved_refs WHERE id='old-q';");
   const result=await call('/saved','viewer','POST',{entry_id:'q',topic_id:'math'});
   assert.equal(result.status,201,JSON.stringify(result.data));saved=result.data.saved_id;
   assert.ok(saved,JSON.stringify(result.data));
   assert.equal((await call('/saved/'+saved+'/text','viewer')).data.text,full);
   const detail=await call('/saved/'+saved,'viewer');assert.equal(detail.status,200);
   assert.equal('source_text' in detail.data.snapshot,false,'card loading does not transfer full OCR');
   await db.exec("UPDATE items SET content_seq=content_seq+1 WHERE id='q';");
   await db.prepare("UPDATE items_fts SET problem_text=? WHERE id='q' AND user_id='author'").bind('新的題目內文').run();
   assert.equal((await call('/saved/'+saved+'/text','viewer')).data.text,full,'saved version stays fixed');
   assert.equal((await call('/saved/'+saved+'/refresh-source','viewer','POST',{})).status,200);
   assert.equal((await call('/saved/'+saved+'/text','viewer')).data.text,'新的題目內文');
  });
  await t.test('revocation/removal/deletion block shared text but retain the downloaded version',async()=>{
   await db.exec("UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP WHERE id='view';");
   assert.equal((await call('/collections/co/items/q/text','viewer')).status,404);
   assert.equal((await call('/saved/'+saved+'/text','viewer')).data.text,'新的題目內文');
   assert.equal((await call('/saved/'+saved+'/text','other')).status,404);
   assert.equal((await call('/saved/'+saved+'/text')).status,401);
   await db.exec("UPDATE collection_items SET state='removed' WHERE id='q';");
   assert.equal((await call('/collections/co/items/q/text','author')).status,404);
   await db.exec("DELETE FROM items WHERE id='q';");
   assert.equal((await call('/saved/'+saved+'/text','viewer')).data.text,'新的題目內文');
   await db.exec("UPDATE assets SET state='quarantined' WHERE id='q';");
   assert.equal((await call('/saved/'+saved+'/text','viewer')).status,404,'quarantined content fails closed');
  });
 }finally{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
