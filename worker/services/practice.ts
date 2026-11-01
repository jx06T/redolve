import { validateLearningData } from '../../src/types/learning';
import { gradePractice } from '../../src/types/practice';
import type { AttemptInput, PracticeAttempt, PracticeQuestion, PracticeScope, PracticeSession } from '../../src/types/practice';
import { readLearningQuestion } from './learningQuestions';

export class PracticeError extends Error { constructor(public status: 404 | 409 | 410 | 422, message: string) { super(message); } }
export async function digest(value: unknown) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))]
    .map(n => n.toString(16).padStart(2, '0')).join('');
}
export interface ScopeQuestion {
  id: string | null; itemId: string | null; savedRefId: string | null; revisionId: string | null;
  topicId: string; label: string; confirmationStatus: 'ai' | 'confirmed'; prepared: number;
  missingCorrectAnswer: number; missingOriginalAnswer: number;
}
export async function scopeTopics(db: D1Database, uid: string, scope: PracticeScope) {
  if (!scope || typeof scope.subjectId !== 'string' || scope.subjectId.length > 200 ||
    scope.topicId !== undefined && typeof scope.topicId !== 'string') throw new PracticeError(422, '請選擇科目');
  const all = (await db.prepare('SELECT id,parent_id,label FROM taxonomies WHERE user_id IS NULL OR user_id=?').bind(uid)
    .all<{ id: string; parent_id: string | null; label: string }>()).results;
  const ids = new Set([scope.subjectId]);
  if (!all.some(t => t.id === scope.subjectId)) throw new PracticeError(404, '找不到科目');
  for (let changed = true; changed;) { changed = false; for (const t of all) if (t.parent_id && ids.has(t.parent_id) && !ids.has(t.id)) { ids.add(t.id); changed = true; } }
  if (scope.topicId) {
    if (!ids.has(scope.topicId)) throw new PracticeError(422, '單元不屬於所選科目');
    ids.clear(); ids.add(scope.topicId);
    for (let changed = true; changed;) { changed = false; for (const t of all) if (t.parent_id && ids.has(t.parent_id) && !ids.has(t.id)) { ids.add(t.id); changed = true; } }
  }
  if (ids.size > 250) throw new PracticeError(422, '範圍過大，請限制單元');
  return { ids: [...ids], labels: Object.fromEntries(all.filter(t => ids.has(t.id)).map(t => [t.id, t.label])) };
}
export function scopeStatement(db: D1Database, uid: string, ids: string[], includeArchived: boolean, limit: number, pivot = '', selected?: string[], perSource = limit, practiceOnly = false) {
  // Indexed scope lookups, bounded metadata only. No FTS and no ORDER BY RANDOM().
  return db.prepare(`SELECT * FROM (SELECT q.id,i.id itemId,NULL savedRefId,q.current_revision_id revisionId,i.topic_id topicId,
    COALESCE(q.confirmation_status,'ai') confirmationStatus,CASE WHEN LENGTH(json_extract(r.content_json,'$.ocrText'))>0 THEN 1 ELSE 0 END prepared,
    CASE WHEN json_type(r.content_json,'$.correctAnswer')='object' THEN 0 ELSE 1 END missingCorrectAnswer,
    CASE WHEN json_type(r.personal_json,'$.originalAnswer')='object' THEN 0 ELSE 1 END missingOriginalAnswer
    FROM items i LEFT JOIN learning_questions q ON q.user_id=i.user_id AND q.item_id=i.id
    LEFT JOIN learning_question_revisions r ON r.id=q.current_revision_id
    WHERE i.user_id=? AND i.topic_id IN (SELECT value FROM json_each(?)) AND (?=1 OR i.status!='archived') AND (?=0 OR i.status!='processing')
    AND i.id>=? AND (? IS NULL OR q.id IN (SELECT value FROM json_each(?))) LIMIT ?)
    UNION ALL SELECT * FROM (SELECT q.id,NULL,s.id,q.current_revision_id,s.personal_topic_id,COALESCE(q.confirmation_status,'ai'),
    CASE WHEN LENGTH(json_extract(r.content_json,'$.ocrText'))>0 THEN 1 ELSE 0 END,
    CASE WHEN json_type(r.content_json,'$.correctAnswer')='object' THEN 0 ELSE 1 END,
    CASE WHEN json_type(r.personal_json,'$.originalAnswer')='object' THEN 0 ELSE 1 END
    FROM saved_refs s LEFT JOIN learning_questions q ON q.user_id=s.user_id AND q.saved_ref_id=s.id
    LEFT JOIN learning_question_revisions r ON r.id=q.current_revision_id
    WHERE s.user_id=? AND s.personal_topic_id IN (SELECT value FROM json_each(?)) AND (?=1 OR s.status!='archived') AND s.id>=?
    AND (? IS NULL OR q.id IN (SELECT value FROM json_each(?))) LIMIT ?) LIMIT ?`)
    .bind(uid, JSON.stringify(ids), includeArchived ? 1 : 0, practiceOnly ? 1 : 0, pivot, selected ? JSON.stringify(selected) : null, selected ? JSON.stringify(selected) : null, perSource,
      uid, JSON.stringify(ids), includeArchived ? 1 : 0, pivot, selected ? JSON.stringify(selected) : null, selected ? JSON.stringify(selected) : null, perSource, limit);
}
export async function createPractice(db: D1Database, uid: string, scope: PracticeScope, count: number, recommended?: string[]): Promise<PracticeSession> {
  if (![3, 5, 10].includes(count)) throw new PracticeError(422, '每輪可選 3、5 或 10 題');
  if (recommended && (!Array.isArray(recommended) || recommended.length > 50 || recommended.some(id => typeof id !== 'string'))) throw new PracticeError(422, '建議題目格式不正確');
  const topics = await scopeTopics(db, uid, scope);
  const pivot = recommended ? '' : crypto.randomUUID();
  let pool = (await scopeStatement(db, uid, topics.ids, !!scope.includeArchived, 500, pivot, recommended, 250, true).all<ScopeQuestion>()).results;
  if (pool.length < 500 && pivot) {
    const earlier = (await scopeStatement(db, uid, topics.ids, !!scope.includeArchived, 500, '', undefined, 250, true).all<ScopeQuestion>()).results;
    const seen = new Set(pool.map(q => q.itemId || q.savedRefId));
    pool = [...pool, ...earlier.filter(q => !seen.has(q.itemId || q.savedRefId))].slice(0, 500);
  }
  pool = pool.filter(q => q.id && q.revisionId && q.prepared && (!recommended || recommended.includes(q.id)));
  const latest = pool.length ? (await db.prepare(`SELECT j.value question_id,a.result,a.answered_at FROM json_each(?) j
    LEFT JOIN practice_attempts a ON a.id=(SELECT id FROM practice_attempts WHERE user_id=? AND learning_question_id=j.value
    AND voided_at IS NULL ORDER BY answered_at DESC,received_at DESC,id DESC LIMIT 1)`)
    .bind(JSON.stringify(pool.map(q => q.id)), uid).all<{ question_id: string; result: string | null; answered_at: string | null }>()).results : [];
  const latestById = new Map(latest.map(a => [a.question_id, a]));
  const groups: ScopeQuestion[][] = [[], [], [], []]; const now = Date.now();
  pool.forEach(q => {
    const attempt = latestById.get(q.id!);
    const age = attempt?.answered_at ? (now - Date.parse(attempt.answered_at)) / 86400000 : Infinity;
    groups[attempt?.result === 'incorrect' && age <= 30 ? 0 : !attempt?.answered_at ? 2 : age >= 7 ? 1 : 3].push(q);
  });
  const picked: ScopeQuestion[] = [], weights = [40, 30, 20, 10];
  while (picked.length < count && groups.some(g => g.length)) {
    const total = groups.reduce((sum, g, i) => sum + (g.length ? weights[i] : 0), 0); let draw = Math.random() * total;
    const group = groups.find((g, i) => g.length && (draw -= weights[i]) < 0)!;
    picked.push(group.splice(Math.floor(Math.random() * group.length), 1)[0]);
  }
  const questions: PracticeQuestion[] = [];
  for (const q of picked) {
    const ref = q.itemId ? { kind: 'owned' as const, itemId: q.itemId } : { kind: 'saved' as const, savedRefId: q.savedRefId! };
    try {
      const current = await readLearningQuestion(db, uid, ref);
      if (current.id && current.revisionId && current.content.ocrText) questions.push({ ...current, id: current.id, revisionId: current.revisionId,
        topicId: q.topicId, sessionItemId: crypto.randomUUID(), imageUrl: `/api/practice/questions/${current.id}/revisions/${current.revisionId}/image` });
    } catch { /* Removed or quarantined candidates are not available for practice. */ }
  }
  return { id: crypto.randomUUID(), policy: 'mixed-v1', questions, candidateCount: pool.length };
}
type AttemptRow = Record<string, string | number | null>;
export function presentAttempt(row: AttemptRow): PracticeAttempt {
  return { id: String(row.id), questionId: String(row.learning_question_id), revisionId: String(row.revision_id), sessionId: String(row.session_id),
    sessionItemId: String(row.session_item_id), answer: JSON.parse(String(row.answer_json)), result: row.result as PracticeAttempt['result'],
    gradingMethod: row.grading_method as PracticeAttempt['gradingMethod'], basis: JSON.parse(String(row.grading_basis_json)),
    answeredAt: String(row.answered_at), receivedAt: String(row.received_at), timeQuality: row.time_quality as PracticeAttempt['timeQuality'],
    usedOriginalImage: row.used_original_image === 1, supersedesAttemptId: row.supersedes_attempt_id as string | null, voidedAt: row.voided_at as string | null };
}
export async function submitAttempt(db: D1Database, uid: string, raw: AttemptInput): Promise<PracticeAttempt> {
  if (!raw || ['id','questionId','revisionId','sessionId','sessionItemId'].some(k => typeof raw[k as keyof AttemptInput] !== 'string' ||
    !/^[\w-]{1,200}$/.test(String(raw[k as keyof AttemptInput]))) || typeof raw.clientTimezone !== 'string' || raw.clientTimezone.length > 100 ||
    typeof raw.clientAnsweredAt !== 'string' || !Number.isFinite(Date.parse(raw.clientAnsweredAt)) || typeof raw.usedOriginalImage !== 'boolean' ||
    raw.supersedesAttemptId !== undefined && (typeof raw.supersedesAttemptId !== 'string' || raw.supersedesAttemptId.length > 200))
    throw new PracticeError(422, '作答資料格式不正確');
  const request = { id: raw.id, questionId: raw.questionId, revisionId: raw.revisionId, sessionId: raw.sessionId, sessionItemId: raw.sessionItemId,
    answer: raw.answer?.kind === 'choice' && Array.isArray(raw.answer.optionIds) ? { kind: 'choice', optionIds: [...new Set(raw.answer.optionIds)].sort() } : raw.answer,
    selfResult: raw.selfResult ?? null, clientAnsweredAt: raw.clientAnsweredAt, clientTimezone: raw.clientTimezone,
    usedOriginalImage: raw.usedOriginalImage, supersedesAttemptId: raw.supersedesAttemptId ?? null };
  const hash = await digest(request);
  const existing = await db.prepare('SELECT * FROM practice_attempts WHERE user_id=? AND id=?').bind(uid, raw.id).first<AttemptRow>();
  if (existing) { if (existing.request_hash !== hash) throw new PracticeError(409, '同一筆作答不可改成不同內容'); return presentAttempt(existing); }
  const revision = await db.prepare(`SELECT r.content_json,q.confirmation_status FROM learning_question_revisions r
    JOIN learning_questions q ON q.id=r.learning_question_id WHERE q.id=? AND q.user_id=? AND r.id=?`)
    .bind(raw.questionId, uid, raw.revisionId).first<{ content_json: string; confirmation_status: string }>();
  if (!revision) throw new PracticeError(410, '題目或作答版本已不可用');
  const content = validateLearningData({ content: JSON.parse(revision.content_json), personal: { originalAnswer: null, errorReasons: [] } }).content;
  const old = raw.supersedesAttemptId ? await db.prepare('SELECT * FROM practice_attempts WHERE id=? AND user_id=?').bind(raw.supersedesAttemptId, uid).first<AttemptRow>() : null;
  if (raw.supersedesAttemptId && (!old || old.learning_question_id !== raw.questionId || old.session_id !== raw.sessionId || old.session_item_id !== raw.sessionItemId || old.voided_at))
    throw new PracticeError(409, '這次作答已更正或不屬於此題');
  const answer = old ? JSON.parse(String(old.answer_json)) : request.answer;
  let graded; try { graded = gradePractice(content, answer, raw.selfResult); } catch (e) { throw new PracticeError(422, (e as Error).message); }
  const now = new Date().toISOString(), clientTime = Date.parse(raw.clientAnsweredAt), adjusted = clientTime > Date.now() + 300000;
  const answeredAt = old ? String(old.answered_at) : adjusted ? now : new Date(clientTime).toISOString();
  const basis = { content, confirmationStatus: revision.confirmation_status, rule: 'exact-set-v1' };
  const insert = db.prepare(`INSERT OR IGNORE INTO practice_attempts(id,user_id,learning_question_id,revision_id,session_id,session_item_id,
    answer_json,result,grading_method,grading_basis_json,client_answered_at,answered_at,received_at,client_timezone,time_quality,used_original_image,request_hash,supersedes_attempt_id)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM practice_attempts WHERE id=? AND user_id=? AND voided_at IS NULL)`)
    .bind(raw.id, uid, raw.questionId, raw.revisionId, raw.sessionId, raw.sessionItemId, JSON.stringify(graded.answer), graded.result, graded.gradingMethod,
      JSON.stringify(basis), raw.clientAnsweredAt, answeredAt, now, raw.clientTimezone, adjusted ? 'adjusted' : 'client', raw.usedOriginalImage ? 1 : 0,
      hash, raw.supersedesAttemptId ?? null, raw.supersedesAttemptId ?? null, raw.supersedesAttemptId ?? null, uid);
  const statements = [insert];
  if (old) statements.push(db.prepare(`UPDATE practice_attempts SET voided_at=? WHERE id=? AND user_id=? AND voided_at IS NULL
    AND EXISTS(SELECT 1 FROM practice_attempts WHERE id=? AND user_id=? AND supersedes_attempt_id=?)`).bind(now, old.id, uid, raw.id, uid, old.id));
  await db.batch(statements);
  const result = await db.prepare('SELECT * FROM practice_attempts WHERE id=? AND user_id=?').bind(raw.id, uid).first<AttemptRow>();
  if (!result || result.request_hash !== hash) throw new PracticeError(409, '本題本輪已提交，或這筆作答已被更正');
  return presentAttempt(result);
}
