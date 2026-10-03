import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { sharingApi } from '../services/sharingApi';
import type { TaxonomyNode } from '../types';

const flattenTopics=(nodes:TaxonomyNode[],depth=0):{id:string;label:string}[]=>
  nodes.flatMap(node=>[{id:node.id,label:`${'　'.repeat(depth)}${node.label}`},
    ...flattenTopics(node.children||[],depth+1)]);

type Sub={collection_id:string;title?:string;last_known_title:string;public_name?:string;
  can_read:boolean;subscribed_at:string};
type Feed={entry_id:string;collection_id:string;collection_title:string;title:string|null;
  provider_name:string|null;topic_id:string|null;is_read:number;saved_id:string|null;event_seq:number};
type FeedResponse={items:Feed[];read_all_token:string;upper_event_seq:number;next_cursor:number|null};
export function SubscriptionsView(){
  const {hash,pathname}=useLocation();
  const navigate=useNavigate();
  const {currentUser,setAuthModalOpen,taxonomies}=useStore();
  const tab=hash==='#new'||hash==='#collections'||hash==='#unavailable'
    ?hash.slice(1) as 'new'|'collections'|'unavailable'
    :pathname.endsWith('/manage')?'collections':'new';
  const [subs,setSubs]=useState<Sub[]>([]);
  const [feed,setFeed]=useState<Feed[]>([]);
  const [collection,setCollection]=useState('');
  const [topic,setTopic]=useState('');
  const [saved,setSaved]=useState('');
  const [state,setState]=useState('unread');
  const [error,setError]=useState('');
  const [readAllToken,setReadAllToken]=useState('');
  const [upper,setUpper]=useState(0);
  const [nextCursor,setNextCursor]=useState<number|null>(null);
  const [loadingMore,setLoadingMore]=useState(false);
  const [subscriptionSearch,setSubscriptionSearch]=useState('');
  useEffect(()=>{
    if(hash!==`#${tab}`)navigate(`${pathname}#${tab}`,{replace:true});
  },[hash,pathname,tab,navigate]);
  const feedQuery=(cursor?:number,ceiling?:number)=>{
    const query=new URLSearchParams();
    if(collection)query.set('collection_id',collection);
    if(topic)query.set('topic_id',topic);
    if(saved)query.set('saved',saved);
    query.set('state',state);
    if(cursor)query.set('before',String(cursor));
    if(ceiling)query.set('upper',String(ceiling));
    return query;
  };
  const load=async()=>{
    if(!currentUser)return;
    const result=await sharingApi<{subscriptions:Sub[]}>('/subscriptions');
    setSubs(result.subscriptions);
    const f=await sharingApi<FeedResponse>(`/subscriptions/feed?${feedQuery()}`);
    setFeed(f.items);setReadAllToken(f.read_all_token);
    setUpper(f.upper_event_seq);setNextCursor(f.next_cursor);
  };
  useEffect(()=>{void load().catch(e=>setError(e.message));},[currentUser,collection,topic,saved,state]);
  const loadMore=async()=>{
    if(!nextCursor||loadingMore)return;
    setLoadingMore(true);
    try{
      const f=await sharingApi<FeedResponse>(`/subscriptions/feed?${feedQuery(nextCursor,upper)}`);
      setFeed(previous=>[...previous,...f.items]);setNextCursor(f.next_cursor);
    }catch(e){setError(e instanceof Error?e.message:'載入更多題目失敗');}
    finally{setLoadingMore(false);}
  };
  const allRead=async()=>{
    try{await sharingApi('/subscriptions/read-all','POST',collection?
      {collection_id:collection,read_all_token:readAllToken}:{read_all_token:readAllToken});
      await load();}catch(e){setError(e instanceof Error?e.message:'標記已看失敗');}
  };
  const unsubscribe=async(id:string)=>{
    try{await sharingApi(`/subscriptions/${id}`,'DELETE');await load();}
    catch(e){setError(e instanceof Error?e.message:'取消訂閱失敗');}
  };
  return <div className="max-w-5xl mx-auto pb-16">
    <header className="rounded-3xl border border-[#DCE8E0] dark:border-[#3D5449] bg-[#EAF1EC] dark:bg-[#26362F] p-6">
      <p className="text-xs font-semibold text-[#47705C] dark:text-[#A9C7B6]">訂閱題目集</p>
      <h1 className="mt-1 text-2xl font-semibold">訂閱中心</h1>
      <p className="mt-2 text-sm text-text-muted">閱讀別人的集合與新加入的題目；存入後才會成為你的個人錯題。</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/my/collections" className="inline-block rounded-xl bg-surface/70 px-4 py-2 text-sm">探索題目集</Link>
        <Link to="/subscriptions/manage#collections" className="inline-block rounded-xl bg-surface/70 px-4 py-2 text-sm">管理我的訂閱</Link>
      </div>
    </header>
    {!currentUser?<button onClick={()=>setAuthModalOpen(true)}
      className="mt-5 rounded-xl bg-primary px-4 py-2 text-white">登入後查看訂閱</button>:
    <>
      {error&&<p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
      <div className="mt-5 flex gap-2">
        {(['new','collections','unavailable'] as const).map(key=><button key={key}
          onClick={()=>navigate(`/subscriptions#${key}`,{replace:true})}
          className={`rounded-xl px-4 py-2 text-sm ${tab===key?'bg-[#A8C5BD] text-[#254E3C]':'bg-surface border border-border-subtle'}`}>
          {key==='new'?'新題':key==='collections'?'題目集':'已失效'}</button>)}
      </div>
      {tab==='new'?<section className="mt-4 rounded-3xl border border-border-subtle bg-surface p-5">
        <div className="flex flex-wrap gap-2">
          <select value={collection} onChange={e=>setCollection(e.target.value)}
            aria-label="依來源題目集篩選" className="rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm">
            <option value="">所有題目集</option>{subs.filter(s=>s.can_read).map(s=>
              <option key={s.collection_id} value={s.collection_id}>{s.title||s.last_known_title}</option>)}
          </select>
          <select value={topic} onChange={e=>setTopic(e.target.value)}
            aria-label="依標準課綱科目篩選" className="rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm">
            <option value="">所有科目與單元</option>{flattenTopics(taxonomies).map(t=>
              <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select value={state} onChange={e=>setState(e.target.value)}
            aria-label="依閱讀狀態篩選" className="rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm">
            <option value="unread">未看</option><option value="read">已看</option><option value="all">全部</option>
          </select>
          <select value={saved} onChange={e=>setSaved(e.target.value)}
            aria-label="依存入狀態篩選" className="rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm">
            <option value="">全部</option><option value="yes">已存入</option><option value="no">未存入</option>
          </select>
          <button onClick={()=>void allRead()} className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">
            全部標記已看</button>
        </div>
        {feed.length?<div className="mt-4 grid gap-3 sm:grid-cols-2">{feed.map(item=>
          <Link key={item.entry_id} to={`/collections/${item.collection_id}/items/${item.entry_id}`}
            className="rounded-2xl border border-border-subtle p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800">
            <p className="text-xs text-[#47705C]">{item.collection_title}・{item.is_read?'已看':'新題'}</p>
            <p className="mt-1 font-medium">{item.title||'未命名題目'}</p>
            <p className="mt-1 text-xs text-text-muted">{item.provider_name||'提供者'}・
              {item.saved_id?'已存入我的錯題本':'尚未存入'}</p></Link>)}</div>:
          <p className="mt-4 text-sm text-text-muted">目前沒有符合篩選的新題。</p>}
        {nextCursor&&<button disabled={loadingMore} onClick={()=>void loadMore()}
          className="mt-4 rounded-xl border border-border-subtle px-4 py-2 text-sm disabled:opacity-50">
          {loadingMore?'載入中…':'載入更多新題'}</button>}
      </section>:<section className="mt-4 rounded-3xl border border-border-subtle bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input value={subscriptionSearch} onChange={e=>setSubscriptionSearch(e.target.value)}
            aria-label="搜尋已訂閱題目集" placeholder="搜尋題目集或作者"
            className="min-w-48 flex-1 rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm"/>
          <span className="text-sm text-text-muted">可閱讀 {subs.filter(s=>s.can_read).length} 集・已失效 {subs.filter(s=>!s.can_read).length} 集</span>
        </div>
        {subs.filter(s=>(tab==='collections'?s.can_read:!s.can_read)&&
          `${s.title||s.last_known_title} ${s.public_name||''}`.toLocaleLowerCase().includes(subscriptionSearch.trim().toLocaleLowerCase())).length?
          subs.filter(s=>(tab==='collections'?s.can_read:!s.can_read)&&
            `${s.title||s.last_known_title} ${s.public_name||''}`.toLocaleLowerCase().includes(subscriptionSearch.trim().toLocaleLowerCase())).map(s=>
            <div key={s.collection_id} className="flex items-center justify-between gap-3 border-b border-border-subtle py-3">
              <div><p className="font-medium">{s.can_read?s.title:s.last_known_title}</p>
                <p className="text-xs text-text-muted">{s.can_read?'可閱讀':'集合目前無法存取；已存入的個人題目仍保留'}</p></div>
              <div className="flex gap-2">
                {s.can_read&&<Link to={`/collections/${s.collection_id}`}
                  className="rounded-xl bg-[#EAF1EC] px-3 py-2 text-sm text-[#376654]">開啟</Link>}
                <button onClick={()=>void unsubscribe(s.collection_id)} className="rounded-xl border border-border-subtle px-3 py-2 text-sm">
                  取消訂閱</button>
              </div>
            </div>):<p className="text-sm text-text-muted">這裡目前沒有題目集。</p>}
      </section>}
    </>}
  </div>;
}
