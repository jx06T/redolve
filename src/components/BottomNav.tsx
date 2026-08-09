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
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border-subtle flex items-center justify-around py-1.5 px-2 shadow-lg">
      {/* 1. Dashboard */}
      <Link
        to="/"
        className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all ${
          isHomeRoute ? 'text-primary font-bold' : 'text-text-muted hover:text-text-main'
        }`}
      >
        <LayoutDashboard className="w-5 h-5" />
        <span className="text-[10px] mt-0.5 font-medium">首頁</span>
      </Link>

      {/* 2. Study Review */}
      <Link
        to={`/study/${currentSubject}`}
        className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all ${
          isStudyRoute && !mobileDrawerOpen ? 'text-primary font-bold' : 'text-text-muted hover:text-text-main'
        }`}
      >
        <BookOpen className="w-5 h-5" />
        <span className="text-[10px] mt-0.5 font-medium">刷題</span>
      </Link>

      {/* 3. Upload Problem CTA */}
      <button
        type="button"
        onClick={() => setUploadModalOpen(true)}
        className="flex flex-col items-center justify-center p-1 rounded-full text-white bg-primary active:scale-95 shadow-md -mt-3 ring-4 ring-page-bg transition-transform"
        title="上傳錯題"
      >
        <PlusCircle className="w-6 h-6" />
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
        className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all ${
          mobileDrawerOpen ? 'text-primary font-bold' : 'text-text-muted hover:text-text-main'
        }`}
      >
        <Layers className="w-5 h-5" />
        <span className="text-[10px] font-medium mt-0.5">章節</span>
      </button>

      {/* 5. Search */}
      <Link
        to="/search"
        className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all ${
          isSearchRoute ? 'text-primary font-bold' : 'text-text-muted hover:text-text-main'
        }`}
      >
        <Search className="w-5 h-5" />
        <span className="text-[10px] font-medium mt-0.5">搜尋</span>
      </Link>
    </div>
  );
};
