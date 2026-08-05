import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Key,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Check,
  ShieldCheck,
  Tag,
  Sliders,
  FolderPlus,
  Palette,
  X,
  RotateCcw,
  Shield,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Search,
  BookOpen,
  Layers,
  ExternalLink,
} from 'lucide-react';
import {
  fetchApiKeys,
  createApiKey,
  deleteApiKey,
  fetchTaxonomyTree,
  createCustomTaxonomy,
  updateCustomTaxonomy,
  deleteCustomTaxonomy,
  seedAdminTaxonomy,
  fetchAdminMe,
} from '../services/api';
import { useSEO } from '../hooks/useSEO';
import { useStore } from '../store/useStore';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';
import { ApiKeyItem, TaxonomyNode } from '../types';
import { ConfirmModal } from '../components/ConfirmModal';

const ALL_RECOMMENDED_COLORS = [
  { name: '深灰石墨', hex: '#374151' },
  { name: '鋼筆經典', hex: '#6366F1' },
  { name: '重點批註', hex: '#E11D48' },
  { name: '觀念補強', hex: '#3B82F6' },
  { name: '薄荷翠綠', hex: '#10B981' },
  { name: '暖陽琥珀', hex: '#F59E0B' },
  { name: '薰衣草紫', hex: '#8B5CF6' },
  { name: '珊瑚粉橘', hex: '#FB923C' },
  { name: '青瓷海藍', hex: '#06B6D4' },
  { name: '櫻花淡粉', hex: '#EC4899' },
];

type SettingsTab = 'pencil' | 'taxonomy' | 'apikeys';
const VALID_TABS: SettingsTab[] = ['pencil', 'taxonomy', 'apikeys'];

const getInitialTab = (): SettingsTab => {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.replace('#', '') as SettingsTab;
    if (VALID_TABS.includes(hash)) {
      return hash;
    }
  }
  return 'pencil';
};

export const SettingsView: React.FC = () => {
  useSEO({
    title: '系統設定與 iOS 捷徑管理',
    description: '管理 iPad / iPhone 捷徑傳輸金鑰、自訂題庫科目與單元分類、手寫筆觸自訂顏色與偏好設定。',
  });

  const {
    penColor,
    setPenColor,
    paletteColors,
    addPaletteColor,
    removePaletteColor,
    resetPaletteColors,
    penWidth,
    setPenWidth,
    showToast,
    currentUser,
    taxonomies,
    setTaxonomies,
    loadTaxonomies,
    taxonomyCounts,
  } = useStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>(getInitialTab);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loadingKeys, setLoadingKeys] = useState<boolean>(true);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [description, setDescription] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Custom taxonomy state
  const [customTaxonomies, setCustomTaxonomies] = useState<TaxonomyNode[]>([]);
  const [countsMap, setCountsMap] = useState<Record<string, number>>({});
  const [treeSearchQuery, setTreeSearchQuery] = useState<string>('');
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());

  // Inline creation & rename states
  const [showTopSubjectForm, setShowTopSubjectForm] = useState<boolean>(false);
  const [newTopSubjectLabel, setNewTopSubjectLabel] = useState<string>('');
  const [inlineAddParentId, setInlineAddParentId] = useState<string | null>(null);
  const [inlineAddLabel, setInlineAddLabel] = useState<string>('');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeLabel, setEditingNodeLabel] = useState<string>('');
  const [isRenaming, setIsRenaming] = useState<boolean>(false);

  // Palette customization state
  const [customHexInput, setCustomHexInput] = useState<string>('#6366F1');
  const pickerInputRef = useRef<HTMLInputElement>(null);

  // Admin state
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // Taxonomy Seed / Refresh state
  const [isSeedingTaxonomy, setIsSeedingTaxonomy] = useState<boolean>(false);
  const [lastSeedResult, setLastSeedResult] = useState<{ count: number } | null>(null);

  // Non-blocking Modals state
  const [revokeKeyTarget, setRevokeKeyTarget] = useState<string | null>(null);
  const [isSeedModalOpen, setIsSeedModalOpen] = useState<boolean>(false);
  const [deleteNodeTarget, setDeleteNodeTarget] = useState<string | null>(null);

  const loadKeys = async () => {
    try {
      setLoadingKeys(true);
      const res = await fetchApiKeys();
      setKeys(res.keys || []);
    } catch (err) {
      console.error('Failed to load API keys:', err);
    } finally {
      setLoadingKeys(false);
    }
  };

  const loadTaxonomyData = async () => {
    try {
      const res = await fetchTaxonomyTree();
      setCustomTaxonomies(res.customNodes || []);
      const currentTree = res.tree && res.tree.length > 0 ? res.tree : TAXONOMY_SEED_DATA;
      setTaxonomies(currentTree);
      if (res.counts) {
        setCountsMap(res.counts);
      }
      // Expand top-level nodes by default if empty
      setExpandedNodeIds((prev) => {
        if (prev.size === 0) {
          return new Set(currentTree.map((n) => n.id));
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to load taxonomy:', err);
      setTaxonomies(TAXONOMY_SEED_DATA);
    }
  };

  useEffect(() => {
    loadKeys();
    loadTaxonomyData();
    fetchAdminMe().then((res) => {
      if (res?.isAdmin) setIsAdmin(true);
    });
  }, [currentUser]);

  // Sync countsMap with store taxonomyCounts if available
  useEffect(() => {
    if (Object.keys(taxonomyCounts).length > 0) {
      setCountsMap((prev) => ({ ...prev, ...taxonomyCounts }));
    }
  }, [taxonomyCounts]);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createApiKey(description.trim() || 'iPad 捷徑 Key');
      setNewKey(res.key);
      setDescription('');
      loadKeys();
      showToast('API Key 生成成功！請記得妥善保存。', 'success');
    } catch (err) {
      console.error('Failed to create key:', err);
      showToast('生成金鑰失敗', 'error');
    }
  };

  const confirmRevokeKey = async () => {
    if (!revokeKeyTarget) return;
    try {
      await deleteApiKey(revokeKeyTarget);
      loadKeys();
      showToast('已撤銷該 API Key', 'info');
    } catch (err) {
      console.error('Failed to revoke key:', err);
      showToast('撤銷失敗', 'error');
    } finally {
      setRevokeKeyTarget(null);
    }
  };

  const handleCopyNewKey = async () => {
    if (newKey) {
      await navigator.clipboard.writeText(newKey);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
      // Immediate button feedback provided, no popup spam needed
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
      const isParentCustom = customTaxonomies.some((c) => c.id === parentId);
      const res = await createCustomTaxonomy({
        label: inlineAddLabel.trim(),
        parent_id: parentId,
        is_official: isAdmin && !isParentCustom,
      });
      setInlineAddLabel('');
      setInlineAddParentId(null);
      // Auto expand the parent so user sees the newly added child
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
      console.error('Failed to rename custom node:', err);
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
      console.error('Failed to delete custom node:', err);
      showToast(err.message || '刪除自訂項目失敗', 'error');
    } finally {
      setDeleteNodeTarget(null);
    }
  };

  const confirmSeedTaxonomy = async () => {
    setIsSeedingTaxonomy(true);
    try {
      const data = await seedAdminTaxonomy();
      setLastSeedResult({ count: data.count });
      await loadTaxonomyData();
      showToast(`課綱初始化完成，共植入 ${data.count} 個節點`, 'success');
    } catch (err) {
      console.error('Seed failed:', err);
      showToast('課綱初始化失敗，請確認管理者權限', 'error');
    } finally {
      setIsSeedingTaxonomy(false);
    }
  };

  const handleAddCustomColor = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const hex = customHexInput.trim().toUpperCase();
    if (!/^#([0-9A-F]{3}){1,2}$/i.test(hex)) {
      showToast('請輸入合法的 Hex 色碼 (例如: #10B981)', 'error');
      return;
    }
    addPaletteColor({ hex });
  };

  const handleResetPalette = () => {
    resetPaletteColors();
    showToast('已還原為經典預設調色盤', 'info');
  };

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${tab}`);
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as SettingsTab;
      if (VALID_TABS.includes(hash)) {
        setActiveTab(hash);
      }
    };
    if (!window.location.hash || !VALID_TABS.includes(window.location.hash.replace('#', '') as SettingsTab)) {
      window.history.replaceState(null, '', `#${activeTab}`);
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);

  // Tree computation & helper functions
  const customIdSet = useMemo(() => {
    return new Set(customTaxonomies.map((c) => c.id));
  }, [customTaxonomies]);

  const getNodeTotalCount = (node: TaxonomyNode): number => {
    let sum = countsMap[node.id] || 0;
    if (node.children) {
      for (const child of node.children) {
        sum += getNodeTotalCount(child);
      }
    }
    return sum;
  };

  // Find root subject ID for direct navigation link
  const findSubjectIdForNode = (targetId: string, currentTree: TaxonomyNode[]): string => {
    for (const root of currentTree) {
      if (root.id === targetId) return root.id;
      const contains = (n: TaxonomyNode): boolean => {
        if (n.id === targetId) return true;
        if (n.children) {
          return n.children.some(contains);
        }
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
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
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

  // Filtered Tree based on search query
  const filteredTree = useMemo(() => {
    if (!treeSearchQuery.trim()) return taxonomies;
    const q = treeSearchQuery.toLowerCase().trim();

    const filterNodes = (nodes: TaxonomyNode[]): TaxonomyNode[] => {
      const result: TaxonomyNode[] = [];
      for (const node of nodes) {
        const selfMatch =
          node.label.toLowerCase().includes(q) ||
          node.id.toLowerCase().includes(q);
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

  // Auto-expand all matching nodes when searching
  useEffect(() => {
    if (treeSearchQuery.trim()) {
      const matchingIds = new Set<string>();
      const collect = (nodes: TaxonomyNode[]) => {
        for (const n of nodes) {
          matchingIds.add(n.id);
          if (n.children) collect(n.children);
        }
      };
      collect(filteredTree);
      setExpandedNodeIds(matchingIds);
    }
  }, [treeSearchQuery, filteredTree]);

  // Recursive Tree Node Renderer
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
          className={`group flex items-center justify-between py-2 px-3 rounded-xl transition-all ${depth === 0
            ? 'bg-stone-50/80 dark:bg-stone-800/40 hover:bg-stone-100/80 dark:hover:bg-stone-800/70 border border-stone-200/50 dark:border-stone-800 my-1'
            : 'hover:bg-stone-50 dark:hover:bg-stone-800/30'
            }`}
          style={{ paddingLeft: `${Math.max(12, depth * 22 + 12)}px` }}
        >
          {/* Left: Expander + Icon + Name + Badges */}
          <div className="flex items-center space-x-2.5 min-w-0 flex-1 pr-2">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleNodeExpand(node.id)}
                className="w-5 h-5 flex items-center justify-center rounded-md text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-stone-700/50 transition-colors shrink-0"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <div className="w-5 shrink-0 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-stone-300 dark:bg-stone-700" />
              </div>
            )}

            {/* Depth icon */}
            <div className="shrink-0 text-stone-400 dark:text-stone-500">
              {depth === 0 ? (
                <BookOpen className="w-4 h-4 text-indigo-500" />
              ) : depth === 1 ? (
                <Layers className="w-3.5 h-3.5 text-sky-500" />
              ) : (
                <Tag className="w-3 h-3 text-stone-400" />
              )}
            </div>

            {/* Label and ID or Inline Rename Input */}
            {editingNodeId === node.id ? (
              <div
                className="flex items-center space-x-1.5 flex-1 min-w-0"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  autoFocus
                  value={editingNodeLabel}
                  onChange={(e) => setEditingNodeLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename(node.id);
                    if (e.key === 'Escape') setEditingNodeId(null);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs bg-white dark:bg-stone-900 border border-indigo-500 dark:border-indigo-400 text-[#1F2937] dark:text-[#F3F4F6] focus:outline-none w-36 sm:w-52 shadow-xs"
                  placeholder="請輸入新名稱..."
                />
                <button
                  type="button"
                  onClick={() => handleSaveRename(node.id)}
                  disabled={!editingNodeLabel.trim() || isRenaming}
                  className="p-1 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-xs"
                  title="儲存名稱"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingNodeId(null)}
                  className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-200/50 dark:hover:bg-stone-700/50 transition-colors"
                  title="取消"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2 truncate">
                <span
                  className={`text-xs truncate ${depth === 0
                    ? 'font-bold text-[#1F2937] dark:text-[#F3F4F6]'
                    : depth === 1
                      ? 'font-semibold text-[#374151] dark:text-[#D1D5DB]'
                      : 'font-normal text-[#4B5563] dark:text-[#9CA3AF]'
                    }`}
                >
                  {node.label}
                </span>
                <span className="text-[10px] font-mono text-stone-400 dark:text-stone-600 hidden sm:inline">
                  ({node.id})
                </span>
              </div>
            )}

            {/* Official vs Custom Tag */}
            {isCustom ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60 shrink-0">
                自訂
              </span>
            ) : (
              depth === 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-stone-100 dark:bg-stone-800 text-[#6B7280] dark:text-[#9CA3AF] border border-stone-200/60 dark:border-stone-700 shrink-0">
                  官方課綱
                </span>
              )
            )}
          </div>

          {/* Right: Problem Count & Actions */}
          <div className="flex items-center space-x-1.5 shrink-0">
            {/* Problem Count Badge & Direct Link */}
            <a
              href={`/study/${subjectId}?topic=${node.id}`}
              className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-lg text-xs font-mono font-medium transition-all ${totalProblemCount > 0
                ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200/50 dark:border-indigo-800/50'
                : 'bg-stone-100 dark:bg-stone-800/60 text-[#9CA3AF] border border-transparent'
                }`}
              title={
                totalProblemCount > 0
                  ? `點擊前往此分類刷題 (共 ${totalProblemCount} 題)`
                  : '目前無收錄題目'
              }
            >
              <span>{totalProblemCount} 題</span>
              {totalProblemCount > 0 && <ExternalLink className="w-2.5 h-2.5 opacity-60" />}
            </a>

            {/* Add Child Unit Button */}
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

            {/* Rename Node Button (Custom or Admin) */}
            {(isCustom || isAdmin) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartRename(node);
                }}
                className="p-1 rounded-lg text-stone-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                title={isCustom ? "重新命名此自訂章節" : "重新命名此官方課綱章節 (管理者)"}
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Delete Node Button (Custom or Admin) */}
            {(isCustom || isAdmin) && (
              <button
                type="button"
                onClick={() => setDeleteNodeTarget(node.id)}
                className="p-1 rounded-lg text-stone-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                title={isCustom ? "刪除此自訂分類" : "刪除此官方課綱分類 (管理者)"}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Inline Sub-node Creation Form */}
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
              className="flex-1 px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-stone-900 border border-indigo-200 dark:border-indigo-800 text-[#1F2937] dark:text-[#F3F4F6] focus:outline-none"
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

        {/* Child Nodes */}
        {hasChildren && isExpanded && (
          <div className="flex flex-col border-l border-stone-200/60 dark:border-stone-800/80 ml-5">
            {node.children!.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Navigation Tabs */}
      <div className="flex items-center space-x-2 bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] p-1.5 rounded-2xl select-none">
        <button
          onClick={() => handleTabChange('pencil')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${activeTab === 'pencil'
            ? 'bg-[#6366F1] text-white shadow-xs'
            : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/60'
            }`}
        >
          <Sliders className="w-4 h-4" />
          <span>iPad 筆觸偏好設定</span>
        </button>

        <button
          onClick={() => handleTabChange('taxonomy')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${activeTab === 'taxonomy'
            ? 'bg-[#6366F1] text-white shadow-xs'
            : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/60'
            }`}
        >
          <Tag className="w-4 h-4" />
          <span>自訂科目與單元分類</span>
        </button>

        <button
          onClick={() => handleTabChange('apikeys')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${activeTab === 'apikeys'
            ? 'bg-[#6366F1] text-white shadow-xs'
            : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/60'
            }`}
        >
          <Key className="w-4 h-4" />
          <span>iOS 捷徑 API Key</span>
        </button>
      </div>

      {/* Tab 1: iPad Pen & Handwriting Preferences */}
      {activeTab === 'pencil' && (
        <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 space-y-6">
          <div className="flex items-center space-x-3 text-[#374151] dark:text-[#D1D5DB]">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] rounded-2xl">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">iPad 手寫與筆觸偏好</h2>
              <p className="text-xs text-[#9CA3AF]">
                配置 iPad + Apple Pencil 預設筆觸顏色、自訂調色盤、粗細與自動滾動體驗
              </p>
            </div>
          </div>

          <div className="space-y-6 pt-2">
            {/* Unified Pen Color Palette Management */}
            <div className="p-5 rounded-2xl bg-stone-50 dark:bg-stone-800/30 border border-stone-200/60 dark:border-stone-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Palette className="w-4 h-4 text-[#6366F1]" />
                  <label className="text-xs font-bold text-[#374151] dark:text-[#D1D5DB]">
                    筆觸調色盤 (Pen Color Palette)
                  </label>
                  <span className="text-[11px] font-mono text-[#9CA3AF] ml-2">
                    當前選取：<span className="font-bold text-[#6366F1]">{penColor.toUpperCase()}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleResetPalette}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs text-stone-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-stone-200/60 dark:hover:bg-stone-700/60 transition-colors"
                  title="還原為系統經典 4 色預設"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>還原經典配色</span>
                </button>
              </div>

              {/* All Palette Color Chips */}
              <div className="flex flex-wrap items-center gap-2.5">
                {paletteColors.map((c) => (
                  <div
                    key={c.hex}
                    className={`group relative flex items-center space-x-1.5 pl-2 pr-1.5 py-1.5 rounded-xl border transition-all ${penColor.toUpperCase() === c.hex.toUpperCase()
                      ? 'border-indigo-500 bg-white dark:bg-[#202023] ring-2 ring-indigo-500/20 shadow-xs'
                      : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-[#202023] hover:border-stone-300'
                      }`}
                  >
                    <button
                      type="button"
                      onClick={() => setPenColor(c.hex)}
                      className="flex items-center space-x-2 text-left"
                    >
                      <span
                        className="w-5 h-5 rounded-full border border-black/10 shrink-0"
                        style={{ backgroundColor: c.hex }}
                      />
                      <span className="text-xs font-medium text-[#374151] dark:text-[#D1D5DB]">
                        {c.name || c.hex}
                      </span>
                    </button>
                    {paletteColors.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePaletteColor(c.hex);
                        }}
                        aria-label={`刪除顏色 ${c.name || c.hex}`}
                        className="p-1 rounded-lg text-stone-400 hover:text-rose-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                        title="自調色盤刪除"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add Custom Color Controls */}
              <form onSubmit={handleAddCustomColor} className="flex flex-wrap items-center gap-3 pt-2">
                <div className="flex items-center space-x-2 bg-white dark:bg-[#202023] p-1.5 px-2  rounded-2xl border border-stone-200 dark:border-stone-700">
                  <button
                    type="button"
                    onClick={() => pickerInputRef.current?.click()}
                    className="w-5 h-5 rounded-xl border border-black/10 shadow-xs transition-transform active:scale-95 flex items-center justify-center shrink-0"
                    style={{ backgroundColor: customHexInput }}
                    title="點擊開啟原生調色盤"
                  />
                  <input
                    ref={pickerInputRef}
                    type="color"
                    value={customHexInput}
                    onChange={(e) => setCustomHexInput(e.target.value.toUpperCase())}
                    className="sr-only"
                    tabIndex={-1}
                  />
                  <input
                    type="text"
                    value={customHexInput}
                    onChange={(e) => setCustomHexInput(e.target.value.toUpperCase())}
                    placeholder="#10B981"
                    maxLength={7}
                    className="w-24 px-2 py-1 text-xs font-mono uppercase bg-transparent text-[#374151] dark:text-[#D1D5DB] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-2xl text-xs font-semibold bg-[#6366F1] text-white hover:bg-[#4F46E5] active:scale-95 transition-all shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>加入調色盤</span>
                </button>
              </form>

              {/* Suggested Colors Row */}
              <div className="pt-2">
                <div className="text-[11px] font-semibold text-[#9CA3AF] mb-2">
                  快速推薦莫蘭迪與經典色系（點擊加入）：
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {ALL_RECOMMENDED_COLORS.map((s) => (
                    <button
                      key={s.hex}
                      type="button"
                      onClick={() => {
                        setCustomHexInput(s.hex);
                        addPaletteColor({ hex: s.hex, name: s.name });
                      }}
                      className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-[11px] bg-white dark:bg-[#202023] border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#D1D5DB] hover:border-indigo-400 hover:scale-105 active:scale-95 transition-all"
                    >
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.hex }} />
                      <span>{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Stroke Width Selector */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-[#374151] dark:text-[#D1D5DB] mb-2">
                預設筆觸粗細 (Default Stroke Width: {penWidth}px)
              </label>
              <div className="flex items-center space-x-3">
                {[1, 2, 4].map((w) => (
                  <button
                    key={w}
                    onClick={() => setPenWidth(w)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${penWidth === w
                      ? 'bg-[#6366F1] text-white border-[#6366F1] shadow-xs'
                      : 'bg-stone-50 dark:bg-stone-800 text-[#374151] dark:text-[#D1D5DB] border-stone-200 dark:border-stone-700 hover:bg-stone-100'
                      }`}
                  >
                    {w}px {w === 1 ? '(細)' : w === 2 ? '(標準)' : '(粗)'}
                  </button>
                ))}
              </div>
            </div>

            {/* iPad Gestures Guide */}
            <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-800 text-xs text-[#9CA3AF] space-y-1">
              <p className="font-semibold text-[#374151] dark:text-[#D1D5DB]">iPad 觸控手勢提示：</p>
              <p>• 雙指輕觸畫布可直接 Undo 復原上一步筆跡。</p>
              <p>• 運筆接近卡片底部 100px 時，畫布將平滑自動向下展延 400px。</p>
              <p>• 長按懸浮橡皮擦按鈕可啟動彈簧橡皮擦，放開即刻回到原本筆觸。</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Custom Taxonomy Tree Management */}
      {activeTab === 'taxonomy' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3 text-[#374151] dark:text-[#D1D5DB]">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] rounded-2xl">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold">題庫科目與單元分類樹狀管理</h2>
                  <p className="text-xs text-[#9CA3AF]">
                    樹狀檢視官方課綱與自訂科目，即時統計題目數量並支援自由新增/刪除單元
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowTopSubjectForm(!showTopSubjectForm)}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-all active:scale-95"
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
                className="mt-4 p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-900/50 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                    新增頂層自訂科目 (Top-level Subject)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTopSubjectForm(false)}
                    className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
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
                    className="flex-1 px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-stone-900 border border-indigo-200 dark:border-indigo-800 text-[#1F2937] dark:text-[#F3F4F6] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newTopSubjectLabel.trim()}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-xs"
                  >
                    建立科目
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Tree Navigation & Controls Header */}
          <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100 dark:border-stone-800">
              {/* Search input */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="快速搜尋科目、單元或概念標籤..."
                  value={treeSearchQuery}
                  onChange={(e) => setTreeSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[#1F2937] dark:text-[#F3F4F6] placeholder:text-stone-400 focus:outline-none focus:border-indigo-500"
                />
                {treeSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setTreeSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Expand / Collapse All */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={expandAllNodes}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  展開全部
                </button>
                <button
                  type="button"
                  onClick={collapseAllNodes}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  收合全部
                </button>
              </div>
            </div>

            {/* Tree Nodes List */}
            {filteredTree.length === 0 ? (
              <div className="text-center py-10 text-xs text-[#9CA3AF]">
                查無符合「{treeSearchQuery}」的科目或單元分類。
              </div>
            ) : (
              <div className="space-y-1">
                {filteredTree.map((node) => renderTreeNode(node, 0))}
              </div>
            )}
          </div>

          {/* Admin Section — visible to admin accounts */}
          {(isAdmin || currentUser?.role === 'admin') && (
            <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 space-y-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-2xl">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#374151] dark:text-[#D1D5DB]">系統管理（管理者專區）</h3>
                  <p className="text-xs text-[#9CA3AF]">此區塊僅對 ADMIN 白名單帳號顯示</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-800 space-y-3">
                <div className="text-xs font-semibold text-[#374151] dark:text-[#D1D5DB]">重新初始化官方課綱（Seed）</div>
                <div className="text-xs text-[#9CA3AF]">
                  將學測/分科測驗課綱全量寫入 D1 資料庫與 KV 快取。第一次部署後執行一次，課綱改版時可再次執行。
                </div>
                {lastSeedResult && (
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    上次執行結果：成功植入 {lastSeedResult.count} 個節點
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setIsSeedModalOpen(true)}
                  disabled={isSeedingTaxonomy}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-2xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSeedingTaxonomy ? 'animate-spin' : ''}`} />
                  <span>{isSeedingTaxonomy ? '初始化中...' : '執行課綱 Seed'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: API Keys */}
      {activeTab === 'apikeys' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6">
            <div className="flex items-center space-x-3 text-[#374151] dark:text-[#D1D5DB]">
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] rounded-2xl">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-bold">iOS 捷徑 API Key 管理</h1>
                <p className="text-xs text-[#9CA3AF]">
                  產生傳輸金鑰供 iPad / iPhone 捷徑將照片拍完直接 POST 上傳至 Redolve
                </p>
              </div>
            </div>
          </div>

          {/* Newly Generated Key Alert Box */}
          {newKey && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 rounded-3xl p-6 space-y-3">
              <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>新 API Key 已順利生成！此明文僅顯示一次，請立即複製：</span>
              </div>

              <div className="flex items-center space-x-2 bg-white dark:bg-[#202023] p-3 rounded-2xl border border-emerald-200 dark:border-emerald-900/40">
                <code className="text-xs font-mono text-[#374151] dark:text-[#D1D5DB] flex-1 truncate">
                  {newKey}
                </code>
                <button
                  onClick={handleCopyNewKey}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#6366F1] text-white text-xs font-medium hover:bg-[#4F46E5]"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? '已複製' : '複製 Key'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Generate Key Form */}
          <form onSubmit={handleCreateKey} className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 space-y-4">
            <h2 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">
              新增 API 金鑰
            </h2>
            <div className="flex items-center space-x-3">
              <input
                type="text"
                placeholder="金鑰用途說明 (例如: iPad Pro 拍照捷徑)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flex-1 px-4 py-2 rounded-2xl text-xs bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#D1D5DB]"
              />
              <button
                type="submit"
                className="flex items-center space-x-1.5 px-4 py-2 rounded-2xl text-xs font-medium bg-[#6366F1] text-white hover:bg-[#4F46E5] shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>生成 Key</span>
              </button>
            </div>
          </form>

          {/* Keys List */}
          <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 space-y-4">
            <h2 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">
              已授權的 API Key 列表
            </h2>

            {loadingKeys ? (
              <div className="text-center py-6 text-xs text-[#9CA3AF]">載入金鑰中...</div>
            ) : keys.length === 0 ? (
              <div className="text-center py-8 text-xs text-[#9CA3AF]">目前尚未建立任何 API Key。</div>
            ) : (
              <div className="space-y-3">
                {keys.map((k) => (
                  <div
                    key={k.key_prefix}
                    className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-semibold text-[#374151] dark:text-[#D1D5DB]">
                        {k.description || '無備註'}
                      </div>
                      <div className="text-[11px] font-mono text-[#9CA3AF] mt-0.5">
                        前綴: {k.key_prefix}••••••••
                      </div>
                    </div>

                    <button
                      onClick={() => setRevokeKeyTarget(k.key_prefix)}
                      className="p-2 rounded-xl text-stone-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                      title="撤銷此 Key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revoke API Key Modal */}
      <ConfirmModal
        isOpen={Boolean(revokeKeyTarget)}
        title="撤銷 API Key"
        message="確定要撤銷此 API Key 嗎？使用此 Key 的 iOS 捷徑將無法再上傳錯題。"
        confirmText="確定撤銷"
        cancelText="取消"
        isDestructive={true}
        onConfirm={confirmRevokeKey}
        onCancel={() => setRevokeKeyTarget(null)}
      />

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

      {/* Seed Official Taxonomy Modal */}
      <ConfirmModal
        isOpen={isSeedModalOpen}
        title="重新初始化官方課綱"
        message="確定要重新初始化系統課綱嗎？這將覆蓋所有官方課綱節點並更新快取。"
        confirmText={isSeedingTaxonomy ? '初始化中...' : '確定初始化'}
        cancelText="取消"
        isDestructive={true}
        onConfirm={confirmSeedTaxonomy}
        onCancel={() => setIsSeedModalOpen(false)}
      />
    </div>
  );
};
