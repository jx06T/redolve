import { mathWeaknesses } from '../../src/types/weakness';
import type { Weakness, WeaknessReview } from '../../src/types/weakness';
import type { ErrorReason, LearningData, PersonalQuestionRef } from '../../src/types/learning';
import type { AttemptReasonCandidate } from '../../src/types/weakness';

export async function questionWeaknessSubject(db: D1Database, uid: string, ref: PersonalQuestionRef) {
  const table = ref.kind === 'owned' ? 'items' : 'saved_refs';
  const topic = ref.kind === 'owned' ? 'topic_id' : 'personal_topic_id';
  const id = ref.kind === 'owned' ? ref.itemId : ref.savedRefId;
  const row = await db.prepare(`WITH RECURSIVE path(id,parent_id) AS (
    SELECT t.id,t.parent_id FROM ${table} q JOIN taxonomies t ON t.id=q.${topic} WHERE q.id=? AND q.user_id=? AND (t.user_id IS NULL OR t.user_id=?)
    UNION SELECT t.id,t.parent_id FROM taxonomies t JOIN path p ON p.parent_id=t.id WHERE t.user_id IS NULL OR t.user_id=?
  ) SELECT id FROM path WHERE parent_id IS NULL`).bind(id, uid, uid, uid).first<{ id: string }>();
  return row?.id ?? null;
}

export async function listWeaknesses(db: D1Database, uid: string, subjectId: string): Promise<Weakness[]> {
  const { results } = await db.prepare(`SELECT id,title,target,subject_id subjectId FROM personal_weaknesses WHERE user_id=? AND subject_id=? ORDER BY title_key LIMIT 200`)
    .bind(uid, subjectId).all<Weakness>();
  return [...results, ...(subjectId === 'math' ? mathWeaknesses.map(({ id, title, target }) => ({ id, title, target, subjectId })) : [])];
}

export async function weaknessContext(db: D1Database, uid: string, ref: PersonalQuestionRef, data: LearningData, notes = '') {
  const tagQuery = ref.kind === 'owned' ? db.prepare('SELECT keywords tags FROM items WHERE id=? AND user_id=?').bind(ref.itemId, uid)
    : db.prepare('SELECT ss.source_tags tags FROM saved_refs s JOIN saved_snapshots ss ON ss.id=s.current_snapshot_id AND ss.saved_ref_id=s.id WHERE s.id=? AND s.user_id=?').bind(ref.savedRefId, uid);
  const [subjectId, tagRow] = await Promise.all([questionWeaknessSubject(db, uid, ref), tagQuery.first<{ tags: string | null }>()]);
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(tagRow?.tags || '[]');
    if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === 'string').slice(0, 16);
  } catch { /* Legacy metadata can be absent. */ }
  const known = new Set(data.personal.errorReasons.map(reason => reason.weaknessId));
  const preview = [data.content.ocrText?.slice(0, 3000), data.personal.correctionSummary?.slice(0, 500), ...tags].join(' ').toLowerCase();
  const supplement = notes.toLowerCase();
  const scores = new Map(mathWeaknesses.map(item => [item.id, item.keywords.reduce((score, keyword) =>
    score + (supplement.includes(keyword) ? 4 : preview.includes(keyword) ? 1 : 0), 0)]));
  const available = subjectId ? await listWeaknesses(db, uid, subjectId) : [];
  const ranked = available.map(item => ({ item,
    score: known.has(item.id) ? 100 : supplement.includes(item.title) || preview.includes(item.title) ? 50 : scores.get(item.id) ?? 0,
  })).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 12).map(entry => entry.item);
  const catalog = ranked.length || subjectId !== 'math' ? ranked : available.filter(item => item.id.startsWith('math-'));
  return { catalog, tags };
}

export async function weaknessIdsAllowed(db: D1Database, uid: string, subjectId: string | null, ids: string[]) {
  if (!ids.length) return true;
  if (!subjectId) return false;
  const personalIds = ids.filter(id => subjectId !== 'math' || !mathWeaknesses.some(item => item.id === id));
  if (!personalIds.length) return true;
  const result = await db.prepare(`SELECT COUNT(*) n FROM personal_weaknesses WHERE user_id=? AND subject_id=? AND id IN (SELECT value FROM json_each(?))`)
    .bind(uid, subjectId, JSON.stringify(personalIds)).first<{ n: number }>();
  return result?.n === personalIds.length;
}

export async function createWeakness(db: D1Database, uid: string, subjectId: string, title: string, target: string) {
  const titleKey = title.normalize('NFKC').replace(/\s+/gu, ' ').toLowerCase();
  const preset = subjectId === 'math' ? mathWeaknesses.find(item => item.title === title) : undefined;
  if (preset) return { id: preset.id, title: preset.title, target: preset.target, subjectId };
  await db.prepare(`INSERT OR IGNORE INTO personal_weaknesses(id,user_id,subject_id,title,title_key,target)
    SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM taxonomies WHERE id=? AND parent_id IS NULL AND (user_id IS NULL OR user_id=?))
    AND (SELECT COUNT(*) FROM personal_weaknesses WHERE user_id=? AND subject_id=?)<200`)
    .bind(`personal-${crypto.randomUUID()}`, uid, subjectId, title, titleKey, target, subjectId, uid, uid, subjectId).run();
  return db.prepare(`SELECT id,title,target,subject_id subjectId FROM personal_weaknesses WHERE user_id=? AND subject_id=? AND title_key=?`)
    .bind(uid, subjectId, titleKey).first<Weakness>();
}

export async function readWeaknessReview(db: D1Database, uid: string, attemptId: string) {
  const row = await db.prepare(`SELECT q.id question_id,q.item_id,q.saved_ref_id,r.revision_no,r.personal_json,r.source_version,p.answered_at,
    COALESCE(w.version,0) version,COALESCE(w.weakness_ids,'[]') ids
    FROM practice_attempts p JOIN learning_questions q ON q.id=p.learning_question_id AND q.user_id=p.user_id
    JOIN learning_question_revisions r ON r.id=p.revision_id
    LEFT JOIN practice_weakness_reviews w ON w.attempt_id=p.id AND w.version=(SELECT MAX(version) FROM practice_weakness_reviews WHERE attempt_id=p.id)
    WHERE p.id=? AND p.user_id=? AND p.result='incorrect' AND p.voided_at IS NULL`)
    .bind(attemptId, uid).first<{ question_id: string; item_id: string | null; saved_ref_id: string | null; revision_no: number; personal_json: string; source_version: string; answered_at: string; version: number; ids: string }>();
  if (!row) return null;
  const ref: PersonalQuestionRef = row.item_id ? { kind: 'owned', itemId: row.item_id } : { kind: 'saved', savedRefId: row.saved_ref_id! };
  return { ref, questionId: row.question_id, revisionNo: row.revision_no, sourceVersion: row.source_version, answeredAt: row.answered_at,
    reasons: (JSON.parse(row.personal_json) as LearningData['personal']).errorReasons,
    review: { ids: JSON.parse(row.ids) as string[], version: row.version } satisfies WeaknessReview };
}

export async function attemptReasonCandidates(db: D1Database, uid: string, attempt: NonNullable<Awaited<ReturnType<typeof readWeaknessReview>>>) {
  const { ref, sourceVersion, answeredAt, reasons } = attempt;
  const owned = ref.kind === 'owned';
  // Owned versions are sequence:asset. Saved versions are snapshot:sequence.
  const sourceKey = owned ? sourceVersion.slice(sourceVersion.indexOf(':') + 1) : sourceVersion.split(':')[0];
  const sourceColumn = owned ? "substr(source_version,instr(source_version,':')+1)" : "substr(source_version,1,instr(source_version,':')-1)";
  const correction = await db.prepare(`SELECT data_json FROM learning_corrections WHERE user_id=? AND ${owned ? 'item_id' : 'saved_ref_id'}=?
    AND status='complete' AND created_at<=? AND ${sourceColumn}=?
    ORDER BY created_at DESC,id DESC LIMIT 1`)
    .bind(uid, owned ? ref.itemId : ref.savedRefId, answeredAt, sourceKey).first<{ data_json: string | null }>();
  const recognition = correction?.data_json ? null : await db.prepare(`SELECT personal_json FROM learning_question_revisions
    WHERE learning_question_id=? AND revision_no<=? AND created_by='ai' AND ${sourceColumn}=? ORDER BY revision_no DESC LIMIT 1`)
    .bind(attempt.questionId, attempt.revisionNo, sourceKey).first<{ personal_json: string }>();
  const proposed = correction?.data_json ? (JSON.parse(correction.data_json) as LearningData).personal.errorReasons
    : recognition ? (JSON.parse(recognition.personal_json) as LearningData['personal']).errorReasons : [];
  const byText = new Map<string, ErrorReason>();
  for (const reason of [...proposed, ...reasons]) {
    if (reason.origin !== 'ai' || !reason.text.trim()) continue;
    const text = reason.text.normalize('NFKC').trim();
    if (!byText.has(text) || reason.weaknessId) byText.set(text, reason);
  }
  const candidates = await Promise.all([...byText].map(async ([normalized, reason]): Promise<AttemptReasonCandidate> => {
    if (reason.weaknessId) return { id: reason.weaknessId, text: reason.text };
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized)));
    return { id: 'ai-reason-' + [...bytes].map(value => value.toString(16).padStart(2, '0')).join(''), text: reason.text };
  }));
  return [...new Map(candidates.map(candidate => [candidate.id, candidate])).values()];
}

export async function appendWeaknessReview(db: D1Database, uid: string, attemptId: string, version: number, ids: string[]) {
  return db.prepare(`INSERT INTO practice_weakness_reviews(attempt_id,user_id,learning_question_id,version,weakness_ids,recorded_at)
    SELECT p.id,p.user_id,p.learning_question_id,?+1,?,? FROM practice_attempts p WHERE p.id=? AND p.user_id=? AND p.result='incorrect' AND p.voided_at IS NULL
    AND COALESCE((SELECT MAX(version) FROM practice_weakness_reviews WHERE attempt_id=p.id),0)=?`)
    .bind(version, JSON.stringify(ids), new Date().toISOString(), attemptId, uid, version).run();
}

export function reviewedWeaknessAttempts(db: D1Database, uid: string, questionIds: string[], cutoff: string) {
  return db.prepare(`SELECT w.attempt_id attemptId,w.learning_question_id questionId,w.weakness_ids ids,p.answered_at answeredAt,w.recorded_at recordedAt
    FROM json_each(?) q CROSS JOIN practice_weakness_reviews w INDEXED BY idx_practice_weakness_scope
    JOIN practice_attempts p ON p.id=w.attempt_id AND p.user_id=w.user_id
    WHERE w.user_id=? AND w.learning_question_id=q.value AND w.recorded_at<=? AND (p.voided_at IS NULL OR p.voided_at>?)
    AND w.version=(SELECT MAX(r.version) FROM practice_weakness_reviews r WHERE r.attempt_id=w.attempt_id AND r.recorded_at<=?)
    LIMIT 10001`).bind(JSON.stringify(questionIds), uid, cutoff, cutoff, cutoff)
    .all<{ attemptId: string; questionId: string; ids: string; answeredAt: string; recordedAt: string }>();
}
