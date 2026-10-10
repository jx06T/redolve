import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { readSource, rememberSearch, rememberStudy, sourceLabels, sourceUrl } from '../services/navigationState';
import { BackButton } from './ReaderNavigation';

export function StudySources({floating=false}:{floating?:boolean}) {
  const location=useLocation();const account=useStore(s=>s.currentUser?.id||'guest');
  const source=readSource(new URLSearchParams(location.search).get('source'));
  const path=location.pathname.startsWith('/search')?'/search':'/study';
  useEffect(()=>{
    if(path==='/study')rememberStudy(account,location.pathname+location.search+location.hash,source);
    else rememberSearch(account,location.pathname+location.search,source);
  },[account,path,location.pathname,location.search,location.hash,source]);
  return <div className={floating?'absolute top-0 right-0 z-30 flex items-center gap-1 rounded-2xl border border-border-subtle bg-surface/95 p-1 shadow-xs':'mb-4 flex flex-wrap items-center justify-between gap-3'}>
    <div role="group" aria-label="題目來源" className="flex rounded-2xl border border-border-subtle bg-surface p-1">
      {(Object.keys(sourceLabels) as (keyof typeof sourceLabels)[]).map(value=><Link key={value}
        aria-current={value===source?'page':undefined} to={sourceUrl(account,value,path)}
        className={`rounded-xl ${floating?'px-2 py-2 text-xs':'px-4 py-2 text-sm'} transition-colors ${source===value?
          value==='saved'?'bg-[#EAF1EC] text-[#376654] dark:bg-[#26362F] dark:text-[#A9C7B6]':'bg-primary/10 text-primary':'text-text-muted'}`}>
        {sourceLabels[value]}</Link>)}
    </div><BackButton/>
  </div>;
}
