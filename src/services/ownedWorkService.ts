import { useStore } from '../store/useStore';
import { fetchProblemById, updateProblemDrawData, updateProblemMetadata } from './api';
import { getOfflineDB, getQueuedDraws, stripLegacyQueuedWork } from './offlineStorage';
import { createOwnedWorkController, ownedDraftKey, itemInkSeq } from './ownedWorkController';
import type { DrawData, Item } from '../types';
import { DEFAULT_CALC_SPACE_HEIGHT } from '../config/constants';

type Controller = ReturnType<typeof createOwnedWorkController>;
const controllers = new Map<string, Controller>();
export function getOwnedWorkController(item: Item) {
  const key = ownedDraftKey(item.user_id, item.id);
  let controller = controllers.get(key);
  if (!controller) {
    controller = createOwnedWorkController(key, item, {
      storage: {getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value),
        removeItem: key => localStorage.removeItem(key)},
      active: () => useStore.getState().currentUser?.id === item.user_id,
      online: () => navigator.onLine,
      saveInk: (ink, seq) => updateProblemDrawData(item.id, ink, seq),
      saveNotes: (notes, seq) => updateProblemMetadata(item.id, {typed_notes: notes, expected_notes_seq: seq})
        .then(result => ({notes_seq: result.notes_seq!})),
      load: () => fetchProblemById(item.id),
      changed: state => {
        if (useStore.getState().currentUser?.id !== item.user_id) return;
        const current = useStore.getState().problems.find(p => p.id === item.id);
        useStore.getState().updateProblemInStore(item.id, {
          ...(!current || itemInkSeq(current) <= state.inkSeq ? {draw_data: JSON.stringify(state.ink),
            draw_seq: state.inkSeq, vector_clock: JSON.stringify({seq: state.inkSeq})} : {}),
          ...(!current || (current.notes_seq ?? 0) <= state.notesSeq ? {typed_notes: state.notes, notes_seq: state.notesSeq} : {}),
        });
        window.dispatchEvent(new Event('redolve:work-drafts'));
      },
    });
    controllers.set(key, controller);
    const created = controller;
    void getOfflineDB().then(async db => {
      const legacy = await db.get('syncQueue', item.id);
      if (controllers.get(key) !== created) return;
      // Ownerless legacy records require the authenticated item owner supplied by the API.
      const mine = legacy && (!legacy.ownerId || legacy.ownerId === item.user_id) ? legacy : undefined;
      if (created.restoreLegacy(mine) && mine) void stripLegacyQueuedWork(mine).catch(console.error);
    }).catch(() => {if (controllers.get(key) === created) created.restoreFailed();});
  }
  if (controllers.size > 80) for (const [oldKey, old] of controllers) {
    if (controllers.size <= 80) break;
    if (oldKey !== key && old.unused()) {old.stop(); controllers.delete(oldKey);}
  }
  return controller;
}
export function forgetOwnedWork(item: Item) {
  const key = ownedDraftKey(item.user_id, item.id);
  controllers.get(key)?.stop(); controllers.delete(key);
  try {localStorage.removeItem(key);} catch { /* Deleting the cloud item already succeeded; a storage failure cannot undo it. */ }
}
export function hasUnsavedOwnedMemoryWork() {
  return [...controllers.values()].some(c => c.pending() && c.getState().storageFailed);
}
export async function listOwnedDrafts(account: string) {
  const prefix = ownedDraftKey(account, '');
  const drafts = new Map<string, {id: string; ink: DrawData; notes: string}>();
  const blank = {strokes: [], eraserMasks: [], calcSpaceHeight: DEFAULT_CALC_SPACE_HEIGHT};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefix) || key.slice(prefix.length).includes(':')) continue;
      const value = JSON.parse(localStorage.getItem(key) || '{}') as {ink?: DrawData; notes?: string};
      if (value.ink !== undefined || value.notes !== undefined)
        drafts.set(key.slice(prefix.length), {id: key.slice(prefix.length), ink: value.ink || blank, notes: value.notes ?? ''});
    }
  } catch { /* Memory and legacy records remain accessible when browser storage is restricted. */ }
  for (const [key, controller] of controllers) {
    if (key.startsWith(prefix) && controller.pending()) {
      const state = controller.getState(); drafts.set(key.slice(prefix.length), {id: key.slice(prefix.length), ink: state.ink, notes: state.notes});
    }
  }
  try { for (const draft of await getQueuedDraws()) {
    if (draft.ownerId === account && !drafts.has(draft.id) && (draft.drawData !== undefined || draft.typed_notes !== undefined))
      drafts.set(draft.id, {id: draft.id, ink: draft.drawData || blank, notes: draft.typed_notes ?? ''});
  }} catch { /* Do not hide newer recoverable drafts when IndexedDB is unavailable. */ }
  return [...drafts.values()];
}
window.addEventListener('online', () => controllers.forEach(c => c.retry()));
window.addEventListener('beforeunload', event => {
  if ([...controllers.values()].some(c => c.pending() && c.getState().storageFailed)) event.preventDefault();
});
useStore.subscribe((state, previous) => {
  if (state.currentUser?.id !== previous.currentUser?.id) {controllers.forEach(c => c.stop()); controllers.clear();}
});
