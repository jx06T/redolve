import React from 'react';
import {
  RotateCw,
  Eye,
  EyeOff,
  Download,
  Share2,
  Trash2,
} from 'lucide-react';
import { Item } from '../../types';
import { StatusBadge } from '../StatusBadge';

interface ProblemCardHeaderProps {
  problem: Item;
  problemCode: string;
  problemIndex?: number;
  readOnly?: boolean;
  isReloading: boolean;
  inkVisible: boolean;
  isExporting: boolean;
  onReload: () => void;
  onToggleInk: () => void;
  onExport: () => void;
  onOpenShareModal: () => void;
  onOpenDeleteModal: () => void;
  onEditMetadata?: (problem: Item) => void;
}

export const ProblemCardHeader: React.FC<ProblemCardHeaderProps> = ({
  problem,
  problemCode,
  problemIndex,
  readOnly = false,
  isReloading,
  inkVisible,
  isExporting,
  onReload,
  onToggleInk,
  onExport,
  onOpenShareModal,
  onOpenDeleteModal,
  onEditMetadata,
}) => {
  return (
    <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB] dark:border-[#2C2C30]">
      {/* Left Badges */}
      <div className="flex items-center flex-wrap gap-2 gap-y-1.5">
        {problemIndex === undefined && (
          <span className="inline-block text-xs px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/40">
            {problemCode}
          </span>
        )}
        <StatusBadge
          status={problem.status}
          topicId={problem.topic_id}
          onClickEdit={() => onEditMetadata && onEditMetadata(problem)}
        />
        {problem.source && (
          <span className="inline-block text-xs text-[#9CA3AF] px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800/60 font-medium">
            {problem.source}
          </span>
        )}
      </div>

      {/* Right Toolbar Actions */}
      <div className="flex items-center space-x-1 flex-wrap">
        {/* Manual Reload Button */}
        <button
          type="button"
          onClick={onReload}
          disabled={isReloading}
          aria-label="手動重新載入本題資料"
          className={`p-2 rounded-xl text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50 active:scale-95 transition-all ${
            isReloading ? 'text-indigo-500 cursor-not-allowed' : ''
          }`}
          title="手動重新載入本題最新狀態"
        >
          <RotateCw className={`w-4 h-4 ${isReloading ? 'animate-spin text-indigo-500' : ''}`} />
        </button>

        {/* Ink Hide/Show Toggle */}
        <button
          type="button"
          onClick={onToggleInk}
          aria-label={inkVisible ? '隱藏筆跡 (二刷原題)' : '顯示筆跡'}
          className={`p-2 rounded-xl text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50 active:scale-95 transition-all ${
            !inkVisible ? 'text-amber-500 font-semibold bg-amber-50 dark:bg-amber-950/30' : ''
          }`}
          title={inkVisible ? '隱藏筆跡 (二刷原題)' : '顯示筆跡'}
        >
          {inkVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-amber-500" />}
        </button>

        {/* Export High-Res PNG Button */}
        <button
          type="button"
          onClick={onExport}
          disabled={isExporting}
          aria-label="導出高清訂正圖檔"
          className="p-2 rounded-xl text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50 active:scale-95 transition-all"
          title="導出合成圖檔 (PNG)"
        >
          <Download className="w-4 h-4" />
        </button>

        {/* Share Button */}
        <button
          type="button"
          onClick={onOpenShareModal}
          aria-label="開啟公開分享設定"
          className="p-2 rounded-xl text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800/50 active:scale-95 transition-all"
          title="分享題目"
        >
          <Share2 className="w-4 h-4" />
        </button>

        {/* Delete Button */}
        {!readOnly && (
          <button
            type="button"
            onClick={onOpenDeleteModal}
            aria-label="刪除此錯題"
            className="p-2 rounded-xl text-[#9CA3AF] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 active:scale-95 transition-all"
            title="刪除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
