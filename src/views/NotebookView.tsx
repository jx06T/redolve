import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { sharingApi, type Collection } from '../services/sharingApi';
import type { TaxonomyNode } from '../types';

type Origin = 'all' | 'owned' | 'saved';
type NotebookRow = { origin:'owned'|'saved'; id:string; title:string|null;
  topic_id:string|null; status:string; added_at:string; collection_title:string|null };
type Cursor = {sort_time:number;id:string};
type NotebookPage = {items:NotebookRow[];next_cursor:Cursor|null};

const flattenTopics=(nodes:TaxonomyNode[],depth=0):{id:string;label:string}[]=>
  nodes.flatMap(node=>[{id:node.id,label:`${'　'.repeat(depth)}${node.label}`},
    ...flattenTopics(node.children||[],depth+1)]);

export function NotebookView(){
  const {currentUser,setAuthModalOpen,taxonomies,selectedSubjectId}=useStore();
  const [origin,setOrigin]=useState<Origin>('all');
  const [topic,setTopic]=useState('');
  const [status,setStatus]=useState('');
  const [collection,setCollection]=useState('');
  const [collections,setCollections]=useState<Collection[]>([]);
  const [items,setItems]=useState<NotebookRow[]>([]);
  const [nextCursor,setNextCursor]=useState<Cursor|null>(null);
  const [loading,setLoading]=useState(false);
  const [loadingMore,setLoadingMore]=useState(false);
  const [error,setError]=useState('');
  const query=(cursor?:Cursor)=>{
    const params=new URLSearchParams({origin,limit:'30'});
    if(topic)params.set('topic_id',topic);
    if(status)params.set('status',status);
    if(collection)params.set('collection_id',collection);
    if(cursor){params.set('before_time',String(cursor.sort_time));params.set('before_id',cursor.id);}
    return params;
  };
  useEffect(()=>{
    if(!currentUser){setCollections([]);return;}
    let cancelled=false;
    void sharingApi<{collections:Collection[]}>('/my/collections')
      .then(result=>{if(!cancelled)setCollections(result.collections);})
      .catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'題目集載入失敗');});
    return ()=>{cancelled=true;};
  },[currentUser]);
  useEffect(()=>{
    if(!currentUser){setItems([]);setNextCursor(null);return;}
    let cancelled=false;
    setLoading(true);setError('');
    void sharingApi<NotebookPage>(`/my/notebook?${query()}`)
      .then(result=>{if(!cancelled){setItems(result.items);setNextCursor(result.next_cursor);}})
      .catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'題庫載入失敗');})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[currentUser,origin,topic,status,collection]);
  const loadMore=async()=>{
    if(!nextCursor||loadingMore)return;
    setLoadingMore(true);setError('');
    try{
      const result=await sharingApi<NotebookPage>(`/my/notebook?${query(nextCursor)}`);
      setItems(previous=>[...previous,...result.items]);
      setNextCursor(result.next_cursor);
    }catch(e){setError(e instanceof Error?e.message:'載入更多題目失敗');}
    finally{setLoadingMore(false);}
  };
  return <div className="max-w-5xl mx-auto space-y-5 pb-16">
    <header className="rounded-3xl border border-border-subtle bg-surface p-5 sm:p-6">
      <p className="text-xs font-medium text-primary">我的個人題庫</p>
      <h1 className="mt-1 text-2xl font-semibold">我上傳與存入的題目</h1>
      <p className="mt-2 text-sm text-text-muted">存入的題目有獨立的個人訂正；訂閱但尚未存入的題目不會出現在這裡。</p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link to={`/study/${selectedSubjectId||'math'}`} className="rounded-xl bg-primary/10 px-4 py-2 text-primary">進入刷題</Link>
        <Link to="/subscriptions" className="rounded-xl bg-[#EAF1EC] px-4 py-2 text-[#376654]">訂閱中心</Link>
        <Link to="/search?scope=mine" className="rounded-xl bg-primary/10 px-4 py-2 text-primary">搜尋我的題庫</Link>
      </div>
    </header>
    {!currentUser?<button type="button" onClick={()=>setAuthModalOpen(true)}
      className="rounded-xl bg-primary px-4 py-2 text-white">登入後查看個人題庫</button>:
      <section className="rounded-3xl border border-border-subtle bg-surface p-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="題目來源">
          {(['all','owned','saved'] as const).map(value=><button key={value} type="button"
            onClick={()=>{setOrigin(value);if(value==='saved')setCollection('');}}
            aria-pressed={origin===value}
            className={`rounded-xl px-4 py-2 text-sm ${origin===value?'bg-primary text-white':'border border-border-subtle'}`}>
            {value==='all'?'全部':value==='owned'?'我上傳':'我存入'}</button>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="notebook-topic">科目與單元</label>
          <select id="notebook-topic" value={topic} onChange={e=>setTopic(e.target.value)}
            className="rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm">
            <option value="">所有科目與單元</option>{flattenTopics(taxonomies).map(node=><option
              key={node.id} value={node.id}>{node.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="notebook-status">訂正狀態</label>
          <select id="notebook-status" value={status} onChange={e=>setStatus(e.target.value)}
            className="rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm">
            <option value="">所有狀態</option><option value="processing">辨識中</option>
            <option value="unsolved">待訂正</option><option value="resolved">已訂正</option>
            <option value="archived">已封存</option>
          </select>
          {origin!=='saved'&&<>
            <label className="sr-only" htmlFor="notebook-collection">我貢獻的題目集</label>
            <select id="notebook-collection" value={collection} onChange={e=>{
              setCollection(e.target.value);if(e.target.value)setOrigin('owned');}}
              className="rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm">
              <option value="">所有我上傳的題目集</option>{collections.map(co=><option
                key={co.id} value={co.id}>{co.title}</option>)}
            </select></>}
        </div>
        {collection&&<p className="mt-2 text-xs text-text-muted">題目集篩選只顯示我提供的原題。</p>}
        {error&&<p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
        {loading?<p className="mt-5 text-sm text-text-muted">載入題目中…</p>:
          items.length?<div className="mt-4 grid gap-3 sm:grid-cols-2">{items.map(item=><Link
            key={`${item.origin}:${item.id}`}
            to={item.origin==='owned'?`/problem/${item.id}`:`/saved/${item.id}`}
            className="rounded-2xl border border-border-subtle p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800">
            <span className={`text-xs ${item.origin==='saved'?'text-[#47705C]':'text-primary'}`}>
              {item.origin==='saved'?`存自〔${item.collection_title||'題目集'}〕`:'我上傳的原題'}</span>
            <h2 className="mt-1 font-medium">{item.title||'未命名題目'}</h2>
            <p className="mt-1 text-xs text-text-muted">{item.status==='resolved'?'已訂正':
              item.status==='archived'?'已封存':item.status==='processing'?'辨識中':'待訂正'}</p>
          </Link>)}</div>:<p className="mt-5 text-sm text-text-muted">目前沒有符合條件的題目。</p>}
        {nextCursor&&!loading&&<button type="button" disabled={loadingMore} onClick={()=>void loadMore()}
          className="mt-4 rounded-xl border border-border-subtle px-4 py-2 text-sm disabled:opacity-50">
          {loadingMore?'載入中…':'載入更多題目'}</button>}
      </section>}
  </div>;
}
