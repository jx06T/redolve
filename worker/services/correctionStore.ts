import type { CorrectionRecognition, LearningQuestion, PersonalQuestionRef } from '../../src/types/learning';
export interface CorrectionRow {
  id: string; user_id: string; item_id: string | null; saved_ref_id: string | null; input_hash: string;
  source_version: string; base_row_version: number; status: 'pending' | 'complete' | 'failed';
  data_json: string | null; lease_until: string; error: string | null; created_at: string; adopted_revision_id: string | null;
}
export function presentCorrection(row: CorrectionRow, question: Pick<LearningQuestion, 'rowVersion' | 'sourceVersion'>): CorrectionRecognition {
  const stalled = row.status === 'pending' && Date.parse(row.lease_until) < Date.now(), adopted = !!row.adopted_revision_id;
  return { id: row.id, status: stalled ? 'failed' : row.status, data: row.data_json ? JSON.parse(row.data_json) : null,
    baseRowVersion: row.base_row_version, sourceVersion: row.source_version, adopted,
    stale: !adopted && (question.rowVersion !== row.base_row_version || question.sourceVersion !== row.source_version),
    error: stalled ? '上次整理未完成，可手動重試' : row.error, createdAt: row.created_at };
}
export async function readLatestCorrection(db: D1Database, uid: string, ref: PersonalQuestionRef, question: Pick<LearningQuestion, 'rowVersion' | 'sourceVersion'>) {
  const column = ref.kind === 'owned' ? 'item_id' : 'saved_ref_id', id = ref.kind === 'owned' ? ref.itemId : ref.savedRefId;
  const row = await db.prepare(`SELECT * FROM learning_corrections WHERE user_id=? AND ${column}=? ORDER BY created_at DESC,id DESC LIMIT 1`)
    .bind(uid, id).first<CorrectionRow>();
  return row ? presentCorrection(row, question) : undefined;
}
