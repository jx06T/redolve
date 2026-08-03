import { Hono } from 'hono';
import { Bindings, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';

export const dashboardRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

dashboardRouter.use('*', authMiddleware);

dashboardRouter.get('/', async (c) => {
  const userId = c.get('userId');

  // 1. Overall counts
  const totalRow = await c.env.DB.prepare(
    `SELECT
       COUNT(id) AS total,
       SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
       SUM(CASE WHEN status = 'unsolved' THEN 1 ELSE 0 END) AS unsolved,
       SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing
     FROM items WHERE user_id = ?`
  )
    .bind(userId)
    .first<{ total: number; resolved: number; unsolved: number; processing: number }>();

  // 2. Subject Breakdown SQL (TDD04 Section 12.1)
  let subjectStats: any[] = [];
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT
         t_root.id    AS subject_id,
         t_root.label AS subject_label,
         COUNT(i.id)  AS total,
         SUM(CASE WHEN i.status = 'resolved' THEN 1 ELSE 0 END) AS resolved
       FROM items i
       JOIN taxonomies t_leaf ON i.topic_id = t_leaf.id
       JOIN taxonomies t_root ON (
           CASE t_leaf.level
               WHEN 0 THEN t_leaf.id
               WHEN 1 THEN t_leaf.parent_id
               WHEN 2 THEN (SELECT parent_id FROM taxonomies WHERE id = t_leaf.parent_id)
           END = t_root.id
       )
       WHERE i.user_id = ? AND t_root.level = 0
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
    },
    subjects: subjectStats,
    top_unsolved_topics: topUnsolved,
  });
});
