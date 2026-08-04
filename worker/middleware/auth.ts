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
  }

  // Development Fallback User ID
  if (!userId) {
    const defaultDevUser = 'dev_user_default';
    // Ensure default dev user exists in database
    try {
      await c.env.DB.prepare(
        'INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, ?)'
      ).bind(defaultDevUser, 'dev@redolve.local', 'Default Developer').run();
    } catch {
      // ignore table errors
    }
    userId = defaultDevUser;
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
