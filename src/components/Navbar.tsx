import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { PenTool, Search, Moon, Sun, Upload, Menu, X, Command, LogIn } from 'lucide-react';
import { useStore } from '../store/useStore';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';
import { UploadModal } from './UploadModal';
import { ShortcutsModal } from './ShortcutsModal';
import { AuthModal } from './AuthModal';
import { CustomSelect } from './CustomSelect';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { NAV_LINKS } from '../config/constants';
import { fetchCurrentUser } from '../services/api';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileSearchOpen, setMobileSearchOpen] = useState<boolean>(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState<boolean>(false);

  const menuContainerRef = useRef<HTMLDivElement>(null);

  // Global Keyboard Shortcuts Hook
  useKeyboardShortcuts({
    onToggleShortcutsModal: () => setShortcutsModalOpen((prev) => !prev),
  });

  const {
    darkMode,
    toggleDarkMode,
    searchQuery,
    setSearchQuery,
    selectedSubjectId,
    setSelectedSubjectId,
    currentUser,
    setCurrentUser,
    setAuthModalOpen,
    taxonomies,
    loadTaxonomies,
    setProblems,
    uploadModalOpen,
    setUploadModalOpen,
    mobileDrawerOpen: mobileMenuOpen,
    setMobileDrawerOpen: setMobileMenuOpen,
  } = useStore();

  useEffect(() => {
    loadTaxonomies();
    if (!currentUser) {
      fetchCurrentUser()
        .then((res) => {
          if (res?.user) setCurrentUser(res.user);
        })
        .catch((err) => console.error('Failed to load initial user:', err));
    }
  }, [currentUser, setCurrentUser, loadTaxonomies]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
  }, [location.pathname]);

  // Handle click outside and ESC key for mobile drawer
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setMobileSearchOpen(false);
    }
  };

  const handleLogoClick = () => {
    navigate(`/study/${selectedSubjectId || 'math'}`);
  };

  const navLinks = NAV_LINKS;

  return (
    <>
      <header className="sticky top-0 z-30 bg-surface border-b border-border-subtle px-4 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          {/* Brand Logo & Subject Selector */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-2xl text-text-main hover:bg-neutral-100 active:scale-95 transition-all"
              aria-label="選單 Toggle"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <span
              onClick={() => setTimeout(() => {
                window.location.reload()
              }, 200)}
              onDoubleClick={handleLogoClick}
              className="flex items-center space-x-2 text-text-main font-semibold tracking-tight select-none cursor-pointer group"
              title="重新整理 (雙擊前往首頁)"
            >
              <div className="p-2.5 bg-primary/10 group-hover:bg-primary/20 text-primary rounded-2xl transition-all">
                <PenTool className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold leading-none">Redolve</span>
                <span className="text-[10px] text-text-muted mt-0.5">Redo & Solve</span>
              </div>
            </span>

            {/* Subject Selector Dropdown */}
            <div className="hidden sm:flex items-center pl-2 border-l border-border-subtle">
              <CustomSelect
                value={selectedSubjectId || 'math'}
                onChange={(val) => {
                  setSelectedSubjectId(val);
                  navigate(`/study/${val}`);
                }}
                options={[
                  ...(taxonomies && taxonomies.length > 0 ? taxonomies : TAXONOMY_SEED_DATA).map((sub) => ({
                    value: sub.id,
                    label: sub.label,
                  })),
                  { value: 'unclassified', label: '\u2014 其他科目' },
                ]}
              />
            </div>
          </div>

          {/* Desktop/Tablet Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  title={link.label}
                  aria-label={link.label}
                  className={`flex items-center space-x-1.5 px-5 lg:px-4 py-2 rounded-2xl text-xs font-medium transition-colors ${isActive
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-text-main hover:bg-neutral-100'
                    }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="hidden lg:inline leading-[0.875rem]">{link.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Search & Controls */}
          <div className="flex items-center space-x-1.5 sm:space-x-3">
            {/* Desktop Search */}
            <form onSubmit={handleSearchSubmit} className="relative hidden sm:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="搜尋錯題、關鍵字..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-1.5 rounded-2xl text-xs bg-neutral-100 border border-border-subtle text-text-main focus:outline-none focus:border-primary transition-all w-32 md:w-48 xl:w-64"
              />
            </form>

            {/* Mobile Search Toggle Button */}
            <button
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              className="sm:hidden p-1.5 rounded-2xl border border-border-subtle text-text-main hover:bg-neutral-100"
              title="開啟搜尋"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Keyboard Shortcuts Trigger Button */}
            <button
              onClick={() => setShortcutsModalOpen(true)}
              className="hidden lg:flex items-center space-x-1.5 px-3 py-2 rounded-2xl text-xs font-medium border border-border-subtle text-text-main hover:bg-neutral-100 transition-colors"
              title="鍵盤快捷鍵指南 (?)"
            >
              <Command className="w-3.5 h-3.5 text-text-muted" />
              <span className="hidden xl:inline">快捷鍵</span>
            </button>

            {/* Upload Modal Trigger Button */}
            <button
              onClick={() => setUploadModalOpen(true)}
              className="flex items-center justify-center p-2 sm:px-3.5 sm:py-2 rounded-2xl text-xs font-medium bg-primary text-white hover:bg-primary-hover active:scale-[0.98] transition-all shadow-xs"
              title="上傳錯題"
            >
              <Upload className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden md:inline ml-1.5">上傳錯題</span>
            </button>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-1.5 sm:p-2 rounded-2xl border border-border-subtle text-text-main hover:bg-neutral-100 transition-colors"
              title="切換深淺色模式 (Cmd+D)"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Guest Direct Sign-In CTA (Visible when not logged in) */}
            {(!currentUser || !currentUser.id) && (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl bg-primary-50/50 border border-primary-200/60 text-primary hover:bg-primary-100/50 text-xs font-semibold transition-all active:scale-95 shadow-2xs"
                title="登入 Google 帳號以啟用雲端跨裝置同步"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>登入 / 註冊</span>
              </button>
            )}

            {/* User Session & Auth Profile Button */}
            <button
              onClick={() => setAuthModalOpen(true)}
              className="flex items-center space-x-1.5 p-1 sm:px-2.5 sm:py-1.5 rounded-2xl border border-border-subtle bg-neutral-50 hover:bg-neutral-100 text-text-main transition-all"
              title="使用者帳號與身分管理"
            >
              <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[11px] font-bold overflow-hidden shrink-0">
                {currentUser?.image ? (
                  <img src={currentUser.image} alt={currentUser.name || 'User'} className="w-full h-full object-cover" />
                ) : (
                  (!currentUser || !currentUser.id
                    ? '訪'
                    : (currentUser?.name || currentUser?.email || 'U')
                  ).charAt(0).toUpperCase()
                )}
              </div>
              <span className="hidden xl:inline text-xs font-semibold max-w-[90px] truncate">
                {!currentUser || !currentUser.id
                  ? '訪客試用'
                  : currentUser?.name || (currentUser?.email ? currentUser.email.split('@')[0] : '帳號設定')}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile Search Bar Expandable in Header */}
        {mobileSearchOpen && (
          <div className="sm:hidden mt-3 pt-3 border-t border-border-subtle">
            <form onSubmit={handleSearchSubmit} className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="搜尋錯題、關鍵字..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full pl-9 pr-4 py-2 rounded-2xl text-xs bg-neutral-100 border border-border-subtle text-text-main"
              />
            </form>
          </div>
        )}
      </header>

      {/* Floating Mobile Navigation Drawer (Overlay, non-pushing) */}
      {
        mobileMenuOpen && (
          <div
            className="fixed inset-0 top-[61px] z-50 bg-black/60 md:hidden animate-in fade-in duration-150 flex flex-col justify-start"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div
              ref={menuContainerRef}
              onClick={(e) => e.stopPropagation()}
              className="m-3 p-4 bg-surface rounded-3xl border border-border-subtle shadow-2xl space-y-3 animate-in slide-in-from-top-2 duration-200 text-text-main"
            >
              {/* Guest Banner in Mobile Drawer */}
              {(!currentUser || (currentUser.id === 'dev_user_default' && !import.meta.env.DEV)) && (
                <div className="p-3 rounded-2xl bg-primary-50/60 border border-primary-200/60 flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-text-main">訪客試用模式</div>
                    <div className="text-[11px] text-text-muted">登入以同步多裝置資料</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setAuthModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold active:scale-95 shadow-xs shrink-0"
                  >
                    登入 / 註冊
                  </button>
                </div>
              )}

              {/* Mobile Subject Selector using CustomSelect */}
              <div className="px-1 pb-1">
                <label className="block text-[11px] font-bold text-text-muted mb-1.5">目前篩選科目</label>
                <CustomSelect
                  value={selectedSubjectId || 'math'}
                  onChange={(val) => {
                    setSelectedSubjectId(val);
                    setMobileMenuOpen(false);
                    navigate(`/study/${val}`);
                  }}
                  options={[
                    ...(taxonomies && taxonomies.length > 0 ? taxonomies : TAXONOMY_SEED_DATA).map((sub) => ({
                      value: sub.id,
                      label: sub.label,
                    })),
                    { value: 'unclassified', label: '\u2014 其他科目' },
                  ]}
                />
              </div>

              <div className="h-px bg-border-subtle my-1" />

              {/* Navigation Links */}
              <div className="space-y-1">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
                  return (
                    <Link
                      key={link.path}
                      to={link.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-2xl text-xs font-medium transition-colors ${isActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-text-main hover:bg-neutral-100'
                        }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </div>

              {/* Mobile Drawer Upload Action */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setUploadModalOpen(true);
                  }}
                  className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-2xl text-xs font-bold bg-primary text-white hover:bg-primary-hover active:scale-[0.98] transition-all shadow-xs"
                >
                  <Upload className="w-4 h-4" />
                  <span>批次上傳錯題</span>
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Upload Modal Container */}
      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadSuccess={() => {
          setProblems([], null);
          navigate(`/study/${selectedSubjectId || 'math'}`);
        }}
      />

      {/* Shortcuts Guide Modal */}
      <ShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />

      {/* User Session Auth Modal */}
      <AuthModal />
    </>
  );
};
