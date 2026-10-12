import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { bodyLimit } from 'hono/body-limit';
import { completionCutoff, defaultWidgetPreferences, validTargetDate } from '../../src/types/homeWidgets';
import type { WidgetItem, WidgetPreferences } from '../../src/types/homeWidgets';

type Row = WidgetItem & { deleted_at: number | null };
const fields = 'id,kind,text,target_date,completed_at,created_at,updated_at,row_version,deleted_at';
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const publicItem = ({ deleted_at: _deleted, ...item }: Row) => item;
const validOrder = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 100
  && value.every(id => typeof id === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(id)) && new Set(value).size === value.length;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const readOrder = (value: unknown): string[] => { try { const ids=typeof value==='string'?JSON.parse(value):value; return validOrder(ids)?ids:[]; } catch { return []; } };
const preferences = (row: Record<string, unknown> | null): WidgetPreferences => row ? {
  todos_visible: !!row.todos_visible, countdowns_visible: !!row.countdowns_visible, countdown_order: readOrder(row.countdown_order), row_version: Number(row.row_version),
} : { ...defaultWidgetPreferences };
export const homeWidgetsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
homeWidgetsRouter.use('*', authMiddleware);
homeWidgetsRouter.use('*', async (c, next) => {
  const expected = c.req.query('account_id');
  if (expected && expected !== c.get('userId')) return c.json({ error: '登入帳號已切換，請重新登入後同步' }, 401);
  await next();
});
homeWidgetsRouter.use('*', bodyLimit({ maxSize: 16384, onError: c => c.json({ error: '內容過大' }, 413) }));

homeWidgetsRouter.get('/', async c => {
  const user = c.get('userId'), now = Date.now();
  const result = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE home_widget_items SET text='',target_date=NULL,completed_at=NULL,deleted_at=?,updated_at=?,row_version=row_version+1 WHERE user_id=? AND kind='todo' AND deleted_at IS NULL AND completed_at IS NOT NULL AND completed_at<?").bind(now, now, user, completionCutoff(now)),
    c.env.DB.prepare(`SELECT ${fields} FROM home_widget_items WHERE user_id=? AND deleted_at IS NULL ORDER BY kind,created_at,id`).bind(user),
    c.env.DB.prepare('SELECT * FROM home_widget_preferences WHERE user_id=?').bind(user),
  ]);
  return c.json({ items: (result[1].results as Row[]).map(publicItem), preferences: preferences(result[2].results[0] as Record<string, unknown> || null) });
});

homeWidgetsRouter.post('/items', async c => {
  const b = await c.req.json().catch(() => null);
  if (!object(b) || typeof b.id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(b.id)
    || !['todo', 'countdown'].includes(String(b.kind)) || typeof b.text !== 'string' || !b.text.trim() || b.text.length > 500
    || b.kind === 'countdown' && !validTargetDate(b.target_date)
    || b.created_at !== undefined && (typeof b.created_at !== 'number' || !Number.isSafeInteger(b.created_at) || b.created_at < 0 || b.created_at > Date.now() + 300000)) return c.json({ error: '請填寫有效的名稱與日期' }, 400);
  const user = c.get('userId'), now = Date.now();
  // The cap counts active rows through the owner index; never truncate unfinished tasks.
  await c.env.DB.prepare(`INSERT INTO home_widget_items(id,user_id,kind,text,target_date,created_at,updated_at)
    SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM home_widget_items WHERE user_id=? AND kind=? AND deleted_at IS NULL)<? ON CONFLICT(id) DO NOTHING`)
    .bind(b.id, user, b.kind, b.text.trim(), b.kind === 'countdown' ? b.target_date : null, b.created_at ?? now, now, user, b.kind, b.kind === 'todo' ? 500 : 100).run();
  const row = await c.env.DB.prepare(`SELECT ${fields} FROM home_widget_items WHERE id=? AND user_id=?`).bind(b.id, user).first<Row>();
  if (!row) return c.json({ error: '已達小組件數量上限，或無法建立這個項目' }, 409);
  if (row.deleted_at !== null) return c.json({ error: '項目已移除', current: null }, 410);
  return c.json({ item: publicItem(row) });
});

homeWidgetsRouter.patch('/items/:id', async c => {
  const b = await c.req.json().catch(() => null);
  if (!object(b) || !object(b.patch) || !object(b.base)) return c.json({ error: '修改格式無效' }, 400);
  const keys = Object.keys(b.patch);
  if (!keys.length || keys.some(k => !['text', 'target_date', 'completed_at'].includes(k) || !Object.hasOwn(b.base as object, k))) return c.json({ error: '修改欄位無效' }, 400);
  const patch = b.patch, base = b.base, user = c.get('userId'), now = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await c.env.DB.prepare(`SELECT ${fields} FROM home_widget_items WHERE id=? AND user_id=?`).bind(c.req.param('id'), user).first<Row>();
    if (!row) return c.json({ error: '找不到項目' }, 404);
    if (row.deleted_at !== null || row.kind === 'todo' && row.completed_at !== null && row.completed_at < completionCutoff(now)) return c.json({ error: '項目已移除或已超過保留期限', current: null }, 410);
    if (Object.hasOwn(patch, 'text') && (typeof patch.text !== 'string' || !patch.text.trim() || patch.text.length > 500)
      || Object.hasOwn(patch, 'target_date') && (row.kind !== 'countdown' || !validTargetDate(patch.target_date))
      || Object.hasOwn(patch, 'completed_at') && (row.kind !== 'todo' || patch.completed_at !== null && (typeof patch.completed_at !== 'number' || !Number.isSafeInteger(patch.completed_at) || patch.completed_at < 0 || patch.completed_at > now + 300000))) return c.json({ error: '內容或日期無效' }, 400);
    if (typeof patch.text === 'string') patch.text = patch.text.trim();
    if (keys.some(k => row[k as keyof Row] !== base[k] && row[k as keyof Row] !== patch[k])) return c.json({ error: '相同欄位已在其他地方修改', current: publicItem(row) }, 409);
    if (keys.every(k => row[k as keyof Row] === patch[k])) return c.json({ item: publicItem(row) });
    const result = await c.env.DB.prepare(`UPDATE home_widget_items SET ${keys.map(k => k + '=?').join(',')},updated_at=?,row_version=row_version+1 WHERE id=? AND user_id=? AND row_version=? AND deleted_at IS NULL`)
      .bind(...keys.map(k => patch[k] as string | number | null), now, row.id, user, row.row_version).run();
    if (result.meta.changes) return c.json({ item: { ...publicItem(row), ...patch, updated_at: now, row_version: row.row_version + 1 } });
  }
  return c.json({ error: '項目正在更新，請重試' }, 503);
});

homeWidgetsRouter.delete('/items/:id', async c => {
  const b = await c.req.json().catch(() => null), user = c.get('userId');
  if (!object(b) || !object(b.base)) return c.json({ error: '刪除格式無效' }, 400);
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await c.env.DB.prepare(`SELECT ${fields} FROM home_widget_items WHERE id=? AND user_id=?`).bind(c.req.param('id'), user).first<Row>();
    if (!row) return c.json({ error: '找不到項目' }, 404);
    if (row.deleted_at !== null) return c.json({ item: null });
    if (['text', 'target_date', 'completed_at'].some(k => row[k as keyof Row] !== (b.base as Record<string, unknown>)[k])) return c.json({ error: '項目已變更，請確認後再移除', current: publicItem(row) }, 409);
    const now = Date.now();
    const result = await c.env.DB.prepare("UPDATE home_widget_items SET text='',target_date=NULL,completed_at=NULL,deleted_at=?,updated_at=?,row_version=row_version+1 WHERE id=? AND user_id=? AND row_version=? AND deleted_at IS NULL").bind(now, now, row.id, user, row.row_version).run();
    if (result.meta.changes) return c.json({ item: null });
  }
  return c.json({ error: '項目正在更新，請重試' }, 503);
});

homeWidgetsRouter.patch('/preferences', async c => {
  const b = await c.req.json().catch(() => null);
  if (!object(b) || !object(b.patch) || !object(b.base)) return c.json({ error: '設定格式無效' }, 400);
  const keys = Object.keys(b.patch), patch = b.patch, base = b.base;
  if (!keys.length || keys.some(k => k==='countdown_order' ? !validOrder(patch[k]) || !validOrder(base[k])
    : !['todos_visible', 'countdowns_visible'].includes(k) || typeof patch[k] !== 'boolean' || typeof base[k] !== 'boolean')) return c.json({ error: '設定欄位無效' }, 400);
  const user = c.get('userId');
  if (keys.includes('countdown_order')) {
    // Tombstones remain valid references for offline order drafts; rendering omits
    // deleted events. Match only submitted IDs so long histories are not scanned.
    const own=await c.env.DB.prepare("SELECT w.id FROM home_widget_items w JOIN json_each(?) ids ON w.id=ids.value WHERE w.user_id=? AND w.kind='countdown'").bind(JSON.stringify(patch.countdown_order),user).all<{id:string}>();
    const allowed=new Set(own.results.map(item=>item.id));
    if ((patch.countdown_order as string[]).some(id=>!allowed.has(id))) return c.json({error:'排序包含無法使用的事件，請重新同步'},400);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    let raw;
    try {
      const columns = keys.includes('countdown_order') ? 'todos_visible,countdowns_visible,countdown_order,row_version' : '*';
      raw = await c.env.DB.prepare(`SELECT ${columns} FROM home_widget_preferences WHERE user_id=?`).bind(user).first();
    } catch (error) {
      if (keys.includes('countdown_order') && /no such column:\s*countdown_order/i.test(String(error))) return c.json({ error: '倒數排序暫時無法同步，請稍後重試', code: 'COUNTDOWN_SCHEMA_PENDING' }, 503);
      throw error;
    }
    const current = preferences(raw);
    if (keys.some(k => !same(current[k as keyof WidgetPreferences],base[k]) && !same(current[k as keyof WidgetPreferences],patch[k]))) return c.json({ error: '設定已變更', current }, 409);
    if(keys.every(k=>same(current[k as keyof WidgetPreferences],patch[k])))return c.json({preferences:current});
    const next = { ...current, ...patch };
    // Only validated fields enter SQL identifiers. Visibility writes remain usable
    // on the previous schema until the manual countdown migration is applied.
    const values = keys.map(k => k === 'countdown_order' ? JSON.stringify(patch[k]) : +(patch[k] as boolean));
    let result;
    try {
      result = raw ? await c.env.DB.prepare(`UPDATE home_widget_preferences SET ${keys.map(k => k + '=?').join(',')},row_version=row_version+1,updated_at=? WHERE user_id=? AND row_version=?`).bind(...values, Date.now(), user, current.row_version).run()
        : await c.env.DB.prepare(`INSERT INTO home_widget_preferences(user_id,${keys.join(',')},updated_at,row_version) VALUES(?,${keys.map(() => '?').join(',')},?,1) ON CONFLICT(user_id) DO NOTHING`).bind(user, ...values, Date.now()).run();
    } catch (error) {
      if (keys.includes('countdown_order') && /(?:no such column:\s*countdown_order|no column named countdown_order)/i.test(String(error))) return c.json({ error: '倒數排序暫時無法同步，請稍後重試', code: 'COUNTDOWN_SCHEMA_PENDING' }, 503);
      throw error;
    }
    if (result.meta.changes) return c.json({ preferences: { ...next, row_version: current.row_version + 1 } });
  }
  return c.json({ error: '設定正在更新，請重試' }, 503);
});
