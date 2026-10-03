import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DrawCanvas } from '../components/DrawCanvas';
import { PersonalTopicSelect } from '../components/PersonalTopicSelect';
import { FloatingPenToolbar } from '../components/FloatingPenToolbar';
import { useStore } from '../store/useStore';
import { API_BASE } from '../services/api';
import { savedImageUrl, sharingApi, type SavedDetail } from '../services/sharingApi';
import type { DrawData } from '../types';

const blank:DrawData={strokes:[],eraserMasks:[]};
export function SavedDetailView(){
  const {id=''}=useParams();
  const {currentUser,tool,penColor,penWidth,eraserActive,showToast}=useStore();
  const [data,setData]=useState<SavedDetail|null>(null);
  const [ownDraw,setOwnDraw]=useState<DrawData>(blank);
  const [sourceDraws,setSourceDraws]=useState<Record<string,DrawData>>({});
  const [note,setNote]=useState('');
  const [personalTopic,setPersonalTopic]=useState('');
  const [height,setHeight]=useState(420);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const drawSeq=useRef(0),notesSeq=useRef(0);
  const pending=useRef<DrawData|null>(null),writing=useRef(false),conflict=useRef(false);
  const draftKey=currentUser?`rdv:saved:${currentUser.id}:${id}`:'';
  const drawDraftKey=`${draftKey}:draw`,noteDraftKey=`${draftKey}:note`;
  const load=async()=>{
    const d=await sharingApi<SavedDetail>(`/saved/${id}`);
    setData(d);setNote(d.workspace.typed_notes||'');setPersonalTopic(d.saved.personal_topic_id||'');
    drawSeq.current=d.workspace.draw_seq;notesSeq.current=d.workspace.notes_seq;
    const fetched:Record<string,DrawData>={};
    await Promise.all(d.layers.filter(l=>l.draw_asset_id).map(async l=>{
      try{
        const r=await fetch(`${API_BASE}/saved/${id}/layers/${l.layer_origin_key}/draw`,
          {credentials:'include',cache:'no-store'});
        if(r.ok)fetched[l.layer_origin_key]=await r.json() as DrawData;
      }catch{}
    }));
    setSourceDraws(fetched);
    if(d.workspace.draw_asset_id){
      try{
        const r=await fetch(`${API_BASE}/saved/${id}/workspace/draw`,
          {credentials:'include',cache:'no-store'});
        if(r.ok)setOwnDraw(await r.json() as DrawData);
      }catch{}
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
      const savedDraw=localStorage.getItem(drawDraftKey);
      const savedNote=localStorage.getItem(noteDraftKey);
      if(savedDraw||parsed.draw)setOwnDraw(savedDraw?JSON.parse(savedDraw) as DrawData:parsed.draw!);
      if(savedNote!==null||parsed.note!==undefined)setNote(savedNote!==null?savedNote:parsed.note!);
      setError(savedDraw||savedNote!==null||legacy?
        '這台裝置保留了尚未同步的個人草稿，請檢查後再儲存。':'');
    }catch{}
  };
  useEffect(()=>{void load().catch(e=>setError(e.message));},[id,currentUser?.id]);
  const draft=(kind:'draw'|'note',value:DrawData|string)=>{
    try{if(draftKey)localStorage.setItem(kind==='draw'?drawDraftKey:noteDraftKey,
      kind==='draw'?JSON.stringify(value):value as string);}catch{}
  };
  const saveDraw=(draw:DrawData)=>{
    setOwnDraw(draw);pending.current=draw;draft('draw',draw);
    if(writing.current||conflict.current)return;
    writing.current=true;setBusy(true);
    void (async()=>{
      try{
        while(pending.current&&!conflict.current){
          const next=pending.current;pending.current=null;
          try{
            const r=await sharingApi<{draw_seq:number}>(`/saved/${id}/workspace/draw`,'PUT',
              {draw_data:next,expected_seq:drawSeq.current});
            drawSeq.current=r.draw_seq;
          }catch(e){pending.current=next;conflict.current=true;
            setError(e instanceof Error?e.message:'筆跡儲存失敗，草稿已保留');}
        }
        if(!conflict.current)try{localStorage.removeItem(drawDraftKey);}catch{}
      }finally{writing.current=false;setBusy(false);}
    })();
  };
  const saveNote=async()=>{
    draft('note',note);setBusy(true);
    try{
      const r=await sharingApi<{notes_seq:number}>(`/saved/${id}/workspace/notes`,'PUT',
        {typed_notes:note,expected_seq:notesSeq.current});
      notesSeq.current=r.notes_seq;
      try{localStorage.removeItem(noteDraftKey);}catch{}
      showToast('個人筆記已儲存','success');
    }catch(e){setError(e instanceof Error?e.message:'筆記儲存失敗，草稿已保留');}
    finally{setBusy(false);}
  };
  const refresh=async()=>{
    setBusy(true);setError('');
    try{
      await sharingApi(`/saved/${id}/refresh-source`,'POST',{});
      await load();showToast('來源內容已更新；自己的訂正與分類保留','success');
    }catch(e){setError(e instanceof Error?e.message:'無法更新來源，原本已存內容仍保留');}
    finally{setBusy(false);}
  };
  const setStatus=async(status:string)=>{
    if(!data)return;
    try{
      const r=await sharingApi<{row_version:number}>(`/saved/${id}`,'PATCH',
        {status,expected_version:data.saved.row_version});
      setData({...data,saved:{...data.saved,status,row_version:r.row_version}});
    }catch(e){setError(e instanceof Error?e.message:'狀態更新失敗');}
  };
  const setTopic=async(topic:string)=>{
    if(!data)return;
    setPersonalTopic(topic);
    try{
      const r=await sharingApi<{row_version:number}>(`/saved/${id}`,'PATCH',
        {personal_topic_id:topic||null,expected_version:data.saved.row_version});
      setData({...data,saved:{...data.saved,personal_topic_id:topic||null,row_version:r.row_version}});
    }catch(e){setError(e instanceof Error?e.message:'分類更新失敗');
      setPersonalTopic(data.saved.personal_topic_id||'');}
  };
  if(!data)return <p className="p-6">{error||'載入個人題目中…'}</p>;
  return <div className="max-w-4xl mx-auto pb-16">
    <header className="rounded-3xl border border-border-subtle bg-surface p-5">
      <p className="text-xs text-primary">我的題庫・存自〔{data.snapshot.collection_title}〕</p>
      <h1 className="mt-1 text-xl font-semibold">{data.snapshot.source_title}</h1>
      <p className="mt-1 text-sm text-text-muted">{data.snapshot.provider_public_name}・
        {data.snapshot.source_topic_label||'來源未分類'}</p>
      {!data.source.available&&<p className="mt-2 text-sm text-amber-700">
        來源已停止共用・你存入的題目、圖片及個人訂正仍保留。</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/saved" className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">返回我的已存題目</Link>
        <button disabled={busy||!data.source.available} onClick={()=>void refresh()}
          className="rounded-xl bg-[#EAF1EC] px-3 py-2 text-sm text-[#376654] disabled:opacity-40">更新來源內容</button>
        <button type="button" onClick={()=>showToast('已保留目前已存內容','info')}
          className="rounded-xl border border-border-subtle px-3 py-2 text-sm">保留目前已存內容</button>
        <a href={savedImageUrl(id)} download className="rounded-xl border border-border-subtle px-3 py-2 text-sm">下載圖片</a>
      </div>
      <p className="mt-2 text-xs text-text-muted">更新只替換來源題目與參考層；自己的筆跡、筆記、分類和訂正狀態保留。</p>
    </header>
    {error&&<p role="alert" className="my-3 text-sm text-rose-600">{error}</p>}
    {conflict.current&&<button onClick={()=>{conflict.current=false;void load().catch(e=>setError(e.message));}}
      className="mb-3 rounded-xl border border-border-subtle px-3 py-2 text-sm">取得最新版本並保留本機草稿</button>}
    <div className="mt-4 rounded-3xl border border-border-subtle bg-surface p-4">
      <h2 className="mb-2 font-medium">我的訂正</h2>
      <div className="relative overflow-hidden rounded-2xl border border-border-subtle bg-neutral-50 dark:bg-[#202023]"
        style={{height:height+400}}>
        <img src={savedImageUrl(id)} alt="已存題目原圖" onLoad={e=>setHeight(e.currentTarget.getBoundingClientRect().height)}
          className="absolute top-0 left-0 w-full h-auto pointer-events-none select-none"/>
        <div className="absolute bottom-0 left-0 right-0 h-[400px] border-t border-dashed border-border-subtle
          bg-[radial-gradient(#9CA3AF_1.2px,transparent_1.2px)] [background-size:18px_18px] opacity-30"/>
        {data.layers.filter(l=>sourceDraws[l.layer_origin_key]).map(l=>
          <div key={l.layer_origin_key} className="absolute inset-0 pointer-events-none">
            <DrawCanvas initialDrawData={sourceDraws[l.layer_origin_key]} readOnly inkVisible calcSpaceHeight={400}/></div>)}
        <div className="absolute inset-0">
          <DrawCanvas initialDrawData={ownDraw} onSaveDrawData={saveDraw} calcSpaceHeight={400}
            activeTool={tool} activeColor={penColor} activeWidth={penWidth}
            isEraserActive={eraserActive} inkVisible/></div>
      </div>
      <p className="mt-2 text-xs text-text-muted">來源筆跡唯讀；目前筆跡只存入你的個人作業。{busy?'儲存中…':''}</p>
    </div>
    <section className="mt-4 rounded-3xl border border-border-subtle bg-surface p-5">
      <h2 className="font-medium">來源參考筆記</h2>
      {data.layers.filter(l=>l.typed_notes).map(l=>
        <div key={l.layer_origin_key} className="mt-2 rounded-2xl bg-[#EAF1EC] dark:bg-[#26362F] p-3">
          <p className="text-xs">{l.author_display}・取得時保存的唯讀內容</p>
          <p className="mt-1 text-sm whitespace-pre-wrap">{l.typed_notes}</p></div>)}
      {!data.layers.some(l=>l.typed_notes)&&<p className="mt-2 text-sm text-text-muted">沒有保存的來源筆記。</p>}
      <label htmlFor="saved-note" className="mt-5 block text-sm font-medium">我的個人筆記・僅自己</label>
      <textarea id="saved-note" value={note} onChange={e=>{setNote(e.target.value);draft('note',e.target.value);}}
        rows={4} className="mt-2 w-full rounded-xl border border-border-subtle bg-page-bg p-3 text-sm"/>
      <button disabled={busy} onClick={()=>void saveNote()}
        className="mt-2 rounded-xl bg-primary px-4 py-2 text-sm text-white disabled:opacity-40">儲存個人筆記</button>
      <label htmlFor="saved-topic" className="mt-5 mb-2 block text-sm font-medium">我的科目與單元</label>
      <PersonalTopicSelect id="saved-topic" value={personalTopic} onChange={v=>void setTopic(v)} disabled={busy}/>
      <label className="mt-5 block text-sm">訂正狀態
        <select value={data.saved.status} onChange={e=>void setStatus(e.target.value)}
          className="ml-2 rounded-xl border border-border-subtle bg-page-bg px-3 py-2">
          <option value="unsolved">待訂正</option><option value="resolved">已訂正</option>
          <option value="archived">已封存</option></select></label>
    </section>
    <FloatingPenToolbar/>
  </div>;
}
