import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle,
  Share2,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  Download,
  FileText,
  Plus,
  Minus,
  RotateCcw,
  PenLine,
  ChevronUp,
  ChevronDown,
  Copy,
  Check,
  Link2Off,
  Archive,
  ArchiveRestore,
} from 'lucide-react';
import { Item, DrawData } from '../types';
import { StatusBadge, formatProblemCode } from './StatusBadge';
import { DrawCanvas } from './DrawCanvas';
import { ConfirmModal } from './ConfirmModal';
import {
  getProblemImageUrl,
  updateProblemStatus,
  updateProblemDrawData,
  updateProblemMetadata,
  deleteProblem,
  createShareLink,
  revokeShareLink,
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
    taxonomies,
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
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
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
    return 240;
  }, [problem.draw_data]);

  const calcSpaceHeightRef = useRef<number>(getInitialCalcSpaceHeight());
  const [calcSpaceHeight, setCalcSpaceHeight] = useState<number>(() => calcSpaceHeightRef.current);
  const [typedNotes, setTypedNotes] = useState<string>(problem.typed_notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState<boolean>(false);

  const saveDrawTimerRef = useRef<any>(null);
  const saveNotesTimerRef = useRef<any>(null);

  useEffect(() => {
    setIsResolved(problem.status === 'resolved');
    setTypedNotes(problem.typed_notes || '');
  }, [problem.status, problem.typed_notes]);

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

  const handleShare = async () => {
    try {
      const res = await createShareLink(problem.id, inkVisible);
      const url = `${window.location.origin}/share/${res.token}`;
      setShareToken(res.token);
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    } catch (err) {
      console.error('Failed to create share link:', err);
      showToast('產生分享連結失敗', 'error', 3000);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    } catch {
      // ignore
    }
  };

  const handleRevokeShare = async () => {
    if (!shareToken) return;
    try {
      await revokeShareLink(problem.id, shareToken);
      setShareUrl(null);
      setShareToken(null);
      showToast('已撤銷此公開分享連結', 'info', 2000);
    } catch (err) {
      console.error('Failed to revoke share link:', err);
      showToast('撤銷分享連結失敗', 'error', 3000);
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
  const problemCode = formatProblemCode(problem, taxonomies);

  return (
    <div className="space-y-4 mb-6">
      {/* Visual Divider & Problem Code Header */}
      {problemIndex !== undefined && (
        <div className="flex items-center space-x-3 text-[#9CA3AF] my-2 select-none">
          <div className="flex-1 h-px bg-stone-200 dark:bg-stone-800" />
          <span className="text-[11px] font-mono font-bold tracking-wider px-3 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-[#9CA3AF]">
            {problemCode}
          </span>
          <div className="flex-1 h-px bg-stone-200 dark:bg-stone-800" />
        </div>
      )}

      {/* Main Problem Card Container */}
      <div
        id={`problem-${problem.id}`}
        data-problem-id={problem.id}
        className={`bg-white dark:bg-[#202023] border rounded-3xl p-5 transition-all duration-200 scroll-mt-24 ${isActive
          ? 'border-[#6366F1] shadow-md ring-1 ring-[#6366F1]/20 dark:ring-[#6366F1]/30'
          : 'border-[#E5E7EB] dark:border-[#2C2C30] shadow-xs'
          }`}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB] dark:border-[#2C2C30]">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/40">
              {problemCode}
            </span>
            <StatusBadge
              status={problem.status}
              topicId={problem.topic_id}
              onClickEdit={() => onEditMetadata && onEditMetadata(problem)}
            />
            {problem.status === 'archived' && (
              <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700 flex items-center space-x-1">
                <Archive className="w-3 h-3 text-stone-500" />
                <span>已封存</span>
              </span>
            )}
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
              className={`p-2 rounded-xl text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50 active:scale-95 transition-all ${!inkVisible ? 'text-amber-500 font-semibold bg-amber-50 dark:bg-amber-950/30' : ''
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
                onClick={() => setIsDeleteModalOpen(true)}
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
          <div className="mt-2.5 p-3 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-900/60 text-xs flex flex-wrap items-center justify-between gap-2 text-indigo-900 dark:text-indigo-200">
            <div className="flex items-center space-x-2 min-w-0 flex-1">
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">公開連結:</span>
              <span className="truncate font-mono text-[11px] select-all">{shareUrl}</span>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyShareUrl}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-white dark:bg-stone-800 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-stone-700 active:scale-95 transition-all"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? '已複製' : '點擊複製'}</span>
              </button>
              <button
                type="button"
                onClick={handleRevokeShare}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 active:scale-95 transition-all"
                title="撤銷公開分享連結"
              >
                <Link2Off className="w-3.5 h-3.5" />
                <span>撤銷連結</span>
              </button>
            </div>
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
        <div className="mt-3 relative rounded-2xl overflow-hidden bg-stone-50 dark:bg-[#161618] border border-stone-200/60 dark:border-stone-800 flex flex-col">
          {/* Main Question Image */}
          <div className="w-full relative select-none">
            <img
              src={imageUrl}
              alt="題目"
              className="exam-paper-image w-full h-auto object-contain block select-none pointer-events-none"
            />
          </div>

          {/* Extended Calculation Workspace Area */}
          <div
            style={{ height: `${calcSpaceHeight}px` }}
            className={`w-full relative border-stone-200 dark:border-stone-800 bg-[#FAFAF9] dark:bg-[#17171A] transition-[height] duration-200 ease-out select-none overflow-hidden ${calcSpaceHeight > 0 ? 'border-t border-dashed' : ''
              }`}
          >
            {calcSpaceHeight > 0 && (
              <>
                <div className="absolute inset-0 opacity-35 dark:opacity-20 pointer-events-none bg-[radial-gradient(#9CA3AF_1.2px,transparent_1.2px)] [background-size:18px_18px]" />
                <div className="absolute top-2 left-3 z-10 flex items-center space-x-1.5 text-[11px] text-[#9CA3AF] select-none pointer-events-none bg-white/70 dark:bg-stone-900/70 px-2 py-0.5 rounded-md backdrop-blur-2xs border border-stone-200/50 dark:border-stone-800/50">
                  <PenLine className="w-3 h-3 text-indigo-400" />
                  <span>延伸推導草稿區</span>
                </div>
              </>
            )}
          </div>

          {/* Full Interactive Canvas Overlay */}
          <div className="absolute inset-0 pointer-events-auto">
            <DrawCanvas
              initialDrawData={problem.draw_data}
              onSaveDrawData={handleSaveDraw}
              calcSpaceHeight={calcSpaceHeight}
              activeTool={tool}
              activeColor={penColor}
              activeWidth={penWidth}
              isEraserActive={eraserActive}
              readOnly={readOnly || !inkVisible}
            />
          </div>
        </div>

        {/* Scratchpad Height Controls */}
        {!readOnly && (
          <div className="mt-2 flex items-center justify-between px-1">
            <span className="text-[11px] text-[#9CA3AF]">
              推導區高度: <span className="font-mono text-[#374151] dark:text-[#D1D5DB]">{calcSpaceHeight}px</span>
            </span>
            <div className="flex items-center space-x-1.5">
              {calcSpaceHeight > 0 ? (
                <button
                  type="button"
                  onClick={() => updateCalcHeight(0)}
                  className="px-2 py-1 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-[#4B5563] dark:text-[#D1D5DB] transition-all flex items-center space-x-1 active:scale-95"
                  title="完全收合推導區 (0px)"
                >
                  <ChevronUp className="w-3 h-3" />
                  <span>收合</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => updateCalcHeight(240)}
                  className="px-2 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/50 dark:border-indigo-800/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all flex items-center space-x-1 active:scale-95"
                  title="展開推導區 (預設 240px)"
                >
                  <ChevronDown className="w-3 h-3 text-indigo-500" />
                  <span>展開</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => updateCalcHeight(240)}
                disabled={calcSpaceHeight === 240}
                className="px-2 py-1 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-40 text-[#4B5563] dark:text-[#D1D5DB] transition-all flex items-center space-x-1 active:scale-95"
                title="重設草稿高度至預設值 (240px)"
              >
                <RotateCcw className="w-3 h-3" />
                <span>重設</span>
              </button>
              <button
                type="button"
                onClick={() => updateCalcHeight((h) => Math.max(0, h - 200))}
                disabled={calcSpaceHeight <= 0}
                className="px-2 py-1 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-40 text-[#4B5563] dark:text-[#D1D5DB] transition-all flex items-center space-x-1 active:scale-95"
                title="縮小草稿空間 (-200px)"
              >
                <Minus className="w-3 h-3" />
                <span>縮減</span>
              </button>
              <button
                type="button"
                onClick={() => updateCalcHeight((h) => Math.min(3000, (h === 0 ? 240 : h + 200)))}
                className="px-2.5 py-1 text-xs rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/50 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 transition-all font-medium flex items-center space-x-1 active:scale-95 shadow-2xs"
                title="擴增草稿空間 (+200px)"
              >
                <Plus className="w-3 h-3 text-indigo-500" />
                <span>延伸 (+200px)</span>
              </button>
            </div>
          </div>
        )}

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
        <div className="mt-4 pt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#9CA3AF]">
          <div className="flex items-center space-x-3">
            <span>複習次數: {problem.review_count} 次</span>
            {problem.status === 'archived' && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-medium text-[11px] border border-stone-200 dark:border-stone-700">
                <Archive className="w-3 h-3 text-stone-500" />
                <span>已封存 (已完全掌握)</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {!readOnly && (
              <button
                onClick={handleToggleArchive}
                aria-label={problem.status === 'archived' ? '解除封存' : '封存此題目（確定不會再錯）'}
                className={`inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-medium active:scale-95 transition-all border ${problem.status === 'archived'
                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
                  : 'bg-stone-100 dark:bg-stone-800 text-[#6B7280] dark:text-[#9CA3AF] border-stone-200 dark:border-stone-700 hover:text-[#374151] dark:hover:text-[#D1D5DB] hover:bg-stone-200 dark:hover:bg-stone-700'
                  }`}
                title={problem.status === 'archived' ? '解除封存：移回常規複習流' : '封存題目：確定熟練不再錯，自常規複習流隱藏'}
              >
                {problem.status === 'archived' ? (
                  <>
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    <span>解除封存</span>
                  </>
                ) : (
                  <>
                    <Archive className="w-3.5 h-3.5" />
                    <span>封存題目</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleToggleStatus}
              aria-label={isResolved ? '已標記訂正完畢' : '標記完成訂正'}
              className={`inline-flex items-center space-x-2 px-4 py-2 rounded-xl font-medium active:scale-95 transition-all ${isResolved
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
    </div>
  );
};
