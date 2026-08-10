import { getOfflineDB, OfflineProblem } from './offlineStorage';
import { uploadProblem } from './api';

const OFFLINE_PROBS_STORE = 'offlineProblems';

export class OfflineSyncManager {
  /**
   * Save a problem to IndexedDB for offline users.
   */
  static async saveOfflineProblem(id: string, file: File, source: string, topicId: string): Promise<void> {
    const db = await getOfflineDB();
    await db.put(OFFLINE_PROBS_STORE, {
      id,
      fileData: file,
      source,
      topicId,
      timestamp: Date.now(),
    });
  }

  /**
   * Retrieve all pending offline problems.
   */
  static async getOfflineProblems(): Promise<OfflineProblem[]> {
    const db = await getOfflineDB();
    return db.getAll(OFFLINE_PROBS_STORE);
  }

  /**
   * Sync all offline problems to the cloud.
   */
  static async syncToCloud(): Promise<{ success: number; failed: number }> {
    const problems = await this.getOfflineProblems();
    if (problems.length === 0) {
      return { success: 0, failed: 0 };
    }

    const db = await getOfflineDB();
    let successCount = 0;
    let failedCount = 0;

    for (const prob of problems) {
      try {
        const file = new File([prob.fileData], `offline_${prob.id}.jpg`, { type: prob.fileData.type || 'image/jpeg' });
        // Upload to backend
        await uploadProblem(file, prob.source, prob.topicId);
        
        // Remove from IndexedDB on success
        await db.delete(OFFLINE_PROBS_STORE, prob.id);
        successCount++;
      } catch (err) {
        console.error(`Failed to sync offline problem ${prob.id}`, err);
        failedCount++;
      }
    }

    return { success: successCount, failed: failedCount };
  }

  /**
   * Clear all offline data (e.g. on logout)
   */
  static async clearOfflineData(): Promise<void> {
    const db = await getOfflineDB();
    await db.clear(OFFLINE_PROBS_STORE);
  }
}
