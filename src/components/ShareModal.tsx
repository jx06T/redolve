import React, { useState, useEffect } from 'react';
import { X, Share2, Copy, Check, Link2Off, Eye, FileText, Send } from 'lucide-react';
import { createShareLink, revokeShareLink, listShareLinks, ShareLink } from '../services/api';
import { useStore } from '../store/useStore';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';

interface ShareModalProps {
  isOpen: boolean;
  problemId: string;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, problemId, onClose }) => {
  const { showToast, currentUser, setAuthModalOpen } = useStore();

  const [includeInk, setIncludeInk] = useState<boolean>(true);
  const [includeNotes, setIncludeNotes] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [expiryDays, setExpiryDays] = useState<'1' | '7' | '30' | 'never'>('7');
  const [existingShares, setExistingShares] = useState<ShareLink[]>([]);
  
  const { isCopied, copy } = useCopyToClipboard(2500);

  // 當開啟新題目的 Share Modal 時，重置狀態
  useEffect(() => {
    let active = true;
    if (isOpen) {
      setShareUrl(null);
      setShareToken(null);
      setExistingShares([]);
      if (currentUser) {
        listShareLinks(problemId)
          .then(({ shares }) => { if (active) setExistingShares(shares); })
          .catch(() => { if (active) setExistingShares([]); });
      }
    }
    return () => { active = false; };
  }, [isOpen, problemId, currentUser]);

  if (!isOpen) return null;

  // 1. 產生連結 (非同步網路請求)
  const handleGenerateShareLink = async () => {
    setIsGenerating(true);
    try {
      // 將 includeInk 與 includeNotes 傳給後端 API
      const expiresAt = expiryDays === 'never' ? null : new Date(Date.now() + Number(expiryDays) * 24 * 60 * 60 * 1000).toISOString();
      const res = await createShareLink(problemId, includeInk, includeNotes, expiresAt);
      const generatedUrl = `${window.location.origin}/share/${res.token}`;
      setShareToken(res.token);
      setShareUrl(generatedUrl);
      const { shares } = await listShareLinks(problemId);
      setExistingShares(shares);
      showToast('已生成公開分享連結！請點擊下方按鈕複製或分享', 'success');
    } catch (err: any) {
      console.error('Failed to create share link:', err);
      showToast(err?.message || '產生分享連結失敗，請檢查網路連線後重試', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. 複製網址到剪貼簿
  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    const success = await copy(shareUrl);
    if (success) {
      showToast('已成功複製分享連結至剪貼簿', 'success', 2000);
    } else {
      showToast('複製失敗，請手動選取網址複製', 'error');
    }
  };

  // 3. 手機原生分享面板 (點擊按鈕直接同步觸發，手機 100% 成功)
  const handleNativeShare = async () => {
    if (!shareUrl) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Redolve 錯題分享',
          text: '檢視錯題資料：',
          url: shareUrl,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          handleCopyShareUrl();
        }
      }
    } else {
      handleCopyShareUrl();
    }
  };

  // 4. 撤銷分享
  const handleRevoke = async (token: string) => {
    try {
      await revokeShareLink(problemId, token);
      if (shareToken === token) {
        setShareUrl(null);
        setShareToken(null);
      }
      setExistingShares((shares) => shares.filter((share) => share.token !== token));
      showToast('已成功撤銷公開分享連結', 'info');
    } catch (err: any) {
      console.error('Failed to revoke share link:', err);
      showToast(err?.message || '撤銷分享連結失敗', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 select-none">
      <div className="mt-6 sm:mt-14 max-h-[calc(100dvh-3rem)] overflow-y-auto bg-surface border border-border-subtle rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-primary-50 text-primary rounded-2xl">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-main">公開題目分享</h3>
              <p className="text-xs text-text-muted">設定分享範圍並生成網址</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-neutral-100 text-text-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!currentUser ? (
          <div className="space-y-3 text-sm text-text-muted">
            <p>公開分享需要先登入。訪客題目仍保存在此瀏覽器。</p>
            <button type="button" className="px-4 py-2 rounded-xl bg-primary text-white" onClick={() => { onClose(); setAuthModalOpen(true); }}>登入以分享</button>
          </div>
        ) : <>
        {/* Options */}
        <div className="space-y-3 text-xs">
          <label className="flex items-center justify-between p-3 rounded-2xl bg-neutral-50 border border-border-subtle cursor-pointer">
            <div className="flex items-center space-x-2.5">
              <Eye className="w-4 h-4 text-primary" />
              <span className="font-semibold text-text-main">包含手寫筆跡 (Drawings)</span>
            </div>
            <input
              type="checkbox"
              checked={includeInk}
              onChange={(e) => setIncludeInk(e.target.checked)}
              className="w-4 h-4 accent-primary rounded cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-2xl bg-neutral-50 border border-border-subtle cursor-pointer">
            <div className="flex items-center space-x-2.5">
              <FileText className="w-4 h-4 text-primary" />
              <span className="font-semibold text-text-main">包含打字筆記 (Typed Notes)</span>
            </div>
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => setIncludeNotes(e.target.checked)}
              className="w-4 h-4 accent-primary rounded cursor-pointer"
            />
          </label>
          <label className="flex items-center justify-between p-3 rounded-2xl bg-neutral-50 border border-border-subtle">
            <span className="font-semibold text-text-main">連結有效期限</span>
            <select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value as typeof expiryDays)} className="rounded-xl bg-surface border border-border-subtle px-2 py-1 text-text-main">
              <option value="1">1 天</option>
              <option value="7">7 天</option>
              <option value="30">30 天</option>
              <option value="never">永久，直到撤銷</option>
            </select>
          </label>
        </div>

        {/* Result Area */}
        {shareUrl && (
          <div className="p-3.5 rounded-2xl bg-primary-50/80 border border-primary-200/60 space-y-3">
            <div className="text-[11px] font-semibold text-primary">已生成的分享網址</div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className=" outline-none flex-1 px-3 py-2 rounded-xl bg-surface border border-primary-200 font-mono text-xs text-text-main select-all focus:outline-none"
              />
            </div>

            {/* 按鈕功能組 */}
            <div className="flex items-center gap-2 pt-1">
              {/* 如果手機支援原生分享面板 (Web Share API) */}
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button
                  onClick={handleNativeShare}
                  className="flex-1 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary-hover active:scale-95 transition-all flex items-center justify-center space-x-1.5 shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={handleCopyShareUrl}
                className="flex-1 px-1 py-2 rounded-xl bg-surface text-text-main border border-border-subtle text-xs font-semibold hover:bg-neutral-100 active:scale-95 transition-all flex items-center justify-center space-x-1.5"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-status-resolved" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopied ? '已複製' : '複製網址'}</span>
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => shareToken && handleRevoke(shareToken)}
                className="text-xs text-rose-500 hover:text-rose-600 font-medium flex items-center space-x-1"
              >
                <Link2Off className="w-3.5 h-3.5" />
                <span>撤銷此分享連結</span>
              </button>
            </div>
          </div>
        )}

        {existingShares.length > 0 && (
          <div className="space-y-2 max-h-36 overflow-y-auto text-xs">
            <p className="font-semibold text-text-main">現有分享連結</p>
            {existingShares.map((share) => (
              <div key={share.token} className="flex items-center justify-between gap-2 rounded-xl border border-border-subtle p-2 text-text-muted">
                <span className="truncate">{share.expires_at ? `有效至 ${new Date(share.expires_at).toLocaleDateString('zh-TW')}` : '永久有效'} · {share.allow_ink ? '含筆跡' : '無筆跡'} · {share.allow_notes ? '含筆記' : '無筆記'}</span>
                <button type="button" className="shrink-0 text-primary" onClick={() => copy(`${window.location.origin}/share/${share.token}`)}>複製</button>
                <button type="button" className="shrink-0 text-rose-500" onClick={() => handleRevoke(share.token)}>撤銷</button>
              </div>
            ))}
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-text-muted hover:bg-neutral-100 transition-colors"
          >
            關閉
          </button>
          <button
            type="button"
            onClick={handleGenerateShareLink}
            disabled={isGenerating}
            className="px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-xs active:scale-95 transition-all disabled:opacity-50"
          >
            {isGenerating ? '正在生成...' : '確認產生連結'}
          </button>
        </div>
        </>}
      </div>
    </div>
  );
};
