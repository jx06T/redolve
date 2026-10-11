import { Hono, type Context } from 'hono';
import type { Bindings, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { apiError, canContribute, canReadCollection, hashToken, loadCollection } from '../services/collectionAccess';
import { classifySaved } from '../services/savedClassification';
import { snapshotSourceWork, sourceLayerId, sourceWork } from '../services/sharedSourceWork';

export const savedRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;
type Saved = { id:string; user_id:string; entry_id:string; current_snapshot_id:string;
  row_version:number; personal_topic_id:string|null; status:string; review_count:number };
const badSource=apiError('SOURCE_UNAVAILABLE','來源或觀看權已變更，請重新載入');
const own=async(db:D1Database,id:string,uid:string)=>db.prepare('SELECT * FROM saved_refs WHERE id=? AND user_id=?')
  .bind(id,uid).first<Saved>();
const accessSql=`(co.owner_id=? OR co.visibility='public' OR EXISTS(
 SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id AND g.kind='user'
  AND g.user_id=? AND g.revoked_at IS NULL AND
  (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))
 OR (co.visibility='link' AND (EXISTS(
 SELECT 1 FROM grant_holders h JOIN collection_grants g ON g.id=h.grant_id
 WHERE h.user_id=? AND g.collection_id=co.id AND g.kind='link'
  AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))
 OR EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id AND g.kind='link'
  AND g.token_hash=? AND g.revoked_at IS NULL AND
  (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))))`;
const providerSql=`(co.owner_id=ci.contributor_id OR EXISTS(
 SELECT 1 FROM collection_grants pg WHERE pg.collection_id=co.id AND pg.kind='user'
  AND pg.role='contributor' AND pg.user_id=ci.contributor_id AND pg.revoked_at IS NULL
  AND (pg.expires_at IS NULL OR datetime(pg.expires_at)>CURRENT_TIMESTAMP)))`;

async function sourceGate(c: AppContext,entryId:string) {
  const row=await c.env.DB.prepare(`SELECT ci.id,ci.collection_id,ci.contributor_id,ci.shared_seq,
    i.image_url,i.content_seq,i.topic_id,i.id AS source_item_id,co.acl_version,co.title,co.owner_id
    FROM collection_items ci JOIN collections co ON co.id=ci.collection_id
    JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id
    JOIN assets a ON a.id=i.image_url AND a.state='ready'
    WHERE ci.id=? AND ci.state='included' AND co.lifecycle='active' AND ${providerSql}`)
    .bind(entryId).first<{id:string;collection_id:string;contributor_id:string;shared_seq:number;
      image_url:string;content_seq:number;acl_version:number;title:string;owner_id:string;topic_id:string|null;source_item_id:string}>();
  if(!row) return null;
  const co=await loadCollection(c.env,row.collection_id);
  if(!co||!await canReadCollection(c.env,co,c.get('userId'),c.req.header('cookie'))) return null;
  return row;
}
async function cookieHash(c: AppContext,collectionId:string) {
  const token=(c.req.header('cookie')||'').split(';').map(p=>p.trim())
    .find(p=>p.startsWith(`rdv_collection_${collectionId}=`))?.split('=')[1]||'';
  return /^[a-f0-9]{64}$/.test(token)?await hashToken(token):'';
}
function snapshotInsert(db:D1Database) {
  return db.prepare(`INSERT INTO saved_snapshots
    (id,saved_ref_id,image_asset_id,source_title,source_label,source_tags,source_topic_label,
     collection_title,provider_public_name,source_content_seq,source_shared_seq)
    SELECT ?,sr.id,i.image_url,COALESCE(i.source,'題目'),i.source,i.keywords,
      CASE WHEN t.user_id IS NULL THEN t.label ELSE NULL END,
      co.title,COALESCE(p.display_name,co.public_name),i.content_seq,ci.shared_seq
    FROM saved_refs sr JOIN collection_items ci ON ci.id=sr.entry_id
    JOIN collections co ON co.id=ci.collection_id
    JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id
    JOIN assets a ON a.id=i.image_url AND a.state='ready'
    LEFT JOIN taxonomies t ON t.id=i.topic_id
    LEFT JOIN public_profiles p ON p.user_id=ci.contributor_id
    WHERE sr.id=? AND sr.user_id=? AND ci.state='included' AND co.lifecycle='active'
      AND co.acl_version=? AND i.content_seq=? AND ci.shared_seq=? AND i.image_url=?
      AND ${providerSql} AND ${accessSql}`);
}
function snapshotLayers(db:D1Database) {
  return db.prepare(`INSERT INTO saved_snapshot_layers
    (snapshot_id,layer_origin_key,author_display,draw_asset_id,typed_notes,retained_field_mask)
    SELECT ?,sl.id,COALESCE((SELECT display_name FROM public_profiles WHERE user_id=sl.user_id),sl.author_display)||CASE WHEN sl.user_id=ci.contributor_id THEN ' · 舊共用作業' ELSE '' END,
      CASE WHEN ci.contributor_id=? OR co.owner_id=? OR
        EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id AND g.kind='user'
         AND g.role='contributor' AND g.user_id=? AND g.revoked_at IS NULL
         AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))
        OR co.show_shared_ink=1 THEN sl.draw_asset_id ELSE NULL END,
      CASE WHEN ci.contributor_id=? OR co.owner_id=? OR
        EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id AND g.kind='user'
         AND g.role='contributor' AND g.user_id=? AND g.revoked_at IS NULL
         AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))
        OR co.show_shared_notes=1 THEN sl.typed_notes ELSE NULL END,
      CASE WHEN co.owner_id=? OR EXISTS(SELECT 1 FROM collection_grants g
        WHERE g.collection_id=co.id AND g.kind='user' AND g.role='contributor'
          AND g.user_id=? AND g.revoked_at IS NULL
          AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))
        THEN 3 ELSE
          (CASE WHEN co.show_shared_ink=1 THEN 1 ELSE 0 END)+
          (CASE WHEN co.show_shared_notes=1 THEN 2 ELSE 0 END) END
    FROM saved_snapshots ss JOIN saved_refs sr ON sr.id=ss.saved_ref_id
    JOIN collection_items ci ON ci.id=sr.entry_id JOIN collections co ON co.id=ci.collection_id
    JOIN shared_layers sl ON sl.entry_id=ci.id AND sl.entry_generation=ci.generation
      AND sl.state='active'
    WHERE ss.id=? AND ci.shared_seq=ss.source_shared_seq AND
      (co.show_shared_ink=1 OR co.show_shared_notes=1 OR co.owner_id=?
       OR EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id
         AND g.kind='user' AND g.role='contributor' AND g.user_id=?
         AND g.revoked_at IS NULL
         AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))) AND
      (co.owner_id=sl.user_id OR EXISTS(SELECT 1 FROM collection_grants g
       WHERE g.collection_id=co.id AND g.kind='user' AND g.role='contributor'
        AND g.user_id=sl.user_id AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))`);
}
function snapshotRefs(db:D1Database,snapshotId:string) {
  return [
    db.prepare(`INSERT INTO asset_refs(id,asset_id,snapshot_id,role)
      SELECT 'snapshot-image:'||id,image_asset_id,id,'saved_image'
      FROM saved_snapshots WHERE id=?`).bind(snapshotId),
    db.prepare(`INSERT INTO asset_refs(id,asset_id,snapshot_id,role)
      SELECT 'snapshot-draw:'||snapshot_id||':'||layer_origin_key,draw_asset_id,snapshot_id,'saved_draw'
      FROM saved_snapshot_layers WHERE snapshot_id=? AND draw_asset_id IS NOT NULL`).bind(snapshotId),
  ];
}

savedRouter.get('/my/notebook',authMiddleware,async c=>{
  const uid=c.get('userId');
  const origin=c.req.query('origin')||'all';
  if(!['all','owned','saved'].includes(origin)) return c.json(apiError('INVALID_REQUEST','來源篩選無效'),400);
  const topic=c.req.query('topic_id'),status=c.req.query('status'),collectionId=c.req.query('collection_id');
  if(status&&!['processing','unsolved','resolved','archived'].includes(status))
    return c.json(apiError('INVALID_REQUEST','訂正狀態無效'),400);
  const limit=Math.min(Math.max(Number(c.req.query('limit'))||30,1),100);
  const beforeTimeRaw=c.req.query('before_time'),beforeId=c.req.query('before_id');
  const hasCursor=beforeTimeRaw!==undefined||beforeId!==undefined;
  const beforeTime=Number(beforeTimeRaw);
  if(hasCursor&&(!beforeId||!/^[a-zA-Z0-9_-]{1,80}$/.test(beforeId)||
    beforeTimeRaw===undefined||!Number.isFinite(beforeTime)))
    return c.json(apiError('INVALID_CURSOR','分頁位置無效'),400);
  const binds:(string|number)[]=[];
  const clauses:string[]=[];
  const topicClause=(column:string)=>`${column} IN (WITH RECURSIVE descendants(id) AS (
    SELECT id FROM taxonomies WHERE id=? AND (user_id=? OR user_id IS NULL)
    UNION ALL SELECT child.id FROM taxonomies child JOIN descendants parent
      ON child.parent_id=parent.id WHERE child.user_id=? OR child.user_id IS NULL
  ) SELECT id FROM descendants)`;
  if(origin!=='saved'){
    let q=`SELECT 'owned' AS origin,i.id,i.source AS title,i.topic_id,i.status,
      i.created_at AS added_at,NULL AS collection_title FROM items i WHERE i.user_id=?`;
    binds.push(uid);
    if(collectionId){q+=` AND EXISTS(SELECT 1 FROM collection_items ci
      JOIN collections co ON co.id=ci.collection_id AND co.lifecycle!='deleted'
      WHERE ci.source_item_id=i.id AND ci.collection_id=? AND ci.state='included')`;binds.push(collectionId);}
    if(topic){q+=` AND ${topicClause('i.topic_id')}`;binds.push(topic,uid,uid);}
    if(status){q+=' AND i.status=?';binds.push(status);}
    clauses.push(q);
  }
  if(origin!=='owned'&&!collectionId){
    let q=`SELECT 'saved' AS origin,sr.id,ss.source_title AS title,
      sr.personal_topic_id AS topic_id,sr.status,sr.downloaded_at AS added_at,
      ss.collection_title FROM saved_refs sr JOIN saved_snapshots ss
      ON ss.id=sr.current_snapshot_id WHERE sr.user_id=?`;
    binds.push(uid);
    if(topic){q+=` AND ${topicClause('sr.personal_topic_id')}`;binds.push(topic,uid,uid);}
    if(status){q+=' AND sr.status=?';binds.push(status);}
    clauses.push(q);
  }
  if(!clauses.length)return c.json({items:[],next_cursor:null});
  const {results}=await c.env.DB.prepare(`SELECT * FROM (
    SELECT *,COALESCE(julianday(added_at),0) AS sort_time
    FROM (${clauses.join(' UNION ALL ')})
  ) ${hasCursor?'WHERE sort_time<? OR (sort_time=? AND id<?)':''}
    ORDER BY sort_time DESC,id DESC LIMIT ?`)
    .bind(...binds,...(hasCursor?[beforeTime,beforeTime,beforeId!]:[]),limit+1)
    .all<{id:string;sort_time:number}>();
  const rows=results||[];
  const page=rows.slice(0,limit);
  const last=page.at(-1);
  return c.json({items:page,next_cursor:rows.length>limit&&last?
    {sort_time:last.sort_time,id:last.id}:null});
});

savedRouter.post('/saved',authMiddleware,async c=>{
  const b=await c.req.json().catch(()=>({}));
  const entryId=typeof b.entry_id==='string'?b.entry_id:'';
  if(!entryId) return c.json(apiError('INVALID_REQUEST','請指定題目'),400);
  const uid=c.get('userId');
  const existing=await c.env.DB.prepare('SELECT id FROM saved_refs WHERE user_id=? AND entry_id=?')
    .bind(uid,entryId).first<{id:string}>();
  if(existing) return c.json({saved_id:existing.id,status:'already_saved'});
  const src=await sourceGate(c,entryId);
  if(!src) return c.json(badSource,404);
  if(src.contributor_id===uid) return c.json(apiError('OWN_SOURCE','這是你的原題，請直接開啟'),409);
  let topic:string|null=null;
  let classification='ready';
  if(src.topic_id){
    const official=await c.env.DB.prepare('SELECT id FROM taxonomies WHERE id=? AND user_id IS NULL').bind(src.topic_id).first<{id:string}>();
    if(official)topic=official.id;else classification='pending';
  }
  if(b.topic_id!=null&&b.topic_id!=='') {
    if(typeof b.topic_id!=='string') return c.json(apiError('INVALID_TOPIC','個人分類無效'),400);
    const t=await c.env.DB.prepare('SELECT id FROM taxonomies WHERE id=? AND (user_id=? OR user_id IS NULL)')
      .bind(b.topic_id,uid).first();
    if(!t) return c.json(apiError('INVALID_TOPIC','個人分類無效'),400);
    topic=b.topic_id;
    classification='manual';
  }
  const savedId=crypto.randomUUID(),snapshotId=crypto.randomUUID(),workspaceId=crypto.randomUUID();
  const hash=await cookieHash(c,src.collection_id);
  const sourceSnapshot=await snapshotSourceWork(c.env,entryId,snapshotId,uid);
  const cleanupNewSave=async()=>{
    await sourceSnapshot.cleanup();
    // A changed source can make the SELECT snapshot insert no-op, leaving a new shell.
    await c.env.DB.prepare('DELETE FROM saved_refs WHERE id=? AND user_id=? AND current_snapshot_id IS NULL').bind(savedId,uid).run();
  };
  const statements:D1PreparedStatement[]=[
    c.env.DB.prepare(`INSERT INTO saved_refs(id,user_id,entry_id,personal_topic_id,classification_state)
      SELECT ?,?,ci.id,?,? FROM collection_items ci JOIN collections co ON co.id=ci.collection_id
      JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id
      JOIN assets a ON a.id=i.image_url AND a.state='ready'
      WHERE ci.id=? AND ci.state='included' AND co.lifecycle='active'
        AND co.acl_version=? AND ci.shared_seq=? AND i.content_seq=? AND i.image_url=?
        AND ci.contributor_id!=? AND ${providerSql} AND ${accessSql}`)
      .bind(savedId,uid,topic,classification,entryId,src.acl_version,src.shared_seq,src.content_seq,
        src.image_url,uid,uid,uid,uid,hash),
    snapshotInsert(c.env.DB).bind(snapshotId,savedId,uid,src.acl_version,src.content_seq,src.shared_seq,
      src.image_url,uid,uid,uid,hash),
    snapshotLayers(c.env.DB).bind(snapshotId,uid,uid,uid,uid,uid,uid,uid,uid,snapshotId,uid,uid),
    ...sourceSnapshot.statements,
    c.env.DB.prepare(`UPDATE saved_refs SET current_snapshot_id=?
      WHERE id=? AND user_id=? AND current_snapshot_id IS NULL
        AND EXISTS(SELECT 1 FROM saved_snapshots WHERE id=? AND saved_ref_id=?)`)
      .bind(snapshotId,savedId,uid,snapshotId,savedId),
    ...snapshotRefs(c.env.DB,snapshotId),
    c.env.DB.prepare('INSERT INTO personal_workspaces(id,user_id,saved_ref_id) VALUES(?,?,?)')
      .bind(workspaceId,uid,savedId),
  ];
  try { await c.env.DB.batch(statements); }
  catch {
    await sourceSnapshot.cleanup();
    const duplicate=await c.env.DB.prepare('SELECT id FROM saved_refs WHERE user_id=? AND entry_id=?')
      .bind(uid,entryId).first<{id:string}>();
    if(duplicate) return c.json({saved_id:duplicate.id,status:'already_saved'});
    return c.json(apiError('SOURCE_CHANGED','來源或授權已變更，請重新載入'),409);
  }
  const committed=await c.env.DB.prepare('SELECT id FROM saved_refs WHERE id=? AND current_snapshot_id=?').bind(savedId,snapshotId).first();
  if(!committed){await cleanupNewSave();return c.json(apiError('SOURCE_CHANGED','來源已變更，請重新載入'),409);}
  if(classification==='pending')c.executionCtx.waitUntil(classifySaved(c.env,savedId,uid));
  return c.json({saved_id:savedId,status:'saved',classification_state:classification},201);
});
savedRouter.get('/saved',authMiddleware,async c=>{
  const origin=c.req.query('status'),topic=c.req.query('topic_id');
  const binds:string[]=[c.get('userId')];
  let where='sr.user_id=?';
  if(origin&&['unsolved','resolved','archived'].includes(origin)){where+=' AND sr.status=?';binds.push(origin);}
  if(topic){
    where+=` AND sr.personal_topic_id IN (WITH RECURSIVE descendants(id) AS (
      SELECT id FROM taxonomies WHERE id=? AND (user_id=? OR user_id IS NULL)
      UNION ALL SELECT child.id FROM taxonomies child JOIN descendants parent
        ON child.parent_id=parent.id WHERE child.user_id=? OR child.user_id IS NULL
    ) SELECT id FROM descendants)`;
    binds.push(topic,c.get('userId'),c.get('userId'));
  }
  const {results}=await c.env.DB.prepare(`SELECT sr.id,sr.entry_id,sr.status,sr.review_count,
    sr.personal_topic_id,sr.downloaded_at,ss.source_title,ss.collection_title,
    ss.provider_public_name,ss.source_content_seq,ss.source_shared_seq
    FROM saved_refs sr JOIN saved_snapshots ss ON ss.id=sr.current_snapshot_id
    WHERE ${where} ORDER BY sr.downloaded_at DESC,sr.id DESC LIMIT 100`).bind(...binds).all();
  return c.json({items:results||[]});
});
savedRouter.get('/saved/inspect',authMiddleware,async c=>{
  const source=await sourceGate(c,c.req.query('entry_id')||'');
  if(!source)return c.json(badSource,404);
  const found=await c.env.DB.prepare(`SELECT sr.id FROM saved_refs sr JOIN collection_items ci ON ci.id=sr.entry_id
    WHERE sr.user_id=? AND ci.origin_item_key=? ORDER BY sr.downloaded_at DESC LIMIT 1`)
    .bind(c.get('userId'),source.source_item_id).first<{id:string}>();
  return c.json({existing_id:found?.id||null,own_source:source.contributor_id===c.get('userId')});
});
savedRouter.get('/saved/:id/source-update',authMiddleware,async c=>{
  const saved=await own(c.env.DB,c.req.param('id')||'',c.get('userId'));
  if(!saved)return c.json(apiError('NOT_FOUND','找不到個人題目'),404);
  const source=await sourceGate(c,saved.entry_id);if(!source)return c.json({available:false,changed:false,changes:[]});
  const snapshot=await c.env.DB.prepare('SELECT source_content_seq,source_shared_seq FROM saved_snapshots WHERE id=? AND saved_ref_id=?')
    .bind(saved.current_snapshot_id,saved.id).first<{source_content_seq:number;source_shared_seq:number}>();
  const changes:string[]=[];
  if(source.content_seq!==snapshot?.source_content_seq)changes.push('來源標籤或內容已更新');
  if(source.shared_seq!==snapshot?.source_shared_seq)changes.push('共用參考筆跡或筆記已更新');
  const co=await loadCollection(c.env,source.collection_id);
  const writer=co&&await canContribute(c.env,co,c.get('userId'));
  const shownInk=writer||!!co?.show_shared_ink,shownNotes=writer||!!co?.show_shared_notes;
  const current=(await c.env.DB.prepare(`SELECT sl.id AS layer_origin_key,sl.draw_asset_id,sl.typed_notes
    FROM shared_layers sl JOIN collection_items ci ON ci.id=sl.entry_id JOIN collections co ON co.id=ci.collection_id
    WHERE ci.id=? AND sl.entry_generation=ci.generation AND sl.state='active' AND
      (co.owner_id=sl.user_id OR EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id AND g.user_id=sl.user_id
        AND g.kind='user' AND g.role='contributor' AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))
    ORDER BY sl.id`).bind(source.id).all<{layer_origin_key:string;draw_asset_id:string|null;typed_notes:string|null}>()).results||[];
  const retained=(await c.env.DB.prepare('SELECT layer_origin_key,draw_asset_id,typed_notes FROM saved_snapshot_layers WHERE snapshot_id=? ORDER BY layer_origin_key')
    .bind(saved.current_snapshot_id).all<{layer_origin_key:string;draw_asset_id:string|null;typed_notes:string|null}>()).results||[];
  const visible=current.filter(()=>shownInk||shownNotes).map(l=>({...l,draw_asset_id:shownInk?l.draw_asset_id:null,typed_notes:shownNotes?l.typed_notes:null}));
  const original=await sourceWork(c.env,source.source_item_id),key=sourceLayerId(source.source_item_id);
  // Live source ink has no asset id; the retained download does. Compare permitted fields.
  const sourceVisible=original&&(shownInk||shownNotes)?{ink:shownInk&&!!original.has_draw,notes:shownNotes?original.typed_notes:null}:null;
  const sourceRetained=retained.find(l=>l.layer_origin_key===key);
  const sourceFixed=sourceRetained?{ink:!!sourceRetained.draw_asset_id,notes:sourceRetained.typed_notes}:null;
  const meaningful=(layer:typeof sourceVisible)=>layer&&(layer.ink||layer.notes)?layer:null;
  if((JSON.stringify(visible)!==JSON.stringify(retained.filter(l=>l.layer_origin_key!==key))||JSON.stringify(meaningful(sourceVisible))!==JSON.stringify(meaningful(sourceFixed)))&&source.shared_seq===snapshot?.source_shared_seq)changes.push('參考圖層的展示範圍已變更');
  return c.json({available:true,changed:changes.length>0,changes,collection_id:source.collection_id,entry_id:source.id,
    content_seq:source.content_seq,shared_seq:source.shared_seq,acl_version:source.acl_version});
});
savedRouter.post('/saved/:id/retry-classification',authMiddleware,async c=>{
  const uid=c.get('userId'),id=c.req.param('id')!;
  const result=await c.env.DB.prepare(`UPDATE saved_refs SET classification_state='pending',row_version=row_version+1
    WHERE id=? AND user_id=? AND classification_state='failed' AND personal_topic_id IS NULL`).bind(id,uid).run();
  if(!result.meta.changes)return c.json(apiError('CONFLICT','此題已有分類或正在分類，請重新讀取'),409);
  c.executionCtx.waitUntil(classifySaved(c.env,id,uid));return c.json({classification_state:'pending'});
});
savedRouter.get('/saved/:id',authMiddleware,async c=>{
  const saved=await own(c.env.DB,c.req.param('id')||'',c.get('userId'));
  if(!saved) return c.json(apiError('NOT_FOUND','找不到個人題目'),404);
  const [snapshot,layers,workspace,available]=await Promise.all([
    c.env.DB.prepare('SELECT * FROM saved_snapshots WHERE id=? AND saved_ref_id=?')
      .bind(saved.current_snapshot_id,saved.id).first(),
    c.env.DB.prepare('SELECT * FROM saved_snapshot_layers WHERE snapshot_id=?')
      .bind(saved.current_snapshot_id).all(),
    c.env.DB.prepare('SELECT * FROM personal_workspaces WHERE saved_ref_id=? AND user_id=?')
      .bind(saved.id,c.get('userId')).first(),
    sourceGate(c,saved.entry_id),
  ]);
  if(!snapshot||!workspace) return c.json(apiError('SNAPSHOT_MISSING','個人版本暫時無法讀取'),503);
  return c.json({saved,snapshot,layers:layers.results||[],workspace,
    source:{available:!!available}});
});
savedRouter.get('/saved/:id/image',authMiddleware,async c=>{
  const row=await c.env.DB.prepare(`SELECT a.storage_key,a.mime_type FROM saved_refs sr
    JOIN saved_snapshots ss ON ss.id=sr.current_snapshot_id
    JOIN asset_refs ar ON ar.snapshot_id=ss.id AND ar.asset_id=ss.image_asset_id
      AND ar.role='saved_image'
    JOIN assets a ON a.id=ss.image_asset_id AND a.state='ready'
    WHERE sr.id=? AND sr.user_id=?`).bind(c.req.param('id'),c.get('userId'))
    .first<{storage_key:string;mime_type:string}>();
  if(!row) return c.json(apiError('NOT_FOUND','圖片不存在'),404);
  const object=await c.env.STORAGE.get(row.storage_key);
  if(!object) return c.json(apiError('IMAGE_MISSING','圖片暫時無法取得'),503);
  return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||row.mime_type,
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
});

savedRouter.post('/saved/:id/refresh-source',authMiddleware,async c=>{
  const saved=await own(c.env.DB,c.req.param('id')||'',c.get('userId'));
  if(!saved) return c.json(apiError('NOT_FOUND','找不到個人題目'),404);
  const source=await sourceGate(c,saved.entry_id);
  if(!source) return c.json(badSource,410);
  const b=await c.req.json().catch(()=>({}));
  if((b.content_seq!==undefined&&b.content_seq!==source.content_seq)||
    (b.shared_seq!==undefined&&b.shared_seq!==source.shared_seq)||(b.acl_version!==undefined&&b.acl_version!==source.acl_version))
    return c.json(apiError('SOURCE_CHANGED','來源已在預覽後變動，請重新檢查更新'),409);
  const previous=await c.env.DB.prepare(`SELECT ss.image_asset_id FROM saved_snapshots ss
    WHERE ss.id=? AND ss.saved_ref_id=?`).bind(saved.current_snapshot_id,saved.id)
    .first<{image_asset_id:string}>();
  if(!previous||previous.image_asset_id!==source.image_url)
    return c.json(apiError('IMAGE_CHANGED','原圖座標已變更，不能搬移既有訂正'),409);
  const snapshotId=crypto.randomUUID(),hash=await cookieHash(c,source.collection_id);
  const sourceSnapshot=await snapshotSourceWork(c.env,saved.entry_id,snapshotId,c.get('userId'));
  try {
    await c.env.DB.batch([
      snapshotInsert(c.env.DB).bind(snapshotId,saved.id,c.get('userId'),source.acl_version,
        source.content_seq,source.shared_seq,source.image_url,
        c.get('userId'),c.get('userId'),c.get('userId'),hash),
      snapshotLayers(c.env.DB).bind(snapshotId,c.get('userId'),c.get('userId'),
        c.get('userId'),c.get('userId'),c.get('userId'),c.get('userId'),
        c.get('userId'),c.get('userId'),snapshotId,c.get('userId'),c.get('userId')),
      ...sourceSnapshot.statements,
      c.env.DB.prepare(`UPDATE saved_refs SET current_snapshot_id=?,row_version=row_version+1,
        updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND row_version=?
        AND EXISTS(SELECT 1 FROM saved_snapshots WHERE id=? AND saved_ref_id=?)`)
        .bind(snapshotId,saved.id,c.get('userId'),saved.row_version,snapshotId,saved.id),
      ...snapshotRefs(c.env.DB,snapshotId),
      c.env.DB.prepare(`DELETE FROM asset_refs WHERE snapshot_id=? AND EXISTS(
        SELECT 1 FROM saved_refs WHERE id=? AND current_snapshot_id=?)`)
        .bind(saved.current_snapshot_id,saved.id,snapshotId),
      c.env.DB.prepare(`DELETE FROM saved_snapshots WHERE id=? AND saved_ref_id=?
        AND EXISTS(SELECT 1 FROM saved_refs WHERE id=? AND current_snapshot_id=?)`)
        .bind(saved.current_snapshot_id,saved.id,saved.id,snapshotId),
    ]);
  } catch { await sourceSnapshot.cleanup();return c.json(apiError('SOURCE_CHANGED','來源或授權已變更，保留目前已存內容'),409); }
  const committed=await c.env.DB.prepare('SELECT id FROM saved_refs WHERE id=? AND current_snapshot_id=?').bind(saved.id,snapshotId).first();
  if(!committed){await sourceSnapshot.cleanup();return c.json(apiError('SOURCE_CHANGED','個人版本或來源已變更，保留目前內容'),409);}
  return c.json({status:'updated',snapshot_id:snapshotId,personal_workspace_preserved:true});
});
savedRouter.patch('/saved/:id',authMiddleware,async c=>{
  const saved=await own(c.env.DB,c.req.param('id')||'',c.get('userId'));
  if(!saved) return c.json(apiError('NOT_FOUND','找不到個人題目'),404);
  const b=await c.req.json().catch(()=>({}));
  if(b.expected_version!==saved.row_version) return c.json(apiError('CONFLICT','個人資料已變動'),409);
  const updates:string[]=[],values:(string|number|null)[]=[];
  if(b.status!==undefined){
    if(!['unsolved','resolved','archived'].includes(b.status)) return c.json(apiError('INVALID_REQUEST','狀態無效'),400);
    updates.push('status=?');values.push(b.status);
  }
  if(b.personal_topic_id!==undefined){
    let topic:string|null=null;
    if(b.personal_topic_id!==null){
      const row=await c.env.DB.prepare(`SELECT id FROM taxonomies
        WHERE id=? AND (user_id=? OR user_id IS NULL)`).bind(b.personal_topic_id,c.get('userId')).first();
      if(!row) return c.json(apiError('INVALID_TOPIC','個人分類無效'),400);
      topic=b.personal_topic_id;
    }
    updates.push('personal_topic_id=?',"classification_state='manual'");values.push(topic);
  }
  if(b.review_count!==undefined){
    if(!Number.isSafeInteger(b.review_count)||b.review_count<0) return c.json(apiError('INVALID_REQUEST','複習次數無效'),400);
    updates.push('review_count=?');values.push(b.review_count);
  }
  if(!updates.length) return c.json(apiError('INVALID_REQUEST','沒有可更新欄位'),400);
  const result=await c.env.DB.prepare(`UPDATE saved_refs SET ${updates.join(',')},row_version=row_version+1,
    updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND row_version=?`)
    .bind(...values,saved.id,c.get('userId'),saved.row_version).run();
  return result.meta.changes?c.json({row_version:saved.row_version+1}):
    c.json(apiError('CONFLICT','個人資料已變動'),409);
});
savedRouter.delete('/saved/:id',authMiddleware,async c=>{
  const saved=await own(c.env.DB,c.req.param('id')||'',c.get('userId'));
  if(!saved) return c.json(apiError('NOT_FOUND','找不到個人題目'),404);
  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM asset_refs WHERE snapshot_id IN
      (SELECT id FROM saved_snapshots WHERE saved_ref_id=?)`).bind(saved.id),
    c.env.DB.prepare('DELETE FROM saved_refs WHERE id=? AND user_id=?').bind(saved.id,c.get('userId')),
  ]);
  return c.json({status:'deleted'});
});
savedRouter.get('/saved/:id/workspace',authMiddleware,async c=>{
  const row=await c.env.DB.prepare(`SELECT pw.* FROM personal_workspaces pw
    JOIN saved_refs sr ON sr.id=pw.saved_ref_id WHERE sr.id=? AND sr.user_id=?`)
    .bind(c.req.param('id'),c.get('userId')).first();
  return row?c.json({workspace:row}):c.json(apiError('NOT_FOUND','找不到個人作業'),404);
});
savedRouter.put('/saved/:id/workspace/notes',authMiddleware,async c=>{
  const b=await c.req.json().catch(()=>({}));
  if(typeof b.typed_notes!=='string'||new TextEncoder().encode(b.typed_notes).byteLength>65536
    ||!Number.isSafeInteger(b.expected_seq)||b.expected_seq<0)
    return c.json(apiError('INVALID_REQUEST','筆記或版本無效'),400);
  const result=await c.env.DB.prepare(`UPDATE personal_workspaces SET typed_notes=?,
    notes_seq=notes_seq+1,updated_at=CURRENT_TIMESTAMP WHERE saved_ref_id=? AND user_id=?
      AND notes_seq=?`).bind(b.typed_notes,c.req.param('id'),c.get('userId'),b.expected_seq).run();
  return result.meta.changes?c.json({notes_seq:b.expected_seq+1}):
    c.json(apiError('CONFLICT','筆記已由其他裝置更新；請保留草稿'),409);
});
savedRouter.put('/saved/:id/workspace/draw',authMiddleware,async c=>{
  const b=await c.req.json().catch(()=>({}));
  const data=JSON.stringify(b.draw_data);
  if(!b.draw_data||!Number.isSafeInteger(b.expected_seq)||b.expected_seq<0||
    new TextEncoder().encode(data).byteLength>2*1024*1024)
    return c.json(apiError('INVALID_REQUEST','筆跡或版本無效'),400);
  const workspace=await c.env.DB.prepare(`SELECT pw.id,pw.draw_seq,pw.draw_asset_id FROM personal_workspaces pw
    JOIN saved_refs sr ON sr.id=pw.saved_ref_id WHERE sr.id=? AND sr.user_id=?`)
    .bind(c.req.param('id'),c.get('userId'))
    .first<{id:string;draw_seq:number;draw_asset_id:string|null}>();
  if(!workspace) return c.json(apiError('NOT_FOUND','找不到個人作業'),404);
  if(workspace.draw_seq!==b.expected_seq)
    return c.json(apiError('CONFLICT','筆跡已由其他裝置更新，請保留草稿'),409);
  const assetId=crypto.randomUUID(),key=`saved-draw/${workspace.id}/${assetId}.json`;
  await c.env.STORAGE.put(key,data,{httpMetadata:{contentType:'application/json'}});
  try{
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO assets(id,storage_key,mime_type,byte_size) VALUES(?,?,?,?)')
        .bind(assetId,key,'application/json',new TextEncoder().encode(data).byteLength),
      c.env.DB.prepare(`UPDATE personal_workspaces SET draw_asset_id=?,draw_seq=draw_seq+1,
        updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND draw_seq=?`)
        .bind(assetId,workspace.id,c.get('userId'),b.expected_seq),
      c.env.DB.prepare(`INSERT INTO asset_refs(id,asset_id,workspace_id,role)
        VALUES(?,?,?,'personal_draw')`).bind(`workspace:${assetId}`,assetId,workspace.id),
      c.env.DB.prepare('DELETE FROM asset_refs WHERE workspace_id=? AND asset_id=?')
        .bind(workspace.id,workspace.draw_asset_id||''),
    ]);
  }catch{
    await c.env.STORAGE.delete(key);
    return c.json(apiError('CONFLICT','筆跡或作業狀態已變動，請保留草稿'),409);
  }
  return c.json({draw_seq:b.expected_seq+1});
});
savedRouter.get('/saved/:id/workspace/draw',authMiddleware,async c=>{
  const a=await c.env.DB.prepare(`SELECT a.storage_key FROM personal_workspaces pw
    JOIN saved_refs sr ON sr.id=pw.saved_ref_id
    JOIN asset_refs ar ON ar.workspace_id=pw.id AND ar.asset_id=pw.draw_asset_id
      AND ar.role='personal_draw'
    JOIN assets a ON a.id=pw.draw_asset_id AND a.state='ready'
    WHERE sr.id=? AND sr.user_id=?`).bind(c.req.param('id'),c.get('userId'))
    .first<{storage_key:string}>();
  if(!a) return c.json(apiError('NOT_FOUND','尚無筆跡'),404);
  const object=await c.env.STORAGE.get(a.storage_key);
  if(!object) return c.json(apiError('DRAW_MISSING','筆跡暫時無法取得'),503);
  return new Response(object.body,{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff'}});
});
savedRouter.get('/saved/:id/layers/:layerId/draw',authMiddleware,async c=>{
  const a=await c.env.DB.prepare(`SELECT a.storage_key FROM saved_refs sr
    JOIN saved_snapshot_layers ssl ON ssl.snapshot_id=sr.current_snapshot_id
    JOIN asset_refs ar ON ar.snapshot_id=ssl.snapshot_id AND ar.asset_id=ssl.draw_asset_id
      AND ar.role='saved_draw'
    JOIN assets a ON a.id=ssl.draw_asset_id AND a.state='ready'
    WHERE sr.id=? AND sr.user_id=? AND ssl.layer_origin_key=?`)
    .bind(c.req.param('id'),c.get('userId'),c.req.param('layerId'))
    .first<{storage_key:string}>();
  if(!a) return c.json(apiError('NOT_FOUND','來源筆跡不可用'),404);
  const object=await c.env.STORAGE.get(a.storage_key);
  if(!object) return c.json(apiError('DRAW_MISSING','來源筆跡暫時無法取得'),503);
  return new Response(object.body,{headers:{'Content-Type':'application/json',
    'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
});
