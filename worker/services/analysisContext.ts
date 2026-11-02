import type { AnalysisCatalogEntry, AIService } from './ai/AIService';
import type { AnalysisEvidence, AnalysisFollowup, AnalysisReply, AnalysisStats, PreviousAnalysisContext } from '../../src/types/analysis';
import type { ScopeQuestion } from './practice';
import { digest, PracticeError } from './practice';
import { analysisEvidence, getAnalysis, validateInterpretation } from './personalAnalysis';
import { completeCycleStatement, prepareCycleRun } from './analysisCycles';

interface StageContext { previousReport?: PreviousAnalysisContext; changes?: { newQuestionIds: string[]; updatedQuestionIds: string[]; practicedQuestionIds: string[] } }
interface Context extends StageContext { catalog: AnalysisCatalogEntry[]; questions: ScopeQuestion[]; attemptIds: string[] }
export async function buildAnalysisContext(db: D1Database, uid: string, snapshot: Parameters<typeof analysisEvidence>[2] & { events: { id: string }[] }, stage: StageContext = {}): Promise<Context> {
  const candidates = snapshot.questions.filter(q => q.id && q.revisionId && q.prepared);
  const rows = candidates.length ? (await db.prepare(`SELECT r.id,substr(json_extract(r.content_json,'$.ocrText'),1,160) text
    FROM learning_question_revisions r JOIN learning_questions q ON q.id=r.learning_question_id
    WHERE q.user_id=? AND r.id IN (SELECT value FROM json_each(?))`).bind(uid, JSON.stringify(candidates.map(q => q.revisionId))).all<{ id: string; text: string }>()).results : [];
  const text = new Map(rows.map(r => [r.id, r.text]));
  const context: Context = { ...stage, questions: snapshot.questions, attemptIds: snapshot.events.map(e => e.id), catalog: candidates.map(q => {
    const events = snapshot.byQuestion.get(q.id!) || [];
    return { id: q.id!, topicId: q.topicId, text: text.get(q.revisionId!) || '', attempts: events.length,
      correct: events.filter(e => e.result === 'correct').length, confirmed: q.confirmationStatus === 'confirmed', hasCorrectAnswer: !q.missingCorrectAnswer };
  }) };
  // Stay below D1's row/value limit, including multi-byte Chinese text; never drop questions silently.
  const encoder = new TextEncoder();
  for (let length = 80; encoder.encode(JSON.stringify(context)).length > 1800000 && length >= 0; length = length ? Math.floor(length / 2) : -1)
    context.catalog.forEach(q => { q.text = q.text.slice(0, length); });
  if (encoder.encode(JSON.stringify(context)).length > 1800000) throw new PracticeError(422, '此科分析資料超過儲存上限，請先整理題庫');
  return context;
}
async function readContext(db: D1Database, uid: string, id: string) {
  const report = await getAnalysis(db, uid, id);
  if (report.expired) throw new PracticeError(410, '這份報告的詳細資料已到期，請產生新報告');
  const row = await db.prepare(`SELECT c.context_json FROM analysis_report_contexts c JOIN analysis_reports r ON r.id=c.report_id WHERE r.user_id=? AND r.id=?`)
    .bind(uid, id).first<{ context_json: string }>();
  return { report, context: row ? JSON.parse(row.context_json) as Context : null };
}
async function retrieve(db: D1Database, uid: string, context: Context, stats: AnalysisStats, ai: AIService, question?: string) {
  if (!context.catalog.length) return [];
  const selected = await ai.selectAnalysisQuestions({ stats, catalog: context.catalog, previousReport: context.previousReport, changes: context.changes, ...(question ? { question } : {}) });
  // Providers are replaceable; enforce access and size here as well as in the Gemini adapter.
  if (!Array.isArray(selected) || selected.length > 30 || selected.some(id => !context.catalog.some(q => q.id === id))) throw Error('Invalid retrieval IDs');
  const evidence = await analysisEvidence(db, uid, { stats, questions: context.questions, byQuestion: new Map() }, selected,
    new Map(context.catalog.map(q => [q.id, q])), context.attemptIds);
  return evidence;
}
export async function runAnalysis(db: D1Database, uid: string, id: string, ai: AIService) {
  const { report, context } = await readContext(db, uid, id);
  if (report.status === 'complete') return report;
  if (!context) throw new PracticeError(409, '請產生新報告以使用整科分析');
  await prepareCycleRun(db, uid, id);
  const token = crypto.randomUUID(), now = new Date().toISOString(), lease = new Date(Date.now() + 240000).toISOString();
  const [claim] = await db.batch([db.prepare(`UPDATE analysis_report_contexts SET run_token=? WHERE report_id=? AND EXISTS
    (SELECT 1 FROM analysis_reports r WHERE r.id=report_id AND r.user_id=? AND r.status IN ('pending','failed') AND (r.status='failed' OR run_token IS NULL OR r.lease_until<?))`)
    .bind(token, id, uid, now),
    db.prepare(`UPDATE analysis_reports SET status='pending',error=NULL,lease_until=? WHERE id=? AND user_id=?
    AND EXISTS(SELECT 1 FROM analysis_report_contexts WHERE report_id=? AND run_token=?)`).bind(lease, id, uid, id, token)]);
  if (!claim.meta.changes) return getAnalysis(db, uid, id);
  try {
    const evidence = await retrieve(db, uid, context, report.stats, ai);
    const result = await ai.analyzeLearning({ stats: report.stats, evidence, catalogQuestions: context.catalog.length, previousReport: context.previousReport });
    const interpretation = validateInterpretation(result.interpretation, evidence, report.stats);
    await db.batch([db.prepare(`UPDATE analysis_reports SET status='complete',evidence_json=?,interpretation_json=?,model_version=?,error=NULL
      WHERE id=? AND user_id=? AND status='pending' AND EXISTS(SELECT 1 FROM analysis_report_contexts WHERE report_id=? AND run_token=?)`)
      .bind(JSON.stringify(evidence), JSON.stringify(interpretation), result.model, id, uid, id, token), completeCycleStatement(db, uid, id, token)]);
  } catch (error) {
    console.warn('[Analysis] Generation failed', { name: error instanceof Error ? error.name : 'unknown' });
    await db.prepare(`UPDATE analysis_reports SET status='failed',error='AI 解讀未完成，統計仍可查看；請手動重試'
      WHERE id=? AND user_id=? AND status='pending' AND EXISTS(SELECT 1 FROM analysis_report_contexts WHERE report_id=? AND run_token=?)`).bind(id, uid, id, token).run();
  }
  return getAnalysis(db, uid, id);
}
type FollowupRow = { id: string; question: string; status: AnalysisFollowup['status']; answer_json: string | null; evidence_json: string | null; created_at: string; error: string | null; lease_until: string; request_hash: string };
function present(row: FollowupRow): AnalysisFollowup {
  const stalled = row.status === 'pending' && Date.parse(row.lease_until) < Date.now();
  return { id: row.id, question: row.question, status: stalled ? 'failed' : row.status, answer: row.answer_json ? JSON.parse(row.answer_json) : null,
    evidence: row.evidence_json ? JSON.parse(row.evidence_json) : [], createdAt: row.created_at, error: stalled ? '上次回答未完成，可重試' : row.error };
}
export function validateReply(raw: unknown, evidence: AnalysisEvidence[]): AnalysisReply {
  const answer = raw as AnalysisReply;
  if (!answer || typeof answer.text !== 'string' || !answer.text.trim() || answer.text.length > 12000 || !Array.isArray(answer.evidenceIds) ||
    answer.evidenceIds.length > 60 || answer.evidenceIds.some(id => !evidence.some(e => e.id === id))) throw Error('Invalid answer citations');
  return { text: answer.text.trim(), evidenceIds: [...new Set(answer.evidenceIds)] };
}
export async function listFollowups(db: D1Database, uid: string, reportId: string) {
  const { report } = await readContext(db, uid, reportId);
  if (report.status !== 'complete') return [];
  const rows = (await db.prepare('SELECT * FROM analysis_followups WHERE user_id=? AND report_id=? ORDER BY created_at,id LIMIT 80').bind(uid, reportId).all<FollowupRow>()).results;
  return rows.map(present);
}
export async function answerFollowup(db: D1Database, uid: string, reportId: string, body: { id?: unknown; question?: unknown }, ai: AIService) {
  if (typeof body?.id !== 'string' || !/^[\w-]{1,100}$/.test(body.id) || typeof body.question !== 'string' || !body.question.trim() || body.question.length > 2000)
    throw new PracticeError(422, '請輸入 2,000 字以內的追問與有效請求 ID');
  const { report, context } = await readContext(db, uid, reportId);
  if (report.status !== 'complete') throw new PracticeError(409, '請等報告完成後再追問');
  const question = body.question.trim(), hash = await digest({ reportId, question }), now = new Date().toISOString();
  const existing = await db.prepare('SELECT * FROM analysis_followups WHERE id=? AND user_id=? AND report_id=?').bind(body.id, uid, reportId).first<FollowupRow>();
  if (existing && existing.request_hash !== hash) throw new PracticeError(409, '同一請求 ID 不可修改問題');
  if (existing?.status === 'complete' || existing?.status === 'pending' && existing.lease_until >= now) return present(existing);
  const history = await listFollowups(db, uid, reportId);
  if (!existing && history.length >= 80) throw new PracticeError(422, '這份報告已達追問上限，請產生新報告');
  const token = crypto.randomUUID(), lease = new Date(Date.now() + 240000).toISOString();
  await db.prepare("UPDATE analysis_followups SET status='failed',error='上次回答未完成，可重試' WHERE user_id=? AND report_id=? AND status='pending' AND lease_until<?").bind(uid, reportId, now).run();
  // An active partial unique index serializes conversations, preventing two turns from forking the history.
  const claim = existing ? await db.prepare(`UPDATE analysis_followups SET status='pending',run_token=?,lease_until=?,error=NULL WHERE id=? AND user_id=? AND status='failed'
    AND NOT EXISTS(SELECT 1 FROM analysis_followups WHERE user_id=? AND report_id=? AND status='pending')`).bind(token, lease, body.id, uid, uid, reportId).run()
    : await db.prepare(`INSERT OR IGNORE INTO analysis_followups(id,user_id,report_id,question,request_hash,status,run_token,created_at,lease_until)
      SELECT ?,?,?,?,?,'pending',?,?,? WHERE NOT EXISTS(SELECT 1 FROM analysis_followups WHERE user_id=? AND report_id=? AND status='pending')`)
      .bind(body.id, uid, reportId, question, hash, token, now, lease, uid, reportId).run();
  if (!claim.meta.changes) throw new PracticeError(409, '另一則追問正在回答，請稍後再試');
  try {
    const extra = context ? await retrieve(db, uid, context, report.stats, ai, question) : [];
    const evidence = [...new Map([...report.evidence, ...extra].map(e => [e.id, e])).values()];
    const result = await ai.followupLearning({ stats: report.stats, interpretation: report.interpretation, evidence,
      history: history.filter(h => h.status === 'complete').slice(-6).map(h => ({ question: h.question, answer: h.answer })), question });
    const answer = validateReply(result.answer, evidence);
    await db.prepare(`UPDATE analysis_followups SET status='complete',answer_json=?,evidence_json=?,model_version=?,error=NULL WHERE id=? AND user_id=? AND run_token=? AND status='pending'
      AND EXISTS(SELECT 1 FROM analysis_reports WHERE id=? AND detail_expires_at>?)`)
      .bind(JSON.stringify(answer), JSON.stringify(evidence.filter(e => answer.evidenceIds.includes(e.id))), result.model, body.id, uid, token, reportId, new Date().toISOString()).run();
  } catch (error) {
    console.warn('[Analysis] Followup failed', { name: error instanceof Error ? error.name : 'unknown' });
    await db.prepare("UPDATE analysis_followups SET status='failed',error='回答未完成，可手動重試' WHERE id=? AND user_id=? AND run_token=? AND status='pending'").bind(body.id, uid, token).run();
  }
  const row = await db.prepare('SELECT * FROM analysis_followups WHERE id=? AND user_id=? AND report_id=?').bind(body.id, uid, reportId).first<FollowupRow>();
  if (!row) throw new PracticeError(404, '報告或題目已移除');
  return present(row);
}
