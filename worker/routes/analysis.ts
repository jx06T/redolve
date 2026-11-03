import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import type { Context } from 'hono';
import { answerFollowup, listFollowups, runAnalysis } from '../services/analysisContext';
import { analysisOverview } from '../services/analysisOverview';
import { bodyLimit } from 'hono/body-limit';
import type { Bindings, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { PracticeError } from '../services/practice';
import { analysisSnapshot, cleanupAnalysis, getAnalysis } from '../services/personalAnalysis';
import { analysisEligibility, beginCycleAnalysis } from '../services/analysisCycles';
import { createAIService } from '../services/ai';
import { AIProviderError } from '../services/ai/providerError';

export const analysisRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
analysisRouter.use('*', authMiddleware);
analysisRouter.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
analysisRouter.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
analysisRouter.use('*', async (c, next) => c.env.ANALYSIS_ENABLED === 'true' ? next() : c.json({ error: { message: '分析功能尚未開放' } }, 404));
analysisRouter.use('*', bodyLimit({ maxSize: 10000 }));
analysisRouter.onError((e, c) => {
  if (e instanceof PracticeError) return c.json({ error: { message: e.message } }, e.status);
  if (e instanceof AIProviderError) return c.json({error:{code:e.code,message:e.message,retryable:e.diagnostic.retryable}},503);
  console.error('[Analysis] Request failed', { name: e.name });
  return c.json({ error: { message: '分析暫時無法使用，請稍後重試' } }, 503);
});
analysisRouter.post('/stats', async c => {
  const body = await c.req.json().catch(() => null); if (!body) throw new PracticeError(422, '請提供分析範圍');
  return c.json((await analysisSnapshot(c.env.DB, c.get('userId'), body.scope, body.days, body.timezone, undefined, false)).stats);
});
analysisRouter.post('/reports', async c => {
  const body = await c.req.json().catch(() => null); if (!body) throw new PracticeError(422, '請提供分析範圍');
  if (!c.env.GEMINI_API_KEY) return c.json({ error: { message: '目前無法使用 AI，仍可查看統計' } }, 503);
  if (!c.env.UPLOAD_LIMITER || !(await c.env.UPLOAD_LIMITER.limit({ key: `analysis:${c.get('userId')}` })).success)
    return c.json({ error: { message: '產生分析過於頻繁，請稍後再試' } }, 429);
  const work = await beginCycleAnalysis(c.env.DB, c.get('userId'), body.scope, body.timezone, c.env.GEMINI_ANALYSIS_MODEL?.trim() || undefined);
  return c.json(await getAnalysis(c.env.DB, c.get('userId'), work.id), work.created ? 202 : 200);
});
// Keep the response connected while Pro is running: waitUntil alone only gets 30 seconds after response.
function connected<T>(c: Context, action: () => Promise<T>) {
  c.header('Content-Type', 'application/json; charset=UTF-8');
  c.header('Cache-Control', 'no-store');
  return stream(c, async output => {
    await output.write('\n');
    const heartbeat = setInterval(() => { void output.write('\n').catch(() => {}); }, 10000);
    try { await output.write(JSON.stringify({ ok: true, data: await action() })); }
    catch (error) { await output.write(JSON.stringify({ ok: false, error: { message: error instanceof PracticeError ? error.message : '處理未完成，請稍後重試' } })); }
    finally { clearInterval(heartbeat); }
  });
}
async function limitAI(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  if (!c.env.GEMINI_API_KEY) return c.json({ error: { message: '目前無法使用 AI，仍可查看統計' } }, 503);
  if (!c.env.UPLOAD_LIMITER || !(await c.env.UPLOAD_LIMITER.limit({ key: 'analysis:' + c.get('userId') })).success)
    return c.json({ error: { message: '使用 AI 過於頻繁，請稍後再試' } }, 429);
}
analysisRouter.get('/overview', async c => c.json(await analysisOverview(c.env.DB, c.get('userId'), Number(c.req.query('days') || 30))));
analysisRouter.get('/eligibility', async c => c.json(await analysisEligibility(c.env.DB, c.get('userId'), { subjectId: c.req.query('subjectId') || '' })));
analysisRouter.post('/reports/:id/run', async c => {
  const limited = await limitAI(c); if (limited) return limited;
  await getAnalysis(c.env.DB, c.get('userId'), c.req.param('id'));
  return connected(c, () => runAnalysis(c.env.DB, c.get('userId'), c.req.param('id'), createAIService(c.env)));
});
analysisRouter.get('/reports/:id/followups', async c => c.json(await listFollowups(c.env.DB, c.get('userId'), c.req.param('id'))));
analysisRouter.post('/reports/:id/followups', async c => {
  const limited = await limitAI(c); if (limited) return limited;
  const body = await c.req.json().catch(() => null);
  if (!body) throw new PracticeError(422, '請輸入追問');
  await getAnalysis(c.env.DB, c.get('userId'), c.req.param('id'));
  return connected(c, () => answerFollowup(c.env.DB, c.get('userId'), c.req.param('id'), body, createAIService(c.env)));
});
analysisRouter.get('/reports/:id', async c => {
  c.executionCtx.waitUntil(cleanupAnalysis(c.env.DB));
  return c.json(await getAnalysis(c.env.DB, c.get('userId'), c.req.param('id')));
});
analysisRouter.get('/reports/:id/status', async c => {
  const row = await c.env.DB.prepare('SELECT id,status,error,lease_until FROM analysis_reports WHERE user_id=? AND id=?')
    .bind(c.get('userId'), c.req.param('id')).first<{ id: string; status: 'pending' | 'complete' | 'failed'; error: string | null; lease_until: string }>();
  if (!row) throw new PracticeError(404, '找不到分析報告');
  const stalled = row.status === 'pending' && Date.parse(row.lease_until) < Date.now();
  return c.json({ id: row.id, status: stalled ? 'failed' : row.status, error: stalled ? '上次產生未完成，可手動重試' : row.error });
});
analysisRouter.get('/reports', async c => {
  const subject = c.req.query('subjectId'); if (!subject || subject.length > 200) throw new PracticeError(422, '請選擇科目');
  let before = ['9999', 'z']; const cursor = c.req.query('before');
  if (cursor) { try { before = JSON.parse(atob(cursor)); } catch { throw new PracticeError(422, '分頁參數不正確'); } }
  if (!Array.isArray(before) || before.length !== 2 || before.some(v => typeof v !== 'string' || v.length > 100)) throw new PracticeError(422, '分頁參數不正確');
  const days = c.req.query('days'), topic = c.req.query('topicId');
  if (days !== undefined && !['7','15','30','60','90'].includes(days) || topic !== undefined && topic.length > 200) throw new PracticeError(422, '報告範圍不正確');
  const values: (string | number | null)[] = [c.get('userId'), subject, ...before];
  if (days !== undefined) values.push(Number(days)); if (topic !== undefined) values.push(topic || null);
  const rows = (await c.env.DB.prepare(`SELECT id,created_at,status,days,topic_id,json_extract(stats_json,'$.cycle.kind') cycle_kind,
    json_extract(stats_json,'$.cycle.from') cycle_from,json_extract(stats_json,'$.cycle.cutoff') cycle_cutoff FROM analysis_reports WHERE user_id=? AND subject_id=? AND (created_at,id)<(?,?)
    ${days !== undefined ? "AND days=? AND json_extract(stats_json,'$.cycle') IS NULL" : ''} ${topic !== undefined ? 'AND topic_id IS ?' : 'AND topic_id IS NULL'}
    ORDER BY created_at DESC,id DESC LIMIT 21`).bind(...values).all()).results;
  return c.json({ reports: rows.slice(0, 20), nextCursor: rows.length > 20 ? btoa(JSON.stringify([rows[19].created_at, rows[19].id])) : null });
});
