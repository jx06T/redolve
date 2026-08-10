import { openDB, DBSchema } from 'idb';

interface SyncQueueItem {
  id: string; // problem id
  drawData: any;
  seq: number;
  timestamp: number;
}

export interface OfflineProblem {
  id: string;
  fileData: Blob;
  source: string;
  topicId: string;
  timestamp: number;
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

export async function queueOfflineDraw(problemId: string, drawData: any, seq: number) {
  const db = await getOfflineDB();
  await db.put(SYNC_STORE_NAME, {
    id: problemId,
    drawData,
    seq,
    timestamp: Date.now(),
  });
}

export async function getQueuedDraws(): Promise<SyncQueueItem[]> {
  const db = await getOfflineDB();
  return db.getAll(SYNC_STORE_NAME);
}

export async function removeQueuedDraw(problemId: string) {
  const db = await getOfflineDB();
  await db.delete(SYNC_STORE_NAME, problemId);
}

// Online Auto-Sync Handler
export function initOnlineSync(syncCallback: (item: SyncQueueItem) => Promise<boolean>) {
  window.addEventListener('online', async () => {
    console.log('[PWA Sync] Online detected. Syncing offline draw queue...');
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
  });
}
