import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Bindings, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { authorizedImage } from '../services/authorizedImage';
import { PracticeError, createPractice, presentAttempt, submitAttempt } from '../services/practice';
import type { AttemptInput, AttemptReply } from '../../src/types/practice';

export const practiceRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
practiceRouter.use('*', authMiddleware);
practiceRouter.use('*', async (c, next) => c.env.PRACTICE_ENABLED === 'true' ? next() : c.json({ error: { message: '練習功能尚未開放' } }, 404));
practiceRouter.use('*', bodyLimit({ maxSize: 1000000 }));
practiceRouter.onError((error, c) => {
  if (error instanceof PracticeError) return c.json({ error: { message: error.message } }, error.status);
  console.error('[Practice] Request failed', { name: error.name });
  return c.json({ error: { message: '練習暫時無法使用，請稍後重試' } }, 503);
});
practiceRouter.post('/sessions', async c => {
  const body = await c.req.json().catch(() => null);
  if (!body) throw new PracticeError(422, '請提供練習範圍');
  return c.json(await createPractice(c.env.DB, c.get('userId'), body.scope, body.count, body.questionIds));
});
practiceRouter.post('/attempts/batch', async c => {
  const body = await c.req.json().catch(() => null);
  if (!Array.isArray(body?.attempts) || body.attempts.length > 50) throw new PracticeError(422, '每次最多同步 50 筆作答');
  if (body.userId !== c.get('userId')) throw new PracticeError(409, '帳號已變更，停止同步');
  const replies: AttemptReply[] = [];
  for (const input of body.attempts as AttemptInput[]) {
    try { replies.push({ id: input?.id, attempt: await submitAttempt(c.env.DB, c.get('userId'), input) }); }
    catch (e) {
      replies.push({ id: input?.id, error: { status: e instanceof PracticeError ? e.status : 503,
        message: e instanceof PracticeError ? e.message : '這筆作答暫時無法同步' } });
    }
  }
  return c.json({ replies });
});
practiceRouter.get('/questions/:id/attempts', async c => {
  const id = c.req.param('id'), uid = c.get('userId');
  if (!await c.env.DB.prepare('SELECT id FROM learning_questions WHERE id=? AND user_id=?').bind(id, uid).first()) throw new PracticeError(404, '找不到題目');
  const cursor = c.req.query('cursor') || '';
  let before = ['9999', '9999', 'z'];
  if (cursor) { try { before = JSON.parse(atob(cursor)); } catch { throw new PracticeError(422, '分頁參數不正確'); } }
  if (!Array.isArray(before) || before.length !== 3 || before.some(v => typeof v !== 'string' || v.length > 200)) throw new PracticeError(422, '分頁參數不正確');
  const rows = (await c.env.DB.prepare(`SELECT * FROM practice_attempts WHERE user_id=? AND learning_question_id=?
    AND (answered_at,received_at,id)<(?,?,?) ORDER BY answered_at DESC,received_at DESC,id DESC LIMIT 51`).bind(uid, id, ...before)
    .all<Record<string, string | number | null>>()).results;
  const page = rows.slice(0, 50), last = page.at(-1);
  return c.json({ attempts: page.map(presentAttempt), nextCursor: rows.length > 50 && last ? btoa(JSON.stringify([last.answered_at, last.received_at, last.id])) : null });
});
practiceRouter.get('/questions/:id/revisions/:revision/image', async c => {
  const asset = await c.env.DB.prepare(`SELECT a.storage_key,a.mime_type FROM learning_questions q
    JOIN learning_question_revisions r ON r.learning_question_id=q.id JOIN learning_revision_asset_refs ar ON ar.revision_id=r.id
    JOIN assets a ON a.id=ar.asset_id AND a.state='ready' WHERE q.user_id=? AND q.id=? AND r.id=?`)
    .bind(c.get('userId'), c.req.param('id'), c.req.param('revision')).first<{ storage_key: string; mime_type: string }>();
  if (!asset) throw new PracticeError(404, '原圖目前不可用');
  const response = await authorizedImage(c, asset.storage_key, asset.mime_type);
  return response || c.json({ error: { message: '原圖目前不可用' } }, 404);
});
