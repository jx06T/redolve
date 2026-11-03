import { Context } from 'hono';
import { Bindings, Variables } from '../types';
import { AIProviderError } from '../services/ai/providerError';

export function errorHandler(err: Error, c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  if(err instanceof AIProviderError){
    console.warn('[AIProvider] API unavailable',err.diagnostic);
    return c.json({error:{code:err.code,message:err.message,retryable:err.diagnostic.retryable}},503);
  }
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
