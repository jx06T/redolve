import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Bindings, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { authorizedImage } from '../services/authorizedImage';
import { PracticeError, createPractice, presentAttempt, submitAttempt } from '../services/practice';
import type { AttemptInput, AttemptReply } from '../../src/types/practice';
import { appendWeaknessReview, createWeakness, listWeaknesses, questionWeaknessSubject, readWeaknessReview, weaknessContext, weaknessIdsAllowed } from '../services/weaknesses';
import { createAIService } from '../services/ai';
import { LearningError, readLearningQuestion } from '../services/learningQuestions';

export const practiceRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
practiceRouter.use('*', authMiddleware);
practiceRouter.use('*', async (c, next) => c.env.PRACTICE_ENABLED === 'true' ? next() : c.json({ error: { message: '練習功能尚未開放' } }, 404));
practiceRouter.use('*', bodyLimit({ maxSize: 1000000 }));
practiceRouter.onError((error, c) => {
  if (error instanceof PracticeError) return c.json({ error: { message: error.message } }, error.status);
  if (error instanceof LearningError) return c.json({ error: { message: error.message } }, error.status);
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
practiceRouter.get('/weaknesses', async c => {
  const { kind, id } = c.req.query(), uid = c.get('userId');
  if (!id || id.length > 200 || (kind !== 'owned' && kind !== 'saved')) throw new PracticeError(422, '請選擇個人題目');
  const subjectId = await questionWeaknessSubject(c.env.DB, uid, kind === 'owned' ? { kind, itemId: id } : { kind, savedRefId: id });
  if (!subjectId) throw new PracticeError(404, '找不到有科目分類的個人題目');
  return c.json({ subjectId, items: await listWeaknesses(c.env.DB, uid, subjectId) });
});
practiceRouter.post('/weaknesses', async c => {
  const body = await c.req.json().catch(() => null);
  if (typeof body?.subjectId !== 'string' || body.subjectId.length > 200 || typeof body.title !== 'string' || !body.title.trim() || body.title.length > 100 ||
    typeof body.target !== 'string' || !body.target.trim() || body.target.length > 240) throw new PracticeError(422, '請提供弱點名稱及可驗證的動作');
  const result = await createWeakness(c.env.DB, c.get('userId'), body.subjectId, body.title.trim(), body.target.trim());
  if (!result) throw new PracticeError(422, '找不到科目，或這科已達個人弱點上限');
  return c.json(result);
});
practiceRouter.post('/weaknesses/suggestions', async c => {
  const body = await c.req.json().catch(() => null), uid = c.get('userId');
  if (typeof body?.id !== 'string' || body.id.length > 200 || (body.kind !== 'owned' && body.kind !== 'saved') ||
    typeof body.notes !== 'string' || body.notes.length > 600 || !Array.isArray(body.excluded) || body.excluded.length > 20 ||
    body.excluded.some((value: unknown) => typeof value !== 'string' || value.length > 1000) ||
    (body.attemptId !== undefined && (typeof body.attemptId !== 'string' || body.attemptId.length > 100))) throw new PracticeError(422, '弱點建議資料格式不正確');
  if (!c.env.GEMINI_API_KEY || !c.env.UPLOAD_LIMITER) return c.json({ error: { message: '目前無法取得 AI 建議' } }, 503);
  if (!(await c.env.UPLOAD_LIMITER.limit({ key: `weakness:${uid}` })).success) return c.json({ error: { message: '建議過於頻繁，請稍後再試' } }, 429);
  const ref = body.kind === 'owned' ? { kind: 'owned' as const, itemId: body.id } : { kind: 'saved' as const, savedRefId: body.id };
  const question = await readLearningQuestion(c.env.DB, uid, ref);
  let current = { content: question.content, personal: question.personal };
  let attemptAnswer: unknown;
  if (body.attemptId) {
    const row = await c.env.DB.prepare(`SELECT p.answer_json,r.content_json,r.personal_json FROM practice_attempts p
      JOIN learning_question_revisions r ON r.id=p.revision_id WHERE p.id=? AND p.user_id=? AND p.learning_question_id=? AND p.result='incorrect' AND p.voided_at IS NULL`)
      .bind(body.attemptId, uid, question.id).first<{ answer_json: string; content_json: string; personal_json: string }>();
    if (!row) throw new PracticeError(404, '請先同步這筆答錯紀錄');
    current = { content: JSON.parse(row.content_json), personal: JSON.parse(row.personal_json) };
    attemptAnswer = JSON.parse(row.answer_json);
  }
  const items = await createAIService(c.env).suggestWeaknesses({ current, ...await weaknessContext(c.env.DB, uid, ref, current),
    notes: body.notes, excluded: body.excluded, saved: ref.kind === 'saved', reviewOfAttempt: !!body.attemptId, attemptAnswer });
  return c.json({ items });
});
practiceRouter.get('/attempts/:id/weaknesses', async c => {
  const row = await readWeaknessReview(c.env.DB, c.get('userId'), c.req.param('id'));
  if (!row) throw new PracticeError(404, '找不到已同步且有效的答錯紀錄');
  return c.json(row.review);
});
practiceRouter.put('/attempts/:id/weaknesses', async c => {
  const body = await c.req.json().catch(() => null), uid = c.get('userId'), attemptId = c.req.param('id');
  if (body?.userId !== uid || !Number.isSafeInteger(body.version) || body.version < 0 || !Array.isArray(body.ids) ||
    body.ids.length > 12 || body.ids.some((id: unknown) => typeof id !== 'string' || id.length > 100)) throw new PracticeError(422, '弱點選擇或版本不正確');
  const ids = [...new Set<string>(body.ids)].sort();
  const existing = await readWeaknessReview(c.env.DB, uid, attemptId);
  if (!existing) throw new PracticeError(404, '找不到已同步且有效的答錯紀錄');
  if (JSON.stringify(existing.review.ids) === JSON.stringify(ids)) return c.json(existing.review);
  if (existing.review.version !== body.version) throw new PracticeError(409, '這筆弱點已更新，請重新載入');
  if (!await weaknessIdsAllowed(c.env.DB, uid, await questionWeaknessSubject(c.env.DB, uid, existing.ref), ids))
    throw new PracticeError(422, '弱點不屬於這道題目的科目或帳號');
  const result = await appendWeaknessReview(c.env.DB, uid, attemptId, body.version, ids);
  if (!result.meta.changes) {
    const latest = await readWeaknessReview(c.env.DB, uid, attemptId);
    if (latest && JSON.stringify(latest.review.ids) === JSON.stringify(ids)) return c.json(latest.review);
    throw new PracticeError(409, '這筆作答或弱點已更新，請重新載入');
  }
  return c.json({ ids, version: body.version + 1 });
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
