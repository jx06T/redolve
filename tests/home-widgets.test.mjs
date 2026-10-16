import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { sign } from 'hono/jwt';
import { unstable_splitSqlQuery } from 'wrangler';

test('private widgets: authorization, retention, offline retries and concurrent fields', async t => {
  await mkdir('.wrangler/qa', { recursive: true });
  const dir = await mkdtemp(resolve('.wrangler/qa/widgets-')); let mf;
  try {
    const file = join(dir, 'worker.mjs');
    await build({ entryPoints: ['worker/index.ts'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: file, logLevel: 'silent' });
    mf = new Miniflare({ scriptPath: file, modules: true, compatibilityDate: '2025-04-01', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['STORAGE'], kvNamespaces: ['KV'], bindings: { JWT_SECRET: 'widget-test' } });
    const db = await mf.getD1Database('DB');
    await db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT); CREATE TABLE auth_sessions(id TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER);');
    const migration = await readFile('worker/migrations/0009_home_widgets.sql', 'utf8');
    const sql = async () => { for (const q of unstable_splitSqlQuery(migration.replace(/^\s*--[^\r\n]*$/gm, ''))) await db.exec(q.replace(/\r?\n/g, ' ')); };
    await sql(); await sql();
    const tokens = {};
    for (const user of ['one', 'two']) {
      await db.prepare('INSERT INTO users VALUES(?,?)').bind(user, user + '@example.test').run();
      await db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').bind(user, user, Math.floor(Date.now()/1000)+3600).run();
      tokens[user] = await sign({ sub: user, sid: user, exp: Math.floor(Date.now()/1000)+3600 }, 'widget-test');
    }
    const call = async (path = '', method = 'GET', body, user = 'one') => {
      const res = await mf.dispatchFetch('https://redolve.test/api/home-widgets' + path, { method, headers: { ...(user ? { Authorization: 'Bearer ' + tokens[user] } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: res.status, data: res.headers.get('Content-Type')?.includes('json') ? await res.json() : await res.text(), cache: res.headers.get('Cache-Control') };
    };
    const add = (id, kind = 'todo', text = '整理內積') => call('/items', 'POST', { id, kind, text, target_date: kind === 'countdown' ? '2027-01-22' : null });
    await t.test('previous schema keeps widgets working until manual order migration', async () => {
      assert.equal((await call()).status,200);
      const event=(await call('/items','POST',{id:'legacy-countdown',kind:'countdown',text:'舊庫倒數',target_date:'2027-01-22'},'two')).data.item;
      const pending=await call('/preferences','PATCH',{base:{countdown_order:[]},patch:{countdown_order:[event.id]}},'two');
      assert.equal(pending.status,503);assert.equal(pending.data.code,'COUNTDOWN_SCHEMA_PENDING');
      const later=await call('/preferences','PATCH',{base:{countdown_order:[event.id]},patch:{countdown_order:[]}},'two');
      assert.equal(later.status,503,'pending sequences must not turn into false conflicts');
      const visibility=await call('/preferences','PATCH',{base:{todos_visible:true},patch:{todos_visible:false}},'two');
      assert.equal(visibility.status,200);assert.equal(visibility.data.preferences.row_version,1);
      assert.equal((await call('','GET',undefined,'two')).data.preferences.todos_visible,false);
      const todo=await call('/items','POST',{id:'legacy-todo-123',kind:'todo',text:'待辦仍可同步'},'two');assert.equal(todo.status,200);
      await db.prepare('DELETE FROM home_widget_items WHERE user_id=?').bind('two').run();
      await db.prepare('DELETE FROM home_widget_preferences WHERE user_id=?').bind('two').run();
    });
    for(const query of unstable_splitSqlQuery((await readFile('worker/migrations/0010_countdown_order.sql','utf8')).replace(/^\s*--[^\r\n]*$/gm,'')))await db.exec(query.replace(/\r?\n/g,' '));
    await t.test('todo order migration pending does not block countdowns or visibility', async () => {
      const todo = (await call('/items','POST',{id:'legacy-todo-order',kind:'todo',text:'待辦'},'two')).data.item;
      const pending = await call('/preferences','PATCH',{base:{todo_order:[]},patch:{todo_order:[todo.id]}},'two');
      assert.equal(pending.status,503); assert.equal(pending.data.code,'TODO_ORDER_SCHEMA_PENDING');
      assert.equal((await call('/preferences','PATCH',{base:{todos_visible:true},patch:{todos_visible:false}},'two')).status,200);
      assert.deepEqual((await call('','GET',undefined,'two')).data.preferences.todo_order,[]);
      await db.prepare('DELETE FROM home_widget_items WHERE user_id=?').bind('two').run();
      await db.prepare('DELETE FROM home_widget_preferences WHERE user_id=?').bind('two').run();
    });
    for(const query of unstable_splitSqlQuery((await readFile('worker/migrations/0013_todo_organize.sql','utf8')).replace(/^\s*--[^\r\n]*$/gm,'')))await db.exec(query.replace(/\r?\n/g,' '));
    let row;
    await t.test('auth required and private reads use no-store', async () => {
      assert.equal((await call('', 'GET', undefined, '')).status, 401);
      assert.equal((await call('?account_id=two')).status, 401, 'stale tab must not read data into the wrong account cache');
      assert.equal((await call('/items?account_id=two', 'POST', { id: 'wrong-account-123', kind: 'todo', text: '不得寫錯帳號' })).status, 401);
      const empty = await call(); assert.equal(empty.status, 200); assert.deepEqual(empty.data.items, []);
      assert.equal(empty.data.preferences.todos_visible, true); assert.match(empty.cache, /no-store/);
      assert.equal((await db.prepare('SELECT COUNT(*) n FROM home_widget_preferences').first()).n, 0);
    });
    await t.test('create is idempotent and cannot expose another account', async () => {
      row = (await add('todo-123456')).data.item;
      assert.equal((await add(row.id, 'todo', '重送不可覆蓋')).data.item.text, row.text);
      assert.equal((await call('', 'GET', undefined, 'two')).data.items.length, 0);
      assert.equal((await call('/items/'+row.id, 'PATCH', { base: { text: row.text }, patch: { text: '越權' } }, 'two')).status, 404);
      assert.equal((await call('/items/'+row.id, 'DELETE', { base: row }, 'two')).status, 404);
    });
    await t.test('editing text and checking completion merge independently', async () => {
      const completed = Date.now();
      const a = await call('/items/'+row.id, 'PATCH', { base: { text: row.text }, patch: { text: '重新整理內積' } });
      assert.equal(a.status, 200);
      const b = await call('/items/'+row.id, 'PATCH', { base: { completed_at: null }, patch: { completed_at: completed } });
      assert.equal(b.status, 200); assert.equal(b.data.item.text, '重新整理內積'); assert.equal(b.data.item.completed_at, completed);
      const retry = await call('/items/'+row.id, 'PATCH', { base: { completed_at: null }, patch: { completed_at: completed } });
      assert.equal(retry.status, 200); assert.equal(retry.data.item.row_version, b.data.item.row_version);
    });
    await t.test('same-field conflict preserves cloud text for explicit resolution', async () => {
      const r = await call('/items/'+row.id, 'PATCH', { base: { text: row.text }, patch: { text: '另一份修改' } });
      assert.equal(r.status, 409); assert.equal(r.data.current.text, '重新整理內積');
      const resolved = await call('/items/'+row.id, 'PATCH', { base: { text: r.data.current.text }, patch: { text: '另一份修改' } });
      assert.equal(resolved.status, 200); row = resolved.data.item;
    });
    await t.test('deleting unseen changes requires confirmation; tombstones prevent resurrection', async () => {
      assert.equal((await call('/items/'+row.id, 'DELETE', { base: { text: '舊內容' } })).status, 409);
      assert.equal((await call('/items/'+row.id, 'DELETE', { base: row })).status, 200);
      assert.equal((await call('/items/'+row.id, 'DELETE', { base: row })).status, 200);
      assert.equal((await add(row.id)).status, 410);
      assert.equal((await call('/items/'+row.id, 'PATCH', { base: { text: row.text }, patch: { text: '重送' } })).status, 410);
      const tombstone = await db.prepare('SELECT text,target_date,completed_at,deleted_at FROM home_widget_items WHERE id=?').bind(row.id).first();
      assert.equal(tombstone.text, ''); assert.equal(tombstone.completed_at, null); assert.ok(tombstone.deleted_at);
    });
    await t.test('Taiwan seven-day retention keeps unfinished items and day-six completion', async () => {
      const day = Math.floor((Date.now()+8*3600000)/86400000), cutoff = (day-6)*86400000-8*3600000;
      for (const [id, completed] of [['old-finished', cutoff-1], ['six-day-done', cutoff], ['old-unfinished', null]]) {
        await add(id); await db.prepare('UPDATE home_widget_items SET created_at=0,completed_at=? WHERE id=?').bind(completed, id).run();
      }
      const ids = (await call()).data.items.map(i => i.id);
      assert.ok(!ids.includes('old-finished')); assert.ok(ids.includes('six-day-done')); assert.ok(ids.includes('old-unfinished'));
      assert.equal((await db.prepare("SELECT text FROM home_widget_items WHERE id='old-finished'").first()).text, '');
    });
    await t.test('countdowns validate real calendar dates; editing cannot change ownership or kind', async () => {
      assert.equal((await call('/items', 'POST', { id: 'bad-date-123', kind: 'countdown', text: '測試', target_date: '2027-02-29' })).status, 400);
      const c = (await add('countdown-123', 'countdown')).data.item;
      assert.equal((await call('/items/'+c.id, 'PATCH', { base: { completed_at: null }, patch: { completed_at: Date.now() } })).status, 400);
      assert.equal((await call('/items/'+c.id, 'PATCH', { base: { user_id: 'one' }, patch: { user_id: 'two' } })).status, 400);
      assert.equal((await call('/items/'+c.id, 'PATCH', { base: { target_date: c.target_date }, patch: { target_date: '2028-02-29' } })).status, 200);
      assert.equal((await call('/items', 'POST', { id: 'blank-12345', kind: 'todo', text: '  ' })).status, 400);
      assert.equal((await call('/items', 'POST', { id: 'huge-12345', kind: 'todo', text: 'a'.repeat(20000) })).status, 413);
    });
    await t.test('visibility preferences merge per field and remain owner-only', async () => {
      assert.equal((await call('/preferences', 'PATCH', { base: { todos_visible: true }, patch: { todos_visible: false } })).status, 200);
      const r = await call('/preferences', 'PATCH', { base: { countdowns_visible: true }, patch: { countdowns_visible: false } });
      assert.equal(r.status, 200); assert.equal(r.data.preferences.todos_visible, false);
      assert.equal((await call('', 'GET', undefined, 'two')).data.preferences.todos_visible, true);
    });
    await t.test('owner list and expiry queries use partial indexes', async () => {
      const active = await db.prepare("EXPLAIN QUERY PLAN SELECT id FROM home_widget_items WHERE user_id=? AND deleted_at IS NULL ORDER BY kind,created_at,id").bind('one').all();
      assert.match(JSON.stringify(active.results), /idx_home_widgets_active/);
      const expired = await db.prepare("EXPLAIN QUERY PLAN SELECT id FROM home_widget_items WHERE user_id=? AND kind='todo' AND deleted_at IS NULL AND completed_at IS NOT NULL AND completed_at<?").bind('one', Date.now()).all();
      assert.match(JSON.stringify(expired.results), /idx_home_widgets_expiry/);
    });
    await t.test('custom countdown order persists, merges with visibility and conflicts only on order',async()=>{
      const a=(await add('count-order-a','countdown','事件 A')).data.item;
      const b=(await add('count-order-b','countdown','事件 B')).data.item;
      let result=await call('/preferences','PATCH',{base:{countdown_order:[]},patch:{countdown_order:[b.id,a.id]}});
      assert.equal(result.status,200);assert.deepEqual(result.data.preferences.countdown_order,[b.id,a.id]);
      const version=result.data.preferences.row_version;
      result=await call('/preferences','PATCH',{base:{countdown_order:[]},patch:{countdown_order:[b.id,a.id]}});
      assert.equal(result.status,200);assert.equal(result.data.preferences.row_version,version,'retry is idempotent');
      result=await call('/preferences','PATCH',{base:{countdown_order:[]},patch:{countdown_order:[a.id,b.id]}});
      assert.equal(result.status,409);assert.deepEqual(result.data.current.countdown_order,[b.id,a.id]);
      const prefs=(await call()).data.preferences;
      result=await call('/preferences','PATCH',{base:{todos_visible:prefs.todos_visible},patch:{todos_visible:!prefs.todos_visible}});
      assert.equal(result.status,200);assert.deepEqual(result.data.preferences.countdown_order,[b.id,a.id]);
      assert.deepEqual((await call('','GET',undefined,'two')).data.preferences.countdown_order,[]);
      for(const ids of [[a.id,a.id],['not-my-event'],[123]])assert.equal((await call('/preferences','PATCH',{base:{countdown_order:[b.id,a.id]},patch:{countdown_order:ids}})).status,400);
      await call('/items/'+a.id,'DELETE',{base:a});
      assert.equal((await call('/preferences','PATCH',{base:{countdown_order:[b.id,a.id]},patch:{countdown_order:[a.id,b.id]}})).status,200,'offline order accepts own deleted references without reviving them');
      assert.equal((await call('/preferences','PATCH',{base:{countdown_order:[a.id,b.id]},patch:{countdown_order:[b.id]}})).status,200,'removed IDs can be dropped without losing other order');
    });
    await t.test('todo order is private, idempotent, field-scoped and conflict-safe', async () => {
      const a=(await add('todo-order-a')).data.item,b=(await add('todo-order-b')).data.item;
      const foreign=(await call('/items','POST',{id:'foreign-todo-order',kind:'todo',text:'他人'},'two')).data.item;
      const before=(await call()).data.preferences, order=[b.id,a.id];
      let result=await call('/preferences','PATCH',{base:{todo_order:[]},patch:{todo_order:order}});
      assert.equal(result.status,200);assert.deepEqual(result.data.preferences.todo_order,order);
      assert.deepEqual(result.data.preferences.countdown_order,before.countdown_order);
      const version=result.data.preferences.row_version;
      result=await call('/preferences','PATCH',{base:{todo_order:[]},patch:{todo_order:order}});
      assert.equal(result.status,200);assert.equal(result.data.preferences.row_version,version);
      result=await call('/preferences','PATCH',{base:{todo_order:[]},patch:{todo_order:[a.id,b.id]}});
      assert.equal(result.status,409);assert.deepEqual(result.data.current.todo_order,order);
      const cloud=result.data.current;
      result=await call('/preferences','PATCH',{base:{todo_order:cloud.todo_order},patch:{todo_order:[a.id,b.id]}});
      assert.equal(result.status,200);
      result=await call('/preferences','PATCH',{base:{countdown_order:before.countdown_order},patch:{countdown_order:[]}});
      assert.equal(result.status,200);assert.deepEqual(result.data.preferences.todo_order,[a.id,b.id],'countdown responses preserve todo order');
      for(const ids of [[foreign.id],['count-order-b'],[a.id,a.id],[123]]) assert.equal((await call('/preferences','PATCH',{base:{todo_order:[a.id,b.id]},patch:{todo_order:ids}})).status,400);
      assert.deepEqual((await call('','GET',undefined,'two')).data.preferences.todo_order,[]);
      await call('/items/'+a.id,'DELETE',{base:a});
      result=await call('/preferences','PATCH',{base:{todo_order:[a.id,b.id]},patch:{todo_order:[b.id,a.id]}});
      assert.equal(result.status,200,'own deleted IDs remain valid for offline order without resurrecting tasks');
      assert.ok(!(await call()).data.items.some(i=>i.id===a.id));
    });
    await t.test('500 valid 80-character IDs fit both order and conflict base without lifting item limits',async()=>{
      const ids=Array.from({length:500},(_,i)=>'long-todo-'+String(i).padStart(4,'0')+'-'.repeat(66));
      await db.batch(ids.map(id=>db.prepare("INSERT INTO home_widget_items(id,user_id,kind,text,created_at,updated_at,deleted_at) VALUES(?,'one','todo','',0,0,1)").bind(id)));
      const plan=await db.prepare("EXPLAIN QUERY PLAN SELECT w.id FROM home_widget_items w JOIN json_each(?) ids ON w.id=ids.value WHERE w.user_id=? AND w.kind=?").bind(JSON.stringify(ids),'one','todo').all();
      assert.match(JSON.stringify(plan.results),/SEARCH w USING INDEX sqlite_autoindex_home_widget_items/,'order validation must use item IDs, not scan every user');
      const base=(await call()).data.preferences.todo_order;
      assert.equal((await call('/preferences','PATCH',{base:{todo_order:base},patch:{todo_order:ids}})).status,200);
      const result=await call('/preferences','PATCH',{base:{todo_order:ids},patch:{todo_order:[...ids].reverse()}});
      assert.equal(result.status,200);assert.equal(result.data.preferences.todo_order.length,500);
      assert.equal((await call('/preferences','PATCH',{base:{todo_order:[]},patch:{todo_order:[...ids,'too-many-todos']}})).status,400);
    });
  } finally { if (mf) await mf.dispose(); await rm(dir, { recursive: true, force: true }); }
});
