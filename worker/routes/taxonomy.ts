import { Hono } from 'hono';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { Bindings, Variables, TaxonomyNode } from '../types';
import { TAXONOMY_SEED_DATA } from '../data/taxonomy-seed';
import { ensureSeedTaxonomies, syncSeedTaxonomies } from './problems';
import { isAdminUser } from './admin';

export const taxonomyRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

interface TaxonomyRow {
  id: string;
  user_id: string | null;
  parent_id: string | null;
  label: string;
  level: number;
}

const seedOrderMap = new Map<string, number>();
let orderIdx = 0;
const indexSeedNodes = (nodes: TaxonomyNode[]) => {
  for (const node of nodes) {
    seedOrderMap.set(node.id, orderIdx++);
    if (node.children) indexSeedNodes(node.children);
  }
};
indexSeedNodes(TAXONOMY_SEED_DATA);

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

  const sortNodes = (list: TaxonomyNode[]) => {
    list.sort((a, b) => {
      const orderA = seedOrderMap.has(a.id) ? seedOrderMap.get(a.id)! : 100000;
      const orderB = seedOrderMap.has(b.id) ? seedOrderMap.get(b.id)! : 100000;
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });
    for (const n of list) {
      if (n.children && n.children.length > 0) {
        sortNodes(n.children);
      }
    }
  };

  sortNodes(rootNodes);
  return rootNodes;
}

// 1. Get Combined Taxonomy Tree (Official Seed + User Custom Nodes)
taxonomyRouter.get('/', optionalAuthMiddleware, async (c) => {
  const userId = c.get('userId');

  try {
    await ensureSeedTaxonomies(c.env.DB);

    const { results } = await c.env.DB.prepare(
      `SELECT id, user_id, parent_id, label, level
       FROM taxonomies
       WHERE user_id IS NULL ${userId ? 'OR user_id = ?' : ''}
       ORDER BY level ASC, id ASC`
    ).bind(...(userId ? [userId] : [])).all<TaxonomyRow>();

    let tree: TaxonomyNode[] = [];
    let customNodes: TaxonomyNode[] = [];

    if (results && results.length > 0) {
      tree = buildTree(results);
      if (userId) {
        customNodes = results
          .filter((r) => r.user_id === userId)
          .map((r) => ({
            id: r.id,
            user_id: r.user_id,
            parent_id: r.parent_id,
            label: r.label,
            level: r.level,
          }));
      }
    } else {
      // If DB has no taxonomy data yet, fallback to TAXONOMY_SEED_DATA
      tree = TAXONOMY_SEED_DATA;
    }

    const countsMap: Record<string, { total: number; unsolved: number; resolved: number; archived: number }> = {};
    if (userId) {
      try {
        const { results: countResults } = await c.env.DB.prepare(
          `SELECT topic_id, 
                  COUNT(id) as total,
                  SUM(CASE WHEN status = 'unsolved' THEN 1 ELSE 0 END) as unsolved,
                  SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
                  SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived
           FROM items
           WHERE user_id = ? AND topic_id IS NOT NULL AND topic_id != ''
           GROUP BY topic_id`
        ).bind(userId).all<{ topic_id: string; total: number; unsolved: number; resolved: number; archived: number }>();

        if (countResults) {
          for (const row of countResults) {
            if (row.topic_id) {
              countsMap[row.topic_id] = {
                total: row.total,
                unsolved: row.unsolved || 0,
                resolved: row.resolved || 0,
                archived: row.archived || 0
              };
            }
          }
        }
      } catch (e) {
        console.warn('Failed to query topic counts:', e);
      }
    }

    // Bottom-Up Rollup: aggregate child node counts into parent nodes recursively
    const rolledUpCountsMap: Record<string, { total: number; unsolved: number; resolved: number; archived: number }> = {};

    const rollupNode = (node: TaxonomyNode): { total: number; unsolved: number; resolved: number; archived: number } => {
      const direct = countsMap[node.id] || { total: 0, unsolved: 0, resolved: 0, archived: 0 };
      let total = direct.total;
      let unsolved = direct.unsolved;
      let resolved = direct.resolved;
      let archived = direct.archived;

      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          const childSum = rollupNode(child);
          total += childSum.total;
          unsolved += childSum.unsolved;
          resolved += childSum.resolved;
          archived += childSum.archived;
        }
      }

      const rolledUp = { total, unsolved, resolved, archived };
      rolledUpCountsMap[node.id] = rolledUp;
      return rolledUp;
    };

    for (const rootNode of tree) {
      rollupNode(rootNode);
    }

    return c.json({
      status: 'ok',
      tree,
      customNodes,
      counts: rolledUpCountsMap,
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

// 2. Create Subject or Sub-unit (Custom or Official if Admin)
taxonomyRouter.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const isAdmin = isAdminUser(c as Parameters<typeof isAdminUser>[0]);
  const body = await c.req.json();
  const label = (body.label || '').trim();
  const parentId = body.parent_id ? String(body.parent_id).trim() : null;
  const isOfficial = isAdmin && body.is_official === true;
  const targetUserId = isOfficial ? null : userId;

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

  const prefix = isOfficial ? 'official' : 'custom';
  const newId = parentId
    ? `${prefix}-unit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    : `${prefix}-sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  await c.env.DB.prepare(
    `INSERT INTO taxonomies (id, user_id, parent_id, label, level)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(newId, targetUserId, parentId, label, level).run();

  const newNode: TaxonomyNode = {
    id: newId,
    user_id: targetUserId,
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

// 3. Update (Rename) Subject or Sub-unit
taxonomyRouter.put('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const isAdmin = isAdminUser(c as Parameters<typeof isAdminUser>[0]);
  const id = c.req.param('id');
  const body = await c.req.json();
  const label = (body.label || '').trim();

  if (!label) {
    return c.json({ error: { code: 'INVALID_INPUT', message: '名稱不可為空' } }, 400);
  }

  // Verify node belongs to current user, or allow if user is admin (for official nodes)
  const query = isAdmin
    ? 'SELECT id, user_id, parent_id, level FROM taxonomies WHERE id = ? AND (user_id = ? OR user_id IS NULL)'
    : 'SELECT id, user_id, parent_id, level FROM taxonomies WHERE id = ? AND user_id = ?';

  const bindParams = isAdmin ? [id, userId] : [id, userId];

  const existing = await c.env.DB.prepare(query)
    .bind(...bindParams)
    .first<{ id: string; user_id: string | null; parent_id: string | null; level: number }>();

  if (!existing) {
    return c.json({ error: { code: 'NOT_FOUND', message: '找不到此項目或無權限修改' } }, 404);
  }

  await c.env.DB.prepare(
    'UPDATE taxonomies SET label = ? WHERE id = ?'
  ).bind(label, id).run();

  return c.json({
    status: 'ok',
    node: {
      id: existing.id,
      user_id: existing.user_id,
      parent_id: existing.parent_id,
      label,
      level: existing.level,
    },
  });
});

// 4. Delete Subject or Sub-unit
taxonomyRouter.delete('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const isAdmin = isAdminUser(c as Parameters<typeof isAdminUser>[0]);
  const id = c.req.param('id');

  // Verify node belongs to current user or if admin allow deleting official node
  const query = isAdmin
    ? 'SELECT id, user_id FROM taxonomies WHERE id = ? AND (user_id = ? OR user_id IS NULL)'
    : 'SELECT id, user_id FROM taxonomies WHERE id = ? AND user_id = ?';

  const existing = await c.env.DB.prepare(query)
    .bind(id, userId)
    .first();

  if (!existing) {
    return c.json({ error: { code: 'NOT_FOUND', message: '找不到此項目或無權限刪除' } }, 404);
  }

  // Delete node and its children
  if (isAdmin && existing.user_id === null) {
    await c.env.DB.prepare(
      'DELETE FROM taxonomies WHERE (id = ? OR parent_id = ?)'
    ).bind(id, id).run();
  } else {
    await c.env.DB.prepare(
      'DELETE FROM taxonomies WHERE (id = ? OR parent_id = ?) AND user_id = ?'
    ).bind(id, id, userId).run();
  }

  return c.json({
    status: 'ok',
    message: '已刪除項目',
  });
});

// 5. Sync / Reset Official Seed Taxonomies (Incremental Update)
taxonomyRouter.post('/sync-seed', authMiddleware, async (c) => {
  try {
    const result = await syncSeedTaxonomies(c.env.DB);
    return c.json({
      status: 'ok',
      message: `已同步官方課綱架構 (共 ${result.count} 個官方節點)`,
      count: result.count,
    });
  } catch (err: any) {
    return c.json({ error: { code: 'SYNC_FAILED', message: err.message || '課綱同步失敗' } }, 500);
  }
});

