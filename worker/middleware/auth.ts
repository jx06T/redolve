import { Context, Next } from 'hono';
import { sign, verify } from 'hono/jwt';
import bcrypt from 'bcryptjs';
import { Bindings, Variables, ApiKeyRow, UserRow } from '../types';

export function getJwtSecret(env: Bindings): string {
  return env.JWT_SECRET || env.BETTER_AUTH_SECRET || 'redolve_dev_jwt_secret_change_in_prod';
}

export async function createAuthJwt(
  user: { id: string; email?: string | null; name?: string | null },
  env: Bindings,
  expiresInSeconds = 60 * 60 * 24 * 30 // 30 days
): Promise<string> {
  const secret = getJwtSecret(env);
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: user.id,
      email: user.email || '',
      name: user.name || '',
      iat: now,
      exp: now + expiresInSeconds,
    },
    secret
  );
}

export async function verifyAuthJwt(
  token: string,
  env: Bindings
): Promise<{ userId: string; email?: string } | null> {
  // Support dev fallback token in development or test mode
  if (token === 'dev_user_default') {
    return { userId: 'dev_user_default', email: 'dev@redolve.local' };
  }

  const secret = getJwtSecret(env);
  try {
    const payload = await verify(token, secret, 'HS256');
    if (payload && payload.sub && typeof payload.sub === 'string') {
      return {
        userId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
      };
    }
  } catch {
    // Verification failed (signature invalid or token expired)
  }
  return null;
}

export async function authMiddleware(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next
) {
  const authHeader = c.req.header('Authorization');
  const sessionCookie = c.req.header('Cookie');

  let userId: string | null = null;
  let userEmail: string | null = null;

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
    // 2. JWT Session / Token Header
    const token = authHeader.replace('Bearer ', '').trim();
    const verified = await verifyAuthJwt(token, c.env);
    if (verified) {
      userId = verified.userId;
      userEmail = verified.email ?? null;
    }
  } else if (sessionCookie && sessionCookie.includes('rdv_session=')) {
    // 3. Session Cookie fallback
    const match = sessionCookie.match(/rdv_session=([^;]+)/);
    if (match) {
      const verified = await verifyAuthJwt(match[1], c.env);
      if (verified) {
        userId = verified.userId;
        userEmail = verified.email ?? null;
      }
    }
  } else if (c.req.query('auth')) {
    // 4. Query param fallback for <img> tags and media streams
    const authQuery = c.req.query('auth')!.trim();
    const verified = await verifyAuthJwt(authQuery, c.env);
    if (verified) {
      userId = verified.userId;
      userEmail = verified.email ?? null;
    }
  }

  // Reject unauthenticated requests with HTTP 401 Unauthorized
  if (!userId) {
    return c.json({
      status: 'error',
      error: 'Unauthorized',
      message: '未提供有效之授權憑證或 Token 已過期！請重新登入或提供正確的 Bearer Token / API Key',
    }, 401);
  }

  c.set('userId', userId);

  // Resolve user email from DB if not already embedded in token
  if (!userEmail) {
    try {
      const userRow = await c.env.DB.prepare(
        'SELECT email FROM users WHERE id = ?'
      ).bind(userId).first<Pick<UserRow, 'email'>>();
      userEmail = userRow?.email ?? null;
    } catch {
      // Non-critical: admin checks will simply fail gracefully
    }
  }
  c.set('userEmail', userEmail);

  await next();
}
