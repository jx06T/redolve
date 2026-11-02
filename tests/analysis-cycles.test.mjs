import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';

async function load(file) {
  const { outputFiles } = await build({ entryPoints: [file], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
}
const learning = await load('worker/services/learningQuestions.ts'), practice = await load('worker/services/practice.ts');
const cycles = await load('worker/services/analysisCycles.ts'), analysis = await load('worker/services/personalAnalysis.ts'), context = await load('worker/services/analysisContext.ts');
const scope = { subjectId: 'math' };
const data = () => ({ content: { ocrText: '請計算結果', questionType: 'calculation', options: [], correctAnswer: { kind: 'text', text: '3' } }, personal: { originalAnswer: null, errorReasons: [] } });

test('subject summaries enforce meaningful stages, retries and receipt boundaries', async t => {
  await mkdir('.wrangler/qa', { recursive: true });
  const dir = await mkdtemp(resolve('.wrangler/qa/cycles-'));
  const mf = new Miniflare({ script: 'export default {fetch(){return new Response("test")}}', modules: true, compatibilityDate: '2025-04-01', d1Databases: ['DB'], d1Persist: dir });
  try {
    const db = await mf.getD1Database('DB');
    const sql = async text => { for (const q of unstable_splitSqlQuery(text.replace(/^\s*--[^\r\n]*$/gm, ''))) await db.exec(q.replace(/\r?\n/g, ' ')); };
    await sql(await readFile('worker/schema.sql', 'utf8'));
    await sql(`INSERT INTO users(id,email) VALUES('alice','a@test'),('bob','b@test');
      INSERT INTO taxonomies(id,label,level) VALUES('math','數學',0),('legacy','舊報告科目',0),('outside','範圍外',0);
      INSERT INTO taxonomies(id,label,level,user_id) VALUES('private','私人科目',0,'bob');
      INSERT INTO assets(id,storage_key) VALUES('image','image');
      INSERT INTO items(id,user_id,image_url,status,topic_id) VALUES('q1','alice','image','unsolved','math'),('q2','alice','image','unsolved','math'),('foreign','bob','image','unsolved','math'),('legacy-q','alice','image','unsolved','legacy'),('noise','alice','image','unsolved','outside');
      INSERT INTO collections(id,owner_id,title,public_name,visibility,lifecycle) VALUES('co','bob','集合','作者','public','active');
      INSERT INTO collection_items(id,collection_id,source_item_id,contributor_id,origin_item_key) VALUES('entry','co','foreign','bob','foreign');
      INSERT INTO saved_refs(id,user_id,entry_id,personal_topic_id,classification_state) VALUES('saved','alice','entry','math','manual');
      INSERT INTO saved_snapshots(id,saved_ref_id,image_asset_id,source_title,collection_title,provider_public_name,source_text,source_content_seq,source_shared_seq) VALUES('snap','saved','image','保留題目','集合','作者','保留文字',1,0);
      UPDATE saved_refs SET current_snapshot_id='snap' WHERE id='saved';`);
    const ref = { kind: 'owned', itemId: 'q1' }, savedRef = { kind: 'saved', savedRefId: 'saved' };
    const save = async (reference, value) => { const q = await learning.readLearningQuestion(db, 'alice', reference); return learning.saveLearningQuestion(db, 'alice', reference, { expectedRowVersion: q.rowVersion, expectedSourceVersion: q.sourceVersion, data: value }, 'user'); };
    let q = await save(ref, data()); const saved = await save(savedRef, data());
    const attempt = (question, id, extra = {}) => ({ id, questionId: question.id, revisionId: question.revisionId, sessionId: 'session', sessionItemId: id, answer: { kind: 'text', text: '2' }, selfResult: 'incorrect', clientAnsweredAt: '2000-01-01T00:00:00.000Z', clientTimezone: 'UTC', usedOriginalImage: false, ...extra });
    const original = attempt(q, 'original'); await practice.submitAttempt(db, 'alice', original);
    let selectionCalls = 0, reportCalls = 0, fail = false, lastInput;
    const ai = {
      selectAnalysisQuestions: async input => { selectionCalls++; return input.catalog.map(q => q.id); },
      analyzeLearning: async input => { reportCalls++; lastInput = input; if (fail) throw Error('Simulated provider failure'); return { model: 'fake', interpretation: { overview: '根據階段資料整理', findings: [{ title: '比較條件', explanation: '依據原題安排複習', evidenceIds: [input.evidence[0].id], metricIds: ['subject'] }] } }; },
    };
    let baseline;
    await t.test('first baseline is account scoped and concurrent work has one claim', async () => {
      assert.equal((await cycles.analysisEligibility(db, 'alice', scope)).reason, 'first');
      assert.equal((await cycles.analysisEligibility(db, 'bob', scope)).reason, 'no_questions');
      await assert.rejects(() => cycles.analysisEligibility(db, 'alice', { subjectId: 'private' }), /選擇科目/);
      const work = await Promise.all([cycles.beginCycleAnalysis(db, 'alice', scope), cycles.beginCycleAnalysis(db, 'alice', scope)]);
      assert.equal(work[0].id, work[1].id); assert.equal(work.filter(w => w.created).length, 1);
      assert.equal((await cycles.analysisEligibility(db, 'alice', scope)).reason, 'in_progress');
      await Promise.all([context.runAnalysis(db, 'alice', work[0].id, ai), context.runAnalysis(db, 'alice', work[0].id, ai)]);
      baseline = await analysis.getAnalysis(db, 'alice', work[0].id);
      assert.equal(baseline.status, 'complete'); assert.equal(baseline.stats.cycle.kind, 'baseline'); assert.equal(baseline.stats.attempts, 1);
      assert.equal(baseline.stats.questions, 3); assert.equal(selectionCalls, 1); assert.equal(reportCalls, 1);
      const state = await db.prepare('SELECT * FROM analysis_subject_state WHERE user_id=? AND subject_id=?').bind('alice', 'math').first();
      assert.ok(state.last_completed_at >= baseline.createdAt); assert.equal(state.active_report_id, null);
      await assert.rejects(() => analysis.getAnalysis(db, 'bob', baseline.id), /找不到/);
    });
    await t.test('confirmation, metadata and identical revisions do not unlock a report', async () => {
      await learning.confirmLearningQuestion(db, 'alice', ref, q.rowVersion, q.sourceVersion);
      q = await save(ref, data());
      await db.exec("UPDATE items SET source='更名',keywords='[\"新標籤\"]' WHERE id='q1'");
      const status = await cycles.analysisEligibility(db, 'alice', scope);
      assert.equal(status.reason, 'no_changes'); assert.deepEqual(status.changes, { newQuestions: 0, updatedQuestions: 0, newAttempts: 0, correctedAttempts: 0 });
      assert.equal((await cycles.beginCycleAnalysis(db, 'alice', scope)).id, baseline.id);
      assert.equal(reportCalls, 1);
    });
    await t.test('new work, late offline work and corrected outcomes have separate counts', async () => {
      const correction = { ...original, id: 'replacement', revisionId: q.revisionId, supersedesAttemptId: original.id, selfResult: 'correct' };
      await practice.submitAttempt(db, 'alice', correction);
      const asOfBaseline = await analysis.analysisSnapshot(db, 'alice', scope, 30, 'UTC', { from: '1970-01-01T00:00:00.000Z', cutoff: baseline.stats.cutoff, boundaryIds: [] });
      assert.equal(asOfBaseline.events[0].id, original.id, 'a later correction must not remove work effective at the cutoff');
      assert.equal((await cycles.analysisEligibility(db, 'alice', scope)).changes.newAttempts, 0);
      await practice.submitAttempt(db, 'alice', attempt(saved, 'late-offline'));
      const changed = data(); changed.personal.errorReasons = [{ text: '忽略條件', origin: 'ai', accepted: true }]; changed.personal.correctionSummary = '訂正時補上條件';
      q = await save(ref, changed);
      await save({ kind: 'owned', itemId: 'q2' }, data());
      const status = await cycles.analysisEligibility(db, 'alice', scope);
      assert.equal(status.reason, 'cooldown'); assert.deepEqual(status.changes, { newQuestions: 1, updatedQuestions: 1, newAttempts: 1, correctedAttempts: 1 });
      await assert.rejects(() => cycles.beginCycleAnalysis(db, 'alice', scope), /下次可產生/);
      const before = (await analysis.getAnalysis(db, 'alice', baseline.id)).stats;
      assert.deepEqual(before, baseline.stats, 'old statistics are immutable');
    });
    let next;
    await t.test('failed generation retries its frozen stage without restarting the interval', async () => {
      await db.prepare('UPDATE analysis_subject_state SET last_completed_at=? WHERE user_id=? AND subject_id=?').bind(new Date(Date.now() - 4 * 86400000).toISOString(), 'alice', 'math').run();
      assert.equal((await cycles.analysisEligibility(db, 'alice', scope)).reason, 'ready');
      next = await cycles.beginCycleAnalysis(db, 'alice', scope, 'Asia/Taipei');
      fail = true; assert.equal((await context.runAnalysis(db, 'alice', next.id, ai)).status, 'failed');
      const status = await cycles.analysisEligibility(db, 'alice', scope); assert.equal(status.reason, 'retry'); assert.equal(status.canGenerate, true);
      assert.equal((await cycles.beginCycleAnalysis(db, 'alice', scope)).id, next.id);
      fail = false;
      const calls = reportCalls;
      await Promise.all([context.runAnalysis(db, 'alice', next.id, ai), context.runAnalysis(db, 'alice', next.id, ai)]);
      const report = await analysis.getAnalysis(db, 'alice', next.id);
      assert.equal(report.status, 'complete'); assert.equal(reportCalls, calls + 1);
      assert.equal(report.stats.attempts, 1, 'a prior attempt correction is not new practice');
      assert.equal(report.stats.cycle.changes.correctedAttempts, 1);
      assert.equal(lastInput.previousReport.id, baseline.id); assert.ok(lastInput.previousReport.interpretation);
      assert.ok(lastInput.evidence.flatMap(e => e.recentAttempts).some(a => a.id === 'replacement'));
      assert.ok(lastInput.evidence.flatMap(e => e.recentAttempts).some(a => a.id === 'late-offline'));
      assert.equal(report.stats.comparison, undefined);
      assert.equal((await cycles.analysisEligibility(db, 'alice', scope)).reason, 'no_changes');
    });
    await t.test('receipt boundary includes unseen IDs in the same millisecond exactly once', async () => {
      const state = await db.prepare("SELECT last_cutoff_at,boundary_json FROM analysis_subject_state WHERE user_id='alice' AND subject_id='math'").first();
      // An event that arrives later but carries the exact cutoff millisecond must not be skipped.
      await db.prepare(`INSERT INTO practice_attempts(id,user_id,learning_question_id,revision_id,session_id,session_item_id,answer_json,result,grading_method,grading_basis_json,
        client_answered_at,answered_at,received_at,client_timezone,time_quality,used_original_image,request_hash)
        VALUES('boundary','alice',?,?,'boundary','boundary','null','incorrect','self','{}',?,?,?,'UTC','client',0,'boundary')`)
        .bind(q.id, q.revisionId, state.last_cutoff_at, state.last_cutoff_at, state.last_cutoff_at).run();
      const status = await cycles.analysisEligibility(db, 'alice', scope); assert.equal(status.changes.newAttempts, 1);
      const window = { from: state.last_cutoff_at, cutoff: new Date().toISOString(), boundaryIds: JSON.parse(state.boundary_json) };
      const snapshot = await analysis.analysisSnapshot(db, 'alice', scope, 30, 'UTC', window);
      assert.equal(snapshot.stats.attempts, 1); assert.equal(snapshot.events[0].id, 'boundary');
      await db.prepare("UPDATE analysis_subject_state SET last_completed_at='2000-01-01' WHERE user_id='alice' AND subject_id='math'").run();
      const work = await cycles.beginCycleAnalysis(db, 'alice', scope); await context.runAnalysis(db, 'alice', work.id, ai);
      assert.equal((await cycles.analysisEligibility(db, 'alice', scope)).changes.newAttempts, 0);
    });
    await t.test('expired previous details fall back to numeric context and stages can exceed 90 days', async () => {
      const state = await db.prepare("SELECT last_report_id FROM analysis_subject_state WHERE user_id='alice' AND subject_id='math'").first();
      await db.prepare("UPDATE analysis_reports SET detail_expires_at='2000-01-01' WHERE id=?").bind(state.last_report_id).run(); await analysis.cleanupAnalysis(db);
      await db.prepare("UPDATE analysis_subject_state SET last_completed_at='2000-01-01',last_cutoff_at=? WHERE user_id='alice' AND subject_id='math'").bind(new Date(Date.now() - 120 * 86400000).toISOString()).run();
      const work = await cycles.beginCycleAnalysis(db, 'alice', scope); const report = await context.runAnalysis(db, 'alice', work.id, ai);
      assert.equal(report.status, 'complete'); assert.ok(report.stats.days > 90);
      assert.equal(lastInput.previousReport.detailsAvailable, false); assert.equal(lastInput.previousReport.interpretation, null); assert.ok(lastInput.previousReport.stats);
      assert.equal((await db.prepare('SELECT days FROM analysis_reports WHERE id=?').bind(work.id).first()).days, 30, 'legacy storage field stays compatible; stage metadata has actual dates');
    });
    await t.test('legacy complete reports initialize a baseline without regeneration', async () => {
      await save({ kind: 'owned', itemId: 'legacy-q' }, data());
      const legacy = await analysis.beginAnalysis(db, 'alice', { subjectId: 'legacy' }, 15); await context.runAnalysis(db, 'alice', legacy.id, ai);
      const status = await cycles.analysisEligibility(db, 'alice', { subjectId: 'legacy' });
      assert.equal(status.reason, 'no_changes'); assert.equal(status.latestReportId, legacy.id);
      assert.equal((await cycles.beginCycleAnalysis(db, 'alice', { subjectId: 'legacy' })).id, legacy.id);
    });
    await t.test('moving the same material to another subject cannot reuse a foreign-scope hash', async () => {
      await sql(`INSERT INTO taxonomies(id,label,level) VALUES('stage-a','甲科',0),('stage-b','乙科',0);
        INSERT INTO items(id,user_id,image_url,status,topic_id) VALUES('relocate','alice','image','unsolved','stage-a');`);
      await save({ kind: 'owned', itemId: 'relocate' }, data());
      const first = await cycles.beginCycleAnalysis(db, 'alice', { subjectId: 'stage-a' }); await context.runAnalysis(db, 'alice', first.id, ai);
      await db.exec("UPDATE items SET topic_id='stage-b' WHERE id='relocate'");
      const second = await cycles.beginCycleAnalysis(db, 'alice', { subjectId: 'stage-b' });
      assert.notEqual(first.id, second.id); assert.equal((await analysis.getAnalysis(db, 'alice', second.id)).stats.scope.subjectId, 'stage-b');
    });
    await t.test('indexed eligibility reads do not grow with unrelated attempt history', async () => {
      const noise = await save({ kind: 'owned', itemId: 'noise' }, data());
      const seed = async (start, end) => db.prepare(`WITH RECURSIVE n(x) AS (SELECT ? UNION ALL SELECT x+1 FROM n WHERE x<?)
        INSERT INTO practice_attempts(id,user_id,learning_question_id,revision_id,session_id,session_item_id,answer_json,result,grading_method,grading_basis_json,
        client_answered_at,answered_at,received_at,client_timezone,time_quality,used_original_image,request_hash)
        SELECT 'noise-'||x,'alice',?,?,'noise','noise-'||x,'null','incorrect','self','{}',?,?,?,'UTC','client',0,'noise' FROM n`)
        .bind(start, end, noise.id, noise.revisionId, new Date().toISOString(), new Date().toISOString(), new Date().toISOString()).run();
      const measure = async () => {
        let reads = 0;
        const wrap = stmt => new Proxy(stmt, { get(target, key) { if (key === 'bind') return (...args) => wrap(target.bind(...args)); if (['all', 'first', 'run'].includes(key)) return async (...args) => { if (key === 'first') { const r = await target.all(); reads += r.meta.rows_read; return args[0] ? r.results[0]?.[args[0]] : r.results[0] || null; } const r = await target[key](...args); reads += r.meta.rows_read; return r; }; return target[key]; } });
        await cycles.analysisEligibility({ prepare: (...args) => wrap(db.prepare(...args)), batch: async statements => { const rows = await db.batch(statements); reads += rows.reduce((n, r) => n + r.meta.rows_read, 0); return rows; } }, 'alice', scope);
        return reads;
      };
      await seed(1, 1000); const small = await measure(); await seed(1001, 10000); const large = await measure();
      assert.ok(large <= small + 10, JSON.stringify({ small, large })); t.diagnostic('Eligibility rows_read: ' + JSON.stringify({ small, large }));
    });
    await t.test('source deletion clears derived reports and does not count as new learning', async () => {
      await db.exec("DELETE FROM saved_refs WHERE id='saved'");
      assert.equal((await db.prepare("SELECT count(*) n FROM analysis_reports WHERE subject_id='math'").first()).n, 0);
      assert.equal((await cycles.analysisEligibility(db, 'alice', scope)).reason, 'no_changes');
      await db.exec("DELETE FROM users WHERE id='alice'");
      assert.equal((await db.prepare('SELECT count(*) n FROM analysis_subject_state').first()).n, 0);
    });
  } finally { await mf.dispose(); await rm(dir, { recursive: true, force: true }); }
});
