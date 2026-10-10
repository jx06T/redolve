import { Link, useLocation } from 'react-router-dom';
import { NAV_LINKS } from '../config/constants';
import { useStore } from '../store/useStore';
import { lastStudyUrl, searchUrl } from '../services/navigationState';
export function BottomNav() {
  const location=useLocation();const account=useStore(s=>s.currentUser?.id||'guest');
  return <nav aria-label="主要導覽" className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-border-subtle bg-surface px-1 py-2 shadow-lg">
    {NAV_LINKS.map(l=>{const Icon=l.icon;const active=l.path==='/'?location.pathname==='/':location.pathname.startsWith(l.path);
      return <Link key={l.path} to={l.path==='/study'?lastStudyUrl(account):l.path==='/search'?searchUrl(account,location.pathname.startsWith('/study')?location.search:undefined):l.path} aria-current={active?'page':undefined}
        className={`flex min-h-10 flex-col items-center justify-center rounded-xl px-2.5 py-1 ${active?'bg-primary/10 text-primary':'text-text-muted'}`}>
        <Icon className="h-4.5 w-4.5"/><span className="mt-1 text-[10px]">{l.label}</span></Link>;})}
  </nav>;
}
