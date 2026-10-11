import { openDB, DBSchema } from 'idb';

interface SyncQueueItem {
  id: string; // problem id
  ownerId?: string; // account that created the queued mutation
  drawData?: any;
  seq?: number;
  notesSeq?: number;
  blockedReason?: string;
  status?: 'unsolved' | 'resolved' | 'archived' | 'processing';
  typed_notes?: string;
  metadata_patch?: { topic_id?: string | null; keywords?: string[] };
  tag_ops?: { op: 'add' | 'remove'; tag: string }[];
  timestamp: number;
}

export interface OfflineProblem {
  id: string;
  fileData: Blob;
  source: string;
  topicId: string;
  timestamp: number;
  cloudId?: string;
  cloudOwnerId?: string;
  status?: 'unsolved' | 'resolved' | 'archived' | 'processing';
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

// WebKit can reject Blob/File values in IndexedDB, especially in private browsing.
// Keep bytes in the object store and expose a Blob to the rest of the app.
type StoredOfflineProblem = Omit<OfflineProblem, 'fileData'> & {
  fileData: ArrayBuffer | Blob;
  fileType?: string;
};

function restoreOfflineProblem(problem: StoredOfflineProblem): OfflineProblem {
  const { fileType, ...rest } = problem;
  if (problem.fileData instanceof Blob) return { ...rest, fileData: problem.fileData };
  return { ...rest, fileData: new Blob([problem.fileData], { type: fileType || 'image/jpeg' }) };
}

export async function putOfflineProblem(problem: OfflineProblem): Promise<void> {
  const bytes = await problem.fileData.arrayBuffer();
  const db = await getOfflineDB();
  await db.put(OFFLINE_PROBS_STORE, {
    ...problem,
    fileData: bytes,
    fileType: problem.fileData.type || 'image/jpeg',
  });
}

export async function getOfflineProblems(): Promise<OfflineProblem[]> {
  const db = await getOfflineDB();
  return (await db.getAll(OFFLINE_PROBS_STORE)).map(restoreOfflineProblem);
}

export interface RedolveDB extends DBSchema {
  syncQueue: {
    key: string;
    value: SyncQueueItem;
  };
  offlineProblems: {
    key: string;
    value: StoredOfflineProblem;
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
  mutation: Partial<Omit<SyncQueueItem, 'id' | 'timestamp' | 'ownerId'>>,
  ownerId: string
) {
  const db = await getOfflineDB();
  const tx = db.transaction(SYNC_STORE_NAME, 'readwrite');
  const store = tx.objectStore(SYNC_STORE_NAME);

  const existing = await store.get(problemId) || { id: problemId, timestamp: Date.now() };

  await store.put({
    ...existing,
    ...mutation,
    ownerId,
    timestamp: Date.now(),
  });
  await tx.done;
}

export async function getOfflineProblem(id: string): Promise<OfflineProblem | undefined> {
  const db = await getOfflineDB();
  const problem = await db.get(OFFLINE_PROBS_STORE, id);
  return problem ? restoreOfflineProblem(problem) : undefined;
}

export async function getQueuedDraws(): Promise<SyncQueueItem[]> {
  const db = await getOfflineDB();
  return db.getAll(SYNC_STORE_NAME);
}

export async function removeQueuedDraw(problemId: string) {
  const db = await getOfflineDB();
  await db.delete(SYNC_STORE_NAME, problemId);
}

// Move drawing/notes to the durable owned-work controller without deleting unrelated queued actions.
export async function stripLegacyQueuedWork(snapshot: SyncQueueItem) {
  const db = await getOfflineDB();
  const tx = db.transaction(SYNC_STORE_NAME, 'readwrite');
  const store = tx.objectStore(SYNC_STORE_NAME);
  const current = await store.get(snapshot.id);
  if (current && JSON.stringify(current) === JSON.stringify(snapshot)) {
    const {drawData: _draw, seq: _seq, typed_notes: _notes, notesSeq: _notesSeq, ...remaining} = current;
    if (remaining.blockedReason?.includes('筆跡') || remaining.blockedReason?.includes('筆記')) delete remaining.blockedReason;
    if (remaining.status || remaining.metadata_patch || remaining.tag_ops?.length) await store.put(remaining);
    else await store.delete(snapshot.id);
  }
  await tx.done;
}

export async function updateOfflineProblemStatus(
  id: string,
  status: 'unsolved' | 'resolved' | 'archived' | 'processing',
  reviewCount?: number
) {
  const existing = await getOfflineProblem(id);
  if (!existing) return;

  await putOfflineProblem({
    ...existing,
    status,
    review_count: typeof reviewCount === 'number' ? reviewCount : existing.review_count,
  });
}

export async function updateOfflineProblemAnalysis(id: string, tagResult: NonNullable<OfflineProblem['tagResult']>) {
  const existing = await getOfflineProblem(id);
  if (!existing) return;
  await putOfflineProblem({ ...existing, topicId: tagResult.topic_id, tagResult, status: 'unsolved' });
}

export async function updateOfflineProblemDraw(id: string, drawData: any, seq: number) {
  await patchOfflineWork(id, {draw_data: drawData, vector_clock: {node: 'client', seq}});
}

export async function updateOfflineProblemNotes(id: string, typedNotes: string) {
  await patchOfflineWork(id, {typed_notes: typedNotes});
}

async function patchOfflineWork(id: string, patch: Pick<Partial<StoredOfflineProblem>, 'draw_data' | 'vector_clock' | 'typed_notes'>) {
  const db = await getOfflineDB();
  const tx = db.transaction(OFFLINE_PROBS_STORE, 'readwrite');
  const store = tx.objectStore(OFFLINE_PROBS_STORE);
  const existing = await store.get(id);
  if (existing) await store.put({...existing, ...patch});
  await tx.done;
}

export async function updateOfflineProblemMetadata(
  id: string,
  patch: { topic_id?: string | null; keywords?: string[]; typed_notes?: string }
) {
  const existing = await getOfflineProblem(id);
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

  await putOfflineProblem({
    ...existing,
    topicId: patch.topic_id ?? existing.topicId,
    typed_notes: patch.typed_notes !== undefined ? patch.typed_notes : existing.typed_notes,
    tagResult: updatedTagResult as typeof existing.tagResult,
  });
}

// Online Auto-Sync Handler
export function initOnlineSync(syncCallback: (item: SyncQueueItem) => Promise<boolean>, getCurrentUserId: () => string | null) {
  let running = false;
  const syncAll = async () => {
    if (running || !getCurrentUserId()) return;
    running = true;
    console.log('[PWA Sync] Syncing offline queue...');
    try {
      const items = await getQueuedDraws();
      for (const item of items) {
        // Owned-work restores these drafts before editing and serializes their CAS writes.
        // Replaying the same draw/notes here would race with the active editor.
        if (item.drawData !== undefined || item.typed_notes !== undefined) continue;
        if (item.blockedReason) continue;
        const currentUserId = getCurrentUserId();
        if (!currentUserId) break;
        if (item.ownerId && item.ownerId !== currentUserId) continue;
        try {
          const success = await syncCallback(item);
          if (success && getCurrentUserId() === currentUserId) {
            const db = await getOfflineDB();
            const tx = db.transaction(SYNC_STORE_NAME, 'readwrite');
            const store = tx.objectStore(SYNC_STORE_NAME);
            if (JSON.stringify(await store.get(item.id)) === JSON.stringify(item)) await store.delete(item.id);
            await tx.done;
          }
        } catch (err) {
          console.error(`[PWA Sync] Failed to sync item ${item.id}`, err);
        }
      }
    } finally {
      running = false;
    }
  };

  window.addEventListener('online', syncAll);
  window.addEventListener('redolve:auth-ready', syncAll);

  // Sync immediately if currently online
  if (navigator.onLine) {
    void syncAll();
  }
  return () => {
    window.removeEventListener('online', syncAll);
    window.removeEventListener('redolve:auth-ready', syncAll);
  };
}
