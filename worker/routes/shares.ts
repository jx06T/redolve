import { Hono } from 'hono';
import { Bindings, Variables, ShareRow, ItemRow } from '../types';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { createQuestionShare, loadQuestionShare, sourceCollectionHint, SharePolicyError, type ShareTarget } from '../services/questionSharing';

export const sharesRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const shareRoutes = [
 {base:'/api/problems/:id',target:(id:string):ShareTarget=>({kind:'owned',id})},
 {base:'/api/saved/:id',target:(id:string):ShareTarget=>({kind:'saved',id})},
 {base:'/api/collections/:collectionId/items/:id',target:(id:string,collectionId?:string):ShareTarget=>({kind:'collection',id,collectionId})},
];
for(const route of shareRoutes){
 sharesRouter.post(route.base+'/share',authMiddleware,async c=>{
  const body=await c.req.json().catch(()=>null);
  if(!body||typeof body!=='object'||Array.isArray(body)||['allow_ink','allow_notes'].some(key=>body[key]!==undefined&&typeof body[key]!=='boolean'))return c.json({error:{code:'INVALID_REQUEST',message:'分享設定格式無效'}},400);
  try{return c.json(await createQuestionShare(c.env,c.get('userId'),route.target(c.req.param('id')!,c.req.param('collectionId')),body,c.req.header('cookie')),201);}
  catch(e){if(e instanceof SharePolicyError)return c.json({error:{code:e.code,message:e.message}},e.status);throw e;}
 });
 if(route.base==='/api/problems/:id')continue;
 sharesRouter.get(route.base+'/shares',authMiddleware,async c=>{
  const target=route.target(c.req.param('id')!,c.req.param('collectionId'));
  const key=target.kind==='collection'?target.collectionId+':'+target.id:target.id;
  const rows=await c.env.DB.prepare('SELECT token,allow_ink,allow_notes,expires_at,created_at FROM independent_shares WHERE user_id=? AND origin_kind=? AND origin_key=? ORDER BY created_at DESC LIMIT 100').bind(c.get('userId'),target.kind,key).all();
  return c.json({shares:rows.results||[]});
 });
 sharesRouter.delete(route.base+'/share/:token',authMiddleware,async c=>{
  const target=route.target(c.req.param('id')!,c.req.param('collectionId'));
  const key=target.kind==='collection'?target.collectionId+':'+target.id:target.id;
  await c.env.DB.prepare('DELETE FROM independent_shares WHERE token=? AND user_id=? AND origin_kind=? AND origin_key=?').bind(c.req.param('token'),c.get('userId'),target.kind,key).run();
  return c.json({status:'revoked'});
 });
}
sharesRouter.get('/api/me/question-shares',authMiddleware,async c=>{
 let cursor:{created:string;token:string}|null=null;
 if(c.req.query('cursor')){try{cursor=JSON.parse(c.req.query('cursor')!);if(typeof cursor?.created!=='string'||typeof cursor?.token!=='string')throw Error();}catch{return c.json({error:{code:'INVALID_CURSOR',message:'分享分頁無效'}},400);}}
 const rows=await c.env.DB.prepare(`SELECT token,source,origin_kind,allow_ink,allow_notes,expires_at,created_at FROM independent_shares WHERE user_id=?
  ${cursor?'AND (created_at<? OR (created_at=? AND token<?))':''} ORDER BY created_at DESC,token DESC LIMIT 51`)
  .bind(c.get('userId'),...(cursor?[cursor.created,cursor.created,cursor.token]:[])).all<{token:string;created_at:string}>();
 const items=(rows.results||[]).slice(0,50),last=items.at(-1);
 return c.json({shares:items,next_cursor:rows.results.length>50&&last?JSON.stringify({created:last.created_at,token:last.token}):null});
});
sharesRouter.delete('/api/me/question-shares/expired',authMiddleware,async c=>{
 const result=await c.env.DB.prepare("DELETE FROM independent_shares WHERE user_id=? AND expires_at IS NOT NULL AND datetime(expires_at)<=CURRENT_TIMESTAMP RETURNING token").bind(c.get('userId')).all();
 return c.json({removed:result.results.length});
});
sharesRouter.delete('/api/me/question-shares/:token',authMiddleware,async c=>{
 await c.env.DB.prepare('DELETE FROM independent_shares WHERE token=? AND user_id=?').bind(c.req.param('token'),c.get('userId')).run();
 return c.json({status:'revoked'});
});

// List all active links so a user can revoke links after closing the dialog.
sharesRouter.get('/api/problems/:id/shares', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const problemId = c.req.param('id');
  const item = await c.env.DB.prepare('SELECT id FROM items WHERE id = ? AND user_id = ?')
    .bind(problemId, userId).first();
  if (!item) return c.json({ error: { code: 'NOT_FOUND', message: '找不到題目' } }, 404);
  const { results } = await c.env.DB.prepare(
    'SELECT token, allow_ink, allow_notes, expires_at, created_at FROM shares WHERE item_id = ? AND user_id = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC'
  ).bind(problemId, userId, new Date().toISOString()).all();
  const independent=await c.env.DB.prepare("SELECT token,allow_ink,allow_notes,expires_at,created_at FROM independent_shares WHERE user_id=? AND origin_kind='owned' AND origin_key=? ORDER BY created_at DESC LIMIT 100").bind(userId,problemId).all();
  return c.json({ shares: [...(independent.results||[]),...(results||[])] });
});

// 2. Revoke Share Token (Protected)
sharesRouter.delete('/api/problems/:id/share/:token', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const token = c.req.param('token') || '';

  await c.env.DB.prepare("DELETE FROM independent_shares WHERE token=? AND user_id=? AND origin_kind='owned' AND origin_key=?").bind(token,userId,c.req.param('id')).run();
  await c.env.DB.prepare('DELETE FROM shares WHERE token = ? AND item_id = ? AND user_id = ?')
    .bind(token, c.req.param('id'), userId).run();

  return c.json({ status: 'revoked' });
});

// 3. Public Read-Only Metadata (Public Route)
sharesRouter.get('/share/:token', optionalAuthMiddleware, async (c) => {
  // If the request comes from a browser navigation (Accept: text/html), serve the SPA entry
  const acceptHeader = c.req.header('accept') || '';
  if (acceptHeader.includes('text/html') && c.env.ASSETS) {
    const asset = await c.env.ASSETS.fetch(c.req.raw);
    const headers = new Headers(asset.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('Cache-Control', 'no-store');
    return new Response(asset.body, { status: asset.status, headers });
  }

  const token = c.req.param('token') || '';

  if(token.startsWith('qs_')){
    try{
      const share=await loadQuestionShare(c.env,token);
      const origin=await sourceCollectionHint(c.env,share,c.get('userId')||'',c.req.header('cookie'));
      c.header('X-Robots-Tag','noindex, nofollow');c.header('Referrer-Policy','no-referrer');
      return c.json({item:{id:'share:'+token,type:'problem',source:share.source,keywords:share.keywords,
        topic_label:share.topic_label,draw_data:share.draw_data,typed_notes:share.typed_notes},
        share:{token,allow_ink:!!share.allow_ink,allow_notes:!!share.allow_notes,fixed_version:true},origin});
    }catch(e){if(e instanceof SharePolicyError)return c.json({error:{code:e.code,message:e.message}},e.status);throw e;}
  }
  const share = await c.env.DB.prepare('SELECT * FROM shares WHERE token = ?').bind(token).first<ShareRow & { allow_notes?: number }>();

  if (!share) {
    return c.json({ error: { code: 'NOT_FOUND', message: '分享連結不存在或已被撤銷' } }, 404);
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return c.json({ error: { code: 'SHARE_EXPIRED', message: '此分享連結已過期' } }, 410);
  }

  const item = await c.env.DB.prepare('SELECT id, type, topic_id, keywords, source, draw_data, typed_notes, created_at FROM items WHERE id = ?')
    .bind(share.item_id)
    .first<Partial<ItemRow>>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '分享的題目已遭刪除' } }, 404);
  }

  // 權限控管：如果不允許筆跡或筆記，回傳 null 隱藏欄位
  const shouldShowInk = Boolean(share.allow_ink);
  const shouldShowNotes = share.allow_notes !== undefined ? Boolean(share.allow_notes) : true;

  c.header('X-Robots-Tag', 'noindex, nofollow');
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');
  return c.json({
    item: {
      ...item,
      draw_data: shouldShowInk ? item.draw_data : null,
      typed_notes: shouldShowNotes ? item.typed_notes : null,
    },
    share: {
      token: share.token,
      allow_ink: shouldShowInk,
      allow_notes: shouldShowNotes,
    },
  });
});

// 4. Public Read-Only Image Proxy (Public Route)
sharesRouter.get('/share/:token/image', async (c) => {
  const token = c.req.param('token') || '';

  if(token.startsWith('qs_')){
    try{
      const share=await loadQuestionShare(c.env,token);
      const asset=await c.env.DB.prepare("SELECT storage_key,mime_type FROM assets WHERE id=? AND state='ready'").bind(share.image_asset_id).first<{storage_key:string;mime_type:string}>();
      const object=asset&&await c.env.STORAGE.get(asset.storage_key);
      if(!object)return c.json({error:{code:'IMAGE_MISSING',message:'分享圖片暫時無法取得'}},503);
      return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||asset!.mime_type,
       'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
    }catch(e){if(e instanceof SharePolicyError)return c.json({error:{code:e.code,message:e.message}},e.status);throw e;}
  }
  const share = await c.env.DB.prepare('SELECT item_id, expires_at FROM shares WHERE token = ?').bind(token).first<ShareRow>();

  if (!share) {
    return c.json({ error: { code: 'NOT_FOUND', message: '分享連結不存在' } }, 404);
  }

  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return c.json({ error: { code: 'SHARE_EXPIRED', message: '連結已過期' } }, 410);
  }

  const item = await c.env.DB.prepare('SELECT image_url FROM items WHERE id = ?').bind(share.item_id).first<ItemRow>();

  if (!item) {
    return c.json({ error: { code: 'NOT_FOUND', message: '圖片不存在' } }, 404);
  }

  const asset=await c.env.DB.prepare('SELECT storage_key,state FROM assets WHERE id=?').bind(item.image_url).first<{storage_key:string;state:string}>();
  if(asset&&asset.state!=='ready')return c.json({error:{code:'CONTENT_UNAVAILABLE',message:'分享內容目前無法使用'}},410);
  const object = await c.env.STORAGE.get(asset?.storage_key||item.image_url);
  if (!object) {
    return c.json({ error: { code: 'NOT_FOUND', message: '圖片檔案不存在' } }, 404);
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    },
  });
});
