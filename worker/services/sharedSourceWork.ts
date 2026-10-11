import type { Bindings, ItemRow } from '../types';

export const sourceLayerId = (itemId:string) => 'source:'+itemId;
export type SourceWork = {user_id:string;draw_seq:number;notes_seq:number;has_draw:number;typed_notes:string|null;
 status:string;review_count:number;progress_seq:number;previous_status:string};
export type SourceLayerWork = Pick<SourceWork,'user_id'|'draw_seq'|'notes_seq'|'has_draw'|'typed_notes'>;
// Viewer-visible content does not include the author's private progress.
export function sourceLayerWork(env:Bindings,itemId:string) {
 return env.DB.prepare(`SELECT user_id,draw_seq,notes_seq,draw_data IS NOT NULL AS has_draw,typed_notes
 FROM items WHERE id=?`).bind(itemId).first<SourceLayerWork>();
}
export function sourceWork(env:Bindings,itemId:string) {
 return env.DB.prepare(`SELECT user_id,draw_seq,notes_seq,draw_data IS NOT NULL AS has_draw,typed_notes,
 status,review_count,progress_seq,previous_status FROM items WHERE id=?`).bind(itemId).first<SourceWork>();
}
export function sourceProgress(row:SourceWork) {
 return {status:row.status==='resolved'||row.status==='archived'?row.status:'unsolved',
 previous_status:row.previous_status==='resolved'?'resolved':'unsolved',review_count:row.review_count,row_version:row.progress_seq};
}
// Recheck the active entry and contributor at the actual write, including its generation.
export const sourceWriteGate = `EXISTS(SELECT 1 FROM collection_items ci JOIN collections co ON co.id=ci.collection_id
 WHERE ci.id=? AND ci.collection_id=? AND ci.generation=? AND ci.state='included'
 AND ci.source_item_id=items.id AND ci.contributor_id=items.user_id AND co.lifecycle!='deleted'
 AND (co.owner_id=items.user_id OR EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id
 AND g.kind='user' AND g.role='contributor' AND g.user_id=items.user_id AND g.revoked_at IS NULL
 AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))))`;

export async function snapshotSourceWork(env:Bindings,entryId:string,snapshotId:string,uid:string) {
 const row=await env.DB.prepare(`SELECT i.id,i.draw_data,i.draw_seq,i.notes_seq,
 (co.owner_id=?1 OR EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id AND g.kind='user'
 AND g.role='contributor' AND g.user_id=?1 AND g.revoked_at IS NULL
 AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP))) AS writer,
 co.show_shared_ink FROM collection_items ci JOIN collections co ON co.id=ci.collection_id
 JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id WHERE ci.id=?2`)
 .bind(uid,entryId).first<Pick<ItemRow,'id'|'draw_data'|'draw_seq'|'notes_seq'>&{writer:number;show_shared_ink:number}>();
 if(!row)throw new Error('Source missing');
 const assetId=row.draw_data&&(row.writer||row.show_shared_ink)?crypto.randomUUID():null;
 const key=assetId?'saved-source-draw/'+snapshotId+'/'+assetId+'.json':null;
 if(key)await env.STORAGE.put(key,row.draw_data!,{httpMetadata:{contentType:'application/json'}});
 const access=`(co.owner_id=?2 OR EXISTS(SELECT 1 FROM collection_grants g WHERE g.collection_id=co.id
 AND g.kind='user' AND g.role='contributor' AND g.user_id=?2 AND g.revoked_at IS NULL
 AND (g.expires_at IS NULL OR datetime(g.expires_at)>CURRENT_TIMESTAMP)))`;
 const statements:D1PreparedStatement[]=[];
 if(assetId)statements.push(env.DB.prepare(`INSERT INTO assets(id,storage_key,mime_type,byte_size)
 SELECT ?,?,'application/json',? WHERE EXISTS(SELECT 1 FROM saved_snapshots WHERE id=?)`)
 .bind(assetId,key!,new TextEncoder().encode(row.draw_data!).byteLength,snapshotId));
 statements.push(env.DB.prepare(`INSERT INTO saved_snapshot_layers
 (snapshot_id,layer_origin_key,author_display,draw_asset_id,typed_notes,retained_field_mask)
 SELECT ss.id,'source:'||i.id,COALESCE(p.display_name,co.public_name),
 CASE WHEN ${access} OR co.show_shared_ink=1 THEN ?3 ELSE NULL END,
 CASE WHEN ${access} OR co.show_shared_notes=1 THEN i.typed_notes ELSE NULL END,
 CASE WHEN ${access} THEN 3 ELSE co.show_shared_ink+2*co.show_shared_notes END
 FROM saved_snapshots ss JOIN saved_refs sr ON sr.id=ss.saved_ref_id
 JOIN collection_items ci ON ci.id=sr.entry_id JOIN collections co ON co.id=ci.collection_id
 JOIN items i ON i.id=ci.source_item_id AND i.user_id=ci.contributor_id
 LEFT JOIN public_profiles p ON p.user_id=i.user_id
 WHERE ss.id=?1 AND ci.shared_seq=ss.source_shared_seq AND i.draw_seq=?4 AND i.notes_seq=?5
 AND (${access} OR co.show_shared_ink=1 OR co.show_shared_notes=1)`)
 .bind(snapshotId,uid,assetId,row.draw_seq??0,row.notes_seq??0));
 return {statements,cleanup:async()=>{
   // Remove only this failed, unselected snapshot and its newly uploaded ink asset.
   await env.DB.batch([
    env.DB.prepare('DELETE FROM asset_refs WHERE snapshot_id=? AND NOT EXISTS(SELECT 1 FROM saved_refs WHERE current_snapshot_id=?)').bind(snapshotId,snapshotId),
    env.DB.prepare('DELETE FROM saved_snapshots WHERE id=? AND NOT EXISTS(SELECT 1 FROM saved_refs WHERE current_snapshot_id=?)').bind(snapshotId,snapshotId),
    env.DB.prepare('DELETE FROM assets WHERE id=? AND NOT EXISTS(SELECT 1 FROM asset_refs WHERE asset_id=?)').bind(assetId||'',assetId||''),
   ]);
   if(key&&!await env.DB.prepare('SELECT id FROM assets WHERE id=?').bind(assetId!).first())await env.STORAGE.delete(key);
 }};
}
