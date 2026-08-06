import { Hono } from 'hono';
import { Bindings, Variables, ShareRow, ItemRow } from '../types';
import { authMiddleware } from '../middleware/auth';

export const sharesRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// 1. Create Share Token (Protected)
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

  const allowInk = body.allow_ink === false ? 0 : 1;
  const expiresAt = body.expires_at || null;

  const existingShare = await c.env.DB.prepare(`
    SELECT token, expires_at 
    FROM shares 
    WHERE item_id = ? 
      AND user_id = ? 
      AND allow_ink = ?
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      -- 如果前端有傳 expiresAt，也要確認過期時間是否一致 (這裡簡化為如果兩者都是 null 就當作一致)
      AND (expires_at IS ? OR expires_at = ?) 
    LIMIT 1
  `).bind(problemId, userId, allowInk, expiresAt, expiresAt).first<ShareRow>();

  if (existingShare) {
    // 如果已經有完全一模一樣的分享設定，直接回傳舊的 Token！
    return c.json({
      token: existingShare.token,
      allow_ink: allowInk,
      expires_at: existingShare.expires_at
    });
  }

  const tokenBytes = crypto.getRandomValues(new Uint8Array(12));
  const tokenStr = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const token = `st_${tokenStr}`;


  await c.env.DB.prepare(
    'INSERT INTO shares (token, item_id, user_id, allow_ink, expires_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(token, problemId, userId, allowInk, expiresAt)
    .run();

  return c.json({ token, allow_ink: allowInk, expires_at: expiresAt });
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

  const share = await c.env.DB.prepare('SELECT * FROM shares WHERE token = ?').bind(token).first<ShareRow>();

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

  return c.json({
    item: {
      ...item,
      draw_data: Boolean(share.allow_ink) ? item.draw_data : null,
    },
    share: {
      token: share.token,
      allow_ink: Boolean(share.allow_ink),
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
