import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  LogOut,
  CheckCircle2,
  Check,
  Minus,
  Sparkles,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { fetchCurrentUser, logoutUser, fetchProblems, getGoogleAuthUrl } from '../services/api';

export const AuthModal: React.FC = () => {
  const {
    authModalOpen,
    setAuthModalOpen,
    currentUser,
    setCurrentUser,
    logout,
    showToast,
    setProblems,
  } = useStore();

  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Load current user on open
  useEffect(() => {
    if (authModalOpen) {
      loadUserInfo();
    }
  }, [authModalOpen]);

  const loadUserInfo = async () => {
    try {
      const meRes = await fetchCurrentUser().catch(() => null);
      if (meRes?.user) {
        setCurrentUser(meRes.user);
      }
    } catch (err) {
      console.error('Failed to load user info:', err);
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      await logoutUser();
      logout();
      showToast('已登出並切換至本機訪客模式', 'info', 2000);

      // Reload default problems
      const problemsRes = await fetchProblems({ limit: 50 });
      setProblems(problemsRes.items, problemsRes.nextCursor);

      setAuthModalOpen(false);
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      const res = await getGoogleAuthUrl();
      if (res.configured && res.url) {
        window.location.href = res.url;
      } else {
        showToast('尚未配置 GOOGLE_CLIENT_ID，請在 .dev.vars 設定 Google OAuth 憑證', 'info', 5000);
      }
    } catch (err: any) {
      console.error('Google Auth Error:', err);
      showToast('無法啟動 Google 登入，請檢查網路連線', 'error', 3000);
    } finally {
      setIsLoading(false);
    }
  };

  if (!authModalOpen) return null;

  const isGuest = !currentUser || !currentUser.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-xl flex flex-col max-h-[88vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border-subtle shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-2xl bg-primary-50 dark:bg-primary-950/40 text-primary">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-main">
                使用者身分與帳號管理
              </h2>
              <p className="text-xs text-text-muted">Redolve 多帳號隔離與雲端資料同步</p>
            </div>
          </div>
          <button
            onClick={() => setAuthModalOpen(false)}
            className="p-2 rounded-2xl text-text-muted hover:text-text-main hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Inner Body */}
        <div className="p-6 pt-4 space-y-5 overflow-y-auto flex-1 custom-scrollbar">

          {/* Current Active Session Info */}
          <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-900/60 border border-border-subtle space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-text-muted uppercase">
                目前使用身分 (Active Session)
              </span>
              {isGuest ? (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-border-subtle">
                  <span>訪客試用模式 (未登入)</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-status-resolved/10 text-status-resolved border border-status-resolved/20">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>已登入雲端帳號</span>
                </span>
              )}
            </div>

            <div className="flex items-center space-x-3 pt-1">
              <div className="w-11 h-11 rounded-2xl bg-primary text-white flex items-center justify-center font-bold text-base shadow-xs overflow-hidden">
                {isGuest ? (
                  '訪'
                ) : currentUser?.image ? (
                  <img src={currentUser.image} alt={currentUser.name || 'User'} className="w-full h-full object-cover" />
                ) : (
                  (currentUser?.name || currentUser?.email || 'U').charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-text-main truncate">
                  {isGuest ? '本機訪客使用者' : currentUser?.name || '雲端使用者'}
                </div>
                <div className="text-xs text-text-muted font-mono truncate">
                  {isGuest
                    ? '筆跡與篩選設定暫存於目前瀏覽器'
                    : currentUser?.email}
                </div>
              </div>
              {!isGuest && currentUser && (
                <button
                  onClick={handleLogout}
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-xl text-xs text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 transition-all font-medium flex items-center space-x-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>登出</span>
                </button>
              )}
            </div>
          </div>

          {/* Feature Comparison Table (Only shown in guest mode to explain differences) */}
          {isGuest && (
            <div className="p-4 rounded-2xl bg-neutral-50/70 dark:bg-neutral-900/60 border border-border-subtle space-y-3">
              <div className="flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-bold text-text-main">
                  訪客試用 vs 登入會員 功能比較
                </h3>
              </div>

              <div className="overflow-hidden rounded-xl border border-border-subtle text-[11px]">
                <table className="w-full text-left">
                  <thead className="bg-neutral-100/70 dark:bg-neutral-800/60 text-text-muted border-b border-border-subtle font-semibold">
                    <tr>
                      <th className="py-2 px-3">功能項目</th>
                      <th className="py-2 px-2.5 text-neutral-500">訪客試用</th>
                      <th className="py-2 px-2.5 text-primary">登入會員</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle text-text-main">
                    <tr>
                      <td className="py-2 px-3">Apple Pencil 向量書寫與草稿</td>
                      <td className="py-2 px-2.5 text-text-muted">本機暫存</td>
                      <td className="py-2 px-2.5 font-medium text-status-resolved">雲端永久備份</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3">iPad / Mac / iPhone 跨裝置同步</td>
                      <td className="py-2 px-2.5 text-neutral-400">
                        <Minus className="w-3.5 h-3.5" />
                      </td>
                      <td className="py-2 px-2.5 font-medium text-status-resolved">
                        <Check className="w-3.5 h-3.5 inline mr-1" />
                        即時同步
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3">iOS 截圖一鍵傳送捷徑 (API Key)</td>
                      <td className="py-2 px-2.5 text-neutral-400">
                        <Minus className="w-3.5 h-3.5" />
                      </td>
                      <td className="py-2 px-2.5 font-medium text-status-resolved">
                        <Check className="w-3.5 h-3.5 inline mr-1" />
                        專屬金鑰
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3">高中學測・分科課綱章節篩選</td>
                      <td className="py-2 px-2.5 text-text-muted">支援</td>
                      <td className="py-2 px-2.5 font-medium text-status-resolved">支援並記憶偏好</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Google OAuth Section (Shown for Guest or to link another account) */}
          {isGuest && (
            <div className="space-y-2">
              <button
                type="button"
                disabled={isLoading}
                onClick={handleGoogleLogin}
                className="w-full py-3 px-4 rounded-2xl border border-primary-200/80 dark:border-primary-800/80 bg-primary-50/60 dark:bg-primary-950/40 hover:bg-primary-100/70 dark:hover:bg-primary-900/60 text-text-main text-xs font-bold transition-all active:scale-[0.98] shadow-xs flex items-center justify-center space-x-2.5"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>使用 Google 帳號一鍵登入 / 免費註冊</span>
              </button>
              <p className="text-[11px] text-center text-text-muted">
                登入僅讀取基本公開個人檔案與 Email，不存取任何額外隱私資訊。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
