import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, Response as MFResponse } from 'miniflare';
import { sign } from 'hono/jwt';
import { unstable_splitSqlQuery } from 'wrangler';
import { practiceMigrations, practiceSchemaStatus } from '../scripts/practice-schema.mjs';
async function load(file) { const {outputFiles}=await build({entryPoints:[file],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64')); }
const learning=await load('worker/services/learningQuestions.ts'),practice=await load('worker/services/practice.ts'),analysis=await load('worker/services/personalAnalysis.ts');
const data=(multiple=false,key=true)=>({content:{ocrText:'請選出符合條件的項目',questionType:multiple?'multiple_choice':'single_choice',options:[{id:'one',label:'甲',text:'第一項'},{id:'two',label:'乙',text:'第二項'}],correctAnswer:key?{kind:'choice',optionIds:multiple?['one','two']:['one']}:null},personal:{originalAnswer:null,errorReasons:[]}});
test('practice submissions, corrections, analysis snapshots and private retention',async t=>{
  await mkdir('.wrangler/qa',{recursive:true});const dir=await mkdtemp(resolve('.wrangler/qa/practice-'));let mf;
  try {
    let providerMode='valid'; const providerRequests=[];
    const bundle=join(dir,'worker.mjs');await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:bundle,logLevel:'silent'});
    mf=new Miniflare({scriptPath:bundle,modules:true,compatibilityDate:'2025-04-01',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['STORAGE'],kvNamespaces:['KV'],
      ratelimits:{UPLOAD_LIMITER:{namespace_id:'42',simple:{limit:1000,period:60}}},
      bindings:{JWT_SECRET:'practice-test',LEARNING_ENABLED:'true',PRACTICE_ENABLED:'true',ANALYSIS_ENABLED:'true',GEMINI_API_KEY:'fake-test-key',GEMINI_ANALYSIS_MODEL:'qa-model'},
      outboundService:async request=>{
        if(!request.url.startsWith('https://generativelanguage.googleapis.com/'))return new MFResponse('Unexpected outbound request',{status:500});
        const body=await request.json();providerRequests.push(body);
        const prompt=body.contents.flatMap(c=>c.parts.map(p=>p.text||'')).join('\n'),input=JSON.parse(prompt.split('資料：').at(-1));
        const id=providerMode==='invalid-evidence'?'foreign':input.evidence[0].id;
        const findings=Array.from({length:4},(_,i)=>({title:'考點 '+i,explanation:'請比較題目條件並用原題驗證。',evidenceIds:[id],metricIds:[input.stats.units[0].id]}));
        return new MFResponse(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({findings})}]},finishReason:'STOP'}],modelVersion:'qa-model'}),{headers:{'Content-Type':'application/json'}});
      }});
    const db=await mf.getD1Database('DB');const sql=async text=>{for(const q of unstable_splitSqlQuery(text.replace(/^\s*--[^\r\n]*$/gm,'')))await db.exec(q.replace(/\r?\n/g,' '));};
    const schema=await readFile('worker/schema.sql','utf8');await sql(schema);
    for(const file of practiceMigrations){assert.ok(schema.replace(/\r/g,'').includes((await readFile(file,'utf8')).replace(/\r/g,'')));const master=await db.prepare('SELECT name,sql FROM sqlite_master').all();assert.deepEqual(practiceSchemaStatus(()=>[master],file).missing,[]);}
    const tokens={};for(const uid of ['alice','bob']){await db.prepare('INSERT INTO users(id,email) VALUES(?,?)').bind(uid,uid+'@test').run();await db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(uid,uid,Math.floor(Date.now()/1000)+3600).run();tokens[uid]=await sign({sub:uid,sid:uid,exp:Math.floor(Date.now()/1000)+3600},'practice-test');}
    await sql(`INSERT INTO taxonomies(id,label,level) VALUES('math','數學',0),('other','其他',0);
      INSERT INTO assets(id,storage_key) VALUES('image','image');
      INSERT INTO items(id,user_id,image_url,status,topic_id,created_at) VALUES('q1','alice','image','unsolved','math','2000-01-01'),('q2','alice','image','unsolved','math','2000-01-01'),('old','alice','image','unsolved','math','2000-01-01'),('foreign','bob','image','unsolved','math','2000-01-01');
      INSERT INTO collections(id,owner_id,title,public_name,visibility,lifecycle) VALUES('co','bob','集合','author','public','active');
      INSERT INTO collection_items(id,collection_id,source_item_id,contributor_id,origin_item_key) VALUES('entry','co','foreign','bob','foreign');
      INSERT INTO saved_refs(id,user_id,entry_id,personal_topic_id,classification_state) VALUES('saved','alice','entry','math','manual');
      INSERT INTO saved_snapshots(id,saved_ref_id,image_asset_id,source_title,collection_title,provider_public_name,source_text,source_content_seq,source_shared_seq) VALUES('snap','saved','image','保留題目','集合','author','保留文字',1,0);
      UPDATE saved_refs SET current_snapshot_id='snap' WHERE id='saved';`);
    const refs=[{kind:'owned',itemId:'q1'},{kind:'owned',itemId:'q2'},{kind:'saved',savedRefId:'saved'}],questions=[];
    for(let i=0;i<refs.length;i++){const current=await learning.readLearningQuestion(db,'alice',refs[i]);questions.push(await learning.saveLearningQuestion(db,'alice',refs[i],{expectedRowVersion:current.rowVersion,expectedSourceVersion:current.sourceVersion,data:data(i===1,i!==2)},'user'));}
    const call=async(path,uid='alice',method='GET',body)=>{const res=await mf.dispatchFetch('https://redolve.test/api'+path,{method,headers:{...(uid?{Authorization:'Bearer '+tokens[uid]}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:res.status,data:await res.json()};};
    const make=(q,index,answer={kind:'choice',optionIds:['two']})=>({id:'event-'+index,questionId:q.id,revisionId:q.revisionId,sessionId:'session',sessionItemId:'item-'+index,answer,clientAnsweredAt:new Date().toISOString(),clientTimezone:'Asia/Taipei',usedOriginalImage:false});
    let first=make(questions[0],'first'),replacement;
    await t.test('sampling and endpoints respect personal scope and old OCR eligibility',async()=>{
      assert.equal((await call('/practice/sessions','','POST',{scope:{subjectId:'math'},count:5})).status,401);
      const result=await call('/practice/sessions','alice','POST',{scope:{subjectId:'math'},count:5});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.questions.length,3);
      assert.equal(new Set(result.data.questions.map(q=>q.id)).size,3);assert.ok(result.data.questions.some(q=>q.ref.kind==='saved'));
      const restricted=await practice.createPractice(db,'alice',{subjectId:'math'},3,[questions[2].id]);assert.equal(restricted.questions.length,1);assert.equal(restricted.questions[0].id,questions[2].id);
      assert.equal((await call('/practice/attempts/batch','bob','POST',{userId:'alice',attempts:[first]})).status,409);
    });
    await t.test('server grading, set equality and independent replay-safe attempts',async()=>{
      const result=await practice.submitAttempt(db,'alice',{...first,selfResult:'correct'});assert.equal(result.result,'incorrect');first={...first,selfResult:'correct'};
      assert.deepEqual(await practice.submitAttempt(db,'alice',first),result);
      await assert.rejects(()=>practice.submitAttempt(db,'alice',{...first,id:'duplicate-event'}),/已提交/);
      await assert.rejects(()=>practice.submitAttempt(db,'alice',{...first,answer:{kind:'choice',optionIds:['one']}}),/不可改/);
      const multi=await practice.submitAttempt(db,'alice',make(questions[1],'multi',{kind:'choice',optionIds:['two','one','two']}));assert.equal(multi.result,'correct');
      const self=await practice.submitAttempt(db,'alice',{...make(questions[2],'self',null),selfResult:'correct'});assert.equal(self.gradingMethod,'self');
      await assert.rejects(()=>practice.submitAttempt(db,'alice',make(questions[0],'invalid',{kind:'choice',optionIds:['unknown']})),/不存在/);
      assert.equal((await db.prepare('SELECT COUNT(*) n FROM practice_attempts').first()).n,3);
    });
    await t.test('answer changes retain old evidence and explicit corrections cannot branch',async()=>{
      const changed=data();changed.content.correctAnswer={kind:'choice',optionIds:['two']};const q=questions[0];
      const updated=await learning.saveLearningQuestion(db,'alice',q.ref,{expectedRowVersion:q.rowVersion,expectedSourceVersion:q.sourceVersion,data:changed},'user');
      const old=await practice.submitAttempt(db,'alice',first);assert.equal(old.result,'incorrect');assert.deepEqual(old.basis.content.correctAnswer.optionIds,['one']);
      const correction={...first,id:'correction',revisionId:updated.revisionId,supersedesAttemptId:first.id};
      const results=await Promise.allSettled([practice.submitAttempt(db,'alice',correction),practice.submitAttempt(db,'alice',{...correction,id:'branch'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      replacement=results.find(r=>r.status==='fulfilled').value;assert.equal(replacement.result,'correct');
      assert.ok((await practice.submitAttempt(db,'alice',first)).voidedAt);assert.equal((await db.prepare('SELECT COUNT(*) n FROM practice_attempts WHERE voided_at IS NULL').first()).n,3);
      await assert.rejects(()=>db.prepare("UPDATE practice_attempts SET result='incorrect' WHERE id=?").bind(replacement.id).run(),/immutable/);
      const historical=await practice.submitAttempt(db,'alice',make(questions[0],'historical'));assert.equal(historical.result,'incorrect','offline event uses its original key');
    });
    await t.test('batch isolates invalid entries and user history',async()=>{
      const future={...make(questions[2],'future',null),selfResult:'incorrect',clientAnsweredAt:'2999-01-01T00:00:00.000Z'};
      const result=await call('/practice/attempts/batch','alice','POST',{userId:'alice',attempts:[{...future,id:'gone',questionId:'gone'},future]});
      assert.equal(result.data.replies[0].error.status,410);assert.equal(result.data.replies[1].attempt.timeQuality,'adjusted');
      assert.equal((await call(`/practice/questions/${questions[0].id}/attempts`,'bob')).status,404);
      assert.ok((await call(`/practice/questions/${questions[0].id}/attempts`)).data.attempts.some(a=>a.voidedAt));
    });
    await t.test('statistics include old questions, count effective attempts and keep self grading separate',async()=>{
      const snap=await analysis.analysisSnapshot(db,'alice',{subjectId:'math'},7);assert.equal(snap.stats.questions,4);assert.equal(snap.stats.prepared,3);assert.equal(snap.stats.attempts,5);assert.equal(snap.stats.automatic,3);assert.equal(snap.stats.self,2);
      const empty=await analysis.analysisSnapshot(db,'alice',{subjectId:'other'},30);assert.equal(empty.stats.attempts,0);assert.equal(empty.stats.changedToCorrect,0);
      const evidence=await analysis.analysisEvidence(db,'alice',snap);assert.equal(evidence.length,3);
      assert.equal(snap.stats.missingCorrectAnswer,2);assert.equal(snap.stats.missingOriginalAnswer,4);assert.deepEqual(snap.stats.sources,{owned:3,saved:1});
      assert.equal(snap.stats.daily.reduce((sum,d)=>sum+d.attempts,0),snap.stats.attempts);
      const detail=evidence.find(e=>e.id===questions[0].id);assert.ok(detail.recentAttempts.length>=2);assert.ok(detail.recentAttempts.every(a=>a.answer&&a.correctAnswer));
      await assert.rejects(()=>analysis.analysisSnapshot(db,'alice',{subjectId:'math'},30,'not-a-timezone'),/時區/);
      assert.throws(()=>analysis.validateInterpretation({findings:[{title:'假的',explanation:'假的',evidenceIds:['foreign'],metricIds:[]}]},evidence,snap.stats),/Invalid/);
      assert.equal(analysis.validateInterpretation({findings:[{title:'觀察',explanation:'請比較條件',evidenceIds:[questions[0].id],metricIds:['math']}]},evidence,snap.stats).findings.length,1);
    });
    await t.test('manual report generation reaches the provider and reuses only valid scoped results',async()=>{
      const waitFor=async id=>{for(let tries=0;tries<100;tries++){const r=await call('/analysis/reports/'+id);if(r.data.status!=='pending')return r.data;await new Promise(resolve=>setTimeout(resolve,20));}throw Error('Report did not finish');};
      const generated=await call('/analysis/reports','alice','POST',{scope:{subjectId:'math'},days:15,timezone:'Asia/Taipei'});assert.equal(generated.status,202,JSON.stringify(generated.data));
      const report=await waitFor(generated.data.id);assert.equal(report.status,'complete');assert.equal(report.interpretation.findings.length,4,'findings are not limited to three');
      assert.equal(report.stats.timezone,'Asia/Taipei');assert.ok(providerRequests[0].generationConfig.responseSchema.properties.findings);
      const calls=providerRequests.length;const reused=await call('/analysis/reports','alice','POST',{scope:{subjectId:'math'},days:15,timezone:'Asia/Taipei'});
      assert.equal(reused.data.id,report.id);assert.equal(providerRequests.length,calls);
      const status=await call('/analysis/reports/'+report.id+'/status');assert.equal(status.data.status,'complete');assert.equal(status.data.evidence,undefined);
      assert.equal((await call('/analysis/reports/'+report.id+'/status','bob')).status,404);
      const selected=await call('/analysis/reports?subjectId=math&days=15&topicId=');assert.ok(selected.data.reports.some(r=>r.id===report.id));
      assert.equal((await call('/analysis/reports?subjectId=math&days=7&topicId=')).data.reports.length,0);
      providerMode='invalid-evidence';const invalid=await call('/analysis/reports','alice','POST',{scope:{subjectId:'math'},days:60});
      assert.equal((await waitFor(invalid.data.id)).status,'failed','unknown citations cannot reach a completed report');
      providerMode='valid';const retry=await call('/analysis/reports','alice','POST',{scope:{subjectId:'math'},days:60});
      assert.notEqual(retry.data.id,invalid.data.id);assert.equal((await waitFor(retry.data.id)).status,'complete');
    });
    await t.test('analysis scope index probes stay bounded when unrelated history grows from 1000 to 10000',async()=>{
      await sql(`INSERT INTO taxonomies(id,label,level) VALUES('outside','範圍外',0);
        INSERT INTO items(id,user_id,image_url,status,topic_id) VALUES('noise','alice','image','unsolved','outside');`);
      const ref={kind:'owned',itemId:'noise'},current=await learning.readLearningQuestion(db,'alice',ref);
      const noise=await learning.saveLearningQuestion(db,'alice',ref,{expectedRowVersion:current.rowVersion,expectedSourceVersion:current.sourceVersion,data:data()},'user');
      const seed=async(start,end)=>{
        const now=new Date().toISOString();
        await db.prepare(`WITH RECURSIVE n(x) AS (SELECT ? UNION ALL SELECT x+1 FROM n WHERE x<?)
          INSERT INTO practice_attempts(id,user_id,learning_question_id,revision_id,session_id,session_item_id,answer_json,result,grading_method,
          grading_basis_json,client_answered_at,answered_at,received_at,client_timezone,time_quality,used_original_image,request_hash)
          SELECT 'noise-'||x,'alice',?,?,'noise','noise-'||x,'null','incorrect','self','{}',?,?,?,'UTC','client',0,'noise' FROM n`)
          .bind(start,end,noise.id,noise.revisionId,now,now,now).run();
      };
      const measure=async()=>{
        let reads=0;const counted={prepare:(...args)=>db.prepare(...args),batch:async statements=>{const values=await db.batch(statements);reads+=values.reduce((n,r)=>n+r.meta.rows_read,0);return values;}};
        const snapshot=await analysis.analysisSnapshot(counted,'alice',{subjectId:'math'},30);assert.equal(snapshot.stats.questions,4);return reads;
      };
      await seed(1,1000);const small=await measure();await seed(1001,10000);const large=await measure();
      assert.ok(large<=small+10,JSON.stringify({small,large}));t.diagnostic('Scoped batch rows_read: '+JSON.stringify({history1000:small,history10000:large}));
    });
    await t.test('reports deduplicate input, keep snapshots, expire details and delete with personal sources',async()=>{
      const work=await analysis.beginAnalysis(db,'alice',{subjectId:'math'},30),again=await analysis.beginAnalysis(db,'alice',{subjectId:'math'},30);assert.equal(work.id,again.id);assert.equal(again.created,false);
      await db.prepare("UPDATE analysis_reports SET status='complete',interpretation_json=? WHERE id=?").bind(JSON.stringify({findings:[]}),work.id).run();
      assert.equal((await call('/analysis/reports/'+work.id,'bob')).status,404);
      const before=await analysis.getAnalysis(db,'alice',work.id);await practice.submitAttempt(db,'alice',{...make(questions[2],'later',null),selfResult:'incorrect'});
      assert.deepEqual((await analysis.getAnalysis(db,'alice',work.id)).stats,before.stats);
      await db.prepare("UPDATE analysis_reports SET detail_expires_at='2000-01-01' WHERE id=?").bind(work.id).run();await analysis.cleanupAnalysis(db);
      const expired=await analysis.getAnalysis(db,'alice',work.id);assert.equal(expired.expired,true);assert.equal(expired.interpretation,null);assert.deepEqual(expired.evidence,[]);assert.equal(expired.stats.questions,4);
      await db.exec("DELETE FROM items WHERE id='old';");assert.equal((await call('/analysis/reports/'+work.id)).status,404,'even deletion of unprepared source invalidates its report');
      await db.exec("DELETE FROM saved_refs WHERE id='saved';");await assert.rejects(()=>practice.submitAttempt(db,'alice',{...make(questions[2],'deleted',null),selfResult:'correct'}),/不可用/);
    });
  }finally{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
