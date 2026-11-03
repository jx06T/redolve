import { useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { useStore } from '../store/useStore';
import { setQuestionStar, starKey, type QuestionStarTarget } from '../services/questionStarService';

export function QuestionStarButton({target,starred,onChanged}:{target:QuestionStarTarget;starred:boolean;onChanged?:(starred:boolean)=>void}){
  const account=useStore(s=>s.currentUser?.id||'guest'),key=starKey(target);
  const [selected,setSelected]=useState(starred),[busy,setBusy]=useState(false);
  const active=useRef('');active.current=account+key;
  useEffect(()=>setSelected(starred),[account,key,starred]);
  useEffect(()=>{
    const update=(event:Event)=>{const detail=(event as CustomEvent<{account:string;key:string;starred:boolean}>).detail;
      if(detail.account===account&&detail.key===key)setSelected(detail.starred);};
    window.addEventListener('redolve:question-star',update);return()=>window.removeEventListener('redolve:question-star',update);
  },[account,key]);
  const toggle=async()=>{
    if(busy)return;setBusy(true);const identity=account+key,next=!selected;
    try{await setQuestionStar(target,next);if(active.current===identity)onChanged?.(next);}
    catch(e){if(active.current===identity)useStore.getState().showToast(e instanceof Error?e.message:'星號更新失敗，請重試','error');}
    finally{if(active.current===identity)setBusy(false);}
  };
  return <button type="button" disabled={busy} aria-pressed={selected} aria-label={selected?'取消星號':'標記星號'} title={selected?'取消星號':'標記星號'} onClick={()=>void toggle()}
    className="p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-neutral-100 active:scale-95 transition-all aria-pressed:text-primary disabled:opacity-40">
    <Star size={16} fill={selected?'currentColor':'none'}/>
  </button>;
}
