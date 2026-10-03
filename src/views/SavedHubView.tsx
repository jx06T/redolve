import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { sharingApi } from '../services/sharingApi';
import type { TaxonomyNode } from '../types';

const flattenTopics=(nodes:TaxonomyNode[],depth=0):{id:string;label:string}[]=>
  nodes.flatMap(node=>[{id:node.id,label:`${'　'.repeat(depth)}${node.label}`},
    ...flattenTopics(node.children||[],depth+1)]);

type SavedRow={id:string;source_title:string;collection_title:string;provider_public_name:string;
  status:string;downloaded_at:string;personal_topic_id:string|null};
export function SavedHubView(){
  const {currentUser,setAuthModalOpen,taxonomies,selectedSubjectId}=useStore();
  const [items,setItems]=useState<SavedRow[]>([]);
  const [status,setStatus]=useState('all');
  const [topic,setTopic]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!currentUser)return;
    const query=new URLSearchParams();
    if(status!=='all')query.set('status',status);
    if(topic)query.set('topic_id',topic);
    void sharingApi<{items:SavedRow[]}>(`/saved?${query}`).then(r=>setItems(r.items))
      .catch(e=>setError(e.message));
  },[currentUser,status,topic]);
  return <div className="max-w-5xl mx-auto pb-16">
    <header className="rounded-3xl border border-border-subtle bg-surface p-6">
      <p className="text-sm text-primary">我的題庫・已存入</p>
      <h1 className="mt-1 text-2xl font-semibold">我存入的題目</h1>
      <p className="mt-2 text-sm text-text-muted">這些題目有自己的來源副本和個人訂正。來源停止共用後，已存入的內容仍會保留。</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/my/notebook" className="rounded-xl bg-surface px-4 py-2 text-sm text-primary">全部個人題庫</Link>
        <Link to={`/study/${selectedSubjectId||'math'}`} className="rounded-xl bg-primary/10 px-4 py-2 text-sm text-primary">我上傳的題目</Link>
        <Link to="/subscriptions" className="rounded-xl bg-[#EAF1EC] px-4 py-2 text-sm text-[#376654]">訂閱中心</Link>
      </div>
    </header>
    {!currentUser?<button onClick={()=>setAuthModalOpen(true)}
      className="mt-5 rounded-xl bg-primary px-4 py-2 text-white">登入後查看已存題目</button>:
      <section className="mt-5 rounded-3xl border border-border-subtle bg-surface p-5">
        <div className="flex flex-wrap gap-3">
        <label className="text-sm">訂正狀態
          <select value={status} onChange={e=>setStatus(e.target.value)}
            className="ml-2 rounded-xl border border-border-subtle bg-page-bg px-3 py-2">
            <option value="all">全部</option><option value="unsolved">待訂正</option>
            <option value="resolved">已訂正</option><option value="archived">已封存</option>
          </select></label>
        <label className="text-sm">我的科目與單元
          <select value={topic} onChange={e=>setTopic(e.target.value)}
            className="ml-2 rounded-xl border border-border-subtle bg-page-bg px-3 py-2">
            <option value="">全部</option>{flattenTopics(taxonomies).map(node=><option
              key={node.id} value={node.id}>{node.label}</option>)}
          </select></label></div>
        {error&&<p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
        {items.length?<div className="mt-4 grid gap-3 sm:grid-cols-2">{items.map(item=>
          <Link to={`/saved/${item.id}`} key={item.id}
            className="rounded-2xl border border-border-subtle p-4 hover:bg-neutral-50 dark:hover:bg-neutral-800">
            <span className="text-xs text-primary">存自〔{item.collection_title}〕</span>
            <h2 className="mt-1 font-medium">{item.source_title}</h2>
            <p className="mt-1 text-xs text-text-muted">{item.provider_public_name}・
              {item.status==='resolved'?'已訂正':item.status==='archived'?'已封存':'待訂正'}</p>
          </Link>)}</div>:<p className="mt-4 text-sm text-text-muted">目前沒有符合條件的已存題目。</p>}
      </section>}
  </div>;
}
