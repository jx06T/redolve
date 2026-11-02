import type { AnalysisEvidence, AnalysisInterpretation, AnalysisReport, AnalysisStats } from '../../src/types/analysis';
import type { PracticeScope } from '../../src/types/practice';
import { ANALYSIS_PERIOD_DAYS } from '../../src/types/learning';
import { PracticeError, digest, scopeStatement, scopeTopics } from './practice';
import type { ScopeQuestion } from './practice';
import { buildAnalysisContext } from './analysisContext';

interface Event { id: string; learning_question_id: string; result: string; grading_method: string; used_original_image: number; answered_at: string; topicId: string }
export async function analysisSnapshot(db: D1Database, uid: string, scope: PracticeScope, days: number, timezone = 'UTC') {
  if (!ANALYSIS_PERIOD_DAYS.some(d => d === days)) throw new PracticeError(422, '請選擇 7、15、30、60 或 90 天');
  let dateFormatter: Intl.DateTimeFormat;
  try { dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }); }
  catch { throw new PracticeError(422, '時區不正確'); }
  const topics = await scopeTopics(db, uid, scope), cutoff = new Date().toISOString(), from = new Date(Date.now() - days * 86400000).toISOString(), previousFrom = new Date(Date.parse(from) - days * 86400000).toISOString();
  const results = await db.batch([
    scopeStatement(db, uid, topics.ids, true, 2001),
    db.prepare(`SELECT p.id,p.learning_question_id,p.result,p.grading_method,p.used_original_image,p.answered_at,sc.topicId
      FROM (SELECT q.id,i.topic_id topicId FROM items i JOIN learning_questions q ON q.item_id=i.id AND q.user_id=i.user_id
        WHERE i.user_id=? AND i.topic_id IN (SELECT value FROM json_each(?))
        UNION ALL SELECT q.id,s.personal_topic_id FROM saved_refs s JOIN learning_questions q ON q.saved_ref_id=s.id AND q.user_id=s.user_id
        WHERE s.user_id=? AND s.personal_topic_id IN (SELECT value FROM json_each(?))) sc
      CROSS JOIN practice_attempts p INDEXED BY idx_practice_latest
      WHERE p.user_id=? AND p.learning_question_id=sc.id AND p.answered_at>=? AND p.answered_at<=? AND p.received_at<=? AND p.voided_at IS NULL
      ORDER BY p.answered_at,p.received_at,p.id LIMIT 20001`)
      .bind(uid, JSON.stringify(topics.ids), uid, JSON.stringify(topics.ids), uid, previousFrom, cutoff, cutoff),
  ]);
  const questions = results[0].results as unknown as ScopeQuestion[], allEvents = results[1].results as unknown as Event[];
  const events = allEvents.filter(e => e.answered_at >= from), previous = allEvents.filter(e => e.answered_at < from);
  if (questions.length > 2000) throw new PracticeError(422, '此科超過目前 2,000 題的分析上限；縮短期間不會排除舊題');
  if (allEvents.length > 20000 || events.length > 10000 || previous.length > 10000) throw new PracticeError(422, '本期或前期超過 10,000 筆作答，請縮短期間');
  const units = topics.ids.map(id => ({ id, label: topics.labels[id], questions: 0, attempts: 0, correct: 0, automatic: 0, self: 0, viewedImage: 0 }));
  const byTopic = new Map(units.map(u => [u.id, u])), byQuestion = new Map<string, Event[]>();
  for (const q of questions) byTopic.get(q.topicId)!.questions++;
  for (const e of events) {
    const u = byTopic.get(e.topicId)!; u.attempts++; u.correct += e.result === 'correct' ? 1 : 0;
    u.automatic += e.grading_method === 'automatic' ? 1 : 0; u.self += e.grading_method === 'self' ? 1 : 0; u.viewedImage += e.used_original_image;
    const questionEvents = byQuestion.get(e.learning_question_id) || []; questionEvents.push(e); byQuestion.set(e.learning_question_id, questionEvents);
  }
  const repeated = [...byQuestion.values()].filter(es => es.length >= 2);
  const daily = new Map<string, { date: string; attempts: number; correct: number; automatic: number; self: number }>();
  for (const event of events) {
    const date = dateFormatter.format(new Date(event.answered_at));
    const point = daily.get(date) || { date, attempts: 0, correct: 0, automatic: 0, self: 0 };
    point.attempts++; point.correct += event.result === 'correct' ? 1 : 0;
    point.automatic += event.grading_method === 'automatic' ? 1 : 0; point.self += event.grading_method === 'self' ? 1 : 0;
    daily.set(date, point);
  }
  const previousIds = new Set(previous.map(e => e.learning_question_id)), matched = new Set(events.filter(e => previousIds.has(e.learning_question_id)).map(e => e.learning_question_id));
  const previousMatched = previous.filter(e => matched.has(e.learning_question_id)), currentMatched = events.filter(e => matched.has(e.learning_question_id));
  const stats: AnalysisStats = { scope: { subjectId: scope.subjectId, ...(scope.topicId ? { topicId: scope.topicId } : {}) }, days, from, cutoff,
    questions: questions.length, prepared: questions.filter(q => q.prepared).length, confirmed: questions.filter(q => q.confirmationStatus === 'confirmed').length,
    comparison: { from: previousFrom, cutoff: from, attempts: previous.length, correct: previous.filter(e => e.result === 'correct').length,
      automatic: previous.filter(e => e.grading_method === 'automatic').length, self: previous.filter(e => e.grading_method === 'self').length,
      viewedImage: previous.filter(e => e.used_original_image).length, matchedQuestions: matched.size,
      previousMatchedAttempts: previousMatched.length, previousMatchedCorrect: previousMatched.filter(e => e.result === 'correct').length,
      currentMatchedAttempts: currentMatched.length, currentMatchedCorrect: currentMatched.filter(e => e.result === 'correct').length },
    timezone, aiRecognized: questions.filter(q => q.revisionId && q.confirmationStatus === 'ai').length,
    withoutRevision: questions.filter(q => !q.revisionId).length, missingCorrectAnswer: questions.filter(q => q.missingCorrectAnswer).length,
    missingOriginalAnswer: questions.filter(q => q.missingOriginalAnswer).length,
    sources: { owned: questions.filter(q => q.itemId).length, saved: questions.filter(q => q.savedRefId).length }, daily: [...daily.values()],
    attempts: events.length, correct: events.filter(e => e.result === 'correct').length, automatic: events.filter(e => e.grading_method === 'automatic').length,
    self: events.filter(e => e.grading_method === 'self').length, viewedImage: events.filter(e => e.used_original_image).length,
    repeatedQuestions: repeated.length, changedToCorrect: repeated.filter(es => es[0].result === 'incorrect' && es.at(-1)!.result === 'correct').length,
    changedToIncorrect: repeated.filter(es => es[0].result === 'correct' && es.at(-1)!.result === 'incorrect').length, units: units.filter(u => u.questions || u.attempts) };
  return { stats, questions, events, byQuestion, previous };
}
export async function analysisEvidence(db: D1Database, uid: string, snapshot: Pick<Awaited<ReturnType<typeof analysisSnapshot>>, 'stats' | 'questions' | 'byQuestion'>, selectedIds?: string[], counts?: Map<string, { attempts: number; correct: number }>, frozenAttemptIds?: string[]) {
  // Representative sample, balanced across units; repeated errors first within a unit.
  const candidates = snapshot.questions.filter(q => q.id && q.revisionId && q.prepared && (!selectedIds || selectedIds.includes(q.id))).sort((a, b) =>
    (snapshot.byQuestion.get(b.id!)?.filter(e => e.result === 'incorrect').length || 0) - (snapshot.byQuestion.get(a.id!)?.filter(e => e.result === 'incorrect').length || 0));
  const groups = new Map<string, ScopeQuestion[]>(); for (const q of candidates) { const group = groups.get(q.topicId) || []; group.push(q); groups.set(q.topicId, group); }
  const picked: ScopeQuestion[] = [];
  while (picked.length < 30 && [...groups.values()].some(g => g.length)) for (const g of groups.values()) { if (g.length && picked.length < 30) picked.push(g.shift()!); }
  if (!picked.length) return [];
  const [revisionRows, attemptRows] = await db.batch([db.prepare(`SELECT r.id,r.learning_question_id,r.content_json,r.personal_json FROM learning_question_revisions r
    JOIN learning_questions q ON q.id=r.learning_question_id WHERE q.user_id=? AND r.id IN (SELECT value FROM json_each(?))`)
    .bind(uid, JSON.stringify(picked.map(q => q.revisionId))),
    db.prepare(`SELECT * FROM (SELECT p.id,p.learning_question_id,p.revision_id,p.answer_json,p.result,p.grading_method,p.answered_at,p.used_original_image,
      json_extract(r.content_json,'$.correctAnswer') correct_answer,json_extract(r.content_json,'$.options') option_json,
      ROW_NUMBER() OVER(PARTITION BY p.learning_question_id ORDER BY p.answered_at DESC,p.received_at DESC,p.id DESC) rn
      FROM practice_attempts p JOIN learning_question_revisions r ON r.id=p.revision_id
      JOIN learning_questions q ON q.id=p.learning_question_id AND q.user_id=p.user_id
      WHERE p.user_id=? AND p.learning_question_id IN (SELECT value FROM json_each(?))
      AND p.answered_at>=? AND p.answered_at<=? AND p.received_at<=?
      AND ${frozenAttemptIds ? 'p.id IN (SELECT value FROM json_each(?))' : 'p.voided_at IS NULL'}) WHERE rn<=5`)
      .bind(uid, JSON.stringify(picked.map(q => q.id)), snapshot.stats.from, snapshot.stats.cutoff, snapshot.stats.cutoff, ...(frozenAttemptIds ? [JSON.stringify(frozenAttemptIds)] : [])),
  ]);
  const rows = revisionRows.results as { id: string; learning_question_id: string; content_json: string; personal_json: string }[];
  const attemptSample = attemptRows.results as { id: string; learning_question_id: string; revision_id: string; answer_json: string; correct_answer: string | null; option_json: string;
    result: string; grading_method: string; answered_at: string; used_original_image: number }[];
  const evidence: AnalysisEvidence[] = [];
  const shortAnswer = (value: unknown) => {
    const answer = value as { kind?: string; text?: unknown } | null;
    return answer?.kind === 'text' && typeof answer.text === 'string' ? { kind: 'text', text: answer.text.slice(0, 1000) } : value;
  };
  const describe = (raw: unknown, options: { id: string; label: string; text: string }[]) => {
    const value = raw as { kind?: string; text?: string; optionIds?: string[] } | null;
    return !value ? '' : value.kind === 'text' ? value.text?.slice(0,1000) || '' : (value.optionIds || []).map(id => {
      const option = options.find(o => o.id === id); return option ? `${option.label} ${option.text.slice(0,300)}` : id;
    }).join('；').slice(0,1000);
  };
  for (const q of picked) {
    const row = rows.find(r => r.id === q.revisionId); if (!row) throw new PracticeError(409, '題目已變更，請重新產生分析');
    const content = JSON.parse(row.content_json), personal = JSON.parse(row.personal_json), events = snapshot.byQuestion.get(q.id!) || [];
    evidence.push({ id: q.id!, ref: q.itemId ? { kind: 'owned', itemId: q.itemId } : { kind: 'saved', savedRefId: q.savedRefId! },
      revisionId: row.id, topicId: q.topicId, text: [content.ocrText, ...content.options.map((o: { label: string; text: string }) => `${o.label} ${o.text}`)].join('\n').slice(0, 3000),
      originalAnswer: shortAnswer(personal.originalAnswer), correctAnswer: shortAnswer(content.correctAnswer),
      errorReasons: personal.errorReasons.slice(0, 3).map((r: { text: string; origin: string }) => ({ ...r, text: r.text.slice(0, 300) })),
      attempts: counts?.get(q.id!)?.attempts ?? events.length, correct: counts?.get(q.id!)?.correct ?? events.filter(e => e.result === 'correct').length, confirmationStatus: q.confirmationStatus,
      options: content.options.map((o: { id: string; label: string; text: string }) => ({ id: o.id, label: o.label, text: o.text.slice(0,500) })),
      recentAttempts: attemptSample.filter(a => a.learning_question_id === q.id).reverse().map(a => ({ id: a.id, revisionId: a.revision_id,
        answer: shortAnswer(JSON.parse(a.answer_json)), correctAnswer: shortAnswer(a.correct_answer ? JSON.parse(a.correct_answer) : null), result: a.result,
        answerDisplay: describe(JSON.parse(a.answer_json), JSON.parse(a.option_json || '[]')),
        correctAnswerDisplay: describe(a.correct_answer ? JSON.parse(a.correct_answer) : null, JSON.parse(a.option_json || '[]')),
        gradingMethod: a.grading_method, answeredAt: a.answered_at, usedOriginalImage: !!a.used_original_image })),
    });
    if (new TextEncoder().encode(JSON.stringify(evidence)).length > 120000) { evidence.pop(); break; }
  }
  return evidence;
}
export function validateInterpretation(raw: unknown, evidence: AnalysisEvidence[], stats: AnalysisStats): AnalysisInterpretation {
  const value = raw as AnalysisInterpretation;
  if (!value || !Array.isArray(value.findings) || value.findings.length > Math.max(10, evidence.length * 3)) throw Error('Invalid analysis response');
  const evidenceIds = new Set(evidence.map(e => e.id)), metrics = new Set(['subject', ...stats.units.map(u => u.id)]);
  if (value.overview !== undefined && (typeof value.overview !== 'string' || value.overview.length > 6000)) throw Error('Invalid overview');
  return { ...(value.overview ? { overview: value.overview.trim() } : {}), findings: value.findings.map(f => {
    if (typeof f.title !== 'string' || !f.title.trim() || f.title.length > 160 || typeof f.explanation !== 'string' || f.explanation.length > 3000 ||
      !Array.isArray(f.evidenceIds) || f.evidenceIds.length > 30 || f.evidenceIds.some(id => !evidenceIds.has(id)) ||
      !Array.isArray(f.metricIds) || (!f.evidenceIds.length && !f.metricIds.length) || f.metricIds.some(id => !metrics.has(id))) throw Error('Invalid analysis evidence');
    return { title: f.title.trim(), explanation: f.explanation.trim(), evidenceIds: [...new Set(f.evidenceIds)], metricIds: [...new Set(f.metricIds)] };
  }) };
}
export async function cleanupAnalysis(db: D1Database) {
  // Scheduled in bounded chunks; also run before report reads as a fallback.
  const now = new Date().toISOString();
  const expired = (await db.prepare(`SELECT id FROM analysis_reports WHERE detail_expires_at<=? AND (evidence_json IS NOT NULL OR interpretation_json IS NOT NULL) LIMIT 100`).bind(now).all<{ id: string }>()).results.map(r => r.id);
  if (!expired.length) return 0;
  const result = await db.batch([
    db.prepare('DELETE FROM analysis_report_contexts WHERE report_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(expired)),
    db.prepare('DELETE FROM analysis_followups WHERE report_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(expired)),
    db.prepare('UPDATE analysis_reports SET evidence_json=NULL,interpretation_json=NULL WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(expired)),
  ]);
  return result[2].meta.changes;
}
export async function beginAnalysis(db: D1Database, uid: string, scope: PracticeScope, days: number, timezone = 'UTC', model = 'gemini-3.1-pro-preview') {
  if (scope?.topicId) throw new PracticeError(422, '分析以整科為單位，請移除單元範圍');
  const subject = await db.prepare('SELECT id FROM taxonomies WHERE id=? AND parent_id IS NULL AND (user_id IS NULL OR user_id=?)').bind(scope?.subjectId ?? '', uid).first();
  if (!subject) throw new PracticeError(422, '請選擇科目');
  const snapshot = await analysisSnapshot(db, uid, scope, days, timezone), evidence: AnalysisEvidence[] = [];
  const hash = await digest({ scope: snapshot.stats.scope, days, timezone, model, questions: snapshot.questions, events: snapshot.events, previous: snapshot.previous, prompt: 'subject-v3' });
  const now = new Date().toISOString();
  await db.prepare(`UPDATE analysis_reports SET status='failed',error='上次產生未完成，可手動重試' WHERE user_id=? AND input_hash=? AND status='pending' AND lease_until<?`).bind(uid, hash, now).run();
  await db.prepare(`UPDATE analysis_reports SET input_hash='expired:'||id WHERE user_id=? AND input_hash=? AND detail_expires_at<=?`).bind(uid, hash, now).run();
  const id = crypto.randomUUID(), lease = new Date(Date.now() + 240000).toISOString(), expires = new Date(Date.now() + 90 * 86400000).toISOString();
  const statements = [db.prepare(`INSERT OR IGNORE INTO analysis_reports(id,user_id,subject_id,topic_id,days,input_hash,status,stats_json,evidence_json,prompt_version,created_at,detail_expires_at,lease_until)
    VALUES(?,?,?,?,?,?,'pending',?,?,'subject-v3',?,?,?)`).bind(id, uid, scope.subjectId, scope.topicId ?? null, days, hash, JSON.stringify(snapshot.stats), JSON.stringify(evidence), now, expires, lease),
    db.prepare(`INSERT INTO analysis_report_questions(report_id,source_key,item_id,saved_ref_id,revision_id)
    SELECT ?,json_extract(value,'$.key'),json_extract(value,'$.item'),json_extract(value,'$.saved'),json_extract(value,'$.revision')
    FROM json_each(?) WHERE EXISTS(SELECT 1 FROM analysis_reports WHERE id=? AND user_id=?)`)
      .bind(id, JSON.stringify(snapshot.questions.map(q => ({ key: q.itemId ? `owned:${q.itemId}` : `saved:${q.savedRefId}`, item: q.itemId, saved: q.savedRefId, revision: q.revisionId }))), id, uid)];
  const context = await buildAnalysisContext(db, uid, snapshot);
  statements.push(db.prepare('INSERT INTO analysis_report_contexts(report_id,context_json) SELECT ?,? WHERE EXISTS(SELECT 1 FROM analysis_reports WHERE id=? AND user_id=?)')
    .bind(id, JSON.stringify(context), id, uid));
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
    model: row.model_version,
    error: stalled ? '上次產生未完成，可手動重試' : row.error };
}
