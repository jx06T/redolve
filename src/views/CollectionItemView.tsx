import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookCopy, Download, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { DrawCanvas } from '../components/DrawCanvas';
import { PersonalTopicSelect } from '../components/PersonalTopicSelect';
import { FloatingPenToolbar } from '../components/FloatingPenToolbar';
import { useStore } from '../store/useStore';
import { API_BASE } from '../services/api';
import { imageUrl, sharingApi, type SharedLayer } from '../services/sharingApi';
import type { DrawData } from '../types';

type Detail={
  collection:{id:string;title:string;show_shared_ink:number;show_shared_notes:number};
  entry:{id:string;generation:number;shared_seq:number;latest_add_event_seq:number|null};
  neighbors:{previous:string|null;next:string|null};
  source:{id:string;source:string|null;keywords:string|null;topic_label:string|null;
    content_seq:number;provider_name:string|null};
  layers:SharedLayer[];
  capabilities:{can_contribute:boolean;can_save:boolean};
};
const emptyDraw:DrawData={strokes:[],eraserMasks:[]};
export function CollectionItemView(){
  const {id='',entryId=''}=useParams();
  const {currentUser,tool,penColor,penWidth,eraserActive,setAuthModalOpen,showToast}=useStore();
  const [detail,setDetail]=useState<Detail|null>(null);
  const [draws,setDraws]=useState<Record<string,DrawData>>({});
  const [mineDraw,setMineDraw]=useState<DrawData>(emptyDraw);
  const [note,setNote]=useState('');
  const [imageHeight,setImageHeight]=useState(420);
  const [hidden,setHidden]=useState<Record<string,boolean>>({});
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const [savedId,setSavedId]=useState<string|null>(null);
  const [personalTopic,setPersonalTopic]=useState('');
  const [savePickerOpen,setSavePickerOpen]=useState(false);
  const [reportOpen,setReportOpen]=useState(false);
  const [reportCategory,setReportCategory]=useState('copyright');
  const [reportDetail,setReportDetail]=useState('');
  const drawSeqRef=useRef(0),notesSeqRef=useRef(0);
  const pendingDrawRef=useRef<DrawData|null>(null),savingDrawRef=useRef(false),conflictRef=useRef(false);
  const myLayer=detail?.layers.find(l=>l.user_id===currentUser?.id);
  const draftKey=currentUser?`rdv:shared:${currentUser.id}:${id}:${entryId}`:'';
  const drawDraftKey=`${draftKey}:draw`,noteDraftKey=`${draftKey}:note`;
  const load=async()=>{
    const d=await sharingApi<Detail>(`/collections/${id}/items/${entryId}`);
    setDetail(d);
    const mine=d.layers.find(l=>l.user_id===currentUser?.id);
    drawSeqRef.current=mine?.draw_seq||0;notesSeqRef.current=mine?.notes_seq||0;
    setNote(mine?.typed_notes||'');
    const loaded:Record<string,DrawData>={};
    await Promise.all(d.layers.filter(l=>l.draw_asset_id).map(async l=>{
      try{
        const r=await fetch(`${API_BASE}/collections/${id}/items/${entryId}/layers/${l.id}/draw`,
          {credentials:'include',cache:'no-store'});
        if(r.ok)loaded[l.id]=await r.json() as DrawData;
      }catch{/* A failed reference layer stays hidden until retry. */}
    }));
    setDraws(loaded);setMineDraw(mine&&loaded[mine.id]?loaded[mine.id]:emptyDraw);
    if(d.entry.latest_add_event_seq&&currentUser){
      void sharingApi(`/subscriptions/${id}/items/${entryId}/read`,'PUT').catch(()=>undefined);
    }
    try{
      if(!draftKey)return;
      const legacy=localStorage.getItem(draftKey);
      const parsed=legacy?JSON.parse(legacy) as {draw?:DrawData;note?:string}:{};
      if(legacy){
        if(parsed.draw&&!localStorage.getItem(drawDraftKey))
          localStorage.setItem(drawDraftKey,JSON.stringify(parsed.draw));
        if(parsed.note!==undefined&&localStorage.getItem(noteDraftKey)===null)
          localStorage.setItem(noteDraftKey,parsed.note);
        localStorage.removeItem(draftKey);
      }
      const draw=localStorage.getItem(drawDraftKey);
      const noteDraft=localStorage.getItem(noteDraftKey);
      if(draw||parsed.draw)setMineDraw(draw?JSON.parse(draw) as DrawData:parsed.draw!);
      if(noteDraft!==null||parsed.note!==undefined)setNote(noteDraft!==null?noteDraft:parsed.note!);
      setError(draw||noteDraft!==null||legacy?
        '這台裝置保留了尚未同步的共用草稿，請檢查後再儲存。':'');
    }catch{/* Private browsing may block local storage. */}
  };
  useEffect(()=>{void load().catch(e=>setError(e.message));},[id,entryId,currentUser?.id]);
  const persistDraft=(kind:'draw'|'note',value:DrawData|string)=>{
    if(!draftKey)return;
    try{localStorage.setItem(kind==='draw'?drawDraftKey:noteDraftKey,
      kind==='draw'?JSON.stringify(value):value as string);}catch{/* Storage is best effort. */}
  };
  const saveDraw=async(data:DrawData)=>{
    setMineDraw(data);pendingDrawRef.current=data;persistDraft('draw',data);
    if(savingDrawRef.current||conflictRef.current)return;
    savingDrawRef.current=true;setSaving(true);
    try{
      while(pendingDrawRef.current&&!conflictRef.current){
        const next:DrawData=pendingDrawRef.current;pendingDrawRef.current=null;
        try{
          const result=await sharingApi<{draw_seq:number}>(`/collections/${id}/items/${entryId}/layers/draw`,
            'PUT',{draw_data:next,expected_seq:drawSeqRef.current});
          drawSeqRef.current=result.draw_seq;
        }catch(e){
          pendingDrawRef.current=next;conflictRef.current=true;
          setError(e instanceof Error?e.message:'筆跡儲存失敗；草稿已保留');
        }
      }
      if(!conflictRef.current){
        try{localStorage.removeItem(drawDraftKey);}catch{}
        void load().catch(()=>undefined);
      }
    }finally{savingDrawRef.current=false;setSaving(false);}
  };
  const saveNotes=async()=>{
    persistDraft('note',note);
    setSaving(true);
    try{
      const result=await sharingApi<{notes_seq:number}>(`/collections/${id}/items/${entryId}/layers/notes`,
        'PUT',{typed_notes:note,expected_seq:notesSeqRef.current});
      notesSeqRef.current=result.notes_seq;
      try{localStorage.removeItem(noteDraftKey);}catch{}
      showToast('共用筆記已儲存','success');
      await load();
    }catch(e){setError(e instanceof Error?e.message:'共用筆記儲存失敗');}
    finally{setSaving(false);}
  };
  const savePersonal=async()=>{
    if(!currentUser){setAuthModalOpen(true);return;}
    try{
      const r=await sharingApi<{saved_id:string}>(`/saved`,'POST',
        {entry_id:entryId,topic_id:personalTopic||null});
      setSavedId(r.saved_id);setSavePickerOpen(false);showToast('已存入我的錯題本','success');
    }catch(e){setError(e instanceof Error?e.message:'存入失敗');}
  };
  if(!detail)return <div className="p-6">{error||'載入題目中…'}</div>;
  const ownLayerId=myLayer?.id||'mine';
  return <div className="max-w-4xl mx-auto pb-16">
    <div className="rounded-3xl border border-[#DCE8E0] dark:border-[#3D5449] bg-[#EAF1EC] dark:bg-[#26362F] px-5 py-4">
      <p className="text-xs text-[#47705C] dark:text-[#A9C7B6]">訂閱題目集・{detail.collection.title}</p>
      <h1 className="mt-1 text-xl font-semibold">{detail.source.source||'未命名題目'}</h1>
      <p className="mt-1 text-sm text-text-muted">{detail.source.provider_name||'題目提供者'}・
        {detail.source.topic_label||'未分類'}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={`/collections/${id}`} className="rounded-xl bg-surface/70 px-3 py-2 text-sm">返回集合</Link>
        {detail.neighbors.previous&&<Link to={`/collections/${id}/items/${detail.neighbors.previous}`}
          className="rounded-xl bg-surface/70 px-3 py-2 text-sm">上一題</Link>}
        {detail.neighbors.next&&<Link to={`/collections/${id}/items/${detail.neighbors.next}`}
          className="rounded-xl bg-surface/70 px-3 py-2 text-sm">下一題</Link>}
        {detail.capabilities.can_save&&<button onClick={()=>setSavePickerOpen(v=>!v)}
          className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm text-white">
          <BookCopy size={16}/>{savedId?'已存入':'存入我的錯題本'}</button>}
        {savedId&&<Link to={`/saved/${savedId}`} className="rounded-xl bg-surface/70 px-3 py-2 text-sm">開啟我的版本</Link>}
        <a href={imageUrl(id,entryId)} download className="flex items-center gap-2 rounded-xl bg-surface/70 px-3 py-2 text-sm">
          <Download size={15}/>下載圖片</a>
        <button onClick={()=>void load().catch(e=>setError(e.message))}
          className="flex items-center gap-2 rounded-xl bg-surface/70 px-3 py-2 text-sm"><RefreshCw size={15}/>取得最新內容</button>
        {currentUser&&<button onClick={()=>setReportOpen(v=>!v)}
          className="rounded-xl bg-surface/70 px-3 py-2 text-sm">檢舉內容</button>}
      </div>
      {savePickerOpen&&<div className="mt-4 rounded-2xl bg-surface/80 p-4">
        <label htmlFor="personal-save-topic" className="mb-2 block text-sm font-medium">存入後的個人科目與單元</label>
        <PersonalTopicSelect id="personal-save-topic" value={personalTopic} onChange={setPersonalTopic}/>
        <p className="mt-2 text-xs text-text-muted">分類只套用在你的版本，不更改作者的課綱。</p>
        <button onClick={()=>void savePersonal()} className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm text-white">
          確認存入</button>
      </div>}
    </div>
    {reportOpen&&<div className="mt-3 rounded-2xl border border-border-subtle bg-surface p-4">
      <label className="text-sm">問題類別<select value={reportCategory}
        onChange={e=>setReportCategory(e.target.value)}
        className="ml-2 rounded-xl border border-border-subtle bg-page-bg px-3 py-2">
        <option value="copyright">著作權</option><option value="inappropriate">不當內容</option>
        <option value="privacy">隱私</option><option value="other">其他</option></select></label>
      <textarea value={reportDetail} onChange={e=>setReportDetail(e.target.value)} maxLength={2000}
        placeholder="補充說明（選填）" className="mt-2 block w-full rounded-xl border border-border-subtle bg-page-bg p-3 text-sm"/>
      <button onClick={()=>void sharingApi(`/collections/${id}/reports`,'POST',
        {entry_id:entryId,category:reportCategory,detail:reportDetail})
        .then(()=>{setReportOpen(false);setReportDetail('');showToast('檢舉已送出','success');})
        .catch(e=>setError(e.message))}
        className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm text-white">送出檢舉</button>
    </div>}
    {error&&<p role="alert" className="my-3 text-sm text-rose-600">{error}</p>}
    {conflictRef.current&&<button onClick={()=>{conflictRef.current=false;void load().catch(e=>setError(e.message));}}
      className="mb-3 rounded-xl border border-border-subtle px-3 py-2 text-sm">取得最新版本並保留本機草稿</button>}
    <div className="mt-4 rounded-3xl border border-border-subtle bg-surface p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {detail.layers.map(layer=><button key={layer.id} onClick={()=>setHidden(v=>({...v,[layer.id]:!v[layer.id]}))}
          className="flex items-center gap-2 rounded-xl border border-border-subtle px-3 py-1.5 text-sm">
          {hidden[layer.id]?<EyeOff size={15}/>:<Eye size={15}/>}
          {layer.user_id===currentUser?.id?'我的共用層':layer.author_display}</button>)}
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-neutral-50 dark:bg-[#202023]"
        style={{height:imageHeight+400}}>
        <img src={imageUrl(id,entryId)} alt="題目原圖" onLoad={e=>setImageHeight(e.currentTarget.getBoundingClientRect().height)}
          className="absolute top-0 left-0 w-full h-auto select-none pointer-events-none"/>
        <div className="absolute bottom-0 left-0 right-0 h-[400px] border-t border-dashed border-border-subtle
          bg-[radial-gradient(#9CA3AF_1.2px,transparent_1.2px)] [background-size:18px_18px] opacity-30"/>
        {detail.layers.filter(l=>l.id!==myLayer?.id&&!hidden[l.id]&&draws[l.id]).map(l=>
          <div key={l.id} className="absolute inset-0 pointer-events-none">
            <DrawCanvas initialDrawData={draws[l.id]} readOnly inkVisible calcSpaceHeight={400}/></div>)}
        {detail.capabilities.can_contribute&&<div className="absolute inset-0">
          <DrawCanvas key={ownLayerId} initialDrawData={mineDraw} onSaveDrawData={d=>void saveDraw(d)}
            calcSpaceHeight={400} activeTool={tool} activeColor={penColor} activeWidth={penWidth}
            isEraserActive={eraserActive} readOnly={!!hidden[ownLayerId]} inkVisible={!hidden[ownLayerId]}/></div>}
      </div>
      {detail.capabilities.can_contribute&&<p className="mt-2 text-xs text-text-muted">
        目前書寫的是「我的共用層」；其他人的筆跡僅供觀看。{saving?'儲存中…':''}</p>}
    </div>
    <section className="mt-4 rounded-3xl border border-border-subtle bg-surface p-5">
      <h2 className="font-semibold">共用筆記</h2>
      {detail.layers.filter(l=>l.id!==myLayer?.id&&l.typed_notes).map(l=>
        <div key={l.id} className="mt-3 rounded-2xl bg-[#EAF1EC] dark:bg-[#26362F] p-3">
          <p className="text-xs font-medium">{l.author_display}・{detail.capabilities.can_contribute?'貢獻者可見':'所有可觀看者可見'}</p>
          <p className="mt-1 text-sm whitespace-pre-wrap">{l.typed_notes}</p></div>)}
      {detail.capabilities.can_contribute&&<div className="mt-4">
        <label htmlFor="shared-note" className="text-sm font-medium">我的共用筆記・貢獻者可見
          {detail.collection.show_shared_notes?'，所有觀看者也可見':''}</label>
        <textarea id="shared-note" value={note} onChange={e=>{setNote(e.target.value);persistDraft('note',e.target.value);}}
          rows={4} maxLength={65536} className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3 text-sm"/>
        <button disabled={saving} onClick={()=>void saveNotes()}
          className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm text-white disabled:opacity-50">儲存共用筆記</button>
      </div>}
      {!detail.capabilities.can_contribute&&!detail.layers.some(l=>l.typed_notes)&&
        <p className="mt-3 text-sm text-text-muted">目前沒有可觀看的共用筆記。</p>}
    </section>
    {detail.capabilities.can_contribute&&<FloatingPenToolbar/>}
  </div>;
}
