import { Context, Next } from 'hono';
import { sign, verify } from 'hono/jwt';
import bcrypt from 'bcryptjs';
import { Bindings, Variables, ApiKeyRow, UserRow } from '../types';

export function getJwtSecret(env: Bindings): string {
  const secret = env.JWT_SECRET || env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  return secret;
}

export async function createAuthJwt(
  user: { id: string; email?: string | null; name?: string | null },
  env: Bindings,
  expiresInSeconds = 60 * 60 * 24 * 7
): Promise<string> {
  const secret = getJwtSecret(env);
  const now = Math.floor(Date.now() / 1000);
  const sessionId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO auth_sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(sessionId, user.id, now + expiresInSeconds).run();
  return sign(
    {
      sub: user.id,
      email: user.email || '',
      name: user.name || '',
      iat: now,
      exp: now + expiresInSeconds,
      sid: sessionId,
    },
    secret
  );
}

export async function verifyAuthJwt(
  token: string,
  env: Bindings
): Promise<{ userId: string; email?: string; sessionId: string } | null> {
  const secret = getJwtSecret(env);
  try {
    const payload = await verify(token, secret, 'HS256');
    if (payload && typeof payload.sub === 'string' && typeof payload.sid === 'string') {
      const session = await env.DB.prepare(
        'SELECT id FROM auth_sessions WHERE id = ? AND user_id = ? AND expires_at > ?'
      ).bind(payload.sid, payload.sub, Math.floor(Date.now() / 1000)).first();
      if (!session) return null;
      return {
        userId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        sessionId: payload.sid,
      };
    }
  } catch {
    // Verification failed (signature invalid or token expired)
  }
  return null;
}

export async function resolveAuthCredentials(
  c: Context<{ Bindings: Bindings; Variables: Variables }>
): Promise<{ userId: string | null; userEmail: string | null; viaCookie: boolean }> {
  const authHeader = c.req.header('Authorization');
  const sessionCookie = c.req.header('Cookie');

  let userId: string | null = null;
  let userEmail: string | null = null;
  let viaCookie = false;

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
        viaCookie = true;
      }
    }
  }

  // Resolve user email from DB if not already embedded in token
  if (userId && !userEmail) {
    try {
      const userRow = await c.env.DB.prepare(
        'SELECT email FROM users WHERE id = ?'
      ).bind(userId).first<Pick<UserRow, 'email'>>();
      userEmail = userRow?.email ?? null;
    } catch {
      // Non-critical
    }
  }

  return { userId, userEmail, viaCookie };
}

export async function authMiddleware(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next
) {
  const { userId, userEmail, viaCookie } = await resolveAuthCredentials(c);

  // Reject unauthenticated requests with HTTP 401 Unauthorized
  if (!userId) {
    return c.json({
      status: 'error',
      error: 'Unauthorized',
      message: '未提供有效之授權憑證或 Token 已過期！請重新登入或提供正確的 Bearer Token / API Key',
    }, 401);
  }

  if (viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('Origin');
    const allowed = [new URL(c.req.url).origin, 'https://redolve.jx06t.com', 'https://redolve.pages.dev', c.env.FRONTEND_URL, ...(c.env.ALLOWED_ORIGINS?.split(',') || [])]
      .filter(Boolean).map((value) => value!.trim());
    if (['localhost', '127.0.0.1'].includes(new URL(c.req.url).hostname)) {
      allowed.push('http://localhost:3000', 'http://localhost:5173');
    }
    if (!origin || !allowed.includes(origin)) {
      return c.json({ error: { code: 'INVALID_ORIGIN', message: '請求來源不受信任' } }, 403);
    }
  }

  c.set('userId', userId);
  c.set('userEmail', userEmail);

  await next();
}

export async function optionalAuthMiddleware(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next
) {
  const { userId, userEmail } = await resolveAuthCredentials(c);
  c.set('userId', userId || '');
  c.set('userEmail', userEmail || '');
  await next();
}
