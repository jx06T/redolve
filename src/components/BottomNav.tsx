import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Layers, PlusCircle, Search } from 'lucide-react';
import { useStore } from '../store/useStore';

export const BottomNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    selectedSubjectId,
    setUploadModalOpen,
    mobileDrawerOpen,
    setMobileDrawerOpen,
  } = useStore();

  const currentSubject = selectedSubjectId || 'math';
  const isStudyRoute = location.pathname.startsWith('/study');
  const isHomeRoute = location.pathname === '/';
  const isSearchRoute = location.pathname.startsWith('/search');

  return (
    <div
      // style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      // style={{ paddingBottom: '0px' }}
      className="md:hidden fixed py-2 bottom-0 left-0 right-0 z-40 bg-surface border-t border-border-subtle flex items-center justify-around py-1 px-1 shadow-lg"
    >
      {/* 1. Left: 首頁 */}
      <Link
        to="/"
        className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${isHomeRoute ? 'text-primary font-bold' : 'text-text-muted hover:text-text-main'
          }`}
      >
        <LayoutDashboard className="w-4.5 h-4.5" />
        <span className="text-[9.5px] mt-0.5 font-medium leading-none">首頁</span>
      </Link>

      {/* 2. Left: 章節 (Toggles Sidebar Drawer) */}
      <button
        type="button"
        onClick={() => {
          if (!isStudyRoute) {
            navigate(`/study/${currentSubject}`);
            setMobileDrawerOpen(true);
          } else {
            setMobileDrawerOpen(!mobileDrawerOpen);
          }
        }}
        className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${mobileDrawerOpen ? 'text-primary font-bold' : 'text-text-muted hover:text-text-main'
          }`}
      >
        <Layers className="w-4.5 h-4.5" />
        <span className="text-[9.5px] font-medium mt-0.5 leading-none">章節</span>
      </button>

      {/* 3. Center: 刷題 (Primary Action) */}
      <Link
        to={`/study/${currentSubject}`}
        className={`flex flex-col items-center justify-center py-1 px-4 rounded-2xl transition-all ${isStudyRoute && !mobileDrawerOpen
          ? 'bg-primary text-white font-bold shadow-xs'
          : 'bg-primary/10 text-primary font-semibold hover:bg-primary/20'
          }`}
      >
        <BookOpen className="w-4.5 h-4.5" />
        <span className="text-[10px] mt-0.5 leading-none">刷題</span>
      </Link>

      {/* 4. Right: 搜尋 */}
      <Link
        to="/search"
        className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${isSearchRoute ? 'text-primary font-bold' : 'text-text-muted hover:text-text-main'
          }`}
      >
        <Search className="w-4.5 h-4.5" />
        <span className="text-[9.5px] font-medium mt-0.5 leading-none">搜尋</span>
      </Link>

      {/* 5. Right: 上傳 */}
      <button
        type="button"
        onClick={() => setUploadModalOpen(true)}
        className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-text-muted hover:text-text-main transition-all"
        title="上傳錯題"
      >
        <PlusCircle className="w-4.5 h-4.5" />
        <span className="text-[9.5px] font-medium mt-0.5 leading-none">上傳</span>
      </button>
    </div>
  );
};
