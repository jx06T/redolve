import type { AnalysisSubjectSummary } from '../../src/types/analysis';
import { PracticeError } from './practice';
import { ANALYSIS_PERIOD_DAYS } from '../../src/types/learning';

/** Aggregated overview: no OCR bodies, per-question history, or AI calls on page entry. */
export async function analysisOverview(db: D1Database, uid: string, days: number) {
  if (!ANALYSIS_PERIOD_DAYS.some(d => d === days)) throw new PracticeError(422, '觀察期間不正確');
  const nodes = (await db.prepare('SELECT id,parent_id,label FROM taxonomies WHERE user_id IS NULL OR user_id=?').bind(uid)
    .all<{ id: string; parent_id: string | null; label: string }>()).results;
  const roots = nodes.filter(n => !n.parent_id), byId = new Map(nodes.map(n => [n.id, n]));
  const rootOf = (id: string) => { const seen = new Set<string>(); let n = byId.get(id); while (n?.parent_id && !seen.has(n.id)) { seen.add(n.id); n = byId.get(n.parent_id); } return n && !n.parent_id ? n.id : null; };
  const cutoff = new Date().toISOString(), from = new Date(Date.now() - days * 86400000).toISOString();
  const [questionRows, attemptRows, reportRows] = await db.batch<Record<string, string | number | null>>([
    db.prepare(`SELECT topicId,COUNT(*) questions,SUM(prepared) prepared,SUM(confirmed) confirmed FROM (
      SELECT i.topic_id topicId,CASE WHEN length(json_extract(r.content_json,'$.ocrText'))>0 THEN 1 ELSE 0 END prepared,
      CASE WHEN q.confirmation_status='confirmed' THEN 1 ELSE 0 END confirmed FROM items i
      LEFT JOIN learning_questions q ON q.item_id=i.id AND q.user_id=i.user_id LEFT JOIN learning_question_revisions r ON r.id=q.current_revision_id WHERE i.user_id=?
      UNION ALL SELECT s.personal_topic_id,CASE WHEN length(json_extract(r.content_json,'$.ocrText'))>0 THEN 1 ELSE 0 END,
      CASE WHEN q.confirmation_status='confirmed' THEN 1 ELSE 0 END FROM saved_refs s
      LEFT JOIN learning_questions q ON q.saved_ref_id=s.id AND q.user_id=s.user_id LEFT JOIN learning_question_revisions r ON r.id=q.current_revision_id WHERE s.user_id=?) GROUP BY topicId`).bind(uid, uid),
    db.prepare(`SELECT COALESCE(i.topic_id,s.personal_topic_id) topicId,COUNT(*) attempts,SUM(p.result='correct') correct
      FROM practice_attempts p JOIN learning_questions q ON q.id=p.learning_question_id AND q.user_id=p.user_id
      LEFT JOIN items i ON i.id=q.item_id AND i.user_id=q.user_id LEFT JOIN saved_refs s ON s.id=q.saved_ref_id AND s.user_id=q.user_id
      WHERE p.user_id=? AND p.answered_at>=? AND p.answered_at<=? AND p.received_at<=? AND p.voided_at IS NULL GROUP BY topicId`).bind(uid, from, cutoff, cutoff),
    db.prepare(`SELECT r.subject_id,r.id,r.created_at,r.status FROM json_each(?) subject JOIN analysis_reports r ON r.id=
      (SELECT id FROM analysis_reports WHERE user_id=? AND subject_id=subject.value AND topic_id IS NULL ORDER BY created_at DESC,id DESC LIMIT 1)`)
      .bind(JSON.stringify(roots.map(n => n.id)), uid),
  ]);
  const summaries = new Map<string, AnalysisSubjectSummary>(roots.map(n => [n.id, { id: n.id, label: n.label, questions: 0, prepared: 0, confirmed: 0, attempts: 0, correct: 0, latestReport: null }]));
  for (const row of questionRows.results) { const summary = summaries.get(rootOf(String(row.topicId)) || ''); if (summary) { summary.questions += Number(row.questions); summary.prepared += Number(row.prepared); summary.confirmed += Number(row.confirmed); } }
  for (const row of attemptRows.results) { const summary = summaries.get(rootOf(String(row.topicId)) || ''); if (summary) { summary.attempts += Number(row.attempts); summary.correct += Number(row.correct); } }
  for (const row of reportRows.results) { const summary = summaries.get(String(row.subject_id)); if (summary) summary.latestReport = { id: String(row.id), createdAt: String(row.created_at), status: String(row.status) }; }
  return { subjects: [...summaries.values()], days, from, cutoff };
}
