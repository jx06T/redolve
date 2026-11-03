import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { apiError, canContribute, liveEntry, loadCollection } from '../services/collectionAccess';
import { sourceWriteGate } from '../services/sharedSourceWork';

export const questionStarsRouter=new Hono<{Bindings:Bindings;Variables:Variables}>();
questionStarsRouter.use('*',authMiddleware);
questionStarsRouter.put('/',async c=>{
  const body=await c.req.json().catch(()=>null),target=body?.target,uid=c.get('userId');
  if(typeof body?.starred!=='boolean'||!target||!['owned','saved','shared'].includes(target.kind))
    return c.json(apiError('INVALID_REQUEST','星號設定無效'),400);
  const value=body.starred?1:0;
  const validId=(id:unknown):id is string=>typeof id==='string'&&id.length>0&&id.length<=80;
  if(target.kind==='owned'||target.kind==='saved'){
    const id=target.kind==='owned'?target.itemId:target.savedRefId;
    if(!validId(id))return c.json(apiError('INVALID_REQUEST','題目識別碼無效'),400);
    const table=target.kind==='owned'?'items':'saved_refs';
    const row=await c.env.DB.prepare(`UPDATE ${table} SET starred=? WHERE id=? AND user_id=? RETURNING starred`)
      .bind(value,id,uid).first();
    return row?c.json({starred:body.starred,target:{kind:target.kind,...(target.kind==='owned'?{itemId:id}:{savedRefId:id})}}):c.json(apiError('NOT_FOUND','題目目前無法存取'),404);
  }
  if(!validId(target.collectionId)||!validId(target.entryId))return c.json(apiError('INVALID_REQUEST','共用題目識別碼無效'),400);
  const co=await loadCollection(c.env,target.collectionId);
  if(!co||!await canContribute(c.env,co,uid))return c.json(apiError('NOT_FOUND','目前無法使用此共用題目'),404);
  const entry=await liveEntry(c.env,target.entryId,co.id);
  if(!entry)return c.json(apiError('NOT_FOUND','題目目前無法存取'),404);
  if(entry.contributor_id===uid){
    const row=await c.env.DB.prepare(`UPDATE items SET starred=? WHERE id=? AND user_id=? AND ${sourceWriteGate} RETURNING starred`)
      .bind(value,entry.source_item_id!,uid,entry.id,co.id,entry.generation).first();
    return row?c.json({starred:body.starred,target:{kind:'owned',itemId:entry.source_item_id}}):c.json(apiError('NOT_FOUND','題目目前無法存取'),404);
  }
  const row=await c.env.DB.prepare(`INSERT INTO collection_item_progress(user_id,entry_id,starred)
    SELECT ?1,?2,?3 WHERE EXISTS(SELECT 1 FROM collection_items ci JOIN collections co ON co.id=ci.collection_id
      WHERE ci.id=?2 AND ci.collection_id=?4 AND ci.generation=?5 AND ci.state='included' AND co.lifecycle!='deleted'
      AND (co.owner_id=?1 OR EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id AND g.kind='user'
        AND g.user_id=?1 AND g.role='contributor' AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))))
    ON CONFLICT(user_id,entry_id) DO UPDATE SET starred=excluded.starred RETURNING starred`)
    .bind(uid,entry.id,value,co.id,entry.generation).first();
  return row?c.json({starred:body.starred}):c.json(apiError('NOT_FOUND','題目目前無法存取'),404);
});
