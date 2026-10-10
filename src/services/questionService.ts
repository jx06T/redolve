import { searchProblems } from './api';
import { OfflineSyncManager } from './OfflineSyncManager';
import { sharingApi, type Collection } from './sharingApi';
import type { StudySource, Subscription } from '../types/question';
import type { SearchPage } from '../types/search';
import type { TaxonomyNode } from '../types';

export const collectionService = {
  async listContributable(signal?:AbortSignal) {
    return (await sharingApi<{collections:Collection[]}>('/my/collections','GET',undefined,signal)).collections;
  },
  async memberships(ids:string[],signal?:AbortSignal) {
    type Membership={entry_id:string;collection_id:string;title:string;state:string;lifecycle:string;visibility:string};
    const requests:Promise<{memberships:Record<string,Membership[]>}>[]=[];
    for(let start=0;start<ids.length;start+=100)requests.push(sharingApi(`/my/collections/membership?item_ids=${ids.slice(start,start+100).map(encodeURIComponent).join(',')}`,'GET',undefined,signal));
    const pages=await Promise.all(requests);return Object.assign({},...pages.map(p=>p.memberships)) as Record<string,Membership[]>;
  },
  async addItems(id:string,ids:string[],shouldContinue=()=>true) {
    const results:{item_id:string;status?:string;error?:string}[]=[];
    for(let start=0;start<ids.length;start+=50) {
      if(!shouldContinue()){results.push(...ids.slice(start).map(item_id=>({item_id,error:'尚未處理：已停止後續批次'})));break;}
      try { const page=await sharingApi<{results:typeof results}>(`/collections/${encodeURIComponent(id)}/items/batch`,'POST',{item_ids:ids.slice(start,start+50)});
      results.push(...page.results); } catch(error) {
        results.push(...ids.slice(start).map(item_id=>({item_id,error:error instanceof Error?error.message:'連線失敗'})));break;
      }
    }
    return results;
  },
};
export const subscriptionService = {
  async list(signal?:AbortSignal) {
    return (await sharingApi<{subscriptions:Subscription[]}>('/subscriptions','GET',undefined,signal)).subscriptions;
  },
  unsubscribe:(id:string)=>sharingApi(`/subscriptions/${encodeURIComponent(id)}`,'DELETE'),
  subscribe:(id:string)=>sharingApi(`/subscriptions/${encodeURIComponent(id)}`,'PUT'),
  star:(collectionId:string,entryId:string,starred:boolean)=>sharingApi(
    `/subscriptions/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(entryId)}/star`,'PUT',{starred}),
};
export const questionService = {
  async search(input:{source:StudySource;query:string;collectionId?:string;topic?:string;status?:string;
    tag?:string;offset?:number;metadataOnly?:boolean;excludeArchived?:boolean;signal?:AbortSignal;guest?:boolean;taxonomies?:TaxonomyNode[]}):Promise<SearchPage> {
    if(input.source==='contributing'&&!input.collectionId)
      return {items:[],next_offset:null,scope:'shared'};
    if(input.guest) {
      if(input.source!=='owned')return {items:[],next_offset:null,scope:'mine'};
      const rows=input.query?await OfflineSyncManager.searchOfflineProblems(input.query)
        :await OfflineSyncManager.getOfflineProblemsAsItems();
      const topics=new Set<string>();
      const visit=(nodes:TaxonomyNode[],include=false)=>nodes.forEach(n=>{
        const yes=include||n.id===input.topic;if(yes)topics.add(n.id);visit(n.children||[],yes);
      });
      visit(input.taxonomies||[]);
      const items=rows.filter(p=>(!input.topic||(input.topic==='unclassified'?!p.topic_id:topics.has(p.topic_id||'')))
        &&(!input.status||p.status===input.status)&&(!input.excludeArchived||p.status!=='archived')&&(!input.tag||(()=>{try{return JSON.parse(p.keywords||'[]').includes(input.tag);}catch{return false;}})()));
      return {scope:'mine',next_offset:null,items:items.map(p=>({origin:'owned',id:p.id,title:p.source,
        topic_id:p.topic_id,topic_label:null,keywords:p.keywords,typed_notes:p.typed_notes||null,status:p.status,
        review_count:p.review_count,created_at:p.created_at,collection_id:null,collection_title:null,
        provider_name:null,saved_id:null,relevance_score:0,problem:p}))};
    }
    const params=new URLSearchParams({scope:input.source==='contributing'?'shared':'mine',browse:'1',limit:input.metadataOnly?'50':'30'});
    if(input.source!=='contributing'){params.set('origin',input.source);if(input.collectionId&&input.source==='owned')params.set('collection_id',input.collectionId);}
    else {params.set('collection_id',input.collectionId!);params.set('contributing','yes');}
    if(input.topic)params.set('topic_id',input.topic);
    if(input.status&&input.status!=='all')params.set('status',input.status);
    if(input.metadataOnly)params.set('metadata_only','1');
    if(input.excludeArchived)params.set('exclude_archived','yes');
    if(input.tag)params.set('tag',input.tag);
    if(input.offset)params.set('offset',String(input.offset));
    return searchProblems(input.query,params,input.signal);
  },
};
