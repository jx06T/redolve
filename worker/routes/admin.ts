import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { Bindings, Variables, TaxonomyNode } from '../types';
import { TAXONOMY_SEED_DATA } from '../data/taxonomy-seed';

export const adminRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Helper: check if the currently authenticated user is an admin
function isAdminUser(c: { get: (key: string) => unknown; env: Bindings }): boolean {
  const email = c.get('userEmail') as string | null;
  if (!email) return false;
  const adminEmails = (c.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase());
}

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

// GET /api/admin/me — returns whether the current session user is an admin
adminRouter.get('/me', authMiddleware, async (c) => {
  const admin = isAdminUser(c as Parameters<typeof isAdminUser>[0]);
  return c.json({ isAdmin: admin });
});

// POST /api/admin/taxonomy/seed — seeds official taxonomy into D1 + KV
// Requires: authenticated session with an email listed in ADMIN_EMAILS
adminRouter.post('/taxonomy/seed', authMiddleware, async (c) => {
  if (!isAdminUser(c as Parameters<typeof isAdminUser>[0])) {
    return c.json(
      { error: { code: 'FORBIDDEN', message: '僅限管理者帳號執行此操作' } },
      403
    );
  }

  const tree = TAXONOMY_SEED_DATA;

  for (const node of tree) {
    await insertNodeToD1(c.env.DB, node);
  }

  if (c.env.KV) {
    // Key: taxonomy:seed (global, user-independent seed tree)
    await c.env.KV.put('taxonomy:seed', JSON.stringify(tree));
  }

  const totalCount = countNodes(tree);

  return c.json({
    status: 'seeded',
    count: totalCount,
  });
});
