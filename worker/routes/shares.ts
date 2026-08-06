import { Hono } from 'hono';
import { Bindings, Variables, ShareRow, ItemRow } from '../types';
import { authMiddleware } from '../middleware/auth';

export const sharesRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// 自動為舊資料庫補上 allow_notes 欄位 (自動 Migration)
async function ensureAllowNotesColumn(db: D1Database) {
  try {
    await db.prepare('ALTER TABLE shares ADD COLUMN allow_notes INTEGER DEFAULT 1').run();
  } catch {
    // 欄位若已存在會拋出錯誤，直接忽略即可
  }
}

// 1. Create Share Token (Protected & Idempotent)
sharesRouter.post('/api/problems/:id/share', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const item = await c.env.DB.prepare('SELECT id FROM items WHERE id = ? AND user_id = ?')
    .bind(problemId, userId)
    .first();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '找不到題目' } }, 404);
  }

  await ensureAllowNotesColumn(c.env.DB);

  const allowInk = body.allow_ink === false ? 0 : 1;
  const allowNotes = body.allow_notes === false ? 0 : 1;
  const expiresAt = body.expires_at || null;

  // 💡 安全的重複網址檢查邏輯
  let existingShare: ShareRow | null = null;
  if (expiresAt) {
    existingShare = await c.env.DB.prepare(`
      SELECT token, expires_at, allow_ink, allow_notes
      FROM shares 
      WHERE item_id = ? 
        AND user_id = ? 
        AND allow_ink = ?
        AND (allow_notes IS NULL OR allow_notes = ?)
        AND expires_at = ?
      LIMIT 1
    `).bind(problemId, userId, allowInk, allowNotes, expiresAt).first<ShareRow>();
  } else {
    existingShare = await c.env.DB.prepare(`
      SELECT token, expires_at, allow_ink, allow_notes
      FROM shares 
      WHERE item_id = ? 
        AND user_id = ? 
        AND allow_ink = ?
        AND (allow_notes IS NULL OR allow_notes = ?)
        AND expires_at IS NULL
      LIMIT 1
    `).bind(problemId, userId, allowInk, allowNotes).first<ShareRow>();
  }

  if (existingShare) {
    return c.json({
      token: existingShare.token,
      allow_ink: Boolean(existingShare.allow_ink),
      allow_notes: Boolean(existingShare.allow_notes),
      expires_at: existingShare.expires_at
    });
  }

  const tokenBytes = crypto.getRandomValues(new Uint8Array(12));
  const tokenStr = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const token = `st_${tokenStr}`;

  await c.env.DB.prepare(
    'INSERT INTO shares (token, item_id, user_id, allow_ink, allow_notes, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(token, problemId, userId, allowInk, allowNotes, expiresAt)
    .run();

  return c.json({
    token,
    allow_ink: Boolean(allowInk),
    allow_notes: Boolean(allowNotes),
    expires_at: expiresAt
  });
});

// 2. Revoke Share Token (Protected)
sharesRouter.delete('/api/problems/:id/share/:token', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const token = c.req.param('token');

  await c.env.DB.prepare('DELETE FROM shares WHERE token = ? AND user_id = ?').bind(token, userId).run();

  return c.json({ status: 'revoked' });
});

// 3. Public Read-Only Metadata (Public Route)
sharesRouter.get('/share/:token', async (c) => {
  const token = c.req.param('token');

  const share = await c.env.DB.prepare('SELECT * FROM shares WHERE token = ?').bind(token).first<ShareRow & { allow_notes?: number }>();

  if (!share) {
    return c.json({ error: { code: 'NOT_FOUND', message: '分享連結不存在或已被撤銷' } }, 404);
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return c.json({ error: { code: 'SHARE_EXPIRED', message: '此分享連結已過期' } }, 410);
  }

  const item = await c.env.DB.prepare('SELECT id, type, topic_id, keywords, source, draw_data, typed_notes, status, created_at FROM items WHERE id = ?')
    .bind(share.item_id)
    .first<Partial<ItemRow>>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '分享的題目已遭刪除' } }, 404);
  }

  // 💡 權限控管：如果不允許筆跡或筆記，回傳 null 隱藏欄位！
  const shouldShowInk = Boolean(share.allow_ink);
  const shouldShowNotes = share.allow_notes !== undefined ? Boolean(share.allow_notes) : true;

  return c.json({
    item: {
      ...item,
      draw_data: shouldShowInk ? item.draw_data : null,
      typed_notes: shouldShowNotes ? item.typed_notes : null,
    },
    share: {
      token: share.token,
      allow_ink: shouldShowInk,
      allow_notes: shouldShowNotes,
    },
  });
});

// 4. Public Read-Only Image Proxy (Public Route)
sharesRouter.get('/share/:token/image', async (c) => {
  const token = c.req.param('token');

  const share = await c.env.DB.prepare('SELECT item_id, expires_at FROM shares WHERE token = ?').bind(token).first<ShareRow>();

  if (!share) {
    return c.json({ error: { code: 'NOT_FOUND', message: '分享連結不存在' } }, 404);
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return c.json({ error: { code: 'SHARE_EXPIRED', message: '連結已過期' } }, 410);
  }

  const item = await c.env.DB.prepare('SELECT image_url FROM items WHERE id = ?').bind(share.item_id).first<ItemRow>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '圖片不存在' } }, 404);
  }

  const object = await c.env.STORAGE.get(item.image_url);
  if (!object) {
    return c.json({ error: { code: 'NOT_FOUND', message: '圖片檔案不存在' } }, 404);
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
});