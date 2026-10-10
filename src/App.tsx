import { lazy, Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Toast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { fetchCurrentUser, fetchProblemById, updateProblemDrawData, updateProblemStatus, updateProblemMetadata, mutateProblemTag } from './services/api';
import { initOnlineSync } from './services/offlineStorage';
import { useStore } from './store/useStore';
import { OfflineSyncManager } from './services/OfflineSyncManager';

import { ReaderNavigation } from './components/ReaderNavigation';
import { LegacyReaderRedirect } from './views/LegacyReaderRedirect';
import { BottomNav } from './components/BottomNav';
import { PwaUpdateBanner } from './components/PwaUpdateBanner';

const DashboardView = lazy(() => import('./views/DashboardView').then((module) => ({ default: module.DashboardView })));
const ProblemDetailView = lazy(() => import('./views/ProblemDetailView').then((module) => ({ default: module.ProblemDetailView })));
const ShareView = lazy(() => import('./views/ShareView').then((module) => ({ default: module.ShareView })));
const SettingsView = lazy(() => import('./views/SettingsView').then((module) => ({ default: module.SettingsView })));
const AdminSharingView = lazy(() => import('./views/AdminSharingView').then(m=>({default:m.AdminSharingView})));
const CollectionDetailView = lazy(() => import('./views/CollectionDetailView').then(m=>({default:m.CollectionDetailView})));
const AccessClaimView = lazy(() => import('./views/AccessClaimView').then(m=>({default:m.AccessClaimView})));

const QuestionLibraryView = lazy(() => import('./views/QuestionLibraryView').then(m=>({default:m.QuestionLibraryView})));
const SearchRoute = lazy(() => import('./views/SearchRoute').then(m=>({default:m.SearchRoute})));
const CollectionReaderView = lazy(() => import('./views/CollectionReaderView').then(m=>({default:m.CollectionReaderView})));

export default function App() {
  const { currentUser, setCurrentUser, showToast, darkMode, loadTaxonomies } = useStore();
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
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${window.location.hash}`);
    try { localStorage.removeItem('redolve_auth_token'); }
    catch { /* Authentication is cookie-based; blocked storage is harmless. */ }

    fetchCurrentUser().then(({ user }) => {
      setCurrentUser(user);
      if (user) window.dispatchEvent(new Event('redolve:auth-ready'));
      else if (navigator.onLine) void OfflineSyncManager.analyzePendingGuestProblems((id, tag) =>
        useStore.getState().updateProblemInStore(id, {
          status: 'unsolved', topic_id: tag.topic_id,
          keywords: JSON.stringify(tag.keywords), keyword_tokens: tag.keywords.join(' '),
        })).catch((error) => console.warn('Guest analysis unavailable:', error));
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
          if (item.notesSeq === undefined) return false;
          await updateProblemMetadata(item.id, { typed_notes: item.typed_notes,
            expected_notes_seq: item.notesSeq });
        }
        if (item.tag_ops) for (const op of item.tag_ops)
          await mutateProblemTag(item.id, op.op, op.tag);
        if (item.metadata_patch) {
          if (item.metadata_patch.keywords) return false;
          if (item.metadata_patch.topic_id !== undefined)
            await updateProblemMetadata(item.id, { topic_id: item.metadata_patch.topic_id });
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
        })).catch((error) => console.warn('Guest analysis unavailable:', error));
    };
    window.addEventListener('online', retryGuestAnalysis);
    return () => window.removeEventListener('online', retryGuestAnalysis);
  }, []);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="h-full bg-page-bg text-text-main transition-colors duration-200 flex flex-col font-sans overflow-hidden">
          <Toast />
          <PwaUpdateBanner />
          <Suspense fallback={<div className="flex-1 flex items-center justify-center text-sm text-text-muted">正在載入頁面…</div>}>
          <Routes>
            {/* Public Share Route without main layout header */}
            <Route path="/share/:token" element={<ShareView />} />

            {/* Main App Routes */}
            <Route
              path="*"
              element={
                <>
                  <ReaderNavigation/><Navbar />
                  <main className="flex-1 max-w-[1600px] w-full mx-auto px-2 sm:px-4 py-3 overflow-y-auto overscroll-contain pb-16 md:pb-6">
                    <Routes key={currentUser?.id||'guest'}>
                      <Route path="/" element={<DashboardView />} />
                      <Route path="/study" element={<QuestionLibraryView />} />
                      <Route path="/study/:subject" element={<QuestionLibraryView />} />
                      <Route path="/study/:subject/:topic" element={<QuestionLibraryView />} />
                      <Route path="/study/:subject/:topic/:problemId" element={<QuestionLibraryView />} />
                      <Route path="/problem/:id" element={<ProblemDetailView />} />
                      <Route path="/search" element={<SearchRoute />} />
                      <Route path="/settings" element={<SettingsView />} />
                      <Route path="/my/collections" element={<Navigate replace to="/settings#collections" />} />
                      <Route path="/admin/sharing" element={<AdminSharingView />} />
                      <Route path="/collections/:id" element={<CollectionReaderView mode="collection" />} />
                      <Route path="/settings/collections/:id" element={<CollectionDetailView />} />
                      <Route path="/extended" element={<CollectionReaderView mode="extended" />} />
                      <Route path="/explore" element={<CollectionReaderView mode="explore" />} />
                      <Route path="/collections/:id/items/:entryId" element={<LegacyReaderRedirect />} />
                      <Route path="/subscriptions" element={<Navigate replace to="/extended" />} />
                      <Route path="/subscriptions/manage" element={<Navigate replace to="/settings#subscriptions" />} />
                      <Route path="/saved" element={<Navigate replace to="/study?source=saved" />} />
                      <Route path="/my/notebook" element={<Navigate replace to="/study?source=owned" />} />
                      <Route path="/saved/:id" element={<LegacyReaderRedirect saved />} />
                      <Route path="/invite/:token" element={<AccessClaimView kind="invite" />} />
                      <Route path="/collection-link/:token" element={<AccessClaimView kind="link" />} />
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
