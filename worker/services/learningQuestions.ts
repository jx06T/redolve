import { emptyLearningData, learningFullText, validateLearningData } from '../../src/types/learning';
import type { LearningData, LearningQuestion, PersonalQuestionRef } from '../../src/types/learning';

type Source = { asset_id: string; storage_key: string; source_version: string; text: string | null };
type Current = { id: string; current_revision_id: string | null; row_version: number;
  confirmation_status: 'ai' | 'confirmed'; content_json: string | null; personal_json: string | null };
export class LearningError extends Error {
  constructor(public status: 404 | 409 | 422, public code: string, message: string) { super(message); }
}

export function parsePersonalRef(value: unknown): PersonalQuestionRef {
  if (!value || typeof value !== 'object') throw new LearningError(422, 'INVALID_REF', '題目參照不正確');
  const v = value as Record<string, unknown>;
  const id = v.kind === 'owned' ? v.itemId : v.kind === 'saved' ? v.savedRefId : null;
  if (typeof id !== 'string' || !id || id.length > 200) throw new LearningError(422, 'INVALID_REF', '只支援本人上傳與已存入題目');
  return v.kind === 'owned' ? { kind: 'owned', itemId: id } : { kind: 'saved', savedRefId: id };
}
const refId = (ref: PersonalQuestionRef) => ref.kind === 'owned' ? ref.itemId : ref.savedRefId;
const refColumn = (ref: PersonalQuestionRef) => ref.kind === 'owned' ? 'item_id' : 'saved_ref_id';

// Primary-key lookups only. A saved source is always the retained snapshot.
function sourceQuery(ref: PersonalQuestionRef) {
  return ref.kind === 'owned'
    ? `SELECT i.image_url asset_id,a.storage_key,CAST(i.content_seq AS TEXT)||':'||i.image_url source_version,t.ocr_text text
       FROM items i JOIN assets a ON a.id=i.image_url AND a.state='ready'
       LEFT JOIN item_texts t ON t.item_id=i.id AND t.user_id=i.user_id AND t.source_content_seq=i.content_seq WHERE i.id=? AND i.user_id=?`
    : `SELECT ss.image_asset_id asset_id,a.storage_key,sr.current_snapshot_id||':'||sr.row_version source_version,ss.source_text text
       FROM saved_refs sr JOIN saved_snapshots ss ON ss.id=sr.current_snapshot_id AND ss.saved_ref_id=sr.id
       JOIN assets a ON a.id=ss.image_asset_id AND a.state='ready' WHERE sr.id=? AND sr.user_id=?`;
}
export async function learningSource(db: D1Database, uid: string, ref: PersonalQuestionRef): Promise<Source> {
  const source = await db.prepare(sourceQuery(ref)).bind(refId(ref), uid).first<Source>();
  if (!source) throw new LearningError(404, 'NOT_FOUND', '找不到可使用的個人題目');
  return source;
}

export async function readLearningQuestion(db: D1Database, uid: string, ref: PersonalQuestionRef): Promise<LearningQuestion> {
  const [sourceResult, currentResult] = await db.batch([
    db.prepare(sourceQuery(ref)).bind(refId(ref), uid),
    db.prepare(`SELECT q.id,q.current_revision_id,q.row_version,q.confirmation_status,r.content_json,r.personal_json
      FROM learning_questions q LEFT JOIN learning_question_revisions r ON r.id=q.current_revision_id AND r.learning_question_id=q.id
      WHERE q.user_id=? AND q.${refColumn(ref)}=?`).bind(uid, refId(ref)),
  ]);
  const source = sourceResult.results[0] as Source | undefined;
  if (!source) throw new LearningError(404, 'NOT_FOUND', '找不到可使用的個人題目');
  const row = currentResult.results[0] as Current | undefined;
  const data = row?.content_json && row.personal_json
    ? validateLearningData({ content: JSON.parse(row.content_json), personal: JSON.parse(row.personal_json) }) : emptyLearningData();
  if (!row?.current_revision_id) data.content.ocrText = source.text || null;
  return { ...data, ref, id: row?.id || null, revisionId: row?.current_revision_id || null,
    rowVersion: row?.row_version || 0, sourceVersion: source.source_version, confirmationStatus: row?.confirmation_status || 'ai' };
}

export interface LearningWrite {
  expectedRowVersion: number;
  expectedSourceVersion: string;
  data: LearningData;
}
export interface RecognitionTags { topic_id: string | null; keywords: string[]; keyword_tokens: string[] }

export async function confirmLearningQuestion(db: D1Database, uid: string, ref: PersonalQuestionRef,
  expectedRowVersion: number, expectedSourceVersion: string): Promise<LearningQuestion> {
  await learningSource(db, uid, ref);
  if (!Number.isSafeInteger(expectedRowVersion) || expectedRowVersion < 0 || typeof expectedSourceVersion !== 'string')
    throw new LearningError(422, 'INVALID_VERSION', '缺少有效的題目版本');
  const result = await db.prepare(`UPDATE learning_questions SET confirmation_status='confirmed',confirmed_at=CURRENT_TIMESTAMP,
    row_version=row_version+1 WHERE user_id=? AND ${refColumn(ref)}=? AND row_version=? AND current_revision_id IS NOT NULL
    AND EXISTS(SELECT 1 FROM (${sourceQuery(ref)}) s WHERE s.source_version=?)`)
    .bind(uid, refId(ref), expectedRowVersion, refId(ref), uid, expectedSourceVersion).run();
  if (!result.meta.changes) throw new LearningError(409, 'CONFLICT', '題目已更新，請重新載入後再確認');
  return readLearningQuestion(db, uid, ref);
}

/** Conditional INSERT is the transaction gate: zero matching rows cannot mutate projections. */
export async function saveLearningQuestion(db: D1Database, uid: string, ref: PersonalQuestionRef,
  write: LearningWrite, actor: 'ai' | 'user', tags?: RecognitionTags): Promise<LearningQuestion> {
  await learningSource(db, uid, ref);
  if (!Number.isSafeInteger(write.expectedRowVersion) || write.expectedRowVersion < 0 ||
    typeof write.expectedSourceVersion !== 'string' || write.expectedSourceVersion.length > 500) {
    throw new LearningError(422, 'INVALID_VERSION', '缺少有效的題目版本');
  }
  let data: LearningData;
  try { data = validateLearningData(write.data); } catch (e) {
    throw new LearningError(422, 'INVALID_DATA', e instanceof Error ? e.message : '題目資料不正確');
  }
  // AI never attributes the source author's handwriting or error reasons to the saver.
  if (actor === 'ai' && ref.kind === 'saved') data.personal = emptyLearningData().personal;
  const questionId = crypto.randomUUID(), revisionId = crypto.randomUUID();
  const publicText = learningFullText(data.content);
  const source = sourceQuery(ref), column = refColumn(ref);
  const guard = `EXISTS(SELECT 1 FROM (${source}) s WHERE s.source_version=?)`;
  const gate = `EXISTS(SELECT 1 FROM learning_questions WHERE user_id=? AND ${column}=? AND current_revision_id=?)`;
  const gateArgs = [uid, refId(ref), revisionId];
  const statements = [
    db.prepare(`INSERT OR IGNORE INTO learning_questions(id,user_id,${column}) SELECT ?,?,? WHERE ?=0 AND ${guard}`)
      .bind(questionId, uid, refId(ref), write.expectedRowVersion, refId(ref), uid, write.expectedSourceVersion),
    db.prepare(`INSERT INTO learning_question_revisions(id,learning_question_id,revision_no,content_json,personal_json,source_version,created_by)
      SELECT ?,id,row_version+1,?,?,?,? FROM learning_questions WHERE user_id=? AND ${column}=? AND row_version=?
      ${actor === 'ai' ? "AND confirmation_status='ai'" : ''} AND ${guard}`)
      .bind(revisionId, JSON.stringify(data.content), JSON.stringify(data.personal), write.expectedSourceVersion, actor,
        uid, refId(ref), write.expectedRowVersion, refId(ref), uid, write.expectedSourceVersion),
    db.prepare(`UPDATE learning_questions SET current_revision_id=?,row_version=row_version+1,confirmation_status=?,
      confirmed_at=${actor === 'user' ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE user_id=? AND ${column}=? AND row_version=?
      AND EXISTS(SELECT 1 FROM learning_question_revisions WHERE id=? AND learning_question_id=learning_questions.id)`)
      .bind(revisionId, actor === 'user' ? 'confirmed' : 'ai', uid, refId(ref), write.expectedRowVersion, revisionId),
    db.prepare(`INSERT INTO learning_revision_asset_refs(revision_id,asset_id)
      SELECT ?,s.asset_id FROM (${source}) s WHERE ${gate}`)
      .bind(revisionId, refId(ref), uid, ...gateArgs),
  ];
  if (ref.kind === 'owned') {
    statements.push(db.prepare(`INSERT INTO item_texts(item_id,user_id,source_content_seq,ocr_text,text_origin)
      SELECT id,user_id,content_seq+1,?,? FROM items WHERE id=? AND user_id=? AND ${gate}
      ON CONFLICT(item_id) DO UPDATE SET ocr_text=excluded.ocr_text,source_content_seq=excluded.source_content_seq,
      text_origin=excluded.text_origin,legacy_rowid=NULL,updated_at=CURRENT_TIMESTAMP`)
      .bind(publicText, actor, ref.itemId, uid, ...gateArgs));
    // Update the existing search projection only after this revision was committed.
    statements.push(db.prepare(`UPDATE items_fts SET problem_text=? WHERE id=? AND user_id=? AND ${gate}`)
      .bind(publicText, ref.itemId, uid, ...gateArgs));
    statements.push(db.prepare(`INSERT INTO items_fts(id,user_id,source,keyword_tokens,typed_notes,problem_text)
      SELECT id,user_id,COALESCE(source,''),COALESCE(keyword_tokens,''),COALESCE(typed_notes,''),? FROM items
      WHERE id=? AND user_id=? AND ${gate} AND NOT EXISTS(SELECT 1 FROM items_fts WHERE id=? AND user_id=?)`)
      .bind(publicText, ref.itemId, uid, ...gateArgs, ref.itemId, uid));
    if (tags) statements.push(db.prepare(`UPDATE items SET topic_id=?,keywords=?,keyword_tokens=?,content_seq=content_seq+1,
      status=CASE WHEN status='processing' THEN 'unsolved' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND ${gate}`)
      .bind(tags.topic_id, JSON.stringify(tags.keywords), tags.keyword_tokens.join(' '), ref.itemId, uid, ...gateArgs));
    if (tags) statements.push(db.prepare(`UPDATE items_fts SET keyword_tokens=? WHERE id=? AND user_id=? AND ${gate}`)
      .bind(tags.keyword_tokens.join(' '), ref.itemId, uid, ...gateArgs));
    if (!tags) statements.push(db.prepare(`UPDATE items SET content_seq=content_seq+1,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND user_id=? AND ${gate}`).bind(ref.itemId, uid, ...gateArgs));
  } else if (tags) {
    statements.push(db.prepare(`UPDATE saved_refs SET personal_topic_id=?,classification_state='ready',row_version=row_version+1,
      updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND classification_state='pending' AND personal_topic_id IS NULL AND ${gate}`)
      .bind(tags.topic_id, ref.savedRefId, uid, ...gateArgs));
  }
  const results = await db.batch(statements);
  if (!results[1].meta.changes) throw new LearningError(409, 'CONFLICT', '題目已更新或已確認，請重新載入後再操作');
  return readLearningQuestion(db, uid, ref);
}
