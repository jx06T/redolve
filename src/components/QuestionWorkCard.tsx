import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { DrawCanvas } from './DrawCanvas';
import { AppDialog } from './AppDialog';
import { PersonalTopicSelect } from './PersonalTopicSelect';
import { useStore } from '../store/useStore';
import { downloadWorkDraft, forgetWork, getWorkController, workService } from '../services/workService';
import { sharingApi } from '../services/sharingApi';
import { libraryService } from '../services/libraryService';
import type { WorkContent } from '../types/question';

function WorkBody({content,onChanged,onRemoved}:{content:WorkContent;onChanged?:()=>void;onRemoved?:()=>void}) {
  const account=useStore(s=>s.currentUser?.id||'');
  const {tool,penColor,penWidth,eraserActive}=useStore();
  const controller=getWorkController(account,content);
  const state=useSyncExternalStore(controller.subscribe,controller.getState);
  const [collapsed,setCollapsed]=useState(false);const [hidden,setHidden]=useState<Record<string,boolean>>({});
  const [width,setWidth]=useState(800);const area=useRef<HTMLDivElement>(null);
  const [update,setUpdate]=useState<Awaited<ReturnType<typeof libraryService.previewUpdate>>|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [remove,setRemove]=useState(false);const [savedFlash,setSavedFlash]=useState(false);
  useEffect(()=>{controller.observeCloud(content);},[controller,content]);
  useEffect(()=>{if(state.status!=='saved'){setSavedFlash(false);return;}if(state.revision>0){setSavedFlash(true);const timer=setTimeout(()=>setSavedFlash(false),2200);return ()=>clearTimeout(timer);}},[state.status,state.revision]);
  const [cloud,setCloud]=useState<WorkContent|null>(null);const [name,setName]=useState('');
  const [hasProfile,setHasProfile]=useState(!content.shared);const [profileError,setProfileError]=useState('');
  const base=state.ink.baseWidth||800;
  const extra=state.ink.calcSpaceHeight??400;
  const rendered=Math.round(extra*width/base);
  const mineEditable=hasProfile&&(!content.shared||content.shared.capabilities.can_contribute);
  useEffect(()=>{
    if(!content.shared)return;const abort=new AbortController();
    void sharingApi<{profile:unknown}>('/me/public-profile','GET',undefined,abort.signal).then(r=>{if(!abort.signal.aborted)setHasProfile(!!r.profile);})
      .catch(e=>{if(!abort.signal.aborted)setProfileError(e.message);});return ()=>abort.abort();
  },[content.shared]);
  useEffect(()=>{
    const node=area.current;if(!node)return;
    const observer=new ResizeObserver(()=>setWidth(node.clientWidth));observer.observe(node);
    setWidth(node.clientWidth);return ()=>observer.disconnect();
  },[]);
  const act=async(fn:()=>Promise<unknown>)=>{
    setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'操作失敗');}finally{setBusy(false);}
  };
  return <article data-question={content.ref.kind==='saved'?content.ref.savedRefId:content.ref.entryId}
    className={`rounded-3xl border bg-surface p-4 sm:p-5 ${content.saved?'border-[#DCE8E0] dark:border-[#3D5449]':'border-primary/20'}`}>
    <header className={`mb-4 rounded-2xl p-3 ${content.saved?'bg-[#EAF1EC] dark:bg-[#26362F]':'bg-primary/10'}`}>
      <p className="text-xs font-medium">{content.saved?'我存入 · 私人訂正':'我共用中 · 正在編輯我的共用層'}</p>
      <h2 className="mt-1 font-semibold">{content.title}</h2>
      <p className="mt-1 text-xs text-text-muted">{content.collectionTitle} · {content.provider}</p>
    </header>
    {!hasProfile&&<section className="mb-4 rounded-2xl bg-page-bg p-4">
      <label className="block text-sm">開始共用書寫前，設定你的公開顯示名稱<input value={name} maxLength={80} onChange={e=>setName(e.target.value)} className="mt-2 w-full rounded-xl border border-border-subtle bg-surface p-3"/></label>
      <p className="mt-2 text-xs text-text-muted">這個帳號名稱會顯示於你貢獻的題目、筆跡和筆記，不使用 email。</p>
      <button disabled={busy||!name.trim()} onClick={()=>void act(async()=>{await sharingApi('/me/public-profile','PUT',{display_name:name.trim()});setHasProfile(true);})} className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm text-white disabled:opacity-40">儲存名稱並開始</button>
      {profileError&&<p role="alert" className="mt-2 text-xs text-status-eraser">{profileError}</p>}
    </section>}
    {content.layers.length>0&&<div className="mb-3 flex flex-wrap gap-2">{content.layers.map(l=><button key={l.id}
      aria-pressed={!(hidden[l.id]??(content.shared?l.authorId!==content.shared.source.contributor_id:false))}
      onClick={()=>setHidden(p=>({...p,[l.id]:!(p[l.id]??(content.shared?l.authorId!==content.shared.source.contributor_id:false))}))}
      className="rounded-xl border border-border-subtle px-3 py-2 text-xs">{l.author} · 參考筆跡</button>)}</div>}
    <div ref={area} className="relative overflow-hidden rounded-2xl border border-border-subtle bg-page-bg">
      <img src={content.image} alt={content.title} className="exam-paper-image pointer-events-none block h-auto w-full select-none"/>
      <div style={{height:collapsed?0:rendered}} className="border-t border-dashed border-border-subtle transition-[height] duration-200"/>
      {content.layers.filter(l=>l.ink&&!(hidden[l.id]??(content.shared?l.authorId!==content.shared.source.contributor_id:false))).map(l=>
        <div key={l.id} className="pointer-events-none absolute inset-0"><DrawCanvas initialDrawData={l.ink} readOnly inkVisible calcSpaceHeight={extra}/></div>)}
      <div className="absolute inset-0"><DrawCanvas initialDrawData={state.ink} calcSpaceHeight={extra}
        onSaveDrawData={controller.ink} activeTool={tool} activeColor={penColor} activeWidth={penWidth}
        isEraserActive={eraserActive} readOnly={!mineEditable||state.status==='conflict'} inkVisible/></div>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button onClick={()=>setCollapsed(v=>!v)} className="rounded-xl border border-border-subtle px-3 py-2 text-xs">
        {collapsed?'展開推導區':'收合推導區'}</button>
      <button disabled={collapsed} onClick={()=>controller.ink({...state.ink,calcSpaceHeight:extra+200})}
        className="rounded-xl border border-border-subtle px-3 py-2 text-xs disabled:opacity-40">增加書寫空間</button>
      <span role="status" className="text-xs text-text-muted">
        {state.status==='saving'?'儲存中…':state.status==='pending'?'尚未同步':state.status==='saved'&&savedFlash?'已儲存':''}</span>
    </div>
    {(state.error||error)&&<p role="alert" className="mt-3 text-sm text-[#95582F]">{error||state.error}</p>}
    {(state.status==='error'||state.status==='pending')&&<button onClick={controller.retry} className="mt-2 rounded-xl border border-border-subtle px-3 py-2 text-xs">重試同步</button>}
    {state.status==='conflict'&&<div className="mt-2 space-y-2 text-xs"><p className="text-text-muted">本機作業已保留；請核對另一裝置的內容。</p>
      <button onClick={()=>downloadWorkDraft(state.ink,state.notes)} className="rounded-xl border border-border-subtle px-3 py-2">下載本機作業</button>
      <button disabled={busy} onClick={()=>void act(async()=>{setCloud(content.saved?await workService.loadSaved(content.saved.saved.id):await workService.loadShared(content.collectionId!,content.shared!.entry.id,account));})} className="ml-2 rounded-xl border border-border-subtle px-3 py-2">核對雲端版本</button>
    </div>}
    {content.layers.filter(l=>l.notes).map(l=><details key={l.id} className="mt-3 rounded-2xl bg-page-bg p-3">
      <summary className="cursor-pointer text-sm">{l.author} · {l.notes.slice(0,60)}{l.notes.length>60?'…':''}</summary>
      <p className="mt-2 whitespace-pre-wrap text-sm">{l.notes}</p></details>)}
    <label className="mt-4 block text-sm font-medium">{content.saved?'我的私人筆記':'我的共用筆記'}
      <textarea value={state.notes} maxLength={65536} disabled={!mineEditable||state.status==='conflict'}
        onChange={e=>controller.notes(e.target.value)} rows={3}
        className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3 text-sm"/></label>
    {content.saved&&<div className="mt-4 space-y-3 border-t border-border-subtle pt-4">
      {content.saved.saved.classification_state==='pending'&&<p role="status" className="text-xs text-text-muted">正在將來源分類辨識到你的課綱；你也可以手動指定。</p>}
      {content.saved.saved.classification_state==='failed'&&<p className="text-xs text-text-muted">自動分類未完成；題目已保留，可手動指定科目與單元。<button disabled={busy} onClick={()=>void act(async()=>{await libraryService.retryClassification(content.saved!.saved.id);onChanged?.();})} className="ml-2 text-primary underline">重試分類</button></p>}
      <label htmlFor={`saved-topic-${content.saved.saved.id}`} className="block text-xs text-text-muted">我的科目與單元</label>
      <PersonalTopicSelect id={`saved-topic-${content.saved.saved.id}`} value={content.saved.saved.personal_topic_id||''}
        onChange={topic=>void act(async()=>{
          const d=content.saved!;await libraryService.patch(d.saved.id,{expected_version:d.saved.row_version,personal_topic_id:topic||null});onChanged?.();
        })} disabled={busy}/>
      <div className="flex flex-wrap gap-2">
        <select aria-label="我的訂正狀態" value={content.saved.saved.status} disabled={busy}
          onChange={e=>void act(async()=>{
            const d=content.saved!;await libraryService.patch(d.saved.id,{expected_version:d.saved.row_version,status:e.target.value});onChanged?.();
          })} className="rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm">
          <option value="unsolved">待訂正</option><option value="resolved">已訂正</option><option value="archived">已封存</option></select>
        <button disabled={busy||!content.saved.source.available} onClick={()=>void act(async()=>{
          setUpdate(await libraryService.previewUpdate(content.saved!.saved.id));
        })} className="rounded-xl border border-border-subtle px-3 py-2 text-xs disabled:opacity-40">檢查來源更新</button>
        <a href={content.image} download className="rounded-xl border border-border-subtle px-3 py-2 text-xs">下載圖片</a>
        <button onClick={()=>setRemove(true)} className="rounded-xl px-3 py-2 text-xs text-status-eraser">移除我的已存版本</button>
      </div>
      {!content.saved.source.available&&<p className="text-xs text-text-muted">來源目前無法存取；你的已存版本與訂正仍保留。</p>}
    </div>}
    {update&&<AppDialog title="來源內容更新" busy={busy} onClose={()=>setUpdate(null)}>
      <p className="text-sm">{!update.available?'來源目前無法存取':update.changed?update.changes.join('、'):'目前已與可取得的來源內容一致。'}</p>
      <p className="mt-2 text-xs text-text-muted">更新保留自己的筆跡、筆記、分類與訂正狀態。</p>
      {update.collection_id&&<Link to={`/collections/${update.collection_id}?focus=${update.entry_id}`}
        className="mt-3 inline-block text-sm text-primary underline">前往集合查看</Link>}
      {error&&<p role="alert" className="mt-3 text-sm text-status-eraser">{error}</p>}
      <div className="mt-4 flex gap-2"><button onClick={()=>setUpdate(null)} disabled={busy} className="rounded-xl border border-border-subtle px-4 py-2 text-sm">維持目前版本</button>
        {update.changed&&<button disabled={busy||controller.pending()} onClick={()=>void act(async()=>{
          await libraryService.update(content.saved!.saved.id,update);setUpdate(null);onChanged?.();
        })} className="rounded-xl bg-primary px-4 py-2 text-sm text-white disabled:opacity-40">更新來源內容</button>}</div>
      {controller.pending()&&<p className="mt-2 text-xs text-text-muted">請先同步目前的作業再更新參考內容。</p>}
    </AppDialog>}
    {remove&&<AppDialog title="移除我的已存版本？" busy={busy} onClose={()=>setRemove(false)}>
      <p className="text-sm">這會移除你的已存內容與個人訂正；來源題目、其他人與訂閱關係不受影響。</p>
      {error&&<p role="alert" className="mt-3 text-sm text-status-eraser">{error}</p>}
      <button disabled={busy} onClick={()=>void act(async()=>{
        await libraryService.remove(content.saved!.saved.id);forgetWork(account,content.work.target);setRemove(false);onRemoved?.();
      })} className="mt-4 rounded-xl bg-status-eraser px-4 py-2 text-sm text-white">移除我的版本</button>
    </AppDialog>}
    {cloud&&<AppDialog title="核對另一裝置的作業" busy={busy} onClose={()=>setCloud(null)}>
      <p className="text-sm">先下載本機作業，再決定是否採用雲端內容。此操作保留本機備份，不會將兩份筆跡自動合併。</p>
      <h3 className="mt-3 text-sm font-medium">雲端筆記</h3><p className="mt-1 whitespace-pre-wrap text-sm">{cloud.work.notes||'無筆記'}</p>
      <div className="relative mt-3 h-52 overflow-hidden rounded-xl border border-border-subtle bg-page-bg"><DrawCanvas initialDrawData={cloud.work.ink} readOnly inkVisible/></div>
      <button onClick={()=>downloadWorkDraft(state.ink,state.notes)} className="mt-4 rounded-xl border border-border-subtle px-4 py-2 text-sm">下載本機作業</button>
      <button disabled={busy} onClick={()=>void act(async()=>{controller.acceptCloud(cloud);setCloud(null);})} className="mt-4 ml-2 rounded-xl bg-primary px-4 py-2 text-sm text-white">採用雲端作業</button>
      {error&&<p role="alert" className="mt-3 text-sm text-status-eraser">{error}</p>}
    </AppDialog>}
  </article>;
}
export function QuestionWorkCard({kind,id,collectionId,onChanged,onRemoved}:{kind:'saved'|'shared';id:string;collectionId?:string;onChanged?:()=>void;onRemoved?:()=>void}) {
  const account=useStore(s=>s.currentUser?.id||'');
  const [state,setState]=useState<{key:string;content?:WorkContent;error?:string}>({key:''});
  const [retry,setRetry]=useState(0);const key=`${account}:${kind}:${collectionId}:${id}`;
  const polls=useRef(0);
  useEffect(()=>{polls.current=0;},[id,account]);
  useEffect(()=>{
    const abort=new AbortController();
    const load=kind==='saved'?workService.loadSaved(id,abort.signal):workService.loadShared(collectionId!,id,account,abort.signal);
    void load.then(content=>{if(!abort.signal.aborted)setState({key,content});})
      .catch(e=>{if(!abort.signal.aborted)setState({key,error:e instanceof Error?e.message:'題目載入失敗'});});
    const recheck=()=>{const next=kind==='saved'?workService.loadSaved(id,abort.signal):workService.loadShared(collectionId!,id,account,abort.signal);void next.then(content=>{if(!abort.signal.aborted)setState({key,content});}).catch(e=>{if(!abort.signal.aborted)setState({key,error:e.message});});};
    window.addEventListener('focus',recheck);window.addEventListener('online',recheck);
    return ()=>{abort.abort();window.removeEventListener('focus',recheck);window.removeEventListener('online',recheck);};
  },[key,kind,id,collectionId,account,retry]);
  useEffect(()=>{
    if(state.key!==key||state.content?.saved?.saved.classification_state!=='pending'||polls.current>=10)return;
    const timer=setTimeout(()=>{polls.current++;setRetry(v=>v+1);},3000);return ()=>clearTimeout(timer);
  },[state,key]);
  if(state.key!==key)return <p className="rounded-3xl border border-border-subtle bg-surface p-6 text-sm">載入題目作業中…</p>;
  if(!state.content)return <div role="alert" className="rounded-3xl border border-border-subtle bg-surface p-6 text-sm">
    {state.error}<button onClick={()=>setRetry(v=>v+1)} className="ml-3 text-primary underline">重試</button></div>;
  if(kind==='shared'&&!state.content.shared?.capabilities.can_contribute)return <p className="p-6 text-sm">目前沒有此集合的共用書寫權限。</p>;
  return <WorkBody key={JSON.stringify(state.content.work.target)} content={state.content} onRemoved={onRemoved} onChanged={()=>{setRetry(v=>v+1);onChanged?.();}}/>;
}
