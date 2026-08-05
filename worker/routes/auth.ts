import { Hono } from 'hono';
import { Bindings, Variables, UserRow } from '../types';
import { authMiddleware } from '../middleware/auth';

export const authRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// 1. Get Current Authenticated User Session
authRouter.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId') || 'dev_user_default';

  let user: UserRow | null = null;
  try {
    user = await c.env.DB.prepare(
      'SELECT id, email, name, created_at FROM users WHERE id = ?'
    ).bind(userId).first<UserRow>();
  } catch (err) {
    console.error('Failed to query user /me:', err);
  }

  if (!user) {
    // Default fallback
    user = {
      id: userId || 'dev_user_default',
      email: 'dev@redolve.local',
      name: 'Default Developer',
      created_at: new Date().toISOString(),
    };
  }

  return c.json({
    status: 'ok',
    user,
    isDevFallback: user.id === 'dev_user_default',
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
  const state = crypto.randomUUID();

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=openid%20email%20profile&state=${state}&prompt=select_account`;

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

  // 【新增】判斷前端 URL
  // 如果在本地端開發 (127.0.0.1 或 localhost)，就導向 Vite 的 3000 埠
  // 如果是正式上線，建議在 .dev.vars 加上 FRONTEND_URL 變數，或者預設導向 Worker 的首頁
  const isLocal = c.req.url.includes('127.0.0.1') || c.req.url.includes('localhost');
  const frontendUrl = isLocal ? 'http://localhost:3000' : (c.env.FRONTEND_URL || '');

  if (error || !code) {
    return c.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent(error || '授權已取消')}`);
  }

  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return c.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent('後端缺少 GOOGLE_CLIENT_ID 或 GOOGLE_CLIENT_SECRET 設定')}`);
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

    // 【修正】將使用者正確導向前端首頁，並附帶 Token 參數
    return c.redirect(`${frontendUrl}/?auth_token=${encodeURIComponent(userId)}&auth_name=${encodeURIComponent(name)}&auth_email=${encodeURIComponent(email)}`);
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

    return c.json({
      status: 'ok',
      token: userId,
      user,
    });
  } catch (err: any) {
    return c.json({ error: { code: 'AUTH_FAILED', message: err.message } }, 500);
  }
});

// 5. Standard Email / Account Switch
authRouter.post('/login', async (c) => {
  const body = await c.req.json();
  const email = (body.email || '').trim().toLowerCase();
  const name = (body.name || '').trim() || (email ? email.split('@')[0] : 'Redolve User');
  const customId = (body.userId || '').trim();

  if (!email && !customId) {
    return c.json({ error: { code: 'INVALID_INPUT', message: '請提供電子郵件或使用者 ID' } }, 400);
  }

  const userId = customId || `usr_${Math.random().toString(36).substring(2, 10)}`;
  const userEmail = email || `${userId}@redolve.local`;

  // Upsert user into D1
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, name)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email`
  ).bind(userId, userEmail, name).run();

  const user = await c.env.DB.prepare(
    'SELECT id, email, name, created_at FROM users WHERE id = ?'
  ).bind(userId).first<UserRow>();

  return c.json({
    status: 'ok',
    token: userId,
    user,
  });
});

// 6. List Registered Users for Quick Account Switching (Dev & Testing)
authRouter.get('/users', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT id, email, name, created_at FROM users ORDER BY created_at DESC LIMIT 20'
    ).all<UserRow>();

    return c.json({
      status: 'ok',
      users: results || [],
    });
  } catch (err) {
    return c.json({ status: 'ok', users: [] });
  }
});

// 7. Logout
authRouter.post('/logout', async (c) => {
  return c.json({ status: 'ok', message: '已成功登出' });
});
