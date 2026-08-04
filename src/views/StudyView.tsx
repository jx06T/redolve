import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2, X, Sparkles } from 'lucide-react';
import { useStore } from '../store/useStore';
import { fetchProblems, updateProblemMetadata, analyzeProblem } from '../services/api';
import { useSEO } from '../hooks/useSEO';
import { ProblemCard } from '../components/ProblemCard';
import { Sidebar } from '../components/Sidebar';
import { FloatingPenToolbar } from '../components/FloatingPenToolbar';
import { EraserFAB } from '../components/EraserFAB';
import { SmartCTA } from '../components/SmartCTA';
import { Item } from '../types';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';

export const StudyView: React.FC = () => {
  const { subject, topic, problemId } = useParams<{ subject?: string; topic?: string; problemId?: string }>();
  const {
    problems,
    setProblems,
    appendProblems,
    nextCursor,
    selectedSubjectId,
    selectedTopicId,
    selectedStatus,
    setSelectedSubjectId,
    setSelectedTopicId,
    isLoading,
    setIsLoading,
    updateProblemInStore,
    setActiveProblemId,
    taxonomies,
    showToast,
  } = useStore();

  const activeTaxonomies = taxonomies && taxonomies.length > 0 ? taxonomies : TAXONOMY_SEED_DATA;
  const currentSubObj = activeTaxonomies.find((s) => s.id === subject);
  const currentSubjectLabel = currentSubObj ? currentSubObj.label : subject && subject !== 'all' ? subject : '全部科目';
  const currentTopicLabel = topic ? ` - ${topic}` : '';

  useSEO({
    title: `${currentSubjectLabel}${currentTopicLabel} 錯題刷題複習`,
    description: `Redolve ${currentSubjectLabel} 錯題複習專區。支援 iPad + Apple Pencil 向量手寫訂正、AI 題型分析與單元沉浸式演練。`,
  });

  const [editingProblem, setEditingProblem] = useState<Item | null>(null);
  const [editTopicId, setEditTopicId] = useState<string>('');
  const [editKeywordsStr, setEditKeywordsStr] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  const parentRef = useRef<HTMLDivElement>(null);

  // Sync URL Route Params to Zustand Store on direct navigation
  useEffect(() => {
    if (subject && subject !== 'all') {
      if (selectedSubjectId !== subject) {
        setSelectedSubjectId(subject);
      }
    } else if (subject === 'all' && selectedSubjectId !== null) {
      setSelectedSubjectId(null);
    }

    if (topic && topic !== 'all') {
      if (selectedTopicId !== topic) {
        setSelectedTopicId(topic);
      }
    } else if (topic === 'all' && selectedTopicId !== null) {
      setSelectedTopicId(null);
    }
  }, [subject, topic, selectedSubjectId, selectedTopicId, setSelectedSubjectId, setSelectedTopicId]);

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

  const targetHashProblemIdRef = useRef<string | null>(
    typeof window !== 'undefined'
      ? window.location.hash.replace(/^#problem-/, '').replace(/^#/, '') || null
      : null
  );
  const isInitialScrollPendingRef = useRef<boolean>(true);
  const hasPerformedInitialScrollRef = useRef<boolean>(false);

  // Virtualizer Setup with dynamic size measurement
  const rowVirtualizer = useVirtualizer({
    count: problems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 620, // estimated card height with divider
    overscan: 3,
  });

  // Handle Initial Problem Focus & Scroll on Page Load / Refresh
  useEffect(() => {
    if (problems.length > 0 && !hasPerformedInitialScrollRef.current) {
      hasPerformedInitialScrollRef.current = true;
      const targetId = problemId || targetHashProblemIdRef.current;

      if (targetId) {
        const index = problems.findIndex((p) => p.id === targetId);
        if (index >= 0) {
          setActiveProblemId(targetId);
          window.history.replaceState(null, '', `${window.location.pathname}#problem-${targetId}`);
          
          // Instant jump to target index
          requestAnimationFrame(() => {
            rowVirtualizer.scrollToIndex(index, { align: 'start', behavior: 'auto' });
            setTimeout(() => {
              isInitialScrollPendingRef.current = false;
            }, 350);
          });
          return;
        }
      }

      // Default fallback to first problem if no valid hash
      const firstProblem = problems[0];
      setActiveProblemId(firstProblem.id);
      window.history.replaceState(null, '', `${window.location.pathname}#problem-${firstProblem.id}`);
      isInitialScrollPendingRef.current = false;
    }
  }, [problemId, problems, rowVirtualizer, setActiveProblemId]);

  // Scroll Listener on Virtualizer container for real-time focus detection & URL Hash sync
  useEffect(() => {
    const parent = parentRef.current;
    if (!parent || problems.length === 0) return;

    let debounceTimer: any = null;
    const handleScroll = () => {
      // Ignore scroll events during initial page load jump
      if (isInitialScrollPendingRef.current) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isInitialScrollPendingRef.current) return;

        const virtualItems = rowVirtualizer.getVirtualItems();
        if (virtualItems.length === 0) return;

        // Find the item closest to top viewport
        const scrollTop = parent.scrollTop;
        const currentItem = virtualItems.reduce((closest, item) => {
          const distance = Math.abs(item.start - scrollTop);
          const closestDistance = Math.abs(closest.start - scrollTop);
          return distance < closestDistance ? item : closest;
        }, virtualItems[0]);

        if (currentItem && problems[currentItem.index]) {
          const currentProblem = problems[currentItem.index];
          setActiveProblemId(currentProblem.id);

          // Update URL Hash without adding duplicate history entries
          const newHash = `#problem-${currentProblem.id}`;
          if (window.location.hash !== newHash) {
            window.history.replaceState(
              null,
              '',
              `${window.location.pathname}${newHash}`
            );
          }
        }
      }, 50);
    };

    parent.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      clearTimeout(debounceTimer);
      parent.removeEventListener('scroll', handleScroll);
    };
  }, [problems, rowVirtualizer, setActiveProblemId]);

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

  const handleRunAiAnalysis = async () => {
    if (!editingProblem) return;
    setIsAnalyzing(true);
    try {
      const res = await analyzeProblem(editingProblem.id);
      if (res && res.tagResult) {
        setEditTopicId(res.tagResult.topic_id);
        const kwList = Array.isArray(res.tagResult.keywords) ? res.tagResult.keywords : [];
        setEditKeywordsStr(kwList.join(', '));
        updateProblemInStore(editingProblem.id, {
          topic_id: res.tagResult.topic_id,
          keywords: JSON.stringify(kwList),
          keyword_tokens: res.tagResult.keyword_tokens ? res.tagResult.keyword_tokens.join(' ') : '',
        });
        showToast('AI 課綱辨識完成！已自動套用標籤');
      }
    } catch (err: any) {
      console.error('AI Analysis failed:', err);
      showToast(err.message || 'AI 辨識失敗，請確認 API 金鑰');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStatusResolved = (problemId: string) => {
    const currentIndex = problems.findIndex((p) => p.id === problemId);
    if (currentIndex >= 0 && currentIndex < problems.length - 1) {
      rowVirtualizer.scrollToIndex(currentIndex + 1, { align: 'start', behavior: 'smooth' });
    }
  };

  const handleSelectProblemOutline = (targetProblemId: string) => {
    const index = problems.findIndex((p) => p.id === targetProblemId);
    if (index >= 0) {
      isInitialScrollPendingRef.current = true;
      setActiveProblemId(targetProblemId);
      window.history.replaceState(null, '', `${window.location.pathname}#problem-${targetProblemId}`);
      rowVirtualizer.scrollToIndex(index, { align: 'start', behavior: 'smooth' });
      setTimeout(() => {
        isInitialScrollPendingRef.current = false;
      }, 500);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 relative min-h-[calc(100vh-100px)]">
      {/* Sidebar Filter & Problem Outline Nav */}
      <Sidebar onSelectProblemOutline={handleSelectProblemOutline} />

      {/* Main Virtualized Problem Stream Feed */}
      <section className="flex-1 flex flex-col min-w-0" aria-label="錯題串流列表">
        <h1 className="sr-only">{currentSubjectLabel}{currentTopicLabel} 錯題刷題複習</h1>
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
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute top-0 left-0 w-full"
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <ProblemCard
                      problem={problem}
                      problemIndex={virtualRow.index}
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
      </section>

      {/* Floating UI Layer (UI_DESIGN01_0804 Section 4) */}
      {/* 1. Top-Right Floating Pen Palette */}
      <FloatingPenToolbar />

      {/* 2. Left-Bottom Spring Eraser FAB */}
      <EraserFAB />

      {/* 3. Right-Bottom Floating Smart CTA */}
      <SmartCTA onStatusResolved={handleStatusResolved} />

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
                  {activeTaxonomies.map((subject) => (
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

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleRunAiAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 active:scale-95 transition-all disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>AI 辨識中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI 自動重新分析</span>
                  </>
                )}
              </button>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingProblem(null)}
                  className="px-4 py-2 rounded-xl text-xs bg-stone-100 dark:bg-stone-800 text-[#374151] dark:text-[#D1D5DB]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveMetadata}
                  className="px-4 py-2 rounded-xl text-xs bg-[#6366F1] text-white font-medium hover:bg-[#4F46E5]"
                >
                  儲存變更
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
