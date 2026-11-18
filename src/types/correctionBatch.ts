import type { PersonalQuestionRef } from './learning';
export type CorrectionBatchMode = 'missing' | 'outdated' | 'all';
export interface CorrectionBatchCandidate {
  ref: PersonalQuestionRef; title: string; topic: string | null; updatedAt: string;
  promptVersion: string | null; model: string | null; confirmed: boolean;
}
export interface CorrectionBatchInput {
  ref: PersonalQuestionRef; sourceVersion: string; rowVersion: number; workspaceVersion: string;
  imagePath: string; ink: string | null; notes?: string;
}
export interface CorrectionBatchJob {
  id: string; status: 'submitting' | 'unknown' | 'running' | 'complete' | 'failed' | 'cancelled';
  model: string; promptVersion: string; createdAt: string; error: string | null; cleaned: boolean;
  items: { id: string; ref: PersonalQuestionRef; status: 'pending' | 'complete' | 'failed'; error: string | null; adopted: boolean }[];
}
export interface CorrectionReviewQueue {
  items: (CorrectionBatchJob['items'][number] & { batchId: string })[];
  next: string | null;
}
