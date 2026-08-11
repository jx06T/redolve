import React, { useState, useEffect, useRef, useCallback } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Item, DrawData } from '../types';
import { formatProblemCode } from './StatusBadge';
import { ConfirmModal } from './ConfirmModal';
import { ShareModal } from './ShareModal';
import { ImageViewerModal } from './ImageViewerModal';
import { ProblemCardHeader } from './problem/ProblemCardHeader';
import { ProblemCardWorkspace } from './problem/ProblemCardWorkspace';
import { ProblemCardScratchpadControls } from './problem/ProblemCardScratchpadControls';
import { ProblemCardFooter } from './problem/ProblemCardFooter';

import {
  getProblemImageUrl,
  fetchProblemById,
  updateProblemStatus,
  updateProblemDrawData,
  updateProblemMetadata,
  deleteProblem,
} from '../services/api';
import { useStore } from '../store/useStore';
import { exportProblemAsImage } from '../utils/exportImage';
import { DEFAULT_CALC_SPACE_HEIGHT, DEFAULT_BASE_WIDTH } from '../config/constants';

interface ProblemCardProps {
  problem: Item;
  problemIndex?: number;
  readOnly?: boolean;
  onEditMetadata?: (problem: Item) => void;
  onStatusResolved?: (problemId: string) => void;
}

export const ProblemCard: React.FC<ProblemCardProps> = ({
  problem,
  problemIndex,
  readOnly = false,
  onEditMetadata,
  onStatusResolved,
}) => {
  const {
    tool,
    penColor,
    penWidth,
    eraserActive,
    updateProblemInStore,
    removeProblemFromStore,
    showToast,
    activeProblemId,
    taxonomies,
    inPageSearchQuery,
    registerInPageMatch,
    unregisterInPageMatch,
    inPageMatches,
    inPageCurrentIndex,
  } = useStore();

  const isActive = activeProblemId === problem.id;

  const getInitialSeq = useCallback(() => {
    if (problem.vector_clock) {
      try {
        const parsed = typeof problem.vector_clock === 'string' ? JSON.parse(problem.vector_clock) : problem.vector_clock;
        return typeof parsed.seq === 'number' ? parsed.seq : 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }, [problem.vector_clock]);

  const [vectorSeq, setVectorSeq] = useState<number>(getInitialSeq);
  const [isResolved, setIsResolved] = useState<boolean>(problem.status === 'resolved');
  const [inkVisible, setInkVisible] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [reloadVersion, setReloadVersion] = useState<number>(0);

  const getInitialCalcSpaceHeight = useCallback(() => {
    if (problem.draw_data) {
      try {
        const parsed: DrawData =
          typeof problem.draw_data === 'string'
            ? JSON.parse(problem.draw_data)
            : problem.draw_data;
        if (typeof parsed.calcSpaceHeight === 'number') {
          return parsed.calcSpaceHeight;
        }
        if (parsed.expansions && parsed.expansions.length > 0) {
          const last = parsed.expansions[parsed.expansions.length - 1];
          if (typeof last.addedHeight === 'number') {
            return Math.max(0, last.addedHeight);
          }
        }
      } catch { }
    }
    return DEFAULT_CALC_SPACE_HEIGHT;
  }, [problem.draw_data]);

  const calcSpaceHeightRef = useRef<number>(getInitialCalcSpaceHeight());
  const [calcSpaceHeight, setCalcSpaceHeight] = useState<number>(() => calcSpaceHeightRef.current);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

  useEffect(() => {
    if (!workspaceRef.current) return;
    const updateWidth = () => {
      if (workspaceRef.current) {
        setContainerWidth(workspaceRef.current.clientWidth);
      }
    };
    updateWidth();
    const ro = new ResizeObserver(() => updateWidth());
    ro.observe(workspaceRef.current);
    return () => ro.disconnect();
  }, []);

  const baseWidth = (() => {
    if (!problem.draw_data) return DEFAULT_BASE_WIDTH;
    try {
      const parsed = typeof problem.draw_data === 'string' ? JSON.parse(problem.draw_data) : problem.draw_data;
      return typeof parsed.baseWidth === 'number' && parsed.baseWidth > 0 ? parsed.baseWidth : DEFAULT_BASE_WIDTH;
    } catch {
      return DEFAULT_BASE_WIDTH;
    }
  })();

  const responsiveScale = containerWidth > 0 ? containerWidth / baseWidth : 1.0;
  const renderedCalcSpaceHeight = Math.round(calcSpaceHeight * responsiveScale);
  const [typedNotes, setTypedNotes] = useState<string>(problem.typed_notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState<boolean>(false);

  const saveDrawTimerRef = useRef<any>(null);
  const saveNotesTimerRef = useRef<any>(null);

  useEffect(() => {
    setIsResolved(problem.status === 'resolved');
    setTypedNotes(problem.typed_notes || '');
  }, [problem.status, problem.typed_notes]);

  const cardRef = useRef<HTMLDivElement>(null);

  // In-Page Search matching logic
  useEffect(() => {
    if (!inPageSearchQuery) {
      unregisterInPageMatch(problem.id);
      return;
    }
    const q = inPageSearchQuery.toLowerCase();
    const source = problem.source?.toLowerCase() || '';
    const keywordsStr = typeof problem.keywords === 'string' ? problem.keywords.toLowerCase() : '';
    const keywordTokens = typeof problem.keyword_tokens === 'string' ? problem.keyword_tokens.toLowerCase() : '';
    const notes = problem.typed_notes?.toLowerCase() || '';
    
    if (source.includes(q) || keywordsStr.includes(q) || keywordTokens.includes(q) || notes.includes(q)) {
      registerInPageMatch(problem.id);
    } else {
      unregisterInPageMatch(problem.id);
    }
  }, [inPageSearchQuery, problem, registerInPageMatch, unregisterInPageMatch]);

  useEffect(() => {
    return () => {
      unregisterInPageMatch(problem.id);
    };
  }, [problem.id, unregisterInPageMatch]);

  const isActiveMatch = inPageMatches.length > 0 && inPageMatches[inPageCurrentIndex] === problem.id;

  useEffect(() => {
    if (isActiveMatch && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActiveMatch]);

  // Sync external draw_data changes on problem switch
  useEffect(() => {
    if (problem.draw_data) {
      try {
        const parsed: DrawData =
          typeof problem.draw_data === 'string'
            ? JSON.parse(problem.draw_data)
            : problem.draw_data;
        if (typeof parsed.calcSpaceHeight === 'number' && parsed.calcSpaceHeight !== calcSpaceHeightRef.current) {
          calcSpaceHeightRef.current = parsed.calcSpaceHeight;
          setCalcSpaceHeight(parsed.calcSpaceHeight);
        }
      } catch { }
    }
  }, [problem.id]);

  const handleToggleStatus = async () => {
    const nextStatus = isResolved ? 'unsolved' : 'resolved';
    const optimisticResolved = !isResolved;
    setIsResolved(optimisticResolved);
    updateProblemInStore(problem.id, {
      status: nextStatus,
      review_count: optimisticResolved ? problem.review_count + 1 : problem.review_count,
    });

    if (optimisticResolved && onStatusResolved) {
      onStatusResolved(problem.id);
    }

    try {
      await updateProblemStatus(problem.id, nextStatus);
    } catch (err) {
      console.error('Failed to update status:', err);
      setIsResolved(!optimisticResolved);
      updateProblemInStore(problem.id, { status: problem.status, review_count: problem.review_count });
    }
  };

  const handleToggleArchive = async () => {
    const isArchived = problem.status === 'archived';
    const nextStatus = isArchived ? (isResolved ? 'resolved' : 'unsolved') : 'archived';
    updateProblemInStore(problem.id, { status: nextStatus });
    if (nextStatus === 'archived') {
      setIsResolved(false);
    }

    try {
      await updateProblemStatus(problem.id, nextStatus);
    } catch (err) {
      console.error('Failed to update archive status:', err);
      updateProblemInStore(problem.id, { status: problem.status });
    }
  };

  const handleTypedNotesChange = (text: string) => {
    setTypedNotes(text);
    setIsSavingNotes(true);
    updateProblemInStore(problem.id, { typed_notes: text });

    if (saveNotesTimerRef.current) {
      clearTimeout(saveNotesTimerRef.current);
    }

    saveNotesTimerRef.current = setTimeout(async () => {
      try {
        await updateProblemMetadata(problem.id, { typed_notes: text });
      } catch (err) {
        console.error('Failed to save typed notes:', err);
      } finally {
        setIsSavingNotes(false);
      }
    }, 600);
  };

  const handleSaveDraw = useCallback(
    (drawData: DrawData, explicitHeight?: number) => {
      const activeHeight = typeof explicitHeight === 'number' ? explicitHeight : calcSpaceHeightRef.current;
      const nextSeq = vectorSeq + 1;
      setVectorSeq(nextSeq);
      const dataWithHeight: DrawData = {
        ...drawData,
        calcSpaceHeight: activeHeight,
      };
      updateProblemInStore(problem.id, {
        draw_data: JSON.stringify(dataWithHeight),
        vector_clock: JSON.stringify({ node: 'client', seq: nextSeq }),
      });

      if (saveDrawTimerRef.current) {
        clearTimeout(saveDrawTimerRef.current);
      }

      saveDrawTimerRef.current = setTimeout(async () => {
        try {
          await updateProblemDrawData(problem.id, dataWithHeight, nextSeq);
        } catch (err) {
          console.error('Failed to save draw:', err);
        }
      }, 400);
    },
    [problem.id, vectorSeq, updateProblemInStore]
  );

  const updateCalcHeight = (newHeight: number | ((prev: number) => number)) => {
    const next = typeof newHeight === 'function' ? newHeight(calcSpaceHeightRef.current) : newHeight;
    const clamped = Math.max(0, Math.min(3000, next));
    calcSpaceHeightRef.current = clamped;
    setCalcSpaceHeight(clamped);

    try {
      const parsed: DrawData = problem.draw_data
        ? (typeof problem.draw_data === 'string' ? JSON.parse(problem.draw_data) : problem.draw_data)
        : { strokes: [], eraserMasks: [] };
      parsed.calcSpaceHeight = clamped;
      parsed.expansions = [{ addedHeight: clamped, atY: clamped }];
      handleSaveDraw(parsed, clamped);
    } catch (err) {
      console.error('Failed to update calc height:', err);
    }
  };

  const confirmDelete = async () => {
    try {
      setIsDeleting(true);
      await deleteProblem(problem.id);
      removeProblemFromStore(problem.id);
      showToast('已刪除錯題', 'success', 2000);
    } catch (err) {
      console.error('Failed to delete:', err);
      showToast('刪除失敗，請稍後重試', 'error', 3000);
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      showToast('正在合成高清訂正圖檔...', 'info', 2000);
      const filename = `redolve_${problem.topic_id || 'problem'}_${problem.id.substring(0, 8)}.png`;
      await exportProblemAsImage(imageUrl, inkVisible ? problem.draw_data : null, filename);
      showToast('錯題卡片已順利導出！', 'success', 2500);
    } catch (err) {
      console.error('Export failed:', err);
      showToast('圖檔導出失敗，請稍後重試', 'error', 3000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleReloadProblem = async () => {
    if (isReloading) return;
    setIsReloading(true);
    try {
      const freshProblem = await fetchProblemById(problem.id);
      updateProblemInStore(problem.id, freshProblem);
      setIsResolved(freshProblem.status === 'resolved');
      setTypedNotes(freshProblem.typed_notes || '');
      setReloadVersion((v) => v + 1);

      if (freshProblem.draw_data) {
        try {
          const parsed: DrawData =
            typeof freshProblem.draw_data === 'string'
              ? JSON.parse(freshProblem.draw_data)
              : freshProblem.draw_data;
          if (typeof parsed.calcSpaceHeight === 'number') {
            calcSpaceHeightRef.current = parsed.calcSpaceHeight;
            setCalcSpaceHeight(parsed.calcSpaceHeight);
          }
        } catch { }
      }
      showToast('已重新載入本題最新狀態', 'success', 2000);
    } catch (err: any) {
      console.error('Failed to reload problem:', err);
      showToast(err?.message || '重新載入失敗，請稍後重試', 'error', 3000);
    } finally {
      setIsReloading(false);
    }
  };

  const keywordsArray: string[] = (() => {
    if (!problem.keywords) return [];
    try {
      const parsed = typeof problem.keywords === 'string' ? JSON.parse(problem.keywords) : problem.keywords;
      if (Array.isArray(parsed)) {
        return parsed.map((k) => String(k).replace(/^"|"$/g, '').trim()).filter(Boolean);
      }
      return [];
    } catch {
      return typeof problem.keywords === 'string'
        ? problem.keywords.split(',').map((k) => k.replace(/^"|"$/g, '').trim()).filter(Boolean)
        : [];
    }
  })();

  // For offline guest items the image is stored locally as a Blob URL and
  // already present in problem.image_url.  Only fall back to the server API
  // endpoint for items that actually live in the cloud (non-blob URLs).
  const isOfflineItem = problem.image_url?.startsWith('blob:');
  const baseImageUrl = isOfflineItem
    ? problem.image_url
    : getProblemImageUrl(problem.id);
  const imageUrl = reloadVersion > 0
    ? `${baseImageUrl}${baseImageUrl.includes('?') ? '&' : '?'}v=${reloadVersion}`
    : baseImageUrl;
  const problemCode = formatProblemCode(problem, taxonomies);

  return (
    <div className="space-y-4 mb-6">
      {/* Visual Divider & Problem Code Header */}
      {problemIndex !== undefined && (
        <div className="flex items-center space-x-3 text-text-muted my-2 select-none">
          <div className="flex-1 h-px bg-border-subtle" />
          <span className="text-[11px] font-mono font-bold tracking-wider px-3 py-1 rounded-full bg-neutral-100 text-text-muted">
            {problemCode}
          </span>
          <div className="flex-1 h-px bg-border-subtle" />
        </div>
      )}

      {/* Main Problem Card Container */}
      <div
        id={`problem-${problem.id}`}
        ref={cardRef}
        data-problem-id={problem.id}
        className={`bg-surface border rounded-3xl p-3 sm:p-5 transition-all duration-300 scroll-mt-[120px] ${
          isActiveMatch
            ? 'border-primary shadow-2xl ring-2 ring-primary ring-offset-2 ring-offset-surface scale-[1.01] z-10 relative'
            : isActive
              ? 'border-primary shadow-md ring-1 ring-primary/20'
              : 'border-border-subtle shadow-xs hover:border-border-subtle/80 hover:shadow-sm'
        }`}
      >
        {/* Header Bar */}
        <ProblemCardHeader
          problem={problem}
          problemCode={problemCode}
          problemIndex={problemIndex}
          readOnly={readOnly}
          isReloading={isReloading}
          inkVisible={inkVisible}
          isExporting={isExporting}
          onReload={handleReloadProblem}
          onToggleInk={() => setInkVisible((prev) => !prev)}
          onExport={handleExport}
          onOpenShareModal={() => setIsShareModalOpen(true)}
          onOpenDeleteModal={() => setIsDeleteModalOpen(true)}
          onEditMetadata={onEditMetadata}
        />

        {/* Keywords Chips */}
        {keywordsArray.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-3 pb-2">
            {keywordsArray.map((kw, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 text-xs rounded-xl bg-neutral-100 text-text-main font-medium max-w-full truncate min-w-0"
              >
                #{kw}
              </span>
            ))}
          </div>
        )}

        {/* Unified Image & Calculation Scratchpad Workspace */}
        <ProblemCardWorkspace
          imageUrl={imageUrl}
          drawData={problem.draw_data}
          calcSpaceHeight={calcSpaceHeight}
          renderedCalcSpaceHeight={renderedCalcSpaceHeight}
          workspaceRef={workspaceRef}
          tool={tool}
          penColor={penColor}
          penWidth={penWidth}
          eraserActive={eraserActive}
          readOnly={readOnly}
          inkVisible={inkVisible}
          onSaveDraw={handleSaveDraw}
          onOpenLightbox={() => setIsLightboxOpen(true)}
        />

        {/* Scratchpad Height Controls */}
        {!readOnly && (
          <ProblemCardScratchpadControls
            calcSpaceHeight={calcSpaceHeight}
            isSavingNotes={isSavingNotes}
            onUpdateCalcHeight={updateCalcHeight}
          />
        )}

        {/* Typed Notes & Calculation Summary Section (Auto-resizing) */}
        <TextareaAutosize
          value={typedNotes}
          onChange={(e) => handleTypedNotesChange(e.target.value)}
          disabled={readOnly}
          placeholder="在此輸入本題的核心觀念、易錯陷阱、解題口訣或公式筆記..."
          minRows={2}
          maxRows={12}
          className="w-full mt-3 p-2.5 rounded-xl bg-surface border border-border-subtle text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none leading-relaxed"
        />

        {/* Bottom Footer Actions */}
        <ProblemCardFooter
          problem={problem}
          isResolved={isResolved}
          readOnly={readOnly}
          onToggleArchive={handleToggleArchive}
          onToggleStatus={handleToggleStatus}
        />
      </div>

      {/* Non-blocking Confirm Delete Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title="刪除錯題"
        message="確定要刪除這張錯題與所有手寫筆跡嗎？刪除後無法復原。"
        confirmText={isDeleting ? '正在刪除...' : '確定刪除'}
        cancelText="取消"
        isDestructive={true}
        onConfirm={confirmDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
      />

      {/* Lightbox Modal */}
      <ImageViewerModal
        isOpen={isLightboxOpen}
        imageUrl={imageUrl}
        onClose={() => setIsLightboxOpen(false)}
      />

      {/* Share Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        problemId={problem.id}
        onClose={() => setIsShareModalOpen(false)}
      />
    </div>
  );
};