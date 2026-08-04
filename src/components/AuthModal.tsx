import React, { useState, useEffect } from 'react';
import { X, User, LogIn, LogOut, CheckCircle2, Shield, RefreshCw, KeyRound } from 'lucide-react';
import { useStore } from '../store/useStore';
import { fetchCurrentUser, loginUser, logoutUser, fetchProblems, getGoogleAuthUrl } from '../services/api';

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

  const [emailInput, setEmailInput] = useState<string>('');
  const [nameInput, setNameInput] = useState<string>('');
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

  const handleLogin = async (payload: { email?: string; name?: string; userId?: string }) => {
    try {
      setIsLoading(true);
      const res = await loginUser(payload);
      setCurrentUser(res.user, res.token);
      showToast(`已成功登入為「${res.user.name || res.user.email}」`, 'success', 2500);

      // Refresh problems list for the new user
      const problemsRes = await fetchProblems({ limit: 50 });
      setProblems(problemsRes.items, problemsRes.nextCursor);

      setAuthModalOpen(false);
    } catch (err: any) {
      console.error('Login error:', err);
      showToast(err.message || '登入失敗，請稍後重試', 'error', 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      await logoutUser();
      logout();
      showToast('已登出並切換至訪客模式', 'info', 2000);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-lg bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB] dark:border-[#2C2C30]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-[#6366F1] dark:text-indigo-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1F2937] dark:text-[#F3F4F6]">
                使用者身分與帳號管理
              </h2>
              <p className="text-xs text-[#9CA3AF]">Redolve 多帳號隔離與雲端資料同步</p>
            </div>
          </div>
          <button
            onClick={() => setAuthModalOpen(false)}
            className="p-2 rounded-2xl text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Session Info */}
        <div className="p-4 rounded-2xl bg-stone-50 dark:bg-[#18181B] border border-stone-200/70 dark:border-stone-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-[#9CA3AF] uppercase">
              目前使用身分 (Active Session)
            </span>
            {currentUser?.id === 'dev_user_default' ? (
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/50">
                <Shield className="w-3 h-3" />
                <span>預設開發模式</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/50">
                <CheckCircle2 className="w-3 h-3" />
                <span>已登入帳號</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3 pt-1">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-xs">
              {(currentUser?.name || currentUser?.email || 'D').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm text-[#1F2937] dark:text-[#F3F4F6] truncate">
                {currentUser?.name || 'Default Developer'}
              </div>
              <div className="text-xs text-[#6B7280] dark:text-[#9CA3AF] font-mono truncate">
                {currentUser?.email || 'dev@redolve.local'}
              </div>
            </div>
            {currentUser && currentUser.id !== 'dev_user_default' && (
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

        {/* Google OAuth Section */}
        <div className="space-y-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={handleGoogleLogin}
            className="w-full py-3 px-4 rounded-2xl border border-stone-200 dark:border-stone-700/80 bg-white dark:bg-[#202023] hover:bg-stone-50 dark:hover:bg-stone-800 text-[#374151] dark:text-[#F3F4F6] text-xs font-semibold transition-all active:scale-[0.98] shadow-xs flex items-center justify-center space-x-2.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
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
            <span>使用 Google 帳號綁定登入 / 註冊</span>
          </button>
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center">
          <div className="border-t border-stone-200 dark:border-stone-800 w-full" />
          <span className="bg-white dark:bg-[#202023] px-3 text-[11px] text-[#9CA3AF] uppercase tracking-wider font-medium shrink-0">
            或使用開發與測試身分
          </span>
        </div>

        {/* Quick Switch Test Accounts */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#4B5563] dark:text-[#D1D5DB] flex items-center space-x-1.5">
            <RefreshCw className="w-3.5 h-3.5 text-indigo-500" />
            <span>快速切換身分 (測試與多裝置模擬)</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleLogin({ userId: 'dev_user_default', email: 'dev@redolve.local', name: '預設開發者' })}
              className="p-3 rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 hover:bg-stone-100 dark:hover:bg-stone-800 text-left transition-all active:scale-[0.98]"
            >
              <div className="font-semibold text-xs text-[#1F2937] dark:text-[#F3F4F6]">預設開發者</div>
              <div className="text-[10px] text-[#9CA3AF] mt-0.5 truncate">dev_user_default</div>
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleLogin({ userId: 'student_alex', email: 'alex@student.edu', name: '高三學生 Alex' })}
              className="p-3 rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 hover:bg-stone-100 dark:hover:bg-stone-800 text-left transition-all active:scale-[0.98]"
            >
              <div className="font-semibold text-xs text-[#1F2937] dark:text-[#F3F4F6]">學生帳號 Alex</div>
              <div className="text-[10px] text-[#9CA3AF] mt-0.5 truncate">alex@student.edu</div>
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleLogin({ userId: 'student_emma', email: 'emma@student.edu', name: '考生 Emma' })}
              className="p-3 rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 hover:bg-stone-100 dark:hover:bg-stone-800 text-left transition-all active:scale-[0.98]"
            >
              <div className="font-semibold text-xs text-[#1F2937] dark:text-[#F3F4F6]">考生 Emma</div>
              <div className="text-[10px] text-[#9CA3AF] mt-0.5 truncate">emma@student.edu</div>
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleLogin({ userId: 'teacher_chen', email: 'chen@school.edu', name: '陳老師 (導師)' })}
              className="p-3 rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50 hover:bg-stone-100 dark:hover:bg-stone-800 text-left transition-all active:scale-[0.98]"
            >
              <div className="font-semibold text-xs text-[#1F2937] dark:text-[#F3F4F6]">陳老師 (導師)</div>
              <div className="text-[10px] text-[#9CA3AF] mt-0.5 truncate">chen@school.edu</div>
            </button>
          </div>
        </div>

        {/* Custom Email / User Login Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (emailInput.trim()) {
              handleLogin({
                email: emailInput.trim(),
                name: nameInput.trim() || undefined,
              });
            }
          }}
          className="p-4 rounded-2xl bg-stone-50/60 dark:bg-[#161619] border border-stone-200/70 dark:border-stone-800 space-y-3"
        >
          <div className="text-xs font-bold text-[#4B5563] dark:text-[#D1D5DB] flex items-center space-x-1.5">
            <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
            <span>自訂帳號登入 / 註冊</span>
          </div>

          <div className="space-y-2">
            <input
              type="email"
              placeholder="電子郵件 (Email, 例: student@example.com)"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="w-full p-2.5 text-xs rounded-xl bg-white dark:bg-[#202023] border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#E5E7EB] placeholder:text-[#9CA3AF] focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              placeholder="顯示姓名 / 暱稱 (可選)"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="w-full p-2.5 text-xs rounded-xl bg-white dark:bg-[#202023] border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#E5E7EB] placeholder:text-[#9CA3AF] focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !emailInput.trim()}
            className="w-full py-2.5 rounded-xl bg-[#6366F1] text-white hover:bg-[#4F46E5] text-xs font-medium transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center space-x-1.5 shadow-xs"
          >
            <LogIn className="w-4 h-4" />
            <span>確認登入 / 同步身分</span>
          </button>
        </form>
      </div>
    </div>
  );
};
