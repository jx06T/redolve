import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, Share2, Trash2, Edit3, Eye, EyeOff, Download, FileText, Plus, Minus, RotateCcw, PenLine } from 'lucide-react';
import { Item, DrawData } from '../types';
import { StatusBadge } from './StatusBadge';
import { DrawCanvas } from './DrawCanvas';
import {
  getProblemImageUrl,
  updateProblemStatus,
  updateProblemDrawData,
  updateProblemMetadata,
  deleteProblem,
  createShareLink,
} from '../services/api';
import { useStore } from '../store/useStore';
import { exportProblemAsImage } from '../utils/exportImage';

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

  const seqRef = useRef<number>(getInitialSeq());

  useEffect(() => {
    const currentSeq = getInitialSeq();
    if (currentSeq > seqRef.current) {
      seqRef.current = currentSeq;
    }
  }, [getInitialSeq]);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [inkVisible, setInkVisible] = useState<boolean>(true); // US 3.1 Ink Toggle
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Extended Calculation Workspace Height (default 240px, min 100px)
  const [calcSpaceHeight, setCalcSpaceHeight] = useState<number>(240);

  // Typed Notes Workspace
  const [typedNotes, setTypedNotes] = useState<string>(problem.typed_notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState<boolean>(false);
  const notesTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setTypedNotes(problem.typed_notes || '');
  }, [problem.typed_notes]);

  const handleTypedNotesChange = (val: string) => {
    setTypedNotes(val);
    updateProblemInStore(problem.id, { typed_notes: val });

    if (notesTimerRef.current) {
      clearTimeout(notesTimerRef.current);
    }

    setIsSavingNotes(true);
    notesTimerRef.current = setTimeout(async () => {
      try {
        await updateProblemMetadata(problem.id, { typed_notes: val });
      } catch (err) {
        console.error('Failed to save typed notes:', err);
      } finally {
        setIsSavingNotes(false);
      }
    }, 800);
  };

  const isResolved = problem.status === 'resolved';

  const handleToggleStatus = async () => {
    const nextStatus = isResolved ? 'unsolved' : 'resolved';
    try {
      await updateProblemStatus(problem.id, nextStatus);
      updateProblemInStore(problem.id, {
        status: nextStatus,
        review_count: isResolved ? problem.review_count : problem.review_count + 1,
      });

      // US 4.2: Trigger auto-scroll to next problem when marked as resolved
      if (nextStatus === 'resolved' && onStatusResolved) {
        onStatusResolved(problem.id);
      }
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  const handleSaveDraw = async (drawData: DrawData) => {
    const nextSeq = seqRef.current + 1;
    seqRef.current = nextSeq;

    // Update local Zustand store immediately so ink persists during re-renders/view switching
    updateProblemInStore(problem.id, {
      draw_data: JSON.stringify(drawData),
      vector_clock: JSON.stringify({ node: 'client', seq: nextSeq }),
    });

    try {
      await updateProblemDrawData(problem.id, drawData, nextSeq);
    } catch (err) {
      console.error('Failed to save draw:', err);
    }
  };

  const handleDelete = async () => {
    if (confirm('確定要刪除這張錯題嗎？')) {
      try {
        await deleteProblem(problem.id);
        removeProblemFromStore(problem.id);
      } catch (err) {
        console.error('Failed to delete:', err);
      }
    }
  };

  const handleShare = async () => {
    try {
      const res = await createShareLink(problem.id, inkVisible);
      const url = `${window.location.origin}/share/${res.token}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    } catch (err) {
      console.error('Failed to create share link:', err);
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

  const keywordsArray: string[] = (() => {
    if (!problem.keywords) return [];
    try {
      return typeof problem.keywords === 'string' ? JSON.parse(problem.keywords) : problem.keywords;
    } catch {
      return [];
    }
  })();

  const imageUrl = getProblemImageUrl(problem.id);

  return (
    <div className="space-y-4 mb-6">
      {/* Visual Divider */}
      {problemIndex !== undefined && (
        <div className="flex items-center space-x-3 text-[#9CA3AF] my-2 select-none">
          <div className="flex-1 h-px bg-stone-200 dark:bg-stone-800" />
          <span className="text-[11px] font-mono font-bold tracking-wider px-3 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-[#9CA3AF]">
            Problem {problemIndex + 1}
          </span>
          <div className="flex-1 h-px bg-stone-200 dark:bg-stone-800" />
        </div>
      )}

      {/* Main Problem Card Container */}
      <div
        id={`problem-${problem.id}`}
        data-problem-id={problem.id}
        className={`bg-white dark:bg-[#202023] border rounded-3xl p-5 transition-all duration-200 scroll-mt-24 ${
          isActive
            ? 'border-[#6366F1] shadow-md ring-2 ring-[#6366F1]/20 dark:ring-[#6366F1]/30'
            : 'border-[#E5E7EB] dark:border-[#2C2C30] shadow-xs'
        }`}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB] dark:border-[#2C2C30]">
          <div className="flex items-center space-x-2">
            <StatusBadge
              status={problem.status}
              topicId={problem.topic_id}
              topicLabel={problem.topic_id ?? undefined}
              onClickEdit={() => onEditMetadata && onEditMetadata(problem)}
            />
            {problem.source && (
              <span className="text-xs text-[#9CA3AF] px-2.5 py-1 rounded-xl bg-stone-100 dark:bg-stone-800/60 font-medium">
                {problem.source}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1">
            {/* US 3.1 Ink Hide/Show Toggle Button */}
            <button
              onClick={() => setInkVisible((prev) => !prev)}
              aria-label={inkVisible ? '隱藏筆跡 (二刷原題)' : '顯示筆跡'}
              className={`p-2 rounded-xl text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50 active:scale-95 transition-all ${
                !inkVisible ? 'text-amber-500 font-semibold bg-amber-50 dark:bg-amber-950/30' : ''
              }`}
              title={inkVisible ? '隱藏筆跡 (二刷原題)' : '顯示筆跡'}
            >
              {inkVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-amber-500" />}
            </button>

            {/* Export High-res Image Button */}
            <button
              onClick={handleExport}
              disabled={isExporting}
              aria-label="導出高清訂正圖檔"
              className="p-2 rounded-xl text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50 active:scale-95 transition-all"
              title="導出合成圖檔 (PNG)"
            >
              <Download className="w-4 h-4" />
            </button>

            {onEditMetadata && (
              <button
                onClick={() => onEditMetadata(problem)}
                aria-label="編輯標籤與分類"
                className="p-2 rounded-xl text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50 active:scale-95 transition-all"
                title="編輯標籤"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={handleShare}
              aria-label="複製公開分享連結"
              className="p-2 rounded-xl text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50 active:scale-95 transition-all"
              title="分享題目"
            >
              <Share2 className="w-4 h-4" />
            </button>

            {!readOnly && (
              <button
                onClick={handleDelete}
                aria-label="刪除此錯題"
                className="p-2 rounded-xl text-[#9CA3AF] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 active:scale-95 transition-all"
                title="刪除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {shareUrl && (
          <div className="mt-2 p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-900/50 text-xs flex items-center justify-between text-indigo-700 dark:text-indigo-300">
            <span className="truncate mr-2">{shareUrl}</span>
            <span className="font-semibold shrink-0">{isCopied ? '已複製連結' : '點擊複製'}</span>
          </div>
        )}

        {/* Keywords Chips */}
        {keywordsArray.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-3 pb-2">
            {keywordsArray.map((kw, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 text-xs rounded-xl bg-stone-100 dark:bg-stone-800 text-[#374151] dark:text-[#D1D5DB] font-medium"
              >
                #{kw}
              </span>
            ))}
          </div>
        )}

        {/* Unified Image & Calculation Scratchpad Workspace */}
        <div className="relative mt-3 rounded-2xl overflow-hidden bg-stone-50 dark:bg-[#161618] border border-stone-200/60 dark:border-stone-800 flex flex-col">
          {/* Top Exam Question Image */}
          <div className="w-full relative select-none">
            <img
              src={imageUrl}
              alt="錯題題目圖片"
              className="exam-paper-image w-full h-auto object-contain block select-none pointer-events-none"
              loading="lazy"
            />
          </div>

          {/* Extended Calculation Workspace Below Image */}
          <div
            style={{ height: `${calcSpaceHeight}px` }}
            className="w-full relative border-t border-dashed border-stone-200 dark:border-stone-800 bg-[#FAFAF9] dark:bg-[#17171A] transition-all duration-150 select-none"
          >
            {/* Subtle Dot Grid Background Pattern */}
            <div className="absolute inset-0 opacity-35 dark:opacity-20 pointer-events-none bg-[radial-gradient(#9CA3AF_1.2px,transparent_1.2px)] [background-size:18px_18px]" />

            {/* Visual Workspace Label */}
            <div className="absolute top-2.5 left-3.5 flex items-center space-x-1.5 text-[11px] text-[#9CA3AF] pointer-events-none select-none font-medium">
              <PenLine className="w-3.5 h-3.5 text-indigo-500/70" />
              <span>手寫計算與推導草稿區</span>
            </div>

            {/* Workspace Height Controls */}
            {!readOnly && (
              <div className="absolute bottom-2.5 right-3.5 z-10 flex items-center space-x-1.5 bg-white/90 dark:bg-stone-800/90 border border-stone-200 dark:border-stone-700/80 rounded-xl p-1 shadow-xs backdrop-blur-xs">
                {calcSpaceHeight > 120 && (
                  <button
                    type="button"
                    onClick={() => setCalcSpaceHeight((h) => Math.max(100, h - 200))}
                    className="px-2 py-1 text-xs rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700 text-[#4B5563] dark:text-[#D1D5DB] transition-all font-medium flex items-center space-x-1 active:scale-95"
                    title="收回空間 (-200px)"
                  >
                    <Minus className="w-3 h-3 text-stone-500" />
                    <span>收回</span>
                  </button>
                )}
                {calcSpaceHeight !== 240 && (
                  <button
                    type="button"
                    onClick={() => setCalcSpaceHeight(240)}
                    className="p-1 text-xs rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700 text-[#6B7280] dark:text-[#9CA3AF] transition-all active:scale-95"
                    title="重設為預設高度 (240px)"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCalcSpaceHeight((h) => Math.min(1600, h + 200))}
                  className="px-2.5 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 transition-all font-medium flex items-center space-x-1 active:scale-95"
                  title="擴增草稿空間 (+200px)"
                >
                  <Plus className="w-3 h-3 text-indigo-500" />
                  <span>延伸 (+200px)</span>
                </button>
              </div>
            )}
          </div>

          {/* Overlay DrawCanvas Spanning Image + Calculation Area */}
          <div className="absolute inset-0 pointer-events-auto">
            <DrawCanvas
              initialDrawData={problem.draw_data}
              readOnly={readOnly}
              inkVisible={inkVisible}
              onSaveDrawData={handleSaveDraw}
              onExpandSpace={(added) => setCalcSpaceHeight((h) => h + added)}
              activeTool={tool}
              activeColor={penColor}
              activeWidth={penWidth}
              isEraserActive={eraserActive}
            />
          </div>
        </div>

        {/* Typed Notes & Calculation Summary Section */}
        <div className="mt-3.5 rounded-2xl bg-stone-50/70 dark:bg-[#18181B] border border-stone-200/60 dark:border-stone-800/80 p-3.5 transition-all">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2 text-xs font-semibold text-[#4B5563] dark:text-[#D1D5DB]">
              <FileText className="w-3.5 h-3.5 text-indigo-500" />
              <span>文字筆記 / 解題思路與觀念總結</span>
            </div>
            <span className="text-[10px] text-[#9CA3AF] font-mono">
              {isSavingNotes ? '正在同步存檔...' : '支援即時打字'}
            </span>
          </div>
          <textarea
            value={typedNotes}
            onChange={(e) => handleTypedNotesChange(e.target.value)}
            disabled={readOnly}
            placeholder="在此輸入本題的核心觀念、易錯陷阱、解題口訣或公式筆記..."
            rows={2}
            className="w-full p-2.5 rounded-xl bg-white dark:bg-[#202023] border border-stone-200 dark:border-stone-700/80 text-xs text-[#374151] dark:text-[#E5E7EB] placeholder:text-[#9CA3AF] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-y leading-relaxed"
          />
        </div>

        {/* Bottom Footer Actions */}
        <div className="mt-4 pt-3 flex items-center justify-between text-xs text-[#9CA3AF]">
          <div>
            <span>複習次數: {problem.review_count} 次</span>
          </div>
          <button
            onClick={handleToggleStatus}
            aria-label={isResolved ? '已標記訂正完畢' : '標記完成訂正'}
            className={`inline-flex items-center space-x-2 px-5 py-2.5 rounded-2xl font-medium active:scale-95 transition-all ${
              isResolved
                ? 'bg-[#10B981] text-white hover:bg-[#059669]'
                : 'bg-stone-100 dark:bg-stone-800 text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-200 dark:hover:bg-stone-700'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            <span>{isResolved ? '已標記訂正完畢' : '標記完成訂正'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
