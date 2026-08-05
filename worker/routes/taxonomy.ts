import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { Bindings, Variables, TaxonomyNode } from '../types';
import { TAXONOMY_SEED_DATA } from '../data/taxonomy-seed';
import { ensureSeedTaxonomies } from './problems';

export const taxonomyRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

interface TaxonomyRow {
  id: string;
  user_id: string | null;
  parent_id: string | null;
  label: string;
  level: number;
}

function buildTree(rows: TaxonomyRow[]): TaxonomyNode[] {
  const nodeMap = new Map<string, TaxonomyNode>();
  const rootNodes: TaxonomyNode[] = [];

  for (const r of rows) {
    nodeMap.set(r.id, {
      id: r.id,
      user_id: r.user_id,
      parent_id: r.parent_id,
      label: r.label,
      level: r.level,
      children: [],
    });
  }

  for (const r of rows) {
    const node = nodeMap.get(r.id)!;
    if (r.parent_id && nodeMap.has(r.parent_id)) {
      const parent = nodeMap.get(r.parent_id)!;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  return rootNodes;
}

// 1. Get Combined Taxonomy Tree (Official Seed + User Custom Nodes)
taxonomyRouter.get('/', authMiddleware, async (c) => {
  const userId = c.get('userId');

  try {
    await ensureSeedTaxonomies(c.env.DB);

    const { results } = await c.env.DB.prepare(
      `SELECT id, user_id, parent_id, label, level
       FROM taxonomies
       WHERE user_id IS NULL OR user_id = ?
       ORDER BY level ASC, id ASC`
    ).bind(userId).all<TaxonomyRow>();

    let tree: TaxonomyNode[] = [];
    let customNodes: TaxonomyNode[] = [];

    if (results && results.length > 0) {
      tree = buildTree(results);
      customNodes = results
        .filter((r) => r.user_id === userId)
        .map((r) => ({
          id: r.id,
          user_id: r.user_id,
          parent_id: r.parent_id,
          label: r.label,
          level: r.level,
        }));
    } else {
      // If DB has no taxonomy data yet, fallback to TAXONOMY_SEED_DATA
      tree = TAXONOMY_SEED_DATA;
    }

    const countsMap: Record<string, number> = {};
    try {
      const { results: countResults } = await c.env.DB.prepare(
        `SELECT topic_id, COUNT(id) as count
         FROM items
         WHERE user_id = ? AND topic_id IS NOT NULL AND topic_id != ''
         GROUP BY topic_id`
      ).bind(userId).all<{ topic_id: string; count: number }>();

      if (countResults) {
        for (const row of countResults) {
          if (row.topic_id) {
            countsMap[row.topic_id] = row.count;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to query topic counts:', e);
    }

    return c.json({
      status: 'ok',
      tree,
      customNodes,
      counts: countsMap,
    });
  } catch (err) {
    console.error('Failed to query taxonomies:', err);
    return c.json({
      status: 'ok',
      tree: TAXONOMY_SEED_DATA,
      customNodes: [],
      counts: {},
    });
  }
});

// 2. Create Custom Subject or Sub-unit
taxonomyRouter.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const label = (body.label || '').trim();
  const parentId = body.parent_id ? String(body.parent_id).trim() : null;

  if (!label) {
    return c.json({ error: { code: 'INVALID_INPUT', message: '名稱不可為空' } }, 400);
  }

  let level = 0;
  if (parentId) {
    const parent = await c.env.DB.prepare(
      'SELECT level FROM taxonomies WHERE id = ?'
    ).bind(parentId).first<{ level: number }>();
    level = parent ? parent.level + 1 : 1;
  }

  const newId = parentId
    ? `custom-unit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    : `custom-sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  await c.env.DB.prepare(
    `INSERT INTO taxonomies (id, user_id, parent_id, label, level)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(newId, userId, parentId, label, level).run();

  const newNode: TaxonomyNode = {
    id: newId,
    parent_id: parentId,
    label,
    level,
    children: [],
  };

  return c.json({
    status: 'ok',
    node: newNode,
  });
});

// 3. Delete Custom Subject or Sub-unit
taxonomyRouter.delete('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  // Verify node belongs to current user
  const existing = await c.env.DB.prepare(
    'SELECT id, user_id FROM taxonomies WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first();

  if (!existing) {
    return c.json({ error: { code: 'NOT_FOUND', message: '找不到此自訂項目或無權限刪除' } }, 404);
  }

  // Delete node and its children owned by this user
  await c.env.DB.prepare(
    'DELETE FROM taxonomies WHERE (id = ? OR parent_id = ?) AND user_id = ?'
  ).bind(id, id, userId).run();

  return c.json({
    status: 'ok',
    message: '已刪除自訂項目',
  });
});
