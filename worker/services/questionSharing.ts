import type { Bindings } from '../types';
import { canContribute, canReadCollection, cookieToken, hashToken, liveEntry, loadCollection, randomToken } from './collectionAccess';

export type ShareTarget = {kind:'owned'|'saved'|'collection';id:string;collectionId?:string};
export class SharePolicyError extends Error {
 constructor(public code:string,message:string,public status:400|403|404|409|410|503){super(message);}
}
type Content = {image_asset_id:string;source:string;keywords:string|null;topic_label:string|null;
 provider_name:string|null;draw_data:string|null;typed_notes:string|null};
type Capture = {content:Content;collectionId:string|null;entryId:string|null;gate:string;binds:(string|number|null)[]};
const accessSql=`(co.owner_id=? OR co.visibility='public' OR EXISTS(SELECT 1 FROM collection_grants g
 WHERE g.collection_id=co.id AND g.kind='user' AND g.user_id=? AND g.revoked_at IS NULL
 AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)) OR (co.visibility='link' AND
 (EXISTS(SELECT 1 FROM grant_holders h JOIN collection_grants g ON g.id=h.grant_id WHERE h.user_id=?
 AND g.collection_id=co.id AND g.kind='link' AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))
 OR EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id AND g.kind='link' AND g.token_hash=?
 AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))))`;
const notFound=()=>new SharePolicyError('NOT_FOUND','找不到可分享的題目',404);
const disabled=()=>new SharePolicyError('RESHARE_DISABLED','此版本未取得再分享授權；仍可保留與訂正自己的版本',403);

async function assetDraw(env:Bindings,id:string|null):Promise<string|null> {
 if(!id)return null;
 const asset=await env.DB.prepare("SELECT storage_key FROM assets WHERE id=? AND state='ready'").bind(id).first<{storage_key:string}>();
 const object=asset&&await env.STORAGE.get(asset.storage_key);
 if(!object)throw new SharePolicyError('DRAW_MISSING','筆跡暫時無法讀取，請稍後重試',503);
 return object.text();
}
async function capture(env:Bindings,uid:string,target:ShareTarget,cookie?:string,includeInk=true):Promise<Capture> {
 if(target.kind==='saved'){
  const row=await env.DB.prepare(`SELECT ss.image_asset_id,ss.source_title AS source,ss.source_tags AS keywords,
   ss.source_topic_label AS topic_label,ss.provider_public_name AS provider_name,ss.reshare_allowed,
   ss.id AS snapshot_id,sr.entry_id,ci.collection_id,pw.draw_asset_id,pw.draw_seq,pw.notes_seq,pw.typed_notes
   FROM saved_refs sr JOIN saved_snapshots ss ON ss.id=sr.current_snapshot_id
   JOIN personal_workspaces pw ON pw.saved_ref_id=sr.id AND pw.user_id=sr.user_id
   JOIN collection_items ci ON ci.id=sr.entry_id
   WHERE sr.id=? AND sr.user_id=?`).bind(target.id,uid).first<Content&{reshare_allowed:number;snapshot_id:string;
    entry_id:string;collection_id:string;draw_asset_id:string|null;draw_seq:number;notes_seq:number}>();
  if(!row)throw notFound();if(!row.reshare_allowed)throw disabled();
  return {content:{...row,draw_data:includeInk?await assetDraw(env,row.draw_asset_id):null},collectionId:row.collection_id,entryId:row.entry_id,
   gate:`EXISTS(SELECT 1 FROM saved_refs sr JOIN saved_snapshots ss ON ss.id=sr.current_snapshot_id
    JOIN personal_workspaces pw ON pw.saved_ref_id=sr.id AND pw.user_id=sr.user_id
    WHERE sr.id=? AND sr.user_id=? AND ss.id=? AND ss.reshare_allowed=1 AND pw.draw_seq=? AND pw.notes_seq=?)`,
   binds:[target.id,uid,row.snapshot_id,row.draw_seq,row.notes_seq]};
 }
 if(target.kind==='owned'){
  const row=await env.DB.prepare(`SELECT i.image_url AS image_asset_id,COALESCE(i.source,'題目') AS source,
   i.keywords,t.label AS topic_label,p.display_name AS provider_name,i.draw_data,i.typed_notes,
   i.content_seq,i.draw_seq,i.notes_seq FROM items i LEFT JOIN taxonomies t ON t.id=i.topic_id
   LEFT JOIN public_profiles p ON p.user_id=i.user_id WHERE i.id=? AND i.user_id=?`).bind(target.id,uid)
   .first<Content&{content_seq:number;draw_seq:number;notes_seq:number}>();
  if(!row)throw notFound();
  return {content:row,collectionId:null,entryId:null,
   gate:'EXISTS(SELECT 1 FROM items WHERE id=? AND user_id=? AND image_url=? AND content_seq=? AND draw_seq=? AND notes_seq=?)',
   binds:[target.id,uid,row.image_asset_id,row.content_seq,row.draw_seq,row.notes_seq]};
 }
 const co=await loadCollection(env,target.collectionId);
 if(!co||co.lifecycle!=='active'||!await canReadCollection(env,co,uid,cookie))throw notFound();
 const entry=await liveEntry(env,target.id,co.id);if(!entry)throw notFound();
 const isAuthor=entry.contributor_id===uid;
 if(!isAuthor&&!co.allow_reshare)throw disabled();
 const row=await env.DB.prepare(`SELECT i.image_url AS image_asset_id,COALESCE(i.source,'題目') AS source,
  i.keywords,CASE WHEN t.user_id IS NULL THEN t.label ELSE NULL END AS topic_label,p.display_name AS provider_name,
  i.draw_data,i.typed_notes,i.content_seq,i.draw_seq,i.notes_seq FROM items i
  LEFT JOIN taxonomies t ON t.id=i.topic_id LEFT JOIN public_profiles p ON p.user_id=i.user_id WHERE i.id=?`)
  .bind(entry.source_item_id).first<Content&{content_seq:number;draw_seq:number;notes_seq:number}>();
 if(!row)throw notFound();
 const canWrite=await canContribute(env,co,uid);
 const layer=!isAuthor&&canWrite?await env.DB.prepare(`SELECT draw_asset_id,typed_notes,draw_seq,notes_seq FROM shared_layers
  WHERE entry_id=? AND entry_generation=? AND user_id=? AND state='active'`).bind(entry.id,entry.generation,uid)
  .first<{draw_asset_id:string|null;typed_notes:string;draw_seq:number;notes_seq:number}>():null;
 const raw=cookieToken(cookie,co.id);const cookieHash=raw&&/^[a-f0-9]{64}$/.test(raw)?await hashToken(raw):'';
 const gate=`EXISTS(SELECT 1 FROM collection_items ci JOIN collections co ON co.id=ci.collection_id
  JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id
  WHERE ci.id=? AND co.id=? AND ci.generation=? AND ci.shared_seq=? AND ci.state='included' AND co.lifecycle='active'
  AND co.acl_version=? AND (co.allow_reshare=1 OR ci.contributor_id=?)
  AND i.content_seq=? AND i.draw_seq=? AND i.notes_seq=?
  AND (co.owner_id=ci.contributor_id OR EXISTS(SELECT 1 FROM collection_grants pg
   WHERE pg.collection_id=co.id AND pg.kind='user' AND pg.role='contributor' AND pg.user_id=ci.contributor_id
   AND pg.revoked_at IS NULL AND (pg.expires_at IS NULL OR datetime(pg.expires_at)>CURRENT_TIMESTAMP))) AND ${accessSql})`;
 // Only the sharer's own work is captured, never the other contributors' layers.
 return {content:{...row,draw_data:includeInk?(isAuthor?row.draw_data:await assetDraw(env,layer?.draw_asset_id||null)):null,
  typed_notes:isAuthor?row.typed_notes:layer?.typed_notes||null},collectionId:co.id,entryId:entry.id,gate,
  binds:[entry.id,co.id,entry.generation,entry.shared_seq,co.acl_version,uid,row.content_seq,row.draw_seq,row.notes_seq,uid,uid,uid,cookieHash]};
}

export async function createQuestionShare(env:Bindings,uid:string,target:ShareTarget,body:Record<string,unknown>,cookie?:string){
 let expiresAt:string|null=null;
 if(body.expires_at!==undefined&&body.expires_at!==null){
  const time=typeof body.expires_at==='string'?Date.parse(body.expires_at):NaN;
  if(!Number.isFinite(time)||time<=Date.now()||time>Date.now()+366*86400000)
   throw new SharePolicyError('INVALID_EXPIRY','分享期限必須介於現在與一年之間',400);
  expiresAt=new Date(time).toISOString();
 }
 const captured=await capture(env,uid,target,cookie,body.allow_ink!==false),content=captured.content;
 const ink=body.allow_ink===false?0:1,notes=body.allow_notes===false?0:1;
 const draw=ink?content.draw_data:null,typed=notes?content.typed_notes:null;
 const originKey=target.kind==='collection'?target.collectionId+':'+target.id:target.id;
 const hash=await hashToken(JSON.stringify([content.image_asset_id,content.source,content.keywords,content.topic_label,content.provider_name,draw,typed]));
 const existing=await env.DB.prepare(`SELECT token FROM independent_shares WHERE user_id=? AND origin_kind=? AND origin_key=?
  AND content_hash=? AND allow_ink=? AND allow_notes=? AND expires_at IS ? LIMIT 1`)
  .bind(uid,target.kind,originKey,hash,ink,notes,expiresAt).first<{token:string}>();
 if(existing)return {token:existing.token,allow_ink:!!ink,allow_notes:!!notes,expires_at:expiresAt};
 const token='qs_'+randomToken();
 const inserted=await env.DB.batch([
  env.DB.prepare(`INSERT INTO independent_shares(token,user_id,origin_kind,origin_key,collection_id,entry_id,image_asset_id,
   source,keywords,topic_label,provider_name,draw_data,typed_notes,content_hash,allow_ink,allow_notes,expires_at)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${captured.gate}
   AND EXISTS(SELECT 1 FROM assets WHERE id=? AND state='ready')`)
   .bind(token,uid,target.kind,originKey,captured.collectionId,captured.entryId,content.image_asset_id,
    content.source,content.keywords,content.topic_label,content.provider_name,draw,typed,hash,ink,notes,expiresAt,
    ...captured.binds,content.image_asset_id),
  env.DB.prepare(`INSERT INTO share_asset_refs(token,asset_id) SELECT token,image_asset_id FROM independent_shares WHERE token=?`).bind(token),
 ]);
 if(!inserted[0].meta.changes)throw new SharePolicyError('SOURCE_CHANGED','內容或授權已變更，請重新載入再分享',409);
 return {token,allow_ink:!!ink,allow_notes:!!notes,expires_at:expiresAt};
}

export type IndependentShare = Content&{token:string;collection_id:string|null;entry_id:string|null;origin_kind:string;
 allow_ink:number;allow_notes:number;expires_at:string|null};
export async function loadQuestionShare(env:Bindings,token:string){
 const row=await env.DB.prepare('SELECT * FROM independent_shares WHERE token=?').bind(token).first<IndependentShare>();
 if(!row)throw new SharePolicyError('NOT_FOUND','分享連結不存在或已被撤銷',404);
 if(row.expires_at&&Date.parse(row.expires_at)<=Date.now())throw new SharePolicyError('SHARE_EXPIRED','此分享連結已過期',410);
 const ready=await env.DB.prepare(`SELECT 1 FROM share_asset_refs r JOIN assets a ON a.id=r.asset_id
  WHERE r.token=? AND r.asset_id=? AND a.state='ready'`).bind(token,row.image_asset_id).first();
 if(!ready)throw new SharePolicyError('CONTENT_UNAVAILABLE','分享內容目前無法使用',410);
 return row;
}

export async function sourceCollectionHint(env:Bindings,row:IndependentShare,uid:string,cookie?:string){
 if(!row.collection_id)return {kind:'personal',provider_name:row.provider_name};
 const co=await loadCollection(env,row.collection_id);
 if(!co||co.lifecycle!=='active')return {kind:'collection',provider_name:row.provider_name,can_visit:false,access_hint:'source_unavailable'};
 const accessible=co&&await canReadCollection(env,co,uid,cookie);
 const entry=accessible&&await liveEntry(env,row.entry_id!,co.id);
 if(accessible&&!entry)return {kind:'collection',provider_name:row.provider_name,can_visit:false,access_hint:'source_unavailable'};
 if(!entry)return {kind:'collection',provider_name:row.provider_name,can_visit:false,
  access_hint:uid?'switch_account':'login'};
 const subscribed=uid&&await env.DB.prepare('SELECT 1 FROM subscriptions WHERE user_id=? AND collection_id=?').bind(uid,co!.id).first();
 const writer=uid&&await canContribute(env,co!,uid);
 return {kind:'collection',provider_name:row.provider_name,can_visit:true,title:co!.title,
  visibility:co!.visibility,url:writer?`/study?source=contributing&collection_id=${encodeURIComponent(co!.id)}&focus=${encodeURIComponent(entry.id)}`
   :subscribed?`/extended?collection_id=${encodeURIComponent(co!.id)}&focus=${encodeURIComponent(entry.id)}`
   :co!.visibility==='public'?`/explore?collection_id=${encodeURIComponent(co!.id)}&focus=${encodeURIComponent(entry.id)}`
   :`/collections/${encodeURIComponent(co!.id)}?focus=${encodeURIComponent(entry.id)}`};
}
