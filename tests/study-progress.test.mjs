import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { sign } from 'hono/jwt';
import { unstable_splitSqlQuery } from 'wrangler';

test('study plans: private atomic steps, reconciliation, metadata and migration compatibility', async t => {
  await mkdir('.wrangler/qa', { recursive: true });
  const dir = await mkdtemp(resolve('.wrangler/qa/progress-')); let mf;
  try {
    const file = join(dir, 'worker.mjs');
    await build({ entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: file, logLevel: 'silent' });
    mf = new Miniflare({ scriptPath: file, modules: true, compatibilityDate: '2025-04-01', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['STORAGE'], kvNamespaces: ['KV'], bindings: { JWT_SECRET: 'plan-test' } });
    const db = await mf.getD1Database('DB');
    await db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT); CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER);');
    const tokens = {};
    for (const user of ['one', 'two']) {
      await db.prepare('INSERT INTO users VALUES(?,?)').bind(user, user + '@example.test').run();
      await db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').bind(user, user, Math.floor(Date.now()/1000)+3600).run();
      tokens[user] = await sign({ sub: user, sid: user, exp: Math.floor(Date.now()/1000)+3600 }, 'plan-test');
    }
    const call = async (path = '', method = 'GET', body, user = 'one') => {
      const res = await mf.dispatchFetch('https://redolve.test/api/progress-plans' + path, { method, headers: { ...(user ? { Authorization: 'Bearer ' + tokens[user] } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: res.status, data: await res.json(), cache: res.headers.get('Cache-Control') };
    };
    const step = (operation_id, delta = 1, user = 'one') => call('/plans/plan-original/step', 'POST', { operation_id, delta }, user);
    await t.test('missing migration is explicit and requires auth before any read', async () => {
      assert.equal((await call('', 'GET', undefined, '')).status, 401);
      const r = await call(); assert.equal(r.status, 503); assert.equal(r.data.code, 'PROGRESS_SCHEMA_PENDING');
      assert.equal((await call('?account_id=two')).status, 401);
    });
    const sql = (await readFile('worker/migrations/0012_study_progress.sql', 'utf8')).replace(/^\s*--[^\r\n]*$/gm, '');
    for (let i=0; i<2; i++) for (const query of unstable_splitSqlQuery(sql)) await db.exec(query.replace(/\r?\n/g, ' '));
    let plan;
    await t.test('private defaults and idempotent owner-only create', async () => {
      const r = await call(); assert.deepEqual(r.data.plans, []); assert.equal(r.data.preferences.visible, true); assert.match(r.cache, /no-store/);
      plan = (await call('/plans', 'POST', { id: 'plan-original', name: '數學講義', unit: '章', target_count: 12 })).data.plan;
      assert.equal(plan.completed_count, 0);
      assert.equal((await call('/plans', 'POST', { id: plan.id, name: '不得覆蓋', unit: '回', target_count: 100 })).data.plan.name, '數學講義');
      assert.equal((await call('', 'GET', undefined, 'two')).data.plans.length, 0);
      assert.equal((await step('foreign-step-123', 1, 'two')).status, 404);
      for (const target_count of [0, 1.5, 1000001]) assert.equal((await call('/plans','POST',{ id:'bad-plan-123',name:'test',unit:'章',target_count })).status,400);
      assert.equal((await call('/plans/'+plan.id, 'PATCH',{ base:{ completed_count:0 },patch:{ completed_count:99 } })).status,400);
    });
    await t.test('same operation exactly once; separate concurrent devices add twice', async () => {
      const a = await step('step-first-123'); assert.equal(a.data.plan.completed_count, 1);
      const retry = await step('step-first-123'); assert.equal(retry.data.plan.completed_count, 1); assert.equal(retry.data.plan.row_version, a.data.plan.row_version);
      assert.equal((await step('step-first-123', -1)).status,409);
      const results = await Promise.all([step('step-device-a'), step('step-device-b')]); assert.ok(results.every(r=>r.status===200));
      assert.equal((await call()).data.plans[0].completed_count,3);
      const sync = await call('/sync','POST',{ operation_ids:['step-first-123','step-device-a','not-sent-step'] });
      assert.deepEqual(sync.data.acknowledged.sort(),['step-device-a','step-first-123']); assert.equal(sync.data.plans[0].completed_count,3);
      assert.deepEqual((await call('/sync','POST',{ operation_ids:['step-first-123'] },'two')).data.acknowledged,[]);
    });
    await t.test('metadata preserves counts; lower goals do not truncate; bounds are idempotent', async () => {
      let r = await call('/plans/'+plan.id,'PATCH',{ base:{ target_count:12 },patch:{ target_count:2 } });
      assert.equal(r.data.plan.completed_count,3);
      r = await step('step-reduce-123',-1); assert.equal(r.data.plan.completed_count,2);
      const version=r.data.plan.row_version;
      r = await step('step-full-123'); assert.equal(r.data.effect,0); assert.equal(r.data.plan.completed_count,2); assert.equal(r.data.plan.row_version,version);
      await step('step-minus-one',-1); await step('step-minus-two',-1);
      r = await step('step-at-zero-1',-1); assert.equal(r.data.effect,0); assert.equal(r.data.plan.completed_count,0);
      r = await call('/plans/'+plan.id,'PATCH',{ base:{ name:'數學講義' },patch:{ name:'新版講義' } }); assert.equal(r.status,200);
      assert.equal((await call('/plans/'+plan.id,'PATCH',{ base:{ name:'數學講義' },patch:{ name:'另一份名稱' } })).status,409);
      r = await call('/plans/'+plan.id,'PATCH',{ base:{ unit:'章' },patch:{ unit:'回' } }); assert.equal(r.status,200); assert.equal(r.data.plan.name,'新版講義');
    });
    await t.test('failed batch rolls back receipt and counter together', async () => {
      await db.prepare("CREATE TRIGGER test_plan_failure BEFORE UPDATE OF applied ON study_progress_operations WHEN NEW.id='failed-step-123' BEGIN SELECT RAISE(ABORT,'test failure'); END").run();
      assert.equal((await step('failed-step-123')).status,500);
      assert.equal((await call()).data.plans[0].completed_count,0);
      assert.equal(await db.prepare("SELECT id FROM study_progress_operations WHERE id='failed-step-123'").first(),null);
      await db.exec('DROP TRIGGER test_plan_failure');
      assert.equal((await step('failed-step-123')).data.plan.completed_count,1);
    });
    await t.test('sorting and visibility merge independently without exposing foreign plans', async () => {
      const b=(await call('/plans','POST',{ id:'plan-second-123',name:'英文',unit:'章',target_count:20 })).data.plan;
      let r=await call('/preferences','PATCH',{ base:{ order:[] },patch:{ order:[b.id,plan.id] } }); assert.equal(r.status,200);
      const version=r.data.preferences.row_version;
      r=await call('/preferences','PATCH',{ base:{ order:[] },patch:{ order:[b.id,plan.id] } }); assert.equal(r.data.preferences.row_version,version);
      assert.equal((await call('/preferences','PATCH',{ base:{ order:[] },patch:{ order:[plan.id,b.id] } })).status,409);
      r=await call('/preferences','PATCH',{ base:{ visible:true },patch:{ visible:false } }); assert.deepEqual(r.data.preferences.order,[b.id,plan.id]);
      for (const order of [[plan.id,plan.id],['unknown-plan']]) assert.equal((await call('/preferences','PATCH',{ base:{ order:[b.id,plan.id] },patch:{ order } })).status,400);
      assert.equal((await call('/preferences','PATCH',{ base:{ order:[] },patch:{ order:[plan.id] } },'two')).status,400);
    });
    await t.test('deletion protects unseen progress and never resurrects offline changes', async () => {
      assert.equal((await call('/plans/'+plan.id,'DELETE',{ base:plan })).status,409);
      plan=(await call()).data.plans.find(p=>p.id===plan.id);
      assert.equal((await call('/plans/'+plan.id,'DELETE',{ base:plan })).status,200);
      assert.equal((await step('after-delete-123')).status,410);
      assert.equal((await call('/plans','POST',{ id:plan.id,name:'復活',unit:'章',target_count:20 })).status,410);
      const raw=await db.prepare('SELECT name,unit,completed_count FROM study_progress_plans WHERE id=?').bind(plan.id).first();
      assert.deepEqual(raw,{ name:'',unit:'',completed_count:0 });
    });
    await t.test('list and receipt lookups use owner/primary indexes', async () => {
      const list=await db.prepare('EXPLAIN QUERY PLAN SELECT id FROM study_progress_plans WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at,id').bind('one').all();
      assert.match(JSON.stringify(list.results),/idx_study_progress_active/);
      const receipts=await db.prepare('EXPLAIN QUERY PLAN SELECT id FROM study_progress_operations WHERE user_id=? AND applied=1 AND id IN (SELECT value FROM json_each(?))').bind('one','["step-first-123"]').all();
      assert.match(JSON.stringify(receipts.results),/sqlite_autoindex_study_progress_operations/);
      assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
    });
  } finally { if (mf) await mf.dispose(); await rm(dir, { recursive:true,force:true }); }
});
