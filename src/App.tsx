import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Toast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DashboardView } from './views/DashboardView';
import { StudyView } from './views/StudyView';
import { ProblemDetailView } from './views/ProblemDetailView';
import { SearchView } from './views/SearchView';
import { ShareView } from './views/ShareView';
import { SettingsView } from './views/SettingsView';
import { registerServiceWorker } from './services/swRegister';
import { initOnlineSync } from './services/offlineStorage';
import { updateProblemDrawData } from './services/api';
import { useStore } from './store/useStore';

export default function App() {
  const { setCurrentUser, showToast } = useStore();

  useEffect(() => {
    // Check for Google OAuth callback parameters
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('auth_token');
    const authName = urlParams.get('auth_name');
    const authEmail = urlParams.get('auth_email');
    const authError = urlParams.get('auth_error');

    if (authToken) {
      setCurrentUser(
        {
          id: authToken,
          name: authName || authEmail || 'Google User',
          email: authEmail || `${authToken}@google.user`,
          created_at: new Date().toISOString(),
        },
        authToken
      );
      showToast(`已透過 Google 帳號成功登入為「${authName || authEmail}」`, 'success', 3500);

      // Clean query parameters from URL
      window.history.replaceState(null, '', window.location.pathname);
    } else if (authError) {
      showToast(`Google 登入失敗: ${decodeURIComponent(authError)}`, 'error', 4000);
      window.history.replaceState(null, '', window.location.pathname);
    }

    // Register PWA Service Worker
    if ((import.meta as any).env.PROD) {
      registerServiceWorker();
    }

    // Register Online Auto-Sync Handler
    initOnlineSync(async (item) => {
      try {
        const res = await updateProblemDrawData(item.id, item.drawData, item.seq);
        return res.status === 'ok';
      } catch {
        return false;
      }
    });
  }, [setCurrentUser, showToast]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="min-h-screen bg-[#F4F4F2] dark:bg-[#161618] text-[#374151] dark:text-[#D1D5DB] transition-colors duration-200 flex flex-col font-sans">
          <Toast />
          <Routes>
            {/* Public Share Route without main layout header */}
            <Route path="/share/:token" element={<ShareView />} />

            {/* Main App Routes */}
            <Route
              path="*"
              element={
                <>
                  <Navbar />
                  <main className="flex-1 max-w-[1600px] w-full mx-auto px-2 sm:px-4 py-3">
                    <Routes>
                      <Route path="/" element={<DashboardView />} />
                      <Route path="/study" element={<Navigate to="/study/all" replace />} />
                      <Route path="/study/:subject" element={<StudyView />} />
                      <Route path="/study/:subject/:topic" element={<StudyView />} />
                      <Route path="/study/:subject/:topic/:problemId" element={<StudyView />} />
                      <Route path="/problem/:id" element={<ProblemDetailView />} />
                      <Route path="/search" element={<SearchView />} />
                      <Route path="/settings" element={<SettingsView />} />
                    </Routes>
                  </main>
                </>
              }
            />
          </Routes>
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
};
