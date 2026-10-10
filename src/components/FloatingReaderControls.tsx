import { useEffect, useId, useRef, type ReactNode } from 'react';
import { SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { BackButton } from './ReaderNavigation';

export function FloatingReaderControls({title, summary, open, onOpenChange, activeFilters, children}: {
  title: string;
  summary: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeFilters: boolean;
  children: ReactNode;
}) {
  const panelId=useId();
  const root=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{
      if(event.target instanceof Node&&!root.current?.contains(event.target))onOpenChange(false);
    };
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onOpenChange(false);trigger.current?.focus();}
    };
    document.addEventListener('pointerdown',outside);
    document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open,onOpenChange]);
  return <div ref={root} className="sticky top-0 z-30 shrink-0 rounded-2xl border border-border-subtle bg-surface px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1">
        <h1 className="text-base font-semibold sm:text-xl">{title}</h1>
        <p title={summary} className="truncate text-xs text-text-muted">{summary}</p>
      </div>
      {children&&<button ref={trigger} type="button" aria-label="搜尋與篩選" aria-expanded={open} aria-controls={panelId}
        onClick={()=>onOpenChange(!open)} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs ${open||activeFilters?'bg-primary/10 text-primary':'bg-page-bg text-text-main'}`}>
        <SlidersHorizontal aria-hidden="true" size={16}/><span>搜尋／篩選</span>
        {activeFilters&&<span aria-label="已套用搜尋或篩選" className="h-1.5 w-1.5 rounded-full bg-primary"/>}
        {open?<ChevronUp aria-hidden="true" size={14}/>:<ChevronDown aria-hidden="true" size={14}/>}
      </button>}
      <BackButton/>
    </div>
    {children&&<section id={panelId} aria-label="題目閱讀選項" hidden={!open}
      className="absolute inset-x-0 top-full mt-2 max-h-[calc(100dvh-14rem)] overflow-y-auto overscroll-contain rounded-2xl border border-border-subtle bg-surface p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)] sm:left-auto sm:w-96">
      {children}
      <div className="mt-4 flex justify-end border-t border-border-subtle pt-3">
        <button type="button" onClick={()=>{onOpenChange(false);trigger.current?.focus();}} className="min-h-11 rounded-xl bg-page-bg px-4 py-2 text-sm">收合</button>
      </div>
    </section>}
  </div>;
}
