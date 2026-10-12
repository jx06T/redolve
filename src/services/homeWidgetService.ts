import { useStore } from '../store/useStore';
import { isGuestUser } from '../utils/guest';
import { createClientId } from '../utils/clientId';
import { API_BASE } from './api';
import { completionCutoff, defaultWidgetPreferences } from '../types/homeWidgets';
import type { ItemPatch, WidgetData, WidgetItem, WidgetKind, WidgetPreferences } from '../types/homeWidgets';

type Operation = { key: string; order?: number; action: 'create' | 'update' | 'delete' | 'preferences'; id?: string;
  item?: WidgetItem; patch: Record<string, unknown>; base: Record<string, unknown> };
type Conflict = { operation: Operation; current: WidgetItem | WidgetPreferences | null };
export type WidgetSnapshot = WidgetData & { loading: boolean; pending: number; error: string; storageError: boolean; conflict: Conflict | null };
type Channel = { account: string; data: WidgetData; queue: Operation[]; listeners: Set<() => void>; snapshot: WidgetSnapshot;
  fetched: number; loading: boolean; running: boolean; error: string; storageError: boolean; conflict: Conflict | null; request?: Promise<void> };
const channels = new Map<string, Channel>();
const empty = (): WidgetData => ({ items: [], preferences: { ...defaultWidgetPreferences } });
const key = (account: string) => 'rdv:home-widgets:v1:' + encodeURIComponent(account);
const operationPrefix = (account: string) => key(account) + ':operation:';
let order = 0;
let creationTime = 0;
function readQueue(account: string): Operation[] {
  const result: Operation[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i);
    if (storageKey?.startsWith(operationPrefix(account))) {
      const op = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (op?.key && typeof op.action === 'string') result.push(op);
    }
  }
  return result.sort((a,b) => (a.order || 0) - (b.order || 0) || a.key.localeCompare(b.key));
}
function forget(c: Channel, op: Operation) {
  try { localStorage.removeItem(operationPrefix(c.account) + op.key); }
  catch { c.storageError = true; }
}
export const widgetAccount = () => { const user = useStore.getState().currentUser; return isGuestUser(user) ? 'guest' : user!.id; };
const isActive = (c: Channel) => widgetAccount() === c.account;

function visible(c: Channel): WidgetData {
  let items = [...c.data.items], preferences = { ...c.data.preferences };
  for (const op of c.queue) {
    if (op.action === 'create' && op.item && !items.some(i => i.id === op.id)) items.push(op.item);
    if (op.action === 'delete') items = items.filter(i => i.id !== op.id);
    if (op.action === 'update') items = items.map(i => i.id === op.id ? { ...i, ...op.patch } as WidgetItem : i);
    if (op.action === 'preferences') preferences = { ...preferences, ...op.patch } as WidgetPreferences;
  }
  return { items: items.filter(i => i.completed_at === null || i.completed_at >= completionCutoff()).sort((a,b) => a.created_at-b.created_at || a.id.localeCompare(b.id)), preferences };
}
function publish(c: Channel, save = false) {
  if (save) {
    try {
      // One durable key per operation prevents a second tab from replacing an offline queue.
      for (const op of c.queue) localStorage.setItem(operationPrefix(c.account) + op.key, JSON.stringify(op));
      localStorage.setItem(key(c.account), JSON.stringify({ data: c.data, format: 2 })); c.storageError = false;
    }
    catch { c.storageError = true; }
  }
  c.snapshot = { ...visible(c), loading: c.loading, pending: c.queue.length, error: c.error, storageError: c.storageError, conflict: c.conflict };
  c.listeners.forEach(listener => listener());
}
export function widgetChannel(account: string): Channel {
  let c = channels.get(account);
  if (!c) {
    let data = empty(), queue: Operation[] = [];
    try { const saved = JSON.parse(localStorage.getItem(key(account)) || 'null');
      if (saved?.data && Array.isArray(saved.data.items) && saved.data.preferences) { data = saved.data; queue = readQueue(account); }
    } catch { /* Keep the empty view if browser storage is unavailable. */ }
    c = { account, data, queue, listeners: new Set(), snapshot: null!, fetched: 0, loading: false, running: false, error: '', storageError: false, conflict: null };
    channels.set(account, c); publish(c);
  }
  return c;
}
async function request(c: Channel, path: string, method = 'GET', body?: unknown) {
  if (!isActive(c)) throw new Error('帳號已切換');
  const response = await fetch(API_BASE + '/home-widgets' + path + '?account_id=' + encodeURIComponent(c.account), { method, credentials: 'include', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json() as WidgetData & { item: WidgetItem | null; current: WidgetItem | WidgetPreferences | null; error?: string };
  if (!isActive(c)) throw new Error('帳號已切換');
  return { response, result };
}
export async function loadWidgets(c: Channel, force = false): Promise<void> {
  if (!isActive(c)) return;
  if (!c.running) {
    try { const durable = readQueue(c.account); for (const op of durable) if (!c.queue.some(q => q.key === op.key)) c.queue.push(op);
      c.queue.sort((a,b) => (a.order || 0) - (b.order || 0) || a.key.localeCompare(b.key)); } catch { c.storageError = true; }
  }
  if (c.account === 'guest') {
    c.data.items = c.data.items.filter(i => i.completed_at === null || i.completed_at >= completionCutoff()); publish(c, true); return;
  }
  if (c.request) return c.request;
  if (c.running) return;
  if (!force && Date.now() - c.fetched < 40000) { void flush(c); return; }
  c.loading = true; c.error = ''; publish(c);
  c.request = (async () => {
    try {
      const { response, result } = await request(c, '');
      if (!response.ok) throw new Error(response.status === 401 ? '請重新登入後同步' : '小組件暫時無法同步');
      if (!Array.isArray(result.items) || !result.preferences || typeof result.preferences.todos_visible !== 'boolean' || typeof result.preferences.countdowns_visible !== 'boolean') throw new Error('小組件資料格式無效，請重試同步');
      c.data = result; c.fetched = Date.now();
    } catch (e) { if (isActive(c)) c.error = e instanceof Error ? e.message : '同步失敗'; }
    finally { c.loading = false; c.request = undefined; publish(c, true); }
  })();
  await c.request;
  if (!c.error && isActive(c)) await flush(c);
}
async function flush(c: Channel) {
  if (navigator.locks) {
    await navigator.locks.request(key(c.account) + ':sync', async () => { await drain(c); });
  } else await drain(c);
}
async function drain(c: Channel) {
  if (c.running || c.loading || c.conflict || !isActive(c) || c.account === 'guest' || !navigator.onLine) return;
  try {
    if (!c.storageError) c.queue = readQueue(c.account);
  } catch { c.storageError = true; }
  c.running = true; c.error = ''; publish(c);
  try {
    while (c.queue.length && isActive(c)) {
      const op = c.queue[0];
      const path = op.action === 'preferences' ? '/preferences' : '/items' + (op.action === 'create' ? '' : '/' + encodeURIComponent(op.id!));
      const method = op.action === 'delete' ? 'DELETE' : op.action === 'create' ? 'POST' : 'PATCH';
      const body = op.action === 'create' ? op.item : { patch: op.patch, base: op.base };
      const { response, result } = await request(c, path, method, body);
      if ((response.status === 409 || response.status === 410) && Object.hasOwn(result, 'current')) {
        c.conflict = { operation: op, current: result.current }; break;
      }
      if (!response.ok) throw new Error(response.status === 401 ? '請重新登入後同步' : result.error || '同步失敗');
      if (op.action === 'preferences') c.data.preferences = result.preferences;
      else { c.data.items = c.data.items.filter(i => i.id !== op.id); if (result.item) c.data.items.push(result.item); }
      forget(c, op); c.queue.shift(); c.fetched = Date.now(); publish(c, true);
    }
  } catch (e) { if (isActive(c)) c.error = e instanceof Error ? e.message : '同步失敗'; }
  finally { c.running = false; publish(c); }
}
function enqueue(c: Channel, op: Operation) {
  if (!isActive(c)) return;
  op.order = order = Math.max(Date.now(), order + 1);
  c.error = '';
  if (c.account === 'guest') {
    if (op.action === 'create' && op.item) c.data.items.push(op.item);
    if (op.action === 'update') c.data.items = c.data.items.map(i => i.id === op.id ? { ...i, ...op.patch } as WidgetItem : i);
    if (op.action === 'delete') c.data.items = c.data.items.filter(i => i.id !== op.id);
    if (op.action === 'preferences') c.data.preferences = { ...c.data.preferences, ...op.patch } as WidgetPreferences;
  } else c.queue.push(op);
  publish(c, true); void flush(c);
}
export const homeWidgetService = {
  add(c: Channel, kind: WidgetKind, text: string, target_date: string | null = null) {
    const count = c.snapshot.items.filter(i => i.kind === kind).length;
    if (count >= (kind === 'todo' ? 500 : 100)) throw new Error('已達小組件數量上限');
    const now = creationTime = Math.max(Date.now(), creationTime + 1), id = createClientId();
    const item: WidgetItem = { id, kind, text: text.trim(), target_date, completed_at: null, created_at: now, updated_at: now, row_version: 0 };
    enqueue(c, { key: createClientId(), action: 'create', id, item, patch: {}, base: {} });
  },
  update(c: Channel, id: string, patch: ItemPatch, original?: ItemPatch) {
    const item = c.snapshot.items.find(i => i.id === id); if (!item) return;
    const base = Object.fromEntries(Object.keys(patch).map(k => [k, original && Object.hasOwn(original, k) ? original[k as keyof ItemPatch] : item[k as keyof WidgetItem]]));
    if (Object.keys(patch).every(k => base[k] === patch[k as keyof ItemPatch])) return;
    enqueue(c, { key: createClientId(), action: 'update', id, patch, base });
  },
  remove(c: Channel, id: string) {
    const item = c.snapshot.items.find(i => i.id === id); if (!item) return;
    enqueue(c, { key: createClientId(), action: 'delete', id, patch: {}, base: { text: item.text, target_date: item.target_date, completed_at: item.completed_at } });
  },
  preferences(c: Channel, patch: Partial<Pick<WidgetPreferences, 'todos_visible' | 'countdowns_visible'>>) {
    const base = Object.fromEntries(Object.keys(patch).map(k => [k, c.snapshot.preferences[k as keyof WidgetPreferences]]));
    enqueue(c, { key: createClientId(), action: 'preferences', patch, base });
  },
  resolve(c: Channel, local: boolean) {
    const conflict = c.conflict; if (!conflict || !isActive(c)) return;
    const op = conflict.operation;
    if (op.action === 'preferences' && conflict.current) c.data.preferences = conflict.current as WidgetPreferences;
    else { c.data.items = c.data.items.filter(i => i.id !== op.id); if (conflict.current) c.data.items.push(conflict.current as WidgetItem); }
    if (local && conflict.current) {
      op.base = Object.fromEntries(Object.keys(op.base).map(k => [k, (conflict.current as unknown as Record<string, unknown>)[k]]));
    } else c.queue = c.queue.filter(q => {
      const drop = op.action === 'preferences' ? q.action === 'preferences' : q.id === op.id;
      if (drop) forget(c, q); return !drop;
    });
    c.conflict = null; publish(c, true); void flush(c);
  },
  refresh: loadWidgets,
  retry(c: Channel) { c.error = ''; c.conflict ? publish(c) : void loadWidgets(c, true); },
  tick(c: Channel) { publish(c); },
};

// No polling: focus only revalidates an expired 40-second cache; reconnect flushes drafts.
if (typeof window !== 'undefined') {
  const resume = () => { const c = channels.get(widgetAccount()); if (c) void loadWidgets(c); };
  window.addEventListener('online', resume);
  window.addEventListener('focus', resume);
  window.addEventListener('beforeunload', event => {
    const c = channels.get(widgetAccount()); if (c?.storageError) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('storage', event => {
    const c = channels.get(widgetAccount());
    if (c && event.key?.startsWith(operationPrefix(c.account)) && !c.running) {
      if (event.newValue === null) c.queue = c.queue.filter(op => operationPrefix(c.account) + op.key !== event.key);
      void loadWidgets(c);
    }
    if (c && event.key === key(c.account) && !c.running && !c.queue.length && event.newValue) {
      try { const saved = JSON.parse(event.newValue); c.data = saved.data; publish(c); c.fetched = 0; void loadWidgets(c); } catch { /* Ignore malformed storage. */ }
    }
  });
}
