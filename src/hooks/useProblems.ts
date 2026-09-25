import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import {
  fetchProblems,
  fetchProblemById,
} from '../services/api';
import { OfflineSyncManager } from '../services/OfflineSyncManager';
import { findNodeAndLineage, getRootSubjectId } from '../components/StatusBadge';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';
import { Item, TaxonomyNode } from '../types';
import { isGuestUser } from '../utils/guest';

export interface UseProblemsOptions {
  subject: string;
  topic?: string;
  status?: string;
  targetProblemId?: string | null;
}

/**
 * Checks whether an item strictly satisfies current subject, topic, and status filters.
 */
export function doesItemMatchFilters(
  item: Item,
  filters: { subject?: string; topic?: string; status?: string },
  taxonomies: TaxonomyNode[]
): boolean {
  const { subject, topic, status } = filters;

  // 1. Status Filter Check
  if (status && status !== 'all') {
    if (item.status !== status) return false;
  } else {
    // Default 'all' view strictly excludes archived items
    if (item.status === 'archived') return false;
  }

  // 2. Subject Filter Check
  if (subject && subject !== 'all') {
    if (subject === 'unclassified') {
      if (item.topic_id) return false;
    } else {
      const root = getRootSubjectId(item.topic_id || '', taxonomies);
      if (root !== subject) return false;
    }
  }

  // 3. Topic Filter Check
  if (topic && topic !== 'all') {
    if (topic === 'unclassified') {
      if (item.topic_id) return false;
    } else {
      if (item.topic_id !== topic) {
        // Also allow if item's topic_id is a child/descendant of the selected topic
        const lineage =
          findNodeAndLineage(taxonomies, item.topic_id || '') ||
          findNodeAndLineage(TAXONOMY_SEED_DATA, item.topic_id || '');
        if (!lineage || !lineage.some((n) => n.id === topic)) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Unified data-source hook for problem lists.
 *
 * - Logged-in users: fetches from the remote API (cloud).
 * - Guest users: read IndexedDB directly, including when the network is unavailable.
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

  const isGuest = isGuestUser(currentUser);

  const taxonomiesRef = useRef(taxonomies && taxonomies.length > 0 ? taxonomies : TAXONOMY_SEED_DATA);
  useEffect(() => {
    taxonomiesRef.current = taxonomies && taxonomies.length > 0 ? taxonomies : TAXONOMY_SEED_DATA;
  }, [taxonomies]);

  const loadOfflineItems = useCallback(async (filters: { subject: string; topic?: string; status?: string }) => {
    const offlineItems = await OfflineSyncManager.getOfflineProblemsAsItems();
    const localTaxonomies = taxonomiesRef.current;
    return offlineItems.filter((item) =>
      doesItemMatchFilters(item, filters, localTaxonomies)
    );
  }, []);

  /**
   * Load the first page of problems.
   * Called on mount and whenever filters change.
   */
  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isGuest) {
        const localItems = await loadOfflineItems({ subject, topic, status });
        setProblems(localItems, null);
        return;
      }
      const res = await fetchProblems({
        subject_id: subject,
        topic_id: topic ?? undefined,
        status: status === 'all' ? undefined : status,
        limit: 15,
      });

      let finalItems = res.items;

      // Pull in a specific problem by ID only if it was requested AND matches active filters
      if (
        targetProblemId && 
        !targetProblemId.startsWith('temp_') && 
        !finalItems.some((p) => p.id === targetProblemId)
      ) {
        try {
          const target = await fetchProblemById(targetProblemId);
          if (
            target &&
            doesItemMatchFilters(target, { subject, topic, status }, taxonomiesRef.current)
          ) {
            finalItems = [target, ...finalItems];
          }
        } catch {
          // Not fatal; the item simply won't be pre-fetched
        }
      }

      setProblems(finalItems, res.nextCursor);
    } catch (err) {
      console.error('[useProblems] load failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [subject, topic, status, targetProblemId, isGuest, setProblems, setIsLoading, loadOfflineItems]);

  /**
   * Append the next page of cloud problems (pagination).
   * Offline items are already loaded on the first page; they are not paginated.
   */
  const loadMore = useCallback(async () => {
    if (isGuest || !nextCursor || isLoading) return;
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
  }, [subject, topic, status, nextCursor, isLoading, isGuest, appendProblems, setIsLoading]);

  return { problems, nextCursor, isLoading, load, loadMore };
}
