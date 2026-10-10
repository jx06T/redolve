import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
export function AppDialog({title,children,onClose,busy=false}:{title:string;children:ReactNode;onClose:()=>void;busy?:boolean}) {
  const id=useId();const root=useRef<HTMLDivElement>(null);const close=useRef(onClose);close.current=onClose;
  const waiting=useRef(busy);waiting.current=busy;
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const el=root.current;el?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'&&!waiting.current){e.preventDefault();close.current();}
      if(e.key==='Tab'&&el){
        const controls=Array.from(el.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]:not(:disabled)'));
        const first=controls[0],last=controls.at(-1);
        if(!first){e.preventDefault();el.focus();}
        else if(e.shiftKey&&(document.activeElement===first||document.activeElement===el)){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',key);return ()=>{document.removeEventListener('keydown',key);previous?.focus();};
  },[]);
  return createPortal(<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4"
    onClick={()=>{if(!busy)onClose();}}>
    <div ref={root} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}
      onClick={e=>e.stopPropagation()} className="max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-3xl border border-border-subtle bg-surface p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
      <div className="mb-4 flex items-center justify-between gap-4"><h2 id={id} className="font-semibold">{title}</h2>
        <button type="button" aria-label="關閉對話框" disabled={busy} onClick={onClose} className="rounded-xl p-2"><X size={18}/></button></div>
      {children}
    </div>
  </div>,document.body);
}
