import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { ProblemCard, type ProblemCardWork } from './ProblemCard';
import type { Item } from '../types';
import type { ReviewProgress } from '../types/question';
import { DrawCanvas } from './DrawCanvas';
import { AppDialog } from './AppDialog';
import { ShareModal } from './ShareModal';
import { PersonalTopicSelect } from './PersonalTopicSelect';
import { useStore } from '../store/useStore';
import { downloadWorkDraft, forgetWork, getWorkController, workService } from '../services/workService';
import { sharingApi } from '../services/sharingApi';
import { libraryService } from '../services/libraryService';
import type { WorkContent } from '../types/question';

function WorkBody({content,onChanged,onRemoved,onNext,readOnly=false}:{content:WorkContent;readOnly?:boolean;onChanged?:()=>void;onRemoved?:()=>void;onNext?:()=>void}) {
  const account=useStore(s=>s.currentUser?.id||'');

  const controller=getWorkController(account,content);
  const state=useSyncExternalStore(controller.subscribe,controller.getState);
  const [hidden,setHidden]=useState<Record<string,boolean>>({});
  const layerHidden=(l:WorkContent['layers'][number])=>hidden[l.id]??(!!l.legacy||!!content.shared&&l.authorId!==content.shared.source.contributor_id);

  const [update,setUpdate]=useState<Awaited<ReturnType<typeof libraryService.previewUpdate>>|null>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [remove,setRemove]=useState(false);const [savedFlash,setSavedFlash]=useState(false);
  const [sharing,setSharing]=useState(false);
  const [classification,setClassification]=useState(false);const [topic,setTopic]=useState(content.topic||'');
  useEffect(()=>setTopic(content.topic||''),[content.topic]);
  useEffect(()=>{controller.observeCloud(content);},[controller,content]);
  useEffect(()=>{if(state.status!=='saved'){setSavedFlash(false);return;}if(state.revision>0){setSavedFlash(true);const timer=setTimeout(()=>setSavedFlash(false),2200);return ()=>clearTimeout(timer);}},[state.status,state.revision]);
  const [cloud,setCloud]=useState<WorkContent|null>(null);const [name,setName]=useState('');
  const [hasProfile,setHasProfile]=useState(!content.shared);const [profileError,setProfileError]=useState('');
  const initialProgress=()=>content.saved?{status:content.saved.saved.status as ReviewProgress['status'],previous_status:'unsolved' as const,review_count:content.saved.saved.review_count||0,row_version:content.saved.saved.row_version}:content.shared?.progress||{status:'unsolved' as const,previous_status:'unsolved' as const,review_count:0,row_version:0};
  const [progress,setProgress]=useState<ReviewProgress>(initialProgress);const progressRef=useRef(progress);const progressBusy=useRef(false);
  useEffect(()=>{const next=initialProgress();if(next.row_version>=progressRef.current.row_version){setProgress(next);progressRef.current=next;}},[content]);
  const changeProgress=async(action:'resolve'|'archive')=>{
    if(readOnly||progressBusy.current)return;progressBusy.current=true;
    try{const current=progressRef.current;
      let next:ReviewProgress;
      if(content.saved){const status=action==='archive'?(current.status==='archived'?current.previous_status:'archived'):(current.status==='resolved'?'unsolved':'resolved');
        const reviewCount=current.review_count+(action==='resolve'&&current.status==='unsolved'?1:0);
        const result=await libraryService.patch(content.saved.saved.id,{expected_version:current.row_version,status,review_count:reviewCount});
        next={...current,status,review_count:reviewCount,row_version:result.row_version};
      }else{const result=await sharingApi<{progress:ReviewProgress}>('/collections/'+encodeURIComponent(content.collectionId!)+'/items/'+encodeURIComponent(content.shared!.entry.id)+'/progress','PUT',{action,expected_version:current.row_version,expected_generation:content.shared!.entry.generation});next=result.progress;}
      progressRef.current=next;setProgress(next);onChanged?.();
      if(useStore.getState().currentUser?.id===account&&content.shared?.source.contributor_id===account)useStore.getState().updateProblemInStore(content.shared.source.id,{status:next.status,review_count:next.review_count});
    }finally{progressBusy.current=false;}
  };
  const mineEditable=!readOnly&&hasProfile&&(!content.shared||content.shared.capabilities.can_contribute);
  useEffect(()=>{
    if(!content.shared)return;const abort=new AbortController();
    void sharingApi<{profile:unknown}>('/me/public-profile','GET',undefined,abort.signal).then(r=>{if(!abort.signal.aborted)setHasProfile(!!r.profile);})
      .catch(e=>{if(!abort.signal.aborted)setProfileError(e.message);});return ()=>abort.abort();
  },[content.shared]);
  const act=async(fn:()=>Promise<unknown>)=>{
    setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'操作失敗');}finally{setBusy(false);}
  };
  const item:Item={id:content.saved?.saved.id||content.shared!.entry.id,user_id:account,type:'problem',topic_id:content.topic,source:content.title,keywords:content.saved?.snapshot.source_tags||content.shared?.source.keywords||null,keyword_tokens:null,image_url:content.image,draw_data:JSON.stringify(state.ink),typed_notes:state.notes,status:progress.status,review_count:progress.review_count,vector_clock:null,created_at:'',updated_at:''};
  const syncMessage=state.status==='conflict'?'同步衝突':state.status==='error'?'同步失敗':state.status==='saving'?'正在同步存檔…':state.status==='pending'?(state.error?'尚未同步':'等待同步…'):savedFlash?'已同步':'支援即時打字';
  const work:ProblemCardWork={editorVersion:state.editorVersion,image:content.image,saveInk:controller.ink,saveNotes:controller.notes,toggleStatus:()=>changeProgress('resolve'),toggleArchive:()=>changeProgress('archive'),reload:async()=>{if(content.saved){setUpdate(await libraryService.previewUpdate(content.saved.saved.id));return;}if(controller.pending())throw new Error('請先同步本機作業再重整');onChanged?.();},
    notesLabel:content.saved?'我的私人筆記':'我的共用筆記',
    syncStatus:<><span role="status" aria-atomic="true">{syncMessage}</span>{state.status==='error'&&<button type="button" onClick={controller.retry} className="text-text-muted underline underline-offset-2 hover:text-text-main">重試同步</button>}</>,
    copyText:async()=>[content.title,content.topic,content.collectionTitle,content.provider].filter(Boolean).join(' · '),
    reloadLabel:content.saved?'檢查來源更新':undefined,
    footerActions:content.saved?<button onClick={()=>setRemove(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-neutral-100 px-3.5 py-2 text-xs text-text-muted hover:text-status-eraser"><Trash2 size={14}/>移除我的已存版本</button>:undefined,
    share:()=>setSharing(true),
    label:<span className="rounded-lg bg-neutral-100 px-2.5 py-1 text-xs text-text-muted">{content.saved?'我存入':'共用中'} · {content.collectionTitle}</span>,
    beforeWorkspace:<>    {!readOnly&&!hasProfile&&<section className="mb-4 rounded-2xl bg-page-bg p-4">
      <label className="block text-sm">開始共用書寫前，設定你的公開顯示名稱<input value={name} maxLength={80} onChange={e=>setName(e.target.value)} className="mt-2 w-full rounded-xl border border-border-subtle bg-surface p-3"/></label>
      <p className="mt-2 text-xs text-text-muted">這個帳號名稱會顯示於你貢獻的題目、筆跡和筆記，不使用 email。</p>
      <button disabled={busy||!name.trim()} onClick={()=>void act(async()=>{await sharingApi('/me/public-profile','PUT',{display_name:name.trim()});setHasProfile(true);})} className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm text-white disabled:opacity-40">儲存名稱並開始</button>
      {profileError&&<p role="alert" className="mt-2 text-xs text-status-eraser">{profileError}</p>}
    </section>}
    {content.layers.length>0&&<div className="mb-3 flex flex-wrap gap-2">{content.layers.map(l=><button key={l.id}
      aria-pressed={!layerHidden(l)}
      onClick={()=>setHidden(p=>({...p,[l.id]:!layerHidden(l)}))}
      className="rounded-xl border border-border-subtle px-3 py-2 text-xs aria-pressed:bg-primary/10 aria-pressed:border-primary/20 aria-pressed:text-primary">{l.author} · 參考筆跡</button>)}</div>}
</>,
    references:content.layers.filter(l=>l.ink&&!layerHidden(l)).map(l=>l.ink!),
    afterNotes:<>{(error||((state.status==='error'||state.status==='conflict'||state.storageFailed)&&state.error))&&<p role="alert" className="mt-3 text-sm text-[#95582F]">{error||state.error}</p>}
    {state.status==='conflict'&&<div className="mt-2 space-y-2 text-xs"><p className="text-text-muted">本機作業已保留；請核對另一裝置的內容。</p>
      <button onClick={()=>downloadWorkDraft(state.ink,state.notes)} className="rounded-xl border border-border-subtle px-3 py-2">下載本機作業</button>
      <button disabled={busy} onClick={()=>void act(async()=>{setCloud(content.saved?await workService.loadSaved(content.saved.saved.id):await workService.loadShared(content.collectionId!,content.shared!.entry.id,account));})} className="ml-2 rounded-xl border border-border-subtle px-3 py-2">核對雲端版本</button>
    </div>}
    {content.layers.filter(l=>l.notes).map(l=><details key={l.id} className="mt-3 rounded-2xl bg-page-bg p-3">
      <summary className="cursor-pointer text-sm">{l.author} · {l.notes.slice(0,60)}{l.notes.length>60?'…':''}</summary>
      <p className="mt-2 whitespace-pre-wrap text-sm">{l.notes}</p></details>)}
    {content.saved&&!content.saved.source.available&&<p className="mt-2 text-xs text-text-muted">來源目前無法存取；你的已存版本與訂正仍保留。</p>}
</>,
  };
  return <div data-question={item.id} className={content.saved?'[&_[data-problem-id]]:border-[#DCE8E0] dark:[&_[data-problem-id]]:border-[#3D5449]':''}><ProblemCard problem={item} work={work} onNext={onNext} onEditMetadata={content.saved&&!readOnly?()=>setClassification(true):undefined} readOnly={readOnly||!mineEditable||state.status==='conflict'} streamSearch/>
    <ShareModal isOpen={sharing} target={content.ref} onClose={()=>setSharing(false)}
      canCreate={!!(content.saved?.capabilities?.can_create_share||content.shared?.capabilities.can_create_share)}
      blockedReason={controller.pending()?'請先完成作業同步，再建立分享連結。':''}/>
    {classification&&content.saved&&<AppDialog title="修改題目分類" busy={busy} onClose={()=>setClassification(false)}>
      <PersonalTopicSelect id={`saved-topic-${content.saved.saved.id}`} value={topic} onChange={setTopic} disabled={busy}/>
      {content.saved.saved.classification_state==='failed'&&<button disabled={busy} onClick={()=>void act(async()=>{await libraryService.retryClassification(content.saved!.saved.id);setClassification(false);onChanged?.();})} className="mt-3 text-sm underline">重試自動分類</button>}
      <button disabled={busy} onClick={()=>void act(async()=>{const result=await libraryService.patch(content.saved!.saved.id,{expected_version:progressRef.current.row_version,personal_topic_id:topic||null});progressRef.current={...progressRef.current,row_version:result.row_version};setClassification(false);onChanged?.();})} className="mt-4 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">儲存分類</button>
      {error&&<p role="alert" className="mt-3 text-sm text-status-eraser">{error}</p>}
    </AppDialog>}
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
  </div>;

}
export function QuestionWorkCard({kind,id,collectionId,onChanged,onRemoved,onNext,readOnly=false}:{readOnly?:boolean;kind:'saved'|'shared';id:string;collectionId?:string;onChanged?:()=>void;onRemoved?:()=>void;onNext?:()=>void}) {
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
  if(state.key!==key)return <p data-reader-loading="true" className="rounded-3xl border border-border-subtle bg-surface p-6 text-sm">載入題目作業中…</p>;
  if(!state.content)return <div role="alert" className="rounded-3xl border border-border-subtle bg-surface p-6 text-sm">
    {state.error}<button onClick={()=>setRetry(v=>v+1)} className="ml-3 text-primary underline">重試</button></div>;
  if(kind==='shared'&&!readOnly&&!state.content.shared?.capabilities.can_contribute)return <p className="p-6 text-sm">目前沒有此集合的共用書寫權限。</p>;
  if(readOnly)return <WorkPreview content={state.content}/>;
  return <WorkBody key={JSON.stringify(state.content.work.target)} content={state.content} readOnly={readOnly} onNext={onNext} onRemoved={onRemoved} onChanged={()=>{setRetry(v=>v+1);onChanged?.();}}/>;
}

// A read-only result does not create an editor or attach its draft sync controller.
function WorkPreview({content}:{content:WorkContent}) {
  const account=useStore(s=>s.currentUser?.id||'');
  const item:Item={id:content.saved?.saved.id||content.shared!.entry.id,user_id:account,type:'problem',topic_id:content.topic,source:content.title,keywords:content.saved?.snapshot.source_tags||content.shared?.source.keywords||null,keyword_tokens:null,image_url:content.image,draw_data:JSON.stringify(content.work.ink),typed_notes:content.work.notes,status:content.saved?.saved.status as Item['status']||content.shared?.progress?.status||'unsolved',review_count:content.saved?.saved.review_count||content.shared?.progress?.review_count||0,vector_clock:null,created_at:'',updated_at:''};
  const work:ProblemCardWork={image:content.image,saveInk:()=>{},saveNotes:()=>{},toggleStatus:async()=>{},toggleArchive:async()=>{},reload:async()=>{},copyText:async()=>content.title,references:content.layers.flatMap(l=>l.ink&&!l.legacy?[l.ink]:[]),label:<p className="mt-3 text-xs text-text-muted">{content.collectionTitle} · {content.provider}</p>,afterNotes:<>{content.layers.filter(l=>l.notes).map(l=><details key={l.id} className="mt-2 rounded-xl bg-page-bg p-3"><summary className="cursor-pointer text-xs">{l.author} · 參考筆記</summary><p className="mt-2 whitespace-pre-wrap text-sm">{l.notes}</p></details>)}</>};
  return <ProblemCard problem={item} work={work} readOnly streamSearch/>;
}
