import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { PenTool, Search, Moon, Sun, Upload, Menu, X, ChevronDown, Command } from 'lucide-react';
import { useStore } from '../store/useStore';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';
import { UploadModal } from './UploadModal';
import { ShortcutsModal } from './ShortcutsModal';
import { AuthModal } from './AuthModal';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { NAV_LINKS } from '../config/constants';
import { fetchCurrentUser, fetchProblems } from '../services/api';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState<boolean>(false);
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState<boolean>(false);

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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setMobileSearchOpen(false);
    }
  };

  const handleSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const newSubjectId = val === 'all' ? null : val;
    setSelectedSubjectId(newSubjectId);
    navigate(`/study/${val}`);
  };

  const navLinks = NAV_LINKS;

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#202023]/80 backdrop-blur-md border-b border-[#E5E7EB] dark:border-[#2C2C30] px-4 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          {/* Brand Logo & Subject Selector */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-2xl text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800"
              aria-label="選單 Toggle"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <Link to="/" className="flex items-center space-x-2 text-slate-800 dark:text-slate-100 font-semibold tracking-tight">
              <div className="p-2.5 bg-[#6366F1]/10 text-[#6366F1] dark:text-indigo-400 rounded-2xl">
                <PenTool className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold leading-none">Redolve</span>
                <span className="text-[10px] text-[#9CA3AF] mt-0.5">iPad AI Flashcards</span>
              </div>
            </Link>

            {/* Subject Selector Dropdown */}
            <div className="relative hidden sm:flex items-center pl-2 border-l border-stone-200 dark:border-stone-800">
              <select
                value={selectedSubjectId || 'all'}
                onChange={handleSubjectChange}
                className="appearance-none bg-stone-100 dark:bg-stone-800 text-[#374151] dark:text-[#D1D5DB] text-xs font-bold px-3 py-1.5 pr-7 rounded-xl border border-stone-200 dark:border-stone-700 cursor-pointer focus:outline-none focus:border-[#6366F1]"
              >
                <option value="all">全部科目 ▾</option>
                {(taxonomies && taxonomies.length > 0 ? taxonomies : TAXONOMY_SEED_DATA).map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2 text-[#9CA3AF] pointer-events-none" />
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-2xl text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-[#6366F1]/10 text-[#6366F1] dark:text-indigo-400 font-semibold'
                      : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Search & Controls */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Desktop Search */}
            <form onSubmit={handleSearchSubmit} className="relative hidden sm:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                type="text"
                placeholder="搜尋錯題、關鍵字..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-1.5 rounded-2xl text-xs bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#D1D5DB] focus:outline-none focus:border-[#6366F1] transition-all w-44 lg:w-64"
              />
            </form>

            {/* Mobile Search Toggle Button */}
            <button
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              className="sm:hidden p-2 rounded-2xl border border-[#E5E7EB] dark:border-[#2C2C30] text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800"
              title="開啟搜尋"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Keyboard Shortcuts Trigger Button */}
            <button
              onClick={() => setShortcutsModalOpen(true)}
              className="hidden lg:flex items-center space-x-1.5 px-3 py-2 rounded-2xl text-xs font-medium border border-[#E5E7EB] dark:border-[#2C2C30] text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50 transition-colors"
              title="鍵盤快捷鍵指南 (?)"
            >
              <Command className="w-3.5 h-3.5 text-[#9CA3AF]" />
              <span>快捷鍵</span>
            </button>

            {/* Upload Modal Trigger Button */}
            <button
              onClick={() => setUploadModalOpen(true)}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-2xl text-xs font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] active:scale-[0.98] transition-all shadow-xs"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">上傳錯題</span>
            </button>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-2xl border border-[#E5E7EB] dark:border-[#2C2C30] text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50 transition-colors"
              title="切換深淺色模式 (Cmd+D)"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* User Session & Auth Profile Button */}
            <button
              onClick={() => setAuthModalOpen(true)}
              className="flex items-center space-x-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/60 hover:bg-stone-100 dark:hover:bg-stone-800 text-[#374151] dark:text-[#D1D5DB] transition-all"
              title="使用者帳號與身分管理"
            >
              <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-bold">
                {(currentUser?.name || currentUser?.email || 'D').charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:inline text-xs font-semibold max-w-[90px] truncate">
                {currentUser?.name || '帳號設定'}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile Search Bar Overlay */}
        {mobileSearchOpen && (
          <div className="sm:hidden mt-3 pt-3 border-t border-[#E5E7EB] dark:border-[#2C2C30]">
            <form onSubmit={handleSearchSubmit} className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                type="text"
                placeholder="搜尋錯題、關鍵字..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full pl-9 pr-4 py-2 rounded-2xl text-xs bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#D1D5DB]"
              />
            </form>
          </div>
        )}

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-3 pt-3 border-t border-[#E5E7EB] dark:border-[#2C2C30] space-y-2">
            {/* Mobile Subject Selector */}
            <div className="px-2 pb-2">
              <label className="block text-[11px] font-bold text-[#9CA3AF] mb-1">科目選擇</label>
              <select
                value={selectedSubjectId || 'all'}
                onChange={handleSubjectChange}
                className="w-full p-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-xs font-semibold text-[#374151] dark:text-[#D1D5DB]"
              >
                <option value="all">全部科目</option>
                {(taxonomies && taxonomies.length > 0 ? taxonomies : TAXONOMY_SEED_DATA).map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.label}
                  </option>
                ))}
              </select>
            </div>

            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-3 px-4 py-2.5 rounded-2xl text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-[#6366F1]/10 text-[#6366F1] font-semibold'
                      : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              );
            })}

            {/* Mobile Drawer Upload Action */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setUploadModalOpen(true);
                }}
                className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-2xl text-xs font-bold bg-[#6366F1] text-white hover:bg-[#4F46E5] active:scale-[0.98] transition-all shadow-xs"
              >
                <Upload className="w-4 h-4" />
                <span>批次上傳錯題</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Upload Modal Container */}
      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadSuccess={async () => {
          try {
            const res = await fetchProblems({ limit: 50 });
            setProblems(res.items, res.nextCursor);
          } catch (err) {
            console.error('Failed to reload problems after upload:', err);
          }
          navigate('/study/all');
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
