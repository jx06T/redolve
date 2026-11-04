import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Bindings, Variables, TaxonomyNode } from '../types';
import { authMiddleware } from '../middleware/auth';
import { correctionRecognitionModel, createAIService } from '../services/ai';
import { LearningError, confirmLearningQuestion, learningSource, parsePersonalRef, readLearningQuestion, saveLearningQuestion } from '../services/learningQuestions';
import { normalizeRecognition } from '../../src/types/learning';
import { recognizeCorrection } from '../services/correctionRecognition';
import { aiResponse } from '../services/aiResponse';
import { AIProviderError } from '../services/ai/providerError';

export const learningRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
learningRouter.use('*', authMiddleware);
learningRouter.use('*', async (c, next) => {
  if (c.env.LEARNING_ENABLED !== 'true') return c.json({ error: { code: 'FEATURE_DISABLED', message: '辨識資料功能尚未開放' } }, 404);
  return next();
});
learningRouter.use('*', bodyLimit({ maxSize: 2200000 }));
learningRouter.onError((error, c) => {
  if (error instanceof LearningError) return c.json({ error: { code: error.code, message: error.message } }, error.status);
  if (error instanceof AIProviderError) return c.json({error:{code:error.code,message:error.message,retryable:error.diagnostic.retryable}},503);
  console.error('[Learning] Request failed', { name: error.name });
  return c.json({ error: { code: 'LEARNING_UNAVAILABLE', message: '辨識資料暫時無法使用，請稍後重試' } }, 503);
});
const refFromPath = (kind: string, id: string) => parsePersonalRef({ kind, itemId: id, savedRefId: id });

learningRouter.get('/:kind/:id', async c => c.json(await readLearningQuestion(c.env.DB, c.get('userId'),
  refFromPath(c.req.param('kind'), c.req.param('id')))));

learningRouter.patch('/:kind/:id', async c => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw new LearningError(422, 'INVALID_DATA', '請提供題目資料');
  return c.json(await saveLearningQuestion(c.env.DB, c.get('userId'), refFromPath(c.req.param('kind'), c.req.param('id')),
    { expectedRowVersion: body.expectedRowVersion, expectedSourceVersion: body.expectedSourceVersion, data: body.data, correctionId: body.correctionId }, 'user'));
});

learningRouter.post('/:kind/:id/correction', async c => {
  const uid = c.get('userId'), ref = refFromPath(c.req.param('kind'), c.req.param('id'));
  await learningSource(c.env.DB, uid, ref);
  if (!c.env.GEMINI_API_KEY) return c.json({ error: { code: 'AI_UNAVAILABLE', message: '目前無法使用 AI，訂正資料保持不變' } }, 503);
  if (!c.env.UPLOAD_LIMITER || !(await c.env.UPLOAD_LIMITER.limit({ key: `correction:${uid}` })).success)
    return c.json({ error: { code: 'RATE_LIMITED', message: '請稍後再試，訂正資料保持不變' } }, 429);
  const form = await c.req.formData(), image = form.get('image'), sourceIdentity = form.get('sourceIdentity'), notes = form.get('notes') || '';
  if (!(image instanceof File) || image.type !== 'image/jpeg' || image.size > 2000000 || image.size < 3 ||
    typeof sourceIdentity !== 'string' || !sourceIdentity || sourceIdentity.length > 200 || typeof notes !== 'string' || notes.length > 64000)
    throw new LearningError(422, 'INVALID_DATA', '請提供有效的合成圖片與訂正筆記');
  const bytes = await image.arrayBuffer(), header = new Uint8Array(bytes);
  if (header[0] !== 255 || header[1] !== 216 || header[2] !== 255) throw new LearningError(422, 'INVALID_DATA', '合成圖片須為 JPEG');
  return aiResponse(c, () => recognizeCorrection(c.env.DB, uid, ref, { image: bytes, sourceIdentity, notes, force: form.get('force') === 'true', model: correctionRecognitionModel(c.env) }, createAIService(c.env)));
});

learningRouter.post('/:kind/:id/confirm', async c => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw new LearningError(422, 'INVALID_DATA', '請提供題目版本');
  return c.json(await confirmLearningQuestion(c.env.DB, c.get('userId'), refFromPath(c.req.param('kind'), c.req.param('id')),
    body.expectedRowVersion, body.expectedSourceVersion));
});

// Explicit, read-only preview. User adoption goes through the same versioned PATCH as edits.
learningRouter.post('/:kind/:id/preview', async c => {
  const uid = c.get('userId'), ref = refFromPath(c.req.param('kind'), c.req.param('id'));
  const current = await readLearningQuestion(c.env.DB, uid, ref);
  if (!c.env.GEMINI_API_KEY) return c.json({ error: { code: 'AI_UNAVAILABLE', message: '目前無法使用 AI 辨識，可先手動修改' } }, 503);
  if (!c.env.UPLOAD_LIMITER || !(await c.env.UPLOAD_LIMITER.limit({ key: `learning-preview:${uid}` })).success)
    return c.json({ error: { code: 'RATE_LIMITED', message: '請稍後再試' } }, 429);
  const source = await learningSource(c.env.DB, uid, ref);
  if (source.source_version !== current.sourceVersion) throw new LearningError(409, 'CONFLICT', '來源已更新，請重新載入');
  const image = await c.env.STORAGE.get(source.storage_key);
  if (!image) throw new LearningError(404, 'NOT_FOUND', '原圖目前無法讀取');
  const records = (await c.env.DB.prepare('SELECT id,user_id,parent_id,label,level FROM taxonomies WHERE user_id IS NULL OR user_id=?')
    .bind(uid).all<TaxonomyNode>()).results;
  const nodes = new Map(records.map(n => [n.id, { ...n, children: [] as TaxonomyNode[] }])), roots: TaxonomyNode[] = [];
  for (const node of nodes.values()) { const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node); else roots.push(node); }
  const result = await createAIService(c.env).tagProblem(await image.arrayBuffer(), roots);
  if (!result) return c.json({ error: { code: 'AI_FAILED', message: '本次辨識未完成，原資料保持不變' } }, 422);
  const fresh = await readLearningQuestion(c.env.DB, uid, ref);
  if (fresh.rowVersion !== current.rowVersion || fresh.sourceVersion !== current.sourceVersion)
    throw new LearningError(409, 'CONFLICT', '辨識期間題目已更新，請重新載入');
  const data = normalizeRecognition(result, ref.kind === 'saved');
  if (ref.kind === 'saved') data.personal = current.personal;
  return c.json({ ...current, ...data });
});
