import { Hono } from 'hono';
import { Bindings, Variables, UserRow } from '../types';
import { optionalAuthMiddleware, createAuthJwt } from '../middleware/auth';

export const authRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** Validate if the frontend URL belongs to trusted local, LAN, or production domains */
function isValidFrontendOrigin(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname;
    // 1. Localhost & Loopback
    if (host === 'localhost' || host === '127.0.0.1') return true;
    // 2. Private LAN IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x, *.local)
    if (/^(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/.test(host)) return true;
    // 3. Trusted Production & Preview Domains
    if (host === 'redolve.pages.dev' || host.endsWith('.redolve.pages.dev')) return true;
    if (host === 'jx06t.com' || host.endsWith('.jx06t.com')) return true;
  } catch {}
  return false;
}

// 1. Get Current Authenticated User Session
authRouter.get('/me', optionalAuthMiddleware, async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({
      status: 'ok',
      user: null,
      isGuest: true,
    });
  }

  let user: UserRow | null = null;
  try {
    user = await c.env.DB.prepare(
      'SELECT id, email, name, created_at FROM users WHERE id = ?'
    ).bind(userId).first<UserRow>();
  } catch (err) {
    console.error('Failed to query user /me:', err);
  }

  if (!user) {
    return c.json({
      status: 'ok',
      user: null,
      isGuest: true,
    });
  }

  return c.json({
    status: 'ok',
    user,
    isGuest: false,
  });
});

// 2. Google OAuth 2.0 Auth URL Generator
authRouter.get('/google/url', (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return c.json({
      configured: false,
      message: '尚未配置 GOOGLE_CLIENT_ID。請在 .dev.vars 或 Cloudflare Secrets 設定。',
    });
  }

  const origin = new URL(c.req.url).origin;
  const redirectUri = `${origin}/api/auth/callback/google`;
  
  // Extract caller's frontend origin from query or referer header
  const referer = c.req.query('redirect_origin') || c.req.header('referer');
  let returnUrl = '';
  if (referer) {
    try {
      const parsed = new URL(referer);
      if (isValidFrontendOrigin(parsed.origin)) {
        returnUrl = parsed.origin;
      }
    } catch {}
  }

  // Encode state as JSON payload
  const stateObj = { csrf: crypto.randomUUID(), returnUrl };
  const state = btoa(JSON.stringify(stateObj));

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=openid%20email%20profile&state=${encodeURIComponent(state)}&prompt=select_account`;

  return c.json({
    configured: true,
    url: authUrl,
    state,
  });
});

// 3. Google OAuth 2.0 Callback Handler
authRouter.get('/callback/google', async (c) => {
  const code = c.req.query('code');
  const error = c.req.query('error');
  const rawState = c.req.query('state');

  // Decode state to find frontend origin securely
  let stateFrontendUrl = '';
  if (rawState) {
    try {
      const decoded = JSON.parse(atob(rawState));
      if (decoded.returnUrl && isValidFrontendOrigin(decoded.returnUrl)) {
        stateFrontendUrl = decoded.returnUrl;
      }
    } catch {}
  }

  const isLocal = c.req.url.includes('127.0.0.1') ||
    c.req.url.includes('localhost') ||
    /http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+)/.test(c.req.url);
  const frontendUrl = stateFrontendUrl || (isLocal ? (c.req.header('referer') && isValidFrontendOrigin(c.req.header('referer')!) ? new URL(c.req.header('referer')!).origin : 'http://localhost:3000') : (c.env.FRONTEND_URL || 'https://redolve.pages.dev'));

  if (error || !code) {
    return c.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent(error || '授權已取消')}`);
  }

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;

  if (!clientId) {
    return c.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent('後端 Worker 缺少 GOOGLE_CLIENT_ID 變數')}`);
  }

  if (!clientSecret) {
    return c.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent('後端 Worker 缺少 GOOGLE_CLIENT_SECRET 機密設定')}`);
  }

  const origin = new URL(c.req.url).origin;
  const redirectUri = `${origin}/api/auth/callback/google`;

  try {
    // Exchange Code for Access Token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('Google token exchange error:', errBody);
      return c.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent('Google 授權碼兌換失敗')}`);
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Fetch Google User Profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      return c.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent('無法獲取 Google 使用者資料')}`);
    }

    const profile: any = await profileRes.json();
    const googleId = profile.sub;
    const email = (profile.email || '').trim().toLowerCase();
    const name = profile.name || email.split('@')[0] || 'Google User';
    const userId = `usr_google_${googleId}`;

    // Upsert into D1 users
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, name)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email`
    ).bind(userId, email, name).run();

    // Generate cryptographic JWT token
    const token = await createAuthJwt({ id: userId, email, name }, c.env);

    // Redirect to frontend with secure JWT token
    return c.redirect(`${frontendUrl}/?auth_token=${encodeURIComponent(token)}&auth_name=${encodeURIComponent(name)}&auth_email=${encodeURIComponent(email)}`);
  } catch (err: any) {
    console.error('Google OAuth callback error:', err);
    return c.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent(err.message || 'Google 登入處理異常')}`);
  }
});

// 4. Google ID Token / One Tap Direct Verification
authRouter.post('/google/credential', async (c) => {
  const body = await c.req.json();
  const credential = body.credential || body.id_token;

  if (!credential) {
    return c.json({ error: { code: 'INVALID_INPUT', message: '請提供 Google Credential' } }, 400);
  }

  try {
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!verifyRes.ok) {
      return c.json({ error: { code: 'INVALID_TOKEN', message: '無效的 Google Token' } }, 401);
    }

    const tokenInfo: any = await verifyRes.json();
    const googleId = tokenInfo.sub;
    const email = (tokenInfo.email || '').trim().toLowerCase();
    const name = tokenInfo.name || email.split('@')[0] || 'Google User';
    const userId = `usr_google_${googleId}`;

    // Upsert into D1
    await c.env.DB.prepare(
      `INSERT INTO users (id, email, name)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email`
    ).bind(userId, email, name).run();

    const user = await c.env.DB.prepare(
      'SELECT id, email, name, created_at FROM users WHERE id = ?'
    ).bind(userId).first<UserRow>();

    const token = await createAuthJwt({ id: userId, email, name }, c.env);

    return c.json({
      status: 'ok',
      token,
      user,
    });
  } catch (err: any) {
    return c.json({ error: { code: 'AUTH_FAILED', message: err.message } }, 500);
  }
});

// 5. Logout
authRouter.post('/logout', async (c) => {
  return c.json({ status: 'ok', message: '已成功登出' });
});

