import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { sign } from 'hono/jwt';
import { unstable_splitSqlQuery } from 'wrangler';
import { learningSchemaStatus } from '../scripts/learning-schema.mjs';
import { learningBackfillSql } from '../scripts/learning-backfill-sql.mjs';

async function load(file) {
  const { outputFiles } = await build({entryPoints:[file],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
  return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
}
const types=await load('src/types/learning.ts');
const service=await load('worker/services/learningQuestions.ts');
const data=()=>({content:{ocrText:'甲、乙中選出正確選項',questionType:'multiple_choice',options:[
  {id:'one',label:'甲',text:'第一個'}, {id:'two',label:'②',text:'第二個'}],correctAnswer:{kind:'choice',optionIds:['two','one']}},
  personal:{originalAnswer:{kind:'choice',optionIds:['one']},errorReasons:[{text:'可能漏看條件',origin:'ai'}]}});

test('additive upgrade and bounded legacy backfill preserve existing and newer personal data',async()=>{
  const mf=new Miniflare({script:'export default { fetch() { return new Response("ok"); } }',modules:true,
    compatibilityDate:'2025-04-01',d1Databases:['DB']});
  try {
    const db=await mf.getD1Database('DB');
    const sql=async text=>{for(const q of unstable_splitSqlQuery(text.replace(/^\s*--[^\r\n]*$/gm,'')))await db.exec(q.replace(/\r?\n/g,' '));};
    const schema=await readFile('worker/schema.sql','utf8');
    await sql(schema.split('-- Personal learning foundation.')[0]);
    await sql(`INSERT INTO users(id,email) VALUES('alice','alice@test'),('bob','bob@test');
      INSERT INTO assets(id,storage_key) VALUES('image','image');
      INSERT INTO items(id,user_id,image_url,status) VALUES('q','alice','image','unsolved'),('edited','alice','image','unsolved');
      INSERT INTO items_fts(rowid,id,user_id,problem_text) VALUES
        (1,'q','alice','older'),(2,'q','alice','latest in batch'),(3,'q','bob','wrong owner'),
        (4,'edited','alice','legacy must not win'),(5,'q','alice','next batch');`);
    const before=await db.prepare('SELECT * FROM items ORDER BY id').all();
    await sql(await readFile('worker/migrations/0014_learning_foundation.sql','utf8'));
    assert.deepEqual((await db.prepare('SELECT * FROM items ORDER BY id').all()).results,before.results);
    const master=await db.prepare('SELECT name,sql FROM sqlite_master').all();
    assert.deepEqual(learningSchemaStatus(()=>[master]).missing,[]);
    await db.prepare("INSERT INTO item_texts(item_id,user_id,source_content_seq,ocr_text,text_origin) VALUES('edited','alice',1,'manual text','user')").run();
    await sql(learningBackfillSql(0,4));
    await sql(learningBackfillSql(0,4)); // Simulate a crash before checkpoint advancement.
    assert.equal((await db.prepare("SELECT ocr_text FROM item_texts WHERE item_id='q'").first()).ocr_text,'latest in batch');
    assert.equal((await db.prepare("SELECT ocr_text FROM item_texts WHERE item_id='edited'").first()).ocr_text,'manual text');
    await sql(learningBackfillSql(4,5));
    await sql(learningBackfillSql(0,4)); // Delayed replay cannot rewind newer legacy text.
    assert.equal((await db.prepare("SELECT ocr_text FROM item_texts WHERE item_id='q'").first()).ocr_text,'next batch');
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM learning_questions').first()).n,0);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM items_fts').first()).n,5);
    assert.throws(()=>learningBackfillSql(0,'5; DROP TABLE items'),/Invalid/);
  } finally { await mf.dispose(); }
});

test('answers preserve non-Latin labels and discard uncertain AI fields independently',()=>{
  assert.deepEqual(types.ANALYSIS_PERIOD_DAYS,[7,15,30,60,90]);
  assert.deepEqual(types.validateLearningData(data()).content.correctAnswer.optionIds,['one','two']);
  const invalid=data();invalid.content.correctAnswer.optionIds=['unknown'];
  assert.throws(()=>types.validateLearningData(invalid),/不存在/);
  invalid.content.questionType='single_choice';invalid.content.correctAnswer.optionIds=['one','two'];
  assert.throws(()=>types.validateLearningData(invalid),/單選/);
  const raw={ocr_text:'保留題文',question_type:'single_choice',options:data().content.options,
    correct_answer:{kind:'choice',optionIds:['unknown']},original_answer:data().personal.originalAnswer,error_reasons:['可能錯因']};
  const valid=types.normalizeRecognition(raw);assert.equal(valid.content.ocrText,'保留題文');assert.equal(valid.content.correctAnswer,null);
  const saved=types.normalizeRecognition(raw,true);assert.equal(saved.personal.originalAnswer,null);assert.deepEqual(saved.personal.errorReasons,[]);
  assert.throws(()=>service.parsePersonalRef({kind:'collection',itemId:'q'}),/只支援/);
});

test('personal learning API, immutable revisions, ownership and background races',async t=>{
  await mkdir('.wrangler/qa',{recursive:true});const dir=await mkdtemp(resolve('.wrangler/qa/learning-'));let mf;
  try{
    const bundle=join(dir,'worker.mjs');
    await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:bundle,logLevel:'silent'});
    mf=new Miniflare({scriptPath:bundle,modules:true,compatibilityDate:'2025-04-01',compatibilityFlags:['nodejs_compat'],
      d1Databases:['DB'],r2Buckets:['STORAGE'],kvNamespaces:['KV'],bindings:{JWT_SECRET:'learning-test',LEARNING_ENABLED:'true'}});
    const db=await mf.getD1Database('DB');
    const sql=async text=>{for(const q of unstable_splitSqlQuery(text.replace(/^\s*--[^\r\n]*$/gm,'')))await db.exec(q.replace(/\r?\n/g,' '));};
    const schema=await readFile('worker/schema.sql','utf8'),migration=await readFile('worker/migrations/0014_learning_foundation.sql','utf8');
    assert.ok(schema.replace(/\r/g,'').includes(migration.replace(/\r/g,'')));await sql(schema);
    const master=await db.prepare('SELECT name,sql FROM sqlite_master').all();
    assert.deepEqual(learningSchemaStatus(()=>[master]).missing,[],'read-only schema checker validates constraints and indexes');
    const tokens={};
    for(const uid of ['alice','bob']){
      await db.prepare('INSERT INTO users(id,email) VALUES(?,?)').bind(uid,uid+'@example.test').run();
      await db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(uid,uid,Math.floor(Date.now()/1000)+3600).run();
      tokens[uid]=await sign({sub:uid,sid:uid,exp:Math.floor(Date.now()/1000)+3600},'learning-test');
    }
    await sql(`INSERT INTO taxonomies(id,label,level) VALUES('math','數學',0);
      INSERT INTO assets(id,storage_key) VALUES('image','image');
      INSERT INTO items(id,user_id,image_url,status,topic_id) VALUES('q','alice','image','unsolved','math');
      INSERT INTO items_fts(id,user_id,problem_text) VALUES('q','alice','舊題文');
      INSERT INTO collections(id,owner_id,title,public_name,visibility,lifecycle) VALUES('co','alice','集合','author','public','active');
      INSERT INTO collection_items(id,collection_id,source_item_id,contributor_id,origin_item_key) VALUES('entry','co','q','alice','q');
      INSERT INTO saved_refs(id,user_id,entry_id) VALUES('saved','bob','entry');
      INSERT INTO saved_snapshots(id,saved_ref_id,image_asset_id,source_title,collection_title,provider_public_name,source_text,source_content_seq,source_shared_seq)
        VALUES('snap','saved','image','保留題目','集合','author','保留文字',1,0);
      UPDATE saved_refs SET current_snapshot_id='snap' WHERE id='saved';`);
    const call=async(path,uid='alice',method='GET',body)=>{
      const res=await mf.dispatchFetch('https://redolve.test/api'+path,{method,headers:{...(uid?{Authorization:'Bearer '+tokens[uid]}:{}),
        ...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
      return {status:res.status,data:await res.json(),cache:res.headers.get('Cache-Control')};
    };
    const write=(current,value=data())=>({expectedRowVersion:current.rowVersion,expectedSourceVersion:current.sourceVersion,data:value});
    let current,oldRevision;
    await t.test('read is private and does not manufacture data or scan FTS',async()=>{
      assert.equal((await call('/learning/owned/q','')).status,401);
      assert.equal((await call('/learning/owned/q','bob')).status,404);
      assert.equal((await call('/learning/collection/entry')).status,422);
      const r=await call('/learning/owned/q');assert.equal(r.status,200);assert.match(r.cache,/no-store/);
      assert.equal(r.data.id,null);assert.equal(r.data.content.ocrText,null);current=r.data;
      assert.equal((await db.prepare('SELECT COUNT(*) n FROM learning_questions').first()).n,0);
    });
    await t.test('saving creates a confirmed revision with source image and canonical text',async()=>{
      const r=await call('/learning/owned/q','alice','PATCH',write(current));assert.equal(r.status,200,JSON.stringify(r.data));
      current=r.data;oldRevision=current.revisionId;
      assert.equal(current.confirmationStatus,'confirmed');assert.equal(current.rowVersion,1);
      assert.deepEqual(current.content.correctAnswer.optionIds,['one','two']);
      assert.equal((await db.prepare("SELECT ocr_text FROM item_texts WHERE item_id='q'").first()).ocr_text,types.learningFullText(data().content));
      assert.equal((await db.prepare('SELECT COUNT(*) n FROM learning_revision_asset_refs WHERE revision_id=?').bind(oldRevision).first()).n,1);
      assert.equal((await call('/problems/q/analyze','alice','POST',{})).status,409,'legacy AI route cannot overwrite confirmed data');
    });
    await t.test('stale source and row versions cannot modify text or create extra revisions',async()=>{
      const bad=write(current);bad.expectedRowVersion=0;bad.data.content.ocrText='不可覆寫';
      assert.equal((await call('/learning/owned/q','alice','PATCH',bad)).status,409);
      const sourceBad=write(current);sourceBad.expectedSourceVersion='old';
      assert.equal((await call('/learning/owned/q','alice','PATCH',sourceBad)).status,409);
      assert.equal((await db.prepare('SELECT COUNT(*) n FROM learning_question_revisions').first()).n,1);
      assert.equal((await db.prepare("SELECT problem_text FROM items_fts WHERE id='q'").first()).problem_text,types.learningFullText(data().content));
      await assert.rejects(()=>service.saveLearningQuestion(db,'alice',{kind:'owned',itemId:'q'},write(current),'ai'),/已更新或已確認/);
    });
    await t.test('new answer retains old grading evidence and rejects concurrent edits',async()=>{
      const changed=data();changed.content.correctAnswer={kind:'choice',optionIds:['two']};
      const results=await Promise.all([call('/learning/owned/q','alice','PATCH',write(current,changed)),call('/learning/owned/q','alice','PATCH',write(current,data()))]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);current=(await call('/learning/owned/q')).data;
      const old=await db.prepare('SELECT content_json FROM learning_question_revisions WHERE id=?').bind(oldRevision).first();
      assert.deepEqual(JSON.parse(old.content_json).correctAnswer.optionIds,['one','two']);
      await assert.rejects(()=>db.prepare('UPDATE learning_question_revisions SET content_json=? WHERE id=?').bind('{}',oldRevision).run(),/immutable/);
      assert.equal((await call('/learning/owned/q','bob','PATCH',write(current))).status,404);
    });
    await t.test('saved data is independent and source authors answers are never adopted as personal',async()=>{
      let saved=(await call('/learning/saved/saved','bob')).data;assert.equal(saved.content.ocrText,'保留文字');assert.equal(saved.personal.originalAnswer,null);
      await service.saveLearningQuestion(db,'bob',{kind:'saved',savedRefId:'saved'},write(saved),'ai');
      saved=(await call('/learning/saved/saved','bob')).data;assert.equal(saved.personal.originalAnswer,null);assert.deepEqual(saved.personal.errorReasons,[]);
      const revisionBeforeConfirm=saved.revisionId, sourceBeforeConfirm=saved.sourceVersion;
      const confirm=await call('/learning/saved/saved/confirm','bob','POST',write(saved));
      assert.equal(confirm.status,200);saved=confirm.data;
      assert.equal(saved.revisionId,revisionBeforeConfirm,'confirmation must not copy content');
      assert.equal(saved.sourceVersion,sourceBeforeConfirm,'confirmation must not change the source');
      assert.equal(saved.confirmationStatus,'confirmed');
      const ownerBefore=(await call('/learning/owned/q')).data;
      const ownResult=await call('/learning/saved/saved','bob','PATCH',write(saved));assert.equal(ownResult.status,200);
      assert.deepEqual((await call('/learning/owned/q')).data,ownerBefore);
      assert.equal((await call('/learning/saved/saved','alice')).status,404);
      await db.exec("UPDATE collections SET lifecycle='suspended' WHERE id='co';");
      assert.equal((await call('/learning/saved/saved','bob')).status,200,'retained personal data survives source revocation');
    });
    await t.test('source snapshot replacement leaves history and asset reference intact',async()=>{
      const before=(await call('/learning/saved/saved','bob')).data;
      await sql(`INSERT INTO saved_snapshots(id,saved_ref_id,image_asset_id,source_title,collection_title,provider_public_name,source_text,source_content_seq,source_shared_seq)
        VALUES('snap2','saved','image','新版','集合','author','新版文字',2,0);
        UPDATE saved_refs SET current_snapshot_id='snap2',row_version=row_version+1 WHERE id='saved'; DELETE FROM saved_snapshots WHERE id='snap';`);
      assert.equal((await call('/learning/saved/saved','bob','PATCH',write(before))).status,409);
      const after=(await call('/learning/saved/saved','bob')).data;assert.equal(after.revisionId,before.revisionId);assert.equal(after.sourceUpdated,true);
      assert.ok((await db.prepare("SELECT COUNT(*) n FROM asset_reference_inventory WHERE asset_id='image'").first()).n>0);
    });
    await t.test('invalid answers are rejected; missing answers can still be confirmed',async()=>{
      const invalid=data();invalid.content.correctAnswer.optionIds=['bad'];
      assert.equal((await call('/learning/owned/q','alice','PATCH',write(current,invalid))).status,422);
      const noKey=data();noKey.content.correctAnswer=null;noKey.personal.originalAnswer=null;
      const r=await call('/learning/owned/q','alice','PATCH',write(current,noKey));assert.equal(r.status,200);
      assert.equal(r.data.confirmationStatus,'confirmed');assert.equal(r.data.content.correctAnswer,null);
    });
    await t.test('deleting personal source cleans only its own revisions',async()=>{
      await db.exec("DELETE FROM saved_refs WHERE id='saved';");
      assert.equal((await call('/learning/saved/saved','bob')).status,404);
      assert.equal((await db.prepare("SELECT COUNT(*) n FROM learning_questions WHERE user_id='bob'").first()).n,0);
      assert.ok((await db.prepare("SELECT COUNT(*) n FROM learning_questions WHERE user_id='alice'").first()).n>0);
      await db.exec("UPDATE assets SET state='quarantined' WHERE id='image';");
      assert.equal((await call('/learning/owned/q')).status,404,'asset quarantine fails closed');
    });
  }finally{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
