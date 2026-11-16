import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, Response as MFResponse } from 'miniflare';
import { sign } from 'hono/jwt';
import { unstable_splitSqlQuery } from 'wrangler';
import { practiceSchemaStatus } from '../scripts/practice-schema.mjs';

test('admin correction batches: durable jobs, versions, recovery and safe imports', async t => {
  await mkdir('.wrangler/qa', { recursive: true });
  const dir = await mkdtemp(resolve('.wrangler/qa/batches-')); let mf;
  try {
    const bundle = join(dir, 'worker.mjs');
    await build({ entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: bundle, logLevel: 'silent' });
    const google = new Map(); let creates = 0, deletes = 0, nextMode = 'normal';
    const raw = { ocr_text: '計算速率', question_type: 'fill_blank', options: [], original_answer: { kind: 'text', text: '12' },
      correct_answer: { kind: 'text', text: '3' }, error_reasons: [], correction_summary: '先統一時間單位。',
      weakness_candidates: [{ text: '代入速率公式前未統一時間單位', weaknessId: null, basis: 'observed_steps', clue: '分鐘未換成秒', target: '先統一單位' }] };
    const json = (body, status = 200) => new MFResponse(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    mf = new Miniflare({ scriptPath: bundle, modules: true, compatibilityDate: '2025-04-01', compatibilityFlags: ['nodejs_compat'],
      d1Databases: ['DB'], r2Buckets: ['STORAGE'], kvNamespaces: ['KV'],
      ratelimits: { UPLOAD_LIMITER: { namespace_id: '77', simple: { limit: 1000, period: 60 } } },
      bindings: { JWT_SECRET: 'batch-test', LEARNING_ENABLED: 'true', GEMINI_API_KEY: 'fake', ADMIN_EMAILS: 'alice@test,carol@test', GEMINI_CORRECTION_MODEL: 'qa-batch' },
      outboundService: async req => {
        const url = new URL(req.url);
        if (req.method === 'POST' && url.pathname.endsWith(':batchGenerateContent')) {
          creates++;
          if (nextMode === 'missing') { nextMode = 'normal'; return json({ error: { code: 503, message: 'not available' } }, 503); }
          if (nextMode === 'reject') { nextMode = 'normal'; return json({ error: { code: 400, message: 'unsupported model', status: 'INVALID_ARGUMENT' } }, 400); }
          const body = await req.json(), name = `batches/test-${creates}`;
          const requests = body.batch.inputConfig.requests.requests;
          const job = { name, metadata: { displayName: body.batch.displayName, model: 'models/qa-batch', state: 'JOB_STATE_PENDING' }, requests };
          google.set(name, job);
          if (nextMode === 'lost') { nextMode = 'normal'; return json({ error: { code: 503, message: 'lost create response' } }, 503); }
          return json(job);
        }
        if (req.method === 'GET' && url.pathname.endsWith('/batches')) return json({ operations: [...google.values()] });
        const name = url.pathname.replace('/v1beta/', ''), job = google.get(name);
        if (req.method === 'DELETE') { deletes++; google.delete(name); return json({}); }
        if (!job) return json({ error: { code: 404, message: 'missing' } }, 404);
        if (job.metadata.state === 'JOB_STATE_SUCCEEDED') {
          return json({ ...job, metadata: { ...job.metadata, output: { inlinedResponses: { inlinedResponses: job.requests.map((r, i) =>
            job.failIndex === i ? { metadata: r.metadata, error: { code: 13, message: 'individual failure' } } : { metadata: r.metadata,
              response: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(raw) }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40 } } }) } } } });
        }
        return json(job);
      } });
    const db = await mf.getD1Database('DB'), storage = await mf.getR2Bucket('STORAGE');
    const sql = async text => { for (const q of unstable_splitSqlQuery(text.replace(/^\s*--[^\r\n]*$/gm, ''))) await db.exec(q.replace(/\r?\n/g, ' ')); };
    const fullSchema = await readFile('worker/schema.sql', 'utf8');
    await sql(fullSchema.split('-- 0022:')[0]);
    await sql(await readFile('worker/migrations/0022_correction_batches.sql', 'utf8'));
    const master = await db.prepare('SELECT name,sql FROM sqlite_master').all();
    assert.deepEqual(practiceSchemaStatus(() => [master], 'worker/migrations/0022_correction_batches.sql').missing, []);
    const tokens = {};
    for (const uid of ['alice', 'bob', 'carol']) {
      await db.prepare('INSERT INTO users(id,email) VALUES(?,?)').bind(uid, `${uid}@test`).run();
      await db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES(?,?,?)').bind(uid, uid, Math.floor(Date.now()/1000)+3600).run();
      tokens[uid] = await sign({ sub: uid, sid: uid, email: `${uid}@test`, exp: Math.floor(Date.now()/1000)+3600 }, 'batch-test');
    }
    await sql(`INSERT INTO assets(id,storage_key) VALUES('image','image'),('ink','ink');
      INSERT INTO taxonomies(id,label,level) VALUES('physics','物理',0);
      INSERT INTO items(id,user_id,image_url,status,topic_id,typed_notes) VALUES('q1','alice','image','resolved','physics','本人筆記'),('q2','alice','image','resolved','physics',''),('q3','alice','image','resolved','physics',''),('q4','alice','image','resolved','physics',''),('q5','alice','image','resolved','physics',''),('q6','alice','image','resolved','physics',''),('foreign','bob','image','resolved','physics','他人筆記');
      INSERT INTO collections(id,owner_id,title,public_name,visibility,lifecycle) VALUES('co','bob','集合','author','public','active');
      INSERT INTO collection_items(id,collection_id,source_item_id,contributor_id,origin_item_key) VALUES('entry','co','foreign','bob','foreign');
      INSERT INTO saved_refs(id,user_id,entry_id,status) VALUES('saved','alice','entry','resolved');
      INSERT INTO saved_snapshots(id,saved_ref_id,image_asset_id,source_title,collection_title,provider_public_name,source_text,source_content_seq,source_shared_seq)
        VALUES('snap','saved','image','保留原題','集合','author','保留題文',1,0);
      UPDATE saved_refs SET current_snapshot_id='snap' WHERE id='saved';
      INSERT INTO personal_workspaces(id,user_id,saved_ref_id,draw_asset_id,typed_notes) VALUES('work','alice','saved','ink','本人訂正');`);
    await storage.put('ink', JSON.stringify({ strokes: [], calcSpaceHeight: 400 }));
    const call = async (path, method = 'GET', body, uid = 'alice') => {
      const form = body instanceof FormData, request = form ? new Request('https://redolve.test', { method, body }) : null;
      const response = await mf.dispatchFetch('https://redolve.test/api/' + path, { method, headers: { Authorization: 'Bearer ' + tokens[uid],
        ...(form ? { 'Content-Type': request.headers.get('Content-Type') } : body ? { 'Content-Type': 'application/json' } : {}) },
        body: form ? await request.arrayBuffer() : body ? JSON.stringify(body) : undefined });
      return { status: response.status, data: await response.json() };
    };
    const base = 'admin/correction-batches';
    const input = async (id, kind = 'owned') => {
      const r = await call(`${base}/input/${kind}/${id}`); assert.equal(r.status, 200, JSON.stringify(r.data));
      const { ink: _ink, imagePath: _path, ...value } = r.data; return value;
    };
    const form = (inputs, id = crypto.randomUUID()) => {
      const f = new FormData(); f.set('id', id); f.set('inputs', JSON.stringify(inputs));
      inputs.forEach((_, i) => f.set(`image${i}`, new Blob([new Uint8Array([255,216,255,i])], { type: 'image/jpeg' }), 'correction.jpg')); return f;
    };
    const complete = () => { for (const job of google.values()) job.metadata.state = 'JOB_STATE_SUCCEEDED'; };
    let job;
    await t.test('only admins can access their own corrected questions; filters are bounded', async () => {
      assert.equal((await call(`${base}/candidates`, 'GET', undefined, 'bob')).status, 403);
      assert.equal((await call(`${base}/input/owned/foreign`)).status, 404);
      assert.equal((await call(`${base}/input/owned/q1`, 'GET', undefined, 'carol')).status, 404);
      const candidates = await call(`${base}/candidates?topic=physics&mode=outdated`);
      assert.equal(candidates.status, 200, JSON.stringify(candidates.data)); assert.equal(candidates.data.candidates.length, 6);
      assert.equal((await call(`${base}/candidates?topic=missing`)).data.candidates.length, 0);
      assert.equal((await call(`${base}/candidates?since=2099-01-01`)).data.candidates.length, 0);
      assert.equal(creates, 0);
    });
    await t.test('submit returns a durable job, same request and overlapping jobs do not rebill', async () => {
      const inputs = [await input('q1'), await input('q2')], f = form(inputs);
      const result = await call(base, 'POST', f); assert.equal(result.status, 200, JSON.stringify(result.data)); job = result.data;
      assert.equal(job.status, 'running'); assert.equal(job.items.length, 2); assert.equal(creates, 1);
      assert.equal((await call(base, 'POST', f)).data.id, job.id); assert.equal(creates, 1);
      assert.equal((await call(base, 'POST', form(inputs))).status, 409); assert.equal(creates, 1);
      assert.equal((await call(`${base}/candidates`)).data.candidates.length, 4);
      assert.equal((await call(base, 'GET', undefined, 'carol')).data.jobs.length, 0);
      assert.equal((await call(`${base}/${job.id}/refresh`, 'POST', {}, 'carol')).status, 404);
      const pending = await call(`${base}/${job.id}/refresh`, 'POST', {}); assert.equal(pending.data.status, 'running');
      const question = (await call('learning/owned/q1')).data;
      assert.equal(question.correction.status, 'pending'); assert.equal(question.correction.batchId, job.id);
      const single = new FormData(); single.set('sourceIdentity', 'image'); single.set('force', 'true'); single.set('requestId', 'single-during-batch');
      single.set('image', new Blob([new Uint8Array([255,216,255,7])], { type: 'image/jpeg' }), 'correction.jpg');
      const overlap = await call('learning/owned/q1/correction', 'POST', single);
      assert.equal(overlap.data.data.id, question.correction.id);
      const requests = [...google.values()][0].requests;
      assert.match(requests[0].request.contents[0].parts[0].text, /本人筆記/);
      assert.ok(requests[0].request.generationConfig.responseSchema.properties.weakness_candidates);
    });
    await t.test('changed handwriting is skipped; successful candidates stay unconfirmed; repeat imports are harmless', async () => {
      await db.prepare("UPDATE items SET draw_seq=draw_seq+1 WHERE id='q2'").run(); complete();
      const result = await call(`${base}/${job.id}/refresh`, 'POST', {}); assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.equal(result.data.status, 'complete'); assert.equal(result.data.cleaned, true); assert.equal(deletes, 1);
      assert.equal(result.data.items.filter(i => i.status === 'complete').length, 1);
      assert.equal(result.data.items.filter(i => i.status === 'failed').length, 1);
      const q = (await call('learning/owned/q1')).data;
      assert.equal(q.confirmationStatus, 'ai'); assert.equal(q.personal.correctionSummary, undefined);
      assert.equal(q.correction.data.personal.correctionSummary, raw.correction_summary);
      assert.equal(q.correction.data.personal.errorReasons[0].accepted, undefined);
      assert.equal((await call(`${base}/${job.id}/refresh`, 'POST', {})).data.status, 'complete'); assert.equal(deletes, 1);
      const stats = await db.prepare('SELECT count(*) n FROM correction_run_metadata WHERE context_json IS NOT NULL').first(); assert.equal(stats.n, 0);
      // An edit after import must also block adopting the candidate, in the transaction gate.
      await db.prepare("UPDATE items SET notes_seq=notes_seq+1 WHERE id='q1'").run();
      assert.equal((await call('learning/owned/q1')).data.correction.stale, true);
      assert.equal((await call('learning/owned/q1', 'PATCH', { expectedRowVersion: q.rowVersion, expectedSourceVersion: q.sourceVersion, data: q.correction.data, correctionId: q.correction.id })).status, 409);
    });
    await t.test('retained saved sources use only personal workspace and can adopt a batch candidate', async () => {
      const savedInput = (await call(`${base}/input/saved/saved`)).data;
      assert.match(savedInput.ink, /strokes/); assert.equal(savedInput.imagePath, '/saved/saved/image');
      const savedJob = (await call(base, 'POST', form([await input('saved', 'saved')]))).data;
      const prompt = [...google.values()][0].requests[0].request.contents[0].parts[0].text;
      assert.match(prompt, /本人訂正/); assert.doesNotMatch(prompt, /他人筆記/);
      complete(); await call(`${base}/${savedJob.id}/refresh`, 'POST', {});
      const q = (await call('learning/saved/saved')).data;
      assert.equal(q.correction.data.personal.originalAnswer, null);
      const saved = await call('learning/saved/saved', 'PATCH', { expectedRowVersion: q.rowVersion, expectedSourceVersion: q.sourceVersion, data: q.correction.data, correctionId: q.correction.id });
      assert.equal(saved.status, 200, JSON.stringify(saved.data)); assert.equal(saved.data.correction.adopted, true);
    });
    await t.test('lost submission response is recovered without another create call', async () => {
      nextMode = 'lost'; const lost = (await call(base, 'POST', form([await input('q3')]))).data, count = creates;
      assert.equal(lost.status, 'unknown');
      const found = await call(`${base}/${lost.id}/refresh`, 'POST', {}); assert.equal(found.status, 200, JSON.stringify(found.data));
      assert.equal(found.data.status, 'running'); assert.equal(creates, count);
      const cancelled = await call(`${base}/${lost.id}/cancel`, 'POST', {}); assert.equal(cancelled.data.status, 'cancelled'); assert.equal(cancelled.data.items[0].status, 'failed');
    });
    await t.test('individual failures and rejected submissions remain retryable', async () => {
      const partial = (await call(base, 'POST', form([await input('q4'), await input('q5')]))).data;
      [...google.values()][0].failIndex = 1; complete();
      const result = await call(`${base}/${partial.id}/refresh`, 'POST', {}); assert.equal(result.data.items.filter(i => i.status === 'failed').length, 1);
      nextMode = 'reject'; const failed = (await call(base, 'POST', form([await input('q6')]))).data;
      assert.equal(failed.status, 'failed'); assert.equal(failed.cleaned, true);
      assert.equal((await call(base, 'POST', form([await input('q6')]))).data.status, 'running');
    });
    await t.test('unrecoverable submissions release their question after the expiry window', async () => {
      nextMode = 'missing';
      const missing = (await call(base, 'POST', form([await input('q3')]))).data;
      const count = creates;
      assert.equal((await call(`${base}/${missing.id}/refresh`, 'POST', {})).data.status, 'unknown');
      await db.prepare('UPDATE correction_batches SET created_at=? WHERE id=?')
        .bind(new Date(Date.now() - 49 * 3600000).toISOString(), missing.id).run();
      const expired = (await call(`${base}/${missing.id}/refresh`, 'POST', {})).data;
      assert.equal(expired.status, 'failed'); assert.equal(expired.items[0].status, 'failed'); assert.equal(creates, count);
      assert.ok((await call(`${base}/candidates`)).data.candidates.some(c => c.ref.itemId === 'q3'));
    });
    await t.test('model and prompt version filters are explicit; deleting questions removes contexts', async () => {
      const before = (await call(`${base}/candidates?mode=outdated`)).data.candidates.map(c => c.ref.itemId);
      assert.ok(!before.includes('q4'));
      await db.prepare("UPDATE correction_run_metadata SET prompt_version='old' WHERE correction_id IN (SELECT id FROM learning_corrections WHERE item_id='q4')").run();
      const after = (await call(`${base}/candidates?mode=outdated`)).data.candidates.map(c => c.ref.itemId); assert.ok(after.includes('q4'));
      await db.prepare("DELETE FROM items WHERE id='q6'").run();
      assert.equal((await db.prepare('SELECT count(*) n FROM correction_run_metadata WHERE context_json IS NOT NULL').first()).n, 0);
    });
  } finally { if (mf) await mf.dispose(); await rm(dir, { recursive: true, force: true }); }
});
