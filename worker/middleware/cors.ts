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

    // Always permit local development origins
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return origin;
    }

    // Build the full allowed list: static defaults + runtime secret overrides
    const envOrigins = (c.env as Bindings).ALLOWED_ORIGINS;
    const dynamicOrigins = envOrigins?.split(',').map((s: string) => s.trim()) ?? [];
    const allowed = [...STATIC_ALLOWED_ORIGINS, ...dynamicOrigins];

    // Allow Cloudflare Pages preview deployments (*.redolve.pages.dev) and custom domain subdomains (*.jx06t.com)
    if (origin.endsWith('.redolve.pages.dev') || origin.endsWith('.jx06t.com') || origin === 'https://jx06t.com') {
      return origin;
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
