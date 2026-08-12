import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import {
  fetchProblems,
  fetchProblemById,
} from '../services/api';
import { OfflineSyncManager } from '../services/OfflineSyncManager';
import { getRootSubjectId } from '../components/StatusBadge';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';

export interface UseProblemsOptions {
  subject: string;
  topic?: string;
  status?: string;
  targetProblemId?: string | null;
}

/**
 * Unified data-source hook for problem lists.
 *
 * - Logged-in users: fetches from the remote API (cloud).
 * - Guest users: merges local IndexedDB items with any remote API results
 *   (the API returns empty for guests, but the merge logic is safe either way).
 *
 * Consumers (Views) only call `load()` / `loadMore()` and subscribe to
 * `problems`, `nextCursor`, and `isLoading` from the store — they never need
 * to know whether data comes from IndexedDB or the network.
 */
export function useProblems({ subject, topic, status, targetProblemId }: UseProblemsOptions) {
  const {
    problems,
    setProblems,
    appendProblems,
    nextCursor,
    isLoading,
    setIsLoading,
    currentUser,
    taxonomies,
  } = useStore();

  const isGuest = !currentUser;

  // Use refs so the async callback always reads the latest values without
  // being forced to re-create itself (which would cause unwanted reloads).
  const isGuestRef = useRef(isGuest);
  useEffect(() => { isGuestRef.current = isGuest; }, [isGuest]);

  const taxonomiesRef = useRef(taxonomies && taxonomies.length > 0 ? taxonomies : TAXONOMY_SEED_DATA);
  useEffect(() => {
    taxonomiesRef.current = taxonomies && taxonomies.length > 0 ? taxonomies : TAXONOMY_SEED_DATA;
  }, [taxonomies]);

  /**
   * Merge offline items into a cloud result list.
   * Offline items that already have a matching id in cloudItems are skipped.
   */
  const mergeOfflineItems = useCallback(async (
    cloudItems: ReturnType<typeof useStore.getState>['problems'],
    filters: { subject: string; topic?: string; status?: string }
  ) => {
    const offlineItems = await OfflineSyncManager.getOfflineProblemsAsItems();
    const localTaxonomies = taxonomiesRef.current;

    const filtered = offlineItems.filter((item) => {
      const { subject: subjectFilter, topic: topicFilter, status: statusFilter } = filters;

      if (subjectFilter && subjectFilter !== 'all') {
        if (subjectFilter === 'unclassified') {
          if (item.topic_id) return false;
        } else {
          const root = getRootSubjectId(item.topic_id || '', localTaxonomies);
          if (root !== subjectFilter) return false;
        }
      }

      if (topicFilter && topicFilter !== 'all') {
        if (item.topic_id !== topicFilter) return false;
      }

      if (statusFilter && statusFilter !== 'all') {
        if (item.status !== statusFilter) return false;
      }

      return true;
    });

    const existingIds = new Set(cloudItems.map((i) => i.id));
    // Offline items always go first so they are immediately visible
    return [...filtered.filter((o) => !existingIds.has(o.id)), ...cloudItems];
  }, []);

  /**
   * Load the first page of problems.
   * Called on mount and whenever filters change.
   */
  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchProblems({
        subject_id: subject,
        topic_id: topic ?? undefined,
        status: status === 'all' ? undefined : status,
        limit: 15,
      });

      let finalItems = res.items;

      // Pull in a specific problem by ID if it wasn't in the page results
      if (
        targetProblemId && 
        !targetProblemId.startsWith('temp_') && 
        !finalItems.some((p) => p.id === targetProblemId)
      ) {
        try {
          const target = await fetchProblemById(targetProblemId);
          if (target) finalItems = [target, ...finalItems];
        } catch {
          // Not fatal; the item simply won't be pre-fetched
        }
      }

      if (isGuestRef.current) {
        finalItems = await mergeOfflineItems(finalItems, { subject, topic, status });
      }

      setProblems(finalItems, res.nextCursor);
    } catch (err) {
      console.error('[useProblems] load failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [subject, topic, status, targetProblemId, setProblems, setIsLoading, mergeOfflineItems]);

  /**
   * Append the next page of cloud problems (pagination).
   * Offline items are already loaded on the first page; they are not paginated.
   */
  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoading) return;
    setIsLoading(true);
    try {
      const res = await fetchProblems({
        subject_id: subject,
        topic_id: topic ?? undefined,
        status: status === 'all' ? undefined : status,
        cursor: nextCursor,
        limit: 15,
      });
      appendProblems(res.items, res.nextCursor);
    } catch (err) {
      console.error('[useProblems] loadMore failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [subject, topic, status, nextCursor, isLoading, appendProblems, setIsLoading]);

  return { problems, nextCursor, isLoading, load, loadMore };
}
