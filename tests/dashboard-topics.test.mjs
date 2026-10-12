import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,rm } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { sign } from 'hono/jwt';

test('dashboard returns five weakest units from owned and saved items, scoped to owner',async()=>{
 await mkdir('.wrangler/qa',{recursive:true});const dir=await mkdtemp(resolve('.wrangler/qa/dashboard-top5-'));let mf;
 try{
  const file=join(dir,'worker.mjs');await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:file,logLevel:'silent'});
  mf=new Miniflare({scriptPath:file,modules:true,compatibilityDate:'2025-04-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['STORAGE'],kvNamespaces:['KV'],bindings:{JWT_SECRET:'dashboard-test'}});
  const db=await mf.getD1Database('DB');
  await db.exec("CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT); CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER); CREATE TABLE taxonomies(id TEXT PRIMARY KEY,label TEXT,parent_id TEXT); CREATE TABLE items(id TEXT PRIMARY KEY,user_id TEXT,status TEXT,topic_id TEXT); CREATE TABLE saved_refs(id TEXT PRIMARY KEY,user_id TEXT,status TEXT,personal_topic_id TEXT); INSERT INTO users VALUES('one','one@example.test'); INSERT INTO taxonomies VALUES('math','數學',NULL);");
  await db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').bind('session','one',Math.floor(Date.now()/1000)+3600).run();
  for(let i=1;i<=6;i++){
   await db.prepare('INSERT INTO taxonomies VALUES(?,?,?)').bind('t'+i,'單元 '+i,'math').run();
   await db.prepare("INSERT INTO items VALUES(?,'one','unsolved',?)").bind('own'+i,'t'+i).run();
   await db.prepare("INSERT INTO saved_refs VALUES(?,'one','unsolved',?)").bind('saved'+i,'t'+i).run();
   await db.prepare("INSERT INTO items VALUES(?,'one','resolved',?)").bind('resolved'+i,'t'+i).run();
   await db.prepare("INSERT INTO items VALUES(?,'other','unsolved',?)").bind('other'+i,'t6').run();
  }
  await db.exec("INSERT INTO saved_refs VALUES('extra','one','unsolved','t3');");
  const jwt=await sign({sub:'one',sid:'session',exp:Math.floor(Date.now()/1000)+3600},'dashboard-test');
  const response=await mf.dispatchFetch('https://redolve.test/api/dashboard',{headers:{Authorization:'Bearer '+jwt}});
  assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.top_unsolved_topics.length,5);assert.deepEqual(data.top_unsolved_topics.map(t=>t.topic_id),['t3','t1','t2','t4','t5']);
  assert.equal(data.top_unsolved_topics[0].unsolved_count,3);assert.equal(data.summary.unsolved,13);assert.equal(data.summary.total,19);
  const guest=await mf.dispatchFetch('https://redolve.test/api/dashboard');assert.deepEqual((await guest.json()).top_unsolved_topics,[]);
 }finally{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
