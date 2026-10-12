import {useState,useRef,useEffect,useSyncExternalStore} from 'react';
import type {DrawData} from '../types';
import {AppDialog} from './AppDialog';
import {DrawCanvas} from './DrawCanvas';
import {downloadWorkDraft} from '../services/workService';
import {activeConflictDialog,subscribeConflictDialogs,registerConflictDialog} from '../services/workConflictQueue';
function previewRatio(ink:DrawData){
 let bottom=ink.baseHeight||0;
 for(const stroke of ink.strokes)for(const point of stroke.points)if(Number.isFinite(point[1]))bottom=Math.max(bottom,point[1]+stroke.width*2);
 return `${ink.baseWidth||800} / ${Math.max(400,bottom+(ink.calcSpaceHeight||0))}`;
}

export function WorkConflictDialog({questionLabel,localInk,localNotes,cloudInk,cloudNotes,onCloud,onLocal,onClose}:{
 questionLabel:string;
 localInk:DrawData;localNotes:string;cloudInk:DrawData;cloudNotes:string;
 onCloud:()=>Promise<void>;onLocal:()=>Promise<void>;onClose:()=>void;
}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const token=useRef({});const active=useSyncExternalStore(subscribeConflictDialogs,activeConflictDialog);
 useEffect(()=>registerConflictDialog(token.current),[]);
 const choose=async(action:()=>Promise<void>)=>{
  setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:'版本選擇失敗；本機草稿仍保留。');}finally{setBusy(false);}
 };
 if(active!==token.current)return null;
 return <AppDialog title="作業修改無法自動合併" busy={busy} onClose={onClose}>
  <p className="mb-3 break-words text-xs text-text-muted">{questionLabel}</p>
  <p className="text-sm text-text-muted">部分修改互相重疊，或缺少可比較的舊版本。請選擇保留的作業；選擇前會保存兩份本機備份。</p>
  <div className="mt-4 grid gap-4 sm:grid-cols-2">{[
   {title:'本機版本',ink:localInk,notes:localNotes},{title:'雲端版本',ink:cloudInk,notes:cloudNotes},
  ].map(version=><section key={version.title} className="min-w-0">
   <h3 className="text-sm font-medium">{version.title}</h3>
   <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border-subtle bg-page-bg">
    <div className="relative w-full" style={{aspectRatio:previewRatio(version.ink)}}><DrawCanvas initialDrawData={version.ink} readOnly inkVisible/></div>
   </div>
   <p className="mt-2 text-xs text-text-muted">{version.ink.strokes.length} 筆畫</p>
   <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-sm">{version.notes||'無筆記'}</p>
  </section>)}</div>
  <div className="mt-4 flex flex-wrap gap-2">
   <button type="button" disabled={busy} onClick={()=>void choose(onCloud)} className="rounded-xl border border-border-subtle px-4 py-2 text-sm disabled:opacity-40">保留雲端版本</button>
   <button type="button" disabled={busy} onClick={()=>void choose(onLocal)} className="rounded-xl bg-primary/10 px-4 py-2 text-sm text-primary disabled:opacity-40">保留本機版本</button>
   <button type="button" disabled={busy} onClick={()=>downloadWorkDraft(localInk,localNotes)} className="rounded-xl px-4 py-2 text-sm text-text-muted underline underline-offset-2">下載本機作業</button>
  </div>
  <p className="mt-3 text-xs text-text-muted">保留本機版本會更新雲端中你修改的欄位；其他人的共用筆跡與筆記不受影響。關閉提示仍會保留未同步草稿。</p>
  {error&&<p role="alert" className="mt-3 text-sm text-text-muted">{error}</p>}
 </AppDialog>;
}
