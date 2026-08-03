import { Hono } from 'hono';
import { Bindings, Variables, ItemRow } from '../types';
import { authMiddleware } from '../middleware/auth';

export const searchRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

searchRouter.use('*', authMiddleware);

searchRouter.get('/', async (c) => {
  const userId = c.get('userId');
  const query = c.req.query('q')?.trim();

  if (!query) {
    return c.json({ items: [] });
  }

  const likePattern = `%${query}%`;

  try {
    const { results } = await c.env.DB.prepare(
      `SELECT i.* FROM items i
       JOIN items_fts fts ON i.id = fts.id
       WHERE fts.keyword_tokens MATCH ? AND i.user_id = ?
       UNION
       SELECT i.* FROM items i, JSON_EACH(i.keywords) kw
       WHERE kw.value LIKE ? AND i.user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`
    )
      .bind(query, userId, likePattern, userId)
      .all<ItemRow>();

    return c.json({ items: results || [] });
  } catch (err) {
    // Fallback if FTS table has syntax error or missing match
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM items WHERE user_id = ? AND (source LIKE ? OR keywords LIKE ?) ORDER BY created_at DESC LIMIT 50`
    )
      .bind(userId, likePattern, likePattern)
      .all<ItemRow>();

    return c.json({ items: results || [] });
  }
});
