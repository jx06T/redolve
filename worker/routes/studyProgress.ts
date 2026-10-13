import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authMiddleware } from '../middleware/auth';
import type { Bindings, Variables } from '../types';
import { defaultProgressPreferences, validProgressId, validProgressMetadata, validProgressOrder } from '../../src/types/studyProgress';
import type { ProgressPlan, ProgressPreferences } from '../../src/types/studyProgress';

type Row = ProgressPlan & { deleted_at: number | null };
const fields = 'id,name,unit,target_count,completed_count,created_at,updated_at,row_version,deleted_at';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const publicPlan = ({ deleted_at: _deleted, ...plan }: Row) => plan;
function preferences(raw: Record<string, unknown> | null): ProgressPreferences {
  if (!raw) return { ...defaultProgressPreferences };
  let order: unknown; try { order = JSON.parse(String(raw.plan_order)); } catch { order = []; }
  return { visible: !!raw.visible, order: validProgressOrder(order) ? order : [], row_version: Number(raw.row_version) };
}
export const studyProgressRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
studyProgressRouter.use('*', authMiddleware);
studyProgressRouter.use('*', async (c, next) => {
  if (c.req.query('account_id') && c.req.query('account_id') !== c.get('userId')) return c.json({ error: '帳號已切換，請重新登入' }, 401);
  await next();
});
studyProgressRouter.use('*', bodyLimit({ maxSize: 196608, onError: c => c.json({ error: '內容過大' }, 413) }));
studyProgressRouter.onError((error, c) => {
  if (/no such table:\s*study_progress_(plans|preferences|operations)\b/i.test(String(error))) return c.json({ error: '學習計畫尚未啟用', code: 'PROGRESS_SCHEMA_PENDING' }, 503);
  throw error;
});
async function list(db: D1Database, user: string, operationIds: string[] = []) {
  // One snapshot reconciles accepted operations and counts together: lost HTTP
  // responses must not make a durable local +1 count twice after reload.
  const result = await db.batch([
    db.prepare(`SELECT ${fields} FROM study_progress_plans WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at,id`).bind(user),
    db.prepare('SELECT visible,plan_order,row_version FROM study_progress_preferences WHERE user_id=?').bind(user),
    ...(operationIds.length ? [db.prepare('SELECT id FROM study_progress_operations WHERE user_id=? AND applied=1 AND id IN (SELECT value FROM json_each(?))').bind(user, JSON.stringify(operationIds))] : []),
  ]);
  return { plans: (result[0].results as Row[]).map(publicPlan), preferences: preferences(result[1].results[0] as Record<string, unknown> || null), acknowledged: ((result[2]?.results || []) as { id: string }[]).map(row => row.id) };
}
studyProgressRouter.get('/', async c => c.json(await list(c.env.DB, c.get('userId'))));
studyProgressRouter.post('/sync', async c => {
  const b = await c.req.json().catch(() => null);
  if (!object(b) || !Array.isArray(b.operation_ids) || b.operation_ids.length > 2000 || !b.operation_ids.every(validProgressId)) return c.json({ error: '同步格式無效' }, 400);
  return c.json(await list(c.env.DB, c.get('userId'), b.operation_ids));
});
studyProgressRouter.post('/plans', async c => {
  const b = await c.req.json().catch(() => null), user = c.get('userId'), now = Date.now();
  if (!object(b) || !validProgressId(b.id) || !validProgressMetadata(b) || b.created_at !== undefined && (typeof b.created_at !== 'number' || !Number.isSafeInteger(b.created_at) || b.created_at < 0 || b.created_at > now + 300000)) return c.json({ error: '請輸入名稱、單位與有效目標' }, 400);
  await c.env.DB.prepare(`INSERT INTO study_progress_plans(id,user_id,name,unit,target_count,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM study_progress_plans WHERE user_id=? AND deleted_at IS NULL)<100 ON CONFLICT(id) DO NOTHING`).bind(b.id, user, String(b.name).trim(), String(b.unit).trim(), b.target_count, b.created_at ?? now, now, user).run();
  const row = await c.env.DB.prepare(`SELECT ${fields} FROM study_progress_plans WHERE id=? AND user_id=?`).bind(b.id, user).first<Row>();
  if (!row) return c.json({ error: '已達計畫上限或無法建立此計畫' }, 409);
  if (row.deleted_at !== null) return c.json({ error: '計畫已移除', current: null }, 410);
  return c.json({ plan: publicPlan(row) });
});
studyProgressRouter.patch('/plans/:id', async c => {
  const b = await c.req.json().catch(() => null), user = c.get('userId');
  if (!object(b) || !object(b.patch) || !object(b.base)) return c.json({ error: '修改格式無效' }, 400);
  const patch = b.patch, base = b.base, keys = Object.keys(patch);
  if (!keys.length || keys.some(k => !['name', 'unit', 'target_count'].includes(k) || !Object.hasOwn(base, k))) return c.json({ error: '修改欄位無效' }, 400);
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await c.env.DB.prepare(`SELECT ${fields} FROM study_progress_plans WHERE id=? AND user_id=?`).bind(c.req.param('id'), user).first<Row>();
    if (!row) return c.json({ error: '找不到計畫' }, 404);
    if (row.deleted_at !== null) return c.json({ error: '計畫已移除', current: null }, 410);
    if (!validProgressMetadata({ ...row, ...patch })) return c.json({ error: '名稱、單位或目標無效' }, 400);
    for (const k of ['name', 'unit']) if (typeof patch[k] === 'string') patch[k] = (patch[k] as string).trim();
    if (keys.some(k => !same(row[k as keyof Row], base[k]) && !same(row[k as keyof Row], patch[k]))) return c.json({ error: '相同欄位已修改', current: publicPlan(row) }, 409);
    if (keys.every(k => same(row[k as keyof Row], patch[k]))) return c.json({ plan: publicPlan(row) });
    const now = Date.now();
    const result = await c.env.DB.prepare(`UPDATE study_progress_plans SET ${keys.map(k => k + '=?').join(',')},updated_at=?,row_version=row_version+1 WHERE id=? AND user_id=? AND row_version=? AND deleted_at IS NULL`).bind(...keys.map(k => patch[k]), now, row.id, user, row.row_version).run();
    if (result.meta.changes) return c.json({ plan: { ...publicPlan(row), ...patch, updated_at: now, row_version: row.row_version + 1 } });
  }
  return c.json({ error: '計畫正在更新，請重試' }, 503);
});
studyProgressRouter.post('/plans/:id/step', async c => {
  const b = await c.req.json().catch(() => null), user = c.get('userId'), id = c.req.param('id'), now = Date.now();
  if (!object(b) || !validProgressId(b.operation_id) || ![1, -1].includes(Number(b.delta)) || typeof b.delta !== 'number') return c.json({ error: '計次格式無效' }, 400);
  const result = await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO study_progress_operations(id,user_id,plan_id,delta,effect,created_at) SELECT ?,?,?,?,CASE WHEN ?=1 AND completed_count<target_count THEN 1 WHEN ?=-1 AND completed_count>0 THEN -1 ELSE 0 END,? FROM study_progress_plans WHERE id=? AND user_id=? AND deleted_at IS NULL ON CONFLICT(id) DO NOTHING`).bind(b.operation_id, user, id, b.delta, b.delta, b.delta, now, id, user),
    c.env.DB.prepare(`UPDATE study_progress_plans SET completed_count=completed_count+(SELECT effect FROM study_progress_operations WHERE id=?),updated_at=?,row_version=row_version+1 WHERE id=? AND user_id=? AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM study_progress_operations WHERE id=? AND user_id=? AND plan_id=? AND delta=? AND applied=0 AND effect!=0)`).bind(b.operation_id, now, id, user, b.operation_id, user, id, b.delta),
    c.env.DB.prepare('UPDATE study_progress_operations SET applied=1 WHERE id=? AND user_id=? AND plan_id=? AND delta=? AND applied=0').bind(b.operation_id, user, id, b.delta),
    c.env.DB.prepare(`SELECT ${fields} FROM study_progress_plans WHERE id=? AND user_id=?`).bind(id, user),
    c.env.DB.prepare('SELECT plan_id,delta,effect FROM study_progress_operations WHERE id=? AND user_id=? AND applied=1').bind(b.operation_id, user),
  ]);
  const row = result[3].results[0] as Row | undefined, receipt = result[4].results[0] as { plan_id: string; delta: number; effect: number } | undefined;
  if (!row) return c.json({ error: '找不到計畫' }, 404);
  if (row.deleted_at !== null) return c.json({ error: '計畫已移除', current: null }, 410);
  if (!receipt || receipt.plan_id !== id || receipt.delta !== b.delta) return c.json({ error: '操作識別已使用，請重新同步' }, 409);
  return c.json({ plan: publicPlan(row), effect: receipt.effect });
});
studyProgressRouter.delete('/plans/:id', async c => {
  const b = await c.req.json().catch(() => null), user = c.get('userId');
  if (!object(b) || !object(b.base)) return c.json({ error: '刪除格式無效' }, 400);
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await c.env.DB.prepare(`SELECT ${fields} FROM study_progress_plans WHERE id=? AND user_id=?`).bind(c.req.param('id'), user).first<Row>();
    if (!row) return c.json({ error: '找不到計畫' }, 404);
    if (row.deleted_at !== null) return c.json({ plan: null });
    if (['name', 'unit', 'target_count', 'completed_count'].some(k => !same(row[k as keyof Row], (b.base as Record<string, unknown>)[k]))) return c.json({ error: '計畫已修改，請確認後移除', current: publicPlan(row) }, 409);
    const now = Date.now();
    const result = await c.env.DB.prepare("UPDATE study_progress_plans SET name='',unit='',target_count=1,completed_count=0,deleted_at=?,updated_at=?,row_version=row_version+1 WHERE id=? AND user_id=? AND row_version=? AND deleted_at IS NULL").bind(now, now, row.id, user, row.row_version).run();
    if (result.meta.changes) return c.json({ plan: null });
  }
  return c.json({ error: '計畫正在更新，請重試' }, 503);
});
studyProgressRouter.patch('/preferences', async c => {
  const b = await c.req.json().catch(() => null), user = c.get('userId');
  if (!object(b) || !object(b.patch) || !object(b.base)) return c.json({ error: '設定格式無效' }, 400);
  const keys = Object.keys(b.patch), patch = b.patch, base = b.base;
  if (!keys.length || keys.some(k => k === 'order' ? !validProgressOrder(patch[k]) || !validProgressOrder(base[k]) : k !== 'visible' || typeof patch[k] !== 'boolean' || typeof base[k] !== 'boolean')) return c.json({ error: '設定欄位無效' }, 400);
  if (keys.includes('order')) {
    const rows = await c.env.DB.prepare('SELECT id FROM study_progress_plans WHERE user_id=? AND id IN (SELECT value FROM json_each(?))').bind(user, JSON.stringify(patch.order)).all<{ id: string }>();
    const own = new Set(rows.results.map(row => row.id));
    if ((patch.order as string[]).some(id => !own.has(id))) return c.json({ error: '排序包含無法使用的計畫' }, 400);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await c.env.DB.prepare('SELECT visible,plan_order,row_version FROM study_progress_preferences WHERE user_id=?').bind(user).first();
    const current = preferences(raw);
    if (keys.some(k => !same(current[k as keyof ProgressPreferences], base[k]) && !same(current[k as keyof ProgressPreferences], patch[k]))) return c.json({ error: '設定已修改', current }, 409);
    if (keys.every(k => same(current[k as keyof ProgressPreferences], patch[k]))) return c.json({ preferences: current });
    const columns = keys.map(k => k === 'order' ? 'plan_order' : 'visible'), values = keys.map(k => k === 'order' ? JSON.stringify(patch[k]) : +(patch[k] as boolean)), now = Date.now();
    const result = raw ? await c.env.DB.prepare(`UPDATE study_progress_preferences SET ${columns.map(k => k + '=?').join(',')},updated_at=?,row_version=row_version+1 WHERE user_id=? AND row_version=?`).bind(...values, now, user, current.row_version).run()
      : await c.env.DB.prepare(`INSERT INTO study_progress_preferences(user_id,${columns.join(',')},updated_at,row_version) VALUES(?,${columns.map(() => '?').join(',')},?,1) ON CONFLICT(user_id) DO NOTHING`).bind(user, ...values, now).run();
    if (result.meta.changes) return c.json({ preferences: { ...current, ...patch, row_version: current.row_version + 1 } });
  }
  return c.json({ error: '設定正在更新，請重試' }, 503);
});
