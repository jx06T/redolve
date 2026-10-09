import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, Plus, Settings2, UserPlus } from 'lucide-react';
import { useStore } from '../store/useStore';
import { sharingApi, type Collection, type CollectionEntry } from '../services/sharingApi';
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
  const {currentUser,setAuthModalOpen,showToast,taxonomies}=useStore();
  const [co,setCo]=useState<Collection|null>(null);
  const [items,setItems]=useState<CollectionEntry[]>([]);
  const [nextCursor,setNextCursor]=useState<{display_order:number;id:string}|null>(null);
  const [candidates,setCandidates]=useState<{id:string;title:string|null;created_at:string}[]>([]);
  const [candidateCursor,setCandidateCursor]=useState<{created_at:string;id:string}|null>(null);
  const [candidateSearch,setCandidateSearch]=useState('');
  const [candidateQuery,setCandidateQuery]=useState('');
  const [selected,setSelected]=useState<string[]>([]);
  const [hasProfile,setHasProfile]=useState(false);
  const [topicFilter,setTopicFilter]=useState('');
  const [tagFilter,setTagFilter]=useState('');
  const [savedFilter,setSavedFilter]=useState('');
  const [readFilter,setReadFilter]=useState('');
  const [email,setEmail]=useState('');
  const [role,setRole]=useState<'viewer'|'contributor'>('viewer');
  const [inviteToken,setInviteToken]=useState('');
  const [linkToken,setLinkToken]=useState('');
  const [transfer,setTransfer]=useState<{to_user_id:string;expires_at:string;display_name:string|null}|null>(null);
  const [transferTarget,setTransferTarget]=useState('');
  const [subscribed,setSubscribed]=useState(false);
  const [grants,setGrants]=useState<{id:string;user_id:string;display_name:string|null;
    role:string;revoked_at:string|null}[]>([]);
  const [links,setLinks]=useState<{id:string;revoked_at:string|null;created_at:string}[]>([]);
  const [stats,setStats]=useState<{item_count:number;contributor_count:number;
    subscriber_count:number;saved_count:number}|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const query=()=>{
    const params=new URLSearchParams();
    if(topicFilter)params.set('topic_id',topicFilter);
    if(tagFilter.trim())params.set('tag',tagFilter.trim());
    if(savedFilter)params.set('saved',savedFilter);
    if(readFilter)params.set('state',readFilter);
    return params;
  };
  const load=async()=>{
    const data=await sharingApi<{collection:Collection;items:CollectionEntry[];
      next_cursor:{display_order:number;id:string}|null}>(`/collections/${id}?${query()}`);
    setCo(data.collection);setItems(data.items);setNextCursor(data.next_cursor);
    if(data.collection.can_contribute) {
      const [found,pending,profile]=await Promise.all([
        sharingApi<{items:typeof candidates;next_cursor:typeof candidateCursor}>(
          `/collections/${id}/candidates?q=${encodeURIComponent(candidateQuery)}`),
        sharingApi<{transfer:typeof transfer}>(`/collections/${id}/owner-transfer`),
        sharingApi<{profile:{display_name:string}|null}>('/me/public-profile'),
      ]);
      setCandidates(found.items);setCandidateCursor(found.next_cursor);setSelected([]);
      setTransfer(pending.transfer);
      setHasProfile(Boolean(profile.profile));
    }
    if(currentUser){
      const subs=await sharingApi<{subscriptions:{collection_id:string}[]}>('/subscriptions');
      setSubscribed(subs.subscriptions.some(s=>s.collection_id===id));
    }
    if(data.collection.is_owner){
      const [grantResult,linkResult,statsResult]=await Promise.all([
        sharingApi<{grants:typeof grants}>(`/collections/${id}/grants`),
        sharingApi<{links:typeof links}>(`/collections/${id}/links`),
        sharingApi<{stats:NonNullable<typeof stats>}>(`/collections/${id}/stats`),
      ]);
      setGrants(grantResult.grants);setLinks(linkResult.links);setStats(statsResult.stats);
    }
  };
  useEffect(()=>{void load().catch(e=>setError(e.message));},
    [id,currentUser,topicFilter,tagFilter,savedFilter,readFilter,candidateQuery]);
  const act=async(fn:()=>Promise<unknown>,message:string)=>{
    setBusy(true);setError('');
    try{await fn();showToast(message,'success');await load();}
    catch(e){setError(e instanceof Error?e.message:'操作失敗');}
    finally{setBusy(false);}
  };
  const loadMore=async()=>{
    if(!nextCursor||busy)return;
    setBusy(true);
    try{
      const params=query();
      params.set('after_order',String(nextCursor.display_order));params.set('after_id',nextCursor.id);
      const page=await sharingApi<{items:CollectionEntry[];
        next_cursor:{display_order:number;id:string}|null}>(`/collections/${id}?${params}`);
      setItems(previous=>[...previous,...page.items]);setNextCursor(page.next_cursor);
    }catch(e){setError(e instanceof Error?e.message:'載入更多題目失敗');}
    finally{setBusy(false);}
  };
  const loadMoreCandidates=async()=>{
    if(!candidateCursor||busy)return;
    setBusy(true);
    try{
      const params=new URLSearchParams({q:candidateQuery,after_at:candidateCursor.created_at,
        after_id:candidateCursor.id});
      const page=await sharingApi<{items:typeof candidates;next_cursor:typeof candidateCursor}>(
        `/collections/${id}/candidates?${params}`);
      setCandidates(previous=>[...previous,...page.items]);setCandidateCursor(page.next_cursor);
    }catch(e){setError(e instanceof Error?e.message:'載入可加入題目失敗');}
    finally{setBusy(false);}
  };
  if(error&&!co)return <div role="alert" className="max-w-3xl mx-auto p-6">{error} <Link to="/my/collections" className="text-primary">返回題目集</Link></div>;
  if(!co)return <p className="p-6 text-text-muted">載入題目集中…</p>;
  const canOrder=co.is_owner&&!topicFilter&&!tagFilter&&!savedFilter&&!readFilter;
  return <div className="max-w-5xl mx-auto space-y-5 pb-16">
    <div className="rounded-3xl border border-[#DCE8E0] dark:border-[#3D5449] bg-[#EAF1EC] dark:bg-[#26362F] px-5 py-4">
      <p className="text-xs font-semibold text-[#47705C] dark:text-[#A9C7B6]">題目集・
        {co.visibility==='public'?'公開':co.visibility==='link'?'連結可看':'指定對象'}・
        {co.lifecycle==='active'?'啟用中':co.lifecycle==='draft'?'草稿':'已暫停'}</p>
      <h1 className="mt-1 text-2xl font-semibold">{co.title}</h1>
      <p className="mt-1 text-sm text-text-muted">{co.public_name}・{nextCursor?`已載入 ${items.length} 題`:`${items.length} 題`}</p>
      {co.description&&<p className="mt-2 text-sm">{co.description}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {!co.is_owner&&currentUser&&<button disabled={busy} onClick={()=>void act(()=>
          sharingApi(`/subscriptions/${id}`,subscribed?'DELETE':'PUT'),
          subscribed?'已取消訂閱':'已訂閱')}
          className="rounded-xl bg-[#A8C5BD] px-4 py-2 text-[#254E3C]">
          {subscribed?'取消訂閱':'訂閱題目集'}</button>}
        {!currentUser&&<button onClick={()=>setAuthModalOpen(true)} className="rounded-xl bg-primary/10 px-4 py-2 text-primary">登入以訂閱及存入</button>}
        <Link to="/subscriptions" className="rounded-xl bg-surface/70 px-4 py-2 text-sm">訂閱中心</Link>
        <Link to={`/search?scope=shared&collection_id=${encodeURIComponent(id)}`}
          className="rounded-xl bg-surface/70 px-4 py-2 text-sm">搜尋此題目集</Link>
      </div>
    </div>
    {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
    {co.can_contribute&&<section className="rounded-3xl border border-border-subtle bg-surface p-5">
      <h2 className="font-semibold flex items-center gap-2"><Plus size={18}/>加入我上傳的原題</h2>
      <p className="mt-1 text-sm text-text-muted">題目仍保留在你的個人題庫；啟用中的集合會立即顯示，後續來源分類與標籤更新也會反映。</p>
      {!hasProfile&&<p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
        加入前請先<Link to="/my/collections#profile" className="mx-1 underline">設定貢獻時顯示的名稱</Link>。</p>}
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();setCandidateQuery(candidateSearch.trim());}}>
        <input value={candidateSearch} onChange={e=>setCandidateSearch(e.target.value)}
          placeholder="搜尋我上傳的原題" aria-label="搜尋可加入的原題"
          className="min-w-48 flex-1 rounded-xl border border-border-subtle bg-page-bg px-3 py-2"/>
        <button type="submit" className="rounded-xl border border-border-subtle px-4 py-2">搜尋</button>
      </form>
      <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-border-subtle p-2">
        {candidates.map(item=><label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-page-bg">
          <input type="checkbox" checked={selected.includes(item.id)}
            onChange={e=>setSelected(previous=>e.target.checked?
              previous.length<50?[...previous,item.id]:previous:previous.filter(x=>x!==item.id))}/>
          <span className="min-w-0 truncate text-sm">{item.title||'未命名題目'}・{item.id.slice(0,8)}</span>
        </label>)}
        {!candidates.length&&<p className="px-3 py-2 text-sm text-text-muted">沒有可加入的原題。</p>}
      </div>
      {candidateCursor&&<button disabled={busy} onClick={()=>void loadMoreCandidates()}
        className="mt-2 rounded-xl border border-border-subtle px-4 py-2 text-sm disabled:opacity-40">載入更多原題</button>}
      <div className="mt-3 flex items-center gap-3">
        <button disabled={busy||!selected.length||!hasProfile} onClick={()=>void act(async()=>{
          const result=await sharingApi<{results:{item_id:string;status?:string;error?:string}[]}>(
            `/collections/${id}/items/batch`,'POST',{item_ids:selected});
          const failures=result.results.filter(row=>row.error);
          if(failures.length){await load();throw new Error(`已加入 ${result.results.length-failures.length} 題；${failures.length} 題未成功，請重新檢查。`);}
        },`已加入 ${selected.length} 題`)}
          className="rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-40">加入選取的 {selected.length} 題</button>
        <span className="text-xs text-text-muted">單次最多 50 題</span>
      </div>
    </section>}
    {transfer&&!co.is_owner&&transfer.to_user_id===currentUser?.id&&<section
      className="rounded-3xl border border-[#DCE8E0] bg-[#EAF1EC] p-5 dark:border-[#3D5449] dark:bg-[#26362F]">
      <h2 className="font-semibold">接手題目集管理</h2>
      <p className="mt-1 text-sm text-text-muted">建立者邀請你管理此集合。接受後你可以調整共用設定及成員；原建立者保留貢獻者身分。</p>
      <button disabled={busy} onClick={()=>void act(()=>sharingApi(`/collections/${id}/owner-transfer/accept`,'POST',{}),'已接手題目集')}
        className="mt-3 rounded-xl bg-primary px-4 py-2 text-white disabled:opacity-40">接受管理權</button>
    </section>}
    <section className="rounded-3xl border border-border-subtle bg-surface p-5">
      <h2 className="font-semibold flex items-center gap-2"><BookOpen size={18}/>集合內容</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <select value={topicFilter} onChange={e=>setTopicFilter(e.target.value)}
          aria-label="依科目與課綱單元篩選" className="rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm">
          <option value="">所有科目與單元</option>{standardTopics(taxonomies).map(t=>
            <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <input value={tagFilter} onChange={e=>setTagFilter(e.target.value)} list="collection-tags"
          placeholder="來源標籤" aria-label="依來源標籤篩選"
          className="min-w-32 rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm"/>
        <datalist id="collection-tags">{tagsFor(items).map(tag=><option key={tag} value={tag}/>)}</datalist>
        <select value={savedFilter} onChange={e=>setSavedFilter(e.target.value)}
          aria-label="依存入狀態篩選" className="rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm">
          <option value="">全部存入狀態</option><option value="yes">已存入</option><option value="no">未存入</option>
        </select>
        {subscribed&&<select value={readFilter} onChange={e=>setReadFilter(e.target.value)}
          aria-label="依閱讀狀態篩選" className="rounded-xl border border-border-subtle bg-page-bg px-3 py-2 text-sm">
          <option value="">全部閱讀狀態</option><option value="unread">未看</option><option value="read">已看</option>
        </select>}
      </div>
      {items.length?<div className="mt-3 grid gap-3 sm:grid-cols-2">{items.map((item,index)=>
        <div key={item.id} className="rounded-2xl border border-border-subtle p-4">
          <Link to={`/collections/${id}/items/${item.id}`} className="block hover:text-primary">
            <span className="text-xs text-[#5F8670]">第 {item.display_order||index+1} 題
              {subscribed?`・${!item.is_new_scope?'訂閱前已有':item.is_read?'已看':'新題'}`:''}</span>
            <p className="mt-1 font-medium">{item.title||'未命名題目'}</p>
            <p className="mt-1 text-xs text-text-muted">{item.provider_name||'題目提供者'}・
              {item.saved_id?'已存入我的錯題本':'尚未存入'}</p>
            {item.keywords&&<p className="mt-2 line-clamp-1 text-xs text-text-muted">
              {tagsFor([item]).join('・')}</p>}
          </Link>
          {canOrder&&<div className="mt-3 flex gap-2 border-t border-border-subtle pt-2">
            {(['up','down'] as const).map(direction=><button key={direction} disabled={busy}
              onClick={()=>void act(()=>sharingApi(`/collections/${id}/items/${item.id}/order`,'PATCH',
                {direction,expected_version:co.row_version}),'題目順序已更新')}
              className="rounded-lg bg-page-bg px-3 py-1 text-xs disabled:opacity-40">
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
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!co.show_shared_ink}
          onChange={e=>void act(()=>sharingApi(`/collections/${id}`,'PATCH',
            {expected_version:co.row_version,show_shared_ink:e.target.checked}),'展示設定已更新')}/>向觀看者展示共用筆跡</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!co.show_shared_notes}
          onChange={e=>void act(()=>sharingApi(`/collections/${id}`,'PATCH',
            {expected_version:co.row_version,show_shared_notes:e.target.checked}),'展示設定已更新')}/>向觀看者展示共用筆記</label>
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
            placeholder="對方的 Google 帳號 email" className="min-w-48 flex-1 rounded-xl border border-border-subtle bg-page-bg px-3 py-2"/>
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
            <span>{g.display_name||g.user_id}・{g.role==='contributor'?'可貢獻與書寫':'可觀看'}</span>
            <button className="text-rose-600" onClick={()=>{if(window.confirm(
              `移除 ${g.display_name||g.user_id} 後，其提供的題目與共用層會立即停止對外顯示；他人已存入的內容保留。確定移除？`))
              void act(()=>sharingApi(`/collections/${id}/grants/${g.id}`,'DELETE'),'成員權限已移除');}}>
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
            aria-label="選擇接手管理權的貢獻者" className="min-w-48 rounded-xl border border-border-subtle bg-page-bg px-3 py-2">
            <option value="">選擇貢獻者</option>
            {grants.filter(g=>!g.revoked_at&&g.role==='contributor').map(g=><option key={g.id} value={g.user_id}>
              {g.display_name||g.user_id}</option>)}
          </select>
          <button disabled={busy||!transferTarget} onClick={()=>void act(()=>
            sharingApi(`/collections/${id}/owner-transfer`,'POST',{to_user_id:transferTarget}),'已送出接手邀請')}
            className="rounded-xl border border-border-subtle px-4 py-2 disabled:opacity-40">邀請接手</button>
        </div>
        {transfer&&<div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span>等待 {transfer.display_name||transfer.to_user_id} 接受（期限 {new Date(transfer.expires_at).toLocaleDateString()}）</span>
          <button disabled={busy} onClick={()=>void act(()=>
            sharingApi(`/collections/${id}/owner-transfer`,'DELETE'),'已取消接手邀請')}
            className="text-rose-600 disabled:opacity-40">取消邀請</button>
        </div>}
      </div>
      <div className="border-t border-border-subtle pt-4">
        <button className="text-sm text-rose-600" onClick={()=>{if(window.confirm(
          `刪除「${co.title}」會停止所有人觀看集合。已存入個人錯題本的內容會保留。確定刪除？`))
          void act(async()=>{await sharingApi(`/collections/${id}`,'DELETE');navigate('/my/collections');},'集合已刪除');}}>
          刪除集合</button>
      </div>
    </section>}
  </div>;
}
