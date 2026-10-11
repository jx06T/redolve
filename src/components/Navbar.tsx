import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PenTool, Upload, Moon, Sun, Menu, Command } from 'lucide-react';
import { useStore } from '../store/useStore';
import { isGuestUser } from '../utils/guest';
import { HEADER_NAV_LINKS, SHOW_SHORTCUTS_EVENT } from '../config/constants';
import { lastStudyUrl, searchUrl } from '../services/navigationState';
import { UploadModal } from './UploadModal';
import { AuthModal } from './AuthModal';
import { ShortcutsModal } from './ShortcutsModal';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
export function Navbar() {
  const location = useLocation(); const navigate = useNavigate(); const [menu, setMenu] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const { currentUser, darkMode, toggleDarkMode, uploadModalOpen, setUploadModalOpen, setAuthModalOpen,
    setInPageSearchQuery, clearInPageMatches } = useStore();
  const study = location.pathname.startsWith('/study'); const account = currentUser?.id || 'guest';
  useKeyboardShortcuts({ onToggleShortcutsModal: () => setShortcuts(v => !v) });
  useEffect(() => {
    const open = () => setShortcuts(true);
    window.addEventListener(SHOW_SHORTCUTS_EVENT, open);
    return () => window.removeEventListener(SHOW_SHORTCUTS_EVENT, open);
  }, []);
  useEffect(() => { setMenu(false); clearInPageMatches(); setInPageSearchQuery(''); }, [location.pathname, location.search, clearInPageMatches, setInPageSearchQuery]);
  const links = <>{HEADER_NAV_LINKS.map(l => {
    const Icon = l.icon; const active = l.path === '/' ? location.pathname === '/' : location.pathname.startsWith(l.path);
    return <Link key={l.path} to={l.path === '/study' ? lastStudyUrl(account) : l.path === '/search' ? searchUrl(account, study ? location.search : undefined) : l.path} aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-3 text-xs md:px-2 lg:px-3 ${active ? 'bg-primary/10 text-primary' : 'text-text-main'}`}><Icon size={16} /><span>{l.label}</span></Link>;
  })}</>;
  return <>
    <header style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }} className="z-30 shrink-0 border-b border-border-subtle bg-surface px-2 pb-3 sm:px-3">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-1 sm:gap-2">
        <div className="flex shrink-0 items-center gap-1 sm:gap-2"><button aria-label="開啟導覽選單" aria-expanded={menu} aria-controls="header-mobile-navigation" onClick={() => setMenu(v => !v)} className="lg:hidden rounded-xl p-1.5 sm:p-2"><Menu size={20} /></button>
          <span onClick={() => setTimeout(() => window.location.reload(), 200)} onDoubleClick={() => navigate(lastStudyUrl(account))}
            title="重新整理 (雙擊前往刷題)" className="flex cursor-pointer select-none items-center gap-1.5 font-semibold sm:gap-2"><span className="shrink-0 rounded-2xl bg-primary/10 p-2 text-primary sm:p-2.5"><PenTool size={20} /></span><span className="flex flex-col whitespace-nowrap leading-none"><span className="text-base sm:text-lg">Redolve</span><span className="mt-[-0.35rem] text-[0.7rem] font-normal text-text-muted">redo &amp; solve</span></span></span></div>
        <nav aria-label="主要導覽" className="hidden lg:flex gap-1">{links}</nav>
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <button onClick={() => setShortcuts(true)} title="快捷鍵" className="hidden lg:block rounded-xl border border-border-subtle p-2"><Command size={16} /></button>
          <button onClick={() => setUploadModalOpen(true)} title="上傳錯題" className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-2 py-2 text-xs text-white sm:px-3" aria-label="批次上傳題目"><Upload size={16} /><span className="hidden sm:inline">上傳</span></button>
          <button onClick={toggleDarkMode} title="切換深淺色模式" className="shrink-0 rounded-xl border border-border-subtle p-2">{darkMode ? <Sun size={16} /> : <Moon size={16} />}</button>
          <button aria-label={isGuestUser(currentUser) ? '登入' : '開啟帳號資訊'} onClick={() => setAuthModalOpen(true)} className={`min-w-0 max-w-16 truncate rounded-xl px-2 py-2 text-xs sm:px-3 lg:max-w-24 ${isGuestUser(currentUser) ? 'bg-primary/10 text-primary' : 'border border-border-subtle'}`}>{isGuestUser(currentUser) ? '登入' : currentUser!.name || '帳號'}</button>
        </div>
      </div>
      {menu && <nav id="header-mobile-navigation" aria-label="行動導覽" className="mt-3 flex flex-wrap gap-1 lg:hidden">{links}</nav>}
    </header>
    <UploadModal isOpen={uploadModalOpen} onClose={() => setUploadModalOpen(false)} onUploadSuccess={() => {
      useStore.getState().setProblems([], null); navigate('/study?source=owned'); window.dispatchEvent(new Event('redolve:library-refresh'));
    }} />
    <ShortcutsModal isOpen={shortcuts} onClose={() => setShortcuts(false)} /><AuthModal />
  </>;
}
