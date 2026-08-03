import { Loader2, Tag, AlertCircle } from 'lucide-react';

interface StatusBadgeProps {
  status: 'processing' | 'unsolved' | 'resolved';
  topicId: string | null;
  topicLabel?: string;
  onClickEdit?: () => void;
}

export function StatusBadge({ status, topicId, topicLabel, onClickEdit }: StatusBadgeProps) {
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>AI 辨識中...</span>
      </span>
    );
  }

  if (!topicId) {
    return (
      <button
        onClick={onClickEdit}
        className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 hover:bg-amber-100 transition-colors"
      >
        <AlertCircle className="w-3.5 h-3.5" />
        <span>尚未分類 — 點此編輯</span>
      </button>
    );
  }

  return (
    <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-900/50">
      <Tag className="w-3.5 h-3.5 text-indigo-400" />
      <span>{topicLabel || topicId}</span>
    </span>
  );
}
