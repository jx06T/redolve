import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';
import { apiError, canReadCollection, liveEntry, loadCollection } from '../services/collectionAccess';

export const subscriptionsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();
function base64url(bytes:Uint8Array){
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode64url(raw:string){
  const plain=atob(raw.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-raw.length%4)%4));
  return Uint8Array.from(plain,x=>x.charCodeAt(0));
}
async function snapshotKey(env:Bindings){
  const secret=env.JWT_SECRET||env.BETTER_AUTH_SECRET;
  if(!secret) throw new Error('JWT_SECRET is required for feed high-water tokens');
  return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function signSnapshot(env:Bindings,userId:string,scope:string,upper:number){
  const body=new TextEncoder().encode(JSON.stringify({userId,scope,upper,exp:Date.now()+15*60*1000}));
  const sig=new Uint8Array(await crypto.subtle.sign('HMAC',await snapshotKey(env),body));
  return `${base64url(body)}.${base64url(sig)}`;
}
async function verifySnapshot(env:Bindings,token:string,userId:string,scope:string){
  try{
    const [bodyPart,sigPart]=token.split('.');
    if(!bodyPart||!sigPart)return null;
    const bytes=decode64url(bodyPart),sig=decode64url(sigPart);
    const valid=await crypto.subtle.verify('HMAC',await snapshotKey(env),sig,bytes);
    if(!valid)return null;
    const data=JSON.parse(new TextDecoder().decode(bytes));
    if(data.userId!==userId||data.scope!==scope||!Number.isSafeInteger(data.upper)
      ||data.upper<0||!Number.isFinite(data.exp)||data.exp<Date.now())return null;
    return data.upper as number;
  }catch{return null;}
}
subscriptionsRouter.put('/:collectionId',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('collectionId')||'');
  const uid=c.get('userId');
  if(!co||co.lifecycle!=='active'||!await canReadCollection(c.env,co,uid,c.req.header('cookie')))
    return c.json(apiError('NOT_FOUND','目前無法訂閱此題目集'),404);
  if(co.owner_id===uid) return c.json(apiError('INVALID_REQUEST','不需訂閱自己的題目集'),400);
  await c.env.DB.prepare(`INSERT OR IGNORE INTO subscriptions
    (user_id,collection_id,subscribed_after_seq,last_known_title)
    SELECT ?,co.id,COALESCE((SELECT MAX(seq) FROM collection_events),0),co.title
    FROM collections co WHERE co.id=? AND co.lifecycle='active'`)
    .bind(uid,co.id).run();
  return c.json({status:'subscribed'});
});
subscriptionsRouter.delete('/:collectionId',authMiddleware,async c=>{
  await c.env.DB.prepare('DELETE FROM subscriptions WHERE user_id=? AND collection_id=?')
    .bind(c.get('userId'),c.req.param('collectionId')).run();
  return c.json({status:'unsubscribed'});
});
async function visibleSubscriptions(env:Bindings,uid:string,cookie?:string) {
  const {results}=await env.DB.prepare(`SELECT s.*,co.lifecycle,co.visibility,co.public_name,co.title
    FROM subscriptions s JOIN collections co ON co.id=s.collection_id
    WHERE s.user_id=? ORDER BY s.subscribed_at DESC LIMIT 100`).bind(uid).all<Record<string,unknown>>();
  const rows=results||[];
  const out:Record<string,unknown>[]=[];
  for(const row of rows){
    const co=await loadCollection(env,String(row.collection_id));
    const canRead=Boolean(co&&await canReadCollection(env,co,uid,cookie));
    out.push(canRead?{...row,can_read:true}:{collection_id:row.collection_id,
      last_known_title:row.last_known_title,subscribed_at:row.subscribed_at,can_read:false});
  }
  return out;
}
subscriptionsRouter.get('/',authMiddleware,async c=>{
  const rows=await visibleSubscriptions(c.env,c.get('userId'),c.req.header('cookie'));
  return c.json({subscriptions:rows});
});
subscriptionsRouter.get('/feed',authMiddleware,async c=>{
  const uid=c.get('userId');
  const rows=await visibleSubscriptions(c.env,uid,c.req.header('cookie'));
  const allowed=rows.filter(r=>r.can_read).map(r=>String(r.collection_id));
  const requested=c.req.query('collection_id');
  const ids=requested?allowed.filter(x=>x===requested):allowed;
  const high=(await c.env.DB.prepare('SELECT COALESCE(MAX(seq),0) AS n FROM collection_events')
    .first<{n:number}>())?.n||0;
  const suppliedUpper=Number(c.req.query('upper'));
  const upper=Number.isSafeInteger(suppliedUpper)&&suppliedUpper>0?Math.min(suppliedUpper,high):high;
  const readAllToken=await signSnapshot(c.env,uid,requested||'*',upper);
  if(!ids.length) return c.json({items:[],upper_event_seq:upper,next_cursor:null,
    read_all_token:readAllToken});
  const before=Number(c.req.query('before'));
  const cursor=Number.isSafeInteger(before)&&before>0?before:Number.MAX_SAFE_INTEGER;
  const binds:(string|number)[]=[uid,...ids,upper,cursor];
  let query=`SELECT ci.id AS entry_id,ci.collection_id,ci.latest_add_event_seq AS event_seq,
    co.title AS collection_title,co.public_name,ci.contributor_id,
    i.source AS title,i.keywords,
    CASE WHEN t.id IS NOT NULL AND t.user_id IS NULL THEN i.topic_id ELSE NULL END AS topic_id,
    i.content_seq,ci.shared_seq,
    sr.id AS saved_id,p.display_name AS provider_name,
    CASE WHEN ci.latest_add_event_seq<=s.read_all_through_seq OR
      ci.latest_add_event_seq<=COALESCE(rd.seen_add_event_seq,0) THEN 1 ELSE 0 END AS is_read
    FROM subscriptions s JOIN collections co ON co.id=s.collection_id
    JOIN collection_items ci ON ci.collection_id=co.id AND ci.state='included'
    JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id
    JOIN assets a ON a.id=i.image_url AND a.state='ready'
    LEFT JOIN taxonomies t ON t.id=i.topic_id
    LEFT JOIN public_profiles p ON p.user_id=ci.contributor_id
    LEFT JOIN collection_item_reads rd ON rd.user_id=s.user_id AND rd.entry_id=ci.id
    LEFT JOIN saved_refs sr ON sr.user_id=s.user_id AND sr.entry_id=ci.id
    WHERE s.user_id=? AND co.lifecycle='active' AND co.id IN (${ids.map(()=>'?').join(',')})
      AND ci.latest_add_event_seq>s.subscribed_after_seq
      AND ci.latest_add_event_seq<=? AND ci.latest_add_event_seq<?
      AND (co.owner_id=ci.contributor_id OR EXISTS(SELECT 1 FROM collection_grants g
       WHERE g.collection_id=co.id AND g.kind='user' AND g.role='contributor'
         AND g.user_id=ci.contributor_id AND g.revoked_at IS NULL
         AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))`;
  const topic=c.req.query('topic_id');
  if(topic){
    query+=` AND i.topic_id IN (WITH RECURSIVE descendants(id) AS (
      SELECT id FROM taxonomies WHERE id=? AND user_id IS NULL
      UNION ALL SELECT child.id FROM taxonomies child
        JOIN descendants parent ON child.parent_id=parent.id WHERE child.user_id IS NULL
    ) SELECT id FROM descendants)`;
    binds.push(topic);
  }
  const state=c.req.query('state')||'unread';
  if(state==='unread')query+=' AND ci.latest_add_event_seq>s.read_all_through_seq AND ci.latest_add_event_seq>COALESCE(rd.seen_add_event_seq,0)';
  if(state==='read')query+=' AND (ci.latest_add_event_seq<=s.read_all_through_seq OR ci.latest_add_event_seq<=COALESCE(rd.seen_add_event_seq,0))';
  if(c.req.query('saved')==='yes')query+=' AND sr.id IS NOT NULL';
  if(c.req.query('saved')==='no')query+=' AND sr.id IS NULL';
  query+=' ORDER BY ci.latest_add_event_seq DESC,ci.id DESC LIMIT 31';
  const {results}=await c.env.DB.prepare(query).bind(...binds).all<Record<string,unknown>>();
  const page=(results||[]).slice(0,30);
  return c.json({items:page,upper_event_seq:upper,read_all_token:readAllToken,
    next_cursor:(results||[]).length>30?Number(page[page.length-1].event_seq):null});
});
subscriptionsRouter.put('/:collectionId/items/:entryId/read',authMiddleware,async c=>{
  const co=await loadCollection(c.env,c.req.param('collectionId')||'');
  if(!co||!await canReadCollection(c.env,co,c.get('userId'),c.req.header('cookie')))
    return c.json(apiError('NOT_FOUND','題目目前不可讀'),404);
  const entry=await liveEntry(c.env,c.req.param('entryId')||'',co.id);
  if(!entry) return c.json(apiError('NOT_FOUND','題目目前不可讀'),404);
  const sub=await c.env.DB.prepare('SELECT 1 FROM subscriptions WHERE user_id=? AND collection_id=?')
    .bind(c.get('userId'),co.id).first();
  if(!sub) return c.json(apiError('NOT_FOUND','目前未訂閱'),404);
  await c.env.DB.prepare(`INSERT INTO collection_item_reads(user_id,entry_id,seen_add_event_seq)
    VALUES(?,?,?) ON CONFLICT(user_id,entry_id) DO UPDATE SET
    seen_add_event_seq=MAX(seen_add_event_seq,excluded.seen_add_event_seq),
    seen_at=CURRENT_TIMESTAMP`).bind(c.get('userId'),entry.id,entry.latest_add_event_seq||0).run();
  return c.json({status:'read'});
});
subscriptionsRouter.post('/read-all',authMiddleware,async c=>{
  const b=await c.req.json().catch(()=>({}));
  const scope=typeof b.collection_id==='string'?b.collection_id:'*';
  const high=typeof b.read_all_token==='string'
    ?await verifySnapshot(c.env,b.read_all_token,c.get('userId'),scope):null;
  if(high===null)return c.json(apiError('INVALID_SNAPSHOT','請先重新載入新題，再標記已看'),409);
  const rows=await visibleSubscriptions(c.env,c.get('userId'),c.req.header('cookie'));
  const ids=rows.filter(r=>r.can_read&&(!b.collection_id||r.collection_id===b.collection_id))
    .map(r=>String(r.collection_id));
  if(!ids.length) return c.json({status:'read',affected:0,upper_event_seq:high});
  const r=await c.env.DB.prepare(`UPDATE subscriptions SET read_all_through_seq=
    MAX(read_all_through_seq,?) WHERE user_id=? AND collection_id IN (${ids.map(()=>'?').join(',')})`)
    .bind(high,c.get('userId'),...ids).run();
  return c.json({status:'read',affected:r.meta.changes,upper_event_seq:high});
});
