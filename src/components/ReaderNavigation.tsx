import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useStore } from '../store/useStore';
import { readScroll, rememberScroll, readerLocationKey } from '../services/navigationState';

export function BackButton({fallback='/'}:{fallback?:string}) {
  const navigate=useNavigate();
  return <button type="button" onClick={()=>{
    if(Number(window.history.state?.idx)>0)navigate(-1);else navigate(fallback,{replace:true});
  }} className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2 text-xs">
    <ArrowLeft size={14}/>返回</button>;
}
export function ReaderNavigation() {
  const location=useLocation();const account=useStore(s=>s.currentUser?.id||'guest');
  const key=readerLocationKey(location);const saved=useRef({account,key});
  useEffect(()=>{
    saved.current={account,key};
    const main=document.querySelector<HTMLElement>('main');
    if(main)main.scrollTop=readScroll(account,`${key}:main`);
    const track=(e:Event)=>{
      const target=e.target;
      if(target instanceof HTMLElement&&target.tagName==='MAIN')
        rememberScroll(saved.current.account,`${saved.current.key}:main`,target.scrollTop);
    };
    document.addEventListener('scroll',track,true);
    return ()=>document.removeEventListener('scroll',track,true);
  },[account,key]);
  return null;
}
