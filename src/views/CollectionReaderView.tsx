import { useEffect, useRef, useState } from 'react';
import { Link, useNavigationType, useParams, useSearchParams } from 'react-router-dom';
import { ExternalQuestionCard } from '../components/ExternalQuestionCard';
import { QuestionStream } from '../components/QuestionStream';
import { BackButton } from '../components/ReaderNavigation';
import { useStore } from '../store/useStore';
import { sharingApi, type Collection, type CollectionEntry } from '../services/sharingApi';
import { subscriptionService } from '../services/questionService';
import type { Subscription } from '../types/question';
import { isGuestUser } from '../utils/guest';
import { CollectionSubscriptionButton } from '../components/CollectionSubscriptionButton';

type Row=CollectionEntry&{collection_id?:string;is_owner?:boolean};
const storedSort=(account:string)=>{try{return localStorage.getItem(`rdv:subscription-sort:${account}`)||'subscribed';}catch{return 'subscribed';}};
const readerCache=new Map<string,{rows:Row[];cursor:{display_order:number;id:string}|null;offset:number|null}>();
export function CollectionReaderView({mode}:{mode:'extended'|'explore'|'collection'}) {
  const route=useParams();const [params,setParams]=useSearchParams();
  const navigation=useNavigationType();
  const id=mode==='collection'?route.id||'':params.get('collection_id')||'';
  const query=params.get('q')||'';const filter=params.get('state')||'';const sort=params.get('sort')||storedSort(useStore.getState().currentUser?.id||'guest');
  const {currentUser,setAuthModalOpen}=useStore();const account=isGuestUser(currentUser)?'':currentUser!.id;
  const [controlsOpen,setControlsOpen]=useState(false);
  const [subs,setSubs]=useState<Subscription[]>([]);const [listQuery,setListQuery]=useState('');
  const [collection,setCo]=useState<Collection>();const [queryDraft,setQueryDraft]=useState(query);
  const [dataKey,setDataKey]=useState('');
  const [rows,setRows]=useState<Row[]>([]);const [cursor,setCursor]=useState<{display_order:number;id:string}|null>(null);
  const [offset,setOffset]=useState<number|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);const [newItems,setNewItems]=useState(false);
  const [subscriptionRevision,setSubscriptionRevision]=useState(0);const [subscriptionAccount,setSubscriptionAccount]=useState<string|null>(null);
  const [subsBusy,setSubsBusy]=useState(true);const [subsError,setSubsError]=useState('');
  const [publicSets,setPublicSets]=useState<Collection[]>([]);const [publicSetsError,setPublicSetsError]=useState('');
  const abortRef=useRef<AbortController>();const key=JSON.stringify([mode,id,query,filter,account]);const active=useRef(key);active.current=key;
  const co=dataKey===key?collection:undefined;
  useEffect(()=>setQueryDraft(query),[query]);
  useEffect(()=>{try{localStorage.setItem(`rdv:subscription-sort:${account}`,sort);}catch{/* Sorting remains usable without local storage. */}},[account,sort]);
  useEffect(()=>{setSubs([]);setSubscriptionAccount(null);setSubsError('');setSubsBusy(!!account);if(!account){setSubscriptionAccount('');return;}
    const abort=new AbortController();void subscriptionService.list(abort.signal).then(s=>{
      if(!abort.signal.aborted){setSubs(s);setSubscriptionAccount(account);}
    }).catch(e=>{if(!abort.signal.aborted)setSubsError(e.message);}).finally(()=>{if(!abort.signal.aborted)setSubsBusy(false);});return ()=>abort.abort();
  },[account,subscriptionRevision]);
  useEffect(()=>{setPublicSets([]);setPublicSetsError('');if(mode!=='explore')return;const abort=new AbortController();
    void sharingApi<{collections:Collection[]}>('/public/collections','GET',undefined,abort.signal).then(r=>{if(!abort.signal.aborted)setPublicSets(r.collections);})
      .catch(e=>{if(!abort.signal.aborted)setPublicSetsError(e.message);});return ()=>abort.abort();
  },[mode,account,revision]);
  const subscribed=subscriptionAccount===account&&subs.some(s=>s.collection_id===id);
  const subscriptionStatusReady=!account||subscriptionAccount===account;
  const ready=mode!=='extended'||subscriptionAccount===account&&subs.some(s=>s.collection_id===id&&s.can_read);
  const publicFeed=mode==='explore'&&!id;
  const subscriptionChanged=()=>{setSubscriptionRevision(v=>v+1);setRevision(v=>v+1);};
  const patch=(values:Record<string,string>)=>{const next=new URLSearchParams(params);Object.entries(values).forEach(([k,v])=>v?next.set(k,v):next.delete(k));next.delete('focus');setParams(next);};
  const load=async(more=false)=>{
    abortRef.current?.abort();const abort=new AbortController();abortRef.current=abort;setError('');
    if(mode!=='explore'&&!id){setRows([]);setBusy(false);return;}
    if(mode==='extended'&&!ready){setRows([]);setBusy(false);return;}
    setBusy(true);
    try{
      const p=new URLSearchParams({q:query});if(filter)p.set('state',filter);
      if(publicFeed){
        p.set('offset',String(more?offset||0:0));
        const result=await sharingApi<{items:(Row&{entry_id:string})[];next_offset:number|null}>(`/public/items?${p}`,'GET',undefined,abort.signal);
        if(abort.signal.aborted||active.current!==key)return;
        setDataKey(key);
        setRows(old=>more?[...old,...result.items.map(x=>({...x,id:x.entry_id}))]:result.items.map(x=>({...x,id:x.entry_id})));setOffset(result.next_offset);
      }else{
        p.set('sort','recent');if(more&&cursor){p.set('after_order',String(cursor.display_order));p.set('after_id',cursor.id);}
        const result=await sharingApi<{collection:Collection;items:Row[];next_cursor:typeof cursor}>(`/collections/${id}?${p}`,'GET',undefined,abort.signal);
        if(abort.signal.aborted||active.current!==key)return;
        if(mode==='explore'&&result.collection.visibility!=='public')throw new Error('此集合不屬於公開探索。請由獲准的共用連結觀看。');
        setDataKey(key);
        setCo(result.collection);
        const cached=!more&&navigation==='POP'&&revision===0?readerCache.get(key):undefined;
        if(cached){setRows(cached.rows);setCursor(cached.cursor);setNewItems(!!result.items[0]&&cached.rows[0]?.id!==result.items[0].id);}
        else {setRows(old=>more?[...old,...result.items.filter(i=>!old.some(x=>x.id===i.id))]:result.items);setCursor(result.next_cursor);}
      }
    }catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'載入失敗');}finally{if(!abort.signal.aborted)setBusy(false);}
  };
  useEffect(()=>{setDataKey('');setRows([]);setCo(undefined);setCursor(null);setOffset(null);setNewItems(false);void load();return ()=>abortRef.current?.abort();},[key,ready,revision]);
  useEffect(()=>{if(!rows.length||dataKey!==key)return;readerCache.set(key,{rows,cursor,offset});if(readerCache.size>20)readerCache.delete(readerCache.keys().next().value!);},[key,dataKey,rows,cursor,offset]);
  useEffect(()=>{
    if(!id||!ready)return;
    const abort=new AbortController();
    const listener=()=>{void sharingApi<{items:Row[]}>(`/collections/${id}?sort=recent`,'GET',undefined,abort.signal).then(r=>{
      if(!abort.signal.aborted&&r.items[0]&&rows[0]&&r.items[0].id!==rows[0].id)setNewItems(true);
    }).catch(e=>{if(!abort.signal.aborted&&[401,403,404].includes(e.status)){readerCache.delete(key);setRows([]);setCo(undefined);setError(e.message);}});};window.addEventListener('focus',listener);return ()=>{abort.abort();window.removeEventListener('focus',listener);};
  },[id,mode,rows,ready]);
  const sorted=subs.filter(s=>s.collection_id===id||(s.title||s.last_known_title).toLocaleLowerCase().includes(listQuery.toLocaleLowerCase())).sort((a,b)=>sort==='alphabet'?
    (a.title||a.last_known_title).localeCompare(b.title||b.last_known_title,'zh-Hant'):sort==='viewed'?
    (b.last_viewed_at||'').localeCompare(a.last_viewed_at||''):b.subscribed_at.localeCompare(a.subscribed_at));
  return <div className="mx-auto max-w-5xl space-y-4">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">{mode==='extended'?'延伸題目':mode==='explore'?'公開探索':co?.title||'題目集觀看'}</h1><BackButton/></div>
    <section className={`rounded-3xl border p-3 sm:p-5 ${mode==='explore'||mode==='collection'&&co?.visibility==='public'?'border-[#E7D6C6] bg-[#F6EADF] dark:bg-[#3B3028]':'border-[#DCE8E0] bg-[#EAF1EC] dark:bg-[#26362F]'}`}>
      <p className={`text-sm text-text-muted ${mode==='extended'&&id?'hidden md:block':''}`}>{mode==='extended'?'選擇已明確訂閱的題目集；存入後才會建立自己的私人訂正。':mode==='explore'?'探索與訂閱分開。按「訂閱題目集」後，才會加入延伸題目的選單。':'觀看來源集合；私人訂正請先存入自己的題庫。'}</p>
      {mode==='explore'&&<label className="mt-3 block text-sm">公開題目集<select aria-label="選擇公開題目集" value={id} onChange={e=>patch({collection_id:e.target.value,q:'',state:''})} className="mt-2 w-full rounded-xl border border-border-subtle bg-surface p-3 text-sm">
        <option value="">全部公開題目</option>{id&&!publicSets.some(c=>c.id===id)&&<option value={id}>{co?.title||'目前題目集'}</option>}{publicSets.map(c=><option key={c.id} value={c.id}>{c.title} · {c.item_count||0} 題</option>)}
      </select></label>}
      {co&&mode!=='extended'&&<div className="mt-3 flex flex-wrap items-center gap-3"><h2 className="font-medium">{co.title}</h2>{!co.is_owner&&<span className="text-xs">{!subscriptionStatusReady?'確認訂閱狀態中…':subscribed?'已訂閱':'尚未訂閱'}</span>}<CollectionSubscriptionButton collectionId={id} subscribed={subscribed} isOwner={co.is_owner} statusReady={subscriptionStatusReady} onChanged={subscriptionChanged}/></div>}
      {mode==='extended'&&<div className="mt-3 space-y-2">
        <div className={`gap-2 ${id&&!controlsOpen?'hidden md:flex':'flex'}`}><input value={listQuery} onChange={e=>setListQuery(e.target.value)} aria-label="尋找已訂閱的集合" placeholder="尋找已訂閱集合" className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface p-3 text-sm"/>
          <select value={sort} onChange={e=>patch({sort:e.target.value})} aria-label="訂閱集排序" className="rounded-xl border border-border-subtle bg-surface p-2 text-sm"><option value="subscribed">訂閱時間</option><option value="viewed">觀看紀錄</option><option value="alphabet">名稱排序</option></select></div>
        <select disabled={subsBusy||!!subsError} aria-label="選擇已訂閱的題目集" value={id} onChange={e=>{setListQuery('');patch({collection_id:e.target.value,state:'',q:''});}} className="w-full rounded-xl border border-border-subtle bg-surface p-3 text-sm">
          <option value="">請選擇題目集</option><optgroup label="可觀看">{sorted.filter(s=>s.can_read).map(s=><option key={s.collection_id} value={s.collection_id}>{s.title||s.last_known_title}{s.unread_count?` · ${s.unread_count} 題未看新題`:''}</option>)}</optgroup>
          {id&&!subs.some(s=>s.collection_id===id)&&<option value={id} disabled>{subsBusy?'讀取訂閱中…':'此集合未訂閱'}</option>}
          <optgroup label="目前無法觀看">{sorted.filter(s=>!s.can_read).map(s=><option disabled key={s.collection_id} value={s.collection_id}>{s.last_known_title} · 無法存取</option>)}</optgroup></select>
        <div className="flex items-center justify-between gap-2"><Link to="/settings#subscriptions" className="inline-block text-xs text-primary underline">管理訂閱關係</Link>
          {id&&<button aria-expanded={controlsOpen} onClick={()=>setControlsOpen(v=>!v)} className="md:hidden min-h-11 rounded-xl bg-surface px-3 py-2 text-xs">{controlsOpen?'收合閱讀選項':'搜尋、篩選與排序'}</button>}</div>
      </div>}
      {(mode!=='extended'||id)&&<form onSubmit={e=>{e.preventDefault();patch({q:queryDraft.trim()});}} className={`mt-3 gap-2 ${mode==='extended'&&id&&!controlsOpen&&!query&&!filter?'hidden md:flex':'flex'}`}>
        <input aria-label="搜尋目前觀看範圍" value={queryDraft} onChange={e=>setQueryDraft(e.target.value)} placeholder="搜尋此範圍的題目" className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface p-3 text-sm"/>
        <button className="rounded-xl bg-surface px-4 py-2 text-sm">搜尋</button>
        {mode==='extended'&&<select aria-label="閱讀篩選" value={filter} onChange={e=>patch({state:e.target.value})} className="rounded-xl bg-surface p-2 text-sm"><option value="">全部題目</option><option value="unread">未看新題</option><option value="starred">星號</option></select>}
      </form>}
    </section>
    {mode==='extended'&&!account&&<button onClick={()=>setAuthModalOpen(true)} className="rounded-xl bg-primary px-4 py-3 text-white">登入以查看訂閱</button>}
    {subsError&&<p role="alert" className="rounded-2xl bg-surface p-4 text-sm text-status-eraser">訂閱狀態讀取失敗：{subsError}<button onClick={()=>setSubscriptionRevision(v=>v+1)} className="ml-3 underline">重試訂閱清單</button></p>}
    {publicSetsError&&<p role="alert" className="text-sm text-status-eraser">公開集合清單讀取失敗：{publicSetsError}<button onClick={()=>setRevision(v=>v+1)} className="ml-3 underline">重試</button></p>}
    {mode==='extended'&&!subsBusy&&!subsError&&(!id||!ready)&&<p className="rounded-2xl bg-surface p-5 text-sm">{id?'此集合未訂閱或目前無法觀看。':'請先選擇題目集。'}<Link to="/explore" className="ml-3 text-primary underline">探索並訂閱題目集</Link></p>}
    {newItems&&<button onClick={()=>setRevision(v=>v+1)} className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">有新題目 · 重新載入</button>}
    {error&&<p role="alert" className="rounded-2xl bg-surface p-4 text-sm text-status-eraser">{error}<button className="ml-3 underline" onClick={()=>void load(rows.length>0)}>重試</button></p>}
    {!busy&&!error&&!rows.length&&(mode==='explore'||id&&ready)&&<p className="p-5 text-sm text-text-muted">目前沒有符合條件的題目。</p>}
    {busy&&!rows.length&&<p className="p-5 text-sm text-text-muted">正在載入題目…</p>}
    <QuestionStream items={dataKey===key?rows:[]} busy={busy} hasMore={dataKey===key&&(publicFeed?offset!==null:cursor!==null)} loadError={!!error} autoLoad={false} loadMore={()=>void load(true)} focus={params.get('focus')||undefined}
      render={row=><ExternalQuestionCard id={row.id} collectionId={row.collection_id||id} subscribed={mode==='extended'} starred={!!row.is_starred} savedId={row.saved_id} knownSubscribed={subscriptionAccount===account?subs.some(s=>s.collection_id===(row.collection_id||id)):!!row.is_subscribed}
        publicContext={mode==='explore'} isOwner={!!row.is_owner||co?.is_owner} subscriptionStatusReady={subscriptionStatusReady} onSubscriptionChanged={publicFeed?subscriptionChanged:undefined}
        onRead={()=>{if(row.is_read)return;setRows(p=>p.map(i=>i.id===row.id?{...i,is_read:1}:i));if(row.is_new_scope)setSubs(p=>p.map(s=>s.collection_id===(row.collection_id||id)?{...s,unread_count:Math.max(0,(s.unread_count||0)-1)}:s));}}
        onSaved={savedId=>setRows(p=>p.map(i=>i.id===row.id?{...i,saved_id:savedId}:i))}
        onStar={starred=>setRows(p=>p.map(i=>i.id===row.id?{...i,is_starred:starred?1:0}:i))}/>}/>
    {mode==='explore'&&<Link to="/extended" className="inline-block text-sm text-primary underline">前往已訂閱的延伸題目</Link>}
  </div>;
}
