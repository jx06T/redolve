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

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Global Middlewares
app.use('*', corsMiddleware);
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
app.route('/api/admin', adminRouter);
app.route('/api/problems', problemsRouter);
app.route('/api/keys', keysRouter);
app.route('/api/search', searchRouter);
app.route('/api/dashboard', dashboardRouter);
app.route('/', sharesRouter);

export default app;
