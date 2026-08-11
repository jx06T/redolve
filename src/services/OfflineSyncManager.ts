import { getOfflineDB, OfflineProblem } from './offlineStorage';
import { uploadProblem } from './api';
import { Item } from '../types';

const OFFLINE_PROBS_STORE = 'offlineProblems';

export class OfflineSyncManager {
  private static objectUrlCache = new Map<string, string>();

  /**
   * Save a problem to IndexedDB for offline users.
   */
  static async saveOfflineProblem(
    id: string, 
    file: File, 
    source: string, 
    topicId: string,
    tagResult?: OfflineProblem['tagResult']
  ): Promise<void> {
    const db = await getOfflineDB();
    await db.put(OFFLINE_PROBS_STORE, {
      id,
      fileData: file,
      source,
      topicId,
      timestamp: Date.now(),
      tagResult,
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
   * Retrieve all offline problems formatted as API Items.
   */
  static async getOfflineProblemsAsItems(): Promise<Item[]> {
    const problems = await this.getOfflineProblems();
    return problems.map((p) => {
      let keywords: string[] = [];
      let tokens = '';
      let topic_id = p.topicId;
      
      if (p.tagResult) {
        topic_id = p.tagResult.topic_id || p.topicId;
        keywords = p.tagResult.keywords || [];
        tokens = keywords.join(' ');
      }

      let url = this.objectUrlCache.get(p.id);
      if (!url) {
        url = URL.createObjectURL(p.fileData);
        this.objectUrlCache.set(p.id, url);
      }

      return {
        id: p.id,
        user_id: 'guest',
        type: 'image',
        topic_id: topic_id,
        keywords: JSON.stringify(keywords),
        keyword_tokens: tokens,
        source: p.source,
        image_url: url,
        draw_data: null,
        status: 'unsolved' as const,
        review_count: 0,
        vector_clock: null,
        updated_at: new Date(p.timestamp).toISOString(),
        created_at: new Date(p.timestamp).toISOString(),
      };
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
        // Upload to backend, passing along the pre-analyzed tagResult if available
        await uploadProblem(file, prob.source, prob.topicId, prob.tagResult);
        
        // Remove from IndexedDB on success
        await db.delete(OFFLINE_PROBS_STORE, prob.id);
        const cachedUrl = this.objectUrlCache.get(prob.id);
        if (cachedUrl) {
          URL.revokeObjectURL(cachedUrl);
          this.objectUrlCache.delete(prob.id);
        }
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
    this.objectUrlCache.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrlCache.clear();
  }
}
