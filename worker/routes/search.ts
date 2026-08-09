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

  // FTS5 全表 MATCH 語法 (加上雙引號包夾防語法錯誤)
  const matchPattern = `"${query.replace(/"/g, '""')}"*`;
  // LIKE 模糊比對語法
  const likePattern = `%${query}%`;

  try {
    const { results } = await c.env.DB.prepare(
      `SELECT i.*,
         MAX(
           (CASE WHEN (i.keywords LIKE ? OR fts.keyword_tokens LIKE ?) THEN 100 ELSE 0 END) +
           (CASE WHEN fts.source LIKE ? THEN 60 ELSE 0 END) +
           (CASE WHEN fts.typed_notes LIKE ? THEN 40 ELSE 0 END) +
           (CASE WHEN (fts.problem_text LIKE ? OR fts MATCH ?) THEN 10 ELSE 0 END)
         ) AS relevance_score
       FROM items i
       JOIN items_fts fts ON i.id = fts.id
       WHERE i.user_id = ? 
       AND (
         i.keywords LIKE ?
         OR fts.keyword_tokens LIKE ?
         OR fts.source LIKE ?
         OR fts.typed_notes LIKE ?
         OR fts.problem_text LIKE ?
         OR fts MATCH ?
       )
       GROUP BY i.id
       ORDER BY relevance_score DESC, i.created_at DESC
       LIMIT 50`
    )
      .bind(
        likePattern,  // 1. i.keywords LIKE ? (Score)
        likePattern,  // 2. fts.keyword_tokens LIKE ? (Score)
        likePattern,  // 3. fts.source LIKE ? (Score)
        likePattern,  // 4. fts.typed_notes LIKE ? (Score)
        likePattern,  // 5. fts.problem_text LIKE ? (Score)
        matchPattern, // 6. fts MATCH ? (Score)
        userId,       // 7. i.user_id = ? (WHERE)
        likePattern,  // 8. i.keywords LIKE ? (WHERE)
        likePattern,  // 9. fts.keyword_tokens LIKE ? (WHERE)
        likePattern,  // 10. fts.source LIKE ? (WHERE)
        likePattern,  // 11. fts.typed_notes LIKE ? (WHERE)
        likePattern,  // 12. fts.problem_text LIKE ? (WHERE)
        matchPattern  // 13. fts MATCH ? (WHERE)
      )
      .all<ItemRow>();

    return c.json({ items: results || [] });
  } catch (err) {
    console.warn('[Search FTS Error, fallback to weighted LIKE]', err);

    // 💡 降級備用方案：如果 FTS 語法依然解析失敗，純用 LIKE 掃描，權重排序同理
    const { results } = await c.env.DB.prepare(
      `SELECT i.*,
         MAX(
           (CASE WHEN (i.keywords LIKE ? OR fts.keyword_tokens LIKE ?) THEN 100 ELSE 0 END) +
           (CASE WHEN fts.source LIKE ? THEN 60 ELSE 0 END) +
           (CASE WHEN fts.typed_notes LIKE ? THEN 40 ELSE 0 END) +
           (CASE WHEN fts.problem_text LIKE ? THEN 10 ELSE 0 END)
         ) AS relevance_score
       FROM items i
       JOIN items_fts fts ON i.id = fts.id
       WHERE i.user_id = ? 
       AND (
         i.keywords LIKE ? 
         OR fts.keyword_tokens LIKE ?
         OR fts.source LIKE ? 
         OR fts.typed_notes LIKE ? 
         OR fts.problem_text LIKE ?
       ) 
       GROUP BY i.id
       ORDER BY relevance_score DESC, i.created_at DESC 
       LIMIT 50`
    )
      .bind(
        likePattern, // 1. i.keywords (Score)
        likePattern, // 2. fts.keyword_tokens (Score)
        likePattern, // 3. fts.source (Score)
        likePattern, // 4. fts.typed_notes (Score)
        likePattern, // 5. fts.problem_text (Score)
        userId,      // 6. i.user_id = ?
        likePattern, // 7. i.keywords
        likePattern, // 8. fts.keyword_tokens
        likePattern, // 9. fts.source
        likePattern, // 10. fts.typed_notes
        likePattern  // 11. fts.problem_text
      )
      .all<ItemRow>();

    return c.json({ items: results || [] });
  }
});