import { Link, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAV_LINKS } from '../config/constants';
import { useStore } from '../store/useStore';
import { lastStudyUrl, searchUrl } from '../services/navigationState';
export function BottomNav() {
  const location=useLocation();const account=useStore(s=>s.currentUser?.id||'guest');
  const {mobileDrawerOpen,setMobileDrawerOpen}=useStore();
  return <nav aria-label="主要導覽" className="md:hidden fixed bottom-0 left-0 right-0 z-40 grid h-16 grid-cols-5 gap-1 border-t border-border-subtle bg-surface px-1 py-2 shadow-lg">
    {NAV_LINKS.map(l=>{const Icon=l.icon;const active=l.path==='/'?location.pathname==='/':location.pathname.startsWith(l.path);
      const style=`flex min-w-0 flex-col items-center justify-center rounded-xl py-1 ${active?'bg-primary/10 text-primary':'text-text-muted'}`;
      if(l.path==='/study'&&active){
        const SidebarIcon=mobileDrawerOpen?PanelLeftClose:PanelLeftOpen;
        return <button key={l.path} type="button" aria-current="page" aria-label={mobileDrawerOpen?'關閉刷題側邊欄':'開啟刷題側邊欄'} aria-expanded={mobileDrawerOpen} aria-controls="study-mobile-sidebar" onClick={()=>setMobileDrawerOpen(!mobileDrawerOpen)} className={style}><SidebarIcon aria-hidden="true" className="h-4.5 w-4.5"/><span className="mt-1 text-[10px]">{mobileDrawerOpen?'關閉側欄':'開啟側欄'}</span></button>;
      }
      return <Link key={l.path} onClick={()=>setMobileDrawerOpen(false)} to={l.path==='/study'?lastStudyUrl(account):l.path==='/search'?searchUrl(account,location.pathname.startsWith('/study')?location.search:undefined):l.path} aria-current={active?'page':undefined}
        className={style}>
        <Icon className="h-4.5 w-4.5"/><span className="mt-1 text-[10px]">{l.label}</span></Link>;})}
  </nav>;
}
