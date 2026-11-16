import type { PersonalQuestionRef } from '../../src/types/learning';
import { LearningError } from './learningQuestions';

// Includes progress so an un-resolve/re-resolve also invalidates a pending candidate.
export const workspaceVersionSql = (ref: PersonalQuestionRef) => ref.kind === 'owned'
  ? `SELECT CAST(draw_seq AS TEXT)||':'||notes_seq||':'||progress_seq AS version FROM items WHERE id=? AND user_id=?`
  : `SELECT CAST(COALESCE(p.draw_seq,0) AS TEXT)||':'||COALESCE(p.notes_seq,0)||':'||s.row_version AS version FROM saved_refs s
     LEFT JOIN personal_workspaces p ON p.saved_ref_id=s.id AND p.user_id=s.user_id WHERE s.id=? AND s.user_id=?`;
export async function correctionWorkspaceVersion(db: D1Database, uid: string, ref: PersonalQuestionRef) {
  const row = await db.prepare(workspaceVersionSql(ref)).bind(ref.kind === 'owned' ? ref.itemId : ref.savedRefId, uid).first<{ version: string }>();
  if (!row) throw new LearningError(404, 'NOT_FOUND', '找不到本人訂正內容');
  return row.version;
}
