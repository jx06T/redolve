import { Context, Next } from 'hono';
import bcrypt from 'bcryptjs';
import { Bindings, Variables, ApiKeyRow, UserRow } from '../types';

export async function authMiddleware(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next
) {
  const authHeader = c.req.header('Authorization');
  const sessionCookie = c.req.header('Cookie');

  let userId: string | null = null;

  // 1. API Key Authentication (Bearer rdv_...)
  if (authHeader && authHeader.startsWith('Bearer rdv_')) {
    const rawKey = authHeader.replace('Bearer ', '').trim();
    const keyPrefix = rawKey.substring(0, 8);

    const { results } = await c.env.DB.prepare(
      'SELECT key_hash, key_prefix, user_id FROM api_keys WHERE key_prefix = ?'
    ).bind(keyPrefix).all<ApiKeyRow>();

    if (results && results.length > 0) {
      for (const row of results) {
        const matches = await bcrypt.compare(rawKey, row.key_hash);
        if (matches) {
          userId = row.user_id;
          break;
        }
      }
    }
    if (!userId) {
      return c.json({
        status: 'error',
        error: 'Unauthorized',
        message: '無效或已過期的 API Key (rdv_...)，請檢查授權標頭',
      }, 401);
    }
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    // Custom Session / Token Header
    const token = authHeader.replace('Bearer ', '').trim();
    if (token.length > 0) {
      userId = token; // or verify session JWT/Cookie
    }
  } else if (sessionCookie && sessionCookie.includes('rdv_session=')) {
    // Session Cookie fallback
    const match = sessionCookie.match(/rdv_session=([^;]+)/);
    if (match) {
      userId = match[1];
    }
  } else if (c.req.query('auth')) {
    // Query param fallback for <img> tags and media streams
    const authQuery = c.req.query('auth')!.trim();
    if (authQuery.length > 0) {
      userId = authQuery;
    }
  }

  // Reject unauthenticated requests with HTTP 401 Unauthorized
  if (!userId) {
    return c.json({
      status: 'error',
      error: 'Unauthorized',
      message: '未提供授權憑證！請在 Header 加上 "Authorization: Bearer <your_token>" 或 "Authorization: Bearer <your_api_key>"',
    }, 401);
  }

  c.set('userId', userId);

  // Resolve user email from DB for admin whitelist checks
  let userEmail: string | null = null;
  try {
    const userRow = await c.env.DB.prepare(
      'SELECT email FROM users WHERE id = ?'
    ).bind(userId).first<Pick<UserRow, 'email'>>();
    userEmail = userRow?.email ?? null;
  } catch {
    // Non-critical: admin checks will simply fail gracefully
  }
  c.set('userEmail', userEmail);

  await next();
}
