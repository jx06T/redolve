import React, { useState, useEffect } from 'react';
import { Filter, Layers, ListOrdered, PanelLeftClose, PanelLeftOpen, Compass, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';
import { STATUS_FILTER_ITEMS } from '../config/constants';
import { formatProblemCode, getTaxonomyPath } from './StatusBadge';

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
    taxonomies,
    taxonomyCounts,
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

  // Filter taxonomy tree strictly by active subject
  const baseTaxonomy = taxonomies && taxonomies.length > 0 ? taxonomies : TAXONOMY_SEED_DATA;
  const currentSubjectId = selectedSubjectId || 'math';
  const isUnclassifiedSubject = currentSubjectId === 'unclassified';
  const activeSubject = isUnclassifiedSubject
    ? null
    : (baseTaxonomy.find((s) => s.id === currentSubjectId) || baseTaxonomy[0]);

  // Helper to calculate problem count for any taxonomy node
  const computeCountForNode = (node: { id: string; children?: any[] }): number => {
    let count = 0;
    if (taxonomyCounts[node.id]) {
      const counts = taxonomyCounts[node.id] as any;
      if (typeof counts === 'number') {
        // Fallback for old cached data
        count = selectedStatus === 'all' ? counts : 0;
      } else {
        count = selectedStatus === 'all' ? (counts.total || 0) : (counts[selectedStatus] || 0);
      }
    }
    
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        count += computeCountForNode(child);
      }
    }
    
    // Fallback if taxonomyCounts is empty (e.g. initial load without worker completion)
    if (Object.keys(taxonomyCounts).length === 0) {
      const filterFn = (p: any) => p.topic_id === node.id && (selectedStatus === 'all' || p.status === selectedStatus);
      let localCount = problems.filter(filterFn).length;
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          const childFilterFn = (p: any) => p.topic_id === child.id && (selectedStatus === 'all' || p.status === selectedStatus);
          localCount += problems.filter(childFilterFn).length;
        }
      }
      return localCount;
    }
    return count;
  };

  const subjectTotalCount = activeSubject
    ? (activeSubject.children?.reduce((acc, unit) => acc + computeCountForNode(unit), 0) ?? 0)
    : problems.length;

  // Shared inner navigation content (used in both desktop sidebar & mobile floating drawer)
  const NavigationContent = (
    <div className="space-y-4">
      {/* Status Filter Toggle */}
      <div>
        <div className="flex items-center space-x-2 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">
          <span>訂正狀態過濾</span>
        </div>
        <div className="grid grid-cols-4 gap-1 p-1 bg-stone-100 dark:bg-stone-800/60 rounded-2xl">
          {STATUS_FILTER_ITEMS.map((item) => {
            const isSelected = selectedStatus === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setSelectedStatus(item.key as any)}
                className={`py-1.5 text-xs font-medium rounded-xl transition-all ${isSelected
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
        <div className="flex items-center justify-between text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">
          <div className="flex items-center space-x-1.5">
            <Layers className="w-3.5 h-3.5 text-[#6366F1]" />
            <span>{isUnclassifiedSubject ? '其他科目' : (activeSubject?.label || '章節')} 篩選</span>
          </div>
        </div>

        {isUnclassifiedSubject ? (
          /* Unclassified virtual subject: no chapter tree, just a single "all" entry */
          <div className="space-y-1">
            <button
              onClick={() => {
                setSelectedTopicId(null);
                setMobileDrawerOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 rounded-2xl text-xs font-medium transition-colors flex items-center justify-between ${selectedTopicId === null
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold'
                  : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50'
                }`}
            >
              <span>全部未分類題目</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-stone-200/70 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                {problems.length}
              </span>
            </button>
            <p className="px-3 pt-2 text-[10px] text-[#9CA3AF] leading-relaxed">
              AI 辨識中或尚未指派科目的題目會集中於此。
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {/* All Chapters in this Subject */}
            <button
              onClick={() => {
                setSelectedTopicId(null);
                setMobileDrawerOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 rounded-2xl text-xs font-medium transition-colors flex items-center justify-between ${selectedTopicId === null
                  ? 'bg-[#6366F1]/10 text-[#6366F1] font-semibold'
                  : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50'
                }`}
            >
              <span>全部 {activeSubject?.label || '科目'} 錯題</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium ${selectedTopicId === null
                  ? 'bg-[#6366F1]/20 text-[#6366F1]'
                  : 'bg-stone-200/70 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                }`}>
                {subjectTotalCount > 0 ? subjectTotalCount : problems.length}
              </span>
            </button>

            {/* Chapters & Units */}
            {activeSubject?.children?.map((unit) => {
              const isUnitSelected = selectedTopicId === unit.id;
              const unitCount = computeCountForNode(unit);
              return (
                <div key={unit.id} className="pt-1">
                  <button
                    onClick={() => {
                      setSelectedTopicId(unit.id);
                      setMobileDrawerOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center justify-between ${isUnitSelected
                        ? 'bg-[#6366F1]/10 text-[#6366F1] font-semibold'
                        : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50'
                      }`}
                  >
                    <span className="truncate">{unit.label}</span>
                    {unitCount > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono shrink-0 ml-1.5 ${isUnitSelected
                          ? 'bg-[#6366F1]/20 text-[#6366F1] font-semibold'
                          : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
                        }`}>
                        {unitCount}
                      </span>
                    )}
                  </button>

                  {/* Sub-points / detailed topics */}
                  {unit.children && unit.children.length > 0 && (
                    <div className="pl-3 space-y-0.5 mt-0.5 border-l border-stone-200 dark:border-stone-800 ml-3">
                      {unit.children.map((point) => {
                        const isPointSelected = selectedTopicId === point.id;
                        const pointCountRaw = taxonomyCounts[point.id] as any;
                        let pointCount = 0;
                        if (pointCountRaw) {
                          if (typeof pointCountRaw === 'number') {
                            pointCount = selectedStatus === 'all' ? pointCountRaw : 0;
                          } else {
                            pointCount = selectedStatus === 'all' ? (pointCountRaw.total || 0) : (pointCountRaw[selectedStatus] || 0);
                          }
                        } else {
                          pointCount = problems.filter((p) => p.topic_id === point.id && (selectedStatus === 'all' || p.status === selectedStatus)).length;
                        }

                        return (
                          <button
                            key={point.id}
                            onClick={() => {
                              setSelectedTopicId(point.id);
                              setMobileDrawerOpen(false);
                            }}
                            className={`w-full text-left px-2.5 py-1 rounded-lg text-[11px] transition-colors flex items-center justify-between ${isPointSelected
                                ? 'bg-[#6366F1]/15 text-[#6366F1] font-bold'
                                : 'text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#374151] dark:hover:text-white'
                              }`}
                          >
                            <span className="truncate">• {point.label}</span>
                            {pointCount > 0 && (
                              <span className={`text-[9px] px-1 py-0.5 rounded-md font-mono shrink-0 ml-1 ${isPointSelected
                                  ? 'bg-[#6366F1]/20 text-[#6366F1] font-bold'
                                  : 'text-stone-400 dark:text-stone-500'
                                }`}>
                                {pointCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Problem Outline List / Minimap Navigation */}
      {problems.length > 0 && (
        <div className="pt-3 border-t border-stone-200 dark:border-stone-800">
          <div className="flex items-center space-x-2 text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">
            <ListOrdered className="w-3.5 h-3.5" />
            <span>
              {selectedTopicId
                ? `${baseTaxonomy.find((s) => s.id === selectedTopicId)?.label || '當前章節'}錯題 (${problems.length} 題)`
                : `錯題大綱清單 (${problems.length} 題)`}
            </span>
          </div>

          <div className="space-y-1">
            {problems.map((item) => {
              const isActive = activeProblemId === item.id;
              const pathInfo = getTaxonomyPath(item.topic_id ?? null, undefined, taxonomies);
              const topicBadgeLabel = pathInfo.unit || pathInfo.point || (pathInfo.isUnclassified ? '未分類' : pathInfo.subject);

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (onSelectProblemOutline) {
                      onSelectProblemOutline(item.id);
                    }
                    setMobileDrawerOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-xl text-xs flex items-center justify-between transition-all ${isActive
                      ? 'bg-[#6366F1] text-white font-bold shadow-xs'
                      : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50'
                    }`}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-mono font-medium truncate">
                      {formatProblemCode(item, taxonomies)}
                    </span>
                    <span className={`text-[10px] truncate max-w-[150px] ${isActive ? 'text-white/80 font-normal' : 'text-[#6B7280] dark:text-[#9CA3AF]'
                      }`}>
                      {topicBadgeLabel}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md shrink-0 ${isActive
                        ? 'bg-white/20 text-white'
                        : item.status === 'resolved'
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300'
                          : item.status === 'archived'
                            ? 'bg-stone-500/20 text-stone-600 dark:text-stone-300'
                            : 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                      }`}
                  >
                    {item.status === 'resolved' ? '已完成' : item.status === 'archived' ? '已封存' : '未訂正'}
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

      {/* 2. Mobile Floating Slide-over Drawer */}
      <div
        onClick={() => setMobileDrawerOpen(false)}
        className={`lg:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-start transition-opacity duration-300 ease-out ${mobileDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={`w-80 max-w-[85vw] bg-white dark:bg-[#202023] border-r border-[#E5E7EB] dark:border-[#2C2C30] h-full p-5 flex flex-col shadow-2xl transition-transform duration-300 ease-out ${mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
        >
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-200 dark:border-stone-800 shrink-0">
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
          <div className="flex-1 overflow-y-auto min-h-0 pr-1">{NavigationContent}</div>
        </div>
      </div>

      {/* 3. Desktop Permanent Sticky Sidebar (< 1024px hidden, >= 1024px visible) */}
      {sidebarCollapsed ? (
        // 加入 self-start，避免 Flex stretch 強迫與主要內容等高而失去 sticky 效果
        <div className="hidden lg:block self-start sticky top-[4.75rem]">
          <button
            onClick={toggleSidebarCollapsed}
            className="p-3 rounded-2xl bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] text-[#6366F1] shadow-xs hover:bg-stone-100 dark:hover:bg-stone-800 transition-all"
            title="展開側邊欄 (退出專注模式)"
          >
            <PanelLeftOpen className="w-5 h-5" />
          </button>
        </div>
      ) : (
        // 加入 self-start，並調整高度至 h-[calc(100dvh-6.5rem)] (考量 top:4.75rem 與底部安全邊距)，消除整體頁面的垂直滾動條
        <aside className="hidden lg:flex flex-col w-72 h-[calc(100dvh-6.5rem)] self-start sticky top-[4.75rem] bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-4 shrink-0 transition-all overflow-hidden shadow-2xs">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-stone-200 dark:border-stone-800 shrink-0">
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
          <div className="flex-1 overflow-y-auto min-h-0 pr-1">
            {NavigationContent}
          </div>
        </aside>
      )}
    </>
  );
};