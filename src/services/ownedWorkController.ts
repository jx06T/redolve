import type { DrawData, Item } from '../types';
import { DEFAULT_CALC_SPACE_HEIGHT } from '../config/constants';
import {mergeInk,mergeNotes,sameWork} from './workMerge';
import {waitForWorkIdle,isWorkInteracting} from './workInteraction';

export type OwnedWorkState = {
  ink: DrawData; notes: string; inkSeq: number; notesSeq: number;
  status: 'saved' | 'pending' | 'saving' | 'error' | 'conflict';
  error: string; storageFailed: boolean; restoring: boolean; editorVersion: number; revision:number; cloud?:Item;
};
type Draft = { ink?: DrawData; notes?: string; inkSeq: number; notesSeq: number; blocked?: boolean;
  baseInk?:DrawData; baseNotes?:string;
  sentInk?: {value: DrawData; seq: number}; sentNotes?: {value: string; seq: number} };
type Dependencies = {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  active: () => boolean; online: () => boolean;
  canAdoptCloud?: () => boolean;
  saveInk: (ink: DrawData, nextSeq: number) => Promise<{seq: number}>;
  saveNotes: (notes: string, expectedSeq: number) => Promise<{notes_seq: number}>;
  load: () => Promise<Item>;
  changed?: (state: OwnedWorkState) => void;
  delay?: number;
};
export const ownedDraftKey = (owner: string, id: string) => `rdv:owned-work:v1:${owner}:${id}`;
export function itemInk(item: Item): DrawData {
  try { if (item.draw_data) return typeof item.draw_data === 'string' ? JSON.parse(item.draw_data) : item.draw_data; }
  catch { /* A malformed cloud value must not discard a valid local draft. */ }
  return { strokes: [], eraserMasks: [], calcSpaceHeight: DEFAULT_CALC_SPACE_HEIGHT };
}
export function itemInkSeq(item: Item): number {
  // draw_seq is authoritative. vector_clock exists only for older guest records.
  if (Number.isSafeInteger(item.draw_seq)) return item.draw_seq!;
  try { return Number(JSON.parse(item.vector_clock || '{}').seq) || 0; } catch { return 0; }
}
const same = sameWork;

/** One writer per account/item. Local edits are durable before the debounce starts. */
export function createOwnedWorkController(key: string, initial: Item, deps: Dependencies) {
  let pendingInk: DrawData | undefined, pendingNotes: string | undefined;
  let blocked = false, running = false, stopped = false;
  let readFailed = false;
  let baseInk:DrawData|undefined=itemInk(initial),baseNotes:string|undefined=initial.typed_notes||'';
  let mergeRetries=0;
  let sentInk: Draft['sentInk'], sentNotes: Draft['sentNotes'];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let state: OwnedWorkState = { ink: itemInk(initial), notes: initial.typed_notes || '',
    inkSeq: itemInkSeq(initial), notesSeq: initial.notes_seq ?? 0,
    status: 'saved', error: '', storageFailed: false, restoring: true, editorVersion: 0,revision:0 };
  const listeners = new Set<() => void>();
  const notify = () => { state = {...state,revision:state.revision+1}; listeners.forEach(fn => fn()); };
  const changed = () => { deps.changed?.(state); notify(); };
  const pending = () => pendingInk !== undefined || pendingNotes !== undefined;
  const persist = () => {
    try {
      if (!pending()) deps.storage.removeItem(key);
      else deps.storage.setItem(key, JSON.stringify({ink: pendingInk, notes: pendingNotes,
        inkSeq: state.inkSeq, notesSeq: state.notesSeq, blocked, sentInk, sentNotes,baseInk,baseNotes} satisfies Draft));
      state = {...state, storageFailed: false};
      return true;
    } catch {
      state = {...state, storageFailed: true, status: 'error',
        error: '本機草稿儲存失敗；請下載本機作業，暫勿重新整理或離開。'};
      return false;
    }
  };
  try {
    const raw = deps.storage.getItem(key);
    if (raw) {
      const draft = JSON.parse(raw) as Draft;
      pendingInk = draft.ink; pendingNotes = draft.notes; blocked = !!draft.blocked;
      sentInk = draft.sentInk; sentNotes = draft.sentNotes;
      baseInk=draft.baseInk??(draft.inkSeq===itemInkSeq(initial)?itemInk(initial):undefined);
      baseNotes=draft.baseNotes??(draft.notesSeq===(initial.notes_seq??0)?initial.typed_notes||'':undefined);
      state = {...state, ink: draft.ink ?? state.ink, notes: draft.notes ?? state.notes,
        inkSeq: draft.inkSeq, notesSeq: draft.notesSeq,
        status: blocked ? 'conflict' : 'pending', error: blocked ? '已還原未同步的本機作業；請核對雲端版本。' : ''};
    }
  } catch {
    blocked = true; readFailed = true;
    state = {...state, storageFailed: true, status: 'error', error: '無法讀取本機草稿；請保留此頁並檢查瀏覽器儲存空間。'};
  }
  const reconcile = (cloud: Item) => {
    const inkSeq = itemInkSeq(cloud), notesSeq = cloud.notes_seq ?? 0;
    if(inkSeq<state.inkSeq||notesSeq<state.notesSeq)return;
    if (sentInk && inkSeq === sentInk.seq && same(itemInk(cloud), sentInk.value)) {
      state = {...state, inkSeq}; baseInk=itemInk(cloud); sentInk = undefined;
    }
    if (sentNotes && notesSeq === sentNotes.seq + 1 && (cloud.typed_notes || '') === sentNotes.value) {
      state = {...state, notesSeq}; baseNotes=cloud.typed_notes||''; sentNotes = undefined;
    }
    // A response may have been lost after the server committed. Identical content is an acknowledgement.
    if (pendingInk !== undefined && inkSeq >= state.inkSeq && same(itemInk(cloud), pendingInk)) {
      pendingInk = undefined; state = {...state, inkSeq};
    }
    if (pendingNotes !== undefined && notesSeq >= state.notesSeq && (cloud.typed_notes || '') === pendingNotes) {
      pendingNotes = undefined; state = {...state, notesSeq};
    }
    const ink=pendingInk===undefined?itemInk(cloud):inkSeq===state.inkSeq?pendingInk:mergeInk(baseInk,pendingInk,itemInk(cloud));
    const notes=pendingNotes===undefined?cloud.typed_notes||'':notesSeq===state.notesSeq?pendingNotes:mergeNotes(baseNotes,pendingNotes,cloud.typed_notes||'');
    if(ink===null||notes===null){
      // The local choice only replaces edited fields. Show the latest unedited
      // fields in its preview too, so the chosen result matches what was shown.
      if(pendingInk===undefined){baseInk=itemInk(cloud);state={...state,ink:itemInk(cloud),inkSeq};}
      if(pendingNotes===undefined){baseNotes=cloud.typed_notes||'';state={...state,notes:baseNotes,notesSeq};}
      blocked=true;state={...state,status:'conflict',cloud,error:'部分修改無法安全合併；請選擇保留雲端或本機作業。'};
    }else{
      pendingInk=same(ink,itemInk(cloud))?undefined:ink;
      pendingNotes=notes===(cloud.typed_notes||'')?undefined:notes;
      baseInk=itemInk(cloud);baseNotes=cloud.typed_notes||'';sentInk=undefined;sentNotes=undefined;
      blocked=false;state={...state,ink,notes,inkSeq,notesSeq,cloud:undefined,status:pending()?(running?'saving':'pending'):'saved',error:''};
    }
    persist(); changed();
  };
  const flush = async () => {
    if (running || (blocked&&state.cloud) || stopped || state.restoring || !pending() || !deps.active()) return;
    if (!persist()) { notify(); return; }
    if (!deps.online()) { state = {...state, status: 'pending', error: '尚未連線；本機草稿已保留。'}; notify(); return; }
    running = true; state = {...state, status: 'saving', error: ''}; notify();
    try {
      if (blocked || sentInk || sentNotes) {
        const cloud = await deps.load();
        await waitForWorkIdle();
        if (!deps.active() || stopped) return;
        reconcile(cloud);
        if (blocked) return;
      }
      while (pending() && deps.active() && !stopped) {
        if (pendingInk !== undefined) {
          const value = pendingInk;
          sentInk = {value, seq: state.inkSeq + 1};
          if (!persist()) break;
          const result = await deps.saveInk(value, state.inkSeq + 1);
          if (!deps.active() || stopped) return;
          if (result.seq !== state.inkSeq + 1) throw new Error('筆跡儲存回應缺少確認版本');
          baseInk=value;mergeRetries=0;state = {...state, inkSeq: result.seq};
          sentInk = undefined;
          if (pendingInk === value) pendingInk = undefined;
          persist(); changed();
        }
        if (pendingNotes !== undefined) {
          const value = pendingNotes;
          sentNotes = {value, seq: state.notesSeq};
          if (!persist()) break;
          const result = await deps.saveNotes(value, state.notesSeq);
          if (!deps.active() || stopped) return;
          if (result.notes_seq !== state.notesSeq + 1) throw new Error('筆記儲存回應缺少確認版本');
          baseNotes=value;mergeRetries=0;state = {...state, notesSeq: result.notes_seq};
          sentNotes = undefined;
          if (pendingNotes === value) pendingNotes = undefined;
          persist(); changed();
        }
      }
      if (!state.storageFailed) state = {...state, status: pending() ? 'pending' : 'saved', error: ''};
    } catch (error) {
      if (!deps.active() || stopped) return;
      const conflict = error instanceof Error && error.message.startsWith('CONFLICT:');
      if (conflict&&mergeRetries<3) {
        mergeRetries++;
        blocked = true;
        state = {...state, status: 'conflict', error: '雲端與本機版本不同；請核對版本。本機作業不會自動覆蓋雲端。'};
        // Only on failure: no extra GET on ordinary drawing/typing.
        try { const cloud = await deps.load();await waitForWorkIdle(); if (deps.active() && !stopped) reconcile(cloud); } catch { /* Preserve both draft and conflict state. */ }
      } else state = {...state, status: 'error', error: '同步失敗；本機作業仍保留，請重試同步。'};
      persist();
    } finally {
      if(state.status==='saving')state={...state,status:pending()?'pending':'saved'};
      running = false; notify();
      if (!blocked && pending() && state.status !== 'error' && !stopped) schedule();
    }
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void flush(), deps.delay ?? 600); };
  const edit = () => {
    state = {...state, status: blocked ? 'conflict' : running?'saving':'pending'};
    persist(); changed(); if (!blocked) schedule();
  };
  const backup = (cloud: Item) => {
    // Never erase/replace a pending draft until its backup has been written successfully.
    deps.storage.setItem(key + `:backup:${Date.now()}`, JSON.stringify({local:{ink:state.ink,notes:state.notes,
      inkSeq:state.inkSeq,notesSeq:state.notesSeq},cloud}));
  };
  return {
    getState: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    pending, flush,loadCloud:async()=>{
      const cloud=await deps.load();if(!deps.active()||stopped)throw Error('登入帳號或作業對象已變更；未採用任何版本。');return cloud;
    },
    ink: (ink: DrawData) => { if (state.restoring || stopped) return; pendingInk = ink; state = {...state, ink}; edit(); },
    notes: (notes: string) => { if (state.restoring || stopped) return; pendingNotes = notes; state = {...state, notes}; edit(); },
    // Recover the previous IndexedDB queue once, without replacing a newer local draft.
    restoreLegacy: (draft?: {drawData?: DrawData; seq?: number; typed_notes?: string; notesSeq?: number; blockedReason?: string}) => {
      if (readFailed) {state = {...state, restoring: false}; notify(); return false;}
      if (draft && (draft.drawData !== undefined || draft.typed_notes !== undefined)) {
        if (pending()) deps.storage.setItem(key + ':legacy-backup', JSON.stringify(draft));
        else {
          pendingInk = draft.drawData; pendingNotes = draft.typed_notes;
          // Legacy queues did not retain a common ancestor. Never guess its contents.
          baseInk=undefined;baseNotes=undefined;
          blocked = !!draft.blockedReason;
          state = {...state, ink: pendingInk ?? state.ink, notes: pendingNotes ?? state.notes,
            inkSeq: pendingInk === undefined ? state.inkSeq : Math.max(0, (draft.seq ?? 1) - 1),
            notesSeq: pendingNotes === undefined ? state.notesSeq : draft.notesSeq ?? state.notesSeq,
            status: blocked ? 'conflict' : 'pending', error: blocked ? '已還原先前衝突的本機作業；請核對雲端版本。' : ''};
        }
      }
      state = {...state, restoring: false};
      const success = persist(); changed();
      if (success && pending()) schedule();
      return success;
    },
    restoreFailed: () => { blocked = true; readFailed = true; state = {...state, restoring: false, status: 'error',
      error: '舊版本草稿讀取失敗；請重新載入，暫勿開始書寫。', storageFailed: true}; notify(); },
    observeCloud: (cloud: Item) => {
      if (blocked || state.restoring || stopped || isWorkInteracting()) return;
      const inkSeq = itemInkSeq(cloud), notesSeq = cloud.notes_seq ?? 0;
      const newerInk = pendingInk === undefined && inkSeq > state.inkSeq;
      const newerNotes = pendingNotes === undefined && notesSeq > state.notesSeq;
      if (!newerInk && !newerNotes) return;
      if(newerInk)baseInk=itemInk(cloud);if(newerNotes)baseNotes=cloud.typed_notes||'';
      state = {...state, ...(newerInk ? {ink: itemInk(cloud), inkSeq} : {}),
        ...(newerNotes ? {notes: cloud.typed_notes || '', notesSeq} : {})};
      persist(); changed();
    },
    adoptCloud: (cloud: Item) => {
      if(!deps.active())throw Error('登入帳號已變更；未採用任何版本。');
      if (running) throw new Error('請等待目前同步結束');
      if (stopped || state.restoring) throw new Error('請等待題目草稿載入完成');
      if (deps.canAdoptCloud && !deps.canAdoptCloud()) throw new Error('舊版草稿尚未清理完成；請稍後重試，暫勿重新整理。');
      if (pending()) backup(cloud);
      // Delete replayable work before replacing memory. A failed deletion must not
      // report success and resurrect the discarded draft on the next page load.
      try { deps.storage.removeItem(key); }
      catch { throw new Error('無法清除本機草稿；尚未替換作業，請先下載本機作業。'); }
      clearTimeout(timer);
      pendingInk = undefined; pendingNotes = undefined; sentInk = undefined; sentNotes = undefined; blocked = false;
      baseInk=itemInk(cloud);baseNotes=cloud.typed_notes||'';mergeRetries=0;
      state = {...state, ink: itemInk(cloud), notes: cloud.typed_notes || '', inkSeq: itemInkSeq(cloud),
        notesSeq: cloud.notes_seq ?? 0, status: 'saved', error: '', storageFailed: false,
        editorVersion: state.editorVersion + 1,cloud:undefined}; changed();
    },
    keepLocal: (cloud: Item) => {
      if(!deps.active())throw Error('登入帳號已變更；未採用任何版本。');
      if (running) throw new Error('請等待目前同步結束');
      if(stopped||state.restoring)throw new Error('請等待題目草稿載入完成');
      backup(cloud); blocked = false; sentInk = undefined; sentNotes = undefined;
      baseInk=itemInk(cloud);baseNotes=cloud.typed_notes||'';mergeRetries=0;
      state = {...state, ink: pendingInk ?? itemInk(cloud), notes: pendingNotes ?? (cloud.typed_notes || ''),
        inkSeq: itemInkSeq(cloud), notesSeq: cloud.notes_seq ?? 0, status: 'pending', error: '',cloud:undefined};
      if(!persist()){changed();throw Error('本機草稿儲存失敗；尚未送出選擇的版本。');} changed(); schedule();
    },
    retry: () => {
      mergeRetries=0;
      if (readFailed || state.restoring) return;
      if (blocked) {
        state = {...state, status: 'conflict', error: '請核對雲端版本，再選擇作業內容。'};
        persist(); notify();
      } else void flush();
    },
    stop: () => { stopped = true; clearTimeout(timer); },
    unused: () => !listeners.size && !pending() && !running && !state.restoring,
  };
}
