import React, { useState } from 'react';
import { X, Share2, Copy, Check, Link2Off, Eye, FileText } from 'lucide-react';
import { createShareLink, revokeShareLink } from '../services/api';
import { useStore } from '../store/useStore';

interface ShareModalProps {
  isOpen: boolean;
  problemId: string;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, problemId, onClose }) => {
  const { showToast } = useStore();

  const [includeInk, setIncludeInk] = useState<boolean>(true);
  const [includeNotes, setIncludeNotes] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleGenerateShareLink = async () => {
    setIsGenerating(true);
    setShareUrl(null);
    setShareToken(null);
    try {
      const res = await createShareLink(problemId, includeInk);
      const generatedUrl = `${window.location.origin}/share/${res.token}`;
      setShareToken(res.token);
      setShareUrl(generatedUrl);
      await navigator.clipboard.writeText(generatedUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
      showToast('已生成公開分享連結並自動複製至剪貼簿', 'success');
    } catch (err: any) {
      console.error('Failed to create share link:', err);
      setShareUrl(null);
      setShareToken(null);
      showToast(err?.message || '產生分享連結失敗，請檢查網路連線後重試', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    } catch {
      // ignore
    }
  };

  const handleRevoke = async () => {
    if (!shareToken) return;
    try {
      await revokeShareLink(problemId, shareToken);
      setShareUrl(null);
      setShareToken(null);
      showToast('已成功撤銷公開分享連結', 'info');
    } catch (err: any) {
      console.error('Failed to revoke share link:', err);
      showToast(err?.message || '撤銷分享連結失敗', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-start justify-center p-4">
      <div className="mt-14 bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] rounded-2xl">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#374151] dark:text-[#D1D5DB]">公開題目分享</h3>
              <p className="text-xs text-[#9CA3AF]">設定分享範圍並生成網址</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-[#9CA3AF]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="space-y-3 text-xs">
          <label className="flex items-center justify-between p-3 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-800 cursor-pointer">
            <div className="flex items-center space-x-2.5">
              <Eye className="w-4 h-4 text-indigo-500" />
              <span className="font-semibold text-[#374151] dark:text-[#D1D5DB]">包含手寫筆跡 (Drawings)</span>
            </div>
            <input
              type="checkbox"
              checked={includeInk}
              onChange={(e) => setIncludeInk(e.target.checked)}
              className="w-4 h-4 accent-[#6366F1] rounded cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-800 cursor-pointer">
            <div className="flex items-center space-x-2.5">
              <FileText className="w-4 h-4 text-emerald-500" />
              <span className="font-semibold text-[#374151] dark:text-[#D1D5DB]">包含打字筆記 (Typed Notes)</span>
            </div>
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => setIncludeNotes(e.target.checked)}
              className="w-4 h-4 accent-[#6366F1] rounded cursor-pointer"
            />
          </label>
        </div>

        {/* Result Area */}
        {shareUrl && (
          <div className="p-3.5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-900/60 space-y-2.5">
            <div className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">已生成的分享網址</div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-stone-900 border border-indigo-200 dark:border-indigo-800 font-mono text-xs text-[#374151] dark:text-[#D1D5DB] select-all focus:outline-none"
              />
              <button
                onClick={handleCopyShareUrl}
                className="px-3 py-1.5 rounded-xl bg-[#6366F1] text-white text-xs font-semibold hover:bg-[#4F46E5] active:scale-95 transition-all flex items-center space-x-1"
              >
                {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? '已複製' : '複製'}</span>
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={handleRevoke}
                className="text-xs text-rose-500 hover:text-rose-600 font-medium flex items-center space-x-1"
              >
                <Link2Off className="w-3.5 h-3.5" />
                <span>撤銷此分享連結</span>
              </button>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-[#6B7280] dark:text-[#9CA3AF] hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            關閉
          </button>
          <button
            type="button"
            onClick={handleGenerateShareLink}
            disabled={isGenerating}
            className="px-5 py-2 rounded-xl bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-bold shadow-xs active:scale-95 transition-all disabled:opacity-50"
          >
            {isGenerating ? '正在生成...' : '確認產生連結'}
          </button>
        </div>
      </div>
    </div>
  );
};
