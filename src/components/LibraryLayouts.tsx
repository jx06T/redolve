import type { ReactNode } from 'react';
import { Filter } from 'lucide-react';
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
  return <div className="space-y-4"><StudySources/><header className="rounded-3xl border border-border-subtle bg-surface p-4 space-y-3">
    {query}<div className="flex flex-wrap items-end gap-3">{collection}<label className="block text-xs text-text-muted">檢視方式<select aria-label="搜尋檢視方式" value={view} onChange={e=>onView(e.target.value)} className="mt-2 block min-h-11 rounded-xl border border-border-subtle bg-page-bg px-3 py-3 text-sm"><option value="compact">簡單檢視</option><option value="full">完整檢視</option></select></label></div>
    <details><summary className="cursor-pointer text-sm text-text-muted">篩選</summary><div className="mt-3">{filters}</div></details>
  </header>{notices}{children}</div>;
}
