import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2, Layers } from 'lucide-react';
import { useStore } from '../store/useStore';
import { updateProblemMetadata, analyzeProblem } from '../services/api';
import { useSEO } from '../hooks/useSEO';
import { useProblems } from '../hooks/useProblems';
import { ProblemCard } from '../components/ProblemCard';
import { ProblemMetadataModal } from '../components/problem/ProblemMetadataModal';
import { GuestNoticeBanner } from '../components/GuestNoticeBanner';
import { Sidebar } from '../components/Sidebar';
import { FloatingPenToolbar } from '../components/FloatingPenToolbar';
// import { EraserFAB } from '../components/EraserFAB';
import { SmartCTA } from '../components/SmartCTA';
import { Item } from '../types';
import { isTopicUnderSubject } from '../components/StatusBadge';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';

export const StudyView: React.FC = () => {
  const { subject, topic, problemId } = useParams<{ subject?: string; topic?: string; problemId?: string }>();
  const {
    problems,
    selectedSubjectId,
    selectedTopicId,
    selectedStatus,
    setSelectedSubjectId,
    setSelectedTopicId,
    isLoading,
    updateProblemInStore,
    setActiveProblemId,
    taxonomies,
    showToast,
    setMobileDrawerOpen,
  } = useStore();

  const activeTaxonomies = taxonomies && taxonomies.length > 0 ? taxonomies : TAXONOMY_SEED_DATA;

  // Priority: URL params > Zustand Store > Default 'math'
  const effectiveSubject = (subject && subject !== 'all' ? subject : selectedSubjectId) || 'math';
  const isUnclassifiedSubject = effectiveSubject === 'unclassified';
  const currentSubObj = isUnclassifiedSubject ? null : activeTaxonomies.find((s) => s.id === effectiveSubject);
  const currentSubjectLabel = isUnclassifiedSubject
    ? '其他科目'
    : currentSubObj
      ? currentSubObj.label
      : effectiveSubject && effectiveSubject !== 'all'
        ? effectiveSubject
        : '全部科目';
  const currentTopicLabel = topic ? ` - ${topic}` : '';

  // For the unclassified virtual subject, topic filters don't apply
  const isValidTopic = isUnclassifiedSubject
    ? false
    : selectedTopicId
      ? isTopicUnderSubject(selectedTopicId, effectiveSubject, activeTaxonomies)
      : true;
  const effectiveTopic = isUnclassifiedSubject
    ? undefined
    : isValidTopic
      ? (selectedTopicId ?? (topic && topic !== 'all' ? topic : undefined))
      : undefined;

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
    }

    if (topic && topic !== 'all') {
      if (selectedTopicId !== topic) {
        setSelectedTopicId(topic);
      }
    } else if (!topic && selectedTopicId !== null && !isValidTopic) {
      setSelectedTopicId(null);
    }
  }, [subject, topic, selectedSubjectId, selectedTopicId, isValidTopic, setSelectedSubjectId, setSelectedTopicId]);

  // ---------------------------------------------------------------------------
  // Data loading via useProblems (handles both cloud and offline sources)
  // ---------------------------------------------------------------------------
  const targetHashProblemIdRef = useRef<string | null>(
    typeof window !== 'undefined'
      ? window.location.hash.replace(/^#problem-/, '').replace(/^#/, '') || null
      : null
  );

  const { load, loadMore, nextCursor } = useProblems({
    subject: effectiveSubject,
    topic: effectiveTopic,
    status: selectedStatus,
    targetProblemId: problemId || targetHashProblemIdRef.current,
  });

  useEffect(() => {
    load();
  }, [load]);

  // Silent refetch on tab focus (only for logged-in users; guests read IndexedDB locally)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && !isLoading) {
        try {
          const { fetchProblems } = await import('../services/api');
          const res = await fetchProblems({
            subject_id: effectiveSubject,
            topic_id: effectiveTopic ?? undefined,
            status: selectedStatus === 'all' ? undefined : selectedStatus,
            limit: 15,
          });
          if (res.items.length > 0 && problems.length > 0) {
            // Only notify if the top cloud item changed (guests have blob items at the top, skip them)
            const firstCloudItem = problems.find(p => !p.image_url?.startsWith('blob:'));
            if (firstCloudItem && res.items[0]?.id !== firstCloudItem.id) {
              showToast(
                '[新題目] 偵測到新題目已分類，點此重新整理',
                'success',
                10000,
                () => {
                  load();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  if (parentRef.current) parentRef.current.scrollTop = 0;
                }
              );
            }
          }
        } catch (err) {
          console.error('Silent refetch failed:', err);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [effectiveSubject, effectiveTopic, selectedStatus, problems, isLoading, showToast, load]);

  // ---------------------------------------------------------------------------
  // Virtualizer + scroll tracking
  // ---------------------------------------------------------------------------
  const isInitialScrollPendingRef = useRef<boolean>(true);
  const hasPerformedInitialScrollRef = useRef<boolean>(false);

  const rowVirtualizer = useVirtualizer({
    count: problems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 620,
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

          requestAnimationFrame(() => {
            rowVirtualizer.scrollToIndex(index, { align: 'start', behavior: 'auto' });
            setTimeout(() => {
              isInitialScrollPendingRef.current = false;
            }, 350);
          });
          return;
        }
      }

      const firstProblem = problems[0];
      setActiveProblemId(firstProblem.id);
      window.history.replaceState(null, '', `${window.location.pathname}#problem-${firstProblem.id}`);
      isInitialScrollPendingRef.current = false;
    }
  }, [problemId, problems, rowVirtualizer, setActiveProblemId]);

  // Scroll Listener for real-time focus detection & URL Hash sync
  useEffect(() => {
    const parent = parentRef.current;
    if (!parent || problems.length === 0) return;

    let debounceTimer: any = null;
    const handleScroll = () => {
      if (isInitialScrollPendingRef.current) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isInitialScrollPendingRef.current) return;

        const virtualItems = rowVirtualizer.getVirtualItems();
        if (virtualItems.length === 0) return;

        const scrollTop = parent.scrollTop;
        const currentItem = virtualItems.reduce((closest, item) => {
          const distance = Math.abs(item.start - scrollTop);
          const closestDistance = Math.abs(closest.start - scrollTop);
          return distance < closestDistance ? item : closest;
        }, virtualItems[0]);

        if (currentItem && problems[currentItem.index]) {
          const currentProblem = problems[currentItem.index];
          setActiveProblemId(currentProblem.id);

          const newHash = `#problem-${currentProblem.id}`;
          if (window.location.hash !== newHash) {
            window.history.replaceState(null, '', `${window.location.pathname}${newHash}`);
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

  // ---------------------------------------------------------------------------
  // Metadata modal handlers
  // ---------------------------------------------------------------------------
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
        topic_id: editTopicId || null,
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
        setEditTopicId(res.tagResult.topic_id ?? '');
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
    <div className="flex flex-col lg:flex-row relative min-h-[calc(100vh-100px)]">
      {/* Sidebar Filter & Problem Outline Nav */}
      <Sidebar onSelectProblemOutline={handleSelectProblemOutline} />

      {/* Main Virtualized Problem Stream Feed */}
      <section className="flex-1 flex flex-col min-w-0" aria-label="錯題串流列表">
        <h1 className="sr-only">{currentSubjectLabel}{currentTopicLabel} 錯題刷題複習</h1>

        <div className="pl-3 sm:pl-6 lg:pl-9 pr-2 sm:pr-4 lg:pr-5 pt-2 md:pt-0">
          <GuestNoticeBanner />
        </div>
        {isLoading && problems.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : problems.length === 0 ? (
          <div className="bg-surface border border-border-subtle rounded-3xl p-12 text-center text-xs text-text-muted">
            目前這個篩選條件下沒有錯題紀錄。請在右上角上傳新錯題！
          </div>
        ) : (
          <div ref={parentRef} className="flex-1 overflow-y-auto max-h-[calc(100vh-110px)] pl-0 sm:pl-6 lg:pl-9  pr-0 sm:pr-4 lg:pr-5 py-1">
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
                  className="px-6 py-2.5 rounded-2xl bg-neutral-100 text-xs font-medium text-text-main hover:bg-neutral-200 transition-colors"
                >
                  {isLoading ? '載入中...' : '載入更多錯題'}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Floating UI Layer */}
      <FloatingPenToolbar />
      {/* <EraserFAB /> */}

      {/* Medium Screen (iPad) Sidebar Trigger FAB */}
      <div className="hidden md:flex lg:hidden fixed bottom-6 left-6 z-40">
        <button
          onClick={() => setMobileDrawerOpen(true)}
          className="p-4 rounded-full bg-primary text-white shadow-xl hover:bg-primary-hover hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center"
          title="開啟章節導航"
        >
          <Layers className="w-6 h-6" />
        </button>
      </div>

      <SmartCTA onStatusResolved={handleStatusResolved} />

      {/* Metadata Edit Modal */}
      <ProblemMetadataModal
        isOpen={Boolean(editingProblem)}
        problem={editingProblem}
        editTopicId={editTopicId}
        editKeywordsStr={editKeywordsStr}
        isAnalyzing={isAnalyzing}
        activeTaxonomies={activeTaxonomies}
        onClose={() => setEditingProblem(null)}
        onTopicIdChange={setEditTopicId}
        onKeywordsStrChange={setEditKeywordsStr}
        onRunAiAnalysis={handleRunAiAnalysis}
        onSave={handleSaveMetadata}
      />
    </div>
  );
};
