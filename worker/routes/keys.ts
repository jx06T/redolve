import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { Bindings, Variables, ApiKeyRow } from '../types';
import { authMiddleware } from '../middleware/auth';

export const keysRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

keysRouter.use('*', authMiddleware);

// Generate New API Key
keysRouter.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => ({}));
  const description = body.description || 'iPad 捷徑 Key';

  const randomBytes = crypto.getRandomValues(new Uint8Array(18));
  const randomStr = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const rawKey = `rdv_${randomStr}`;
  const keyPrefix = rawKey.substring(0, 8);

  const keyHash = await bcrypt.hash(rawKey, 10);

  await c.env.DB.prepare(
    'INSERT INTO api_keys (key_hash, key_prefix, user_id, description) VALUES (?, ?, ?, ?)'
  )
    .bind(keyHash, keyPrefix, userId, description)
    .run();

  return c.json({
    key: rawKey,
    key_prefix: keyPrefix,
    description,
    message: '金鑰已生成，請妥善保管。此明文僅顯示一次。',
  });
});

// List API Keys (Masked, key_hash hidden for security)
keysRouter.get('/', async (c) => {
  const userId = c.get('userId');

  const { results } = await c.env.DB.prepare(
    'SELECT key_prefix, description, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(userId)
    .all<Omit<ApiKeyRow, 'key_hash' | 'user_id'>>();

  return c.json({
    keys: results || [],
  });
});

// Delete / Revoke API Key (by key_prefix)
keysRouter.delete('/:prefix', async (c) => {
  const userId = c.get('userId');
  const prefixOrHash = c.req.param('prefix');

  // Support deletion by prefix or fallback hash
  await c.env.DB.prepare(
    'DELETE FROM api_keys WHERE (key_prefix = ? OR key_hash = ?) AND user_id = ?'
  )
    .bind(prefixOrHash, prefixOrHash, userId)
    .run();

  return c.json({ status: 'revoked' });
});

