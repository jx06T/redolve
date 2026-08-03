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

// 1. Upload Problem (FormData) -> R2 + D1 + Background AI Tagging
problemsRouter.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.parseBody();

  const file = body['file'] || body['image'];
  if (!file || !(file instanceof File)) {
    return c.json({ error: { code: 'INVALID_REQUEST', message: '請上傳有效圖片檔案' } }, 400);
  }

  const problemId = crypto.randomUUID();
  const imageKey = `images/${userId}/${problemId}.jpg`;
  const imageArrayBuffer = await file.arrayBuffer();

  // Store in R2 Bucket
  await c.env.STORAGE.put(imageKey, imageArrayBuffer, {
    httpMetadata: { contentType: file.type || 'image/jpeg' },
  });

  const now = new Date().toISOString();

  // Insert D1 item record with status 'processing'
  await c.env.DB.prepare(
    `INSERT INTO items (id, user_id, type, topic_id, keywords, keyword_tokens, source, image_url, draw_data, status, review_count, vector_clock, updated_at, created_at)
     VALUES (?, ?, 'problem', ?, NULL, NULL, ?, ?, NULL, 'processing', 0, NULL, ?, ?)`
  )
    .bind(
      problemId,
      userId,
      (body['topic_id'] as string) || null,
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
        let tree: TaxonomyNode[] = TAXONOMY_SEED_DATA;
        if (c.env.KV) {
          const cachedTree = await c.env.KV.get('taxonomy:tree');
          if (cachedTree) {
            tree = JSON.parse(cachedTree);
          }
        }

        const aiService = createAIService(c.env);
        const tagResult = await aiService.tagProblem(imageArrayBuffer, tree);

        if (tagResult) {
          const keywordTokensStr = tagResult.keyword_tokens.join(' ');
          const keywordsJson = JSON.stringify(tagResult.keywords);

          await c.env.DB.prepare(
            `UPDATE items
             SET topic_id = ?, keywords = ?, keyword_tokens = ?, status = 'unsolved', updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`
          )
            .bind(tagResult.topic_id, keywordsJson, keywordTokensStr, problemId)
            .run();

          // Sync FTS5 Index
          await c.env.DB.prepare(
            `INSERT OR REPLACE INTO items_fts (id, user_id, source, keyword_tokens) VALUES (?, ?, ?, ?)`
          )
            .bind(problemId, userId, (body['source'] as string) || 'iOS Shortcut', keywordTokensStr)
            .run();
        } else {
          // AI Failed -> Silent Fallback to status 'unsolved', topic_id null
          await c.env.DB.prepare(
            `UPDATE items SET status = 'unsolved', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          )
            .bind(problemId)
            .run();
        }
      } catch (err) {
        console.error('[AI Processing Error]', err);
        await c.env.DB.prepare(
          `UPDATE items SET status = 'unsolved', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        )
          .bind(problemId)
          .run();
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
  const status = c.req.query('status');

  const decodedCursor = cursorParam ? decodeCursor(cursorParam) : null;

  let query = 'SELECT * FROM items WHERE user_id = ?';
  const bindings: any[] = [userId];

  if (topicId) {
    query += ' AND topic_id = ?';
    bindings.push(topicId);
  }

  if (status) {
    query += ' AND status = ?';
    bindings.push(status);
  }

  if (decodedCursor) {
    query += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
    bindings.push(decodedCursor.created_at, decodedCursor.created_at, decodedCursor.id);
  }

  query += ' ORDER BY created_at DESC, id DESC LIMIT ?';
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

  if (!item || item.user_id !== userId) {
    return c.json({ error: { code: 'NOT_FOUND', message: '題目或圖片不存在' } }, 404);
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

// 5. Update Metadata (Manual Edit)
problemsRouter.put('/:id', async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');
  const body = await c.req.json();

  const { topic_id, keywords, source } = body;

  const item = await c.env.DB.prepare('SELECT id FROM items WHERE id = ? AND user_id = ?')
    .bind(problemId, userId)
    .first();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '找不到題目' } }, 404);
  }

  const keywordsStr = Array.isArray(keywords) ? JSON.stringify(keywords) : keywords;
  const keywordTokensStr = Array.isArray(keywords) ? keywords.join(' ') : (keywords || '');

  await c.env.DB.prepare(
    `UPDATE items
     SET topic_id = ?, keywords = ?, keyword_tokens = ?, source = COALESCE(?, source), updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  )
    .bind(topic_id || null, keywordsStr || null, keywordTokensStr || null, source || null, problemId, userId)
    .run();

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
  await c.env.DB.prepare('DELETE FROM items WHERE id = ? AND user_id = ?').bind(problemId, userId).run();
  await c.env.DB.prepare('DELETE FROM items_fts WHERE id = ?').bind(problemId).run();

  return c.json({ status: 'deleted' });
});

// 7. Save Canvas Draw Data (Vector Clock Conflict Check)
problemsRouter.patch('/:id/draw', async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');
  const body = await c.req.json();

  const { draw_data, vector_clock } = body;

  const current = await c.env.DB.prepare(
    'SELECT draw_data, vector_clock FROM items WHERE id = ? AND user_id = ?'
  )
    .bind(problemId, userId)
    .first<ItemRow>();

  if (!current) {
    return c.json({ error: { code: 'NOT_FOUND', message: '找不到題目' } }, 404);
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

  if (incomingSeq >= currentSeq) {
    const drawDataStr = typeof draw_data === 'string' ? draw_data : JSON.stringify(draw_data);
    const vcStr = typeof vector_clock === 'string' ? vector_clock : JSON.stringify(vector_clock);

    await c.env.DB.prepare(
      `UPDATE items SET draw_data = ?, vector_clock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
    )
      .bind(drawDataStr, vcStr, problemId, userId)
      .run();

    return c.json({ status: 'ok' }, 200);
  } else {
    return c.json(
      {
        status: 'conflict',
        current: {
          draw_data: current.draw_data,
          vector_clock: current.vector_clock,
        },
      },
      409
    );
  }
});

// 8. Toggle Problem Status
problemsRouter.patch('/:id/status', async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');
  const body = await c.req.json();

  const { status } = body; // 'unsolved' | 'resolved'
  if (status !== 'unsolved' && status !== 'resolved') {
    return c.json({ error: { code: 'INVALID_REQUEST', message: '狀態必須為 unsolved 或 resolved' } }, 400);
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
