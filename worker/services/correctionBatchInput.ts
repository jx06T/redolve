import type { Bindings } from '../types';
import type { PersonalQuestionRef } from '../../src/types/learning';
import { emptyLearningData } from '../../src/types/learning';
import { LearningError, readLearningQuestion } from './learningQuestions';
import { correctionWorkspaceVersion } from './correctionVersion';
import { weaknessContext } from './weaknesses';

export async function batchInput(env: Bindings, uid: string, ref: PersonalQuestionRef, includeInk = false) {
  const id = ref.kind === 'owned' ? ref.itemId : ref.savedRefId;
  const current = await readLearningQuestion(env.DB, uid, ref);
  const version = await correctionWorkspaceVersion(env.DB, uid, ref);
  const row = ref.kind === 'owned'
    ? await env.DB.prepare(`SELECT status,review_count,typed_notes,${includeInk ? 'draw_data' : 'NULL'} ink,NULL storage_key,NULL draw_asset_id
        FROM items WHERE id=? AND user_id=?`).bind(id, uid).first<WorkRow>()
    : await env.DB.prepare(`SELECT s.status,s.review_count,p.typed_notes,NULL ink,a.storage_key,p.draw_asset_id
        FROM saved_refs s JOIN personal_workspaces p ON p.saved_ref_id=s.id AND p.user_id=s.user_id
        LEFT JOIN assets a ON a.id=p.draw_asset_id AND a.state='ready' WHERE s.id=? AND s.user_id=?`).bind(id, uid).first<WorkRow>();
  if (!row || !(row.status === 'resolved' || row.status === 'archived' && row.review_count > 0))
    throw new LearningError(409, 'NOT_CORRECTED', '只可整理已完成訂正的題目');
  let ink = row.ink;
  if (includeInk && row.draw_asset_id) {
    if (!row.storage_key) throw new LearningError(422, 'INK_UNAVAILABLE', '本人筆跡無法讀取，未送出辨識');
    const object = await env.STORAGE.get(row.storage_key);
    if (!object || object.size > 2200000) throw new LearningError(422, 'INK_UNAVAILABLE', '本人筆跡無法讀取，未送出辨識');
    ink = await object.text();
  }
  if (version !== await correctionWorkspaceVersion(env.DB, uid, ref)) throw new LearningError(409, 'CONFLICT', '訂正內容已變更，請重新選取');
  const baseline = current.sourceUpdated ? emptyLearningData() : { content: current.content, personal: current.personal };
  return { current, workspaceVersion: version, ink, context: { current: baseline, notes: row.typed_notes || '', saved: ref.kind === 'saved',
    ...await weaknessContext(env.DB, uid, ref, baseline) } };
}
interface WorkRow { status: string; review_count: number; typed_notes: string | null; ink: string | null; storage_key: string | null; draw_asset_id: string | null }
