import { Hono } from 'hono';
import { Bindings, Variables } from '../types';
import { optionalAuthMiddleware } from '../middleware/auth';

export const dashboardRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

dashboardRouter.use('*', optionalAuthMiddleware);

dashboardRouter.get('/', async (c) => {
  const userId = c.get('userId');

  if (!userId) {
    return c.json({
      summary: {
        total: 0,
        resolved: 0,
        unsolved: 0,
        processing: 0,
        unclassified: 0,
      },
      subjects: [],
      top_unsolved_topics: [],
    });
  }

  // 1. Overall counts
  const totalRow = await c.env.DB.prepare(
    `SELECT
       COUNT(id) AS total,
       SUM(CASE WHEN status IN ('resolved', 'archived') THEN 1 ELSE 0 END) AS resolved,
       SUM(CASE WHEN status = 'unsolved' THEN 1 ELSE 0 END) AS unsolved,
       SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived,
       SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
       SUM(CASE WHEN topic_id IS NULL OR topic_id = '' OR topic_id = 'unclassified' THEN 1 ELSE 0 END) AS unclassified
     FROM items WHERE user_id = ?`
  )
    .bind(userId)
    .first<{ total: number; resolved: number; unsolved: number; archived: number; processing: number; unclassified: number }>();


  // 2. Subject Breakdown using recursive CTE to find root subject for any depth
  let subjectStats: any[] = [];
  try {
    const { results } = await c.env.DB.prepare(
      `WITH RECURSIVE ancestors(id, root_id) AS (
         -- Start from each item's direct topic_id and walk up to find root
         SELECT t.id, t.id
         FROM taxonomies t
         WHERE t.parent_id IS NULL
         UNION ALL
         SELECT t.id, a.root_id
         FROM taxonomies t
         JOIN ancestors a ON t.parent_id = a.id
       )
       SELECT
         t_root.id    AS subject_id,
         t_root.label AS subject_label,
         COUNT(i.id)  AS total,
         SUM(CASE WHEN i.status IN ('resolved', 'archived') THEN 1 ELSE 0 END) AS resolved
       FROM items i
       JOIN ancestors a ON i.topic_id = a.id
       JOIN taxonomies t_root ON a.root_id = t_root.id AND t_root.parent_id IS NULL
       WHERE i.user_id = ?
       GROUP BY t_root.id, t_root.label`
    )
      .bind(userId)
      .all();

    subjectStats = results || [];
  } catch (err) {
    // Fallback if taxonomies table empty before seeding
  }

  // 3. Top 3 Unsolved Topics (TDD04 Section 12.2)
  let topUnsolved: any[] = [];
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT
         t.id          AS topic_id,
         t.label       AS topic_label,
         COUNT(i.id)   AS unsolved_count
       FROM items i
       JOIN taxonomies t ON i.topic_id = t.id
       WHERE i.user_id = ? AND i.status = 'unsolved'
       GROUP BY t.id, t.label
       ORDER BY unsolved_count DESC
       LIMIT 3`
    )
      .bind(userId)
      .all();

    topUnsolved = results || [];
  } catch (err) {
    // Fallback if taxonomies table empty before seeding
  }

  return c.json({
    summary: {
      total: totalRow?.total ?? 0,
      resolved: totalRow?.resolved ?? 0,
      unsolved: totalRow?.unsolved ?? 0,
      processing: totalRow?.processing ?? 0,
      unclassified: totalRow?.unclassified ?? 0,
    },
    subjects: subjectStats,
    top_unsolved_topics: topUnsolved,
  });
});
