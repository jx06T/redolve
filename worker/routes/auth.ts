import { Hono } from 'hono';
import { Bindings, Variables, UserRow } from '../types';

export const authRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// 1. Get Current Authenticated User Session
authRouter.get('/me', async (c) => {
  const userId = c.get('userId');

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

// 2. Login or Switch User Account
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

// 3. List Registered Users for Quick Account Switching (Dev & Testing)
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

// 4. Logout
authRouter.post('/logout', async (c) => {
  return c.json({ status: 'ok', message: '已成功登出' });
});
