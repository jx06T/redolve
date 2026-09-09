import { openDB, DBSchema } from 'idb';

interface SyncQueueItem {
  id: string; // problem id
  drawData?: any;
  seq?: number;
  status?: 'unsolved' | 'resolved' | 'archived';
  typed_notes?: string;
  metadata_patch?: { topic_id?: string | null; keywords?: string[] };
  timestamp: number;
}

export interface OfflineProblem {
  id: string;
  fileData: Blob;
  source: string;
  topicId: string;
  timestamp: number;
  status?: 'unsolved' | 'resolved' | 'archived';
  draw_data?: any;
  typed_notes?: string;
  review_count?: number;
  vector_clock?: any;
  tagResult?: {
    topic_id: string;
    keywords: string[];
    ocr_text?: string;
  };
}

export interface RedolveDB extends DBSchema {
  syncQueue: {
    key: string;
    value: SyncQueueItem;
  };
  offlineProblems: {
    key: string;
    value: OfflineProblem;
  };
}

const DB_NAME = 'redolve_offline_db';
const SYNC_STORE_NAME = 'syncQueue';
const OFFLINE_PROBS_STORE = 'offlineProblems';

export async function getOfflineDB() {
  return openDB<RedolveDB>(DB_NAME, 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        db.createObjectStore(SYNC_STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(OFFLINE_PROBS_STORE)) {
        db.createObjectStore(OFFLINE_PROBS_STORE, { keyPath: 'id' });
      }
    },
  });
}

export async function queueOfflineMutation(
  problemId: string,
  mutation: Partial<Omit<SyncQueueItem, 'id' | 'timestamp'>>
) {
  const db = await getOfflineDB();
  const tx = db.transaction(SYNC_STORE_NAME, 'readwrite');
  const store = tx.objectStore(SYNC_STORE_NAME);

  const existing = await store.get(problemId) || { id: problemId, timestamp: Date.now() };

  await store.put({
    ...existing,
    ...mutation,
    timestamp: Date.now(),
  });
  await tx.done;
}

export async function getOfflineProblem(id: string): Promise<OfflineProblem | undefined> {
  const db = await getOfflineDB();
  return db.get(OFFLINE_PROBS_STORE, id);
}

export async function getQueuedDraws(): Promise<SyncQueueItem[]> {
  const db = await getOfflineDB();
  return db.getAll(SYNC_STORE_NAME);
}

export async function removeQueuedDraw(problemId: string) {
  const db = await getOfflineDB();
  await db.delete(SYNC_STORE_NAME, problemId);
}

export async function updateOfflineProblemStatus(
  id: string,
  status: 'unsolved' | 'resolved' | 'archived',
  reviewCount?: number
) {
  const db = await getOfflineDB();
  const existing = await db.get(OFFLINE_PROBS_STORE, id);
  if (!existing) return;

  await db.put(OFFLINE_PROBS_STORE, {
    ...existing,
    status,
    review_count: typeof reviewCount === 'number' ? reviewCount : existing.review_count,
  });
}

export async function updateOfflineProblemDraw(id: string, drawData: any, seq: number) {
  const db = await getOfflineDB();
  const existing = await db.get(OFFLINE_PROBS_STORE, id);
  if (!existing) return;

  await db.put(OFFLINE_PROBS_STORE, {
    ...existing,
    draw_data: drawData,
    vector_clock: { node: 'client', seq },
  });
}

export async function updateOfflineProblemNotes(id: string, typedNotes: string) {
  const db = await getOfflineDB();
  const existing = await db.get(OFFLINE_PROBS_STORE, id);
  if (!existing) return;

  await db.put(OFFLINE_PROBS_STORE, {
    ...existing,
    typed_notes: typedNotes,
  });
}

export async function updateOfflineProblemMetadata(
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
    typed_notes: patch.typed_notes !== undefined ? patch.typed_notes : existing.typed_notes,
    tagResult: updatedTagResult as typeof existing.tagResult,
  });
}

// Online Auto-Sync Handler
export function initOnlineSync(syncCallback: (item: SyncQueueItem) => Promise<boolean>) {
  const syncAll = async () => {
    console.log('[PWA Sync] Syncing offline queue...');
    const items = await getQueuedDraws();
    for (const item of items) {
      try {
        const success = await syncCallback(item);
        if (success) {
          await removeQueuedDraw(item.id);
        }
      } catch (err) {
        console.error(`[PWA Sync] Failed to sync item ${item.id}`, err);
      }
    }
  };

  window.addEventListener('online', syncAll);

  // Sync immediately if currently online
  if (navigator.onLine) {
    syncAll();
  }
}
