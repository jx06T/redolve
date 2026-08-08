import React, { useState, useEffect } from 'react';
import { Cloud, ArrowRight, X } from 'lucide-react';
import { useStore } from '../store/useStore';

export const GuestNoticeBanner: React.FC = () => {
  const { currentUser, setAuthModalOpen } = useStore();
  const [dismissed, setDismissed] = useState<boolean>(false);

  // Check session storage for dismissed status
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isDismissed = sessionStorage.getItem('redolve_guest_banner_dismissed') === 'true';
      setDismissed(isDismissed);
    }
  }, []);

  // Is user currently a guest / unauthenticated
  const isGuest = !currentUser || (currentUser.id === 'dev_user_default' && !import.meta.env.DEV);

  if (!isGuest || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('redolve_guest_banner_dismissed', 'true');
    }
  };

  return (
    <div className="mb-4 p-3.5 sm:p-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs transition-all animate-in fade-in duration-200">
      {/* Left Icon & Description */}
      <div className="flex items-start space-x-3">
        <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-[#6366F1] dark:text-indigo-400 shrink-0 mt-0.5 sm:mt-0">
          <Cloud className="w-4 h-4" />
        </div>
        <div className="space-y-0.5">
          <div className="font-bold text-[#1F2937] dark:text-[#F3F4F6] flex items-center space-x-2">
            <span>本機訪客試用模式</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-100/70 dark:bg-indigo-900/60 text-[#6366F1] dark:text-indigo-300">
              未登入
            </span>
          </div>
          <p className="text-[#6B7280] dark:text-[#9CA3AF] leading-relaxed">
            手寫筆跡與刷題紀錄僅暫存於本機。登入 Google 帳號即可免費啟用 iPad / Mac 跨裝置雲端同步與 iOS 截圖一鍵傳送。
          </p>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center space-x-2 self-end sm:self-center shrink-0">
        <button
          type="button"
          onClick={() => setAuthModalOpen(true)}
          className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-[#6366F1] text-white hover:bg-[#4F46E5] active:scale-95 transition-all font-medium shadow-xs"
        >
          <span>登入 / 註冊</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1.5 rounded-xl text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors"
          title="暫時隱藏提示"
          aria-label="暫時隱藏提示"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
