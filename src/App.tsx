import { lazy, Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Toast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { fetchCurrentUser, fetchProblemById, updateProblemDrawData, updateProblemStatus, updateProblemMetadata } from './services/api';
import { initOnlineSync } from './services/offlineStorage';
import { useStore } from './store/useStore';
import { OfflineSyncManager } from './services/OfflineSyncManager';

import { BottomNav } from './components/BottomNav';

const DashboardView = lazy(() => import('./views/DashboardView').then((module) => ({ default: module.DashboardView })));
const StudyView = lazy(() => import('./views/StudyView').then((module) => ({ default: module.StudyView })));
const ProblemDetailView = lazy(() => import('./views/ProblemDetailView').then((module) => ({ default: module.ProblemDetailView })));
const SearchView = lazy(() => import('./views/SearchView').then((module) => ({ default: module.SearchView })));
const ShareView = lazy(() => import('./views/ShareView').then((module) => ({ default: module.ShareView })));
const SettingsView = lazy(() => import('./views/SettingsView').then((module) => ({ default: module.SettingsView })));

export default function App() {
  const { setCurrentUser, showToast, darkMode, loadTaxonomies } = useStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    loadTaxonomies();
  }, [loadTaxonomies]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const urlParams = new URLSearchParams(window.location.search);
    const authError = urlParams.get('auth_error');
    const authSuccess = urlParams.get('auth') === 'success';
    if (authError) showToast(`Google 登入失敗: ${authError}`, 'error', 4000);
    urlParams.delete('auth_error');
    urlParams.delete('auth');
    // Discard legacy token-bearing URLs without putting their contents in storage.
    urlParams.delete('auth_token');
    urlParams.delete('auth_name');
    urlParams.delete('auth_email');
    const cleanSearch = urlParams.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash}`);
    localStorage.removeItem('redolve_auth_token');

    fetchCurrentUser().then(({ user }) => {
      setCurrentUser(user);
      if (user) window.dispatchEvent(new Event('redolve:auth-ready'));
      else if (navigator.onLine) void OfflineSyncManager.analyzePendingGuestProblems((id, tag) =>
        useStore.getState().updateProblemInStore(id, {
          status: 'unsolved', topic_id: tag.topic_id,
          keywords: JSON.stringify(tag.keywords), keyword_tokens: tag.keywords.join(' '),
        }));
      if (authSuccess && user) showToast(`已登入為「${user.name || user.email}」`, 'success', 3500);
    }).catch(() => setCurrentUser(null));
  }, [setCurrentUser, showToast]);

  useEffect(() => {
    return initOnlineSync(async (item) => {
      try {
        const currentUserId = useStore.getState().currentUser?.id;
        if (!currentUserId || (item.ownerId && item.ownerId !== currentUserId)) return false;
        // Legacy queued records have no ownerId. Verify ownership before replaying.
        if (!item.ownerId) {
          const problem = await fetchProblemById(item.id);
          if (problem.user_id !== currentUserId) return false;
        }
        let allSuccess = true;
        if (item.drawData && item.seq !== undefined) {
          const res = await updateProblemDrawData(item.id, item.drawData, item.seq);
          if (res.status !== 'ok') allSuccess = false;
        }
        if (item.status && item.status !== 'processing') {
          await updateProblemStatus(item.id, item.status);
        }
        if (item.typed_notes !== undefined) {
          await updateProblemMetadata(item.id, { typed_notes: item.typed_notes });
        }
        if (item.metadata_patch) {
          await updateProblemMetadata(item.id, item.metadata_patch);
        }
        return allSuccess;
      } catch (err) {
        return false;
      }
    }, () => useStore.getState().currentUser?.id || null);
  }, []);

  useEffect(() => {
    const retryGuestAnalysis = () => {
      if (!useStore.getState().currentUser) void OfflineSyncManager.analyzePendingGuestProblems((id, tag) =>
        useStore.getState().updateProblemInStore(id, {
          status: 'unsolved', topic_id: tag.topic_id,
          keywords: JSON.stringify(tag.keywords), keyword_tokens: tag.keywords.join(' '),
        }));
    };
    window.addEventListener('online', retryGuestAnalysis);
    return () => window.removeEventListener('online', retryGuestAnalysis);
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="h-full bg-page-bg text-text-main transition-colors duration-200 flex flex-col font-sans overflow-hidden">
          <Toast />
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-sm text-text-muted">正在載入頁面…</div>}>
          <Routes>
            {/* Public Share Route without main layout header */}
            <Route path="/share/:token" element={<ShareView />} />

            {/* Main App Routes */}
            <Route
              path="*"
              element={
                <>
                  <Navbar />
                  <main className="flex-1 max-w-[1600px] w-full mx-auto px-2 sm:px-4 py-3 overflow-y-auto overscroll-contain pb-16 md:pb-6">
                    <Routes>
                      <Route path="/" element={<DashboardView />} />
                      <Route path="/study" element={<Navigate to="/study/math" replace />} />
                      <Route path="/study/:subject" element={<StudyView />} />
                      <Route path="/study/:subject/:topic" element={<StudyView />} />
                      <Route path="/study/:subject/:topic/:problemId" element={<StudyView />} />
                      <Route path="/problem/:id" element={<ProblemDetailView />} />
                      <Route path="/search" element={<SearchView />} />
                      <Route path="/settings" element={<SettingsView />} />
                    </Routes>
                  </main>
                  <BottomNav />
                </>
              }
            />
          </Routes>
          </Suspense>
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
};
