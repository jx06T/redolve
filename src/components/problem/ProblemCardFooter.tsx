import React from 'react';
import { Archive, ArchiveRestore, CheckCircle } from 'lucide-react';
import { Item } from '../../types';

interface ProblemCardFooterProps {
  problem: Item;
  isResolved: boolean;
  readOnly?: boolean;
  onToggleArchive: () => void;
  onToggleStatus: () => void;
}

export const ProblemCardFooter: React.FC<ProblemCardFooterProps> = ({
  problem,
  isResolved,
  readOnly = false,
  onToggleArchive,
  onToggleStatus,
}) => {
  return (
    <div className="mt-3 pt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#9CA3AF]">
      {/* Review KPI & Archive Badge */}
      <div className="flex items-center space-x-3">
        <span>複習次數: {problem.review_count} 次</span>
        {problem.status === 'archived' && (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-medium text-[11px] border border-stone-200 dark:border-stone-700">
            <Archive className="w-3 h-3 text-stone-500" />
            <span>已封存</span>
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-2">
        {!readOnly && (
          <button
            type="button"
            onClick={onToggleArchive}
            aria-label={problem.status === 'archived' ? '解除封存' : '封存此題目（確定不會再錯）'}
            className={`inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-medium active:scale-95 transition-all border ${
              problem.status === 'archived'
                ? 'bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
                : 'bg-stone-100 dark:bg-stone-800 text-[#6B7280] dark:text-[#9CA3AF] border-stone-200 dark:border-stone-700 hover:text-[#374151] dark:hover:text-[#D1D5DB] hover:bg-stone-200 dark:hover:bg-stone-700'
            }`}
            title={
              problem.status === 'archived'
                ? '解除封存：移回常規複習流'
                : '封存題目：確定熟練不再錯，自常規複習流隱藏'
            }
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
          type="button"
          onClick={onToggleStatus}
          aria-label={isResolved ? '已標記訂正完畢' : '標記完成訂正'}
          className={`inline-flex items-center space-x-2 px-4 py-2 rounded-xl font-medium active:scale-95 transition-all ${
            isResolved
              ? 'bg-[#39a07d] text-white hover:bg-[#0c8b63]'
              : 'bg-stone-100 dark:bg-stone-800 text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-200 dark:hover:bg-stone-700'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          <span>{isResolved ? '已標記訂正完畢' : '標記完成訂正'}</span>
        </button>
      </div>
    </div>
  );
};
