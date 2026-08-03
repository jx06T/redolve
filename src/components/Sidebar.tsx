import React, { useState, useEffect } from 'react';
import { Filter, Layers, ListOrdered, PanelLeftClose, PanelLeftOpen, Compass, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';
import { STATUS_FILTER_ITEMS } from '../config/constants';

interface SidebarProps {
  onSelectProblemOutline?: (problemId: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onSelectProblemOutline }) => {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);

  const {
    selectedSubjectId,
    selectedTopicId,
    setSelectedTopicId,
    selectedStatus,
    setSelectedStatus,
    problems,
    activeProblemId,
    sidebarCollapsed,
    toggleSidebarCollapsed,
  } = useStore();

  // Close mobile drawer on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileDrawerOpen) {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileDrawerOpen]);

  // Filter taxonomy tree by selectedSubjectId if present
  const availableTaxonomy = selectedSubjectId
    ? TAXONOMY_SEED_DATA.filter((s) => s.id === selectedSubjectId)
    : TAXONOMY_SEED_DATA;

  // Shared inner navigation content (used in both desktop sidebar & mobile floating drawer)
  const NavigationContent = (
    <div className="space-y-5">
      {/* Status Filter Toggle */}
      <div>
        <div className="flex items-center space-x-2 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">
          <span>訂正狀態過濾</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-stone-100 dark:bg-stone-800/60 rounded-2xl">
          {STATUS_FILTER_ITEMS.map((item) => {
            const isSelected = selectedStatus === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setSelectedStatus(item.key as any)}
                className={`py-1.5 text-xs font-medium rounded-xl transition-all ${
                  isSelected
                    ? 'bg-white dark:bg-[#2C2C30] text-[#6366F1] dark:text-indigo-400 font-semibold shadow-xs'
                    : 'text-[#374151] dark:text-[#D1D5DB] hover:text-[#6366F1]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Subject Taxonomy Topic Filter */}
      <div>
        <div className="flex items-center space-x-2 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">
          <Layers className="w-3.5 h-3.5" />
          <span>章節篩選器</span>
        </div>

        <div className="space-y-1 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
          <button
            onClick={() => {
              setSelectedTopicId(null);
              setMobileDrawerOpen(false);
            }}
            className={`w-full text-left px-3 py-1.5 rounded-2xl text-xs font-medium transition-colors ${
              selectedTopicId === null
                ? 'bg-[#6366F1]/10 text-[#6366F1] font-semibold'
                : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50'
            }`}
          >
            全部章節單元
          </button>

          {availableTaxonomy.map((subject) => (
            <div key={subject.id} className="pt-2">
              <div className="px-3 text-[11px] font-bold text-[#9CA3AF] uppercase tracking-wide">
                {subject.label}
              </div>
              {subject.children?.map((unit) => {
                const isSelected = selectedTopicId === unit.id;
                return (
                  <button
                    key={unit.id}
                    onClick={() => {
                      setSelectedTopicId(unit.id);
                      setMobileDrawerOpen(false);
                    }}
                    className={`w-full text-left px-4 py-1.5 rounded-xl text-xs font-medium transition-colors mt-0.5 ${
                      isSelected
                        ? 'bg-[#6366F1]/10 text-[#6366F1] font-semibold'
                        : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50'
                    }`}
                  >
                    • {unit.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Problem Outline List / Minimap Navigation (UI_DESIGN01_0804 Section 2) */}
      {problems.length > 0 && (
        <div className="pt-3 border-t border-stone-200 dark:border-stone-800">
          <div className="flex items-center space-x-2 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">
            <ListOrdered className="w-3.5 h-3.5" />
            <span>錯題大綱清單 ({problems.length} 題)</span>
          </div>

          <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
            {problems.map((item, idx) => {
              const isActive = activeProblemId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (onSelectProblemOutline) {
                      onSelectProblemOutline(item.id);
                    }
                    setMobileDrawerOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-xl text-xs flex items-center justify-between transition-all ${
                    isActive
                      ? 'bg-[#6366F1] text-white font-bold shadow-xs'
                      : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50'
                  }`}
                >
                  <span className="truncate">Problem {idx + 1}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                      item.status === 'resolved'
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300'
                        : 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                    }`}
                  >
                    {item.status === 'resolved' ? '已完成' : '未訂正'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* 1. Mobile Floating Trigger FAB */}
      <div className="lg:hidden fixed bottom-24 left-6 z-40">
        <button
          onClick={() => setMobileDrawerOpen(true)}
          className="flex items-center space-x-2 px-4 py-2.5 rounded-full bg-[#6366F1] text-white font-semibold text-xs shadow-xl ring-2 ring-white/50 dark:ring-stone-700 active:scale-95 transition-all"
        >
          <Compass className="w-4 h-4" />
          <span>章節導航</span>
        </button>
      </div>

      {/* 2. Mobile Floating Slide-over Drawer with Blur & Backdrop Click Dismissal */}
      <div
        onClick={() => setMobileDrawerOpen(false)}
        className={`lg:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-start transition-opacity duration-300 ease-out ${
          mobileDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={`w-80 max-w-[85vw] bg-white dark:bg-[#202023] border-r border-[#E5E7EB] dark:border-[#2C2C30] h-full p-5 flex flex-col shadow-2xl transition-transform duration-300 ease-out ${
            mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-200 dark:border-stone-800">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-[#6366F1]" />
              <span className="text-sm font-bold text-[#374151] dark:text-[#D1D5DB]">章節導航與篩選</span>
            </div>
            <button
              onClick={() => setMobileDrawerOpen(false)}
              className="p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-[#9CA3AF]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto pr-1">{NavigationContent}</div>
        </div>
      </div>

      {/* 3. Desktop Permanent Sidebar (< 1024px hidden, >= 1024px visible) */}
      {sidebarCollapsed ? (
        <div className="hidden lg:block">
          <button
            onClick={toggleSidebarCollapsed}
            className="p-3 rounded-2xl bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] text-[#6366F1] shadow-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-all"
            title="展開側邊欄 (退出專注模式)"
          >
            <PanelLeftOpen className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <aside className="hidden lg:block w-72 bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-5 shrink-0 transition-all">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-stone-200 dark:border-stone-800">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-[#6366F1]" />
              <span className="text-xs font-bold text-[#374151] dark:text-[#D1D5DB]">章節大綱導航</span>
            </div>
            <button
              onClick={toggleSidebarCollapsed}
              className="p-1.5 rounded-xl text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB]"
              title="收合側邊欄 (專注模式)"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
          {NavigationContent}
        </aside>
      )}
    </>
  );
};
