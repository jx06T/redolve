import type { AnalysisEligibility, AnalysisStats, PreviousAnalysisContext } from '../../src/types/analysis';
import type { PracticeScope } from '../../src/types/practice';
import { analysisSnapshot, getAnalysis } from './personalAnalysis';
import { buildAnalysisContext } from './analysisContext';
import { digest, PracticeError, scopeStatement, scopeTopics } from './practice';
import type { ScopeQuestion } from './practice';

export const ANALYSIS_COOLDOWN_MS = 3 * 86400000;
interface Material { key: string; id: string | null; revisionId: string | null; prepared: number }
interface State { last_report_id: string | null; last_cutoff_at: string | null; last_completed_at: string | null; material_json: string; boundary_json: string; active_report_id: string | null }
const materials = (questions: ScopeQuestion[]): Material[] => questions.map(q => ({ key: q.itemId ? `owned:${q.itemId}` : `saved:${q.savedRefId}`, id: q.id, revisionId: q.revisionId, prepared: q.prepared }));

async function inspectCycle(db: D1Database, uid: string, scope: PracticeScope) {
  if (!scope || typeof scope.subjectId !== 'string' || !scope.subjectId || scope.subjectId.length > 200) throw new PracticeError(422, '請選擇科目');
  if (scope?.topicId) throw new PracticeError(422, '分析以整科為單位');
  const subject = await db.prepare('SELECT id FROM taxonomies WHERE id=? AND parent_id IS NULL AND (user_id IS NULL OR user_id=?)').bind(scope?.subjectId || '', uid).first();
  if (!subject) throw new PracticeError(422, '請選擇科目');
  const topics = await scopeTopics(db, uid, scope), cutoff = new Date().toISOString();
  const [stateRows, questionRows] = await db.batch([
    db.prepare('SELECT * FROM analysis_subject_state WHERE user_id=? AND subject_id=?').bind(uid, scope.subjectId),
    scopeStatement(db, uid, topics.ids, true, 2001),
  ]);
  const questions = questionRows.results as unknown as ScopeQuestion[];
  if (questions.length > 2000) throw new PracticeError(422, '此科超過目前 2,000 題的分析上限');
  let state = stateRows.results[0] as unknown as State | undefined;
  if (!state) {
    const legacy = await db.prepare(`SELECT id,created_at,stats_json FROM analysis_reports INDEXED BY idx_analysis_completed_subject
      WHERE user_id=? AND subject_id=? AND status='complete' AND topic_id IS NULL ORDER BY created_at DESC,id DESC LIMIT 1`)
      .bind(uid, scope.subjectId).first<{ id: string; created_at: string; stats_json: string }>();
    const prior = legacy ? (await db.prepare(`SELECT a.source_key key,r.learning_question_id id,a.revision_id revisionId,
      CASE WHEN LENGTH(json_extract(r.content_json,'$.ocrText'))>0 THEN 1 ELSE 0 END prepared
      FROM analysis_report_questions a LEFT JOIN learning_question_revisions r ON r.id=a.revision_id WHERE a.report_id=?`).bind(legacy.id).all<Material>()).results : [];
    state = { last_report_id: legacy?.id || null, last_cutoff_at: legacy ? (JSON.parse(legacy.stats_json) as AnalysisStats).cutoff : null,
      last_completed_at: legacy?.created_at || null, material_json: JSON.stringify(prior), boundary_json: '[]', active_report_id: null };
  }
  const current = materials(questions), prior = new Map((JSON.parse(state.material_json) as Material[]).map(q => [q.key, q]));
  const candidates = current.filter(q => q.prepared && q.id && q.revisionId);
  const newQuestions = candidates.filter(q => !prior.get(q.key)?.prepared);
  const pairs = candidates.filter(q => prior.get(q.key)?.prepared && prior.get(q.key)?.revisionId !== q.revisionId)
    .map(q => ({ id: q.id, current: q.revisionId, previous: prior.get(q.key)!.revisionId }));
  // Compare immutable learning data inside D1. Labels, source counters and confirmation alone do not qualify.
  const reasons = (alias: string) => `(SELECT json_group_array(json_object('text',json_extract(value,'$.text'),'origin',json_extract(value,'$.origin'),'weaknessId',json_extract(value,'$.weaknessId')))
    FROM json_each(${alias}.personal_json,'$.errorReasons') WHERE json_extract(value,'$.origin')='user' OR json_extract(value,'$.accepted')=1)`;
  const changed = pairs.length ? (await db.prepare(`SELECT j.value->>'$.id' id FROM json_each(?) j
    JOIN learning_question_revisions r ON r.id=j.value->>'$.current' JOIN learning_questions q ON q.id=r.learning_question_id AND q.user_id=?
    LEFT JOIN learning_question_revisions b ON b.id=j.value->>'$.previous' AND b.learning_question_id=q.id
    WHERE b.id IS NULL OR r.content_json IS NOT b.content_json
      OR json_extract(r.personal_json,'$.originalAnswer') IS NOT json_extract(b.personal_json,'$.originalAnswer')
      OR COALESCE(json_extract(r.personal_json,'$.correctionSummary'),'') != COALESCE(json_extract(b.personal_json,'$.correctionSummary'),'')
      OR ${reasons('r')} IS NOT ${reasons('b')}`).bind(JSON.stringify(pairs), uid).all<{ id: string }>()).results : [];
  const from = state.last_cutoff_at || '1970-01-01T00:00:00.000Z';
  const questionIds = current.filter(q => q.id).map(q => q.id);
  const receipts = questionIds.length ? (await db.prepare(`SELECT learning_question_id id,
    SUM(CASE WHEN p.supersedes_attempt_id IS NULL THEN 1 ELSE 0 END) newAttempts,
    SUM(CASE WHEN p.supersedes_attempt_id IS NOT NULL THEN 1 ELSE 0 END) correctedAttempts
    FROM (SELECT p.learning_question_id,p.supersedes_attempt_id FROM json_each(?) j CROSS JOIN practice_attempts p INDEXED BY idx_practice_received
    WHERE p.user_id=? AND p.learning_question_id=j.value AND p.received_at>=? AND p.received_at<=?
      AND (p.received_at>? OR p.id NOT IN (SELECT value FROM json_each(?)))
      AND (p.supersedes_attempt_id IS NULL OR p.voided_at IS NULL OR p.voided_at>?) LIMIT 20001) p GROUP BY learning_question_id`)
    .bind(JSON.stringify(questionIds), uid, from, cutoff, from, state.boundary_json, cutoff).all<{ id: string; newAttempts: number; correctedAttempts: number }>()).results : [];
  const reviewed = state.last_cutoff_at && questionIds.length ? (await db.prepare(`SELECT DISTINCT w.attempt_id,w.learning_question_id id
    FROM json_each(?) j CROSS JOIN practice_weakness_reviews w INDEXED BY idx_practice_weakness_scope
    JOIN practice_attempts p ON p.id=w.attempt_id AND p.user_id=w.user_id
    WHERE w.user_id=? AND w.learning_question_id=j.value AND w.recorded_at>? AND w.recorded_at<=?
    AND (p.voided_at IS NULL OR p.voided_at>?) LIMIT 10001`).bind(JSON.stringify(questionIds), uid, from, cutoff, cutoff).all<{ id: string }>()).results : [];
  if (reviewed.length > 10000) throw new PracticeError(422, '此階段弱點標記超過分析上限');
  const changes = { newQuestions: newQuestions.length, updatedQuestions: changed.length,
    ...(reviewed.length ? { reviewedAttempts: reviewed.length } : {}),
    newAttempts: receipts.reduce((n, row) => n + row.newAttempts, 0), correctedAttempts: receipts.reduce((n, row) => n + row.correctedAttempts, 0) };
  if (changes.newAttempts + changes.correctedAttempts > 20000) throw new PracticeError(422, '此階段作答資料超過分析上限，請聯絡管理員協助處理');
  const active = state.active_report_id ? await db.prepare('SELECT id,status,lease_until,detail_expires_at FROM analysis_reports WHERE user_id=? AND id=?')
    .bind(uid, state.active_report_id).first<{ id: string; status: string; lease_until: string; detail_expires_at: string }>() : null;
  const usableActive = active && active.status !== 'complete' && Date.parse(active.detail_expires_at) > Date.now() ? active : null;
  const availableAt = state.last_completed_at ? new Date(Date.parse(state.last_completed_at) + ANALYSIS_COOLDOWN_MS).toISOString() : null;
  const reason: AnalysisEligibility['reason'] = usableActive ? usableActive.status === 'pending' && Date.parse(usableActive.lease_until) > Date.now() ? 'in_progress' : 'retry'
    : !candidates.length ? 'no_questions' : !state.last_cutoff_at ? 'first'
    : !Object.values(changes).some(Boolean) ? 'no_changes' : availableAt && Date.parse(availableAt) > Date.now() ? 'cooldown' : 'ready';
  const status: AnalysisEligibility = { canGenerate: ['first', 'ready', 'retry'].includes(reason), reason, availableAt,
    latestReportId: state.last_report_id, activeReportId: usableActive?.id || null, baselineCutoff: state.last_cutoff_at, changes };
  return { state, status, cutoff, material: current, changedIds: changed.map(q => q.id), newIds: newQuestions.map(q => q.id!), receiptIds: [...new Set([...receipts, ...reviewed].map(q => q.id))] };
}

export async function analysisEligibility(db: D1Database, uid: string, scope: PracticeScope) { return (await inspectCycle(db, uid, scope)).status; }

export async function beginCycleAnalysis(db: D1Database, uid: string, scope: PracticeScope, timezone = 'UTC', model = 'gemini-3.1-pro-preview') {
  const inspected = await inspectCycle(db, uid, scope), { state, status, cutoff } = inspected;
  if (status.activeReportId) return { id: status.activeReportId, created: false };
  if (status.reason === 'no_changes' && status.latestReportId) return { id: status.latestReportId, created: false };
  if (!status.canGenerate) throw new PracticeError(status.reason === 'no_questions' ? 422 : 409,
    status.reason === 'cooldown' ? `下次可產生總結的時間：${status.availableAt}` : status.reason === 'no_questions' ? '請先整理至少一道可分析的題目' : '尚無實質新資料，可繼續查看上一份報告');
  const from = state.last_cutoff_at || '1970-01-01T00:00:00.000Z';
  const snapshot = await analysisSnapshot(db, uid, scope, 30, timezone, { from, cutoff, boundaryIds: JSON.parse(state.boundary_json) });
  if (JSON.stringify(materials(snapshot.questions)) !== JSON.stringify(inspected.material)) throw new PracticeError(409, '題目剛剛更新，請重新檢查生成條件');
  if (!state.last_cutoff_at) snapshot.stats.from = snapshot.events.reduce((value, event) => event.root_received_at! < value ? event.root_received_at! : value, cutoff);
  snapshot.stats.days = Math.max(1, Math.ceil((Date.parse(cutoff) - Date.parse(snapshot.stats.from)) / 86400000));
  snapshot.stats.cycle = { kind: state.last_cutoff_at ? 'cycle' : 'baseline', baselineReportId: state.last_report_id,
    from: snapshot.stats.from, cutoff, changes: status.changes };
  let previousReport: PreviousAnalysisContext | undefined;
  if (state.last_cutoff_at) {
    const previous = state.last_report_id ? await getAnalysis(db, uid, state.last_report_id).catch(e => { if (e instanceof PracticeError && e.status === 404) return null; throw e; }) : null;
    const ids = new Set(snapshot.questions.map(q => q.id));
    previousReport = { id: previous?.id || null, cutoff: state.last_cutoff_at, stats: previous?.stats || null, detailsAvailable: !!previous?.interpretation,
      interpretation: previous?.interpretation ? { overview: previous.interpretation.overview?.slice(0, 2000), findings: previous.interpretation.findings.map(f => ({ ...f,
        explanation: f.explanation.slice(0, 300), evidenceIds: f.evidenceIds.filter(id => ids.has(id)),
        practiceQuestionIds: f.practiceQuestionIds?.filter(id => ids.has(id)) })) } : null };
  }
  const context = await buildAnalysisContext(db, uid, snapshot, { previousReport,
    changes: { newQuestionIds: inspected.newIds, updatedQuestionIds: inspected.changedIds, practicedQuestionIds: inspected.receiptIds } });
  const material = materials(snapshot.questions);
  const boundary = [...new Set(snapshot.contextEvents.flatMap(e => [...(e.received_at === cutoff ? [e.id] : []), ...(e.root_received_at === cutoff ? [e.root_id!] : [])]))];
  const hash = await digest({ subjectId: scope.subjectId, stage: state.last_cutoff_at || 'initial', material, attempts: context.attemptIds, timezone, model, prompt: 'subject-cycle-v1' });
  const id = crypto.randomUUID(), expires = new Date(Date.now() + 90 * 86400000).toISOString(), lease = new Date(Date.now() + 240000).toISOString();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO analysis_subject_state(user_id,subject_id,last_report_id,last_cutoff_at,last_completed_at,material_json,boundary_json)
      VALUES(?,?,?,?,?,?,?)`).bind(uid, scope.subjectId, state.last_report_id, state.last_cutoff_at, state.last_completed_at, state.material_json, state.boundary_json),
    db.prepare(`UPDATE analysis_subject_state SET active_report_id=NULL WHERE user_id=? AND subject_id=? AND active_report_id IN
      (SELECT id FROM analysis_reports WHERE detail_expires_at<=?)`).bind(uid, scope.subjectId, cutoff),
    db.prepare(`UPDATE analysis_reports SET input_hash=input_hash||':expired:'||id WHERE user_id=? AND input_hash=? AND detail_expires_at<=?`).bind(uid, hash, cutoff),
    db.prepare(`INSERT OR IGNORE INTO analysis_reports(id,user_id,subject_id,topic_id,days,input_hash,status,stats_json,evidence_json,prompt_version,created_at,detail_expires_at,lease_until)
      SELECT ?,?,?,NULL,30,?,'pending',?,'[]','subject-cycle-v1',?,?,? FROM analysis_subject_state
      WHERE user_id=? AND subject_id=? AND last_report_id IS ? AND last_cutoff_at IS ? AND active_report_id IS NULL`)
      .bind(id, uid, scope.subjectId, hash, JSON.stringify(snapshot.stats), cutoff, expires, lease, uid, scope.subjectId, state.last_report_id, state.last_cutoff_at),
    db.prepare(`INSERT INTO analysis_report_questions(report_id,source_key,item_id,saved_ref_id,revision_id)
      SELECT ?,json_extract(value,'$.key'),json_extract(value,'$.item'),json_extract(value,'$.saved'),json_extract(value,'$.revision') FROM json_each(?)
      WHERE EXISTS(SELECT 1 FROM analysis_reports WHERE id=? AND user_id=?)`).bind(id, JSON.stringify(snapshot.questions.map(q => ({ key: q.itemId ? `owned:${q.itemId}` : `saved:${q.savedRefId}`, item: q.itemId, saved: q.savedRefId, revision: q.revisionId }))), id, uid),
    db.prepare(`INSERT OR IGNORE INTO analysis_report_questions(report_id,source_key,item_id,saved_ref_id,revision_id)
      SELECT ?,a.source_key,a.item_id,a.saved_ref_id,a.revision_id FROM analysis_report_questions a JOIN analysis_reports r ON r.id=a.report_id
      WHERE r.id=? AND r.user_id=? AND EXISTS(SELECT 1 FROM analysis_reports WHERE id=? AND user_id=?)`).bind(id, state.last_report_id, uid, id, uid),
    db.prepare(`INSERT INTO analysis_report_contexts(report_id,context_json) SELECT ?,? WHERE EXISTS(SELECT 1 FROM analysis_reports WHERE id=? AND user_id=?)`)
      .bind(id, JSON.stringify(context), id, uid),
    db.prepare(`INSERT INTO analysis_report_cycles(report_id,kind,baseline_report_id,from_at,cutoff_at,material_json,boundary_json)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM analysis_reports WHERE id=? AND user_id=?)`)
      .bind(id, snapshot.stats.cycle.kind, state.last_report_id, snapshot.stats.from, cutoff, JSON.stringify(material), JSON.stringify(boundary), id, uid),
    db.prepare(`UPDATE analysis_subject_state SET active_report_id=? WHERE user_id=? AND subject_id=? AND EXISTS(SELECT 1 FROM analysis_reports WHERE id=? AND user_id=?)`)
      .bind(id, uid, scope.subjectId, id, uid),
  ]);
  const winner = await db.prepare('SELECT active_report_id,last_report_id FROM analysis_subject_state WHERE user_id=? AND subject_id=?').bind(uid, scope.subjectId).first<{ active_report_id: string | null; last_report_id: string | null }>();
  const winnerId = winner?.active_report_id || winner?.last_report_id;
  if (!winnerId) throw new PracticeError(409, '資料已變更，請重新檢查生成條件');
  return { id: winnerId, created: winnerId === id };
}

export async function prepareCycleRun(db: D1Database, uid: string, id: string) {
  const row = await db.prepare(`SELECT c.report_id,s.active_report_id,s.last_cutoff_at FROM analysis_report_cycles c JOIN analysis_reports r ON r.id=c.report_id
    LEFT JOIN analysis_subject_state s ON s.user_id=r.user_id AND s.subject_id=r.subject_id WHERE r.user_id=? AND r.id=? AND r.status!='complete'`).bind(uid, id).first<{ report_id: string; active_report_id: string | null; last_cutoff_at: string | null }>();
  if (!row) return;
  if (row.active_report_id !== id) throw new PracticeError(409, '已有較新的總結，請查看最新報告');
}

export function completeCycleStatement(db: D1Database, uid: string, id: string, token: string) {
  return db.prepare(`UPDATE analysis_subject_state SET last_report_id=?,last_completed_at=?,last_cutoff_at=(SELECT cutoff_at FROM analysis_report_cycles WHERE report_id=?),
    material_json=(SELECT material_json FROM analysis_report_cycles WHERE report_id=?),boundary_json=(SELECT boundary_json FROM analysis_report_cycles WHERE report_id=?),active_report_id=NULL
    WHERE user_id=? AND active_report_id=? AND EXISTS(SELECT 1 FROM analysis_report_cycles WHERE report_id=?)
    AND EXISTS(SELECT 1 FROM analysis_reports r JOIN analysis_report_contexts c ON c.report_id=r.id WHERE r.id=? AND r.user_id=? AND r.status='complete' AND c.run_token=?)`)
    .bind(id, new Date().toISOString(), id, id, id, uid, id, id, id, uid, token);
}
