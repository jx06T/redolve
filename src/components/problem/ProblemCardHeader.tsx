import React, { useState } from 'react';
import {
  RotateCw,
  Eye,
  EyeOff,
  Download,
  Share2,
  Trash2,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import { Item } from '../../types';
import { StatusBadge } from '../StatusBadge';
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { fetchProblemText } from '../../services/api';
import { useStore } from '../../store/useStore';

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
  const [isFetchingText, setIsFetchingText] = useState(false);
  const { isCopied, copy } = useCopyToClipboard();
  const { showToast } = useStore();

  const handleCopyText = async () => {
    if (isFetchingText) return;
    setIsFetchingText(true);
    try {
      const res = await fetchProblemText(problem.id);
      if (res.text && res.text.trim().length > 0) {
        const success = await copy(res.text);
        if (success) {
          showToast('已複製題目文字', 'success', 2000);
        } else {
          showToast('複製失敗，請檢查瀏覽器權限', 'error', 3000);
        }
      } else {
        showToast('這題目前沒有擷取到文字可以複製', 'warning', 3000);
      }
    } catch (err) {
      console.error('Failed to copy text:', err);
      showToast('取得題目文字失敗，請稍後再試', 'error', 3000);
    } finally {
      setIsFetchingText(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-3 border-b border-border-subtle gap-2 min-w-0">
      {/* Left Badges */}
      <div className="flex items-center flex-wrap gap-2 gap-y-1.5 min-w-0 flex-1">
        {problemIndex === undefined && (
          <span className="inline-block text-xs px-2.5 py-1 rounded-lg bg-primary-50 text-primary border border-primary-200/50 font-mono">
            {problemCode}
          </span>
        )}
        <StatusBadge
          status={problem.status}
          topicId={problem.topic_id}
          onClickEdit={() => onEditMetadata && onEditMetadata(problem)}
        />
        {problem.source && (
          <span className="inline-block text-xs text-text-muted px-2.5 py-1 rounded-lg bg-neutral-100 font-medium">
            {problem.source}
          </span>
        )}
      </div>

      {/* Right Toolbar Actions */}
      <div className="flex items-center gap-1 flex-wrap ">
        {/* Copy Text Button */}
        <button
          type="button"
          onClick={handleCopyText}
          disabled={isFetchingText}
          aria-label="複製題目文字"
          className="p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-neutral-100 active:scale-95 transition-all"
          title="複製題目文字"
        >
          {isFetchingText ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          ) : isCopied ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>

        {/* Manual Reload Button */}
        <button
          type="button"
          onClick={onReload}
          disabled={isReloading}
          aria-label="手動重新載入本題資料"
          className={`p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-neutral-100 active:scale-95 transition-all ${isReloading ? 'text-primary cursor-not-allowed' : ''
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
          className={`p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-neutral-100 active:scale-95 transition-all ${!inkVisible ? 'text-accent-500 font-semibold bg-accent-50 ' : ''
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
          className="p-2 rounded-xl text-text-muted hover:text-text-main hover:bg-neutral-100 active:scale-95 transition-all"
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
