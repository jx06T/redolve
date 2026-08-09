import React, { useState, useMemo } from 'react';
import {
  FolderPlus,
  Plus,
  X,
  Search,
  BookOpen,
  Layers,
  Tag,
  Check,
  Edit2,
  Trash2,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { TaxonomyNode } from '../../types';
import { useStore } from '../../store/useStore';
import {
  createCustomTaxonomy,
  updateCustomTaxonomy,
  deleteCustomTaxonomy,
  syncSeedTaxonomiesApi,
} from '../../services/api';
import { ConfirmModal } from '../ConfirmModal';

interface TaxonomySettingsSectionProps {
  customTaxonomies: TaxonomyNode[];
  countsMap: Record<string, number>;
  loadTaxonomyData: () => Promise<void>;
}

export const TaxonomySettingsSection: React.FC<TaxonomySettingsSectionProps> = ({
  customTaxonomies,
  countsMap,
  loadTaxonomyData,
}) => {
  const { taxonomies, loadTaxonomies, showToast, setSelectedSubjectId, setSelectedTopicId } = useStore();

  const [treeSearchQuery, setTreeSearchQuery] = useState<string>('');
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => {
    return new Set(taxonomies.map((n) => n.id));
  });

  // Inline creation & rename states
  const [showTopSubjectForm, setShowTopSubjectForm] = useState<boolean>(false);
  const [newTopSubjectLabel, setNewTopSubjectLabel] = useState<string>('');
  const [inlineAddParentId, setInlineAddParentId] = useState<string | null>(null);
  const [inlineAddLabel, setInlineAddLabel] = useState<string>('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeLabel, setEditingNodeLabel] = useState<string>('');
  const [isRenaming, setIsRenaming] = useState<boolean>(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [deleteNodeTarget, setDeleteNodeTarget] = useState<string | null>(null);

  const customIdSet = useMemo(() => {
    return new Set(customTaxonomies.map((c) => c.id));
  }, [customTaxonomies]);

  const getNodeTotalCount = (node: TaxonomyNode): number => {
    const raw = countsMap[node.id] as any;
    if (raw !== undefined && raw !== null) {
      if (typeof raw === 'number') return raw;
      if (typeof raw === 'object' && typeof raw.total === 'number') return raw.total;
    }
    let sum = 0;
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        sum += getNodeTotalCount(child);
      }
    }
    return sum;
  };

  const findSubjectIdForNode = (targetId: string, currentTree: TaxonomyNode[]): string => {
    for (const root of currentTree) {
      if (root.id === targetId) return root.id;
      const contains = (n: TaxonomyNode): boolean => {
        if (n.id === targetId) return true;
        if (n.children) return n.children.some(contains);
        return false;
      };
      if (root.children && root.children.some(contains)) {
        return root.id;
      }
    }
    return 'math';
  };

  const toggleNodeExpand = (nodeId: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const expandAllNodes = () => {
    const allIds = new Set<string>();
    const collectIds = (nodes: TaxonomyNode[]) => {
      for (const n of nodes) {
        allIds.add(n.id);
        if (n.children) collectIds(n.children);
      }
    };
    collectIds(taxonomies);
    setExpandedNodeIds(allIds);
  };

  const collapseAllNodes = () => {
    setExpandedNodeIds(new Set());
  };

  // Filtered tree for search
  const filteredTree = useMemo(() => {
    if (!treeSearchQuery.trim()) return taxonomies;
    const q = treeSearchQuery.toLowerCase().trim();

    const filterNodes = (nodes: TaxonomyNode[]): TaxonomyNode[] => {
      const result: TaxonomyNode[] = [];
      for (const node of nodes) {
        const selfMatch = node.label.toLowerCase().includes(q) || node.id.toLowerCase().includes(q);
        const filteredChildren = node.children ? filterNodes(node.children) : [];
        if (selfMatch || filteredChildren.length > 0) {
          result.push({
            ...node,
            children: filteredChildren.length > 0 ? filteredChildren : node.children,
          });
        }
      }
      return result;
    };

    return filterNodes(taxonomies);
  }, [taxonomies, treeSearchQuery]);

  const handleSyncOfficialTaxonomy = async () => {
    setIsSyncing(true);
    try {
      const data = await syncSeedTaxonomiesApi();
      await loadTaxonomyData();
      await loadTaxonomies();
      showToast(data.message || `官方課綱同步完成 (共 ${data.count} 個節點)`, 'success');
    } catch (err: any) {
      console.error('Taxonomy sync failed:', err);
      showToast(err.message || '課綱同步失敗', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddTopSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopSubjectLabel.trim()) return;
    try {
      const res = await createCustomTaxonomy({ label: newTopSubjectLabel.trim() });
      setNewTopSubjectLabel('');
      setShowTopSubjectForm(false);
      await loadTaxonomyData();
      await loadTaxonomies();
      showToast(`已新增自訂科目：${res.node.label}`, 'success');
    } catch (err: any) {
      console.error('Failed to add custom subject:', err);
      showToast(err.message || '新增自訂科目失敗', 'error');
    }
  };

  const handleAddSubNode = async (parentId: string) => {
    if (!inlineAddLabel.trim()) return;
    try {
      const res = await createCustomTaxonomy({
        label: inlineAddLabel.trim(),
        parent_id: parentId,
      });
      setInlineAddLabel('');
      setInlineAddParentId(null);
      setExpandedNodeIds((prev) => new Set([...prev, parentId]));
      await loadTaxonomyData();
      await loadTaxonomies();
      showToast(`已新增單元：${res.node.label}`, 'success');
    } catch (err: any) {
      console.error('Failed to add sub-node:', err);
      showToast(err.message || '新增單元失敗', 'error');
    }
  };

  const handleStartRename = (node: TaxonomyNode) => {
    setEditingNodeId(node.id);
    setEditingNodeLabel(node.label);
  };

  const handleSaveRename = async (id: string) => {
    if (!editingNodeLabel.trim() || isRenaming) return;
    setIsRenaming(true);
    try {
      const res = await updateCustomTaxonomy(id, editingNodeLabel.trim());
      setEditingNodeId(null);
      setEditingNodeLabel('');
      await loadTaxonomyData();
      await loadTaxonomies();
      showToast(`已將章節重新命名為：${res.node.label}`, 'success');
    } catch (err: any) {
      console.error('Failed to rename node:', err);
      showToast(err.message || '重新命名失敗', 'error');
    } finally {
      setIsRenaming(false);
    }
  };

  const confirmDeleteCustomNode = async () => {
    if (!deleteNodeTarget) return;
    try {
      await deleteCustomTaxonomy(deleteNodeTarget);
      await loadTaxonomyData();
      await loadTaxonomies();
      showToast('已刪除自訂項目', 'info');
    } catch (err: any) {
      console.error('Failed to delete node:', err);
      showToast(err.message || '刪除自訂項目失敗', 'error');
    } finally {
      setDeleteNodeTarget(null);
    }
  };

  const renderTreeNode = (node: TaxonomyNode, depth: number = 0) => {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = expandedNodeIds.has(node.id);
    const isCustom = Boolean(node.user_id || customIdSet.has(node.id));
    const totalProblemCount = getNodeTotalCount(node);
    const subjectId = findSubjectIdForNode(node.id, taxonomies);
    const isAddingChild = inlineAddParentId === node.id;

    return (
      <div key={node.id} className="flex flex-col">
        <div
          className={`group flex items-center justify-between py-2 px-3 rounded-xl transition-all ${
            depth === 0
              ? 'bg-stone-50/80 dark:bg-stone-800/40 hover:bg-stone-100/80 dark:hover:bg-stone-800/70 border border-stone-200/50 dark:border-stone-800 my-1'
              : 'hover:bg-stone-50 dark:hover:bg-stone-800/30'
          }`}
          style={{ paddingLeft: `${Math.max(12, depth * 22 + 12)}px` }}
        >
          {/* Left: Expander + Icon + Name */}
          <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-2">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleNodeExpand(node.id)}
                className="w-5 h-5 flex items-center justify-center rounded-md text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-stone-700/50 transition-colors shrink-0"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <div className="w-5 shrink-0 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-stone-300 dark:bg-stone-700" />
              </div>
            )}

            <div className="shrink-0 text-stone-400 dark:text-stone-500">
              {depth === 0 ? (
                <BookOpen className="w-4 h-4 text-indigo-500" />
              ) : depth === 1 ? (
                <Layers className="w-3.5 h-3.5 text-sky-500" />
              ) : (
                <Tag className="w-3 h-3 text-stone-400" />
              )}
            </div>

            {editingNodeId === node.id ? (
              <div className="flex items-center space-x-1.5 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  autoFocus
                  value={editingNodeLabel}
                  onChange={(e) => setEditingNodeLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename(node.id);
                    if (e.key === 'Escape') setEditingNodeId(null);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs bg-surface border border-primary text-text-main focus:outline-none w-36 sm:w-52 shadow-xs"
                  placeholder="請輸入新名稱..."
                />
                <button
                  type="button"
                  onClick={() => handleSaveRename(node.id)}
                  disabled={!editingNodeLabel.trim() || isRenaming}
                  className="p-1 rounded-lg text-white bg-primary hover:bg-primary-hover disabled:opacity-50 transition-colors shadow-xs"
                  title="儲存名稱"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingNodeId(null)}
                  className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50 transition-colors"
                  title="取消"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2 truncate">
                <span
                  className={`text-xs truncate ${
                    depth === 0
                      ? 'font-bold text-text-main'
                      : depth === 1
                      ? 'font-semibold text-text-main'
                      : 'font-normal text-text-muted'
                  }`}
                >
                  {node.label}
                </span>
                <span className="text-[10px] font-mono text-text-muted hidden sm:inline">
                  ({node.id})
                </span>
              </div>
            )}

            {isCustom ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-status-resolved/10 text-status-resolved border border-status-resolved/20 shrink-0">
                自訂
              </span>
            ) : (
              depth === 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-text-muted border border-border-subtle shrink-0">
                  官方課綱
                </span>
              )
            )}
          </div>

          {/* Right: Problem Count & Actions */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <a
              href={`/study/${subjectId}?topic=${node.id}`}
              onClick={() => {
                setSelectedSubjectId(subjectId);
                setSelectedTopicId(node.id);
              }}
              className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-lg text-xs font-mono font-medium transition-all ${
                totalProblemCount > 0
                  ? 'bg-primary-50 dark:bg-primary-950/50 text-primary hover:bg-primary-100 dark:hover:bg-primary-900/50 border border-primary-200/50 dark:border-primary-850/50'
                  : 'bg-neutral-100 dark:bg-neutral-800/60 text-text-muted border border-transparent'
              }`}
              title={totalProblemCount > 0 ? `點擊前往此分類刷題 (共 ${totalProblemCount} 題)` : '目前無收錄題目'}
            >
              <span>{totalProblemCount} 題</span>
              {totalProblemCount > 0 && <ExternalLink className="w-2.5 h-2.5 opacity-60" />}
            </a>

            {depth < 2 && (
              <button
                type="button"
                onClick={() => {
                  setInlineAddParentId(node.id);
                  setInlineAddLabel('');
                }}
                className="p-1 rounded-lg text-stone-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                title={`在「${node.label}」下新增子單元`}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}

            {isCustom && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartRename(node);
                }}
                className="p-1 rounded-lg text-stone-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                title="重新命名此自訂章節"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}

            {isCustom && (
              <button
                type="button"
                onClick={() => setDeleteNodeTarget(node.id)}
                className="p-1 rounded-lg text-stone-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                title="刪除此自訂分類"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {isAddingChild && (
          <div
            className="flex items-center space-x-2 py-2 px-3 my-1 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40"
            style={{ paddingLeft: `${(depth + 1) * 22 + 12}px` }}
          >
            <input
              type="text"
              autoFocus
              placeholder={`在 ${node.label} 下新增單元名稱...`}
              value={inlineAddLabel}
              onChange={(e) => setInlineAddLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddSubNode(node.id);
                if (e.key === 'Escape') setInlineAddParentId(null);
              }}
              className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-surface border border-primary-200 dark:border-primary-800 text-text-main focus:outline-none"
            />
            <button
              type="button"
              onClick={() => handleAddSubNode(node.id)}
              disabled={!inlineAddLabel.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-xs"
            >
              新增
            </button>
            <button
              type="button"
              onClick={() => setInlineAddParentId(null)}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-stone-700/50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {hasChildren && isExpanded && (
          <div className="flex flex-col border-l border-stone-200/60 dark:border-stone-800/80 ml-5">
            {node.children!.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-surface border border-border-subtle rounded-3xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3 text-text-main">
            <div className="p-2.5 bg-primary-50 dark:bg-primary-950/40 text-primary rounded-2xl">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">題庫科目與單元分類樹狀管理</h2>
              <p className="text-xs text-text-muted">
                樹狀檢視官方課綱與自訂科目，即時統計題目數量並支援自由新增/刪除單元
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSyncOfficialTaxonomy}
              disabled={isSyncing}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-text-main border border-border-subtle transition-all active:scale-95"
              title="增量同步官方學測/分科測驗最新課綱，不影響自訂章節"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? '課綱同步中...' : '同步官方課綱'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowTopSubjectForm(!showTopSubjectForm)}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-primary hover:bg-primary-hover text-white shadow-2xs transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>新增自訂科目</span>
            </button>
          </div>
        </div>

        {/* Top-level Subject Creation Card */}
        {showTopSubjectForm && (
          <form
            onSubmit={handleAddTopSubject}
            className="mt-4 p-4 rounded-2xl bg-primary-50/50 dark:bg-primary-950/30 border border-primary-200/60 dark:border-primary-900/50 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary dark:text-primary-200">
                新增頂層自訂科目 (Top-level Subject)
              </span>
              <button
                type="button"
                onClick={() => setShowTopSubjectForm(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-main"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                autoFocus
                placeholder="輸入科目名稱（例：國中理化、多益英文、托福聽力）"
                value={newTopSubjectLabel}
                onChange={(e) => setNewTopSubjectLabel(e.target.value)}
                className="flex-1 px-3.5 py-2 rounded-xl text-xs bg-surface border border-primary-200 dark:border-primary-800 text-text-main focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newTopSubjectLabel.trim()}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-all shadow-xs"
              >
                建立科目
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Tree Navigation & Controls Header */}
      <div className="bg-surface border border-border-subtle rounded-3xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="快速搜尋科目、單元或概念標籤..."
              value={treeSearchQuery}
              onChange={(e) => setTreeSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-800 border border-border-subtle text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary"
            />
            {treeSearchQuery && (
              <button
                type="button"
                onClick={() => setTreeSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-main"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={expandAllNodes}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-text-main hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              展開全部
            </button>
            <button
              type="button"
              onClick={collapseAllNodes}
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-text-main hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              收合全部
            </button>
          </div>
        </div>

        {/* Tree Nodes List */}
        {filteredTree.length === 0 ? (
          <div className="text-center py-10 text-xs text-text-muted">
            查無符合「{treeSearchQuery}」的科目或單元分類。
          </div>
        ) : (
          <div className="space-y-1">
            {filteredTree.map((node) => renderTreeNode(node, 0))}
          </div>
        )}
      </div>

      {/* Delete Custom Taxonomy Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteNodeTarget)}
        title="刪除自訂分類"
        message="確定要刪除此自訂分類嗎？已關聯此標籤的題目仍會保留。"
        confirmText="確定刪除"
        cancelText="取消"
        isDestructive={true}
        onConfirm={confirmDeleteCustomNode}
        onCancel={() => setDeleteNodeTarget(null)}
      />
    </div>
  );
};
