import { Hono, type Context } from 'hono';
import type { Bindings, Variables } from '../types';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { sourceWork, sourceLayerWork, sourceProgress, sourceLayerId, sourceWriteGate } from '../services/sharedSourceWork';
import { itemSearchIndexStatements } from '../services/itemSearchIndex';
import {
  apiError, canContribute, canReadCollection, hashToken, liveEntry, loadCollection, randomToken,
  type CollectionRecord,
} from '../services/collectionAccess';

export const collectionsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;
const missing = apiError('NOT_FOUND', '題目集或題目目前無法觀看');
const clean = (value: unknown, n: number) => typeof value === 'string' ? value.trim().slice(0, n) : '';
const visibilityOk = (v: unknown) => v === 'restricted' || v === 'link' || v === 'public';
const owner = (co: CollectionRecord | null, uid: string) => co && co.owner_id === uid && co.kind !== 'personal';
const contributor = async (c: AppContext, co: CollectionRecord | null) =>
  Boolean(co && await canContribute(c.env, co, c.get('userId')));
const reader = async (c: AppContext, co: CollectionRecord | null) =>
  Boolean(co && await canReadCollection(c.env, co, c.get('userId'), c.req.header('cookie')));

export async function addOwnedItem(env: Bindings, collectionId: string | undefined, itemId: string, userId: string) {
  if (!collectionId) return { error: 'FORBIDDEN' };
  const co = await loadCollection(env, collectionId);
  if (!co || co.kind === 'personal' || !await canContribute(env, co, userId)) return { error: 'FORBIDDEN' };
  const profile = await env.DB.prepare('SELECT 1 FROM public_profiles WHERE user_id=?').bind(userId).first();
  if (!profile) return { error: 'PUBLIC_NAME_REQUIRED' };
  const source = await env.DB.prepare(`SELECT i.id FROM items i JOIN assets a ON a.id=i.image_url AND a.state='ready'
    WHERE i.id=? AND i.user_id=?`).bind(itemId, userId).first();
  if (!source) return { error: 'SOURCE_UNAVAILABLE' };
  const prior = await env.DB.prepare('SELECT id,state,generation FROM collection_items WHERE collection_id=? AND origin_item_key=?')
    .bind(collectionId, itemId).first<{ id: string; state: string; generation: number }>();
  if (prior?.state === 'included') return { status: 'already_included', entry_id: prior.id };
  if (co.kind === 'single' && !prior) {
    const occupied = await env.DB.prepare("SELECT 1 FROM collection_items WHERE collection_id=? AND state='included' LIMIT 1")
      .bind(collectionId).first();
    if (occupied) return { error: 'SINGLE_OCCUPIED' };
  }
  const id = prior?.id || crypto.randomUUID();
  const generation = prior ? prior.generation + 1 : 1;
  const statements: D1PreparedStatement[] = [];
  if (prior) {
    statements.push(env.DB.prepare(`UPDATE collection_items SET source_item_id=?,contributor_id=?,state='included',
      generation=?,latest_add_event_seq=NULL,shared_seq=0,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND state='removed'`).bind(itemId,userId,generation,id));
  } else {
    statements.push(env.DB.prepare(`INSERT INTO collection_items(id,collection_id,source_item_id,contributor_id,
      origin_item_key,display_order)
      SELECT ?,co.id,i.id,?,i.id,COALESCE((SELECT MAX(display_order)+1 FROM collection_items WHERE collection_id=co.id),1)
      FROM collections co JOIN items i ON i.id=? AND i.user_id=?
      JOIN assets a ON a.id=i.image_url AND a.state='ready'
      WHERE co.id=? AND co.lifecycle!='deleted' AND
       (co.owner_id=? OR EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id
        AND g.kind='user' AND g.role='contributor' AND g.user_id=? AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))`)
      .bind(id,userId,itemId,userId,collectionId,userId,userId));
  }
  if (co.lifecycle === 'active') {
    statements.push(env.DB.prepare(`INSERT INTO collection_events(collection_id,entry_id,generation,type)
      VALUES(?,?,?,'add')`).bind(collectionId,id,generation));
    statements.push(env.DB.prepare(`UPDATE collection_items SET latest_add_event_seq=
      (SELECT seq FROM collection_events WHERE entry_id=? AND generation=? AND type='add')
      WHERE id=?`).bind(id,generation,id));
  }
  statements.push(env.DB.prepare(`UPDATE collections SET row_version=row_version+1,
    updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(collectionId));
  try { await env.DB.batch(statements); }
  catch {
    const duplicate = await env.DB.prepare("SELECT id FROM collection_items WHERE collection_id=? AND origin_item_key=? AND state='included'")
      .bind(collectionId,itemId).first<{ id: string }>();
    if (duplicate) return { status: 'already_included', entry_id: duplicate.id };
    return { error: 'SOURCE_CHANGED' };
  }
  const committed=await env.DB.prepare("SELECT id FROM collection_items WHERE id=? AND state='included'")
    .bind(id).first();
  if(!committed) return {error:'SOURCE_CHANGED'};
  return { status: 'included', entry_id: id };
}

collectionsRouter.get('/me/public-profile',authMiddleware,async c=>{
  const row=await c.env.DB.prepare('SELECT display_name,confirmed_at FROM public_profiles WHERE user_id=?')
    .bind(c.get('userId')).first();
  return c.json({profile:row});
});
collectionsRouter.put('/me/public-profile',authMiddleware,async c=>{
  const b=await c.req.json().catch(()=>({}));
  const name=clean(b.display_name,80);
  if(!name||name.includes('@')) return c.json(apiError('INVALID_REQUEST','公開名稱不可空白或包含電子郵件'),400);
  await c.env.DB.prepare(`INSERT INTO public_profiles(user_id,display_name) VALUES(?,?)
    ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,
      confirmed_at=CURRENT_TIMESTAMP`).bind(c.get('userId'),name).run();
  return c.json({display_name:name});
});
collectionsRouter.get('/me/upload-preferences',authMiddleware,async c=>{
  const row=await c.env.DB.prepare(`SELECT default_collection_id FROM user_upload_preferences
    WHERE user_id=?`).bind(c.get('userId')).first<{default_collection_id:string|null}>();
  return c.json({default_collection_id:row?.default_collection_id||null});
});
collectionsRouter.patch('/me/upload-preferences',authMiddleware,async c=>{
  const b=await c.req.json().catch(()=>({}));
  const id=b.default_collection_id;
  if(id!==null&&typeof id!=='string') return c.json(apiError('INVALID_REQUEST','目的地無效'),400);
  if(id){
    const co=await loadCollection(c.env,id);
    if(!co||!await canContribute(c.env,co,c.get('userId')))
      return c.json(apiError('FORBIDDEN','無法加入這個題目集'),403);
  }
  await c.env.DB.prepare(`INSERT INTO user_upload_preferences(user_id,default_collection_id)
    VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET
    default_collection_id=excluded.default_collection_id,updated_at=CURRENT_TIMESTAMP`)
    .bind(c.get('userId'),id||null).run();
  return c.json({default_collection_id:id||null});
});

collectionsRouter.get('/my/detached-layers',authMiddleware,async c=>{
  const {results}=await c.env.DB.prepare(`SELECT sl.id,sl.author_display,sl.typed_notes,
    sl.draw_asset_id,sl.updated_at,co.title AS collection_title
    FROM shared_layers sl JOIN collection_items ci ON ci.id=sl.entry_id
    JOIN collections co ON co.id=ci.collection_id
    WHERE sl.user_id=? AND sl.state='detached'
    ORDER BY sl.updated_at DESC,sl.id DESC LIMIT 100`)
    .bind(c.get('userId')).all();
  return c.json({layers:results||[]});
});
collectionsRouter.get('/my/detached-layers/:layerId/draw',authMiddleware,async c=>{
  const layer=await c.env.DB.prepare(`SELECT a.storage_key FROM shared_layers sl
    JOIN assets a ON a.id=sl.draw_asset_id AND a.state='ready'
    WHERE sl.id=? AND sl.user_id=? AND sl.state='detached'`)
    .bind(c.req.param('layerId'),c.get('userId')).first<{storage_key:string}>();
  if(!layer)return c.json(missing,404);
  const object=await c.env.STORAGE.get(layer.storage_key);
  if(!object)return c.json(apiError('DRAW_MISSING','筆跡暫時無法取得'),503);
  return new Response(object.body,{headers:{'Content-Type':'application/json',
    'Content-Disposition':'attachment; filename="shared-ink.json"',
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
});

collectionsRouter.get('/my/collections',authMiddleware,async c=>{
  const { results }=await c.env.DB.prepare(`SELECT co.id,co.title,co.description,COALESCE((SELECT display_name FROM public_profiles WHERE user_id=co.owner_id),co.public_name) AS public_name,co.lifecycle,
    co.visibility,co.listed,co.row_version,co.show_shared_ink,co.show_shared_notes,
    CASE WHEN co.owner_id=? THEN 'owner' ELSE 'contributor' END AS role,
    CASE WHEN EXISTS(SELECT 1 FROM owner_transfers ot WHERE ot.collection_id=co.id
      AND ot.to_user_id=? AND ot.from_user_id=co.owner_id
      AND datetime(ot.expires_at)>CURRENT_TIMESTAMP) THEN 1 ELSE 0 END AS pending_owner_transfer,
    (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id=co.id AND ci.state='included') AS item_count,
    1+(SELECT COUNT(DISTINCT g.user_id) FROM collection_grants g WHERE g.collection_id=co.id AND g.kind='user' AND g.role='contributor' AND g.user_id!=co.owner_id AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)) AS contributor_count,
    (SELECT COUNT(*) FROM subscriptions s WHERE s.collection_id=co.id AND s.user_id=?1) AS is_subscribed
    FROM collections co WHERE co.kind!='personal' AND co.lifecycle!='deleted' AND
     (co.owner_id=? OR EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id
      AND g.kind='user' AND g.role='contributor' AND g.user_id=? AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))
    ORDER BY co.updated_at DESC LIMIT 100`).bind(c.get('userId'),c.get('userId'),c.get('userId'),c.get('userId')).all();
  return c.json({collections:results||[]});
});
collectionsRouter.get('/my/collections/membership',authMiddleware,async c=>{
  const ids=(c.req.query('item_ids')||'').split(',').filter(x=>/^[a-zA-Z0-9_-]{1,80}$/.test(x)).slice(0,100);
  if (!ids.length) return c.json({memberships:{}});
  const {results}=await c.env.DB.prepare(`SELECT ci.source_item_id,ci.id AS entry_id,ci.state,
    co.id AS collection_id,co.title,co.lifecycle,co.visibility FROM collection_items ci
    JOIN collections co ON co.id=ci.collection_id JOIN items i ON i.id=ci.source_item_id
    WHERE i.user_id=? AND ci.source_item_id IN (${ids.map(()=>'?').join(',')})
      AND ci.state='included' AND co.kind!='personal'
      AND co.lifecycle!='deleted' ORDER BY co.updated_at DESC`).bind(c.get('userId'),...ids).all<Record<string,unknown>>();
  const memberships:Record<string,Record<string,unknown>[]>={};
  for(const row of results||[]) (memberships[String(row.source_item_id)]||=[]).push(row);
  return c.json({memberships});
});
collectionsRouter.post('/my/collections',authMiddleware,async c=>{
  const body=await c.req.json().catch(()=>({}));
  const profile=await c.env.DB.prepare('SELECT display_name FROM public_profiles WHERE user_id=?').bind(c.get('userId')).first<{display_name:string}>();
  const title=clean(body.title,80), name=profile?.display_name||clean(body.public_name,80);
  if(!title||!name||name.includes('@')||!visibilityOk(body.visibility))
    return c.json(apiError('INVALID_REQUEST','請填名稱、公開顯示名稱及觀看範圍'),400);
  const id=crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO collections(id,owner_id,title,description,public_name,visibility,listed,
    show_shared_ink,show_shared_notes,lifecycle,allow_reshare) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,c.get('userId'),title,clean(body.description,2000),name,body.visibility,
      body.visibility==='public'&&body.listed===true?1:0,body.show_shared_ink===true?1:0,
      body.show_shared_notes===true?1:0,body.activate===true?'active':'draft',body.allow_reshare===false?0:1).run();
  await c.env.DB.prepare(`INSERT INTO public_profiles(user_id,display_name) VALUES(?,?)
    ON CONFLICT(user_id) DO NOTHING`).bind(c.get('userId'),name).run();
  return c.json({id,lifecycle:body.activate===true?'active':'draft'},201);
});
collectionsRouter.get('/collections/:id',optionalAuthMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!await reader(c,co)) return c.json(missing,404);
  const uid=c.get('userId')||'';
  const canWrite=Boolean(uid&&await canContribute(c.env,co!,uid));
  const recent=c.req.query('sort')==='recent';
  const text=clean(c.req.query('q'),100).replace(/[\\%_]/g,'\\$&');
  const afterOrder=Number(c.req.query('after_order'));
  const afterId=c.req.query('after_id')||'';
  const hasCursor=Number.isSafeInteger(afterOrder)&&afterOrder>=0&&afterId.length>0&&afterId.length<=80;
  const topic=c.req.query('topic_id')||'';
  const saved=c.req.query('saved')||'';
  const state=c.req.query('state')||'';
  const tag=clean(c.req.query('tag'),80);
  const binds:(string|number)[]=[uid,uid,uid,co!.id];
  let filters='';
  if(text){filters+=` AND (COALESCE(i.source,'') LIKE ? ESCAPE '\\' OR COALESCE(i.keywords,'') LIKE ? ESCAPE '\\')`;binds.push(`%${text}%`,`%${text}%`);}
  if(state==='starred')filters+=' AND COALESCE(rd.starred,0)=1';
  if(topic){
    filters+=` AND i.topic_id IN (WITH RECURSIVE descendants(id) AS (
      SELECT id FROM taxonomies WHERE id=? AND user_id IS NULL
      UNION ALL SELECT child.id FROM taxonomies child
        JOIN descendants parent ON child.parent_id=parent.id WHERE child.user_id IS NULL
    ) SELECT id FROM descendants)`;
    binds.push(topic);
  }
  if(saved==='yes')filters+=' AND sr.id IS NOT NULL';
  if(saved==='no')filters+=' AND sr.id IS NULL';
  if(state==='unread')filters+=` AND sub.user_id IS NOT NULL
    AND ci.latest_add_event_seq>sub.subscribed_after_seq
    AND ci.latest_add_event_seq>sub.read_all_through_seq
    AND ci.latest_add_event_seq>COALESCE(rd.seen_add_event_seq,0)`;
  if(state==='read')filters+=` AND sub.user_id IS NOT NULL
    AND ci.latest_add_event_seq>sub.subscribed_after_seq
    AND (ci.latest_add_event_seq<=sub.read_all_through_seq
    OR ci.latest_add_event_seq<=COALESCE(rd.seen_add_event_seq,0))`;
  if(tag){
    filters+=` AND EXISTS(SELECT 1 FROM json_each(
      CASE WHEN json_valid(i.keywords) THEN i.keywords ELSE '[]' END) WHERE value=?)`;
    binds.push(tag);
  }
  if(hasCursor){
    filters+=recent?' AND (COALESCE(ci.latest_add_event_seq,0)<? OR (COALESCE(ci.latest_add_event_seq,0)=? AND ci.id<?))':' AND (ci.display_order>? OR (ci.display_order=? AND ci.id>?))';
    binds.push(afterOrder,afterOrder,afterId);
  }
  const {results}=await c.env.DB.prepare(`SELECT ci.id,ci.display_order,ci.latest_add_event_seq,ci.shared_seq,COALESCE(ci.latest_add_event_seq,0) AS recent_order,
    i.source AS title,i.keywords,
    ${canWrite?`(SELECT substr(f.problem_text,1,1600) FROM items_fts f WHERE f.id=i.id AND f.user_id=i.user_id ORDER BY f.rowid DESC LIMIT 1) AS question_text,`:''}
    CASE WHEN t.id IS NOT NULL AND t.user_id IS NULL THEN i.topic_id ELSE NULL END AS topic_id,
    i.content_seq,ci.contributor_id,ci.source_item_id,COALESCE(rd.starred,0) AS is_starred,
    p.display_name AS provider_name,sr.id AS saved_id,
    CASE WHEN sub.user_id IS NOT NULL AND ci.latest_add_event_seq>sub.subscribed_after_seq
      THEN 1 ELSE 0 END AS is_new_scope,
    CASE WHEN sub.user_id IS NOT NULL AND ci.latest_add_event_seq>sub.subscribed_after_seq
      AND ci.latest_add_event_seq>sub.read_all_through_seq
      AND ci.latest_add_event_seq>COALESCE(rd.seen_add_event_seq,0) THEN 0 ELSE 1 END AS is_read
    FROM collection_items ci
    JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id
    JOIN assets a ON a.id=i.image_url AND a.state='ready'
    JOIN collections co ON co.id=ci.collection_id
    LEFT JOIN taxonomies t ON t.id=i.topic_id
    LEFT JOIN public_profiles p ON p.user_id=ci.contributor_id
    LEFT JOIN saved_refs sr ON sr.entry_id=ci.id AND sr.user_id=?
    LEFT JOIN subscriptions sub ON sub.collection_id=co.id AND sub.user_id=?
    LEFT JOIN collection_item_reads rd ON rd.entry_id=ci.id AND rd.user_id=?
    WHERE ci.collection_id=? AND ci.state='included'
      AND (co.owner_id=ci.contributor_id OR EXISTS(SELECT 1 FROM collection_grants g
       WHERE g.collection_id=co.id AND g.kind='user' AND g.role='contributor'
        AND g.user_id=ci.contributor_id AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))
      ${filters}
    ORDER BY ${recent?'COALESCE(ci.latest_add_event_seq,0) DESC':'ci.display_order ASC'},ci.id ${recent?'DESC':'ASC'} LIMIT 51`)
    .bind(...binds).all<Record<string,unknown>>();
  const page=(results||[]).slice(0,50);
  const tail=page[page.length-1];
  return c.json({collection:{...co,owner_id:undefined,is_owner:co!.owner_id===c.get('userId'),
    can_contribute:canWrite},items:page,
    next_cursor:(results||[]).length>50?{display_order:recent?tail.recent_order:tail.display_order,id:tail.id}:null});
});
collectionsRouter.patch('/collections/:id',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!owner(co,c.get('userId'))) return c.json(missing,404);
  const b=await c.req.json().catch(()=>({}));
  if(b.expected_version!==co!.row_version) return c.json(apiError('CONFLICT','設定已變動，請重新載入'),409);
  const vis=b.visibility===undefined?co!.visibility:b.visibility;
  if(!visibilityOk(vis)) return c.json(apiError('INVALID_REQUEST','觀看範圍無效'),400);
  const title=b.title===undefined?co!.title:clean(b.title,80);
  const name=b.public_name===undefined?co!.public_name:clean(b.public_name,80);
  if(!title||!name||name.includes('@')) return c.json(apiError('INVALID_REQUEST','名稱無效'),400);
  const r=await c.env.DB.prepare(`UPDATE collections SET title=?,description=?,public_name=?,visibility=?,listed=?,
    show_shared_ink=?,show_shared_notes=?,allow_reshare=?,row_version=row_version+1,acl_version=acl_version+1,
    updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=? AND row_version=?`)
    .bind(title,b.description===undefined?co!.description:clean(b.description,2000),name,vis,
      vis==='public'&&(b.listed===undefined?Boolean(co!.listed):b.listed===true)?1:0,
      b.show_shared_ink===undefined?co!.show_shared_ink:b.show_shared_ink===true?1:0,
      b.show_shared_notes===undefined?co!.show_shared_notes:b.show_shared_notes===true?1:0,
      b.allow_reshare===undefined?co!.allow_reshare:b.allow_reshare===true?1:0,
      co!.id,c.get('userId'),co!.row_version).run();
  return r.meta.changes?c.json({row_version:co!.row_version+1}):c.json(apiError('CONFLICT','設定已變動'),409);
});
collectionsRouter.post('/collections/:id/activate',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!owner(co,c.get('userId'))) return c.json(missing,404);
  if(co!.lifecycle==='active') return c.json({status:'active'});
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE collections SET lifecycle='active',row_version=row_version+1,
      acl_version=acl_version+1 WHERE id=? AND owner_id=? AND lifecycle IN ('draft','suspended')`)
      .bind(co!.id,c.get('userId')),
    c.env.DB.prepare(`INSERT INTO collection_events(collection_id,entry_id,generation,type)
      SELECT ci.collection_id,ci.id,ci.generation,'add' FROM collection_items ci
      JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id
      JOIN assets a ON a.id=i.image_url AND a.state='ready'
      JOIN collections co ON co.id=ci.collection_id
      WHERE ci.collection_id=? AND ci.state='included'
       AND ci.latest_add_event_seq IS NULL AND
       (co.owner_id=ci.contributor_id OR EXISTS(SELECT 1 FROM collection_grants g
         WHERE g.collection_id=co.id AND g.kind='user' AND g.role='contributor'
           AND g.user_id=ci.contributor_id AND g.revoked_at IS NULL
           AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))`).bind(co!.id),
    c.env.DB.prepare(`UPDATE collection_items SET latest_add_event_seq=
      (SELECT seq FROM collection_events e WHERE e.entry_id=collection_items.id
       AND e.generation=collection_items.generation AND e.type='add')
      WHERE collection_id=? AND state='included' AND latest_add_event_seq IS NULL`).bind(co!.id),
  ]);
  return c.json({status:'active'});
});
collectionsRouter.post('/collections/:id/suspend',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!owner(co,c.get('userId'))) return c.json(missing,404);
  await c.env.DB.prepare(`UPDATE collections SET lifecycle='suspended',listed=0,
    acl_version=acl_version+1,row_version=row_version+1 WHERE id=? AND lifecycle='active'`).bind(co!.id).run();
  return c.json({status:'suspended'});
});
collectionsRouter.delete('/collections/:id',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!owner(co,c.get('userId'))) return c.json(missing,404);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE collections SET lifecycle='deleted',listed=0,acl_version=acl_version+1
      WHERE id=? AND owner_id=?`).bind(co!.id,c.get('userId')),
    c.env.DB.prepare(`UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP
      WHERE collection_id=? AND revoked_at IS NULL`).bind(co!.id),
    c.env.DB.prepare(`DELETE FROM owner_transfers WHERE collection_id=?`).bind(co!.id),
  ]);
  return c.json({status:'deleted'});
});
collectionsRouter.post('/collections/:id/items',authMiddleware,async c=>{
  const b=await c.req.json().catch(()=>({}));
  const result=await addOwnedItem(c.env,c.req.param('id'),clean(b.item_id,80),c.get('userId'));
  if(result.error) return c.json(apiError(result.error,'題目或貢獻權目前不可用'),result.error==='FORBIDDEN'?403:409);
  return c.json(result,result.status==='included'?201:200);
});
collectionsRouter.get('/collections/:id/candidates',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  const uid=c.get('userId');
  if(!co||!await canContribute(c.env,co,uid))return c.json(missing,404);
  const q=clean(c.req.query('q'),100).replace(/[\\%_]/g,'\\$&');
  const afterAt=c.req.query('after_at'),afterId=c.req.query('after_id');
  const hasCursor=afterAt!==undefined||afterId!==undefined;
  if(hasCursor&&(!afterAt||afterAt.length>40||!afterId||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(afterId)))
    return c.json(apiError('INVALID_CURSOR','分頁位置無效'),400);
  const binds:(string|number)[]=[uid,co.id,`%${q}%`,`%${q}%`];
  let filters='';
  const topic=c.req.query('topic_id')||'',tag=c.req.query('tag')||'';
  if(topic){filters+=` AND i.topic_id IN (WITH RECURSIVE descendants(id) AS (
    SELECT id FROM taxonomies WHERE id=? AND (user_id IS NULL OR user_id=?)
    UNION SELECT t.id FROM taxonomies t JOIN descendants d ON t.parent_id=d.id WHERE t.user_id IS NULL OR t.user_id=?
    ) SELECT id FROM descendants)`;binds.push(topic,uid,uid);}
  if(tag){filters+=` AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(i.keywords) THEN i.keywords ELSE '[]' END) WHERE value=?)`;binds.push(tag);}
  if(hasCursor)binds.push(afterAt!,afterAt!,afterId!);
  const {results}=await c.env.DB.prepare(`SELECT i.id,i.source AS title,i.created_at,
    (SELECT substr(f.problem_text,1,1600) FROM items_fts f WHERE f.id=i.id AND f.user_id=i.user_id ORDER BY f.rowid DESC LIMIT 1) AS question_text
    FROM items i JOIN assets a ON a.id=i.image_url AND a.state='ready'
    WHERE i.user_id=? AND NOT EXISTS(SELECT 1 FROM collection_items ci
      WHERE ci.collection_id=? AND ci.origin_item_key=i.id AND ci.state='included')
      AND (COALESCE(i.source,'') LIKE ? ESCAPE '\\' OR COALESCE(i.keywords,'') LIKE ? ESCAPE '\\')
      ${filters}
      ${hasCursor?'AND (i.created_at<? OR (i.created_at=? AND i.id<?))':''}
    ORDER BY i.created_at DESC,i.id DESC LIMIT 31`).bind(...binds).all<{
      id:string;title:string|null;created_at:string;question_text:string|null}>();
  const rows=results||[],page=rows.slice(0,30),last=page.at(-1);
  return c.json({items:page,next_cursor:rows.length>30&&last?
    {created_at:last.created_at,id:last.id}:null});
});
collectionsRouter.post('/collections/:id/items/batch',authMiddleware,async c=>{
  const b=await c.req.json().catch(()=>({}));
  if(!Array.isArray(b.item_ids)||b.item_ids.length<1||b.item_ids.length>50||
    b.item_ids.some((id:unknown)=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(id))||
    new Set(b.item_ids).size!==b.item_ids.length)
    return c.json(apiError('INVALID_REQUEST','每次請選擇 1 至 50 題且不可重複'),400);
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!co||!await canContribute(c.env,co,c.get('userId')))return c.json(missing,404);
  const results=[];
  for(const itemId of b.item_ids as string[]){
    try{
      const result=await addOwnedItem(c.env,co.id,itemId,c.get('userId'));
      results.push({item_id:itemId,...result});
    }catch{
      results.push({item_id:itemId,error:'JOIN_FAILED'});
    }
  }
  return c.json({results});
});
collectionsRouter.delete('/collections/:id/items/:entryId',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  const entry=co&&await liveEntry(c.env,c.req.param('entryId'),co.id);
  if(!entry||!(owner(co,c.get('userId'))||entry.contributor_id===c.get('userId'))) return c.json(missing,404);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE collection_items SET state='removed',latest_add_event_seq=NULL,
      updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='included'`).bind(entry.id),
    c.env.DB.prepare(`UPDATE shared_layers SET state='detached' WHERE entry_id=? AND entry_generation=?`)
      .bind(entry.id,entry.generation),
    c.env.DB.prepare(`INSERT INTO collection_events(collection_id,entry_id,generation,type)
      VALUES(?,?,?,'remove')`).bind(co!.id,entry.id,entry.generation),
    c.env.DB.prepare(`UPDATE collections SET row_version=row_version+1,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(co!.id),
  ]);
  return c.json({status:'removed',saved_retained:true});
});
collectionsRouter.patch('/collections/:id/items/:entryId/order',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!owner(co,c.get('userId')))return c.json(missing,404);
  const entry=await liveEntry(c.env,c.req.param('entryId'),co!.id);
  if(!entry)return c.json(missing,404);
  const b=await c.req.json().catch(()=>({}));
  if(!['up','down'].includes(b.direction)||!Number.isSafeInteger(b.expected_version))
    return c.json(apiError('INVALID_REQUEST','排序參數無效'),400);
  if(b.expected_version!==co!.row_version)
    return c.json(apiError('CONFLICT','集合內容已變動，請重新載入'),409);
  const down=b.direction==='down';
  const neighbor=await c.env.DB.prepare(`SELECT ci.id,ci.display_order FROM collection_items ci
    JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id
    JOIN assets a ON a.id=i.image_url AND a.state='ready'
    JOIN collections co ON co.id=ci.collection_id
    WHERE ci.collection_id=? AND ci.state='included'
      AND (co.owner_id=ci.contributor_id OR EXISTS(SELECT 1 FROM collection_grants g
        WHERE g.collection_id=co.id AND g.kind='user' AND g.role='contributor'
          AND g.user_id=ci.contributor_id AND g.revoked_at IS NULL
          AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))
      AND (ci.display_order${down?'>':'<'}? OR
        (ci.display_order=? AND ci.id${down?'>':'<'}?))
    ORDER BY ci.display_order ${down?'ASC':'DESC'},ci.id ${down?'ASC':'DESC'} LIMIT 1`)
    .bind(co!.id,entry.display_order,entry.display_order,entry.id)
    .first<{id:string;display_order:number}>();
  if(!neighbor)return c.json({status:'unchanged',row_version:co!.row_version});
  const results=await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE collection_items SET display_order=CASE
      WHEN id=? THEN ? WHEN id=? THEN ? ELSE display_order END,
      updated_at=CURRENT_TIMESTAMP WHERE collection_id=? AND id IN (?,?)
      AND (SELECT row_version FROM collections WHERE id=?)=? RETURNING id`)
      .bind(entry.id,neighbor.display_order,neighbor.id,entry.display_order,co!.id,
        entry.id,neighbor.id,co!.id,co!.row_version),
    c.env.DB.prepare(`UPDATE collections SET row_version=row_version+1,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND owner_id=? AND row_version=? RETURNING id`)
      .bind(co!.id,c.get('userId'),co!.row_version),
  ]);
  if(results[0].results.length!==2||results[1].results.length!==1)
    return c.json(apiError('CONFLICT','排序時內容已變動，請重新載入'),409);
  return c.json({status:'moved',row_version:co!.row_version+1});
});
collectionsRouter.get('/collections/:id/items/:entryId',optionalAuthMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!await reader(c,co)) return c.json(missing,404);
  const entry=await liveEntry(c.env,c.req.param('entryId'),co!.id);
  if(!entry) return c.json(missing,404);
  const item=await c.env.DB.prepare(`SELECT i.id,i.source,i.keywords,
    CASE WHEN t.id IS NOT NULL AND t.user_id IS NULL THEN i.topic_id ELSE NULL END AS topic_id,
    i.content_seq,
    CASE WHEN t.id IS NOT NULL AND t.user_id IS NULL THEN t.label ELSE NULL END AS topic_label,
    p.display_name AS provider_name FROM items i
    LEFT JOIN taxonomies t ON t.id=i.topic_id
    LEFT JOIN public_profiles p ON p.user_id=i.user_id WHERE i.id=?`)
    .bind(entry.source_item_id).first();
  const canWrite=Boolean(c.get('userId')&&await canContribute(c.env,co!,c.get('userId')));
  const ownWork=canWrite&&entry.contributor_id===c.get('userId')
    ?await sourceWork(c.env,entry.source_item_id!):null;
  const original=ownWork||(canWrite||co!.show_shared_ink||co!.show_shared_notes
    ?await sourceLayerWork(c.env,entry.source_item_id!):null);
  const progress=ownWork?sourceProgress(ownWork):canWrite?await c.env.DB.prepare('SELECT status,previous_status,review_count,row_version FROM collection_item_progress WHERE user_id=? AND entry_id=?')
    .bind(c.get('userId'),entry.id).first():null;
  const {results}=await c.env.DB.prepare(`SELECT sl.id,sl.user_id,COALESCE(p.display_name,sl.author_display) AS author_display,sl.draw_asset_id,
    sl.draw_seq,sl.typed_notes,sl.notes_seq FROM shared_layers sl
    LEFT JOIN public_profiles p ON p.user_id=sl.user_id
    WHERE sl.entry_id=? AND sl.entry_generation=? AND sl.state='active'
     AND EXISTS(SELECT 1 FROM collections co WHERE co.id=?
       AND (co.owner_id=sl.user_id OR EXISTS(SELECT 1 FROM collection_grants g
         WHERE g.collection_id=co.id AND g.kind='user' AND g.role='contributor'
           AND g.user_id=sl.user_id AND g.revoked_at IS NULL
           AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))))
     AND (sl.user_id=? OR ?=1 OR
       (?=1 AND sl.draw_asset_id IS NOT NULL) OR (?=1 AND sl.typed_notes!=''))
    ORDER BY sl.updated_at,sl.id`).bind(entry.id,entry.generation,co!.id,c.get('userId')||'',
      canWrite?1:0,co!.show_shared_ink,co!.show_shared_notes).all<Record<string,unknown>>();
  const layers:Record<string,unknown>[]=(results||[]).map(row=>({...row,
    legacy_source:row.user_id===entry.contributor_id,
    author_display:row.user_id===entry.contributor_id?row.author_display+' · 舊共用作業':row.author_display,
    draw_asset_id:canWrite||row.user_id===c.get('userId')||co!.show_shared_ink?row.draw_asset_id:null,
    typed_notes:canWrite||row.user_id===c.get('userId')||co!.show_shared_notes?row.typed_notes:null}));
  if(original&&(canWrite||co!.show_shared_ink||co!.show_shared_notes))layers.unshift({
    id:sourceLayerId(entry.source_item_id!),user_id:entry.contributor_id,is_source:true,
    author_display:(item as {provider_name?:string}|null)?.provider_name||co!.public_name,
    draw_asset_id:null,has_draw:Boolean(original.has_draw&&(canWrite||co!.show_shared_ink)),
    draw_seq:original.draw_seq,notes_seq:original.notes_seq,
    typed_notes:canWrite||co!.show_shared_notes?original.typed_notes:null});
  const neighborBase=`FROM collection_items ci
    JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id
    JOIN assets a ON a.id=i.image_url AND a.state='ready'
    JOIN collections co ON co.id=ci.collection_id
    WHERE ci.collection_id=? AND ci.state='included'
      AND (co.owner_id=ci.contributor_id OR EXISTS(SELECT 1 FROM collection_grants g
        WHERE g.collection_id=co.id AND g.kind='user' AND g.role='contributor'
          AND g.user_id=ci.contributor_id AND g.revoked_at IS NULL
          AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))`;
  const [previous,next]=await Promise.all([
    c.env.DB.prepare(`SELECT ci.id ${neighborBase}
      AND (ci.display_order<? OR (ci.display_order=? AND ci.id<?))
      ORDER BY ci.display_order DESC,ci.id DESC LIMIT 1`)
      .bind(co!.id,entry.display_order,entry.display_order,entry.id).first<{id:string}>(),
    c.env.DB.prepare(`SELECT ci.id ${neighborBase}
      AND (ci.display_order>? OR (ci.display_order=? AND ci.id>?))
      ORDER BY ci.display_order,ci.id LIMIT 1`)
      .bind(co!.id,entry.display_order,entry.display_order,entry.id).first<{id:string}>(),
  ]);
  return c.json({collection:{id:co!.id,title:co!.title,visibility:co!.visibility,is_owner:co!.owner_id===c.get('userId'),show_shared_ink:co!.show_shared_ink,
    show_shared_notes:co!.show_shared_notes},entry:{id:entry.id,generation:entry.generation,
    shared_seq:entry.shared_seq,latest_add_event_seq:entry.latest_add_event_seq},
    neighbors:{previous:previous?.id||null,next:next?.id||null},
    source:{...item,contributor_id:entry.contributor_id},layers,
    ...(canWrite?{progress:progress||{status:'unsolved',previous_status:'unsolved',review_count:0,row_version:0}}:{}),
    capabilities:{can_contribute:canWrite,can_save:!!c.get('userId')&&entry.contributor_id!==c.get('userId'),
      can_create_share:!!c.get('userId')&&(!!co!.allow_reshare||entry.contributor_id===c.get('userId'))}});
});
collectionsRouter.get('/collections/:id/items/:entryId/image',optionalAuthMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!await reader(c,co)) return c.json(missing,404);
  const entry=await liveEntry(c.env,c.req.param('entryId'),co!.id);
  if(!entry) return c.json(missing,404);
  const a=await c.env.DB.prepare(`SELECT a.storage_key,a.mime_type FROM items i
    JOIN assets a ON a.id=i.image_url AND a.state='ready' WHERE i.id=?`)
    .bind(entry.source_item_id).first<{storage_key:string;mime_type:string}>();
  if(!a) return c.json(missing,404);
  const object=await c.env.STORAGE.get(a.storage_key);
  if(!object) return c.json(apiError('IMAGE_MISSING','圖片暫時無法取得'),503);
  return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||a.mime_type,
    'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow',
    'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
});

collectionsRouter.get('/collections/:id/grants',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!owner(co,c.get('userId'))) return c.json(missing,404);
  const [grants,invitations]=await Promise.all([
    c.env.DB.prepare(`SELECT MIN(g.id) AS id,
      CASE WHEN MAX(CASE WHEN g.role='contributor' THEN 1 ELSE 0 END)=1
        THEN 'contributor' ELSE 'viewer' END AS role,
      g.user_id,COALESCE(p.display_name,NULLIF(u.name,'')) AS display_name,MAX(g.expires_at) AS expires_at,NULL AS revoked_at
      FROM collection_grants g LEFT JOIN public_profiles p ON p.user_id=g.user_id LEFT JOIN users u ON u.id=g.user_id
      WHERE g.collection_id=? AND g.kind='user' AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)
      GROUP BY g.user_id ORDER BY MAX(g.created_at) DESC`).bind(co!.id).all(),
    c.env.DB.prepare(`SELECT id,email,role,expires_at,accepted_at,revoked_at
      FROM invitations WHERE collection_id=? ORDER BY created_at DESC`).bind(co!.id).all(),
  ]);
  return c.json({grants:grants.results||[],invitations:invitations.results||[]});
});
collectionsRouter.get('/collections/:id/stats',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!owner(co,c.get('userId')))return c.json(missing,404);
  const row=await c.env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id=? AND ci.state='included') AS item_count,
    (SELECT COUNT(DISTINCT g.user_id) FROM collection_grants g WHERE g.collection_id=?
      AND g.kind='user' AND g.role='contributor' AND g.revoked_at IS NULL
      AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)) AS contributor_count,
    (SELECT COUNT(*) FROM subscriptions s WHERE s.collection_id=?) AS subscriber_count,
    (SELECT COUNT(*) FROM saved_refs sr JOIN collection_items ci ON ci.id=sr.entry_id
      WHERE ci.collection_id=?) AS saved_count`)
    .bind(co!.id,co!.id,co!.id,co!.id).first();
  return c.json({stats:row});
});
collectionsRouter.get('/collections/:id/owner-transfer',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!co)return c.json(missing,404);
  const row=await c.env.DB.prepare(`SELECT ot.to_user_id,ot.expires_at,p.display_name
    FROM owner_transfers ot LEFT JOIN public_profiles p ON p.user_id=ot.to_user_id
    WHERE ot.collection_id=? AND ot.from_user_id=? AND datetime(ot.expires_at)>CURRENT_TIMESTAMP`)
    .bind(co.id,co.owner_id).first<{to_user_id:string;expires_at:string;display_name:string|null}>();
  if(!await canContribute(c.env,co,c.get('userId')))return c.json(missing,404);
  return c.json({transfer:co.owner_id===c.get('userId')||row?.to_user_id===c.get('userId')?row:null});
});
collectionsRouter.post('/collections/:id/owner-transfer',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!owner(co,c.get('userId')))return c.json(missing,404);
  const b=await c.req.json().catch(()=>({}));
  const target=clean(b.to_user_id,80);
  if(!target||target===c.get('userId'))return c.json(apiError('INVALID_REQUEST','請選擇已加入的貢獻者'),400);
  const eligible=await c.env.DB.prepare(`SELECT 1 FROM collection_grants WHERE collection_id=?
    AND user_id=? AND kind='user' AND role='contributor' AND revoked_at IS NULL
    AND (expires_at IS NULL OR datetime(expires_at)>CURRENT_TIMESTAMP) LIMIT 1`)
    .bind(co!.id,target).first();
  if(!eligible)return c.json(apiError('INVALID_TARGET','只有已加入的貢獻者可以接手'),409);
  const expires=new Date(Date.now()+7*24*60*60*1000).toISOString();
  await c.env.DB.prepare(`INSERT INTO owner_transfers(collection_id,from_user_id,to_user_id,expires_at)
    VALUES(?,?,?,?) ON CONFLICT(collection_id) DO UPDATE SET
    from_user_id=excluded.from_user_id,to_user_id=excluded.to_user_id,
    expires_at=excluded.expires_at,created_at=CURRENT_TIMESTAMP`)
    .bind(co!.id,c.get('userId'),target,expires).run();
  return c.json({to_user_id:target,expires_at:expires},201);
});
collectionsRouter.delete('/collections/:id/owner-transfer',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!owner(co,c.get('userId')))return c.json(missing,404);
  await c.env.DB.prepare(`DELETE FROM owner_transfers WHERE collection_id=? AND from_user_id=?`)
    .bind(co!.id,c.get('userId')).run();
  return c.json({status:'cancelled'});
});
collectionsRouter.post('/collections/:id/owner-transfer/accept',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!co||!co.owner_id||co.kind==='personal')return c.json(missing,404);
  const transfer=await c.env.DB.prepare(`SELECT 1 FROM owner_transfers
    WHERE collection_id=? AND from_user_id=? AND to_user_id=? AND datetime(expires_at)>CURRENT_TIMESTAMP`)
    .bind(co.id,co.owner_id,c.get('userId')).first();
  if(!transfer)return c.json(missing,404);
  const changed=await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE collections SET owner_id=?,row_version=row_version+1,
      acl_version=acl_version+1,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND owner_id=? AND lifecycle!='deleted'
      AND EXISTS(SELECT 1 FROM owner_transfers ot WHERE ot.collection_id=collections.id
        AND ot.from_user_id=? AND ot.to_user_id=? AND datetime(ot.expires_at)>CURRENT_TIMESTAMP)
      AND EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=collections.id
        AND g.user_id=? AND g.kind='user' AND g.role='contributor' AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))`)
      .bind(c.get('userId'),co.id,co.owner_id,co.owner_id,c.get('userId'),c.get('userId')),
    c.env.DB.prepare(`INSERT INTO collection_grants(id,collection_id,kind,role,user_id,created_by)
      SELECT ?,co.id,'user','contributor',?,? FROM collections co
      WHERE co.id=? AND co.owner_id=? AND NOT EXISTS(SELECT 1 FROM collection_grants g
        WHERE g.collection_id=co.id AND g.user_id=? AND g.kind='user' AND g.role='contributor'
          AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))`)
      .bind(crypto.randomUUID(),co.owner_id,c.get('userId'),co.id,c.get('userId'),co.owner_id),
    c.env.DB.prepare(`DELETE FROM owner_transfers WHERE collection_id=? AND from_user_id=?
      AND to_user_id=? AND EXISTS(SELECT 1 FROM collections WHERE id=? AND owner_id=?)`)
      .bind(co.id,co.owner_id,c.get('userId'),co.id,c.get('userId')),
  ]);
  if(!changed[0].meta.changes)return c.json(apiError('CONFLICT','接手邀請或貢獻權已變動'),409);
  return c.json({status:'transferred',collection_id:co.id});
});
collectionsRouter.post('/collections/:id/invitations',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!owner(co,c.get('userId'))) return c.json(missing,404);
  const b=await c.req.json().catch(()=>({}));
  const email=clean(b.email,254).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['viewer','contributor'].includes(b.role))
    return c.json(apiError('INVALID_REQUEST','邀請資料無效'),400);
  const token=randomToken(),id=crypto.randomUUID();
  const expires=new Date(Date.now()+7*24*60*60*1000).toISOString();
  await c.env.DB.prepare(`INSERT INTO invitations(id,collection_id,role,email,token_hash,expires_at)
    VALUES(?,?,?,?,?,?)`).bind(id,co!.id,b.role,email,await hashToken(token),expires).run();
  return c.json({id,token,expires_at:expires},201);
});
collectionsRouter.get('/my/invitations',authMiddleware,async c=>{
  const email=c.get('userEmail')?.toLowerCase();
  if(!email) return c.json({invitations:[]});
  const {results}=await c.env.DB.prepare(`SELECT v.id,v.collection_id,v.role,v.expires_at,
    co.title,COALESCE((SELECT display_name FROM public_profiles WHERE user_id=co.owner_id),co.public_name) AS public_name FROM invitations v JOIN collections co ON co.id=v.collection_id
    WHERE v.email=? AND v.accepted_at IS NULL AND v.revoked_at IS NULL
      AND datetime(v.expires_at)>CURRENT_TIMESTAMP AND co.lifecycle!='deleted'
    ORDER BY v.created_at DESC`).bind(email).all();
  return c.json({invitations:results||[]});
});
collectionsRouter.post('/invitations/accept',authMiddleware,async c=>{
  const b=await c.req.json().catch(()=>({}));
  const token=clean(b.token,80),invitationId=clean(b.invitation_id,80),email=c.get('userEmail')?.toLowerCase();
  if(!email||(token?!/^[a-f0-9]{64}$/.test(token):!/^[a-zA-Z0-9_-]{1,80}$/.test(invitationId))) return c.json(missing,404);
  const identifier=token?await hashToken(token):invitationId;
  const invite=await c.env.DB.prepare(`SELECT v.* FROM invitations v JOIN collections co ON co.id=v.collection_id
    WHERE ${token?'v.token_hash':'v.id'}=? AND v.email=? AND v.revoked_at IS NULL AND v.accepted_at IS NULL
      AND datetime(v.expires_at)>CURRENT_TIMESTAMP AND co.lifecycle!='deleted'`)
    .bind(identifier,email).first<{id:string;collection_id:string;role:string}>();
  if(!invite) return c.json(missing,404);
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE invitations SET accepted_by=?,accepted_at=CURRENT_TIMESTAMP
        WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP`)
        .bind(c.get('userId'),invite.id),
      c.env.DB.prepare(`INSERT INTO collection_grants(id,collection_id,kind,role,user_id,created_by)
        SELECT ?,v.collection_id,'user',v.role,?,co.owner_id FROM invitations v
        JOIN collections co ON co.id=v.collection_id
        WHERE v.id=? AND v.accepted_by=? AND v.accepted_at IS NOT NULL AND v.revoked_at IS NULL`)
        .bind(crypto.randomUUID(),c.get('userId'),invite.id,c.get('userId')),
      c.env.DB.prepare(`UPDATE collections SET acl_version=acl_version+1,
        row_version=row_version+1 WHERE id=?`).bind(invite.collection_id),
    ]);
  } catch { return c.json(apiError('CONFLICT','邀請已變動，請重新載入'),409); }
  return c.json({status:'accepted',collection_id:invite.collection_id,role:invite.role});
});
collectionsRouter.delete('/collections/:id/grants/:grantId',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!owner(co,c.get('userId'))) return c.json(missing,404);
  const grant=await c.env.DB.prepare(`SELECT user_id,role FROM collection_grants
    WHERE id=? AND collection_id=? AND kind='user' AND revoked_at IS NULL`)
    .bind(c.req.param('grantId'),co!.id).first<{user_id:string;role:string}>();
  if(!grant) return c.json(missing,404);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP
      WHERE collection_id=? AND user_id=? AND kind='user' AND revoked_at IS NULL`)
      .bind(co!.id,grant.user_id),
    c.env.DB.prepare(`DELETE FROM owner_transfers WHERE collection_id=? AND to_user_id=?`)
      .bind(co!.id,grant.user_id),
    c.env.DB.prepare(`UPDATE collection_items SET state='removed',latest_add_event_seq=NULL
      WHERE collection_id=? AND contributor_id=? AND state='included'
        AND NOT EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=?
          AND g.user_id=? AND g.kind='user' AND g.role='contributor' AND g.revoked_at IS NULL
          AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))`)
      .bind(co!.id,grant.user_id,co!.id,grant.user_id),
    c.env.DB.prepare(`UPDATE shared_layers SET state='detached' WHERE user_id=?
      AND entry_id IN(SELECT id FROM collection_items WHERE collection_id=?)
      AND NOT EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=?
        AND g.user_id=? AND g.kind='user' AND g.role='contributor' AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))`)
      .bind(grant.user_id,co!.id,co!.id,grant.user_id),
    c.env.DB.prepare(`UPDATE collections SET acl_version=acl_version+1,
      row_version=row_version+1 WHERE id=?`).bind(co!.id),
  ]);
  return c.json({status:'revoked',saved_retained:true});
});
collectionsRouter.post('/collections/:id/leave',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!co||co.owner_id===c.get('userId')) return c.json(missing,404);
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP
      WHERE collection_id=? AND user_id=? AND revoked_at IS NULL`).bind(co.id,c.get('userId')),
    c.env.DB.prepare(`DELETE FROM owner_transfers WHERE collection_id=? AND to_user_id=?`)
      .bind(co.id,c.get('userId')),
    c.env.DB.prepare(`UPDATE collection_items SET state='removed',latest_add_event_seq=NULL
      WHERE collection_id=? AND contributor_id=? AND state='included'`).bind(co.id,c.get('userId')),
    c.env.DB.prepare(`UPDATE shared_layers SET state='detached' WHERE user_id=?
      AND entry_id IN(SELECT id FROM collection_items WHERE collection_id=?)`).bind(c.get('userId'),co.id),
    c.env.DB.prepare(`UPDATE collections SET acl_version=acl_version+1,
      row_version=row_version+1 WHERE id=?`).bind(co.id),
  ]);
  return c.json({status:'left',saved_retained:true});
});
collectionsRouter.get('/collections/:id/links',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!owner(co,c.get('userId'))) return c.json(missing,404);
  const {results}=await c.env.DB.prepare(`SELECT id,expires_at,revoked_at,created_at
    FROM collection_grants WHERE collection_id=? AND kind='link' ORDER BY created_at DESC`).bind(co!.id).all();
  return c.json({links:results||[]});
});
collectionsRouter.post('/collections/:id/links',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!owner(co,c.get('userId'))) return c.json(missing,404);
  if(co!.visibility!=='link') return c.json(apiError('INVALID_REQUEST','請先設為連結可看'),409);
  const token=randomToken(),id=crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO collection_grants(id,collection_id,kind,role,token_hash,created_by)
    VALUES(?,?,'link','viewer',?,?)`).bind(id,co!.id,await hashToken(token),c.get('userId')).run();
  return c.json({id,token},201);
});
collectionsRouter.delete('/collections/:id/links/:linkId',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!owner(co,c.get('userId'))) return c.json(missing,404);
  await c.env.DB.prepare(`UPDATE collection_grants SET revoked_at=CURRENT_TIMESTAMP
    WHERE id=? AND collection_id=? AND kind='link'`).bind(c.req.param('linkId'),co!.id).run();
  return c.json({status:'revoked'});
});
collectionsRouter.post('/share-links/claim',optionalAuthMiddleware,async c=>{
  const b=await c.req.json().catch(()=>({}));
  if(typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token)) return c.json(missing,404);
  const link=await c.env.DB.prepare(`SELECT g.id,g.collection_id FROM collection_grants g
    JOIN collections co ON co.id=g.collection_id WHERE g.kind='link' AND g.token_hash=?
    AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)
    AND co.lifecycle='active' AND co.visibility='link'`)
    .bind(await hashToken(b.token)).first<{id:string;collection_id:string}>();
  if(!link) return c.json(missing,404);
  if(c.get('userId')) await c.env.DB.prepare(`INSERT OR IGNORE INTO grant_holders(grant_id,user_id)
    VALUES(?,?)`).bind(link.id,c.get('userId')).run();
  const secure=new URL(c.req.url).protocol==='https:'?'; Secure':'';
  c.header('Set-Cookie',`rdv_collection_${link.collection_id}=${b.token}; HttpOnly; SameSite=Lax; Path=/api/collections/${link.collection_id}; Max-Age=86400${secure}`);
  return c.json({collection_id:link.collection_id});
});
collectionsRouter.get('/public/collections',optionalAuthMiddleware,async c=>{
  const q=clean(c.req.query('q'),100).replace(/[\\%_]/g,'\\$&');
  const term=`%${q}%`;
  const {results}=await c.env.DB.prepare(`SELECT co.id,co.title,co.description,COALESCE((SELECT display_name FROM public_profiles WHERE user_id=co.owner_id),co.public_name) AS public_name,co.owner_id=?1 AS is_owner,
    co.updated_at,COUNT(ci.id) AS item_count FROM collections co
    JOIN collection_items ci ON ci.collection_id=co.id AND ci.state='included'
    JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id
    JOIN assets a ON a.id=i.image_url AND a.state='ready'
    WHERE co.lifecycle='active' AND co.visibility='public' AND co.listed=1
      ${c.req.query('exclude_owned')==='yes'?`AND co.owner_id<>?1`:''}
      ${c.req.query('exclude_subscribed')==='yes'?`AND NOT EXISTS(SELECT 1 FROM subscriptions s WHERE s.collection_id=co.id AND s.user_id=?1)`:''}
      AND (co.title LIKE ?2 ESCAPE '\\' OR co.description LIKE ?3 ESCAPE '\\')
      AND (co.owner_id=ci.contributor_id OR EXISTS(SELECT 1 FROM collection_grants g
        WHERE g.collection_id=co.id AND g.kind='user' AND g.role='contributor'
          AND g.user_id=ci.contributor_id AND g.revoked_at IS NULL
          AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))
    GROUP BY co.id ORDER BY co.updated_at DESC LIMIT 50`).bind(c.get('userId')||'',term,term).all();
  return c.json({collections:results||[]});
});
collectionsRouter.get('/public/items',optionalAuthMiddleware,async c=>{
  const offset=Number(c.req.query('offset')||0);
  if(!Number.isSafeInteger(offset)||offset<0)return c.json(apiError('INVALID_REQUEST','分頁無效'),400);
  const q=clean(c.req.query('q'),100).replace(/[\\%_]/g,'\\$&');
  const term=`%${q}%`;
  const {results}=await c.env.DB.prepare(`SELECT ci.id AS entry_id,co.id AS collection_id,
    co.title AS collection_title,COALESCE(i.source,'題目') AS title,
    (SELECT sr.id FROM saved_refs sr WHERE sr.entry_id=ci.id AND sr.user_id=?1) AS saved_id,
    (SELECT COUNT(*) FROM subscriptions s WHERE s.collection_id=co.id AND s.user_id=?1) AS is_subscribed,
    co.owner_id=?1 AS is_owner,
    i.keywords,p.display_name AS provider_name,
    CASE WHEN t.id IS NOT NULL AND t.user_id IS NULL THEN t.label ELSE NULL END AS topic_label
    FROM collections co JOIN collection_items ci ON ci.collection_id=co.id AND ci.state='included'
    JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id
    JOIN assets a ON a.id=i.image_url AND a.state='ready'
    LEFT JOIN public_profiles p ON p.user_id=ci.contributor_id
    LEFT JOIN taxonomies t ON t.id=i.topic_id
    WHERE co.lifecycle='active' AND co.visibility='public' AND co.listed=1
      ${c.req.query('exclude_owned')==='yes'?`AND co.owner_id<>?1`:''}
      ${c.req.query('exclude_subscribed')==='yes'?`AND NOT EXISTS(SELECT 1 FROM subscriptions s WHERE s.collection_id=co.id AND s.user_id=?1)`:''}
      AND (COALESCE(i.source,'') LIKE ?2 ESCAPE '\\' OR COALESCE(i.keywords,'') LIKE ?3 ESCAPE '\\')
      AND (co.owner_id=ci.contributor_id OR EXISTS(SELECT 1 FROM collection_grants g
        WHERE g.collection_id=co.id AND g.kind='user' AND g.role='contributor'
          AND g.user_id=ci.contributor_id AND g.revoked_at IS NULL
          AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))
    ORDER BY ci.created_at DESC,ci.id DESC LIMIT 31 OFFSET ?4`).bind(c.get('userId')||'',term,term,offset).all();
  const rows=results||[];return c.json({items:rows.slice(0,30),next_offset:rows.length>30?offset+30:null});
});
collectionsRouter.post('/collections/:id/reports',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!co||!await canReadCollection(c.env,co,c.get('userId'),c.req.header('cookie')))
    return c.json(missing,404);
  const b=await c.req.json().catch(()=>({}));
  if(!['copyright','inappropriate','privacy','other'].includes(b.category))
    return c.json(apiError('INVALID_REQUEST','檢舉類別無效'),400);
  if(b.entry_id){
    const entry=await liveEntry(c.env,b.entry_id,co.id);
    if(!entry)return c.json(missing,404);
  }
  const id=crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO content_reports(id,reporter_id,collection_id,entry_id,category,detail)
    VALUES(?,?,?,?,?,?)`).bind(id,c.get('userId'),co.id,b.entry_id||null,b.category,
      clean(b.detail,2000)).run();
  return c.json({id,status:'open'},201);
});

collectionsRouter.put('/collections/:id/items/:entryId/progress',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!co||!await contributor(c,co))return c.json(missing,404);
  const entry=await liveEntry(c.env,c.req.param('entryId'),co.id);
  if(!entry)return c.json(missing,404);
  const b=await c.req.json().catch(()=>({}));
  if(!['resolve','archive'].includes(b.action)||!Number.isSafeInteger(b.expected_version)||b.expected_version<0||!Number.isSafeInteger(b.expected_generation))return c.json(apiError('INVALID_REQUEST','進度操作或版本無效'),400);
  if(b.expected_generation!==entry.generation)return c.json(apiError('CONFLICT','題目已重新加入，請重整後操作'),409);
  const uid=c.get('userId');
  if(entry.contributor_id===uid){
    const result=await c.env.DB.prepare(`UPDATE items SET
      status=CASE WHEN ?='archive' THEN CASE WHEN status='archived' THEN previous_status ELSE 'archived' END
      WHEN status='resolved' THEN 'unsolved' ELSE 'resolved' END,
      review_count=review_count+CASE WHEN ?='resolve' AND status NOT IN ('resolved','archived') THEN 1 ELSE 0 END,
      updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND progress_seq=? AND (?='archive' OR status!='archived') AND ${sourceWriteGate}`)
      .bind(b.action,b.action,entry.source_item_id!,uid,b.expected_version,b.action,entry.id,co.id,entry.generation).run();
    const row=result.meta.changes?await sourceWork(c.env,entry.source_item_id!):null;
    return row?c.json({progress:sourceProgress(row)}):c.json(apiError('CONFLICT','原題進度已變更，請重整後操作'),409);
  }
  const result=await c.env.DB.prepare(    "INSERT INTO collection_item_progress(user_id,entry_id,status,previous_status,review_count,row_version) SELECT ?1,?2,CASE WHEN ?3='archive' THEN 'archived' ELSE 'resolved' END,'unsolved',CASE WHEN ?3='resolve' THEN 1 ELSE 0 END,1 WHERE EXISTS(SELECT 1 FROM collection_items ci JOIN collections co ON co.id=ci.collection_id WHERE ci.id=?2 AND ci.collection_id=?4 AND ci.generation=?5 AND ci.state='included' AND co.lifecycle!='deleted' AND (co.owner_id=?1 OR EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id AND g.kind='user' AND g.role='contributor' AND g.user_id=?1 AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))) AND (?6=0 OR EXISTS(SELECT 1 FROM collection_item_progress WHERE user_id=?1 AND entry_id=?2)) ON CONFLICT(user_id,entry_id) DO UPDATE SET status=CASE WHEN ?3='archive' THEN CASE WHEN collection_item_progress.status='archived' THEN collection_item_progress.previous_status ELSE 'archived' END WHEN collection_item_progress.status='resolved' THEN 'unsolved' ELSE 'resolved' END, previous_status=CASE WHEN ?3='archive' AND collection_item_progress.status!='archived' THEN collection_item_progress.status ELSE collection_item_progress.previous_status END, review_count=collection_item_progress.review_count+CASE WHEN ?3='resolve' AND collection_item_progress.status='unsolved' THEN 1 ELSE 0 END,row_version=collection_item_progress.row_version+1,updated_at=CURRENT_TIMESTAMP WHERE collection_item_progress.row_version=?6 AND (?3='archive' OR collection_item_progress.status!='archived') RETURNING status,previous_status,review_count,row_version")
    .bind(uid,entry.id,b.action,co.id,entry.generation,b.expected_version).first();
  return result?c.json({progress:result}):c.json(apiError('CONFLICT','進度已變更，請重整後操作'),409);
});

collectionsRouter.put('/collections/:id/items/:entryId/layers/notes',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!co||!await contributor(c,co)) return c.json(missing,404);
  const entry=await liveEntry(c.env,c.req.param('entryId'),co.id);
  if(!entry) return c.json(missing,404);
  const b=await c.req.json().catch(()=>({}));
  if(b.expected_generation!==undefined&&b.expected_generation!==entry.generation)return c.json(apiError('CONFLICT','題目已重新加入集合；請保留舊草稿'),409);
  if(typeof b.typed_notes!=='string'||new TextEncoder().encode(b.typed_notes).byteLength>65536
    ||!Number.isSafeInteger(b.expected_seq)||b.expected_seq<0)
    return c.json(apiError('INVALID_REQUEST','筆記內容或版本無效'),400);
  const uid=c.get('userId'),id=crypto.randomUUID();
  if(entry.contributor_id===uid){
    if(b.source_item_id!==entry.source_item_id||b.expected_generation!==entry.generation)return c.json(apiError('SOURCE_TARGET_CHANGED','原題作業已改為同步；請保留草稿並重新載入頁面'),409);
    const [result]=await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE items SET typed_notes=?,notes_seq=notes_seq+1,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND user_id=? AND notes_seq=? AND ${sourceWriteGate}`)
        .bind(b.typed_notes,entry.source_item_id!,uid,b.expected_seq,entry.id,co.id,entry.generation),
      ...itemSearchIndexStatements(c.env.DB,entry.source_item_id!,uid),
    ]);
    return result.meta.changes?c.json({notes_seq:b.expected_seq+1}):c.json(apiError('CONFLICT','原題筆記已變更；請保留本機草稿'),409);
  }
  const display=await c.env.DB.prepare('SELECT display_name FROM public_profiles WHERE user_id=?')
    .bind(uid).first<{display_name:string}>();
  if(!display) return c.json(apiError('PUBLIC_NAME_REQUIRED','請先確認公開名稱'),409);
  await c.env.DB.prepare(`INSERT OR IGNORE INTO shared_layers
    (id,entry_id,entry_generation,user_id,author_display) VALUES(?,?,?,?,?)`)
    .bind(id,entry.id,entry.generation,uid,display.display_name).run();
  const result=await c.env.DB.prepare(`UPDATE shared_layers SET typed_notes=?,notes_seq=notes_seq+1,
    updated_at=CURRENT_TIMESTAMP WHERE entry_id=? AND entry_generation=? AND user_id=?
      AND state='active' AND notes_seq=? AND EXISTS(
        SELECT 1 FROM collection_items ci JOIN collections co ON co.id=ci.collection_id
        WHERE ci.id=shared_layers.entry_id AND ci.state='included'
          AND ci.generation=shared_layers.entry_generation AND ci.source_item_id IS NOT NULL
          AND (co.owner_id=? OR EXISTS(SELECT 1 FROM collection_grants g
            WHERE g.collection_id=co.id AND g.kind='user' AND g.role='contributor'
              AND g.user_id=? AND g.revoked_at IS NULL
              AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))))`)
    .bind(b.typed_notes,entry.id,entry.generation,uid,b.expected_seq,uid,uid).run();
  if(!result.meta.changes) return c.json(apiError('CONFLICT','筆記已由其他裝置更新；本機草稿請保留'),409);
  return c.json({notes_seq:b.expected_seq+1});
});
collectionsRouter.put('/collections/:id/items/:entryId/layers/draw',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!co||!await contributor(c,co)) return c.json(missing,404);
  const entry=await liveEntry(c.env,c.req.param('entryId'),co.id);
  if(!entry) return c.json(missing,404);
  const b=await c.req.json().catch(()=>({}));
  if(b.expected_generation!==undefined&&b.expected_generation!==entry.generation)return c.json(apiError('CONFLICT','題目已重新加入集合；請保留舊草稿'),409);
  const data=JSON.stringify(b.draw_data);
  if(!b.draw_data||!Number.isSafeInteger(b.expected_seq)||b.expected_seq<0
    ||new TextEncoder().encode(data).byteLength>2*1024*1024)
    return c.json(apiError('INVALID_REQUEST','筆跡內容或版本無效'),400);
  const uid=c.get('userId');
  if(entry.contributor_id===uid){
    if(b.source_item_id!==entry.source_item_id||b.expected_generation!==entry.generation)return c.json(apiError('SOURCE_TARGET_CHANGED','原題作業已改為同步；請保留草稿並重新載入頁面'),409);
    const result=await c.env.DB.prepare(`UPDATE items SET draw_data=?,draw_seq=draw_seq+1,vector_clock=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND user_id=? AND draw_seq=? AND ${sourceWriteGate}`)
      .bind(data,JSON.stringify({clientId:'shared-source',seq:b.expected_seq+1}),entry.source_item_id!,uid,b.expected_seq,entry.id,co.id,entry.generation).run();
    return result.meta.changes?c.json({draw_seq:b.expected_seq+1}):c.json(apiError('CONFLICT','原題筆跡已變更；請保留本機草稿'),409);
  }
  const display=await c.env.DB.prepare('SELECT display_name FROM public_profiles WHERE user_id=?')
    .bind(uid).first<{display_name:string}>();
  if(!display) return c.json(apiError('PUBLIC_NAME_REQUIRED','請先確認公開名稱'),409);
  const layer=await c.env.DB.prepare(`SELECT id,draw_seq,draw_asset_id FROM shared_layers
    WHERE entry_id=? AND entry_generation=? AND user_id=? AND state='active'`)
    .bind(entry.id,entry.generation,uid).first<{id:string;draw_seq:number;draw_asset_id:string|null}>();
  if((layer?.draw_seq||0)!==b.expected_seq) return c.json(apiError('CONFLICT','筆跡已由其他裝置更新；本機草稿請保留'),409);
  const layerId=layer?.id||crypto.randomUUID(),assetId=crypto.randomUUID();
  const key=`shared-draw/${co.id}/${layerId}/${assetId}.json`;
  await c.env.STORAGE.put(key,data,{httpMetadata:{contentType:'application/json'}});
  try {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO assets(id,storage_key,mime_type,byte_size) VALUES(?,?,?,?)')
        .bind(assetId,key,'application/json',new TextEncoder().encode(data).byteLength),
      c.env.DB.prepare(`INSERT OR IGNORE INTO shared_layers
        (id,entry_id,entry_generation,user_id,author_display) VALUES(?,?,?,?,?)`)
        .bind(layerId,entry.id,entry.generation,uid,display.display_name),
      c.env.DB.prepare(`UPDATE shared_layers SET draw_asset_id=?,draw_seq=draw_seq+1,
        updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND draw_seq=? AND state='active'`)
        .bind(assetId,layerId,uid,b.expected_seq),
      c.env.DB.prepare(`INSERT INTO asset_refs(id,asset_id,layer_id,role)
        VALUES(?,?,?,'shared_draw')`).bind(`layer:${assetId}`,assetId,layerId),
      c.env.DB.prepare(`DELETE FROM asset_refs WHERE layer_id=? AND asset_id=?`)
        .bind(layerId,layer?.draw_asset_id||''),
    ]);
  } catch {
    await c.env.STORAGE.delete(key);
    return c.json(apiError('CONFLICT','筆跡或共用權已變更；請保留本機草稿'),409);
  }
  return c.json({draw_seq:b.expected_seq+1});
});
collectionsRouter.get('/collections/:id/items/:entryId/layers/:layerId/draw',optionalAuthMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('id'));
  if(!await reader(c,co)) return c.json(missing,404);
  const entry=await liveEntry(c.env,c.req.param('entryId'),co!.id);
  if(!entry) return c.json(missing,404);
  const uid=c.get('userId');
  const canWrite=Boolean(uid&&await canContribute(c.env,co!,uid));
  if(c.req.param('layerId')===sourceLayerId(entry.source_item_id!)){
    if(!(canWrite||co!.show_shared_ink))return c.json(missing,404);
    const original=await c.env.DB.prepare('SELECT draw_data FROM items WHERE id=? AND user_id=?')
      .bind(entry.source_item_id!,entry.contributor_id!).first<{draw_data:string|null}>();
    if(!original?.draw_data)return c.json(missing,404);
    return new Response(original.draw_data,{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  const row=await c.env.DB.prepare(`SELECT sl.user_id,a.storage_key FROM shared_layers sl
    JOIN assets a ON a.id=sl.draw_asset_id AND a.state='ready'
    WHERE sl.id=? AND sl.entry_id=? AND sl.entry_generation=? AND sl.state='active'
      AND EXISTS(SELECT 1 FROM collections co WHERE co.id=?
        AND (co.owner_id=sl.user_id OR EXISTS(SELECT 1 FROM collection_grants g
         WHERE g.collection_id=co.id AND g.kind='user' AND g.role='contributor'
          AND g.user_id=sl.user_id AND g.revoked_at IS NULL
          AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))))`)
    .bind(c.req.param('layerId'),entry.id,entry.generation,co!.id)
    .first<{user_id:string;storage_key:string}>();
  if(!row||!(canWrite||co!.show_shared_ink||row.user_id===uid)) return c.json(missing,404);
  const object=await c.env.STORAGE.get(row.storage_key);
  if(!object) return c.json(apiError('DRAW_MISSING','筆跡暫時無法取得'),503);
  return new Response(object.body,{headers:{'Content-Type':'application/json',
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
});
