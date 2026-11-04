import type { AnalysisCandidateFinding, AnalysisCatalogEntry, AnalysisErrorTagCount, AIService } from './ai/AIService';
import { aiFailureDiagnostic,aiFailureMessage } from './ai/providerError';
import type { AnalysisErrorReason, AnalysisEvidence, AnalysisFollowup, AnalysisReply, AnalysisStats, PreviousAnalysisContext } from '../../src/types/analysis';
import type { ScopeQuestion } from './practice';
import { digest, PracticeError } from './practice';
import { analysisEvidence, getAnalysis, validateInterpretation } from './personalAnalysis';
import { completeCycleStatement, prepareCycleRun } from './analysisCycles';
import { classifyErrorReason } from './errorTagConfig';
import { weaknessTrends } from './weaknessTrends';
import type { WeaknessTrend } from '../../src/types/weakness';

interface StageContext { previousReport?: PreviousAnalysisContext; changes?: { newQuestionIds: string[]; updatedQuestionIds: string[]; practicedQuestionIds: string[] } }
interface Context extends StageContext { catalog: AnalysisCatalogEntry[]; questions: ScopeQuestion[]; attemptIds: string[]; catalogPreviewLimited?: boolean; errorTagCounts?: AnalysisErrorTagCount[]; weaknessTrends?: WeaknessTrend[] }
export async function buildAnalysisContext(db: D1Database, uid: string, snapshot: Parameters<typeof weaknessTrends>[2], stage: StageContext = {}): Promise<Context> {
  const candidates = snapshot.questions.filter(q => q.id && q.revisionId && q.prepared);
  const [rows, weak] = await Promise.all([candidates.length ? db.prepare(`SELECT r.id,substr(json_extract(r.content_json,'$.ocrText'),1,160) text,
    substr(json_extract(r.personal_json,'$.correctionSummary'),1,220) correctionDigest,
    (SELECT json_group_array(json_object('index',e.key,'text',substr(e.value->>'$.text',1,301),'origin',e.value->>'$.origin','accepted',e.value->>'$.accepted'))
      FROM json_each(r.personal_json,'$.errorReasons') e) reasons,
    COALESCE(i.keywords,ss.source_tags) tags
    FROM learning_question_revisions r JOIN learning_questions q ON q.id=r.learning_question_id
    LEFT JOIN items i ON i.id=q.item_id AND i.user_id=q.user_id
    LEFT JOIN saved_refs s ON s.id=q.saved_ref_id AND s.user_id=q.user_id
    LEFT JOIN saved_snapshots ss ON ss.id=substr(r.source_version,1,instr(r.source_version,':')-1) AND ss.saved_ref_id=s.id
    WHERE q.user_id=? AND r.id IN (SELECT value FROM json_each(?))`).bind(uid, JSON.stringify(candidates.map(q => q.revisionId)))
    .all<{ id: string; text: string; correctionDigest: string | null; reasons: string; tags: string | null }>().then(result => result.results) : [],
    weaknessTrends(db, uid, snapshot)]);
  const byRevision = new Map(rows.map(r => [r.id, r]));
  const errorTagCounts = new Map<string, AnalysisErrorTagCount>();
  const context: Context = { ...stage, questions: snapshot.questions, attemptIds: (snapshot.stats.cycle ? snapshot.contextEvents : snapshot.events).map(e => e.id), catalog: candidates.map((q): AnalysisCatalogEntry => {
    const row = byRevision.get(q.revisionId!);
    if (!row) throw new PracticeError(409, '題目已變更，請重新產生分析');
    const events = snapshot.byQuestion.get(q.id!) || [];
    const reasons = (JSON.parse(row.reasons) as { index: number; text: string; origin: AnalysisErrorReason['origin']; accepted: number | null }[])
      .sort((a, b) => a.index - b.index);
    const errorTags = reasons.flatMap(({ text, index: reasonIndex }) => {
      const tag = text.length <= 300 ? classifyErrorReason(text) : undefined;
      return tag ? [{ ...tag, reasonIndex }] : [];
    });
    const adoptedCodes = new Set(errorTags.filter(tag => {
      const reason = reasons[tag.reasonIndex];
      return reason.origin === 'user' || reason.accepted === 1;
    }).map(tag => tag.code));
    for (const { code, label } of new Map(errorTags.map(tag => [tag.code, tag])).values()) {
      const count = errorTagCounts.get(code) ?? { code, label, adoptedQuestions: 0, pendingQuestions: 0 };
      if (adoptedCodes.has(code)) count.adoptedQuestions++;
      else count.pendingQuestions++;
      errorTagCounts.set(code, count);
    }
    const errorReasons = reasons.slice(0, 4).map(({ text, origin, accepted }) => ({ text: text.slice(0, 96), origin,
      ...(accepted === null ? {} : { accepted: accepted === 1 }) }));
    let tags: string[] = [];
    try {
      const raw: unknown = JSON.parse(row.tags || '[]');
      if (Array.isArray(raw)) tags = raw.filter((tag): tag is string => typeof tag === 'string').slice(0, 8).map(tag => tag.slice(0, 60));
    } catch { /* Older keyword data may not be JSON. */ }
    return { id: q.id!, topicId: q.topicId, text: row.text || '', attempts: events.length,
      correct: events.filter(e => e.result === 'correct').length, confirmed: q.confirmationStatus === 'confirmed', hasCorrectAnswer: !q.missingCorrectAnswer,
      ...(tags.length ? { tags } : {}), ...(row.correctionDigest ? { correctionDigest: row.correctionDigest } : {}),
      ...(errorReasons.length ? { errorReasons } : {}), ...(errorTags.length ? { errorTags } : {}),
      ...(weak.correctionIds.has(q.id!) ? { confirmedWeaknessIds: weak.correctionIds.get(q.id!) } : {}),
      ...(weak.attempts.has(q.id!) ? { weaknessReviews: weak.attempts.get(q.id!) } : {}) };
  }) };
  if (weak.trends.length) context.weaknessTrends = weak.trends;
  if (errorTagCounts.size) context.errorTagCounts = [...errorTagCounts.values()];
  // Stay below D1's row/value limit, including multi-byte Chinese text; never drop questions silently.
  const encoder = new TextEncoder();
  for (const length of [80, 40, 0]) {
    if (encoder.encode(JSON.stringify(context)).length <= 1800000) break;
    context.catalogPreviewLimited = true;
    for (const entry of context.catalog) {
      entry.text = entry.text.slice(0, length);
      if (length) {
        if (entry.correctionDigest) entry.correctionDigest = entry.correctionDigest.slice(0, length);
        entry.errorReasons?.forEach(reason => { reason.text = reason.text.slice(0, length); });
      } else {
        delete entry.correctionDigest;
        delete entry.errorReasons;
        delete entry.tags;
        delete entry.errorTags;
        delete entry.weaknessReviews;
      }
    }
  }
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
  if (!context.catalog.length) return { evidence: [], candidateFindings: [] };
  const selection = await ai.selectAnalysisQuestions({ stats, catalog: context.catalog, catalogPreviewLimited: context.catalogPreviewLimited,
    errorTagCounts: context.errorTagCounts, weaknessTrends: context.weaknessTrends, previousReport: context.previousReport, changes: context.changes, ...(question ? { question } : {}) });
  const catalog = new Map(context.catalog.map(q => [q.id, q]));
  if (!Array.isArray(selection?.questionIds) || selection.questionIds.length > 30 || selection.questionIds.some(id => !catalog.has(id))) throw Error('Invalid retrieval IDs');
  const selected = [...new Set(selection.questionIds)];
  const hypotheses = question ? [] : selection.candidateFindings ?? [];
  const candidateFindings = validateCandidateFindings(hypotheses, new Set(selected));
  const evidence = await analysisEvidence(db, uid, { stats, questions: context.questions, byQuestion: new Map() }, selected, catalog, context.attemptIds);
  const loaded = new Set(evidence.map(entry => entry.id));
  return { evidence, candidateFindings: candidateFindings.filter(finding => finding.supportingQuestionIds.every(id => loaded.has(id))) };
}

function validateCandidateFindings(raw: unknown, selected: Set<string>): AnalysisCandidateFinding[] {
  if (!Array.isArray(raw) || raw.length > 12) throw Error('Invalid candidate findings');
  return raw.map(finding => {
    if (typeof finding?.topic !== 'string' || !finding.topic.trim() || finding.topic.length > 160 ||
      typeof finding.rationale !== 'string' || !finding.rationale.trim() || finding.rationale.length > 600 ||
      !Array.isArray(finding.supportingQuestionIds) || finding.supportingQuestionIds.length === 0 ||
      finding.supportingQuestionIds.length > 30 || finding.supportingQuestionIds.some((id: string) => !selected.has(id))) throw Error('Invalid candidate findings');
    return { topic: finding.topic.trim(), rationale: finding.rationale.trim(), supportingQuestionIds: [...new Set<string>(finding.supportingQuestionIds)] };
  });
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
    const { evidence, candidateFindings } = await retrieve(db, uid, context, report.stats, ai);
    const result = await ai.analyzeLearning({ stats: report.stats, evidence, catalogQuestions: context.catalog.length,
      catalogPreviewLimited: context.catalogPreviewLimited, errorTagCounts: context.errorTagCounts, weaknessTrends: context.weaknessTrends, previousReport: context.previousReport, candidateFindings });
    const interpretation = validateInterpretation(result.interpretation, evidence, report.stats);
    await db.batch([db.prepare(`UPDATE analysis_reports SET status='complete',evidence_json=?,interpretation_json=?,model_version=?,error=NULL
      WHERE id=? AND user_id=? AND status='pending' AND EXISTS(SELECT 1 FROM analysis_report_contexts WHERE report_id=? AND run_token=?)`)
      .bind(JSON.stringify(evidence), JSON.stringify(interpretation), result.model, id, uid, id, token), completeCycleStatement(db, uid, id, token)]);
  } catch (error) {
    console.warn('[Analysis] Generation failed', aiFailureDiagnostic(error));
    await db.prepare(`UPDATE analysis_reports SET status='failed',error=?
      WHERE id=? AND user_id=? AND status='pending' AND EXISTS(SELECT 1 FROM analysis_report_contexts WHERE report_id=? AND run_token=?)`).bind(aiFailureMessage(error,'AI 解讀未完成，統計仍可查看；請手動重試'),id, uid, id, token).run();
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
    const extra = context ? (await retrieve(db, uid, context, report.stats, ai, question)).evidence : [];
    const evidence = [...new Map([...report.evidence, ...extra].map(e => [e.id, e])).values()];
    const result = await ai.followupLearning({ stats: report.stats, interpretation: report.interpretation, evidence, weaknessTrends: context?.weaknessTrends,
      history: history.filter(h => h.status === 'complete').slice(-6).map(h => ({ question: h.question, answer: h.answer })), question });
    const answer = validateReply(result.answer, evidence);
    await db.prepare(`UPDATE analysis_followups SET status='complete',answer_json=?,evidence_json=?,model_version=?,error=NULL WHERE id=? AND user_id=? AND run_token=? AND status='pending'
      AND EXISTS(SELECT 1 FROM analysis_reports WHERE id=? AND detail_expires_at>?)`)
      .bind(JSON.stringify(answer), JSON.stringify(evidence.filter(e => answer.evidenceIds.includes(e.id))), result.model, body.id, uid, token, reportId, new Date().toISOString()).run();
  } catch (error) {
    console.warn('[Analysis] Followup failed', aiFailureDiagnostic(error));
    await db.prepare("UPDATE analysis_followups SET status='failed',error=? WHERE id=? AND user_id=? AND run_token=? AND status='pending'").bind(aiFailureMessage(error,'回答未完成，可手動重試'),body.id, uid, token).run();
  }
  const row = await db.prepare('SELECT * FROM analysis_followups WHERE id=? AND user_id=? AND report_id=?').bind(body.id, uid, reportId).first<FollowupRow>();
  if (!row) throw new PracticeError(404, '報告或題目已移除');
  return present(row);
}
