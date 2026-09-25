import { Hono } from 'hono';
import { Bindings, Variables } from './types';
import { errorHandler } from './middleware/error';
import { corsMiddleware } from './middleware/cors';
import { adminRouter } from './routes/admin';
import { problemsRouter } from './routes/problems';
import { keysRouter } from './routes/keys';
import { sharesRouter } from './routes/shares';
import { searchRouter } from './routes/search';
import { dashboardRouter } from './routes/dashboard';
import { authRouter } from './routes/auth';
import { taxonomyRouter } from './routes/taxonomy';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Global Middlewares
app.use('*', corsMiddleware);
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/share/')) {
    c.header('Cache-Control', 'no-store');
  }
});
app.onError(errorHandler);

// Health Check
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'Redolve API Engine',
    version: '1.3.0',
    timestamp: new Date().toISOString(),
  });
});

// Route Modules
app.route('/api/auth', authRouter);
app.route('/api/taxonomy', taxonomyRouter);
app.route('/api/admin', adminRouter);
app.route('/api/problems', problemsRouter);
app.route('/api/keys', keysRouter);
app.route('/api/search', searchRouter);
app.route('/api/dashboard', dashboardRouter);
app.route('/', sharesRouter);

// SPA fallback returns index.html with HTTP 200 even for a removed CSS/JS hash.
// Route hashed assets through the Worker so HTML can never masquerade as CSS.
app.get('/assets/*', async (c) => {
  if (!c.env.ASSETS) return c.text('Static assets unavailable', 404);
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  const path = c.req.path;
  const type = asset.headers.get('Content-Type') || '';
  const validType = path.endsWith('.css')
    ? /^text\/css\b/i.test(type)
    : path.endsWith('.js')
      ? /(?:java|ecma)script/i.test(type)
      : !/^text\/html\b/i.test(type);
  if (!asset.ok || !validType) {
    return new Response('Static asset not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  const headers = new Headers(asset.headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(asset.body, { status: asset.status, headers });
});

// Static Assets Fallback for non-API routes
app.notFound(async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not Found', 404);
});

export default app;
