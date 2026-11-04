import type { ErrorReason } from '../../src/types/learning';
import type { WeaknessAttemptEvidence, WeaknessTrend } from '../../src/types/weakness';
import { PracticeError } from './practice';
import type { analysisSnapshot } from './personalAnalysis';
import { listWeaknesses, reviewedWeaknessAttempts } from './weaknesses';

type Snapshot = Awaited<ReturnType<typeof analysisSnapshot>>;

export async function weaknessTrends(db: D1Database, uid: string, snapshot: Snapshot) {
  const questions = snapshot.questions.filter(q => q.id && q.revisionId);
  if (!questions.length) return { trends: [], correctionIds: new Map<string, string[]>(), attempts: new Map<string, WeaknessAttemptEvidence[]>() };
  const [catalog, correctionRows, reviews] = await Promise.all([
    listWeaknesses(db, uid, snapshot.stats.scope.subjectId),
    db.prepare(`SELECT r.learning_question_id questionId,r.created_at createdAt,e.value reason
      FROM json_each(?) v CROSS JOIN learning_question_revisions r ON r.id=v.value
      JOIN learning_questions q ON q.id=r.learning_question_id AND q.user_id=?
      JOIN json_each(r.personal_json,'$.errorReasons') e
      WHERE json_type(e.value,'$.weaknessId')='text' AND (e.value->>'$.origin'='user' OR e.value->>'$.accepted'=1)`)
      .bind(JSON.stringify(questions.map(q => q.revisionId)), uid).all<{ questionId: string; createdAt: string; reason: string }>(),
    reviewedWeaknessAttempts(db, uid, questions.map(q => q.id!), snapshot.stats.cutoff),
  ]);
  if (reviews.results.length > 10000) throw new PracticeError(422, '此科的弱點紀錄超過分析上限');
  const known = new Set(catalog.map(item => item.id));
  const occurrences = new Map<string, Map<string, number>>(), correctionIds = new Map<string, string[]>();
  const firstSeen = new Map<string, number>(), recurrences = new Map<string, number>();
  const attempts = new Map<string, WeaknessAttemptEvidence[]>(), counts = new Map<string, number>();
  const add = (id: string, questionId: string, at: number) => {
    const byQuestion = occurrences.get(id) ?? new Map<string, number>();
    byQuestion.set(questionId, Math.max(byQuestion.get(questionId) ?? 0, at)); occurrences.set(id, byQuestion);
    firstSeen.set(id, Math.min(firstSeen.get(id) ?? Infinity, at));
  };
  for (const row of correctionRows.results) {
    const { weaknessId, confirmedAt } = JSON.parse(row.reason) as ErrorReason;
    if (!weaknessId || !known.has(weaknessId)) continue;
    const at = confirmedAt || row.createdAt;
    add(weaknessId, row.questionId, Date.parse(at.replace(' ', 'T') + (at.includes('T') ? '' : 'Z')));
    const ids = correctionIds.get(row.questionId) ?? [];
    if (!ids.includes(weaknessId)) ids.push(weaknessId);
    correctionIds.set(row.questionId, ids);
  }
  const period = new Set(snapshot.events.map(event => event.id));
  const sortedReviews = reviews.results.sort((a, b) => a.answeredAt.localeCompare(b.answeredAt) || a.attemptId.localeCompare(b.attemptId));
  for (const row of sortedReviews) {
    const ids = (JSON.parse(row.ids) as string[]).filter(id => known.has(id));
    if (!ids.length) continue;
    for (const id of ids) {
      const answeredAt = Date.parse(row.answeredAt);
      const isRepeat = (firstSeen.get(id) ?? Infinity) < answeredAt;
      add(id, row.questionId, answeredAt);
      if (period.has(row.attemptId) || snapshot.stats.cycle && row.recordedAt > snapshot.stats.from) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
        if (isRepeat) recurrences.set(id, (recurrences.get(id) ?? 0) + 1);
      }
    }
    const entries = attempts.get(row.questionId) ?? [];
    entries.push({ attemptId: row.attemptId, weaknessIds: ids, answeredAt: row.answeredAt });
    if (entries.length > 5) entries.shift();
    attempts.set(row.questionId, entries);
  }
  const trends: WeaknessTrend[] = catalog.flatMap(item => {
    const linked = occurrences.get(item.id);
    if (!linked?.size) return [];
    let sameQuestionCorrect = 0, delayedCorrect = 0;
    for (const [id, lastOccurrence] of linked) {
      const latest = snapshot.byQuestion.get(id)?.at(-1);
      if (latest?.result !== 'correct' || Date.parse(latest.answered_at) <= lastOccurrence) continue;
      sameQuestionCorrect++;
      if (!latest.used_original_image && Date.parse(latest.answered_at) - lastOccurrence >= 7 * 86400000) delayedCorrect++;
    }
    return [{ ...item, questions: linked.size, confirmedAttempts: counts.get(item.id) ?? 0, recurringAttempts: recurrences.get(item.id) ?? 0, sameQuestionCorrect, delayedCorrect,
      needsReview: linked.size - sameQuestionCorrect, evidenceQuestionIds: [...linked.keys()].slice(0, 30) }];
  });
  return { trends: trends.sort((a, b) => b.needsReview - a.needsReview || b.confirmedAttempts - a.confirmedAttempts), correctionIds, attempts };
}
