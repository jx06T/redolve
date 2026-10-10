import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PenTool, Search, Upload, Moon, Sun, Menu, ChevronUp, ChevronDown, Command } from 'lucide-react';
import { useStore } from '../store/useStore';
import { NAV_LINKS } from '../config/constants';
import { lastStudyUrl, searchUrl } from '../services/navigationState';
import { UploadModal } from './UploadModal';
import { AuthModal } from './AuthModal';
import { ShortcutsModal } from './ShortcutsModal';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
export function Navbar() {
  const location=useLocation();const navigate=useNavigate();const [menu,setMenu]=useState(false);
  const [shortcuts,setShortcuts]=useState(false);const [find,setFind]=useState(false);
  const {currentUser,darkMode,toggleDarkMode,uploadModalOpen,setUploadModalOpen,setAuthModalOpen,
    inPageSearchQuery,setInPageSearchQuery,inPageMatches,inPageCurrentIndex,nextInPageMatch,prevInPageMatch,clearInPageMatches}=useStore();
  const study=location.pathname.startsWith('/study');const account=currentUser?.id||'guest';
  useKeyboardShortcuts({onToggleShortcutsModal:()=>setShortcuts(v=>!v)});
  useEffect(()=>{setMenu(false);setFind(false);clearInPageMatches();setInPageSearchQuery('');},[location.pathname,location.search,clearInPageMatches,setInPageSearchQuery]);
  const links=<>{NAV_LINKS.map(l=>{const Icon=l.icon;const active=l.path==='/'?location.pathname==='/':location.pathname.startsWith(l.path);
    return <Link key={l.path} to={l.path==='/study'?lastStudyUrl(account):l.path==='/search'?searchUrl(account,study?location.search:undefined):l.path} aria-current={active?'page':undefined}
      className={`flex items-center gap-1.5 rounded-xl px-3 py-3 text-xs ${active?'bg-primary/10 text-primary':'text-text-main'}`}><Icon size={16}/><span>{l.label}</span></Link>;})}</>;
  const searchBox=<div className="flex items-center gap-1 rounded-xl border border-border-subtle bg-page-bg px-2">
    <Search size={14}/><input aria-label="在已載入題目中尋找" value={inPageSearchQuery} onChange={e=>setInPageSearchQuery(e.target.value)}
      onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.shiftKey?prevInPageMatch():nextInPageMatch();}}}
      placeholder="在已載入題目中尋找" className="w-32 bg-transparent py-2 text-xs outline-none"/>
    {inPageSearchQuery&&<><span className="text-[10px]">{inPageMatches.length?inPageCurrentIndex+1:0}/{inPageMatches.length}</span>
      <button onClick={prevInPageMatch} aria-label="上一個符合項目"><ChevronUp size={15}/></button><button onClick={nextInPageMatch} aria-label="下一個符合項目"><ChevronDown size={15}/></button></>}
  </div>;
  return <>
    <header style={{paddingTop:'calc(env(safe-area-inset-top, 0px) + 0.5rem)'}} className="z-30 shrink-0 border-b border-border-subtle bg-surface px-3 pb-3">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-2">
        <div className="flex items-center gap-2"><button aria-label="開啟導覽選單" aria-expanded={menu} onClick={()=>setMenu(v=>!v)} className="md:hidden rounded-xl p-2"><Menu size={20}/></button>
          <span onClick={()=>setTimeout(()=>window.location.reload(),200)} onDoubleClick={()=>navigate(lastStudyUrl(account))}
            title="重新整理 (雙擊前往刷題)" className="flex cursor-pointer select-none items-center gap-2 font-semibold"><span className="rounded-2xl bg-primary/10 p-2.5 text-primary"><PenTool size={20}/></span><span className="hidden sm:inline">Redolve</span></span></div>
        <nav aria-label="主要導覽" className="hidden md:flex gap-1">{links}</nav>
        <div className="flex items-center gap-2">
          {study&&<><div className="hidden xl:block">{searchBox}</div><button onClick={()=>setFind(v=>!v)} aria-label="在已載入題目中尋找" className="xl:hidden rounded-xl border border-border-subtle p-2"><Search size={16}/></button></>}
          <button onClick={()=>setShortcuts(true)} title="快捷鍵" className="hidden lg:block rounded-xl border border-border-subtle p-2"><Command size={16}/></button>
          <button onClick={()=>setUploadModalOpen(true)} title="上傳錯題" className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs text-white" aria-label="批次上傳題目"><Upload size={16}/><span className="hidden sm:inline">上傳</span></button>
          <button onClick={toggleDarkMode} title="切換深淺色模式" className="rounded-xl border border-border-subtle p-2">{darkMode?<Sun size={16}/>:<Moon size={16}/>}</button>
          <button onClick={()=>setAuthModalOpen(true)} className="max-w-24 truncate rounded-xl border border-border-subtle px-3 py-2 text-xs">{currentUser?(currentUser.name||'帳號'):'登入 / 訪客'}</button>
        </div>
      </div>
      {study&&find&&<div className="mt-3 xl:hidden">{searchBox}</div>}
      {menu&&<nav aria-label="行動導覽" className="mt-3 flex flex-wrap gap-1 md:hidden">{links}</nav>}
    </header>
    <UploadModal isOpen={uploadModalOpen} onClose={()=>setUploadModalOpen(false)} onUploadSuccess={()=>{
      useStore.getState().setProblems([],null);navigate('/study?source=owned');window.dispatchEvent(new Event('redolve:library-refresh'));
    }}/>
    <ShortcutsModal isOpen={shortcuts} onClose={()=>setShortcuts(false)}/><AuthModal/>
  </>;
}
