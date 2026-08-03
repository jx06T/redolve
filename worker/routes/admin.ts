import { Hono } from 'hono';
import { Bindings, Variables, TaxonomyNode } from '../types';
import { TAXONOMY_SEED_DATA } from '../data/taxonomy-seed';

export const adminRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function insertNodeToD1(db: D1Database, node: TaxonomyNode) {
  await db
    .prepare('INSERT OR REPLACE INTO taxonomies (id, parent_id, label, level) VALUES (?, ?, ?, ?)')
    .bind(node.id, node.parent_id, node.label, node.level)
    .run();

  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      await insertNodeToD1(db, child);
    }
  }
}

function countNodes(nodes: TaxonomyNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1;
    if (node.children) {
      count += countNodes(node.children);
    }
  }
  return count;
}

adminRouter.post('/taxonomy/seed', async (c) => {
  const authHeader = c.req.header('Authorization');
  const expectedSecret = c.env.ADMIN_SECRET;

  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return c.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: '無效的管理者憑證',
        },
      },
      401
    );
  }

  const tree = TAXONOMY_SEED_DATA;

  for (const node of tree) {
    await insertNodeToD1(c.env.DB, node);
  }

  if (c.env.KV) {
    await c.env.KV.put('taxonomy:tree', JSON.stringify(tree));
  }

  const totalCount = countNodes(tree);

  return c.json({
    status: 'seeded',
    count: totalCount,
  });
});
