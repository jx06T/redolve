import type { Context } from 'hono';
import type { Bindings, Variables } from '../types';

export const IMAGE_CACHE_CONTROL = 'private, no-cache';

// Call only after current ownership/access and asset state have been checked.
export async function authorizedImage(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  key: string,
  fallbackType = 'image/jpeg',
  extraHeaders?: HeadersInit,
): Promise<Response | null> {
  const condition = new Headers();
  const etag = c.req.header('If-None-Match');
  if (etag) condition.set('If-None-Match', etag);
  // Range/If-Match have different semantics, so forward only the cache validator.
  const object = await c.env.STORAGE.get(key, { onlyIf: condition });
  if (!object) return null;
  const headers = new Headers(extraHeaders);
  headers.set('Content-Type', object.httpMetadata?.contentType || fallbackType);
  headers.set('Cache-Control', IMAGE_CACHE_CONTROL);
  headers.set('ETag', object.httpEtag);
  headers.set('Vary', 'Cookie, Authorization');
  headers.set('X-Content-Type-Options', 'nosniff');
  c.set('revalidatedImage', true);
  return new Response('body' in object ? object.body : null, {
    status: 'body' in object ? 200 : 304,
    headers,
  });
}
