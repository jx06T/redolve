import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, LogIn, LogOut, Settings } from 'lucide-react';
import { useStore } from '../store/useStore';
import { fetchCurrentUser, logoutUser, getGoogleAuthUrl } from '../services/api';
import { isGuestUser } from '../utils/guest';
import { AppDialog } from './AppDialog';
import { hasUnsavedMemoryWork } from '../services/workService';
import { PendingWorkPanel } from './PendingWorkPanel';
import { AccountSummary } from './AccountSummary';

export function AuthModal() {
  const { authModalOpen, setAuthModalOpen, currentUser, setCurrentUser, logout, showToast, setProblems } = useStore();
  const [isLoading, setIsLoading] = useState(false);
  const [confirmMemoryLogout, setConfirmMemoryLogout] = useState(false);

  useEffect(() => {
    if (!authModalOpen) return;
    let active = true;
    void fetchCurrentUser().then(result => {
      if (active && result.user) setCurrentUser(result.user);
    });
    return () => { active = false; };
  }, [authModalOpen, setCurrentUser]);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await logoutUser();
      logout();
      setProblems([], null);
      setAuthModalOpen(false);
      showToast('已登出並切換至本機訪客模式', 'info', 2000);
    } catch {
      showToast('登出失敗，請確認網路連線後重試', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const result = await getGoogleAuthUrl(/^\/share\/[a-zA-Z0-9_-]+$/.test(window.location.pathname)?window.location.pathname:undefined);
      if (result.configured && result.url) window.location.href = result.url;
      else showToast('目前無法使用 Google 登入，請稍後再試', 'info', 5000);
    } catch {
      showToast('無法啟動 Google 登入，請檢查網路連線', 'error', 3000);
    } finally {
      setIsLoading(false);
    }
  };

  if (!authModalOpen) return null;
  const guest = isGuestUser(currentUser);
  const close = () => { setAuthModalOpen(false); setConfirmMemoryLogout(false); };
  const linkClass = 'flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-3 text-sm transition-colors hover:bg-page-bg';

  return <>
    {!confirmMemoryLogout && <AppDialog title={guest ? '登入與帳號' : '我的帳號'} onClose={close} busy={isLoading}>
      <AccountSummary user={currentUser} />
      <div className="mt-4"><PendingWorkPanel /></div>
      {guest && <div className="mt-4 space-y-3">
        <p className="text-sm leading-relaxed text-text-muted">可先在目前瀏覽器上傳、書寫與訂正。登入後可使用雲端題庫、共用集與訂閱功能。</p>
        <button type="button" disabled={isLoading} onClick={() => void handleGoogleLogin()}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary disabled:opacity-50">
          <LogIn size={16} />{isLoading ? '正在登入…' : '使用 Google 登入／註冊'}
        </button>
      </div>}
      <div className="mt-5 grid gap-3 border-t border-border-subtle pt-4 sm:grid-cols-2">
        <Link to="/settings#profile" onClick={close} className={linkClass}><Settings size={16} />前往設定</Link>
        <Link to="/about" onClick={close} className={linkClass}><Info size={16} />關於與使用說明</Link>
      </div>
      {!guest && <div className="mt-4 flex justify-end">
        <button type="button" disabled={isLoading} onClick={() => {
          if (hasUnsavedMemoryWork()) setConfirmMemoryLogout(true);
          else void handleLogout();
        }} className="flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-muted hover:bg-page-bg disabled:opacity-50">
          <LogOut size={16} />{isLoading ? '正在登出…' : '登出'}
        </button>
      </div>}
    </AppDialog>}
    {confirmMemoryLogout && <AppDialog title="仍有未寫入本機的作業" onClose={() => setConfirmMemoryLogout(false)} busy={isLoading}>
      <p className="text-sm">本機草稿儲存失敗，登出會失去尚未同步的內容。請先下載自己的作業；若仍要離開，需明確確認。</p>
      <PendingWorkPanel />
      <button disabled={isLoading} onClick={() => { setConfirmMemoryLogout(false); void handleLogout(); }}
        className="mt-4 rounded-xl bg-status-eraser px-4 py-2 text-sm text-white">我已備份，仍要登出</button>
    </AppDialog>}
  </>;
}
