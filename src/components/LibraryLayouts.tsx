import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { useStore } from '../store/useStore';
import { StudySources } from './StudySources';
import { FloatingPenToolbar } from './FloatingPenToolbar';

export function StudyLibraryLayout({sidebar,notices,children}:{sidebar:ReactNode;notices:ReactNode;children:ReactNode}) {
  return <div className="relative flex h-full min-h-0 gap-4"><StudySources floating/>
    <button type="button" aria-label="開啟章節導航與篩選" onClick={()=>useStore.getState().setMobileDrawerOpen(true)} className="hidden md:block lg:hidden absolute top-0 left-0 z-20 rounded-xl border border-border-subtle bg-surface p-3 text-primary"><Filter size={18}/></button>
    {sidebar}<section className="flex flex-1 min-h-0 min-w-0 flex-col">{notices}<div className="flex-1 min-h-0">{children}</div></section><FloatingPenToolbar/>
  </div>;
}

export function SearchLibraryLayout({query,collection,filters,view,onView,notices,children}:{query:ReactNode;collection:ReactNode;filters:ReactNode;view:string;onView:(value:string)=>void;notices:ReactNode;children:ReactNode}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  return <div className="space-y-4"><StudySources/><header className="rounded-3xl border border-border-subtle bg-surface p-4 space-y-3">
    {query}{collection && <div className="flex flex-wrap items-end gap-3">{collection}</div>}
    <div className="flex items-center justify-between gap-3">
      <button type="button" aria-expanded={filtersOpen} aria-controls={filtersId} onClick={()=>setFiltersOpen(open=>!open)} className="inline-flex min-h-11 items-center gap-1 rounded-xl text-sm text-text-muted">
        {filtersOpen ? <ChevronDown size={14} aria-hidden="true"/> : <ChevronRight size={14} aria-hidden="true"/>}篩選
      </button>
      <div role="group" aria-label="搜尋檢視方式" className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border-subtle bg-page-bg p-1">
        {([{value:'compact',label:'簡單'},{value:'full',label:'詳細'}] as const).map(option=><button key={option.value} type="button" aria-pressed={view===option.value} onClick={()=>onView(option.value)} className={`min-h-11 rounded-xl px-4 py-2 text-sm ${view===option.value?'bg-primary/10 text-primary':'text-text-muted hover:bg-surface'}`}>{option.label}</button>)}
      </div>
    </div>
    <div id={filtersId} hidden={!filtersOpen}>{filters}</div>
  </header>{notices}{children}</div>;
}
