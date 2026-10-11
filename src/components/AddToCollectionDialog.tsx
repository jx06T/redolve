import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppDialog } from './AppDialog';
import { collectionService } from '../services/questionService';
import { sharingApi, type Collection } from '../services/sharingApi';
import { useStore } from '../store/useStore';

export function AddToCollectionDialog({itemIds,onClose,collectionId,onResults}:{itemIds:string[];onClose:()=>void;collectionId?:string;onResults?:(failed:string[])=>void}) {
  const continueAdd=useRef(true);const [sets,setSets]=useState<Collection[]>([]);const [id,setId]=useState(collectionId||'');const [busy,setBusy]=useState(false);
  const [pending,setPending]=useState(itemIds);const [error,setError]=useState('');const [name,setName]=useState('');
  const [profile,setProfile]=useState<boolean|null>(null);const [done,setDone]=useState(0);const {showToast}=useStore();
  useEffect(()=>{const abort=new AbortController();void Promise.all([
    collectionService.listContributable(abort.signal),sharingApi<{profile:unknown}>('/me/public-profile','GET',undefined,abort.signal),
  ]).then(([collections,p])=>{if(!abort.signal.aborted){setSets(collections.filter(c=>c.lifecycle==='active'));setProfile(!!p.profile);}})
    .catch(e=>{if(!abort.signal.aborted)setError(e.message);});return ()=>abort.abort();},[]);
  const add=async()=>{
    continueAdd.current=true;setBusy(true);setError('');try{
      if(!profile){await sharingApi('/me/public-profile','PUT',{display_name:name.trim()});setProfile(true);}
      const results=await collectionService.addItems(id,pending,()=>continueAdd.current);const failed=results.filter(r=>r.error).map(r=>r.item_id);
      const added=pending.length-failed.length;setDone(n=>n+added);setPending(failed);onResults?.(failed);
      if(failed.length)setError(`${failed.length} 題未成功，可重試剩下的題目。`);
      else showToast(`已加入 ${added} 題`,'success');
    }catch(e){setError(e instanceof Error?e.message:'加入失敗');}finally{setBusy(false);}
  };
  return <AppDialog title="加入指定共用集" busy={busy} onClose={onClose}>
    <label className="block text-sm">共用集<select value={id} disabled={busy||done>0||!!collectionId} onChange={e=>setId(e.target.value)} className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3">
      <option value="">請選擇共用集</option>{sets.map(c=><option key={c.id} value={c.id}>{c.title} · {c.visibility==='public'?'所有人':c.visibility==='link'?'持連結者':'指定對象'}可觀看</option>)}</select></label>
    <p className="mt-3 text-sm text-text-muted">加入後立即在集合顯示，原題的筆跡與筆記會持續同步，貢獻者可互相查看；一般觀看者是否看得到，依集合的展示設定。</p>
    {profile===false&&<label className="mt-3 block text-sm">你的公開顯示名稱<input maxLength={80} value={name} onChange={e=>setName(e.target.value)} className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3"/><span className="mt-1 block text-xs text-text-muted">所有貢獻共用的題目使用這個帳號名稱，之後可於設定修改。</span></label>}
    {done>0&&<p className="mt-3 text-sm">已加入 {done} 題。<Link to={`/settings/collections/${id}`} className="ml-2 text-primary underline">前往集合管理</Link></p>}
    {busy&&<button onClick={()=>{continueAdd.current=false;}} className="mt-3 block text-sm text-text-muted underline">停止後續批次（保留已成功項目）</button>}
    {error&&<p role="alert" className="mt-3 text-sm text-status-eraser">{error}</p>}
    {pending.length>0?<button disabled={busy||!id||profile===null||(!profile&&!name.trim())} onClick={()=>void add()} className="mt-4 rounded-xl bg-primary px-4 py-3 text-sm text-white disabled:opacity-40">{busy?'正在加入…':done?'重試未成功的題目':`加入 ${pending.length} 題`}</button>:
      <button onClick={onClose} className="mt-4 rounded-xl bg-primary px-4 py-3 text-sm text-white">完成</button>}
  </AppDialog>;
}
