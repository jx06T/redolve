import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, Settings2, UserPlus } from 'lucide-react';
import { useStore } from '../store/useStore';
import { sharingApi, type Collection, type CollectionEntry } from '../services/sharingApi';
import { AppDialog } from '../components/AppDialog';
import { SwitchRow } from '../components/SwitchRow';
import { CollectionCandidatePicker } from '../components/CollectionCandidatePicker';
import { BackButton } from '../components/ReaderNavigation';
import type { TaxonomyNode } from '../types';

const standardTopics=(nodes:TaxonomyNode[],depth=0):{id:string;label:string}[]=>
  nodes.flatMap(node=>node.user_id?[]:[{id:node.id,label:`${'　'.repeat(depth)}${node.label}`},
    ...standardTopics(node.children||[],depth+1)]);
const tagsFor=(entries:CollectionEntry[])=>Array.from(new Set(entries.flatMap(entry=>{
  try{return JSON.parse(entry.keywords||'[]') as string[];}catch{return [] as string[];}
}))).filter(tag=>typeof tag==='string').slice(0,80);

export function CollectionDetailView(){
  const {id=''}=useParams();
  const navigate=useNavigate();
  const {currentUser,showToast,taxonomies}=useStore();
  const [co,setCo]=useState<Collection|null>(null);
  const [items,setItems]=useState<CollectionEntry[]>([]);
  const [nextCursor,setNextCursor]=useState<{display_order:number;id:string}|null>(null);
  const [topicFilter,setTopicFilter]=useState('');
  const [tagFilter,setTagFilter]=useState('');

  const [email,setEmail]=useState('');
  const [role,setRole]=useState<'viewer'|'contributor'>('viewer');
  const [inviteToken,setInviteToken]=useState('');
  const [linkToken,setLinkToken]=useState('');
  const [transfer,setTransfer]=useState<{to_user_id:string;expires_at:string;display_name:string|null}|null>(null);
  const [transferTarget,setTransferTarget]=useState('');
  const [grants,setGrants]=useState<{id:string;user_id:string;display_name:string|null;
    role:string;revoked_at:string|null}[]>([]);
  const memberName=(g:typeof grants[number])=>g.display_name||`尚未設定暱稱的成員 ${grants.indexOf(g)+1}`;
  const [links,setLinks]=useState<{id:string;revoked_at:string|null;created_at:string}[]>([]);
  const [stats,setStats]=useState<{item_count:number;contributor_count:number;
    subscriber_count:number;saved_count:number}|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [confirm,setConfirm]=useState<{title:string;body:string;run:()=>Promise<void>}|null>(null);
  const [title,setTitle]=useState('');
  const loadAbort=useRef<AbortController>();const titleFor=useRef('');
  const contextKey=JSON.stringify([id,currentUser?.id,topicFilter,tagFilter]);const currentContext=useRef(contextKey);currentContext.current=contextKey;
  const query=()=>{
    const params=new URLSearchParams();
    if(topicFilter)params.set('topic_id',topicFilter);
    if(tagFilter.trim())params.set('tag',tagFilter.trim());

    return params;
  };
  const load=async()=>{
    loadAbort.current?.abort();const abort=new AbortController();loadAbort.current=abort;
    const activeContext=contextKey;
    const read=<T,>(path:string)=>sharingApi<T>(path,'GET',undefined,abort.signal);
    const data=await sharingApi<{collection:Collection;items:CollectionEntry[];
      next_cursor:{display_order:number;id:string}|null}>(`/collections/${id}?${query()}`,'GET',undefined,abort.signal);
    if(abort.signal.aborted||currentContext.current!==activeContext)return;
    if(!data.collection.can_contribute){navigate(`/collections/${id}`,{replace:true});return;}
    setCo(data.collection);if(titleFor.current!==id){setTitle(data.collection.title);titleFor.current=id;}setItems(data.items);setNextCursor(data.next_cursor);
    if(data.collection.can_contribute) {
      const pending=await read<{transfer:typeof transfer}>(`/collections/${id}/owner-transfer`);
      if(abort.signal.aborted||currentContext.current!==activeContext)return;setTransfer(pending.transfer);
    }
    if(data.collection.is_owner){
      const [grantResult,linkResult,statsResult]=await Promise.all([
        read<{grants:typeof grants}>(`/collections/${id}/grants`),
        read<{links:typeof links}>(`/collections/${id}/links`),
        read<{stats:NonNullable<typeof stats>}>(`/collections/${id}/stats`),
      ]);
      if(abort.signal.aborted||currentContext.current!==activeContext)return;setGrants(grantResult.grants);setLinks(linkResult.links);setStats(statsResult.stats);
    }
  };
  useEffect(()=>{setCo(null);setItems([]);setError('');setGrants([]);setLinks([]);setStats(null);setTransfer(null);
    void load().catch(e=>{if(e.name!=='AbortError')setError(e.message);});return ()=>loadAbort.current?.abort();},
    [contextKey]);
  const act=async(fn:()=>Promise<unknown>,message:string)=>{
    setBusy(true);setError('');
    try{await fn();showToast(message,'success');await load();}
    catch(e){setError(e instanceof Error?e.message:'操作失敗');}
    finally{setBusy(false);}
  };
  const loadMore=async()=>{
    if(!nextCursor||busy)return;
    setBusy(true);const activeContext=contextKey;
    try{
      const params=query();
      params.set('after_order',String(nextCursor.display_order));params.set('after_id',nextCursor.id);
      const page=await sharingApi<{items:CollectionEntry[];
        next_cursor:{display_order:number;id:string}|null}>(`/collections/${id}?${params}`);
      if(currentContext.current!==activeContext)return;setItems(previous=>[...previous,...page.items]);setNextCursor(page.next_cursor);
    }catch(e){setError(e instanceof Error?e.message:'載入更多題目失敗');}
    finally{setBusy(false);}
  };
  if(error&&!co)return <div role="alert" className="max-w-3xl mx-auto p-6">{error} <Link to="/settings#collections" className="text-primary">返回題目集</Link></div>;
  if(!co)return <p className="p-6 text-text-muted">載入題目集中…</p>;
  const canOrder=co.is_owner&&!topicFilter&&!tagFilter;
  return <div className="min-w-0 w-full max-w-5xl mx-auto space-y-5 pb-16">
    <BackButton fallback="/settings#collections"/>
    <div className="rounded-3xl border border-[#DCE8E0] dark:border-[#3D5449] bg-[#EAF1EC] dark:bg-[#26362F] px-5 py-4">
      <p className="text-xs font-semibold text-[#47705C] dark:text-[#A9C7B6]">題目集・
        {co.visibility==='public'?'公開':co.visibility==='link'?'連結可看':'指定對象'}・
        {co.lifecycle==='active'?'啟用中':co.lifecycle==='draft'?'草稿':'已暫停'}</p>
      <h1 className="mt-1 text-2xl font-semibold">{co.title}</h1>
      <p className="mt-1 text-sm text-text-muted">{co.public_name}・{nextCursor?`已載入 ${items.length} 題`:`${items.length} 題`}</p>
      {co.description&&<p className="mt-2 text-sm">{co.description}</p>}

    </div>
    {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
    {co.can_contribute&&<CollectionCandidatePicker collectionId={id} onChanged={()=>void load().catch(e=>setError(e.message))}/>}
    {transfer&&!co.is_owner&&transfer.to_user_id===currentUser?.id&&<section
      className="rounded-3xl border border-[#DCE8E0] bg-[#EAF1EC] p-5 dark:border-[#3D5449] dark:bg-[#26362F]">
      <h2 className="font-semibold">接手題目集管理</h2>
      <p className="mt-1 text-sm text-text-muted">建立者邀請你管理此集合。接受後你可以調整共用設定及成員；原建立者保留貢獻者身分。</p>
      <button disabled={busy} onClick={()=>void act(()=>sharingApi(`/collections/${id}/owner-transfer/accept`,'POST',{}),'已接手題目集')}
        className="mt-3 rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-40">接受管理權</button>
    </section>}
    <section className="rounded-3xl border border-border-subtle bg-surface p-5">
      <h2 className="font-semibold flex items-center gap-2"><BookOpen size={18}/>題目管理</h2>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select value={topicFilter} onChange={e=>setTopicFilter(e.target.value)}
          aria-label="依科目與課綱單元篩選" className="min-w-0 w-full max-w-full rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm">
          <option value="">所有科目與單元</option>{standardTopics(taxonomies).map(t=>
            <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <input value={tagFilter} onChange={e=>setTagFilter(e.target.value)} list="collection-tags"
          placeholder="來源標籤" aria-label="依來源標籤篩選"
          className="min-w-0 w-full rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm"/>
        <datalist id="collection-tags">{tagsFor(items).map(tag=><option key={tag} value={tag}/>)}</datalist>
      </div>
      {items.length?<div className="mt-3 space-y-2">{items.map((item,index)=>
        <div key={item.id} className="rounded-2xl border border-border-subtle p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs text-[#5F8670]">第 {item.display_order||index+1} 題
              </span>
            <p className="mt-1 font-medium">{item.title||'未命名題目'}</p>
            <p className="mt-1 text-xs text-text-muted">{item.provider_name||'題目提供者'}</p>
            {item.keywords&&<p className="mt-2 line-clamp-1 text-xs text-text-muted">
              {tagsFor([item]).join('・')}</p>}
          </div>
          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-text-muted">{item.question_text||'尚未辨識題目文字'}</p>
          {(co.is_owner||item.contributor_id===currentUser?.id)&&<button disabled={busy} onClick={()=>setConfirm({title:'從集合移除此題？',body:'原題與已存入版本保留，來源觀看與共用層停止展示。',run:async()=>{await sharingApi(`/collections/${id}/items/${item.id}`,'DELETE');await load();}})} className="mt-3 text-xs text-status-eraser">從集合移除</button>}
          {canOrder&&<div className="mt-3 flex gap-2 border-t border-border-subtle pt-2">
            {(['up','down'] as const).map(direction=><button key={direction} disabled={busy}
              onClick={()=>void act(()=>sharingApi(`/collections/${id}/items/${item.id}/order`,'PATCH',
                {direction,expected_version:co.row_version}),'題目順序已更新')}
              className="min-h-11 rounded-xl bg-page-bg px-4 py-3 text-sm disabled:opacity-40">
              {direction==='up'?'上移':'下移'}</button>)}
          </div>}
        </div>)}</div>:
        <p className="mt-3 text-sm text-text-muted">這個集合目前沒有題目。</p>}
      {nextCursor&&<button disabled={busy} onClick={()=>void loadMore()}
        className="mt-4 rounded-xl border border-border-subtle px-4 py-2 text-sm disabled:opacity-40">
        載入更多題目</button>}
    </section>
    {co.is_owner&&<section className="rounded-3xl border border-border-subtle bg-surface p-5 space-y-4">
      <h2 className="font-semibold flex items-center gap-2"><Settings2 size={18}/>共用管理</h2>
      {stats&&<div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {([['集合題目',stats.item_count],['貢獻者',stats.contributor_count],
          ['訂閱者',stats.subscriber_count],['存入次數',stats.saved_count]] as const).map(([label,count])=>
          <div key={label} className="rounded-xl bg-page-bg px-3 py-2">
            <span className="block text-xs text-text-muted">{label}</span><strong>{count}</strong>
          </div>)}
      </div>}
      <p className="text-sm text-text-muted">共用筆跡與筆記只有貢獻者彼此可見；開啟展示後，所有觀看者也能看到。</p>
      <label className="block text-sm">觀看範圍<select value={co.visibility} disabled={busy} onChange={e=>{
        const visibility=e.target.value;setConfirm({title:'變更集合的觀看範圍？',body:visibility==='public'?'啟用中的集合將可由所有人觀看及存入；未列入探索時仍可用集合連結開啟。':'範圍縮小後，原有合法存入的個人版本仍保留；後續觀看及存入按新範圍判定。',run:async()=>{await sharingApi(`/collections/${id}`,'PATCH',{expected_version:co.row_version,visibility});await load();}});
      }} className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3"><option value="restricted">指定對象</option><option value="link">持連結者</option><option value="public">所有人</option></select></label>
      {co.visibility==='public'&&<SwitchRow label="列入公開探索" description="未列入時，仍可透過集合連結觀看。" checked={!!co.listed} disabled={busy} onChange={listed=>void act(()=>sharingApi(`/collections/${id}`,'PATCH',{expected_version:co.row_version,listed}),'探索設定已更新')}/>}
      <label className="block text-sm">集合名稱<input value={title} maxLength={80} onChange={e=>setTitle(e.target.value)} className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3"/></label>
      <button disabled={busy||!title.trim()} onClick={()=>void act(()=>sharingApi(`/collections/${id}`,'PATCH',{expected_version:co.row_version,title:title.trim()}),'名稱已更新')} className="rounded-xl border border-border-subtle px-4 py-2">儲存名稱</button>
      <div className="grid gap-3 sm:grid-cols-2">
        <SwitchRow label="向觀看者展示共用筆跡" checked={!!co.show_shared_ink} disabled={busy} onChange={value=>void act(()=>sharingApi(`/collections/${id}`,'PATCH',{expected_version:co.row_version,show_shared_ink:value}),'展示設定已更新')}/>
        <SwitchRow label="向觀看者展示共用筆記" checked={!!co.show_shared_notes} disabled={busy} onChange={value=>void act(()=>sharingApi(`/collections/${id}`,'PATCH',{expected_version:co.row_version,show_shared_notes:value}),'展示設定已更新')}/>
      </div>
      <div className="flex flex-wrap gap-2">
        {co.lifecycle==='suspended'||co.lifecycle==='draft'?<button onClick={()=>void act(()=>
          sharingApi(`/collections/${id}/activate`,'POST',{}),'集合已啟用')}
          className="rounded-xl bg-primary/10 px-4 py-2 text-primary">啟用集合</button>:
          <button onClick={()=>void act(()=>sharingApi(`/collections/${id}/suspend`,'POST',{}),'集合已暫停')}
            className="rounded-xl bg-neutral-100 dark:bg-neutral-800 px-4 py-2">暫停共用</button>}
      </div>
      <div className="border-t border-border-subtle pt-4">
        <h3 className="flex items-center gap-2 font-medium"><UserPlus size={17}/>邀請指定對象</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
            placeholder="對方的 Google 帳號 email" className="min-w-0 w-full flex-auto rounded-xl border border-border-subtle bg-page-bg px-3 py-2 sm:w-auto sm:flex-1"/>
          <select value={role} onChange={e=>setRole(e.target.value as typeof role)}
            className="rounded-xl border border-border-subtle bg-page-bg px-3 py-2">
            <option value="viewer">可觀看</option><option value="contributor">可貢獻與書寫</option></select>
          <button disabled={!email.trim()||busy} onClick={()=>void act(async()=>{
            const res=await sharingApi<{token:string}>(`/collections/${id}/invitations`,'POST',{email,role});
            setInviteToken(res.token);
          },'邀請連結已建立')} className="rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-40">建立邀請</button>
        </div>
        {inviteToken&&<p className="mt-2 break-all text-sm">邀請網址：
          <a className="text-primary underline" href={`${window.location.origin}/invite/${inviteToken}`}>
            {window.location.origin}/invite/{inviteToken}</a></p>}
        {grants.filter(g=>!g.revoked_at).length>0&&<div className="mt-4 space-y-2">
          <p className="text-sm font-medium">已加入的成員</p>
          {grants.filter(g=>!g.revoked_at).map(g=><div key={g.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-border-subtle p-2 text-sm">
            <span>{memberName(g)}・{g.role==='contributor'?'可貢獻與書寫':'可觀看'}</span>
            <button disabled={busy} className="text-rose-600" onClick={()=>setConfirm({title:'移除成員？',body:`移除 ${memberName(g)} 後，其提供的題目與共用層停止對外展示；他人已存入版本保留。`,run:async()=>{await sharingApi(`/collections/${id}/grants/${g.id}`,'DELETE');await load();}})}>
              移除</button></div>)}
        </div>}
      </div>
      {co.visibility==='link'&&<div className="border-t border-border-subtle pt-4">
        <button disabled={busy} onClick={()=>void act(async()=>{
          const res=await sharingApi<{token:string}>(`/collections/${id}/links`,'POST',{});
          setLinkToken(res.token);
        },'觀看連結已建立')} className="rounded-xl bg-primary/10 px-4 py-2 text-primary">建立觀看連結</button>
        {linkToken&&<p className="mt-2 break-all text-sm">觀看網址：
          <a className="text-primary underline" href={`${window.location.origin}/collection-link/${linkToken}`}>
            {window.location.origin}/collection-link/{linkToken}</a></p>}
        {links.filter(l=>!l.revoked_at).map(l=><div key={l.id} className="mt-2 flex gap-2 text-sm">
          <span>建立於 {l.created_at}</span>
          <button className="text-rose-600" onClick={()=>void act(()=>
            sharingApi(`/collections/${id}/links/${l.id}`,'DELETE'),'觀看連結已撤銷')}>撤銷連結</button>
        </div>)}
      </div>}
      <div className="border-t border-border-subtle pt-4">
        <h3 className="font-medium">轉交管理權</h3>
        <p className="mt-1 text-sm text-text-muted">只能轉交給已接受邀請的貢獻者；對方接受後才生效。你會保留貢獻者身分。</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <select value={transferTarget} onChange={e=>setTransferTarget(e.target.value)}
            aria-label="選擇接手管理權的貢獻者" className="min-w-0 w-full max-w-full rounded-xl border border-border-subtle bg-page-bg px-3 py-2 sm:w-auto">
            <option value="">選擇貢獻者</option>
            {grants.filter(g=>!g.revoked_at&&g.role==='contributor').map(g=><option key={g.id} value={g.user_id}>
              {memberName(g)}</option>)}
          </select>
          <button disabled={busy||!transferTarget} onClick={()=>void act(()=>
            sharingApi(`/collections/${id}/owner-transfer`,'POST',{to_user_id:transferTarget}),'已送出接手邀請')}
            className="rounded-xl border border-border-subtle px-4 py-2 disabled:opacity-40">邀請接手</button>
        </div>
        {transfer&&<div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span>等待 {transfer.display_name||'貢獻者'} 接受（期限 {new Date(transfer.expires_at).toLocaleDateString()}）</span>
          <button disabled={busy} onClick={()=>void act(()=>
            sharingApi(`/collections/${id}/owner-transfer`,'DELETE'),'已取消接手邀請')}
            className="text-rose-600 disabled:opacity-40">取消邀請</button>
        </div>}
      </div>
      <div className="border-t border-border-subtle pt-4">
        <button disabled={busy} className="text-sm text-rose-600" onClick={()=>setConfirm({title:`刪除「${co.title}」？`,body:'集合停止服務。所有人的上傳原題、合法已存版本和私人訂正保留。',run:async()=>{await sharingApi(`/collections/${id}`,'DELETE');navigate('/settings#collections');}})}>
          刪除集合</button>
      </div>
    </section>}
    {confirm&&<AppDialog title={confirm.title} busy={busy} onClose={()=>setConfirm(null)}><p className="text-sm">{confirm.body}</p>
      {error&&<p role="alert" className="mt-3 text-sm text-status-eraser">{error}</p>}
      <button disabled={busy} onClick={()=>{setBusy(true);setError('');void confirm.run().then(()=>setConfirm(null)).catch(e=>setError(e.message)).finally(()=>setBusy(false));}} className="mt-4 rounded-xl bg-status-eraser px-4 py-2 text-white">確認</button></AppDialog>}
  </div>;
}
