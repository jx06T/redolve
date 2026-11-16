import type { Bindings } from '../types';
import type { CorrectionBatchInput, CorrectionBatchJob } from '../../src/types/correctionBatch';
import type { PersonalQuestionRef } from '../../src/types/learning';
import { correctionRecognitionModel } from './ai';
import { CORRECTION_PROMPT_VERSION } from './ai/correctionPrompts';
import type { CorrectionContext } from './ai/correctionPrompts';
import { normalizeCorrectionResult } from './ai/correctionResult';
import type { CorrectionBatchProvider } from './ai/GeminiCorrectionBatch';
import { batchInput } from './correctionBatchInput';
import { LearningError, readLearningQuestion } from './learningQuestions';
import { correctionWorkspaceVersion } from './correctionVersion';
import { digest } from './practice';

type BatchRow = { id: string; user_id: string; status: CorrectionBatchJob['status']; provider_name: string | null;
  model: string; prompt_version: string; created_at: string; updated_at: string; request_hash: string; error: string | null; cleaned_at: string | null };
type Entry = { id: string; item_id: string | null; saved_ref_id: string | null; status: 'pending' | 'complete' | 'failed';
  error: string | null; adopted_revision_id: string | null; source_version: string; base_row_version: number;
  workspace_version: string; context_json: string | null; batch_position: number };
const refFor = (e: Pick<Entry, 'item_id' | 'saved_ref_id'>): PersonalQuestionRef => e.item_id ? { kind: 'owned', itemId: e.item_id } : { kind: 'saved', savedRefId: e.saved_ref_id! };
async function row(db: D1Database, uid: string, id: string) {
  const result = await db.prepare('SELECT * FROM correction_batches WHERE id=? AND user_id=?').bind(id, uid).first<BatchRow>();
  if (!result) throw new LearningError(404, 'NOT_FOUND', '找不到批次工作');
  return result;
}
async function entries(db: D1Database, uid: string, id: string) {
  return (await db.prepare(`SELECT c.id,c.item_id,c.saved_ref_id,c.status,c.error,c.adopted_revision_id,c.source_version,c.base_row_version,
    m.workspace_version,m.context_json,m.batch_position FROM correction_run_metadata m
    JOIN learning_corrections c ON c.id=m.correction_id WHERE m.batch_id=? AND c.user_id=? ORDER BY m.batch_position`)
    .bind(id, uid).all<Entry>()).results;
}
export async function readBatch(db: D1Database, uid: string, id: string): Promise<CorrectionBatchJob> {
  const b = await row(db, uid, id);
  return { id, status: b.status, model: b.model, promptVersion: b.prompt_version, createdAt: b.created_at, error: b.error, cleaned: !!b.cleaned_at,
    items: (await entries(db, uid, id)).map(e => ({ id: e.id, ref: refFor(e), status: e.status, error: e.error, adopted: !!e.adopted_revision_id })) };
}
export async function listBatches(db: D1Database, uid: string, before = '') {
  const batches = (await db.prepare(`SELECT * FROM correction_batches WHERE user_id=? ${before ? 'AND created_at < ?' : ''}
    ORDER BY created_at DESC,id DESC LIMIT 20`).bind(uid, ...(before ? [before] : [])).all<BatchRow>()).results;
  if (!batches.length) return [];
  const items = (await db.prepare(`SELECT c.id,c.item_id,c.saved_ref_id,c.status,c.error,c.adopted_revision_id,m.batch_id
    FROM correction_run_metadata m JOIN learning_corrections c ON c.id=m.correction_id
    WHERE c.user_id=? AND m.batch_id IN (SELECT value FROM json_each(?)) ORDER BY m.batch_position`)
    .bind(uid, JSON.stringify(batches.map(b => b.id))).all<Pick<Entry, 'id' | 'item_id' | 'saved_ref_id' | 'status' | 'error' | 'adopted_revision_id'> & { batch_id: string }>()).results;
  return batches.map(b => ({ id: b.id, status: b.status, model: b.model, promptVersion: b.prompt_version, createdAt: b.created_at,
    error: b.error, cleaned: !!b.cleaned_at, items: items.filter(e => e.batch_id === b.id).map(e => ({ id: e.id, ref: refFor(e), status: e.status, error: e.error, adopted: !!e.adopted_revision_id })) }));
}
export async function submitBatch(env: Bindings, uid: string, id: string,
  inputs: { input: Omit<CorrectionBatchInput, 'ink' | 'imagePath'>; image: ArrayBuffer }[], provider: CorrectionBatchProvider) {
  const fingerprints = await Promise.all(inputs.map(async e => ({ ...e.input,
    imageHash: [...new Uint8Array(await crypto.subtle.digest('SHA-256', e.image))].map(b => b.toString(16).padStart(2, '0')).join('') })));
  const requestHash = await digest(fingerprints);
  const prior = await env.DB.prepare('SELECT request_hash FROM correction_batches WHERE id=? AND user_id=?').bind(id, uid).first<{ request_hash: string }>();
  if (prior) {
    if (prior.request_hash !== requestHash) throw new LearningError(409, 'REQUEST_REUSED', '工作編號已使用，請更新工作清單');
    return readBatch(env.DB, uid, id);
  }
  const model = correctionRecognitionModel(env), now = new Date().toISOString();
  const prepared = [];
  for (const e of inputs) {
    const value = await batchInput(env, uid, e.input.ref);
    if (value.current.rowVersion !== e.input.rowVersion || value.current.sourceVersion !== e.input.sourceVersion || value.workspaceVersion !== e.input.workspaceVersion)
      throw new LearningError(409, 'CONFLICT', '圖片準備期間題目或筆跡已變更，請重新選取');
    prepared.push({ ...e, ...value, correctionId: crypto.randomUUID() });
  }
  const refs = prepared.map(p => ({ kind: p.input.ref.kind, id: p.input.ref.kind === 'owned' ? p.input.ref.itemId : p.input.ref.savedRefId }));
  // One atomic gate prevents double-clicks, simultaneous tabs, and overlapping batches.
  const insert = env.DB.prepare(`INSERT INTO correction_batches(id,user_id,status,model,prompt_version,request_hash,created_at,updated_at)
    SELECT ?,?,'submitting',?,?,?,?,? WHERE
    (SELECT COUNT(*) FROM correction_batches WHERE user_id=? AND status IN ('submitting','unknown','running')) < 20
    AND NOT EXISTS(SELECT 1 FROM learning_corrections c LEFT JOIN correction_run_metadata m ON m.correction_id=c.id
      LEFT JOIN correction_batches b ON b.id=m.batch_id WHERE c.user_id=? AND c.status='pending'
      AND (c.lease_until>? OR b.status IN ('submitting','unknown','running'))
      AND EXISTS(SELECT 1 FROM json_each(?) j WHERE (json_extract(j.value,'$.kind')='owned' AND c.item_id=json_extract(j.value,'$.id'))
        OR (json_extract(j.value,'$.kind')='saved' AND c.saved_ref_id=json_extract(j.value,'$.id'))))`)
    .bind(id, uid, model, CORRECTION_PROMPT_VERSION, requestHash, now, now, uid, uid, now, JSON.stringify(refs));
  const statements = [insert];
  for (let i = 0; i < prepared.length; i++) {
    const p = prepared[i], ref = p.input.ref;
    statements.push(env.DB.prepare(`INSERT INTO learning_corrections(id,user_id,item_id,saved_ref_id,input_hash,source_version,base_row_version,status,model_version,run_token,lease_until,created_at)
      SELECT ?,?,?,?,?,?,?,'pending',?,?,?,? WHERE EXISTS(SELECT 1 FROM correction_batches WHERE id=? AND user_id=?)`)
      .bind(p.correctionId, uid, ref.kind === 'owned' ? ref.itemId : null, ref.kind === 'saved' ? ref.savedRefId : null,
        `batch:${id}:${i}`, p.current.sourceVersion, p.current.rowVersion, model, id, '2099-01-01T00:00:00.000Z', now, id, uid));
    statements.push(env.DB.prepare(`INSERT INTO correction_run_metadata(correction_id,prompt_version,model,workspace_version,input_fingerprint,batch_id,batch_position,context_json)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM learning_corrections WHERE id=? AND user_id=?)`)
      .bind(p.correctionId, CORRECTION_PROMPT_VERSION, model, p.workspaceVersion, requestHash, id, i, JSON.stringify(p.context), p.correctionId, uid));
  }
  const result = await env.DB.batch(statements);
  if (!result[0].meta.changes) throw new LearningError(409, 'BATCH_BUSY', '選取的題目已有工作進行中，或已達 20 組進行中工作的上限');
  try {
    const job = await provider.create(id, model, prepared.map(p => ({ key: p.correctionId, image: p.image, context: p.context })));
    if (!job.name) throw Error('Missing batch name');
    await env.DB.prepare(`UPDATE correction_batches SET provider_name=?,status='running',updated_at=? WHERE id=? AND user_id=?`)
      .bind(job.name, new Date().toISOString(), id, uid).run();
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
    if ([400, 401, 402, 403, 404, 413, 422, 429].includes(status)) {
      await finish(env.DB, uid, id, 'failed', `Google 拒絕提交（${status}），請檢查模型、金鑰或額度後重試。`);
      await env.DB.prepare('UPDATE correction_batches SET cleaned_at=? WHERE id=? AND user_id=?').bind(now, id, uid).run();
      return readBatch(env.DB, uid, id);
    }
    // A lost response does not mean Google rejected the request. Recover by display name.
    await env.DB.prepare(`UPDATE correction_batches SET status='unknown',error=?,updated_at=? WHERE id=? AND user_id=?`)
      .bind('提交結果尚未確認。請更新進度找回 Google 工作，勿重複送出。', new Date().toISOString(), id, uid).run();
  }
  return readBatch(env.DB, uid, id);
}

/** A short, resumable request, never a Worker waiting hours for model completion. */
export async function refreshBatch(env: Bindings, uid: string, id: string, provider: CorrectionBatchProvider, cancel = false) {
  let b = await row(env.DB, uid, id);
  if (b.cleaned_at && ['complete', 'failed', 'cancelled'].includes(b.status)) return readBatch(env.DB, uid, id);
  if (b.status === 'submitting' && Date.now() - Date.parse(b.created_at) < 60000) return readBatch(env.DB, uid, id);
  const token = crypto.randomUUID(), now = new Date().toISOString();
  const claim = await env.DB.prepare(`UPDATE correction_batches SET run_token=?,locked_until=? WHERE id=? AND user_id=? AND locked_until<?`)
    .bind(token, new Date(Date.now() + 120000).toISOString(), id, uid, now).run();
  if (!claim.meta.changes) return readBatch(env.DB, uid, id);
  try {
    b = await row(env.DB, uid, id);
    if (!b.provider_name) {
      const recovered = await provider.find(id);
      if (!recovered?.name) {
        if (Date.now() - Date.parse(b.created_at) >= 48 * 60 * 60 * 1000) {
          await finish(env.DB, uid, id, 'failed', '48 小時後仍找不到 Google 工作，可選取未完成題目重試。');
          await env.DB.prepare('UPDATE correction_batches SET cleaned_at=? WHERE id=? AND user_id=?').bind(now, id, uid).run();
        } else {
          await env.DB.prepare(`UPDATE correction_batches SET status='unknown',error=? WHERE id=? AND user_id=?`)
            .bind('尚未找到 Google 工作。請稍後更新進度；48 小時後仍找不到時，可重試未完成的題目。', id, uid).run();
        }
        return await readBatch(env.DB, uid, id);
      }
      b.provider_name = recovered.name;
      await env.DB.prepare(`UPDATE correction_batches SET provider_name=?,status='running',error=NULL WHERE id=? AND user_id=?`).bind(recovered.name, id, uid).run();
    }
    if (cancel && !['complete', 'failed', 'cancelled'].includes(b.status)) {
      await provider.remove(b.provider_name);
      await finish(env.DB, uid, id, 'cancelled', '已取消批次整理');
      await env.DB.prepare('UPDATE correction_batches SET cleaned_at=? WHERE id=? AND user_id=?').bind(now, id, uid).run();
    } else if (!['complete', 'failed', 'cancelled'].includes(b.status)) {
      const job = await provider.get(b.provider_name).catch(error => {
        if (error && typeof error === 'object' && 'status' in error && Number(error.status) === 404 &&
          Date.now() - Date.parse(b.created_at) >= 48 * 60 * 60 * 1000) return null;
        throw error;
      });
      if (!job) {
        await finish(env.DB, uid, id, 'failed', 'Google 工作已無法取得，可選取未完成題目重試。');
        await env.DB.prepare('UPDATE correction_batches SET cleaned_at=? WHERE id=? AND user_id=?').bind(now, id, uid).run();
        return await readBatch(env.DB, uid, id);
      }
      if (['JOB_STATE_SUCCEEDED', 'JOB_STATE_PARTIALLY_SUCCEEDED'].includes(job.state || '')) {
        const list = await entries(env.DB, uid, id), responses = job.dest?.inlinedResponses;
        if (!responses) throw Error('批次結果格式不符，請稍後重試匯入');
        const ordered = job.state === 'JOB_STATE_SUCCEEDED' && responses.length === list.length &&
          list.every((entry, i) => entry.batch_position === i) && responses.every(r => !r.metadata?.key);
        for (const e of list) {
          if (e.status !== 'pending') continue;
          try {
            const response = responses.find(r => r.metadata?.key === e.id) ?? (ordered ? responses[e.batch_position] : undefined);
            if (!response?.response || response.error) throw Error('此題辨識失敗，可重新勾選送出');
            const ref = refFor(e), current = await readLearningQuestion(env.DB, uid, ref);
            if (current.rowVersion !== e.base_row_version || current.sourceVersion !== e.source_version ||
              await correctionWorkspaceVersion(env.DB, uid, ref) !== e.workspace_version || current.correction?.id !== e.id)
              throw Error('題目、訂正內容或辨識工作已更新，未套用舊結果');
            const output = response.response;
            const text = output.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('') || '';
            if (output.candidates?.[0]?.finishReason && output.candidates[0].finishReason !== 'STOP') throw Error('模型輸出不完整，可重試此題');
            const raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, ''));
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('模型輸出格式不正確');
            const data = normalizeCorrectionResult(raw, JSON.parse(e.context_json!) as CorrectionContext);
            await env.DB.batch([
              env.DB.prepare(`UPDATE learning_corrections SET status='complete',data_json=?,error=NULL WHERE id=? AND user_id=? AND status='pending'`)
                .bind(JSON.stringify(data), e.id, uid),
              env.DB.prepare(`UPDATE correction_run_metadata SET usage_json=?,context_json=NULL WHERE correction_id=? AND batch_id=?`)
                .bind(JSON.stringify(output.usageMetadata || {}), e.id, id),
            ]);
          } catch (error) {
            await env.DB.prepare(`UPDATE learning_corrections SET status='failed',error=? WHERE id=? AND user_id=? AND status='pending'`)
              .bind(error instanceof LearningError ? '題目已刪除或修改，未套用結果' : error instanceof Error && !error.message.includes('JSON') ? error.message.slice(0, 200) : '模型輸出格式不正確，可重試此題', e.id, uid).run();
          }
        }
        await finish(env.DB, uid, id, 'complete', null);
      } else if (['JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED'].includes(job.state || '')) {
        await finish(env.DB, uid, id, job.state === 'JOB_STATE_CANCELLED' ? 'cancelled' : 'failed', 'Google 批次工作未完成，可重新選取失敗題目');
      }
    }
    b = await row(env.DB, uid, id);
    if (['complete', 'failed', 'cancelled'].includes(b.status) && !b.cleaned_at) {
      try {
        await provider.remove(b.provider_name!);
        await env.DB.prepare('UPDATE correction_batches SET cleaned_at=?,error=NULL WHERE id=? AND user_id=?').bind(now, id, uid).run();
      } catch {
        await env.DB.prepare('UPDATE correction_batches SET error=? WHERE id=? AND user_id=?').bind('結果已保留，Google 工作清理尚未完成，請再次更新進度。', id, uid).run();
      }
    }
  } finally {
    await env.DB.prepare(`UPDATE correction_batches SET locked_until='',run_token=NULL,updated_at=? WHERE id=? AND user_id=? AND run_token=?`)
      .bind(new Date().toISOString(), id, uid, token).run();
  }
  return readBatch(env.DB, uid, id);
}
async function finish(db: D1Database, uid: string, id: string, status: BatchRow['status'], error: string | null) {
  await db.batch([
    db.prepare('UPDATE correction_batches SET status=?,error=? WHERE id=? AND user_id=?').bind(status, error, id, uid),
    db.prepare(`UPDATE learning_corrections SET status='failed',error=? WHERE user_id=? AND status='pending'
      AND id IN (SELECT correction_id FROM correction_run_metadata WHERE batch_id=?)`).bind(error || '結果未回傳，請重試此題', uid, id),
    db.prepare(`UPDATE correction_run_metadata SET context_json=NULL WHERE batch_id=?
      AND EXISTS(SELECT 1 FROM correction_batches WHERE id=? AND user_id=?)`).bind(id, id, uid),
  ]);
}
