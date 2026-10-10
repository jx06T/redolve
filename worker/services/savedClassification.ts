import type { Bindings } from '../types';
import type { TaxonomyNode } from '../../src/types';
import { createAIService } from './ai';
export async function classifySaved(env:Bindings,id:string,uid:string) {
  try {
    if(env.UPLOAD_LIMITER){const limit=await env.UPLOAD_LIMITER.limit({key:`saved-classification:${uid}`});
      if(!limit.success)throw new Error('Classification rate limit reached');}
    const row=await env.DB.prepare(`SELECT a.storage_key FROM saved_refs sr JOIN saved_snapshots ss ON ss.id=sr.current_snapshot_id
      JOIN assets a ON a.id=ss.image_asset_id AND a.state='ready' WHERE sr.id=? AND sr.user_id=? AND sr.classification_state='pending'`)
      .bind(id,uid).first<{storage_key:string}>();
    if(!row)return;
    const image=await env.STORAGE.get(row.storage_key);if(!image)throw new Error('Downloaded image unavailable');
    const records=(await env.DB.prepare('SELECT id,user_id,parent_id,label,level FROM taxonomies WHERE user_id IS NULL OR user_id=?').bind(uid).all<TaxonomyNode>()).results||[];
    const nodes=new Map(records.map(n=>[n.id,{...n,children:[] as TaxonomyNode[]}]));const roots:TaxonomyNode[]=[];
    for(const n of nodes.values()){const parent=n.parent_id?nodes.get(n.parent_id):undefined;if(parent)parent.children.push(n);else roots.push(n);}
    const result=await createAIService(env).tagProblem(await image.arrayBuffer(),roots);
    if(!result)throw new Error('Classification unavailable');
    const topic=typeof result.topic_id==='string'&&nodes.has(result.topic_id)?result.topic_id:null;
    // A manual topic choice wins, even if the AI request started earlier.
    await env.DB.prepare(`UPDATE saved_refs SET personal_topic_id=?,classification_state='ready',row_version=row_version+1,
      updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND classification_state='pending' AND personal_topic_id IS NULL`)
      .bind(topic,id,uid).run();
  }catch(error){
    console.warn('[SavedClassification] Classification failed; saved question retained',error instanceof Error?error.message:'unknown');
    await env.DB.prepare(`UPDATE saved_refs SET classification_state='failed' WHERE id=? AND user_id=? AND classification_state='pending'`).bind(id,uid).run();
  }
}
