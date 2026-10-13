import { API_BASE } from './api';
import { widgetAccount } from './homeWidgetService';
import { createClientId } from '../utils/clientId';
import { applyProgressStep, defaultProgressPreferences, orderedProgressPlans, validProgressMetadata } from '../types/studyProgress';
import type { ProgressData, ProgressMetadata, ProgressPlan, ProgressPreferences } from '../types/studyProgress';

type Operation = { key: string; order: number; action: 'create' | 'metadata' | 'delta' | 'delete' | 'preferences'; id?: string; plan?: ProgressPlan; delta?: 1 | -1; patch: Record<string, unknown>; base: Record<string, unknown> };
type Conflict = { operation: Operation; current: ProgressPlan | ProgressPreferences | null };
export type ProgressSnapshot = ProgressData & { loading: boolean; syncing: boolean; pending: number; error: string; notice: string; storageError: boolean; conflict: Conflict | null };
type Channel = { account: string; data: ProgressData; queue: Operation[]; acknowledged: Set<string>; listeners: Set<() => void>; snapshot: ProgressSnapshot; fetched: number; running: boolean; loading: boolean; error: string; notice: string; storageError: boolean; conflict: Conflict | null; request?: Promise<void> };
const channels = new Map<string, Channel>(), empty = (): ProgressData => ({ plans: [], preferences: { ...defaultProgressPreferences } });
const key = (account: string) => 'rdv:study-progress:v1:' + encodeURIComponent(account);
const prefix = (account: string) => key(account) + ':operation:';
const active = (c: Channel) => widgetAccount() === c.account;
let sequence = 0;
function readQueue(c: Pick<Channel, 'account' | 'acknowledged'>): Operation[] {
  const operations: Operation[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const name = localStorage.key(i);
    if (name?.startsWith(prefix(c.account))) {
      const op = JSON.parse(localStorage.getItem(name) || 'null');
      if (op?.key && !c.acknowledged.has(op.key)) operations.push(op);
    }
  }
  return operations.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}
function visible(c: Channel): ProgressData {
  let plans = [...c.data.plans], preferences = { ...c.data.preferences };
  for (const op of c.queue) {
    if (c.acknowledged.has(op.key)) continue;
    if (op.action === 'create' && op.plan && !plans.some(p => p.id === op.id)) plans.push(op.plan);
    if (op.action === 'metadata') plans = plans.map(p => p.id === op.id ? { ...p, ...op.patch } as ProgressPlan : p);
    if (op.action === 'delta') plans = plans.map(p => p.id === op.id ? { ...p, completed_count: applyProgressStep(p, op.delta!) } : p);
    if (op.action === 'delete') plans = plans.filter(p => p.id !== op.id);
    if (op.action === 'preferences') preferences = { ...preferences, ...op.patch } as ProgressPreferences;
  }
  return { plans: orderedProgressPlans(plans, preferences.order), preferences };
}
function publish(c: Channel, save = false) {
  if (save) {
    try {
      for (const op of c.queue) localStorage.setItem(prefix(c.account) + op.key, JSON.stringify(op));
      // Save counts and acknowledgements before removing durable operations.
      // A crash or storage failure between these writes cannot replay +1 locally.
      localStorage.setItem(key(c.account), JSON.stringify({ data: c.data, acknowledged: [...c.acknowledged] }));
      for (const id of c.acknowledged) localStorage.removeItem(prefix(c.account) + id);
      c.acknowledged.clear(); c.storageError = false;
    } catch { c.storageError = true; }
  }
  c.snapshot = { ...visible(c), loading: c.loading, syncing: c.running && (c.loading || c.queue.length > 0), pending: c.queue.length, error: c.error, notice: c.notice, storageError: c.storageError, conflict: c.conflict };
  c.listeners.forEach(listener => listener());
}
export function progressChannel(account: string): Channel {
  let c = channels.get(account);
  if (!c) {
    let data = empty(), acknowledged = new Set<string>(), queue: Operation[] = [];
    try {
      const saved = JSON.parse(localStorage.getItem(key(account)) || 'null');
      if (saved?.data && Array.isArray(saved.data.plans)) data = { ...saved.data, preferences: { ...defaultProgressPreferences, ...saved.data.preferences } };
      acknowledged = new Set(saved?.acknowledged || []); queue = readQueue({ account, acknowledged });
    } catch { /* A missing or malformed cache never crosses account boundaries. */ }
    c = { account, data, acknowledged, queue, listeners: new Set(), snapshot: null!, fetched: 0, running: false, loading: false, error: '', notice: '', storageError: false, conflict: null };
    channels.set(account, c); publish(c);
  }
  return c;
}
async function request(c: Channel, path = '', method = 'GET', body?: unknown) {
  if (!active(c)) throw new Error('帳號已切換');
  const response = await fetch(API_BASE + '/progress-plans' + path + '?account_id=' + encodeURIComponent(c.account), { method, credentials: 'include', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json() as ProgressData & { plan: ProgressPlan | null; current: ProgressPlan | ProgressPreferences | null; acknowledged: string[]; error?: string; effect?: number };
  if (!active(c)) throw new Error('帳號已切換');
  return { response, result };
}
function acknowledge(c: Channel, ids: string[]) {
  for (const id of ids) c.acknowledged.add(id);
  c.queue = c.queue.filter(op => !c.acknowledged.has(op.key));
}
async function run(c: Channel, read: boolean) {
  if (!active(c) || c.account === 'guest') return;
  c.running = true; c.error = ''; publish(c);
  try {
    if (!c.storageError) c.queue = readQueue(c);
    if (read) {
      c.loading = true; publish(c);
      const ids = c.queue.filter(op => op.action === 'delta').map(op => op.key);
      const { response, result } = ids.length ? await request(c, '/sync', 'POST', { operation_ids: ids }) : await request(c);
      if (!response.ok) throw new Error(result.error || '學習計畫暫時無法同步');
      if (!Array.isArray(result.plans) || !result.preferences || typeof result.preferences.visible !== 'boolean' || !Array.isArray(result.preferences.order)) throw new Error('學習計畫資料格式無效');
      c.data = { plans: result.plans, preferences: result.preferences }; acknowledge(c, result.acknowledged || []); c.fetched = Date.now();
      c.loading = false; publish(c, true);
    }
    while (c.queue.length && active(c) && navigator.onLine && !c.conflict) {
      const op = c.queue[0];
      const path = op.action === 'preferences' ? '/preferences' : '/plans' + (op.action === 'create' ? '' : '/' + encodeURIComponent(op.id!)) + (op.action === 'delta' ? '/step' : '');
      const method = op.action === 'create' || op.action === 'delta' ? 'POST' : op.action === 'delete' ? 'DELETE' : 'PATCH';
      const body = op.action === 'create' ? op.plan : op.action === 'delta' ? { operation_id: op.key, delta: op.delta } : { patch: op.patch, base: op.base };
      const { response, result } = await request(c, path, method, body);
      if (response.status === 409 && Object.hasOwn(result, 'current')) { c.conflict = { operation: op, current: result.current }; break; }
      if (response.status === 410 || response.status === 404 && op.action !== 'preferences') {
        const gone = c.queue.filter(q => q.id === op.id).map(q => q.key);
        c.data.plans = c.data.plans.filter(p => p.id !== op.id); acknowledge(c, gone); c.notice = '計畫已移除，待送修改未套用'; publish(c, true); continue;
      }
      if (!response.ok) throw new Error(response.status === 401 ? '請重新登入後同步' : result.error || '學習計畫暫時無法同步');
      if (op.action === 'preferences') c.data.preferences = result.preferences;
      else { c.data.plans = c.data.plans.filter(p => p.id !== op.id); if (result.plan) c.data.plans.push(result.plan); }
      if (op.action === 'delta' && result.effect === 0) c.notice = '進度或目標已更新，這次未再加減';
      acknowledge(c, [op.key]); c.fetched = Date.now(); publish(c, true);
    }
  } catch (error) { if (active(c)) c.error = error instanceof Error ? error.message : '同步失敗'; }
  finally { c.running = false; c.loading = false; publish(c); }
}
async function sync(c: Channel, read: boolean) {
  if (!active(c)) return;
  if (c.account === 'guest') { publish(c, true); return; }
  if (c.request) return c.request;
  c.request = (async () => {
    if (navigator.locks) await navigator.locks.request(key(c.account) + ':sync', () => run(c, read)); else await run(c, read);
  })();
  try { await c.request; } finally { c.request = undefined; }
}
function enqueue(c: Channel, input: Omit<Operation, 'key' | 'order'>) {
  if (!active(c)) return;
  if (c.storageError) throw new Error('瀏覽器無法保存，請先處理儲存空間');
  if (c.queue.length >= 2000) throw new Error('待送修改已達上限，請先重新同步');
  const op = { ...input, key: createClientId(), order: sequence = Math.max(Date.now(), sequence + 1) };
  c.error = ''; c.notice = '';
  c.queue.push(op);
  if (c.account === 'guest') { c.data = visible(c); c.queue = []; }
  publish(c, true); void sync(c, false);
}
export const progressPlanService = {
  refresh(c: Channel, force = false) { return sync(c, force || Date.now() - c.fetched >= 40000); },
  retry(c: Channel) { return sync(c, true); },
  create(c: Channel, metadata: ProgressMetadata) {
    if (!validProgressMetadata(metadata)) throw new Error('請輸入名稱、單位與有效目標');
    if (c.snapshot.plans.length >= 100) throw new Error('最多保留 100 個計畫');
    const now = sequence = Math.max(Date.now(), sequence + 1), id = createClientId();
    const plan: ProgressPlan = { id, ...metadata, name: metadata.name.trim(), unit: metadata.unit.trim(), completed_count: 0, row_version: 1, created_at: now, updated_at: now };
    enqueue(c, { action: 'create', id, plan, patch: {}, base: {} });
  },
  updateMetadata(c: Channel, id: string, metadata: ProgressMetadata, original: ProgressPlan) {
    if (!validProgressMetadata(metadata)) throw new Error('請輸入名稱、單位與有效目標');
    const patch = Object.fromEntries(Object.entries(metadata).filter(([k, value]) => value !== original[k as keyof ProgressPlan]));
    if (Object.keys(patch).length) enqueue(c, { action: 'metadata', id, patch, base: Object.fromEntries(Object.keys(patch).map(k => [k, original[k as keyof ProgressPlan]])) });
  },
  step(c: Channel, id: string, delta: 1 | -1) {
    const plan = c.snapshot.plans.find(p => p.id === id);
    if (!plan || applyProgressStep(plan, delta) === plan.completed_count) return;
    enqueue(c, { action: 'delta', id, delta, patch: {}, base: {} });
  },
  remove(c: Channel, plan: ProgressPlan) {
    enqueue(c, { action: 'delete', id: plan.id, patch: {}, base: { name: plan.name, unit: plan.unit, target_count: plan.target_count, completed_count: plan.completed_count } });
  },
  preferences(c: Channel, patch: Partial<Pick<ProgressPreferences, 'visible' | 'order'>>, original?: ProgressPreferences) {
    enqueue(c, { action: 'preferences', patch, base: Object.fromEntries(Object.keys(patch).map(k => [k, (original || c.snapshot.preferences)[k as keyof ProgressPreferences]])) });
  },
  resolve(c: Channel, local: boolean) {
    const conflict = c.conflict; if (!conflict || !active(c) || !conflict.current) return;
    const op = conflict.operation;
    if (op.action === 'preferences') c.data.preferences = conflict.current as ProgressPreferences;
    else c.data.plans = [...c.data.plans.filter(p => p.id !== op.id), conflict.current as ProgressPlan];
    if (local) op.base = Object.fromEntries(Object.keys(op.base).map(k => [k, (conflict.current as unknown as Record<string, unknown>)[k]]));
    else {
      const discard: string[] = [];
      c.queue = c.queue.filter(q => {
        if (q.action !== op.action || op.action !== 'preferences' && q.id !== op.id) return true;
        if (q.action === 'delete') { discard.push(q.key); return false; }
        const keep = Object.keys(q.patch).filter(k => !Object.hasOwn(op.patch, k));
        if (keep.length) { q.patch = Object.fromEntries(keep.map(k => [k, q.patch[k]])); q.base = Object.fromEntries(keep.map(k => [k, q.base[k]])); return true; }
        discard.push(q.key); return false;
      });
      acknowledge(c, discard);
    }
    c.conflict = null; publish(c, true); void sync(c, false);
  },
};
if (typeof window !== 'undefined') {
  const resume = () => { const c = channels.get(widgetAccount()); if (c) void progressPlanService.refresh(c); };
  window.addEventListener('online', () => { const c = channels.get(widgetAccount()); if (c) void progressPlanService.refresh(c, true); });
  window.addEventListener('focus', resume);
  window.addEventListener('beforeunload', event => { if (channels.get(widgetAccount())?.storageError) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('storage', event => {
    const c = channels.get(widgetAccount()); if (!c || c.running || !event.key?.startsWith(key(c.account))) return;
    if (!c.request) { c.fetched = 0; void sync(c, true); }
  });
}
