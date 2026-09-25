import { getOfflineDB, getOfflineProblems, OfflineProblem, putOfflineProblem, updateOfflineProblemAnalysis } from './offlineStorage';
import { uploadProblem, analyzeGuestProblem, updateProblemDrawData, updateProblemStatus, updateProblemMetadata } from './api';
import { Item } from '../types';

const OFFLINE_PROBS_STORE = 'offlineProblems';

export class OfflineSyncManager {
  private static objectUrlCache = new Map<string, string>();
  private static pendingAnalysis: Promise<void> | null = null;
  private static analysisRequestedAgain = false;
  private static analysisCallbacks = new Set<(id: string, tagResult: NonNullable<OfflineProblem['tagResult']>) => void>();

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
    await putOfflineProblem({
      id,
      fileData: file,
      source,
      topicId,
      timestamp: Date.now(),
      status: tagResult ? 'unsolved' : 'processing',
      tagResult,
    });
  }

  /**
   * Retrieve all pending offline problems.
   */
  static async getOfflineProblems(): Promise<OfflineProblem[]> {
    return getOfflineProblems();
  }

  static analyzePendingGuestProblems(onAnalyzed?: (id: string, tagResult: NonNullable<OfflineProblem['tagResult']>) => void): Promise<void> {
    if (onAnalyzed) this.analysisCallbacks.add(onAnalyzed);
    if (this.pendingAnalysis) {
      this.analysisRequestedAgain = true;
      return this.pendingAnalysis;
    }
    this.pendingAnalysis = (async () => {
      do {
        this.analysisRequestedAgain = false;
        await this.runPendingGuestAnalysis((id, tagResult) => {
          this.analysisCallbacks.forEach((callback) => callback(id, tagResult));
        });
      } while (this.analysisRequestedAgain);
    })().finally(() => {
      this.pendingAnalysis = null;
      this.analysisCallbacks.clear();
    });
    return this.pendingAnalysis;
  }

  private static async runPendingGuestAnalysis(onAnalyzed?: (id: string, tagResult: NonNullable<OfflineProblem['tagResult']>) => void): Promise<void> {
    const pending = (await this.getOfflineProblems()).filter((problem) => !problem.tagResult && !problem.cloudId);
    for (const problem of pending) {
      if (!navigator.onLine) break;
      try {
        const file = new File([problem.fileData], 'problem.jpg', { type: problem.fileData.type || 'image/jpeg' });
        const result = await analyzeGuestProblem(file);
        await updateOfflineProblemAnalysis(problem.id, result.tagResult);
        onAnalyzed?.(problem.id, result.tagResult);
      } catch (error) {
        console.warn('Guest analysis remains pending:', error);
      }
    }
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
        draw_data: p.draw_data ? (typeof p.draw_data === 'string' ? p.draw_data : JSON.stringify(p.draw_data)) : null,
        status: (p.status || (p.tagResult ? 'unsolved' : 'processing')) as Item['status'],
        review_count: p.review_count || 0,
        typed_notes: p.typed_notes || '',
        vector_clock: p.vector_clock ? (typeof p.vector_clock === 'string' ? p.vector_clock : JSON.stringify(p.vector_clock)) : null,
        updated_at: new Date(p.timestamp).toISOString(),
        created_at: new Date(p.timestamp).toISOString(),
      };
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  static async searchOfflineProblems(query: string): Promise<Item[]> {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    const problems = await this.getOfflineProblems();
    const matchingIds = new Set(problems.filter((problem) => [
      problem.source,
      problem.typed_notes || '',
      problem.tagResult?.ocr_text || '',
      ...(problem.tagResult?.keywords || []),
    ].some((value) => value.toLocaleLowerCase().includes(normalized))).map((problem) => problem.id));
    return (await this.getOfflineProblemsAsItems()).filter((item) => matchingIds.has(item.id));
  }

  /**
   * Sync all offline problems to the cloud.
   */
  static async syncToCloud(getCurrentUserId: () => string | null, onSynced: (id: string) => void): Promise<{ success: number; failed: number }> {
    const problems = await this.getOfflineProblems();
    if (problems.length === 0) {
      return { success: 0, failed: 0 };
    }

    const db = await getOfflineDB();
    
    const syncingUserId = getCurrentUserId();
    if (!syncingUserId) return { success: 0, failed: problems.length };
    let successCount = 0;
    let failedCount = 0;

    for (const prob of problems) {
      try {
        if (getCurrentUserId() !== syncingUserId) break;
        if (prob.cloudOwnerId && prob.cloudOwnerId !== syncingUserId) {
          failedCount++;
          continue;
        }
        // 1. Upload base image and metadata
        let newCloudId = prob.cloudId;
        if (!newCloudId) {
          const file = new File([prob.fileData], `offline_${prob.id}.jpg`, { type: prob.fileData.type || 'image/jpeg' });
          const res = await uploadProblem(file, prob.source, prob.topicId, prob.tagResult);
          newCloudId = res.id;
          await putOfflineProblem({ ...prob, cloudId: newCloudId, cloudOwnerId: syncingUserId });
        }
        
        // 2. Replay persisted edits, including those made before a page reload.
        {
          if (prob.draw_data && prob.vector_clock) {
            let seq = 1;
            try {
              const vc = typeof prob.vector_clock === 'string' ? JSON.parse(prob.vector_clock) : prob.vector_clock;
              seq = vc.seq || 1;
            } catch (e) {}
            
            const drawData = typeof prob.draw_data === 'string' ? JSON.parse(prob.draw_data) : prob.draw_data;
            await updateProblemDrawData(newCloudId, drawData, seq);
          }
          
          if (prob.status && prob.status !== 'unsolved' && prob.status !== 'processing') {
            await updateProblemStatus(newCloudId, prob.status);
          }
          
          if (prob.typed_notes) {
            await updateProblemMetadata(newCloudId, { typed_notes: prob.typed_notes });
          }
        }
        
        // 3. Remove from IndexedDB on success
        await db.delete(OFFLINE_PROBS_STORE, prob.id);
        const cachedUrl = this.objectUrlCache.get(prob.id);
        if (cachedUrl) {
          URL.revokeObjectURL(cachedUrl);
          this.objectUrlCache.delete(prob.id);
        }
        
        // 4. Remove the temporary offline item from store to prevent duplicates
        onSynced(prob.id);
        
        successCount++;
      } catch (err) {
        console.error(`Failed to sync offline problem ${prob.id}`, err);
        failedCount++;
      }
    }

    return { success: successCount, failed: failedCount };
  }

  /**
   * Revoke the cached object URL for a single offline item (e.g. on delete).
   */
  static revokeObjectUrl(id: string): void {
    const url = this.objectUrlCache.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      this.objectUrlCache.delete(id);
    }
  }
}
