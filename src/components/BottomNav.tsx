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
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 2px)' }}
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border-subtle flex items-center justify-around pt-1 px-1 shadow-lg"
    >
      {/* 1. Dashboard */}
      <Link
        to="/"
        className={`flex flex-col items-center justify-center py-0.5 px-2.5 rounded-xl transition-all ${
          isHomeRoute ? 'text-primary font-bold' : 'text-text-muted hover:text-text-main'
        }`}
      >
        <LayoutDashboard className="w-4.5 h-4.5" />
        <span className="text-[9.5px] mt-0.5 font-medium leading-none">首頁</span>
      </Link>

      {/* 2. Study Review */}
      <Link
        to={`/study/${currentSubject}`}
        className={`flex flex-col items-center justify-center py-0.5 px-2.5 rounded-xl transition-all ${
          isStudyRoute && !mobileDrawerOpen ? 'text-primary font-bold' : 'text-text-muted hover:text-text-main'
        }`}
      >
        <BookOpen className="w-4.5 h-4.5" />
        <span className="text-[9.5px] mt-0.5 font-medium leading-none">刷題</span>
      </Link>

      {/* 3. Upload Problem CTA */}
      <button
        type="button"
        onClick={() => setUploadModalOpen(true)}
        className="flex flex-col items-center justify-center p-1 rounded-full text-white bg-primary active:scale-95 shadow-md -mt-2.5 ring-4 ring-page-bg transition-transform"
        title="上傳錯題"
      >
        <PlusCircle className="w-5.5 h-5.5" />
      </button>

      {/* 4. Chapter Outline Drawer */}
      <button
        type="button"
        onClick={() => {
          if (!isStudyRoute) {
            navigate(`/study/${currentSubject}`);
          }
          setMobileDrawerOpen(!mobileDrawerOpen);
        }}
        className={`flex flex-col items-center justify-center py-0.5 px-2.5 rounded-xl transition-all ${
          mobileDrawerOpen ? 'text-primary font-bold' : 'text-text-muted hover:text-text-main'
        }`}
      >
        <Layers className="w-4.5 h-4.5" />
        <span className="text-[9.5px] font-medium mt-0.5 leading-none">章節</span>
      </button>

      {/* 5. Search */}
      <Link
        to="/search"
        className={`flex flex-col items-center justify-center py-0.5 px-2.5 rounded-xl transition-all ${
          isSearchRoute ? 'text-primary font-bold' : 'text-text-muted hover:text-text-main'
        }`}
      >
        <Search className="w-4.5 h-4.5" />
        <span className="text-[9.5px] font-medium mt-0.5 leading-none">搜尋</span>
      </Link>
    </div>
  );
};
