import { cors } from 'hono/cors';
import { Bindings } from '../types';

export const corsMiddleware = cors({
  origin: (origin, c) => {
    if (!origin) return '*';
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return origin;
    }
    const envOrigins = (c.env as Bindings).ALLOWED_ORIGINS;
    const allowed = envOrigins?.split(',').map((s: string) => s.trim()) ?? [];
    if (allowed.includes(origin)) {
      return origin;
    }
    // Default fallback for preview / worker testing
    return origin;
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
});
