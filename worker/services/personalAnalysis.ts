import type { AnalysisEvidence, AnalysisInterpretation, AnalysisReport, AnalysisStats } from '../../src/types/analysis';
import type { PracticeScope } from '../../src/types/practice';
import { ANALYSIS_PERIOD_DAYS } from '../../src/types/learning';
import { PracticeError, digest, scopeStatement, scopeTopics } from './practice';
import type { ScopeQuestion } from './practice';

interface Event { id: string; learning_question_id: string; result: string; grading_method: string; used_original_image: number; answered_at: string; topicId: string }
export async function analysisSnapshot(db: D1Database, uid: string, scope: PracticeScope, days: number) {
  if (!ANALYSIS_PERIOD_DAYS.some(d => d === days)) throw new PracticeError(422, '請選擇 7、15、30、60 或 90 天');
  const topics = await scopeTopics(db, uid, scope), cutoff = new Date().toISOString(), from = new Date(Date.now() - days * 86400000).toISOString();
  const results = await db.batch([
    scopeStatement(db, uid, topics.ids, true, 2001),
    db.prepare(`SELECT p.id,p.learning_question_id,p.result,p.grading_method,p.used_original_image,p.answered_at,
      COALESCE(i.topic_id,s.personal_topic_id) topicId FROM practice_attempts p
      JOIN learning_questions q ON q.id=p.learning_question_id AND q.user_id=p.user_id
      LEFT JOIN items i ON i.id=q.item_id LEFT JOIN saved_refs s ON s.id=q.saved_ref_id
      WHERE p.user_id=? AND p.answered_at>=? AND p.answered_at<=? AND p.voided_at IS NULL
      AND COALESCE(i.topic_id,s.personal_topic_id) IN (SELECT value FROM json_each(?)) ORDER BY p.answered_at,p.received_at,p.id LIMIT 10001`)
      .bind(uid, from, cutoff, JSON.stringify(topics.ids)),
  ]);
  const questions = results[0].results as unknown as ScopeQuestion[], events = results[1].results as unknown as Event[];
  if (questions.length > 2000 || events.length > 10000) throw new PracticeError(422, '資料量較大，請縮小單元或作答期間');
  const units = topics.ids.map(id => ({ id, label: topics.labels[id], questions: 0, attempts: 0, correct: 0, automatic: 0, self: 0, viewedImage: 0 }));
  const byTopic = new Map(units.map(u => [u.id, u])), byQuestion = new Map<string, Event[]>();
  for (const q of questions) byTopic.get(q.topicId)!.questions++;
  for (const e of events) {
    const u = byTopic.get(e.topicId)!; u.attempts++; u.correct += e.result === 'correct' ? 1 : 0;
    u.automatic += e.grading_method === 'automatic' ? 1 : 0; u.self += e.grading_method === 'self' ? 1 : 0; u.viewedImage += e.used_original_image;
    byQuestion.set(e.learning_question_id, [...(byQuestion.get(e.learning_question_id) || []), e]);
  }
  const repeated = [...byQuestion.values()].filter(es => es.length >= 2);
  const stats: AnalysisStats = { scope: { subjectId: scope.subjectId, ...(scope.topicId ? { topicId: scope.topicId } : {}) }, days, from, cutoff,
    questions: questions.length, prepared: questions.filter(q => q.prepared).length, confirmed: questions.filter(q => q.confirmationStatus === 'confirmed').length,
    attempts: events.length, correct: events.filter(e => e.result === 'correct').length, automatic: events.filter(e => e.grading_method === 'automatic').length,
    self: events.filter(e => e.grading_method === 'self').length, viewedImage: events.filter(e => e.used_original_image).length,
    repeatedQuestions: repeated.length, changedToCorrect: repeated.filter(es => es[0].result === 'incorrect' && es.at(-1)!.result === 'correct').length,
    changedToIncorrect: repeated.filter(es => es[0].result === 'correct' && es.at(-1)!.result === 'incorrect').length, units: units.filter(u => u.questions || u.attempts) };
  return { stats, questions, events, byQuestion };
}
export async function analysisEvidence(db: D1Database, uid: string, snapshot: Awaited<ReturnType<typeof analysisSnapshot>>) {
  // Representative sample, balanced across units; repeated errors first within a unit.
  const candidates = snapshot.questions.filter(q => q.id && q.revisionId && q.prepared).sort((a, b) =>
    (snapshot.byQuestion.get(b.id!)?.filter(e => e.result === 'incorrect').length || 0) - (snapshot.byQuestion.get(a.id!)?.filter(e => e.result === 'incorrect').length || 0));
  const groups = new Map<string, ScopeQuestion[]>(); for (const q of candidates) groups.set(q.topicId, [...(groups.get(q.topicId) || []), q]);
  const picked: ScopeQuestion[] = [];
  while (picked.length < 30 && [...groups.values()].some(g => g.length)) for (const g of groups.values()) { if (g.length && picked.length < 30) picked.push(g.shift()!); }
  if (!picked.length) return [];
  const rows = (await db.prepare(`SELECT r.id,r.learning_question_id,r.content_json,r.personal_json FROM learning_question_revisions r
    JOIN learning_questions q ON q.id=r.learning_question_id WHERE q.user_id=? AND r.id IN (SELECT value FROM json_each(?))`)
    .bind(uid, JSON.stringify(picked.map(q => q.revisionId))).all<{ id: string; learning_question_id: string; content_json: string; personal_json: string }>()).results;
  const evidence: AnalysisEvidence[] = [];
  const shortAnswer = (value: unknown) => {
    const answer = value as { kind?: string; text?: unknown } | null;
    return answer?.kind === 'text' && typeof answer.text === 'string' ? { kind: 'text', text: answer.text.slice(0, 1000) } : value;
  };
  for (const q of picked) {
    const row = rows.find(r => r.id === q.revisionId); if (!row) throw new PracticeError(409, '題目已變更，請重新產生分析');
    const content = JSON.parse(row.content_json), personal = JSON.parse(row.personal_json), events = snapshot.byQuestion.get(q.id!) || [];
    evidence.push({ id: q.id!, ref: q.itemId ? { kind: 'owned', itemId: q.itemId } : { kind: 'saved', savedRefId: q.savedRefId! },
      revisionId: row.id, topicId: q.topicId, text: [content.ocrText, ...content.options.map((o: { label: string; text: string }) => `${o.label} ${o.text}`)].join('\n').slice(0, 3000),
      originalAnswer: shortAnswer(personal.originalAnswer), correctAnswer: shortAnswer(content.correctAnswer),
      errorReasons: personal.errorReasons.slice(0, 3).map((r: { text: string; origin: string }) => ({ ...r, text: r.text.slice(0, 300) })),
      attempts: events.length, correct: events.filter(e => e.result === 'correct').length });
    if (new TextEncoder().encode(JSON.stringify(evidence)).length > 120000) { evidence.pop(); break; }
  }
  return evidence;
}
export function validateInterpretation(raw: unknown, evidence: AnalysisEvidence[], stats: AnalysisStats): AnalysisInterpretation {
  const value = raw as AnalysisInterpretation;
  if (!value || !Array.isArray(value.findings) || value.findings.length > evidence.length) throw Error('Invalid analysis response');
  const evidenceIds = new Set(evidence.map(e => e.id)), metrics = new Set(stats.units.map(u => u.id));
  return { findings: value.findings.map(f => {
    if (typeof f.title !== 'string' || !f.title.trim() || f.title.length > 160 || typeof f.explanation !== 'string' || f.explanation.length > 3000 ||
      !Array.isArray(f.evidenceIds) || !f.evidenceIds.length || f.evidenceIds.length > 30 || f.evidenceIds.some(id => !evidenceIds.has(id)) ||
      !Array.isArray(f.metricIds) || f.metricIds.some(id => !metrics.has(id))) throw Error('Invalid analysis evidence');
    return { title: f.title.trim(), explanation: f.explanation.trim(), evidenceIds: [...new Set(f.evidenceIds)], metricIds: [...new Set(f.metricIds)] };
  }) };
}
export async function cleanupAnalysis(db: D1Database) {
  // Scheduled in bounded chunks; also run before report reads as a fallback.
  const now = new Date().toISOString();
  const result = await db.prepare(`UPDATE analysis_reports SET evidence_json=NULL,interpretation_json=NULL WHERE id IN
    (SELECT id FROM analysis_reports WHERE detail_expires_at<=? AND (evidence_json IS NOT NULL OR interpretation_json IS NOT NULL) LIMIT 100)`)
    .bind(now).run();
  return result.meta.changes;
}
export async function beginAnalysis(db: D1Database, uid: string, scope: PracticeScope, days: number) {
  const snapshot = await analysisSnapshot(db, uid, scope, days), evidence = await analysisEvidence(db, uid, snapshot);
  const hash = await digest({ scope: snapshot.stats.scope, days, questions: snapshot.questions, events: snapshot.events, prompt: 'personal-v1' });
  const now = new Date().toISOString();
  await db.prepare(`UPDATE analysis_reports SET status='failed',error='上次產生未完成，可手動重試' WHERE user_id=? AND input_hash=? AND status='pending' AND lease_until<?`).bind(uid, hash, now).run();
  await db.prepare(`UPDATE analysis_reports SET input_hash='expired:'||id WHERE user_id=? AND input_hash=? AND detail_expires_at<=?`).bind(uid, hash, now).run();
  const id = crypto.randomUUID(), lease = new Date(Date.now() + 60000).toISOString(), expires = new Date(Date.now() + 90 * 86400000).toISOString();
  const statements = [db.prepare(`INSERT OR IGNORE INTO analysis_reports(id,user_id,subject_id,topic_id,days,input_hash,status,stats_json,evidence_json,prompt_version,created_at,detail_expires_at,lease_until)
    VALUES(?,?,?,?,?,?,'pending',?,?,'personal-v1',?,?,?)`).bind(id, uid, scope.subjectId, scope.topicId ?? null, days, hash, JSON.stringify(snapshot.stats), JSON.stringify(evidence), now, expires, lease),
    db.prepare(`INSERT INTO analysis_report_questions(report_id,source_key,item_id,saved_ref_id,revision_id)
    SELECT ?,json_extract(value,'$.key'),json_extract(value,'$.item'),json_extract(value,'$.saved'),json_extract(value,'$.revision')
    FROM json_each(?) WHERE EXISTS(SELECT 1 FROM analysis_reports WHERE id=? AND user_id=?)`)
      .bind(id, JSON.stringify(snapshot.questions.map(q => ({ key: q.itemId ? `owned:${q.itemId}` : `saved:${q.savedRefId}`, item: q.itemId, saved: q.savedRefId, revision: q.revisionId }))), id, uid)];
  await db.batch(statements);
  const row = await db.prepare("SELECT id FROM analysis_reports WHERE user_id=? AND input_hash=? AND status IN ('pending','complete')").bind(uid, hash).first<{ id: string }>();
  if (!row) throw new PracticeError(409, '資料已變更，請重試');
  return { id: row.id, created: row.id === id, stats: snapshot.stats, evidence };
}
export async function getAnalysis(db: D1Database, uid: string, id: string): Promise<AnalysisReport> {
  const row = await db.prepare('SELECT * FROM analysis_reports WHERE user_id=? AND id=?').bind(uid, id).first<Record<string, string | null>>();
  if (!row) throw new PracticeError(404, '找不到分析報告');
  const expired = Date.parse(row.detail_expires_at!) <= Date.now(), stalled = row.status === 'pending' && Date.parse(row.lease_until!) < Date.now();
  return { id: row.id!, status: stalled ? 'failed' : row.status as AnalysisReport['status'], stats: JSON.parse(row.stats_json!),
    interpretation: !expired && row.interpretation_json ? JSON.parse(row.interpretation_json) : null,
    evidence: !expired && row.evidence_json ? JSON.parse(row.evidence_json) : [], createdAt: row.created_at!, detailExpiresAt: row.detail_expires_at!, expired,
    error: stalled ? '上次產生未完成，可手動重試' : row.error };
}
