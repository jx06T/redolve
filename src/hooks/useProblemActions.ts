/**
 * useProblemActions
 *
 * A unified, source-agnostic action layer for all problem mutations.
 *
 * Design contract:
 * - For cloud items (UUID IDs): delegate to the REST API as before.
 * - For offline items (`temp_*` IDs): operate on IndexedDB only; never touch
 *   the server.  The store is always updated optimistically so the UI stays
 *   in sync without a round-trip.
 *
 * This hook is the single place that decides "is this a local or cloud item?"
 * so callers (ProblemCard, SmartCTA, StudyView …) stay completely unaware of
 * the distinction.
 */
import { useCallback } from 'react';
import { useStore } from '../store/useStore';
import {
  updateProblemStatus,
  updateProblemDrawData,
  updateProblemMetadata,
  mutateProblemTag,
  deleteProblem,
  analyzeProblem,
  analyzeGuestProblem,
} from '../services/api';
import {
  getOfflineDB,
  getOfflineProblem,
  updateOfflineProblemStatus,
  updateOfflineProblemDraw,
  updateOfflineProblemNotes,
  updateOfflineProblemMetadata,
  updateOfflineProblemAnalysis,
  queueOfflineMutation,
} from '../services/offlineStorage';
import { OfflineSyncManager } from '../services/OfflineSyncManager';
import { DrawData, Item } from '../types';

const OFFLINE_PROBS_STORE = 'offlineProblems';

/** Returns true when `id` belongs to a locally-stored offline item. */
export function isOfflineProblemId(id: string): boolean {
  return id.startsWith('temp_');
}

// ---------------------------------------------------------------------------
// Offline helpers — direct IndexedDB mutations
// ---------------------------------------------------------------------------

async function deleteOfflineProblem(id: string) {
  const db = await getOfflineDB();
  await db.delete(OFFLINE_PROBS_STORE, id);
  // Also clean up the cached Blob URL
  await OfflineSyncManager.revokeObjectUrl(id);
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export function useProblemActions() {
  const { updateProblemInStore, removeProblemFromStore, showToast } = useStore();

  /**
   * Toggle resolved ↔ unsolved for a problem.
   * Returns the new status so the caller can do UI follow-up.
   */
  const toggleStatus = useCallback(
    async (problem: Item): Promise<'resolved' | 'unsolved' | 'archived'> => {
      // Archived problems must not be toggled via this action.
      if (problem.status === 'archived') return 'archived';

      const nextStatus = problem.status === 'resolved' ? 'unsolved' : 'resolved';
      const nextReviewCount = nextStatus === 'resolved' ? problem.review_count + 1 : problem.review_count;

      // Optimistic update
      updateProblemInStore(problem.id, {
        status: nextStatus,
        review_count: nextReviewCount,
      });

      if (!isOfflineProblemId(problem.id)) {
        try {
          await updateProblemStatus(problem.id, nextStatus);
          // Refresh sidebar topic counts asynchronously
          useStore.getState().loadTaxonomies();
        } catch (err) {
          console.error('[useProblemActions] toggleStatus failed, queueing for offline sync:', err);
          await queueOfflineMutation(problem.id, { status: nextStatus }, problem.user_id);
        }
      } else {
        // Persist offline status into IndexedDB so it survives page reloads
        await updateOfflineProblemStatus(problem.id, nextStatus, nextReviewCount);
      }

      return nextStatus;
    },
    [updateProblemInStore]
  );

  /**
   * Toggle archived ↔ unsolved.
   */
  const toggleArchive = useCallback(
    async (problem: Item) => {
      const isArchived = problem.status === 'archived';
      const nextStatus: Item['status'] = isArchived ? 'unsolved' : 'archived';

      // Optimistic: show the new status immediately so the UI feels instant.
      updateProblemInStore(problem.id, { status: nextStatus });

      if (!isOfflineProblemId(problem.id)) {
        try {
          await updateProblemStatus(problem.id, nextStatus);

          const currentSelectedStatus = useStore.getState().selectedStatus;
          const shouldRemove =
            nextStatus === 'archived' ||
            (isArchived && currentSelectedStatus === 'archived');
          if (shouldRemove) {
            removeProblemFromStore(problem.id);
          }

          // Refresh sidebar topic counts asynchronously.
          useStore.getState().loadTaxonomies();
        } catch (err) {
          console.error('[useProblemActions] toggleArchive failed, queueing for offline sync:', err);
          await queueOfflineMutation(problem.id, { status: nextStatus }, problem.user_id);
        }
      } else {
        // Offline items: update status in IndexedDB and remove from active list when archiving.
        await updateOfflineProblemStatus(problem.id, nextStatus);
        if (nextStatus === 'archived') {
          removeProblemFromStore(problem.id);
        }
      }
    },
    [updateProblemInStore, removeProblemFromStore]
  );

  /**
   * Save ink/draw data.
   */
  const saveDrawData = useCallback(
    async (problem: Item, drawData: DrawData, seq: number) => {
      updateProblemInStore(problem.id, {
        draw_data: JSON.stringify(drawData),
        vector_clock: JSON.stringify({ node: 'client', seq }),
      });

      if (!isOfflineProblemId(problem.id)) {
        try {
          await updateProblemDrawData(problem.id, drawData, seq);
        } catch (err) {
          console.error('[useProblemActions] saveDrawData failed, queueing for offline sync:', err);
          const conflict=err instanceof Error&&err.message.startsWith('CONFLICT:');
          await queueOfflineMutation(problem.id, { drawData, seq,
            blockedReason:conflict?'筆跡版本衝突':undefined }, problem.user_id);
          if(conflict) showToast('筆跡與另一裝置衝突，本機草稿已保留，請重新載入並手動處理。','error',8000);
        }
      } else {
        // Persist offline stroke data in IndexedDB
        await updateOfflineProblemDraw(problem.id, drawData, seq);
      }
    },
    [updateProblemInStore, showToast]
  );

  /**
   * Save typed notes (debounced by the caller).
   */
  const saveTypedNotes = useCallback(
    async (problem: Item, text: string) => {
      if (!isOfflineProblemId(problem.id)) {
        try {
          const res=await updateProblemMetadata(problem.id, {
            typed_notes: text, expected_notes_seq: problem.notes_seq ?? 0,
          });
          updateProblemInStore(problem.id,{notes_seq:res.notes_seq});
        } catch (err) {
          console.error('[useProblemActions] saveTypedNotes failed, queueing for offline sync:', err);
          const conflict=err instanceof Error&&err.message.startsWith('CONFLICT:');
          await queueOfflineMutation(problem.id, { typed_notes: text, notesSeq:problem.notes_seq ?? 0,
            blockedReason:conflict?'筆記版本衝突':undefined }, problem.user_id);
          if(conflict) showToast('筆記與另一裝置衝突，本機草稿已保留，請重新載入並手動處理。','error',8000);
        }
      } else {
        // Persist typed notes in IndexedDB for offline items
        await updateOfflineProblemNotes(problem.id, text);
      }
    },
    [updateProblemInStore, showToast]
  );

  /**
   * Save topic + keywords metadata.
   * For offline items, also patches IndexedDB so the tags survive a page refresh.
   */
  const saveMetadata = useCallback(
    async (
      problem: Item,
      patch: { topic_id?: string | null; keywords?: string[] }
    ) => {
      // Optimistic
      updateProblemInStore(problem.id, {
        topic_id: patch.topic_id ?? problem.topic_id,
        keywords: patch.keywords ? JSON.stringify(patch.keywords) : problem.keywords,
      });

      if (isOfflineProblemId(problem.id)) {
        await updateOfflineProblemMetadata(problem.id, patch);
      } else {
        try {
          if(patch.keywords){
            let old:string[]=[];
            try{const parsed=JSON.parse(problem.keywords||'[]');if(Array.isArray(parsed))old=parsed;}
            catch{old=[];}
            for(const tag of patch.keywords.filter(x=>!old.includes(x)))
              await mutateProblemTag(problem.id,'add',tag);
            for(const tag of old.filter(x=>!patch.keywords!.includes(x)))
              await mutateProblemTag(problem.id,'remove',tag);
          }
          if(patch.topic_id!==undefined) await updateProblemMetadata(problem.id,{topic_id:patch.topic_id});
        } catch (err) {
          console.error('[useProblemActions] saveMetadata failed, queueing for offline sync:', err);
          let old:string[]=[];
          try{const parsed=JSON.parse(problem.keywords||'[]');if(Array.isArray(parsed))old=parsed;}
          catch{old=[];}
          const tag_ops=patch.keywords?[
            ...patch.keywords.filter(x=>!old.includes(x)).map(tag=>({op:'add' as const,tag})),
            ...old.filter(x=>!patch.keywords!.includes(x)).map(tag=>({op:'remove' as const,tag})),
          ]:undefined;
          const conflict=err instanceof Error&&err.message.startsWith('CONFLICT:');
          await queueOfflineMutation(problem.id, { metadata_patch:{topic_id:patch.topic_id},
            tag_ops,blockedReason:conflict?'分類版本衝突':undefined }, problem.user_id);
          if(conflict) showToast('分類更新衝突，本機修改已保留，請重新載入。','error',8000);
        }
      }
    },
    [updateProblemInStore, showToast]
  );

  /**
   * Delete a problem.
   * For offline items, removes from IndexedDB.  For cloud items, calls the API.
   */
  const deleteItem = useCallback(
    async (problem: Item) => {
      if (isOfflineProblemId(problem.id)) {
        await deleteOfflineProblem(problem.id);
        removeProblemFromStore(problem.id);
        showToast('已刪除本機錯題', 'success', 2000);
      } else {
        try {
          await deleteProblem(problem.id);
          removeProblemFromStore(problem.id);
          showToast('已刪除錯題', 'success', 2000);
        } catch (err) {
          console.error('[useProblemActions] delete failed:', err);
          showToast('刪除失敗，請稍後重試', 'error', 3000);
          throw err;
        }
      }
    },
    [removeProblemFromStore, showToast]
  );

  /**
   * Analyze problem using AI.
   * For offline items, uses the guest analysis endpoint with local blob data.
   */
  const analyzeItem = useCallback(
    async (problem: Item) => {
      if (isOfflineProblemId(problem.id)) {
        const offlineData = await getOfflineProblem(problem.id);
        if (!offlineData) throw new Error('找不到本機錯題圖檔');
        const file = new File([offlineData.fileData], 'problem.png', { type: offlineData.fileData.type });
        const result = await analyzeGuestProblem(file);
        await updateOfflineProblemAnalysis(problem.id, result.tagResult);
        return result;
      } else {
        return await analyzeProblem(problem.id);
      }
    },
    []
  );

  return {
    toggleStatus,
    toggleArchive,
    saveDrawData,
    saveTypedNotes,
    saveMetadata,
    deleteItem,
    analyzeItem,
    isOffline: isOfflineProblemId,
  };
}
