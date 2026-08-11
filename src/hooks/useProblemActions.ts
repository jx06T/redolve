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
  deleteProblem,
  analyzeProblem,
  analyzeGuestProblem,
} from '../services/api';
import { getOfflineDB, getOfflineProblem } from '../services/offlineStorage';
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

async function updateOfflineMetadata(
  id: string,
  patch: { topic_id?: string | null; keywords?: string[]; typed_notes?: string }
) {
  const db = await getOfflineDB();
  const existing = await db.get(OFFLINE_PROBS_STORE, id);
  if (!existing) return;

  const updatedTagResult = {
    ...(existing.tagResult ?? { topic_id: existing.topicId, keywords: [] }),
  };

  if (patch.topic_id !== undefined) {
    updatedTagResult.topic_id = patch.topic_id ?? existing.topicId;
  }
  if (patch.keywords !== undefined) {
    updatedTagResult.keywords = patch.keywords;
  }

  await db.put(OFFLINE_PROBS_STORE, {
    ...existing,
    topicId: patch.topic_id ?? existing.topicId,
    tagResult: updatedTagResult as typeof existing.tagResult,
  });
}

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
      const nextStatus = problem.status === 'resolved' ? 'unsolved' : 'resolved';

      // Optimistic update
      updateProblemInStore(problem.id, {
        status: nextStatus,
        review_count: nextStatus === 'resolved' ? problem.review_count + 1 : problem.review_count,
      });

      if (!isOfflineProblemId(problem.id)) {
        try {
          await updateProblemStatus(problem.id, nextStatus);
        } catch (err) {
          console.error('[useProblemActions] toggleStatus failed:', err);
          // Roll back
          updateProblemInStore(problem.id, {
            status: problem.status,
            review_count: problem.review_count,
          });
        }
      }
      // Offline items: status lives only in the store (IndexedDB doesn't track
      // status separately; it'll be 'unsolved' on next load, which is fine since
      // offline problems are short-lived).

      return nextStatus;
    },
    [updateProblemInStore]
  );

  /**
   * Toggle archived ↔ previous status.
   */
  const toggleArchive = useCallback(
    async (problem: Item) => {
      const isArchived = problem.status === 'archived';
      const nextStatus: Item['status'] = isArchived
        ? 'unsolved'
        : 'archived';

      updateProblemInStore(problem.id, { status: nextStatus });

      if (!isOfflineProblemId(problem.id)) {
        try {
          await updateProblemStatus(problem.id, nextStatus);
        } catch (err) {
          console.error('[useProblemActions] toggleArchive failed:', err);
          updateProblemInStore(problem.id, { status: problem.status });
        }
      }
    },
    [updateProblemInStore]
  );

  /**
   * Save ink/draw data.
   * For offline items, we skip the API; the drawing is stored in the in-memory
   * store and reflected via `problem.draw_data`.  (Full persistence of draw data
   * for offline items is a future enhancement.)
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
          console.error('[useProblemActions] saveDrawData failed:', err);
        }
      }
    },
    [updateProblemInStore]
  );

  /**
   * Save typed notes (debounced by the caller).
   */
  const saveTypedNotes = useCallback(
    async (problem: Item, text: string) => {
      // Store update is already handled by caller; this just persists to backend.
      if (!isOfflineProblemId(problem.id)) {
        try {
          await updateProblemMetadata(problem.id, { typed_notes: text });
        } catch (err) {
          console.error('[useProblemActions] saveTypedNotes failed:', err);
        }
      }
      // Offline: in-memory store is the source of truth for now.
    },
    []
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
        await updateOfflineMetadata(problem.id, patch);
      } else {
        try {
          await updateProblemMetadata(problem.id, patch);
        } catch (err) {
          console.error('[useProblemActions] saveMetadata failed:', err);
          // Roll back
          updateProblemInStore(problem.id, {
            topic_id: problem.topic_id,
            keywords: problem.keywords,
          });
          throw err;
        }
      }
    },
    [updateProblemInStore]
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
        return await analyzeGuestProblem(file);
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
