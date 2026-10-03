import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { Bindings, Variables, TaxonomyNode } from '../types';
import { TAXONOMY_SEED_DATA } from '../data/taxonomy-seed';

export const adminRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
adminRouter.get('/assets/audit',authMiddleware,async c=>{
  if(!isAdminUser(c as Parameters<typeof isAdminUser>[0]))
    return c.json({error:{code:'FORBIDDEN',message:'僅限管理者'}},403);
  const after=c.req.query('after')||'';
  if(after.length>200)return c.json({error:{code:'INVALID_CURSOR',message:'分頁位置無效'}},400);
  const {results}=await c.env.DB.prepare(`SELECT id,storage_key FROM assets
    WHERE state='ready' AND id>? ORDER BY id LIMIT 21`).bind(after).all<{
      id:string;storage_key:string}>();
  const rows=results||[],page=rows.slice(0,20),missing:string[]=[];
  for(let offset=0;offset<page.length;offset+=5){
    const group=page.slice(offset,offset+5);
    const heads=await Promise.all(group.map(row=>c.env.STORAGE.head(row.storage_key)));
    heads.forEach((head,index)=>{if(!head)missing.push(group[index].id);});
  }
  return c.json({checked:page.length,missing_r2:missing,
    next_cursor:rows.length>20?page.at(-1)?.id:null});
});
adminRouter.get('/assets/reverse-audit',authMiddleware,async c=>{
  if(!isAdminUser(c as Parameters<typeof isAdminUser>[0]))
    return c.json({error:{code:'FORBIDDEN',message:'僅限管理者'}},403);
  const cursor=c.req.query('cursor');
  if(cursor&&cursor.length>2000)
    return c.json({error:{code:'INVALID_CURSOR',message:'分頁位置無效'}},400);
  const objects=await c.env.STORAGE.list({limit:100,...(cursor?{cursor}:{})});
  const keys=objects.objects.map(object=>object.key);
  if(!keys.length)return c.json({checked:0,orphan_r2:[],next_cursor:objects.truncated?objects.cursor:null});
  const {results}=await c.env.DB.prepare(`SELECT storage_key FROM assets WHERE storage_key IN
    (${keys.map(()=>'?').join(',')})`).bind(...keys).all<{storage_key:string}>();
  const known=new Set((results||[]).map(row=>row.storage_key));
  return c.json({checked:keys.length,orphan_r2:keys.filter(key=>!known.has(key)),
    next_cursor:objects.truncated?objects.cursor:null});
});
adminRouter.get('/content-reports',authMiddleware,async c=>{
  if(!isAdminUser(c as Parameters<typeof isAdminUser>[0]))
    return c.json({error:{code:'FORBIDDEN',message:'僅限管理者'}},403);
  const {results}=await c.env.DB.prepare(`SELECT id,collection_id,entry_id,category,detail,state,
    resolution,created_at FROM content_reports ORDER BY created_at DESC LIMIT 100`).all();
  return c.json({reports:results||[]});
});
adminRouter.patch('/content-reports/:id',authMiddleware,async c=>{
  if(!isAdminUser(c as Parameters<typeof isAdminUser>[0]))
    return c.json({error:{code:'FORBIDDEN',message:'僅限管理者'}},403);
  const b=await c.req.json().catch(()=>({}));
  if(!['open','reviewing','resolved','dismissed'].includes(b.state))
    return c.json({error:{code:'INVALID_REQUEST',message:'狀態無效'}},400);
  const result=await c.env.DB.prepare('UPDATE content_reports SET state=?,resolution=? WHERE id=?')
    .bind(b.state,typeof b.resolution==='string'?b.resolution.slice(0,2000):null,c.req.param('id')).run();
  return result.meta.changes?c.json({status:b.state}):
    c.json({error:{code:'NOT_FOUND',message:'檢舉不存在'}},404);
});

// Helper: check if the currently authenticated user is an admin
export function isAdminUser(c: { get: (key: string) => unknown; env: Bindings }): boolean {
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
