import { cors } from 'hono/cors';
import { Bindings } from '../types';

// Production origins that are always permitted without a secret injection.
const STATIC_ALLOWED_ORIGINS = [
  'https://redolve.pages.dev',
  'https://redolve.jx06t.com',
  'https://redolve-api.50313tjx06.workers.dev',
];

export const corsMiddleware = cors({
  origin: (origin, c) => {
    // No origin header — allow (same-origin / server-to-server calls)
    if (!origin) return '*';

    // Build the full allowed list: static defaults + runtime secret overrides
    const envOrigins = (c.env as Bindings).ALLOWED_ORIGINS;
    const dynamicOrigins = envOrigins?.split(',').map((s: string) => s.trim()) ?? [];
    const allowed = [...STATIC_ALLOWED_ORIGINS, ...dynamicOrigins];

    const requestHost = new URL(c.req.url).hostname;
    if (requestHost === 'localhost' || requestHost === '127.0.0.1') {
      if (['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'].includes(origin)) {
        return origin;
      }
    }

    if (allowed.includes(origin)) {
      return origin;
    }

    // Reject unknown origins
    return null;
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
});
