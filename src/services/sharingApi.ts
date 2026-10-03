import { API_BASE } from './api';

export type Collection = {
  id:string; title:string; description:string; public_name:string;
  lifecycle:'draft'|'active'|'suspended'|'deleted';
  visibility:'restricted'|'link'|'public'; listed:number;
  show_shared_ink:number; show_shared_notes:number; row_version:number;
  role?:'owner'|'contributor'; can_contribute?:boolean; is_owner?:boolean; item_count?:number;
  pending_owner_transfer?:number;
};
export type CollectionEntry = {
  id:string; display_order:number; title:string|null; topic_id:string|null; keywords:string|null;
  content_seq:number; shared_seq:number; provider_name:string|null;
  saved_id:string|null; is_read:number; is_new_scope:number; contributor_id:string;
  latest_add_event_seq:number|null;
};
export type SharedLayer = {
  id:string; user_id:string; author_display:string; draw_asset_id:string|null;
  draw_seq:number; typed_notes:string|null; notes_seq:number;
};
export type SavedDetail = {
  saved:{id:string;entry_id:string;status:string;personal_topic_id:string|null;
    review_count:number;row_version:number;current_snapshot_id:string};
  snapshot:{id:string;source_title:string;source_label:string|null;source_tags:string|null;
    source_topic_label:string|null;collection_title:string;provider_public_name:string;
    source_content_seq:number;source_shared_seq:number};
  layers:{layer_origin_key:string;author_display:string;draw_asset_id:string|null;
    typed_notes:string|null}[];
  workspace:{id:string;draw_asset_id:string|null;draw_seq:number;typed_notes:string;
    notes_seq:number;canvas_geometry:string|null};
  source:{available:boolean};
};
export class SharingApiError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
export async function sharingApi<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const response=await fetch(`${API_BASE}${path}`,{method,credentials:'include',cache:'no-store',
    headers:body===undefined?undefined:{'Content-Type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({})) as
    {error?:{code?:string;message?:string};message?:string};
  if(!response.ok) throw new SharingApiError(response.status,payload.error?.code||'REQUEST_FAILED',
    payload.error?.message||payload.message||'操作失敗');
  return payload as T;
}
export const imageUrl=(collectionId:string,entryId:string)=>
  `${API_BASE}/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(entryId)}/image`;
export const savedImageUrl=(savedId:string)=>
  `${API_BASE}/saved/${encodeURIComponent(savedId)}/image`;
