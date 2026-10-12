import { Hono } from 'hono';
import { authorizedImage } from '../services/authorizedImage';
import { bodyLimit } from 'hono/body-limit';
import { Bindings, Variables, ItemRow, TaxonomyNode } from '../types';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { createAIService } from '../services/ai';
import { TAXONOMY_SEED_DATA } from '../data/taxonomy-seed';
import { addOwnedItem } from './collections';
import { itemSearchIndexStatements } from '../services/itemSearchIndex';

export const problemsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const expectedSeedNodeCount = (nodes: TaxonomyNode[]): number =>
  nodes.reduce((count, node) => count + 1 + expectedSeedNodeCount(node.children ?? []), 0);

const seedNodeCount = expectedSeedNodeCount(TAXONOMY_SEED_DATA);

// Helper for Base64 Cursor Encoding/Decoding
function encodeCursor(created_at: string, id: string): string {
  return btoa(JSON.stringify({ created_at, id }));
}

function decodeCursor(cursor: string): { created_at: string; id: string } | null {
  try {
    return JSON.parse(atob(cursor));
  } catch {
    return null;
  }
}

/**
 * Ensures and syncs official seed taxonomies in D1 database
 */
export async function syncSeedTaxonomies(db: D1Database): Promise<{ count: number }> {
  try {
    const flattenNodes = (nodes: TaxonomyNode[]): { id: string; parent_id: string | null; label: string; level: number }[] => {
      const list: any[] = [];
      const traverse = (items: TaxonomyNode[]) => {
        for (const item of items) {
          list.push({ id: item.id, parent_id: item.parent_id || null, label: item.label, level: item.level || 0 });
          if (item.children) traverse(item.children);
        }
      };
      traverse(nodes);
      return list;
    };

    const flat = flattenNodes(TAXONOMY_SEED_DATA);
    const stmts = flat.map((node) =>
      db
        .prepare(
          `INSERT INTO taxonomies (id, user_id, parent_id, label, level)
           VALUES (?, NULL, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET label = excluded.label, parent_id = excluded.parent_id, level = excluded.level
           WHERE taxonomies.user_id IS NULL`
        )
        .bind(node.id, node.parent_id, node.label, node.level)
    );
    await db.batch(stmts);
    return { count: flat.length };
  } catch (err) {
    console.warn('[syncSeedTaxonomies] Failed to sync seed taxonomies:', err);
    throw err;
  }
}

export async function ensureSeedTaxonomies(db: D1Database): Promise<void> {
  try {
    const row = await db
      .prepare('SELECT COUNT(*) as count FROM taxonomies WHERE user_id IS NULL')
      .first<{ count: number }>();
    if (row && row.count >= seedNodeCount) {
      return;
    }
    await syncSeedTaxonomies(db);
  } catch (err) {
    console.warn('[ensureSeedTaxonomies] Failed to ensure seed taxonomies:', err);
  }
}

/**
 * Validates whether topicId exists in D1 taxonomies table.
 * If not present, automatically auto-seeds missing nodes from TAXONOMY_SEED_DATA
 * or falls back to null to strictly prevent SQLite FOREIGN KEY constraint errors.
 */
async function validateAndEnsureTopicId(db: any, topicId: string | null | undefined): Promise<string | null> {
  if (!topicId || typeof topicId !== 'string') return null;
  const cleanId = topicId.trim();
  if (!cleanId) return null;

  try {
    await ensureSeedTaxonomies(db);
    const existing = await db.prepare('SELECT id FROM taxonomies WHERE id = ?').bind(cleanId).first();
    if (existing) return cleanId;
  } catch (err) {
    console.warn('[validateAndEnsureTopicId] Failed to verify topic:', err);
  }
  return null;
}

/**
 * Loads the complete dynamic taxonomy tree from D1 database for the given user,
 * merging official seed taxonomies and user custom taxonomies.
 */
async function loadFullTaxonomyTree(db: any, userId: string): Promise<TaxonomyNode[]> {
  try {
    await ensureSeedTaxonomies(db);
    const res = await db.prepare(
      `SELECT id, user_id, parent_id, label, level
       FROM taxonomies
       WHERE user_id IS NULL OR user_id = ?
       ORDER BY level ASC, id ASC`
    ).bind(userId).all();
    const results = (res?.results || []) as any[];

    if (results && results.length > 0) {
      const nodeMap = new Map<string, TaxonomyNode>();
      const rootNodes: TaxonomyNode[] = [];
      for (const r of results) {
        nodeMap.set(r.id, {
          id: r.id,
          user_id: r.user_id,
          parent_id: r.parent_id,
          label: r.label,
          level: r.level,
          children: [],
        });
      }
      for (const r of results) {
        const node = nodeMap.get(r.id)!;
        if (r.parent_id && nodeMap.has(r.parent_id)) {
          const parent = nodeMap.get(r.parent_id)!;
          if (!parent.children) parent.children = [];
          parent.children.push(node);
        } else {
          rootNodes.push(node);
        }
      }
      return rootNodes;
    }
  } catch (err) {
    console.warn('[loadFullTaxonomyTree] Failed to load taxonomy tree from DB:', err);
  }
  return TAXONOMY_SEED_DATA;
}

// 0. Guest Analysis Endpoint (Synchronous AI Tagging without Storage)
problemsRouter.post(
  '/analyze-guest',
  optionalAuthMiddleware,
  bodyLimit({
    maxSize: 15 * 1024 * 1024,
    onError: (c) => c.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: '請求 payload 過大，單檔上限為 15MB' } }, 413),
  }),
  async (c) => {
    const ip = c.req.header('CF-Connecting-IP') || 'local-development';
    const guestLimit = await c.env.GUEST_AI_LIMITER.limit({ key: `guest-ai:${ip}` });
    if (!guestLimit.success) {
      return c.json({ error: { code: 'TOO_MANY_REQUESTS', message: '訪客分析頻率過高，請稍後再試' } }, 429);
    }

    const body = await c.req.parseBody();
    const file = body['file'] || body['image'];
    if (!file || !(file instanceof File)) {
      return c.json({ error: { code: 'INVALID_REQUEST', message: '請上傳有效圖片檔案' } }, 400);
    }

    const fileType = (file.type || '').toLowerCase();
    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (fileType && !ALLOWED_TYPES.includes(fileType)) {
      return c.json({ error: { code: 'INVALID_FILE_TYPE', message: '不支援的圖片格式' } }, 400);
    }

    const imageArrayBuffer = await file.arrayBuffer();

    // Use seed taxonomies for guests by querying with a non-existent userId
    const tree = await loadFullTaxonomyTree(c.env.DB, 'guest');
    const aiService = createAIService(c.env);
    const tagResult = await aiService.tagProblem(imageArrayBuffer, tree);

    if (!tagResult) {
      return c.json({ error: { code: 'AI_ANALYSIS_FAILED', message: 'AI 分析辨識失敗' } }, 422);
    }

    const validTopicId = await validateAndEnsureTopicId(c.env.DB, tagResult.topic_id);

    return c.json({
      status: 'ok',
      tagResult: {
        ...tagResult,
        topic_id: validTopicId,
      }
    }, 200);
  }
);

// 1. Upload Problem (FormData) -> R2 + D1 + Background AI Tagging
problemsRouter.post(
  '/',
  authMiddleware,
  bodyLimit({
    maxSize: 15 * 1024 * 1024, // 15MB strict body limit before parsing
    onError: (c) => c.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: '請求 payload 過大，單檔上限為 15MB' } }, 413),
  }),
  async (c) => {
    const userId = c.get('userId');

    const uploadLimit = await c.env.UPLOAD_LIMITER.limit({ key: `upload:${userId}` });
    if (!uploadLimit.success) {
      return c.json({ error: { code: 'TOO_MANY_REQUESTS', message: '上傳頻率過高，請稍後再試' } }, 429);
    }

    const body = await c.req.parseBody();

  const file = body['file'] || body['image'];
  if (!file || !(file instanceof File)) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: '請上傳有效圖片檔案' } }, 400);
  }

  // File size validation (Max 15MB)
  const MAX_FILE_SIZE = 15 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: '圖片檔案過大，單檔上限為 15MB' } }, 413);
  }

  // MIME type validation
  const fileType = (file.type || '').toLowerCase();
  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (fileType && !ALLOWED_TYPES.includes(fileType)) {
    return c.json({ error: { code: 'INVALID_FILE_TYPE', message: '不支援的圖片格式，請上傳 JPEG、PNG 或 WebP 圖片' } }, 400);
  }

  const problemId = crypto.randomUUID();
  const imageKey = `images/${userId}/${problemId}.jpg`;
  const imageArrayBuffer = await file.arrayBuffer();

  // Store in R2 Bucket
  await c.env.STORAGE.put(imageKey, imageArrayBuffer, {
    httpMetadata: { contentType: fileType || 'image/jpeg' },
  });

  const now = new Date().toISOString();
  // Pre-analyzed tags from Guest sync
  const tagResultRaw = body['tag_result'] as string | undefined;
  let preAnalyzedResult: any = null;
  if (tagResultRaw) {
    try {
      preAnalyzedResult = JSON.parse(tagResultRaw);
    } catch (e) {
      // ignore
    }
  }

  const initialTopicId = preAnalyzedResult 
    ? await validateAndEnsureTopicId(c.env.DB, preAnalyzedResult.topic_id) 
    : await validateAndEnsureTopicId(c.env.DB, body['topic_id'] as string);

  const initialStatus = preAnalyzedResult ? 'unsolved' : 'processing';
  const initialKeywords = preAnalyzedResult && preAnalyzedResult.keywords ? JSON.stringify(preAnalyzedResult.keywords) : null;
  const initialKeywordTokens = preAnalyzedResult && preAnalyzedResult.keyword_tokens ? preAnalyzedResult.keyword_tokens.join(' ') : null;

  // Keep the private item and its reusable asset reference in one D1 transaction.
  try {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO assets (id, storage_key, mime_type) VALUES (?, ?, ?)')
        .bind(imageKey, imageKey, fileType || 'image/jpeg'),
      c.env.DB.prepare(
        `INSERT INTO items (id, user_id, type, topic_id, keywords, keyword_tokens, source, image_url, draw_data, status, review_count, vector_clock, updated_at, created_at)
         VALUES (?, ?, 'problem', ?, ?, ?, ?, ?, NULL, ?, 0, NULL, ?, ?)`
      ).bind(problemId, userId, initialTopicId, initialKeywords, initialKeywordTokens,
        (body['source'] as string) || 'iOS Shortcut', imageKey, initialStatus, now, now),
      c.env.DB.prepare('INSERT INTO asset_refs (id, asset_id, item_id, role) VALUES (?, ?, ?, ?)')
        .bind(`item:${problemId}`, imageKey, problemId, 'source_image'),
    ]);
  } catch (error) {
    // The object has no D1 owner if the transaction rolled back.
    await c.env.STORAGE.delete(imageKey).catch(() => undefined);
    throw error;
  }

  if (preAnalyzedResult) {
    // Sync FTS5 Index synchronously for pre-analyzed result
    try {
      const ocrText = preAnalyzedResult.ocr_text || '';
      await c.env.DB.batch(itemSearchIndexStatements(c.env.DB, problemId, userId, ocrText));
    } catch (ftsErr) {
      console.warn('[FTS Sync Warning]', ftsErr);
    }
  } else {
    // Trigger Background AI Tagging via ctx.waitUntil
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const tree = await loadFullTaxonomyTree(c.env.DB, userId);
        const aiService = createAIService(c.env);
        const tagResult = await aiService.tagProblem(imageArrayBuffer, tree);

        if (tagResult) {
          const keywordTokensStr = tagResult.keyword_tokens.join(' ');
          const keywordsJson = JSON.stringify(tagResult.keywords);
          const validTopicId = await validateAndEnsureTopicId(c.env.DB, tagResult.topic_id);

          await c.env.DB.prepare(
            `UPDATE items
             SET topic_id = ?, keywords = ?, keyword_tokens = ?, status = 'unsolved',
                 content_seq = content_seq + 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`
          )
            .bind(validTopicId, keywordsJson, keywordTokensStr, problemId)
            .run();

          // Sync FTS5 Index
          try {
            const ocrText = tagResult.ocr_text || '';

            await c.env.DB.batch(itemSearchIndexStatements(c.env.DB, problemId, userId, ocrText));
          } catch (ftsErr) {
            console.warn('[FTS Sync Warning]', ftsErr);
          }
        } else {
          // AI Failed -> Silent Fallback to status 'unsolved', topic_id null (unclassified)
          await c.env.DB.prepare(
            `UPDATE items SET status = 'unsolved', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          )
            .bind(problemId)
            .run();
        }
      } catch (err) {
        console.error('[AI Processing Error]', err);
        try {
          await c.env.DB.prepare(
            `UPDATE items SET status = 'unsolved', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          )
            .bind(problemId)
            .run();
        } catch {
          // ignore fallback update error
        }
      }
    })()
  );
  }

  const requestedDestination = typeof body['collection_id'] === 'string' ? body['collection_id'] : undefined;
  const usePrivateOnly = body['collection_id'] === 'private';
  const preference = requestedDestination || usePrivateOnly ? null : await c.env.DB.prepare(
    'SELECT default_collection_id FROM user_upload_preferences WHERE user_id=?'
  ).bind(userId).first<{ default_collection_id: string | null }>();
  const destination = usePrivateOnly ? null : requestedDestination || preference?.default_collection_id || null;
  const join = destination ? await addOwnedItem(c.env,destination,problemId,userId) : null;
  return c.json({ id: problemId, status: 'processing',
    destination: destination ? {collection_id:destination,join} : {collection_id:null,join:null},
  }, 200);
});

// 2. Cursor-based Pagination List
problemsRouter.get('/', optionalAuthMiddleware, async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ items: [], nextCursor: null });
  }

  const cursorParam = c.req.query('cursor');
  const limitParam = parseInt(c.req.query('limit') || '20', 10);
  const topicId = c.req.query('topic_id');
  const subjectId = c.req.query('subject_id');
  const status = c.req.query('status');
  const collectionId = c.req.query('collection_id');

  const decodedCursor = cursorParam ? decodeCursor(cursorParam) : null;

  await ensureSeedTaxonomies(c.env.DB);

  let query = 'SELECT * FROM items WHERE user_id = ?';
  const bindings: any[] = [userId];
  if (collectionId) {
    query += ` AND EXISTS(SELECT 1 FROM collection_items ci WHERE ci.source_item_id=items.id
      AND ci.collection_id=? AND ci.state='included')`;
    bindings.push(collectionId);
  }

  if (topicId && topicId !== 'all') {
    if (topicId === 'unclassified') {
      query += ' AND (topic_id IS NULL OR topic_id = \'\')';
    } else {
      query += ` AND (
        topic_id IN (
          WITH RECURSIVE sub_tax(id) AS (
            SELECT id FROM taxonomies WHERE id = ?
            UNION ALL
            SELECT t.id FROM taxonomies t JOIN sub_tax st ON t.parent_id = st.id
          )
          SELECT id FROM sub_tax
        )
        OR topic_id = ?
      )`;
      bindings.push(topicId, topicId);
    }
  } else if (subjectId && subjectId !== 'all') {
    if (subjectId === 'unclassified') {
      // Virtual subject: shows only items that have no taxonomy assignment yet
      query += ' AND (topic_id IS NULL OR topic_id = \'\')';
    } else {
      query += ` AND (
        topic_id IN (
          WITH RECURSIVE sub_tax(id) AS (
            SELECT id FROM taxonomies WHERE id = ?
            UNION ALL
            SELECT t.id FROM taxonomies t JOIN sub_tax st ON t.parent_id = st.id
          )
          SELECT id FROM sub_tax
        )
        OR topic_id = ?
      )`;
      bindings.push(subjectId, subjectId);
    }
  }

  if (status && status !== 'all') {
    query += ' AND status = ?';
    bindings.push(status);
  } else {
    // Default 'all' active feed excludes archived items so they are hidden from normal review
    query += " AND status != 'archived'";
  }

  if (decodedCursor) {
    query += ' AND (created_at > ? OR (created_at = ? AND id > ?))';
    bindings.push(decodedCursor.created_at, decodedCursor.created_at, decodedCursor.id);
  }

  query += ' ORDER BY created_at ASC, id ASC LIMIT ?';
  bindings.push(limitParam + 1);

  const stmt = c.env.DB.prepare(query);
  const { results } = await stmt.bind(...bindings).all<ItemRow>();

  const rows = results || [];
  const hasMore = rows.length > limitParam;
  const items = hasMore ? rows.slice(0, limitParam) : rows;

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1];
    nextCursor = encodeCursor(lastItem.created_at, lastItem.id);
  }

  return c.json({ items, nextCursor });
});

// 3. Get Single Problem Details
problemsRouter.get('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');

  const item = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?')
    .bind(problemId)
    .first<ItemRow>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '題目不存在' } }, 404);
  }

  if (item.user_id !== userId) {
    return c.json({ error: { code: 'FORBIDDEN', message: '無權限訪問此題目' } }, 403);
  }

  return c.json({ item });
});

// 3.5 Get Single Problem Text
problemsRouter.get('/:id/text', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');

  const item = await c.env.DB.prepare('SELECT user_id FROM items WHERE id = ?')
    .bind(problemId)
    .first<{ user_id: string }>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '題目不存在' } }, 404);
  }

  if (item.user_id !== userId) {
    return c.json({ error: { code: 'FORBIDDEN', message: '無權限訪問' } }, 403);
  }

  const fts = await c.env.DB.prepare('SELECT problem_text FROM items_fts WHERE id = ? ORDER BY rowid DESC LIMIT 1')
    .bind(problemId)
    .first<{ problem_text: string }>();

  return c.json({ text: fts?.problem_text || '' });
});

// 4. Stream Problem Image directly from R2
problemsRouter.get('/:id/image', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');

  const item = await c.env.DB.prepare(`SELECT i.image_url,i.user_id,a.storage_key,a.mime_type,a.state
    FROM items i LEFT JOIN assets a ON a.id=i.image_url WHERE i.id=?`)
    .bind(problemId)
    .first<{image_url:string;user_id:string;storage_key:string|null;mime_type:string|null;state:string|null}>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '題目或圖片不存在' } }, 404);
  }

  if (item.user_id !== userId) {
    return c.json({ error: { code: 'FORBIDDEN', message: '無權限訪問此圖片' } }, 403);
  }

  if (item.state && item.state !== 'ready') {
    return c.json({ error: { code: 'CONTENT_UNAVAILABLE', message: '圖片目前無法使用' } }, 410);
  }
  const response = await authorizedImage(c, item.storage_key || item.image_url, item.mime_type || 'image/jpeg');
  if (!response) {
    return c.json({ error: { code: 'NOT_FOUND', message: '圖片檔案不存在' } }, 404);
  }

  return response;
});

// 5. Update Metadata / Status / Taxonomy
problemsRouter.patch('/:id/tags', authMiddleware, async c => {
  const body=await c.req.json().catch(()=>({}));
  const op=body.op;
  const tag=typeof body.tag==='string'?body.tag.trim():'';
  if(!['add','remove'].includes(op)||!tag||tag.length>80)
    return c.json({error:{code:'INVALID_REQUEST',message:'標籤操作無效'}},400);
  const uid=c.get('userId'),id=c.req.param('id');
  for(let attempt=0;attempt<5;attempt++){
    const row=await c.env.DB.prepare('SELECT keywords,content_seq FROM items WHERE id=? AND user_id=?')
      .bind(id,uid).first<{keywords:string|null;content_seq:number}>();
    if(!row) return c.json({error:{code:'NOT_FOUND',message:'找不到題目'}},404);
    let tags:string[]=[];
    try{ const parsed=JSON.parse(row.keywords||'[]');if(Array.isArray(parsed))tags=parsed.filter(x=>typeof x==='string'); }
    catch{tags=[];}
    const next=new Set(tags);
    if(op==='add')next.add(tag);else next.delete(tag);
    if(next.size>100) return c.json({error:{code:'LIMIT_REACHED',message:'標籤數量已達上限'}},413);
    const list=[...next];
    const batch=await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE items SET keywords=?,keyword_tokens=?,content_seq=content_seq+1,
        updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND content_seq=?`)
        .bind(JSON.stringify(list),list.join(' '),id,uid,row.content_seq),
      ...itemSearchIndexStatements(c.env.DB,id,uid),
    ]);
    if(batch[0].meta.changes) return c.json({status:'ok',keywords:list,content_seq:row.content_seq+1});
  }
  return c.json({error:{code:'CONFLICT',message:'標籤更新衝突，請重新載入'}},409);
});
problemsRouter.put('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  if ('image_url' in body || 'image_asset_id' in body || 'draw_data' in body)
    return c.json({ error: { code: 'IMMUTABLE_IMAGE', message: '既有題目不能換圖或裁切' } }, 400);
  const fields: string[] = [];
  const values: (string | number | null)[] = [];
  let publicChanged = false;
  if ('source' in body) {
    if (typeof body.source !== 'string' || body.source.length > 2000)
      return c.json({ error: { code: 'INVALID_REQUEST', message: '來源文字無效' } }, 400);
    fields.push('source=?'); values.push(body.source); publicChanged = true;
  }
  if ('topic_id' in body) {
    const topic = body.topic_id === null ? null : await validateAndEnsureTopicId(c.env.DB, body.topic_id);
    if (body.topic_id !== null && !topic)
      return c.json({ error: { code: 'INVALID_TOPIC', message: '分類無效' } }, 400);
    fields.push('topic_id=?'); values.push(topic); publicChanged = true;
  }
  if ('keywords' in body) {
    if (!Array.isArray(body.keywords) || body.keywords.some((x:unknown)=>typeof x!=='string') ||
      !Number.isSafeInteger(body.expected_content_seq))
      return c.json({ error: { code: 'PRECONDITION_REQUIRED', message: '標籤更新需要來源版本，建議使用增刪操作' } }, 428);
    const tags=[...new Set(body.keywords.map((x:string)=>x.trim()).filter(Boolean))].slice(0,100);
    fields.push('keywords=?','keyword_tokens=?');
    values.push(JSON.stringify(tags),tags.join(' ')); publicChanged = true;
  }
  if ('typed_notes' in body) {
    if (typeof body.typed_notes !== 'string' ||
      new TextEncoder().encode(body.typed_notes).byteLength > 65536 ||
      !Number.isSafeInteger(body.expected_notes_seq))
      return c.json({ error: { code: 'PRECONDITION_REQUIRED', message: '筆記更新需要目前版本' } }, 428);
    fields.push('typed_notes=?','notes_seq=notes_seq+1'); values.push(body.typed_notes);
  }
  if (!fields.length) return c.json({ error: { code: 'INVALID_REQUEST', message: '沒有可更新欄位' } }, 400);
  if (publicChanged) fields.push('content_seq=content_seq+1');
  fields.push('updated_at=CURRENT_TIMESTAMP');
  const where=['id=?','user_id=?'];
  values.push(problemId || '',userId);
  if ('typed_notes' in body) { where.push('notes_seq=?'); values.push(body.expected_notes_seq); }
  if ('keywords' in body) { where.push('content_seq=?'); values.push(body.expected_content_seq); }
  const [result]=await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE items SET ${fields.join(',')} WHERE ${where.join(' AND ')}`).bind(...values),
    ...itemSearchIndexStatements(c.env.DB,problemId,userId),
  ]);
  if (!result.meta.changes)
    return c.json({ error: { code: 'CONFLICT', message: '題目已由其他裝置更新，請保留本機內容' } }, 409);
  const updated=await c.env.DB.prepare('SELECT * FROM items WHERE id=? AND user_id=?')
    .bind(problemId,userId).first<ItemRow>();
  return c.json({ status: 'ok', content_seq: updated?.content_seq, notes_seq: updated?.notes_seq });
});

// 6. Delete Problem
problemsRouter.delete('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');

  const item = await c.env.DB.prepare('SELECT image_url FROM items WHERE id = ? AND user_id = ?')
    .bind(problemId, userId)
    .first<ItemRow>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '找不到題目' } }, 404);
  }

  // R2 bytes stay while any publication or personal download still owns them.
  // A separate reference-aware GC pass removes unreferenced objects.
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE collection_items SET state='removed',latest_add_event_seq=NULL
      WHERE source_item_id=? AND state='included'`).bind(problemId),
    c.env.DB.prepare(`UPDATE shared_layers SET state='detached' WHERE entry_id IN
      (SELECT id FROM collection_items WHERE source_item_id=?)`).bind(problemId),
    c.env.DB.prepare('DELETE FROM asset_refs WHERE asset_id = ? AND item_id = ?')
      .bind(item.image_url, problemId),
    c.env.DB.prepare('DELETE FROM items WHERE id = ? AND user_id = ?').bind(problemId, userId),
    c.env.DB.prepare('DELETE FROM items_fts WHERE id = ?').bind(problemId),
    c.env.DB.prepare('DELETE FROM shares WHERE item_id = ?').bind(problemId),
  ]);

  return c.json({ status: 'deleted' });
});

// 7. Auto-save Drawing Stroke Data (Vector Canvas)
problemsRouter.patch('/:id/draw', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');
  const body = await c.req.json();

  const { draw_data, vector_clock } = body;

  // Public share links are read-only; only the owner may change drawing data.
  const current = await c.env.DB.prepare(
    'SELECT draw_seq FROM items WHERE id = ? AND user_id = ?'
  )
    .bind(problemId, userId)
    .first<{ draw_seq: number }>();

  if (!current) {
    return c.json({ error: { code: 'FORBIDDEN', message: '找不到題目或無權限修改此筆記' } }, 403);
  }

  const incomingSeq = Number(vector_clock?.seq);
  if (!Number.isSafeInteger(incomingSeq) || incomingSeq < 1 || draw_data == null)
    return c.json({ error: { code: 'INVALID_REQUEST', message: '筆跡或版本無效' } }, 400);
  const drawDataStr = typeof draw_data === 'string' ? draw_data : JSON.stringify(draw_data);
  if (new TextEncoder().encode(drawDataStr).byteLength > 2 * 1024 * 1024)
    return c.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: '筆跡超過 2 MiB' } }, 413);
  const result = await c.env.DB.prepare(
    `UPDATE items SET draw_data=?,vector_clock=?,draw_seq=draw_seq+1,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND user_id=? AND draw_seq=?`
  ).bind(drawDataStr, JSON.stringify({ clientId: vector_clock?.clientId || 'client', seq: incomingSeq }),
    problemId, userId, incomingSeq - 1).run();
  if (!result.meta.changes) return c.json({ error: { code: 'CONFLICT', message: '筆跡已由另一裝置更新，請保留本機草稿' },
    current_seq: current.draw_seq }, 409);
  return c.json({ status: 'ok', seq: incomingSeq }, 200);
});

// 8. Quick Status Toggle (unsolved <-> resolved / archived)
problemsRouter.patch('/:id/status', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');
  const body = await c.req.json();

  const { status } = body; // 'unsolved' | 'resolved' | 'archived'
  if (status !== 'unsolved' && status !== 'resolved' && status !== 'archived') {
    return c.json({ error: { code: 'INVALID_REQUEST', message: '狀態必須為 unsolved、resolved 或 archived' } }, 400);
  }

  const reviewInc = status === 'resolved' ? 1 : 0;

  await c.env.DB.prepare(
    `UPDATE items
     SET status = ?, review_count = review_count + ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  )
    .bind(status, reviewInc, problemId, userId)
    .run();

  return c.json({ status: 'updated' });
});

// 9. Manual Re-run AI Analysis & Taxonomy Classification
problemsRouter.post('/:id/analyze', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');

  const item = await c.env.DB.prepare('SELECT * FROM items WHERE id = ? AND user_id = ?')
    .bind(problemId, userId)
    .first<ItemRow>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '找不到題目' } }, 404);
  }

  // Retrieve image bytes from R2
  const r2Object = await c.env.STORAGE.get(item.image_url);
  if (!r2Object) {
    return c.json({ error: { code: 'STORAGE_ERROR', message: '無法讀取題目圖片檔案' } }, 500);
  }

  const imageBytes = await r2Object.arrayBuffer();

  // Load latest dynamic taxonomy tree from D1
  const tree = await loadFullTaxonomyTree(c.env.DB, userId);
  const aiService = createAIService(c.env);
  const tagResult = await aiService.tagProblem(imageBytes, tree);

  if (!tagResult) {
    return c.json(
      {
        error: {
          code: 'AI_ANALYSIS_FAILED',
          message: c.env.GEMINI_API_KEY
            ? 'AI 分析辨識失敗，請檢查圖片或稍後重試'
            : '尚未設定 GEMINI_API_KEY，請於 .dev.vars 或 Cloudflare Secrets 中設定',
        },
      },
      422
    );
  }

  const keywordTokensStr = tagResult.keyword_tokens.join(' ');
  const keywordsJson = JSON.stringify(tagResult.keywords);
  const validTopicId = await validateAndEnsureTopicId(c.env.DB, tagResult.topic_id);
  const ocrText = tagResult.ocr_text || '';

  await c.env.DB.prepare(
    `UPDATE items
     SET topic_id = ?, keywords = ?, keyword_tokens = ?, content_seq = content_seq + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  )
    .bind(validTopicId, keywordsJson, keywordTokensStr, problemId, userId)
    .run();

  // Sync FTS5
  await c.env.DB.batch(itemSearchIndexStatements(c.env.DB, problemId, userId, ocrText));

  const updatedItem = await c.env.DB.prepare('SELECT * FROM items WHERE id = ? AND user_id = ?')
    .bind(problemId, userId)
    .first<ItemRow>();

  return c.json({
    status: 'ok',
    tagResult,
    item: updatedItem,
  });
});
