import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Bindings, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { PracticeError } from '../services/practice';
import { analysisSnapshot, beginAnalysis, cleanupAnalysis, getAnalysis, validateInterpretation } from '../services/personalAnalysis';
import { createAIService } from '../services/ai';

export const analysisRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
analysisRouter.use('*', authMiddleware);
analysisRouter.use('*', async (c, next) => c.env.ANALYSIS_ENABLED === 'true' ? next() : c.json({ error: { message: '分析功能尚未開放' } }, 404));
analysisRouter.use('*', bodyLimit({ maxSize: 10000 }));
analysisRouter.onError((e, c) => {
  if (e instanceof PracticeError) return c.json({ error: { message: e.message } }, e.status);
  console.error('[Analysis] Request failed', { name: e.name });
  return c.json({ error: { message: '分析暫時無法使用，請稍後重試' } }, 503);
});
analysisRouter.post('/stats', async c => {
  const body = await c.req.json().catch(() => null); if (!body) throw new PracticeError(422, '請提供分析範圍');
  return c.json((await analysisSnapshot(c.env.DB, c.get('userId'), body.scope, body.days)).stats);
});
analysisRouter.post('/reports', async c => {
  const body = await c.req.json().catch(() => null); if (!body) throw new PracticeError(422, '請提供分析範圍');
  if (!c.env.GEMINI_API_KEY) return c.json({ error: { message: '目前無法使用 AI，仍可查看統計' } }, 503);
  if (!c.env.UPLOAD_LIMITER || !(await c.env.UPLOAD_LIMITER.limit({ key: `analysis:${c.get('userId')}` })).success)
    return c.json({ error: { message: '產生分析過於頻繁，請稍後再試' } }, 429);
  const work = await beginAnalysis(c.env.DB, c.get('userId'), body.scope, body.days);
  if (work.created) {
    const env = c.env, uid = c.get('userId');
    c.executionCtx.waitUntil((async () => {
      try {
        const result = work.evidence.length ? await createAIService(env).analyzeLearning({ stats: work.stats, evidence: work.evidence }) : { interpretation: { findings: [] }, model: 'no-evidence' };
        const interpretation = validateInterpretation(result.interpretation, work.evidence, work.stats);
        await env.DB.prepare(`UPDATE analysis_reports SET status='complete',interpretation_json=?,model_version=?,error=NULL
          WHERE id=? AND user_id=? AND status='pending' AND lease_until>=?`).bind(JSON.stringify(interpretation), result.model, work.id, uid, new Date().toISOString()).run();
      } catch {
        await env.DB.prepare(`UPDATE analysis_reports SET status='failed',error='AI 解讀未完成，統計仍可查看；請手動重試'
          WHERE id=? AND user_id=? AND status='pending'`).bind(work.id, uid).run();
      }
    })());
  }
  return c.json(await getAnalysis(c.env.DB, c.get('userId'), work.id), work.created ? 202 : 200);
});
analysisRouter.get('/reports/:id', async c => {
  c.executionCtx.waitUntil(cleanupAnalysis(c.env.DB));
  return c.json(await getAnalysis(c.env.DB, c.get('userId'), c.req.param('id')));
});
analysisRouter.get('/reports', async c => {
  const subject = c.req.query('subjectId'); if (!subject || subject.length > 200) throw new PracticeError(422, '請選擇科目');
  let before = ['9999', 'z']; const cursor = c.req.query('before');
  if (cursor) { try { before = JSON.parse(atob(cursor)); } catch { throw new PracticeError(422, '分頁參數不正確'); } }
  if (!Array.isArray(before) || before.length !== 2 || before.some(v => typeof v !== 'string' || v.length > 100)) throw new PracticeError(422, '分頁參數不正確');
  const rows = (await c.env.DB.prepare(`SELECT id,created_at,status,days,topic_id FROM analysis_reports WHERE user_id=? AND subject_id=? AND (created_at,id)<(?,?)
    ORDER BY created_at DESC,id DESC LIMIT 21`).bind(c.get('userId'), subject, ...before).all()).results;
  return c.json({ reports: rows.slice(0, 20), nextCursor: rows.length > 20 ? btoa(JSON.stringify([rows[19].created_at, rows[19].id])) : null });
});
