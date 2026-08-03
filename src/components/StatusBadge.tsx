import { Loader2, Tag, AlertCircle } from 'lucide-react';
import { TAXONOMY_SEED_DATA } from '../../worker/data/taxonomy-seed';

interface StatusBadgeProps {
  status: 'processing' | 'unsolved' | 'resolved';
  topicId: string | null;
  topicLabel?: string;
  onClickEdit?: () => void;
}

function resolveTopicLabel(topicId: string | null, customLabel?: string): string {
  if (customLabel) return customLabel;
  if (!topicId) return '未指定單元';

  for (const subject of TAXONOMY_SEED_DATA) {
    if (subject.id === topicId) return subject.label;
    if (subject.children) {
      for (const unit of subject.children) {
        if (unit.id === topicId) return unit.label;
      }
    }
  }
  return topicId;
}

export function StatusBadge({ status, topicId, topicLabel, onClickEdit }: StatusBadgeProps) {
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-medium bg-stone-100 dark:bg-stone-800 text-[#9CA3AF] border border-[#E5E7EB] dark:border-[#2C2C30]">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6366F1]" />
        <span>AI 辨識中...</span>
      </span>
    );
  }

  if (!topicId) {
    return (
      <button
        onClick={onClickEdit}
        aria-label="尚未分類題目，點此編輯標籤"
        className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 active:scale-95 transition-all"
      >
        <AlertCircle className="w-3.5 h-3.5" />
        <span>尚未分類 — 點此編輯</span>
      </button>
    );
  }

  const displayLabel = resolveTopicLabel(topicId, topicLabel);

  return (
    <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-medium bg-[#6366F1]/10 text-[#6366F1] dark:text-indigo-300 border border-[#6366F1]/20">
      <Tag className="w-3.5 h-3.5 text-[#6366F1] dark:text-indigo-400" />
      <span>{displayLabel}</span>
    </span>
  );
}
