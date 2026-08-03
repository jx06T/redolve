import React, { useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { PenTool, Search, Moon, Sun, Upload, LayoutDashboard, BookOpen, Settings, Menu, X, ChevronDown } from 'lucide-react';
import { useStore } from '../store/useStore';
import { uploadProblem } from '../services/api';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState<boolean>(false);

  const {
    darkMode,
    toggleDarkMode,
    searchQuery,
    setSearchQuery,
    setIsLoading,
    selectedSubjectId,
    setSelectedSubjectId,
  } = useStore();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setMobileSearchOpen(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      await uploadProblem(file, '網頁手動上傳');
      navigate(`/study/all`);
      window.location.reload();
    } catch (err) {
      console.error('Upload failed:', err);
      alert('上傳失敗，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const newSubjectId = val === 'all' ? null : val;
    setSelectedSubjectId(newSubjectId);
    navigate(`/study/${val}`);
  };

  const navLinks = [
    { path: '/', label: '總覽 Dashboard', icon: LayoutDashboard },
    { path: '/study/all', label: '刷題本 Study', icon: BookOpen },
    { path: '/settings', label: '設定 Settings', icon: Settings },
  ];

  return (
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

          {/* Subject Selector Dropdown (UI_DESIGN01_0804 Section 1) */}
          <div className="relative hidden sm:flex items-center pl-2 border-l border-stone-200 dark:border-stone-800">
            <select
              value={selectedSubjectId || 'all'}
              onChange={handleSubjectChange}
              className="appearance-none bg-stone-100 dark:bg-stone-800 text-[#374151] dark:text-[#D1D5DB] text-xs font-bold px-3 py-1.5 pr-7 rounded-xl border border-stone-200 dark:border-stone-700 cursor-pointer focus:outline-none focus:border-[#6366F1]"
            >
              <option value="all">全部科目 ▾</option>
              {TAXONOMY_SEED_DATA.map((sub) => (
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

          {/* Upload Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-2xl text-xs font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] active:scale-[0.98] transition-all shadow-xs"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">上傳錯題</span>
          </button>

          {/* Dark Mode Toggle */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-2xl border border-[#E5E7EB] dark:border-[#2C2C30] text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50 transition-colors"
            title="切換深淺色模式"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
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
              {TAXONOMY_SEED_DATA.map((sub) => (
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
        </div>
      )}
    </header>
  );
};
