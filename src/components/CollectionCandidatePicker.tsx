import { useEffect, useRef, useState } from 'react';
import { AddToCollectionDialog } from './AddToCollectionDialog';
import { collectionService } from '../services/questionService';
import { getProblemImageUrl } from '../services/api';
import { sharingApi } from '../services/sharingApi';
import { useStore } from '../store/useStore';
import { PersonalTopicSelect } from './PersonalTopicSelect';
import { ImageViewerModal } from './ImageViewerModal';
type Candidate={id:string;title:string|null;created_at:string;question_text?:string|null};
type Cursor={created_at:string;id:string};
export function CollectionCandidatePicker({collectionId,onChanged}:{collectionId:string;onChanged:()=>void}) {
  const account=useStore(s=>s.currentUser?.id||'');const [q,setQ]=useState('');const [topic,setTopic]=useState('');const [tag,setTag]=useState('');
  const [filter,setFilter]=useState({q:'',topic:'',tag:''});const [rows,setRows]=useState<Candidate[]>([]);
  const [cursor,setCursor]=useState<Cursor|null>(null);const [selected,setSelected]=useState<Record<string,Candidate>>({});
  const [viewSelected,setViewSelected]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [profile,setProfile]=useState(false);
  const [profileDialog,setProfileDialog]=useState(false);const [adding,setAdding]=useState(false);const continueAdd=useRef(true);const abortRef=useRef<AbortController>();
  const [preview,setPreview]=useState<Candidate|null>(null);
  const params=(next?:Cursor|null)=>{const p=new URLSearchParams({q:filter.q,topic_id:filter.topic,tag:filter.tag});
    if(next){p.set('after_at',next.created_at);p.set('after_id',next.id);}return p;};
  const load=async(more=false)=>{
    abortRef.current?.abort();const abort=new AbortController();abortRef.current=abort;setBusy(true);setError('');
    try{const r=await sharingApi<{items:Candidate[];next_cursor:Cursor|null}>(`/collections/${collectionId}/candidates?${params(more?cursor:null)}`,'GET',undefined,abort.signal);
      if(!abort.signal.aborted){setRows(p=>more?[...p,...r.items]:r.items);setCursor(r.next_cursor);}}
    catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'讀取失敗');}finally{if(!abort.signal.aborted)setBusy(false);}
  };
  useEffect(()=>{setSelected({});setPreview(null);setProfile(false);const abort=new AbortController();void sharingApi<{profile:unknown}>('/me/public-profile','GET',undefined,abort.signal).then(r=>{if(!abort.signal.aborted)setProfile(!!r.profile);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return ()=>abort.abort();},[account,collectionId]);
  useEffect(()=>{setRows([]);void load();return ()=>abortRef.current?.abort();},[account,collectionId,filter]);
  const all=async()=>{
    setBusy(true);setError('');const abort=new AbortController();abortRef.current?.abort();abortRef.current=abort;
    try{
      const fixed:Record<string,Candidate>={};let next:Cursor|null=null;
      do{const r: {items:Candidate[];next_cursor:Cursor|null}=await sharingApi(`/collections/${collectionId}/candidates?${params(next)}`,'GET',undefined,abort.signal);
        r.items.forEach(i=>fixed[i.id]=i);next=r.next_cursor;}while(next&&!abort.signal.aborted);
      if(!abort.signal.aborted)setSelected(p=>({...p,...fixed}));
    }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'選取失敗，原選取仍保留');}finally{if(!abort.signal.aborted)setBusy(false);}
  };
  const add=async()=>{
    if(!profile){setProfileDialog(true);return;}continueAdd.current=true;setAdding(true);setBusy(true);setError('');
    try{const ids=Object.keys(selected),r=await collectionService.addItems(collectionId,ids,()=>continueAdd.current);
      const failed=r.filter(x=>x.error);setSelected(p=>Object.fromEntries(failed.map(x=>[x.item_id,p[x.item_id]]).filter(([,v])=>v)));
      onChanged();await load();
      if(failed.length)setError(`已加入 ${ids.length-failed.length} 題；${failed.length} 題未成功，可重試。`);
    }catch(e){setError(e instanceof Error?e.message:'加入失敗');}finally{setAdding(false);setBusy(false);}
  };
  const shown=viewSelected?Object.values(selected):rows;
  const hidden=Object.keys(selected).filter(id=>!rows.some(r=>r.id===id)).length;
  return <section className="rounded-3xl border border-border-subtle bg-surface p-5 space-y-3">
    <h2 className="font-semibold">加入我上傳的原題</h2><p className="text-sm text-text-muted">只列尚未加入的原題；按分類與標籤選題，切換條件保留選取。加入後原題仍保留在自己的題庫；筆跡與筆記同步給集合貢獻者，一般觀看者依展示設定檢視。</p>
    <form onSubmit={e=>{e.preventDefault();setFilter({q:q.trim(),topic,tag:tag.trim()});}} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <input value={q} onChange={e=>setQ(e.target.value)} aria-label="搜尋可加入原題" placeholder="搜尋原題" className="min-w-0 w-full rounded-xl border border-border-subtle bg-page-bg p-3 text-sm"/>
      <PersonalTopicSelect id="candidate-topic" emptyLabel="全部科目與單元" value={topic} onChange={setTopic}/>
      <input value={tag} onChange={e=>setTag(e.target.value)} aria-label="篩選原題標籤" placeholder="標籤（完全符合）" className="min-w-0 w-full rounded-xl border border-border-subtle bg-page-bg p-3 text-sm"/>
      <button disabled={busy} className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">套用搜尋與分類</button>
    </form>
    <div className="flex flex-wrap gap-3 text-xs"><button disabled={busy} onClick={()=>setSelected(p=>({...p,...Object.fromEntries(rows.map(i=>[i.id,i]))}))} className="underline text-primary">選取已載入候選</button><button disabled={busy} onClick={()=>void all()} className="underline text-primary">選取目前所有符合條件題目</button>
      <button onClick={()=>setViewSelected(v=>!v)} className="underline">{viewSelected?'返回候選清單':'查看所有已選題目'}</button><button disabled={busy} onClick={()=>setSelected({})} className="underline">清除選取</button></div>
    <p role="status" className="text-xs text-text-muted">已選 {Object.keys(selected).length} 題{hidden>0?`，其中 ${hidden} 題在目前篩選外`:''}</p>
    <div className="max-h-96 overflow-y-auto rounded-2xl border border-border-subtle p-2">
      {shown.map(i=><div key={i.id} className="flex gap-3 items-start rounded-2xl p-3 text-sm hover:bg-page-bg">
        <input aria-label={`選取 ${i.title||'未命名題目'}`} className="mt-3" disabled={busy} type="checkbox" checked={!!selected[i.id]} onChange={e=>setSelected(p=>{const next={...p};if(e.target.checked)next[i.id]=i;else delete next[i.id];return next;})}/>
        <button type="button" aria-label={`檢視 ${i.title||'未命名題目'} 圖片`} onClick={()=>setPreview(i)} className="shrink-0 rounded-xl border border-border-subtle bg-white p-1">
          <img loading="lazy" src={getProblemImageUrl(i.id)} alt="" className="h-24 w-28 sm:h-28 sm:w-40 object-contain"/><span className="block py-1 text-xs text-primary">放大檢視</span>
        </button>
        <div className="min-w-0 flex-1"><p className="font-medium">{i.title||'未命名題目'}</p><p className="mt-2 line-clamp-4 whitespace-pre-wrap text-text-muted">{i.question_text||'尚未辨識題目文字'}</p></div>
      </div>)}
      {!shown.length&&<p className="p-3 text-sm text-text-muted">沒有題目。</p>}
    </div>
    {error&&<p role="alert" className="text-sm text-status-eraser">{error}</p>}
    <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
      {!viewSelected&&cursor&&<button disabled={busy} onClick={()=>void load(true)} className="min-h-11 rounded-xl border border-border-subtle px-4 py-3 text-sm disabled:opacity-40">載入更多</button>}
      <button disabled={busy||!Object.keys(selected).length} onClick={()=>void add()} className="min-h-11 rounded-xl bg-primary px-4 py-3 text-sm text-white disabled:opacity-40">{busy?'處理中…':`加入選取的 ${Object.keys(selected).length} 題`}</button>
      {adding&&<button onClick={()=>{continueAdd.current=false;}} className="min-h-11 rounded-xl border border-border-subtle px-4 py-3 text-sm text-text-muted">停止後續批次</button>}
    </div>
    {preview&&<ImageViewerModal imageUrl={getProblemImageUrl(preview.id)} title={preview.title||'題目圖片'} isOpen onClose={()=>setPreview(null)}/>}
    {profileDialog&&<AddToCollectionDialog collectionId={collectionId} itemIds={Object.keys(selected)} onResults={failed=>setSelected(p=>Object.fromEntries(failed.map(id=>[id,p[id]]).filter(([,v])=>v)))} onClose={()=>{setProfileDialog(false);void sharingApi<{profile:unknown}>('/me/public-profile').then(r=>setProfile(!!r.profile)).catch(e=>setError(e.message));onChanged();void load();}}/>}
  </section>;
}
