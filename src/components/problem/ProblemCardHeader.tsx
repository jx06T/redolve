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
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-border-subtle">
      {/* Left Badges */}
      <div className="flex items-center flex-wrap gap-2 gap-y-1.5">
        {problemIndex === undefined && (
          <span className="inline-block text-xs px-2.5 py-1 rounded-lg bg-primary-50 dark:bg-primary-950/40 text-primary border border-primary-200/50 dark:border-primary-850/40 font-mono">
            {problemCode}
          </span>
        )}
        <StatusBadge
          status={problem.status}
          topicId={problem.topic_id}
          onClickEdit={() => onEditMetadata && onEditMetadata(problem)}
        />
        {problem.source && (
          <span className="inline-block text-xs text-text-muted px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800/60 font-medium">
            {problem.source}
          </span>
        )}
      </div>

      {/* Right Toolbar Actions */}
      <div className="flex items-center gap-1 flex-wrap ">
        {/* Manual Reload Button */}
        <button
          type="button"
          onClick={onReload}
          disabled={isReloading}
          aria-label="手動重新載入本題資料"
          className={`p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-neutral-100 dark:hover:bg-neutral-800/50 active:scale-95 transition-all ${isReloading ? 'text-primary cursor-not-allowed' : ''
            }`}
          title="手動重新載入本題最新狀態"
        >
          <RotateCw className={`w-4 h-4 ${isReloading ? 'animate-spin text-primary' : ''}`} />
        </button>

        {/* Ink Hide/Show Toggle */}
        <button
          type="button"
          onClick={onToggleInk}
          aria-label={inkVisible ? '隱藏筆跡 (二刷原題)' : '顯示筆跡'}
          className={`p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-neutral-100 dark:hover:bg-neutral-800/50 active:scale-95 transition-all ${!inkVisible ? 'text-accent-500 font-semibold bg-accent-50 dark:bg-accent-950/30' : ''
            }`}
          title={inkVisible ? '隱藏筆跡 (二刷原題)' : '顯示筆跡'}
        >
          {inkVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-accent-500" />}
        </button>

        {/* Export High-Res PNG Button */}
        <button
          type="button"
          onClick={onExport}
          disabled={isExporting}
          aria-label="導出高清訂正圖檔"
          className="p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-neutral-100 dark:hover:bg-neutral-800/50 active:scale-95 transition-all"
          title="導出合成圖檔 (PNG)"
        >
          <Download className="w-4 h-4" />
        </button>

        {/* Share Button */}
        <button
          type="button"
          onClick={onOpenShareModal}
          aria-label="開啟公開分享設定"
          className="p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-neutral-100 active:scale-95 transition-all"
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
            className="p-2 rounded-xl text-text-muted hover:text-status-eraser hover:bg-status-eraser/10 active:scale-95 transition-all"
            title="刪除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
