import { useEffect, useRef, useState } from 'react';
import { shareService } from '../../services/shareService';
import type { ShareLink } from '../../services/api';
import { useStore } from '../../store/useStore';

type LinkRecord=ShareLink&{source:string;origin_kind:string};
export function IndependentShareLinks(){
 const [open,setOpen]=useState(false),[links,setLinks]=useState<LinkRecord[]>([]);
 const [cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const showToast=useStore(s=>s.showToast),abort=useRef<AbortController>();
 const load=async(more=false)=>{
  abort.current?.abort();const current=new AbortController();abort.current=current;setBusy(true);setError('');
  try{const result=await shareService.listAll(more?cursor||undefined:undefined,current.signal);
   if(current.signal.aborted)return;setLinks(prev=>more?[...prev,...result.shares]:result.shares);setCursor(result.next_cursor);
  }catch(e){if(!current.signal.aborted)setError(e instanceof Error?e.message:'無法讀取分享連結');}
  finally{if(!current.signal.aborted)setBusy(false);}
 };
 useEffect(()=>{if(open)void load();return()=>abort.current?.abort();},[open]);
 const act=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'操作失敗');}finally{setBusy(false);}};
 return <details onToggle={e=>setOpen(e.currentTarget.open)} className="rounded-3xl border border-border-subtle bg-surface p-5">
  <summary className="cursor-pointer text-sm font-semibold">我的單題分享連結</summary>
  <p className="mt-3 text-xs text-text-muted">獨立連結保留分享時的內容。原題移除後仍可在這裡撤銷；過期連結可清除保存資料與圖片引用。</p>
  <button disabled={busy} onClick={()=>void act(async()=>{await shareService.clearExpired();await load();})} className="mt-3 text-xs text-text-muted underline disabled:opacity-40">清除我的過期連結</button>
  {error&&<p role="alert" className="mt-3 text-sm text-text-muted">{error}<button disabled={busy} onClick={()=>void load()} className="ml-3 underline">重試</button></p>}
  {links.length===0&&!busy&&!error&&<p className="mt-3 text-sm text-text-muted">尚無獨立分享連結。</p>}
  <ul className="mt-3 space-y-2">{links.map(link=>{
   const expired=!!link.expires_at&&Date.parse(link.expires_at)<=Date.now();
   return <li key={link.token} className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle p-3 text-xs">
    <div className="min-w-0 flex-1"><p className="break-words">{link.source}</p><p className="mt-1 text-text-muted">{link.origin_kind==='owned'?'我上傳':link.origin_kind==='saved'?'我存入':'共用題目'} · {expired?'已過期':link.expires_at?`有效至 ${new Date(link.expires_at).toLocaleDateString('zh-TW')}`:'直到撤銷'}</p></div>
    {!expired&&<button disabled={busy} onClick={()=>void act(async()=>{await navigator.clipboard.writeText(shareService.url(link.token));showToast('已複製分享連結','success');})} className="text-text-muted underline">複製</button>}
    <button disabled={busy} onClick={()=>void act(async()=>{await shareService.revokeAny(link.token);setLinks(prev=>prev.filter(row=>row.token!==link.token));})} className="text-text-muted underline">{expired?'移除':'撤銷'}</button>
   </li>;
  })}</ul>
  {busy&&<p className="mt-3 text-xs text-text-muted">處理中…</p>}
  {cursor&&<button disabled={busy} onClick={()=>void load(true)} className="mt-3 rounded-xl border border-border-subtle px-4 py-2 text-sm">載入更多</button>}
 </details>;
}
