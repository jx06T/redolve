import { Context } from 'hono';
import { Bindings, Variables } from '../types';

export function errorHandler(err: Error, c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  console.error('[Worker Error]', err);
  const isDev = c.env.ENV === 'development';
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: '伺服器發生錯誤，請稍後再試',
        details: isDev ? err.message : undefined,
      },
    },
    500
  );
}
