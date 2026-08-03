import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { fetchProblems, updateProblemMetadata } from '../services/api';
import { ProblemCard } from '../components/ProblemCard';
import { Sidebar } from '../components/Sidebar';
import { EraserFAB } from '../components/EraserFAB';
import { Item } from '../types';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';

export const StudyView: React.FC = () => {
  const {
    problems,
    setProblems,
    appendProblems,
    nextCursor,
    selectedTopicId,
    selectedStatus,
    isLoading,
    setIsLoading,
    updateProblemInStore,
  } = useStore();

  const [editingProblem, setEditingProblem] = useState<Item | null>(null);
  const [editTopicId, setEditTopicId] = useState<string>('');
  const [editKeywordsStr, setEditKeywordsStr] = useState<string>('');

  const parentRef = useRef<HTMLDivElement>(null);

  const loadInitialProblems = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchProblems({
        topic_id: selectedTopicId ?? undefined,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        limit: 15,
      });
      setProblems(res.items, res.nextCursor);
    } catch (err) {
      console.error('Failed to load problems:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTopicId, selectedStatus, setProblems, setIsLoading]);

  useEffect(() => {
    loadInitialProblems();
  }, [loadInitialProblems]);

  const loadMore = async () => {
    if (!nextCursor || isLoading) return;
    setIsLoading(true);
    try {
      const res = await fetchProblems({
        topic_id: selectedTopicId ?? undefined,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        cursor: nextCursor,
        limit: 15,
      });
      appendProblems(res.items, res.nextCursor);
    } catch (err) {
      console.error('Failed to fetch next page:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Virtualizer Setup
  const rowVirtualizer = useVirtualizer({
    count: problems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 580, // estimated card height
    overscan: 2,
  });

  const handleOpenEditModal = (problem: Item) => {
    setEditingProblem(problem);
    setEditTopicId(problem.topic_id || '');
    let kw: string[] = [];
    try {
      kw = typeof problem.keywords === 'string' ? JSON.parse(problem.keywords) : problem.keywords || [];
    } catch {
      kw = [];
    }
    setEditKeywordsStr(kw.join(', '));
  };

  const handleSaveMetadata = async () => {
    if (!editingProblem) return;
    const keywordsArray = editKeywordsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await updateProblemMetadata(editingProblem.id, {
        topic_id: editTopicId || undefined,
        keywords: keywordsArray,
      });

      updateProblemInStore(editingProblem.id, {
        topic_id: editTopicId || null,
        keywords: JSON.stringify(keywordsArray),
      });

      setEditingProblem(null);
    } catch (err) {
      console.error('Failed to save metadata:', err);
    }
  };

  const handleStatusResolved = (problemId: string) => {
    const currentIndex = problems.findIndex((p) => p.id === problemId);
    if (currentIndex >= 0 && currentIndex < problems.length - 1) {
      rowVirtualizer.scrollToIndex(currentIndex + 1, { align: 'start', behavior: 'smooth' });
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 relative min-h-[calc(100vh-100px)]">
      {/* Sidebar Filter */}
      <Sidebar />

      {/* Main Virtualized Problem Stream */}
      <main className="flex-1 flex flex-col">
        {isLoading && problems.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#6366F1]" />
          </div>
        ) : problems.length === 0 ? (
          <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-12 text-center text-xs text-[#9CA3AF]">
            目前這個篩選條件下沒有錯題紀錄。請在右上角上傳新錯題！
          </div>
        ) : (
          <div ref={parentRef} className="flex-1 overflow-y-auto max-h-[calc(100vh-110px)] pr-2">
            <div
              className="w-full relative"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const problem = problems[virtualRow.index];
                return (
                  <div
                    key={problem.id}
                    className="absolute top-0 left-0 w-full"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <ProblemCard
                      problem={problem}
                      onEditMetadata={handleOpenEditModal}
                      onStatusResolved={handleStatusResolved}
                    />
                  </div>
                );
              })}
            </div>

            {/* Load More Trigger */}
            {nextCursor && (
              <div className="py-6 text-center">
                <button
                  onClick={loadMore}
                  disabled={isLoading}
                  className="px-6 py-2.5 rounded-2xl bg-stone-100 dark:bg-stone-800 text-xs font-medium text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                >
                  {isLoading ? '載入中...' : '載入更多錯題'}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Left Hand Spring Eraser Floating Action Button */}
      <EraserFAB />

      {/* Metadata Edit Modal */}
      {editingProblem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#374151] dark:text-[#D1D5DB]">
                手動修正課綱單元與關鍵字
              </h3>
              <button
                onClick={() => setEditingProblem(null)}
                className="p-1 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-[#9CA3AF]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#9CA3AF] mb-1 font-medium">選擇學測/分科課綱單元</label>
                <select
                  value={editTopicId}
                  onChange={(e) => setEditTopicId(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#D1D5DB]"
                >
                  <option value="">未指定單元</option>
                  {TAXONOMY_SEED_DATA.map((subject) => (
                    <optgroup key={subject.id} label={subject.label}>
                      {subject.children?.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#9CA3AF] mb-1 font-medium">自訂關鍵字 (以逗號分隔)</label>
                <input
                  type="text"
                  value={editKeywordsStr}
                  onChange={(e) => setEditKeywordsStr(e.target.value)}
                  placeholder="例如: 貝氏定理, 條件機率"
                  className="w-full p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#D1D5DB]"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setEditingProblem(null)}
                className="px-4 py-2 rounded-xl text-xs bg-stone-100 dark:bg-stone-800 text-[#374151] dark:text-[#D1D5DB]"
              >
                取消
              </button>
              <button
                onClick={handleSaveMetadata}
                className="px-4 py-2 rounded-xl text-xs bg-[#6366F1] text-white font-medium hover:bg-[#4F46E5]"
              >
                儲存變更
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
