import { Hono } from 'hono';
import { Bindings, Variables, ItemRow, TaxonomyNode } from '../types';
import { authMiddleware } from '../middleware/auth';
import { createAIService } from '../services/ai';
import { TAXONOMY_SEED_DATA } from '../data/taxonomy-seed';

export const problemsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

problemsRouter.use('*', authMiddleware);

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
 * Ensures all official seed taxonomies exist in D1 database
 */
export async function ensureSeedTaxonomies(db: D1Database): Promise<void> {
  try {
    const row = await db
      .prepare('SELECT COUNT(*) as count FROM taxonomies WHERE user_id IS NULL')
      .first<{ count: number }>();
    // Seed data has 43 nodes; check for at least 40 to handle minor variations
    if (row && row.count >= 40) {
      return;
    }

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
        .prepare('INSERT OR IGNORE INTO taxonomies (id, user_id, parent_id, label, level) VALUES (?, NULL, ?, ?, ?)')
        .bind(node.id, node.parent_id, node.label, node.level)
    );
    await db.batch(stmts);
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

// 1. Upload Problem (FormData) -> R2 + D1 + Background AI Tagging
problemsRouter.post('/', async (c) => {
  const userId = c.get('userId');
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
  const initialTopicId = await validateAndEnsureTopicId(c.env.DB, body['topic_id'] as string);

  // Insert D1 item record with status 'processing'
  await c.env.DB.prepare(
    `INSERT INTO items (id, user_id, type, topic_id, keywords, keyword_tokens, source, image_url, draw_data, status, review_count, vector_clock, updated_at, created_at)
     VALUES (?, ?, 'problem', ?, NULL, NULL, ?, ?, NULL, 'processing', 0, NULL, ?, ?)`
  )
    .bind(
      problemId,
      userId,
      initialTopicId,
      (body['source'] as string) || 'iOS Shortcut',
      imageKey,
      now,
      now
    )
    .run();

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
             SET topic_id = ?, keywords = ?, keyword_tokens = ?, status = 'unsolved', updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`
          )
            .bind(validTopicId, keywordsJson, keywordTokensStr, problemId)
            .run();

          // Sync FTS5 Index
          try {
            await c.env.DB.prepare(
              `INSERT OR REPLACE INTO items_fts (id, user_id, source, keyword_tokens, typed_notes) VALUES (?, ?, ?, ?, ?)`
            )
              .bind(problemId, userId, (body['source'] as string) || 'iOS Shortcut', keywordTokensStr, '')
              .run();
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

  return c.json({ id: problemId, status: 'processing' }, 200);
});

// 2. Cursor-based Pagination List
problemsRouter.get('/', async (c) => {
  const userId = c.get('userId');
  const cursorParam = c.req.query('cursor');
  const limitParam = parseInt(c.req.query('limit') || '20', 10);
  const topicId = c.req.query('topic_id');
  const subjectId = c.req.query('subject_id');
  const status = c.req.query('status');

  const decodedCursor = cursorParam ? decodeCursor(cursorParam) : null;

  await ensureSeedTaxonomies(c.env.DB);

  let query = 'SELECT * FROM items WHERE user_id = ?';
  const bindings: any[] = [userId];

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

// 3. Single Problem Metadata
problemsRouter.get('/:id', async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');

  const item = await c.env.DB.prepare('SELECT * FROM items WHERE id = ? AND user_id = ?')
    .bind(problemId, userId)
    .first<ItemRow>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '找不到此題目' } }, 404);
  }

  return c.json(item);
});

// 4. R2 Private Worker Proxy Image Stream
problemsRouter.get('/:id/image', async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');

  const item = await c.env.DB.prepare('SELECT image_url, user_id FROM items WHERE id = ?')
    .bind(problemId)
    .first<ItemRow>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '題目或圖片不存在' } }, 404);
  }

  // Access check: Allow owner or dev fallback
  if (item.user_id !== userId && userId !== 'dev_user_default') {
    try {
      const share = await c.env.DB.prepare(
        'SELECT id FROM problem_shares WHERE item_id = ? AND receiver_id = ?'
      ).bind(problemId, userId).first();
      if (!share) {
        return c.json({ error: { code: 'FORBIDDEN', message: '無權限訪問此圖片' } }, 403);
      }
    } catch {
      // Proceed if problem_shares table not yet migrated
    }
  }

  const object = await c.env.STORAGE.get(item.image_url);
  if (!object) {
    return c.json({ error: { code: 'NOT_FOUND', message: '圖片檔案不存在' } }, 404);
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

// 5. Update Metadata (Manual Edit & Typed Notes)
problemsRouter.put('/:id', async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');
  const body = await c.req.json();

  const { keywords, source, typed_notes } = body;
  // topic_id is handled explicitly: if the key is present in the request body
  // (even as null), we write it directly so the user can clear a classification.
  // Other fields use COALESCE to avoid overwriting with undefined values.
  const topicIdProvided = 'topic_id' in body;
  const topicIdValue = topicIdProvided ? (body.topic_id ?? null) : undefined;

  const item = await c.env.DB.prepare('SELECT id FROM items WHERE id = ? AND user_id = ?')
    .bind(problemId, userId)
    .first();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '找不到題目' } }, 404);
  }

  const keywordsStr = Array.isArray(keywords) ? JSON.stringify(keywords) : (keywords !== undefined ? keywords : null);
  const keywordTokensStr = Array.isArray(keywords) ? keywords.join(' ') : (keywords || '');

  // Build the update query dynamically based on what fields are provided
  if (topicIdProvided) {
    await c.env.DB.prepare(
      `UPDATE items
       SET topic_id = ?,
           keywords = COALESCE(?, keywords),
           keyword_tokens = COALESCE(?, keyword_tokens),
           source = COALESCE(?, source),
           typed_notes = COALESCE(?, typed_notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`
    )
      .bind(topicIdValue, keywordsStr, keywordTokensStr || null, source ?? null, typed_notes !== undefined ? typed_notes : null, problemId, userId)
      .run();
  } else {
    await c.env.DB.prepare(
      `UPDATE items
       SET keywords = COALESCE(?, keywords),
           keyword_tokens = COALESCE(?, keyword_tokens),
           source = COALESCE(?, source),
           typed_notes = COALESCE(?, typed_notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`
    )
      .bind(keywordsStr, keywordTokensStr || null, source ?? null, typed_notes !== undefined ? typed_notes : null, problemId, userId)
      .run();
  }

  // Sync FTS5 Index if keywords, source, or typed_notes updated
  if (keywordsStr !== null || source !== null || typed_notes !== undefined) {
    const currentItem = await c.env.DB.prepare('SELECT source, keyword_tokens, typed_notes FROM items WHERE id = ? AND user_id = ?')
      .bind(problemId, userId)
      .first<{ source: string; keyword_tokens: string; typed_notes: string }>();

    await c.env.DB.prepare(
      `INSERT OR REPLACE INTO items_fts (id, user_id, source, keyword_tokens, typed_notes) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(problemId, userId, currentItem?.source || source || '網頁編輯', currentItem?.keyword_tokens || keywordTokensStr || '', currentItem?.typed_notes || typed_notes || '')
      .run();
  }

  return c.json({ status: 'ok' });
});

// 6. Delete Problem & R2 Object
problemsRouter.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');

  const item = await c.env.DB.prepare('SELECT image_url FROM items WHERE id = ? AND user_id = ?')
    .bind(problemId, userId)
    .first<ItemRow>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '找不到題目' } }, 404);
  }

  await c.env.STORAGE.delete(item.image_url);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM items WHERE id = ? AND user_id = ?').bind(problemId, userId),
    c.env.DB.prepare('DELETE FROM items_fts WHERE id = ?').bind(problemId),
    c.env.DB.prepare('DELETE FROM shares WHERE item_id = ?').bind(problemId),
  ]);

  return c.json({ status: 'deleted' });
});

// 7. Save Canvas Draw Data (Vector Clock Conflict Check & Ownership Protection)
problemsRouter.patch('/:id/draw', async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');
  const body = await c.req.json();

  const { draw_data, vector_clock } = body;

  // 1. Verify Problem Ownership
  let current = await c.env.DB.prepare(
    'SELECT draw_data, vector_clock FROM items WHERE id = ? AND user_id = ?'
  )
    .bind(problemId, userId)
    .first<ItemRow>();

  // 2. If not direct owner, check if user has active collaborative share with allow_ink = 1
  if (!current) {
    const share = await c.env.DB.prepare(
      `SELECT item_id FROM shares 
       WHERE item_id = ? AND allow_ink = 1 AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`
    ).bind(problemId).first();

    if (share) {
      current = await c.env.DB.prepare(
        'SELECT draw_data, vector_clock FROM items WHERE id = ?'
      )
        .bind(problemId)
        .first<ItemRow>();
    }
  }

  if (!current) {
    return c.json({ error: { code: 'FORBIDDEN', message: '找不到題目或無權限修改此筆記' } }, 403);
  }

  let incomingSeq = 0;
  let currentSeq = 0;

  try {
    if (vector_clock) {
      const vc = typeof vector_clock === 'string' ? JSON.parse(vector_clock) : vector_clock;
      incomingSeq = vc.seq ?? 0;
    }
    if (current.vector_clock) {
      const cvc = JSON.parse(current.vector_clock);
      currentSeq = cvc.seq ?? 0;
    }
  } catch {
    // fallback seq comparison
  }

  const drawDataStr = typeof draw_data === 'string' ? draw_data : JSON.stringify(draw_data);
  const finalSeq = Math.max(incomingSeq, currentSeq + 1);
  const vcObj = typeof vector_clock === 'object' && vector_clock !== null
    ? { ...vector_clock, seq: finalSeq }
    : { node: 'client', seq: finalSeq };
  const vcStr = JSON.stringify(vcObj);

  await c.env.DB.prepare(
    `UPDATE items SET draw_data = ?, vector_clock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  )
    .bind(drawDataStr, vcStr, problemId)
    .run();

  return c.json({ status: 'ok', seq: finalSeq }, 200);
});

// 8. Toggle Problem Status
problemsRouter.patch('/:id/status', async (c) => {
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

// 9. Trigger AI Visual Analysis for an existing problem
problemsRouter.post('/:id/analyze', async (c) => {
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

  await c.env.DB.prepare(
    `UPDATE items
     SET topic_id = ?, keywords = ?, keyword_tokens = ?, status = 'unsolved', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  )
    .bind(validTopicId, keywordsJson, keywordTokensStr, problemId, userId)
    .run();

  // Sync FTS5
  await c.env.DB.prepare(
    `INSERT OR REPLACE INTO items_fts (id, user_id, source, keyword_tokens, typed_notes) VALUES (?, ?, COALESCE(?, 'AI 分析'), ?, ?)`
  )
    .bind(problemId, userId, item.source || null, keywordTokensStr, item.typed_notes || '')
    .run();

  const updatedItem = await c.env.DB.prepare('SELECT * FROM items WHERE id = ? AND user_id = ?')
    .bind(problemId, userId)
    .first<ItemRow>();

  return c.json({
    status: 'ok',
    tagResult,
    item: updatedItem,
  });
});

