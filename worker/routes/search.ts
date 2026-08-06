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
      `SELECT DISTINCT i.* FROM items i
       JOIN items_fts fts ON i.id = fts.id
       WHERE i.user_id = ? 
       AND (
         -- 💡 1. FTS5 全表極速匹配 (自動一次搜尋 fts 裡的所有欄位：keywords, notes, ocr, source)
         fts MATCH ? 
         -- 💡 2. LIKE 保底匹配 (解決中文未切詞問題)
         OR fts.typed_notes LIKE ? 
         OR fts.problem_text LIKE ? 
         OR fts.source LIKE ? 
         OR i.keywords LIKE ?
       )
       ORDER BY i.created_at DESC
       LIMIT 50`
    )
      .bind(
        userId,       // 1. i.user_id = ?
        matchPattern, // 2. fts MATCH ?
        likePattern,  // 3. fts.typed_notes LIKE ?
        likePattern,  // 4. fts.problem_text LIKE ?
        likePattern,  // 5. fts.source LIKE ?
        likePattern   // 6. i.keywords LIKE ?
      )
      .all<ItemRow>();

    return c.json({ items: results || [] });
  } catch (err) {
    console.warn('[Search FTS Error, fallback to pure LIKE]', err);

    // 💡 降級備用方案：如果 FTS 語法依然解析失敗，純用 LIKE 掃描，依然搜得到 OCR 與筆記
    const { results } = await c.env.DB.prepare(
      `SELECT DISTINCT i.* FROM items i
       JOIN items_fts fts ON i.id = fts.id
       WHERE i.user_id = ? 
       AND (
         fts.source LIKE ? 
         OR i.keywords LIKE ? 
         OR fts.typed_notes LIKE ? 
         OR fts.problem_text LIKE ?
       ) 
       ORDER BY i.created_at DESC 
       LIMIT 50`
    )
      .bind(userId, likePattern, likePattern, likePattern, likePattern)
      .all<ItemRow>();

    return c.json({ items: results || [] });
  }
});