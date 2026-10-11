import React, { useState, useEffect, useRef, useCallback } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Item, DrawData } from '../types';
import { formatProblemCode } from './StatusBadge';
import { ConfirmModal } from './ConfirmModal';
import { getQueuedDraws } from '../services/offlineStorage';
import { ShareModal } from './ShareModal';
import { ImageViewerModal } from './ImageViewerModal';
import { ProblemCardHeader } from './problem/ProblemCardHeader';
import { ProblemCardWorkspace } from './problem/ProblemCardWorkspace';
import { ProblemCardScratchpadControls } from './problem/ProblemCardScratchpadControls';
import { ProblemCardFooter } from './problem/ProblemCardFooter';
import { SmartCTA } from './SmartCTA';
import { useOwnedWork } from '../hooks/useOwnedWork';
import { itemInk, itemInkSeq } from '../services/ownedWorkController';
import { downloadWorkDraft } from '../services/workService';
import { AppDialog } from './AppDialog';
import { DrawCanvas } from './DrawCanvas';

import {
  getProblemImageUrl,
  fetchProblemById,
} from '../services/api';
import { useStore } from '../store/useStore';
import { useProblemActions } from '../hooks/useProblemActions';
import { exportProblemAsImage } from '../utils/exportImage';
import { DEFAULT_CALC_SPACE_HEIGHT, DEFAULT_BASE_WIDTH } from '../config/constants';
import { Link } from 'react-router-dom';

export type ProblemCardWork={
  image:string;saveInk:(data:DrawData)=>void;saveNotes:(notes:string)=>void;
  toggleStatus:()=>Promise<void>;toggleArchive:()=>Promise<void>;reload:()=>Promise<void>;
  copyText?:()=>Promise<string>;remove?:()=>void;share?:()=>void;
  references?:DrawData[];label:React.ReactNode;notesLabel?:string;syncStatus?:React.ReactNode;beforeWorkspace?:React.ReactNode;afterNotes?:React.ReactNode;footerActions?:React.ReactNode;reloadLabel?:string;
};
interface ProblemCardProps {
  work?:ProblemCardWork;onAddToCollection?:()=>void;
  problem: Item;
  problemIndex?: number;
  readOnly?: boolean;
  onEditMetadata?: (problem: Item) => void;
  onStatusResolved?: (problemId: string) => void;
  onDeleted?: (problemId: string) => void;
  onChanged?: () => void;
  streamSearch?: boolean;
  onNext?: () => void;
  memberships?: {entry_id:string;collection_id:string;title:string;state:string;
    lifecycle:string;visibility:string}[];
}

export const ProblemCard: React.FC<ProblemCardProps> = ({
  problem: inputProblem,
  problemIndex,
  readOnly = false,
  onEditMetadata,
  onStatusResolved,
  onDeleted,
  onChanged,
  streamSearch = false,
  memberships = [],work,onAddToCollection,onNext,
}) => {
  const {
    tool,
    penColor,
    penWidth,
    eraserActive,
    updateProblemInStore,
    showToast,
    activeProblemId,
    taxonomies,
    inPageSearchQuery,
    registerInPageMatch,
    unregisterInPageMatch,
    inPageMatches,
    inPageCurrentIndex,
  } = useStore();

  const { toggleStatus, toggleArchive, saveDrawData, saveTypedNotes, deleteItem } = useProblemActions();

  const ownedEnabled = !work && !inputProblem.id.startsWith('temp_');
  const owned = useOwnedWork(inputProblem, ownedEnabled);
  const problem = React.useMemo(() => owned.state ? {...inputProblem,
    draw_data: JSON.stringify(owned.state.ink), typed_notes: owned.state.notes,
    draw_seq: owned.state.inkSeq, notes_seq: owned.state.notesSeq} : inputProblem, [inputProblem, owned.state]);
  const workspaceReadOnly = readOnly || ownedEnabled && (!owned.state || owned.state.restoring || owned.state.storageFailed);
  const [cloudWork, setCloudWork] = useState<Item | null>(null);
  const [workError, setWorkError] = useState('');

  const isActive = activeProblemId === problem.id;

  const offlineSeq = useRef(itemInkSeq(problem));
  const [isResolved, setIsResolved] = useState<boolean>(problem.status === 'resolved');
  const [inkVisible, setInkVisible] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [reloadVersion, setReloadVersion] = useState<number>(0);
  const [readyImage, setReadyImage] = useState<string>('');

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
  // Folding is a view operation: keep the saved coordinate space and ink intact.
  const [isScratchpadCollapsed, setIsScratchpadCollapsed] = useState(false);
  const latestDrawDataRef = useRef<DrawData | null>(null);

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
    if (!problem.draw_data) return containerWidth > 0 ? containerWidth : DEFAULT_BASE_WIDTH;
    try {
      const parsed = typeof problem.draw_data === 'string' ? JSON.parse(problem.draw_data) : problem.draw_data;
      if (typeof parsed?.baseWidth === 'number' && parsed.baseWidth > 0) {
        return parsed.baseWidth;
      }
      // If legacy strokes exist without baseWidth, fallback to DEFAULT_BASE_WIDTH for scale consistency
      if (Array.isArray(parsed?.strokes) && parsed.strokes.length > 0) {
        return DEFAULT_BASE_WIDTH;
      }
      return containerWidth > 0 ? containerWidth : DEFAULT_BASE_WIDTH;
    } catch {
      return containerWidth > 0 ? containerWidth : DEFAULT_BASE_WIDTH;
    }
  })();

  const responsiveScale = containerWidth > 0 && baseWidth > 0 ? containerWidth / baseWidth : 1.0;
  const renderedCalcSpaceHeight = Math.round(calcSpaceHeight * responsiveScale);
  const [typedNotes, setTypedNotes] = useState<string>(problem.typed_notes || '');
  const [isSavingInk,setIsSavingInk]=useState(false);
  const drawSavingSeq=useRef(0),notesSavingSeq=useRef(0);
  const [isSavingNotes, setIsSavingNotes] = useState<boolean>(false);

  useEffect(() => {
    setIsResolved(problem.status === 'resolved');
    setTypedNotes(problem.typed_notes || '');
  }, [problem.status, problem.typed_notes]);

  const cardRef = useRef<HTMLDivElement>(null);

  // In-Page Search matching logic
  useEffect(() => {
    if(streamSearch)return;
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
  }, [inPageSearchQuery, problem, registerInPageMatch, unregisterInPageMatch,streamSearch]);

  useEffect(() => {
    return () => {
      if(!streamSearch)unregisterInPageMatch(problem.id);
    };
  }, [problem.id, unregisterInPageMatch,streamSearch]);

  const isActiveMatch = inPageMatches.length > 0 && inPageMatches[inPageCurrentIndex] === problem.id;

  useEffect(() => {
    if (isActiveMatch && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActiveMatch]);

  // Sync external draw_data changes on problem switch
  useEffect(() => {
    latestDrawDataRef.current = null;
    setIsScratchpadCollapsed(false);
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

  useEffect(()=>{
    if((!work&&!owned.state)||!problem.draw_data)return;
    try{const ink:DrawData=JSON.parse(problem.draw_data);latestDrawDataRef.current=ink;
      if(typeof ink.calcSpaceHeight==='number'){calcSpaceHeightRef.current=ink.calcSpaceHeight;setCalcSpaceHeight(ink.calcSpaceHeight);}
    }catch{/* Leave a valid local workspace intact. */}
  },[work||owned.state?problem.draw_data:null]);

  const handleToggleStatus = async () => {
    if(readOnly)return false;
    if(work){try{await work.toggleStatus();onChanged?.();return true;}catch(e){showToast(e instanceof Error?e.message:'儲存失敗','error');return false;}}
    const nextStatus = await toggleStatus(problem);onChanged?.();
    setIsResolved(nextStatus === 'resolved');
    if (nextStatus === 'resolved' && onStatusResolved) {
      onStatusResolved(problem.id);
    }
    return nextStatus === 'resolved';
  };

  const handleToggleArchive = async () => {
    if(readOnly)return;
    if(work){try{await work.toggleArchive();onChanged?.();}catch(e){showToast(e instanceof Error?e.message:'儲存失敗','error');}return;}
    await toggleArchive(problem,{retainCard:streamSearch});onChanged?.();
    // Bug 3 fix: the resulting status is always either 'archived' or 'unsolved',
    // never 'resolved'. Sync local state unconditionally to prevent stale isResolved.
    setIsResolved(false);
  };

  const handleTypedNotesChange = (text: string) => {
    if(workspaceReadOnly)return;
    setTypedNotes(text);
    if(work){work.saveNotes(text);return;}
    if(owned.controller){owned.controller.notes(text);return;}
    setIsSavingNotes(true);const generation=++notesSavingSeq.current;
    updateProblemInStore(problem.id, { typed_notes: text });

    void (async () => {
      try {
        await saveTypedNotes(problem, text);
      } finally {
        if(generation===notesSavingSeq.current)setIsSavingNotes(false);
      }
    })();
  };

  const handleSaveDraw = useCallback(
    (drawData: DrawData, explicitHeight?: number) => {
      const activeHeight = typeof explicitHeight === 'number' ? explicitHeight : calcSpaceHeightRef.current;
      const dataWithHeight: DrawData = { ...drawData, calcSpaceHeight: activeHeight };
      latestDrawDataRef.current = dataWithHeight;

      if(workspaceReadOnly)return;
      if(work){work.saveInk(dataWithHeight);return;}
      if(owned.controller){owned.controller.ink(dataWithHeight);return;}
      setIsSavingInk(true);const generation=++drawSavingSeq.current;
      const nextSeq=++offlineSeq.current;
      void (async () => {
        try{await saveDrawData(problem, dataWithHeight, nextSeq);}finally{if(generation===drawSavingSeq.current)setIsSavingInk(false);}
      })();
    },
    [problem, saveDrawData,work,workspaceReadOnly,owned.controller]
  );

  const updateCalcHeight = (newHeight: number | ((prev: number) => number)) => {
    const next = typeof newHeight === 'function' ? newHeight(calcSpaceHeightRef.current) : newHeight;
    const clamped = Math.max(0, Math.min(3000, next));
    calcSpaceHeightRef.current = clamped;
    setCalcSpaceHeight(clamped);
    if (clamped > 0) setIsScratchpadCollapsed(false);

    try {
      const parsed: DrawData = latestDrawDataRef.current ?? (problem.draw_data
        ? (typeof problem.draw_data === 'string' ? JSON.parse(problem.draw_data) : problem.draw_data)
        : { strokes: [], eraserMasks: [] });
      handleSaveDraw({ ...parsed, calcSpaceHeight: clamped,
        baseWidth: parsed.baseWidth || baseWidth,
        expansions: [{ addedHeight: clamped, atY: clamped }],
      }, clamped);
    } catch (err) {
      console.error('Failed to update calc height:', err);
    }
  };

  const confirmDelete = async () => {
    try {
      setIsDeleting(true);
      await deleteItem(problem);
      onDeleted?.(problem.id);
    } catch {
      // toast already shown by deleteItem
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
      if(work){await work.reload();setReloadVersion(v=>v+1);return;}
      if (problem.id.startsWith('temp_')) {
        setIsReloading(false);
        return;
      }
      const freshProblem = await fetchProblemById(problem.id);
      if(owned.controller?.pending()) {setCloudWork(freshProblem);return;}
      owned.controller?.adoptCloud(freshProblem);
      latestDrawDataRef.current = null;
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
  const baseImageUrl = work?work.image:isOfflineItem
    ? problem.image_url
    : getProblemImageUrl(problem.id);
  const imageUrl = reloadVersion > 0
    ? `${baseImageUrl}${baseImageUrl.includes('?') ? '&' : '?'}v=${reloadVersion}`
    : baseImageUrl;
  const problemCode = formatProblemCode(problem, taxonomies);

  return (
    <div data-reader-loading={readyImage !== imageUrl} style={{'--reader-row-margin':'1.5rem'} as React.CSSProperties} className="space-y-4 mb-6">
      {onNext&&isActive&&!readOnly&&<SmartCTA action={{resolved:isResolved,disabled:problem.status==='archived',run:async()=>{
        if(isResolved||await handleToggleStatus())onNext();
      }}}/>}
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
          onOpenShareModal={work?work.share:()=>setIsShareModalOpen(true)}
          onOpenDeleteModal={work?undefined:()=>setIsDeleteModalOpen(true)}
          copyText={work?.copyText}
          onEditMetadata={onEditMetadata}
          reloadLabel={work?.reloadLabel}
          sourceLabel={work?.label||memberships.filter(m=>m.state==='included'&&m.lifecycle!=='deleted').slice(0,2).map(m=><Link key={m.entry_id} to={`/settings/collections/${m.collection_id}`} className="rounded-lg bg-neutral-100 px-2.5 py-1 text-xs text-text-muted underline">{m.lifecycle==='active'?(m.visibility==='public'?'公開':'共用'):m.lifecycle==='draft'?'草稿':'已暫停'} · {m.title}</Link>)}
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

        {work?.beforeWorkspace}
        {/* Unified Image & Calculation Scratchpad Workspace */}
        <ProblemCardWorkspace
          imageUrl={imageUrl}
          onImageReady={() => setReadyImage(imageUrl)}
          drawData={problem.draw_data}
          referenceLayers={work?.references}
          calcSpaceHeight={calcSpaceHeight}
          renderedCalcSpaceHeight={isScratchpadCollapsed ? 0 : renderedCalcSpaceHeight}
          workspaceRef={workspaceRef}
          tool={tool}
          penColor={penColor}
          penWidth={penWidth}
          eraserActive={eraserActive}
          readOnly={workspaceReadOnly}
          inkVisible={inkVisible}
          onSaveDraw={handleSaveDraw}
          onOpenLightbox={() => setIsLightboxOpen(true)}
        />

        {/* Scratchpad Height Controls */}
        {(!readOnly || work?.syncStatus || owned.state) && (
          <ProblemCardScratchpadControls
            calcSpaceHeight={calcSpaceHeight}
            isCollapsed={isScratchpadCollapsed || calcSpaceHeight === 0}
            onToggleCollapse={() => {
              if (calcSpaceHeight === 0) updateCalcHeight(DEFAULT_CALC_SPACE_HEIGHT);
              else setIsScratchpadCollapsed((previous) => !previous);
            }}
            isSavingNotes={isSavingNotes}
            syncStatus={work?.syncStatus ?? (owned.state&&<><span role="status" aria-atomic="true">{owned.state.restoring?'還原本機草稿…':owned.state.storageFailed?'本機儲存失敗':owned.state.status==='conflict'?'版本待核對':owned.state.status==='error'?'同步失敗':owned.state.status==='saving'?'正在同步存檔…':owned.state.status==='pending'?'本機已保存，等待同步…':'支援即時打字'}</span>{owned.state.status==='error'&&(!owned.state.storageFailed||owned.controller?.pending())&&<button type="button" onClick={owned.controller?.retry} className="text-text-muted underline underline-offset-2">重試同步</button>}</>)}
            readOnly={workspaceReadOnly}
            onUpdateCalcHeight={updateCalcHeight}
          />
        )}

        {/* Typed Notes & Calculation Summary Section (Auto-resizing) */}
        <TextareaAutosize
          aria-label={work?.notesLabel||'本題筆記'}
          value={typedNotes}
          onChange={(e) => handleTypedNotesChange(e.target.value)}
          disabled={workspaceReadOnly}
          placeholder="在此輸入本題的核心觀念、易錯陷阱、解題口訣或公式筆記..."
          minRows={2}
          maxRows={12}
          className="w-full mt-3 p-2.5 rounded-xl bg-surface border border-border-subtle text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none leading-relaxed"
        />

        {work?.afterNotes}
        {owned.state&&(owned.state.status==='conflict'||owned.state.status==='error')&&<div className="mt-3 space-y-2 text-xs text-text-muted">
          <p role="alert">{owned.state.error}{!owned.state.storageFailed&&' 本機草稿會在重新整理後還原。'}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={()=>downloadWorkDraft(owned.state!.ink,owned.state!.notes)} className="rounded-xl border border-border-subtle px-3 py-2">下載本機作業</button>
            {owned.state.status==='conflict'&&<button type="button" disabled={isReloading} onClick={()=>void handleReloadProblem()} className="rounded-xl border border-border-subtle px-3 py-2">核對雲端版本</button>}
          </div>
        </div>}
        {/* Bottom Footer Actions */}
        <ProblemCardFooter
          problem={problem}
          isResolved={isResolved}
          readOnly={readOnly}
          onAddToCollection={onAddToCollection}
          actions={work?.footerActions}
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
        canCreate={!problem.id.startsWith('temp_')}
        blockedReason={problem.id.startsWith('temp_')?'請先將題目同步至雲端，再建立分享連結。':isSavingInk||isSavingNotes||owned.controller?.pending()||owned.state?.restoring?'請先完成作業同步，再建立分享連結。':''}
        beforeCreate={async()=>{if(!navigator.onLine)throw new Error('需要連線才能建立分享');if(owned.controller?.pending())throw new Error('此題還有未同步作業');const drafts=await getQueuedDraws();if(drafts.some(d=>d.id===problem.id))throw new Error('此題還有未同步作業，請完成同步後再分享。');}}
        onClose={() => setIsShareModalOpen(false)}
      />
      {cloudWork&&<AppDialog title="核對雲端與本機作業" onClose={()=>{setCloudWork(null);setWorkError('');}}>
        <p className="text-xs text-text-muted">本機作業仍在題卡上。選擇任一版本前，系統會保留兩份內容的本機備份；筆跡不會自動合併。</p>
        <h3 className="mt-3 text-sm font-medium">雲端筆記</h3><p className="mt-1 whitespace-pre-wrap text-sm">{cloudWork.typed_notes||'無筆記'}</p>
        <div className="relative mt-3 h-52 overflow-hidden rounded-xl border border-border-subtle bg-page-bg"><DrawCanvas initialDrawData={itemInk(cloudWork)} readOnly inkVisible/></div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={()=>downloadWorkDraft(owned.state!.ink,owned.state!.notes)} className="rounded-xl border border-border-subtle px-3 py-2 text-sm">下載本機作業</button>
          <button onClick={()=>{try{owned.controller?.adoptCloud(cloudWork);setCloudWork(null);setWorkError('');}catch{setWorkError('備份寫入失敗；尚未替換任何作業，請先下載本機作業。');}}} className="rounded-xl border border-border-subtle px-3 py-2 text-sm">採用雲端作業</button>
          <button onClick={()=>{try{owned.controller?.keepLocal(cloudWork);setCloudWork(null);setWorkError('');}catch{setWorkError('備份寫入失敗；尚未覆蓋任何作業，請先下載本機作業。');}}} className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">以本機作業更新雲端</button>
        </div>
        {workError&&<p role="alert" className="mt-3 text-xs text-text-muted">{workError}</p>}
      </AppDialog>}
    </div>
  );
};
