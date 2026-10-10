import React, { useEffect, useState } from 'react';
import type { Item, TaxonomyNode } from '../types';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Filter, Layers, ListOrdered, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';
import { STATUS_FILTER_ITEMS } from '../config/constants';
import { formatProblemCode, getTaxonomyPath } from './StatusBadge';
import { CustomSelect } from './CustomSelect';

interface SidebarProps {
  onSelectProblemOutline?: (problemId: string) => void;
  scope?: {subject:string;topic:string|null;status:string;problems:Item[];outline?:Item[];taxonomies:TaxonomyNode[];
    onSubject:(id:string)=>void;onTopic:(id:string|null)=>void;onStatus:(status:string)=>void;loading?:boolean};
  children?: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({ onSelectProblemOutline, scope, children }) => {
  const navigate = useNavigate();

  const {
    mobileDrawerOpen,
    setMobileDrawerOpen,
    selectedSubjectId:storeSubject,
    setSelectedSubjectId:storeSetSubject,
    selectedTopicId:storeTopic,
    setSelectedTopicId:storeSetTopic,
    selectedStatus:storeStatus,
    setSelectedStatus:storeSetStatus,
    problems:storeProblems,
    activeProblemId,
    sidebarCollapsed,
    toggleSidebarCollapsed,
    taxonomies:storeTaxonomies,
    taxonomyCounts:storeCounts,
  } = useStore();
  const selectedSubjectId=scope?.subject||storeSubject;
  const selectedTopicId=scope?scope.topic:storeTopic;
  const selectedStatus=scope?.status||storeStatus;
  const setSelectedSubjectId=scope?.onSubject||storeSetSubject;
  const setSelectedTopicId=scope?.onTopic||storeSetTopic;
  const setSelectedStatus=scope?.onStatus||storeSetStatus;
  const problems=scope?.problems||storeProblems;
  const taxonomies=scope?.taxonomies||storeTaxonomies;
  const taxonomyCounts=scope?{}:storeCounts;
  const [desktop,setDesktop]=useState(()=>window.matchMedia('(min-width:1024px)').matches);
  useEffect(()=>{const media=window.matchMedia('(min-width:1024px)');const update=()=>setDesktop(media.matches);media.addEventListener('change',update);return ()=>media.removeEventListener('change',update);},[]);

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

  const getAllDescendantIds = (node: { id: string; children?: any[] }): string[] => {
    let ids = [node.id];
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        ids = [...ids, ...getAllDescendantIds(child)];
      }
    }
    return ids;
  };

  // --- 2. 獲取任何節點的計數 (超級精簡版)
  const computeCountForNode = (node: { id: string; children?: any[] }): number => {
    const hasServerData = taxonomyCounts && Object.keys(taxonomyCounts).length > 0;

    if (hasServerData) {
      // 💯 Server 已經幫我們做完完美的 Bottom-Up Rollup 了！
      const rawCount = taxonomyCounts[node.id] as any;
      if (!rawCount) return 0;

      if (typeof rawCount === 'number') {
        return selectedStatus === 'all' ? rawCount : 0;
      } else {
        return selectedStatus === 'all' ? (rawCount.total || 0) : (rawCount[selectedStatus] || 0);
      }
    } else {
      // 🛟 如果 Server 還沒回傳資料，前端乖乖自己算 (一樣不遞迴，攤平比對最安全)
      const validIds = getAllDescendantIds(node);
      return problems.filter((p) => {
        const isStatusMatch = selectedStatus === 'all' ? p.status !== 'archived' : p.status === selectedStatus;
        const isTopicMatch = validIds.includes(p.topic_id || '');
        return isStatusMatch && isTopicMatch;
      }).length;
    }
  };

  // --- 3. 科目總數
  const subjectTotalCount = currentSubjectId==='all'?problems.length:activeSubject
    ? computeCountForNode(activeSubject)
    : problems.filter(p => selectedStatus === 'all' ? p.status !== 'archived' : p.status === selectedStatus).length;

  const unclassifiedCount = problems.filter((p) => {
    const isStatusMatch = selectedStatus === 'all' ? p.status !== 'archived' : p.status === selectedStatus;
    return isStatusMatch && (!p.topic_id || p.topic_id === 'unclassified');
  }).length;
  const [expanded,setExpanded]=useState<Record<string,boolean>>({});
  const handleSelectTopic = (tId: string | null) => {
    setSelectedTopicId(tId);
    setMobileDrawerOpen(false);
    if(scope)return;
    if (tId) {
      navigate(`/study/${currentSubjectId}/${tId}`);
    } else {
      navigate(`/study/${currentSubjectId}`);
    }
  };

  const renderNodes=(nodes:TaxonomyNode[],depth=0):React.ReactNode=>nodes.map(node=>{
    const count=computeCountForNode(node);const selected=selectedTopicId===node.id;
    const open=expanded[node.id]??((currentSubjectId!=='all'&&depth===0)||getAllDescendantIds(node).includes(selectedTopicId||''));
    return <div key={node.id} className="space-y-0.5"><div className="flex items-center gap-1">
      {node.children?.length?<button type="button" aria-label={(open?'收合':'展開')+node.label} aria-expanded={open} onClick={()=>setExpanded(v=>({...v,[node.id]:!open}))} className="shrink-0 rounded-xl p-1 text-text-muted"><ChevronRight size={13} className={open?'rotate-90':''}/></button>:<span className="w-5 shrink-0"/>}
      <button type="button" aria-label={'選擇分類'+node.label} aria-pressed={selected} onClick={()=>handleSelectTopic(node.id)} className={'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left text-xs '+(selected?'bg-primary/10 font-semibold text-primary':'text-text-main hover:bg-neutral-100')}><span className="truncate">{node.label}{node.user_id?' · 自訂':''}</span><span className="shrink-0 text-[10px] text-text-muted">{count}</span></button>
    </div>{open&&node.children?.length?<div className="ml-3 border-l border-border-subtle pl-2">{renderNodes(node.children,depth+1)}</div>:null}</div>;
  });

  // Shared inner navigation content (used in both desktop sidebar & mobile floating drawer)
  const NavigationContent = (
    <div className="space-y-4">
      {children}
      {scope?.loading&&<p role="status" className="text-xs text-text-muted">正在載入題目大綱；目前計數為已載入部分。</p>}
      {/* Subject Selection Dropdown inside Sidebar */}
      <div>
        <div className="flex items-center space-x-2 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
          <span>選擇科目</span>
        </div>
        <CustomSelect
          value={currentSubjectId}
          onChange={(val) => {
            setSelectedSubjectId(val);
            if(!scope)setSelectedTopicId(null);
            setMobileDrawerOpen(false);
            if(!scope)navigate(`/study/${val}`);
          }}
          options={[
            ...(scope?[{value:'all',label:'所有科目'}]:[]),
            ...(baseTaxonomy || []).map((sub) => ({
              value: sub.id,
              label: sub.label,
            })),
            { value: 'unclassified', label: '— 其他科目' },
          ]}
        />
      </div>

      {/* Status Filter Toggle */}
      <div>
        <div className="flex items-center space-x-2 text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
          <span>訂正狀態過濾</span>
        </div>
        <div className="grid grid-cols-4 gap-1 p-1 bg-neutral-100 rounded-2xl">
          {STATUS_FILTER_ITEMS.map((item) => {
            const isSelected = selectedStatus === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setSelectedStatus(item.key as any)}
                className={`py-1.5 text-xs font-medium rounded-xl transition-all ${isSelected
                  ? 'bg-surface text-primary font-semibold shadow-xs'
                  : 'text-text-main hover:text-primary'
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
        <div className="flex items-center justify-between text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
          <div className="flex items-center space-x-1.5">
            <Layers className="w-3.5 h-3.5 text-primary" />
            <span>{isUnclassifiedSubject ? '其他科目' : currentSubjectId==='all'?'科目與章節':(activeSubject?.label || '章節')} 篩選</span>
          </div>
        </div>

        {isUnclassifiedSubject ? (
          /* Unclassified virtual subject: no chapter tree, just a single "all" entry */
          <div className="space-y-1">
            <button
              onClick={() => handleSelectTopic(null)}
              className={`w-full text-left px-3 py-1.5 rounded-2xl text-xs font-medium transition-colors flex items-center justify-between ${selectedTopicId === null
                ? 'bg-status-warning/10 text-status-warning font-semibold'
                : 'text-text-main hover:bg-neutral-100'
                }`}
            >
              <span>全部未分類題目</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-mono bg-neutral-200/70 text-neutral-500">
                {unclassifiedCount}
              </span>
            </button>
            <p className="px-3 pt-2 text-[10px] text-text-muted leading-relaxed">
              AI 辨識中或尚未指派科目的題目會集中於此。
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {/* All Chapters in this Subject */}
            <button
              onClick={() => handleSelectTopic(null)}
              className={`w-full text-left px-3 py-1.5 rounded-2xl text-xs font-medium transition-colors flex items-center justify-between ${selectedTopicId === null
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-text-main hover:bg-neutral-100'
                }`}
            >
              <span>全部 {currentSubjectId==='all'?'科目':activeSubject?.label || '科目'} 錯題</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium ${selectedTopicId === null
                ? 'bg-primary/20 text-primary'
                : 'bg-neutral-200/70 text-neutral-500'
                }`}>
                {subjectTotalCount}
              </span>
            </button>

            {renderNodes(currentSubjectId==='all'?baseTaxonomy:activeSubject?.children||[])}
          </div>
        )}
      </div>

      {/* Problem Outline List / Minimap Navigation */}
      {problems.length > 0 && (
        <div className="pt-3 border-t border-border-subtle">
          <div className="flex items-center space-x-2 text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
            <ListOrdered className="w-3.5 h-3.5" />
            <span>
              {selectedTopicId
                ? `${baseTaxonomy.find((s) => s.id === selectedTopicId)?.label || '當前章節'}錯題 (${(scope?.outline||problems).length} 題)`
                : `錯題大綱清單 (${(scope?.outline||problems).length} 題)`}
            </span>
          </div>

          <div className="space-y-1">
            {(scope?.outline||problems).map((item) => {
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
                    ? 'bg-primary text-white font-bold shadow-xs'
                    : 'text-text-main hover:bg-neutral-100'
                    }`}
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-mono font-medium truncate">
                      {formatProblemCode(item, taxonomies)}
                    </span>
                    <span className={`text-[10px] truncate max-w-[150px] ${isActive ? 'text-white/80 font-normal' : 'text-text-muted'
                      }`}>
                      {topicBadgeLabel}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md shrink-0 ${isActive
                      ? 'bg-white/20 text-white'
                      : item.status === 'resolved'
                        ? 'bg-status-resolved/15 text-status-resolved'
                        : item.status === 'archived'
                          ? 'bg-neutral-500/20 text-text-muted'
                          : 'bg-status-warning/15 text-status-warning'
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
      {/* Mobile Floating Slide-over Drawer */}
      {!desktop&&mobileDrawerOpen&&<div
        onClick={() => setMobileDrawerOpen(false)}
        className={`lg:hidden fixed inset-0 z-50 bg-black/60 flex justify-start transition-opacity duration-300 ease-out ${mobileDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}
          className={`w-80 max-w-[85vw] bg-surface border-r border-border-subtle h-full px-5 pb-5 flex flex-col shadow-2xl transition-transform duration-300 ease-out ${mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
        >
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-border-subtle shrink-0">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-text-main">章節導航與篩選</span>
            </div>
            <button
              onClick={() => setMobileDrawerOpen(false)}
              className="p-1.5 rounded-xl hover:bg-neutral-100 text-text-muted"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y min-h-0 pr-1">{NavigationContent}</div>
        </div>
      </div>}

      {/* 3. Desktop Permanent Sticky Sidebar (< 1024px hidden, >= 1024px visible) */}
      {desktop&&(sidebarCollapsed ? (
        // 加入 self-start，避免 Flex stretch 強迫與主要內容等高而失去 sticky 效果
        <div className=' hidden lg:block w-2 h-1 relative'>
          <div className=" absolute self-start top-0 -left-2">
            <button
              onClick={toggleSidebarCollapsed}
              className="p-3 rounded-2xl bg-surface border border-border-subtle text-primary shadow-xs hover:bg-neutral-100 transition-all"
              title="展開側邊欄 (退出專注模式)"
            >
              <PanelLeftOpen className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        // 加入 self-start，並調整高度至 h-[calc(100dvh-6.5rem)] (考量 top:4.75rem 與底部安全邊距)，消除整體頁面的垂直滾動條
        <aside className={`hidden lg:flex flex-col w-72 self-start bg-surface border border-border-subtle rounded-3xl p-4 shrink-0 transition-all overflow-hidden shadow-2xs ${scope?'h-full':'h-[calc(100dvh-6.5rem)] sticky top-[4.75rem]'}`}>
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-border-subtle shrink-0">
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-text-main">章節大綱導航</span>
            </div>
            <button
              onClick={toggleSidebarCollapsed}
              className="p-1.5 rounded-xl text-text-muted hover:text-text-main"
              title="收合側邊欄 (專注模式)"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 pr-1">
            {NavigationContent}
          </div>
        </aside>
      ))}
    </>
  );
};
