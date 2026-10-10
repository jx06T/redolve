import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigationType, useParams, useSearchParams } from 'react-router-dom';
import { StudySources } from '../components/StudySources';
import { QuestionStream } from '../components/QuestionStream';
import { QuestionWorkCard } from '../components/QuestionWorkCard';
import { ProblemCard } from '../components/ProblemCard';
import { FloatingPenToolbar } from '../components/FloatingPenToolbar';
import { AppDialog } from '../components/AppDialog';
import { AddToCollectionDialog } from '../components/AddToCollectionDialog';
import { useStore } from '../store/useStore';
import { questionService, collectionService } from '../services/questionService';
import { readSource, rememberStudy } from '../services/navigationState';
import { isGuestUser } from '../utils/guest';
import { useProblemActions } from '../hooks/useProblemActions';
import { ProblemMetadataModal } from '../components/problem/ProblemMetadataModal';
import type { Item } from '../types';
import { getProblemImageUrl } from '../services/api';
import { savedImageUrl, imageUrl } from '../services/sharingApi';
import type { SearchHit } from '../types/search';
import type { Collection } from '../services/sharingApi';
import type { TaxonomyNode } from '../types';

const topics=(nodes:TaxonomyNode[],depth=0):{id:string;label:string}[]=>nodes.flatMap(n=>[
  {id:n.id,label:`${'　'.repeat(depth)}${n.label}`},...topics(n.children||[],depth+1)]);
const pageCache=new Map<string,{key:string;items:SearchHit[];next:number|null}>();
export function QuestionLibraryView({search=false}:{search?:boolean}) {
  const location=useLocation();const legacy=useParams();const [params,setParams]=useSearchParams();
  const source=readSource(params.get('source'));const account=useStore(s=>s.currentUser?.id||'guest');
  const {currentUser,taxonomies,setAuthModalOpen,problems,showToast}=useStore();
  const find=useStore(s=>s.inPageSearchQuery);
  const collection=params.get('collection_id')||'';const query=params.get('q')||'';
  const topic=params.get('topic_id')||legacy.topic||(legacy.subject&&legacy.subject!=='all'?legacy.subject:'');
  const status=params.get('status')||'';const tag=params.get('tag')||'';
  const scopeKey=JSON.stringify([account,source,collection,query,topic,status,tag,search]);
  const [data,setData]=useState<{key:string;items:SearchHit[];next:number|null}>({key:'',items:[],next:null});
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
  const [sets,setSets]=useState<Collection[]>([]);const [setsError,setSetsError]=useState('');
  const [draftQuery,setDraftQuery]=useState(query);const [filters,setFilters]=useState(false);
  const [draft,setDraft]=useState({topic,status,tag,collection});const [add,setAdd]=useState<string|null>(null);
  const [dirty,setDirty]=useState(false);const [membershipRevision,setMembershipRevision]=useState(0);
  const navType=useNavigationType();const {saveMetadata,analyzeItem}=useProblemActions();
  const [editing,setEditing]=useState<Item|null>(null);const [editTopic,setEditTopic]=useState('');const [editTags,setEditTags]=useState('');const [analyzing,setAnalyzing]=useState(false);
  const [memberships,setMemberships]=useState<Record<string,{entry_id:string;collection_id:string;title:string;state:string;lifecycle:string;visibility:string}[]>>({});
  const abortRef=useRef<AbortController>();const active=useRef(scopeKey);active.current=scopeKey;
  useEffect(()=>{setDraftQuery(query);setDraft({topic,status,tag,collection});},[query,topic,status,tag,collection]);
  useEffect(()=>{if(!search)rememberStudy(account,location.pathname+location.search,source);},[account,location.pathname,location.search,source,search]);
  useEffect(()=>{
    if(isGuestUser(currentUser)){setSets([]);return;}
    const abort=new AbortController();setSets([]);setSetsError('');
    void collectionService.listContributable(abort.signal).then(setSets).catch(e=>{if(!abort.signal.aborted)setSetsError(e.message);});
    return ()=>abort.abort();
  },[account,currentUser,revision]);
  const load=async(offset=0)=>{
    abortRef.current?.abort();const abort=new AbortController();abortRef.current=abort;
    const key=scopeKey;setBusy(true);setError('');
    try {
      const page=await questionService.search({source,collectionId:collection,query,topic,status,tag,offset,
        signal:abort.signal,guest:isGuestUser(currentUser),taxonomies});
      if(abort.signal.aborted||active.current!==key)return;
      setData(previous=>({key,items:offset&&previous.key===key?
        [...previous.items,...page.items.filter(i=>!previous.items.some(p=>p.origin===i.origin&&p.id===i.id))]:page.items,next:page.next_offset}));
      if(source==='owned'){
        const previous=offset?useStore.getState().problems:[];
        useStore.getState().setProblems([...previous,...page.items.flatMap(i=>i.problem?[i.problem]:[])],null);
      }
    }catch(e){if(!abort.signal.aborted&&active.current===key)setError(e instanceof Error?e.message:'載入失敗');}
    finally{if(!abort.signal.aborted&&active.current===key)setBusy(false);}
  };
  useEffect(()=>{
    setDirty(false);
    const cached=navType==='POP'&&revision===0?pageCache.get(scopeKey):undefined;
    if(cached){setData(cached);setBusy(false);setError('');if(source==='owned'){
      const existing=useStore.getState().problems;
      useStore.getState().setProblems(cached.items.flatMap(i=>i.problem?[existing.find(p=>p.id===i.id&&p.user_id===i.problem?.user_id)||i.problem]:[]),null);
    }}
    else {setData({key:scopeKey,items:[],next:null});void load();}
    return ()=>abortRef.current?.abort();
  },[scopeKey,revision]);
  useEffect(()=>{if(data.key!==scopeKey)return;pageCache.set(scopeKey,data);if(pageCache.size>20)pageCache.delete(pageCache.keys().next().value!);},[data,scopeKey]);
  useEffect(()=>{const refresh=()=>setRevision(v=>v+1);window.addEventListener('redolve:library-refresh',refresh);return ()=>window.removeEventListener('redolve:library-refresh',refresh);},[]);
  useEffect(()=>{
    const ids=data.items.filter(i=>i.origin==='owned').map(i=>i.id);if(isGuestUser(currentUser)||!ids.length){setMemberships({});return;}
    const abort=new AbortController();void collectionService.memberships(ids,abort.signal).then(r=>{
      if(abort.signal.aborted)return;setMemberships(r);
    }).catch(()=>{});return ()=>abort.abort();
  },[data.items,currentUser,membershipRevision]);
  const patch=(values:Record<string,string>)=>{const next=new URLSearchParams(params);Object.entries(values).forEach(([k,v])=>v?next.set(k,v):next.delete(k));next.delete('focus');setParams(next);};
  const items=data.key===scopeKey?data.items:[];
  useEffect(()=>{
    const store=useStore.getState();const ids=find.trim()?items.filter(i=>[i.title,i.keywords,i.typed_notes,i.collection_title,i.provider_name].some(t=>t?.toLocaleLowerCase().includes(find.toLocaleLowerCase()))).map(i=>`stream:${i.id}`):[];
    ids.forEach(store.registerInPageMatch);return ()=>ids.forEach(store.unregisterInPageMatch);
  },[items,find]);
  const filterFields=<div className="space-y-4">
    <label className="block text-sm">科目與單元<select aria-label="科目與單元" value={draft.topic} onChange={e=>setDraft(v=>({...v,topic:e.target.value}))} className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3">
      <option value="">所有科目與單元</option><option value="unclassified">未分類</option>{topics(taxonomies).map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select></label>
    {source!=='contributing'&&<label className="block text-sm">訂正狀態<select aria-label="訂正狀態" value={draft.status} onChange={e=>setDraft(v=>({...v,status:e.target.value}))} className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3">
      <option value="">全部狀態</option><option value="unsolved">待訂正</option><option value="resolved">已訂正</option><option value="archived">已封存</option></select></label>}
    <label className="block text-sm">標籤<input value={draft.tag} onChange={e=>setDraft(v=>({...v,tag:e.target.value}))} className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3"/></label>
    {source==='owned'&&sets.length>0&&<label className="block text-sm">所屬共用集（只篩選我的原題）<select aria-label="所屬共用集（只篩選我的原題）" value={draft.collection} onChange={e=>setDraft(v=>({...v,collection:e.target.value}))} className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3"><option value="">全部我上傳的題目</option>{sets.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>}
    <button onClick={()=>{patch({topic_id:draft.topic,status:draft.status,tag:draft.tag,...(source==='owned'?{collection_id:draft.collection}:{})});setFilters(false);}} className="rounded-xl bg-primary px-4 py-3 text-white text-sm">套用篩選</button>
    <button onClick={()=>{setDraft({topic:'',status:'',tag:'',collection:source==='owned'?'':collection});patch({topic_id:'',status:'',tag:'',...(source==='owned'?{collection_id:''}:{})});setFilters(false);}} className="ml-2 text-sm text-text-muted underline">清除篩選</button>
  </div>;
  return <div className="space-y-4">
    <StudySources/>
    <header className={`rounded-2xl border p-4 ${source==='saved'?'border-[#DCE8E0] bg-[#EAF1EC] dark:bg-[#26362F]':source==='contributing'?'border-primary/20 bg-primary/5':'border-border-subtle bg-surface'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-lg font-semibold">{search?'搜尋題庫':'刷題'} · {source==='owned'?'我上傳':source==='saved'?'我存入':'我共用中'}</h1>
        <button onClick={()=>setFilters(true)} className="lg:hidden rounded-xl border border-border-subtle bg-surface px-4 py-2 text-sm">科目與篩選{topic||status||tag?' · 已套用':''}</button></div>
      {source==='contributing'&&<><p className="mt-2 text-sm text-text-muted">選擇共用集後編輯自己的共用筆跡與筆記。私人訂正位於「我上傳」或「我存入」。</p>
        <select aria-label="選擇可貢獻的共用集" value={collection} onChange={e=>patch({collection_id:e.target.value,topic_id:'',tag:'',status:''})} className="mt-3 w-full rounded-xl border border-border-subtle bg-surface p-3 text-sm">
          <option value="">請選擇一個共用集</option>{sets.map(s=><option key={s.id} value={s.id}>{s.title} · {s.role==='owner'?'建立者':'貢獻者'}</option>)}</select>
        {setsError&&<p role="alert" className="mt-2 text-sm text-status-eraser">{setsError}<button onClick={()=>setRevision(v=>v+1)} className="ml-2 underline">重試</button></p>}
        {collection&&<Link to={`/settings/collections/${collection}`} className="mt-2 inline-block text-xs text-primary underline">管理此共用集</Link>}</>}
      <form className="mt-3 flex gap-2" onSubmit={e=>{e.preventDefault();patch({q:draftQuery.trim()});}}>
        <input value={draftQuery} onChange={e=>setDraftQuery(e.target.value)} aria-label="搜尋目前題目來源" placeholder={search?'搜尋目前來源；留空顯示最近題目':'搜尋這個來源的題目'} className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm"/>
        <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-white text-sm">搜尋</button></form>
    </header>
    {isGuestUser(currentUser)&&source!=='owned'?<section className="rounded-3xl bg-surface p-6 text-sm"><p>登入後可存入題目及參與共用。</p><button onClick={()=>setAuthModalOpen(true)} className="mt-3 rounded-xl bg-primary px-4 py-2 text-white">登入</button></section>:
    <div className="flex gap-5"><aside className="hidden lg:block w-60 shrink-0 rounded-3xl border border-border-subtle bg-surface p-4 self-start"><h2 className="mb-4 font-semibold">題目篩選</h2>{filterFields}
      <h3 className="mt-5 text-sm font-medium">已載入題目定位</h3><div className="mt-2 max-h-56 overflow-y-auto space-y-2">{items.map(i=><button key={i.id} onClick={()=>{const next=new URLSearchParams(params);next.set('focus',i.id);setParams(next);}} className="flex w-full items-center gap-2 rounded-xl bg-page-bg p-2 text-left text-xs">
        <img loading="lazy" alt="" className="h-12 w-12 rounded-lg object-contain bg-white" src={i.origin==='owned'?(i.problem?.image_url?.startsWith('blob:')?i.problem.image_url:getProblemImageUrl(i.id)):i.origin==='saved'?savedImageUrl(i.id):imageUrl(i.collection_id||collection,i.id)}/><span className="line-clamp-2">{i.title||'未命名題目'}</span></button>)}</div>
    </aside>
      <section className="min-w-0 flex-1 space-y-4">
        {dirty&&<p role="status" className="rounded-2xl bg-surface p-3 text-xs text-text-muted">題目資訊已變更，目前保留原閱讀位置。<button onClick={()=>setRevision(v=>v+1)} className="ml-2 text-primary underline">重新套用搜尋與篩選</button></p>}
        {error&&<p role="alert" className="rounded-2xl bg-surface p-4 text-sm text-status-eraser">{error}<button onClick={()=>void load(items.length?data.next||0:0)} className="ml-3 underline">重試載入</button></p>}
        {!items.length&&!busy&&!error&&<p className="rounded-3xl border border-border-subtle bg-surface p-6 text-sm text-text-muted">{source==='contributing'&&!collection?'先選擇共用集。':'目前範圍没有題目；可清除搜尋或篩選。'}</p>}
        {busy&&!items.length&&<p className="p-6 text-sm text-text-muted">載入題目中…</p>}
        <QuestionStream items={items} busy={busy} hasMore={data.next!==null&&!error} loadMore={()=>void load(data.next||0)} focus={params.get('focus')||legacy.problemId||(location.hash.startsWith('#problem-')?location.hash.slice(9):undefined)}
          render={hit=>hit.origin==='owned'&&hit.problem?<div className="space-y-2"><ProblemCard streamSearch problem={problems.find(p=>p.id===hit.id)||hit.problem} memberships={memberships[hit.id]||[]}
            onChanged={()=>setDirty(true)} onDeleted={id=>setData(d=>({...d,items:d.items.filter(i=>i.id!==id)}))}
            onEditMetadata={p=>{setEditing(p);setEditTopic(p.topic_id||'');try{setEditTags(JSON.parse(p.keywords||'[]').join(', '));}catch{setEditTags('');}}}/>
            {!isGuestUser(currentUser)&&<button onClick={()=>setAdd(hit.id)} className="rounded-xl border border-border-subtle bg-surface px-4 py-3 text-sm text-primary">加入指定共用集</button>}</div>:
            <QuestionWorkCard kind={source==='saved'?'saved':'shared'} id={hit.id} collectionId={hit.collection_id||collection} onChanged={()=>setDirty(true)} onRemoved={()=>setData(d=>({...d,items:d.items.filter(i=>i.id!==hit.id)}))}/>}/>
      </section></div>}
    <FloatingPenToolbar/>
    {filters&&<AppDialog title="科目與篩選" onClose={()=>{setDraft({topic,status,tag,collection});setFilters(false);}}>{filterFields}</AppDialog>}
    {add&&<AddToCollectionDialog itemIds={[add]} onClose={()=>{setAdd(null);setMembershipRevision(v=>v+1);}}/>}
    <ProblemMetadataModal isOpen={!!editing} problem={editing} editTopicId={editTopic} editKeywordsStr={editTags} isAnalyzing={analyzing} activeTaxonomies={taxonomies}
      onClose={()=>setEditing(null)} onTopicIdChange={setEditTopic} onKeywordsStrChange={setEditTags}
      onSave={()=>{if(editing)void saveMetadata(editing,{topic_id:editTopic||null,keywords:editTags.split(',').map(s=>s.trim()).filter(Boolean)}).then(()=>{setDirty(true);setEditing(null);}).catch(e=>showToast(e instanceof Error?e.message:'儲存失敗','error'));}}
      onRunAiAnalysis={()=>{if(!editing)return;setAnalyzing(true);void analyzeItem(editing).then(r=>{if(r?.tagResult){setEditTopic(r.tagResult.topic_id||'');setEditTags(r.tagResult.keywords.join(', '));}}).catch(e=>showToast(e instanceof Error?e.message:'辨識失敗','error')).finally(()=>setAnalyzing(false));}}/>
  </div>;
}
