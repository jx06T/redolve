import { Loader2, Tag, AlertCircle } from 'lucide-react';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';
import { useStore } from '../store/useStore';
import { TaxonomyNode } from '../types';

interface StatusBadgeProps {
  status: 'processing' | 'unsolved' | 'resolved' | 'archived';
  topicId: string | null;
  topicLabel?: string;
  onClickEdit?: () => void;
}

export interface TaxonomyPathInfo {
  subject: string;
  unit?: string;
  point?: string;
  fullPath: string;
  codePrefix: string;
  isUnclassified?: boolean;
}

export function findNodeAndLineage(
  nodes: TaxonomyNode[],
  targetId: string,
  currentLineage: TaxonomyNode[] = []
): TaxonomyNode[] | null {
  for (const node of nodes) {
    const lineage = [...currentLineage, node];
    if (node.id === targetId) {
      return lineage;
    }
    if (node.children && node.children.length > 0) {
      const found = findNodeAndLineage(node.children, targetId, lineage);
      if (found) return found;
    }
  }
  return null;
}

export function getRootSubjectId(
  topicId: string | null,
  tree: TaxonomyNode[] = TAXONOMY_SEED_DATA
): string {
  if (!topicId) return 'math';
  const lineage = findNodeAndLineage(tree, topicId) || findNodeAndLineage(TAXONOMY_SEED_DATA, topicId);
  if (lineage && lineage.length > 0) {
    return lineage[0].id;
  }
  return 'math';
}

export function isTopicUnderSubject(
  topicId: string | null | undefined,
  subjectId: string,
  tree: TaxonomyNode[] = TAXONOMY_SEED_DATA
): boolean {
  if (!topicId || topicId === 'unclassified') return true;
  if (topicId === subjectId) return true;
  const lineage = findNodeAndLineage(tree, topicId) || findNodeAndLineage(TAXONOMY_SEED_DATA, topicId);
  if (lineage && lineage.length > 0) {
    return lineage[0].id === subjectId;
  }
  return false;
}

export function getTaxonomyPath(
  topicId: string | null,
  customLabel?: string,
  tree: TaxonomyNode[] = TAXONOMY_SEED_DATA
): TaxonomyPathInfo {
  if (customLabel && customLabel !== topicId) {
    return { subject: customLabel, fullPath: customLabel, codePrefix: 'NOTE' };
  }
  if (!topicId) {
    return { subject: '未分類', fullPath: '未分類章節', codePrefix: 'GEN', isUnclassified: true };
  }

  // 1. Search in active tree (including custom nodes from D1)
  let lineage = findNodeAndLineage(tree, topicId);

  // 2. Fallback to TAXONOMY_SEED_DATA if not in custom tree
  if (!lineage && tree !== TAXONOMY_SEED_DATA) {
    lineage = findNodeAndLineage(TAXONOMY_SEED_DATA, topicId);
  }

  if (lineage && lineage.length > 0) {
    const root = lineage[0];
    const codePrefix =
      root.id === 'math'
        ? 'MATH'
        : root.id === 'physics'
          ? 'PHYS'
          : root.id === 'chem'
            ? 'CHEM'
            : root.id === 'bio'
              ? 'BIO'
              : root.id.substring(0, 4).toUpperCase();

    const pathLabels = lineage.map((n) => n.label);
    const fullPath = pathLabels.join(' › ');
    const unit = lineage.length > 1 ? lineage[1].label : undefined;
    const point = lineage.length > 2 ? lineage[2].label : undefined;

    return {
      subject: root.label,
      unit,
      point,
      fullPath,
      codePrefix,
      isUnclassified: false,
    };
  }

  // If topic ID does not match any valid node in the taxonomy tree, it is unclassified
  return { subject: '未分類', fullPath: '未分類章節', codePrefix: 'GEN', isUnclassified: true };
}

/**
 * Formats a stable, unique problem identifier derived directly from Subject code + ID suffix (e.g. MATH-482DA4)
 * ensuring that problem deletion, pagination, or reordering never disrupts problem numbering.
 */
export function formatProblemCode(
  problem: { id?: string | null; topic_id?: string | null },
  taxonomies?: TaxonomyNode[]
): string {
  const taxonomyInfo = getTaxonomyPath(problem.topic_id ?? null, undefined, taxonomies);
  const rawId = problem.id || '';
  const shortId = rawId ? rawId.replace(/-/g, '').slice(0, 6).toUpperCase() : '------';
  return `${taxonomyInfo.codePrefix}-${shortId}`;
}

export function StatusBadge({ status, topicId, topicLabel, onClickEdit }: StatusBadgeProps) {
  const { taxonomies } = useStore();

  if (status === 'processing') {
    return (
      <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-text-muted border border-border-subtle">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
        <span>AI 辨識中...</span>
      </span>
    );
  }

  const pathInfo = getTaxonomyPath(topicId, topicLabel, taxonomies);

  if (pathInfo.isUnclassified || !topicId) {
    return (
      <button
        onClick={onClickEdit}
        aria-label="尚未分類題目，點此編輯標籤"
        className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-status-warning/10 text-status-warning border border-status-warning/20 hover:bg-status-warning/15 active:scale-95 transition-all"
      >
        <AlertCircle className="w-3.5 h-3.5" />
        <span>尚未分類 — 點此指派</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClickEdit}
      className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 transition-all text-left"
      title="點擊以變更題目分類"
    >
      <Tag className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="truncate max-w-[280px]">{pathInfo.fullPath}</span>
    </button>
  );
}
