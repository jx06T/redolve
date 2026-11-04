import { openDB } from 'idb';
import { sharingApi, SharingApiError } from './sharingApi';
import { useStore } from '../store/useStore';
import type { AttemptInput, AttemptReply, PracticeAttempt, PracticeQuestion, PracticeScope, PracticeSession } from '../types/practice';
import type { ErrorReason, PersonalQuestionRef } from '../types/learning';
import type { AttemptReasonCandidate, WeaknessReview } from '../types/weakness';

const refParams = (ref: PersonalQuestionRef) => ({ kind: ref.kind, id: ref.kind === 'owned' ? ref.itemId : ref.savedRefId });

export interface PendingAttempt { userId: string; id: string; input: AttemptInput; question: PracticeQuestion; error?: string; blocked?: boolean }
const db = () => openDB('redolve-practice-events', 1, { upgrade(database) {
  const store = database.createObjectStore('outbox', { keyPath: ['userId', 'id'] }); store.createIndex('userId', 'userId');
} });
const changed = () => window.dispatchEvent(new Event('practice-outbox-changed'));
const owner = (uid: string) => useStore.getState().currentUser?.id === uid;
export const practiceService = {
  organizeErrorNotes: (ref: PersonalQuestionRef, notes: string, signal?: AbortSignal) => sharingApi<{ items: ErrorReason[] }>(
    '/practice/weaknesses/suggestions', 'POST', { ...refParams(ref), notes, excluded: [], organizeNotes: true }, signal),
  weaknessReview: (id: string, signal?: AbortSignal) => sharingApi<WeaknessReview & { candidates: AttemptReasonCandidate[] }>(`/practice/attempts/${encodeURIComponent(id)}/weaknesses`, 'GET', undefined, signal),
  saveWeaknessReview: (uid: string, id: string, review: WeaknessReview) => sharingApi<WeaknessReview>(
    `/practice/attempts/${encodeURIComponent(id)}/weaknesses`, 'PUT', { userId: uid, ...review }),
  start: (scope: PracticeScope, count: number, questionIds?: string[], signal?: AbortSignal) =>
    sharingApi<PracticeSession>('/practice/sessions', 'POST', { scope, count, questionIds }, signal),
  history: (id: string, cursor?: string, signal?: AbortSignal) => sharingApi<{ attempts: PracticeAttempt[]; nextCursor: string | null }>(
    `/practice/questions/${encodeURIComponent(id)}/attempts${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`, 'GET', undefined, signal),
  pending: async (uid: string): Promise<PendingAttempt[]> => (await db()).getAllFromIndex('outbox', 'userId', uid),
  enqueue: async (uid: string, input: AttemptInput, question: PracticeQuestion) => {
    if (!owner(uid)) throw Error('帳號已變更，請重新進入練習');
    const database = await db(), transaction = database.transaction('outbox', 'readwrite');
    const previous = await transaction.store.get([uid, input.id]);
    if (previous && JSON.stringify(previous.input) !== JSON.stringify(input)) { transaction.abort(); throw Error('這筆作答已保存，不能覆蓋'); }
    if (!previous) await transaction.store.add({ userId: uid, id: input.id, input, question } satisfies PendingAttempt);
    await transaction.done; changed(); window.dispatchEvent(new Event('practice-submitted'));
  },
};
const active = new Map<string, Promise<void>>();
export function syncPractice(uid: string): Promise<void> {
  if (active.has(uid)) return active.get(uid)!;
  const task = (async () => {
    if (!owner(uid) || !navigator.onLine) return;
    const database = await db();
    const records = (await practiceService.pending(uid)).filter(r => !r.blocked);
    const byId = new Map(records.map(r => [r.id, r]));
    const depth = (r: PendingAttempt, seen = new Set<string>()): number => {
      if (seen.has(r.id)) return 0; seen.add(r.id);
      const parent = r.input.supersedesAttemptId && byId.get(r.input.supersedesAttemptId);
      return parent ? depth(parent, seen) + 1 : 0;
    };
    records.sort((a, b) => depth(a) - depth(b));
    for (let offset = 0; offset < records.length; offset += 50) {
      if (!owner(uid)) return;
      const batch = records.slice(offset, offset + 50);
      try {
        const { replies } = await sharingApi<{ replies: AttemptReply[] }>('/practice/attempts/batch', 'POST', { userId: uid, attempts: batch.map(r => r.input) });
        if (!owner(uid)) return;
        for (const reply of replies) {
          const record = batch.find(r => r.id === reply.id); if (!record) continue;
          if (reply.attempt) await database.delete('outbox', [uid, record.id]);
          else if (reply.error) {
            const waitingForParent = record.input.supersedesAttemptId && await database.get('outbox', [uid, record.input.supersedesAttemptId]);
            await database.put('outbox', { ...record, error: reply.error.message, blocked: !waitingForParent && [404, 409, 410, 422].includes(reply.error.status) });
          }
        }
        changed();
      } catch (e) { if (e instanceof SharingApiError && e.status === 401) return; throw e; }
    }
  })().finally(() => active.delete(uid));
  active.set(uid, task); return task;
}
export function watchPracticeSync(uid: string) {
  const run = () => { void syncPractice(uid).catch(() => { /* Persisted events remain available for manual/online retry. */ }); };
  const submitted = () => { void syncPractice(uid).then(() => syncPractice(uid)).catch(() => {}); };
  window.addEventListener('online', run); window.addEventListener('practice-submitted', submitted); run();
  return () => { window.removeEventListener('online', run); window.removeEventListener('practice-submitted', submitted); };
}
