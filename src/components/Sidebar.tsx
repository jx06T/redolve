import React, { useState } from 'react';
import { Filter, Layers, ChevronDown, ChevronUp, ListOrdered, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useStore } from '../store/useStore';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';

interface SidebarProps {
  onSelectProblemOutline?: (problemId: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onSelectProblemOutline }) => {
  const [mobileCollapsed, setMobileCollapsed] = useState<boolean>(true);

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

  // Filter taxonomy tree by selectedSubjectId if present
  const availableTaxonomy = selectedSubjectId
    ? TAXONOMY_SEED_DATA.filter((s) => s.id === selectedSubjectId)
    : TAXONOMY_SEED_DATA;

  if (sidebarCollapsed) {
    return (
      <div className="hidden lg:block">
        <button
          onClick={toggleSidebarCollapsed}
          className="p-3 rounded-2xl bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] text-[#6366F1] shadow-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-all"
          title="展開側邊欄 (退出專注模式)"
        >
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <aside className="w-full lg:w-72 bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-4 lg:p-5 space-y-5 shrink-0 transition-all">
      {/* Sidebar Header & Focus Mode Toggle (UI_DESIGN01_0804 Section 2) */}
      <div className="flex items-center justify-between pb-2 border-b border-stone-200 dark:border-stone-800">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-[#6366F1]" />
          <span className="text-xs font-bold text-[#374151] dark:text-[#D1D5DB]">章節大綱導航</span>
        </div>
        <div className="flex items-center space-x-1">
          {/* Mobile Expand/Collapse Toggle */}
          <button
            onClick={() => setMobileCollapsed(!mobileCollapsed)}
            className="lg:hidden p-1.5 rounded-xl text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB]"
          >
            {mobileCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          {/* Desktop Focus Mode Toggle */}
          <button
            onClick={toggleSidebarCollapsed}
            className="hidden lg:block p-1.5 rounded-xl text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB]"
            title="收合側邊欄 (專注模式)"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={`${mobileCollapsed ? 'hidden lg:block' : 'block'} space-y-5`}>
        {/* Status Filter Toggle */}
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">
            <span>訂正狀態過濾</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-stone-100 dark:bg-stone-800/60 rounded-2xl">
            {[
              { key: 'all', label: '全部' },
              { key: 'unsolved', label: '未訂正' },
              { key: 'resolved', label: '已完成' },
            ].map((item) => {
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
                setMobileCollapsed(true);
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
                        setMobileCollapsed(true);
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
                      setMobileCollapsed(true);
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
    </aside>
  );
};
