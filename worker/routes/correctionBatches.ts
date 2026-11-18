import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Bindings, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { isAdminUser } from './admin';
import { LearningError, parsePersonalRef } from '../services/learningQuestions';
import { correctionRecognitionModel } from '../services/ai';
import { CORRECTION_PROMPT_VERSION } from '../services/ai/correctionPrompts';
import { geminiCorrectionBatch } from '../services/ai/GeminiCorrectionBatch';
import { batchInput } from '../services/correctionBatchInput';
import { listBatches, readBatch, refreshBatch, submitBatch } from '../services/correctionBatches';
import type { CorrectionBatchCandidate, CorrectionBatchInput, CorrectionReviewQueue } from '../../src/types/correctionBatch';

export const correctionBatchesRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
correctionBatchesRouter.use('*', authMiddleware);
correctionBatchesRouter.use('*', async (c, next) => {
  if (!isAdminUser(c as Parameters<typeof isAdminUser>[0])) return c.json({ error: { code: 'FORBIDDEN', message: '僅管理員可使用批次整理' } }, 403);
  if (c.env.LEARNING_ENABLED !== 'true') return c.json({ error: { code: 'DISABLED', message: '辨識功能尚未啟用' } }, 404);
  return next();
});
correctionBatchesRouter.use('*', bodyLimit({ maxSize: 6300000 }));
correctionBatchesRouter.onError((error, c) => {
  if (error instanceof LearningError) return c.json({ error: { code: error.code, message: error.message } }, error.status);
  console.warn('[CorrectionBatch] Request failed', { name: error.name });
  return c.json({ error: { code: 'BATCH_UNAVAILABLE', message: '批次整理暫時無法使用，請確認資料庫遷移與模型設定，或稍後更新進度。' } }, 503);
});
correctionBatchesRouter.get('/candidates', async c => {
  const uid = c.get('userId'), q = c.req.query();
  const kind = q.kind === 'saved' ? 'saved' : 'owned', mode = q.mode || 'missing';
  if (!['missing', 'outdated', 'all'].includes(mode)) throw new LearningError(422, 'INVALID_FILTER', '篩選條件不正確');
  for (const value of [q.since, q.until]) if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))))
    throw new LearningError(422, 'INVALID_FILTER', '日期格式不正確');
  if ((q.topic?.length || 0) > 200 || (q.after?.length || 0) > 200) throw new LearningError(422, 'INVALID_FILTER', '篩選條件過長');
  const column = kind === 'owned' ? 'item_id' : 'saved_ref_id', topic = kind === 'owned' ? 's.topic_id' : 's.personal_topic_id';
  const source = kind === 'owned' ? 'items s' : 'saved_refs s JOIN saved_snapshots ss ON ss.id=s.current_snapshot_id AND ss.saved_ref_id=s.id';
  const title = kind === 'owned' ? "COALESCE(s.source,'上傳題目')" : 'ss.source_title';
  const model = correctionRecognitionModel(c.env);
  const binds: unknown[] = [q.topic || '', uid, uid, uid];
  const filters = ["(s.status='resolved' OR s.status='archived' AND s.review_count>0)"];
  if (q.topic) filters.push(`${topic} IN (SELECT id FROM topics)`);
  if (q.after) { filters.push('s.id>?'); binds.push(q.after); }
  // Dates describe last modification, not a fabricated historical correction date.
  if (q.since) { filters.push("julianday(s.updated_at)>=julianday(?,'-8 hours')"); binds.push(q.since); }
  if (q.until) { filters.push("julianday(s.updated_at)<julianday(?,'+1 day','-8 hours')"); binds.push(q.until); }
  if (mode === 'missing') filters.push('lc.id IS NULL');
  if (mode === 'outdated') { filters.push('(lc.id IS NULL OR m.prompt_version IS NULL OR m.prompt_version<>? OR m.model<>?)'); binds.push(CORRECTION_PROMPT_VERSION, model); }
  const rows = (await c.env.DB.prepare(`WITH RECURSIVE topics(id,depth) AS (
    SELECT id,0 FROM taxonomies WHERE id=? AND (user_id IS NULL OR user_id=?) UNION ALL
    SELECT t.id,p.depth+1 FROM taxonomies t JOIN topics p ON t.parent_id=p.id WHERE p.depth<10 AND (t.user_id IS NULL OR t.user_id=?))
    SELECT s.id,${title} title,t.label topic,s.updated_at,m.prompt_version,m.model,lq.confirmation_status
    FROM ${source} LEFT JOIN taxonomies t ON t.id=${topic}
    LEFT JOIN learning_questions lq ON lq.${column}=s.id AND lq.user_id=s.user_id
    LEFT JOIN learning_corrections lc ON lc.id=(SELECT id FROM learning_corrections WHERE user_id=s.user_id AND ${column}=s.id AND status='complete' ORDER BY created_at DESC,id DESC LIMIT 1)
    LEFT JOIN correction_run_metadata m ON m.correction_id=lc.id
    WHERE s.user_id=? AND ${filters.join(' AND ')}
    AND NOT EXISTS(SELECT 1 FROM learning_corrections busy LEFT JOIN correction_run_metadata bm ON bm.correction_id=busy.id
      LEFT JOIN correction_batches b ON b.id=bm.batch_id WHERE busy.user_id=s.user_id AND busy.${column}=s.id AND busy.status='pending'
      AND (busy.lease_until>? OR b.status IN ('submitting','unknown','running')))
    ORDER BY s.id LIMIT 51`).bind(...binds, new Date().toISOString()).all<{
      id: string; title: string; topic: string | null; updated_at: string; prompt_version: string | null; model: string | null; confirmation_status: string | null;
    }>()).results;
  const candidates: CorrectionBatchCandidate[] = rows.slice(0, 50).map(r => ({
    ref: kind === 'owned' ? { kind, itemId: r.id } : { kind, savedRefId: r.id }, title: r.title, topic: r.topic, updatedAt: r.updated_at,
    promptVersion: r.prompt_version, model: r.model, confirmed: r.confirmation_status === 'confirmed',
  }));
  return c.json({ candidates, next: rows.length > 50 ? rows[49].id : null, model, promptVersion: CORRECTION_PROMPT_VERSION });
});
correctionBatchesRouter.get('/input/:kind/:id', async c => {
  const ref = parsePersonalRef({ kind: c.req.param('kind'), itemId: c.req.param('id'), savedRefId: c.req.param('id') });
  const p = await batchInput(c.env, c.get('userId'), ref, true);
  const id = ref.kind === 'owned' ? ref.itemId : ref.savedRefId;
  const result: CorrectionBatchInput = { ref, sourceVersion: p.current.sourceVersion, rowVersion: p.current.rowVersion,
    workspaceVersion: p.workspaceVersion, imagePath: `/${ref.kind === 'owned' ? 'problems' : 'saved'}/${encodeURIComponent(id)}/image`, ink: p.ink, notes: p.context.notes };
  return c.json(result);
});
correctionBatchesRouter.get('/refresh-targets', async c => {
  const after = c.req.query('after') || '';
  if (after.length > 200) throw new LearningError(422, 'INVALID_FILTER', '工作游標不正確');
  const rows = (await c.env.DB.prepare(`SELECT id FROM correction_batches WHERE user_id=? AND id>?
    AND (status IN ('submitting','unknown','running') OR cleaned_at IS NULL) ORDER BY id LIMIT 51`)
    .bind(c.get('userId'), after).all<{ id: string }>()).results;
  return c.json({ ids: rows.slice(0, 50).map(row => row.id), next: rows.length > 50 ? rows[49].id : null });
});
correctionBatchesRouter.get('/review-queue', async c => {
  const cursor = c.req.query('cursor');
  let before: string[] = [];
  if (cursor) {
    let value: unknown;
    try { value = JSON.parse(cursor); } catch { throw new LearningError(422, 'INVALID_CURSOR', '校正清單游標不正確'); }
    if (!Array.isArray(value) || value.length !== 2 || value.some(part => typeof part !== 'string' || part.length > 100))
      throw new LearningError(422, 'INVALID_CURSOR', '校正清單游標不正確');
    before = value;
  }
  const rows = (await c.env.DB.prepare(`SELECT c.id,c.item_id,c.saved_ref_id,c.status,c.error,c.adopted_revision_id,c.created_at,m.batch_id
    FROM learning_corrections c JOIN correction_run_metadata m ON m.correction_id=c.id AND m.batch_id IS NOT NULL
    WHERE c.user_id=? ${before.length ? 'AND (c.created_at,c.id)<(?,?)' : ''}
    AND NOT EXISTS(SELECT 1 FROM learning_corrections newer JOIN correction_run_metadata nm ON nm.correction_id=newer.id AND nm.batch_id IS NOT NULL
      WHERE newer.user_id=c.user_id AND (newer.item_id=c.item_id OR newer.saved_ref_id=c.saved_ref_id)
      AND (newer.created_at,newer.id)>(c.created_at,c.id))
    ORDER BY c.created_at DESC,c.id DESC LIMIT 101`).bind(c.get('userId'), ...before).all<{
      id: string; item_id: string | null; saved_ref_id: string | null; status: 'pending' | 'complete' | 'failed';
      error: string | null; adopted_revision_id: string | null; created_at: string; batch_id: string;
    }>()).results;
  const result: CorrectionReviewQueue = { items: rows.slice(0, 100).map(row => ({
    id: row.id, ref: row.item_id ? { kind: 'owned', itemId: row.item_id } : { kind: 'saved', savedRefId: row.saved_ref_id! },
    status: row.status, error: row.error, adopted: !!row.adopted_revision_id, batchId: row.batch_id,
  })), next: rows.length > 100 ? JSON.stringify([rows[99].created_at, rows[99].id]) : null };
  return c.json(result);
});
correctionBatchesRouter.get('/', async c => c.json({ jobs: await listBatches(c.env.DB, c.get('userId'), c.req.query('before')) }));
correctionBatchesRouter.get('/:id', async c => c.json(await readBatch(c.env.DB, c.get('userId'), c.req.param('id'))));
correctionBatchesRouter.post('/', async c => {
  if (!c.env.GEMINI_API_KEY) return c.json({ error: { code: 'AI_UNAVAILABLE', message: '尚未設定 Gemini 金鑰' } }, 503);
  const form = await c.req.formData(), id = form.get('id'), raw = form.get('inputs');
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) || typeof raw !== 'string' || raw.length > 10000)
    throw new LearningError(422, 'INVALID_BATCH', '批次資料格式不正確');
  let values: unknown; try { values = JSON.parse(raw); } catch { throw new LearningError(422, 'INVALID_BATCH', '批次資料格式不正確'); }
  if (!Array.isArray(values) || values.length < 1 || values.length > 3) throw new LearningError(422, 'INVALID_BATCH', '每個 Google 工作最多 3 題，系統會自動分組送出');
  const inputs = [];
  const keys = new Set<string>();
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!v || typeof v !== 'object' || typeof v.sourceVersion !== 'string' || v.sourceVersion.length > 500 ||
      typeof v.workspaceVersion !== 'string' || v.workspaceVersion.length > 200 || !Number.isSafeInteger(v.rowVersion) || v.rowVersion < 0)
      throw new LearningError(422, 'INVALID_BATCH', '缺少題目或筆跡版本');
    const ref = parsePersonalRef(v.ref), key = JSON.stringify(ref);
    if (keys.has(key)) throw new LearningError(422, 'INVALID_BATCH', '同一組不可重複選取題目');
    keys.add(key);
    const image = form.get(`image${i}`);
    if (!(image instanceof File) || image.type !== 'image/jpeg' || image.size < 3 || image.size > 2000000)
      throw new LearningError(422, 'INVALID_IMAGE', '請提供 2 MB 內的合成 JPEG 圖片');
    const bytes = await image.arrayBuffer(), header = new Uint8Array(bytes);
    if (header[0] !== 255 || header[1] !== 216 || header[2] !== 255) throw new LearningError(422, 'INVALID_IMAGE', '圖片格式不正確');
    inputs.push({ input: { ref, sourceVersion: v.sourceVersion, rowVersion: v.rowVersion, workspaceVersion: v.workspaceVersion }, image: bytes });
  }
  return c.json(await submitBatch(c.env, c.get('userId'), id, inputs, geminiCorrectionBatch(c.env.GEMINI_API_KEY)));
});
for (const operation of ['refresh', 'cancel'] as const) correctionBatchesRouter.post(`/:id/${operation}`, async c => {
  if (!c.env.GEMINI_API_KEY) return c.json({ error: { code: 'AI_UNAVAILABLE', message: '尚未設定 Gemini 金鑰' } }, 503);
  return c.json(await refreshBatch(c.env, c.get('userId'), c.req.param('id'), geminiCorrectionBatch(c.env.GEMINI_API_KEY), operation === 'cancel'));
});
