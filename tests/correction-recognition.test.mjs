import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, Response as MFResponse } from 'miniflare';
import { sign } from 'hono/jwt';
import { unstable_splitSqlQuery } from 'wrangler';

test('correction composites, confirmation, stale results and replay', async t => {
  await mkdir('.wrangler/qa', { recursive: true }); const dir = await mkdtemp(resolve('.wrangler/qa/correction-')); let mf;
  try {
    let calls = 0, mode = 'valid', started, release;
    const bundle = join(dir, 'worker.mjs'); await build({ entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: bundle, logLevel: 'silent' });
    const bodies = [];
    mf = new Miniflare({ scriptPath: bundle, modules: true, compatibilityDate: '2025-04-01', compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB'], r2Buckets: ['STORAGE'], kvNamespaces: ['KV'], ratelimits: { UPLOAD_LIMITER: { namespace_id: '77', simple: { limit: 1000, period: 60 } } },
      bindings: { JWT_SECRET: 'correction-test', LEARNING_ENABLED: 'true', GEMINI_API_KEY: 'fake', GEMINI_ANALYSIS_MODEL: 'qa-pro' },
      outboundService: async req => {
        calls++; const body = await req.json(); bodies.push(body);
        if (mode === 'pause') { started?.(); await new Promise(resolve => { release = resolve; }); }
        if (mode === 'fail') return new MFResponse('unavailable', { status: 503 });
        if (mode === 'billing') return new MFResponse(JSON.stringify({error:{code:402,status:'RESOURCE_EXHAUSTED',message:'Your prepayment credits are depleted.'}}),{status:402,headers:{'Content-Type':'application/json'}});
        const raw = { ocr_text: '請依條件計算機率', question_type: 'single_choice', options: [{ id: 'a', label: 'A', text: '0.4' }, { id: 'b', label: 'B', text: '0.5' }],
          original_answer: { kind: 'choice', optionIds: ['b'] }, correct_answer: { kind: 'choice', optionIds: ['a'] },
          error_reasons: ['將條件事件放在錯誤的分母位置', '忽略已知事件的範圍'], correction_summary: '先標出已知事件，再選擇分母。' };
        if (mode === 'structured') raw.weakness_candidates = [
          { text: '算條件機率時仍使用原樣本空間', weaknessId: 'math-conditional-sample', basis: 'observed_steps', clue: '分母仍用總樣本數', target: '改用條件後的分母' },
          { text: '抄寫時把次數記反', weaknessId: null, basis: 'observed_steps', clue: '將正反面的次數對調', target: '核對表格標題和次數' },
          { text: '錯誤的未知 ID', weaknessId: 'math-foreign-id', basis: 'observed_steps', clue: '', target: '' },
        ];
        return new MFResponse(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(raw) }] } }] }), { headers: { 'Content-Type': 'application/json' } });
      } });
    const db = await mf.getD1Database('DB');
    const sql = async text => { for (const q of unstable_splitSqlQuery(text.replace(/^\s*--[^\r\n]*$/gm, ''))) await db.exec(q.replace(/\r?\n/g, ' ')); };
    await sql(await readFile('worker/schema.sql', 'utf8'));
    const tokens = {};
    for (const uid of ['alice', 'bob']) {
      await db.prepare('INSERT INTO users(id,email) VALUES(?,?)').bind(uid, uid + '@test').run();
      await db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(uid, uid, Math.floor(Date.now() / 1000) + 3600).run();
      tokens[uid] = await sign({ sub: uid, sid: uid, exp: Math.floor(Date.now() / 1000) + 3600 }, 'correction-test');
    }
    await sql(`INSERT INTO assets(id,storage_key) VALUES('image','image');
      INSERT INTO items(id,user_id,image_url,status) VALUES('q','alice','image','unsolved');
      INSERT INTO collections(id,owner_id,title,public_name,visibility,lifecycle) VALUES('co','alice','集合','author','public','active');
      INSERT INTO collection_items(id,collection_id,source_item_id,contributor_id,origin_item_key) VALUES('entry','co','q','alice','q');
      INSERT INTO saved_refs(id,user_id,entry_id,status) VALUES('saved','bob','entry','resolved');
      INSERT INTO saved_snapshots(id,saved_ref_id,image_asset_id,source_title,collection_title,provider_public_name,source_text,source_content_seq,source_shared_seq)
        VALUES('snap','saved','image','題目','集合','author','保留題文',1,0);
      UPDATE saved_refs SET current_snapshot_id='snap' WHERE id='saved';`);
    const call = async (path, uid = 'alice', method = 'GET', body) => {
      const form = body instanceof FormData;
      const encoded = form ? new Request('https://redolve.test', { method, body }) : null;
      const response = await mf.dispatchFetch('https://redolve.test/api/learning/' + path, { method,
        headers: { Authorization: 'Bearer ' + tokens[uid], ...(form ? { 'Content-Type': encoded.headers.get('Content-Type') } : body ? { 'Content-Type': 'application/json' } : {}) }, body: form ? await encoded.arrayBuffer() : body ? JSON.stringify(body) : undefined });
      return { status: response.status, data: await response.json() };
    };
    const composite = (suffix = 0, identity = 'image') => { const form = new FormData(); form.set('image', new Blob([new Uint8Array([255, 216, 255, suffix])], { type: 'image/jpeg' }), 'correction.jpg'); form.set('sourceIdentity', identity); form.set('notes', '已知事件應該放在分母'); return form; };
    const save = (current, data, correctionId) => call('owned/q', 'alice', 'PATCH', { expectedRowVersion: current.rowVersion, expectedSourceVersion: current.sourceVersion, data, correctionId });
    let report;
    await t.test('before correction and foreign requests never invoke a model', async () => {
      assert.equal((await call('owned/q/correction', 'bob', 'POST', composite())).status, 404);
      assert.equal((await call('owned/q/correction', 'alice', 'POST', composite())).data.error.code, 'CORRECTION_NOT_SYNCED'); assert.equal(calls, 0);
      await db.prepare("UPDATE items SET status='resolved',review_count=1 WHERE id='q'").run();
      assert.equal((await call('owned/q/correction', 'alice', 'POST', composite(0, 'other'))).data.error.code, 'SOURCE_CHANGED'); assert.equal(calls, 0);
    });
    await t.test('one composite produces a candidate without confirming or overwriting the question', async () => {
      const before = (await call('owned/q')).data;
      const response = await call('owned/q/correction', 'alice', 'POST', composite()); assert.equal(response.data.ok, true, JSON.stringify(response.data)); report = response.data.data;
      assert.equal(report.status, 'complete'); assert.equal(report.adopted, false); assert.equal(calls, 1);
      const parts = bodies[0].contents[0].parts; assert.equal(parts.filter(p => p.inlineData).length, 1); assert.equal(parts.find(p => p.inlineData).inlineData.data, '/9j/AA==');
      assert.ok(parts[0].text.includes('已知事件應該放在分母')); assert.ok(bodies[0].generationConfig.responseSchema.properties.correction_summary);
      const after = (await call('owned/q')).data; assert.deepEqual(after.content, before.content); assert.equal(after.confirmationStatus, 'ai'); assert.equal(after.correction.id, report.id);
      assert.ok(report.data.personal.errorReasons.every(r => !r.accepted));
      const repeat = await call('owned/q/correction', 'alice', 'POST', composite()); assert.equal(repeat.data.data.id, report.id); assert.equal(calls, 1);
    });
    await t.test('selecting reasons is explicit and empty answers can be confirmed atomically', async () => {
      const current = (await call('owned/q')).data, data = structuredClone(report.data);
      data.personal.originalAnswer = null; data.content.correctAnswer = null;
      data.personal.errorReasons = [{ ...data.personal.errorReasons[0], accepted: true }, { ...data.personal.errorReasons[1], accepted: false }];
      const adopted = await save(current, data, report.id); assert.equal(adopted.status, 200, JSON.stringify(adopted.data));
      assert.equal(adopted.data.confirmationStatus, 'confirmed'); assert.equal(adopted.data.correction.adopted, true);
      assert.equal(adopted.data.personal.errorReasons.length, 1); assert.equal(adopted.data.personal.errorReasons[0].accepted, true);
      assert.equal(adopted.data.content.correctAnswer, null); assert.equal(adopted.data.personal.originalAnswer, null);
      assert.equal((await save(current, data, report.id)).status, 409);
      assert.equal((await call('owned/q/correction', 'alice', 'POST', composite())).data.data.adopted, true); assert.equal(calls, 1, 'repeated completion with the same snapshot is free');
    });
    await t.test('new recognition retains the confirmed revision and stale proposals cannot be adopted', async () => {
      const confirmed = (await call('owned/q')).data;
      const candidate = (await call('owned/q/correction', 'alice', 'POST', composite(1))).data.data;
      assert.equal(candidate.adopted, false); const still = (await call('owned/q')).data;
      assert.equal(still.revisionId, confirmed.revisionId); assert.equal(still.confirmationStatus, 'confirmed');
      await call('owned/q/correction', 'alice', 'POST', composite(5));
      assert.equal((await save(still, candidate.data, candidate.id)).status, 409, 'a newer recognition also supersedes an otherwise matching old proposal');
      const modified = structuredClone(still); modified.personal.correctionSummary = '本人補充的新說明';
      assert.equal((await save(still, modified)).status, 200);
      assert.equal((await call('owned/q')).data.correction.stale, true);
      assert.equal((await save((await call('owned/q')).data, candidate.data, candidate.id)).status, 409);
    });
    await t.test('edits during recognition fail safely, saved source answers stay private, failures can retry', async () => {
      mode = 'pause'; let signalStarted; const observed = new Promise(resolve => { signalStarted = resolve; }); started = signalStarted;
      const operation = call('owned/q/correction', 'alice', 'POST', composite(2)); await observed;
      const current = (await call('owned/q')).data; const data = structuredClone(current); data.personal.correctionSummary = '辨識途中修改';
      await save(current, data); mode = 'valid'; release();
      assert.equal((await operation).data.data.status, 'failed');
      const saved = await call('saved/saved/correction', 'bob', 'POST', composite(3, 'snap'));
      assert.equal(saved.data.data.status, 'complete'); assert.equal(saved.data.data.data.personal.originalAnswer, null, 'original source authors choice is never attributed to the saver');
      const savedCurrent = (await call('saved/saved', 'bob')).data;
      const retained = structuredClone(saved.data.data.data); retained.personal.originalAnswer = { kind: 'text', text: '舊版本本人答案' };
      assert.equal((await call('saved/saved', 'bob', 'PATCH', { expectedRowVersion: savedCurrent.rowVersion, expectedSourceVersion: savedCurrent.sourceVersion, data: retained, correctionId: saved.data.data.id })).status, 200);
      await sql(`INSERT INTO saved_snapshots(id,saved_ref_id,image_asset_id,source_title,collection_title,provider_public_name,source_text,source_content_seq,source_shared_seq)
        VALUES('snap2','saved','image','更新題目','集合','author','新版文字',2,0); UPDATE saved_refs SET current_snapshot_id='snap2' WHERE id='saved';`);
      assert.equal((await call('saved/saved', 'bob')).data.sourceUpdated, true);
      const updatedSource = await call('saved/saved/correction', 'bob', 'POST', composite(6, 'snap2'));
      assert.equal(updatedSource.data.data.data.personal.originalAnswer, null);
      const sourceInput = JSON.parse(bodies.at(-1).contents[0].parts[0].text.split('資料：').at(-1));
      assert.equal(sourceInput.current.content.ocrText, null, 'a new retained source cannot silently reuse old question text and personal answers');
      mode = 'fail'; assert.equal((await call('owned/q/correction', 'alice', 'POST', composite(4))).data.data.status, 'failed');
      mode = 'valid'; assert.equal((await call('owned/q/correction', 'alice', 'POST', composite(4))).data.data.status, 'complete');
    });
    await t.test('upstream billing failure preserves confirmed data, does not retry and can recover',async()=>{
      const before=(await call('owned/q')).data,count=calls;mode='billing';
      const result=(await call('owned/q/correction','alice','POST',composite(9))).data.data;
      assert.equal(result.status,'failed');assert.match(result.error,/額度不足/);assert.equal(calls,count+1);
      const after=(await call('owned/q')).data;assert.deepEqual(after.content,before.content);assert.deepEqual(after.personal,before.personal);assert.equal(after.rowVersion,before.rowVersion);
      mode='valid';assert.equal((await call('owned/q/correction','alice','POST',composite(9))).data.data.status,'complete');
    });
    await t.test('handwritten correction suggests scoped IDs without confirming them', async () => {
      await sql(`INSERT INTO taxonomies(id,label,level) VALUES('math','數學',0); UPDATE items SET topic_id='math',keywords='["條件機率"]' WHERE id='q';`);
      mode = 'structured';
      const form = composite(11); form.delete('notes');
      const result = (await call('owned/q/correction', 'alice', 'POST', form)).data.data;
      assert.equal(result.status, 'complete');
      const mathPrompt = bodies.at(-1).contents[0].parts[0].text;
      assert.match(mathPrompt, /乘以已知負數後未反轉不等號/);
      assert.doesNotMatch(mathPrompt, /代入速率公式前未統一時間單位/);
      assert.deepEqual(result.data.personal.errorReasons.map(r => r.weaknessId), ['math-conditional-sample', undefined]);
      assert.equal(result.data.personal.errorReasons[1].text, '抄寫時把次數記反');
      assert.equal(result.data.personal.errorReasons[0].accepted, undefined);
      const current = (await call('owned/q')).data, data = structuredClone(result.data);
      data.personal.errorReasons[0].accepted = true;
      data.personal.errorReasons[1].accepted = true;
      const adopted = await save(current, data, result.id);
      assert.equal(adopted.status, 200, JSON.stringify(adopted.data));
      assert.ok(adopted.data.personal.errorReasons[0].confirmedAt);
      assert.equal(adopted.data.personal.errorReasons[1].text, '抄寫時把次數記反');
    });
    await t.test('a subject without a weakness catalog still gets its own correction examples', async () => {
      await sql(`INSERT INTO taxonomies(id,label,level) VALUES('physics','物理',0);
        INSERT INTO items(id,user_id,image_url,status,topic_id) VALUES('q-physics','alice','image','resolved','physics');`);
      mode = 'valid';
      const result = (await call('owned/q-physics/correction', 'alice', 'POST', composite(12))).data.data;
      assert.equal(result.status, 'complete');
      const prompt = bodies.at(-1).contents[0].parts[0].text;
      assert.match(prompt, /代入速率公式前未統一時間單位/);
      assert.match(prompt, /把位置時間圖的縱座標當成速度/);
      assert.doesNotMatch(prompt, /乘以已知負數後未反轉不等號/);
      assert.deepEqual(JSON.parse(prompt.split('資料：').at(-1)).catalog, []);
    });
    await t.test('deleting a personal source cleans its recognition candidates', async () => {
      await db.exec("DELETE FROM items WHERE id='q';");
      assert.equal((await db.prepare("SELECT count(*) n FROM learning_corrections WHERE item_id='q'").first()).n, 0);
      assert.equal((await call('owned/q')).status, 404);
    });
  } finally { if (mf) await mf.dispose(); await rm(dir, { recursive: true, force: true }); }
});
