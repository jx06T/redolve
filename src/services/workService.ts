import { useStore } from '../store/useStore';
import { API_BASE } from './api';
import { sharingApi, savedImageUrl, imageUrl, type SavedDetail } from './sharingApi';
import type { CollectionItemDetail, WorkContent, WorkTarget } from '../types/question';
import type { DrawData } from '../types';
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
  async loadSaved(id:string,signal?:AbortSignal):Promise<WorkContent> {
    const d=await sharingApi<SavedDetail>(`/saved/${segment(id)}`,'GET',undefined,signal);
    const target:WorkTarget={kind:'saved',savedRefId:id};
    const ink=d.workspace.draw_asset_id?await draw(workPath(target)+'/draw',signal):blankInk;
    const layers=await Promise.all(d.layers.map(async l=>({
      id:l.layer_origin_key,author:l.author_display,legacy:l.author_display.endsWith(' · 舊共用作業'),notes:l.typed_notes||'',
      ink:l.draw_asset_id?await draw(`/saved/${segment(id)}/layers/${segment(l.layer_origin_key)}/draw`,signal):undefined,
    })));
    return {ref:{kind:'saved',savedRefId:id},title:d.snapshot.source_title||'未命名題目',
      image:savedImageUrl(id),topic:d.saved.personal_topic_id,collectionTitle:d.snapshot.collection_title,
      provider:d.snapshot.provider_public_name,work:{target,ink,notes:d.workspace.typed_notes||'',
        inkSeq:d.workspace.draw_seq,notesSeq:d.workspace.notes_seq},layers,saved:d};
  },
  async loadShared(collectionId:string,entryId:string,account:string,signal?:AbortSignal):Promise<WorkContent> {
    const path=`/collections/${segment(collectionId)}/items/${segment(entryId)}`;
    const d=await sharingApi<CollectionItemDetail>(path,'GET',undefined,signal);
    const mine=d.layers.find(l=>l.user_id===account&&l.is_source)||d.layers.find(l=>l.user_id===account&&!l.legacy_source);
    const loaded=await Promise.all(d.layers.map(async l=>({id:l.id,author:l.author_display,
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

type WorkState={ink:DrawData;notes:string;status:'saved'|'pending'|'saving'|'error'|'conflict';
  error:string;revision:number;storageFailed:boolean};
type Controller=ReturnType<typeof createController>;
const controllers=new Map<string,Controller>();
const keyFor=(account:string,target:WorkTarget)=>`rdv:work:v1:${account}:${JSON.stringify(target)}`;
function createController(account:string,content:WorkContent) {
  const {target}=content.work;const key=keyFor(account,target);
  let inkSeq=content.work.inkSeq,notesSeq=content.work.notesSeq;
  let pendingInk:DrawData|undefined,pendingNotes:string|undefined;
  let blocked=false,running=false,timer:ReturnType<typeof setTimeout>|undefined;
  let state:WorkState={ink:content.work.ink,notes:content.work.notes,status:'saved',error:'',revision:0,storageFailed:false};
  const listeners=new Set<()=>void>();
  try {
    const raw=localStorage.getItem(key);
    if(raw){
      const d=JSON.parse(raw) as {ink?:DrawData;notes?:string;inkSeq:number;notesSeq:number};
      pendingInk=d.ink;pendingNotes=d.notes;inkSeq=d.inkSeq;notesSeq=d.notesSeq;
      state={...state,ink:d.ink||state.ink,notes:d.notes??state.notes,status:'pending',error:'這台裝置有尚未同步的作業。'};
    }
  }catch {state={...state,storageFailed:true};}
  const notify=()=>{state={...state,revision:state.revision+1};listeners.forEach(l=>l());};
  const persist=()=>{
    try{
      if(pendingInk===undefined&&pendingNotes===undefined)localStorage.removeItem(key);
      else localStorage.setItem(key,JSON.stringify({ink:pendingInk,notes:pendingNotes,inkSeq,notesSeq}));
      state={...state,storageFailed:false};
    }catch {state={...state,storageFailed:true,error:'本機草稿儲存失敗，請保留此頁並重試。'};}
    window.dispatchEvent(new Event('redolve:work-drafts'));
  };
  const flush=async()=>{
    if(running||blocked||useStore.getState().currentUser?.id!==account)return;
    if(!navigator.onLine){state={...state,status:'pending',error:'尚未同步；草稿保留在此裝置。'};notify();return;}
    running=true;state={...state,status:'saving',error:''};notify();
    try{
      while((pendingInk!==undefined||pendingNotes!==undefined)&&useStore.getState().currentUser?.id===account){
        if(pendingInk!==undefined){
          const value=pendingInk;
          const res=await workService.saveInk(target,value,inkSeq);inkSeq=res.draw_seq;
          if(pendingInk===value)pendingInk=undefined;
          persist();
        }
        if(pendingNotes!==undefined){
          const value=pendingNotes;
          const res=await workService.saveNotes(target,value,notesSeq);notesSeq=res.notes_seq;
          if(pendingNotes===value)pendingNotes=undefined;
          persist();
        }
      }
      state={...state,status:pendingInk===undefined&&pendingNotes===undefined?'saved':'pending'};
    }catch(e){
      const status=typeof e==='object'&&e!==null&&'status' in e?Number(e.status):0;
      blocked=status===409||status===403||status===404||status===401;
      state={...state,status:status===409?'conflict':'error',
        error:e instanceof Error?e.message:'儲存失敗；請重試。'};
      persist();
    }finally{running=false;notify();}
  };
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>void flush(),900);};
  // Restored drafts resume automatically; waiting is not a manual retry state.
  if(pendingInk!==undefined||pendingNotes!==undefined)schedule();
  return {
    getState:()=>state,
    subscribe:(fn:()=>void)=>{listeners.add(fn);return ()=>{listeners.delete(fn);};},
    ink:(value:DrawData)=>{state={...state,ink:value,status:'pending'};pendingInk=value;persist();notify();schedule();},
    notes:(value:string)=>{state={...state,notes:value,status:'pending'};pendingNotes=value;persist();notify();schedule();},
    retry:()=>void flush(),
    observeCloud:(cloud:WorkContent)=>{
      if(running||blocked||pendingInk!==undefined||pendingNotes!==undefined)return;
      // A GET started before a completed write must never roll an acknowledged field back.
      const newerInk=cloud.work.inkSeq>inkSeq,newerNotes=cloud.work.notesSeq>notesSeq;
      if(!newerInk&&!newerNotes)return;
      if(newerInk)inkSeq=cloud.work.inkSeq;if(newerNotes)notesSeq=cloud.work.notesSeq;
      state={...state,ink:newerInk?cloud.work.ink:state.ink,notes:newerNotes?cloud.work.notes:state.notes};notify();
    },
    acceptCloud:(cloud:WorkContent)=>{
      if(JSON.stringify(cloud.work.target)!==JSON.stringify(target))throw new Error('題目集合版本已變動，舊作業僅能另存取回。');
      if(pendingInk!==undefined||pendingNotes!==undefined){
        // Keep a recoverable copy before the explicit choice to replace the editor.
        localStorage.setItem(key+`:backup:${Date.now()}`,JSON.stringify({ink:state.ink,notes:state.notes,inkSeq,notesSeq}));
      }
      pendingInk=undefined;pendingNotes=undefined;inkSeq=cloud.work.inkSeq;notesSeq=cloud.work.notesSeq;blocked=false;
      state={...state,ink:cloud.work.ink,notes:cloud.work.notes,status:'saved',error:''};persist();notify();
    },
    stop:()=>{clearTimeout(timer);blocked=true;},
    pending:()=>pendingInk!==undefined||pendingNotes!==undefined,
    unused:()=>listeners.size===0&&pendingInk===undefined&&pendingNotes===undefined,
  };
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
