import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Link2Off, Send } from 'lucide-react';
import { AppDialog } from './AppDialog';
import { SwitchRow } from './SwitchRow';
import { useStore } from '../store/useStore';
import { isGuestUser } from '../utils/guest';
import { shareService } from '../services/shareService';
import type { ShareLink } from '../services/api';
import type { QuestionRef } from '../types/question';

export function ShareModal({isOpen,problemId,target,onClose,canCreate=true,blockedReason='',beforeCreate}:{
 isOpen:boolean;problemId?:string;target?:QuestionRef;onClose:()=>void;canCreate?:boolean;blockedReason?:string;beforeCreate?:()=>Promise<void>;
}){
 const user=useStore(s=>s.currentUser),showToast=useStore(s=>s.showToast),openAuth=useStore(s=>s.setAuthModalOpen);
 const key=JSON.stringify(target||{kind:'owned',itemId:problemId||''});
 const ref=useMemo(()=>JSON.parse(key) as QuestionRef,[key]);
 const epoch=useRef(0);
 const account=isGuestUser(user)?'':user!.id;
 const [ink,setInk]=useState(true),[notes,setNotes]=useState(true);
 const [days,setDays]=useState('7'),[token,setToken]=useState('');
 const [links,setLinks]=useState<ShareLink[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  epoch.current++;setToken('');setLinks([]);setError('');setBusy(false);
  if(!isOpen||!account)return;
  const abort=new AbortController();
  void shareService.list(ref,abort.signal).then(r=>{if(!abort.signal.aborted)setLinks(r.shares);})
   .catch(e=>{if(!abort.signal.aborted)setError(e.message);});
  return()=>{abort.abort();epoch.current++;};
 },[isOpen,account,ref]);
 useEffect(()=>setToken(''),[ink,notes,days]);
 if(!isOpen)return null;
 const act=async(fn:()=>Promise<void>)=>{const current=epoch.current;setBusy(true);setError('');try{await fn();}catch(e){if(current===epoch.current)setError(e instanceof Error?e.message:'分享操作失敗');}finally{if(current===epoch.current)setBusy(false);}};
 const copy=async(value:string)=>{await navigator.clipboard.writeText(value);showToast('已複製分享連結','success');};
 return <AppDialog title="分享此題" busy={busy} onClose={onClose}>
  <p className="text-sm">持有有效連結的人可直接觀看此題，不會取得來源集合的存取權限。</p>
  <p className="mt-2 text-xs text-text-muted">分享保留建立當下的版本；只包含你選擇的個人筆跡與筆記，不包含其他人的作業。你可隨時撤銷連結。</p>
  {!account?<button className="mt-4 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary" onClick={()=>{onClose();openAuth(true);}}>登入以建立分享</button>:<>
   <div className="mt-4 space-y-3">
    <SwitchRow label="包含我的筆跡" checked={ink} disabled={busy} onChange={setInk}/>
    <SwitchRow label="包含我的筆記" checked={notes} disabled={busy} onChange={setNotes}/>
    <label className="flex items-center justify-between gap-4 text-sm">連結有效期限
     <select aria-label="連結有效期限" disabled={busy} value={days} onChange={e=>setDays(e.target.value)} className="min-w-0 rounded-xl border border-border-subtle bg-page-bg px-3 py-2">
      <option value="1">1 天</option><option value="7">7 天</option><option value="30">30 天</option><option value="never">直到撤銷</option>
     </select></label>
   </div>
   {(!canCreate||blockedReason)&&<p className="mt-3 text-sm text-text-muted">{blockedReason||'此版本未取得再分享授權。集合開啟再分享後，可重新更新來源取得授權。'}</p>}
   {token&&<div className="mt-4 space-y-3 rounded-2xl border border-border-subtle bg-page-bg p-4">
    <input aria-label="題目分享網址" readOnly value={shareService.url(token)} onFocus={e=>e.target.select()} className="w-full min-w-0 rounded-xl border border-border-subtle bg-surface px-3 py-2 text-xs"/>
    <div className="flex flex-wrap gap-2">
     <button disabled={busy} onClick={()=>void act(()=>copy(shareService.url(token)))} className="inline-flex items-center gap-2 rounded-xl border border-border-subtle px-4 py-2 text-sm"><Copy size={16}/>複製連結</button>
     {typeof navigator.share==='function'&&<button disabled={busy} onClick={()=>void act(async()=>{
      try{await navigator.share({title:'Redolve 單題分享',url:shareService.url(token)});}catch(e){if(!(e instanceof Error&&e.name==='AbortError'))throw e;}
     })} className="inline-flex items-center gap-2 rounded-xl border border-border-subtle px-4 py-2 text-sm"><Send size={16}/>分享</button>}
    </div>
   </div>}
   {links.length>0&&<div className="mt-4 max-h-48 space-y-2 overflow-y-auto"><h3 className="text-sm font-medium">已建立的分享連結</h3><p className="text-xs text-text-muted">全部獨立連結也可在設定的個人檔案中管理。</p>
    {links.map(link=><div key={link.token} className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle p-3 text-xs">
     <span className="min-w-0 flex-1 text-text-muted">{link.expires_at&&Date.parse(link.expires_at)<=Date.now()?'已過期':link.expires_at?`有效至 ${new Date(link.expires_at).toLocaleDateString('zh-TW')}`:'直到撤銷'} · {link.allow_ink?'含筆跡':'無筆跡'} · {link.allow_notes?'含筆記':'無筆記'}</span>
     <button disabled={busy} onClick={()=>void act(()=>copy(shareService.url(link.token)))} className="text-text-muted underline">複製</button>
     <button disabled={busy} onClick={()=>void act(async()=>{await shareService.revoke(ref,link.token);setLinks(p=>p.filter(l=>l.token!==link.token));if(token===link.token)setToken('');})} className="inline-flex items-center gap-1 text-text-muted underline"><Link2Off size={14}/>撤銷</button>
    </div>)}
   </div>}
   <button disabled={busy||!canCreate||!!blockedReason} onClick={()=>void act(async()=>{
    const current=epoch.current;await beforeCreate?.();if(current!==epoch.current)return;
    const result=await shareService.create(ref,{allow_ink:ink,allow_notes:notes,expires_at:days==='never'?null:new Date(Date.now()+Number(days)*86400000).toISOString()});
    if(current!==epoch.current)return;setToken(result.token);const list=await shareService.list(ref);if(current===epoch.current)setLinks(list.shares);
   })} className="mt-4 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary disabled:opacity-40">{busy?'處理中…':'建立獨立分享連結'}</button>
  </>}
  {error&&<p role="alert" className="mt-3 text-sm text-text-muted">{error}</p>}
 </AppDialog>;
}
