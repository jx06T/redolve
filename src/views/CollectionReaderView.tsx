import { useEffect, useRef, useState } from 'react';
import { Link, useNavigationType, useParams, useSearchParams } from 'react-router-dom';
import { ExternalQuestionCard } from '../components/ExternalQuestionCard';
import { QuestionStream } from '../components/QuestionStream';
import { BackButton } from '../components/ReaderNavigation';
import { useStore } from '../store/useStore';
import { sharingApi, type Collection, type CollectionEntry } from '../services/sharingApi';
import { subscriptionService } from '../services/questionService';
import type { Subscription } from '../types/question';

type Row=CollectionEntry&{collection_id?:string};
const storedSort=(account:string)=>{try{return localStorage.getItem(`rdv:subscription-sort:${account}`)||'subscribed';}catch{return 'subscribed';}};
const readerCache=new Map<string,{rows:Row[];cursor:{display_order:number;id:string}|null;offset:number|null}>();
export function CollectionReaderView({mode}:{mode:'extended'|'explore'|'collection'}) {
  const route=useParams();const [params,setParams]=useSearchParams();
  const navigation=useNavigationType();
  const id=mode==='collection'?route.id||'':params.get('collection_id')||'';
  const query=params.get('q')||'';const filter=params.get('state')||'';const sort=params.get('sort')||storedSort(useStore.getState().currentUser?.id||'guest');
  const {currentUser,setAuthModalOpen}=useStore();const account=currentUser?.id||'';
  const [controlsOpen,setControlsOpen]=useState(false);
  const [subs,setSubs]=useState<Subscription[]>([]);const [listQuery,setListQuery]=useState('');
  const [co,setCo]=useState<Collection>();const [queryDraft,setQueryDraft]=useState(query);
  const [rows,setRows]=useState<Row[]>([]);const [cursor,setCursor]=useState<{display_order:number;id:string}|null>(null);
  const [offset,setOffset]=useState<number|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [subscribed,setSubscribed]=useState(false);const [revision,setRevision]=useState(0);const [newItems,setNewItems]=useState(false);
  const abortRef=useRef<AbortController>();const key=JSON.stringify([mode,id,query,filter,account]);const active=useRef(key);active.current=key;
  useEffect(()=>setQueryDraft(query),[query]);
  useEffect(()=>{try{localStorage.setItem(`rdv:subscription-sort:${account}`,sort);}catch{/* Sorting remains usable without local storage. */}},[account,sort]);
  useEffect(()=>{setSubs([]);if(!account)return;const abort=new AbortController();void subscriptionService.list(abort.signal).then(s=>{
    if(!abort.signal.aborted){setSubs(s);setSubscribed(s.some(x=>x.collection_id===id));}
  }).catch(e=>{if(!abort.signal.aborted)setError(e.message);});return ()=>abort.abort();},[account,id,revision]);
  const patch=(values:Record<string,string>)=>{const next=new URLSearchParams(params);Object.entries(values).forEach(([k,v])=>v?next.set(k,v):next.delete(k));next.delete('focus');setParams(next);};
  const load=async(more=false)=>{
    abortRef.current?.abort();const abort=new AbortController();abortRef.current=abort;setError('');
    if(mode!=='explore'&&!id){setRows([]);setBusy(false);return;}
    if(mode==='extended'&&!subs.some(s=>s.collection_id===id&&s.can_read)){setRows([]);return;}
    setBusy(true);
    try{
      const p=new URLSearchParams({q:query});if(filter)p.set('state',filter);
      if(mode==='explore'){
        p.set('offset',String(more?offset||0:0));
        const result=await sharingApi<{items:(Row&{entry_id:string})[];next_offset:number|null}>(`/public/items?${p}`,'GET',undefined,abort.signal);
        if(abort.signal.aborted||active.current!==key)return;
        setRows(old=>more?[...old,...result.items.map(x=>({...x,id:x.entry_id}))]:result.items.map(x=>({...x,id:x.entry_id})));setOffset(result.next_offset);
      }else{
        p.set('sort','recent');if(more&&cursor){p.set('after_order',String(cursor.display_order));p.set('after_id',cursor.id);}
        const result=await sharingApi<{collection:Collection;items:Row[];next_cursor:typeof cursor}>(`/collections/${id}?${p}`,'GET',undefined,abort.signal);
        if(abort.signal.aborted||active.current!==key)return;setCo(result.collection);
        const cached=!more&&navigation==='POP'&&revision===0?readerCache.get(key):undefined;
        if(cached){setRows(cached.rows);setCursor(cached.cursor);setNewItems(!!result.items[0]&&cached.rows[0]?.id!==result.items[0].id);}
        else {setRows(old=>more?[...old,...result.items.filter(i=>!old.some(x=>x.id===i.id))]:result.items);setCursor(result.next_cursor);}
      }
    }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'載入失敗');}finally{if(!abort.signal.aborted)setBusy(false);}
  };
  const ready=mode!=='extended'||subs.some(s=>s.collection_id===id&&s.can_read);
  useEffect(()=>{setRows([]);setCo(undefined);setCursor(null);setOffset(null);setNewItems(false);void load();return ()=>abortRef.current?.abort();},[key,ready,revision]);
  useEffect(()=>{if(!rows.length)return;readerCache.set(key,{rows,cursor,offset});if(readerCache.size>20)readerCache.delete(readerCache.keys().next().value!);},[key,rows,cursor,offset]);
  useEffect(()=>{
    if(!id||mode==='explore')return;
    const listener=()=>{void sharingApi<{items:Row[]}>(`/collections/${id}?sort=recent`).then(r=>{
      if(r.items[0]&&rows[0]&&r.items[0].id!==rows[0].id)setNewItems(true);
    }).catch(e=>{if([401,403,404].includes(e.status)){readerCache.delete(key);setRows([]);setCo(undefined);setError(e.message);}});};window.addEventListener('focus',listener);return ()=>window.removeEventListener('focus',listener);
  },[id,mode,rows]);
  const sorted=subs.filter(s=>(s.title||s.last_known_title).toLocaleLowerCase().includes(listQuery.toLocaleLowerCase())).sort((a,b)=>sort==='alphabet'?
    (a.title||a.last_known_title).localeCompare(b.title||b.last_known_title,'zh-Hant'):sort==='viewed'?
    (b.last_viewed_at||'').localeCompare(a.last_viewed_at||''):b.subscribed_at.localeCompare(a.subscribed_at));
  return <div className="mx-auto max-w-5xl space-y-4">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">{mode==='extended'?'延伸題目':mode==='explore'?'公開探索':co?.title||'題目集觀看'}</h1><BackButton/></div>
    <section className={`rounded-3xl border p-3 sm:p-5 ${mode==='explore'?'border-[#E7D6C6] bg-[#F6EADF] dark:bg-[#3B3028]':'border-[#DCE8E0] bg-[#EAF1EC] dark:bg-[#26362F]'}`}>
      <p className={`text-sm text-text-muted ${mode==='extended'&&id?'hidden md:block':''}`}>{mode==='extended'?'選擇已明確訂閱的題目集；存入後才會建立自己的私人訂正。':mode==='explore'?'瀏覽公開題目，或進入集合後訂閱。':'觀看來源集合；私人訂正請先存入自己的題庫。'}</p>
      {mode==='extended'&&<div className="mt-3 space-y-2">
        <div className={`gap-2 ${id&&!controlsOpen?'hidden md:flex':'flex'}`}><input value={listQuery} onChange={e=>setListQuery(e.target.value)} aria-label="尋找已訂閱的集合" placeholder="尋找已訂閱集合" className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface p-3 text-sm"/>
          <select value={sort} onChange={e=>patch({sort:e.target.value})} aria-label="訂閱集排序" className="rounded-xl border border-border-subtle bg-surface p-2 text-sm"><option value="subscribed">訂閱時間</option><option value="viewed">觀看紀錄</option><option value="alphabet">名稱排序</option></select></div>
        <select aria-label="選擇已訂閱的題目集" value={id} onChange={e=>patch({collection_id:e.target.value,state:'',q:''})} className="w-full rounded-xl border border-border-subtle bg-surface p-3 text-sm">
          <option value="">請選擇題目集</option><optgroup label="可觀看">{sorted.filter(s=>s.can_read).map(s=><option key={s.collection_id} value={s.collection_id}>{s.title||s.last_known_title}{s.unread_count?` · ${s.unread_count} 題未看新題`:''}</option>)}</optgroup>
          <optgroup label="目前無法觀看">{sorted.filter(s=>!s.can_read).map(s=><option disabled key={s.collection_id} value={s.collection_id}>{s.last_known_title} · 無法存取</option>)}</optgroup></select>
        <div className="flex items-center justify-between gap-2"><Link to="/settings#subscriptions" className="inline-block text-xs text-primary underline">管理訂閱關係</Link>
          {id&&<button aria-expanded={controlsOpen} onClick={()=>setControlsOpen(v=>!v)} className="md:hidden min-h-11 rounded-xl bg-surface px-3 py-2 text-xs">{controlsOpen?'收合閱讀選項':'搜尋、篩選與排序'}</button>}</div>
      </div>}
      {(mode!=='extended'||id)&&<form onSubmit={e=>{e.preventDefault();patch({q:queryDraft.trim()});}} className={`mt-3 gap-2 ${mode==='extended'&&id&&!controlsOpen&&!query&&!filter?'hidden md:flex':'flex'}`}>
        <input aria-label="搜尋目前觀看範圍" value={queryDraft} onChange={e=>setQueryDraft(e.target.value)} placeholder="搜尋此範圍的題目" className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface p-3 text-sm"/>
        <button className="rounded-xl bg-surface px-4 py-2 text-sm">搜尋</button>
        {mode==='extended'&&<select aria-label="閱讀篩選" value={filter} onChange={e=>patch({state:e.target.value})} className="rounded-xl bg-surface p-2 text-sm"><option value="">全部題目</option><option value="unread">未看新題</option><option value="starred">星號</option></select>}
      </form>}
      {co&&mode==='collection'&&!co.is_owner&&<button disabled={busy} onClick={()=>{
        if(!account){setAuthModalOpen(true);return;}setBusy(true);
        void sharingApi(`/subscriptions/${id}`,subscribed?'DELETE':'PUT').then(()=>setRevision(v=>v+1)).catch(e=>setError(e.message)).finally(()=>setBusy(false));
      }} className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm text-white">{subscribed?'取消訂閱':'訂閱此集合'}</button>}
    </section>
    {mode==='extended'&&!account&&<button onClick={()=>setAuthModalOpen(true)} className="rounded-xl bg-primary px-4 py-3 text-white">登入以查看訂閱</button>}
    {mode==='extended'&&id&&!ready&&<p className="rounded-2xl bg-surface p-5 text-sm">此集合未訂閱或目前無法觀看。請至訂閱中心確認。</p>}
    {newItems&&<button onClick={()=>setRevision(v=>v+1)} className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">有新題目 · 重新載入</button>}
    {error&&<p role="alert" className="rounded-2xl bg-surface p-4 text-sm text-status-eraser">{error}<button className="ml-3 underline" onClick={()=>void load(rows.length>0)}>重試</button></p>}
    {!busy&&!error&&!rows.length&&(mode==='explore'||id&&ready)&&<p className="p-5 text-sm text-text-muted">目前沒有符合條件的題目。</p>}
    {busy&&!rows.length&&<p className="p-5 text-sm text-text-muted">正在載入題目…</p>}
    <QuestionStream items={rows} busy={busy} hasMore={!error&&(mode==='explore'?offset!==null:cursor!==null)} loadMore={()=>void load(true)} focus={params.get('focus')||undefined}
      render={row=><ExternalQuestionCard id={row.id} collectionId={row.collection_id||id} subscribed={mode==='extended'} starred={!!row.is_starred} savedId={row.saved_id} knownSubscribed={!!row.is_subscribed||subscribed}
        onRead={()=>{if(row.is_read)return;setRows(p=>p.map(i=>i.id===row.id?{...i,is_read:1}:i));if(row.is_new_scope)setSubs(p=>p.map(s=>s.collection_id===(row.collection_id||id)?{...s,unread_count:Math.max(0,(s.unread_count||0)-1)}:s));}}
        onSaved={savedId=>setRows(p=>p.map(i=>i.id===row.id?{...i,saved_id:savedId}:i))}
        onStar={starred=>setRows(p=>p.map(i=>i.id===row.id?{...i,is_starred:starred?1:0}:i))}/>}/>
    {mode==='explore'&&<Link to="/extended" className="inline-block text-sm text-primary underline">前往已訂閱的延伸題目</Link>}
  </div>;
}
