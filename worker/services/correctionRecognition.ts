import type { PersonalQuestionRef } from '../../src/types/learning';
import type { AIService } from './ai/AIService';
import { learningSource, LearningError, readLearningQuestion } from './learningQuestions';
import { presentCorrection } from './correctionStore';
import type { CorrectionRow } from './correctionStore';
import { digest } from './practice';
import { CORRECTION_PROMPT_VERSION } from './ai/correctionPrompts';
import { emptyLearningData, validateLearningData } from '../../src/types/learning';
import { aiFailureDiagnostic,aiFailureMessage } from './ai/providerError';
import { weaknessContext } from './weaknesses';

export async function recognizeCorrection(db: D1Database, uid: string, ref: PersonalQuestionRef,
  input: { image: ArrayBuffer; sourceIdentity: string; notes: string; force: boolean; model?: string }, ai: AIService) {
  const current = await readLearningQuestion(db, uid, ref), source = await learningSource(db, uid, ref);
  const identity = ref.kind === 'owned' ? source.asset_id : source.source_version.split(':')[0];
  if (identity !== input.sourceIdentity) throw new LearningError(409, 'SOURCE_CHANGED', '原圖版本已變更，請重新載入再整理訂正');
  const table = ref.kind === 'owned' ? 'items' : 'saved_refs';
  const id = ref.kind === 'owned' ? ref.itemId : ref.savedRefId;
  const progress = await db.prepare(`SELECT status,review_count FROM ${table} WHERE id=? AND user_id=?`).bind(id, uid).first<{ status: string; review_count: number }>();
  if (progress?.status !== 'resolved' && !(progress?.status === 'archived' && progress.review_count > 0))
    throw new LearningError(409, 'CORRECTION_NOT_SYNCED', '訂正完成尚未同步，連線後可重試整理');
  const imageHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', input.image))].map(n => n.toString(16).padStart(2, '0')).join('');
  const hash = await digest({ ref, imageHash, source: identity, notes: input.notes, prompt: CORRECTION_PROMPT_VERSION, model: input.model || 'gemini-3.1-pro-preview',
    ...(input.force ? { version: current.rowVersion, sourceVersion: current.sourceVersion } : {}) });
  const now = new Date().toISOString(), token = crypto.randomUUID(), lease = new Date(Date.now() + 120000).toISOString();
  const existing = await db.prepare('SELECT * FROM learning_corrections WHERE user_id=? AND input_hash=?').bind(uid, hash).first<CorrectionRow>();
  if (existing && (existing.status === 'complete' || existing.status === 'pending' && existing.lease_until >= now)) return presentCorrection(existing, current);
  const jobId = existing?.id || crypto.randomUUID();
  const claim = existing ? await db.prepare(`UPDATE learning_corrections SET status='pending',run_token=?,lease_until=?,error=NULL,base_row_version=?,source_version=?,created_at=?
      WHERE id=? AND user_id=? AND (status='failed' OR status='pending' AND lease_until<?)`)
      .bind(token, lease, current.rowVersion, current.sourceVersion, now, jobId, uid, now).run()
    : await db.prepare(`INSERT OR IGNORE INTO learning_corrections(id,user_id,item_id,saved_ref_id,input_hash,source_version,base_row_version,status,run_token,lease_until,created_at)
      VALUES(?,?,?,?,?,?,?,'pending',?,?,?)`).bind(jobId, uid, ref.kind === 'owned' ? id : null, ref.kind === 'saved' ? id : null, hash, current.sourceVersion, current.rowVersion, token, lease, now).run();
  if (!claim.meta.changes) {
    const row = await db.prepare('SELECT * FROM learning_corrections WHERE user_id=? AND input_hash=?').bind(uid, hash).first<CorrectionRow>();
    if (!row) throw new LearningError(409, 'CONFLICT', '訂正整理已變更，請重新載入');
    return presentCorrection(row, current);
  }
  try {
    const baseline = current.sourceUpdated ? emptyLearningData() : { content: current.content, personal: current.personal };
    const result = await ai.recognizeCorrection(input.image, { current: baseline, notes: input.notes, saved: ref.kind === 'saved',
      ...await weaknessContext(db, uid, ref, baseline) });
    const fresh = await readLearningQuestion(db, uid, ref);
    if (fresh.rowVersion !== current.rowVersion || fresh.sourceVersion !== current.sourceVersion) throw new LearningError(409, 'CONFLICT', '辨識期間資料已變更，請重新整理訂正');
    await db.prepare(`UPDATE learning_corrections SET status='complete',data_json=?,model_version=?,error=NULL WHERE id=? AND user_id=? AND run_token=? AND status='pending'`)
      .bind(JSON.stringify(validateLearningData(result.data)), result.model, jobId, uid, token).run();
  } catch (error) {
    console.warn('[CorrectionRecognition] Failed', aiFailureDiagnostic(error));
    await db.prepare(`UPDATE learning_corrections SET status='failed',error=? WHERE id=? AND user_id=? AND run_token=? AND status='pending'`)
      .bind(error instanceof LearningError ? error.message : aiFailureMessage(error,'AI 整理未完成，訂正與原資料已保留，可手動重試'), jobId, uid, token).run();
  }
  const row = await db.prepare('SELECT * FROM learning_corrections WHERE user_id=? AND id=?').bind(uid, jobId).first<CorrectionRow>();
  if (!row) throw new LearningError(404, 'NOT_FOUND', '題目已移除');
  return presentCorrection(row, await readLearningQuestion(db, uid, ref));
}
