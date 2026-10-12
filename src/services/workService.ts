import { useStore } from '../store/useStore';
import { API_BASE } from './api';
import { sharingApi, savedImageUrl, imageUrl, type SavedDetail } from './sharingApi';
import type { CollectionItemDetail, WorkContent, WorkTarget } from '../types/question';
import type { DrawData, Item } from '../types';
import {createOwnedWorkController} from './ownedWorkController';
import { DEFAULT_CALC_SPACE_HEIGHT } from '../config/constants';
import { hasUnsavedOwnedMemoryWork } from './ownedWorkService';

// An untouched workspace uses the card width, just like a newly uploaded item.
// The canvas records baseWidth when drawing starts; existing coordinates stay intact.
export const blankInk:DrawData={strokes:[],eraserMasks:[],calcSpaceHeight:DEFAULT_CALC_SPACE_HEIGHT};
const segment=(value:string)=>encodeURIComponent(value);
const workPath=(target:WorkTarget)=>target.kind==='saved'
  ?`/saved/${segment(target.savedRefId)}/workspace`
  :`/collections/${segment(target.collectionId)}/items/${segment(target.entryId)}/layers`;
const draw=async(path:string,signal?:AbortSignal)=>sharingApi<DrawData>(path,'GET',undefined,signal);
export const workService={
  async copyText(ref:WorkContent['ref']):Promise<string> {
    const path=ref.kind==='saved'?`/saved/${segment(ref.savedRefId)}/text`
      :`/collections/${segment(ref.collectionId)}/items/${segment(ref.entryId)}/text`;
    const result=await sharingApi<{text:string}>(path);
    return result.text;
  },
  async loadSaved(id:string,signal?:AbortSignal,includeReferences=true):Promise<WorkContent> {
    const d=await sharingApi<SavedDetail>(`/saved/${segment(id)}`,'GET',undefined,signal);
    const target:WorkTarget={kind:'saved',savedRefId:id};
    const ink=d.workspace.draw_asset_id?await draw(workPath(target)+'/draw',signal):blankInk;
    const layers=await Promise.all((includeReferences?d.layers:[]).map(async l=>({
      id:l.layer_origin_key,author:l.author_display,legacy:l.author_display.endsWith(' · 舊共用作業'),notes:l.typed_notes||'',
      ink:l.draw_asset_id?await draw(`/saved/${segment(id)}/layers/${segment(l.layer_origin_key)}/draw`,signal):undefined,
    })));
    return {ref:{kind:'saved',savedRefId:id},title:d.snapshot.source_title||'未命名題目',
      image:savedImageUrl(id),topic:d.saved.personal_topic_id,collectionTitle:d.snapshot.collection_title,
      provider:d.snapshot.provider_public_name,work:{target,ink,notes:d.workspace.typed_notes||'',
        inkSeq:d.workspace.draw_seq,notesSeq:d.workspace.notes_seq},layers,saved:d};
  },
  async loadShared(collectionId:string,entryId:string,account:string,signal?:AbortSignal,includeReferences=true):Promise<WorkContent> {
    const path=`/collections/${segment(collectionId)}/items/${segment(entryId)}`;
    const d=await sharingApi<CollectionItemDetail>(path,'GET',undefined,signal);
    const mine=d.layers.find(l=>l.user_id===account&&l.is_source)||d.layers.find(l=>l.user_id===account&&!l.legacy_source);
    const loaded=await Promise.all((includeReferences?d.layers:d.layers.filter(l=>l.id===mine?.id)).map(async l=>({id:l.id,author:l.author_display,
      authorId:l.user_id,legacy:l.legacy_source,notes:l.typed_notes||'',ink:l.draw_asset_id||l.has_draw?await draw(path+`/layers/${segment(l.id)}/draw`,signal):undefined})));
    return {ref:{kind:'collection',collectionId,entryId},title:d.source.source||'未命名題目',
      image:imageUrl(collectionId,entryId),topic:d.source.topic_id||null,collectionId,
      collectionTitle:d.collection.title,provider:d.source.provider_name||'題目提供者',
      work:{target:{kind:'shared',collectionId,entryId,generation:d.entry.generation,...(mine?.is_source?{sourceItemId:d.source.id}:{})},
        ink:loaded.find(l=>l.id===mine?.id)?.ink||blankInk,notes:mine?.typed_notes||'',
        inkSeq:mine?.draw_seq||0,notesSeq:mine?.notes_seq||0},layers:loaded.filter(l=>l.authorId!==account||l.legacy),shared:d};
  },
  saveInk:async(target:WorkTarget,ink:DrawData,seq:number)=>{const account=useStore.getState().currentUser?.id;const result=await sharingApi<{draw_seq:number}>(
    workPath(target)+'/draw','PUT',{draw_data:ink,expected_seq:seq,
      ...(target.kind==='shared'?{expected_generation:target.generation,...(target.sourceItemId?{source_item_id:target.sourceItemId}:{})}:{})});
    if(account&&useStore.getState().currentUser?.id===account&&target.kind==='shared'&&target.sourceItemId)useStore.getState().updateProblemInStore(target.sourceItemId,{draw_data:JSON.stringify(ink),draw_seq:result.draw_seq,vector_clock:JSON.stringify({clientId:'shared-source',seq:result.draw_seq})});
    return result;},
  saveNotes:async(target:WorkTarget,notes:string,seq:number)=>{const account=useStore.getState().currentUser?.id;const result=await sharingApi<{notes_seq:number}>(
    workPath(target)+'/notes','PUT',{typed_notes:notes,expected_seq:seq,
      ...(target.kind==='shared'?{expected_generation:target.generation,...(target.sourceItemId?{source_item_id:target.sourceItemId}:{})}:{})});
    if(account&&useStore.getState().currentUser?.id===account&&target.kind==='shared'&&target.sourceItemId)useStore.getState().updateProblemInStore(target.sourceItemId,{typed_notes:notes,notes_seq:result.notes_seq});
    return result;},
};

type Controller=ReturnType<typeof createController>;
const controllers=new Map<string,Controller>();
const keyFor=(account:string,target:WorkTarget)=>`rdv:work:v1:${account}:${JSON.stringify(target)}`;
const workItem=(account:string,content:WorkContent):Item=>({id:content.saved?.saved.id||content.shared!.entry.id,
 user_id:account,type:'problem',topic_id:content.topic,source:content.title,keywords:null,keyword_tokens:null,
 image_url:content.image,draw_data:JSON.stringify(content.work.ink),typed_notes:content.work.notes,
 draw_seq:content.work.inkSeq,notes_seq:content.work.notesSeq,status:'unsolved',review_count:0,
 vector_clock:null,created_at:'',updated_at:''});
function createController(account:string,content:WorkContent) {
 const target=content.work.target,key=keyFor(account,target);
 const guarded=(cloud:WorkContent)=>{
  if(JSON.stringify(cloud.work.target)!==JSON.stringify(target))throw Error('題目集合版本或作業對象已變更；舊草稿仍保留，請重新載入題目。');
  return workItem(account,cloud);
 };
 const save=async<T>(action:()=>Promise<T>)=>{try{return await action();}catch(error){
  if(typeof error==='object'&&error!==null&&'code' in error&&error.code==='CONFLICT')throw Error('CONFLICT: 作業版本已變更');
  throw error;
 }};
 const controller=createOwnedWorkController(key,workItem(account,content),{
  storage:localStorage,active:()=>useStore.getState().currentUser?.id===account,online:()=>navigator.onLine,delay:900,
  load:async()=>guarded(target.kind==='saved'?await workService.loadSaved(target.savedRefId,undefined,false):await workService.loadShared(target.collectionId,target.entryId,account,undefined,false)),
  saveInk:async(ink,nextSeq)=>{const result=await save(()=>workService.saveInk(target,ink,nextSeq-1));return{seq:result.draw_seq};},
  saveNotes:(notes,seq)=>save(()=>workService.saveNotes(target,notes,seq)),
  changed:()=>window.dispatchEvent(new Event('redolve:work-drafts')),
 });
 controller.restoreLegacy();
 return{...controller,observeCloud:(cloud:WorkContent)=>controller.observeCloud(guarded(cloud))};
}
export function getWorkController(account:string,content:WorkContent) {
  const key=keyFor(account,content.work.target);
  let controller=controllers.get(key);
  if(!controller){controller=createController(account,content);controllers.set(key,controller);}
  if(controllers.size>50)for(const [oldKey,old] of controllers){if(controllers.size<=50)break;if(oldKey!==key&&old.unused()){old.stop();controllers.delete(oldKey);}}
  return controller;
}
export function forgetWork(account:string,target:WorkTarget) {
  const key=keyFor(account,target);controllers.get(key)?.stop();controllers.delete(key);
  try{localStorage.removeItem(key);}catch{/* The deleted target cannot replay this draft. */}
}
window.addEventListener('online',()=>controllers.forEach(c=>c.retry()));
window.addEventListener('beforeunload',e=>{
  if([...controllers.values()].some(c=>c.pending()&&c.getState().storageFailed)){e.preventDefault();}
});
useStore.subscribe((state,previous)=>{
  if(state.currentUser?.id!==previous.currentUser?.id){controllers.forEach(c=>c.stop());controllers.clear();}
});

export const workDrawUrl=(target:WorkTarget)=>API_BASE+workPath(target)+'/draw';
export function downloadWorkDraft(ink:DrawData,notes:string) {
  const url=URL.createObjectURL(new Blob([JSON.stringify({ink,notes},null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='redolve-local-work.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export function hasUnsavedMemoryWork(){return hasUnsavedOwnedMemoryWork()||[...controllers.values()].some(c=>c.pending()&&c.getState().storageFailed);}
export function listWorkDrafts(account:string) {
  const drafts:{key:string;target:WorkTarget;ink:DrawData;notes:string}[]=[];
  const prefix=`rdv:work:v1:${account}:`;
  try{for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);if(!key?.startsWith(prefix)||key.includes(':backup:'))continue;
    const target=JSON.parse(key.slice(prefix.length)) as WorkTarget;
    const draft=JSON.parse(localStorage.getItem(key)||'{}') as {ink?:DrawData;notes?:string};
    if((target.kind==='saved'||target.kind==='shared')&&(draft.ink!==undefined||draft.notes!==undefined))
      drafts.push({key,target,ink:draft.ink||blankInk,notes:draft.notes||''});
  }}catch{/* Malformed or unavailable storage never prevents opening account settings. */}
  for(const [key,controller] of controllers){if(!key.startsWith(prefix)||!controller.pending())continue;
    const state=controller.getState();const existing=drafts.find(d=>d.key===key);
    const value={key,target:JSON.parse(key.slice(prefix.length)) as WorkTarget,ink:state.ink,notes:state.notes};
    if(existing)Object.assign(existing,value);else drafts.push(value);
  }
  return drafts;
}
