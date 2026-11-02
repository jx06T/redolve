import { openDB } from 'idb';
import type { CorrectionRecognition, PersonalQuestionRef } from '../types/learning';
import type { DrawData } from '../types';
import { API_BASE } from './api';
import { useStore } from '../store/useStore';
import { composeProblemImage } from '../utils/exportImage';

export interface CorrectionTask { key: string; id: string; uid: string; ref: PersonalQuestionRef; sourceIdentity: string; image: ArrayBuffer; notes: string;
  force: boolean; state: 'queued' | 'sending' | 'failed'; error: string; retryAt: number }
const keyFor = (uid: string, ref: PersonalQuestionRef) => `${uid}:${ref.kind}:${ref.kind === 'owned' ? ref.itemId : ref.savedRefId}`;
const database = () => openDB('redolve-correction-outbox', 2, { upgrade(db, oldVersion, _newVersion, transaction) {
  const tasks = oldVersion < 1 ? db.createObjectStore('tasks', { keyPath: 'key' }) : transaction.objectStore('tasks');
  if (oldVersion < 2) tasks.createIndex('by-user', 'uid');
} });
const changed = () => window.dispatchEvent(new Event('redolve:corrections'));
async function changeIfCurrent(task: CorrectionTask, remove = false) {
  const db = await database(), transaction = db.transaction('tasks', 'readwrite');
  const current = await transaction.store.get(task.key) as CorrectionTask | undefined;
  const matches = current?.id === task.id;
  if (matches) { if (remove) await transaction.store.delete(task.key); else await transaction.store.put(task); }
  await transaction.done; return matches;
}
let active: { uid: string; controller: AbortController; promise: Promise<void> } | null = null;
export async function pendingCorrection(uid: string, ref: PersonalQuestionRef): Promise<CorrectionTask | undefined> { return (await database()).get('tasks', keyFor(uid, ref)); }
export async function cancelCorrection(uid: string, ref: PersonalQuestionRef) { await (await database()).delete('tasks', keyFor(uid, ref)); changed(); }
export async function retryCorrection(uid: string, ref: PersonalQuestionRef) {
  const task = await pendingCorrection(uid, ref); if (!task) return;
  task.state = 'queued'; task.retryAt = 0; await changeIfCurrent(task); changed(); await syncCorrections(uid);
}
export async function enqueueCorrection(uid: string, ref: PersonalQuestionRef, imageUrl: string, ink: DrawData, notes: string, sourceIdentity: string, force = false, imageElement?: HTMLImageElement) {
  const image = await composeProblemImage(imageUrl, ink, { maxDimension: 4096, maxPixels: 6000000, type: 'image/jpeg', quality: 0.8, imageElement });
  if (image.size > 2000000) throw Error('合成圖片過大，請縮短計算區後重試整理');
  if (useStore.getState().currentUser?.id !== uid) throw Error('登入帳號已變更，未送出訂正資料');
  const task: CorrectionTask = { key: keyFor(uid, ref), id: crypto.randomUUID(), uid, ref, sourceIdentity, image: await image.arrayBuffer(), notes, force, state: 'queued', error: '', retryAt: 0 };
  await (await database()).put('tasks', task); changed();
}
async function processTasks(uid: string, signal: AbortSignal) {
  const db = await database();
  for (let round = 0; round < 20; round++) {
    if (signal.aborted || useStore.getState().currentUser?.id !== uid || !navigator.onLine) return;
    const tasks = await db.getAllFromIndex('tasks', 'by-user', uid) as CorrectionTask[], task = tasks.find(t => t.state !== 'failed' && t.retryAt <= Date.now());
    if (!task) return;
    task.state = 'sending'; task.error = ''; if (!await changeIfCurrent(task)) continue; changed();
    if (signal.aborted || useStore.getState().currentUser?.id !== uid) return;
    try {
      const form = new FormData(); form.set('image', new Blob([task.image], { type: 'image/jpeg' }), 'correction.jpg');
      form.set('sourceIdentity', task.sourceIdentity); form.set('notes', task.notes); form.set('force', String(task.force));
      const response = await fetch(`${API_BASE}/learning/${task.ref.kind}/${encodeURIComponent(task.ref.kind === 'owned' ? task.ref.itemId : task.ref.savedRefId)}/correction`,
        { method: 'POST', credentials: 'include', cache: 'no-store', body: form, signal });
      const result = await response.json() as { ok?: boolean; data?: CorrectionRecognition; error?: { code?: string; message?: string } };
      if (!response.ok || !result.ok || !result.data) {
        task.state = result.error?.code === 'CORRECTION_NOT_SYNCED' || response.status >= 500 && result.error?.code !== 'AI_UNAVAILABLE' || response.status === 429 ? 'queued' : 'failed';
        task.error = result.error?.message || 'AI 整理暫時未完成，可重試'; task.retryAt = Date.now() + 30000;
      } else if (result.data.status === 'complete') {
        await changeIfCurrent(task, true);
        changed(); continue;
      } else {
        task.state = result.data.status === 'pending' ? 'queued' : 'failed'; task.error = result.data.error || '';
        task.retryAt = Date.now() + 15000;
      }
    } catch {
      task.state = 'queued'; task.error = '尚未完成連線，合成圖片已保留，可重試'; task.retryAt = Date.now() + 30000;
    }
    await changeIfCurrent(task);
    changed();
    if (signal.aborted) return;
  }
}
export function syncCorrections(uid: string): Promise<void> {
  if (useStore.getState().currentUser?.id !== uid) return Promise.resolve();
  if (active?.uid === uid) return active.promise;
  active?.controller.abort();
  const controller = new AbortController();
  const promise = processTasks(uid, controller.signal).finally(() => { if (active?.controller === controller) active = null; });
  active = { uid, controller, promise }; return promise;
}
export function watchCorrections(uid: string) {
  const sync = () => { void syncCorrections(uid).catch(() => {}); };
  const timer = window.setInterval(sync, 30000); window.addEventListener('online', sync); sync();
  return () => { clearInterval(timer); window.removeEventListener('online', sync); if (active?.uid === uid) active.controller.abort(); };
}
