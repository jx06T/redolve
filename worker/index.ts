import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  STORAGE: R2Bucket;
  GEMINI_API_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

// Health Check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', service: 'Redolve API Engine', timestamp: new Date().toISOString() });
});

// Mock or Scaffold API Routes
app.get('/api/problems', async (c) => {
  return c.json({ items: [], total: 0 });
});

export default app;
