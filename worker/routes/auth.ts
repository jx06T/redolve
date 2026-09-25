import { Context, Hono } from 'hono';
import { Bindings, Variables, UserRow } from '../types';
import { authMiddleware, optionalAuthMiddleware, createAuthJwt, verifyAuthJwt } from '../middleware/auth';

export const authRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const OAUTH_MAX_AGE = 10 * 60;

function cookieValue(header: string | undefined, name: string): string | null {
  const match = header?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function cookie(name: string, value: string, maxAge: number, secure: boolean, path = '/'): string {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function trustedFrontendOrigin(candidate: string | null, c: { req: { url: string }; env: Bindings }): string | null {
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    const requestOrigin = new URL(c.req.url).origin;
    const trusted = [requestOrigin, 'https://redolve.jx06t.com', 'https://redolve.pages.dev', c.env.FRONTEND_URL]
      .filter(Boolean);
    if (new URL(c.req.url).hostname === 'localhost' || new URL(c.req.url).hostname === '127.0.0.1') {
      trusted.push('http://localhost:3000', 'http://localhost:5173');
    }
    return trusted.includes(parsed.origin) && parsed.pathname === '/' && !parsed.search && !parsed.hash
      ? parsed.origin : null;
  } catch {
    return null;
  }
}

function finishOAuth(c: Context<{ Bindings: Bindings; Variables: Variables }>, frontendUrl: string, query: string, sessionToken?: string) {
  const secure = new URL(c.req.url).protocol === 'https:';
  const response: Response = c.redirect(`${frontendUrl}/?${query}`);
  response.headers.append('Set-Cookie', cookie('rdv_oauth_state', '', 0, secure, '/api/auth'));
  response.headers.append('Set-Cookie', cookie('rdv_oauth_return', '', 0, secure, '/api/auth'));
  if (sessionToken) response.headers.append('Set-Cookie', cookie('rdv_session', sessionToken, SESSION_MAX_AGE, secure));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

authRouter.get('/me', optionalAuthMiddleware, async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ status: 'ok', user: null, isGuest: true });
  const user = await c.env.DB.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?')
    .bind(userId).first<UserRow>();
  return c.json({ status: 'ok', user: user || null, isGuest: !user });
});

authRouter.get('/google/url', (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) return c.json({ configured: false, message: '尚未配置 GOOGLE_CLIENT_ID。' });

  const requestOrigin = new URL(c.req.url).origin;
  const referer = c.req.query('redirect_origin') || c.req.header('referer') || null;
  let requestedOrigin: string | null = null;
  try { requestedOrigin = referer ? new URL(referer).origin : null; } catch { /* use same origin */ }
  const returnUrl = trustedFrontendOrigin(requestedOrigin, c) || trustedFrontendOrigin(c.env.FRONTEND_URL || null, c) || requestOrigin;
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${requestOrigin}/api/auth/callback/google`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  const response = c.json({ configured: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  const secure = new URL(c.req.url).protocol === 'https:';
  response.headers.append('Set-Cookie', cookie('rdv_oauth_state', state, OAUTH_MAX_AGE, secure, '/api/auth'));
  response.headers.append('Set-Cookie', cookie('rdv_oauth_return', returnUrl, OAUTH_MAX_AGE, secure, '/api/auth'));
  return response;
});

authRouter.get('/callback/google', async (c) => {
  const state = c.req.query('state');
  const savedState = cookieValue(c.req.header('Cookie'), 'rdv_oauth_state');
  if (!state || !savedState || state !== savedState) {
    return c.json({ error: { code: 'INVALID_OAUTH_STATE', message: '登入驗證已過期，請重新操作' } }, 400);
  }

  const returnUrl = cookieValue(c.req.header('Cookie'), 'rdv_oauth_return');
  const frontendUrl = trustedFrontendOrigin(returnUrl, c) || new URL(c.req.url).origin;
  const error = c.req.query('error');
  const code = c.req.query('code');
  if (error || !code) return finishOAuth(c, frontendUrl, `auth_error=${encodeURIComponent(error || '授權已取消')}`);
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    return finishOAuth(c, frontendUrl, `auth_error=${encodeURIComponent('Google 登入尚未設定完成')}`);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${new URL(c.req.url).origin}/api/auth/callback/google`,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) throw new Error('Google 授權碼兌換失敗');
    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) throw new Error('Google 未提供存取憑證');
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!profileRes.ok) throw new Error('無法取得 Google 使用者資料');
    const profile = await profileRes.json() as { sub?: string; email?: string; name?: string; email_verified?: boolean };
    if (!profile.sub || !profile.email || profile.email_verified !== true) throw new Error('Google 帳號資料未通過驗證');
    const email = profile.email.trim().toLowerCase();
    const name = profile.name || email.split('@')[0];
    const userId = `usr_google_${profile.sub}`;
    await c.env.DB.prepare(
      'INSERT INTO users (id, email, name) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email'
    ).bind(userId, email, name).run();
    const sessionToken = await createAuthJwt({ id: userId, email, name }, c.env);
    return finishOAuth(c, frontendUrl, 'auth=success', sessionToken);
  } catch (err) {
    console.error('Google OAuth callback failed:', err);
    return finishOAuth(c, frontendUrl, `auth_error=${encodeURIComponent('Google 登入處理失敗')}`);
  }
});

// The unused One Tap endpoint was removed because it did not verify the ID token audience.

authRouter.post('/logout', authMiddleware, async (c) => {
  const token = cookieValue(c.req.header('Cookie'), 'rdv_session');
  const session = token ? await verifyAuthJwt(token, c.env) : null;
  if (session) await c.env.DB.prepare('DELETE FROM auth_sessions WHERE id = ? AND user_id = ?')
    .bind(session.sessionId, session.userId).run();
  const response = c.json({ status: 'ok', message: '已成功登出' });
  response.headers.append('Set-Cookie', cookie('rdv_session', '', 0, new URL(c.req.url).protocol === 'https:'));
  return response;
});
